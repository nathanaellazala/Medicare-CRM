"""Demo seed data for Health Experts CRM."""
import uuid
import random
from datetime import datetime, timezone, timedelta


FIRST_NAMES = ["Margaret", "Robert", "Patricia", "Walter", "Linda", "James", "Barbara", "John",
               "Elizabeth", "William", "Susan", "Richard", "Carol", "Thomas", "Helen", "Joseph",
               "Dorothy", "Charles", "Nancy", "Daniel", "Janet", "Frank", "Sandra", "Eugene",
               "Joyce", "Henry", "Beverly", "Howard", "Marilyn", "Albert", "Frances", "Wayne",
               "Anita", "Roy", "Gloria", "Earl", "Edna", "Gerald", "Mildred", "Stanley",
               "Ruth", "Carl", "Phyllis", "Harold", "Doris", "Ralph", "Lois", "Eugene",
               "Norma", "Dennis"]
LAST_NAMES = ["Anderson", "Bennett", "Carter", "Davis", "Evans", "Foster", "Garcia", "Hill",
              "Ingram", "Johnson", "King", "Lopez", "Martin", "Nelson", "Owens", "Parker",
              "Quinn", "Roberts", "Smith", "Turner", "Underwood", "Vincent", "Williams",
              "Young", "Adams", "Brooks", "Chen", "Diaz", "Edwards"]
CITIES = [("Miami", "FL", "Miami-Dade", "33101"), ("Orlando", "FL", "Orange", "32801"),
          ("Tampa", "FL", "Hillsborough", "33602"), ("Jacksonville", "FL", "Duval", "32202"),
          ("Atlanta", "GA", "Fulton", "30303"), ("Houston", "TX", "Harris", "77002"),
          ("Dallas", "TX", "Dallas", "75201"), ("Phoenix", "AZ", "Maricopa", "85003"),
          ("San Diego", "CA", "San Diego", "92101"), ("Las Vegas", "NV", "Clark", "89101"),
          ("Charlotte", "NC", "Mecklenburg", "28202"), ("Nashville", "TN", "Davidson", "37203")]
STATUSES = ["Uncalled", "No Answer", "Left Voicemail", "Call Back Later", "Appointment Set",
            "Sold", "Not Interested", "Pending", "Application Started"]
STREETS = ["Oak", "Pine", "Maple", "Cedar", "Elm", "Birch", "Magnolia", "Sunset", "Riverside",
           "Hillcrest", "Lakeview", "Park"]
PROVIDERS = ["Humana", "Sunshine Health", "Aetna", "UnitedHealthcare", "WellCare", "Molina",
             "Florida Blue", "Cigna"]
PARTS = ["A", "A,B", "A,B,D", "A,B,C", "A,B,C,D", "B", ""]
CALL_RESULTS = ["No Answer", "Left Voicemail", "Spoke With Lead", "Call Back Later",
                "Appointment Set"]


def _phone():
    return f"({random.randint(200, 999)}) {random.randint(200, 999)}-{random.randint(1000, 9999)}"


def _normalize_phone(p: str) -> str:
    import re
    return re.sub(r"\D", "", p)


def _iso(dt: datetime) -> str:
    return dt.isoformat()


