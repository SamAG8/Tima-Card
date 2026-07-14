-- =============================================================
-- TIME CLOCK PLATFORM - Migration 004
-- Budget code hierarchy: divisions → categories → codes
-- Stored in public schema so all apps can reference them
-- Safe to run: additive only
-- =============================================================

-- ---------------------------------------------------------------
-- SECTION 1: divisions
-- Top-level trade grouping (e.g. Carpentry, Concrete, Electrical)
-- ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.divisions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id  UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    sort_order  INT NOT NULL DEFAULT 0,
    is_active   BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at  TIMESTAMPTZ
);

-- NULL company_id = system-level default (visible to all companies)
CREATE INDEX IF NOT EXISTS idx_divisions_company
    ON public.divisions(company_id, is_active)
    WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------
-- SECTION 2: budget_categories
-- Mid-level grouping under a division (e.g. Rough Framing, Finish)
-- ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.budget_categories (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    division_id UUID NOT NULL REFERENCES public.divisions(id) ON DELETE CASCADE,
    company_id  UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    sort_order  INT NOT NULL DEFAULT 0,
    is_active   BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_budget_categories_division
    ON public.budget_categories(division_id, is_active)
    WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------
-- SECTION 3: budget_codes
-- Leaf-level code used on time entries (e.g. Wood Framing, Fire Stop)
-- ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.budget_codes (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id UUID NOT NULL REFERENCES public.budget_categories(id) ON DELETE CASCADE,
    company_id  UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    code        TEXT NOT NULL,          -- short code e.g. "CARP-ROUGH-01"
    name        TEXT NOT NULL,          -- display name e.g. "Wood Framing"
    description TEXT,
    sort_order  INT NOT NULL DEFAULT 0,
    is_active   BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_budget_codes_category
    ON public.budget_codes(category_id, is_active)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_budget_codes_company
    ON public.budget_codes(company_id, is_active)
    WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------
-- SECTION 4: Seed default divisions + categories + codes
-- company_id = NULL means available to all companies
-- ---------------------------------------------------------------

-- Divisions
INSERT INTO public.divisions (id, name, sort_order) VALUES
    ('d1000000-0000-0000-0000-000000000001', 'Carpentry & Millwork',  10),
    ('d1000000-0000-0000-0000-000000000002', 'Concrete',              20),
    ('d1000000-0000-0000-0000-000000000003', 'Drywall & Insulation',  30),
    ('d1000000-0000-0000-0000-000000000004', 'Electrical',            40),
    ('d1000000-0000-0000-0000-000000000005', 'Mechanical',            50),
    ('d1000000-0000-0000-0000-000000000006', 'Fire Protection',       60),
    ('d1000000-0000-0000-0000-000000000007', 'Site Work',             70),
    ('d1000000-0000-0000-0000-000000000008', 'Flooring',              80),
    ('d1000000-0000-0000-0000-000000000009', 'Painting & Finishes',   90),
    ('d1000000-0000-0000-0000-000000000010', 'General Labour',       100)
ON CONFLICT DO NOTHING;

-- Budget Categories
INSERT INTO public.budget_categories (id, division_id, name, sort_order) VALUES
    -- Carpentry & Millwork
    ('c1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 'Rough Framing',       10),
    ('c1000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000001', 'Finish Carpentry',    20),
    ('c1000000-0000-0000-0000-000000000003', 'd1000000-0000-0000-0000-000000000001', 'Blocking & Backing',  30),
    -- Concrete
    ('c1000000-0000-0000-0000-000000000004', 'd1000000-0000-0000-0000-000000000002', 'Foundation',          10),
    ('c1000000-0000-0000-0000-000000000005', 'd1000000-0000-0000-0000-000000000002', 'Flatwork',            20),
    ('c1000000-0000-0000-0000-000000000006', 'd1000000-0000-0000-0000-000000000002', 'Formwork',            30),
    -- Drywall & Insulation
    ('c1000000-0000-0000-0000-000000000007', 'd1000000-0000-0000-0000-000000000003', 'Insulation',          10),
    ('c1000000-0000-0000-0000-000000000008', 'd1000000-0000-0000-0000-000000000003', 'Drywall - Hang',      20),
    ('c1000000-0000-0000-0000-000000000009', 'd1000000-0000-0000-0000-000000000003', 'Drywall - Finish',    30),
    -- Electrical
    ('c1000000-0000-0000-0000-000000000010', 'd1000000-0000-0000-0000-000000000004', 'Rough-in',            10),
    ('c1000000-0000-0000-0000-000000000011', 'd1000000-0000-0000-0000-000000000004', 'Finish',              20),
    -- Mechanical
    ('c1000000-0000-0000-0000-000000000012', 'd1000000-0000-0000-0000-000000000005', 'HVAC',                10),
    ('c1000000-0000-0000-0000-000000000013', 'd1000000-0000-0000-0000-000000000005', 'Plumbing',            20),
    -- Fire Protection
    ('c1000000-0000-0000-0000-000000000014', 'd1000000-0000-0000-0000-000000000006', 'Fire Stop',           10),
    ('c1000000-0000-0000-0000-000000000015', 'd1000000-0000-0000-0000-000000000006', 'Sprinkler',           20),
    -- Site Work
    ('c1000000-0000-0000-0000-000000000016', 'd1000000-0000-0000-0000-000000000007', 'Excavation',          10),
    ('c1000000-0000-0000-0000-000000000017', 'd1000000-0000-0000-0000-000000000007', 'Backfill',            20),
    ('c1000000-0000-0000-0000-000000000018', 'd1000000-0000-0000-0000-000000000007', 'Site Cleanup',        30),
    -- Flooring
    ('c1000000-0000-0000-0000-000000000019', 'd1000000-0000-0000-0000-000000000008', 'Tile',                10),
    ('c1000000-0000-0000-0000-000000000020', 'd1000000-0000-0000-0000-000000000008', 'Hardwood',            20),
    ('c1000000-0000-0000-0000-000000000021', 'd1000000-0000-0000-0000-000000000008', 'Vinyl & LVP',         30),
    -- Painting & Finishes
    ('c1000000-0000-0000-0000-000000000022', 'd1000000-0000-0000-0000-000000000009', 'Painting',            10),
    ('c1000000-0000-0000-0000-000000000023', 'd1000000-0000-0000-0000-000000000009', 'Caulking & Sealing',  20),
    -- General Labour
    ('c1000000-0000-0000-0000-000000000024', 'd1000000-0000-0000-0000-000000000010', 'General Labour',      10),
    ('c1000000-0000-0000-0000-000000000025', 'd1000000-0000-0000-0000-000000000010', 'Cleanup',             20)
ON CONFLICT DO NOTHING;

-- Budget Codes
INSERT INTO public.budget_codes (category_id, code, name) VALUES
    -- Rough Framing
    ('c1000000-0000-0000-0000-000000000001', 'CARP-RF-01', 'Wood Framing'),
    ('c1000000-0000-0000-0000-000000000001', 'CARP-RF-02', 'Steel Stud Framing'),
    ('c1000000-0000-0000-0000-000000000001', 'CARP-RF-03', 'Roof Framing'),
    -- Finish Carpentry
    ('c1000000-0000-0000-0000-000000000002', 'CARP-FN-01', 'Doors & Frames'),
    ('c1000000-0000-0000-0000-000000000002', 'CARP-FN-02', 'Trim & Molding'),
    ('c1000000-0000-0000-0000-000000000002', 'CARP-FN-03', 'Cabinets & Millwork'),
    -- Blocking & Backing
    ('c1000000-0000-0000-0000-000000000003', 'CARP-BL-01', 'Blocking'),
    ('c1000000-0000-0000-0000-000000000003', 'CARP-BL-02', 'Backing'),
    -- Foundation
    ('c1000000-0000-0000-0000-000000000004', 'CONC-FD-01', 'Footing Pour'),
    ('c1000000-0000-0000-0000-000000000004', 'CONC-FD-02', 'Foundation Wall'),
    -- Flatwork
    ('c1000000-0000-0000-0000-000000000005', 'CONC-FW-01', 'Slab on Grade'),
    ('c1000000-0000-0000-0000-000000000005', 'CONC-FW-02', 'Elevated Slab'),
    -- Formwork
    ('c1000000-0000-0000-0000-000000000006', 'CONC-FM-01', 'Formwork - Set'),
    ('c1000000-0000-0000-0000-000000000006', 'CONC-FM-02', 'Formwork - Strip'),
    -- Insulation
    ('c1000000-0000-0000-0000-000000000007', 'DW-IN-01', 'Batt Insulation'),
    ('c1000000-0000-0000-0000-000000000007', 'DW-IN-02', 'Spray Foam'),
    -- Drywall
    ('c1000000-0000-0000-0000-000000000008', 'DW-HG-01', 'Drywall Hang'),
    ('c1000000-0000-0000-0000-000000000009', 'DW-FN-01', 'Tape & Mud'),
    ('c1000000-0000-0000-0000-000000000009', 'DW-FN-02', 'Sand & Prime'),
    -- Electrical
    ('c1000000-0000-0000-0000-000000000010', 'ELEC-RI-01', 'Electrical Rough-in'),
    ('c1000000-0000-0000-0000-000000000011', 'ELEC-FN-01', 'Electrical Finish'),
    -- HVAC
    ('c1000000-0000-0000-0000-000000000012', 'MECH-HV-01', 'HVAC Rough-in'),
    ('c1000000-0000-0000-0000-000000000012', 'MECH-HV-02', 'HVAC Finish'),
    -- Plumbing
    ('c1000000-0000-0000-0000-000000000013', 'MECH-PL-01', 'Plumbing Rough-in'),
    ('c1000000-0000-0000-0000-000000000013', 'MECH-PL-02', 'Plumbing Finish'),
    -- Fire Protection
    ('c1000000-0000-0000-0000-000000000014', 'FIRE-FS-01', 'Fire Stop - Penetrations'),
    ('c1000000-0000-0000-0000-000000000014', 'FIRE-FS-02', 'Fire Stop - Joints'),
    ('c1000000-0000-0000-0000-000000000015', 'FIRE-SP-01', 'Sprinkler Rough-in'),
    ('c1000000-0000-0000-0000-000000000015', 'FIRE-SP-02', 'Sprinkler Finish'),
    -- Site Work
    ('c1000000-0000-0000-0000-000000000016', 'SITE-EX-01', 'Excavation'),
    ('c1000000-0000-0000-0000-000000000017', 'SITE-BF-01', 'Backfill'),
    ('c1000000-0000-0000-0000-000000000018', 'SITE-CL-01', 'Site Cleanup'),
    -- Flooring
    ('c1000000-0000-0000-0000-000000000019', 'FLR-TL-01', 'Tile Installation'),
    ('c1000000-0000-0000-0000-000000000020', 'FLR-HW-01', 'Hardwood Installation'),
    ('c1000000-0000-0000-0000-000000000021', 'FLR-VL-01', 'Vinyl & LVP Installation'),
    -- Painting
    ('c1000000-0000-0000-0000-000000000022', 'PAINT-01', 'Interior Painting'),
    ('c1000000-0000-0000-0000-000000000022', 'PAINT-02', 'Exterior Painting'),
    ('c1000000-0000-0000-0000-000000000023', 'PAINT-CK-01', 'Caulking & Sealing'),
    -- General Labour
    ('c1000000-0000-0000-0000-000000000024', 'GEN-LB-01', 'General Labour'),
    ('c1000000-0000-0000-0000-000000000025', 'GEN-CL-01', 'General Cleanup')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------
-- SECTION 5: RLS — readable by all authenticated, writable by service_role
-- ---------------------------------------------------------------

ALTER TABLE public.divisions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_codes      ENABLE ROW LEVEL SECURITY;

CREATE POLICY "divisions_read_authenticated"
    ON public.divisions FOR SELECT
    TO authenticated USING (true);

CREATE POLICY "budget_categories_read_authenticated"
    ON public.budget_categories FOR SELECT
    TO authenticated USING (true);

CREATE POLICY "budget_codes_read_authenticated"
    ON public.budget_codes FOR SELECT
    TO authenticated USING (true);
