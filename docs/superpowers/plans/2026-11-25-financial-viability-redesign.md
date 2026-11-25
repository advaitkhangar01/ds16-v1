# Financial Viability Redesign: Minimum Input, Maximum Automatic Derivation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the DS16 Financial Viability subtab to minimize manual data entry by automatically sourcing project geometry, areas, and configurations from the Area Statement and Building Configuration, while providing a compact assumptions interface, authentic workbook formula calculations, and an audit-logged controlled override system.

**Architecture:** Single source of truth model where `project_area_statements`, `project_area_floors`, and `timeline_configurations` feed directly into `feasibilityEngine.js`. Financial viability inputs are divided into 4 explicit categories (Auto-Sourced, Essential Assumptions, Conditional Expenses, Optional Overrides). Overrides are tracked in a dedicated `overrides` JSONB column with calculation basis snapshots and drift detection. Frontend presents a compact 5-group collapsible assumption interface paired with a live, synchronized report preview.

**Tech Stack:** PostgreSQL, Node.js/Express, React (Tailwind CSS, Lucide-react), SheetJS (`xlsx`), Jest.

**Spec References:**
- User Specification: "DS16 — Financial Viability: Minimum Input, Maximum Automatic Derivation"
- Excel-to-DS16 Mapping: `docs/financial_viability/excel_to_ds16_mapping.md`
- Formula Register: `docs/financial_viability/formula_and_dependency_register.md`
- Unresolved Formula Register: `docs/financial_viability/unresolved_formula_and_ambiguity_register.md`
- Database & API Specification: `docs/financial_viability/database_and_api_specification.md`

## Global Constraints

- **Single Source of Truth**: Plot area, FSI, TDR, ancillary area, P-Line area, floor counts, basement area, and unit configurations must be read directly from their authoritative source modules. No duplicate inputs in Financial Viability.
- **Cost A and Cost B Preservation**: Cost A (₹15,000/sqm default) and Cost B (₹26,620/sqm default) are preserved as distinct assumptions. Cost A drives Security Deposit (1%, max ₹75,000) and Stacking Charges (0.5%, max ₹50,000). Cost B drives Labour Welfare Cess (1%) and Parking Labour Cess (1%). Civil construction cost remains driven by its own assumption rate `cost_of_construction_rate` (₹20,000/sqm default).
- **Metric Classification**: Do not introduce unapproved metrics (Profit Margin, standard ROI) as workbook-derived. Clearly distinguish:
  1. Existing Workbook Formulas
  2. Verified DS16 Formulas (resolving Excel `#REF!` in basement and `=SUM(I50:J50)` single-row defect)
  3. Newly Proposed Calculations (explicitly demarcated as proposed/non-authoritative)
- **Amalgamation Charges**: Must remain excluded from active statutory demand calculations per approved DS16 requirements (REQ-J).
- **Statutory Charges Configuration**: All 12 active statutory charges support independent enable/disable checkboxes, independent RR percentages (where applicable), fixed amounts, and statutory caps. Unchecked charges remain visible with an `Excluded` tag.
- **Controlled Override States**:
  1. `Calculated`: Displays live engine calculation.
  2. `Override Available`: Visual trigger to input an override.
  3. `Override Active`: Uses manual amount as active value, displays original calculated amount, captures user, timestamp, and reason, and flags if calculation basis drifts. Provides 1-click `Reset to Calculated`.
- **Integrity**: Preserve existing authentication, project isolation, RBAC (`isPrivileged` / `isAdmin` / `isAccounts`), financial snapshots, and audit history.

## Review Focus

1. **Cost A vs Cost B Independence**: Verify that changing Cost A updates Security Deposit and Stacking Charges without affecting Labour Welfare Cess, and changing Cost B updates Labour Welfare Cess without altering Security Deposit.
2. **Auto-Sourcing Without Duplication**: Verify that updating Plot Area or Floor P-Line in Area Statement immediately updates the Financial Viability statutory and construction costs without requiring user re-entry.
3. **Statutory Enable/Disable Persistence**: Verify that unchecking a statutory charge excludes it from total statutory demand while keeping its row visible across reloads and exports.
4. **Controlled Override Drift Detection**: Verify that applying an override records `calculated_basis_val`, and subsequently modifying floor areas in Area Statement triggers a visual "Calculation Basis Changed" drift warning on the override.
5. **No Sample Data Hardcoding**: Verify that creating a fresh project initializes empty/zero values rather than hardcoded sample figures from the reference Excel.

