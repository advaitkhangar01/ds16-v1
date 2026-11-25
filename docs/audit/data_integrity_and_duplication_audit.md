# DS16 — Data Integrity & Duplication Audit (`data_integrity_and_duplication_audit.md`)

**Audit Date:** 2026-11-26  
**Scope:** Single Source of Truth (SSOT) analysis across `server/db/schema.sql`, `server/db/migrations/*.sql`, and `server/routes/*.js`

---

## 1. Data Ownership Matrix

| Business Entity | Authoritative Table | PK / Unique | Duplicate / Conflicting Sources | Risk | Recommendation |
|---|---|---|---|---|---|
| **Projects** | `projects` | `id` / `UNIQUE (name, client_name)` | `client_name` duplicated alongside `client_id` (`schema.sql:87-88`) | `MEDIUM` | Enforce `client_id NOT NULL` FK; derive `client_name` via JOIN or sync on client update |
| **Project Stakeholders** | `project_stakeholders` *(undocumented)* | `id` (inferred) | Referenced in `routes/projects.js:84,434-538`, **missing from `schema.sql` and all migrations** | `CRITICAL` | Add `CREATE TABLE IF NOT EXISTS project_stakeholders` migration immediately |
| **Clients** | `clients` (+ `client_contacts`, `client_addresses`, `client_banking`) | `id` / `UNIQUE (company_name)` | Denormalized `client_name`, `client_company` in `invoices` (`schema.sql:259-261`) and `projects` | `MEDIUM` | Treat `invoices.client_name/company` as historical snapshot at invoice issue time; keep `client_id` authoritative |
| **Staff / Users** | `users` | `id` / `UNIQUE (username)` | Inline payroll/attendance math in `routes/staff.js:361-483` | `LOW` | Keep `users` authoritative; remove duplicate calculation in `staff.js` |
| **Tasks** | `tasks` (+ `task_participants`, `task_messages`) | `id` | `comments` table (`schema.sql:242-252`) has `is_task`, `assigned_to`, `task_status` | `MEDIUM` | Deprecate/remove `comments` task fields if unused, or document legacy status |
| **Timeline Configs & Tasks** | `timeline_configurations`, `timeline_tasks` | `id` / `UNIQUE (project_id)` on configs | `parking_floors` JSONB vs `ground_floor_config`/`basement_count`/`upper_parking_count` (`030:6` vs `031:5-8`); no `UNIQUE (project_id, activity_key)` on `timeline_tasks` | `MEDIUM` | Consolidate parking config fields; add unique partial index on `(project_id, activity_key) WHERE is_archived = FALSE` |
| **Project Floors & Area Statements** | `project_area_statements`, `project_area_floors` | `id` / `UNIQUE (project_id)` on statements | `project_area_floors` (`030:33-34, 032:5-6`) duplicates unit pricing (`no_of_units`, `area_for_1_unit`, `rate_per_sqm`, `cost_for_1_unit`) alongside `project_salable_units` (`028:247-260`); `proposed_tdr_factor` vs `regular_tdr_factor`/`slum_tdr_factor` | `HIGH` | Clarify ownership between `project_area_floors` and `project_salable_units`; remove unused `proposed_tdr_factor` |
| **Financial Viability** | `project_financial_viabilities` | `id` / `UNIQUE (project_id)` | `AreaFeasibilityTab.jsx:97-227` duplicates calculations client-side with divergent formulas | `HIGH` | Return server-calculated metrics from `PUT` endpoints; align or remove client-side preview math |
| **Statutory Charges** | `project_statutory_charges` | `id` | Default fallback list in `feasibilityEngine.js:726-734` bypasses `overrides` | `MEDIUM` | Seed statutory charges on viability creation and apply overrides uniformly |
| **Invoices & Payment Stages** | `invoices`, `project_payment_stages` | `id` / `UNIQUE (invoice_no)` | `invoices.payment_stage_id` (1:N) **and** `invoice_payment_stages` (M:N); `project_payment_stages` **and** `project_document_amounts` both store `(project_id, document_type, amount)` | `HIGH` | Standardize on `invoice_payment_stages` M:N and deprecate `invoices.payment_stage_id` & `project_document_amounts` |
| **Payments / Expenses** | `transactions` | `id` | `office_expenses` (`schema.sql:292-300`) stores expenses separately from `transactions` (`type='expense'`); `payroll` merged virtually on `GET` | `HIGH` | Unify `office_expenses` into `transactions` (or clearly partition by domain with a single ledger view) |
| **Documents** | `documents` | `id` | Disk path mismatch in `routes/documents.js:54-60` vs `209-211` (`others/` vs `getDocumentTypeSlug`) | `HIGH` | Compute/resolve storage path consistently after parsing `document_type` |
| **Vendors** | `vendors` | `id` / `UNIQUE (name)` | None | `LOW` | Add role checks on `POST`/`PATCH` |
| **Attendance** | `attendance` (+ `attendance_attempts`) | `id` / `UNIQUE (user_id, date)` | None (intentional audit trail in `attendance_attempts`) | `MEDIUM` | Add `AND check_out IS NULL` guard on checkout |
| **Leaves** | `leave_requests`, `employee_leave_balance` | `id` / `UNIQUE (user_id, month, year)` | `employee_leave_summary` (`schema.sql:166-173`) overlaps with `employee_leave_balance` (`026:260-272`) | `MEDIUM` | Consolidate `employee_leave_summary` into `employee_leave_balance` |
| **Payroll** | `payroll` | `id` / `UNIQUE (user_id, month, year)` | `PUT /accounting/payroll/employees/:id` overwrites `is_manual_override` rows | `HIGH` | Respect `is_manual_override` in `accounting.js` just as `monthlyClose.js` does |
| **Activity & Audit Logs** | `audit_logs`, `timeline_audit_history`, `feasibility_audit_logs` | `id` | Most financial/invoice mutations skip `audit_logs` | `HIGH` | Log all invoice, transaction, expense, and unlock mutations to `audit_logs` |

