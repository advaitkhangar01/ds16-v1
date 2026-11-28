# DS16 — Existing Feasibility Module Audit & Disposition Register

**Document ID:** `docs/feasibility-rebuild/21_existing_module_disposition.md`  
**Audit Date:** 2026-11-28  
**Phase:** Stage 1 — Existing Codebase Audit (Phase 1.3)  
**Scope:** Strictly `Project Details → Area & Financial Feasibility` (`client/src/components/projects/feasibility/`, `client/src/utils/feasibilityCalculations.js`, `server/services/feasibilityEngine.js`, `server/services/buildingHierarchyService.js`, `server/routes/feasibility.js`, feasibility DB tables/migrations, exports, overrides, sales inventory, and tests).

---

## 1. Classification Key

- **RETAIN:** Preserve as-is or with minimal wiring adjustments.
- **REBUILD:** Reconstruct internal UI, structure, or calculation logic to meet Excel-structured architecture and client rules.
- **MERGE:** Consolidate duplicate or competing implementations into a single authoritative path.
- **DEPRECATE:** Keep temporarily for backward compatibility / historical read safety; stop active UI exposure or new writes.
- **MIGRATE:** Transform or backfill historical schema/data safely via expand-and-contract migrations without data loss.
- **REMOVE AFTER DEPENDENCY VERIFICATION:** Retire only after verifying no historical records, APIs, reports, or unrelated modules depend on it.

---

## 2. Frontend Components & Utilities Disposition

| Item / File | Current Role & Audit Findings | Dependencies Checked | Disposition | Rationale & Action |
|---|---|---|---|---|
| `client/src/pages/ProjectDetail.jsx` (`L21, L649-657`) | Mounts `<AreaFeasibilityTab>` inside the `feasibility` tab for privileged/admin/accounts roles. | Core project detail navigation. | **RETAIN** | Keep mount point and role gating untouched. |
| `client/src/components/projects/feasibility/AreaFeasibilityTab.jsx` (972 lines) | Orchestrates sub-tabs, holds state, runs `recalculateLive()`, `handleUpdateFloor()` (inline math!), `handleSaveAll()` (multi-request loop), `handleExportExcel()` (SheetJS values-only JSON), `handleExportPDF()` (`html2canvas` screenshot slicer), and renders 4 tabs. | Parent container; imports `feasibilityCalculations.js`, `xlsx`, `jspdf`, `html2canvas`. | **REBUILD (2 TABS ONLY)** | Restrict strictly to **2 tabs ONLY** (`Area Statement`, `Financial Viability`). Remove `Project Summary` tab, `Report Preview` tab, and KPI cards per Scope Correction §§1–3, §7. Remove competing inline `handleUpdateFloor()` math; preserve unsaved edits on tab switch & override actions (`fetchData()` bug at `L178, L189`); export genuine structured `.xlsx` (with Excel formulas) & structured 2-document `.pdf` directly from saved/authoritative calculation state. |
| `client/src/components/projects/feasibility/AreaStatementForm.jsx` (1,236 lines) | Renders Plot Area (missing City Survey, Site Area, DP Deductions), Building Use, Road Width, Dual TDR, P-Line summary cards, floor table, FSI summary, and Parking cards. **Bugs:** `unitDisplay='sq_ft'` fails to convert bound `<input>`s; `L232` ignores `Mixed Use`; `is_gunthewari` ignored. | Consumes `statement`, `floors`, `areaMetrics`. | **REBUILD** | Retain familiar contextual DS16 form structure + render authentic Excel `Area Statement` (`1..4`, `A..H` Permissible & Proposed) and 10-column `Floor-wise Proposed P Line` table (`+ Area Balance` & `Margin H/5`). Add `City Survey`, `Site Area`, `DP Deductions`, `Proposed Paid FSI`, `Proposed Regular/Slum TDR`, and Mixed-Use `%` Res/Comm allocation; **remove excluded Parking section**. |
| `client/src/components/projects/feasibility/FinancialViabilityForm.jsx` (1,426 lines) | Renders collapsible sections. **Defects:** (1) Retains dead `Plot Acquisition Rate` input (`L223`); (2) Missing Section C & `Interest` inputs; (3) Duplicate Section 5 `Sales Realisation by Floor` (`L551-694`) alongside Section I `Salable Inventory`; (4) No Edit button on salable unit rows. | Consumes `financial`, `floors`, `statutoryCharges`, `salableUnits`, `financialMetrics`. | **REBUILD** | Retain existing compact form structure + render authentic Excel `FINANCIAL VIABILITY` table (Top Area Overview synced from Area Statement, Cost A/B & RR, Statutory Section A + `NMC/DEMAND`, Cost of TDR B, Expenses Section C, Costs D–H + Infrastructure + Interest, `Receipts` with unified `Salable Units Cost` Add/Edit/Delete & `+SqFt` / `+%` loading, and `Project Viability`). Remove dead `Plot Acquisition Rate` and duplicate Section 5 floor sales form. |
| `client/src/components/projects/feasibility/FeasibilityDocumentPreview.jsx` (1,163 lines) | Previously used for separate `Report Preview` tab & `html2canvas` PDF slicing. | Was 4th sub-tab. | **DEPRECATE / RETIRE** | Superseded by Scope Correction §3 & §7 (no `Report Preview` tab; users review the two Excel-structured tabs directly and export clean 2-document Excel & PDF). |
| `client/src/utils/feasibilityCalculations.js` (1,226 lines) | Full client-side mirror of `feasibilityEngine.js` (also CommonJS-exported for Jest). **Defect:** Maintains a full competing calculation engine on the frontend (`SQM_TO_SQFT=10.764`, `cost_of_construction_rate || estimated_cost_b_rate`, hardcoded `0.55` TDR purchase factor, etc.). | Imported by `AreaFeasibilityTab.jsx` and `AreaStatementForm.jsx`. | **MERGE / DEPRECATE** | Per Phase 8.1, backend must be the sole authoritative calculation engine. Deprecate full client statutory/financial mirror; keep only lightweight formatting/unit-display helpers and clearly marked provisional UI preview helpers (or retrieve authoritative preview directly from backend endpoint). |
| `client/src/components/projects/timeline/TimelineSetup.jsx` | Configures central building structure (`timeline_configurations`). | Shared with Timeline module. | **RETAIN** | Out of rebuild edit scope unless minor read sync needed; continue using `timeline_configurations` as sole floor source. |

