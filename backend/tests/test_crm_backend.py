"""Health Experts CRM — End-to-end backend API tests.

Covers: auth, RBAC, leads CRUD/filters, notes, call logs, activity feed,
assignment (manual + round-robin), agents mgmt, dashboards, leaderboard,
statuses, settings, import preview/commit, duplicates.
"""
import io
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://medicare-agent-desk.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

OWNER_EMAIL = "owner@healthexpertscrm.com"
OWNER_PASS = "Password123!"
AGENT1_EMAIL = "agent1@healthexpertscrm.com"
AGENT_PASS = "Password123!"


# --- session-scoped tokens & clients -----------------------------------------
def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"login {email}: {r.status_code} {r.text}"
    data = r.json()
    assert "access_token" in data
    assert "user" in data
    return data["access_token"], data["user"]


@pytest.fixture(scope="session")
def owner_auth():
    token, user = _login(OWNER_EMAIL, OWNER_PASS)
    return token, user


@pytest.fixture(scope="session")
def agent_auth():
    token, user = _login(AGENT1_EMAIL, AGENT_PASS)
    return token, user


@pytest.fixture(scope="session")
def owner_client(owner_auth):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {owner_auth[0]}", "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def agent_client(agent_auth):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {agent_auth[0]}", "Content-Type": "application/json"})
    return s


# ====================== AUTH =================================================
class TestAuth:
    def test_owner_login(self, owner_auth):
        token, user = owner_auth
        assert token and isinstance(token, str)
        assert user["email"] == OWNER_EMAIL
        assert user["role"] == "owner"
        assert "id" in user

    def test_agent_login(self, agent_auth):
        token, user = agent_auth
        assert user["role"] == "agent"
        assert user["email"] == AGENT1_EMAIL

    def test_login_invalid(self):
        r = requests.post(f"{API}/auth/login", json={"email": OWNER_EMAIL, "password": "WRONG"}, timeout=10)
        assert r.status_code == 401

    def test_me_owner(self, owner_client):
        r = owner_client.get(f"{API}/auth/me")
        assert r.status_code == 200
        assert r.json()["email"] == OWNER_EMAIL

    def test_me_unauth(self):
        r = requests.get(f"{API}/auth/me")
        assert r.status_code == 401


# ====================== RBAC =================================================
class TestRBAC:
    def test_agent_cannot_create_user(self, agent_client):
        r = agent_client.post(f"{API}/users", json={
            "first_name": "Hack", "last_name": "Er",
            "email": f"TEST_hack_{uuid.uuid4().hex[:6]}@x.com",
            "password": "Password123!", "role": "agent"
        })
        assert r.status_code == 403

    def test_agent_cannot_assign(self, agent_client, agent_auth):
        r = agent_client.post(f"{API}/leads/assign",
                              json={"lead_ids": ["dummy"], "agent_id": agent_auth[1]["id"]})
        assert r.status_code == 403

    def test_agent_cannot_import_preview(self, agent_auth):
        # multipart - use separate session without JSON header
        files = {"file": ("a.csv", b"name,phone\nJoe,5551234567\n", "text/csv")}
        headers = {"Authorization": f"Bearer {agent_auth[0]}"}
        r = requests.post(f"{API}/imports/preview", files=files, headers=headers, timeout=15)
        assert r.status_code == 403

    def test_agent_scope_leads(self, agent_client, agent_auth):
        r = agent_client.get(f"{API}/leads?limit=200")
        assert r.status_code == 200
        items = r.json()["items"]
        # all returned leads must be assigned to this agent
        for l in items:
            assert l.get("assigned_agent_id") == agent_auth[1]["id"]


# ====================== LEADS ================================================
class TestLeads:
    def test_owner_lists_seeded_leads(self, owner_client):
        r = owner_client.get(f"{API}/leads?limit=200")
        assert r.status_code == 200
        body = r.json()
        assert "items" in body and "total" in body
        assert body["total"] >= 50, f"expected >=50 seeded leads, got {body['total']}"

    def test_filter_status(self, owner_client):
        r = owner_client.get(f"{API}/leads?status=Sold&limit=200")
        assert r.status_code == 200
        for l in r.json()["items"]:
            assert l["lead_status"] == "Sold"

    def test_search_q(self, owner_client):
        r = owner_client.get(f"{API}/leads?q=a&limit=5")
        assert r.status_code == 200
        assert "items" in r.json()

    def test_lead_detail_unmasked(self, owner_client):
        r = owner_client.get(f"{API}/leads?limit=1")
        lid = r.json()["items"][0]["id"]
        r2 = owner_client.get(f"{API}/leads/{lid}")
        assert r2.status_code == 200
        lead = r2.json()
        assert "phone_number" in lead
        assert "medicare_number" in lead
        assert "medicaid_number" in lead
        # no masking - shouldn't contain '*'
        if lead.get("phone_number"):
            assert "*" not in lead["phone_number"]

    def test_patch_status(self, owner_client):
        r = owner_client.get(f"{API}/leads?limit=1")
        lid = r.json()["items"][0]["id"]
        r2 = owner_client.patch(f"{API}/leads/{lid}", json={"lead_status": "Sold"})
        assert r2.status_code == 200
        assert r2.json()["lead_status"] == "Sold"
        # verify persisted
        r3 = owner_client.get(f"{API}/leads/{lid}")
        assert r3.json()["lead_status"] == "Sold"


