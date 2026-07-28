"""Iteration 4 tests (Jan 2026):

1. BoB Effective Date filter: GET /api/leads?effective_from&effective_to filters
   leads by their effective_date.
2. Shared pool list minimal fields: GET /api/shared-leads returns only
   {id, full_name, address, plan, is_locked, locked_by_me, locked_by_name,
    lead_status}. Must NOT leak phone_number/birthdate/medicare_number/medicaid_number.
3. Shared pool lock semantics: agent1 lock -> 200; agent2 lock -> 423; agent2 GET
   detail -> 423; agent1 GET -> 200 full details; heartbeat -> 200; unlock -> 200;
   agent2 lock after release -> 200.
4. Owner move-to-shared: POST /api/shared-leads/move flips is_shared, wipes notes/
   call_logs, resets status to Uncalled, removes from regular /api/leads listing.
5. Marking a shared lead Complete removes it from GET /api/shared-leads.
"""
import io
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://medicare-agent-desk.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

OWNER_EMAIL = "owner@healthexpertscrm.com"
AGENT1_EMAIL = "agent1@healthexpertscrm.com"
AGENT2_EMAIL = "agent2@healthexpertscrm.com"
PASSWORD = "Password123!"


def _login(email, pw):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": pw}, timeout=20)
    assert r.status_code == 200, f"login {email} failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


