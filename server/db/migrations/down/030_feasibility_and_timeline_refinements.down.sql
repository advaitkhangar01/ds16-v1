-- server/db/migrations/down/030_feasibility_and_timeline_refinements.down.sql
-- DS16: Rollback for Feasibility & Timeline Architectural Refinements

ALTER TABLE project_statutory_charges
  DROP COLUMN IF EXISTS rr_percentage,
  DROP COLUMN IF EXISTS deleted_at,
  DROP COLUMN IF EXISTS is_deleted,
  DROP COLUMN IF EXISTS is_enabled;

ALTER TABLE project_area_floors
  DROP COLUMN IF EXISTS area_for_1_unit,
  DROP COLUMN IF EXISTS no_of_units,
  DROP COLUMN IF EXISTS is_lobby_overridden,
  DROP COLUMN IF EXISTS floor_type;

ALTER TABLE project_area_statements
  DROP COLUMN IF EXISTS road_width_m,
  DROP COLUMN IF EXISTS is_gunthewari,
  DROP COLUMN IF EXISTS slum_tdr_factor,
  DROP COLUMN IF EXISTS regular_tdr_factor,
  DROP COLUMN IF EXISTS building_use;

ALTER TABLE timeline_configurations
  DROP COLUMN IF EXISTS parking_floors;