---

### Task 1: Database Migration for Controlled Overrides & History

**Files:**
- Create: `server/db/migrations/035_financial_viability_overrides_and_derivations.sql`
- Test: `server/tests/feasibilityOverridesSchema.test.js`

**Interfaces:**
- Produces: `overrides` JSONB and `override_history` JSONB columns on table `project_financial_viabilities`.

- [ ] **Step 1: Write Migration 035 SQL**
Add `overrides JSONB DEFAULT '{}'::jsonb` and `override_history JSONB DEFAULT '[]'::jsonb` to `project_financial_viabilities`. Include descriptive column comments.

- [ ] **Step 2: Apply migration to local development database**
Execute: `node -e "const pool = require('./server/db'); pool.query(require('fs').readFileSync('./server/db/migrations/035_financial_viability_overrides_and_derivations.sql', 'utf8')).then(() => { console.log('Migration 035 applied'); process.exit(0); });"`
Expected: "Migration 035 applied" with code 0.

- [ ] **Step 3: Write migration test**
Create `server/tests/feasibilityOverridesSchema.test.js` asserting that `project_financial_viabilities` contains the `overrides` and `override_history` columns.

- [ ] **Step 4: Run test to verify**
Run: `npm --prefix server test tests/feasibilityOverridesSchema.test.js`
Expected: PASS.

---

### Task 2: Extend Authoritative Calculation Engine (`feasibilityEngine.js`)

**Files:**
- Modify: `server/services/feasibilityEngine.js`
- Test: `server/tests/feasibilityEngineWorkbookCompliance.test.js`

**Interfaces:**
- Consumes: `financial`, `statutoryItems`, `salableUnits`, `areaMetrics`, `buildingConfig`
- Produces: `financialMetrics` containing calculated amounts, effective amounts (with overrides applied), drift flags, and categorized metrics.

- [ ] **Step 1: Write unit tests for workbook formula compliance & Cost A/Cost B isolation**
In `server/tests/feasibilityEngineWorkbookCompliance.test.js`:
- Test that Security Deposit is $\min(0.01 \times (\text{P-Line} \times \text{Cost-A}), 75000)$.
- Test that Stacking Charges is $\min(0.005 \times (\text{P-Line} \times \text{Cost-A}), 50000)$.
- Test that Labour Welfare Cess is $0.01 \times (\text{P-Line} \times \text{Cost-B})$.
- Test that Labour Welfare on Parking is $0.01 \times (225 \times \text{Cost-B Rate})$.
- Test that Cost of Construction is $\text{P-Line} \times \text{cost\_of\_construction\_rate}$.
- Test that Amalgamation is excluded (returns 0).
- Test that active overrides take precedence over calculated values and set `is_overridden: true`.
- Test that basis drift is detected when current calculated differs from `calculated_basis_val`.

- [ ] **Step 2: Run test to verify failure before implementation**
Run: `npm --prefix server test tests/feasibilityEngineWorkbookCompliance.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement exact formula dependencies and override evaluation in `feasibilityEngine.js`**
Update `calculateFinancialMetrics`:
1. Preserve `estimatedCostARate` and `estimatedCostBRate` as independent rate multipliers.
2. Wire `SECURITY_DEPOSIT` and `STACKING_CHARGES` strictly to Cost A.
3. Wire `LABOUR_WELFARE_CESS` and `LABOUR_WELFARE_PARKING` strictly to Cost B.
4. Calculate Basement Cost as $\text{Basement Area} \times \text{Basement Rate}$ (resolving Excel `#REF!`).
5. Evaluate all 12 statutory charges with their independent `rr_percentage` and `is_enabled` states.
6. Evaluate active overrides from `financial.overrides`:
   - Replace calculated value with `override_val` in project totals.
   - Detect `override_basis_changed` if $\Delta(\text{current\_calculated}, \text{calculated\_basis\_val}) > 1.0$.