# ====================== NOTES / CALL LOGS / ACTIVITY =========================
class TestNotesCallsActivity:
    @pytest.fixture(scope="class")
    def lead_id(self, owner_client, agent_auth):
        # find a lead assigned to agent1 so agent can also use it
        r = owner_client.get(f"{API}/leads?agent_id={agent_auth[1]['id']}&limit=1")
        items = r.json()["items"]
        if not items:
            r = owner_client.get(f"{API}/leads?limit=1")
            items = r.json()["items"]
        return items[0]["id"]

    def test_create_note_and_get(self, owner_client, lead_id):
        text = f"TEST_note_{uuid.uuid4().hex[:6]}"
        r = owner_client.post(f"{API}/leads/{lead_id}/notes", json={"note_text": text})
        assert r.status_code == 200
        nid = r.json()["id"]
        r2 = owner_client.get(f"{API}/leads/{lead_id}/notes")
        assert r2.status_code == 200
        assert any(n["id"] == nid and n["note_text"] == text for n in r2.json())

    def test_create_call_log(self, owner_client, lead_id):
        r = owner_client.post(f"{API}/leads/{lead_id}/call-logs",
                              json={"call_result": "Spoke With Lead", "notes": "TEST_call"})
        assert r.status_code == 200
        cid = r.json()["id"]
        r2 = owner_client.get(f"{API}/leads/{lead_id}/call-logs")
        assert any(c["id"] == cid for c in r2.json())

    def test_activity_feed(self, owner_client, lead_id):
        r = owner_client.get(f"{API}/leads/{lead_id}/activity")
        assert r.status_code == 200
        feed = r.json()
        assert isinstance(feed, list)
        types = {item["type"] for item in feed}
        assert "note" in types or "call" in types
        # sorted desc by created_at
        if len(feed) > 1:
            assert feed[0]["created_at"] >= feed[-1]["created_at"]

    def test_agent_can_add_note_for_own_lead(self, agent_client, agent_auth, owner_client):
        r = owner_client.get(f"{API}/leads?agent_id={agent_auth[1]['id']}&limit=1")
        items = r.json()["items"]
        if not items:
            pytest.skip("no leads assigned to agent1")
        lid = items[0]["id"]
        r2 = agent_client.post(f"{API}/leads/{lid}/notes", json={"note_text": "TEST_agent_note"})
        assert r2.status_code == 200


# ====================== ASSIGN / ROUND-ROBIN =================================
class TestAssignment:
    def test_manual_assign(self, owner_client, agent_auth):
        r = owner_client.get(f"{API}/leads?limit=2")
        lead_ids = [l["id"] for l in r.json()["items"]]
        agent_id = agent_auth[1]["id"]
        r2 = owner_client.post(f"{API}/leads/assign",
                               json={"lead_ids": lead_ids, "agent_id": agent_id})
        assert r2.status_code == 200
        assert r2.json()["modified"] >= 0
        # verify
        for lid in lead_ids:
            d = owner_client.get(f"{API}/leads/{lid}").json()
            assert d["assigned_agent_id"] == agent_id

    def test_round_robin_with_explicit_ids(self, owner_client):
        # get agents
        users = owner_client.get(f"{API}/users").json()
        agent_ids = [u["id"] for u in users if u["role"] == "agent"][:2]
        if len(agent_ids) < 2:
            pytest.skip("need 2 agents")
        leads = owner_client.get(f"{API}/leads?limit=4").json()["items"]
        lead_ids = [l["id"] for l in leads]
        r = owner_client.post(f"{API}/leads/round-robin",
                              json={"lead_ids": lead_ids, "agent_ids": agent_ids})
        assert r.status_code == 200
        assert r.json()["assigned"] == len(lead_ids)


