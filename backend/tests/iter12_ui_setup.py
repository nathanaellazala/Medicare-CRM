# UI test data setup/teardown for iteration 12 (python iter12_ui_setup.py setup|teardown|hide|restore)
import os, sys, json, requests
B = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
F = "/tmp/iter12_ids.json"
ALL = ["birthdate", "phone_number", "address", "city", "state", "zip_code", "county",
       "medicare_number", "medicaid_number", "medicaid_provider", "medicare_parts", "lead_type"]

def login(e):
    s = requests.Session()
    r = s.post(f"{B}/api/auth/login", json={"email": e, "password": "Password123!"})
    t = r.json().get("access_token") or r.json().get("token")
    if t: s.headers["Authorization"] = f"Bearer {t}"
    return s, s.get(f"{B}/api/auth/me").json()

o, _ = login("owner@healthexpertscrm.com")
_, a1 = login("agent1@healthexpertscrm.com")
cmd = sys.argv[1]
if cmd == "setup":
    ids = {"agent1": a1["id"]}
    r = o.post(f"{B}/api/leads", json={"first_name": "TEST_UIa1", "last_name": "Zeta", "phone_number": "5555550111",
                                      "address": "1 UI St", "medicaid_provider": "UIOrig", "assigned_agent_id": a1["id"]})
    lid = r.json()["id"]; o.patch(f"{B}/api/leads/{lid}", json={"assigned_agent_id": a1["id"]})
    o.patch(f"{B}/api/leads/{lid}", json={"lead_status": "Complete"})
    ids["a1"] = lid
    r = o.post(f"{B}/api/leads", json={"first_name": "TEST_UIshared", "last_name": "Zeta", "phone_number": "5555550112",
                                      "medicaid_provider": "UISharedOrig"})
    sid = r.json()["id"]; o.patch(f"{B}/api/leads/{sid}", json={"is_shared": True, "assigned_agent_id": None})
    ids["shared"] = sid
    json.dump(ids, open(F, "w")); print(json.dumps(ids))
elif cmd == "hide":
    print(o.patch(f"{B}/api/users/{a1['id']}", json={"visible_fields": [f for f in ALL if f != "medicaid_provider"]}).status_code)
elif cmd in ("pool_on", "pool_off"):
    print(o.patch(f"{B}/api/users/{a1['id']}", json={"can_access_shared_pool": cmd == "pool_on"}).status_code)
elif cmd == "restore":
    print(o.patch(f"{B}/api/users/{a1['id']}", json={"visible_fields": ALL}).status_code)
elif cmd == "show":
    ids = json.load(open(F))
    for k in ("a1", "shared"):
        d = o.get(f"{B}/api/leads/{ids[k]}").json() if k == "a1" else o.get(f"{B}/api/shared-leads/{ids[k]}").json()
        print(k, d.get("medicaid_provider"), d.get("assigned_agent_id"), d.get("is_shared"))
elif cmd == "teardown":
    ids = json.load(open(F))
    for k in ("a1", "shared"): print(o.delete(f"{B}/api/leads/{ids[k]}").status_code)
    print(o.patch(f"{B}/api/users/{a1['id']}", json={"visible_fields": ALL}).status_code)
