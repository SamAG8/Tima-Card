# Time Clock Platform — Complete Setup Instructions

> This document is intended for an agent with full file system and terminal access.
> Execute every step in order. Do NOT skip any step.

---

## Safety Verification (Read Before Anything)

The Time Clock project is **additive only**. It:
- Creates a new `time_clock` schema in the existing Supabase database
- Adds one new table (`app_subscriptions`) and three new enum types to the existing `public` schema
- Runs as a **completely separate FastAPI service** — the CDefApp backend (`cdefiapp-api`) is never touched
- Uses the same Supabase project (shared auth, companies, users, projects)

**Zero risk to CDefApp** as long as:
1. The migration SQL is run exactly as written (additive only)
2. No files inside `/Users/hosseinasgari/Developer/CdefiApp/CDefApp/` are modified

---

## Project Locations

```
/Users/hosseinasgari/Developer/Time Clock/
├── migrations/                  ← Run in Supabase SQL Editor
├── timeclock-api/               ← FastAPI backend (Python)
├── timeclock-app/               ← Mobile app (React + Capacitor)
└── timeclock-admin/             ← Admin panel (React web)
```

---

## STEP 1 — Fix the Database Migration SQL

**Problem:** The file `/Users/hosseinasgari/Developer/Time Clock/migrations/001_initial_timeclock_schema.sql` uses `CREATE TYPE IF NOT EXISTS` which is NOT valid PostgreSQL syntax. PostgreSQL does not support `IF NOT EXISTS` for enum types. This will cause the migration to fail.

**Action:** Replace the entire file `/Users/hosseinasgari/Developer/Time Clock/migrations/001_initial_timeclock_schema.sql` with the corrected version below.