---

## 3. Backend Services & Routes Disposition

| Item / Symbol | Current Role & Audit Findings | Dependencies Checked | Disposition | Rationale & Action |
|---|---|---|---|---|
| `server/services/feasibilityEngine.js` (1,346 lines) | Authoritative calculation engine. **Defects:** (1) `SQM_TO_SQFT = 10.764` (`L6`); (2) `is_gunthewari` ignored (`L487`); (3) `proposedPaidFsiSqm = permissiblePaidFsiSqm` & `proposedTdrSqm = regular + slum` (`L557-562`); (4) `constRate` falls back to Cost B (`L1179`); (5) `costOfTdrB` hardcodes `0.55` ignoring `financial.tdr_purchase_factor` (`L1154`); (6) `calculateParkingRequirements` uses `Math.ceil` (`L241`) and `<40 sqm` `1.0` 2W (`L226`); (7) `LABOUR_WELFARE_PARKING` checks `overrides` map (`L1020`); (8) Dual sales receipts switch (`L1270-1277`); (9) `unit_count || 1` & `rate_per_sqft || 6000` falsy-zero bugs (`L1237, L1242`). | Called by `server/routes/feasibility.js` and 7 Jest test suites. | **REBUILD** | Reconstruct cleanly inside `feasibilityEngine.js` as the single authoritative backend calculation engine resolving every item above once client clarifications are confirmed. |
| `server/services/buildingHierarchyService.js` (200 lines) | Generates floor hierarchy from `timeline_configurations` and reconciles `project_area_floors` preserving measurements. **Defects:** Ignores `has_stilt_parking` (`L17-18`); hardcodes `usage_type = 'Residential'` (`L43, L75`) even for Commercial/Mixed building types; `L117` uses `10.764`. | Called by `server/routes/timeline.js:531` and `server/routes/feasibility.js:112, 648`. | **REBUILD (TARGETED FIX)** | Fix `has_stilt_parking`, initial `usage_type` from `building_type`, and exact `10.7639104167` factor while keeping `timeline.js` integration intact. |
| `server/routes/projects.js` (`L10, L17`) | Mounts `feasibilityRoutes` at `/:projectId/feasibility`. | Express app routing. | **RETAIN** | Preserve route mount point. |
| `GET /api/projects/:projectId/feasibility` (`feasibility.js:68`) | Fetches & auto-initializes statement, floors, financial, statutory charges, units; returns calculated metrics. | Frontend initial load; `timelineAndFeasibility.test.js`. | **REBUILD** | Return authoritative `version`/optimistic concurrency token, Planning Authority / Congested metadata, and unified inventory/calculation snapshot. |
| `PUT /api/projects/:projectId/feasibility/area` (`feasibility.js:198`) | Updates `project_area_statements`. **Defects:** (1) Ignores `gunthFlag` (`L238`); (2) No DB transaction; (3) No optimistic concurrency (`updated_at`/version); (4) `COALESCE` prevents intentionally clearing nullable inputs when needed. | Frontend save; `remediationDefects.test.js`, `timelineAndFeasibility.test.js`. | **REBUILD** | Enforce Gunthewari/classification rules, validate Proposed Paid FSI & TDR bounds, add transaction & concurrency check, preserve explicit zero. |
| `POST /area/floors` & `DELETE /area/floors/:floorId` (`feasibility.js:400, 616`) | Independent floor add/delete endpoints contradicting Central Building Structure governance (`buildingHierarchyService.js`). | Tested in `timelineAndFeasibility.test.js:830, 1097`; unused in `AreaFeasibilityTab.jsx`. | **DEPRECATE → REMOVE AFTER DEPENDENCY VERIFICATION** | Building Structure (`timeline_configurations`) is sole source for floors. Verify/update legacy test before restricting or retiring independent floor creation/deletion. |
| `PUT /area/floors/:floorId` (`feasibility.js:506`) | Updates floor measurements (`height_meters`, `pline_area_sqm`, `lobby_area_sqm`, `no_of_units`, `usage_type`, etc.). **Defect:** Still writes `rate_per_sqm`, `cost_for_1_unit`, `builtup_for_owners_sqm`. | Used by UI floor table edits. | **REBUILD** | Accept batch/single transactional floor updates with concurrency protection; stop updating deprecated floor-level sales rate fields once unified inventory is active. |
| `POST /area/reconcile-floors` (`feasibility.js:641`) | Re-syncs floors from `timeline_configurations`. | Called from Area Statement UI. | **RETAIN** | Keep and return recalculated `areaMetrics` & `financialMetrics` in response. |
| `PUT /financial` (`feasibility.js:785`) | Updates `project_financial_viabilities` inside DB transaction. **Defects:** Still accepts `cost_of_plot_rate_per_sqm`; `period_months` parsed as integer (`L862`) conflicting with `"21-24 Months"` string display; no optimistic concurrency check. | Used by Financial Viability save. | **REBUILD** | Support all approved Section C & financial fields cleanly, add concurrency protection, stop actively binding `cost_of_plot_rate_per_sqm` while keeping DB column safe. |
| `PUT /financial/overrides` & `POST /financial/overrides/reset` (`feasibility.js:662, 730`) | Persists & resets controlled overrides in `overrides` JSONB + `override_history`. **Defect:** Allows `statutory_LABOUR_WELFARE_PARKING` override even though Parking Labour Welfare is manual input; no transaction/row lock; no audit row in `feasibility_audit_logs`. | Used by Financial Viability override modal. | **REBUILD** | Reject override attempts on manual-only `LABOUR_WELFARE_PARKING`; wrap in transaction with `FOR UPDATE`; log to `feasibility_audit_logs`; validate `metric_key` whitelist. |
| `POST/PUT/DELETE /financial/salable-units` (`feasibility.js:969, 1027, 1089`) | CRUD for `project_salable_units`. **Defects:** Uses `10.764`; falsy-zero bug on `rate_per_sqft || 6000` and `unit_count || 1`; no transaction or audit log; lacks `floor` & `builtup_area` support. | Used by Salable Inventory UI. | **REBUILD** | Fix falsy-zero bugs, use `10.7639104167`, add `floor` / `builtup_area` fields, return recalculated metrics, wrap in transactions + audit log. |
| `PATCH/DELETE /statutory/:chargeId` (`feasibility.js:1109, 1197`) | Updates enable/disable, RR %, manual amount, or soft-deletes statutory charge. | Used by Financial Viability statutory table. | **RETAIN / HARDEN** | Add transaction & disallow overwriting formula charges' `amount` during normal save. |
| `GET/POST /snapshots` (`feasibility.js:1238, 1272`) | Creates and lists snapshots. **Defect:** Missing `GET /snapshots/:id`; snapshots not used to drive Excel/PDF exports (`Phase 6 & 7`). | `AreaFeasibilityTab.jsx` & `timelineAndFeasibility.test.js`. | **REBUILD** | Add server-side snapshot generation/retrieval so Excel and PDF export from the exact saved calculation snapshot. |
| `GET /export` (`feasibility.js:1292`) | Returns JSON export document. **Defect:** Bug at `L1345` (`financialMetrics.rentAmountF` is `undefined`); unused by frontend. | Tested in `timelineAndFeasibility.test.js:877`. | **REBUILD / EXTEND** | Fix `rentCostF` bug for JSON export compatibility; add genuine `.xlsx` and `.pdf` server endpoints (or snapshot-driven export endpoints). |

