# Document 3 — Database Change Specification
## Migration 030: Feasibility & Timeline Architectural Refinements

### 1. Existing Schema Analysis
The existing database schema (established in migrations `028` and `029`) provides solid foreign keys (`ON DELETE CASCADE`), indexes, and data isolation per `project_id`.
However, the new functional requirements necessitate specific additional columns and constraints.

---

### 2. Proposed DDL Changes (Migration `030_feasibility_and_timeline_refinements.sql`)

```sql
-- server/db/migrations/030_feasibility_and_timeline_refinements.sql
-- DS16: Building Configuration, Dual TDR, Gunthewari, Statutory Controls & P-Line Enhancements

BEGIN;

-- 1. TIMELINE CONFIGURATIONS (REQ-A)
ALTER TABLE timeline_configurations
  ADD COLUMN IF NOT EXISTS parking_floors JSONB DEFAULT '[]'::jsonb;
COMMENT ON COLUMN timeline_configurations.parking_floors IS 
  'Array of parking floor configurations, e.g. [{"type": "basement_2", "name": "Basement 2"}, {"type": "basement_1", "name": "Basement 1"}, {"type": "stilt", "name": "Stilt Parking"}]';

-- 2. PROJECT AREA STATEMENTS (REQ-B, REQ-D, REQ-K)
ALTER TABLE project_area_statements
  ADD COLUMN IF NOT EXISTS building_use VARCHAR(50) DEFAULT 'Residential' CHECK (building_use IN ('Residential', 'Commercial', 'Mixed Use')),
  ADD COLUMN IF NOT EXISTS regular_tdr_factor NUMERIC(8, 4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS slum_tdr_factor NUMERIC(8, 4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_gunthewari BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS road_width_m NUMERIC(6, 2) DEFAULT NULL;

COMMENT ON COLUMN project_area_statements.building_use IS 'Determines ancillary area percentage (Commercial 80%, Residential 60%)';
COMMENT ON COLUMN project_area_statements.regular_tdr_factor IS 'Regular TDR factor independently configured';
COMMENT ON COLUMN project_area_statements.slum_tdr_factor IS 'Slum TDR factor independently configured';
COMMENT ON COLUMN project_area_statements.is_gunthewari IS 'Whether plot is classified under Gunthewari scheme';
COMMENT ON COLUMN project_area_statements.road_width_m IS 'Road width in meters (strictly 9, 12, 15, 18, 24 for defined TDR tiers)';

-- Backfill existing area statements: map proposed_tdr_factor to regular_tdr_factor
UPDATE project_area_statements 
SET regular_tdr_factor = COALESCE(proposed_tdr_factor, 0)
WHERE regular_tdr_factor = 0 AND proposed_tdr_factor > 0;

-- 3. PROJECT AREA FLOORS (REQ-A, REQ-F, REQ-H)
ALTER TABLE project_area_floors
  ADD COLUMN IF NOT EXISTS floor_type VARCHAR(50) DEFAULT 'habitable' CHECK (floor_type IN ('habitable', 'parking', 'service', 'terrace')),
  ADD COLUMN IF NOT EXISTS is_lobby_overridden BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS no_of_units INTEGER DEFAULT 1 CHECK (no_of_units >= 0),
  ADD COLUMN IF NOT EXISTS area_for_1_unit NUMERIC(14, 4) DEFAULT 0;

COMMENT ON COLUMN project_area_floors.floor_type IS 'Distinguishes parking floors (non-FSI, non-saleable) from residential/commercial habitable floors';
COMMENT ON COLUMN project_area_floors.is_lobby_overridden IS 'True if architect manually changed lobby area from the automatic 15% P-Line default';
COMMENT ON COLUMN project_area_floors.no_of_units IS 'Number of residential/commercial units on this floor level';
COMMENT ON COLUMN project_area_floors.area_for_1_unit IS 'Calculated built-up area per unit: builtup_for_sale_sqm / no_of_units';

-- Backfill area_for_1_unit for existing floor rows
UPDATE project_area_floors
SET area_for_1_unit = CASE 
  WHEN COALESCE(no_of_units, 1) > 0 THEN ROUND(COALESCE(builtup_for_sale_sqm, 0) / COALESCE(no_of_units, 1), 4)
  ELSE 0 
END
WHERE area_for_1_unit = 0 AND builtup_for_sale_sqm > 0;

-- 4. PROJECT STATUTORY CHARGES (REQ-C, REQ-E, REQ-J)
ALTER TABLE project_statutory_charges
  ADD COLUMN IF NOT EXISTS is_enabled BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS rr_percentage NUMERIC(8, 4) DEFAULT NULL;

COMMENT ON COLUMN project_statutory_charges.is_enabled IS 'When false, row is visually displayed but excluded from total financial statutory demand';
COMMENT ON COLUMN project_statutory_charges.is_deleted IS 'Soft-delete flag preserving historical records and audit logs';
COMMENT ON COLUMN project_statutory_charges.rr_percentage IS 'Configurable percentage applied to Ready Reckoner rate (e.g. 10.0 for 10% of RR)';

-- Backfill default RR percentages for standard statutory charges
UPDATE project_statutory_charges SET rr_percentage = 10.00 WHERE charge_code = 'ANCILLARY_CHARGES' AND rr_percentage IS NULL;
UPDATE project_statutory_charges SET rr_percentage = 2.00 WHERE charge_code = 'DEVELOPMENT_CHARGES' AND rr_percentage IS NULL;
UPDATE project_statutory_charges SET rr_percentage = 40.00 WHERE charge_code = 'PREMIUM_FSI' AND rr_percentage IS NULL;
UPDATE project_statutory_charges SET rr_percentage = 3.00 WHERE charge_code = 'TDR_LOADING_CHARGES' AND rr_percentage IS NULL;

-- Disable Amalgamation Charges for all existing projects (REQ-J)
UPDATE project_statutory_charges 
SET is_enabled = FALSE 
WHERE charge_code = 'AMALGAMATION';

COMMIT;
```

---

### 3. Reversibility & Rollback Strategy (`down/030_feasibility_and_timeline_refinements.down.sql`)
```sql
BEGIN;
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
COMMIT;
```

---

### 4. Historical Data Preservation & Zero Data Loss Guarantee
1. **Existing Projects**: Existing records in `project_area_statements` continue functioning seamlessly. `regular_tdr_factor` is backfilled from `proposed_tdr_factor`.
2. **Floors**: Existing floor rows retain their area and heights; `no_of_units` defaults to 1 with `area_for_1_unit` computed accurately.
3. **Statutory Charges**: Existing charges default to `is_enabled = true`. Amalgamation charges are safely disabled (`is_enabled = false`) rather than hard-deleted, maintaining referential integrity in existing project snapshots.
