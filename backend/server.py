"""Health Experts CRM — Backend
A FastAPI + MongoDB CRM with JWT auth, role-based access, lead management,
spreadsheet import, duplicate detection, round-robin assignment, dashboards.
"""
from dotenv import load_dotenv
from pathlib import Path
load_dotenv(Path(__file__).parent / '.env')

import os
import re
import io
import csv
import uuid
import json
import logging
import secrets
from datetime import datetime, timezone, timedelta, date
from typing import List, Optional, Literal, Dict, Any

import bcrypt
import jwt
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response, UploadFile, File, Form, Query
from fastapi.responses import JSONResponse, StreamingResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr, ConfigDict
import pandas as pd

# --- Config ---
MONGO_URL = os.environ['MONGO_URL']
DB_NAME = os.environ['DB_NAME']
JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALG = "HS256"
ACCESS_TTL = 60 * 60 * 12  # 12 hours
REFRESH_TTL = 60 * 60 * 24 * 7

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI(title="Health Experts CRM")
api = APIRouter(prefix="/api")

logger = logging.getLogger("crm")
logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(name)s - %(message)s')

# ============================================================================
# Default lead statuses with colors (Tailwind tokens)
# ============================================================================
DEFAULT_STATUSES = [
    {"name": "Uncalled", "color": "slate", "sort_order": 1},
    {"name": "No Answer", "color": "yellow", "sort_order": 2},
    {"name": "Left Voicemail", "color": "orange", "sort_order": 3},
    {"name": "No Medicare Part B", "color": "darkred", "sort_order": 4},
    {"name": "No Medicare", "color": "darkred", "sort_order": 5},
    {"name": "Not Interested", "color": "red", "sort_order": 6},
    {"name": "Wrong Number", "color": "red", "sort_order": 7},
    {"name": "Disconnected Number", "color": "red", "sort_order": 8},
    {"name": "Language Barrier", "color": "amber", "sort_order": 9},
    {"name": "Call Back Later", "color": "blue", "sort_order": 10},
    {"name": "Appointment Set", "color": "purple", "sort_order": 11},
    {"name": "Application Started", "color": "indigo", "sort_order": 12},
    {"name": "Pending", "color": "teal", "sort_order": 13},
    {"name": "Pending Completion", "color": "teal", "sort_order": 14},
    {"name": "Complete", "color": "green", "sort_order": 15},
    {"name": "Do Not Call", "color": "black", "sort_order": 16},
    {"name": "Duplicate", "color": "slate", "sort_order": 17},
    {"name": "Ineligible", "color": "slate", "sort_order": 18},
]
DEFAULT_STATUS_NAMES = {s["name"] for s in DEFAULT_STATUSES}


async def _wipe_lead_history(lead_ids: List[str]):
    """When a lead is reassigned to a different agent, wipe ALL history so the
    receiving agent gets a completely fresh slate: delete notes, call logs,
    AND the per-lead audit trail (so the Activity tab is empty). The caller
    is responsible for resetting status/appointment/plan fields on the lead
    document itself and for inserting fresh 'lead_assigned' / 'status_changed'
    audit entries after this runs.
    """
    if not lead_ids:
        return
    await db.notes.delete_many({"lead_id": {"$in": lead_ids}})
    await db.call_logs.delete_many({"lead_id": {"$in": lead_ids}})
    # Also wipe the per-lead audit trail so the receiving agent doesn't see
    # any of the previous agent's status changes / assignment history in the
    # Activity tab. Owner-level metrics (leaderboard, activity-history) key
    # off user_id + time window, not entity_id, so this doesn't affect them.
    await db.audit_logs.delete_many({"entity_type": "lead", "entity_id": {"$in": lead_ids}})

CALL_RESULTS = [
    "No Answer", "Left Voicemail", "Spoke With Lead", "Not Interested",
    "Appointment Set", "Complete", "Wrong Number", "Disconnected",
    "Call Back Later", "Other",
]

# Fields the owner can hide/show per agent. Not included: name, lead_status,
# assigned_agent, updated_at, appointment_at, notes, call logs (always visible).
TOGGLEABLE_FIELDS = [
    {"key": "birthdate",         "label": "Birthdate"},
    {"key": "phone_number",      "label": "Phone number"},
    {"key": "address",           "label": "Street address"},
    {"key": "city",              "label": "City"},
    {"key": "state",             "label": "State"},
    {"key": "zip_code",          "label": "Zip code"},
    {"key": "county",            "label": "County"},
    {"key": "medicare_number",   "label": "Medicare number"},
    {"key": "medicaid_number",   "label": "Medicaid number"},
    {"key": "medicaid_provider", "label": "Medicaid provider"},
    {"key": "medicare_parts",    "label": "Medicare parts"},
    {"key": "lead_type",         "label": "Lead type"},
]
DEFAULT_VISIBLE_FIELDS = [f["key"] for f in TOGGLEABLE_FIELDS]


def strip_hidden_fields(updates: dict, user: dict) -> None:
    """Agents cannot edit fields the owner has hidden from them."""
    visible = user.get("visible_fields")
    if user.get("role") == "owner" or visible is None:
        return
    for f in DEFAULT_VISIBLE_FIELDS:
        if f not in visible:
            updates.pop(f, None)


def mask_lead_for_user(lead: dict, user: dict) -> dict:
    """Blank out fields the agent is not permitted to see. Owners see everything."""
    if not lead or user.get("role") == "owner":
        return lead
    visible = user.get("visible_fields")
    if visible is None:
        return lead  # legacy users: full visibility
    masked = dict(lead)
    for f in DEFAULT_VISIBLE_FIELDS:
        if f not in visible and f in masked:
            masked[f] = ""
    # Normalized phone is derived; also mask if phone is hidden
    if "phone_number" not in visible:
        masked["normalized_phone_number"] = ""
    return masked

# ============================================================================
# Auth helpers
# ============================================================================
def hash_password(p: str) -> str:
    return bcrypt.hashpw(p.encode(), bcrypt.gensalt()).decode()

def verify_password(p: str, h: str) -> bool:
    try:
        return bcrypt.checkpw(p.encode(), h.encode())
    except Exception:
        return False

def make_token(user_id: str, email: str, role: str, ttl: int, kind: str) -> str:
    payload = {
        "sub": user_id, "email": email, "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(seconds=ttl),
        "type": kind,
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)

def set_auth_cookies(resp: Response, access: str, refresh: str):
    resp.set_cookie("access_token", access, httponly=True, secure=False, samesite="lax", max_age=ACCESS_TTL, path="/")
    resp.set_cookie("refresh_token", refresh, httponly=True, secure=False, samesite="lax", max_age=REFRESH_TTL, path="/")

def clear_auth_cookies(resp: Response):
    resp.delete_cookie("access_token", path="/")
    resp.delete_cookie("refresh_token", path="/")

