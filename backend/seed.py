"""Owner seed for Health Experts CRM (production-ready).
Creates a single owner account from env vars if it doesn't already exist.
No demo agents, leads, notes, call logs, or import batches are created.
"""
import os
import uuid
from datetime import datetime, timezone


def _iso(dt: datetime) -> str:
    return dt.isoformat()


async def seed_demo_data(db, hash_password):
    """Idempotent: ensures a single owner account exists."""
    email = os.environ.get("ADMIN_EMAIL", "owner@healthexpertscrm.com").lower().strip()
    password = os.environ.get("ADMIN_PASSWORD", "Password123!")
    first = os.environ.get("ADMIN_FIRST_NAME", "Henry")
    last = os.environ.get("ADMIN_LAST_NAME", "Owner")

    existing = await db.users.find_one({"email": email})
    if existing:
        # If password in env differs, update it (safe rotation)
        # We don't verify — just leave the existing account alone unless missing.
        return

    await db.users.insert_one({
        "_id": str(uuid.uuid4()),
        "first_name": first,
        "last_name": last,
        "email": email,
        "password_hash": hash_password(password),
        "role": "owner",
        "status": "active",
        "on_leaderboard": False,
        "created_at": _iso(datetime.now(timezone.utc)),
        "updated_at": _iso(datetime.now(timezone.utc)),
        "last_login_at": None,
    })
