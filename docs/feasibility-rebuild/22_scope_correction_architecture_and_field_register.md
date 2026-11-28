# DS16 — Scope Correction Architecture, Minimal-Input Register & Calculation Dependency Map

**Document ID:** `docs/feasibility-rebuild/22_scope_correction_architecture_and_field_register.md`  
**Date:** 2026-11-28  
**Supersedes:** 4-tab expanded UI architecture (`Project Summary`, `Report Preview`, standalone `Parking`, separate `Sales Inventory`).  
**Canonical Structural Reference:** `Sample Financial Viability Asolkar Sir.xlsx` (`Area (SQ M)`, `PLOT NO. 01 Area (SQ ft)`, and `FINANCIAL VIABILITY` worksheets).

---

## 1. Two-Tab Document Architecture

`Project Details → Area & Financial Feasibility` (`AreaFeasibilityTab.jsx`) renders **strictly two application tabs**:

1. **`Area Statement`** (`subtab=area-statement`)
   - Global toolbar controls shared across tabs: `Sq M (m²)` / `Sq Ft (ft²)` display toggle (1 sq m = `10.7639104167` sq ft), **Export Excel**, **Export PDF**, and **Save Feasibility**.
   - Reproduces original Excel `Area Statement` (`1..4`, `A..H`) with **Permissible** and **Proposed** columns + `Floor-wise Proposed P Line Area Statement` (`10` approved columns + `TOTAL HEIGHT`, `TOTAL PROPOSED P LINE AREA`, `Area Balance`, `Margin H/5`).
   - Contextual, compact DS16 form controls supply only essential inputs; all calculated cells derive exclusively from the authoritative backend engine.

2. **`Financial Viability`** (`subtab=financial-viability`)
   - Reproduces original Excel `FINANCIAL VIABILITY` sheet hierarchy in exact section order:
     1. Top Feasibility Summary Strip (`PLOT AREA`, `BASIC FSI`, `PREMIUM FSI`, `TDR`, `TOTAL POTENTIAL`, `ANCILLARY AREA`, `P-LINE` with `PERMISSIBLE` and `PROPOSED` rows — synced read-only from Area Statement).
     2. `ESTIMATED COST-A`, `ESTIMATED COST-B`, and `RR RATES RS`.
     3. Section A: Statutory Charges & `NMC/DEMAND RS` total (`12` approved active items; `Amalgamation` excluded; `LABOUR_WELFARE_PARKING` manual input).
     4. Section B: `14. COST OF TDR` (`TDR RS`).
     5. Section C: Additional Expenses (`MINOR EXPENSES`, `BPMS - STAFF CHARGES`, `AIRPORT NOC`, `FIRE NOC`, `ENTERTAINMENT CHARGES`, `CONSULTANTS / ADVOCATE FEES`, `EXTRA STAMP DUTY ON POTENTIAL`, `TOTAL C`).
     6. Project Development Costs (`COST OF PLOT H` with include/exclude toggle, `COST OF CONSTRUCTION D`, `COST OF INFRASTRUCTURE CONSTRUCTION`, `INTEREST`, `COST OF BASEMENT CONSTRUCTION E`, `RENT F`, `STACKED PARKING G`, `TOTAL`).
     7. `Receipts` (`1. Period Required`, `2. Salable Units Cost` with inline row entry/edit, `3. Total`, `4..7` ROI / Viability rows).
     8. `Project Viability` (`1. Project Cost`, `2. Receipts`, `3. Profit`).

### Explicitly Excluded Scope (Removed / Prohibited)
- `Project Summary` tab, `Report Preview` tab, KPI dashboard cards.
- Separate `Occupancy-Based Parking Calculations` section (`parking_config` DB column preserved untouched; UI/calculation reference excluded per Scope Correction §§3, 5, 7).
- Separate `Sales Inventory` module outside `Receipts` inside `Financial Viability`.
- Duplicate `Sales Realisation by Floor` table (`floors[].rate_per_sqm` UI removed; legacy DB column preserved safely).
- Dead `Plot Acquisition Rate` (`cost_of_plot_rate_per_sqm`) UI input.

---

## 2. Reassessment of Existing Form Structure & Input-to-Table Mapping

### 2.1 Existing `AreaStatementForm.jsx` Inputs Disposition

