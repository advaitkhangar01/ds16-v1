-- Down Migration: 042_critical_area_statement_correction.down.sql

ALTER TABLE project_salable_units
  DROP COLUMN IF EXISTS source_floor_id;

ALTER TABLE project_area_statements
  DROP COLUMN IF EXISTS is_regular_tdr_overridden,
  DROP COLUMN IF EXISTS primary_fsi_commercial_pct;
