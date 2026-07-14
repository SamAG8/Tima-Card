# Constralabs Time Clock — Master Plan

## Vision
A time tracking system for construction teams that produces Excel reports tagged with budget codes,
enabling managers to analyze labor costs by trade (e.g. drywall, fire stop, framing) and make
data-driven decisions for future projects.

---

## System Architecture

```
CDefApp (existing)
  └── public.users, public.projects, public.memberships

Time Clock (in progress)
  ├── timeclock-app     → Mobile PWA (React + Vite)
  ├── timeclock-admin   → Web admin panel (React + Vite)
  └── timeclock-api     → FastAPI backend

Video Task (future)
  └── PWA (React) — connects to same users/projects/budget codes
```

---

## Database Design

### Shared tables (public schema — accessible by all apps)

```sql
public.users
  + role: text  (worker | manager | admin)
  + has_leave_access: boolean
  + has_report_access: boolean
  + has_team_report_access: boolean

public.user_managers  -- extensible hierarchy
  - worker_id  → public.users
  - manager_id → public.users
  - project_id → public.projects (optional: manager per project)

public.divisions
  - id, name, company_id, created_at

public.budget_categories
  - id, name, division_id, created_at

public.budget_codes
  - id, name, code, category_id, created_at
```

### Time Clock tables (time_clock schema)

```sql
time_clock.time_entries
  + budget_code_id → public.budget_codes
  + tags: text[]
  + ai_summary: text

time_clock.time_adjustments  -- new
  - entry_id → time_clock.time_entries
  - requested_by → public.users
  - original_clock_in / original_clock_out
  - adjusted_clock_in / adjusted_clock_out
  - reason: text
  - status: pending | approved | rejected
  - reviewed_by → public.users
  - reviewed_at: timestamp

time_clock.leave_requests  -- existing, extend
  - visible only if user.has_leave_access = true
  - approval by manager via user_managers
```

---

## Phases

### Phase 1 — Database Foundation
- [ ] Migration: add role + permissions to `public.users`
- [ ] Migration: create `public.user_managers`
- [ ] Migration: create `public.divisions`, `budget_categories`, `budget_codes`
- [ ] Migration: add `budget_code_id`, `tags`, `ai_summary` to `time_clock.time_entries`
- [ ] Migration: create `time_clock.time_adjustments`

### Phase 2 — Time Clock App (worker-facing)
- [ ] Clock In/Out with time adjustment flow
  - If worker changes time → creates adjustment request
  - Manager must approve
- [ ] AI tag suggestion uses budget codes list from backend
- [ ] Budget code selection on clock out (AI suggests, worker confirms)
- [ ] Leave screen hidden if `has_leave_access = false`

### Phase 3 — Admin Panel
- [ ] User management: create/edit users, set role + permissions
- [ ] Assign workers to managers (`user_managers`)
- [ ] Budget code management: divisions → categories → codes (full CRUD)
- [ ] Approve/reject time adjustments
- [ ] Approve/reject leave requests
- [ ] Excel report: filter by date range, project, worker, division, budget code

### Phase 4 — Manager Dashboard
- [ ] View team's time entries
- [ ] Approve/reject time adjustments from their workers
- [ ] Approve/reject leave requests from their workers
- [ ] Team report (filtered by their workers only)

### Phase 5 — AI Enhancement
- [ ] AI receives budget codes list → suggests matching code (not free tags)
- [ ] On report generation: normalize any free tags → closest budget code
- [ ] Excel report includes: worker, project, date, hours, division, budget code, AI summary

---

## Permissions Matrix

|                        | worker | manager | admin |
|------------------------|--------|---------|-------|
| Clock in/out           | ✓      | ✓       | ✓     |
| View own history       | ✓      | ✓       | ✓     |
| View team history      | ✗      | ✓       | ✓     |
| Leave requests         | if enabled | if enabled | ✓ |
| Approve leave          | ✗      | ✓ (own team) | ✓ |
| Approve time adjust    | ✗      | ✓ (own team) | ✓ |
| Manage budget codes    | ✗      | ✗       | ✓     |
| Manage users           | ✗      | ✗       | ✓     |
| Export Excel           | ✗      | own team | ✓   |

---

## Clock In/Out Time Adjustment Flow

```
Worker taps Clock In at 9:00
  └── Popup: "Did you start at 9:00 AM?"
        ├── Yes → clock in at 9:00 (no approval needed)
        └── No, I started at [time picker]
              └── Creates time_adjustments record (status: pending)
              └── Manager gets notification → approves/rejects

Same flow for Clock Out.
```

---

## Excel Report Structure

| Worker | Date | Project | Division | Budget Code | Hours | AI Summary | Tags |
|--------|------|---------|----------|-------------|-------|------------|------|
| John   | Apr 1 | 1515 Rupert | Carpentry | Wood Framing | 8h | Framed... | framing, wood |

Aggregation rows per division, per project, per worker.

---

## AI Rules (strict)
- All AI analysis goes through FastAPI backend ONLY
- Never call Gemini from frontend
- Model: `gemini-3.1-flash-lite-preview` (locked in .env)
- When suggesting budget codes: send the full list of codes to AI, AI picks from that list only

---

## Video Task (future — do not implement yet)
- PWA (React)
- Manager records video → creates task → assigns to worker by email
- Task links to: `public.projects`, `public.budget_codes`, `public.users`
- Worker sees task in their app alongside time clock
