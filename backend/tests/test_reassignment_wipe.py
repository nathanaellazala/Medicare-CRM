"""Tests verifying that lead reassignment across all endpoints wipes ALL
per-lead history so the receiving agent gets a completely fresh slate.

Covered endpoints:
  - PATCH /api/leads/{id}            (scenario A)
  - POST  /api/leads/assign          (scenario B, bulk)
  - POST  /api/leads/round-robin     (scenario C)
  - POST  /api/shared-leads/move     (scenario D)
  - POST  /api/shared-leads/assign   (scenario E)

Every reassignment must:
  * delete notes for the lead
  * delete call_logs for the lead
  * delete per-lead audit_logs (Activity tab)
  * reset lead_status to Uncalled
  * clear: appointment_at, effective_date, completed_at, completed_by_user_id,
           enrolled_carrier, enrolled_plan, application_info, hra_info
  * a fresh 'lead_assigned' audit entry should be added AFTER wipe so the
    receiving agent still sees "Assigned to ..." in Activity
"""
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
AGENT1 = {"email": "agent1@healthexpertscrm.com", "password": "Password123!"}
AGENT2 = {"email": "agent2@healthexpertscrm.com", "password": "Password123!"}


def _login(creds):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/login", json=creds)
    assert r.status_code == 200, r.text
    tok = r.json().get("access_token") or r.json().get("token")
    assert tok
    s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


@pytest.fixture(scope="module")
def owner():
    return _login(OWNER)


@pytest.fixture(scope="module")
def agent1_id(owner):
    r = owner.get(f"{API}/users")
    assert r.status_code == 200
    for u in r.json():
        if u.get("email") == AGENT1["email"]:
            return u.get("id") or u.get("_id")
    pytest.skip("agent1 not seeded")


@pytest.fixture(scope="module")
def agent2_id(owner):
    r = owner.get(f"{API}/users")
    assert r.status_code == 200
    for u in r.json():
        if u.get("email") == AGENT2["email"]:
            return u.get("id") or u.get("_id")
    pytest.skip("agent2 not seeded")


# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------
def _make_lead(owner, agent_id, suffix="A"):
    payload = {
        "first_name": f"TEST_WIPE_{suffix}",
        "last_name": "Reassign",
        "phone_number": f"555-000-90{suffix[:2].zfill(2)}",
        "birthdate": "1955-06-15",
        "medicare_number": "1EG4-TE5-MK73",
        "assigned_agent_id": agent_id,
    }
    r = owner.post(f"{API}/leads", json=payload)
    assert r.status_code == 200, r.text
    return r.json()["id"]


def _populate_state(owner, lead_id):
    """Add rich state to a lead so we can verify it's wiped."""
    # Note
    r = owner.post(f"{API}/leads/{lead_id}/notes", json={"note_text": "TEST_WIPE note - should be gone"})
    assert r.status_code == 200, r.text
    # Call log
    r = owner.post(f"{API}/leads/{lead_id}/call-logs",
                   json={"call_result": "Spoke With Lead", "notes": "will call back"})
    assert r.status_code == 200, r.text
    # Status → Appointment Set with appointment_at
    r = owner.patch(f"{API}/leads/{lead_id}", json={
        "lead_status": "Appointment Set",
        "appointment_at": "2026-03-15T14:00:00Z",
    })
    assert r.status_code == 200, r.text
    # Fill application_info + hra_info
    r = owner.patch(f"{API}/leads/{lead_id}", json={
        "application_info": {"carrier": "Aetna", "plan": "PPO Gold"},
        "hra_info": {"height": "5'10", "weight": "180"},
    })
    assert r.status_code == 200, r.text
    # Complete + enrolled + effective_date
    r = owner.patch(f"{API}/leads/{lead_id}", json={
        "lead_status": "Complete",
        "enrolled_carrier": "Aetna",
        "enrolled_plan": "PPO Gold",
        "effective_date": "2026-04-01",
    })
    assert r.status_code == 200, r.text