async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(401, "Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
        if payload.get("type") != "access":
            raise HTTPException(401, "Invalid token type")
        user = await db.users.find_one({"_id": payload["sub"]})
        if not user:
            raise HTTPException(401, "User not found")
        if user.get("status") == "inactive":
            raise HTTPException(403, "Account deactivated")
        user.pop("password_hash", None)
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid token")

async def require_owner(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "owner":
        raise HTTPException(403, "Owner access required")
    return user

# ============================================================================
# Utility helpers
# ============================================================================
def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

def normalize_phone(p: Optional[str]) -> str:
    if not p: return ""
    digits = re.sub(r"\D", "", str(p))
    if len(digits) == 11 and digits.startswith("1"):
        digits = digits[1:]
    return digits

def format_phone(p: Optional[str]) -> str:
    d = normalize_phone(p)
    if len(d) == 10:
        return f"({d[0:3]}) {d[3:6]}-{d[6:10]}"
    return p or ""

def parse_birthdate(s: Any) -> Optional[str]:
    if s is None or (isinstance(s, float) and pd.isna(s)):
        return None
    # pandas Timestamp / datetime / date
    if isinstance(s, (datetime, date)):
        return s.strftime("%Y-%m-%d")
    if isinstance(s, pd.Timestamp):
        return s.strftime("%Y-%m-%d")
    s = str(s).strip()
    if not s:
        return None
    # Strip trailing time part from Excel datetime strings ("1961-01-22 00:00:00")
    if " " in s:
        s = s.split(" ", 1)[0]
    if "T" in s:
        s = s.split("T", 1)[0]
    for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%m-%d-%Y", "%d/%m/%Y", "%m/%d/%y", "%m-%d-%y"):
        try:
            return datetime.strptime(s, fmt).strftime("%Y-%m-%d")
        except Exception:
            pass
    return None

def parse_city_state_zip(s: Optional[str]):
    if not s: return ("", "", "")
    s = str(s).strip()
    # try "City, ST 12345" or "City ST 12345"
    m = re.match(r"^(.+?)[,\s]+([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$", s)
    if m:
        return (m.group(1).strip(), m.group(2).upper(), m.group(3))
    return (s, "", "")

async def add_audit(user_id: str, action: str, entity_type: str, entity_id: str, old: Any = None, new: Any = None):
    await db.audit_logs.insert_one({
        "_id": str(uuid.uuid4()),
        "user_id": user_id,
        "action_type": action,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "old_value": old,
        "new_value": new,
        "created_at": now_iso(),
    })

def clean_user(u: dict) -> dict:
    if not u: return u
    u = dict(u)
    u["id"] = u.pop("_id", u.get("id"))
    u.pop("password_hash", None)
    return u

def clean_doc(d: dict) -> dict:
    if not d: return d
    d = dict(d)
    if "_id" in d:
        d["id"] = d.pop("_id")
    return d

# ============================================================================
# Models
# ============================================================================
class LoginIn(BaseModel):
    email: EmailStr
    password: str

class UserCreateIn(BaseModel):
    first_name: str
    last_name: str
    email: EmailStr
    password: str
    role: Literal["owner", "agent"] = "agent"

class UserUpdateIn(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[EmailStr] = None
    status: Optional[Literal["active", "inactive"]] = None
    on_leaderboard: Optional[bool] = None
    can_access_shared_pool: Optional[bool] = None
    visible_fields: Optional[List[str]] = None

class PasswordResetIn(BaseModel):
    password: str

class LeadIn(BaseModel):
    first_name: Optional[str] = ""
    last_name: Optional[str] = ""
    birthdate: Optional[str] = None
    address: Optional[str] = ""
    city: Optional[str] = ""
    state: Optional[str] = ""
    zip_code: Optional[str] = ""
    county: Optional[str] = ""
    phone_number: Optional[str] = ""
    other_phone_number: Optional[str] = ""
    medicaid_number: Optional[str] = ""
    medicare_number: Optional[str] = ""
    medicaid_provider: Optional[str] = ""
    medicare_parts: Optional[str] = ""
    enrolled_carrier: Optional[str] = ""
    enrolled_plan: Optional[str] = ""
    lead_type: Optional[Literal["New to Medicare", "Transfer"]] = "New to Medicare"
    lead_status: Optional[str] = "Uncalled"
    appointment_at: Optional[str] = None
    assigned_agent_id: Optional[str] = None
    application_info: Optional[Dict[str, Any]] = None
    hra_info: Optional[Dict[str, Any]] = None
    effective_date: Optional[str] = None

class LeadUpdateIn(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    birthdate: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip_code: Optional[str] = None
    county: Optional[str] = None
    phone_number: Optional[str] = None
    other_phone_number: Optional[str] = None
    medicaid_number: Optional[str] = None
    medicare_number: Optional[str] = None
    medicaid_provider: Optional[str] = None
    medicare_parts: Optional[str] = None
    enrolled_carrier: Optional[str] = None
    enrolled_plan: Optional[str] = None
    lead_type: Optional[Literal["New to Medicare", "Transfer"]] = None
    lead_status: Optional[str] = None
    appointment_at: Optional[str] = None
    assigned_agent_id: Optional[str] = None
    application_info: Optional[Dict[str, Any]] = None
    hra_info: Optional[Dict[str, Any]] = None
    effective_date: Optional[str] = None
    completed_at: Optional[str] = None
    is_shared: Optional[bool] = None

class NoteIn(BaseModel):
    note_text: str
    is_pinned: bool = False

class CallLogIn(BaseModel):
    call_result: str
    notes: Optional[str] = ""
    follow_up_date: Optional[str] = None
    duration: Optional[int] = None

class AssignIn(BaseModel):
    lead_ids: List[str]
    agent_id: str

class RoundRobinIn(BaseModel):
    lead_ids: List[str]  # if empty, use all unassigned
    agent_ids: List[str]

class BulkStatusIn(BaseModel):
    lead_ids: List[str]
    lead_status: str

class StatusIn(BaseModel):
    name: str
    color: str
    sort_order: Optional[int] = 99
    is_active: bool = True

class ImportCommitIn(BaseModel):
    rows: List[Dict[str, Any]]
    mapping: Dict[str, str]
    duplicate_handling: Literal["skip", "import_anyway", "update_existing"] = "skip"
    assignment_method: Literal["unassigned", "round_robin"] = "unassigned"
    agent_ids: List[str] = []
    file_name: str = "import.csv"
    lead_type: Literal["New to Medicare", "Transfer"] = "New to Medicare"
    default_lead_status: Optional[str] = None

# ============================================================================
# Auth Endpoints
# ============================================================================
@api.post("/auth/login")
async def login(body: LoginIn, response: Response):
    email = body.email.lower().strip()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(401, "Invalid email or password")
    if user.get("status") == "inactive":
        raise HTTPException(403, "Account deactivated")
    access = make_token(user["_id"], email, user["role"], ACCESS_TTL, "access")
    refresh = make_token(user["_id"], email, user["role"], REFRESH_TTL, "refresh")
    set_auth_cookies(response, access, refresh)
    await db.users.update_one({"_id": user["_id"]}, {"$set": {"last_login_at": now_iso()}})
    return {"user": clean_user(user), "access_token": access}

@api.post("/auth/logout")
async def logout(response: Response, _: dict = Depends(get_current_user)):
    clear_auth_cookies(response)
    return {"ok": True}

@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return clean_user(user)

@api.post("/auth/refresh")
async def refresh(request: Request, response: Response):
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(401, "No refresh token")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
        if payload.get("type") != "refresh":
            raise HTTPException(401, "Invalid token")
        user = await db.users.find_one({"_id": payload["sub"]})
        if not user:
            raise HTTPException(401, "User not found")
        access = make_token(user["_id"], user["email"], user["role"], ACCESS_TTL, "access")
        response.set_cookie("access_token", access, httponly=True, secure=False, samesite="lax", max_age=ACCESS_TTL, path="/")
        return {"ok": True}
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid token")

# ============================================================================
# Users / Agents
# ============================================================================
@api.get("/users")
async def list_users(user: dict = Depends(get_current_user)):
    # Both roles can list users (agents see basic info for leaderboard)
    users = await db.users.find({}).sort("first_name", 1).to_list(500)
    now = datetime.now(timezone.utc)
    result = []
    for u in users:
        cu = clean_user(u)
        # Compute activity_status based on last_activity_at
        last = u.get("last_activity_at")
        if last:
            try:
                dt = datetime.fromisoformat(last.replace("Z", "+00:00")) if isinstance(last, str) else last
                delta_min = (now - dt).total_seconds() / 60
                if delta_min < 5:
                    cu["activity_status"] = "active"
                elif delta_min < 30:
                    cu["activity_status"] = "idle"
                else:
                    cu["activity_status"] = "inactive"
                cu["last_activity_at"] = last
            except Exception:
                cu["activity_status"] = "inactive"
        else:
            cu["activity_status"] = "inactive"
        cu["on_leaderboard"] = u.get("on_leaderboard", True)
        cu["can_access_shared_pool"] = u.get("can_access_shared_pool", True)
        result.append(cu)
    return result

@api.post("/users/me/heartbeat")
async def heartbeat(user: dict = Depends(get_current_user)):
    ts = now_iso()
    await db.users.update_one({"_id": user["_id"]}, {"$set": {"last_activity_at": ts}})
    # Insert a ping row for time-worked calculations
    await db.activity_pings.insert_one({"_id": str(uuid.uuid4()), "user_id": user["_id"], "ts": ts})
    return {"ok": True}

class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str

@api.post("/users/me/change-password")
async def change_own_password(body: ChangePasswordIn, user: dict = Depends(get_current_user)):
    if len(body.new_password) < 8:
        raise HTTPException(400, "New password must be at least 8 characters")
    full = await db.users.find_one({"_id": user["_id"]})
    if not full or not verify_password(body.current_password, full["password_hash"]):
        raise HTTPException(400, "Current password is incorrect")
    await db.users.update_one(
        {"_id": user["_id"]},
        {"$set": {"password_hash": hash_password(body.new_password), "updated_at": now_iso()}},
    )
    await add_audit(user["_id"], "password_changed", "user", user["_id"])
    return {"ok": True}


class SelfProfileIn(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None


@api.patch("/users/me")
async def update_own_profile(body: SelfProfileIn, user: dict = Depends(get_current_user)):
    """Any user can update their own first/last name."""
    updates: Dict[str, Any] = {}
    if body.first_name is not None:
        fn = body.first_name.strip()
        if not fn:
            raise HTTPException(400, "First name cannot be empty")
        updates["first_name"] = fn
    if body.last_name is not None:
        ln = body.last_name.strip()
        if not ln:
            raise HTTPException(400, "Last name cannot be empty")
        updates["last_name"] = ln
    if not updates:
        return clean_doc({k: v for k, v in user.items() if k != "password_hash"})
    updates["updated_at"] = now_iso()
    await db.users.update_one({"_id": user["_id"]}, {"$set": updates})
    await add_audit(user["_id"], "profile_updated", "user", user["_id"])
    fresh = await db.users.find_one({"_id": user["_id"]}, {"password_hash": 0})
    return clean_doc(fresh)

def _week_start_iso() -> str:
    now = datetime.now(timezone.utc)
    day = datetime(now.year, now.month, now.day, tzinfo=timezone.utc) - timedelta(days=now.weekday())
    return day.isoformat()

def _today_start_iso() -> str:
    now = datetime.now(timezone.utc)
    return datetime(now.year, now.month, now.day, tzinfo=timezone.utc).isoformat()

@api.get("/users/{user_id}/activity")
async def user_activity(user_id: str, user: dict = Depends(get_current_user)):
    """Return today + week active-time in minutes. Owner sees any user; agents only themselves."""
    if user["role"] != "owner" and user["_id"] != user_id:
        raise HTTPException(403, "Forbidden")
    today_count = await db.activity_pings.count_documents({"user_id": user_id, "ts": {"$gte": _today_start_iso()}})
    week_count = await db.activity_pings.count_documents({"user_id": user_id, "ts": {"$gte": _week_start_iso()}})
    # each heartbeat represents ~1 minute of activity
    return {"today_minutes": today_count, "week_minutes": week_count}


@api.get("/users/{user_id}/activity-history")
async def user_activity_history(user_id: str, user: dict = Depends(get_current_user)):
    """Historical rolling activity for an agent — last 12 weeks & last 3 months.

    Each bucket returns: minutes worked, calls logged, appointments set,
    completes, notes added. Owners see any user; agents only themselves.
    """
    if user["role"] != "owner" and user["_id"] != user_id:
        raise HTTPException(403, "Forbidden")

    now = datetime.now(timezone.utc)

    # ---- Weekly buckets (12 weeks incl. current, Monday-start) ----
    today_midnight = datetime(now.year, now.month, now.day, tzinfo=timezone.utc)
    this_week_start = today_midnight - timedelta(days=now.weekday())
    week_ranges = []
    for i in range(12):
        start = this_week_start - timedelta(weeks=(11 - i))
        end = start + timedelta(days=7)
        week_ranges.append({"key": start.strftime("%Y-%m-%d"), "label": f"Week of {start.strftime('%b %d')}", "start": start, "end": end})

    # ---- Monthly buckets (3 months incl. current) ----
    def _month_start(dt: datetime) -> datetime:
        return datetime(dt.year, dt.month, 1, tzinfo=timezone.utc)

    def _add_months(dt: datetime, delta: int) -> datetime:
        total = dt.year * 12 + (dt.month - 1) + delta
        y, m = total // 12, total % 12 + 1
        return datetime(y, m, 1, tzinfo=timezone.utc)

    this_month_start = _month_start(now)
    month_ranges = []
    for i in range(3):
        start = _add_months(this_month_start, -(2 - i))
        end = _add_months(start, 1)
        month_ranges.append({"key": start.strftime("%Y-%m"), "label": start.strftime("%B %Y"), "start": start, "end": end})

    # Query window spans the earliest bucket start
    earliest = min(week_ranges[0]["start"], month_ranges[0]["start"])
    earliest_iso = earliest.isoformat()

    # ---- Fetch all events in the window in one shot per collection ----
    pings = await db.activity_pings.find(
        {"user_id": user_id, "ts": {"$gte": earliest_iso}},
        {"ts": 1},
    ).to_list(200000)

    calls = await db.call_logs.find(
        {"user_id": user_id, "created_at": {"$gte": earliest_iso}},
        {"created_at": 1},
    ).to_list(50000)

    audits = await db.audit_logs.find(
        {"user_id": user_id, "action_type": "status_changed", "created_at": {"$gte": earliest_iso}},
        {"created_at": 1, "new_value": 1},
    ).to_list(50000)

    notes = await db.notes.find(
        {"user_id": user_id, "created_at": {"$gte": earliest_iso}},
        {"created_at": 1},
    ).to_list(50000)

    def _bucketize(ranges):
        rows = []
        for r in ranges:
            s_iso, e_iso = r["start"].isoformat(), r["end"].isoformat()
            minutes = sum(1 for p in pings if s_iso <= p.get("ts", "") < e_iso)
            call_count = sum(1 for c in calls if s_iso <= c.get("created_at", "") < e_iso)
            appt = sum(1 for a in audits if a.get("new_value") == "Appointment Set" and s_iso <= a.get("created_at", "") < e_iso)
            comp = sum(1 for a in audits if a.get("new_value") == "Complete" and s_iso <= a.get("created_at", "") < e_iso)
            note_count = sum(1 for n in notes if s_iso <= n.get("created_at", "") < e_iso)
            rows.append({
                "key": r["key"],
                "label": r["label"],
                "start": s_iso,
                "end": e_iso,
                "minutes": minutes,
                "calls": call_count,
                "appointments_set": appt,
                "completes": comp,
                "notes": note_count,
            })
        return rows

    return {
        "weeks": _bucketize(week_ranges),
        "months": _bucketize(month_ranges),
    }

@api.post("/users")
async def create_user(body: UserCreateIn, user: dict = Depends(require_owner)):
    email = body.email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(400, "Email already registered")
    uid = str(uuid.uuid4())
    doc = {
        "_id": uid,
        "first_name": body.first_name,
        "last_name": body.last_name,
        "email": email,
        "password_hash": hash_password(body.password),
        "role": body.role,
        "status": "active",
        "on_leaderboard": True,
        "visible_fields": list(DEFAULT_VISIBLE_FIELDS),
        "created_at": now_iso(),
        "updated_at": now_iso(),
        "last_login_at": None,
    }
    await db.users.insert_one(doc)
    await add_audit(user["_id"], "agent_created", "user", uid, None, {"email": email, "role": body.role})
    return clean_user(doc)

@api.patch("/users/{user_id}")
async def update_user(user_id: str, body: UserUpdateIn, user: dict = Depends(require_owner)):
    updates = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    if not updates:
        raise HTTPException(400, "No updates")
    updates["updated_at"] = now_iso()
    if "email" in updates:
        updates["email"] = updates["email"].lower().strip()
    res = await db.users.update_one({"_id": user_id}, {"$set": updates})
    if res.matched_count == 0:
        raise HTTPException(404, "User not found")
    action = "agent_deactivated" if updates.get("status") == "inactive" else "agent_updated"
    await add_audit(user["_id"], action, "user", user_id, None, updates)
    return clean_user(await db.users.find_one({"_id": user_id}))

@api.post("/users/{user_id}/reset-password")
async def reset_password(user_id: str, body: PasswordResetIn, user: dict = Depends(require_owner)):
    res = await db.users.update_one(
        {"_id": user_id},
        {"$set": {"password_hash": hash_password(body.password), "updated_at": now_iso()}},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "User not found")
    await add_audit(user["_id"], "agent_password_reset", "user", user_id)
    return {"ok": True}

# ============================================================================
# Lead Statuses
# ============================================================================
@api.get("/statuses")
async def list_statuses(_: dict = Depends(get_current_user)):
    items = await db.lead_statuses.find({"is_active": True}).sort("sort_order", 1).to_list(200)
    return [clean_doc(d) for d in items]

@api.post("/statuses")
async def create_status(body: StatusIn, user: dict = Depends(require_owner)):
    sid = str(uuid.uuid4())
    doc = {
        "_id": sid, "name": body.name, "color": body.color,
        "sort_order": body.sort_order or 99, "is_active": body.is_active,
        "created_at": now_iso(), "updated_at": now_iso(),
    }
    await db.lead_statuses.insert_one(doc)
    return clean_doc(doc)

@api.patch("/statuses/{sid}")
async def update_status(sid: str, body: StatusIn, user: dict = Depends(require_owner)):
    updates = body.model_dump(exclude_unset=True)
    updates["updated_at"] = now_iso()
    await db.lead_statuses.update_one({"_id": sid}, {"$set": updates})
    return clean_doc(await db.lead_statuses.find_one({"_id": sid}))

@api.delete("/statuses/{sid}")
async def delete_status(sid: str, user: dict = Depends(require_owner)):
    doc = await db.lead_statuses.find_one({"_id": sid})
    if not doc:
        raise HTTPException(404, "Status not found")
    if doc.get("is_default") or doc.get("name") in DEFAULT_STATUS_NAMES:
        raise HTTPException(400, "System statuses cannot be deleted. You can add custom statuses alongside them.")
    await db.lead_statuses.update_one({"_id": sid}, {"$set": {"is_active": False}})
    return {"ok": True}

# ============================================================================
# Leads
# ============================================================================
def lead_scope_filter(user: dict) -> dict:
    if user["role"] == "owner":
        return {}
    # Agents see leads assigned to them; shared-pool leads are surfaced via
    # the dedicated /leads/shared endpoints so they don't clutter My Leads.
    return {"assigned_agent_id": user["_id"], "is_shared": {"$ne": True}}

@api.get("/leads")
async def list_leads(
    user: dict = Depends(get_current_user),
    q: Optional[str] = None,
    status: Optional[str] = None,
    agent_id: Optional[str] = None,
    state: Optional[str] = None,
    city: Optional[str] = None,
    zip_code: Optional[str] = None,
    county: Optional[str] = None,
    medicare_parts: Optional[str] = None,
    medicaid_provider: Optional[str] = None,
    lead_type: Optional[str] = None,
    effective_from: Optional[str] = None,
    effective_to: Optional[str] = None,
    include_shared: bool = False,
    sort: str = "updated_desc",
    limit: int = 200,
    skip: int = 0,
):
    f = lead_scope_filter(user)
    if user["role"] == "owner" and not include_shared:
        # Owner's default leads view: hide the shared pool (it has its own page)
        f["is_shared"] = {"$ne": True}
    if status: f["lead_status"] = status
    if agent_id and user["role"] == "owner":
        f["assigned_agent_id"] = None if agent_id == "unassigned" else agent_id
    if state: f["state"] = state.upper()
    if city: f["city"] = {"$regex": f"^{re.escape(city)}", "$options": "i"}
    if zip_code: f["zip_code"] = {"$regex": f"^{re.escape(zip_code)}"}
    if county: f["county"] = {"$regex": f"^{re.escape(county)}$", "$options": "i"}
    if medicare_parts: f["medicare_parts"] = {"$regex": re.escape(medicare_parts), "$options": "i"}
    if medicaid_provider: f["medicaid_provider"] = {"$regex": re.escape(medicaid_provider), "$options": "i"}
    if lead_type: f["lead_type"] = lead_type
    if effective_from or effective_to:
        ed = {}
        if effective_from: ed["$gte"] = effective_from
        if effective_to:   ed["$lte"] = effective_to
        f["effective_date"] = ed
    if q:
        normalized = normalize_phone(q)
        rx = {"$regex": re.escape(q), "$options": "i"}
        or_clauses = [
            {"full_name": rx},
            {"first_name": rx},
            {"last_name": rx},
            {"medicare_number": rx},
            {"medicaid_number": rx},
            {"address": rx},
            {"city": rx},
            {"state": rx},
            {"zip_code": rx},
            {"county": rx},
            {"lead_status": rx},
            {"medicaid_provider": rx},
            {"medicare_parts": rx},
            {"enrolled_carrier": rx},
            {"enrolled_plan": rx},
        ]
        if normalized:
            or_clauses.append({"normalized_phone_number": {"$regex": normalized}})
        f["$or"] = or_clauses

    sort_map = {
        "updated_desc":   [("updated_at", -1)],
        "updated_asc":    [("updated_at", 1)],
        "created_desc":   [("created_at", -1)],
        "created_asc":    [("created_at", 1)],
        "name_asc":       [("full_name", 1)],
        "name_desc":      [("full_name", -1)],
        "status":         [("lead_status", 1)],
        "effective_asc":  [("effective_date", 1)],
        "effective_desc": [("effective_date", -1)],
        "completed_asc":  [("completed_at", 1)],
        "completed_desc": [("completed_at", -1)],
        "city_asc":       [("city", 1)],
        "city_desc":      [("city", -1)],
        "plan_asc":       [("medicaid_provider", 1)],
        "plan_desc":      [("medicaid_provider", -1)],
    }
    sort_spec = sort_map.get(sort, [("updated_at", -1)])
    total = await db.leads.count_documents(f)
    items = await db.leads.find(f).sort(sort_spec).skip(skip).limit(limit).to_list(limit)

    # Enrich with completed_by_name (small join) — only when there are Complete leads
    completer_ids = list({d.get("completed_by_user_id") for d in items if d.get("completed_by_user_id")})
    name_map = {}
    if completer_ids:
        async for u in db.users.find(
            {"_id": {"$in": completer_ids}},
            {"first_name": 1, "last_name": 1},
        ):
            name_map[u["_id"]] = f"{u.get('first_name','')} {u.get('last_name','')}".strip()

    out = []
    for d in items:
        cleaned = mask_lead_for_user(clean_doc(d), user)
        if d.get("completed_by_user_id"):
            cleaned["completed_by_name"] = name_map.get(d["completed_by_user_id"])
        out.append(cleaned)
    return {"total": total, "items": out}

@api.get("/leads/{lead_id}")
async def get_lead(lead_id: str, user: dict = Depends(get_current_user)):
    f = {"_id": lead_id, **lead_scope_filter(user)}
    lead = await db.leads.find_one(f)
    if not lead:
        raise HTTPException(404, "Lead not found")
    result = mask_lead_for_user(clean_doc(lead), user)
    if lead.get("completed_by_user_id"):
        completer = await db.users.find_one(
            {"_id": lead["completed_by_user_id"]},
            {"first_name": 1, "last_name": 1},
        )
        if completer:
            result["completed_by_name"] = f"{completer.get('first_name','')} {completer.get('last_name','')}".strip()
    return result

@api.post("/leads")
async def create_lead(body: LeadIn, user: dict = Depends(get_current_user)):
    lid = str(uuid.uuid4())
    full_name = f"{body.first_name or ''} {body.last_name or ''}".strip()
    payload = body.model_dump()
    # Agents can only create leads they own — auto-assign to themselves.
    if user.get("role") != "owner":
        payload["assigned_agent_id"] = user["_id"]
    doc = {
        "_id": lid,
        **payload,
        "full_name": full_name,
        "normalized_phone_number": normalize_phone(body.phone_number),
        "source_import_batch_id": None,
        "is_duplicate": False,
        "duplicate_group_id": None,
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.leads.insert_one(doc)
    await add_audit(user["_id"], "lead_created", "lead", lid, None, doc)
    return clean_doc(doc)

@api.patch("/leads/{lead_id}")
async def update_lead(lead_id: str, body: LeadUpdateIn, user: dict = Depends(get_current_user)):
    existing = await db.leads.find_one({"_id": lead_id, **lead_scope_filter(user)})
    if not existing:
        raise HTTPException(404, "Lead not found")
    updates = body.model_dump(exclude_unset=True)
    # Agents cannot reassign leads
    if user["role"] != "owner" and "assigned_agent_id" in updates:
        updates.pop("assigned_agent_id", None)
    strip_hidden_fields(updates, user)
    if "phone_number" in updates:
        updates["normalized_phone_number"] = normalize_phone(updates["phone_number"])
    if "first_name" in updates or "last_name" in updates:
        fn = updates.get("first_name", existing.get("first_name", ""))
        ln = updates.get("last_name", existing.get("last_name", ""))
        updates["full_name"] = f"{fn} {ln}".strip()

    # ------ Status transition side-effects ------
    if "lead_status" in updates and updates["lead_status"] != existing.get("lead_status"):
        if updates["lead_status"] == "Complete":
            # Stamp completed_at + completed_by only on the initial transition
            updates["completed_at"] = now_iso()
            updates["completed_by_user_id"] = user["_id"]
        elif existing.get("lead_status") == "Complete":
            # Moved out of Complete — clear the completion metadata
            updates["completed_at"] = None
            updates["completed_by_user_id"] = None

    # ------ Reassignment side-effect: wipe history + reset activity clock ------
    if "assigned_agent_id" in updates and updates["assigned_agent_id"] != existing.get("assigned_agent_id"):
        await _wipe_lead_history([lead_id])
        # Force fresh state on the lead itself
        updates["current_assignment_at"] = now_iso()
        updates["lead_status"] = "Uncalled"
        updates["completed_at"] = None
        updates["completed_by_user_id"] = None
        updates["effective_date"] = None
        updates["application_info"] = None
        updates["hra_info"] = None
        updates["appointment_at"] = None
        updates["enrolled_carrier"] = None
        updates["enrolled_plan"] = None

    updates["updated_at"] = now_iso()
    await db.leads.update_one({"_id": lead_id}, {"$set": updates})
    # audit individual key changes
    if "lead_status" in updates and updates["lead_status"] != existing.get("lead_status"):
        await add_audit(user["_id"], "status_changed", "lead", lead_id,
                        existing.get("lead_status"), updates["lead_status"])
    if "assigned_agent_id" in updates and updates["assigned_agent_id"] != existing.get("assigned_agent_id"):
        await add_audit(user["_id"], "lead_assigned", "lead", lead_id,
                        existing.get("assigned_agent_id"), updates["assigned_agent_id"])
    return mask_lead_for_user(clean_doc(await db.leads.find_one({"_id": lead_id})), user)

@api.delete("/leads/{lead_id}")
async def delete_lead(lead_id: str, user: dict = Depends(require_owner)):
    res = await db.leads.delete_one({"_id": lead_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Lead not found")
    await db.notes.delete_many({"lead_id": lead_id})
    await db.call_logs.delete_many({"lead_id": lead_id})
    await add_audit(user["_id"], "lead_deleted", "lead", lead_id)
    return {"ok": True}

from pymongo import UpdateOne

def _audit_docs(user_id: str, action: str, lead_ids: List[str], new_value: Any = None) -> List[dict]:
    ts = now_iso()
    return [{
        "_id": str(uuid.uuid4()), "user_id": user_id,
        "action_type": action, "entity_type": "lead", "entity_id": lid,
        "old_value": None, "new_value": new_value, "created_at": ts,
    } for lid in lead_ids]

@api.post("/leads/bulk-status")
async def bulk_status(body: BulkStatusIn, user: dict = Depends(require_owner)):
    now = now_iso()
    set_fields = {"lead_status": body.lead_status, "updated_at": now}
    if body.lead_status == "Complete":
        # Only stamp completed metadata on leads that aren't already Complete
        await db.leads.update_many(
            {"_id": {"$in": body.lead_ids}, "lead_status": {"$ne": "Complete"}},
            {"$set": {**set_fields, "completed_at": now, "completed_by_user_id": user["_id"]}},
        )
        # For leads that were already Complete, just bump updated_at
        res = await db.leads.update_many(
            {"_id": {"$in": body.lead_ids}, "lead_status": "Complete"},
            {"$set": {"updated_at": now}},
        )
        modified = len(body.lead_ids)
    else:
        # Clear completion metadata if moving out of Complete
        await db.leads.update_many(
            {"_id": {"$in": body.lead_ids}, "lead_status": "Complete"},
            {"$set": {**set_fields, "completed_at": None, "completed_by_user_id": None}},
        )
        res = await db.leads.update_many(
            {"_id": {"$in": body.lead_ids}, "lead_status": {"$ne": "Complete"}},
            {"$set": set_fields},
        )
        modified = res.modified_count
    if body.lead_ids:
        await db.audit_logs.insert_many(_audit_docs(user["_id"], "status_changed", body.lead_ids, body.lead_status))
    return {"modified": modified}

@api.post("/leads/assign")
async def assign_leads(body: AssignIn, user: dict = Depends(require_owner)):
    now = now_iso()
    # Only wipe history for leads whose assigned_agent_id is actually changing
    changing_ids = [d["_id"] async for d in db.leads.find(
        {"_id": {"$in": body.lead_ids}, "assigned_agent_id": {"$ne": body.agent_id}},
        {"_id": 1},
    )]
    await _wipe_lead_history(changing_ids)
    res = await db.leads.update_many(
        {"_id": {"$in": body.lead_ids}, "assigned_agent_id": {"$ne": body.agent_id}},
        {"$set": {
            "assigned_agent_id": body.agent_id,
            "updated_at": now,
            "current_assignment_at": now,
            # Fresh state
            "lead_status": "Uncalled",
            "completed_at": None,
            "completed_by_user_id": None,
            "effective_date": None,
            "application_info": None,
            "hra_info": None,
            "appointment_at": None,
            "enrolled_carrier": None,
            "enrolled_plan": None,
        }},
    )
    if body.lead_ids:
        await db.audit_logs.insert_many(_audit_docs(user["_id"], "lead_assigned", body.lead_ids, body.agent_id))
    return {"modified": res.modified_count}

@api.post("/leads/round-robin")
async def round_robin(body: RoundRobinIn, user: dict = Depends(require_owner)):
    if not body.agent_ids:
        raise HTTPException(400, "Select at least one agent")
    if body.lead_ids:
        lead_ids = body.lead_ids
    else:
        unassigned = await db.leads.find({"assigned_agent_id": None}, {"_id": 1}).to_list(10000)
        lead_ids = [d["_id"] for d in unassigned]
    if not lead_ids:
        return {"assigned": 0, "agents": len(body.agent_ids)}
    ts = now_iso()
    # Wipe history for any lead whose assignment is actually changing to a different agent
    existing_map = {d["_id"]: d.get("assigned_agent_id")
                    async for d in db.leads.find({"_id": {"$in": lead_ids}}, {"assigned_agent_id": 1})}
    changing_ids = []
    updates = []
    audits = []
    for i, lid in enumerate(lead_ids):
        agent = body.agent_ids[i % len(body.agent_ids)]
        if existing_map.get(lid) != agent:
            changing_ids.append(lid)
        updates.append(UpdateOne(
            {"_id": lid},
            {"$set": {
                "assigned_agent_id": agent,
                "updated_at": ts,
                "current_assignment_at": ts,
                # Fresh state for the receiving agent (only meaningful when actually changing)
                "lead_status": "Uncalled",
                "completed_at": None,
                "completed_by_user_id": None,
                "effective_date": None,
                "application_info": None,
                "hra_info": None,
                "appointment_at": None,
                "enrolled_carrier": None,
                "enrolled_plan": None,
            }},
        ))
        audits.append({
            "_id": str(uuid.uuid4()), "user_id": user["_id"],
            "action_type": "lead_assigned", "entity_type": "lead", "entity_id": lid,
            "old_value": existing_map.get(lid), "new_value": agent, "created_at": ts,
        })
    await _wipe_lead_history(changing_ids)
    await db.leads.bulk_write(updates, ordered=False)
    await db.audit_logs.insert_many(audits)
    return {"assigned": len(lead_ids), "agents": len(body.agent_ids)}

@api.post("/leads/bulk-delete")
async def bulk_delete_leads(body: dict, user: dict = Depends(require_owner)):
    ids = body.get("lead_ids", [])
    if not ids:
        raise HTTPException(400, "lead_ids required")
    res = await db.leads.delete_many({"_id": {"$in": ids}})
    await db.notes.delete_many({"lead_id": {"$in": ids}})
    await db.call_logs.delete_many({"lead_id": {"$in": ids}})
    await db.audit_logs.insert_many(_audit_docs(user["_id"], "lead_deleted", ids))
    return {"deleted": res.deleted_count}


# ============================================================================
# Plan Brochures — Insurance Carrier → Plan → PDF (owner manages, all view)
# ============================================================================
import base64  # noqa: E402


class CarrierIn(BaseModel):
    name: str
    sort_order: int = 0


@api.get("/carriers")
async def list_carriers(user: dict = Depends(get_current_user)):
    docs = await db.insurance_carriers.find().sort([("sort_order", 1), ("name", 1)]).to_list(500)
    # Attach plan metadata (no binary PDF payloads in the list response)
    ids = [d["_id"] for d in docs]
    plans_by_carrier: Dict[str, list] = {i: [] for i in ids}
    async for p in db.insurance_plans.find(
        {"carrier_id": {"$in": ids}},
        {"name": 1, "carrier_id": 1, "brochure_filename": 1, "created_at": 1},
    ).sort([("name", 1)]):
        plans_by_carrier[p["carrier_id"]].append({
            "id": p["_id"],
            "name": p.get("name"),
            "brochure_filename": p.get("brochure_filename"),
            "has_pdf": bool(p.get("brochure_filename")),
        })
    return [
        {"id": d["_id"], "name": d.get("name"), "sort_order": d.get("sort_order", 0),
         "plans": plans_by_carrier.get(d["_id"], [])}
        for d in docs
    ]


@api.post("/carriers")
async def create_carrier(body: CarrierIn, user: dict = Depends(require_owner)):
    doc = {"_id": str(uuid.uuid4()), "name": body.name.strip(), "sort_order": body.sort_order,
           "created_at": now_iso(), "updated_at": now_iso()}
    await db.insurance_carriers.insert_one(doc)
    return {"id": doc["_id"], "name": doc["name"], "sort_order": doc["sort_order"], "plans": []}


@api.patch("/carriers/{cid}")
async def update_carrier(cid: str, body: CarrierIn, user: dict = Depends(require_owner)):
    await db.insurance_carriers.update_one({"_id": cid},
        {"$set": {"name": body.name.strip(), "sort_order": body.sort_order, "updated_at": now_iso()}})
    return {"ok": True}


@api.delete("/carriers/{cid}")
async def delete_carrier(cid: str, user: dict = Depends(require_owner)):
    await db.insurance_plans.delete_many({"carrier_id": cid})
    await db.insurance_carriers.delete_one({"_id": cid})
    return {"deleted": True}


@api.post("/carriers/{cid}/plans")
async def create_plan(
    cid: str,
    user: dict = Depends(require_owner),
    name: str = Form(...),
    brochure: Optional[UploadFile] = File(None),
):
    if not await db.insurance_carriers.find_one({"_id": cid}):
        raise HTTPException(404, "Carrier not found")
    plan_id = str(uuid.uuid4())
    doc = {"_id": plan_id, "carrier_id": cid, "name": name.strip(),
           "created_at": now_iso(), "updated_at": now_iso()}
    if brochure is not None:
        data = await brochure.read()
        if len(data) > 15 * 1024 * 1024:
            raise HTTPException(400, "PDF too large — 15 MB max")
        doc["brochure_pdf_base64"] = base64.b64encode(data).decode("ascii")
        doc["brochure_mime"] = brochure.content_type or "application/pdf"
        doc["brochure_filename"] = brochure.filename or "brochure.pdf"
    await db.insurance_plans.insert_one(doc)
    return {"id": plan_id, "name": doc["name"], "brochure_filename": doc.get("brochure_filename"),
            "has_pdf": "brochure_pdf_base64" in doc}


@api.delete("/carriers/{cid}/plans/{pid}")
async def delete_plan(cid: str, pid: str, user: dict = Depends(require_owner)):
    await db.insurance_plans.delete_one({"_id": pid, "carrier_id": cid})
    return {"deleted": True}


@api.get("/plans/{pid}/pdf")
async def get_plan_pdf(pid: str, user: dict = Depends(get_current_user)):
    p = await db.insurance_plans.find_one({"_id": pid})
    if not p or not p.get("brochure_pdf_base64"):
        raise HTTPException(404, "Brochure PDF not found")
    data = base64.b64decode(p["brochure_pdf_base64"])
    fname = p.get("brochure_filename") or "brochure.pdf"
    return StreamingResponse(iter([data]), media_type=p.get("brochure_mime", "application/pdf"),
        headers={"Content-Disposition": f'inline; filename="{fname}"'})


# ============================================================================
# Shared lead pool — all agents can see; one agent at a time can open one
# ============================================================================
SHARED_LOCK_TTL_SECONDS = 5 * 60  # 5 minutes


def _lock_is_active(locked_at_iso: Optional[str]) -> bool:
    if not locked_at_iso:
        return False
    try:
        dt = datetime.fromisoformat(locked_at_iso.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return False
    age = (datetime.now(timezone.utc) - dt).total_seconds()
    return age < SHARED_LOCK_TTL_SECONDS


class SharedMoveIn(BaseModel):
    lead_ids: List[str]


@api.post("/shared-leads/move")
async def move_to_shared_pool(body: SharedMoveIn, user: dict = Depends(require_owner)):
    """Owner moves leads into the shared pool. Wipes history like a normal
    reassignment (fresh slate for whichever agent claims it)."""
    if not body.lead_ids:
        raise HTTPException(400, "lead_ids required")
    await _wipe_lead_history(body.lead_ids)
    now = now_iso()
    await db.leads.update_many(
        {"_id": {"$in": body.lead_ids}},
        {"$set": {
            "is_shared": True,
            "assigned_agent_id": None,
            "locked_by_user_id": None,
            "locked_at": None,
            "current_assignment_at": now,
            "lead_status": "Uncalled",
            "completed_at": None,
            "completed_by_user_id": None,
            "effective_date": None,
            "application_info": None,
            "hra_info": None,
            "appointment_at": None,
            "enrolled_carrier": None,
            "enrolled_plan": None,
            "updated_at": now,
        }},
    )
    await db.audit_logs.insert_many(_audit_docs(user["_id"], "moved_to_shared", body.lead_ids))
    return {"moved": len(body.lead_ids)}


@api.post("/shared-leads/remove")
async def remove_from_shared_pool(body: SharedMoveIn, user: dict = Depends(require_owner)):
    """Owner takes leads back out of the shared pool (unassigned by default)."""
    if not body.lead_ids:
        raise HTTPException(400, "lead_ids required")
    await db.leads.update_many(
        {"_id": {"$in": body.lead_ids}},
        {"$set": {"is_shared": False, "locked_by_user_id": None, "locked_at": None, "updated_at": now_iso()}},
    )
    return {"removed": len(body.lead_ids)}


class SharedAssignIn(BaseModel):
    lead_ids: List[str]
    agent_id: str


@api.post("/shared-leads/assign")
async def assign_shared_leads(body: SharedAssignIn, user: dict = Depends(require_owner)):
    """Owner transfers shared-pool leads to a specific agent. Wipes history so
    the receiving agent gets a fresh slate (same semantics as /leads/assign)."""
    if not body.lead_ids:
        raise HTTPException(400, "lead_ids required")
    await _wipe_lead_history(body.lead_ids)
    now = now_iso()
    await db.leads.update_many(
        {"_id": {"$in": body.lead_ids}, "is_shared": True},
        {"$set": {
            "assigned_agent_id": body.agent_id,
            "is_shared": False,
            "locked_by_user_id": None,
            "locked_at": None,
            "current_assignment_at": now,
            "lead_status": "Uncalled",
            "completed_at": None,
            "completed_by_user_id": None,
            "effective_date": None,
            "application_info": None,
            "hra_info": None,
            "appointment_at": None,
            "enrolled_carrier": None,
            "enrolled_plan": None,
            "updated_at": now,
        }},
    )
    await db.audit_logs.insert_many(_audit_docs(user["_id"], "lead_assigned", body.lead_ids, body.agent_id))
    return {"assigned": len(body.lead_ids)}


@api.post("/shared-leads/bulk-delete")
async def bulk_delete_shared_leads(body: dict, user: dict = Depends(require_owner)):
    ids = body.get("lead_ids", [])
    if not ids:
        raise HTTPException(400, "lead_ids required")
    res = await db.leads.delete_many({"_id": {"$in": ids}, "is_shared": True})
    await db.notes.delete_many({"lead_id": {"$in": ids}})
    await db.call_logs.delete_many({"lead_id": {"$in": ids}})
    await db.audit_logs.insert_many(_audit_docs(user["_id"], "lead_deleted", ids))
    return {"deleted": res.deleted_count}


@api.get("/shared-leads/export/csv")
async def export_shared_leads_csv(user: dict = Depends(require_owner), q: Optional[str] = None):
    f = {"is_shared": True}
    if q:
        f["$or"] = [
            {"full_name": {"$regex": re.escape(q), "$options": "i"}},
            {"city": {"$regex": re.escape(q), "$options": "i"}},
            {"medicaid_provider": {"$regex": re.escape(q), "$options": "i"}},
        ]
    items = await db.leads.find(f).to_list(20000)
    output = io.StringIO()
    cols = [
        "full_name", "phone_number", "birthdate", "address", "city", "state", "zip_code",
        "county", "medicaid_number", "medicare_number", "medicaid_provider",
        "medicare_parts", "lead_type", "lead_status",
        "created_at", "updated_at",
    ]
    w = csv.writer(output)
    w.writerow([c.replace("_", " ").title() for c in cols])
    for it in items:
        w.writerow([it.get(c, "") or "" for c in cols])
    output.seek(0)
    return StreamingResponse(iter([output.getvalue()]), media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=shared_leads.csv"})


@api.get("/shared-leads")
async def list_shared_leads(
    user: dict = Depends(get_current_user),
    q: Optional[str] = None,
    sort: str = "updated_desc",
    limit: int = 500,
):
    """Public shared pool. Returns only minimal fields (name, address, plan)
    for each row plus lock status. To see full details the caller must
    acquire a lock via /shared-leads/{id}/lock."""
    # Access gate for agents (owner may disable this per user)
    if user["role"] == "agent" and user.get("can_access_shared_pool") is False:
        return {"total": 0, "items": []}

    f = {"is_shared": True, "lead_status": {"$ne": "Complete"}}
    if q:
        rx = {"$regex": re.escape(q), "$options": "i"}
        normalized = normalize_phone(q)
        or_clauses = [
            {"full_name": rx}, {"first_name": rx}, {"last_name": rx},
            {"address": rx}, {"city": rx}, {"state": rx}, {"zip_code": rx},
            {"county": rx}, {"medicaid_provider": rx}, {"medicare_parts": rx},
            {"medicare_number": rx}, {"medicaid_number": rx},
        ]
        if normalized:
            or_clauses.append({"normalized_phone_number": {"$regex": normalized}})
        f["$or"] = or_clauses

    # Sort spec — reuse the same helper the main leads list uses
    sort_map = {
        "updated_desc": [("updated_at", -1)],
        "updated_asc":  [("updated_at", 1)],
        "name_asc":     [("full_name", 1)],
        "name_desc":    [("full_name", -1)],
        "city_asc":     [("city", 1)],
        "city_desc":    [("city", -1)],
        "plan_asc":     [("medicaid_provider", 1)],
        "plan_desc":    [("medicaid_provider", -1)],
    }
    sort_spec = sort_map.get(sort, sort_map["updated_desc"])
    items = await db.leads.find(f).sort(sort_spec).limit(limit).to_list(limit)

    # Collect locker names (batched)
    locker_ids = list({d.get("locked_by_user_id") for d in items if d.get("locked_by_user_id")})
    name_map = {}
    if locker_ids:
        async for u in db.users.find({"_id": {"$in": locker_ids}}, {"first_name": 1, "last_name": 1}):
            name_map[u["_id"]] = f"{u.get('first_name','')} {u.get('last_name','')}".strip()

    out = []
    for d in items:
        active = _lock_is_active(d.get("locked_at"))
        locked_by = d.get("locked_by_user_id") if active else None
        d = mask_lead_for_user(d, user)
        # Compose "address" from parts for display
        parts = [d.get("address"), d.get("city"), d.get("state")]
        address = ", ".join([p for p in parts if p])
        out.append({
            "id": d["_id"],
            "full_name": d.get("full_name") or "",
            "address": address,
            "plan": d.get("medicaid_provider") or d.get("medicare_parts") or "",
            "lead_status": d.get("lead_status", "Uncalled"),
            "is_locked": bool(locked_by and locked_by != user["_id"]),
            "locked_by_me": bool(locked_by and locked_by == user["_id"]),
            "locked_by_name": name_map.get(locked_by) if locked_by and locked_by != user["_id"] else None,
        })
    return {"total": len(out), "items": out}


@api.post("/shared-leads/{lead_id}/lock")
async def lock_shared_lead(lead_id: str, user: dict = Depends(get_current_user)):
    """Attempt to acquire the exclusive open-lock on a shared lead.
    Returns 200 if acquired (or already held by same user), 423 (Locked) otherwise."""
    if user["role"] == "agent" and user.get("can_access_shared_pool") is False:
        raise HTTPException(403, "Shared pool access is disabled for your account")
    lead = await db.leads.find_one({"_id": lead_id})
    if not lead or not lead.get("is_shared"):
        raise HTTPException(404, "Shared lead not found")
    now = datetime.now(timezone.utc).isoformat()
    if _lock_is_active(lead.get("locked_at")) and lead.get("locked_by_user_id") != user["_id"]:
        holder = await db.users.find_one({"_id": lead["locked_by_user_id"]}, {"first_name": 1, "last_name": 1})
        holder_name = f"{holder.get('first_name','')} {holder.get('last_name','')}".strip() if holder else "another agent"
        raise HTTPException(status_code=423, detail=f"Locked by {holder_name}")
    await db.leads.update_one(
        {"_id": lead_id},
        {"$set": {"locked_by_user_id": user["_id"], "locked_at": now}},
    )
    return {"locked": True, "locked_at": now}


@api.post("/shared-leads/{lead_id}/heartbeat")
async def heartbeat_shared_lead(lead_id: str, user: dict = Depends(get_current_user)):
    """Refresh the lock timestamp so it doesn't expire while the agent is actively working."""
    lead = await db.leads.find_one({"_id": lead_id})
    if not lead or not lead.get("is_shared"):
        raise HTTPException(404, "Shared lead not found")
    if lead.get("locked_by_user_id") != user["_id"]:
        raise HTTPException(status_code=423, detail="Lock is not held by you")
    now = datetime.now(timezone.utc).isoformat()
    await db.leads.update_one({"_id": lead_id}, {"$set": {"locked_at": now}})
    return {"locked_at": now}


@api.post("/shared-leads/{lead_id}/unlock")
async def unlock_shared_lead(lead_id: str, user: dict = Depends(get_current_user)):
    """Release the exclusive lock (only the holder can unlock; owners can force)."""
    lead = await db.leads.find_one({"_id": lead_id})
    if not lead or not lead.get("is_shared"):
        raise HTTPException(404, "Shared lead not found")
    if user["role"] != "owner" and lead.get("locked_by_user_id") != user["_id"]:
        raise HTTPException(403, "Only the lock holder can unlock")
    await db.leads.update_one(
        {"_id": lead_id},
        {"$set": {"locked_by_user_id": None, "locked_at": None}},
    )
    return {"unlocked": True}


@api.get("/shared-leads/{lead_id}")
async def get_shared_lead(lead_id: str, user: dict = Depends(get_current_user)):
    """Full details of a shared lead — caller MUST hold the lock (or be owner).
    Returns 423 (Locked) if another agent currently holds it."""
    lead = await db.leads.find_one({"_id": lead_id})
    if not lead or not lead.get("is_shared"):
        raise HTTPException(404, "Shared lead not found")
    active = _lock_is_active(lead.get("locked_at"))
    holder = lead.get("locked_by_user_id")
    if user["role"] != "owner":
        if not active or holder != user["_id"]:
            raise HTTPException(status_code=423, detail="You must claim this lead first")
    return mask_lead_for_user(clean_doc(lead), user)


@api.patch("/shared-leads/{lead_id}")
async def update_shared_lead(lead_id: str, body: LeadUpdateIn, user: dict = Depends(get_current_user)):
    """Update a shared lead while an agent holds its lock.

    Agents can normally only PATCH leads that scope to them, but shared-pool
    leads have no assigned agent. The lock is the authorisation grant — the
    holder can update status/notes/etc. Setting status to Complete also
    auto-claims the lead (assigns to the current agent) so the win counts
    on their leaderboard and appears under Book of Business as theirs.
    """
    lead = await db.leads.find_one({"_id": lead_id})
    if not lead or not lead.get("is_shared"):
        raise HTTPException(404, "Shared lead not found")
    active = _lock_is_active(lead.get("locked_at"))
    holder = lead.get("locked_by_user_id")
    if user["role"] != "owner":
        if not active or holder != user["_id"]:
            raise HTTPException(status_code=423, detail="You must claim this lead first")

    updates = body.model_dump(exclude_unset=True)
    # Agents cannot reassign a shared lead via this endpoint
    if user["role"] != "owner":
        updates.pop("assigned_agent_id", None)
        updates.pop("is_shared", None)
        strip_hidden_fields(updates, user)

    if "phone_number" in updates:
        updates["normalized_phone_number"] = normalize_phone(updates["phone_number"])
    if "first_name" in updates or "last_name" in updates:
        fn = updates.get("first_name", lead.get("first_name", ""))
        ln = updates.get("last_name", lead.get("last_name", ""))
        updates["full_name"] = f"{fn} {ln}".strip()

    # Status-transition side-effects
    if "lead_status" in updates and updates["lead_status"] != lead.get("lead_status"):
        if updates["lead_status"] == "Complete":
            updates["completed_at"] = now_iso()
            updates["completed_by_user_id"] = user["_id"]
            # Claim the lead — it leaves the shared pool and belongs to the
            # closing agent from here on (visible in their Book of Business).
            updates["assigned_agent_id"] = user["_id"]
            updates["is_shared"] = False
            updates["locked_by_user_id"] = None
            updates["locked_at"] = None
        elif lead.get("lead_status") == "Complete":
            updates["completed_at"] = None
            updates["completed_by_user_id"] = None

    updates["updated_at"] = now_iso()
    await db.leads.update_one({"_id": lead_id}, {"$set": updates})
    if "lead_status" in updates and updates["lead_status"] != lead.get("lead_status"):
        await add_audit(user["_id"], "status_changed", "lead", lead_id,
                        lead.get("lead_status"), updates["lead_status"])
    return mask_lead_for_user(clean_doc(await db.leads.find_one({"_id": lead_id})), user)



@api.get("/appointments/upcoming")
async def upcoming_appointments(user: dict = Depends(get_current_user)):
    """Leads with appointment_at scheduled in the next 30 minutes (scoped by role)."""
    now = datetime.now(timezone.utc)
    horizon = (now + timedelta(minutes=30)).isoformat()
    f = {
        "appointment_at": {"$gte": now.isoformat(), "$lte": horizon},
        "lead_status": "Appointment Set",
        **lead_scope_filter(user),
    }
    items = await db.leads.find(f).sort("appointment_at", 1).to_list(50)
    return [clean_doc(d) for d in items]

@api.get("/appointments")
async def list_appointments(
    user: dict = Depends(get_current_user),
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
):
    """All appointments scoped by role. Optionally filtered by from_date..to_date (ISO date)."""
    f = {
        "appointment_at": {"$ne": None, "$exists": True},
        "lead_status": "Appointment Set",
        **lead_scope_filter(user),
    }
    if from_date:
        f["appointment_at"]["$gte"] = from_date
    if to_date:
        f["appointment_at"]["$lte"] = to_date + "T23:59:59"
    items = await db.leads.find(f).sort("appointment_at", 1).to_list(1000)
    # Enrich with agent name
    agent_ids = list({l.get("assigned_agent_id") for l in items if l.get("assigned_agent_id")})
    agent_map = {}
    if agent_ids:
        for u in await db.users.find({"_id": {"$in": agent_ids}}).to_list(len(agent_ids)):
            agent_map[u["_id"]] = f"{u['first_name']} {u['last_name']}"
    result = []
    for l in items:
        d = clean_doc(l)
        d["agent_name"] = agent_map.get(d.get("assigned_agent_id"), "Unassigned")
        result.append(mask_lead_for_user(d, user))
    return result

@api.post("/appointments/{lead_id}/cancel")
async def cancel_appointment(lead_id: str, user: dict = Depends(get_current_user)):
    """Clear appointment_at and revert status. Owner can cancel any; agents only their own."""
    lead = await db.leads.find_one({"_id": lead_id, **lead_scope_filter(user)})
    if not lead:
        raise HTTPException(404, "Appointment not found")
    await db.leads.update_one(
        {"_id": lead_id},
        {"$set": {"appointment_at": None, "lead_status": "Call Back Later", "updated_at": now_iso()}},
    )
    await add_audit(user["_id"], "appointment_cancelled", "lead", lead_id, lead.get("appointment_at"), None)
    return {"ok": True}

@api.get("/leads/export/csv")
async def export_csv(
    user: dict = Depends(require_owner),
    q: Optional[str] = None,
    status: Optional[str] = None,
    agent_id: Optional[str] = None,
):
    f = {}
    if status: f["lead_status"] = status
    if agent_id: f["assigned_agent_id"] = None if agent_id == "unassigned" else agent_id
    if q:
        f["$or"] = [
            {"full_name": {"$regex": re.escape(q), "$options": "i"}},
            {"normalized_phone_number": {"$regex": normalize_phone(q) or "$^"}},
        ]
    items = await db.leads.find(f).to_list(20000)

    # Build agent id → name lookup (for assigned_agent + completed_by columns)
    id_set = {i.get("assigned_agent_id") for i in items if i.get("assigned_agent_id")}
    id_set |= {i.get("completed_by_user_id") for i in items if i.get("completed_by_user_id")}
    name_map = {}
    if id_set:
        async for u in db.users.find({"_id": {"$in": list(id_set)}}, {"first_name": 1, "last_name": 1}):
            name_map[u["_id"]] = f"{u.get('first_name','').strip()} {u.get('last_name','').strip()}".strip() or "—"

    output = io.StringIO()
    cols = [
        "full_name", "phone_number", "birthdate", "address", "city", "state", "zip_code",
        "county", "medicaid_number", "medicare_number", "medicaid_provider",
        "medicare_parts", "lead_type", "lead_status",
        "assigned_agent", "completed_by", "completed_at", "effective_date",
        "created_at", "updated_at",
    ]
    w = csv.writer(output)
    w.writerow([c.replace("_", " ").title() for c in cols])
    for it in items:
        row = []
        for c in cols:
            if c == "assigned_agent":
                row.append(name_map.get(it.get("assigned_agent_id"), "Unassigned"))
            elif c == "completed_by":
                row.append(name_map.get(it.get("completed_by_user_id"), ""))
            else:
                row.append(it.get(c, "") or "")
        w.writerow(row)
    output.seek(0)
    return StreamingResponse(iter([output.getvalue()]), media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=leads.csv"})

# ============================================================================
# Notes
# ============================================================================
@api.get("/leads/{lead_id}/notes")
async def list_notes(lead_id: str, user: dict = Depends(get_current_user)):
    lead = await db.leads.find_one({"_id": lead_id, **lead_scope_filter(user)})
    if not lead: raise HTTPException(404, "Lead not found")
    notes = await db.notes.find({"lead_id": lead_id}).sort("created_at", -1).to_list(500)
    return [clean_doc(n) for n in notes]

@api.post("/leads/{lead_id}/notes")
async def create_note(lead_id: str, body: NoteIn, user: dict = Depends(get_current_user)):
    lead = await db.leads.find_one({"_id": lead_id, **lead_scope_filter(user)})
    if not lead: raise HTTPException(404, "Lead not found")
    nid = str(uuid.uuid4())
    doc = {
        "_id": nid, "lead_id": lead_id, "user_id": user["_id"],
        "user_name": f"{user['first_name']} {user['last_name']}",
        "note_text": body.note_text, "is_pinned": body.is_pinned,
        "created_at": now_iso(), "updated_at": now_iso(),
    }
    await db.notes.insert_one(doc)
    await db.leads.update_one({"_id": lead_id}, {"$set": {"updated_at": now_iso()}})
    await add_audit(user["_id"], "note_added", "lead", lead_id, None, body.note_text[:200])
    return clean_doc(doc)

@api.delete("/notes/{note_id}")
async def delete_note(note_id: str, user: dict = Depends(get_current_user)):
    note = await db.notes.find_one({"_id": note_id})
    if not note: raise HTTPException(404, "Note not found")
    if user["role"] != "owner" and note["user_id"] != user["_id"]:
        raise HTTPException(403, "Forbidden")
    await db.notes.delete_one({"_id": note_id})
    return {"ok": True}

# ============================================================================
# Call Logs
# ============================================================================
@api.get("/leads/{lead_id}/call-logs")
async def list_calls(lead_id: str, user: dict = Depends(get_current_user)):
    lead = await db.leads.find_one({"_id": lead_id, **lead_scope_filter(user)})
    if not lead: raise HTTPException(404, "Lead not found")
    calls = await db.call_logs.find({"lead_id": lead_id}).sort("created_at", -1).to_list(500)
    return [clean_doc(c) for c in calls]

@api.post("/leads/{lead_id}/call-logs")
async def create_call(lead_id: str, body: CallLogIn, user: dict = Depends(get_current_user)):
    lead = await db.leads.find_one({"_id": lead_id, **lead_scope_filter(user)})
    if not lead: raise HTTPException(404, "Lead not found")
    cid = str(uuid.uuid4())
    doc = {
        "_id": cid, "lead_id": lead_id, "user_id": user["_id"],
        "user_name": f"{user['first_name']} {user['last_name']}",
        "call_result": body.call_result, "notes": body.notes or "",
        "follow_up_date": body.follow_up_date, "duration": body.duration,
        "created_at": now_iso(),
    }
    await db.call_logs.insert_one(doc)
    await db.leads.update_one({"_id": lead_id}, {"$set": {"updated_at": now_iso()}})
    await add_audit(user["_id"], "call_logged", "lead", lead_id, None, body.call_result)
    return clean_doc(doc)

# ============================================================================
# Activity feed
# ============================================================================
@api.get("/leads/{lead_id}/activity")
async def lead_activity(lead_id: str, user: dict = Depends(get_current_user)):
    lead = await db.leads.find_one({"_id": lead_id, **lead_scope_filter(user)})
    if not lead: raise HTTPException(404, "Lead not found")
    notes = await db.notes.find({"lead_id": lead_id}).to_list(500)
    calls = await db.call_logs.find({"lead_id": lead_id}).to_list(500)
    audits = await db.audit_logs.find({"entity_type": "lead", "entity_id": lead_id}).to_list(500)
    items = []
    for n in notes:
        items.append({"type": "note", "id": n["_id"], "user_id": n["user_id"], "user_name": n.get("user_name", ""),
                      "text": n["note_text"], "is_pinned": n.get("is_pinned", False), "created_at": n["created_at"]})
    for c in calls:
        items.append({"type": "call", "id": c["_id"], "user_id": c["user_id"], "user_name": c.get("user_name", ""),
                      "call_result": c["call_result"], "notes": c.get("notes", ""),
                      "follow_up_date": c.get("follow_up_date"), "created_at": c["created_at"]})
    for a in audits:
        if a["action_type"] in ("status_changed", "lead_assigned", "lead_created"):
            items.append({"type": "audit", "id": a["_id"], "user_id": a.get("user_id"),
                          "action": a["action_type"], "old": a.get("old_value"),
                          "new": a.get("new_value"), "created_at": a["created_at"]})
    items.sort(key=lambda x: x["created_at"], reverse=True)
    return items

# ============================================================================
# Import (CSV / XLSX)
# ============================================================================
COL_ALIASES = {
    "name": "name", "full name": "name", "fullname": "name",
    "first name": "first_name", "firstname": "first_name",
    "last name": "last_name", "lastname": "last_name",
    "birthdate": "birthdate", "date of birth": "birthdate", "dob": "birthdate",
    "address": "address", "adress": "address", "street": "address",
    "city": "city", "state": "state", "zip": "zip_code", "zip code": "zip_code",
    "city state zip": "city_state_zip", "city/state/zip": "city_state_zip",
    "county": "county",
    "phone": "phone_number", "phone number": "phone_number", "phone#": "phone_number",
    "medicaid number": "medicaid_number", "medicaid#": "medicaid_number",
    "medicare number": "medicare_number", "medicare#": "medicare_number",
    "medicaid provider": "medicaid_provider", "provider": "medicaid_provider", "medicaid plan": "medicaid_provider", "plan": "medicaid_provider",
    "medicare parts": "medicare_parts", "parts": "medicare_parts", "medicare part": "medicare_parts",
    "lead type": "lead_type", "type": "lead_type", "transfer": "lead_type", "t/n": "lead_type",
    "status": "lead_status", "lead status": "lead_status", "state of lead": "lead_status",
    "effective date": "effective_date", "effective": "effective_date", "coverage effective": "effective_date",
    "start date": "effective_date", "policy effective": "effective_date",
}

def auto_map_columns(columns: List[str]) -> Dict[str, str]:
    mapping = {}
    for col in columns:
        key = re.sub(r"\s+", " ", str(col).strip().lower())
        target = COL_ALIASES.get(key)
        if target:
            mapping[col] = target
    return mapping

@api.post("/imports/preview")
async def import_preview(file: UploadFile = File(...), _: dict = Depends(require_owner)):
    content = await file.read()
    try:
        if file.filename.lower().endswith(".csv"):
            df = pd.read_csv(io.BytesIO(content))
        else:
            df = pd.read_excel(io.BytesIO(content))
    except Exception as e:
        raise HTTPException(400, f"Cannot parse file: {e}")
    df = df.where(pd.notnull(df), None)
    columns = [str(c) for c in df.columns.tolist()]
    rows = df.head(500).to_dict(orient="records")
    # normalize to strings; datetime cells → "YYYY-MM-DD" so previews are clean
    norm_rows = []
    for r in rows:
        nr = {}
        for k, v in r.items():
            if v is None or (isinstance(v, float) and pd.isna(v)):
                nr[str(k)] = ""
            elif isinstance(v, (datetime, pd.Timestamp)):
                try:
                    nr[str(k)] = v.strftime("%Y-%m-%d")
                except Exception:
                    nr[str(k)] = str(v)
            else:
                nr[str(k)] = v
        norm_rows.append(nr)
    return {
        "columns": columns,
        "rows": norm_rows,
        "auto_mapping": auto_map_columns(columns),
        "filename": file.filename,
        "total_rows": int(len(df)),
    }

async def find_duplicate(lead: dict) -> Optional[dict]:
    or_conds = []
    if lead.get("normalized_phone_number"):
        or_conds.append({"normalized_phone_number": lead["normalized_phone_number"]})
    if lead.get("medicare_number"):
        or_conds.append({"medicare_number": lead["medicare_number"]})
    if lead.get("medicaid_number"):
        or_conds.append({"medicaid_number": lead["medicaid_number"]})
    if lead.get("full_name") and lead.get("birthdate"):
        or_conds.append({"full_name": lead["full_name"], "birthdate": lead["birthdate"]})
    if not or_conds: return None
    return await db.leads.find_one({"$or": or_conds})

@api.post("/imports/commit")
async def import_commit(body: ImportCommitIn, user: dict = Depends(require_owner)):
    batch_id = str(uuid.uuid4())
    imported = 0
    duplicates = 0
    skipped = 0
    errors = 0
    new_lead_ids = []

    for row in body.rows:
        try:
            mapped: Dict[str, Any] = {}
            for src, target in body.mapping.items():
                val = row.get(src)
                if val is None: continue
                mapped[target] = val

            # Split combined fields
            if "name" in mapped and not (mapped.get("first_name") or mapped.get("last_name")):
                parts = str(mapped["name"]).strip().split(None, 1)
                mapped["first_name"] = parts[0] if parts else ""
                mapped["last_name"] = parts[1] if len(parts) > 1 else ""
            if "city_state_zip" in mapped:
                c, s, z = parse_city_state_zip(str(mapped["city_state_zip"]))
                mapped.setdefault("city", c)
                mapped.setdefault("state", s)
                mapped.setdefault("zip_code", z)
            phone = str(mapped.get("phone_number", "") or "").strip()
            normalized = normalize_phone(phone)
            if not phone and not (mapped.get("first_name") or mapped.get("last_name") or mapped.get("name")):
                skipped += 1
                continue
            first = str(mapped.get("first_name", "") or "").strip()
            last = str(mapped.get("last_name", "") or "").strip()
            full = f"{first} {last}".strip()

            lead_doc = {
                "_id": str(uuid.uuid4()),
                "first_name": first, "last_name": last, "full_name": full,
                "birthdate": parse_birthdate(mapped.get("birthdate")),
                "address": str(mapped.get("address", "") or "").strip(),
                "city": str(mapped.get("city", "") or "").strip(),
                "state": str(mapped.get("state", "") or "").strip().upper()[:2] if mapped.get("state") else "",
                "zip_code": str(mapped.get("zip_code", "") or "").strip(),
                "county": str(mapped.get("county", "") or "").strip(),
                "phone_number": format_phone(phone) if phone else "",
                "normalized_phone_number": normalized,
                "medicaid_number": str(mapped.get("medicaid_number", "") or "").strip(),
                "medicare_number": str(mapped.get("medicare_number", "") or "").strip(),
                "medicaid_provider": str(mapped.get("medicaid_provider", "") or "").strip(),
                "medicare_parts": str(mapped.get("medicare_parts", "") or "").strip(),
                "lead_type": body.lead_type,
                "lead_status": body.default_lead_status or "Uncalled",
                "assigned_agent_id": None,
                "source_import_batch_id": batch_id,
                "is_duplicate": False,
                "duplicate_group_id": None,
                "effective_date": (str(mapped.get("effective_date", "") or "").strip() or None),
                "completed_at": (now_iso() if body.default_lead_status == "Complete" else None),
                "completed_by_user_id": (user["_id"] if body.default_lead_status == "Complete" else None),
                "created_at": now_iso(),
                "updated_at": now_iso(),
            }
            dup = await find_duplicate(lead_doc)
            if dup:
                duplicates += 1
                if body.duplicate_handling == "skip":
                    # mark imported flag false, leave existing
                    continue
                elif body.duplicate_handling == "update_existing":
                    upd = {k: v for k, v in lead_doc.items() if v not in (None, "", []) and k not in ("_id", "created_at")}
                    upd["updated_at"] = now_iso()
                    await db.leads.update_one({"_id": dup["_id"]}, {"$set": upd})
                    continue
                else:  # import_anyway
                    lead_doc["is_duplicate"] = True
                    lead_doc["duplicate_group_id"] = dup["_id"]
            await db.leads.insert_one(lead_doc)
            new_lead_ids.append(lead_doc["_id"])
            imported += 1
        except Exception as e:
            logger.exception("import row error: %s", e)
            errors += 1

    # assignment
    auto_assigned = 0
    if body.assignment_method == "round_robin" and body.agent_ids and new_lead_ids:
        ts = now_iso()
        updates = [
            UpdateOne({"_id": lid}, {"$set": {"assigned_agent_id": body.agent_ids[i % len(body.agent_ids)], "updated_at": ts}})
            for i, lid in enumerate(new_lead_ids)
        ]
        await db.leads.bulk_write(updates, ordered=False)
        auto_assigned = len(new_lead_ids)

    batch_doc = {
        "_id": batch_id,
        "uploaded_by_user_id": user["_id"],
        "file_name": body.file_name,
        "total_rows": len(body.rows),
        "imported_rows": imported,
        "duplicate_rows": duplicates,
        "skipped_rows": skipped,
        "error_rows": errors,
        "assignment_method": body.assignment_method,
        "created_at": now_iso(),
    }
    await db.import_batches.insert_one(batch_doc)
    await add_audit(user["_id"], "leads_imported", "import_batch", batch_id, None, batch_doc)
    return {**batch_doc, "id": batch_id, "auto_assigned": auto_assigned, "unassigned": imported - auto_assigned}

@api.get("/imports")
async def list_imports(_: dict = Depends(require_owner)):
    batches = await db.import_batches.find({}).sort("created_at", -1).to_list(100)
    return [clean_doc(b) for b in batches]

# ============================================================================
# Duplicates
# ============================================================================
@api.get("/duplicates")
async def get_duplicate_groups(_: dict = Depends(require_owner)):
    # group by normalized phone with count > 1
    pipeline = [
        {"$match": {"normalized_phone_number": {"$ne": ""}}},
        {"$group": {"_id": "$normalized_phone_number", "count": {"$sum": 1}, "leads": {"$push": "$$ROOT"}}},
        {"$match": {"count": {"$gt": 1}}},
        {"$limit": 100},
    ]
    groups = []
    async for g in db.leads.aggregate(pipeline):
        groups.append({
            "key": g["_id"],
            "count": g["count"],
            "leads": [clean_doc(l) for l in g["leads"]],
        })
    return groups

@api.post("/duplicates/merge")
async def merge_duplicates(body: dict, user: dict = Depends(require_owner)):
    keep_id = body.get("keep_id")
    delete_ids = body.get("delete_ids", [])
    if not keep_id or not delete_ids:
        raise HTTPException(400, "keep_id and delete_ids required")
    # move notes/calls to kept lead
    await db.notes.update_many({"lead_id": {"$in": delete_ids}}, {"$set": {"lead_id": keep_id}})
    await db.call_logs.update_many({"lead_id": {"$in": delete_ids}}, {"$set": {"lead_id": keep_id}})
    await db.leads.delete_many({"_id": {"$in": delete_ids}})
    await add_audit(user["_id"], "duplicates_merged", "lead", keep_id, delete_ids, None)
    return {"ok": True, "merged_into": keep_id, "deleted": len(delete_ids)}

# ============================================================================
# Dashboards
# ============================================================================
@api.get("/dashboard/owner")
async def owner_dashboard(_: dict = Depends(require_owner)):
    now = datetime.now(timezone.utc)
    week_ago = (now - timedelta(days=7)).isoformat()
    today_start = datetime(now.year, now.month, now.day, tzinfo=timezone.utc).isoformat()

    total = await db.leads.count_documents({})
    new_week = await db.leads.count_documents({"created_at": {"$gte": week_ago}})
    unassigned = await db.leads.count_documents({"assigned_agent_id": None})
    assigned = total - unassigned
    uncalled = await db.leads.count_documents({"lead_status": "Uncalled"})
    appt = await db.leads.count_documents({"lead_status": "Appointment Set"})
    sold = await db.leads.count_documents({"lead_status": "Complete"})
    not_interested = await db.leads.count_documents({"lead_status": "Not Interested"})
    no_answer = await db.leads.count_documents({"lead_status": "No Answer"})
    dup = await db.leads.count_documents({"is_duplicate": True})
    active_agents = await db.users.count_documents({"role": "agent", "status": "active"})
    calls_today = await db.call_logs.count_documents({"created_at": {"$gte": today_start}})
    calls_week = await db.call_logs.count_documents({"created_at": {"$gte": week_ago}})

    # leads by status
    by_status = []
    async for g in db.leads.aggregate([{"$group": {"_id": "$lead_status", "count": {"$sum": 1}}}, {"$sort": {"count": -1}}]):
        by_status.append({"status": g["_id"], "count": g["count"]})

    # leads by agent — batch-fetch users to avoid N+1
    by_agent = []
    agent_groups = []
    async for g in db.leads.aggregate([
        {"$match": {"assigned_agent_id": {"$ne": None}}},
        {"$group": {"_id": "$assigned_agent_id", "count": {"$sum": 1}}}
    ]):
        agent_groups.append(g)
    if agent_groups:
        agent_ids = [g["_id"] for g in agent_groups]
        users = await db.users.find({"_id": {"$in": agent_ids}}).to_list(len(agent_ids))
        users_map = {u["_id"]: u for u in users}
        for g in agent_groups:
            u = users_map.get(g["_id"])
            if u:
                by_agent.append({"agent_id": g["_id"], "agent_name": f"{u['first_name']} {u['last_name']}", "count": g["count"]})

    return {
        "cards": {
            "total_leads": total, "new_week": new_week, "unassigned": unassigned, "assigned": assigned,
            "uncalled": uncalled, "appointment_set": appt, "sold": sold,
            "not_interested": not_interested, "no_answer": no_answer, "duplicate": dup,
            "active_agents": active_agents, "calls_today": calls_today, "calls_week": calls_week,
        },
        "by_status": by_status,
        "by_agent": by_agent,
        "funnel": {
            "uncalled": uncalled,
            "contacted": total - uncalled,
            "appointment_set": appt,
            "sold": sold,
        },
    }

@api.get("/dashboard/agent")
async def agent_dashboard(user: dict = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    week_ago = (now - timedelta(days=7)).isoformat()
    today_start = datetime(now.year, now.month, now.day, tzinfo=timezone.utc).isoformat()
    uid = user["_id"]
    f = {"assigned_agent_id": uid}
    total = await db.leads.count_documents(f)
    uncalled = await db.leads.count_documents({**f, "lead_status": "Uncalled"})
    no_answer = await db.leads.count_documents({**f, "lead_status": "No Answer"})
    appt = await db.leads.count_documents({**f, "lead_status": "Appointment Set"})
    sold = await db.leads.count_documents({**f, "lead_status": "Complete"})
    calls_today = await db.call_logs.count_documents({"user_id": uid, "created_at": {"$gte": today_start}})
    calls_week = await db.call_logs.count_documents({"user_id": uid, "created_at": {"$gte": week_ago}})
    return {
        "cards": {
            "total_leads": total, "uncalled": uncalled, "no_answer": no_answer,
            "appointment_set": appt, "sold": sold,
            "calls_today": calls_today, "calls_week": calls_week,
        }
    }

# ============================================================================
# Leaderboard
# ============================================================================
def _period_range(period: str, month_offset: int = 0):
    """Return (since_iso, until_iso, label) for the given period.
    period: 'today' | 'week' | 'month'
    month_offset: 0=current, 1=prev, 2=two months ago, etc.
    """
    now = datetime.now(timezone.utc)
    if period == "today":
        start = datetime(now.year, now.month, now.day, tzinfo=timezone.utc) - timedelta(days=month_offset)
        end = start + timedelta(days=1)
        label = start.strftime("%b %d, %Y")
    elif period == "week":
        # week starting Monday, offset by weeks
        weekday = now.weekday()
        start = datetime(now.year, now.month, now.day, tzinfo=timezone.utc) - timedelta(days=weekday) - timedelta(weeks=month_offset)
        end = start + timedelta(days=7)
        label = f"Week of {start.strftime('%b %d, %Y')}"
    elif period == "next_month":
        # Rolling next-calendar-month window. Useful for insurance where a
        # sale closed this month is effective the following month.
        y, m = now.year, now.month
        total = y * 12 + (m - 1) + 1 - month_offset
        y2, m2 = total // 12, total % 12 + 1
        start = datetime(y2, m2, 1, tzinfo=timezone.utc)
        if m2 == 12:
            end = datetime(y2 + 1, 1, 1, tzinfo=timezone.utc)
        else:
            end = datetime(y2, m2 + 1, 1, tzinfo=timezone.utc)
        label = start.strftime("%B %Y")
    else:  # month
        y, m = now.year, now.month
        # subtract month_offset months
        total = y * 12 + (m - 1) - month_offset
        y2, m2 = total // 12, total % 12 + 1
        start = datetime(y2, m2, 1, tzinfo=timezone.utc)
        if m2 == 12:
            end = datetime(y2 + 1, 1, 1, tzinfo=timezone.utc)
        else:
            end = datetime(y2, m2 + 1, 1, tzinfo=timezone.utc)
        label = start.strftime("%B %Y")
    return start.isoformat(), end.isoformat(), label


async def _leaderboard_rows(period: str, offset: int, basis: str = "completed"):
    """Compute rows ranked by completed wins.

    basis:
      - "completed"  → counts a win when lead_status transitions to Complete
                       within the period (from audit_logs.created_at, falls
                       back to leads.completed_at).
      - "effective"  → counts a win when the lead's effective_date is within
                       the period. Useful for insurance where the sale is
                       recognised on the coverage effective date, not the day
                       it was closed.
    """
    since, until, label = _period_range(period, offset)
    agents = await db.users.find({"role": "agent", "on_leaderboard": {"$ne": False}}).to_list(200)
    if not agents:
        return [], label
    agent_ids = [a["_id"] for a in agents]

    # Batch aggregations — one query per metric instead of per-agent loops
    audit_agg = {}
    async for g in db.audit_logs.aggregate([
        {"$match": {
            "user_id": {"$in": agent_ids},
            "action_type": "status_changed",
            "new_value": {"$in": ["Complete", "Appointment Set"]},
            "created_at": {"$gte": since, "$lt": until},
        }},
        {"$group": {"_id": {"user_id": "$user_id", "new_value": "$new_value"}, "count": {"$sum": 1}}},
    ]):
        audit_agg[(g["_id"]["user_id"], g["_id"]["new_value"])] = g["count"]

    lead_status_agg = {}
    lead_assigned_agg = {}
    async for g in db.leads.aggregate([
        {"$match": {"assigned_agent_id": {"$in": agent_ids}}},
        {"$group": {"_id": {"agent": "$assigned_agent_id", "status": "$lead_status"}, "count": {"$sum": 1}}},
    ]):
        aid = g["_id"]["agent"]
        lead_status_agg[(aid, g["_id"]["status"])] = g["count"]
        lead_assigned_agg[aid] = lead_assigned_agg.get(aid, 0) + g["count"]

    last_call_map = {}
    async for g in db.call_logs.aggregate([
        {"$match": {"user_id": {"$in": agent_ids}}},
        {"$sort": {"created_at": -1}},
        {"$group": {"_id": "$user_id", "last": {"$first": "$created_at"}}},
    ]):
        last_call_map[g["_id"]] = g["last"]

    # For basis="effective", count leads whose effective_date is in the window
    since_date = since[:10]  # ISO date YYYY-MM-DD comparable to effective_date strings
    until_date = until[:10]
    effective_agg = {}
    if basis == "effective":
        async for g in db.leads.aggregate([
            {"$match": {
                "assigned_agent_id": {"$in": agent_ids},
                "lead_status": "Complete",
                "effective_date": {"$gte": since_date, "$lt": until_date},
            }},
            {"$group": {"_id": "$assigned_agent_id", "count": {"$sum": 1}}},
        ]):
            effective_agg[g["_id"]] = g["count"]

    rows = []
    for a in agents:
        aid = a["_id"]
        if basis == "effective":
            sold = effective_agg.get(aid, 0)
        else:
            sold = audit_agg.get((aid, "Complete"), 0)
            # Fallback: if no audit rows in this period, use current lead counts (works for seeded data)
            if sold == 0 and audit_agg.get((aid, "Appointment Set"), 0) == 0:
                sold = lead_status_agg.get((aid, "Complete"), 0)
        appts = audit_agg.get((aid, "Appointment Set"), 0)
        if basis == "completed" and appts == 0 and sold == lead_status_agg.get((aid, "Complete"), 0):
            appts = lead_status_agg.get((aid, "Appointment Set"), 0)
        assigned = lead_assigned_agg.get(aid, 0)
        rows.append({
            "agent_id": aid,
            "agent_name": f"{a['first_name']} {a['last_name']}",
            "status": a.get("status", "active"),
            "assigned": assigned,
            "appointments": appts,
            "sold": sold,
            "conversion_rate": round((sold / assigned * 100) if assigned else 0, 1),
            "last_activity": last_call_map.get(aid),
        })
    rows.sort(key=lambda r: (r["sold"], r["appointments"], r["conversion_rate"]), reverse=True)
    for i, r in enumerate(rows):
        r["rank"] = i + 1
    return rows, label


@api.get("/leaderboard")
async def leaderboard(user: dict = Depends(get_current_user), period: str = "next_month", offset: int = 0, basis: str = "effective"):
    period = period if period in ("today", "week", "month", "next_month") else "next_month"
    basis = basis if basis in ("completed", "effective") else "effective"
    current, label = await _leaderboard_rows(period, offset, basis)
    # previous period for movement arrows
    prev, _ = await _leaderboard_rows(period, offset + 1, basis)
    prev_rank = {r["agent_id"]: r["rank"] for r in prev}
    for r in current:
        pr = prev_rank.get(r["agent_id"])
        if pr is None:
            r["movement"] = "new"
            r["rank_change"] = 0
        else:
            r["rank_change"] = pr - r["rank"]  # positive = moved up
            if r["rank_change"] > 0:
                r["movement"] = "up"
            elif r["rank_change"] < 0:
                r["movement"] = "down"
            else:
                r["movement"] = "same"
    return {"period": period, "offset": offset, "basis": basis, "label": label, "rows": current}

# ============================================================================
# Company settings
# ============================================================================
@api.get("/settings/company")
async def get_company(_: dict = Depends(get_current_user)):
    doc = await db.company_settings.find_one({"_id": "company"})
    if not doc:
        doc = {
            "_id": "company",
            "company_name": "Health Experts",
            "crm_name": "Health Experts CRM",
            "primary_color": "#026AA2",
            "contact_email": "hello@healthexpertscrm.com",
            "contact_phone": "(555) 010-2020",
            "logo_url": "",
        }
        await db.company_settings.insert_one(doc)
    return clean_doc(doc)

@api.patch("/settings/company")
async def update_company(body: dict, user: dict = Depends(require_owner)):
    body.pop("id", None); body.pop("_id", None)
    body["updated_at"] = now_iso()
    await db.company_settings.update_one({"_id": "company"}, {"$set": body}, upsert=True)
    return clean_doc(await db.company_settings.find_one({"_id": "company"}))

# ============================================================================
# Constants endpoint
# ============================================================================
@api.get("/constants/call-results")
async def call_results(_: dict = Depends(get_current_user)):
    return CALL_RESULTS

@api.get("/constants/toggleable-fields")
async def toggleable_fields(_: dict = Depends(get_current_user)):
    return TOGGLEABLE_FIELDS

# ============================================================================
# App wiring
# ============================================================================
@app.get("/health")
async def health():
    """Kubernetes liveness/readiness probe. Kept outside /api prefix."""
    return {"status": "ok"}

app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,  # using bearer token via localStorage too
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================================
# Startup: indexes + seed
# ============================================================================
@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.leads.create_index("normalized_phone_number")
    await db.leads.create_index("assigned_agent_id")
    await db.leads.create_index("lead_status")
    await db.notes.create_index("lead_id")
    await db.call_logs.create_index("lead_id")
    await db.call_logs.create_index("user_id")
    await db.audit_logs.create_index("entity_id")
    await db.activity_pings.create_index([("user_id", 1), ("ts", -1)])

    # Launch cleanup intentionally disabled — user opted to keep the existing
    # owner@healthexpertscrm.com account on production. Do NOT re-enable
    # without confirming with the user first: it would wipe their real data.

    # Migration: rename "Sold" → "Complete" everywhere (idempotent)
    await db.lead_statuses.update_many({"name": "Sold"}, {"$set": {"name": "Complete"}})
    await db.leads.update_many({"lead_status": "Sold"}, {"$set": {"lead_status": "Complete"}})

    # Ensure ALL default statuses exist, are active, and marked is_default: True.
    # If an owner had previously "deleted" (soft-deactivated) one of the defaults
    # like "Complete", this restores it automatically so critical flows
    # (Book of Business, funnel metrics) keep working.
    for s in DEFAULT_STATUSES:
        existing = await db.lead_statuses.find_one({"name": s["name"]})
        if existing:
            await db.lead_statuses.update_one(
                {"_id": existing["_id"]},
                {"$set": {
                    "is_default": True,
                    "is_active": True,
                    "color": existing.get("color") or s["color"],
                    "sort_order": existing.get("sort_order") or s["sort_order"],
                    "updated_at": now_iso(),
                }},
            )
        else:
            await db.lead_statuses.insert_one({
                "_id": str(uuid.uuid4()),
                **s,
                "is_default": True,
                "is_active": True,
                "created_at": now_iso(),
                "updated_at": now_iso(),
            })

    # Seed statuses (only if collection is entirely empty — kept for first-boot safety)
    if await db.lead_statuses.count_documents({}) == 0:
        for s in DEFAULT_STATUSES:
            await db.lead_statuses.insert_one({
                "_id": str(uuid.uuid4()), **s, "is_default": True, "is_active": True,
                "created_at": now_iso(), "updated_at": now_iso(),
            })

    # Seed users
    from seed import seed_demo_data
    await seed_demo_data(db, hash_password)

    # Backfill lead_type on existing leads that don't have it
    await db.leads.update_many({"lead_type": {"$exists": False}}, {"$set": {"lead_type": "New to Medicare"}})
    # Backfill on_leaderboard on users
    await db.users.update_many({"on_leaderboard": {"$exists": False}}, {"$set": {"on_leaderboard": True}})
    # Backfill can_access_shared_pool on users (default: agents can access)
    await db.users.update_many({"can_access_shared_pool": {"$exists": False}}, {"$set": {"can_access_shared_pool": True}})
    # Backfill visible_fields (default: all toggleable fields visible)
    await db.users.update_many(
        {"visible_fields": {"$exists": False}},
        {"$set": {"visible_fields": list(DEFAULT_VISIBLE_FIELDS)}},
    )

    # Backfill current_assignment_at from updated_at for legacy leads (used to
    # reset activity metrics when a lead gets transferred to another agent).
    await db.leads.update_many(
        {"current_assignment_at": {"$exists": False}, "updated_at": {"$exists": True}},
        [{"$set": {"current_assignment_at": "$updated_at"}}],
    )

    # Backfill completed_at + completed_by_user_id for existing Complete leads.
    # completed_at ← updated_at as best-effort; completed_by_user_id ← most recent
    # status_changed audit entry with new_value="Complete".
    async for lead in db.leads.find(
        {"lead_status": "Complete", "completed_at": {"$exists": False}},
        {"_id": 1, "updated_at": 1},
    ):
        audit = await db.audit_logs.find_one(
            {"entity_type": "lead", "entity_id": lead["_id"],
             "action_type": "status_changed", "new_value": "Complete"},
            sort=[("created_at", -1)],
        )
        set_fields = {"completed_at": lead.get("updated_at") or now_iso()}
        if audit and audit.get("user_id"):
            set_fields["completed_by_user_id"] = audit["user_id"]
        await db.leads.update_one({"_id": lead["_id"]}, {"$set": set_fields})

    # Write test credentials
    try:
        memory = Path("/app/memory")
        memory.mkdir(exist_ok=True)
        (memory / "test_credentials.md").write_text(
            "# Health Experts CRM — Test Credentials\n\n"
            "## Owner / Admin\n"
            "- Email: owner@healthexpertscrm.com\n"
            "- Password: Password123!\n"
            "- Role: owner\n\n"
            "## Agents\n"
            "- agent1@healthexpertscrm.com / Password123! (role: agent)\n"
            "- agent2@healthexpertscrm.com / Password123! (role: agent)\n"
            "- agent3@healthexpertscrm.com / Password123! (role: agent)\n\n"
            "## Auth Endpoints\n"
            "- POST /api/auth/login\n"
            "- POST /api/auth/logout\n"
            "- GET  /api/auth/me\n"
            "- POST /api/auth/refresh\n"
        )
    except Exception:
        pass

@app.on_event("shutdown")
async def shutdown():
    client.close()
