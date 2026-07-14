# Rules & Context for AI Assistant (Cursor / Other LLMs)

> **Read this entire file before touching any code.**
> This document describes the full platform architecture, database schema, access control system,
> known issues, and the tasks you need to complete. Do NOT guess — read the source files first.

---

## 0. Non-Negotiable Rules (Charter) — read before anything else

> **Charter:** These items are hard constraints, not suggestions. Every change must stay compatible with them.

These rules override convenience, “quick fixes,” and guesses. If a task conflicts with them, **stop and ask**.

### 0.1 Do not break CDefApp (Deficiency app)

- **CDefApp is live and working.** Treat it as **read-only / non-regressing** unless the product owner explicitly approves a coordinated change.
- **Absolute path on disk:**
  `/Users/hosseinasgari/Developer/CdefiApp/CDefApp`
- Do **not** refactor, “clean up,” or rewrite CDefApp code as drive-by work.
- Do **not** change shared `public.*` tables or RLS in ways that can break CDefApp queries, mobile app, or admin flows.

### 0.2 All development happens in the Time Clock project

- **All new features and routine code changes** go under the Time Clock workspace:
  `/Users/hosseinasgari/Developer/Time Clock`
- Time Clock backends/frontends (`timeclock-api`, `timeclock-app`, `timeclock-admin`) and **`Time Clock/migrations/`** are the primary places to implement product work.

### 0.3 Database discipline (shared Supabase Postgres)

- **One database** for both apps. Any change can affect CDefApp.
- Prefer **additive** migrations (new tables/columns, safe defaults), executed in order, documented in `migrations/`.
- **Never** “hand-edit” production schema, ad-hoc renames, or destructive changes without a **backup**, a **rollback plan**, and confirmation that **CDefApp** still works.
- **Do not** guess column meanings or drop constraints — read existing migrations and `timeclock-api/app/models/` first.
- Shared tables (`public.users`, `public.memberships`, `public.projects`, `public.roles`, budget tables, `public.app_subscriptions`, …) are **especially sensitive**; treat every change as cross-app.

### 0.4 Product direction (single identity, multi-module)

- **One user record** should serve **all apps and modules** (Deficiency, Time Clock, future modules). Onboarding new modules should mean **subscription + permissions**, not duplicate accounts per product.
- **Do not** introduce a second parallel user system without an explicit product decision.

### 0.5 How this ties to the rest of this document

- Sections **3** (schema), **11** (do not break), and **14** (gotchas) **reinforce** this charter — they are not softer alternatives.

---

## 1. Platform Overview

This is a **multi-app SaaS platform** built by Constralabs. There are currently **two live apps** sharing
one Supabase PostgreSQL database:

| App | Folder (on this machine) | Purpose |
|-----|--------------------------|---------|
| **CDefApp** (Deficiency App) | `/Users/hosseinasgari/Developer/CdefiApp/CDefApp` | Construction deficiency tracking — issues, tasks, plans, comments (**do not break**; see §0) |
| **Time Clock** | `/Users/hosseinasgari/Developer/Time Clock` | Worker time tracking — clock in/out, payroll, leave, approvals (**primary dev tree**; see §0) |

Both apps run against the **same Supabase project** (`nedljlorkpwpacuphqwb`).

---

## 2. Repository Structure

