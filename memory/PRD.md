# Health Experts CRM — Product Requirements & Status

## Problem Statement
Build a professional, Salesforce-inspired Medicare sales CRM called **Health Experts CRM** for a Medicare sales agency. Owner uploads lead spreadsheets, assigns leads to agents, agents work the leads (status updates, notes, manual call logging), owner monitors performance.

## User Personas & Roles
1. **Owner / Admin** — full visibility, manages agents, imports & assigns leads, owns reporting.
2. **Agent** — works only their assigned leads, logs calls, updates status, adds notes.

## Architecture
- **Backend:** FastAPI + MongoDB (Motor async). JWT auth (Bearer + httpOnly cookie). Single-file `server.py`.
- **Frontend:** React 19 + Tailwind + shadcn/ui + Recharts + lucide-react.
- **Auth:** Email/password JWT (12h access + 7d refresh). Bcrypt password hashing. Role-based dependencies (`require_owner`).
- **Database collections:** users, leads, notes, call_logs, audit_logs, import_batches, lead_statuses, company_settings.

## Demo Credentials
- Owner: `owner@healthexpertscrm.com` / `Password123!`
- Agents: `agent1-3@healthexpertscrm.com` / `Password123!`
- Seed: 1 owner + 3 agents + 50 fake leads + notes + call logs + 1 import batch + 16 statuses.

## Implemented (Feb 2026 — v1)
**Backend**
- `/api/auth/{login,logout,me,refresh}`
- `/api/users` CRUD (owner-only mutations), password reset
- `/api/leads` list+search+filter+sort+pagination (role-scoped), CRUD, bulk-status, assign, round-robin, CSV export
- `/api/leads/{id}/{notes,call-logs,activity}`
- `/api/imports/{preview,commit}` with column mapping, auto-detection, duplicate handling
- `/api/duplicates` + merge
- `/api/dashboard/{owner,agent}` with KPI cards, by-status, by-agent, funnel
- `/api/leaderboard` ranked by sold/appts/calls with conversion rate + rank
- `/api/statuses` CRUD, `/api/settings/company`
- Audit logs on all key actions

**Frontend**
- Login (split layout, demo accounts panel)
- Owner Dashboard (12 KPI cards, bar chart, donut, funnel, quick actions)
- Agent Dashboard (personal KPIs, quick start cards)
- Leads list (search, status/agent/sort filters, bulk select+assign+status, inline status dropdown)
- Lead Detail (overview, tabs: Activity / Notes / Calls, log-call dialog, copy-to-clipboard for phone/Medicare/Medicaid)
- Import wizard (3-step: upload → map → result) with round-robin agent picker
- Agents management (create, deactivate, reset password)
- Assign Leads page (round-robin + assign-all-to-one)
- Duplicates review (phone-based groups, merge action)
- Leaderboard (top-3 podium with gold/silver/bronze medals + table)
- Settings (company profile, statuses CRUD, my profile)

## Test Coverage
- Backend: 29/29 pytest tests passing (`/app/backend/tests/test_crm_backend.py`)
- Frontend: owner & agent flows smoke-tested via Playwright (login → dashboard → leads → detail)

## Deferred to v2 (prioritized backlog)
**P0**
- Advanced Reports page (status report, agent performance, import batch, sold, appointments) with CSV export
- Brute-force lockout & rate limiting on `/api/auth/login`
- Notification bell with new-assigned-lead alerts

**P1**
- Saved filters
- Recently viewed leads
- Pinned notes UI + edit notes
- Dark mode toggle
- Import history page
- Agent activity timeline

**P2**
- HIPAA-style compliance hardening (field-level audit, encryption at rest config)
- Bulk export of filtered reports
- Status color customization
- Owner CORS tightened with cookie auth (currently localStorage Bearer)
- Split `server.py` into routers as feature surface grows

## Next Action Items (next iteration)
1. Build Reports page with CSV export
2. Add brute-force lockout per playbook spec
3. Add notification bell with badge count
4. Implement saved filters + recently viewed leads

---