7. Return categorized metric objects:
   ```javascript
   {
     calculated_amount: number,
     effective_amount: number,
     is_overridden: boolean,
     override_basis_changed: boolean,
     override_details: object | null
   }
   ```
8. Keep Net Profit as workbook formula (`Total Receipts - Total Project Cost`). Flag ROI % as `proposed_roi_pct` and Profit Margin % as `proposed_margin_pct`.

- [ ] **Step 4: Run test to verify pass**
Run: `npm --prefix server test tests/feasibilityEngineWorkbookCompliance.test.js`
Expected: PASS.

---

### Task 3: Backend Routes & Controlled Override Endpoints (`feasibility.js`)

**Files:**
- Modify: `server/routes/feasibility.js`
- Test: `server/tests/feasibilityApiOverrides.test.js`

**Interfaces:**
- Consumes: Express request with project ID, metric key, override value, and reason.
- Produces: Updated `project_financial_viabilities` record, audit log entry, and recalculation response.

- [ ] **Step 1: Write integration tests for override endpoints**
In `server/tests/feasibilityApiOverrides.test.js`:
- Test `PUT /api/projects/:projectId/feasibility/financial/overrides` sets override with snapshot.
- Test `POST /api/projects/:projectId/feasibility/financial/overrides/reset` restores live calculation.
- Test that audit trail is written to `feasibility_audit_logs`.
- Test that non-privileged users receive 403 Forbidden.