| Existing UI Input | DB Column | Disposition | Target Document Location & Reason |
|---|---|---|---|
| `plot_area_sqm` | `plot_area_sqm` | **ESSENTIAL (FIX UNIT BUG)** | Area Statement Row `1. Area Of Plot`. Fix `unitDisplay='sq_ft'` conversion bug on bound `<input>`. |
| *(Missing)* `city_survey_area_sqm` | `city_survey_area_sqm` | **ESSENTIAL (RESTORE)** | Area Statement Row `2. As Per City Survey Record`. DB column exists. |
| *(Missing)* `site_area_sqm` | `site_area_sqm` | **ESSENTIAL (RESTORE)** | Area Statement Row `3. As per site`. DB column exists. |
| *(Missing)* `dp_deductions_sqm` | `dp_deductions_sqm` | **ESSENTIAL (RESTORE)** | Area Statement Row `4. Deductions For Proposed D.P.`. Feeds Row `A` (`Net Plotable Area = Plot Area − DP Deductions`). |
| `building_use` | `building_use` | **ESSENTIAL (FIX LABEL)** | Controls `Residential (60%)`, `Commercial (80%)`, or `Mixed Use`. Fix Mixed Use helper text (`L232`). |
| `is_gunthewari` | `is_gunthewari` | **ESSENTIAL (WIRE ENGINE)** | Regular uses Total TDR; Gunthewari uses **Slum TDR only** (`FR-08`). Currently ignored by engine & route! |
| `road_width_m` | `road_width_m` | **ESSENTIAL** | `9m, 12m, 15m, 18m, 24m` -> determines permissible TDR potential. |
| `basic_fsi_factor` | `basic_fsi_factor` | **ESSENTIAL (ADMIN/USER)** | Area Statement Row `B` factor (`1.10` default). |
| `paid_fsi_factor` | `paid_fsi_factor` | **ESSENTIAL (ADMIN)** | Maximum Permissible Paid FSI factor (`0.50` default). |
| *(Missing)* `proposed_paid_fsi_factor` | `proposed_paid_fsi_factor` *(Add col)* | **ESSENTIAL (FR-05)** | Auto-suggested Proposed Paid FSI factor, editable (`0..paid_fsi_factor`); separates Max Paid FSI from Chargeable Paid FSI. |
| `regular_tdr_factor` | `regular_tdr_factor` | **ESSENTIAL (FIX GUNTHEWARI)** | Admin split of Regular TDR for Regular plots; locked to `0` for Gunthewari plots (`FR-08`). |
| `slum_tdr_factor` | `slum_tdr_factor` | **DERIVED** | Regular plot: `Total TDR - Regular TDR`; Gunthewari plot: Slum TDR only from road matrix (`0.20..0.55`). |
| *(Missing)* `proposed_regular_tdr_factor`, `proposed_slum_tdr_factor` | `proposed_regular_tdr_factor`, `proposed_slum_tdr_factor` *(Add cols)* | **ESSENTIAL (FR-09)** | Auto-suggested TDR consumption, editable (`<= permissible`), driving Section A TDR Loading & Section B TDR Cost. |
| *(Missing)* `primary_fsi_residential_pct` | `primary_fsi_residential_pct` *(Add col)* | **ESSENTIAL WHEN MIXED USE (FR-11)** | Explicit Residential % allocation (`Commercial % = 100 - Res %`, total = `100%`) feeding independent `60%` & `80%` ancillary. |
| *(Optional)* `existing_builtup_area_sqm`, `dividing_factor` | Existing DB cols | **RETAIN COMPACTLY (OPTIONAL)** | Defaults `0` / `1.6`; kept compact in baseline/advanced assumptions if project has existing structure. |
| `total_proposed_pline_override_sqm`, `is_proposed_pline_overridden` | Existing DB cols | **APPROVED OVERRIDE** | Project-level P-Line override modal; auto-suggests Paid FSI/TDR consumption when set lower than permissible. |
| Floor rows (`reconcile-floors`) | `project_area_floors` + `timeline_configurations` | **SOURCED ELSEWHERE** | Retrieved automatically from Central Building Structure (`timeline_configurations`); no separate add/delete. |
| Floor `usage_type`, `height_meters`, `pline_area_sqm`, `lobby_area_sqm`, `no_of_units` | `project_area_floors` | **ESSENTIAL / OVERRIDE IN TABLE** | Floor-wise P-Line table inputs; remove competing frontend math in `handleUpdateFloor()`. |
| `parking_config` section | `parking_config` | **REDUNDANT / EXCLUDED** | Remove UI inputs & parking cards per Scope Correction §§3, 5, 7 (keep DB col safe). |