```sql
-- =============================================================
-- TIME CLOCK PLATFORM - Initial Migration
-- Run this in Supabase SQL Editor (Project: same as CDefApp)
-- Safe to run: additive only, zero changes to existing tables
-- =============================================================

-- ---------------------------------------------------------------
-- SECTION 1: app_subscriptions (added to public schema)
-- Controls which company has access to which app/module
-- ---------------------------------------------------------------

DO $$ BEGIN
    CREATE TYPE public.app_key_enum AS ENUM ('DEFICIENCY', 'TIME_CLOCK');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE public.subscription_status_enum AS ENUM ('ACTIVE', 'TRIAL', 'SUSPENDED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE public.plan_tier_enum AS ENUM ('FREE', 'STARTER', 'PRO', 'ENTERPRISE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.app_subscriptions (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id              UUID NOT NULL REFERENCES public.companies(id),
    app_key                 public.app_key_enum NOT NULL,
    status                  public.subscription_status_enum NOT NULL DEFAULT 'TRIAL',
    plan_tier               public.plan_tier_enum NOT NULL DEFAULT 'FREE',
    started_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at              TIMESTAMPTZ,
    stripe_subscription_id  TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(company_id, app_key)
);

CREATE INDEX IF NOT EXISTS idx_app_subscriptions_company
    ON public.app_subscriptions(company_id, app_key, status);

-- ---------------------------------------------------------------
-- SECTION 2: time_clock schema
-- ---------------------------------------------------------------

CREATE SCHEMA IF NOT EXISTS time_clock;

GRANT USAGE ON SCHEMA time_clock TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA time_clock
    GRANT ALL ON TABLES TO anon, authenticated, service_role;

-- ---------------------------------------------------------------
-- SECTION 3: Enums (all in time_clock schema)
-- ---------------------------------------------------------------

DO $$ BEGIN
    CREATE TYPE time_clock.entry_type_enum AS ENUM ('NORMAL', 'MANUAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE time_clock.manual_reason_enum AS ENUM ('FORGOT', 'SYSTEM_ERROR', 'NO_PHONE', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE time_clock.entry_status_enum AS ENUM ('ACTIVE', 'SUBMITTED', 'APPROVED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE time_clock.approval_result_enum AS ENUM ('APPROVED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE time_clock.leave_status_enum AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE time_clock.overtime_status_enum AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE time_clock.currency_enum AS ENUM ('CAD', 'USD');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------
-- SECTION 4: company_settings
-- ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS time_clock.company_settings (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id                  UUID NOT NULL UNIQUE REFERENCES public.companies(id),
    timezone                    TEXT NOT NULL DEFAULT 'America/Toronto',
    default_currency            time_clock.currency_enum NOT NULL DEFAULT 'CAD',
    break_tracking_enabled      BOOLEAN NOT NULL DEFAULT false,
    overtime_requires_approval  BOOLEAN NOT NULL DEFAULT true,
    working_hours_start         TIME,
    working_hours_end           TIME,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------
-- SECTION 5: worker_managers
-- ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS time_clock.worker_managers (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id          UUID NOT NULL REFERENCES public.companies(id),
    project_id          UUID REFERENCES public.projects(id),
    worker_user_id      UUID NOT NULL REFERENCES public.users(id),
    manager_user_id     UUID NOT NULL REFERENCES public.users(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_worker_managers_worker
    ON time_clock.worker_managers(company_id, worker_user_id)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_worker_managers_manager
    ON time_clock.worker_managers(company_id, manager_user_id)
    WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------
-- SECTION 6: worker_rates
-- ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS time_clock.worker_rates (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID NOT NULL REFERENCES public.companies(id),
    user_id         UUID NOT NULL REFERENCES public.users(id),
    project_id      UUID REFERENCES public.projects(id),
    hourly_rate     DECIMAL(10, 2) NOT NULL,
    currency        time_clock.currency_enum NOT NULL DEFAULT 'CAD',
    effective_from  DATE NOT NULL,
    effective_to    DATE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_worker_rates_user
    ON time_clock.worker_rates(company_id, user_id, effective_from)
    WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------
-- SECTION 7: time_entries
-- ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS time_clock.time_entries (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID NOT NULL REFERENCES public.companies(id),
    project_id      UUID NOT NULL REFERENCES public.projects(id),
    user_id         UUID NOT NULL REFERENCES public.users(id),
    clock_in        TIMESTAMPTZ,
    clock_out       TIMESTAMPTZ,
    user_timezone   TEXT NOT NULL DEFAULT 'America/Toronto',
    work_date       DATE NOT NULL,
    clock_in_lat    FLOAT,
    clock_in_lng    FLOAT,
    clock_out_lat   FLOAT,
    clock_out_lng   FLOAT,
    entry_type      time_clock.entry_type_enum NOT NULL DEFAULT 'NORMAL',
    manual_reason   time_clock.manual_reason_enum,
    manual_note     TEXT,
    description     TEXT,
    status          time_clock.entry_status_enum NOT NULL DEFAULT 'ACTIVE',
    break_minutes   INT NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_time_entries_company_project
    ON time_clock.time_entries(company_id, project_id, work_date)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_time_entries_user_date
    ON time_clock.time_entries(user_id, work_date)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_time_entries_status
    ON time_clock.time_entries(company_id, status)
    WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_time_entries_active_per_day
    ON time_clock.time_entries(user_id, work_date)
    WHERE status = 'ACTIVE' AND deleted_at IS NULL;

-- ---------------------------------------------------------------
-- SECTION 8: time_entry_tags
-- ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS time_clock.time_entry_tags (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID NOT NULL REFERENCES public.companies(id),
    time_entry_id   UUID NOT NULL REFERENCES time_clock.time_entries(id),
    tag             TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_time_entry_tags_entry
    ON time_clock.time_entry_tags(time_entry_id);

-- ---------------------------------------------------------------
-- SECTION 9: time_entry_approvals
-- ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS time_clock.time_entry_approvals (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id          UUID NOT NULL REFERENCES public.companies(id),
    time_entry_id       UUID NOT NULL REFERENCES time_clock.time_entries(id),
    approver_user_id    UUID NOT NULL REFERENCES public.users(id),
    result              time_clock.approval_result_enum NOT NULL,
    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_time_entry_approvals_entry
    ON time_clock.time_entry_approvals(time_entry_id);

-- ---------------------------------------------------------------
-- SECTION 10: overtime_requests
-- ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS time_clock.overtime_requests (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id              UUID NOT NULL REFERENCES public.companies(id),
    project_id              UUID NOT NULL REFERENCES public.projects(id),
    user_id                 UUID NOT NULL REFERENCES public.users(id),
    requested_date          DATE NOT NULL,
    estimated_hours         DECIMAL(4, 2) NOT NULL,
    reason                  TEXT,
    status                  time_clock.overtime_status_enum NOT NULL DEFAULT 'PENDING',
    reviewed_by_user_id     UUID REFERENCES public.users(id),
    reviewed_at             TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at              TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_overtime_requests_user
    ON time_clock.overtime_requests(company_id, user_id, status)
    WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------
-- SECTION 11: leave_types
-- ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS time_clock.leave_types (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id              UUID REFERENCES public.companies(id),
    name                    TEXT NOT NULL,
    default_days_per_year   DECIMAL(4, 1),
    is_unlimited            BOOLEAN NOT NULL DEFAULT false,
    is_active               BOOLEAN NOT NULL DEFAULT true,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at              TIMESTAMPTZ
);

INSERT INTO time_clock.leave_types (name, default_days_per_year, is_unlimited)
SELECT name, days, unlimited FROM (VALUES
    ('Vacation',                    10.0,   false),
    ('Sick',                        5.0,    false),
    ('CAN Bereavement - Immediate', 5.0,    false),
    ('CAN Bereavement - Extended',  3.0,    false),
    ('CAN Jury Duty',               NULL,   true),
    ('Personal',                    3.0,    false)
) AS v(name, days, unlimited)
WHERE NOT EXISTS (SELECT 1 FROM time_clock.leave_types WHERE company_id IS NULL);

-- ---------------------------------------------------------------
-- SECTION 12: leave_balances
-- ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS time_clock.leave_balances (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID NOT NULL REFERENCES public.companies(id),
    user_id         UUID NOT NULL REFERENCES public.users(id),
    leave_type_id   UUID NOT NULL REFERENCES time_clock.leave_types(id),
    year            INT NOT NULL,
    total_days      DECIMAL(4, 1) NOT NULL,
    used_days       DECIMAL(4, 1) NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(company_id, user_id, leave_type_id, year)
);

CREATE INDEX IF NOT EXISTS idx_leave_balances_user
    ON time_clock.leave_balances(company_id, user_id, year);

-- ---------------------------------------------------------------
-- SECTION 13: leave_requests
-- ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS time_clock.leave_requests (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id              UUID NOT NULL REFERENCES public.companies(id),
    user_id                 UUID NOT NULL REFERENCES public.users(id),
    leave_type_id           UUID NOT NULL REFERENCES time_clock.leave_types(id),
    start_date              DATE NOT NULL,
    end_date                DATE NOT NULL,
    status                  time_clock.leave_status_enum NOT NULL DEFAULT 'PENDING',
    notes                   TEXT,
    reviewed_by_user_id     UUID REFERENCES public.users(id),
    reviewed_at             TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at              TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_leave_requests_user
    ON time_clock.leave_requests(company_id, user_id, status)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_leave_requests_pending
    ON time_clock.leave_requests(company_id, status)
    WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------
-- SECTION 14: missed_entry_notifications
-- ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS time_clock.missed_entry_notifications (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id              UUID NOT NULL REFERENCES public.companies(id),
    user_id                 UUID NOT NULL REFERENCES public.users(id),
    work_date               DATE NOT NULL,
    notified_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved                BOOLEAN NOT NULL DEFAULT false,
    resolved_by_entry_id    UUID REFERENCES time_clock.time_entries(id),
    UNIQUE(company_id, user_id, work_date)
);

-- ---------------------------------------------------------------
-- SECTION 15: Row Level Security
-- Backend uses service_role key which bypasses RLS.
-- These policies protect direct client access only.
-- ---------------------------------------------------------------

ALTER TABLE time_clock.time_entries             ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_clock.time_entry_approvals     ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_clock.time_entry_tags          ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_clock.worker_rates             ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_clock.worker_managers          ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_clock.company_settings         ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_clock.overtime_requests        ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_clock.leave_requests           ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_clock.leave_balances           ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_clock.leave_types              ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_clock.missed_entry_notifications ENABLE ROW LEVEL SECURITY;

-- Workers can only see their own data
CREATE POLICY "worker_own_entries"
    ON time_clock.time_entries FOR ALL
    USING (user_id = auth.uid());

CREATE POLICY "worker_own_leave"
    ON time_clock.leave_requests FOR ALL
    USING (user_id = auth.uid());

CREATE POLICY "worker_own_balances"
    ON time_clock.leave_balances FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "leave_types_read_all"
    ON time_clock.leave_types FOR SELECT
    USING (true);

-- ---------------------------------------------------------------
-- SECTION 16: Supabase trigger — sync auth.users → public.users
-- When a user logs in via Magic Link for the first time,
-- automatically create their record in public.users
-- ---------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.users (id, email, created_at, updated_at)
    VALUES (
        NEW.id,
        NEW.email,
        now(),
        now()
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

---

## STEP 2 — Fix the Shared Models (Role schema mismatch)

**Problem:** The CDefApp's actual `Role` model has `company_id` and `project_id` fields (not just `key` and `name` as assumed). The `shared.py` in timeclock-api must match the real schema.

**Action:** Replace the content of `/Users/hosseinasgari/Developer/Time Clock/timeclock-api/app/models/shared.py` with:

```python
"""
Read-only references to the shared public schema tables.
These mirror CDefApp's public schema — do not modify tables from here.
"""
import uuid
from sqlalchemy import Column, String, Boolean, DateTime, JSON, text
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base


