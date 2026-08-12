"""Iteration 7 tests — Leaderboard next_month default, Plan Brochures CRUD,
per-column filters on /api/leads."""
import os
import io
import base64
import datetime as dt
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
    except Exception:
        pass

OWNER = {"email": "owner@healthexpertscrm.com", "password": "Password123!"}
AGENT1 = {"email": "agent1@healthexpertscrm.com", "password": "Password123!"}

DUMMY_PDF = b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"


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


# ============================================================
# 1) Leaderboard defaults to next_month + effective
# ============================================================
def test_leaderboard_default_next_month_effective(owner):
    r = owner.get(f"{BASE_URL}/api/leaderboard", timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("period") == "next_month", data
    assert data.get("basis") == "effective", data
    # Label should be the calendar month AFTER "now"
    now = dt.datetime.utcnow()
    y, m = now.year, now.month
    if m == 12:
        y2, m2 = y + 1, 1
    else:
        y2, m2 = y, m + 1
    expected_label = dt.date(y2, m2, 1).strftime("%B %Y")
    assert data.get("label") == expected_label, (data.get("label"), expected_label)


def test_leaderboard_explicit_next_month(owner):
    r = owner.get(f"{BASE_URL}/api/leaderboard?period=next_month&basis=effective", timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert d["period"] == "next_month" and d["basis"] == "effective"
    assert "rows" in d or "items" in d or "leaderboard" in d or isinstance(d.get("agents"), list)


# ============================================================
# 2) Carriers + Plans CRUD + PDF serve + cascade delete
# ============================================================
@pytest.fixture(scope="module")
def carrier_id(owner):
    r = owner.post(f"{BASE_URL}/api/carriers",
                   json={"name": "ITER7_Humana", "sort_order": 999}, timeout=15)
    assert r.status_code in (200, 201), r.text
    cid = r.json()["id"]
    yield cid
    # Best-effort cleanup
    owner.delete(f"{BASE_URL}/api/carriers/{cid}", timeout=15)


def test_carriers_list_visible_to_agent(agent1):
    r = agent1.get(f"{BASE_URL}/api/carriers", timeout=15)
    assert r.status_code == 200


def test_carrier_create_owner_only(agent1):
    r = agent1.post(f"{BASE_URL}/api/carriers",
                    json={"name": "ITER7_ShouldFail", "sort_order": 0}, timeout=15)
    assert r.status_code in (401, 403), r.status_code


def test_carrier_appears_in_listing(owner, carrier_id):
    r = owner.get(f"{BASE_URL}/api/carriers", timeout=15)
    assert r.status_code == 200
    ids = {c["id"] for c in r.json()}
    assert carrier_id in ids


def test_plan_create_without_pdf(owner, carrier_id):
    files = {"name": (None, "ITER7_Plan_A")}
    r = owner.post(f"{BASE_URL}/api/carriers/{carrier_id}/plans",
                   files=files, timeout=15)
    assert r.status_code in (200, 201), r.text
    body = r.json()
    assert body.get("has_pdf") is False
    # Listing must show it under this carrier
    r = owner.get(f"{BASE_URL}/api/carriers", timeout=15)
    car = next(c for c in r.json() if c["id"] == carrier_id)
    names = [p["name"] for p in car["plans"]]
    assert "ITER7_Plan_A" in names


def test_plan_create_with_pdf_and_serve(owner, carrier_id):
    files = {
        "name": (None, "ITER7_Plan_B"),
        "brochure": ("dummy.pdf", io.BytesIO(DUMMY_PDF), "application/pdf"),
    }
    r = owner.post(f"{BASE_URL}/api/carriers/{carrier_id}/plans",
                   files=files, timeout=15)
    assert r.status_code in (200, 201), r.text
    pid = r.json()["id"]
    assert r.json().get("has_pdf") is True

    # Serve PDF
    r = owner.get(f"{BASE_URL}/api/plans/{pid}/pdf", timeout=15)
    assert r.status_code == 200
    ct = r.headers.get("content-type", "")
    assert "application/pdf" in ct, ct
    assert r.content.startswith(b"%PDF"), r.content[:20]

    # Agent can also fetch
    a1 = _login(AGENT1)
    r2 = a1.get(f"{BASE_URL}/api/plans/{pid}/pdf", timeout=15)
    assert r2.status_code == 200
    return pid


def test_plan_pdf_404_when_absent(owner, carrier_id):
    # Create a plan with NO pdf, then request pdf -> 404
    files = {"name": (None, "ITER7_NoPdf")}
    r = owner.post(f"{BASE_URL}/api/carriers/{carrier_id}/plans",
                   files=files, timeout=15)
    pid = r.json()["id"]
    r = owner.get(f"{BASE_URL}/api/plans/{pid}/pdf", timeout=15)
    assert r.status_code == 404


def test_carrier_cascade_delete(owner):
    # Fresh carrier + plan (with pdf) -> delete carrier -> plans gone, pdf 404
    r = owner.post(f"{BASE_URL}/api/carriers",
                   json={"name": "ITER7_ToDelete", "sort_order": 0}, timeout=15)
    cid = r.json()["id"]
    files = {"name": (None, "ITER7_DoomedPlan"),
             "brochure": ("x.pdf", io.BytesIO(DUMMY_PDF), "application/pdf")}
    r = owner.post(f"{BASE_URL}/api/carriers/{cid}/plans", files=files, timeout=15)
    pid = r.json()["id"]

    r = owner.delete(f"{BASE_URL}/api/carriers/{cid}", timeout=15)
    assert r.status_code == 200

    # Carrier is gone from listing
    r = owner.get(f"{BASE_URL}/api/carriers", timeout=15)
    ids = {c["id"] for c in r.json()}
    assert cid not in ids

    # PDF endpoint returns 404
    r = owner.get(f"{BASE_URL}/api/plans/{pid}/pdf", timeout=15)
    assert r.status_code == 404


# ============================================================
# 3) Per-column filters on /api/leads
# ============================================================
@pytest.fixture(scope="module")
def filter_seeds(owner):
    """Seed 3 leads with distinct city/zip/state/county/provider."""
    seeds = [
        {"first_name": "ITER7", "last_name": "CityNYC",
         "phone_number": "5557770001", "birthdate": "1950-01-01",
         "city": "NYC", "state": "NY", "zip_code": "10001",
         "county": "NewYorkCo", "medicaid_provider": "AetnaITER7",
         "lead_type": "New to Medicare"},
        {"first_name": "ITER7", "last_name": "CityLA",
         "phone_number": "5557770002", "birthdate": "1950-01-01",
         "city": "Los Angeles", "state": "CA", "zip_code": "90210",
         "county": "LACo", "medicaid_provider": "CignaITER7",
         "lead_type": "New to Medicare"},
        {"first_name": "ITER7", "last_name": "CityBOS",
         "phone_number": "5557770003", "birthdate": "1950-01-01",
         "city": "Boston", "state": "MA", "zip_code": "02110",
         "county": "SuffolkCo", "medicaid_provider": "HumanaITER7",
         "lead_type": "New to Medicare"},
    ]
    ids = []
    for p in seeds:
        r = owner.post(f"{BASE_URL}/api/leads", json=p, timeout=15)
        assert r.status_code in (200, 201), r.text
        ids.append(r.json()["id"])
    yield ids
    for i in ids:
        owner.delete(f"{BASE_URL}/api/leads/{i}", timeout=15)


def _seeded_only(items, seed_ids):
    return [i for i in items if i["id"] in seed_ids]


def test_filter_city(owner, filter_seeds):
    r = owner.get(f"{BASE_URL}/api/leads?city=NYC&limit=500", timeout=15)
    assert r.status_code == 200
    mine = _seeded_only(r.json()["items"], filter_seeds)
    cities = {m["city"] for m in mine}
    assert cities == {"NYC"}, cities


def test_filter_city_case_insensitive(owner, filter_seeds):
    r = owner.get(f"{BASE_URL}/api/leads?city=nyc&limit=500", timeout=15)
    assert r.status_code == 200
    mine = _seeded_only(r.json()["items"], filter_seeds)
    assert len(mine) == 1 and mine[0]["city"] == "NYC"


def test_filter_zip_prefix(owner, filter_seeds):
    r = owner.get(f"{BASE_URL}/api/leads?zip_code=10001&limit=500", timeout=15)
    mine = _seeded_only(r.json()["items"], filter_seeds)
    assert {m["zip_code"] for m in mine} == {"10001"}


def test_filter_state(owner, filter_seeds):
    r = owner.get(f"{BASE_URL}/api/leads?state=NY&limit=500", timeout=15)
    mine = _seeded_only(r.json()["items"], filter_seeds)
    assert {m["state"] for m in mine} == {"NY"}


def test_filter_county(owner, filter_seeds):
    r = owner.get(f"{BASE_URL}/api/leads?county=LACo&limit=500", timeout=15)
    mine = _seeded_only(r.json()["items"], filter_seeds)
    assert {m["county"] for m in mine} == {"LACo"}


def test_filter_medicaid_provider(owner, filter_seeds):
    r = owner.get(f"{BASE_URL}/api/leads?medicaid_provider=HumanaITER7&limit=500", timeout=15)
    mine = _seeded_only(r.json()["items"], filter_seeds)
    assert len(mine) == 1
    assert mine[0]["medicaid_provider"] == "HumanaITER7"


# ============================================================
# 4) Regression
# ============================================================
def test_health():
    r = requests.get(f"{BASE_URL}/health", timeout=10)
    assert r.status_code == 200