### 2.2 Existing `FinancialViabilityForm.jsx` Inputs Disposition

| Existing UI Input | DB Column | Disposition | Target Document Location & Reason |
|---|---|---|---|
| `cost_of_plot_rate_per_sqm` | `cost_of_plot_rate_per_sqm` | **REDUNDANT / DEAD — REMOVE UI** | Cost of Plot is lump-sum only (`FR-16`). Keep DB col for backward schema safety only. |
| Section 5 `floors[].rate_per_sqm` (`Sales Realisation by Floor`) | `project_area_floors.rate_per_sqm` | **REDUNDANT / DUPLICATE — REMOVE UI** | Competes with `Receipts → Salable Units Cost`. Unify into single Receipts model (`FR-32`). Keep DB cols safe. |
| `rr_rate_per_sqm` | `rr_rate_per_sqm` | **ESSENTIAL** | Financial Viability `RR RATES RS` row (`R10`). |
| `tdr_purchase_factor` | `tdr_purchase_factor` *(Add missing DB col!)* | **ESSENTIAL (FIX BUG)** | Section B `14. COST OF TDR` factor (`0.55` default). **Bug fix:** column was missing in DB & engine hardcoded `0.55`! |
| `estimated_cost_a_rate`, `estimated_cost_b_rate` | Existing DB cols | **ESSENTIAL (ADMIN/USER)** | `15,000` & `26,620` benchmark rates driving statutory Cost A/B. Never added into Total Cost. |
| `cost_of_plot`, `is_cost_of_plot_included` | Existing DB cols | **ESSENTIAL + TOGGLE** | Section H `COST OF PLOT` lump-sum input + inclusion switch (`FR-16`). |
| `cost_of_construction_rate` | Existing DB col | **ESSENTIAL (FIX FALLBACK BUG)** | Section D `COST OF CONSTRUCTION` rate. **Bug fix:** remove fallback to Cost B (`26,620`). |
| `cost_of_infrastructure`, `interest_amount` | Existing DB cols | **ESSENTIAL (RESTORE `interest_amount` UI)** | Rows `COST OF INFRASTRUCTURE CONSTRUCTION` & `INTEREST`. |
| `basement_area_sqm`, `basement_rate_per_sqm` | Existing DB cols | **ESSENTIAL (CONDITIONAL / AUTO-HINT)** | Section E `COST OF BASEMENT CONSTRUCTION`; auto-suggest basement area if Basement floors have area, or direct edit + override. |
| `rent_tenements`, `rent_per_tenement_per_month`, `rent_months` | Existing DB cols | **ESSENTIAL (FIX `period_months` BUG)** | Section F `RENT = tenements × rate × rent_months`. Fix `PUT /financial` integer parse bug on text `period_months`. |
| `stacked_parking_slots`, `stacked_parking_cost_per_slot` | Existing DB cols | **ESSENTIAL** | Section G `STACKED PARKING = slots × rate` + override. |
| `minor_expenses`, `bpms_staff_charges`, `airport_noc`, `fire_noc`, `entertainment_charges`, `advocate_fees`, `extra_stamp_duty` | Existing DB cols | **ESSENTIAL (RESTORE MISSING UI INPUTS)** | Financial Viability Section C (`Rows 29–35`). All 7 DB cols exist; restore clean compact inputs! |
| Statutory charges (`is_enabled`, `rr_percentage`, manual `amount` for `LABOUR_WELFARE_PARKING`, overrides JSONB) | `project_statutory_charges`, `overrides` | **ESSENTIAL / APPROVED OVERRIDE** | Section A `NMC/DEMAND RS`. Exclude `AMALGAMATION`; remove `overrides` fallback on manual `LABOUR_WELFARE_PARKING`. |
| `period_months` | `period_months` (`VARCHAR`) | **ESSENTIAL** | Receipts Row `1. Period Required` (e.g. `'21-24 Months'`). |
| `salableUnits` (`unit_name`, `building_use`, `carpet_area`, `loading`, `loading_mode`, `unit_count`, `landowner_unit_count`, `rate_per_sqft`) | `project_salable_units` (+ `loading_mode` col) | **ESSENTIAL (INTEGRATE EDIT IN RECEIPTS)** | Receipts Row `2. Salable Units Cost`. Support both `+Sq Ft` (`Asolkar`) and `+%` (`Manewada`) loading, Add/Edit/Delete, Landowner exclusion. |

