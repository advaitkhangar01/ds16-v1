-- Migration: 041_feasibility_scope_correction_columns.sql
-- Description: Additive schema support for Scope Correction (FR-05/09 proposed FSI/TDR factors,
--              FR-11 Mixed-Use Primary FSI Res/Comm allocation %, FR-31 tdr_purchase_factor,
--              FR-32 loading_mode/loading_pct, optimistic concurrency version, and snapshot uniqueness)

ALTER TABLE project_area_statements
  ADD COLUMN IF NOT EXISTS total_tdr_factor NUMERIC(8,4) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS proposed_paid_fsi_factor NUMERIC(8,4) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS proposed_regular_tdr_factor NUMERIC(8,4) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS proposed_slum_tdr_factor NUMERIC(8,4) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS primary_fsi_residential_pct NUMERIC(6,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

-- Non-destructive backfill of total_tdr_factor only where split factors already exist
UPDATE project_area_statements
SET total_tdr_factor = (COALESCE(regular_tdr_factor, 0) + COALESCE(slum_tdr_factor, 0))
WHERE total_tdr_factor IS NULL
  AND (COALESCE(regular_tdr_factor, 0) + COALESCE(slum_tdr_factor, 0)) > 0;

ALTER TABLE project_financial_viabilities
  ADD COLUMN IF NOT EXISTS tdr_purchase_factor NUMERIC(8,4) DEFAULT 0.55,
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

ALTER TABLE project_salable_units
  ADD COLUMN IF NOT EXISTS loading_mode VARCHAR(20) NOT NULL DEFAULT 'fixed_sqft',
  ADD COLUMN IF NOT EXISTS loading_pct NUMERIC(8,4) DEFAULT 0.00;

-- Guarded unique index on snapshot versions (skip safely only if pre-existing duplicates exist)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM project_feasibility_snapshots
    GROUP BY project_id, version_number
    HAVING COUNT(*) > 1
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS uq_project_feasibility_snapshots_proj_ver
      ON project_feasibility_snapshots(project_id, version_number);
  END IF;
END $$;
