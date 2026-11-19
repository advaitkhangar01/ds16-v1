-- Down Migration: 032_feasibility_floor_rate_and_cost.down.sql

ALTER TABLE project_area_floors
  DROP COLUMN IF EXISTS cost_for_1_unit,
  DROP COLUMN IF EXISTS rate_per_sqm;