---

## 3. Minimal-Input Field Register (Final Inputs Only)

1. **Plot Baseline (Area Statement):** `plot_area_sqm`, `city_survey_area_sqm`, `site_area_sqm`, `dp_deductions_sqm` (and optional `existing_builtup_area_sqm`, `dividing_factor`).
2. **Classification & Factors (Area Statement):** `building_use`, `is_gunthewari`, `road_width_m`, `primary_fsi_residential_pct` (when Mixed Use), `basic_fsi_factor`, `paid_fsi_factor`, `proposed_paid_fsi_factor` (auto-suggested, editable), `regular_tdr_factor` (Regular plots only), `proposed_regular_tdr_factor`, `proposed_slum_tdr_factor` (auto-suggested, editable), optional `total_proposed_pline_override_sqm`.
3. **Floor Adjustments (Area Statement Table):** Per-floor `usage_type` (Mixed Use), `height_meters`, `pline_area_sqm` (override), `lobby_area_sqm` (override from 15%), `no_of_units`.
4. **Rates & Norms (Financial Viability):** `rr_rate_per_sqm`, `estimated_cost_a_rate`, `estimated_cost_b_rate`, `tdr_purchase_factor`, `cost_of_construction_rate`.
5. **Section A Manual/Toggle/Overrides:** Statutory `is_enabled`, `rr_percentage`, manual `LABOUR_WELFARE_PARKING.amount`, and controlled overrides (`overrides` JSONB).
6. **Section C Expenses (Manual Amounts):** `minor_expenses`, `bpms_staff_charges`, `airport_noc`, `fire_noc`, `entertainment_charges`, `advocate_fees`, `extra_stamp_duty`.
7. **Section E–H & Project Costs:** `cost_of_plot`, `is_cost_of_plot_included`, `cost_of_infrastructure`, `interest_amount`, `basement_area_sqm`, `basement_rate_per_sqm`, `rent_tenements`, `rent_per_tenement_per_month`, `rent_months`, `stacked_parking_slots`, `stacked_parking_cost_per_slot` (+ optional Section B/D/E/F/G/H overrides).
8. **Receipts (`Salable Units Cost`):** `period_months` and unit rows (`unit_name`, `building_use`, `carpet_area_sqm`/`sqft`, `loading_mode`, `super_buildup_loading_sqft`/`loading_pct`, `unit_count`, `landowner_unit_count`, `rate_per_sqft`).

---

## 4. Authoritative Calculation Dependency Chain & Formula Changes

1. `Net Plotable Area = max(0, Plot Area - Proposed DP Deductions)` (`FR-02`).
2. `Permissible Basic FSI = Plotable × basic_fsi_factor`; `Permissible Max Paid FSI = Plotable × paid_fsi_factor`.
3. `Permissible TDR` (`FR-06, FR-07, FR-08`):
   - Regular plot: `Total TDR = ROAD_WIDTH_TOTAL_TDR_MAP[road_width]`; `Regular TDR + Slum TDR = Total TDR` (`50/50` default; Admin Regular override allowed `0..Total`).
   - Gunthewari plot: `Regular TDR = 0` (locked); `Slum TDR = ROAD_WIDTH_TDR_MAP[road_width].slum`; `Total TDR = Slum TDR`.
4. `Permissible Primary FSI (Builtup E) = Basic + Max Paid + Total Permissible TDR`.
5. `Primary FSI Mixed-Use Split (FR-11)`:
   - Residential = `100% / 0%`; Commercial = `0% / 100%`; Mixed Use = explicit `primary_fsi_residential_pct + primary_fsi_commercial_pct = 100%`.
   - `Comm Ancillary = Comm Primary × 0.80`; `Res Ancillary = Res Primary × 0.60`.
   - `Total Permissible P-Line (H) = Permissible Primary FSI + Comm Ancillary + Res Ancillary`.
