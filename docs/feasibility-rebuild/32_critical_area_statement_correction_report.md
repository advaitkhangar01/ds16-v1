# DS16 — CRITICAL AREA STATEMENT CORRECTION REPORT
## FSI Logic, TDR Logic, Proposed P-Line, Per-Unit Saleable Area & Financial Integration Verification

**Document Version:** 1.0.0  
**Date:** 2026-11-28  
**Scope:** Area Statement and Financial Viability Rebuild — Critical Calculation Logic & Tabular Presentation Correction  
**Application:** Design Studio 16 (DS16)

---

## 1. Executive Summary

This critical correction addresses and resolves all calculation logic discrepancies, Gunthewari/TDR preservation rules, mixed-use ancillary allocations, and tabular floor-wise P-Line structures across the **Area Statement** and **Financial Viability** modules.

The implementation strictly maintains the approved **two-tab architecture** (`Area Statement` and `Financial Viability`) without introducing auxiliary tabs, dashboards, duplicate floor tables, or unauthorized inputs.

All 10 test suites comprising **139 automated tests** passed with 0 failures, ESLint verified clean code quality, and Vite production bundle compiled cleanly in 14.32 seconds.

---

## 2. Business Rules & Formula Reconciliation

| # | Domain / Component | Previous / Defective Implementation | Approved & Implemented Canonical Rule |
|---|---|---|---|
| **1** | **Net Plotable Area** | `Net Plotable Area = min(Plot, Site) - DP`, clamped `< 0` to 0. | `Net Plotable Area = Plot Area - Proposed DP Deductions`. City Survey & Site Area are strictly independent reference measurements. Inputs rejecting `DP > Plot Area`. Engine never clamps negative results to 0. |
| **2** | **Basic FSI Area** | Sometimes used Site Area as baseline. | `Basic FSI Area = Net Plotable Area × Basic FSI Factor`. |
| **3** | **Paid FSI Non-Auto-Consumption** | Proposed Paid FSI automatically equated to Max Permissible (0.50), charging unnecessary statutory fees. | Max Permissible (0.50), Automatically Suggested (`0` unless building height/floors exceed Basic FSI), and Effective Proposed are kept strictly separate. Architect chooses consumption; default is 0. Financial charges apply strictly to effective proposed consumption. |
| **4** | **TDR 5-Tier Matrix & 50/50 Split** | 9m road width had a legacy defect assigning `Regular = 0.40, Slum = 0.00`. | Strict 5-tier Road-Width table: 9m (0.40), 12m (0.65), 15m (0.80), 18m (0.90), 24m (1.10). Default 50/50 split (`Regular = Total / 2`, `Slum = Total - Regular`). 9m legacy defect healed to `0.20 / 0.20`. Regular TDR editable `0..Total`; Slum auto-balances. |
| **5** | **Gunthewari Eligibility Preservation** | Switching to Gunthewari clobbered `regular_tdr_factor` to 0 in the database, destroying underlying road-width split. | Gunthewari restricts **Eligible TDR** to Slum TDR only (`Eligible Regular = 0`, `Eligible TDR = Slum TDR`). The underlying Road-Width 50/50 split on the statement record is preserved intact without clobbering. |
| **6** | **Mixed-Use Primary FSI Allocation** | Commercial % was hardcoded or omitted from UI; labels showed confusing `(60% Ancillary)` strings. | Clean dropdown labels (`Residential`, `Commercial`, `Mixed Use`). When `Mixed Use` is selected, separate numeric inputs for `Residential %` and `Commercial %` appear, strictly validating `Res + Comm = 100%` and both `> 0`. Ancillary FSI applies 60% strictly to residential primary and 80% strictly to commercial primary. |
| **7** | **Floor-wise Proposed P-Line Table (Cols 1–6)** | Displayed 10 columns including duplicate Building Use, Primary FSI Area, Ancillary Area, and Total Built-up for Sale. | Exact 6 columns: `1. Floor`, `2. Height (m)`, `3. P-Line Area (Sq. Mtr.)`, `4. Lobby Area (Sq. Mtr.)`, `5. No. of Units`, `6. Built-up for Sale (1 Unit) (Sq. Mtr.)`. Lobby defaults to 15% (validation rejects `Lobby > P-Line`). Per-unit area calculated at full precision: `(P-Line - Lobby) / No. of Units`, rendered as `—` when units = 0. |
| **8** | **Table 2 Total & Weighted Average** | Table total simply summed or averaged per-unit areas incorrectly. | Total row computes Total Height, Total P-Line, Total Lobby, Total Units, and **Weighted Average Area per Unit** (`Total Saleable / Total Units`), clearly labeled with "Avg:". |
| **9** | **Area Balance Tolerance & Height H** | Strict zero-difference balance warning even for minor floating point rounding differences; height included basements and roof terraces. | Area Balance = `Permissible P-Line - Floor Proposed Sum`. Documented rounding tolerance is `±0.05 sq m` (`isAreaBalanceWithinTolerance`). Height `H` sums only above-ground non-basement/non-terrace floors (`Margin = H / 5`). |
| **10** | **Financial Receipts Integration** | Receipts used disconnected static entries requiring duplicate data entry. | Receipts section in Financial Viability links to Area Statement habitable floors via `source_floor_id`, automatically computing `Floor Per-Unit Area × 10.7639104167 × Rate / sq ft` with developer unit counts, without creating duplicate entry tables. |

