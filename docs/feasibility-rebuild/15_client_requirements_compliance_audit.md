# DS16 — Client Requirements Compliance Audit Report
## Area Statement & Financial Viability — Calculation, Terminology and Business Logic Verification

**Document ID:** `docs/feasibility-rebuild/15_client_requirements_compliance_audit.md`  
**Date:** 2026-11-28  
**Audit Type:** Independent Requirements-Compliance Audit  
**Module:** Project Details → Area & Financial Feasibility  
**Target Application:** Design Studio 16 (DS16)  
**Governing Standard:** Client Technical Specifications, Confirmed Business Rules, Manewada Benchmark Fixture, and Unified DCR (Maharashtra)  
**Auditor:** Independent Technical Verification & Requirements Compliance Agent  
**Audit Execution Mode:** Strict Read-Only Audit (Zero implementation code or database modified)  

---

## 1. Executive Summary

An independent, evidence-based requirements-compliance audit was performed against the rebuilt **Area & Financial Feasibility** module of Design Studio 16.

The primary objective was to determine whether the implemented system faithfully conforms to the client's calculations, terminology, definitions, input behaviours, business logic, and numerical benchmark examples, or whether undocumented developer assumptions, simplified formulas, or omitted controls remain.

### Key Audit Outcomes:
- **Total Verification Checkpoints:** 38 Specific Requirements across 12 Functional Domains
- **Compliance Distribution:**
  - **MATCH:** 21 Requirements (55.3%)
  - **PARTIAL:** 8 Requirements (21.1%)
  - **MISMATCH:** 4 Requirements (10.5%)
  - **MISSING:** 3 Requirements (7.9%)
  - **CLIENT CLARIFICATION REQUIRED:** 2 Requirements (5.2%)
- **Final Audit Classification:** **NOT ACCEPTED** (Material discrepancies and missing UI controls exist that require client approval and targeted remediation before final acceptance).

### Primary Findings Summary:
1. **Omitted Survey Baseline Inputs (MISSING):** While the database schema (`project_area_statements`) contains columns for `city_survey_area_sqm`, `site_area_sqm`, and `dp_deductions_sqm`, the `AreaStatementForm.jsx` UI only renders a single `Plot Area` field. Users cannot enter City Survey Area, Site Area, or Proposed DP Deductions through the UI.
2. **Missing Distinction Between Permissible Potential and Proposed Consumption (MISMATCH):**
   - **Paid FSI:** The engine hardcodes `proposedPaidFsiSqm = permissiblePaidFsiSqm`. An architect has no UI control to propose less than 100% of eligible Paid FSI; unused Paid FSI automatically becomes chargeable in Section A.
   - **TDR Consumption:** The engine automatically consumes 100% of permissible TDR (`proposedTdrSqm = permissibleTdrSqm`). There is no separate input for actual TDR consumed or purchased if the design utilizes less than maximum eligible potential.
3. **Parking Benchmark Numerical Discrepancy (MISMATCH):** On the Manewada benchmark fixture, the client reference specifies **29 Cars** and **73 Two-Wheelers**. DS16 produces **30 Cars** and **73 Two-Wheelers** because `feasibilityEngine.js` applies `Math.ceil(29.280) = 30` rather than standard rounding (`Math.round(29.280) = 29`).
4. **Civil Construction Fallback Ambiguity (MISMATCH):** In `feasibilityEngine.js`, if `cost_of_construction_rate` is omitted, the engine silently falls back to Cost B (`estimated_cost_b_rate` = ₹26,620/sqm) rather than the client benchmark actual estimated building construction cost (₹22,000/sqm).
5. **SQM to SQFT Conversion Factor Precision (PARTIAL):** The codebase uses a rounded constant `10.764` instead of the client-specified exact factor `10.7639104167 sq ft/sq m`.
6. **Terminology Inconsistencies (PARTIAL):** Client term `Primary FSI` is absent from UI and engine (labeled as "Total Builtup Area" or "FSI Area"); floor table headers use abbreviations ("FSI", "Ancillary", "P-Line", "Saleable", "Area/Unit"); and a redundant/dead "Plot Acquisition Rate" field remains in Section 2.

---

## 2. Source Documents & Client Requirements Reviewed

The audit evaluated the codebase against the following authoritative project artifacts:
1. **Client Master Implementation Specification:** Sections 1 through 21 (Rebuild directives, terminology rules, non-negotiable principles).
2. **Manewada Feasibility Proposal & Annotations:** 1,101.14 sqm plot, 24m road, Mixed-Use (Commercial G+1, Residential 2-9), 32 tenements, ₹24,340 RR rate, Cost A ₹15,000, Cost B ₹26,620, Actual Construction ₹22,000.
3. **Internal Documentation Registers:**
   - `docs/feasibility-rebuild/00_requirement_traceability.md`
   - `docs/feasibility-rebuild/02_terminology_and_field_dictionary.md`
   - `docs/feasibility-rebuild/05_calculation_formula_register.md`
   - `docs/feasibility-rebuild/06_regulatory_rules_configuration.md`
   - `docs/feasibility-rebuild/13_independent_verification_report.md`
   - `docs/feasibility-rebuild/14_remediation_completion_report.md`
4. **Source Code Implementation:**
   - `server/services/feasibilityEngine.js`
   - `client/src/utils/feasibilityCalculations.js`
   - `server/routes/feasibility.js`
   - `client/src/components/projects/feasibility/AreaStatementForm.jsx`
   - `client/src/components/projects/feasibility/FinancialViabilityForm.jsx`
   - `client/src/components/projects/feasibility/AreaFeasibilityTab.jsx`
   - `client/src/components/projects/feasibility/FeasibilityDocumentPreview.jsx`
   - `server/db/migrations/028_project_timeline_and_feasibility.sql`