class Company(Base):
    __tablename__ = "companies"
    __table_args__ = {"schema": "public"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=False)
    subscription_status = Column(String)
    is_active = Column(Boolean, default=True)
    deleted_at = Column(DateTime(timezone=True))


class User(Base):
    __tablename__ = "users"
    __table_args__ = {"schema": "public"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String, nullable=False, unique=True)
    first_name = Column(String)
    last_name = Column(String)
    phone = Column(String)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=text("now()"))
    updated_at = Column(DateTime(timezone=True), server_default=text("now()"))
    deleted_at = Column(DateTime(timezone=True))


class Role(Base):
    __tablename__ = "roles"
    __table_args__ = {"schema": "public"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    key = Column(String, unique=True, nullable=False)
    name = Column(String, nullable=False)
    # CDefApp also has company_id, project_id, permissions — included for compatibility
    company_id = Column(UUID(as_uuid=True))
    project_id = Column(UUID(as_uuid=True))
    permissions = Column(JSON)


class Membership(Base):
    __tablename__ = "memberships"
    __table_args__ = {"schema": "public"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), nullable=False)
    company_id = Column(UUID(as_uuid=True), nullable=False)
    project_id = Column(UUID(as_uuid=True))
    role_id = Column(UUID(as_uuid=True), nullable=False)
    permissions_override = Column(JSON)
    deleted_at = Column(DateTime(timezone=True))


