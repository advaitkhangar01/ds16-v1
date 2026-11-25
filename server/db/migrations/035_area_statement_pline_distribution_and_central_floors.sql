-- Migration 035: Area Statement Equal P-Line Distribution, Controlled Overrides, and Central Building Floors
-- Enables central floor synchronization from timeline_configurations and controlled overrides for total proposed P-Line, floor P-Line, and financial viability

-- 1. Project Area Statements overrides
ALTER TABLE project_area_statements
  ADD COLUMN IF NOT EXISTS total_proposed_pline_override_sqm NUMERIC(14, 4) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS is_proposed_pline_overridden BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS proposed_pline_override_reason TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS proposed_pline_overridden_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS proposed_pline_overridden_at TIMESTAMPTZ DEFAULT NULL;

-- 2. Project Area Floors central identification and override tracking
ALTER TABLE project_area_floors
  ADD COLUMN IF NOT EXISTS floor_key VARCHAR(50) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS is_pline_overridden BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS calculated_pline_sqm NUMERIC(14, 4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pline_override_reason TEXT DEFAULT NULL;

-- 3. Project Financial Viabilities controlled overrides and audit history
ALTER TABLE project_financial_viabilities
  ADD COLUMN IF NOT EXISTS overrides JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS override_history JSONB DEFAULT '[]'::jsonb;

-- 4. Backfill existing floor records with deterministic floor_key and active status
UPDATE project_area_floors
SET floor_key = CASE
  WHEN LOWER(floor_name) LIKE '%basement 2%' THEN 'basement_2'
  WHEN LOWER(floor_name) LIKE '%basement 1%' OR LOWER(floor_name) = 'basement' THEN 'basement_1'
  WHEN LOWER(floor_name) LIKE '%ground%' OR floor_order = 1 THEN 'ground_floor'
  WHEN LOWER(floor_name) LIKE '%terrace%' THEN 'terrace'
  ELSE 'floor_' || floor_order
END
WHERE floor_key IS NULL;

UPDATE project_area_floors
SET is_active = TRUE
WHERE is_active IS NULL;