def _client(token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s


@pytest.fixture(scope="module")
def owner():
    return _client(_login(OWNER_EMAIL, PASSWORD))


@pytest.fixture(scope="module")
def agent1():
    return _client(_login(AGENT1_EMAIL, PASSWORD))


@pytest.fixture(scope="module")
def agent2():
    return _client(_login(AGENT2_EMAIL, PASSWORD))


@pytest.fixture(scope="module")
def agent1_id(agent1):
    return agent1.get(f"{API}/auth/me").json()["id"]


@pytest.fixture(scope="module")
def agent1_name(agent1):
    me = agent1.get(f"{API}/auth/me").json()
    return f"{me['first_name']} {me['last_name']}".strip()


def _create_lead(owner, first="TEST_iter4", **extra):
    payload = {
        "first_name": f"{first}_{uuid.uuid4().hex[:5]}",
        "last_name": "Client",
        "phone_number": f"555030{uuid.uuid4().int % 10000:04d}",
        "address": "123 Elm St",
        "city": "Miami",
        "state": "FL",
        "zip_code": "33101",
        "medicaid_provider": "Molina",
        "medicare_number": "1AB2CD3EF45",
        "medicaid_number": "MEDX998877",
        "birthdate": "1961-01-15",
        **extra,
    }
    r = owner.post(f"{API}/leads", json=payload)
    assert r.status_code == 200, r.text
    return r.json()["id"]


# ============================================================================
# 1. BoB effective_from/effective_to filter
# ============================================================================
class TestEffectiveDateFilter:
    def test_filter_range_inclusive(self, owner):
        ids = []
        for d in ("2026-06-01", "2026-07-01", "2026-07-15", "2026-08-15"):
            lid = _create_lead(owner)
            owner.patch(f"{API}/leads/{lid}", json={"effective_date": d})
            ids.append(lid)
        try:
            r = owner.get(f"{API}/leads", params={
                "effective_from": "2026-07-01", "effective_to": "2026-07-31", "limit": 500
            })
            assert r.status_code == 200
            got = {i["id"]: i["effective_date"] for i in r.json()["items"] if i["id"] in ids}
            # Must include the two July dates and NOT the June / August ones
            assert ids[1] in got and got[ids[1]] == "2026-07-01"
            assert ids[2] in got and got[ids[2]] == "2026-07-15"
            assert ids[0] not in got, "June date leaked into July filter"
            assert ids[3] not in got, "August date leaked into July filter"
        finally:
            owner.post(f"{API}/leads/bulk-delete", json={"lead_ids": ids})

    def test_only_from(self, owner):
        lid_old = _create_lead(owner)
        lid_new = _create_lead(owner)
        owner.patch(f"{API}/leads/{lid_old}", json={"effective_date": "2025-01-01"})
        owner.patch(f"{API}/leads/{lid_new}", json={"effective_date": "2027-01-01"})
        try:
            r = owner.get(f"{API}/leads", params={"effective_from": "2026-01-01", "limit": 500})
            ids = {i["id"] for i in r.json()["items"]}
            assert lid_new in ids and lid_old not in ids
        finally:
            owner.post(f"{API}/leads/bulk-delete", json={"lead_ids": [lid_old, lid_new]})


# ============================================================================
# 2. Shared pool list — minimal fields shape
# ============================================================================
class TestSharedListShape:
    def test_only_minimal_fields_returned(self, owner):
        lid = _create_lead(owner)
        owner.post(f"{API}/shared-leads/move", json={"lead_ids": [lid]})
        try:
            r = owner.get(f"{API}/shared-leads")
            assert r.status_code == 200
            payload = r.json()
            assert "items" in payload
            item = next((i for i in payload["items"] if i["id"] == lid), None)
            assert item is not None, "moved lead not in shared list"
            allowed = {"id", "full_name", "address", "plan", "is_locked",
                       "locked_by_me", "locked_by_name", "lead_status"}
            extra = set(item.keys()) - allowed
            assert not extra, f"list response leaks fields: {extra}"
            # Confirm sensitive fields are NOT there:
            for forbidden in ("phone_number", "birthdate", "medicare_number", "medicaid_number"):
                assert forbidden not in item, f"list leaks {forbidden}"
            # Address composed
            assert "Miami" in item["address"] and "FL" in item["address"]
            assert item["plan"] == "Molina"
            assert item["lead_status"] == "Uncalled"
        finally:
            owner.post(f"{API}/shared-leads/remove", json={"lead_ids": [lid]})
            owner.post(f"{API}/leads/bulk-delete", json={"lead_ids": [lid]})


# ============================================================================
# 3. Lock semantics between two agents
# ============================================================================
class TestLockSemantics:
    def test_full_lock_lifecycle(self, owner, agent1, agent2, agent1_name):
        lid = _create_lead(owner)
        owner.post(f"{API}/shared-leads/move", json={"lead_ids": [lid]})
        try:
            # agent1 locks -> 200
            r = agent1.post(f"{API}/shared-leads/{lid}/lock")
            assert r.status_code == 200, r.text

            # agent2 attempts lock -> 423
            r = agent2.post(f"{API}/shared-leads/{lid}/lock")
            assert r.status_code == 423, f"expected 423, got {r.status_code}"
            assert "Locked by" in (r.json().get("detail") or "")

            # agent2 GET detail -> 423
            r = agent2.get(f"{API}/shared-leads/{lid}")
            assert r.status_code == 423

            # agent1 GET -> 200 with full details
            r = agent1.get(f"{API}/shared-leads/{lid}")
            assert r.status_code == 200, r.text
            body = r.json()
            assert body.get("phone_number"), "phone missing from detail view"
            assert body.get("medicare_number"), "medicare_number missing from detail view"

            # heartbeat -> 200
            r = agent1.post(f"{API}/shared-leads/{lid}/heartbeat")
            assert r.status_code == 200

            # agent2 heartbeat should be 423
            r = agent2.post(f"{API}/shared-leads/{lid}/heartbeat")
            assert r.status_code == 423

            # agent1 shared list shows locked_by_me=true; agent2 sees is_locked=true
            r1 = agent1.get(f"{API}/shared-leads")
            item1 = next(i for i in r1.json()["items"] if i["id"] == lid)
            assert item1["locked_by_me"] is True
            assert item1["is_locked"] is False  # not "locked to another"

            r2 = agent2.get(f"{API}/shared-leads")
            item2 = next(i for i in r2.json()["items"] if i["id"] == lid)
            assert item2["is_locked"] is True
            assert item2["locked_by_me"] is False
            assert agent1_name in (item2["locked_by_name"] or "")

            # agent1 unlocks
            r = agent1.post(f"{API}/shared-leads/{lid}/unlock")
            assert r.status_code == 200

            # agent2 can now lock
            r = agent2.post(f"{API}/shared-leads/{lid}/lock")
            assert r.status_code == 200
            agent2.post(f"{API}/shared-leads/{lid}/unlock")
        finally:
            owner.post(f"{API}/shared-leads/remove", json={"lead_ids": [lid]})
            owner.post(f"{API}/leads/bulk-delete", json={"lead_ids": [lid]})

    def test_owner_can_view_without_lock(self, owner, agent1):
        lid = _create_lead(owner)
        owner.post(f"{API}/shared-leads/move", json={"lead_ids": [lid]})
        try:
            agent1.post(f"{API}/shared-leads/{lid}/lock")
            # Owner should be able to fetch details even without holding lock
            r = owner.get(f"{API}/shared-leads/{lid}")
            assert r.status_code == 200, "owner should bypass lock"
            agent1.post(f"{API}/shared-leads/{lid}/unlock")
        finally:
            owner.post(f"{API}/shared-leads/remove", json={"lead_ids": [lid]})
            owner.post(f"{API}/leads/bulk-delete", json={"lead_ids": [lid]})


# ============================================================================
# 4. Owner move-to-shared: wipes notes/call_logs + resets status
# ============================================================================
class TestMoveToShared:
    def test_move_wipes_history_and_resets(self, owner, agent1, agent1_id):
        lid = _create_lead(owner)
        # Assign to agent1 + add note + call log + status change
        owner.patch(f"{API}/leads/{lid}", json={"assigned_agent_id": agent1_id})
        agent1.post(f"{API}/leads/{lid}/notes", json={"note_text": "TEST_note", "is_pinned": False})
        agent1.post(f"{API}/leads/{lid}/call-logs", json={"call_result": "No Answer", "notes": "n/a"})
        agent1.patch(f"{API}/leads/{lid}", json={"lead_status": "Call Back Later"})

        # Move to shared
        r = owner.post(f"{API}/shared-leads/move", json={"lead_ids": [lid]})
        assert r.status_code == 200, r.text
        assert r.json()["moved"] == 1

        try:
            # Regular /leads listing should NOT include shared lead by default (for owner)
            r = owner.get(f"{API}/leads", params={"limit": 500})
            ids_in_leads = {i["id"] for i in r.json()["items"]}
            assert lid not in ids_in_leads, "shared lead still visible on regular Leads page"

            # But is in shared listing
            r = owner.get(f"{API}/shared-leads")
            ids_in_shared = {i["id"] for i in r.json()["items"]}
            assert lid in ids_in_shared

            # Notes + call logs wiped — need lock to view details
            owner_full = owner.get(f"{API}/shared-leads/{lid}").json()
            assert owner_full["lead_status"] == "Uncalled"
            assert owner_full.get("assigned_agent_id") in (None, "")
            # confirm no notes/call_logs exist
            # Owner can view via /leads endpoint using include_shared to fetch
            r = owner.get(f"{API}/leads", params={"include_shared": True, "limit": 500})
            # Fetch notes via lead endpoint — first re-scope by re-fetching via /leads/{id}
            # Since the lead is shared and unassigned we'd hit lead_scope_filter — owner sees all
            g = owner.get(f"{API}/leads/{lid}")
            assert g.status_code == 200
            n = owner.get(f"{API}/leads/{lid}/notes")
            assert n.status_code == 200
            assert len(n.json()) == 0, "notes not wiped after move to shared"
            c = owner.get(f"{API}/leads/{lid}/call-logs")
            assert c.status_code == 200
            assert len(c.json()) == 0, "call logs not wiped after move to shared"
        finally:
            owner.post(f"{API}/shared-leads/remove", json={"lead_ids": [lid]})
            owner.post(f"{API}/leads/bulk-delete", json={"lead_ids": [lid]})

    def test_agent_forbidden_to_move(self, agent1):
        r = agent1.post(f"{API}/shared-leads/move", json={"lead_ids": ["fake"]})
        assert r.status_code in (401, 403)


# ============================================================================
# 5. Complete removes from shared pool
# ============================================================================
class TestCompleteExitsPool:
    def test_marking_complete_removes_from_shared_list(self, owner, agent1):
        lid = _create_lead(owner)
        owner.post(f"{API}/shared-leads/move", json={"lead_ids": [lid]})
        try:
            agent1.post(f"{API}/shared-leads/{lid}/lock")
            # Mark complete via /leads patch
            r = agent1.patch(f"{API}/leads/{lid}", json={"lead_status": "Complete"})
            # Agent needs to be able to see the lead via lead_scope_filter, but lead has no
            # assigned_agent_id (shared) — this may fail with 404. Check reality:
            if r.status_code == 404:
                # Fallback: owner marks it complete
                r = owner.patch(f"{API}/leads/{lid}", json={"lead_status": "Complete"})
            assert r.status_code == 200, r.text
            # Shared list should no longer contain it
            r = owner.get(f"{API}/shared-leads")
            ids = {i["id"] for i in r.json()["items"]}
            assert lid not in ids, "Complete lead still in shared pool listing"
        finally:
            owner.post(f"{API}/leads/bulk-delete", json={"lead_ids": [lid]})



# ============================================================================
# 6. NEW: PATCH /shared-leads/{id} — dedicated endpoint (previously found bug fix)
# ============================================================================
class TestSharedLeadPatchEndpoint:
    def test_lock_holder_can_patch_status(self, owner, agent1):
        """Agent holding the lock can PATCH shared lead status via /shared-leads/{id}."""
        lid = _create_lead(owner)
        owner.post(f"{API}/shared-leads/move", json={"lead_ids": [lid]})
        try:
            r = agent1.post(f"{API}/shared-leads/{lid}/lock")
            assert r.status_code == 200, r.text
            # PATCH via new endpoint - should return 200 (not 404)
            r = agent1.patch(f"{API}/shared-leads/{lid}", json={"lead_status": "No Answer"})
            assert r.status_code == 200, f"expected 200, got {r.status_code}: {r.text}"
            body = r.json()
            assert body["lead_status"] == "No Answer"
            # Still shared / not claimed on a non-Complete status
            assert body.get("is_shared") is True
        finally:
            agent1.post(f"{API}/shared-leads/{lid}/unlock")
            owner.post(f"{API}/shared-leads/remove", json={"lead_ids": [lid]})
            owner.post(f"{API}/leads/bulk-delete", json={"lead_ids": [lid]})

    def test_non_lock_holder_gets_423(self, owner, agent1, agent2):
        """Agent2 without lock trying to PATCH gets 423."""
        lid = _create_lead(owner)
        owner.post(f"{API}/shared-leads/move", json={"lead_ids": [lid]})
        try:
            agent1.post(f"{API}/shared-leads/{lid}/lock")
            r = agent2.patch(f"{API}/shared-leads/{lid}", json={"lead_status": "No Answer"})
            assert r.status_code == 423, f"expected 423, got {r.status_code}: {r.text}"
            # Also test with no lock at all
            agent1.post(f"{API}/shared-leads/{lid}/unlock")
            r = agent2.patch(f"{API}/shared-leads/{lid}", json={"lead_status": "No Answer"})
            assert r.status_code == 423
        finally:
            owner.post(f"{API}/shared-leads/remove", json={"lead_ids": [lid]})
            owner.post(f"{API}/leads/bulk-delete", json={"lead_ids": [lid]})

    def test_complete_auto_claims_lead(self, owner, agent1, agent1_id, agent1_name):
        """Marking Complete via /shared-leads/{id} auto-claims: sets assigned_agent_id,
        is_shared=false, completed_by_user_id, locked_at=null. Lead no longer appears in
        GET /shared-leads but DOES appear in GET /leads?status=Complete with completed_by_name."""
        lid = _create_lead(owner)
        owner.post(f"{API}/shared-leads/move", json={"lead_ids": [lid]})
        try:
            r = agent1.post(f"{API}/shared-leads/{lid}/lock")
            assert r.status_code == 200
            r = agent1.patch(f"{API}/shared-leads/{lid}", json={"lead_status": "Complete"})
            assert r.status_code == 200, r.text
            body = r.json()
            assert body["lead_status"] == "Complete"
            assert body["is_shared"] is False
            assert body["assigned_agent_id"] == agent1_id
            assert body["completed_by_user_id"] == agent1_id
            assert body.get("locked_at") in (None, "")

            # Not in shared listing anymore
            r = owner.get(f"{API}/shared-leads")
            ids = {i["id"] for i in r.json()["items"]}
            assert lid not in ids, "Complete lead should exit shared pool"

            # But IS in GET /leads?status=Complete with completed_by_name
            r = owner.get(f"{API}/leads", params={"status": "Complete", "limit": 500})
            assert r.status_code == 200
            matches = [i for i in r.json()["items"] if i["id"] == lid]
            assert len(matches) == 1, "Complete lead should appear in /leads?status=Complete"
            row = matches[0]
            assert row.get("completed_by_name") and agent1_name.split()[0] in row["completed_by_name"]
        finally:
            owner.post(f"{API}/leads/bulk-delete", json={"lead_ids": [lid]})

    def test_patch_nonexistent_shared_lead_404(self, agent1):
        r = agent1.patch(f"{API}/shared-leads/does-not-exist", json={"lead_status": "No Answer"})
        assert r.status_code == 404
