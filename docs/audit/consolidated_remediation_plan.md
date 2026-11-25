# DS16 — Consolidated Remediation Plan (`consolidated_remediation_plan.md`)

**Audit Date:** 2026-11-26  
**Note:** Per audit rules, **no code or database changes were made during this audit**. This plan sequences all confirmed findings by risk, dependency order, and business impact.

---

## 1. Executive Summary

- **What is authentic and working well:**
  - Core `feasibilityEngine.js` backend calculations (60% Residential / 80% Commercial ancillary, floor-wise equal P-Line distribution with cent-level rounding reconciliation, 15% lobby default + overrides, 4-decimal `area_for_1_unit`, statutory charge exclusion & `has_basis_drift` tracking).
  - `payroll.js` / `salaryEngine.js` / `attendanceRecalculator.js` core math and `monthlyClose.js` scheduler self-healing.
  - Parameterized SQL queries across all 20 route files (no raw SQL injection found) and `/uploads` path-traversal + `nosniff` + SVG `attachment` headers in `server/index.js`.
- **Critical & High-Risk Gaps:**
  - Broken project isolation (`checkProjectAccess()` allows any employee into any project), missing role checks on project/client/vendor mutations, and cross-project task/attendance/leave-reason leaks.
  - `project_stakeholders` table missing from `schema.sql` and all migrations, plus failing clean-install migrations (`019`, `026`).
  - TOCTOU race conditions on invoice payments (`mark-paid`, `record-payment`) and missing `tdsAmount` in `record-payment` response & `monthlyClose.js` snapshot.
  - `validateBody` disabled by default (log-only), `autoCheckoutPendingRecords` wiping `late_minutes`/`is_late`, and divergent client-side feasibility math in `AreaFeasibilityTab.jsx`.

---

## 2. Prioritized Remediation Sequence

### Phase 1 — P0 Critical Security, Data Loss & Financial Integrity (Fix Immediately)
| Priority | Finding IDs | Scope & Files | Action |
|---|---|---|---|
| **1.1** | `DB-001`, `DATA-001` | `server/db/schema.sql`, `migrations/019`, `migrations/026`, new migration `036_*` | Add `project_stakeholders` table definition; guard `019:29-32` (`employee_leave_balance`) and fix `026:305-306` (`expense_audits.id`) so clean installs succeed. |
| **1.2** | `SEC-001`, `SEC-002`, `SEC-003` | `middleware/accessControl.js`, `routes/projects.js`, `routes/tasks.js`, `routes/dashboard.js`, `routes/attendance.js`, `routes/clients.js`, `routes/vendors.js` | Enforce `project_assignments` / task participation in `checkProjectAccess()`; validate IDs before role skip; add role guards to project/stage/stakeholder/vendor/client mutations; scope `tasks.js` kanban, `dashboard.js` employee view, and `attendance.js /today`. |
| **1.3** | `ROB-001`, `ROB-002`, `CALC-006` | `routes/invoices.js`, `routes/monthlyClose.js` | Move `SELECT ... FOR UPDATE` inside `BEGIN` in `mark-paid` and `record-payment`; sync or restrict `PATCH /:id/status` `'paid'` transitions; subtract `tdsAmount` in `invoices.js:841` and `monthlyClose.js:74`. |
| **1.4** | `SEC-004`, `API-003` | `routes/timeline.js`, `routes/documents.js` | Add strict `fileFilter` + numeric `projectId` validation to `uploadEvidence`; fix `documents.js` disk-path mismatch (`others/` vs slug) and `Object.values(req.files).flat()` cleanup; add `path.resolve` guard on `GET /:id/download`. |

### Phase 2 — P1 High-Impact Calculation, Period Lock & Transaction Safety
| Priority | Finding IDs | Scope & Files | Action |
|---|---|---|---|
| **2.1** | `CALC-005`, `ROB-005` | `routes/attendance.js` | Add `a.is_late` to `autoCheckoutPendingRecords` `SELECT` (`L64-66`); add `AND check_out IS NULL` to `POST /checkout` `UPDATE` (`L553-560`); round `hoursWorked` consistently. |
| **2.2** | `CALC-007`, `ROB-006` | `routes/accounting.js`, `routes/leaves.js`, `routes/finances.js`, `middleware/periodLock.js` | Preserve `is_manual_override = TRUE` in `PUT /payroll/employees/:id`; add `checkPeriodLock` to `POST /expenses/audits` and `leaves.js`; run `checkPeriodLock` *before* Multer; fix `periodLock.js` `payroll` ID lookup. |
| **2.3** | `ROB-003`, `ROB-004` | `routes/accounting.js`, `routes/monthlyClose.js`, `routes/leaves.js`, `routes/projects.js`, `routes/tasks.js` | Wrap multi-step writes in `BEGIN/COMMIT/ROLLBACK`; move `BEGIN` *after* validation in `tasks.js`. |
| **2.4** | `API-001`, `API-002`, `CALC-004` | `middleware/validate.js`, `routes/feasibility.js`, `routes/timeline.js`, `routes/dashboard.js`, `routes/projects.js`, `routes/clients.js` | Enforce `validateBody` by default and expand Zod schemas; return `404`/`400` instead of silent `200`; replace `|| default` falsy-zero patterns with explicit nullish checks. |
| **2.5** | `CALC-001`, `CALC-002`, `DATA-004` | `services/feasibilityEngine.js`, `routes/feasibility.js`, `client/.../AreaFeasibilityTab.jsx` | Return recalculated `areaMetrics` & `financialMetrics` from `feasibility.js` `PUT`/`PATCH` endpoints; align `AreaFeasibilityTab.jsx` live preview (plotable area, permissible vs proposed P-Line, Mixed Use, `area_for_1_unit` 4-decimal rounding, total cost); fix `HERITAGE_FUND` to use `DEVELOPMENT_CHARGES` effective amount. |