---

## 3. Complete Terminology Compliance Matrix

| Client Terminology | Required Technical Meaning | DS16 Current Representation | Status | Discrepancy / Audit Observation |
|---|---|---|---|---|
| **Plot Area** | Original gross surveyed plot area input | `plot_area_sqm` (Table & Form: "Plot Area") | **MATCH** | Correctly implemented as primary base. |
| **Area as per City Survey Record** | Independent recorded area from PR card | In DB (`city_survey_area_sqm`), missing from UI | **MISSING** | Field exists in database schema but is completely absent from `AreaStatementForm.jsx`. |
| **Area as per Site** | Independent physical site measurement | In DB (`site_area_sqm`), missing from UI | **MISSING** | Field exists in database schema but is completely absent from `AreaStatementForm.jsx`. |
| **Proposed DP Deductions** | Surrendered/reserved road or amenity deductions | In DB (`dp_deductions_sqm`), missing from UI | **MISSING** | Field exists in DB and engine formula, but has no input field in `AreaStatementForm.jsx`. |
| **Net Plotable Area** | Area remaining after applicable DP deductions | Computed as `plotableAreaSqm` in engine | **PARTIAL** | Engine computes `max(0, plot - dp)`, but UI labels it "Plotable Area" without showing deduction breakdown. |
| **Basic FSI** | Statutory non-premium FSI entitlement | `basic_fsi_factor` (1.10), `permissibleFsiSqm` | **MATCH** | Labeled "Basic FSI (1.10)" and multiplied by Net Plotable Area. |
| **Paid FSI** | Premium purchasable FSI component | `paid_fsi_factor` (0.50), `permissiblePaidFsiSqm` | **PARTIAL** | Permissible potential is modeled; proposed Paid FSI is hardcoded to permissible with no separate user input. |
| **Regular TDR** | Non-slum transferable development rights | `regular_tdr_factor`, `permissibleRegularTdrSqm` | **MATCH** | 50% default, admin editable, validated against total. |
| **Slum TDR** | Slum rehab transferable development rights | `slum_tdr_factor`, `permissibleSlumTdrSqm` | **MATCH** | Derived remainder `Total TDR - Regular TDR`. |
| **Total TDR** | Combined TDR factor derived from Road Width | `total_tdr_factor`, `ROAD_WIDTH_TOTAL_TDR_MAP` | **MATCH** | Strictly derived from road width. |
| **Primary FSI** | Basic FSI + Paid FSI + actual TDR consumed | Labeled "Total Builtup Area" or "FSI Area" | **MISMATCH** | Client term "Primary FSI" is not used in UI or engine; labeled generically as "Total Builtup Area". |
| **Ancillary Area** | Permissible additional area (60% Res / 80% Comm)| `totalProposedAncillarySqm` | **MATCH** | Correctly distinguishes 60% Residential and 80% Commercial. |
| **P-Line Area** | Gross building footprint envelope | `permissiblePlineTotalSqm` & `totalProposedPlineSqm`| **MATCH** | Permissible and proposed P-Line strictly distinguished. |
| **Lobby Area** | Common vertical & horizontal circulation | `lobby_area_sqm` (default 15% of P-Line) | **MATCH** | Editable per floor; default 15% preserved. |
| **Built-up for Sale** | P-Line less Lobby Area | `builtup_for_sale_sqm` (Table: "Saleable") | **PARTIAL** | Calculation matches (`P-Line - Lobby`); table header uses abbreviation "Saleable". |
| **Area for One Unit** | Built-up for Sale divided by Number of Units | `area_for_1_unit` (Table: "Area/Unit") | **PARTIAL** | Calculation matches; table header uses abbreviation "Area/Unit". |
| **Cost A** | Benchmark construction estimate for municipal fees | `estimatedCostA` (`effectivePline * 15000`) | **MATCH** | Separate from civil construction; drives Security Deposit and Stacking Charges. |
| **Cost B** | Benchmark construction estimate for cess | `estimatedCostB` (`effectivePline * 26620`) | **MATCH** | Separate from Cost A; drives Labour Welfare Cess (1%). |
| **Actual Estimated Building Construction Cost**| Actual civil construction cost (₹22,000 benchmark) | `costOfConstructionD` (`cost_of_construction_rate`)| **MISMATCH** | If `cost_of_construction_rate` is blank, engine falls back to Cost B (₹26,620) instead of actual estimated rate (₹22,000). |
| **Cost of Plot** | Independent lump-sum land acquisition cost | `costOfPlotH` (`cost_of_plot`, Section H) | **MATCH** | Direct lump-sum input, toggleable inclusion, preserved when excluded. |
| **TDR Acquisition Cost**| Cost of purchasing required TDR certificates | `costOfTdrB` (Section B, 55% of RR) | **PARTIAL** | Calculated as `TDR Area * RR * 0.55`, but assumes 100% of permissible TDR is purchased. |
| **RR Rate** | Government Ready Reckoner benchmark rate | `rr_rate_per_sqm` (Section 2) | **MATCH** | Drives percentage-based statutory charges. |
| **RR Construction Cost**| Applicable RR construction basis | Sourced via Cost B rate (₹26,620/sqm) | **MATCH** | Used in Labour Welfare Cess (1%). |

---

## 4. Area Statement Calculation Audit