def _assert_wiped(owner, lead_id, expect_shared=False, expect_assigned_id=None):
    # Lead state
    r = owner.get(f"{API}/leads/{lead_id}")
    assert r.status_code == 200, r.text
    lead = r.json()
    assert lead["lead_status"] == "Uncalled", f"lead_status not reset: {lead['lead_status']}"
    assert lead.get("appointment_at") in (None, ""), f"appointment_at not cleared: {lead.get('appointment_at')}"
    assert lead.get("effective_date") in (None, ""), f"effective_date not cleared: {lead.get('effective_date')}"
    assert lead.get("completed_at") in (None, ""), f"completed_at not cleared: {lead.get('completed_at')}"
    assert lead.get("completed_by_user_id") in (None, ""), "completed_by_user_id not cleared"
    assert lead.get("enrolled_carrier") in (None, ""), f"enrolled_carrier not cleared: {lead.get('enrolled_carrier')}"
    assert lead.get("enrolled_plan") in (None, ""), f"enrolled_plan not cleared: {lead.get('enrolled_plan')}"
    assert lead.get("application_info") in (None, {}, ""), f"application_info not cleared: {lead.get('application_info')}"
    assert lead.get("hra_info") in (None, {}, ""), f"hra_info not cleared: {lead.get('hra_info')}"
    if expect_shared:
        assert lead.get("is_shared") is True
        assert lead.get("assigned_agent_id") in (None, "")
    elif expect_assigned_id is not None:
        assert lead.get("assigned_agent_id") == expect_assigned_id

    # Notes wiped
    r = owner.get(f"{API}/leads/{lead_id}/notes")
    assert r.status_code == 200
    assert r.json() == [], f"notes not wiped: {r.json()}"

    # Call logs wiped
    r = owner.get(f"{API}/leads/{lead_id}/call-logs")
    assert r.status_code == 200
    assert r.json() == [], f"call_logs not wiped: {r.json()}"

    # Activity: no PRE-transfer notes/calls; the only allowed entries are audits
    # emitted AFTER wipe (lead_assigned / status_changed to Uncalled). The old
    # notes/calls/status_changes must be gone.
    r = owner.get(f"{API}/leads/{lead_id}/activity")
    assert r.status_code == 200
    items = r.json()
    assert not any(i["type"] == "note" for i in items), f"old notes in activity: {items}"
    assert not any(i["type"] == "call" for i in items), f"old calls in activity: {items}"
    # If there are audit entries they must all be 'lead_assigned' or the current
    # 'status_changed' to Uncalled (no old status_changed → Complete /
    # Appointment Set etc.).
    for i in items:
        if i["type"] == "audit":
            if i["action"] == "status_changed":
                assert i.get("new") in ("Uncalled", None), (
                    f"stale status_changed audit still present: {i}"
                )


# ------------------------------------------------------------------
# Scenario A — Single PATCH reassignment
# ------------------------------------------------------------------
class TestPatchReassignmentWipe:
    def test_patch_reassign_wipes_everything(self, owner, agent1_id, agent2_id):
        lead_id = _make_lead(owner, agent1_id, suffix="A1")
        try:
            _populate_state(owner, lead_id)

            # Reassign to agent2
            r = owner.patch(f"{API}/leads/{lead_id}", json={"assigned_agent_id": agent2_id})
            assert r.status_code == 200, r.text
            body = r.json()
            assert body["assigned_agent_id"] == agent2_id

            _assert_wiped(owner, lead_id, expect_assigned_id=agent2_id)

            # A fresh lead_assigned audit AFTER wipe should be visible so the
            # receiving agent sees "Assigned to <newAgent>" in Activity.
            r = owner.get(f"{API}/leads/{lead_id}/activity")
            items = r.json()
            assigns = [i for i in items if i.get("type") == "audit" and i.get("action") == "lead_assigned"]
            assert len(assigns) >= 1, f"missing post-wipe lead_assigned audit: {items}"
            # And its new_value == the new agent
            assert any(a.get("new") == agent2_id for a in assigns), (
                f"post-wipe assign audit doesn't point to new agent: {assigns}"
            )
        finally:
            owner.delete(f"{API}/leads/{lead_id}")


# ------------------------------------------------------------------
# Scenario B — Bulk POST /api/leads/assign
# ------------------------------------------------------------------
class TestBulkAssignWipe:
    def test_bulk_assign_wipes_enrolled_fields(self, owner, agent1_id, agent2_id):
        ids = [_make_lead(owner, agent1_id, suffix=f"B{i}") for i in range(3)]
        try:
            for lid in ids:
                _populate_state(owner, lid)

            r = owner.post(f"{API}/leads/assign", json={"lead_ids": ids, "agent_id": agent2_id})
            assert r.status_code == 200, r.text
            assert r.json().get("modified") == 3

            for lid in ids:
                _assert_wiped(owner, lid, expect_assigned_id=agent2_id)
        finally:
            for lid in ids:
                owner.delete(f"{API}/leads/{lid}")


