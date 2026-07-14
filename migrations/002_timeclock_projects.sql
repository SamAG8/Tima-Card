-- =============================================================
-- TIME CLOCK - Migration 002: Time Clock Projects table
-- Separate from public.projects (CDefApp) — no cross-app pollution
-- Run in Supabase SQL Editor
-- =============================================================

CREATE TABLE IF NOT EXISTS time_clock.projects (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id  UUID NOT NULL REFERENCES public.companies(id),
    name        TEXT NOT NULL,
    address     TEXT,
    is_active   BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_tc_projects_company
    ON time_clock.projects(company_id, is_active)
    WHERE deleted_at IS NULL;

ALTER TABLE time_clock.projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tc_projects_read"
    ON time_clock.projects FOR SELECT
    USING (true);