## Iteration 2 — Feature Round (Feb 2026)
Delivered based on user feedback:
1. **Idle auto-logout** — Layout.jsx tracks mousemove/keydown/click/scroll. Sends `POST /api/users/me/heartbeat` every 60s; after 30 min of no activity, calls `logout()` and redirects to `/login`.
2. **Lead Type field** (`New to Medicare` / `Transfer`) — added to Lead model, `lead_type` filter on `/api/leads`, colored badge in table, dropdown editor on Lead Detail, mapping option in Import wizard.
3. **On/off leaderboard toggle** — `on_leaderboard` bool on users. Owner toggles from Agents page; hidden agents excluded from `/api/leaderboard` results.
4. **Movement arrows** — Leaderboard computes prev-period ranks and returns `movement` (up/down/same/new) + `rank_change` integer. Shown next to each agent.
5. **No calls column on leaderboard** — sort now sold → appts → conversion; calls hidden.
6. **Daily/Weekly/Monthly periods + prev-period nav** — `/api/leaderboard?period=today|week|month&offset=N`. Frontend has tabs + prev/next buttons + human label ("Week of Jul 06, 2026", "June 2026", etc.).
7. **Redesigned leaderboard** — Top-3 podium (2nd–1st–3rd staggered heights, gold/silver/bronze gradients, huge outline rank number), agents-competing/total-sold/total-appts strip, sales-progress bars scaled to leader, flame icon for #1, movement indicators inline.
8. **Removed Medicare/Medicaid Number** — dropped from Leads table columns, Lead Detail fields, Import mapping targets, search placeholders, and Leaderboard.

Backend fields retained silently for backward compat with prior imports (no UI surfaces them).

## Deferred (still v2 backlog)
- Reports page with CSV export
- Brute-force lockout & rate limiting on login
- Notification bell with new-assigned-lead alerts
- Saved filters, dark mode, pinned-notes UI, import history page

---

## Iteration 10 — Search / Persistence / Plan Selection (Feb 28, 2026)
Delivered based on user feedback:
1. **Universal lead search** — `/api/leads?q=` now matches across full_name, first/last, medicare_number, medicaid_number, address, city, state, zip_code, county, lead_status, medicaid_provider, medicare_parts, enrolled_carrier, enrolled_plan, and normalized_phone_number. Same coverage on `/api/shared-leads`. Placeholder updated in Leads.jsx.
2. **Filters persist across navigation** — every filter (q, status, agent, type, sort, sortCol, sortDir, per-column city/zip/state/county/medicaid_provider) is now synced to the URL. Reads back from URL on mount so navigating back always restores the same view.
3. **No refresh on Back** — new `useListCache` hook caches items+total in `sessionStorage` per pathname+search. On POP navigation the list paints instantly from cache and refreshes silently in the background — no loading spinner, height doesn't collapse, scroll restore stays accurate.
4. **Plan selection when marking Complete** — status → Complete now opens a dialog that requires Carrier + Plan (from `/api/carriers`, freetext fallback) and optional effective_date. Saved to new `enrolled_carrier` / `enrolled_plan` fields. Quick-status Complete on the list row navigates to `/leads/{id}?complete=1` which auto-opens the dialog.
5. **Editable enrolled plan** — LeadDetail shows an Enrolled Plan section with an Add/Change plan link that opens the same picker for post-hoc edits.
6. **Appointments survive status changes** — appointment_at is only cleared on reassignment. The purple appointment badge now renders whenever `appointment_at` is set (with "· scheduled" suffix when status is not Appointment Set).
7. **Call button** — LeadDetail header has a green Call button with `tel:` link (sanitized phone number) shown only when phone exists.

**Files touched**
- `backend/server.py` — q-search or_clauses expanded; LeadIn/LeadUpdateIn get enrolled_carrier/enrolled_plan; reassignment wipe includes both.
- `frontend/src/lib/useScrollRestore.js` — added `useListCache`; URL search included in scroll key.
- `frontend/src/pages/Leads.jsx` — cache-first init; silent refresh on mount; per-column filters synced to URL; quickStatus Complete redirects to detail.
- `frontend/src/pages/LeadDetail.jsx` — Call button; Complete dialog; Change-plan dialog; unconditional appointment badge; ?complete=1 handler.

**Test coverage**
- Backend: `/app/backend/tests/test_iter10_features.py` — 10/10 pass.
- Frontend: 7/7 Playwright flows pass (iteration_10.json).

