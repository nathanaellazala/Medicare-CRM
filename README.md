# Health Experts CRM

A full-stack customer relationship management application designed around healthcare sales-team workflows: lead intake, assignment, agent activity, reporting, and administration.

> **Portfolio / source-code project.** This repository is not presented as a security-certified or HIPAA-compliant product. Do not use it with real patient/customer information without a separate security, privacy, deployment, and compliance review.

## What it includes

- **Owner and agent experiences:** Separate authenticated dashboards and role-aware navigation.
- **Lead management:** Create, view, update, filter, assign, and export lead records.
- **Assignment workflows:** Manual assignment, round-robin distribution, and shared lead-pool operations.
- **Import and data quality:** CSV/spreadsheet intake with preview/commit endpoints, duplicate detection, and merge functionality.
- **Agent activity:** Notes, call logs, appointments, activity history, and leaderboards.
- **Business configuration:** Lead statuses, carriers and plans, reporting, and company settings.
- **Backend tests:** Python test modules covering authentication, role permissions, leads, imports, assignments, and subsequent feature iterations.

These capabilities are represented in the checked-in source code; they are **not** a claim that every feature has been independently verified in a fresh deployment.

## Tech stack

| Layer | Technology |
| --- | --- |
| Frontend | React, JavaScript, React Router, Tailwind CSS, Radix UI components |
| Backend | Python, FastAPI, Pydantic |
| Data | MongoDB with Motor (async driver) |
| Authentication | JWT-based authentication and role-based access checks |
| Tests | pytest, requests, existing API integration test modules |

## Architecture

```text
React application (frontend/)
       |
       | HTTP requests
       v
FastAPI REST API (backend/server.py)
       |
       v
MongoDB
```

Selected API areas include `/api/auth`, `/api/users`, `/api/leads`, `/api/imports`, `/api/duplicates`, `/api/shared-leads`, `/api/dashboard`, and `/api/leaderboard`.

## Explore the code

- [Backend routes and business logic](backend/server.py)
- [Frontend routes and role-aware navigation](frontend/src/App.js)
- [API client](frontend/src/lib/api.js)
- [Backend tests](backend/tests)
- [Lead-import screen](frontend/src/pages/ImportLeads.jsx)
- [Owner dashboard](frontend/src/pages/OwnerDashboard.jsx)

## Local development

**Prerequisites:** Python, Node.js, Yarn (the frontend declares Yarn 1), and a running MongoDB instance.

### Backend

Create `backend/.env` with **locally generated, unique** values:

```dotenv
MONGO_URL=mongodb://127.0.0.1:27017
DB_NAME=health_experts_crm_dev
JWT_SECRET=replace-with-a-long-random-local-secret
# Only for isolated HTTP localhost development; use true with HTTPS:
COOKIE_SECURE=false
```

Then:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn server:app --reload --port 8000
```

The backend's dependency list includes environment-specific packages; installation has **not** been independently verified in a clean environment. Provisioning owner accounts safely also requires review before exposing the app.

### Frontend

Create `frontend/.env.local`:

```dotenv
REACT_APP_BACKEND_URL=http://localhost:8000
```

Then:

```bash
cd frontend
yarn install
yarn start
```

The frontend runs locally using its declared `craco start` script. Check your environment's CORS settings if frontend and backend run on different origins.

## Tests

Backend test modules live in [`backend/tests/`](backend/tests/). They are written as API integration tests and expect a configured running backend, seeded test fixtures, and appropriately provisioned test accounts.

```bash
cd backend
python3 -m pytest tests/
```

**Do not run this suite against production:** some tests modify records. It has not been run as part of this documentation update.

## Security and privacy notes

- Never commit `.env` files, JWT secrets, database connection strings, or real customer/healthcare records.
- Use synthetic data for screenshots, demonstrations, and test accounts.
- Review account bootstrap behavior, authentication/cookie settings, permissions, data handling, and deployment configuration before any public or real-world deployment.
- If previously published credentials were ever active, rotate them; removing them from the current file does not remove them from Git history.

## Next improvements

- [ ] Add sanitized screenshots of the owner dashboard and lead-assignment workflow.
- [ ] Document a repeatable, isolated local demo with synthetic data.
- [ ] Add CI to run safe unit tests and quality checks.
- [ ] Review security-sensitive startup and session handling before deployment.
- [ ] Record architecture decisions and tradeoffs.

---

Built as a practical software project focused on turning complex team workflows into usable tools.

### Offline session regression checks

Install the minimal backend imports (FastAPI, Motor/PyMongo, PyJWT, bcrypt, pandas, python-dotenv, python-multipart, email-validator), then run `cd backend && python -m unittest discover -s security_tests -v`. These tests replace database reads with synthetic mocks and do not run application startup. They do not verify database ACLs, deployed cookies, token revocation, or browser behavior.

Cookies default to Secure; set `COOKIE_SECURE=false` only for isolated HTTP localhost development. Existing bearer-token clients still use browser local storage; refresh rotation and session revocation require further design.
