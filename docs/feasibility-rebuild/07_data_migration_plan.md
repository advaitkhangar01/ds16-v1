# DS16 Area & Financial Feasibility Rebuild
## Document 07: Data Migration Plan & Backward Compatibility Assessment

**Project:** Design Studio 16 (DS16)  
**Module:** Project Details → Area & Financial Feasibility  
**Status:** Successfully Applied & Verified  
**Date:** November 2026

---

### 1. Migration Principles & Non-Negotiables

1. **Zero Data Loss:** Never drop, truncate, reseed, or overwrite production tables.
2. **Backward Compatibility:** All migrations must be strictly additive (`ADD COLUMN IF NOT EXISTS`) with sensible default values.
3. **Reversible DDL:** Every forward migration file must have a paired down-migration file allowing clean rollback.
4. **Idempotence:** Migrations must be safe to execute multiple times without throwing errors or mutating existing data.

---

### 2. Migration Execution Summary

The rebuild introduced two targeted, backward-compatible migrations:

#### 2.1 Migration 039: `039_feasibility_parking_and_owner_units.sql`
- **Target Tables:** `project_area_statements`, `project_salable_units`
- **Purpose:** Adds structured support for occupancy parking configuration, regulatory profiles, and landowner unit allocations.
- **DDL Executed:**
  ```sql
  ALTER TABLE project_area_statements 
  ADD COLUMN IF NOT EXISTS parking_config JSONB DEFAULT '{}'::jsonb;

  ALTER TABLE project_area_statements 
  ADD COLUMN IF NOT EXISTS regulatory_profile VARCHAR(50) DEFAULT 'UDCPR_2020';

  ALTER TABLE project_salable_units 
  ADD COLUMN IF NOT EXISTS landowner_unit_count INTEGER DEFAULT 0;

  ALTER TABLE project_area_statements 
  ADD COLUMN IF NOT EXISTS building_use VARCHAR(50) DEFAULT 'Residential';
  ```
- **Rollback File:** `server/db/migrations/039_feasibility_parking_and_owner_units.down.sql`

#### 2.2 Migration 040: `040_feasibility_cost_of_plot_inclusion.sql`
- **Target Table:** `project_financial_viabilities`
- **Purpose:** Adds the `is_cost_of_plot_included` boolean flag to allow architects and developers to explicitly toggle whether the lump-sum land acquisition amount (Section H) is included in the Total Project Cost.
- **DDL Executed:**
  ```sql
  ALTER TABLE project_financial_viabilities 
  ADD COLUMN IF NOT EXISTS is_cost_of_plot_included BOOLEAN DEFAULT TRUE;
  ```
- **Rollback File:** `server/db/migrations/040_feasibility_cost_of_plot_inclusion.down.sql`

---

### 3. Verification & Database Integrity Check

Both migrations were applied via the DS16 database migrator (`node server/utils/migrator.js`). A live schema query confirmed:
- Columns exist with correct data types and default constraints.
- Existing historical feasibility records retained all prior input values without corruption.
- Projects without existing overrides default gracefully (`is_cost_of_plot_included = TRUE`, `parking_config = '{}'`).