```
/Developer/
├── CDefApp/                        ← Deficiency App (React Native / Expo + FastAPI)
│   ├── backend/                    ← FastAPI backend
│   └── mobile/                     ← React Native (Expo) mobile app
│
└── Time Clock/                     ← Time Clock Platform
    ├── timeclock-api/              ← FastAPI backend (Python 3.13, SQLAlchemy 2)
    │   ├── app/
    │   │   ├── main.py
    │   │   ├── auth.py             ← Supabase JWT verification
    │   │   ├── config.py           ← env vars via pydantic Settings
    │   │   ├── database.py         ← SQLAlchemy session
    │   │   ├── middleware/
    │   │   │   └── subscription.py ← require_subscription(), require_role(), get_user_role()
    │   │   ├── models/
    │   │   │   ├── shared.py       ← mirrors public.* tables (User, Company, Membership, Role...)
    │   │   │   └── time_clock.py   ← mirrors time_clock.* tables
    │   │   ├── routers/
    │   │   │   ├── entries.py      ← clock in/out, my entries, active entry, manual entry
    │   │   │   ├── approvals.py    ← manager approval of time entries
    │   │   │   ├── leave.py        ← leave types, requests, balances, review
    │   │   │   ├── team.py         ← worker-manager assignments, team entries
    │   │   │   ├── reports.py      ← payroll report + Excel export
    │   │   │   ├── budget_codes.py ← budget code list, time adjustment requests
    │   │   │   ├── rates.py        ← worker hourly rates
    │   │   │   ├── settings.py     ← company settings (timezone, currency...)
    │   │   │   └── ai.py           ← Gemini AI work description analysis
    │   │   └── services/
    │   │       ├── payroll.py      ← payroll calculation + summarize by worker/project/budget/division
    │   │       └── excel_export.py ← 5-sheet Excel workbook generation
    │   └── tests/                  ← pytest, SQLite in-memory, 50 tests all passing
    │
    ├── timeclock-app/              ← Worker Mobile App (React + Vite, runs in browser/mobile)
    │   └── src/
    │       ├── App.tsx             ← Auth context, fetchProfile (users + memberships)
    │       ├── lib/api.ts          ← all API calls → real backend only (no mock data)
    │       └── screens/
    │           ├── ClockScreen.tsx ← clock in/out + iOS drum picker + AI analyze
    │           ├── HistoryScreen.tsx
    │           ├── LeaveScreen.tsx
    │           ├── ManualEntryScreen.tsx
    │           └── ProfileScreen.tsx
    │
    └── timeclock-admin/            ← Admin Panel (React + Vite)
        └── src/
            ├── App.tsx             ← Auth context for admin
            ├── lib/api.ts          ← all API calls → real backend only (no mock data)
            ├── index.css           ← ChatGPT/Cursor dark+light theme
            └── pages/
                ├── DashboardPage.tsx
                ├── WorkersPage.tsx
                ├── ApprovalsPage.tsx
                ├── BudgetCodesPage.tsx
                ├── LeavePage.tsx
                ├── ReportsPage.tsx
                └── SettingsPage.tsx
```

> **Note:** The diagram is schematic. **Authoritative absolute paths** for each repo are in **§0 (Charter)**.

---

## 3. Database Schema

### Two Schemas

| Schema | Owner | Purpose |
|--------|-------|---------|
| `public` | Shared by ALL apps | Users, companies, memberships, roles, projects, budget codes, subscriptions |
| `time_clock` | Time Clock app only | Time entries, approvals, leave, rates, settings |

> ⚠️ **CRITICAL:** Never alter `public.*` tables in a way that breaks CDefApp.
> CDefApp uses: `public.users`, `public.memberships`, `public.roles`, `public.companies`,
> `public.projects`, `public.issues`, `public.tasks`, `public.comments`, `public.plans`,
> `public.budget_codes`, `public.budget_categories`, `public.divisions`

---

### `public.users`
```
id                   uuid PK
email                varchar NOT NULL
first_name           varchar
last_name            varchar
role                 user_role_enum NOT NULL   ← enum: worker | manager | admin
is_superadmin        boolean                   ← true = platform owner, full access everywhere
has_leave_access     boolean NOT NULL
has_report_access    boolean NOT NULL
has_team_report_access boolean NOT NULL
is_active            boolean
created_at / updated_at / deleted_at
```

### `public.companies`
```
id, name, subscription_status, settings (jsonb), is_active
address, tax_code, max_users, max_projects
created_at / updated_at / deleted_at
```

### `public.memberships`
```
id             uuid PK
user_id        → public.users.id
company_id     → public.companies.id
project_id     → public.projects.id (optional)
role_id        → public.roles.id
permissions_override  jsonb
created_at / updated_at / deleted_at
```

### `public.roles`
```
id           uuid PK
key          varchar   ← role key string (see below)
name         varchar
company_id   uuid (optional — company-scoped role)
project_id   uuid (optional — project-scoped role)
permissions  jsonb
```

**Role keys currently in DB** (mixed conventions — legacy):
- `admin`, `ADMIN` → Administrator
- `super_admin` → Super Administrator
- `SITE_SUPER`, `SITE_SUPERVISOR` → Site Supervisor
- `ISSUE_EDITOR`, `ISSUE_OFFICER` → Issue roles (CDefApp only)
- `CLIENT_OWNER` → Client/Owner
- `TRADE_SUB` → Skilled Trade
- `PROJECT_ADMIN` → Project Admin

> ⚠️ Time Clock does NOT use `roles.key` directly for access control.
> It uses `users.role` enum (worker/manager/admin) + `users.is_superadmin`.
> See Section 4 for details.

