# DS16 — Robustness, Transactions, Concurrency & Performance Audit (`robustness_and_performance_audit.md`)

**Audit Date:** 2026-11-26  
**Scope:** Transaction atomicity, race conditions, idempotency, period-lock enforcement, audit logging, and query performance across `server/`.

---

## 1. Transaction, Concurrency & Idempotency Findings

### `ROB-001` — TOCTOU Race Conditions in Invoice Payment Recording (`mark-paid` & `record-payment`)
- **Severity:** `CRITICAL` | **Classification:** Confirmed defect
- **Affected Files:** `server/routes/invoices.js:644-737` (`POST /:id/mark-paid`), `server/routes/invoices.js:740-850` (`POST /:id/record-payment`)
- **Observed Behaviour:** Both endpoints execute `SELECT * FROM invoices WHERE id = $1` **before `BEGIN`** (`L650-653`, `L752-755`) and **without `FOR UPDATE`**. Two concurrent requests (e.g., double-click or retry) can both pass the `status === 'paid'` / `remainingBalance` check, both insert duplicate `project_receipt` rows into `transactions`, and both commit.
- **Expected Behaviour:** Lock the invoice row inside the transaction with `SELECT ... FROM invoices WHERE id = $1 FOR UPDATE` and enforce idempotency / remaining balance inside the locked transaction.
- **Business Impact:** Duplicate revenue transactions and over-collected invoice balances.
- **Recommended Correction:** Move `SELECT ... FOR UPDATE` inside `BEGIN`, re-check `status` / `remainingBalance`, and optionally accept an `Idempotency-Key` header.

### `ROB-002` — `PATCH /api/invoices/:id/status` Fails to Record or Reverse Ledger Transactions
- **Severity:** `HIGH` | **Classification:** Confirmed defect
- **Affected File:** `server/routes/invoices.js:483-640`
- **Observed Behaviour:** Marking an invoice `status = 'paid'` via `PATCH /:id/status` updates `invoices.received_amount` and `project_payment_stages.status` without inserting a `project_receipt` row into `transactions` (unlike `POST /` and `POST /:id/mark-paid`). Reverting from `'paid'` to `'generated'`/`'cancelled'` does not reset `received_amount` or reverse `transactions`.
- **Expected Behaviour:** Ledger `transactions` and `invoices.received_amount` must stay synchronized across all invoice status transitions.
- **Recommended Correction:** Route status-to-paid transitions through shared payment-recording logic or disallow direct `'paid'` mutation via `PATCH /:id/status`.

### `ROB-003` — Multi-Step Mutations Without Transactions (Partial-Write Risks)
- **Severity:** `HIGH` | **Classification:** Confirmed defect
- **Affected Files:**
  - `server/routes/accounting.js:218-318` (`PUT /payroll/employees/:id`: updates `users`, then updates `payroll` without `BEGIN/COMMIT`)
  - `server/routes/monthlyClose.js:751-790` (`POST /relock`: 3 separate `pool.query` calls across `period_unlock_log`, `monthly_closing_log`, `company_capital`)
  - `server/routes/leaves.js:227-320` (`PATCH /:id`: updates `leave_requests`, then syncs `attendance` in a swallowing `try/catch`)
  - `server/routes/projects.js:352-381` (`PATCH /:id/stages/:stageId`), `projects.js:445-547` (stakeholder `POST`/`PATCH`/`DELETE`)
  - `server/routes/tasks.js:458-612` (`PATCH /:task_id`: `UPDATE tasks` + `INSERT INTO task_participants`)
- **Expected Behaviour:** All multi-table state changes must run inside a single `BEGIN ... COMMIT` / `ROLLBACK` block.
- **Recommended Correction:** Wrap each multi-step mutation in a PostgreSQL transaction using `pool.connect()`.

### `ROB-004` — Connection/Transaction Leaks on Early Returns in `tasks.js`
- **Severity:** `HIGH` | **Classification:** Confirmed defect
- **Affected File:** `server/routes/tasks.js:32-37` (`POST /`), `server/routes/tasks.js:362-372` (`POST /:task_id/messages`)
- **Observed Behaviour:** `await client.query('BEGIN')` executes *before* input validation (`400`) and existence checks (`404`). Early returns skip `COMMIT`/`ROLLBACK` (though `finally` releases the client back to the pool with an open uncommitted transaction!).
- **Business Impact:** Dirty pooled connections with open transactions can corrupt subsequent requests or exhaust locks.
- **Recommended Correction:** Validate inputs before `BEGIN` and always `ROLLBACK` in `catch` / before returning early.