### Phase 3 — P2 Data Consolidation, Architecture & Observability
| Priority | Finding IDs | Scope & Files | Action |
|---|---|---|---|
| **3.1** | `ARCH-002`, `DATA-002`, `DATA-003` | `routes/finances.js`, `routes/accounting.js`, `routes/monthlyClose.js`, `routes/documents.js`, `routes/invoices.js` | Extract unified P&L summary service; consolidate `office_expenses` into `transactions` and `project_document_amounts` into `project_payment_stages`; standardize on `invoice_payment_stages`. |
| **3.2** | `DB-002`, `DB-004`, `DB-005` | `server/db/schema.sql`, new migration `037_*` | Reconcile `schema.sql` with migrations; add missing `UNIQUE` constraints (`timeline_activity_catalogue`, `construction_templates`, `timeline_tasks`, `project_stages`, `project_feasibility_snapshots`, `project_payment_stages`). |
| **3.3** | `ARCH-003`, `ARCH-004`, `ROB-007`, `SEC-007` | `routes/staff.js`, `routes/settings.js`, `utils/auditLogger.js`, all routes | Reuse `utils/payroll.js` in `staff.js`; move `factoryReset` confirm tokens to DB/HMAC; call `logAudit()` on all financial/leave/unlock mutations; sanitize `500` error responses in production. |
| **3.4** | `API-004`, `API-005`, `PERF-001`, `PERF-002` | `routes/reports.js`, `routes/staff.js`, list endpoints | Validate all `:id`/date params; enforce pagination `LIMIT`s; cap `generate_series` date ranges; batch `reports/payroll` queries. |

### Phase 4 — Verification & Automated Test Suite
| Priority | Finding IDs | Scope | Action |
|---|---|---|---|
| **4.1** | `TEST-001`, `TEST-002` | `server/tests/`, `.env.test` | Provision isolated test DB; add integration tests for invoice payment concurrency + TDS, project isolation (IDOR), document upload/cleanup, auto-checkout `is_late`, clean-install migrations, and the 13-step DS16 E2E workflow. |

---

## 3. Items Requiring Business Clarification Before Remediation
1. **`CALC-003` (Regular + Slum TDR):** Confirm whether `proposedTdrSqm` should unconditionally sum both Regular and Slum TDR for any valid road width, or only apply Slum TDR for Slum/Gunthewari classifications and cap TDR to what is required for proposed FSI.
2. **`CALC-002` (`HERITAGE_FUND`):** Confirmed & Implemented: Heritage Fund is dynamically 2% of the actual effective `DEVELOPMENT_CHARGES` amount (including overrides, custom percentages, and zero if disabled).
3. **Dual Expense Model (`DATA-003`):** Non-destructive reconciliation proposal produced in `data_integrity_and_duplication_audit.md` (retain `office_expenses` as claims sub-ledger, auto-journalize approved entries to `transactions`).

---

## 4. Controlled Remediation Execution & Verification Status

