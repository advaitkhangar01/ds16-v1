-- Migration: 032_feasibility_floor_rate_and_cost.sql
-- Description: Adds rate_per_sqm and cost_for_1_unit to project_area_floors for floor-wise financial viability

ALTER TABLE project_area_floors
  ADD COLUMN IF NOT EXISTS rate_per_sqm NUMERIC(14, 2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS cost_for_1_unit NUMERIC(15, 2) DEFAULT 0.00;

COMMENT ON COLUMN project_area_floors.rate_per_sqm IS 'Rate in Rupees per sq m for the saleable area of this floor';
COMMENT ON COLUMN project_area_floors.cost_for_1_unit IS 'Calculated cost/realization for 1 unit on this floor (area_for_1_unit * rate_per_sqm)';

-- Backfill cost_for_1_unit where rate_per_sqm and area_for_1_unit are present
UPDATE project_area_floors
SET cost_for_1_unit = ROUND(COALESCE(area_for_1_unit, 0) * COALESCE(rate_per_sqm, 0), 2)
WHERE cost_for_1_unit = 0 AND rate_per_sqm > 0 AND area_for_1_unit > 0;
