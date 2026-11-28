# DS16 — Post-Implementation Acceptance Audit & Scope Correction Report

**Document ID:** `docs/feasibility-rebuild/31_post_implementation_acceptance_audit.md`  
**Audit Date:** 2026-11-28  
**Module Audited:** `Project Details → Area & Financial Feasibility` (`AreaStatement`, `FinancialViability`, Engine, Routes, Migration `041`, Excel & PDF Exporters)  
**Canonical Structural Reference:** `Sample Financial Viability Asolkar Sir.xlsx` (`Area (SQ M)`, `PLOT NO. 01 Area (SQ ft)`, `FINANCIAL VIABILITY`) & [22_scope_correction_architecture_and_field_register.md](file:///D:/Freelance/ds16-v1/docs/feasibility-rebuild/22_scope_correction_architecture_and_field_register.md)

---

## 1. Requirements Checked

This post-implementation audit inspected and verified all eight acceptance gates requested after the initial rebuild:

1. **Exact Two-Document UI & Export Structure:** Strictly two application tabs (`Area Statement`, `Financial Viability`), without `Project Summary`, `Report Preview`, KPI cards, standalone parking calculations, duplicate floor realization, or separate sales inventory modules.
2. **Exact Six-Column Floor-wise P-Line Table:** Corrected from 10 columns to strictly the original Excel 6-column structure (`Floor`, `Height`, `P-Line Area`, `Lobby Area`, `Built-up for Owners`, `Built-up for Sale`) across UI, `.xlsx`, and `.pdf` exports while keeping internal engine dependencies (`fsi_area_sqm`, `ancillary_area_sqm`, `usage_type`) intact without expanding visible documents.
3. **Strict Road-Width TDR & Non-Clamping Validation:** Total TDR is strictly road-width-derived; Regular TDR is editable only on Regular plots within `0..Total`; Slum TDR equals remaining balance (`Total - Regular`); Gunthewari plots lock Regular TDR to `0` and use Slum TDR only; invalid inputs and excess proposed consumption are rejected (`400 Bad Request`) instead of silently clamped; classification changes revalidate existing proposed consumption.
4. **Net Plotable Area Integrity:** `Net Plotable Area = Plot Area − Proposed DP Deductions` without silent `Math.max(0, ...)` clamping; DP deductions exceeding Plot Area are rejected cleanly in engine validation, API (`POST /preview`, `PUT /area`), and UI while retaining last valid saved/committed state; `City Survey` and `Site Area` remain independent reference measurements.
5. **Input Field Audit Against Source Workbook & Register:** Audited every visible input, classified each cleanly, and removed redundant controls (`Add Floor Row` button, table `Del` column, `"Custom Manual TDR"` option, editable `Perm. Slum TDR` override).
6. **Excel & PDF Verification:** Cross-checked worksheet names, cell references, Sq M vs Sq Ft unit conversion (`10.7639104167`), dimensionless FSI ratio preservation, 6-column Table 2 layout, live ExcelJS formula syntax (zero leading `=`), PDF alignment, and authoritative backend snapshot parity.
7. **Regression, Migration & Safety:** Re-ran ESLint, Vite production build, all 9 feasibility Jest suites, API endpoint checks, live Project `413` read-only export checks, and isolated-database `041` migration + rollback verification. Zero unrelated modules altered; zero production data lost.

---

## 2. Exact Files Modified / Added

### Backend & Migrations
- [server/package.json](file:///D:/Freelance/ds16-v1/server/package.json) & [server/package-lock.json](file:///D:/Freelance/ds16-v1/server/package-lock.json) — Added `exceljs@^4.4.0` and `pdfkit@^0.17.2` (dual CJS/ESM compatible with Node & Jest).
- [server/db/migrations/041_feasibility_scope_correction_columns.sql](file:///D:/Freelance/ds16-v1/server/db/migrations/041_feasibility_scope_correction_columns.sql) — Additive non-destructive columns (`total_tdr_factor`, `proposed_paid_fsi_factor`, `proposed_regular_tdr_factor`, `proposed_slum_tdr_factor`, `primary_fsi_residential_pct`, `tdr_purchase_factor`, `loading_mode`, `loading_pct`, `version`, guarded snapshot unique index).
- [server/db/migrations/down/041_feasibility_scope_correction_columns.down.sql](file:///D:/Freelance/ds16-v1/server/db/migrations/down/041_feasibility_scope_correction_columns.down.sql) — Clean rollback script.
- [server/services/feasibilityEngine.js](file:///D:/Freelance/ds16-v1/server/services/feasibilityEngine.js) — Added `validateAreaStatementInputs`, strict road-width TDR resolution in `resolvePermissibleTdr`, unclamped `plotableAreaSqm = plotAreaSqm - dpDeductionsSqm`, non-clamped proposed factor evaluation, and `Built-up for Sale = MAX(0, P-Line - Lobby - Owners)`.
- [server/services/buildingHierarchyService.js](file:///D:/Freelance/ds16-v1/server/services/buildingHierarchyService.js) — Aligned stilt parking boolean handling, usage defaults, and `SQM_TO_SQFT = 10.7639104167`.
- [server/routes/feasibility.js](file:///D:/Freelance/ds16-v1/server/routes/feasibility.js) — Wired `validateAreaStatementInputs` on `POST /preview` and `PUT /area`, enforced DP deduction bounds, blocked unrestricted Total/Slum TDR overrides, revalidated proposed consumption on classification/road-width switches, added `builtup_for_owners_sqm` persistence in `PUT /area/floors/batch`, enforced manual-only `LABOUR_WELFARE_PARKING`, fixed `period_months` VARCHAR persistence, and served binary Excel/PDF exports.
- [server/services/feasibilityExportService.js](file:///D:/Freelance/ds16-v1/server/services/feasibilityExportService.js) — Reconstructed Table 2 to strictly **6 columns** in Excel (`Area (SQ M)`, `Area (SQ FT)`) and PDF, aligned `FINANCIAL VIABILITY` cross-sheet P-Line references to `'Area (SQ M)'!D{totalRow}`, matched PDF Table 1 `G1`/`G2` rows to `table1ProposedCommAncSqm`/`table1ProposedResAncSqm`, and set `wb.calcProperties = { fullCalcOnLoad: true }`.

### Frontend (`client/src/`)
- [client/src/utils/feasibilityCalculations.js](file:///D:/Freelance/ds16-v1/client/src/utils/feasibilityCalculations.js) — Stripped duplicate calculation engine; kept pure unit-conversion (`10.7639104167`), formatting, and road-width display helpers.
- [client/src/components/projects/feasibility/AreaFeasibilityTab.jsx](file:///D:/Freelance/ds16-v1/client/src/components/projects/feasibility/AreaFeasibilityTab.jsx) — Strict 2-tab orchestrator, client validation retaining last valid state on invalid DP/TDR inputs, debounced `POST /preview`, atomic `Save Changes` sending `builtup_for_owners_sqm` and road-width-compliant TDR fields, and direct `.xlsx`/`.pdf` binary downloads. Removed floor Add/Delete UI triggers.
- [client/src/components/projects/feasibility/AreaStatementForm.jsx](file:///D:/Freelance/ds16-v1/client/src/components/projects/feasibility/AreaStatementForm.jsx) — Replaced 10-column Table 2 with **exact 6 columns** (`1. Floor`, `2. Height (m)`, `3. P-Line Area`, `4. Lobby Area`, `5. Built-up for Owners`, `6. Built-up for Sale`), removed `Add Floor Row` and `Del` actions, removed `"Custom Manual TDR"` and free Slum TDR editing, locked `Perm. Slum TDR` as read-only balance (`Total − Regular`), and added non-clamping blur validation.
- [client/src/components/projects/feasibility/FinancialViabilityForm.jsx](file:///D:/Freelance/ds16-v1/client/src/components/projects/feasibility/FinancialViabilityForm.jsx) — Rebuilt strictly around the Excel `FINANCIAL VIABILITY` hierarchy (`rent_amount` & `stacked_parking_cost` override keys aligned; Section C & Interest inputs restored; `Sales Realisation by Floor` & dead plot rate removed).
- [client/src/components/projects/feasibility/FeasibilityDocumentPreview.jsx](file:///D:/Freelance/ds16-v1/client/src/components/projects/feasibility/FeasibilityDocumentPreview.jsx) — Retired (`return null`).

### Tests & Documentation
- [server/tests/scopeCorrectionRebuild.test.js](file:///D:/Freelance/ds16-v1/server/tests/scopeCorrectionRebuild.test.js) — Added Phase 9 + Acceptance Audit assertions (6-column Excel verification, DP rejection & last-valid retention, unrestricted TDR rejection, classification switch revalidation, PDF signature check).
- Updated aligned test expectations across [server/tests/feasibilityCalculationsParity.test.js](file:///D:/Freelance/ds16-v1/server/tests/feasibilityCalculationsParity.test.js), [server/tests/remediationDefects.test.js](file:///D:/Freelance/ds16-v1/server/tests/remediationDefects.test.js), [server/tests/tdrSplitAndOverrides.test.js](file:///D:/Freelance/ds16-v1/server/tests/tdrSplitAndOverrides.test.js), [server/tests/equalPlineDistribution.test.js](file:///D:/Freelance/ds16-v1/server/tests/equalPlineDistribution.test.js), [server/tests/manewadaBenchmark.test.js](file:///D:/Freelance/ds16-v1/server/tests/manewadaBenchmark.test.js), and [server/tests/timelineAndFeasibility.test.js](file:///D:/Freelance/ds16-v1/server/tests/timelineAndFeasibility.test.js).

---

## 3. Visible Table Structure Comparison

| Document / Section | Original Excel Workbook | Pre-Audit Implementation | Post-Audit Corrected State | Match |
|---|---|---|---|---|
| **Application Tabs** | 2 logical documents (`Area Statement`, `Financial Viability`) | 2 tabs (`Area Statement`, `Financial Viability`) | 2 tabs (`Area Statement`, `Financial Viability`) | **EXACT** |
| **Area Statement Table 1** | Rows `1..4`, `A..H` (`Permissible` vs `Proposed`) | Rows `1..4`, `A..H` (`Permissible` vs `Proposed`) | Rows `1..4`, `A..H` (`Permissible` vs `Proposed`; internal `G1/G2` Ancillary splits) | **EXACT** |
| **Area Statement Table 2 (Floor P-Line)** | 6 columns: `Floor`, `Height`, `P Line Area`, `Lobby Area`, `Built up for Owners`, `Built up for Sale` + Totals, `Area Balance`, `Margin (H/5)` | **10 columns** (+ `Building Use`, `Primary FSI`, `Ancillary`, `Units`, `Area/Unit`, `Del`) | **6 columns**: `1. Floor`, `2. Height (m)`, `3. P-Line Area`, `4. Lobby Area`, `5. Built-up for Owners`, `6. Built-up for Sale` + `TOTAL`, `Area Balance`, `Margin (H/5)` (UI, Excel & PDF) | **EXACT** |
| **Excel Worksheets** | `PLOT NO. 01 Area (SQ ft)`, `Area (SQ M)`, `FINANCIAL VIABILITY` | `Area (SQ M)`, `Area (SQ FT)`, `FINANCIAL VIABILITY` (with 10-col Table 2) | `Area (SQ M)`, `Area (SQ FT)`, `FINANCIAL VIABILITY` (with 6-col Table 2 & no Parking sheet) | **EXACT** |
| **Financial Viability Sheet** | Overview Strip, `Cost A/B & RR`, `Section A (1..13 + NMC/Demand)`, `Section B (Cost of TDR)`, `Section C`, `Plot/Construction/Infra/Interest/Basement/Rent/Parking`, `Receipts`, `Project Viability` | Same structure (`rent_cost`/`stacked_parking` UI key mismatch initially, `G1/G2` PDF mismatch) | Exact section hierarchy (`rent_amount`/`stacked_parking_cost` keys fixed, PDF & Excel aligned, `Amalgamation` excluded) | **EXACT** |

---

## 4. Input Field Classification & Redundancy Audit

### 4.1 `Area Statement` Tab Inputs
| Field / Control | Original Workbook | Register (`Doc 22`) | Audit Classification | Final Disposition |
|---|---|---|---|---|
| `plot_area_sqm` (`1. Area Of Plot`) | `Area (SQ M)!E6` | Essential (`2.1`) | **Required original input** | Retained; rejects `< dp_deductions_sqm` |
| `city_survey_area_sqm` (`2. City Survey`) | `Area (SQ M)!E7` | Essential (`2.1`) | **Required original input** | Retained independently of Net Plotable Area |
| `site_area_sqm` (`3. As per site`) | `Area (SQ M)!E8` | Essential (`2.1`) | **Required original input** | Retained independently of Net Plotable Area |
| `dp_deductions_sqm` (`4. D.P. Deductions`) | `Area (SQ M)!E9` | Essential (`2.1`) | **Required original input** | Retained; rejects `> plot_area_sqm` (no zero clamp) |
| `building_use` | Commercial/Residential in G | Essential (`2.1`) | **Necessary existing form input** | Retained (`Residential`, `Commercial`, `Mixed Use`) |
| `is_gunthewari` | Not parameterized in sample | Essential (`2.1` / `FR-08`) | **Necessary existing form input** | Retained; locks Regular TDR `0` & revalidates on switch |
| `road_width_m` (`9m..24m`) | Fixed in sample | Essential (`2.1`) | **Necessary existing form input** | Retained; `"Custom Manual TDR"` loophole **removed** |
| `primary_fsi_residential_pct` | Single/split ancillary `G` | Conditional (`2.1` / `FR-11`) | **Necessary existing form input** | Visible **only when `Mixed Use`**; Res + Comm = `100%` |
| `basic_fsi_factor`, `paid_fsi_factor` | Col `D` factors (`1.1`, `0.5`) | Essential (`2.1`) | **Required original input** | Retained; validates `>= 0` |
| `regular_tdr_factor` | `D13` factor | Essential (`2.1`) | **Necessary existing form input** | Editable **only** on Regular plots (`0..Total`); locked `0` on Gunthewari |
| `slum_tdr_factor` / `total_tdr_factor` | `D13` factor | Derived (`2.1`) | **Automatically derived** (was editable!) | Free UI editing **removed**; read-only `Total − Regular` (or Gunthewari tier) |
| `proposed_paid_fsi_factor`, `proposed_regular_tdr_factor`, `proposed_slum_tdr_factor` | `E6`/`F12..F13` utilization | Essential (`FR-05/09`) | **Necessary existing form input** | Auto-suggested default; editable within classification eligibility (+ `Reset`) |
| `total_proposed_pline_override_sqm` | Manual H override | Approved override (`2.1`) | **Approved override** | Retained inline on Row `H` (+ `Reset H`) |
| Floor `height_meters`, `pline_area_sqm`, `lobby_area_sqm`, `builtup_for_owners_sqm` | Table 2 cols 2–5 | Floor inputs (`2.1`) | **Required original input** | Retained cleanly inside 6-column Table 2 (+ reset icons for P-Line/Lobby) |
| `Sync From Building Config` | Structural hierarchy | Sourced Elsewhere (`2.1`) | **Necessary existing form input** | Retained (`reconcile-floors`) |
| `Add Floor Row`, table `Del`, Table 2 `Building Use`/`Units` inputs | Absent | Excluded (`2.1 L61`) | **Redundant / remove** | **Removed** from UI |

### 4.2 `Financial Viability` Tab Inputs
| Field / Control | Original Workbook | Register (`Doc 22`) | Audit Classification | Final Disposition |
|---|---|---|---|---|
| `estimated_cost_a_rate`, `estimated_cost_b_rate`, `rr_rate_per_sqm` | Rows `8, 9, 10` | Essential (`2.2`) | **Required original input** | Retained |
| Section A `is_enabled`, `rr_percentage` (`pct_of_rr` rows) | Rows `13..23` | Essential (`2.2`) | **Necessary existing form input** | Retained (`Amalgamation` excluded) |
| `LABOUR_WELFARE_PARKING.amount` | Row `25` | Manual input (`2.2` / `FR-28`) | **Necessary existing form input** | Direct manual input; formula override rejected |
| `tdr_purchase_factor` | Row `27` (`0.55`) | Essential (`2.2` / `FR-31`) | **Required original input** | Retained & persisted in DB |
| Section C (`minor_expenses`..`extra_stamp_duty`) | Rows `29..35` | Essential (`2.2`) | **Required original input** | Retained (7 manual amount fields) |
| `cost_of_plot`, `is_cost_of_plot_included` | Row `36` | Essential + Toggle (`2.2`) | **Necessary existing form input** | Lump-sum + toggle; dead `cost_of_plot_rate_per_sqm` removed |
| `cost_of_construction_rate` | Row `37` | Essential (`2.2` / `FR-15`) | **Required original input** | Decoupled from Cost B (`0` rate stays `₹0`) |
| `cost_of_infrastructure`, `interest_amount` | Rows `38, 39` | Essential (`2.2`) | **Required original input** | Retained |
| `basement_area_sqm`, `basement_rate_per_sqm` | Row `40` | Essential (`2.2`) | **Required original input** | Retained |
| `rent_tenements`, `rent_per_tenement_per_month`, `rent_months` | Row `41` | Essential (`2.2`) | **Required original input** | Retained separately from string `period_months` |
| `stacked_parking_slots`, `stacked_parking_cost_per_slot` | Row `42` | Essential (`2.2`) | **Required original input** | Retained |
| Overrides (`statutory_*`, `cost_of_tdr`, `cost_of_construction`, `cost_of_basement`, `rent_amount`, `stacked_parking_cost`) | Manual finalized col | Approved override (`2.2`) | **Approved override** | Modal + Reset retained (`rent_amount` & `stacked_parking_cost` keys fixed) |
| `period_months`, Salable Units (`unit_name`, `building_use`, `carpet_area_sqft`, `loading_mode`, loading value, `unit_count`, `landowner_unit_count`, `rate_per_sqft`) | Rows `48..52` | Essential (`2.2` / `FR-32`) | **Required original / unified receipts input** | Retained inside Receipts with Add/Edit/Delete |

---

## 5. Calculation & Export Verification Summary

- **Net Plotable Area & DP Rejection:** Direct unit verification confirmed `calculateAreaMetrics({ plot_area_sqm: 500, dp_deductions_sqm: 650 })` yields `-150` (not clamped to `0`); both `POST /preview` and `PUT /area` reject `dp_deductions_sqm > plot_area_sqm` with HTTP `400` and preserve previously saved valid DB records (`plot_area_sqm = 1000, dp_deductions_sqm = 0`). Frontend rejects invalid DP/TDR commits and retains last valid `statement` & `areaMetrics`.
- **TDR Road-Width Derivation & Classification Revalidation:** Verified HTTP `400` rejection on unrestricted `total_tdr_factor` override on road-width plots, independent `slum_tdr_factor` override (`Regular + Slum !== Total`), Gunthewari `regular_tdr_factor > 0` / `proposed_regular_tdr_factor > 0`, excess `proposed_paid_fsi_factor`, and switching `Regular → Gunthewari` with stale `proposed_regular_tdr_factor > 0` without `reset_proposed: true`.
- **6-Column Floor Math:** Verified `Built-up for Owners` persistence in `PUT /area/floors/batch` and `Built-up for Sale = MAX(0, P-Line - Lobby - Owners)`.
- **Excel (.xlsx) & PDF (.pdf) Verification:**
  - Inspected generated ExcelJS workbooks (`testProjectId` in Jest and existing live `project_id = 413` pre-final PDF tweak): exactly `['Area (SQ M)', 'Area (SQ FT)', 'FINANCIAL VIABILITY']`, zero leading-`=` formulas (`eqLead: 0`), Table 2 row `22` containing strictly columns `A` (`1. Floor`), `C` (`2. Height (m)`), `D` (`3. P-Line Area`), `E` (`4. Lobby Area`), `F` (`5. Built-up for Owners`), `G` (`6. Built-up for Sale`), `Area (SQ FT)!E16` copying `'Area (SQ M)'!E16` without `10.7639104167` multiplication, and `FINANCIAL VIABILITY` linking `H6` to `'Area (SQ M)'!D{totalRow}` (`'Area (SQ M)'!D30` on Project `413`).
  - PDF output begins with valid `%PDF-` signature (`10,050` bytes in `scopeCorrectionRebuild.test.js`), uses identical 6-column Table 2 structure and matching `table1ProposedCommAncSqm` / `table1ProposedResAncSqm` Table 1 Ancillary rows.

---

## 6. Test, Build & Isolated Migration Results

| Check | Command / Scope | Outcome | Details |
|---|---|---|---|
| **ESLint (Client Feasibility)** | `cd client; npx eslint src/utils/feasibilityCalculations.js src/components/projects/feasibility/AreaFeasibilityTab.jsx src/components/projects/feasibility/AreaStatementForm.jsx src/components/projects/feasibility/FinancialViabilityForm.jsx src/components/projects/feasibility/FeasibilityDocumentPreview.jsx` | **PASS** | `0` errors, `0` warnings after final edit |
| **Frontend Production Build** | `cd client; npm run build` | **PASS** | Vite built `2972` modules cleanly in `9.47s` after final edit |
| **9 Feasibility Jest Suites** | `cd server; npx jest tests/scopeCorrectionRebuild.test.js tests/tdrSplitAndOverrides.test.js tests/remediationDefects.test.js tests/statutoryOverridesAndPlotRemoval.test.js tests/feasibilityCalculationsParity.test.js tests/equalPlineDistribution.test.js tests/manewadaBenchmark.test.js tests/timelineAndFeasibility.test.js tests/dynamicBuildingGenerator.test.js --runInBand` | **PASS** | **9 passed suites, 9 total; 127 passed tests, 127 total** after final edit |
| **Isolated DB Migration `041`** | Temporary DB `ds16_audit_mig041`: `schema.sql` + pre-041 migrations + legacy seed -> apply `041` -> inspect preserved rows (`plot_area_sqm='500.0000'`, `regular='0.5000'`, `slum='0.1500'`, backfill `total_tdr_factor='0.6500'`, `cost_of_plot='5000000.00'`, `tdr_purchase_factor='0.5500'`, `loading_mode='fixed_sqft'`) -> rollback `041.down.sql` -> re-apply `041` -> drop `ds16_audit_mig041` | **PASS** | Non-destructive schema upgrade, zero data loss, clean rollback & re-apply |
| **Live DB Read-Only Smoke (`project_id = 413`)** | Read-only GET + Excel + PDF check on live Project `413` (`P413_AUDIT_CHECK`) | **PASS** | `200` on GET, `.xlsx` (`16,293` bytes, 6-col Table 2, exact parity with `apiPlotable=500`, `apiPermPline=1800`, `apiFloorTotalPline=1800`), `.pdf` (`9,864` bytes, `%PDF-`) *(ran prior to final 2-line PDF `G1/G2` alias alignment; PDF generation subsequently re-verified in `scopeCorrectionRebuild.test.js` `200 OK` after final edit)* |

---

## 7. Remaining Defects & Audit Observations

- **Open Defects:** **0** blocking or functional defects remain within the audited two-document feasibility scope.
- **Explicit Observations (Non-Defect Scope Notes):**
  1. Legacy unit test fixtures with `road_width_m: null` (such as [manewadaBenchmark.test.js](file:///D:/Freelance/ds16-v1/server/tests/manewadaBenchmark.test.js)) retain custom `total_tdr_factor` compatibility (`1.15`), whereas any plot with a road width (`9m..24m`) strictly enforces `ROAD_WIDTH_TOTAL_TDR_MAP`.
  2. Live desktop Microsoft Excel / LibreOffice GUI launch was not executed in headless CLI; workbook formulas were structurally validated via ExcelJS read-back inspection (`fullCalcOnLoad = true`, zero leading `=`, accurate cached results alongside live formula expressions).
  3. Re-running `P413_AUDIT_CHECK` was superseded after the 2-line PDF Table 1 `G1/G2` alias edit by re-running the full 9 Jest suites (`127/127` passing, including `scopeCorrectionRebuild.test.js` ExcelJS & PDF integration assertions).

---

## 8. Explicit Criterion-by-Criterion Verdict

| Acceptance Criterion | Verdict | Summary Evidence |
|---|---|---|
| **1. Exact Two-Document Structure** | **PASS** | Strictly `Area Statement` & `Financial Viability` tabs in UI; strictly `Area (SQ M)`, `Area (SQ FT)`, `FINANCIAL VIABILITY` sheets in Excel and matching 2 documents in PDF. |
| **2. Six-Column Floor-wise P-Line Table** | **PASS** | UI, Excel (`A22:G22`), and PDF render strictly 6 columns (`Floor`, `Height (m)`, `P-Line Area`, `Lobby Area`, `Built-up for Owners`, `Built-up for Sale`). |
| **3. TDR Calculation, Balance & Non-Clamping Revalidation** | **PASS** | Road-width-derived Total TDR, Slum = remaining balance, Gunthewari Slum-only lock (`Regular = 0`), HTTP `400` rejection on invalid/excess overrides, and revalidation on classification switch. |
| **4. Net Plotable Area & Independent Records** | **PASS** | Unclamped `Plot Area − DP Deductions` in engine; `400` API rejection & last-valid UI retention when `DP > Plot`; independent `City Survey` and `Site Area`. |
| **5. Input Field Audit & Redundancy Removal** | **PASS** | Redundant `Add Floor Row`, `Del`, `"Custom Manual TDR"`, free Slum TDR edit, Parking section, floor rate receipts, and dead plot rate removed. |
| **6. Excel & PDF Consistency & Formula Verification** | **PASS** | Live cross-sheet & section formulas verified via ExcelJS load-back (`0` leading `=`), dimensionless FSI ratio on `SQ FT`, matching PDF tables and totals. |
| **7. Regression, Build & Isolated Migration `041`** | **PASS** | ESLint `0` errors, Vite build passed, all `9` Jest suites (`127/127` tests) passed after final edit, and Migration `041` verified non-destructive on isolated DB `ds16_audit_mig041`. |
| **8. Final Report & Audit Sign-off** | **PASS** | Documented completely in `docs/feasibility-rebuild/31_post_implementation_acceptance_audit.md`. Ready for deployment upon explicit approval. |