---

## 4. Database Schema & Column Disposition

Verified against local PostgreSQL on 2026-11-28 (`schema_migrations` up to `040_feasibility_cost_of_plot_inclusion.sql`; live project `413` *Shaubhagya Sarita Residency* present with 1 statement, 7 floors, 1 financial row, 12 statutory charges, 1 salable unit, 130 audit logs).

### 4.1 Table: `project_area_statements` (1 row in local DB)

| Column | Type | Audit Status / Dependency | Disposition |
|---|---|---|---|
| `id`, `project_id`, `plot_area_sqm`, `city_survey_area_sqm`, `site_area_sqm`, `dp_deductions_sqm` | SERIAL / INT / NUMERIC | Core baseline measurements; `city_survey_area_sqm`, `site_area_sqm`, `dp_deductions_sqm` currently omitted in UI (`0.00` in DB row 55) | **RETAIN** |
| `existing_builtup_area_sqm`, `margin_meters`, `dividing_factor` | NUMERIC | Present in DB and Excel; dividing factor / existing construction deduction rule pending clarification | **RETAIN** |
| `basic_fsi_factor`, `paid_fsi_factor`, `road_width_m`, `building_use`, `is_gunthewari` | NUMERIC / VARCHAR / BOOL | Core regulatory parameters | **RETAIN** |
| `tdr_factor` | NUMERIC | Legacy permissible TDR factor (`0.65` in row 55); superseded by `total_tdr_factor` (missing physical column! Engine falls back to `tdr_factor`) | **MIGRATE / DEPRECATE** (Add canonical `total_tdr_factor`, backfill from `tdr_factor` / road width) |
| `proposed_tdr_factor` | NUMERIC | Legacy single proposed TDR factor (`0` in row 55); needed as separate Proposed Regular/Slum TDR or deprecated once separate proposed columns exist | **MIGRATE** |
| `regular_tdr_factor`, `slum_tdr_factor` | NUMERIC | Active 50/50 split columns (row 55 has `0.5000` / `0.1500` override) | **RETAIN** |
| `ancillary_commercial_pct`, `ancillary_residential_pct` | NUMERIC | `0.80` / `0.60` defaults | **RETAIN** |
| `total_proposed_pline_override_sqm`, `is_proposed_pline_overridden`, `proposed_pline_override_reason`, `proposed_pline_overridden_by`, `proposed_pline_overridden_at` | NUMERIC / BOOL / TEXT / INT / TIMESTAMPTZ | Project-level P-Line override metadata | **RETAIN** |
| `parking_config`, `regulatory_profile`, `unit_display`, `created_by`, `created_at`, `updated_at` | JSONB / VARCHAR / TIMESTAMPTZ | Active configuration & timestamps | **RETAIN** |
| *(Missing)* `proposed_paid_fsi_factor`, `proposed_regular_tdr_factor`, `proposed_slum_tdr_factor`, `primary_fsi_residential_pct`, `version` | — | Required by `FR-05`, `FR-09`, `FR-11`, and optimistic concurrency | **MIGRATE (ADD ADDITIVELY)** |

