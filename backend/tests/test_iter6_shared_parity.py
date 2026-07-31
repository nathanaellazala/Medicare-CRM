"""Iteration 6 tests — Shared Leads parity, BoB sort, agent access gate."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Fallback to frontend/.env
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
    except Exception:
        pass

OWNER = {"email": "owner@healthexpertscrm.com", "password": "Password123!"}
AGENT1 = {"email": "agent1@healthexpertscrm.com", "password": "Password123!"}
AGENT2 = {"email": "agent2@healthexpertscrm.com", "password": "Password123!"}


def _login(creds):
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json=creds, timeout=30)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def owner():
    return _login(OWNER)


@pytest.fixture(scope="module")
def agent1():
    return _login(AGENT1)


@pytest.fixture(scope="module")
def agent2():
    return _login(AGENT2)


@pytest.fixture(scope="module")
def agents_info(owner):
    r = owner.get(f"{BASE_URL}/api/users?role=agent", timeout=15)
    assert r.status_code == 200
    data = r.json()
    items = data.get("items", data) if isinstance(data, dict) else data
    return items


def _get_agent_id(agents_info, email):
    for a in agents_info:
        if a.get("email") == email:
            return a.get("id") or a.get("_id")
    return None
    for a in agents_info:
        if a.get("email") == email:
            return a.get("id") or a.get("_id")
    return None


# ---------- Health ----------
def test_health():
    r = requests.get(f"{BASE_URL}/health", timeout=10)
    assert r.status_code == 200


# ---------- Users list includes can_access_shared_pool ----------
def test_users_include_can_access_shared_pool(agents_info):
    assert len(agents_info) > 0
    # Every agent record must carry the field
    for a in agents_info:
        assert "can_access_shared_pool" in a, f"Missing field in {a}"


# ---------- Seed helper: create leads and push to shared pool ----------
@pytest.fixture(scope="module")
def seeded_shared_ids(owner, agents_info):
    """Create 3 leads assigned to agent1, then move to shared pool."""
    agent1_id = _get_agent_id(agents_info, AGENT1["email"])
    assert agent1_id
    ids = []
    for i, name in enumerate(["ITER6_Alpha Test", "ITER6_Bravo Test", "ITER6_Charlie Test"]):
        fn, ln = name.split(" ", 1)
        payload = {
            "first_name": fn,
            "last_name": ln,
            "phone_number": f"555010{i:04d}",
            "birthdate": "1950-01-01",
            "address": f"{i} Main St",
            "city": ["Boston", "Austin", "Denver"][i],
            "state": "MA",
            "zip_code": "02100",
            "medicaid_provider": ["Aetna", "Cigna", "Humana"][i],
            "assigned_agent_id": agent1_id,
            "lead_type": "New to Medicare",
        }
        r = owner.post(f"{BASE_URL}/api/leads", json=payload, timeout=15)
        assert r.status_code in (200, 201), r.text
        ids.append(r.json()["id"])
    # Move to shared
    r = owner.post(f"{BASE_URL}/api/shared-leads/move", json={"lead_ids": ids}, timeout=15)
    assert r.status_code == 200, r.text
    yield ids
    # Teardown: bulk delete anything remaining
    owner.post(f"{BASE_URL}/api/shared-leads/bulk-delete", json={"lead_ids": ids}, timeout=15)


# ---------- Sort ----------
def test_shared_leads_sort_name_asc_desc(owner, seeded_shared_ids):
    r = owner.get(f"{BASE_URL}/api/shared-leads?sort=name_asc&limit=500", timeout=15)
    assert r.status_code == 200
    items = r.json()["items"]
    names = [i["full_name"] for i in items if i["id"] in seeded_shared_ids]
    assert names == sorted(names), f"Not asc-sorted: {names}"

    r = owner.get(f"{BASE_URL}/api/shared-leads?sort=name_desc&limit=500", timeout=15)
    assert r.status_code == 200
    items = r.json()["items"]
    names = [i["full_name"] for i in items if i["id"] in seeded_shared_ids]
    assert names == sorted(names, reverse=True), f"Not desc-sorted: {names}"


def test_shared_leads_sort_plan_and_city(owner, seeded_shared_ids):
    for s in ("plan_asc", "plan_desc", "city_asc", "city_desc"):
        r = owner.get(f"{BASE_URL}/api/shared-leads?sort={s}&limit=500", timeout=15)
        assert r.status_code == 200, f"{s}: {r.status_code}"


# ---------- BoB /api/leads sort ----------
def test_bob_sort_params_accepted(owner):
    for s in ("name_asc", "name_desc", "city_asc", "city_desc",
              "plan_asc", "plan_desc", "effective_asc", "effective_desc",
              "completed_asc", "completed_desc"):
        r = owner.get(f"{BASE_URL}/api/leads?sort={s}&limit=10", timeout=15)
        assert r.status_code == 200, f"{s}: {r.status_code} {r.text[:200]}"


# ---------- CSV export ----------
def test_shared_export_csv(owner, seeded_shared_ids):
    r = owner.get(f"{BASE_URL}/api/shared-leads/export/csv", timeout=15)
    assert r.status_code == 200
    ct = r.headers.get("content-type", "")
    assert "text/csv" in ct, ct
    cd = r.headers.get("content-disposition", "")
    assert "attachment" in cd.lower() and ".csv" in cd.lower()
    body = r.text
    assert "Full Name" in body and "Phone Number" in body and "Birthdate" in body
    # seeded rows should appear
    assert "ITER6_Alpha Test" in body


def test_shared_export_csv_forbidden_for_agent(agent1):
    r = agent1.get(f"{BASE_URL}/api/shared-leads/export/csv", timeout=15)
    assert r.status_code in (401, 403), r.status_code


# ---------- Bulk transfer (assign) ----------
def test_shared_bulk_transfer(owner, agent1, agents_info, seeded_shared_ids):
    agent2_id = _get_agent_id(agents_info, AGENT2["email"])
    assert agent2_id
    target = seeded_shared_ids[0]
    r = owner.post(
        f"{BASE_URL}/api/shared-leads/assign",
        json={"lead_ids": [target], "agent_id": agent2_id},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    assert r.json().get("assigned") == 1
    # No longer in shared pool
    r = owner.get(f"{BASE_URL}/api/shared-leads?limit=500", timeout=15)
    ids_now = {i["id"] for i in r.json()["items"]}
    assert target not in ids_now
    # Appears in agent2's my leads with Uncalled status
    a2 = _login(AGENT2)
    r = a2.get(f"{BASE_URL}/api/leads?limit=500", timeout=15)
    assert r.status_code == 200
    mine = [i for i in r.json()["items"] if i.get("id") == target or i.get("_id") == target]
    assert len(mine) == 1, "Transferred lead not found in agent2 my leads"
    assert mine[0]["lead_status"] == "Uncalled"


# ---------- Bulk delete ----------
def test_shared_bulk_delete(owner, seeded_shared_ids):
    # Delete a couple remaining
    to_del = seeded_shared_ids[1:]
    r = owner.post(f"{BASE_URL}/api/shared-leads/bulk-delete",
                   json={"lead_ids": to_del}, timeout=15)
    assert r.status_code == 200
    assert r.json().get("deleted") >= 1
    # verify gone
    r = owner.get(f"{BASE_URL}/api/shared-leads?limit=500", timeout=15)
    ids_now = {i["id"] for i in r.json()["items"]}
    for i in to_del:
        assert i not in ids_now


# ---------- Access gate ----------
def test_can_access_shared_pool_gate(owner, agents_info):
    agent1_id = _get_agent_id(agents_info, AGENT1["email"])
    # Turn off
    r = owner.patch(f"{BASE_URL}/api/users/{agent1_id}",
                    json={"can_access_shared_pool": False}, timeout=15)
    assert r.status_code == 200
    a1 = _login(AGENT1)
    r = a1.get(f"{BASE_URL}/api/shared-leads", timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert data == {"total": 0, "items": []}, data
    # Turn back on
    r = owner.patch(f"{BASE_URL}/api/users/{agent1_id}",
                    json={"can_access_shared_pool": True}, timeout=15)
    assert r.status_code == 200
    a1 = _login(AGENT1)
    r = a1.get(f"{BASE_URL}/api/shared-leads", timeout=15)
    assert r.status_code == 200
    # Field should now allow content (may still be 0 leads depending on state)
    assert "items" in r.json()


# ---------- on_leaderboard toggle ----------
def test_on_leaderboard_toggle(owner, agents_info):
    agent1_id = _get_agent_id(agents_info, AGENT1["email"])
    r = owner.patch(f"{BASE_URL}/api/users/{agent1_id}",
                    json={"on_leaderboard": False}, timeout=15)
    assert r.status_code == 200
    # Verify persisted
    r = owner.get(f"{BASE_URL}/api/users?role=agent", timeout=15)
    users = r.json()
    if isinstance(users, dict):
        users = users.get("items", [])
    a1 = next(u for u in users if u.get("email") == AGENT1["email"])
    assert a1.get("on_leaderboard") is False
    # Restore
    owner.patch(f"{BASE_URL}/api/users/{agent1_id}",
                json={"on_leaderboard": True}, timeout=15)


# ---------- Regression: lock flow ----------
def test_lock_flow_regression(owner, agents_info):
    """Agent1 locks, agent2 gets 423, agent1 completes -> lead leaves pool."""
    agent1_id = _get_agent_id(agents_info, AGENT1["email"])
    # Seed a fresh shared lead
    payload = {
        "first_name": "ITER6",
        "last_name": "LockTest",
        "phone_number": "5559999999",
        "birthdate": "1955-01-01",
        "assigned_agent_id": agent1_id,
        "lead_type": "New to Medicare",
    }
    r = owner.post(f"{BASE_URL}/api/leads", json=payload, timeout=15)
    assert r.status_code in (200, 201), r.text
    lid = r.json()["id"]
    owner.post(f"{BASE_URL}/api/shared-leads/move", json={"lead_ids": [lid]}, timeout=15)

    a1 = _login(AGENT1)
    a2 = _login(AGENT2)
    r = a1.post(f"{BASE_URL}/api/shared-leads/{lid}/lock", timeout=15)
    assert r.status_code == 200, r.text
    r = a2.post(f"{BASE_URL}/api/shared-leads/{lid}/lock", timeout=15)
    assert r.status_code == 423, f"expected 423 got {r.status_code}"
    # Agent1 completes
    r = a1.patch(f"{BASE_URL}/api/shared-leads/{lid}",
                 json={"lead_status": "Complete", "effective_date": "2026-02-01"},
                 timeout=15)
    assert r.status_code == 200, r.text
    # Lead should no longer be in shared pool listing
    r = owner.get(f"{BASE_URL}/api/shared-leads?limit=500", timeout=15)
    ids = {i["id"] for i in r.json()["items"]}
    assert lid not in ids
    # Cleanup
    owner.delete(f"{BASE_URL}/api/leads/{lid}", timeout=15)
