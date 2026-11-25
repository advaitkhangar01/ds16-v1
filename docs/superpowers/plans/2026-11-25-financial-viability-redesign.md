# Financial Viability Redesign: Minimum Input, Maximum Automatic Derivation & Centralised Building Configuration

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the DS16 Financial Viability subtab to minimize manual data entry by automatically sourcing project geometry, areas, and configurations from the Area Statement and Central Building Configuration, while providing a compact assumptions interface, authentic workbook formula calculations, centralized floor hierarchy reconciliation, and an audit-logged controlled override system.

**Architecture:** 
1. **Central Building Configuration as Single Source of Truth**: Building Configuration (`timeline_configurations`) governs the authoritative building structure and floor hierarchy across the entire project. Floor hierarchy is reconciled into `project_area_floors` with existing measurements preserved. Neither Area Statement nor Financial Viability allows independent addition or deletion of building floors.
2. **Four Input Categories**: Inputs are strictly divided into Category A (Auto-Sourced), Category B (Essential Assumptions in 5 collapsible groups), Category C (Conditional Expenses), and Category D (Controlled Overrides).
3. **Controlled Override System**: Overrides are tracked in a dedicated `overrides` JSONB column with calculation-basis snapshots, drift detection, and 1-click reset.
4. **Authoritative Calculation Engine**: `feasibilityEngine.js` performs all workbook formula calculations (Cost A/B isolation, 12 statutory charges with independent RR % and caps, development costs, unit realizations, and viability outputs).

**Tech Stack:** PostgreSQL, Node.js/Express, React (Tailwind CSS, Lucide-react), SheetJS (`xlsx`), Jest.

**Spec References:**
- User Specification: "DS16 — Financial Viability: Minimum Input, Maximum Automatic Derivation"
- Mandatory Rule: "Mandatory Architecture Rule — Centralised Building Configuration"
- Excel-to-DS16 Mapping: `docs/financial_viability/excel_to_ds16_mapping.md`
- Formula Register: `docs/financial_viability/formula_and_dependency_register.md`
- Unresolved Formula Register: `docs/financial_viability/unresolved_formula_and_ambiguity_register.md`
- Database & API Specification: `docs/financial_viability/database_and_api_specification.md`

## Global Constraints

- **Central Building Configuration as Sole Floor Authority**: Floors are configured ONLY ONCE in Building Configuration (`timeline_configurations`). Area Statement and Financial Viability consume this centrally maintained floor structure. Independent "Add Floor" / "Delete Floor" actions are removed from Area Statement and Financial Viability forms.
- **Controlled Floor Reconciliation**: When Building Configuration changes, `reconcileBuildingFloors` reconciles `project_area_floors`:
  - Existing floor measurements (`height_meters`, `pline_area_sqm`, `lobby_area_sqm`, `builtup_for_owners_sqm`, `builtup_for_sale_sqm`, `no_of_units`, `rate_per_sqm`, `cost_for_1_unit`, `remarks`) are **strictly preserved** by matching on `floor_key`.
  - New floors are created with architectural defaults.
  - Retired floors are deactivated (`is_active = FALSE`) without breaking historical snapshots or audit records.
  - Timeline activities are synchronized in the same cycle.
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

1. **Central Floor Governance**: Verify that changing floor counts or basement counts in Building Configuration automatically updates the floor list in Area Statement and Financial Viability, while existing floor measurements in Area Statement are preserved without data loss.
2. **No Independent Floor Creation in Sub-Tabs**: Verify that Area Statement and Financial Viability subtabs have no "Add Floor" / "Delete Floor" buttons, directing structural changes to Building Configuration instead.
3. **Cost A vs Cost B Independence**: Verify that changing Cost A updates Security Deposit and Stacking Charges without affecting Labour Welfare Cess, and changing Cost B updates Labour Welfare Cess without altering Security Deposit.
4. **Auto-Sourcing Without Duplication**: Verify that updating Plot Area in Area Statement immediately updates the Financial Viability statutory and construction costs without requiring user re-entry.
5. **Statutory Enable/Disable Persistence**: Verify that unchecking a statutory charge excludes it from total statutory demand while keeping its row visible across reloads and exports.
6. **Controlled Override Drift Detection**: Verify that applying an override records `calculated_basis_val`, and subsequently modifying floor areas in Area Statement triggers a visual "Calculation Basis Changed" drift warning on the override.
7. **No Sample Data Hardcoding**: Verify that creating a fresh project initializes empty/zero values rather than hardcoded sample figures from the reference Excel.

---

### Task 1: Database Migration for Controlled Overrides & Centralized Floor Keys