### `public.app_subscriptions`
```
id           uuid PK
company_id   → public.companies.id
app_key      app_key_enum:  DEFICIENCY | TIME_CLOCK
status       subscription_status_enum: ACTIVE | TRIAL | SUSPENDED | CANCELLED
plan_tier    plan_tier_enum: FREE | STARTER | PRO | ENTERPRISE
started_at, expires_at
```

> Every company must have an `app_subscriptions` row with `app_key='TIME_CLOCK'` and
> `status IN ('ACTIVE','TRIAL')` to use the Time Clock app.

### `public.budget_codes` hierarchy
```
public.divisions
  └── public.budget_categories  (division_id → divisions.id)
        └── public.budget_codes (category_id → budget_categories.id)
```
All three tables have `company_id` (nullable = global/shared).

### `public.projects`
```
id, name, address, status, company_id, latitude, longitude
created_at / updated_at / deleted_at
```

---

### `time_clock.time_entries`
```
id           uuid PK
company_id   → public.companies.id
project_id   → public.projects.id
user_id      → public.users.id
clock_in     timestamptz
clock_out    timestamptz
user_timezone text
work_date    date
entry_type   enum: CLOCK | MANUAL
manual_reason enum (nullable)
description  text
status       enum: ACTIVE | SUBMITTED | APPROVED | REJECTED
break_minutes integer
budget_code_id → public.budget_codes.id (nullable, set by AI)
ai_summary   text
created_at / updated_at / deleted_at
```

### `time_clock.time_entry_approvals`
```
id, company_id, time_entry_id → time_entries.id
approver_user_id → public.users.id
result       enum: APPROVED | REJECTED
notes        text
created_at
```

### `time_clock.time_adjustments`
```
id, company_id, time_entry_id → time_entries.id
requested_by → public.users.id
adjustment_type enum: CLOCK_IN | CLOCK_OUT | BOTH
original_clock_in / original_clock_out
requested_clock_in / requested_clock_out
reason       text
status       enum: PENDING | APPROVED | REJECTED
reviewed_by → public.users.id
reviewed_at, review_note
created_at / updated_at / deleted_at
```

### `time_clock.worker_managers`
```
id, company_id, project_id
worker_user_id  → public.users.id
manager_user_id → public.users.id
created_at, deleted_at
```
This table defines who manages whom. A manager can only approve entries of their assigned workers.

### `time_clock.worker_rates`
```
id, company_id, user_id → public.users.id
project_id (optional)
hourly_rate  numeric
currency     enum
effective_from date, effective_to date (nullable = current)
```

### `time_clock.leave_types`
```
id, company_id (nullable = global), name
default_days_per_year, is_unlimited, is_active
```

### `time_clock.leave_requests`
```
id, company_id, user_id, leave_type_id
start_date, end_date
status enum: PENDING | APPROVED | REJECTED
notes, reviewed_by_user_id, reviewed_at
```

### `time_clock.company_settings`
```
id, company_id (unique)
timezone, default_currency
break_tracking_enabled, overtime_requires_approval
working_hours_start, working_hours_end
```

---

## 4. Access Control System

### How it works

**Step 1 — Subscription check** (every endpoint):
```python
require_subscription(company_id, db)
# Raises 422 if company_id is empty
# Raises 403 if no ACTIVE/TRIAL TIME_CLOCK subscription exists
```

**Step 2 — Role check** (manager-only endpoints):
```python
require_role(user_id, company_id, MANAGER_ROLES, db)
```

**`get_user_role()` logic** (in `middleware/subscription.py`):
```python
# Priority 1: users.role == 'admin' OR is_superadmin == True → returns "ADMIN"
# Priority 2: memberships → roles.key
# Priority 3: 403 if no membership
```

**`MANAGER_ROLES`** (in approvals.py and leave.py):
```python
MANAGER_ROLES = ["OWNER", "ADMIN", "MANAGER", "admin", "super_admin", "manager"]
```

### User roles (users.role enum)

| role | Access |
|------|--------|
| `worker` | Mobile app only — clock in/out, history, leave requests, profile |
| `manager` | Mobile app + some admin features (has_leave_access, has_report_access) |
| `admin` | Full admin panel access — all pages |

### `is_superadmin = true`
- Full access to all companies
- `get_user_role()` returns `"ADMIN"` regardless of membership
- **Currently only:** `asgari@thepersa.com`