# ====================== AGENTS / USERS =======================================
class TestAgents:
    def test_create_and_update_agent(self, owner_client):
        email = f"TEST_agent_{uuid.uuid4().hex[:8]}@x.com"
        r = owner_client.post(f"{API}/users", json={
            "first_name": "Test", "last_name": "Agent",
            "email": email, "password": "Password123!", "role": "agent"
        })
        assert r.status_code == 200
        uid = r.json()["id"]
        # deactivate
        r2 = owner_client.patch(f"{API}/users/{uid}", json={"status": "inactive"})
        assert r2.status_code == 200
        assert r2.json()["status"] == "inactive"
        # reset password
        r3 = owner_client.post(f"{API}/users/{uid}/reset-password", json={"password": "NewPass123!"})
        assert r3.status_code == 200


# ====================== DASHBOARDS / LEADERBOARD =============================
class TestDashboards:
    def test_owner_dashboard(self, owner_client):
        r = owner_client.get(f"{API}/dashboard/owner")
        assert r.status_code == 200
        d = r.json()
        assert "cards" in d and "by_status" in d and "by_agent" in d and "funnel" in d
        cards = d["cards"]
        for k in ["total_leads", "sold", "appointment_set", "unassigned", "active_agents"]:
            assert k in cards

    def test_agent_dashboard(self, agent_client):
        r = agent_client.get(f"{API}/dashboard/agent")
        assert r.status_code == 200
        cards = r.json()["cards"]
        for k in ["total_leads", "uncalled", "sold", "calls_today"]:
            assert k in cards

    def test_leaderboard(self, owner_client):
        r = owner_client.get(f"{API}/leaderboard?period=week")
        assert r.status_code == 200
        body = r.json()
        assert isinstance(body, dict)
        assert "rows" in body and "basis" in body
        rows = body["rows"]
        assert isinstance(rows, list) and len(rows) >= 1
        first = rows[0]
        for k in ["agent_id", "agent_name", "assigned", "appointments", "sold", "conversion_rate", "rank"]:
            assert k in first
        # sorted by sold desc
        for a, b in zip(rows, rows[1:]):
            assert a["sold"] >= b["sold"] or (a["sold"] == b["sold"])


# ====================== STATUSES / SETTINGS ==================================
class TestStatusesSettings:
    def test_list_statuses(self, owner_client):
        r = owner_client.get(f"{API}/statuses")
        assert r.status_code == 200
        statuses = r.json()
        assert len(statuses) >= 16
        names = {s["name"] for s in statuses}
        assert "Sold" in names and "Uncalled" in names

    def test_create_status_owner(self, owner_client):
        name = f"TEST_status_{uuid.uuid4().hex[:6]}"
        r = owner_client.post(f"{API}/statuses",
                              json={"name": name, "color": "blue", "sort_order": 50, "is_active": True})
        assert r.status_code == 200
        assert r.json()["name"] == name

    def test_settings_company_get_patch(self, owner_client):
        r = owner_client.get(f"{API}/settings/company")
        assert r.status_code == 200
        body = r.json()
        assert "company_name" in body
        r2 = owner_client.patch(f"{API}/settings/company",
                                json={"contact_phone": "(555) 123-9999"})
        assert r2.status_code == 200
        assert r2.json()["contact_phone"] == "(555) 123-9999"


# ====================== IMPORT / DUPLICATES ==================================
class TestImports:
    def test_import_preview_and_commit(self, owner_auth, owner_client):
        csv_data = (
            b"Name,Phone,Address,City,State,Zip,Birthdate,Medicare Number\n"
            b"TEST Alice Smith,5550101234,1 Main St,Austin,TX,73301,1950-01-01,1AA1-AA1-AA11\n"
            b"TEST Bob Jones,5550101235,2 Elm St,Dallas,TX,75001,1948-06-15,1BB2-BB2-BB22\n"
        )
        files = {"file": ("test.csv", csv_data, "text/csv")}
        headers = {"Authorization": f"Bearer {owner_auth[0]}"}
        r = requests.post(f"{API}/imports/preview", files=files, headers=headers, timeout=20)
        assert r.status_code == 200, r.text
        prev = r.json()
        assert "columns" in prev and "rows" in prev and "auto_mapping" in prev
        assert len(prev["rows"]) == 2
        # commit
        r2 = owner_client.post(f"{API}/imports/commit", json={
            "rows": prev["rows"],
            "mapping": prev["auto_mapping"],
            "duplicate_handling": "skip",
            "assignment_method": "unassigned",
            "agent_ids": [],
            "file_name": "test.csv",
        })
        assert r2.status_code == 200, r2.text
        data = r2.json()
        assert data["imported_rows"] >= 1 or data["duplicate_rows"] >= 1

    def test_duplicates_groups(self, owner_client):
        r = owner_client.get(f"{API}/duplicates")
        assert r.status_code == 200
        assert isinstance(r.json(), list)


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
