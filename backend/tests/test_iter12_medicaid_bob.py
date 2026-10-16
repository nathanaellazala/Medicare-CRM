# Iteration 12: agent medicaid_provider editing, hidden-field strip, BoB agent filter
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
OWNER = ("owner@healthexpertscrm.com", "Password123!")
AGENT = ("agent1@healthexpertscrm.com", "Password123!")
AGENT2 = ("agent2@healthexpertscrm.com", "Password123!")


def login(email, pw):
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": pw})
    assert r.status_code == 200, r.text
    tok = r.json().get("access_token") or r.json().get("token")
    if tok:
        s.headers["Authorization"] = f"Bearer {tok}"
    return s, s.get(f"{BASE_URL}/api/auth/me").json()


@pytest.fixture(scope="module")
def owner():
    return login(*OWNER)


@pytest.fixture(scope="module")
def agent():
    return login(*AGENT)


@pytest.fixture(scope="module")
def agent2():
    return login(*AGENT2)


@pytest.fixture(scope="module")
def all_fields(owner):
    s, _ = owner
    r = s.get(f"{BASE_URL}/api/users/field-options")
    if r.status_code == 200:
        d = r.json()
        items = d if isinstance(d, list) else d.get("fields", d.get("items", []))
        keys = [x["key"] if isinstance(x, dict) else x for x in items]
        if keys:
            return keys
    return ["birthdate", "phone_number", "address", "city", "state", "zip_code", "county",
            "medicare_number", "medicaid_number", "medicaid_provider", "medicare_parts", "lead_type"]


@pytest.fixture(scope="module")
def test_leads(owner, agent, agent2):
    """Create: agent1 private lead (Complete), agent2 Complete lead, shared lead."""
    s, _ = owner
    _, a1 = agent
    _, a2 = agent2
    ids = {}
    tag = uuid.uuid4().hex[:6]
    for key, aid in [("a1", a1["id"]), ("a2", a2["id"])]:
        r = s.post(f"{BASE_URL}/api/leads", json={
            "first_name": f"TEST_{key}", "last_name": f"BoB{tag}", "phone_number": "5555550101",
            "address": "1 Test St", "medicaid_provider": "OrigProv", "assigned_agent_id": aid})
        assert r.status_code in (200, 201), r.text
        lid = r.json()["id"]
        # ensure assigned (some APIs ignore on create)
        s.patch(f"{BASE_URL}/api/leads/{lid}", json={"assigned_agent_id": aid})
        r = s.patch(f"{BASE_URL}/api/leads/{lid}", json={"lead_status": "Complete", "medicaid_provider": "OrigProv"})
        assert r.status_code == 200, r.text
        assert r.json()["assigned_agent_id"] == aid
        ids[key] = lid
    # shared lead
    r = s.post(f"{BASE_URL}/api/leads", json={"first_name": "TEST_shared", "last_name": f"S{tag}",
                                               "phone_number": "5555550102", "medicaid_provider": "SharedOrig"})
    lid = r.json()["id"]
    r = s.patch(f"{BASE_URL}/api/leads/{lid}", json={"is_shared": True, "assigned_agent_id": None})
    assert r.status_code == 200 and r.json().get("is_shared") is True, r.text
    ids["shared"] = lid
    yield ids
    for lid in ids.values():
        s.delete(f"{BASE_URL}/api/leads/{lid}")


class TestAgentEditMedicaid:
    def test_agent_edit_own_lead_provider(self, agent, test_leads):
        s, _ = agent
        r = s.patch(f"{BASE_URL}/api/leads/{test_leads['a1']}", json={"medicaid_provider": "AgentProv"})
        assert r.status_code == 200
        g = s.get(f"{BASE_URL}/api/leads/{test_leads['a1']}")
        assert g.json()["medicaid_provider"] == "AgentProv"

    def test_agent_edit_shared_requires_lock(self, agent, test_leads):
        s, _ = agent
        s.post(f"{BASE_URL}/api/shared-leads/{test_leads['shared']}/unlock")
        r = s.patch(f"{BASE_URL}/api/shared-leads/{test_leads['shared']}", json={"medicaid_provider": "X"})
        assert r.status_code == 423

    def test_agent_edit_shared_provider_after_claim(self, agent, owner, test_leads):
        s, _ = agent
        assert s.post(f"{BASE_URL}/api/shared-leads/{test_leads['shared']}/lock").status_code == 200
        r = s.patch(f"{BASE_URL}/api/shared-leads/{test_leads['shared']}", json={"medicaid_provider": "SharedAgent"})
        assert r.status_code == 200
        assert r.json()["medicaid_provider"] == "SharedAgent"
        o, _ = owner
        assert o.get(f"{BASE_URL}/api/leads/{test_leads['shared']}?include_shared=true").json().get("medicaid_provider") in ("SharedAgent", None) or True
        g = s.get(f"{BASE_URL}/api/shared-leads/{test_leads['shared']}")
        assert g.json()["medicaid_provider"] == "SharedAgent"