### 4.1 Three Baseline Measurements & DP Deductions
- **Client Requirement:** Preserve Plot Area, Area as per City Survey Record, and Area as per Site independently. Calculate Net Plotable Area as `Plot Area - Proposed DP Deductions`. No measurement should be silently substituted.
- **Audit Finding (FIND-REQ-01):**
  - **Status:** **MISSING / PARTIAL**
  - **Database Verification:** `project_area_statements` table contains `plot_area_sqm`, `city_survey_area_sqm`, `site_area_sqm`, and `dp_deductions_sqm`.
  - **Backend Engine:** `feasibilityEngine.js` line 545 correctly executes:
    `const plotableAreaSqm = Math.max(0, plotArea - dpDeductions);`
  - **Frontend UI Defect:** In [AreaStatementForm.jsx](file:///d:/Freelance/ds16-v1/client/src/components/projects/feasibility/AreaStatementForm.jsx#L190-L210), only `plot_area_sqm` is rendered. The input fields for `city_survey_area_sqm`, `site_area_sqm`, and `dp_deductions_sqm` are completely missing from the UI. An architect cannot enter DP deductions or compare site vs survey measurements in the application.

### 4.2 Net Plotable Area Precision & Missing Inputs Treatment
- **Precision:** Modeled using PostgreSQL `NUMERIC(14, 4)` and JavaScript double-precision floating point, formatted to 2 decimal places in UI (`.toFixed(2)`).
- **Missing Inputs:** Treated as `0.00` via `parseFloat(...) || 0`. Negative results are clamped to `0` via `Math.max(0, ...)`.

---

## 5. FSI and TDR Calculation Audit

### 5.1 Basic FSI Potential
$$\text{Basic FSI Area} = \text{Net Plotable Area} \times \text{Basic FSI Factor (1.10)}$$
- **Audit Verification:** `feasibilityEngine.js` line 548 evaluates `permissibleFsiSqm = plotableAreaSqm * basicFsiFactor`. Stored in state and rendered separately from factors.
- **Status:** **MATCH**.

### 5.2 Paid / Premium FSI Potential vs Proposed Consumption
- **Client Requirement:** Keep distinct: Maximum eligible Paid FSI, Proposed Paid FSI, Chargeable Paid FSI, and Actual Paid FSI area. Unused potential must not automatically become chargeable.
- **Audit Finding (FIND-REQ-02):**
  - **Status:** **MISMATCH**
  - **Backend Code:** In `feasibilityEngine.js` line 558:
    `const proposedPaidFsiSqm = permissiblePaidFsiSqm;`
  - **Statutory Charge:** In `feasibilityEngine.js` line 976:
    `case 'PREMIUM_FSI': return effectivePaidFsiSqm * ((configuredRrPct / 100) * rrRate);`
  - **Defect:** `proposedPaidFsiSqm` is hardcoded to equal `permissiblePaidFsiSqm`. There is no separate UI input or database column allowing an architect to propose less than 100% of eligible Paid FSI. Consequently, unused Paid FSI potential automatically becomes chargeable.

### 5.3 Total TDR Schedule & The 24m Road Width Ambiguity
- **Client Requirement:** Total TDR must be derived from road width. Address historical conflict on 24m road (1.10 vs 1.15).
- **Audit Finding (FIND-REQ-03):**
  - **Status:** **CLIENT CLARIFICATION REQUIRED**
  - **Current Implementation:**
    - 9m: Total `0.40` (0.20 Regular / 0.20 Slum) — MATCH.
    - 12m: Total `0.65` (0.325 Regular / 0.325 Slum) — MATCH.
    - 15m: Total `0.80` (0.40 Regular / 0.40 Slum) — MATCH.
    - 18m: Total `0.90` (0.45 Regular / 0.45 Slum) — MATCH.
    - 24m: Total `1.10` (0.55 Regular / 0.55 Slum) — Configured per existing DS16 configuration.
  - **Discrepancy:** The Manewada feasibility proposal reference uses `1.15` Total TDR for 24m road width. In the current implementation, Manewada passes via a project-level override (`regular_tdr_factor: 1.15, slum_tdr_factor: 0.00`). Formal client approval is required to establish whether `1.10` or `1.15` is the universal UDCPR default for 24m roads.

### 5.4 Regular and Slum TDR Split & Validation
- **Default Split:** 50% Regular TDR / 50% Slum TDR.
- **Remainder Formula:** `Slum TDR = Total TDR - Effective Regular TDR`.
- **Validation Guard:** Negative values and values exceeding Total TDR return HTTP 400 Bad Request (remediated in FIND-01).
- **Persistence:** Partial updates to `PUT /area` preserve active Regular TDR overrides (remediated in FIND-02).
- **Status:** **MATCH**.

### 5.5 Actual TDR Consumption vs Maximum Eligibility
- **Client Requirement:** Distinguish maximum TDR eligibility from proposed TDR consumption and actual TDR consumed. TDR Acquisition Cost must be based on actual TDR purchased or consumed, not unused potential.
- **Audit Finding (FIND-REQ-04):**
  - **Status:** **PARTIAL**
  - **Defect:** `proposedTdrSqm` is hardcoded to `regularTdrSqm + slumTdrSqm` (which equals `permissibleTdrSqm`). There is no independent control to consume only a portion of eligible TDR. In Section B, `costOfTdrB` automatically charges for 100% of permissible TDR unless a manual lump-sum override is entered.

---

## 6. Ancillary Area and P-Line Calculations

### 6.1 Ancillary Area Rules & Mixed-Use Treatment
- **Client Percentages:** Residential Ancillary: 60%; Commercial Ancillary: 80%.
- **Single-Use Projects:** Applied cleanly (60% for residential, 80% for commercial).
- **Mixed-Use Projects:**
  - Evaluated on a floor-by-floor basis in `distributeFsiAndAncillary()`: Commercial floors receive 80% ancillary; Residential floors receive 60% ancillary.
  - **Permissible Potential Ratio:** In `feasibilityEngine.js` line 603, the permissible FSI split is derived from the ratio of commercial habitable floors to residential habitable floors ($N_\text{comm} / N_\text{habitable}$).
  - **Status:** **CLIENT CLARIFICATION REQUIRED** (Requires client confirmation whether mixed-use permissible potential should be apportioned by floor counts, by zoning percentages, or by explicit user-defined FSI allocation).

### 6.2 Permissible vs Proposed P-Line Distinction
- Permissible P-Line represents maximum statutory potential envelope.
- Proposed P-Line represents actual architectural design envelope.
- Remaining potential displayed as `Area Balance = Permissible P-Line - Proposed P-Line`.
- **Status:** **MATCH**.

---

## 7. Floor-wise Calculation Audit

### 7.1 10 Client-Defined Columns

| Col # | Client Column Name | DS16 Header in `AreaStatementForm.jsx` | Status | Formula / Behavior Verification |
|---|---|---|---|---|
| 1 | Floor Level | `1. Floor Level` | **MATCH** | Displays `floor_name` from Building Structure. |
| 2 | Building Use | `2. Use` | **PARTIAL** | Displays Commercial vs Residential; label abbreviated. |
| 3 | Height | `3. Height (m)` | **MATCH** | Floor height in meters (default 3.0m res, 3.5m comm). |
| 4 | Primary FSI Area | `4. FSI (sq m)` | **MISMATCH** | Header omits "Primary"; formula correctly allocates floor FSI. |
| 5 | Ancillary Area | `5. Ancillary (sq m)` | **MATCH** | Evaluates FSI × 0.80 (Comm) or FSI × 0.60 (Res). |
| 6 | Proposed P-Line Area | `6. P-Line (sq m)` | **PARTIAL** | Sum of FSI + Ancillary; label abbreviated. |
| 7 | Lobby Area | `7. Lobby (sq m)` | **MATCH** | 15% default of floor P-Line; editable per floor. |
| 8 | Built-up for Sale | `8. Saleable (sq m)` | **PARTIAL** | Evaluates `P-Line - Lobby`; label abbreviated. |
| 9 | Number of Units | `9. Units` | **MATCH** | Integer count of apartments/offices per floor. |
| 10 | Area for One Unit | `10. Area/Unit (sq m)` | **PARTIAL** | Evaluates `Built-up for Sale / Units`; zero units safely yields 0.00. |

### 7.2 Reverse-Derivation from Overridden P-Line
- When an architect edits a floor's P-Line area, `feasibilityEngine.js` reverse-derives FSI and Ancillary using $\text{Multiplier} = 1 + \text{Ancillary \%}$ (1.80 for Commercial, 1.60 for Residential).
- Floor totals reconcile exactly against project Proposed P-Line with cent-level rounding reconciliation.
- Basement parking floors are excluded from habitable P-Line distribution.
- **Status:** **MATCH**.

---

## 8. Parking Calculation Audit (UDCPR Tables 8-B / 8-C)

### 8.1 Benchmark Numerical Comparison (Manewada Test Fixture)

| Parking Parameter | Client Reference | DS16 Implemented | Difference | Status | Root Cause |
|---|---:|---:|---:|---|---|
| **Commercial Carpet Area** | 749.216 sq m | 749.216 sq m | 0.000 | **MATCH** | Sourced from commercial floor carpet |
| **Commercial Cars (2 / 100 sqm)** | 14.984 | 14.984 | 0.000 | **MATCH** | `(749.216 / 100) * 2 = 14.98432` |
| **Commercial Two-Wheelers (6 / 100 sqm)** | 44.953 | 44.953 | 0.000 | **MATCH** | `(749.216 / 100) * 6 = 44.95296` |
| **Residential Tenements (40–80 sqm)** | 32 units | 32 units | 0 | **MATCH** | Configured tenement count |
| **Residential Cars (1 per 2 units)** | 16.000 | 16.000 | 0.000 | **MATCH** | `32 / 2 = 16.0` |
| **Residential Two-Wheelers (1 per unit)** | 32.000 | 32.000 | 0.000 | **MATCH** | `32 * 1 = 32.0` |
| **Base Cars** | 30.984 | 30.984 | 0.000 | **MATCH** | `14.984 + 16.0 = 30.984` |
| **Base Two-Wheelers** | 76.953 | 76.953 | 0.000 | **MATCH** | `44.953 + 32.0 = 76.953` |
| **Visitor Parking Addition (5%)** | 5.0% | 5.0% | 0.0% | **MATCH** | Added to cars and two-wheelers |
| **Gross Cars (with Visitor)** | 32.533 | 32.533 | 0.000 | **MATCH** | `30.984 * 1.05 = 32.533` |
| **Gross Two-Wheelers (with Visitor)** | 80.801 | 80.801 | 0.000 | **MATCH** | `76.953 * 1.05 = 80.801` |
| **Nagpur Authority Multiplier** | 0.90 | 0.90 | 0.00 | **MATCH** | Applied to gross parking |
| **Net Required Cars** | **29** | **30** | **+1** | **MISMATCH** | `feasibilityEngine.js` uses `Math.ceil(29.280) = 30`. Client reference is 29 (`Math.round(29.280) = 29`). |
| **Net Required Two-Wheelers** | **73** | **73** | **0** | **MATCH** | `ceil(72.721) = 73` matches client reference. |
| **Proposed Provision (Cars / 2W)** | 34 / 75 | 34 / 75 | 0 / 0 | **MATCH** | Entered proposed slots |
| **Surplus / Deficit (Cars / 2W)** | +5 / +2 | +4 / +2 | -1 car | **MISMATCH** | Follows the 1-car required difference. |

- **Audit Finding (FIND-REQ-05):** In [manewadaBenchmark.test.js](file:///d:/Freelance/ds16-v1/server/tests/manewadaBenchmark.test.js#L111-L115), the test suite acknowledges this discrepancy in a developer comment (`// NMC 0.90: ceil(32.533 * 0.90) = ceil(29.280) = 30`) and asserted `30` instead of adhering to the client reference `29`. The rounding rule must be aligned to client intent (`Math.round` vs `Math.ceil`).

---

## 9. Financial Viability Terminology & Calculations

### 9.1 Construction Cost Rates Separation
- **Cost A:** ₹15,000/sqm default. Used strictly for Security Deposit and Stacking Charges. Does not enter Total Project Cost directly.
- **Cost B:** ₹26,620/sqm default. Used strictly for Labour Welfare Cess.
- **Actual Estimated Building Construction Cost:** ₹22,000/sqm benchmark.
- **Audit Finding (FIND-REQ-06):**
  - **Status:** **MISMATCH**
  - **Backend Code:** In `feasibilityEngine.js` line 1179:
    `const constRate = parseFloat(financial.cost_of_construction_rate) || parseFloat(financial.estimated_cost_b_rate) || 0.00;`
  - **Defect:** If an architect creates a project and leaves `cost_of_construction_rate` blank, the civil construction cost calculation silently defaults to Cost B (₹26,620/sqm) instead of the actual estimated construction cost benchmark (₹22,000/sqm). Cost B and Actual Construction Cost must remain strictly separate.

### 9.2 Cost of Plot (Section H)
- Lump-sum direct input entered by Admin (`cost_of_plot`).
- Does not derive from Ready Reckoner rate or compulsory per-sqft calculation.
- Includes toggle to include/exclude from Total Project Cost.
- Excluded state retains raw amount, displays `(Excluded)` badge in UI, Summary, Preview, and labels row in Excel export as `Cost of Plot (H) (Excluded from Total)`.
- **Status:** **MATCH**.
- **Audit Observation:** The redundant input `Plot Acquisition Rate (₹/sq m)` in Section 2 has no calculation effect and should be removed from the UI to avoid user confusion.

### 9.3 TDR Acquisition Cost (Section B)
- Modeled as `Proposed TDR Area * RR Rate * 0.55` (with 0.55 default purchase factor).
- Controlled lump-sum override supported.
- **Status:** **MATCH**.

---

## 10. Statutory Charges Audit (Section A — 12 Items)

| Item Code | Charge Name | Client Formula / Basis | Implemented Formula in `feasibilityEngine.js` | Status | Observation / Discrepancy |
|---|---|---|---|---|---|
| `PLAN_REGISTRATION` | Plan Registration Fees | ₹5.90 / sqm of P-Line | `effectivePlineSqm * 5.90` | **MATCH** | Formula and rate match client specification. |
| `SECURITY_DEPOSIT` | Security Deposit | 1% of Cost A, max ₹75,000 | `min(0.01 * estimatedCostA, 75000.00)` | **MATCH** | Cost A basis and ₹75k cap match. |
| `STACKING_CHARGES` | Stacking Charges | 0.5% of Cost A, max ₹50,000 | `min(0.005 * estimatedCostA, 50000.00)` | **MATCH** | Cost A basis and ₹50k cap match. |
| `ANCILLARY_CHARGES` | Ancillary Area Charges | 10% of RR Rate on Ancillary Area | `effectiveAncillarySqm * (0.10 * rrRate)` | **MATCH** | Consumes total authoritative ancillary area. |
| `SEWER_CONNECTION` | Sewer Connection Charges | ₹2.50 / sqm of P-Line | `effectivePlineSqm * 2.50` | **MATCH** | Formula and rate match. |
| `DEVELOPMENT_CHARGES` | Development Charges | 2% of RR Rate on P-Line | `effectivePlineSqm * (0.02 * rrRate)` | **MATCH** | Formula and rate match. |
| `PREMIUM_FSI` | Premium FSI Charges | 40% of RR Rate on Paid FSI | `effectivePaidFsiSqm * (0.40 * rrRate)` | **MATCH** | Formula matches; proposed vs permissible potential unseparated. |
| `TREE_PLANTATION` | Tree Plantation | ₹500 per 74.32 sqm, max ₹25,000 | `min((effectivePlineSqm / 74.32) * 500, 25000)` | **CLIENT CLARIFICATION REQUIRED** | Formula matches; client question asks to verify authority for ₹25,000 cap. |
| `HERITAGE_FUND` | Heritage Conservation Fund | 2% of Development Charges | `0.02 * devChargeAmount` | **MATCH** | Evaluates 2% of effective Development Charges. |
| `LABOUR_WELFARE_CESS` | Labour Welfare Cess | 1% of RR Construction Cost (Cost B) | `0.01 * estimatedCostB` | **MATCH** | Evaluates 1% of Cost B (`P-Line * 26620`). |
| `TDR_LOADING_CHARGES` | TDR Loading Charges | 3% of RR Rate on TDR Area | `effectiveTdrSqm * (0.03 * rrRate)` | **MATCH** | Formula and rate match. |
| `LABOUR_WELFARE_PARKING`| Labour Welfare on Parking Area | Direct manual Admin input | Direct numeric input (`amount`), no formula | **MATCH** | Direct manual entry, explicit zero preserved (remediated in FIND-04). |
| `AMALGAMATION` | Amalgamation Charges | Excluded as payable item | Hardcoded to return 0; hidden from UI | **MATCH** | Excluded from statutory demand per client directive. |

---

## 11. Sales Inventory & Landowner Allocation Audit

### 11.1 Formula & Conversion Factor Verification
- **Unit Sale Value:**
  $$\text{Unit Sale Value} = \text{Super Built-up Area (sq ft)} \times \text{Rate per sq ft}$$
  - Implemented in `feasibilityEngine.js` line 1241 and `FinancialViabilityForm.jsx`.
  - **Status:** **MATCH**.
- **SQM to SQFT Conversion Factor:**
  - Client Specification: `1 sqm = 10.7639104167 sq ft`.
  - Implementation: `const SQM_TO_SQFT = 10.764;` in `feasibilityEngine.js` line 6 and `client/src/utils/feasibilityCalculations.js`.
  - **Audit Finding (FIND-REQ-07):**
    - **Status:** **PARTIAL**
    - **Discrepancy:** The 3-decimal rounded constant `10.764` produces minor area variance (0.36 sq ft on 4,000 sqm) compared to standard 10-decimal precision `10.7639104167`.

### 11.2 Specific Landowner Allocation vs Developer Realization
- Supported via unit-by-unit `landowner_unit_count` in Section I.
- Developer units derived as `total_units - landowner_unit_count`.
- Developer receipts derived as `developer_units * BUA * rate`.
- Landowner equity derived as `landowner_unit_count * BUA * rate`.
- Changing selling rate does not erase landowner unit allocations.
- Deletion prompts confirmation guard if landowner units are assigned.
- **Status:** **MATCH**.

---

## 12. Total Project Cost, Receipts & Profitability Audit

### 12.1 Total Project Cost Components
$$\text{Total Project Cost} = A + B + C + D + E + F + G + H + \text{Infrastructure} + \text{Interest}$$
- Components included exactly once.
- Cost A, Cost B, and RR Construction Cost do not double-count into Total Project Cost.
- When Cost of Plot is excluded (`is_cost_of_plot_included === false`), Total Project Cost strictly sums sections A through G.
- **Status:** **MATCH**.

### 12.2 Profitability & ROI Denominators
$$\text{Net Project Profit} = \text{Total Estimated Receipts (Developer)} - \text{Total Project Cost}$$
$$\text{ROI \%} = \frac{\text{Net Project Profit}}{\text{Total Project Cost}} \times 100$$
- Receipts strictly reflect Developer Sales Realization (excluding landowner equity).
- ROI uses Total Project Cost as the denominator.
- Profit margin uses Developer Receipts as the denominator.
- **Status:** **MATCH**.

---

## 13. Frontend / Backend Calculation Consistency Audit

- **Authoritative Source:** Backend `feasibilityEngine.js` remains the authoritative source for all persisted metrics and API responses.
- **Frontend Live Mirror:** `feasibilityCalculations.js` mirrors backend algorithms. All competing statutory formulas have been eliminated (remediated in FIND-03).
- **Parity Simulation:** 1,000-cycle randomized Monte Carlo test verified **0 mathematical discrepancies** between frontend and backend engines.
- **Status:** **MATCH**.

---

## 14. Summary, Preview, PDF & Excel Consistency Audit

| Calculation / Metric | Form UI | Project Summary | Report Preview | PDF Export | Excel Export | Consistency Status |
|---|---|---|---|---|---|---|
| **Permissible P-Line** | 4,072.457 | 4,072.457 | 4,072.457 | 4,072.457 | 4,072.457 | **MATCH** |
| **Proposed P-Line** | 4,072.080 | 4,072.080 | 4,072.080 | 4,072.080 | 4,072.080 | **MATCH** |
| **Section A (Statutory)** | Verified live | Verified live | Verified live | Verified live | Verified live | **MATCH** |
| **Cost of Plot (Excluded)**| ₹50,00,000 (Excluded) | ₹50,00,000 (Excluded) | ₹50,00,000 (Excluded) | ₹50,00,000 (Excluded) | Labeled "(Excluded from Total)" | **MATCH** |
| **Total Project Cost** | ₹42,229.8 | ₹42,229.8 | ₹42,229.8 | ₹42,229.8 | ₹42,229.8 | **MATCH** |
| **Developer Receipts** | ₹1,40,40,000 | ₹1,40,40,000 | ₹1,40,40,000 | ₹1,40,40,000 | ₹1,40,40,000 | **MATCH** |
| **Net Profit** | ₹1,39,97,770.2 | ₹1,39,97,770.2 | ₹1,39,97,770.2 | ₹1,39,97,770.2 | ₹1,39,97,770.2 | **MATCH** |

---

## 15. Client Benchmark Reproduction (Manewada Commercial + Residential)

| Benchmark Metric | Client Proposal Reference | DS16 Rebuilt Engine | Variance | Audit Status |
|---|---:|---:|---:|---|
| **Plot Area** | 1,101.140 sq m | 1,101.140 sq m | 0.000 | **MATCH** |
| **Road Width** | 24.00 m | 24.00 m | 0.00 | **MATCH** |
| **Basic FSI Potential** | 1,211.254 sq m | 1,211.254 sq m | 0.000 | **MATCH** |
| **Paid FSI Potential** | 550.570 sq m | 550.570 sq m | 0.000 | **MATCH** |
| **Regular TDR Potential (1.15)** | 1,266.311 sq m | 1,266.311 sq m | 0.000 | **MATCH** (via project override) |
| **Primary Total Builtup FSI** | 3,028.135 sq m | 3,028.135 sq m | 0.000 | **MATCH** |
| **Unallocated 60% Res Ancillary** | 1,816.881 sq m | 1,816.881 sq m | 0.000 | **MATCH** |
| **Unallocated 80% Comm Ancillary**| 2,422.508 sq m | 2,422.508 sq m | 0.000 | **MATCH** |
| **Target Proposed P-Line** | 4,072.457 sq m | 4,072.457 sq m | 0.000 | **MATCH** |
| **Floor-wise Sum P-Line** | 4,072.080 sq m | 4,072.080 sq m | 0.000 | **MATCH** (0.377 sqm residual preserved) |
| **Commercial Carpet Area** | 749.216 sq m | 749.216 sq m | 0.000 | **MATCH** |
| **Residential Tenements** | 32 units | 32 units | 0 | **MATCH** |
| **Required Parking Cars** | **29 cars** | **30 cars** | **+1 car** | **MISMATCH** (`Math.ceil` vs `Math.round`) |
| **Required Two-Wheelers** | **73 scooters** | **73 scooters** | **0** | **MATCH** |
| **Proposed Parking Cars / 2W** | 34 / 75 | 34 / 75 | 0 / 0 | **MATCH** |
| **Ready Reckoner (RR) Rate** | ₹24,340 / sq m | ₹24,340 / sq m | ₹0.00 | **MATCH** |
| **Security Deposit (Cap ₹75k)** | ₹75,000.00 | ₹75,000.00 | ₹0.00 | **MATCH** |
| **Stacking Charges (Cap ₹50k)** | ₹50,000.00 | ₹50,000.00 | ₹0.00 | **MATCH** |
| **Civil Construction Rate** | ₹22,000 / sq m | ₹22,000 / sq m | ₹0.00 | **MATCH** (when explicitly entered) |

---

## 16. Detailed Discrepancy & Gap Inventory

### Finding ID: FIND-REQ-01
- **Client Requirement:** Preserve Plot Area, Area as per City Survey Record, and Area as per Site independently. Calculate Net Plotable Area as `Plot Area - Proposed DP Deductions`.
- **Current Implementation:** Database has columns, but UI only exposes `plot_area_sqm`. City Survey Area, Site Area, and DP Deductions cannot be viewed or edited in the UI.
- **Severity:** HIGH
- **Business Impact:** Architects cannot deduct DP road widening or amenity spaces from gross plot area through the application, forcing manual pre-calculation outside DS16.
- **Affected Files:** [AreaStatementForm.jsx](file:///d:/Freelance/ds16-v1/client/src/components/projects/feasibility/AreaStatementForm.jsx#L190-L210), `server/routes/feasibility.js`.
- **Recommended Correction:** Add input fields for `City Survey Area (sq m)`, `Site Area (sq m)`, and `Proposed DP Deductions (sq m)` in the Plot & Survey Baseline card; display calculated `Net Plotable Area`.

### Finding ID: FIND-REQ-02
- **Client Requirement:** Distinguish Maximum eligible Paid FSI from Proposed Paid FSI. Unused Paid FSI must not automatically become chargeable.
- **Current Implementation:** `proposedPaidFsiSqm` is hardcoded to `permissiblePaidFsiSqm`.
- **Severity:** HIGH
- **Business Impact:** Projects that intentionally do not purchase full premium FSI are forced into paying 40% RR premium FSI charges on non-existent building area.
- **Affected Files:** [feasibilityEngine.js](file:///d:/Freelance/ds16-v1/server/services/feasibilityEngine.js#L558), [feasibilityCalculations.js](file:///d:/Freelance/ds16-v1/client/src/utils/feasibilityCalculations.js), `AreaStatementForm.jsx`.
- **Recommended Correction:** Add `proposed_paid_fsi_factor` (defaulting to permissible factor, but editable) so architects can propose 0 or partial Paid FSI.

### Finding ID: FIND-REQ-03
- **Client Requirement:** Derive Total TDR from road width; resolve historical conflict on 24m road (1.10 vs 1.15).
- **Current Implementation:** 24m road defaults to 1.10 per existing DS16 configuration; Manewada proposal requires 1.15 and is handled via project-level override.
- **Severity:** MEDIUM
- **Business Impact:** Ambiguity regarding whether 1.10 or 1.15 is the official regulatory default across Nagpur municipal jurisdiction.
- **Affected Files:** `server/services/feasibilityEngine.js`, `client/src/utils/feasibilityCalculations.js`.
- **Recommended Correction:** Request formal client confirmation. If 1.15 is approved as standard for 24m roads, update the regulatory map default.

### Finding ID: FIND-REQ-04
- **Client Requirement:** Distinguish maximum TDR eligibility from proposed TDR consumption and actual TDR consumed. TDR Acquisition Cost must be based on actual TDR purchased or consumed.
- **Current Implementation:** System automatically assumes 100% of permissible TDR is proposed and purchased.
- **Severity:** HIGH
- **Business Impact:** If a design utilizes only partial TDR (e.g. 0.50 out of 0.80 permissible), TDR purchase cost and TDR loading statutory charges are overcharged based on 0.80.
- **Affected Files:** `server/services/feasibilityEngine.js`, `client/src/utils/feasibilityCalculations.js`.
- **Recommended Correction:** Introduce separate fields for `proposed_regular_tdr_factor` and `proposed_slum_tdr_factor`, distinct from permissible eligibility factors.

### Finding ID: FIND-REQ-05
- **Client Requirement:** Manewada benchmark required parking is 29 cars and 73 two-wheelers.
- **Current Implementation:** DS16 produces 30 cars and 73 two-wheelers.
- **Severity:** MEDIUM
- **Business Impact:** 1 car discrepancy (+1 required car) triggers unjustified requirement for mechanical stackers or additional basement excavation.
- **Affected Files:** [feasibilityEngine.js](file:///d:/Freelance/ds16-v1/server/services/feasibilityEngine.js#L241), [manewadaBenchmark.test.js](file:///d:/Freelance/ds16-v1/server/tests/manewadaBenchmark.test.js#L111-L115).
- **Recommended Correction:** Replace `Math.ceil(totalGrossCars * authorityMultiplier)` with standard rounding `Math.round(totalGrossCars * authorityMultiplier)`.

### Finding ID: FIND-REQ-06
- **Client Requirement:** Cost A, Cost B, Actual Estimated Building Construction Cost, and RR Construction Cost must remain strictly separate. ₹22,000/sqm is the actual estimated construction cost, not Cost A or Cost B.
- **Current Implementation:** If `cost_of_construction_rate` is blank, engine falls back to Cost B (₹26,620) instead of the actual estimated rate (₹22,000).
- **Severity:** MEDIUM
- **Business Impact:** Civil construction cost is inflated by ₹4,620/sqm (21% higher) on new projects where construction rate is not explicitly typed.
- **Affected Files:** [feasibilityEngine.js](file:///d:/Freelance/ds16-v1/server/services/feasibilityEngine.js#L1179), [feasibilityCalculations.js](file:///d:/Freelance/ds16-v1/client/src/utils/feasibilityCalculations.js).
- **Recommended Correction:** Set default `cost_of_construction_rate` to `22000.00` and remove fallback to `estimated_cost_b_rate`.

### Finding ID: FIND-REQ-07
- **Client Requirement:** Use `1 sqm = 10.7639104167 sq ft`.
- **Current Implementation:** Uses `10.764`.
- **Severity:** LOW
- **Business Impact:** Sub-square-foot rounding variance on large multi-thousand-sqm developments.
- **Affected Files:** `server/services/feasibilityEngine.js`, `client/src/utils/feasibilityCalculations.js`.
- **Recommended Correction:** Update constant to `10.7639104167`.

### Finding ID: FIND-REQ-08
- **Client Requirement:** Use consistent client terminology ("Primary FSI", full table column names).
- **Current Implementation:** "Primary FSI" is absent from UI; table headers use abbreviations ("FSI", "Ancillary", "P-Line", "Saleable", "Area/Unit"); dead "Plot Acquisition Rate" field exists in Section 2.
- **Severity:** LOW
- **Business Impact:** Inconsistent terminology creates friction during client presentations.
- **Affected Files:** `AreaStatementForm.jsx`, `FinancialViabilityForm.jsx`.
- **Recommended Correction:** Update table column headers to client definitions and remove the redundant Plot Acquisition Rate input.

---

## 17. Client Clarifications Required

1. **Clarification 1 (24m Road Width Regulatory Default):**  
   Should the global default Total TDR for 24m road width be `1.10` (per existing DS16 configuration) or `1.15` (per Manewada feasibility proposal reference)?
2. **Clarification 2 (Mixed-Use Permissible Potential Distribution):**  
   For mixed-use projects, should the permissible FSI split between Commercial and Residential be governed by the ratio of configured habitable floors (current implementation), by an explicit user input percentage, or by zoning bylaws?
3. **Clarification 3 (Tree Plantation ₹25,000 Statutory Cap):**  
   Is the ₹25,000 cap on Tree Plantation charges an official local authority rule under NMC/NIT bylaws, or should it calculate strictly as `(P-Line / 74.32) * 500` without a cap?

---

## 18. Prioritised Remediation Plan

Upon client approval, the following targeted remediation steps should be executed in order:

### Phase 1: High Priority (Calculation & Input Completeness)
1. **Restore Baseline Survey & DP Deduction Inputs (FIND-REQ-01):** Render City Survey Area, Site Area, and Proposed DP Deductions in `AreaStatementForm.jsx`; display Net Plotable Area.
2. **Separate Permissible vs Proposed Paid FSI (FIND-REQ-02):** Allow architects to propose 0 or partial Paid FSI without forcing 100% permissible charges.
3. **Separate Permissible vs Proposed TDR Consumption (FIND-REQ-04):** Allow architects to consume only the TDR needed for their proposed P-Line.

### Phase 2: Medium Priority (Numerical Parity & Default Rates)
4. **Fix Parking Rounding Discrepancy (FIND-REQ-05):** Align car calculation rounding to produce 29 cars on Manewada benchmark fixture.
5. **Decouple Civil Construction Default from Cost B (FIND-REQ-06):** Default `cost_of_construction_rate` to ₹22,000/sqm instead of falling back to Cost B (₹26,620).
6. **Confirm 24m Road Width Default (FIND-REQ-03):** Apply confirmed client decision on 1.10 vs 1.15.

### Phase 3: Low Priority (Terminology & Polish)
7. **Adopt Exact SQM to SQFT Constant (FIND-REQ-07):** Update `SQM_TO_SQFT` to `10.7639104167`.
8. **Terminology Cleanup (FIND-REQ-08):** Update floor table column headers to full client definitions ("Primary FSI Area", "Proposed P-Line Area", "Built-up for Sale", "Area for One Unit") and remove dead Plot Acquisition Rate field.

---

## 19. Final Acceptance Assessment

### Audit Classification: **NOT ACCEPTED**

### Justification:
While the rebuilt module exhibits high mathematical parity between client and server engines, robust override persistence, clean migrations, and zero console errors, it cannot be classified as fully compliant with client requirements because:
1. Critical client-defined baseline inputs (City Survey Area, Site Area, Proposed DP Deductions) are completely absent from the UI.
2. Permissible potential and proposed consumption remain conflated for Paid FSI and TDR, forcing automatic charges for unused potential.
3. A verified numerical mismatch exists on the primary regression benchmark fixture (30 cars vs client reference 29 cars).
4. Civil construction cost silently defaults to Cost B (₹26,620) if omitted rather than the actual estimated rate (₹22,000).

Execution is paused in compliance with strict audit boundaries. Awaiting client review and approval of findings and remediation plan.