- [ ] **Step 2: Run integration tests to verify failure**
Run: `npm --prefix server test tests/feasibilityApiOverrides.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement override endpoints in `server/routes/feasibility.js`**
1. Add `PUT /financial/overrides`:
   - Validates `metric_key` against approved eligible metrics.
   - Captures current calculated value as `calculated_basis_val`.
   - Records user ID, user name, timestamp, and justification reason.
   - Appends to `override_history` and logs to `feasibility_audit_logs`.
2. Add `POST /financial/overrides/reset`:
   - Sets `is_active: false` on the specified metric key.
   - Records reset action in `override_history` and `feasibility_audit_logs`.
3. Update `GET /`:
   - Source building configuration (basements, parking) and area statement baselines.
   - Return `autoSourcedMetadata` block in JSON response.

- [ ] **Step 4: Run integration tests to verify pass**
Run: `npm --prefix server test tests/feasibilityApiOverrides.test.js`
Expected: PASS.

---

### Task 4: Compact Financial Assumptions & 4-Category UI (`FinancialViabilityForm.jsx`)

**Files:**
- Modify: `client/src/components/projects/feasibility/FinancialViabilityForm.jsx`
- Modify: `client/src/components/projects/feasibility/AreaFeasibilityTab.jsx`

**Interfaces:**
- Consumes: `financial`, `areaMetrics`, `financialMetrics`, `autoSourcedMetadata`, `floors`, `statutoryCharges`, `isPrivileged`
- Produces: Compact assumptions form with Category A summary banner, collapsible Category B groups, Category C conditional inputs, and Category D override badges/modals.

- [ ] **Step 1: Build Category A "Automatically Sourced Baselines" Header Bar**
Display read-only tags at the top with source attribution badges:
- `Plot Area` (Source: Area Statement)
- `Basic / Paid / TDR FSI Factors` (Source: Area Statement)
- `Total Proposed P-Line` (Source: Floor Plates)
- `Habitable Floors` (Source: Floor Plates)
- `Basement Area` (Source: Building Configuration)
- `Stacked Parking Slots` (Source: Parking Configuration)

- [ ] **Step 2: Build Category B "Compact Project Financial Assumptions" (Collapsible Groups)**
Organize manual assumptions into 5 clean collapsible cards:
1. **Market & Ready Reckoner Assumptions**: RR Rate (₹/sqm), Cost A Rate (₹/sqm), Cost B Rate (₹/sqm).
2. **Civil & Development Cost Assumptions**: Construction Rate (₹/sqm), Plot Purchase Rate (₹/sqm) or Lump Sum.
3. **Tenant Rent & Stacked Parking**: Tenement count, Rent/tenement/month, Construction months, Stacked parking cost/slot.
4. **Sales & Unit Realization Assumptions**: Global / floor-level selling rate, Super built-up loading (default 300 sq ft).
5. **Financing & Project Timeline**: Project duration (months), Construction loan interest amount (₹).

- [ ] **Step 3: Build Category C "Conditional Expenses"**
Conditionally render input sections only when applicable:
- Basement Construction: Only visible if basement area > 0 (or allows user to toggle "Project includes Basement").
- Stacked Parking: Only visible if stacked parking slots > 0.
- Statutory Clearances: Fire NOC, BPMS Staff, Airport NOC, Entertainment, Extra Stamp Duty grouped in a clean card.

- [ ] **Step 4: Build Category D "Controlled Override Controls"**
For each eligible metric (Statutory Total, Construction Cost, Basement Cost, Rent, Parking, Plot Cost, Total Receipts):
- State 1 (`Calculated`): Displays live calculated value with a subtle `Override` action button.
- State 2 (`Override Active`): Shows an orange border, an `OVERRIDDEN` badge, original calculated amount in muted text, user/timestamp tooltip, and a `Reset to Calculated` button.
- Drift Warning: If `override_basis_changed` is true, display an amber alert: `⚠️ Calculation basis has changed since this override was set. Review or reset.`
- Modal / Inline Prompt: Captures override value and required justification reason.

- [ ] **Step 5: Wire handlers in `AreaFeasibilityTab.jsx`**
Add `handleSetOverride(metricKey, value, reason)` and `handleResetOverride(metricKey)` connecting to the new backend endpoints.

---

### Task 5: Document Preview & Excel Export Synchronization

**Files:**
- Modify: `client/src/components/projects/feasibility/FeasibilityDocumentPreview.jsx`
- Modify: `client/src/components/projects/feasibility/AreaFeasibilityTab.jsx`

**Interfaces:**
- Consumes: `financialMetrics` with calculated and effective values.
- Produces: Feasibility report preview and multi-sheet Excel export reflecting effective amounts and override markers.

- [ ] **Step 1: Update `FeasibilityDocumentPreview.jsx`**
1. Display effective amounts in all summary tables (Section A, Sections B–H, Total Cost, Receipts, Profit).
2. For overridden items, display a small `[Override]` marker with original calculated value visible in subtle subtext so the report remains transparent.
3. Clearly label Net Profit as authoritative; label ROI % as `ROI (Proposed)`.

- [ ] **Step 2: Update Excel Export in `AreaFeasibilityTab.jsx`**
1. Output both calculated and effective override values in the `Financial Viability` worksheet.
2. Ensure disabled statutory charges remain omitted from totals.

---

### Task 6: Unit & Integration Verification with Excel Reference Benchmark

**Files:**
- Test: `server/tests/feasibilityEngineWorkbookCompliance.test.js`
- Test: `server/tests/feasibilityApiOverrides.test.js`

- [ ] **Step 1: Run comprehensive backend test suite**
Run: `npm --prefix server test`
Expected: All test suites pass.

- [ ] **Step 2: Run frontend production build**
Run: `npm --prefix client run build`
Expected: Build succeeds with 0 errors.

- [ ] **Step 3: Verification against Reference Excel using exact inputs**
Input benchmark values:
- Plot: 270 sqm, Basic FSI: 1.1, Paid FSI: 0.5, TDR Factor: 0.545, P-Line: 926.64 sqm.
- RR Rate: ₹24,340, Cost-A: ₹15,000, Cost-B: ₹26,620.
- Construction Rate: ₹20,000, Rent: 3 tenements × ₹15,000 × 24 mos, Parking: 10 slots × ₹2,00,000.
Verify:
- Total Statutory Demand (A) = ₹32,27,294.18.
- Cost of TDR (B) = ₹19,69,897.05.
- Cost of Construction (D) = ₹1,85,32,800.00.
- Total Expenses (C) = ₹9,25,000.00.
- Total Project Cost = ₹3,81,54,991.23.
- Total Receipts = ₹18,27,34,203.42 (with all 3 unit configurations included).
- Net Profit = ₹14,45,79,212.19.