### `has_*_access` flags (on users table)
| Flag | Effect |
|------|--------|
| `has_leave_access` | Can see Leave section in mobile app |
| `has_report_access` | Can see Reports section in mobile app |
| `has_team_report_access` | Can see team entries in admin |

### Test Accounts (local dev)

| Email | Password | Role | Company |
|-------|----------|------|---------|
| `asgari@thepersa.com` | (existing) | admin + is_superadmin | The Persa + Arevaliving + Ace |
| `worker@thepersa.com` | `Worker1234!` | worker | The Persa |

---

## 5. Authentication

- **Provider:** Supabase Auth (hosted)
- **JWT algorithm:** ECC P-256 (NOT HS256 — Supabase upgraded, PyJWT cannot verify locally)
- **Verification method:** `supabase.auth.get_user(token)` — calls Supabase API, no local secret needed
- **File:** `timeclock-api/app/auth.py`
- **Same pattern used in CDefApp backend**

```python
# DO NOT use PyJWT or jwt.decode() — it will fail with ECC P-256 tokens
# ALWAYS use:
response = supabase_client.auth.get_user(token)
user = response.user
```

---

## 6. API

- **Base URL (local):** `http://localhost:8000`
- **All routes prefixed:** `/api/v1/`
- **Auth header:** `Authorization: Bearer <supabase_jwt>`
- **All endpoints require:** valid JWT + active TIME_CLOCK subscription

### Route map
```
POST   /api/v1/entries/clock-in
POST   /api/v1/entries/clock-out
GET    /api/v1/entries/active?company_id=
GET    /api/v1/entries/my?company_id=
POST   /api/v1/entries/manual

GET    /api/v1/approvals/pending?company_id=    ← manager only
POST   /api/v1/approvals/review                 ← manager only

GET    /api/v1/budget-codes?company_id=
POST   /api/v1/budget-codes/request-adjustment

GET    /api/v1/leave/types?company_id=
GET    /api/v1/leave/balance?company_id=
POST   /api/v1/leave/request
GET    /api/v1/leave/requests?company_id=       ← manager only
POST   /api/v1/leave/review                     ← manager only

GET    /api/v1/team/members?company_id=
POST   /api/v1/team/assign-manager
POST   /api/v1/team/remove-manager
GET    /api/v1/team/managers?company_id=&worker_user_id=
GET    /api/v1/team/entries?company_id=&manager_user_id=&start_date=&end_date=

GET    /api/v1/reports/payroll?company_id=&start_date=&end_date=
GET    /api/v1/reports/export-excel?company_id=&start_date=&end_date=

GET    /api/v1/settings/{company_id}
PUT    /api/v1/settings/{company_id}

GET    /api/v1/rates?company_id=&user_id=
POST   /api/v1/rates

POST   /api/v1/ai/analyze
```

---

## 7. Frontend

### API clients
`timeclock-app` and `timeclock-admin` **`src/lib/api.ts`** call **`VITE_API_BASE_URL`** only — there is **no client-side mock dataset**; testing uses the real API and database.

### Local ports
```
timeclock-api   → http://localhost:8000
timeclock-app   → http://localhost:5174
timeclock-admin → http://localhost:5175
```

### Admin panel theme
- Dark mode default: `#212121` bg, `#10a37f` primary (ChatGPT/Cursor style)
- Light mode: `[data-theme="light"]` on `document.documentElement`
- Toggle saved to `localStorage`

---

## 8. AI Integration (Gemini)

- **Model:** `gemini-3.1-flash-lite-preview` (env: `GEMINI_MODEL`)
- **Used in:** `timeclock-api/app/routers/ai.py`
- **Endpoint:** `POST /api/v1/ai/analyze`
- **Input:** work description + company_id + optional project/duration
- **Output:** `{ budget_code_id, budget_code, budget_code_name, summary }`
- Gemini receives the full list of company budget codes and returns the best match by ID

---

## 9. Tasks To Complete

### TASK 1 — AI Bulk Budget Code Import (HIGH PRIORITY)
**What:** Add "Import with AI" feature to BudgetCodesPage in admin panel.

**User story:** Admin pastes raw text (up to 2000 lines — could be copy-paste from spreadsheet,
any format) → Gemini parses it → preview table shown → admin confirms → bulk insert to DB.

**Files to modify:**
- `timeclock-admin/src/pages/BudgetCodesPage.tsx` — add Import button + modal
- `timeclock-admin/src/lib/api.ts` — add `importBudgetCodesWithAI()` function
- `timeclock-api/app/routers/ai.py` — add `POST /api/v1/ai/parse-budget-codes` endpoint
- `timeclock-api/app/routers/budget_codes.py` — add `POST /api/v1/budget-codes/bulk` endpoint