---

## 2. Detailed Duplication & Ownership Findings

### `DATA-001` — `project_stakeholders` Table Missing from `schema.sql` and All Migrations
- **Severity:** `CRITICAL` | **Classification:** Confirmed defect
- **Affected Files:** `server/routes/projects.js:84,124,434-538`, `server/db/migrations/023_statutory_integrity_and_payroll_columns.sql:13`, `server/db/schema.sql` (absent)
- **Observed Behaviour:** `projects.js` performs `SELECT`, `INSERT`, `UPDATE`, and `DELETE` on `project_stakeholders`, yet no `CREATE TABLE project_stakeholders` exists in `schema.sql` or `migrations/*.sql`.
- **Expected Behaviour:** Every table queried by the application must be defined in `schema.sql` and migrations.
- **Evidence:** Clean-install databases built from `schema.sql` + `migrator.js` will fail at runtime with `relation "project_stakeholders" does not exist` on `GET /api/projects`, `GET /api/projects/:id`, and all stakeholder endpoints.
- **Business Impact:** Core project listing and detail views crash on fresh installations.
- **Recommended Correction:** Add an idempotent migration creating `project_stakeholders` with proper FK `project_id REFERENCES projects(id) ON DELETE CASCADE` and update `schema.sql`.

### `DATA-002` — Dual Payment-Stage Linking (`invoices.payment_stage_id` vs `invoice_payment_stages`) & Dual Stage Amounts (`project_payment_stages` vs `project_document_amounts`)
- **Severity:** `HIGH` | **Classification:** Confirmed defect
- **Affected Files:** `server/db/schema.sql:185-206,269`, `server/db/migrations/add_invoice_stages_junction.sql:2-8`, `server/routes/invoices.js`, `server/routes/documents.js:508-552`
- **Observed Behaviour:** Both a 1:N FK (`invoices.payment_stage_id`) and an M:N junction (`invoice_payment_stages`) exist simultaneously. Similarly, `POST /api/documents/amounts` writes to both `project_document_amounts` (`amount || null`) and `project_payment_stages` (`parseFloat(amount)`), storing `NULL` in one and `0` in the other when `amount = 0`.
- **Expected Behaviour:** Single authoritative table for stage amounts (`project_payment_stages`) and single M:N link (`invoice_payment_stages`).
- **Business Impact:** Risk of stage payment status desynchronization and `0` vs `NULL` discrepancies.
- **Recommended Correction:** Migrate remaining `invoices.payment_stage_id` references into `invoice_payment_stages` and retire `project_document_amounts`.