### 4.2 Table: `project_area_floors` (7 rows in local DB)

| Column | Type | Audit Status / Dependency | Disposition |
|---|---|---|---|
| `id`, `area_statement_id`, `floor_key`, `floor_name`, `floor_order`, `floor_type`, `usage_type`, `height_meters`, `is_active` | Core floor columns | Linked to `buildingHierarchyService.js` & `timeline_configurations` | **RETAIN** |
| `fsi_area_sqm`, `ancillary_area_sqm` | *(Wait: NOT physical columns in DB! Only computed in JS!)* | `buildingHierarchyService.js` does not persist them; engine computes them | **MIGRATE (OPTIONAL SNAPSHOT/CACHE OR KEEP DERIVED)** |
| `pline_area_sqm`, `is_pline_overridden`, `calculated_pline_sqm`, `pline_override_reason` | NUMERIC / BOOL / TEXT | Floor P-Line & override tracking | **RETAIN** |
| `lobby_area_sqm`, `is_lobby_overridden`, `builtup_for_sale_sqm`, `no_of_units`, `area_for_1_unit`, `remarks` | NUMERIC / BOOL / INT / TEXT | Active 10-column floor statement values | **RETAIN** |
| `builtup_for_owners_sqm` | NUMERIC | Legacy Excel column (`0.0000` in all 7 DB rows); not in 10-column Phase 3.9 table; replaced by unit-level Landowner Allocation | **DEPRECATE / REMOVE AFTER DEPENDENCY VERIFICATION** |
| `rate_per_sqm`, `cost_for_1_unit` | NUMERIC | Competing floor-wise sales rate system (`0.00` in all 7 DB rows; tested in `timelineAndFeasibility.test.js:1094` & `equalPlineDistribution.test.js:228`) | **DEPRECATE / REMOVE AFTER DEPENDENCY VERIFICATION** (Migrate any existing rates before retiring per Phase 4.8) |

