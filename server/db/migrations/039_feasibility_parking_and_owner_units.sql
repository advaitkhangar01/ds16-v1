-- Migration: 039_feasibility_parking_and_owner_units.sql
-- Description: Adds parking_config and regulatory_profile to project_area_statements,
-- and landowner_unit_count and building_use to project_salable_units

-- 1. PROJECT AREA STATEMENTS
ALTER TABLE project_area_statements
  ADD COLUMN IF NOT EXISTS parking_config JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS regulatory_profile VARCHAR(100) DEFAULT 'UDCPR_2020_NMC_STANDARD';

COMMENT ON COLUMN project_area_statements.parking_config IS 
  'Occupancy parking calculation parameters (commercial carpet, tenement counts, visitor rate, authority multiplier)';
COMMENT ON COLUMN project_area_statements.regulatory_profile IS 
  'Identifier of versioned regulatory profile (e.g. UDCPR_2020_NMC_STANDARD)';

-- 2. PROJECT SALABLE UNITS
ALTER TABLE project_salable_units
  ADD COLUMN IF NOT EXISTS landowner_unit_count INTEGER DEFAULT 0 CHECK (landowner_unit_count >= 0),
  ADD COLUMN IF NOT EXISTS building_use VARCHAR(50) DEFAULT 'Residential';

COMMENT ON COLUMN project_salable_units.landowner_unit_count IS 
  'Number of units allocated to landowner / rehabilitation (excluded from developer sales realization)';
COMMENT ON COLUMN project_salable_units.building_use IS 
  'Inventory classification: Residential or Commercial';