**Backend logic for parse endpoint:**
```python
# Input: { raw_text: str, company_id: str }
# 1. Send raw_text to Gemini with prompt:
#    "Parse the following text into a list of budget codes.
#     Each item should have: code (string), name (string),
#     category (string or null), division (string or null).
#     Return JSON array only."
# 2. Validate returned JSON
# 3. Return parsed list — do NOT insert yet (preview step)

# Output: [{ code, name, category, division }, ...]
```

**Bulk insert endpoint:**
```python
# Input: { company_id: str, items: [{ code, name, category_id?, division_id? }] }
# - Find or create division by name
# - Find or create budget_category by name under that division
# - Insert budget_code rows
# - Return { inserted: N, errors: [...] }
```

**Frontend modal flow:**
1. Click "Import with AI" button (next to existing "+ Add Code")
2. Modal opens with large textarea + "Parse with AI" button
3. Loading state while Gemini processes
4. Preview table: columns = Code | Name | Category | Division | (delete row)
5. "Import N codes" confirm button
6. Success toast + table refresh

---

### TASK 2 — Super Admin Panel (MEDIUM PRIORITY)
**What:** A separate view/page that only `is_superadmin=true` users can access.
Shows all companies, all users, which user has access to which app.

**Location:** New page in `timeclock-admin/src/pages/SuperAdminPage.tsx`

**Features:**
- List all companies with their `app_subscriptions` status per app (DEFICIENCY, TIME_CLOCK)
- For each company: list members with their `users.role` and `memberships.role_id → roles.key`
- Ability to toggle subscription status (ACTIVE/SUSPENDED)
- Ability to change a user's `users.role` (worker/manager/admin)
- Ability to set `is_superadmin` flag

**Guard:** Check `is_superadmin` from auth context. If false, redirect to dashboard.

---

### TASK 3 — Fix Role Inconsistency (LOW PRIORITY — do after Task 1 & 2)
**Problem:** The `public.roles` table has duplicate/inconsistent keys:
- `admin` and `ADMIN` both exist (should be one)
- `super_admin` exists as roles.key but `user_role_enum` doesn't have it
- `SITE_SUPER` and `SITE_SUPERVISOR` both exist

**What NOT to do:** Don't delete or rename roles — CDefApp depends on them.

**What to do:**
- In `timeclock-api/app/middleware/subscription.py`, the `get_user_role()` function
  already handles this by checking `users.role` and `is_superadmin` first.
- Document which roles are CDefApp-only and should never be checked in Time Clock.

---

### TASK 4 — Worker-Manager Assignment UI (MEDIUM PRIORITY)
**Problem:** `time_clock.worker_managers` table exists and the API endpoints exist,
but the admin UI in WorkersPage doesn't have a way to assign a manager to a worker.

**File:** `timeclock-admin/src/pages/WorkersPage.tsx`

**What to add:**
- In the worker detail/edit panel, add a "Manager" dropdown
- Populated from `GET /api/v1/team/managers?company_id=`
- On change: call `POST /api/v1/team/assign-manager`
- Show current manager name next to worker in the list

---

## 10. What Has Already Been Done (Do NOT redo)

- ✅ Supabase JWT auth fixed — uses `supabase.auth.get_user(token)` (ECC P-256 compatible)
- ✅ `company_id` empty string bug fixed — `require_subscription` raises 422 on empty
- ✅ `fetchProfile` in mobile app now fetches `company_id` from `memberships` table
- ✅ iOS drum picker (UIPickerView style) in ClockScreen time adjustment
- ✅ Admin panel redesigned with ChatGPT/Cursor dark+light theme
- ✅ Frontends use real API only (mock paths removed from `lib/api.ts`)
- ✅ 50 pytest tests — all passing
- ✅ 5-sheet Excel export (Detail, By Worker, By Project, By Budget Code, By Division)
- ✅ Gemini AI returns `budget_code_id` + matched code (not free-form tags)
- ✅ `app_subscriptions` rows inserted for all 3 companies (The Persa, Arevaliving, Ace)
- ✅ `asgari@thepersa.com` set as `role=admin` + `is_superadmin=true`
- ✅ `worker@thepersa.com` created with password `Worker1234!` for testing

---

## 11. Key Things To NOT Break