### `DATA-003` — Dual Expense Storage (`transactions` vs `office_expenses`)
- **Severity:** `HIGH` | **Classification:** Confirmed defect
- **Affected Files:** `server/db/schema.sql:275-300`, `server/routes/finances.js:334-368`, `server/routes/accounting.js:63-134`
- **Observed Behaviour:** Expenses are split across `transactions` (`type = 'expense'`) and `office_expenses`, with `finances/summary` reading `transactions` and `accounting/summary` reading `office_expenses`.
- **Expected Behaviour:** One authoritative expense ledger.
- **Recommended Correction:** Unify `office_expenses` into `transactions` (with a `source`/`scope` column if needed) or make `accounting/summary` query both consistently via a shared service.

### `DATA-004` — Client-Side Duplication of Feasibility & Area Calculations
- **Severity:** `HIGH` | **Classification:** Confirmed defect
- **Affected Files:** `client/src/components/projects/feasibility/AreaFeasibilityTab.jsx:97-227,321-364`, `server/services/feasibilityEngine.js`
- **Observed Behaviour:** Frontend `recalculateLive` re-implements area, ancillary, statutory, and total-cost formulas locally with multiple divergences from `feasibilityEngine.js` (subtracting `existing_builtup_area_sqm` from plotable area, conflating Permissible and Proposed P-Line, ignoring `Mixed Use` 80% commercial split, omitting `extra_stamp_duty`, `advocate_fees`, `cost_of_infrastructure`, and `interest_amount`, and rounding `area_for_1_unit` to 2 decimals instead of 4).
- **Expected Behaviour:** Backend `feasibilityEngine.js` should be the single source of truth; `PUT`/`PATCH` endpoints should return recalculated metrics to the frontend.
- **Recommended Correction:** Return `areaMetrics` and `financialMetrics` from `feasibility.js` mutation endpoints and remove divergent client-side calculation formulas.

### `DATA-005` — Intentional Historical Snapshots vs Current Records (Verified)
- **Classification:** `INFORMATIONAL` (Verified Non-Duplicate)
- **Tables:** `timeline_versions`, `project_feasibility_snapshots`, `monthly_closing_log`, `audit_logs`, `attendance_attempts`.
- **Observation:** These tables are intentional immutable/historical snapshots or audit trails and should **not** be flagged as duplicate data. However, `project_feasibility_snapshots` lacks a `UNIQUE (project_id, version_number)` constraint (`028:264-273`).

---

## 3. Data Ownership & Duplication Reconciliation Proposals (Phase 6)

In accordance with controlled remediation requirements, no tables or columns are merged or dropped destructively until business ownership, historical usage, and reporting dependencies are established. The following non-destructive reconciliation proposals provide safe pathways for consolidation.

### Proposal 1: Ledger Reconciliation for `transactions` vs `office_expenses`

#### 1. Business Ownership & Current Dependencies
- **`transactions` (General Financial Ledger):**
  - *Authoritative Role:* Double-entry financial journal for all incoming client receipts, project disbursements, vendor payments, and monthly closing snapshots.
  - *Dependencies:* `server/routes/finances.js`, `server/routes/invoices.js`, `server/routes/monthlyClose.js`, `server/services/dashboardService.js`.
- **`office_expenses` (Operational & Petty Cash Claims):**
  - *Authoritative Role:* Operational staff claims, internal reimbursements, and office utility expenses before ledger journalization.
  - *Dependencies:* `server/routes/accounting.js` (`/office-expenses`, `/summary`), `client/src/components/accounting/OfficeExpenses.jsx`.

#### 2. Risk of Premature Deletion or Naive Merging
- Dropping `office_expenses` would break staff expense claim approval workflows, receipt attachment metadata, and pending approval statuses (`approved`, `rejected`, `pending`).
- Dropping `transactions` would break bank reconciliation, invoice payment ledger entries, and monthly close financial lock snapshots.

#### 3. Recommended Non-Destructive Reconciliation Strategy
1. **Retain `office_expenses` as the Sub-Ledger for Operational Claims:**
   - Keep `office_expenses` as the staging table for claims and petty cash approvals.
2. **Automated Journalization to `transactions`:**
   - When an expense in `office_expenses` is marked `approved` and `paid`, an automatic, idempotent ledger insert into `transactions` is executed:
     - `type = 'expense'`
     - `category = 'office_expense'`
     - `amount = office_expenses.amount`
     - `reference_type = 'office_expense'`
     - `reference_id = office_expenses.id`
3. **Unified View (`vw_unified_expenses`):**
   - Provide a database view for financial reporting that joins ledger transactions with expense claim metadata without double-counting.
