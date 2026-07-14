-- =============================================================
-- TIME CLOCK PLATFORM - Migration 003
-- Add role and permission flags to public.users
-- Safe to run: additive only
-- =============================================================

-- ---------------------------------------------------------------
-- SECTION 1: Add role enum
-- ---------------------------------------------------------------

DO $$ BEGIN
    CREATE TYPE public.user_role_enum AS ENUM ('worker', 'manager', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------
-- SECTION 2: Add columns to public.users
-- ---------------------------------------------------------------

ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS role          public.user_role_enum NOT NULL DEFAULT 'worker',
    ADD COLUMN IF NOT EXISTS has_leave_access          BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS has_report_access         BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS has_team_report_access    BOOLEAN NOT NULL DEFAULT false;

-- ---------------------------------------------------------------
-- SECTION 3: Index for role lookups
-- ---------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_users_role
    ON public.users(role);