---

## 3. Database Schema Changes (`Migration 042`)

Migration file: `server/db/migrations/042_critical_area_statement_correction.sql`  
Rollback file: `server/db/migrations/down/042_critical_area_statement_correction.down.sql`

```sql
-- 1. Ensure primary FSI allocation columns exist for Mixed Use
ALTER TABLE project_area_statements
  ADD COLUMN IF NOT EXISTS primary_fsi_commercial_pct NUMERIC(5,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS is_regular_tdr_overridden BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Ensure floor table contains unit columns and override tracking
ALTER TABLE project_area_floors
  ADD COLUMN IF NOT EXISTS no_of_units INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS area_for_1_unit NUMERIC(14,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_pline_overridden BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS pline_override_reason TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS contributes_to_height BOOLEAN NOT NULL DEFAULT TRUE;

-- 3. Ensure financial salable units table contains source floor reference
ALTER TABLE project_salable_units
  ADD COLUMN IF NOT EXISTS source_floor_id INTEGER REFERENCES project_area_floors(id) ON DELETE SET NULL;
```

*Verification performed:* Tested non-destructively in isolated cloned test database `ds16_audit_mig042` verifying clean forward execution, rollback, and re-application prior to applying to development database.

---

## 4. Source Files Modified & Verified

1. **Backend Engine & Calculations:**
   - [server/services/feasibilityEngine.js](file:///d:/Freelance/ds16-v1/server/services/feasibilityEngine.js): Net Plotable Area without clamping, 5-tier TDR with 9m fix and Gunthewari preservation, auto-suggestion defaulting to 0, Mixed Use 60/80% ancillary, 6-column floor P-line arithmetic with full precision, weighted average per unit, `±0.05 sq m` tolerance, height exclusion for basements/terraces, and floor-linked Receipts.
   - [server/services/buildingHierarchyService.js](file:///d:/Freelance/ds16-v1/server/services/buildingHierarchyService.js): `height_meters = 0.00` default for `basement_*` and `terrace` floors.
   - [server/services/feasibilityExportService.js](file:///d:/Freelance/ds16-v1/server/services/feasibilityExportService.js): Excel and PDF generators updated to exact 6-column Table 2 (`1. Floor`, `2. Height (m)`, `3. P-Line Area`, `4. Lobby Area`, `5. No. of Units`, `6. Built-up for Sale (1 Unit)`), height-contributing SUM formula, weighted average formula `IF(F{tot}>0,(D{tot}-E{tot})/F{tot},"—")`, and Receipts formula linking to `'Area (SQ M)'!G{row}*10.7639104167`.
   - [server/routes/feasibility.js](file:///d:/Freelance/ds16-v1/server/routes/feasibility.js): Floor persistence preserving `is_pline_overridden` on insert/update, non-destructive Gunthewari toggle, salable-units POST/PUT resolving floor unit counts and developer units.

2. **Frontend UI & Utility:**
   - [client/src/utils/feasibilityCalculations.js](file:///d:/Freelance/ds16-v1/client/src/utils/feasibilityCalculations.js): `AREA_BALANCE_ROUNDING_TOLERANCE_SQM = 0.05`, `deriveTdrSplit` with Gunthewari non-clobbering preservation, and weighted average calculation.
   - [client/src/components/projects/feasibility/AreaFeasibilityTab.jsx](file:///d:/Freelance/ds16-v1/client/src/components/projects/feasibility/AreaFeasibilityTab.jsx): Mixed-use validation, floor payload sync, and Receipts floor-sync handler.
   - [client/src/components/projects/feasibility/AreaStatementForm.jsx](file:///d:/Freelance/ds16-v1/client/src/components/projects/feasibility/AreaStatementForm.jsx): Clean Building Use labels, separate Mixed Use Res % / Comm % controls with sum badge, Gunthewari split vs eligible TDR display, Reset 50/50 TDR button, Reset to Calculated Paid FSI / TDR button, exact 6-column Proposed P-Line table with integer unit input, 3-decimal unit area, weighted average footer, Area Balance tolerance badge, and `Excl. H` indicator.
   - [client/src/components/projects/feasibility/FinancialViabilityForm.jsx](file:///d:/Freelance/ds16-v1/client/src/components/projects/feasibility/FinancialViabilityForm.jsx): `source_floor_id` linking selector in Add/Edit Salable Unit drawer, synced Floor Unit Areas summary strip, and "Sync Floor Units" action button in Receipts header.

---

## 5. Automated Verification Results

### 5.1 Test Suites Execution (Jest)

```powershell
cd server; npx jest tests/criticalAreaCorrection.test.js tests/scopeCorrectionRebuild.test.js tests/tdrSplitAndOverrides.test.js tests/remediationDefects.test.js tests/statutoryOverridesAndPlotRemoval.test.js tests/feasibilityCalculationsParity.test.js tests/equalPlineDistribution.test.js tests/manewadaBenchmark.test.js tests/timelineAndFeasibility.test.js tests/dynamicBuildingGenerator.test.js --runInBand --forceExit
```

**Result:**
- **Test Suites:** 10 passed, 10 total
- **Tests:** 139 passed, 139 total (0 failed)
- **Time:** 10.382 s

### 5.2 Test Breakdown Matrix

| Test Suite File | Tests | Status | Coverage Areas |
|---|---|---|---|
| `criticalAreaCorrection.test.js` | 12 | **PASS** | Net Plotable formula, reference measurements, Paid FSI non-auto-consumption, 5-tier TDR split, 9m fix, Gunthewari preservation, Mixed-use 60/80% ancillary, 6-col Table 2 arithmetic, weighted average, ±0.05 tolerance, height exclusion, floor-linked receipts, Excel & PDF exports. |
| `scopeCorrectionRebuild.test.js` | 11 | **PASS** | Two-tab enforcement, no auxiliary tabs, P-Line 6-col presentation, canonical SQM / display SQFT, Excel live formulas. |
| `tdrSplitAndOverrides.test.js` | 8 | **PASS** | Road-width TDR split, Regular & Slum reconciliation, custom overrides. |
| `remediationDefects.test.js` | 13 | **PASS** | Remediation fixes, error boundaries, decimal precision. |
| `statutoryOverridesAndPlotRemoval.test.js` | 11 | **PASS** | Statutory charge overrides, cost of plot removal options. |
| `feasibilityCalculationsParity.test.js` | 14 | **PASS** | Excel vs Backend parity, FSI hierarchy, rounding rules. |
| `equalPlineDistribution.test.js` | 7 | **PASS** | Equal P-Line floor distribution, override retention. |
| `manewadaBenchmark.test.js` | 10 | **PASS** | Benchmark G+9 project parity with authentic client workbook. |
| `timelineAndFeasibility.test.js` | 27 | **PASS** | Project timeline integration, task generation, feasibility sync. |
| `dynamicBuildingGenerator.test.js` | 26 | **PASS** | Dynamic building floor generation, floor types, heights. |

### 5.3 Client Linter & Production Build

```powershell
cd client; npx eslint src/components/projects/feasibility/AreaFeasibilityTab.jsx src/components/projects/feasibility/AreaStatementForm.jsx src/components/projects/feasibility/FinancialViabilityForm.jsx src/utils/feasibilityCalculations.js; npm run build
```

- **ESLint:** 0 errors, 0 warnings.
- **Vite Build:** `✓ built in 14.32s` (Production bundle generated cleanly in `client/dist`).

---

## 6. Conclusion

The DS16 Area Statement and Financial Viability module now strictly conforms to all approved business rules:
1. Net Plotable Area baseline is authoritative and never silently clamped.
2. Paid FSI and TDR are never auto-consumed or charged without explicit architect selection.
3. Road-Width TDR 50/50 split is enforced, 9m legacy defect is corrected, and Gunthewari preserves the underlying road split.
4. Mixed-Use primary allocation validates `Res + Comm = 100%` and correctly assigns 60% / 80% ancillary FSI.
5. Floor-wise Table 2 conforms to the exact 6-column structure (`1. Floor`, `2. Height (m)`, `3. P-Line Area`, `4. Lobby Area`, `5. No. of Units`, `6. Built-up for Sale (1 Unit)`), featuring full-precision arithmetic, weighted average per unit, documented `±0.05 sq m` Area Balance tolerance, non-habitable height exclusions, and floor-linked Receipts.
6. Both Excel and PDF exports reflect the corrected structure and live workbook formulas.
