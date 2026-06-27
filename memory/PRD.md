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
