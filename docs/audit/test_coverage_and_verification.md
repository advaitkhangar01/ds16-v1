# DS16 — Test Coverage & Verification Audit (`test_coverage_and_verification.md`)

**Audit Date:** 2026-11-26  
**Scope:** `server/tests/` (15 Jest test files).

---

## 1. Existing Test Suite Inventory & Execution Status

| Test File | Type / DB Usage | What It Covers | Executed During Audit? |
|---|---|---|---|
| `health.test.js` | Supertest (No DB) | `GET /api/health` 200 status & JSON shape | **YES — PASS (1/1)** |
| `equalPlineDistribution.test.js` | Unit (No DB) | `distributePlineEqually`, `calculateAreaMetrics`, `calculateFinancialMetrics`, `generateStandardFloorHierarchy` | **YES — PASS (13/13)** |
| `attendanceRecalculation.test.js` | Real PostgreSQL | `timeToMinutes`, `recalculateAttendanceForUser`, leave preservation | **NOT RUN** (writes to configured DB) |
| `dailyReports.test.js` | Real DB + Supertest | `/api/daily-reports` auth, validation, duplicate prevention, isolation | **NOT RUN** (writes to configured DB) |
| `dynamicBuildingGenerator.test.js` | Real DB + Supertest | Dynamic building timeline config & `generateDraftActivities` | **NOT RUN** (writes to configured DB) |
| `leavesKanban.test.js` | Real DB + Supertest | `/api/leaves`, `?view=kanban`, `/api/dashboard/admin` leave filtering, RBAC | **NOT RUN** (writes to configured DB) |
| `monthlyClose.test.js` | Real DB + Supertest | Close blocks, RBAC, lock/unlock/relock, payroll under lock, cross-period payment | **NOT RUN** (writes to configured DB) |
| `payrollDeductions.test.js` | Real PostgreSQL | `calculatePayrollForEmployee`, `calculateSalaryStats`, late penalties, OT | **NOT RUN** (writes to configured DB) |
| `payrollMandatory.test.js` | Real PostgreSQL | 16 canonical payroll rules (28/31 days, hourly rate, late penalties, OT) | **NOT RUN** (writes to configured DB) |
| `phase5ValidationAndAggregates.test.js` | Real DB + Supertest | `/api/invoices` & `/api/finances/transactions` summary, `validateBody` flag | **NOT RUN** (writes to configured DB; hardcodes `userId: 1`) |
| `tasks.test.js` | Real DB + Supertest | `/api/tasks` creation RBAC, visibility, status transitions, `cleanupOldTasks` | **NOT RUN** (writes to configured DB) |
| `timelineAndFeasibility.test.js` | Real DB + Supertest | Timeline & Area/Financial Feasibility endpoints & engines | **NOT RUN** (writes to configured DB) |
| `uploadsSecurity.test.js` | Real DB + Supertest | `/uploads` auth, `nosniff`, SVG `attachment` header, path traversal | **NOT RUN** (writes to configured DB) |
| `userDeletion.test.js` | Real DB + Supertest | Soft user deactivation & preservation of historical records | **NOT RUN** (writes to configured DB) |
| `visibility.test.js` | Real DB + Supertest | Project & vendor visibility across roles | **NOT RUN** (writes to configured DB) |

### Observed Verification Output (Remediation Verification)
Executed suites:
1. `node scripts/test_full_clean_migration.js` -> **PASS (22/22 migrations cleanly applied on empty schema)**
2. `npx jest tests/accessControlNegative.test.js --runInBand` -> **PASS (10/10 tests)**
3. `npx jest tests/financialTransactionIntegrity.test.js --runInBand` -> **PASS (4/4 tests)**
4. `npx jest tests/feasibilityCalculationsParity.test.js --runInBand` -> **PASS (7/7 tests)**
5. `npx jest tests/apiAndFileReliability.test.js --runInBand` -> **PASS (4/4 tests)**
6. `npx jest tests/visibility.test.js tests/equalPlineDistribution.test.js tests/monthlyClose.test.js tests/payrollMandatory.test.js --runInBand` -> **PASS (94/94 tests)**

---

## 2. Test Coverage & Quality Findings


### `TEST-001` — No Isolated Test Database Configuration
- **Severity:** `HIGH` | **Classification:** Confirmed defect
- **Affected Files:** `server/db/index.js:2-7`, `server/tests/*.test.js`
- **Observed Behaviour:** All 13 DB-backed test suites read `DATABASE_URL` from `server/.env` and execute `INSERT`/`DELETE` statements directly against that database. `phase5ValidationAndAggregates.test.js:12` also hardcodes `userId: 1`.
- **Recommended Correction:** Configure `.env.test` (or `TEST_DATABASE_URL`) so `npm test` targets a dedicated disposable test database and runs `schema.sql` + `migrator.js` cleanly.

### `TEST-002` — Critical Uncovered Workflows & Missing Regression Tests
- **Severity:** `HIGH` | **Classification:** Confirmed gap
- **Missing Coverage:**
  1. **Invoice Payment Concurrency & TDS Consistency:** No tests for `POST /api/invoices`, `POST /api/invoices/:id/mark-paid`, `POST /api/invoices/:id/record-payment` (concurrent double-submit, `remainingBalance` with TDS), or `PATCH /api/invoices/:id/status` ledger sync.
  2. **Attendance Check-in/Check-out & Auto-Checkout:** No tests for `POST /api/attendance/checkin`, `POST /api/attendance/checkout` race conditions, or `autoCheckoutPendingRecords` preserving `is_late`/`late_minutes`.
  3. **Project Isolation (IDOR):** No negative test verifying an unassigned `employee` gets `403` on another project's `GET /api/projects/:id`, `GET /api/documents`, or `GET /api/tasks?view=kanban`.
  4. **Document Upload & Download:** No test for `POST /api/documents/upload` with `document_type` field ordering, rollback file cleanup, or `timeline.js` evidence upload file-type rejection.
  5. **Clean-Install Migration Test:** No automated CI check verifying `schema.sql` + `migrator.js` succeeds on an empty PostgreSQL database.
  6. **DS16 End-to-End Scenario:** No single E2E test covering the full 13-step DS16 workflow (create project -> building config -> timeline -> area statement -> FSI/TDR/ancillary -> P-line -> units -> financial viability -> statutory demands -> export -> source update -> recalculation -> snapshot immutability).
