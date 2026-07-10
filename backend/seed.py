"""Owner seed — creates a default owner only if NO owner exists yet.
Safe for existing deployments: does nothing when an owner is already present.
"""
from datetime import datetime, timezone
import uuid


def _iso(dt: datetime) -> str:
    return dt.isoformat()


async def seed_demo_data(db, hash_password):
    """Idempotent: ensure at least one owner exists. If one already exists
    (e.g. owner@healthexpertscrm.com on production), do nothing."""
    if await db.users.find_one({"role": "owner"}):
        return
    await db.users.insert_one({
        "_id": str(uuid.uuid4()),
        "first_name": "Henry",
        "last_name": "Owner",
        "email": "owner@healthexpertscrm.com",
        "password_hash": hash_password("Password123!"),
        "role": "owner",
        "status": "active",
        "on_leaderboard": False,
        "created_at": _iso(datetime.now(timezone.utc)),
        "updated_at": _iso(datetime.now(timezone.utc)),
        "last_login_at": None,
    })