async def seed_demo_data(db, hash_password):
    # 1. Users
    user_seeds = [
        ("owner@healthexpertscrm.com", "Sarah", "Chen", "owner"),
        ("agent1@healthexpertscrm.com", "Marcus", "Reed", "agent"),
        ("agent2@healthexpertscrm.com", "Elena", "Brooks", "agent"),
        ("agent3@healthexpertscrm.com", "Daniel", "Park", "agent"),
    ]
    agent_ids = []
    owner_id = None
    for email, fn, ln, role in user_seeds:
        existing = await db.users.find_one({"email": email})
        if existing:
            uid = existing["_id"]
        else:
            uid = str(uuid.uuid4())
            await db.users.insert_one({
                "_id": uid,
                "first_name": fn, "last_name": ln, "email": email,
                "password_hash": hash_password("Password123!"),
                "role": role, "status": "active",
                "created_at": _iso(datetime.now(timezone.utc)),
                "updated_at": _iso(datetime.now(timezone.utc)),
                "last_login_at": None,
            })
        if role == "owner":
            owner_id = uid
        else:
            agent_ids.append(uid)

    # 2. Leads — only seed if collection empty
    if await db.leads.count_documents({}) > 0:
        return

    batch_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    await db.import_batches.insert_one({
        "_id": batch_id,
        "uploaded_by_user_id": owner_id,
        "file_name": "demo_leads.xlsx",
        "total_rows": 50, "imported_rows": 50,
        "duplicate_rows": 2, "skipped_rows": 0, "error_rows": 0,
        "assignment_method": "round_robin",
        "created_at": _iso(now - timedelta(days=10)),
    })

    random.seed(42)
    leads = []
    for i in range(50):
        fn = random.choice(FIRST_NAMES)
        ln = random.choice(LAST_NAMES)
        city, state, county, zipc = random.choice(CITIES)
        phone = _phone()
        birth_year = random.randint(1935, 1960)
        bd = f"{birth_year}-{random.randint(1, 12):02d}-{random.randint(1, 28):02d}"
        status = random.choice(STATUSES)
        agent_id = random.choice(agent_ids + [None])  # ~25% unassigned
        created = now - timedelta(days=random.randint(0, 30))
        updated = created + timedelta(days=random.randint(0, 5))
        leads.append({
            "_id": str(uuid.uuid4()),
            "first_name": fn, "last_name": ln, "full_name": f"{fn} {ln}",
            "birthdate": bd,
            "address": f"{random.randint(100, 9999)} {random.choice(STREETS)} St",
            "city": city, "state": state, "zip_code": zipc, "county": county,
            "phone_number": phone, "normalized_phone_number": _normalize_phone(phone),
            "medicaid_number": f"M{random.randint(100000000, 999999999)}",
            "medicare_number": f"{random.randint(100, 999)}-{random.randint(10, 99)}-{random.randint(1000, 9999)}-A",
            "medicaid_provider": random.choice(PROVIDERS),
            "medicare_parts": random.choice(PARTS),
            "lead_type": random.choice(["New to Medicare", "Transfer"]),
            "lead_status": status,
            "assigned_agent_id": agent_id,
            "source_import_batch_id": batch_id,
            "is_duplicate": False,
            "duplicate_group_id": None,
            "created_at": _iso(created),
            "updated_at": _iso(updated),
        })
    await db.leads.insert_many(leads)

    # 3. Notes & call logs for ~30 leads
    sample = random.sample(leads, 30)
    note_texts = [
        "Spoke with client; interested in Medicare Advantage.",
        "Left voicemail — will call back tomorrow.",
        "Has Medicare A and B, no Part D yet.",
        "Not interested at this time, prefers email only.",
        "Appointment set for Friday at 2pm.",
        "Wants to compare 3 plans before deciding.",
        "Already enrolled with another agent.",
        "Lives with daughter, requested daughter joins call.",
    ]
    notes_docs = []
    calls_docs = []
    for lead in sample:
        agent_id = lead["assigned_agent_id"] or random.choice(agent_ids)
        user = await db.users.find_one({"_id": agent_id})
        user_name = f"{user['first_name']} {user['last_name']}"
        for _ in range(random.randint(1, 3)):
            ts = datetime.fromisoformat(lead["created_at"]) + timedelta(hours=random.randint(1, 72))
            notes_docs.append({
                "_id": str(uuid.uuid4()),
                "lead_id": lead["_id"],
                "user_id": agent_id, "user_name": user_name,
                "note_text": random.choice(note_texts),
                "is_pinned": random.random() < 0.15,
                "created_at": _iso(ts), "updated_at": _iso(ts),
            })
        for _ in range(random.randint(1, 4)):
            ts = datetime.fromisoformat(lead["created_at"]) + timedelta(hours=random.randint(1, 96))
            calls_docs.append({
                "_id": str(uuid.uuid4()),
                "lead_id": lead["_id"], "user_id": agent_id, "user_name": user_name,
                "call_result": random.choice(CALL_RESULTS),
                "notes": random.choice(["", "Quick chat, callback needed.", "Long discussion, ready to enroll."]),
                "follow_up_date": None,
                "duration": random.choice([None, 45, 120, 300, 600]),
                "created_at": _iso(ts),
            })
    if notes_docs:
        await db.notes.insert_many(notes_docs)
    if calls_docs:
        await db.call_logs.insert_many(calls_docs)