**Files:**
- Create: `server/db/migrations/035_financial_viability_overrides_and_central_floors.sql`
- Test: `server/tests/feasibilityOverridesSchema.test.js`

**Interfaces:**
- Produces: `overrides` JSONB, `override_history` JSONB on `project_financial_viabilities`; `floor_key` VARCHAR(50), `is_active` BOOLEAN on `project_area_floors`.

- [ ] **Step 1: Write Migration 035 SQL**
Add:
- `project_financial_viabilities.overrides` JSONB DEFAULT `'{}'::jsonb`
- `project_financial_viabilities.override_history` JSONB DEFAULT `'[]'::jsonb`
- `project_area_floors.floor_key` VARCHAR(50) DEFAULT NULL
- `project_area_floors.is_active` BOOLEAN DEFAULT TRUE
- Index `idx_project_area_floors_key` on `(area_statement_id, floor_key)`.

- [ ] **Step 2: Apply migration to local development database**
Execute: `node -e "const pool = require('./server/db'); pool.query(require('fs').readFileSync('./server/db/migrations/035_financial_viability_overrides_and_central_floors.sql', 'utf8')).then(() => { console.log('Migration 035 applied'); process.exit(0); });"`
Expected: "Migration 035 applied" with code 0.

- [ ] **Step 3: Write migration test**
Create `server/tests/feasibilityOverridesSchema.test.js` asserting that `project_financial_viabilities` and `project_area_floors` contain the new columns.

- [ ] **Step 4: Run test to verify**
Run: `npm --prefix server test tests/feasibilityOverridesSchema.test.js`
Expected: PASS.

---

### Task 2: Centralised Floor Hierarchy & Reconciliation Service

**Files:**
- Create: `server/services/buildingHierarchyService.js`
- Modify: `server/routes/timeline.js`
- Modify: `server/routes/feasibility.js`
- Test: `server/tests/centralBuildingHierarchy.test.js`

**Interfaces:**
- Consumes: `timeline_configurations` record
- Produces: Reconciled `project_area_floors` records where structural hierarchy is synchronized from config and existing area measurements are preserved.

- [ ] **Step 1: Write unit tests for Central Floor Hierarchy and Reconciliation**
In `server/tests/centralBuildingHierarchy.test.js`:
- Test `generateStandardFloorHierarchy` generates correct sequence: Basements -> Ground/Stilt -> Podiums -> Habitable -> Terrace.
- Test `reconcileBuildingFloors` preserves existing floor pline areas, lobby areas, and unit rates when floor count changes.
- Test that reducing floor count deactivates retired floors rather than corrupting measurements.
- Test that saving timeline configuration triggers floor reconciliation in `project_area_floors`.

