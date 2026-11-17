"""Explicit first-owner bootstrap; no public default credentials."""
import logging
import os
import uuid
from datetime import datetime, timezone

logger = logging.getLogger("crm.seed")

async def seed_demo_data(db, hash_password):
    """Create a first owner only when authorized bootstrap settings exist.

    The name is retained for compatibility with the existing startup import.
    """
    if await db.users.find_one({"role": "owner"}):
        return

    email = os.environ.get("BOOTSTRAP_OWNER_EMAIL", "").strip().lower()
    password = os.environ.get("BOOTSTRAP_OWNER_PASSWORD", "")

    if not email and not password:
        logger.warning("No owner exists. Configure BOOTSTRAP_OWNER_EMAIL and "
                       "BOOTSTRAP_OWNER_PASSWORD securely to create one.")
        return

    if not email or not password:
        raise RuntimeError("Both BOOTSTRAP_OWNER_EMAIL and "
                           "BOOTSTRAP_OWNER_PASSWORD are required.")

    if len(password) < 16:
        raise RuntimeError("BOOTSTRAP_OWNER_PASSWORD must be at least 16 "
                           "characters; use a random password.")

    now = datetime.now(timezone.utc).isoformat()
    await db.users.insert_one({
        "_id": str(uuid.uuid4()),
        "first_name": "Initial",
        "last_name": "Owner",
        "email": email,
        "password_hash": hash_password(password),
        "role": "owner",
        "status": "active",
        "on_leaderboard": False,
        "created_at": now,
        "updated_at": now,
        "last_login_at": None,
    })
    logger.info("Created initial owner. Remove bootstrap variables.")
