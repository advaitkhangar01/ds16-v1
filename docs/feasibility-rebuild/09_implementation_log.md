# DS16 Area & Financial Feasibility Rebuild
## Document 09: Implementation & Engineering Log

**Project:** Design Studio 16 (DS16)  
**Module:** Project Details → Area & Financial Feasibility  
**Branch:** `main`  
**Date:** November 2026

---

### 1. Chronological Engineering Activity Log

#### Step 1: Database Migrations
- Created and executed migration `039_feasibility_parking_and_owner_units.sql`:
  - Added `parking_config` (JSONB) to `project_area_statements`.
  - Added `regulatory_profile` (VARCHAR) to `project_area_statements`.
  - Added `landowner_unit_count` (INTEGER) to `project_salable_units`.
  - Added `building_use` (VARCHAR) to `project_area_statements`.
- Created and executed migration `040_feasibility_cost_of_plot_inclusion.sql`:
  - Added `is_cost_of_plot_included` (BOOLEAN DEFAULT TRUE) to `project_financial_viabilities`.
- Created paired down-migrations (`.down.sql`) for both DDL scripts.
- Verified schema via `psql` / node migrator runner.

#### Step 2: Authoritative Backend Engine Rebuild (`server/services/feasibilityEngine.js`)
- **TDR 50/50 Split & Remainder Engine:**
  - Added `ROAD_WIDTH_TOTAL_TDR_MAP = { 9: 0.40, 12: 0.65, 15: 0.80, 18: 0.90, 24: 1.15 }`.
  - Implemented `deriveTdrSplit(totalTdrFactor, requestedRegularTdr)` enforcing equal default split, Regular TDR override, and automatic Slum remainder (`Total TDR - Regular TDR`).
  - Implemented upper bound constraint: Regular TDR clamped to Total TDR, deriving Slum TDR as 0.
- **Section H Cost of Plot:**
  - Implemented `is_cost_of_plot_included` toggle: when false, sets `effective = 0` in Total Project Cost while safely retaining `raw_amount` in database.
  - Sourced direct lump-sum land acquisition amount, eliminating compulsory per-sqft rate derivations.
- **Complete Domain Overrides:**
  - Added full override resolution for Section B (`cost_of_tdr`), Section D (`cost_of_construction`), Section E (`cost_of_basement`), Section F (`rent_amount`), Section G (`stacked_parking_cost`), and Section H (`cost_of_plot`).
  - Added explicit zero (`0`) override support across all cost items.
  - Enabled override support for `LABOUR_WELFARE_PARKING`.
- **Occupancy Parking Engine:**
  - Built `calculateParkingRequirements()` adhering to UDCPR Table 8-B/8-C (commercial carpet rate, tenement bands, 5% visitor parking, and 0.90 Nagpur authority multiplier).

#### Step 3: Client Calculation Engine Mirror (`client/src/utils/feasibilityCalculations.js`)
- Replaced inlined 300+ line recalculation logic in `AreaFeasibilityTab.jsx` with an authoritative client-side mirror of `feasibilityEngine.js`.
- Synchronized `ROAD_WIDTH_TOTAL_TDR_MAP`, `deriveTdrSplit()`, `calculateAreaMetrics()`, and `calculateFinancialMetrics()` ensuring 100% mathematical parity.
- Added CommonJS fallback module exports for Jest testing compatibility.

#### Step 4: Backend Feasibility Route Enhancements (`server/routes/feasibility.js`)
- Updated `PUT /area` to validate road widths (9, 12, 15, 18, 24m) and enforce `deriveTdrSplit()`.
- Updated `PUT /financial` to persist `is_cost_of_plot_included`.
- Confirmed `PUT /financial/overrides` accepts explicit `0` (`parsedVal >= 0`) and persists to JSONB.
- Confirmed `POST /financial/overrides/reset` removes overrides and restores calculated values.

#### Step 5: React UI Rebuild & Override Wiring
- **`AreaStatementForm.jsx`:**
  - Replaced "Combined TDR Factor" label with "Total TDR Factor: {totalTdr}".
  - Added visual formula breakdown banner: `Regular TDR ({reg}) + Slum TDR ({slum}) = Total TDR ({total})`.
  - Regular TDR: editable input with Override badge and "Reset (50%)" button.
  - Slum TDR: read-only derived remainder display.
  - Added AlertTriangle constraint warning banner if Regular TDR > Total TDR.
  - Project P-Line Override Modal: updated to allow explicit `0` (`parsed >= 0`).
- **`FinancialViabilityForm.jsx`:**
  - Added dedicated Cost of TDR (Section B) card with Override button and Reset button.
  - Added Override and Reset buttons to Section D (Civil Construction: `cost_of_construction`).
  - Added Override and Reset buttons to Section E (Basement: `cost_of_basement`).
  - Added Override and Reset buttons to Section F (Rent Compensation: `rent_amount`).
  - Added Override and Reset buttons to Section G (Stacked Parking: `stacked_parking_cost`).
  - Added Reset button to Section H (Cost of Plot: `cost_of_plot`).
  - Sourced `LABOUR_WELFARE_PARKING` with inline input and override modal support.
- **`AreaFeasibilityTab.jsx`:**
  - Synchronized `handleSaveFinancialOverride` and `handleResetFinancialOverride` to update local state immediately from API response.
  - Updated `handleSaveAll` to preserve manual statutory charges and overrides.

#### Step 6: Test Suite Creation & Verification
- Created `server/tests/tdrSplitAndOverrides.test.js` (14 comprehensive tests).
- Updated `server/tests/equalPlineDistribution.test.js` to match unified 50/50 TDR rules.
- Ran all 5 test suites (`manewadaBenchmark.test.js`, `equalPlineDistribution.test.js`, `feasibilityCalculationsParity.test.js`, `statutoryOverridesAndPlotRemoval.test.js`, `tdrSplitAndOverrides.test.js`): 51/51 passed.
- Ran client production build `npm run build`: built in 16.11s with 0 errors.