- [ ] **Step 2: Run test to verify failure before implementation**
Run: `npm --prefix server test tests/centralBuildingHierarchy.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement `buildingHierarchyService.js`**
Implement:
1. `generateStandardFloorHierarchy(config)`: Builds standard hierarchical floor list with stable `floor_key` (e.g. `basement_1`, `ground_floor`, `floor_1`, etc.).
2. `reconcileBuildingFloors(client, projectId, userId, config)`:
   - Queries or creates `project_area_statements`.
   - Compares existing `project_area_floors` against target hierarchy by `floor_key` / normalized name.
   - Updates floor metadata (`floor_order`, `floor_name`, `floor_type`, `is_active = TRUE`) while strictly preserving existing user measurements (`pline_area_sqm`, `lobby_area_sqm`, `builtup_for_owners_sqm`, `builtup_for_sale_sqm`, `no_of_units`, `rate_per_sqm`, `cost_for_1_unit`, `remarks`).
   - Inserts any newly configured floors with defaults.
   - Deactivates unconfigured floors (`is_active = FALSE`).

- [ ] **Step 4: Integrate reconciliation in `timeline.js` and `feasibility.js`**
- In `server/routes/timeline.js` (`POST /config`): call `reconcileBuildingFloors` in the same transaction as `reconcileProjectTimeline`.
- In `server/routes/feasibility.js` (`GET /`): if `project_area_floors` is empty but `timeline_configurations` exists, automatically reconcile floors before calculating area statement metrics.
- Remove standalone floor creation endpoint or restrict it to central sync.

- [ ] **Step 5: Run test to verify pass**
Run: `npm --prefix server test tests/centralBuildingHierarchy.test.js`
Expected: PASS.

---

### Task 3: Extend Authoritative Calculation Engine (`feasibilityEngine.js`)

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
5. Filter active floors (`is_active !== false`).
6. Evaluate all 12 statutory charges with their independent `rr_percentage` and `is_enabled` states.
7. Evaluate active overrides from `financial.overrides`:
   - Replace calculated value with `override_val` in project totals.
   - Detect `override_basis_changed` if $\Delta(\text{current\_calculated}, \text{calculated\_basis\_val}) > 1.0$.
8. Return categorized metric objects:
   ```javascript
   {
     calculated_amount: number,
     effective_amount: number,
     is_overridden: boolean,
     override_basis_changed: boolean,
     override_details: object | null
   }
   ```
9. Keep Net Profit as workbook formula (`Total Receipts - Total Project Cost`). Flag ROI % as `proposed_roi_pct` and Profit Margin % as `proposed_margin_pct`.

- [ ] **Step 4: Run test to verify pass**
Run: `npm --prefix server test tests/feasibilityEngineWorkbookCompliance.test.js`
Expected: PASS.

---

### Task 4: Backend Routes & Controlled Override Endpoints (`feasibility.js`)

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
   - Filter `floors` to only active floors (`is_active !== false`).
   - Return `autoSourcedMetadata` block in JSON response.

- [ ] **Step 4: Run integration tests to verify pass**
Run: `npm --prefix server test tests/feasibilityApiOverrides.test.js`
Expected: PASS.

---

### Task 5: Eliminate Independent Floor Creation & Update UI Components

**Files:**
- Modify: `client/src/components/projects/feasibility/AreaStatementForm.jsx`
- Modify: `client/src/components/projects/feasibility/FinancialViabilityForm.jsx`
- Modify: `client/src/components/projects/feasibility/AreaFeasibilityTab.jsx`

**Interfaces:**
- Consumes: `financial`, `areaMetrics`, `financialMetrics`, `autoSourcedMetadata`, `floors`, `statutoryCharges`, `isPrivileged`
- Produces: Subtabs bound strictly to Central Building Configuration floor structure, with independent floor add/delete controls removed.

- [ ] **Step 1: Refactor `AreaStatementForm.jsx` to consume Central Floor Hierarchy**
- Remove "Add Floor" button and floor deletion trash icons.
- Add central governance banner:
  `🏛️ Floor Hierarchy defined by Central Building Configuration (${floors.length} levels)`
  with button: `[Configure Structure in Timeline / Building Setup]`.
- Allow editing of measurements: `height_meters`, `pline_area_sqm`, `lobby_area_sqm`, `builtup_for_owners_sqm`, `builtup_for_sale_sqm`, `no_of_units`.

- [ ] **Step 2: Refactor `FinancialViabilityForm.jsx` into 4 Compact Categories**
- Category A: "Automatically Sourced Baselines" header bar with read-only tags and source badges.
- Category B: 5 collapsible assumption cards (Market & RR, Civil & Development, Rent & Parking, Sales Realization, Financing & Timeline). Remove duplicate floor add/delete controls.
- Category C: Conditional sections (Basement only if basement exists; Stacked parking only if slots > 0; Municipal Clearances card).
- Category D: Controlled Override controls with 3 states (`Calculated`, `Override Active` with `[OVERRIDDEN]` badge, and drift alert `⚠️ Calculation basis has changed. Review or reset`).

- [ ] **Step 3: Update `AreaFeasibilityTab.jsx`**
- Remove obsolete floor add/delete handlers from feasibility tab or redirect them.
- Add `handleSetOverride(metricKey, value, reason)` and `handleResetOverride(metricKey)` wired to backend endpoints.

---

### Task 6: Document Preview & Excel Export Synchronization

**Files:**
- Modify: `client/src/components/projects/feasibility/FeasibilityDocumentPreview.jsx`
- Modify: `client/src/components/projects/feasibility/AreaFeasibilityTab.jsx`

**Interfaces:**
- Consumes: `financialMetrics` with calculated and effective values.
- Produces: Feasibility report preview and multi-sheet Excel export reflecting effective amounts, active floor hierarchy, and override markers.

- [ ] **Step 1: Update `FeasibilityDocumentPreview.jsx`**
1. Display effective amounts in all summary tables (Section A, Sections B–H, Total Cost, Receipts, Profit).
2. For overridden items, display a small `[Override]` marker with original calculated value visible in subtle subtext so the report remains transparent.
3. Clearly label Net Profit as authoritative; label ROI % as `ROI (Proposed)`.

- [ ] **Step 2: Update Excel Export in `AreaFeasibilityTab.jsx`**
1. Output both calculated and effective override values in the `Financial Viability` worksheet.
2. Ensure disabled statutory charges remain omitted from totals.

---

### Task 7: Unit & Integration Verification with Excel Reference Benchmark

**Files:**
- Test: `server/tests/feasibilityEngineWorkbookCompliance.test.js`
- Test: `server/tests/feasibilityApiOverrides.test.js`
- Test: `server/tests/centralBuildingHierarchy.test.js`

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
