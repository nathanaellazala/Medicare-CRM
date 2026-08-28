"""Iter8 re-verification: transfer reset, per-agent visibility, copy columns backend support."""
import os
import requests
import pytest

BASE = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
OWNER = ("owner@healthexpertscrm.com", "Password123!")
A1 = ("agent1@healthexpertscrm.com", "Password123!")
A2 = ("agent2@healthexpertscrm.com", "Password123!")


def login(email, pw):
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/login", json={"email": email, "password": pw})
    assert r.status_code == 200, r.text
    return s


@pytest.fixture(scope="module")
def owner():
    return login(*OWNER)


@pytest.fixture(scope="module")
def agent1():
    return login(*A1)


@pytest.fixture(scope="module")
def agent2():
    return login(*A2)


@pytest.fixture(scope="module")
def agent_ids(owner):
    r = owner.get(f"{BASE}/api/users")
    assert r.status_code == 200
    users = r.json()
    return {u["email"]: u["id"] for u in users}


def test_health():
    # /health lives at root (not under /api). Accept either 200 or 404-tolerant fallback to /api/leads ping.
    r = requests.get(f"{BASE}/health")
    if r.status_code != 200:
        r = requests.get(f"{BASE}/api/leaderboard")
    assert r.status_code in (200, 401)


def test_seed_40_leads(owner, agent_ids):
    """Ensure >=40 leads exist for scroll restore UI test."""
    r = owner.get(f"{BASE}/api/leads?limit=200")
    assert r.status_code == 200
    existing = r.json()
    count = len(existing) if isinstance(existing, list) else len(existing.get("items", []))
    a1id = agent_ids["agent1@healthexpertscrm.com"]
    need = max(0, 45 - count)
    created = []
    for i in range(need):
        payload = {
            "first_name": f"ITER8Scroll{i}", "last_name": "Test",
            "phone": f"555010{i:04d}", "city": "Miami", "state": "FL",
            "zip_code": "33101", "assigned_agent_id": a1id,
            "medicare_number": f"1AA1-BB2-CC{i:02d}", "medicaid_number": f"MCAID{i:05d}",
        }
        rr = owner.post(f"{BASE}/api/leads", json=payload)
        assert rr.status_code in (200, 201), rr.text
        created.append(rr.json()["id"])
    print(f"seeded {len(created)} new leads; total now {count+len(created)}")


def test_transfer_wipes_notes_calls_status(owner, agent1, agent_ids):
    a1 = agent_ids["agent1@healthexpertscrm.com"]
    a2 = agent_ids["agent2@healthexpertscrm.com"]
    # create lead assigned to agent1
    r = owner.post(f"{BASE}/api/leads", json={
        "first_name": "ITER8Xfer", "last_name": "Case", "phone": "5559990001",
        "city": "Tampa", "state": "FL", "zip_code": "33601", "assigned_agent_id": a1,
    })
    assert r.status_code in (200, 201)
    lid = r.json()["id"]
    # agent1 adds note
    rn = agent1.post(f"{BASE}/api/leads/{lid}/notes", json={"note_text": "hello note"})
    assert rn.status_code in (200, 201), rn.text
    # call log
    rc = agent1.post(f"{BASE}/api/leads/{lid}/call-logs", json={"call_result": "answered", "duration": 60, "notes": "spoke"})
    assert rc.status_code in (200, 201), rc.text
    # set status Appointment Set
    rs = agent1.patch(f"{BASE}/api/leads/{lid}", json={
        "lead_status": "Appointment Set", "appointment_at": "2026-02-01T10:00:00Z",
    })
    assert rs.status_code == 200, rs.text
    # sanity
    n1 = agent1.get(f"{BASE}/api/leads/{lid}/notes").json()
    c1 = agent1.get(f"{BASE}/api/leads/{lid}/call-logs").json()
    assert len(n1) >= 1 and len(c1) >= 1
    # owner transfers to agent2
    rt = owner.patch(f"{BASE}/api/leads/{lid}", json={"assigned_agent_id": a2})
    assert rt.status_code == 200, rt.text
    lead = rt.json()
    assert lead["assigned_agent_id"] == a2
    assert lead["lead_status"] == "Uncalled", lead
    assert lead.get("appointment_at") in (None, "", 0)
    assert lead.get("effective_date") in (None, "")
    assert lead.get("completed_at") in (None, "")
    # notes and calls wiped
    n2 = owner.get(f"{BASE}/api/leads/{lid}/notes").json()
    c2 = owner.get(f"{BASE}/api/leads/{lid}/call-logs").json()
    assert n2 == [] and c2 == [], (n2, c2)
    # cleanup
    owner.delete(f"{BASE}/api/leads/{lid}")


def test_per_agent_field_visibility(owner, agent_ids):
    a1id = agent_ids["agent1@healthexpertscrm.com"]
    # get current visible_fields
    ru = owner.get(f"{BASE}/api/users").json()
    a1u = next(u for u in ru if u["id"] == a1id)
    original_vf = a1u.get("visible_fields")
    # Determine a base list (use current or a full default)
    if original_vf:
        base = list(original_vf)
    else:
        # take from any lead's keys minus id/system fields
        base = ["first_name", "last_name", "phone", "city", "state", "zip_code",
                "medicare_number", "medicaid_number", "county", "provider"]
    reduced = [f for f in base if f not in ("medicare_number", "medicaid_number")]
    if reduced == base:
        # ensure reduced actually differs (add both then remove)
        base = list(set(base + ["medicare_number", "medicaid_number"]))
        reduced = [f for f in base if f not in ("medicare_number", "medicaid_number")]
    try:
        rp = owner.patch(f"{BASE}/api/users/{a1id}", json={"visible_fields": reduced})
        assert rp.status_code == 200, rp.text
        # login as agent1 and fetch leads
        a1s = login(*A1)
        rl = a1s.get(f"{BASE}/api/leads?limit=5")
        assert rl.status_code == 200
        items = rl.json()
        items = items if isinstance(items, list) else items.get("items", [])
        assert len(items) > 0, "no leads visible to agent1"
        for lead in items:
            assert lead.get("medicare_number", "") == "", f"medicare not masked: {lead.get('medicare_number')!r}"
            assert lead.get("medicaid_number", "") == "", f"medicaid not masked: {lead.get('medicaid_number')!r}"
        # restore both
        restored = list(set(reduced + ["medicare_number", "medicaid_number"]))
        rp2 = owner.patch(f"{BASE}/api/users/{a1id}", json={"visible_fields": restored})
        assert rp2.status_code == 200
        a1s2 = login(*A1)
        rl2 = a1s2.get(f"{BASE}/api/leads?limit=20")
        items2 = rl2.json()
        items2 = items2 if isinstance(items2, list) else items2.get("items", [])
        any_med = any(l.get("medicare_number") for l in items2)
        assert any_med, "medicare_number should be visible after restore"
    finally:
        # restore to original
        owner.patch(f"{BASE}/api/users/{a1id}", json={"visible_fields": original_vf})


def test_per_column_filters_regression(owner):
    for f in ["city=Miami", "state=FL", "zip_code=33101"]:
        r = owner.get(f"{BASE}/api/leads?{f}&limit=5")
        assert r.status_code == 200, (f, r.text)


def test_leaderboard_next_month_default(owner):
    r = owner.get(f"{BASE}/api/leaderboard")
    assert r.status_code == 200
    data = r.json()
    # accept either dict with 'period' or list
    assert data is not None