4. **Historical Backfill Script:**
   - Create a non-destructive script `scripts/reconcile_office_expenses_to_ledger.js` that inspects historical approved `office_expenses` missing from `transactions` and inserts corresponding ledger rows with `reference_type = 'office_expense'`.

---

### Proposal 2: Consolidation of `invoices.payment_stage_id` into `invoice_payment_stages`

#### 1. Business Ownership & Current Dependencies
- **`invoices.payment_stage_id` (Legacy 1:1 Foreign Key):**
  - *Historical Role:* Linked an invoice to a single project stage.
  - *Current Usage:* Older client invoices (pre-migration `add_invoice_stages_junction.sql`), legacy reporting exports, and single-stage invoice creation forms.
- **`invoice_payment_stages` (Modern M:N Junction Table):**
  - *Authoritative Role:* Authoritative source for stage billing breakdown, allowing a single invoice to bill against multiple project stages with explicit allocated amounts.
  - *Dependencies:* `server/routes/invoices.js:337-345`, `server/routes/documents.js:461`, multi-stage billing frontend UI.

#### 2. Risk of Premature Removal
- Several legacy invoices in historical records only have `invoices.payment_stage_id` populated, without corresponding rows in `invoice_payment_stages`. Dropping `payment_stage_id` immediately would orphan stage billing history for older projects.

#### 3. Recommended Non-Destructive Reconciliation Strategy
1. **Phase 1 — Data Migration (Backfill):**
   - Execute an idempotent data backfill query:
     ```sql
     INSERT INTO invoice_payment_stages (invoice_id, payment_stage_id, allocated_amount, created_at)
     SELECT i.id, i.payment_stage_id, i.amount, i.created_at
     FROM invoices i
     WHERE i.payment_stage_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM invoice_payment_stages ips
         WHERE ips.invoice_id = i.id AND ips.payment_stage_id = i.payment_stage_id
       );
     ```
2. **Phase 2 — Dual-Write in API:**
   - `POST /api/invoices` writes to `invoice_payment_stages` as the authoritative source, and optionally populates `invoices.payment_stage_id` with the primary stage ID for backward-compatible views.
3. **Phase 3 — Database View / Deprecation Notice:**
   - Create a computed column or view `invoices.primary_payment_stage_id` derived from `invoice_payment_stages`.
   - Mark `invoices.payment_stage_id` as deprecated in API schemas. Only remove the physical column after 2 release cycles with 100% verified parity.

---

### Proposal 3: Consolidation of `project_payment_stages` and `project_document_amounts`

#### 1. Business Ownership & Current Dependencies
- **`project_payment_stages` (Authoritative Stage Schedule):**
  - *Authoritative Role:* Defines milestones, stage percentages, document types, stage statuses (`pending`, `invoiced`, `paid`), order indexes, and milestone amounts.
  - *Dependencies:* `server/routes/documents.js:350-540`, `server/routes/invoices.js`, project billing configuration.
- **`project_document_amounts` (Legacy Document Amount Register):**
  - *Historical Role:* Stored key-value fee amounts per `(project_id, document_type)`.
  - *Current Usage:* Maintained only via legacy `POST /api/documents/amounts` which dual-writes to both tables.

#### 2. Risk of Premature Removal
- Legacy document upload checks or older reports might read `project_document_amounts` directly.
- In `POST /api/documents/amounts`, `project_document_amounts` stores `NULL` on 0-value entries while `project_payment_stages` stores `0.00`.

#### 3. Recommended Non-Destructive Reconciliation Strategy
1. **Declare `project_payment_stages` as SSOT:**
   - Explicitly establish `project_payment_stages` as the authoritative table for all stage milestones and billing amounts.
2. **Reconciliation View:**
   - Replace direct reads from `project_document_amounts` with a view:
     ```sql
     CREATE OR REPLACE VIEW vw_project_document_amounts AS
     SELECT
       project_id,
       document_type,
       SUM(amount) AS total_amount,
       COUNT(*) AS stage_count
     FROM project_payment_stages
     GROUP BY project_id, document_type;
     ```
3. **Synchronize Existing Data:**
   - Align missing amounts from `project_document_amounts` into `project_payment_stages` where corresponding stage milestones exist.
4. **Gradual Retirement:**
   - Transition `POST /api/documents/amounts` to operate exclusively on `project_payment_stages`.
   - Deprecate physical table `project_document_amounts` without dropping until end-to-end stage verification is completed in staging.