6. `Auto-Suggested & Effective Proposed Consumption (FR-05, FR-09)`:
   - If project-level P-Line override or all-floor P-Line overrides reduce required FSI below max potential (and architect has not pinned custom `proposed_*` factors), auto-suggest `Basic -> Paid -> Regular/Slum TDR` to match actual design need; otherwise default suggestion = eligible Paid FSI & eligible Regular/Slum TDR.
   - Architect edits to `proposed_paid_fsi_factor`, `proposed_regular_tdr_factor`, `proposed_slum_tdr_factor` (validated `<= permissible`) determine `Effective Chargeable Paid FSI` and `Effective Chargeable TDR`. Unused FSI/TDR is **never** charged!
7. `Floor Distribution (FR-13)`:
   - Distribute Commercial Primary FSI & Residential Primary FSI across their respective un-overridden habitable floors with cent-level reconciliation; compute `Ancillary (80%/60%)`, `P-Line`, `Lobby (15% default)`, `Built-up for Sale = P-Line - Lobby`, `Area for 1 Unit = Sale / Units`, `Area Balance = Permissible P-Line - Proposed P-Line`, and `Margin = Total Height / 5`.
8. `Financial Viability Flow (Sections A..H + Receipts + Profit)`:
   - Receives `plotableAreaSqm`, `proposedPaidFsiSqm` (Chargeable Paid FSI), `proposedTdrSqm` (Chargeable TDR), `totalProposedAncillarySqm`, `effectiveProposedPlineSqm`, and factor/breakdown rows.
   - `1 sq m = 10.7639104167 sq ft` standardized across backend, frontend, APIs, and exports (`FR-01`).
   - Fix `cost_of_construction_rate` fallback bug (never fall back to Cost B!), fix hardcoded `0.55` TDR purchase factor bug, fix `unit_count || 1` and `rate_per_sqft || 6000` falsy-zero bugs, fix `rentAmountF -> rentCostF` in `/export`, fix `period_months` string persistence in `PUT /financial`, and isolate exports strictly from server calculation snapshots (`area_statement` + `financial_viability` sheets/tables only).

---

## 5. Final Table Cell Source Verification Matrix

Every visible cell across **Table 1 (`Area Statement` & `Floor-wise P-Line`)** and **Table 2 (`Financial Viability`)** maps directly to either a `Minimal Input`, `Read-Only DS16 Source`, `Approved Override`, or `Backend Derived Formula`:

- **Area Statement (`1..4`, `A..H`):** Rows `1..4` from Minimal Plot Inputs (`Plot`, `Survey`, `Site`, `DP`); Row `A` (`Plot - DP`); Rows `B, C, D` Permissible from Plotable × factors, Proposed from Effective Suggested/Edited factors; Row `E` (`B+C+D`); Row `F` (`E / A`); Row `G` Comm `80%` & Res `60%` computed on allocated Commercial & Residential Primary FSI; Row `H` (`E+G`).
- **Floor-wise Table (`10 columns + Totals + Area Balance + Margin`):** Floor list from `timeline_configurations`; Floor Use/Height/P-Line Override/Lobby Override/Units from Table Inputs; Primary FSI, Ancillary, Equal P-Line, Default 15% Lobby, Sale, Area/Unit, Total Height, Floor Sum, Area Balance, and Margin `H/5` all backend-derived.
- **Financial Viability (`Overview + Cost Norms/RR + Sections A..H + Receipts + Viability`):** Top Overview rows 100% synced from Area Statement; Cost A/B & RR from Minimal Inputs; Statutory A items `1..11` backend-derived (+ enable/RR%/override); Item `13` Labour Welfare Parking manual Admin input; Section B `effectiveTdrSqm × RR × tdr_purchase_factor` (+ override); Section C 7 manual inputs + derived Total C; Section D..H + Infra + Interest from Minimal Inputs/Backend Formulas/Overrides; Total Cost = sum A..H + Infra + Interest; Receipts = `period_months` + Unit Rows (`Super = Carpet + Loading` where Loading is fixed `sq ft` or `%`, `Unit Price = Super × Rate`, `Developer Receipts` excluding Owner units); Viability = `Project Cost`, `Receipts`, `Profit = Receipts - Cost`, and `ROI %`.
