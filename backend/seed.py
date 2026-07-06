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
    """Idempotent: ensures the launch owner account exists (hardcoded so
    production env vars can never override or miss the intended credentials)."""
    email = "henry@healthexpertscrm.com"
    password = "Password123!"
    first = "Henry"
    last = "Owner"

    existing = await db.users.find_one({"email": email})
    if existing:
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
