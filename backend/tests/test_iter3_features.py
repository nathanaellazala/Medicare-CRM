"""Iteration 3 targeted tests (Jan 2026):

1. Timezone bug: PATCH /leads/{id} with effective_date '2026-07-01' must round-trip
   as exact '2026-07-01' (no UTC shift) via subsequent GET. Also tests 2026-01-01
   (year-boundary) and 2026-03-01 (DST-adjacent).
2. Bulk-delete: POST /leads/bulk-delete deletes multiple leads (owner only) and
   returns {deleted: N}. Non-owner must be rejected (401/403).
3. Effective Date on upload: /imports/preview auto-maps 'Effective Date' and its
   aliases (Effective, Coverage Effective, Policy Effective, Start Date) to
   effective_date. /imports/commit with default_lead_status=Complete lands each
   row with lead_status=Complete AND the exact effective_date string from the CSV.
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
PASSWORD = "Password123!"


# ---------------- fixtures ----------------
def _login(email, pw):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": pw}, timeout=20)
    assert r.status_code == 200, f"login {email} failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


def _client(token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s


@pytest.fixture(scope="module")
def owner_client():
    tok = _login(OWNER_EMAIL, PASSWORD)
    return _client(tok)


@pytest.fixture(scope="module")
def agent_client():
    tok = _login(AGENT1_EMAIL, PASSWORD)
    return _client(tok)


def _create_lead(oc, first="TEST_iter3", last="Client"):
    payload = {
        "first_name": f"{first}_{uuid.uuid4().hex[:6]}",
        "last_name": last,
        "phone_number": f"555020{uuid.uuid4().int % 10000:04d}",
    }
    r = oc.post(f"{API}/leads", json=payload)
    assert r.status_code == 200, r.text
    return r.json()["id"]


# ============================================================================
# 1. TIMEZONE BUG on server round-trip
# ============================================================================
class TestEffectiveDateRoundTrip:
    """PATCH /leads/{id} with a YYYY-MM-DD effective_date must be stored & returned
    as the exact same string (no timezone shift)."""

    @pytest.mark.parametrize("date_str", [
        "2026-07-01",  # the reported case
        "2026-01-01",  # year boundary
        "2026-03-01",  # DST-adjacent (US DST starts March 8, 2026)
        "2026-12-31",  # end-of-year
    ])
    def test_patch_and_get_preserves_date(self, owner_client, date_str):
        lead_id = _create_lead(owner_client)
        try:
            # PATCH with the target effective_date
            r = owner_client.patch(
                f"{API}/leads/{lead_id}",
                json={"effective_date": date_str},
            )
            assert r.status_code == 200, r.text
            body = r.json()
            assert body.get("effective_date") == date_str, (
                f"PATCH response shifted the date: expected {date_str} got {body.get('effective_date')}"
            )

            # GET the lead — must still be the exact same string
            r = owner_client.get(f"{API}/leads/{lead_id}")
            assert r.status_code == 200
            fetched = r.json()
            assert fetched.get("effective_date") == date_str, (
                f"GET returned a shifted date: expected {date_str} got {fetched.get('effective_date')}"
            )
        finally:
            owner_client.delete(f"{API}/leads/{lead_id}")

    def test_null_effective_date_accepted(self, owner_client):
        """Clearing effective_date should also work."""
        lead_id = _create_lead(owner_client)
        try:
            r = owner_client.patch(f"{API}/leads/{lead_id}", json={"effective_date": "2026-07-01"})
            assert r.status_code == 200
            r = owner_client.patch(f"{API}/leads/{lead_id}", json={"effective_date": None})
            assert r.status_code == 200
            assert r.json().get("effective_date") in (None, "")
        finally:
            owner_client.delete(f"{API}/leads/{lead_id}")


# ============================================================================
# 2. BULK-DELETE endpoint
# ============================================================================
class TestBulkDelete:
    def test_owner_can_bulk_delete(self, owner_client):
        ids = [_create_lead(owner_client, first="TEST_bulkdel") for _ in range(3)]
        r = owner_client.post(f"{API}/leads/bulk-delete", json={"lead_ids": ids})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("deleted") == 3, f"Expected deleted=3, got {body}"
        # Verify rows are gone
        for lid in ids:
            g = owner_client.get(f"{API}/leads/{lid}")
            assert g.status_code == 404, f"Lead {lid} still exists after bulk-delete"

    def test_empty_list_rejected(self, owner_client):
        r = owner_client.post(f"{API}/leads/bulk-delete", json={"lead_ids": []})
        assert r.status_code == 400

    def test_agent_forbidden(self, agent_client):
        r = agent_client.post(f"{API}/leads/bulk-delete", json={"lead_ids": ["fake-id"]})
        assert r.status_code in (401, 403), f"Non-owner should be forbidden, got {r.status_code}"


# ============================================================================
# 3. EFFECTIVE DATE on upload (auto-map + commit)
# ============================================================================
CSV_TEMPLATE = "First Name,Last Name,Phone Number,{header}\n"


def _make_csv(header_name, rows):
    """rows: list of (first, last, phone, date_str)"""
    lines = [CSV_TEMPLATE.format(header=header_name).strip()]
    for (f, l, p, d) in rows:
        lines.append(f"{f},{l},{p},{d}")
    return "\n".join(lines).encode()


def _upload_preview(oc, filename, content):
    files = {"file": (filename, content, "text/csv")}
    # Strip Content-Type header — requests will set multipart boundary
    s = requests.Session()
    s.headers.update({k: v for k, v in oc.headers.items() if k.lower() != "content-type"})
    r = s.post(f"{API}/imports/preview", files=files)
    assert r.status_code == 200, f"preview failed: {r.status_code} {r.text}"
    return r.json()


class TestEffectiveDateUpload:
    @pytest.mark.parametrize("header", [
        "Effective Date",
        "Effective",
        "Coverage Effective",
        "Policy Effective",
        "Start Date",
        "effective date",  # case-insensitive
    ])
    def test_auto_map_recognizes_effective_header(self, owner_client, header):
        content = _make_csv(header, [("TESTeff", "Client", "5559990001", "2026-08-15")])
        preview = _upload_preview(owner_client, "eff.csv", content)
        auto = preview.get("auto_mapping", {})
        # The auto-mapping key should be the original header string
        assert header in auto, f"header {header!r} not found in auto_mapping keys: {list(auto.keys())}"
        assert auto[header] == "effective_date", (
            f"Header {header!r} auto-mapped to {auto[header]!r}, expected 'effective_date'"
        )

    def test_commit_stores_effective_date_and_complete_status(self, owner_client):
        """End-to-end: upload wins CSV -> preview -> commit(default_lead_status=Complete)
        -> GET /leads?status=Complete and confirm effective_date matches CSV."""
        unique_phone = f"5559{uuid.uuid4().int % 1000000:07d}"
        content = _make_csv("Effective Date", [
            ("TESTupld", f"CliA_{uuid.uuid4().hex[:5]}", unique_phone, "2026-08-15"),
        ])
        preview = _upload_preview(owner_client, "wins.csv", content)
        assert preview["auto_mapping"].get("Effective Date") == "effective_date"

        commit_body = {
            "rows": preview["rows"],
            "mapping": preview["auto_mapping"],
            "duplicate_handling": "import_anyway",
            "assignment_method": "unassigned",
            "agent_ids": [],
            "lead_type": "New to Medicare",
            "file_name": preview.get("filename", "wins.csv"),
            "default_lead_status": "Complete",
        }
        r = owner_client.post(f"{API}/imports/commit", json=commit_body,
                              headers={"Content-Type": "application/json"})
        assert r.status_code == 200, r.text
        result = r.json()
        assert result["imported_rows"] >= 1, result

        # Locate the imported lead
        g = owner_client.get(f"{API}/leads", params={"status": "Complete", "q": unique_phone, "limit": 10})
        assert g.status_code == 200
        items = g.json().get("items", [])
        assert len(items) >= 1, f"Imported lead not found in Book of Business (Complete). items={items}"
        lead = items[0]
        assert lead["lead_status"] == "Complete"
        assert lead["effective_date"] == "2026-08-15", (
            f"Effective date stored as {lead['effective_date']!r}, expected '2026-08-15'"
        )
        # Cleanup
        owner_client.post(f"{API}/leads/bulk-delete", json={"lead_ids": [lead["id"]]},
                          headers={"Content-Type": "application/json"})
