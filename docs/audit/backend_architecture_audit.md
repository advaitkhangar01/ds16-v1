# DS16 — Backend Architecture Audit (`backend_architecture_audit.md`)

**Audit Date:** 2026-11-26  
**Scope:** `d:\Freelance\ds16-v1\server\` and frontend API integration in `d:\Freelance\ds16-v1\client\src\`

---

## 1. Runtime, Framework & Infrastructure Inventory

| Layer | Technology / File | Details |
|---|---|---|
| Runtime | Node.js (CommonJS) | `server/package.json:16` |
| Web Framework | Express `^5.2.1` | `server/index.js:11,39` |
| Database | PostgreSQL via `pg ^8.20.0` | Raw SQL `Pool` (max 8 connections, IST timezone `-c timezone=Asia/Kolkata`), `server/db/index.js:8-19` |
| Migrations | Custom SQL runner | `server/utils/migrator.js` (`schema_migrations` table, advisory lock `987654321`) |
| Auth | JWT (`jsonwebtoken ^9.0.3`) + `bcryptjs ^3.0.3` | `server/middleware/auth.js` (Bearer, `ds16_token` cookie, `?token=` query) |
| Validation | `zod ^4.6.7` | `server/middleware/validate.js` (log-only unless `ENFORCE_REQUEST_VALIDATION=true`) |
| File Uploads | `multer ^2.1.1` | Local disk storage under `server/uploads/` (`documents.js`, `finances.js`, `accounting.js`, `timeline.js`) |
| Security Headers / CORS / Rate Limit | `helmet ^8.1.0`, `cors ^2.8.6`, `express-rate-limit ^8.6.1` | `server/index.js:45-82` (rate limiter on `/api/auth/login` only) |
| Process Manager | PM2 (`cluster` mode, `instances: 'max'`) | `server/ecosystem.config.js:10-11` |
| Background Jobs | `setInterval` / `setTimeout` on `NODE_APP_INSTANCE === '0'` | `server/index.js:185-210`, `server/utils/scheduler.js` |

---

## 2. Dependency Map: Frontend → API Route → Service → Database → Response

*(Note: DS16 has **no** separate `controllers/` directory. All HTTP handling, validation, and most SQL queries live directly inside `server/routes/*.js`.)*

```
Frontend (React + Axios `client/src/api/client.js`, baseURL `/api`)
  ├─ LoginPage.jsx ──────────────────────► POST /api/auth/login ────────────► routes/auth.js ──────────► users
  ├─ AdminDashboard / EmployeeDashboard ─► GET /api/dashboard/* ───────────► routes/dashboard.js ─────► projects, tasks, attendance, payroll, leave_requests, invoices, transactions
  ├─ ProjectsPage / ProjectDetail ───────► /api/projects/* ────────────────► routes/projects.js ──────► projects, project_stages, project_assignments, project_stakeholders, project_vendors
  ├─ AreaFeasibilityTab.jsx ─────────────► /api/projects/:id/feasibility/* ► routes/feasibility.js ───► services/feasibilityEngine.js, buildingHierarchyService.js ─► project_area_statements, project_area_floors, project_financial_viabilities, project_statutory_charges, project_salable_units, project_feasibility_snapshots
  ├─ ProjectTimelineTab.jsx ─────────────► /api/projects/:id/timeline/* ───► routes/timeline.js ──────► services/timelineGenerator.js, buildingHierarchyService.js ─► timeline_configurations, timeline_tasks, timeline_versions, timeline_task_dependencies, timeline_task_evidence, timeline_audit_history
  ├─ ClientsPage / ClientDetail ─────────► /api/clients/* ─────────────────► routes/clients.js ───────► clients, client_contacts, client_addresses, client_banking
  ├─ TasksPage / TaskModal ──────────────► /api/tasks/* ───────────────────► routes/tasks.js ─────────► tasks, task_participants, task_messages
  ├─ DocumentsTab / PaymentStagesTab ────► /api/documents/* ───────────────► routes/documents.js ─────► documents, project_payment_stages, project_document_amounts + disk `uploads/projects/`
  ├─ InvoicePage / InvoiceHistoryTab ────► /api/invoices/* ────────────────► routes/invoices.js ──────► invoices, invoice_payment_stages, project_payment_stages, transactions
  ├─ ProjectFinancesTab ─────────────────► /api/finances/* ────────────────► routes/finances.js ──────► transactions, payroll, company_capital, expense_audits + disk `uploads/expenses/`
  ├─ AccountingPage ─────────────────────► /api/accounting/* ──────────────► routes/accounting.js ────► office_expenses, expense_audits, payroll, users + utils/payroll.js
  ├─ HistoryPage ────────────────────────► /api/monthly-close/* ───────────► routes/monthlyClose.js ──► monthly_closing_log, period_unlock_log, company_capital, invoices, transactions, office_expenses, payroll
  ├─ AttendancePage / AttendanceCard ────► /api/attendance/*, /api/leaves/* ► routes/attendance.js, leaves.js ─► attendance, attendance_attempts, attendance_batches, leave_requests, holidays
  ├─ StaffPage / StaffDetailPage ────────► /api/staff/* ───────────────────► routes/staff.js ─────────► users, attendance, leave_requests, payroll, projects, tasks
  ├─ DailyReportsPage ───────────────────► /api/daily-reports/* ───────────► routes/dailyReports.js ──► daily_reports
  ├─ VendorsPage / VendorsTab ───────────► /api/vendors/* ─────────────────► routes/vendors.js ───────► vendors
  ├─ ReportsPage ────────────────────────► /api/reports/* ─────────────────► routes/reports.js ───────► attendance, transactions, office_expenses, payroll, invoices, projects
  ├─ SettingsPage ───────────────────────► /api/settings/* ────────────────► routes/settings.js ──────► users, app_settings, holidays, attendance_batches, attendance_dropdown_masters + utils/factoryReset.js
  └─ NotificationBell / Drawer ──────────► /api/notifications/* ───────────► routes/notifications.js ─► notifications
```

---

## 3. Architecture Findings

### `ARCH-001` — Business Logic & Raw SQL Embedded Directly in Route Handlers
- **Severity:** `MEDIUM` | **Classification:** Architectural concern
- **Affected Files:** All 20 files in `server/routes/` (notably `timeline.js` 1,644 lines, `feasibility.js` 1,080 lines, `invoices.js` 940 lines, `dashboard.js` 873 lines, `monthlyClose.js` 867 lines, `attendance.js` 901 lines)
- **Observed Behaviour:** Routes mix HTTP parsing, authorization, transaction management, business calculations, and raw SQL queries in monolithic handlers. Only 3 domain services exist (`feasibilityEngine.js`, `timelineGenerator.js`, `buildingHierarchyService.js`).
- **Expected Behaviour:** Route handlers should delegate business logic and multi-table transactions to cohesive service modules.
- **Business Impact:** High coupling makes changes error-prone and leads to duplicated logic across routes (e.g., P&L summaries in `finances.js`, `accounting.js`, and `monthlyClose.js`).
- **Technical Risk:** Difficult to unit test routes without a live DB; inconsistent behaviour when one route updates a rule and another doesn't.
- **Recommended Correction:** Incrementally extract transaction-bearing workflows (invoice payment recording, monthly close, payroll upsert, finance summary) into shared service modules.

### `ARCH-002` — Overlapping Financial Routes & Dual Expense Systems
- **Severity:** `HIGH` | **Classification:** Confirmed defect
- **Affected Files:** `server/routes/finances.js:53-657`, `server/routes/accounting.js:63-412`, `server/routes/monthlyClose.js:62-253`
- **Relevant Endpoints:** `GET/POST /api/finances/transactions`, `GET /api/finances/summary`, `GET/POST /api/accounting/expenses`, `GET /api/accounting/summary`, `GET /api/monthly-close/preview`
- **Observed Behaviour:** `finances.js` manages `transactions`, while `accounting.js` manages `office_expenses`. Both duplicate identical Multer disk storage setup (`finances.js:12-50` vs `accounting.js:19-52`), both merge `payroll` rows dynamically on `GET`, and all three files implement divergent P&L summary calculations.
- **Expected Behaviour:** One authoritative expense/ledger model and one shared P&L aggregation service.
- **Evidence:** `finances.js:503` subtracts `tdsAmount` from pending receivables; `monthlyClose.js:74` does not. `accounting.js:384-412` ignores `transactions` and `expense_audits` entirely.
- **Business Impact:** Admin Dashboard, Accounting Summary, and Monthly Close snapshots can report conflicting profit/expense figures.
- **Technical Risk:** Divergence grows over time as fixes are applied to only one route.
- **Recommended Correction:** Consolidate P&L aggregation into a single service consumed by `finances.js`, `accounting.js`, and `monthlyClose.js`, and unify expense storage.

### `ARCH-003` — Duplicate Payroll & Late-Penalty Logic in `staff.js`
- **Severity:** `MEDIUM` | **Classification:** Confirmed defect
- **Affected Files:** `server/routes/staff.js:361-483` vs `server/utils/payroll.js` and `server/utils/salaryEngine.js`
- **Observed Behaviour:** `GET /api/staff/:id` re-implements attendance aggregation and late-penalty deduction math inline instead of calling `calculatePayrollForEmployee` / `salaryEngine.js`.
- **Expected Behaviour:** `staff.js` should reuse `utils/payroll.js` / `utils/salaryEngine.js`.
- **Business Impact:** Staff detail page salary projections can drift from official payroll calculations.
- **Recommended Correction:** Replace inline calculation in `staff.js:361-483` with a call to `utils/payroll.js`.

### `ARCH-004` — In-Memory State Breaks Under PM2 Cluster Mode
- **Severity:** `MEDIUM` | **Classification:** Confirmed defect
- **Affected Files:** `server/ecosystem.config.js:10-11`, `server/routes/settings.js:17,470,486-510`
- **Relevant Endpoint:** `GET /api/settings/factory-reset/preview`, `DELETE /api/settings/factory-reset`
- **Observed Behaviour:** `ecosystem.config.js` runs PM2 in `cluster` mode with `instances: 'max'`, while `settings.js:17` stores factory-reset confirmation codes in an in-memory `Map` (`confirmCodes`).
- **Expected Behaviour:** Confirmation tokens should be stored in PostgreSQL (or a shared store) or signed with HMAC so any worker instance can verify them.
- **Business Impact:** In multi-core production, `/factory-reset/preview` hits worker A and `DELETE /factory-reset` may hit worker B, failing with invalid code.
- **Recommended Correction:** Store short-lived confirmation tokens in PostgreSQL or use an HMAC-signed token with expiry.

### `ARCH-005` — Incomplete Deployment Syntax Check List in `deploy.sh`
- **Severity:** `LOW` | **Classification:** Confirmed defect
- **Affected File:** `d:\Freelance\ds16-v1\deploy.sh:91-111`
- **Observed Behaviour:** `deploy.sh` runs `node --check` on 15 route files but omits `routes/auth.js`, `routes/dashboard.js`, `routes/documents.js`, `routes/feasibility.js`, `routes/notifications.js`, `routes/timeline.js`, and all files in `services/` and `utils/`.
- **Expected Behaviour:** All JS files in `server/` (excluding `node_modules`) should be syntax-checked before PM2 reload.
- **Recommended Correction:** Replace the hardcoded list in `deploy.sh:93-110` with a loop over `routes/*.js services/*.js utils/*.js middleware/*.js`.
