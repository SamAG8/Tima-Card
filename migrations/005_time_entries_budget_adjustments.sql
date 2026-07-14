-- =============================================================
-- TIME CLOCK PLATFORM - Migration 005
-- 1. Add budget_code_id + ai_summary to time_entries
-- 2. Create time_adjustments table (clock in/out time edit + approval)
-- Safe to run: additive only
-- =============================================================

-- ---------------------------------------------------------------
-- SECTION 1: Extend time_entries with budget code + AI data
-- ---------------------------------------------------------------

ALTER TABLE time_clock.time_entries
    ADD COLUMN IF NOT EXISTS budget_code_id  UUID REFERENCES public.budget_codes(id),
    ADD COLUMN IF NOT EXISTS ai_summary      TEXT;

-- Drop old free-text tags table is NOT done here — kept for backwards compat
-- budget_code_id is the structured replacement going forward

CREATE INDEX IF NOT EXISTS idx_time_entries_budget_code
    ON time_clock.time_entries(budget_code_id)
    WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------
-- SECTION 2: time_adjustments
-- Worker requests a corrected clock-in or clock-out time.
-- Manager approves or rejects.
-- ---------------------------------------------------------------

DO $$ BEGIN
    CREATE TYPE time_clock.adjustment_status_enum AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE time_clock.adjustment_type_enum AS ENUM ('CLOCK_IN', 'CLOCK_OUT', 'BOTH');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS time_clock.time_adjustments (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id              UUID NOT NULL REFERENCES public.companies(id),
    time_entry_id           UUID NOT NULL REFERENCES time_clock.time_entries(id),
    requested_by            UUID NOT NULL REFERENCES public.users(id),

    adjustment_type         time_clock.adjustment_type_enum NOT NULL,

    -- original values (snapshot at request time)
    original_clock_in       TIMESTAMPTZ,
    original_clock_out      TIMESTAMPTZ,

    -- what the worker is requesting
    requested_clock_in      TIMESTAMPTZ,
    requested_clock_out     TIMESTAMPTZ,

    reason                  TEXT,
    status                  time_clock.adjustment_status_enum NOT NULL DEFAULT 'PENDING',

    reviewed_by             UUID REFERENCES public.users(id),
    reviewed_at             TIMESTAMPTZ,
    review_note             TEXT,

    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at              TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_time_adjustments_entry
    ON time_clock.time_adjustments(time_entry_id)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_time_adjustments_pending
    ON time_clock.time_adjustments(company_id, status)
    WHERE deleted_at IS NULL AND status = 'PENDING';

CREATE INDEX IF NOT EXISTS idx_time_adjustments_worker
    ON time_clock.time_adjustments(requested_by, status)
    WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------
-- SECTION 3: RLS
-- ---------------------------------------------------------------

ALTER TABLE time_clock.time_adjustments ENABLE ROW LEVEL SECURITY;

-- Workers can see and create their own adjustment requests
CREATE POLICY "worker_own_adjustments"
    ON time_clock.time_adjustments FOR ALL
    USING (requested_by = auth.uid());