### 4.3 Table: `project_financial_viabilities` (1 row in local DB)

| Column | Type | Audit Status / Dependency | Disposition |
|---|---|---|---|
| `id`, `project_id`, `rr_rate_per_sqm`, `estimated_cost_a_rate`, `estimated_cost_b_rate`, `cost_of_construction_rate` | Core rate assumptions | Active assumptions | **RETAIN** |
| `cost_of_plot`, `is_cost_of_plot_included` | NUMERIC / BOOL | Active lump-sum Section H Plot Cost (`5000000.00`, `false` in row 50) | **RETAIN** |
| `cost_of_plot_rate_per_sqm` | NUMERIC | Obsolete rate field (`0.00` in row 50); Phase 4.2 requires removing as active input | **DEPRECATE / REMOVE AFTER DEPENDENCY VERIFICATION** (Remove from UI immediately; keep DB column for historical safety until verified) |
| `tdr_purchase_factor` | *(Missing physical column in DB!)* | Notice `schema`/`migrations` NEVER created `tdr_purchase_factor` in `project_financial_viabilities`!! UI edits it in memory, `PUT /financial` ignores it, and DB drops it on reload! | **MIGRATE (ADD ADDITIVELY)** |
| `minor_expenses`, `bpms_staff_charges`, `airport_noc`, `fire_noc`, `entertainment_charges`, `extra_stamp_duty`, `advocate_fees` | NUMERIC | Section C approved expenses (missing UI inputs!) | **RETAIN** (Align `advocate_fees` / `consultants_fees` / `minor_expenses` naming) |
| `cost_of_infrastructure`, `interest_amount`, `cost_of_basement`, `basement_area_sqm`, `basement_rate_per_sqm` | NUMERIC | Infrastructure, Interest, Basement Section E | **RETAIN** |
| `rent_amount`, `rent_tenements`, `rent_per_tenement_per_month`, `rent_months`, `period_months` | NUMERIC / INT / VARCHAR | Section F Rent & Project Period (`period_months` is VARCHAR e.g. `'21-24 Months'`, separate from integer `rent_months`) | **RETAIN** |
| `stacked_parking_cost`, `stacked_parking_slots`, `stacked_parking_cost_per_slot` | NUMERIC / INT | Section G Stacked Parking | **RETAIN** |
| `overrides`, `override_history`, `notes`, `created_by`, `created_at`, `updated_at` | JSONB / TEXT / TIMESTAMPTZ | Active override storage & history | **RETAIN** (+ add `version` for concurrency) |