| Finding ID | Phase | Severity | Status | Root Cause | Files Modified | Migration ID | Tests Executed | Test Result | Remaining Risks |
|---|---|---|---|---|---|---|---|---|---|
| **DB-001** / **DATA-001** | Phase 1 | CRITICAL | **RESOLVED** | Missing `project_stakeholders` in schema/migrations; clean install failures in 019 and 026. | `server/db/schema.sql`, `server/db/migrations/019_*.sql`, `server/db/migrations/026_*.sql` | `036_stakeholders_and_constraint_integrity.sql` | `scripts/test_full_clean_migration.js` | **PASSED** (all 22 migrations applied cleanly) | None. Backward compatible for existing and fresh DBs. |
| **DB-004** | Phase 1 | HIGH | **RESOLVED** | Missing unique constraints on stages, activities, snapshots, and templates. | `server/db/migrations/036_stakeholders_and_constraint_integrity.sql` | `036` | `scripts/test_full_clean_migration.js` | **PASSED** | None. Enforces relational consistency. |
| **SEC-001** | Phase 2 | CRITICAL | **RESOLVED** | `checkProjectAccess()` did not enforce project assignment for non-management roles. | `server/middleware/accessControl.js`, `server/routes/projects.js` | N/A | `server/tests/accessControlNegative.test.js`, `visibility.test.js` | **PASSED** (10/10 negative, 32/32 visibility) | None. Authorized users retain expected access. |
| **SEC-002** | Phase 2 | HIGH | **RESOLVED** | Missing role checks on project, stage, stakeholder, and client mutations. | `server/routes/projects.js`, `server/routes/clients.js` | N/A | `server/tests/accessControlNegative.test.js` | **PASSED** | None. Non-management mutating attempts rejected with 403. |
| **SEC-003** | Phase 2 | HIGH | **RESOLVED** | Cross-project task visibility, employee GPS coordinates, and colleague leave reasons leaked. | `server/routes/tasks.js`, `server/routes/dashboard.js`, `server/routes/attendance.js` | N/A | `server/tests/accessControlNegative.test.js` | **PASSED** | None. Sensitive data masked for non-privileged viewers. |
| **SEC-004** | Phase 5 | HIGH | **RESOLVED** | Timeline evidence upload lacked file extension/MIME filtering. | `server/routes/timeline.js` | N/A | `server/tests/apiAndFileReliability.test.js` | **PASSED** | None. Executables and dangerous scripts rejected with 400. |
| **ROB-001** | Phase 3 | CRITICAL | **RESOLVED** | Race condition on invoice payment without row-level lock (`SELECT ... FOR UPDATE`). | `server/routes/invoices.js` | N/A | `server/tests/financialTransactionIntegrity.test.js` | **PASSED** (atomic lock & idempotent payment) | None. Row lock serializes concurrent payment attempts. |
| **ROB-002** | Phase 3 | HIGH | **RESOLVED** | `PATCH /:id/status` updated status without row locks or ledger transaction sync. | `server/routes/invoices.js` | N/A | `server/tests/financialTransactionIntegrity.test.js` | **PASSED** (ledger synchronized on paid & revert) | None. |
| **ROB-003** / **ROB-004** | Phase 3 | HIGH | **RESOLVED** | Non-transactional multi-step operations and connection/transaction leaks in tasks/accounting/leaves. | `server/routes/accounting.js`, `server/routes/monthlyClose.js`, `server/routes/leaves.js`, `server/routes/tasks.js` | N/A | `server/tests/financialTransactionIntegrity.test.js`, `monthlyClose.test.js` | **PASSED** | None. Multi-step operations wrapped in ACID transactions. |
| **CALC-001** | Phase 4 | HIGH | **RESOLVED** | Frontend `AreaFeasibilityTab.jsx` diverged from backend `feasibilityEngine.js`. | `server/routes/feasibility.js`, `client/src/components/projects/feasibility/AreaFeasibilityTab.jsx` | N/A | `server/tests/feasibilityCalculationsParity.test.js` | **PASSED** (7/7 formula parity checks) | None. Backend engine remains authoritative SSOT. |
| **CALC-002** | Phase 4 | HIGH | **RESOLVED** | Heritage Fund computed from hardcoded rate instead of effective Development Charges. | `server/services/feasibilityEngine.js` | N/A | `server/tests/feasibilityCalculationsParity.test.js` | **PASSED** (linked to dev charges + overrides) | None. |
| **CALC-004** | Phase 4 | MEDIUM | **RESOLVED** | `parseFloat() || default` pattern wiped explicit zero values to defaults. | `server/services/feasibilityEngine.js` | N/A | `server/tests/feasibilityCalculationsParity.test.js` | **PASSED** (preserves 0 on tdr, height, loading) | None. |
| **CALC-005** | Phase 4 | HIGH | **RESOLVED** | `autoCheckoutPendingRecords` omitted `a.is_late`, wiping late records to 0. | `server/routes/attendance.js` | N/A | `server/tests/attendanceRecalculation.test.js` | **PASSED** | None. Preserves late status and minutes on auto-checkout. |
| **CALC-006** | Phase 3 | HIGH | **RESOLVED** | `record-payment` and `monthlyClose` omitted `tdsAmount` deduction in pending calculations. | `server/routes/invoices.js`, `server/routes/monthlyClose.js` | N/A | `server/tests/financialTransactionIntegrity.test.js`, `monthlyClose.test.js` | **PASSED** | None. Correctly reconciles net receivable balances. |
| **CALC-007** | Phase 3 | HIGH | **RESOLVED** | `PUT /payroll/employees/:id` overwrote `is_manual_override = true` payroll entries. | `server/routes/accounting.js` | N/A | `server/tests/financialTransactionIntegrity.test.js` | **PASSED** | None. Manual accountant overrides strictly preserved. |
| **API-001** | Phase 5 | HIGH | **RESOLVED** | `validateBody` ran in observation/log-only mode by default without rejecting invalid data. | `server/middleware/validate.js` | N/A | `server/tests/apiAndFileReliability.test.js` | **PASSED** (400 on malformed payloads) | None. Production/test enforcement active by default. |
| **API-003** | Phase 5 | HIGH | **RESOLVED** | Document upload path mismatch, object iteration failure in cleanup, and missing traversal check. | `server/routes/documents.js` | N/A | `server/tests/apiAndFileReliability.test.js` | **PASSED** (403 on traversal, safe cleanup) | None. Files physically located in matching slug directory. |

