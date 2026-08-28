"""Iteration 10 tests: universal search, enrolled plan on Complete, appt persistence."""
import os
import pytest
import requests

def _load_env():
    if os.environ.get("REACT_APP_BACKEND_URL"):
        return
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if "=" in line and not line.strip().startswith("#"):
                    k, v = line.strip().split("=", 1)
                    os.environ.setdefault(k, v)
    except Exception:
        pass
_load_env()
BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

OWNER = {"email": "owner@healthexpertscrm.com", "password": "Password123!"}


@pytest.fixture(scope="module")
def owner_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/login", json=OWNER)
    assert r.status_code == 200, r.text
    tok = r.json().get("access_token") or r.json().get("token")
    assert tok
    s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


@pytest.fixture(scope="module")
def seed_lead(owner_client):
    payload = {
        "first_name": "ITER10",
        "last_name": "Search",
        "phone_number": "555-777-1234",
        "address": "42 Avenue Ave",
        "city": "Newark",
        "state": "NJ",
        "zip_code": "07104",
        "county": "Essex",
        "medicaid_provider": "HorizonNJ Health",
        "medicare_parts": "Part A, Part B",
    }
    r = owner_client.post(f"{API}/leads", json=payload)
    assert r.status_code == 200, r.text
    lead = r.json()
    yield lead
    owner_client.delete(f"{API}/leads/{lead['id']}")


# ---- Universal search across many fields ----
class TestUniversalSearch:
    def test_search_by_zip(self, owner_client, seed_lead):
        r = owner_client.get(f"{API}/leads", params={"q": "07104"})
        assert r.status_code == 200
        ids = [x["id"] for x in r.json()["items"]]
        assert seed_lead["id"] in ids

    def test_search_by_address(self, owner_client, seed_lead):
        r = owner_client.get(f"{API}/leads", params={"q": "Avenue"})
        assert r.status_code == 200
        ids = [x["id"] for x in r.json()["items"]]
        assert seed_lead["id"] in ids

    def test_search_by_state(self, owner_client, seed_lead):
        r = owner_client.get(f"{API}/leads", params={"q": "NJ"})
        assert r.status_code == 200
        ids = [x["id"] for x in r.json()["items"]]
        assert seed_lead["id"] in ids

    def test_search_by_provider(self, owner_client, seed_lead):
        r = owner_client.get(f"{API}/leads", params={"q": "HorizonNJ"})
        assert r.status_code == 200
        ids = [x["id"] for x in r.json()["items"]]
        assert seed_lead["id"] in ids

    def test_search_by_medicare_parts(self, owner_client, seed_lead):
        r = owner_client.get(f"{API}/leads", params={"q": "Part B"})
        assert r.status_code == 200
        ids = [x["id"] for x in r.json()["items"]]
        assert seed_lead["id"] in ids


# ---- Complete flow saves enrolled_carrier + enrolled_plan ----
class TestCompleteWithPlan:
    def test_patch_complete_saves_plan(self, owner_client, seed_lead):
        lid = seed_lead["id"]
        r = owner_client.patch(f"{API}/leads/{lid}", json={
            "lead_status": "Complete",
            "enrolled_carrier": "TestCarrier",
            "enrolled_plan": "TestPlan",
            "effective_date": "2026-02-01",
        })
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["lead_status"] == "Complete"
        assert d["enrolled_carrier"] == "TestCarrier"
        assert d["enrolled_plan"] == "TestPlan"
        assert d.get("completed_at")

        # GET verifies persistence
        r2 = owner_client.get(f"{API}/leads/{lid}")
        d2 = r2.json()
        assert d2["enrolled_carrier"] == "TestCarrier"
        assert d2["enrolled_plan"] == "TestPlan"
        assert d2["effective_date"] == "2026-02-01"

    def test_change_plan_without_status(self, owner_client, seed_lead):
        lid = seed_lead["id"]
        r = owner_client.patch(f"{API}/leads/{lid}", json={
            "enrolled_carrier": "NewCarrier",
            "enrolled_plan": "NewPlan",
        })
        assert r.status_code == 200
        d = r.json()
        assert d["enrolled_carrier"] == "NewCarrier"
        assert d["enrolled_plan"] == "NewPlan"
        # status still Complete
        assert d["lead_status"] == "Complete"


# ---- Appointment does not clear on status change ----
class TestAppointmentPersistence:
    def test_appt_survives_status_change(self, owner_client):
        # create fresh
        r = owner_client.post(f"{API}/leads", json={
            "first_name": "ITER10", "last_name": "Appt",
            "phone_number": "555-111-2222",
        })
        lid = r.json()["id"]
        try:
            iso = "2026-03-15T15:30:00.000Z"
            r = owner_client.patch(f"{API}/leads/{lid}", json={
                "lead_status": "Appointment Set",
                "appointment_at": iso,
            })
            assert r.status_code == 200
            assert r.json()["appointment_at"] is not None

            # Change status to Contacted — appointment_at should remain
            r = owner_client.patch(f"{API}/leads/{lid}", json={"lead_status": "Contacted"})
            assert r.status_code == 200
            d = r.json()
            assert d["lead_status"] == "Contacted"
            assert d["appointment_at"] is not None, "Appointment cleared unexpectedly"

            # Verify via GET
            r2 = owner_client.get(f"{API}/leads/{lid}")
            assert r2.json()["appointment_at"] is not None
        finally:
            owner_client.delete(f"{API}/leads/{lid}")

    def test_reassignment_clears_appt_and_plan(self, owner_client):
        # Reassign wipes appt + plan per requirements
        r = owner_client.get(f"{API}/users")
        agents = [u for u in r.json() if u["role"] == "agent"]
        if len(agents) < 1:
            pytest.skip("no agents")
        r = owner_client.post(f"{API}/leads", json={
            "first_name": "ITER10", "last_name": "Reassign",
            "phone_number": "555-333-4444",
        })
        lid = r.json()["id"]
        try:
            owner_client.patch(f"{API}/leads/{lid}", json={
                "lead_status": "Appointment Set",
                "appointment_at": "2026-04-01T10:00:00.000Z",
                "enrolled_carrier": "X", "enrolled_plan": "Y",
            })
            r = owner_client.patch(f"{API}/leads/{lid}", json={
                "assigned_agent_id": agents[0]["id"]
            })
            assert r.status_code == 200
            d = r.json()
            assert d.get("appointment_at") is None
            assert d.get("enrolled_carrier") is None
            assert d.get("enrolled_plan") is None
            assert d["lead_status"] == "Uncalled"
        finally:
            owner_client.delete(f"{API}/leads/{lid}")


# ---- Carriers endpoint ----
def test_carriers_endpoint(owner_client):
    r = owner_client.get(f"{API}/carriers")
    assert r.status_code == 200
    assert isinstance(r.json(), list)