### 4.4 Tables: `project_statutory_charges`, `project_salable_units`, `project_feasibility_snapshots`, `feasibility_audit_logs`

| Table | Audit Status / Dependency | Disposition |
|---|---|---|
| `project_statutory_charges` (12 rows in DB) | Clean structure (`charge_code`, `rr_percentage`, `amount`, `is_enabled`, `is_deleted`, `is_custom`, `max_cap`, `rate_multiplier`). Keep `AMALGAMATION` disabled/excluded. | **RETAIN** |
| `project_salable_units` (1 row in DB) | Integrated Receipts `Salable Units Cost` rows (`unit_name`, `building_use`, `carpet_area_sqm`, `carpet_area_sqft`, `super_buildup_loading_sqft`, `super_buildup_area_sqft`, `unit_count`, `landowner_unit_count`, `rate_per_sqft`, `unit_price`, `total_amount`). Add `loading_mode` (`'fixed_sqft'` / `'percentage'`) and `loading_pct` so both `+300 sq ft` and `+30%` work cleanly. | **MIGRATE (ADD LOADING MODE COLS)** |
| `project_feasibility_snapshots` (0 rows in DB) | Stores immutable area & financial snapshots; add `UNIQUE(project_id, version_number)` if absent and wire Excel/PDF exports cleanly. | **REBUILD EXPORT INTEGRATION** |
| `feasibility_audit_logs` (130 rows in DB) | Active audit trail (`action`, `module`, `entity_type`, `old_value`, `new_value`). Add logging for override & salable unit mutations too. | **RETAIN** |

---

## 5. Exports, Overrides & Test Suites Disposition

| Feature / File | Audit Findings | Disposition |
|---|---|---|
| **Excel Export** (`AreaFeasibilityTab.jsx:350-425`) | Uses `XLSX.utils.json_to_sheet()` (values-only flat tables, no Excel formulas). | **REBUILD** (Two-document workbook matching `Area (SQ M)`, `Area (SQ FT)`, and `FINANCIAL VIABILITY` with live Excel formulas from authoritative backend state/snapshot) |
| **PDF Export** (`AreaFeasibilityTab.jsx:428-471`) | Uses `html2canvas` screenshot slicing into `jsPDF` (splits rows mid-line, no repeating headers). | **REBUILD** (Structured 2-document vector PDF — Area Statement & Financial Viability — with clean table headers, page numbers, zero HTML screenshot slicing) |
| **Test Suites (`server/tests/*.test.js`)** | Baseline run on 2026-11-28: **6 suites passed, 1 suite failed** (`timelineAndFeasibility.test.js` line 732 & line 1006). | **REBUILD / EXTEND** (Update legacy assertions aligned with approved `FR-01,05,08,09,11` rules; add tests for Gunthewari Slum-only TDR, Mixed-Use Res/Comm allocation, auto-suggested vs edited Paid FSI/TDR, bug fixes, transactional save, and Excel/PDF exports) |