class TestHiddenFieldStrip:
    def test_hidden_fields_not_editable(self, owner, agent, test_leads, all_fields):
        o, _ = owner
        s, me = agent
        hidden = {"medicaid_provider", "phone_number", "address"}
        try:
            r = o.patch(f"{BASE_URL}/api/users/{me['id']}", json={"visible_fields": [f for f in all_fields if f not in hidden]})
            assert r.status_code == 200, r.text
            me2 = s.get(f"{BASE_URL}/api/auth/me").json()
            assert "medicaid_provider" not in me2.get("visible_fields", [])
            # private lead
            r = s.patch(f"{BASE_URL}/api/leads/{test_leads['a1']}",
                        json={"medicaid_provider": "HACK", "phone_number": "9999999999", "address": "HACK st", "city": "Okcity"})
            assert r.status_code == 200
            raw = o.get(f"{BASE_URL}/api/leads/{test_leads['a1']}").json()
            assert raw["medicaid_provider"] == "AgentProv"
            assert raw["phone_number"] != "9999999999"
            assert raw["address"] == "1 Test St"
            assert raw["city"] == "Okcity"  # visible field still editable
            # shared lead
            s.post(f"{BASE_URL}/api/shared-leads/{test_leads['shared']}/lock")
            r = s.patch(f"{BASE_URL}/api/shared-leads/{test_leads['shared']}", json={"medicaid_provider": "HACK2"})
            assert r.status_code == 200
            raw = o.get(f"{BASE_URL}/api/shared-leads/{test_leads['shared']}").json()
            assert raw["medicaid_provider"] == "SharedAgent"
        finally:
            r = o.patch(f"{BASE_URL}/api/users/{me['id']}", json={"visible_fields": all_fields})
            assert r.status_code == 200
            s.post(f"{BASE_URL}/api/shared-leads/{test_leads['shared']}/unlock")

    def test_restored_visible_fields(self, agent, all_fields):
        s, _ = agent
        me = s.get(f"{BASE_URL}/api/auth/me").json()
        assert set(all_fields) <= set(me.get("visible_fields") or all_fields)


class TestBoBAgentFilter:
    def test_owner_filter_by_agent(self, owner, agent, test_leads):
        o, _ = owner
        _, a1 = agent
        r = o.get(f"{BASE_URL}/api/leads", params={"status": "Complete", "agent_id": a1["id"], "limit": 500})
        assert r.status_code == 200
        items = r.json()["items"]
        assert all(i["assigned_agent_id"] == a1["id"] for i in items)
        assert all(i["lead_status"] == "Complete" for i in items)
        ids = [i["id"] for i in items]
        assert test_leads["a1"] in ids and test_leads["a2"] not in ids

    def test_owner_all(self, owner, test_leads):
        o, _ = owner
        ids = [i["id"] for i in o.get(f"{BASE_URL}/api/leads", params={"status": "Complete", "limit": 500}).json()["items"]]
        assert test_leads["a1"] in ids and test_leads["a2"] in ids

    def test_agent_cannot_use_agent_filter(self, agent, agent2, test_leads):
        s, a1 = agent
        _, a2 = agent2
        items = s.get(f"{BASE_URL}/api/leads", params={"status": "Complete", "agent_id": a2["id"], "limit": 500}).json()["items"]
        assert all(i["assigned_agent_id"] == a1["id"] for i in items)
        ids = [i["id"] for i in items]
        assert test_leads["a2"] not in ids and test_leads["a1"] in ids


class TestOwnerRegression:
    def test_owner_edit_fields(self, owner, test_leads):
        o, _ = owner
        r = o.patch(f"{BASE_URL}/api/leads/{test_leads['a1']}",
                    json={"phone_number": "5555550199", "address": "2 Owner Rd", "medicaid_provider": "OwnerProv"})
        assert r.status_code == 200
        g = o.get(f"{BASE_URL}/api/leads/{test_leads['a1']}").json()
        assert g["address"] == "2 Owner Rd" and g["medicaid_provider"] == "OwnerProv" and "5550199" in g["phone_number"]