1. **Never alter CDefApp's `public.*` tables** — issues, tasks, comments, plans, memberships, roles
2. **Never use `jwt.decode()` or PyJWT** for auth — Supabase uses ECC P-256
3. **Do not reintroduce client-side API mocks** — use the running backend and DB for tests
4. **Never hardcode company_id or user_id** — always pass from auth context
5. **`public.roles.key` is case-sensitive** — `admin` ≠ `ADMIN` in PostgreSQL varchar
6. **`user_role_enum`** only allows: `worker`, `manager`, `admin` — nothing else
7. **Always run `pytest tests/`** after any backend change — must stay 50/50 green

---

## 12. How to Run Locally

```bash
# Backend
cd "Time Clock/timeclock-api"
source venv/bin/activate
uvicorn app.main:app --reload --port 8000

# Mobile App
cd "Time Clock/timeclock-app"
npm run dev   # → http://localhost:5174

# Admin Panel
cd "Time Clock/timeclock-admin"
npm run dev   # → http://localhost:5175
```

**Environment files** (already configured, do not change):
- `timeclock-api/.env` — DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY
- `timeclock-app/.env` — VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_API_BASE_URL
- `timeclock-admin/.env` — same pattern

---

## 13. CDefApp Backend — Do Not Touch But Know It Exists

CDefApp has its own FastAPI backend at `/CDefApp/backend/`. It uses the same Supabase project
and the same `public.*` tables. Before doing anything with shared tables, check if CDefApp uses them.

**CDefApp auth pattern** (same as Time Clock — copy this, don't invent):
```python
response = supabase_client.auth.get_user(token)
user = response.user
```

**CDefApp does NOT use `time_clock.*` schema at all** — those tables are Time Clock exclusive.

---

## 14. Known Bugs / Gotchas

1. **`worker@thepersa.com` has no `has_leave_access`** — leave section won't show in mobile app.
   To enable: `UPDATE public.users SET has_leave_access=true WHERE email='worker@thepersa.com'`

2. **`time_clock.company_settings`** may not have a row for every company.
   `GET /api/v1/settings/{company_id}` returns 404 if missing — frontend must handle this gracefully.

3. **Gemini model name** in `.env` is `gemini-3.1-flash-lite-preview` — this is correct, do not change.

4. **`time_clock.time_entry_tags`** table exists but is legacy — budget_code_id on time_entries
   is now the primary way to tag entries. Tags table is kept for backwards compatibility only.

5. **`public.roles`** has duplicate keys (`admin`/`ADMIN`, `SITE_SUPER`/`SITE_SUPERVISOR`) —
   this is a CDefApp legacy issue. Time Clock ignores `roles.key` for access control (uses `users.role`).

6. **Admin panel** fetches `companyId` from `public.memberships` on login —
   if admin user has multiple memberships, it takes the first one. Super admin sees all companies.

---

## 15. Learn From These Files First

Before making any change, read these files in order:

**Backend:**
1. `timeclock-api/app/models/shared.py` — all public.* ORM models
2. `timeclock-api/app/models/time_clock.py` — all time_clock.* ORM models
3. `timeclock-api/app/middleware/subscription.py` — access control logic
4. `timeclock-api/app/auth.py` — JWT verification
5. The specific router file you need to change

**Frontend:**
1. `timeclock-admin/src/lib/api.ts` — all API function signatures
2. `timeclock-admin/src/App.tsx` — auth context (companyId, role, userId)
3. The specific page file you need to change

**Database (run these SQL queries to understand current state):**
```sql
-- Who has access to what
SELECT u.email, u.role, u.is_superadmin, c.name as company, r.key as role_key
FROM public.users u
LEFT JOIN public.memberships m ON m.user_id = u.id AND m.deleted_at IS NULL
LEFT JOIN public.companies c ON c.id = m.company_id
LEFT JOIN public.roles r ON r.id = m.role_id
WHERE u.deleted_at IS NULL ORDER BY c.name, u.email;

-- Subscriptions
SELECT c.name, s.app_key, s.status, s.plan_tier
FROM public.app_subscriptions s
JOIN public.companies c ON c.id = s.company_id;

-- Budget code hierarchy
SELECT d.name as division, bc.name as category, b.code, b.name
FROM public.budget_codes b
JOIN public.budget_categories bc ON bc.id = b.category_id
JOIN public.divisions d ON d.id = bc.division_id
WHERE b.deleted_at IS NULL ORDER BY d.name, bc.name, b.sort_order;
```
