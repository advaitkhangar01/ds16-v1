-- Rollback Migration: 039_feasibility_parking_and_owner_units.down.sql

ALTER TABLE project_salable_units
  DROP COLUMN IF EXISTS landowner_unit_count,
  DROP COLUMN IF EXISTS building_use;

ALTER TABLE project_area_statements
  DROP COLUMN IF EXISTS parking_config,
  DROP COLUMN IF EXISTS regulatory_profile;