# ------------------------------------------------------------------
# Scenario C — POST /api/leads/round-robin
# ------------------------------------------------------------------
class TestRoundRobinWipe:
    def test_round_robin_wipes_enrolled_for_changed(self, owner, agent1_id, agent2_id):
        # All start on agent1 → round-robin between [agent2] so agent changes.
        ids = [_make_lead(owner, agent1_id, suffix=f"C{i}") for i in range(2)]
        try:
            for lid in ids:
                _populate_state(owner, lid)
            r = owner.post(f"{API}/leads/round-robin",
                           json={"lead_ids": ids, "agent_ids": [agent2_id]})
            assert r.status_code == 200, r.text
            for lid in ids:
                _assert_wiped(owner, lid, expect_assigned_id=agent2_id)
        finally:
            for lid in ids:
                owner.delete(f"{API}/leads/{lid}")


# ------------------------------------------------------------------
# Scenario D — POST /api/shared-leads/move
# ------------------------------------------------------------------
class TestSharedMoveWipe:
    def test_move_to_shared_wipes(self, owner, agent1_id):
        lead_id = _make_lead(owner, agent1_id, suffix="D1")
        try:
            _populate_state(owner, lead_id)
            r = owner.post(f"{API}/shared-leads/move", json={"lead_ids": [lead_id]})
            assert r.status_code == 200, r.text
            _assert_wiped(owner, lead_id, expect_shared=True)
        finally:
            owner.delete(f"{API}/leads/{lead_id}")


# ------------------------------------------------------------------
# Scenario E — POST /api/shared-leads/assign
# ------------------------------------------------------------------
class TestSharedAssignWipe:
    def test_shared_assign_wipes(self, owner, agent1_id, agent2_id):
        lead_id = _make_lead(owner, agent1_id, suffix="E1")
        try:
            # move to shared first (also populates via _populate_state)
            _populate_state(owner, lead_id)
            r = owner.post(f"{API}/shared-leads/move", json={"lead_ids": [lead_id]})
            assert r.status_code == 200, r.text
            # Now re-populate the shared lead with fresh state and assign
            # (the move already wiped; we want to ensure /shared-leads/assign
            # ALSO wipes any state added while the lead was in the pool).
            owner.post(f"{API}/leads/{lead_id}/notes",
                       json={"note_text": "TEST_WIPE shared pool note"})
            owner.post(f"{API}/leads/{lead_id}/call-logs",
                       json={"call_result": "No Answer", "notes": ""})
            owner.patch(f"{API}/leads/{lead_id}", json={
                "lead_status": "Complete",
                "enrolled_carrier": "Cigna",
                "enrolled_plan": "HMO",
                "effective_date": "2026-05-01",
            })

            r = owner.post(f"{API}/shared-leads/assign",
                           json={"lead_ids": [lead_id], "agent_id": agent2_id})
            assert r.status_code == 200, r.text
            _assert_wiped(owner, lead_id, expect_assigned_id=agent2_id)
            # Not shared anymore
            lead = owner.get(f"{API}/leads/{lead_id}").json()
            assert lead.get("is_shared") in (False, None)
        finally:
            owner.delete(f"{API}/leads/{lead_id}")


# ------------------------------------------------------------------
# Regression: fresh reassign (no prior state) still emits audits
# ------------------------------------------------------------------
class TestFreshReassignRegression:
    def test_reassign_no_prior_state(self, owner, agent1_id, agent2_id):
        lead_id = _make_lead(owner, agent1_id, suffix="R1")
        try:
            r = owner.patch(f"{API}/leads/{lead_id}", json={"assigned_agent_id": agent2_id})
            assert r.status_code == 200, r.text
            r = owner.get(f"{API}/leads/{lead_id}/activity")
            items = r.json()
            actions = {i.get("action") for i in items if i.get("type") == "audit"}
            assert "lead_assigned" in actions, f"missing lead_assigned audit: {items}"
        finally:
            owner.delete(f"{API}/leads/{lead_id}")


# ------------------------------------------------------------------
# Regression: owner-level metrics endpoints don't crash after wipes
# ------------------------------------------------------------------
class TestOwnerMetricsSurvive:
    def test_leaderboard_ok(self, owner):
        r = owner.get(f"{API}/leaderboard")
        assert r.status_code == 200, r.text

    def test_user_activity_history_ok(self, owner, agent1_id):
        r = owner.get(f"{API}/users/{agent1_id}/activity-history")
        assert r.status_code == 200, r.text