class Project(Base):
    __tablename__ = "projects"
    __table_args__ = {"schema": "public"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = Column(UUID(as_uuid=True), nullable=False)
    name = Column(String, nullable=False)
    address = Column(String)
    status = Column(String)
    deleted_at = Column(DateTime(timezone=True))


class AppSubscription(Base):
    __tablename__ = "app_subscriptions"
    __table_args__ = {"schema": "public"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = Column(UUID(as_uuid=True), nullable=False)
    app_key = Column(String, nullable=False)
    status = Column(String, nullable=False)
    plan_tier = Column(String, nullable=False)
    started_at = Column(DateTime(timezone=True))
    expires_at = Column(DateTime(timezone=True))
```

---

## STEP 3 — Create Missing Backend Files

### 3a. Create `/Users/hosseinasgari/Developer/Time Clock/timeclock-api/app/routers/team.py`

```python
"""
Team management: assign workers to managers, manage membership context.
"""
import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.middleware.subscription import require_subscription, require_role
from app.models.shared import User, Membership, Role
from app.models.time_clock import WorkerManager

router = APIRouter(prefix="/team", tags=["Team"])

ADMIN_ROLES = ["OWNER", "ADMIN"]


class AssignManagerRequest(BaseModel):
    company_id: str
    worker_user_id: str
    manager_user_id: str
    project_id: Optional[str] = None


@router.post("/assign-manager")
def assign_manager(
    body: AssignManagerRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_subscription(body.company_id, db)
    require_role(str(current_user.id), body.company_id, ADMIN_ROLES, db)

    assignment = WorkerManager(
        id=uuid.uuid4(),
        company_id=body.company_id,
        project_id=body.project_id,
        worker_user_id=body.worker_user_id,
        manager_user_id=body.manager_user_id,
    )
    db.add(assignment)
    db.commit()
    return {"status": "ok"}


@router.get("/members")
def get_company_members(
    company_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return all users with a membership in this company."""
    require_subscription(company_id, db)
    require_role(str(current_user.id), company_id, ADMIN_ROLES + ["MANAGER"], db)

    memberships = (
        db.query(Membership, User, Role)
        .join(User, User.id == Membership.user_id)
        .join(Role, Role.id == Membership.role_id)
        .filter(
            Membership.company_id == company_id,
            Membership.deleted_at.is_(None),
            User.deleted_at.is_(None),
        )
        .all()
    )

    return [
        {
            "user_id": str(m.user_id),
            "email": u.email,
            "first_name": u.first_name,
            "last_name": u.last_name,
            "role_key": r.key,
            "role_name": r.name,
            "project_id": str(m.project_id) if m.project_id else None,
        }
        for m, u, r in memberships
    ]
```

### 3b. Create `/Users/hosseinasgari/Developer/Time Clock/timeclock-api/app/routers/rates.py`

```python
"""
Worker hourly rate management.
"""
import uuid
from datetime import date
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.middleware.subscription import require_subscription, require_role
from app.models.shared import User
from app.models.time_clock import WorkerRate

router = APIRouter(prefix="/rates", tags=["Worker Rates"])

ADMIN_ROLES = ["OWNER", "ADMIN"]


class RateCreate(BaseModel):
    company_id: str
    user_id: str
    hourly_rate: float
    currency: str = "CAD"
    effective_from: str
    effective_to: Optional[str] = None
    project_id: Optional[str] = None


@router.post("/")
def create_rate(
    body: RateCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_subscription(body.company_id, db)
    require_role(str(current_user.id), body.company_id, ADMIN_ROLES, db)

    rate = WorkerRate(
        id=uuid.uuid4(),
        company_id=body.company_id,
        user_id=body.user_id,
        project_id=body.project_id,
        hourly_rate=body.hourly_rate,
        currency=body.currency,
        effective_from=date.fromisoformat(body.effective_from),
        effective_to=date.fromisoformat(body.effective_to) if body.effective_to else None,
    )
    db.add(rate)
    db.commit()
    db.refresh(rate)
    return {"id": str(rate.id), "status": "created"}


@router.get("/")
def get_rates(
    company_id: str,
    user_id: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_subscription(company_id, db)
    require_role(str(current_user.id), company_id, ADMIN_ROLES, db)

    query = db.query(WorkerRate).filter(
        WorkerRate.company_id == company_id,
        WorkerRate.deleted_at.is_(None),
    )
    if user_id:
        query = query.filter(WorkerRate.user_id == user_id)

    rates = query.order_by(WorkerRate.effective_from.desc()).all()
    return [
        {
            "id": str(r.id),
            "user_id": str(r.user_id),
            "project_id": str(r.project_id) if r.project_id else None,
            "hourly_rate": float(r.hourly_rate),
            "currency": r.currency,
            "effective_from": str(r.effective_from),
            "effective_to": str(r.effective_to) if r.effective_to else None,
        }
        for r in rates
    ]
```

### 3c. Create `/Users/hosseinasgari/Developer/Time Clock/timeclock-api/app/routers/settings.py`

```python
"""
Company settings for the Time Clock module.
"""
import uuid
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
import pytz

from app.auth import get_current_user
from app.database import get_db
from app.middleware.subscription import require_subscription, require_role
from app.models.shared import User
from app.models.time_clock import CompanySettings

router = APIRouter(prefix="/settings", tags=["Settings"])

ADMIN_ROLES = ["OWNER", "ADMIN"]


class SettingsUpdate(BaseModel):
    company_id: str
    timezone: Optional[str] = None
    default_currency: Optional[str] = None
    break_tracking_enabled: Optional[bool] = None
    overtime_requires_approval: Optional[bool] = None
    working_hours_start: Optional[str] = None
    working_hours_end: Optional[str] = None


@router.get("/{company_id}")
def get_settings(
    company_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_subscription(company_id, db)

    settings = db.query(CompanySettings).filter(
        CompanySettings.company_id == company_id
    ).first()

    if not settings:
        return {
            "company_id": company_id,
            "timezone": "America/Toronto",
            "default_currency": "CAD",
            "break_tracking_enabled": False,
            "overtime_requires_approval": True,
        }

    return {
        "company_id": str(settings.company_id),
        "timezone": settings.timezone,
        "default_currency": settings.default_currency,
        "break_tracking_enabled": settings.break_tracking_enabled,
        "overtime_requires_approval": settings.overtime_requires_approval,
        "working_hours_start": str(settings.working_hours_start) if settings.working_hours_start else None,
        "working_hours_end": str(settings.working_hours_end) if settings.working_hours_end else None,
    }


@router.put("/")
def update_settings(
    body: SettingsUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_subscription(body.company_id, db)
    require_role(str(current_user.id), body.company_id, ADMIN_ROLES, db)

    settings = db.query(CompanySettings).filter(
        CompanySettings.company_id == body.company_id
    ).first()

    if not settings:
        settings = CompanySettings(id=uuid.uuid4(), company_id=body.company_id)
        db.add(settings)

    if body.timezone is not None:
        settings.timezone = body.timezone
    if body.default_currency is not None:
        settings.default_currency = body.default_currency
    if body.break_tracking_enabled is not None:
        settings.break_tracking_enabled = body.break_tracking_enabled
    if body.overtime_requires_approval is not None:
        settings.overtime_requires_approval = body.overtime_requires_approval

    settings.updated_at = datetime.utcnow().replace(tzinfo=pytz.utc)
    db.commit()
    return {"status": "ok"}
```

### 3d. Update `main.py` to include new routers

Replace `/Users/hosseinasgari/Developer/Time Clock/timeclock-api/app/main.py` with:

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import entries, approvals, leave, reports, team, rates, settings as settings_router

app = FastAPI(
    title="Time Clock API",
    version="1.0.0",
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url=None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(entries.router,          prefix="/api/v1")
app.include_router(approvals.router,        prefix="/api/v1")
app.include_router(leave.router,            prefix="/api/v1")
app.include_router(reports.router,          prefix="/api/v1")
app.include_router(team.router,             prefix="/api/v1")
app.include_router(rates.router,            prefix="/api/v1")
app.include_router(settings_router.router,  prefix="/api/v1")


@app.get("/health")
def health():
    return {"status": "ok", "app": "timeclock-api"}
```

---

## STEP 4 — Create Missing Frontend Files (timeclock-app)

### 4a. Create `/Users/hosseinasgari/Developer/Time Clock/timeclock-app/index.html`

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <title>Time Clock</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

### 4b. Create `/Users/hosseinasgari/Developer/Time Clock/timeclock-app/src/main.tsx`

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

### 4c. Create `/Users/hosseinasgari/Developer/Time Clock/timeclock-app/src/index.css`

```css
@import "tailwindcss";

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background-color: #0f172a;
  color: white;
  -webkit-font-smoothing: antialiased;
}

.safe-area-bottom {
  padding-bottom: env(safe-area-inset-bottom);
}
```

### 4d. Create `/Users/hosseinasgari/Developer/Time Clock/timeclock-app/vite.config.ts`

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
  },
})
```

### 4e. Create `/Users/hosseinasgari/Developer/Time Clock/timeclock-app/tsconfig.json`

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }
  ]
}
```

### 4f. Create `/Users/hosseinasgari/Developer/Time Clock/timeclock-app/tsconfig.app.json`

```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.app.tsbuildinfo",
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"]
}
```

### 4g. Create `/Users/hosseinasgari/Developer/Time Clock/timeclock-app/tsconfig.node.json`

```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.node.tsbuildinfo",
    "target": "ES2022",
    "lib": ["ES2023"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "strict": true
  },
  "include": ["vite.config.ts", "capacitor.config.ts"]
}
```

### 4h. Create `/Users/hosseinasgari/Developer/Time Clock/timeclock-app/src/screens/ManualEntryScreen.tsx`

```tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Clock } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';

const MANUAL_REASONS = [
  { value: 'FORGOT', label: 'Forgot to clock in' },
  { value: 'NO_PHONE', label: 'Did not have phone' },
  { value: 'SYSTEM_ERROR', label: 'System error' },
  { value: 'OTHER', label: 'Other' },
];

export default function ManualEntryScreen() {
  const navigate = useNavigate();
  const { companyId, projectId, userTimezone } = useAuth();

  const today = new Date().toISOString().split('T')[0];
  const [workDate, setWorkDate] = useState(today);
  const [clockIn, setClockIn] = useState('08:00');
  const [clockOut, setClockOut] = useState('16:00');
  const [reason, setReason] = useState('FORGOT');
  const [note, setNote] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    setLoading(true);
    setError('');
    try {
      await api.createManualEntry({
        company_id: companyId,
        project_id: projectId,
        work_date: workDate,
        clock_in: `${workDate}T${clockIn}:00`,
        clock_out: `${workDate}T${clockOut}:00`,
        user_timezone: userTimezone,
        manual_reason: reason,
        manual_note: note || undefined,
        description: description || undefined,
      });
      navigate('/history');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to submit');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 px-4 pt-6 pb-4">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate(-1)} className="text-slate-400 hover:text-white">
          <ArrowLeft size={22} />
        </button>
        <h1 className="text-xl font-bold text-white">Manual Entry</h1>
      </div>

      <div className="space-y-4">
        <div>
          <label className="text-slate-400 text-xs mb-1 block">Date</label>
          <input
            type="date"
            value={workDate}
            max={today}
            onChange={(e) => setWorkDate(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-slate-400 text-xs mb-1 block">Clock In</label>
            <input
              type="time"
              value={clockIn}
              onChange={(e) => setClockIn(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="text-slate-400 text-xs mb-1 block">Clock Out</label>
            <input
              type="time"
              value={clockOut}
              onChange={(e) => setClockOut(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        <div>
          <label className="text-slate-400 text-xs mb-2 block">Reason</label>
          <div className="space-y-2">
            {MANUAL_REASONS.map((r) => (
              <button
                key={r.value}
                onClick={() => setReason(r.value)}
                className={`w-full text-left px-4 py-3 rounded-xl border text-sm transition-colors ${
                  reason === r.value
                    ? 'border-blue-500 bg-blue-500/10 text-blue-400'
                    : 'border-slate-700 bg-slate-800 text-slate-300'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-slate-400 text-xs mb-1 block">Additional note (optional)</label>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Explain further..."
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>

        <div>
          <label className="text-slate-400 text-xs mb-1 block">Work description (optional)</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What did you work on?"
            rows={3}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-blue-500 resize-none"
          />
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <button
          onClick={handleSubmit}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-4 rounded-2xl transition-colors"
        >
          {loading ? (
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <><Clock size={18} /> Submit for Approval</>
          )}
        </button>

        <p className="text-slate-500 text-xs text-center">
          This entry will be sent to your manager for approval.
        </p>
      </div>
    </div>
  );
}
```

### 4i. Update `App.tsx` to add the ManualEntry route

In `/Users/hosseinasgari/Developer/Time Clock/timeclock-app/src/App.tsx`, add this import at the top:

```tsx
import ManualEntryScreen from './screens/ManualEntryScreen';
```

And add this route inside `<Routes>`:

```tsx
<Route path="/manual-entry" element={<ManualEntryScreen />} />
```

---

## STEP 5 — Create Missing Frontend Files (timeclock-admin)

### 5a. Create `/Users/hosseinasgari/Developer/Time Clock/timeclock-admin/index.html`

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Time Clock Admin</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

### 5b. Create `/Users/hosseinasgari/Developer/Time Clock/timeclock-admin/src/main.tsx`

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

### 5c. Create `/Users/hosseinasgari/Developer/Time Clock/timeclock-admin/src/index.css`

```css
@import "tailwindcss";

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background-color: #020617;
  color: white;
  -webkit-font-smoothing: antialiased;
}
```

### 5d. Create `/Users/hosseinasgari/Developer/Time Clock/timeclock-admin/vite.config.ts`

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5175,
  },
})
```

### 5e. Create `/Users/hosseinasgari/Developer/Time Clock/timeclock-admin/tsconfig.json`

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }
  ]
}
```

### 5f. Create `/Users/hosseinasgari/Developer/Time Clock/timeclock-admin/tsconfig.app.json`

```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.app.tsbuildinfo",
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"]
}
```

### 5g. Create `/Users/hosseinasgari/Developer/Time Clock/timeclock-admin/tsconfig.node.json`

```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.node.tsbuildinfo",
    "target": "ES2022",
    "lib": ["ES2023"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "strict": true
  },
  "include": ["vite.config.ts"]
}
```

---

## STEP 6 — Environment Variables Setup

### Backend (`timeclock-api`)

Copy `.env.example` to `.env` and fill in real values:

```
DATABASE_URL=postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-0-us-west-2.pooler.supabase.com:6543/postgres
SUPABASE_URL=https://[PROJECT_REF].supabase.co
SUPABASE_SERVICE_ROLE_KEY=[from Supabase dashboard → Settings → API]
SUPABASE_JWT_SECRET=[from Supabase dashboard → Settings → API → JWT Secret]
ALLOWED_ORIGINS=http://localhost:5174,http://localhost:5175
ENVIRONMENT=dev
DEBUG=true
```

> Use the **Session pooler** connection string from Supabase (port 6543), not direct port 5432, for Cloud Run compatibility.

### Mobile app (`timeclock-app`) and Admin (`timeclock-admin`)

Copy `.env.example` to `.env` in each:

```
VITE_SUPABASE_URL=https://[PROJECT_REF].supabase.co
VITE_SUPABASE_ANON_KEY=[from Supabase dashboard → Settings → API → anon key]
VITE_API_BASE_URL=http://localhost:8001
```

---

## STEP 7 — Supabase Configuration (Magic Link via Brevo)

1. Go to Supabase Dashboard → **Authentication → Providers → Email**
2. Enable **Magic Link**
3. Disable "Confirm email" (magic link handles this)

4. Go to **Authentication → SMTP Settings**
5. Enable custom SMTP and fill in:
   - Host: `smtp-relay.brevo.com`
   - Port: `587`
   - Username: your Brevo login email
   - Password: your Brevo SMTP API key (from Brevo → SMTP & API)
   - Sender name: `Time Clock`
   - Sender email: `noreply@constralabs.ai` (or verified Brevo sender)

6. Go to **Authentication → URL Configuration**:
   - Site URL: `http://localhost:5174` (dev) or `https://timeclock.constralabs.ai` (prod)
   - Add redirect URLs:
     - `http://localhost:5174/**`
     - `http://localhost:5175/**`
     - `https://timeclock.constralabs.ai/**`
     - `https://admin.timeclock.constralabs.ai/**`

---

## STEP 8 — Run the Database Migration

1. Open Supabase Dashboard → **SQL Editor**
2. Paste the ENTIRE content of the fixed migration file from STEP 1
3. Click **Run**
4. Verify success: check that `time_clock` schema appears in **Table Editor**
5. Verify `public.app_subscriptions` table exists

**Verification query to run after migration:**
```sql
SELECT table_schema, table_name
FROM information_schema.tables
WHERE table_schema = 'time_clock'
ORDER BY table_name;
```
Expected: 11 tables listed.

---

## STEP 9 — Install Dependencies and Run Locally

### Backend

```bash
cd "/Users/hosseinasgari/Developer/Time Clock/timeclock-api"
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
```

Verify: open `http://localhost:8001/health` — should return `{"status": "ok", "app": "timeclock-api"}`
Verify: open `http://localhost:8001/docs` — should show Swagger UI with all routes

### Mobile App

```bash
cd "/Users/hosseinasgari/Developer/Time Clock/timeclock-app"
npm install
npm run dev
```

Verify: open `http://localhost:5174` — should show Auth screen

### Admin Panel

```bash
cd "/Users/hosseinasgari/Developer/Time Clock/timeclock-admin"
npm install
npm run dev
```

Verify: open `http://localhost:5175` — should show Admin login screen

---

## STEP 10 — Seed Test Data (Optional but Recommended)

Run this in Supabase SQL Editor after the migration to create a test subscription for an existing company:

```sql
-- Replace the UUID with a real company_id from your companies table
INSERT INTO public.app_subscriptions (company_id, app_key, status, plan_tier)
SELECT id, 'TIME_CLOCK', 'ACTIVE', 'PRO'
FROM public.companies
LIMIT 1
ON CONFLICT (company_id, app_key) DO NOTHING;
```

---

## What Was NOT Touched in CDefApp

| File/Component | Status |
|---|---|
| `CDefApp/server/` (all files) | NOT MODIFIED |
| `CDefApp/src/` (all files) | NOT MODIFIED |
| `CDefApp/defi-admin/` (all files) | NOT MODIFIED |
| `public.companies` table | NOT MODIFIED |
| `public.users` table | NOT MODIFIED |
| `public.memberships` table | NOT MODIFIED |
| `public.projects` table | NOT MODIFIED |
| All existing Alembic migrations | NOT MODIFIED |
| CDefApp Supabase Auth config | NOT MODIFIED |

**Only additions to the shared database:**
- New table: `public.app_subscriptions`
- New enums: `public.app_key_enum`, `public.subscription_status_enum`, `public.plan_tier_enum`
- New schema: `time_clock.*` (11 tables, all isolated)
- New trigger: `on_auth_user_created` on `auth.users` (safe — only inserts if user doesn't exist)

---

## Known Limitations (Next Sprint)

- [ ] Workers page in admin panel (UI placeholder only)
- [ ] Settings page in admin panel (UI placeholder only)
- [ ] Overtime request router not yet implemented
- [ ] Push notifications for missed entries (backend job not yet implemented)
- [ ] Company onboarding flow (how first OWNER registers a new company)
- [ ] Capacitor deep link setup for iOS/Android (magic link redirect)