### `ROB-005` — Attendance Checkout Double-Submit Race & Unrounded Hours
- **Severity:** `MEDIUM` | **Classification:** Confirmed defect
- **Affected File:** `server/routes/attendance.js:489,496,553-565`
- **Observed Behaviour:** `POST /checkout` checks `existingRow.check_out` in JS (`L489`) and updates `WHERE id = $11` (`L553-560`) without `AND check_out IS NULL`. Also stores unrounded `hoursWorked` float, whereas `autoCheckoutPendingRecords` (`L120`) rounds to 2 decimals.
- **Recommended Correction:** Add `AND check_out IS NULL` to the `UPDATE` predicate and round `hoursWorked` consistently.

### `ROB-006` — Period Lock Bypasses & Middleware Ordering Bugs
- **Severity:** `HIGH` | **Classification:** Confirmed defect
- **Affected Files:**
  - `server/routes/accounting.js:160-175` (`POST /expenses/audits` lacks `checkPeriodLock`, allowing verification flips on closed months)
  - `server/routes/leaves.js:163` (`POST /` lacks period lock; `PATCH /:id` at `L246-257` ignores `end_date` and `period_unlock_log`)
  - `server/middleware/periodLock.js:72-78,87,100-103` (`PUT /payroll/employees/:id` passes `user_id` as `req.params.id` which `periodLock.js:74` queries against `payroll.id`; missing date on `PUT` defaults to `new Date()`; unparseable dates pass through at `L101`)
  - `server/routes/finances.js:334`, `server/routes/accounting.js:96` (`upload.single('receipt')` runs *before* `checkPeriodLock`, orphaning files on `403`)
- **Recommended Correction:** Mount `checkPeriodLock` on `POST /expenses/audits` and `leaves.js`, run `checkPeriodLock` *before* Multer, and fix `periodLock.js` parameter resolution.

### `ROB-007` — Missing Audit Trail (`audit_logs`) on Critical Financial Operations
- **Severity:** `MEDIUM` | **Classification:** Confirmed defect
- **Affected Files:** `server/routes/invoices.js`, `server/routes/finances.js`, `server/routes/accounting.js` (except `POST /payroll`), `server/routes/monthlyClose.js` (`unlock`/`relock`/`DELETE`), `server/routes/leaves.js`
- **Observed Behaviour:** Only 4 endpoints (`POST /payroll`, `executeMonthCloseInternal`, `POST /attendance/manual`, `DELETE /factory-reset`) call `logAudit()`. Invoice creation/payments/deletions, transaction deletions, expense audits, and leave approvals leave no entry in `audit_logs`.
- **Recommended Correction:** Call `logAudit()` on all financial, payroll, leave, and permission mutations.

---

## 2. Performance & Query Efficiency Findings

### `PERF-001` — N+1 Queries in Payroll Reports, Project Creation & Task Participants
- **Severity:** `MEDIUM` | **Classification:** Confirmed defect
- **Affected Files:**
  - `server/routes/reports.js:304-327` (`GET /api/reports/payroll` runs `calculatePayrollForEmployee` per unpaid employee in `Promise.all`, issuing multiple DB queries per staff member)
  - `server/routes/projects.js:48-53` (loops `INSERT INTO project_stages`)
  - `server/routes/clients.js:110-135` (loops `INSERT` for contacts, addresses, banking)
  - `server/routes/tasks.js:52-59,392-398` (loops `INSERT INTO task_participants`)
  - `server/routes/staff.js:76-527` (12+ sequential queries per `GET /api/staff/:id`)
- **Recommended Correction:** Use batch `INSERT ... UNNEST(...)` for multi-row inserts and batch attendance/leave queries in `reports/payroll`.

### `PERF-002` — Unbounded `generate_series` Date Ranges (DoS Risk)
- **Severity:** `MEDIUM` | **Classification:** Confirmed defect
- **Affected Files:** `server/routes/staff.js:146`, `server/routes/reports.js:10-86`
- **Observed Behaviour:** `start_date` and `end_date` are not bounded; a user supplying `start_date=1900-01-01&end_date=2100-01-01` forces PostgreSQL to generate ~73,000 rows per employee.
- **Recommended Correction:** Validate ISO date format and cap date ranges (e.g., max 366 days) on `staff.js` and `reports.js`.

### `PERF-003` — Unhandled Async Notification IIFE in `dailyReports.js`
- **Severity:** `LOW` | **Classification:** Confirmed defect
- **Affected File:** `server/routes/dailyReports.js:46-58`
- **Observed Behaviour:** Async IIFE dispatching notifications has no `try/catch` wrapper, risking an unhandled promise rejection.
- **Recommended Correction:** Wrap the async IIFE in `try/catch` and log errors safely.
