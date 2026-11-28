-- Migration: 042_critical_area_statement_correction.sql
-- Description: Non-destructive schema support and data hygiene for Critical Area Statement Correction:
--   1. Store both Residential & Commercial Mixed-Use Primary FSI allocations explicitly (sum = 100%, both > 0).
--   2. Track explicit Regular TDR override state separately from default 50/50 splits.
--   3. Non-destructively repair legacy un-split TDR defaults (e.g., 9m road stored as Regular=0.40, Slum=0.00 or unconfigured 0/0).
--   4. Support linking Financial Viability salable unit rows directly to Area Statement floor per-unit areas.

ALTER TABLE project_area_statements
  ADD COLUMN IF NOT EXISTS primary_fsi_commercial_pct NUMERIC(6,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS is_regular_tdr_overridden BOOLEAN NOT NULL DEFAULT FALSE;

-- Backfill Commercial allocation % where Residential Mixed-Use allocation already exists
UPDATE project_area_statements
SET primary_fsi_commercial_pct = ROUND(100.0 - primary_fsi_residential_pct, 2)
WHERE building_use = 'Mixed Use'
  AND primary_fsi_residential_pct IS NOT NULL
  AND primary_fsi_commercial_pct IS NULL;

-- Preserve intentional Regular TDR splits (where Slum TDR > 0 and split differs from 50/50)
UPDATE project_area_statements
SET is_regular_tdr_overridden = TRUE
WHERE is_gunthewari = FALSE
  AND road_width_m IN (9, 12, 15, 18, 24)
  AND COALESCE(slum_tdr_factor, 0) > 0.0001
  AND regular_tdr_factor IS NOT NULL
  AND ABS(
    regular_tdr_factor - (
      CASE road_width_m
        WHEN 9 THEN 0.2000
        WHEN 12 THEN 0.3250
        WHEN 15 THEN 0.4000
        WHEN 18 THEN 0.4500
        WHEN 24 THEN 0.5500
      END
    )
  ) > 0.0001;

-- Non-destructively repair legacy un-split road-width rows where Full Total TDR sat in Regular TDR with Slum = 0
UPDATE project_area_statements
SET
  total_tdr_factor = CASE road_width_m
    WHEN 9 THEN 0.4000
    WHEN 12 THEN 0.6500
    WHEN 15 THEN 0.8000
    WHEN 18 THEN 0.9000
    WHEN 24 THEN 1.1000
  END,
  regular_tdr_factor = CASE road_width_m
    WHEN 9 THEN 0.2000
    WHEN 12 THEN 0.3250
    WHEN 15 THEN 0.4000
    WHEN 18 THEN 0.4500
    WHEN 24 THEN 0.5500
  END,
  slum_tdr_factor = CASE road_width_m
    WHEN 9 THEN 0.2000
    WHEN 12 THEN 0.3250
    WHEN 15 THEN 0.4000
    WHEN 18 THEN 0.4500
    WHEN 24 THEN 0.5500
  END,
  is_regular_tdr_overridden = FALSE
WHERE is_gunthewari = FALSE
  AND road_width_m IN (9, 12, 15, 18, 24)
  AND COALESCE(slum_tdr_factor, 0) <= 0.0001
  AND ABS(
    COALESCE(regular_tdr_factor, 0) - (
      CASE road_width_m
        WHEN 9 THEN 0.4000
        WHEN 12 THEN 0.6500
        WHEN 15 THEN 0.8000
        WHEN 18 THEN 0.9000
        WHEN 24 THEN 1.1000
      END
    )
  ) <= 0.0001;

-- Normalize unconfigured rows where both regular & slum defaulted to 0 with no road width so 50/50 split applies cleanly
UPDATE project_area_statements
SET regular_tdr_factor = NULL, slum_tdr_factor = NULL
WHERE is_gunthewari = FALSE
  AND road_width_m IS NULL
  AND total_tdr_factor IS NULL
  AND COALESCE(regular_tdr_factor, 0) = 0
  AND COALESCE(slum_tdr_factor, 0) = 0;

ALTER TABLE project_salable_units
  ADD COLUMN IF NOT EXISTS source_floor_id INTEGER REFERENCES project_area_floors(id) ON DELETE SET NULL DEFAULT NULL;
