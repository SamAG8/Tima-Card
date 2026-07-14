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
