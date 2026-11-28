-- Rollback Migration: 041_feasibility_scope_correction_columns.down.sql

DROP INDEX IF EXISTS uq_project_feasibility_snapshots_proj_ver;

ALTER TABLE project_salable_units
  DROP COLUMN IF EXISTS loading_pct,
  DROP COLUMN IF EXISTS loading_mode;

ALTER TABLE project_financial_viabilities
  DROP COLUMN IF EXISTS version,
  DROP COLUMN IF EXISTS tdr_purchase_factor;

ALTER TABLE project_area_statements
  DROP COLUMN IF EXISTS version,
  DROP COLUMN IF EXISTS primary_fsi_residential_pct,
  DROP COLUMN IF EXISTS proposed_slum_tdr_factor,
  DROP COLUMN IF EXISTS proposed_regular_tdr_factor,
  DROP COLUMN IF EXISTS proposed_paid_fsi_factor,
  DROP COLUMN IF EXISTS total_tdr_factor;
