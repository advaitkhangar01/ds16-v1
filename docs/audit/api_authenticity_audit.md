# DS16 — API Authenticity & Contract Integrity Audit (`api_authenticity_audit.md`)

**Audit Date:** 2026-11-26  
**Scope:** All 20 route modules under `server/routes/` (mounted in `server/index.js:93-111` and `server/routes/projects.js:16-17`).

---

## 1. API Route Inventory & Auth Summary

| Mount Prefix | File | Auth Enforcement | Role / Isolation Guard |
|---|---|---|---|
| `/api/auth` | `routes/auth.js` | `POST /login` (rate-limited), `POST /logout` (none), `GET /users` (`authenticate`) | Any user can list all active users |
| `/api/projects` | `routes/projects.js` | `authenticate` on all | **Missing** role/project checks on `POST /`, `PATCH /:id/stages/:stageId`, `POST/PATCH/DELETE /:id/stakeholders`, `POST /:id/vendors` |
| `/api/projects/:projectId/feasibility` | `routes/feasibility.js` | `authenticate`, `checkProjectAccess()` | `requireFeasibilityAccess` / `requireFeasibilityEdit` |
| `/api/projects/:projectId/timeline` | `routes/timeline.js` | `authenticate`, `checkProjectAccess()` | `requireManagement` on mutations |
| `/api/clients` | `routes/clients.js` | `authenticate` on all | `POST /` open to any user; `PATCH` uses inline check; `DELETE` `requireAdmin` |
| `/api/staff` | `routes/staff.js` | Router-level `authenticate` | `GET /` `requireAdmin`; `GET /:id` `isSelf \|\| isAdmin` |
| `/api/tasks` | `routes/tasks.js` | `authenticate` on all | `GET /?view=kanban\|history\|scheduled` leaks all projects' unassigned tasks |
| `/api/documents` | `routes/documents.js` | `authenticate`, `checkProjectAccess()` | `requireAccounting` on payment-stage & amount routes |
| `/api/vendors` | `routes/vendors.js` | `authenticate` on all | `POST /` & `PATCH /:id` open to any user; `DELETE` `requireAdmin` |
| `/api/settings` | `routes/settings.js` | Router-level `authenticate` | `requireAdmin` on mutations (except `PATCH /change-password`, `GET /app`, `GET /dropdowns`) |
| `/api/dashboard` | `routes/dashboard.js` | `authenticate` | `/admin*` `requireAccounting`; `/employee` leaks all team leave reasons & all projects |
| `/api/notifications` | `routes/notifications.js` | `authenticate` | Scoped to `req.user.id`; `POST /broadcast` `requireAdmin` |
| `/api/reports` | `routes/reports.js` | `authenticate`, `requireAccounting` | All 5 endpoints unbounded |
| `/api/daily-reports` | `routes/dailyReports.js` | `authenticate` | Scoped by `tenant_id`; `PUT /:id` checks owner/admin |
| `/api/finances` | `routes/finances.js` | `authenticate`, `requireAccounting` | `DELETE` `requireAdmin`; `checkPeriodLock` on mutations |
| `/api/accounting` | `routes/accounting.js` | Router-level `authenticate`, `requireAccounting` | `POST /expenses/audits` missing `checkPeriodLock` |
| `/api/invoices` | `routes/invoices.js` | `authenticate`, `requireAccounting` | `DELETE` `requireAdmin`; `checkPeriodLock` on mutations |
| `/api/monthly-close` | `routes/monthlyClose.js` | Router-level `authenticate` | `requireAccounting` on reads; `requireAdmin` on mutations |
| `/api/attendance` | `routes/attendance.js` | `authenticate` | `GET /today` exposes all employees' attendance to any user; `POST /manual` `requireAdmin` |
| `/api/leaves` | `routes/leaves.js` | `authenticate` | `PATCH /:id` `requireAdmin`; `POST /` missing period lock |

---

## 2. API Authenticity & Contract Findings

### `API-001` — `validateBody` Middleware Runs in Log-Only Mode by Default
- **Severity:** `HIGH` | **Classification:** Confirmed defect (AI/defensive antipattern)
- **Affected Files:** `server/middleware/validate.js:12-37`, `server/routes/tasks.js:24`, `server/.env`
- **Observed Behaviour:** `validateBody` only rejects invalid payloads when `ENFORCE_REQUEST_VALIDATION === 'true'`. Because `.env`, `.env.example`, and `.env.production` do not set this flag, `validateBody` logs a warning and calls `next()`, allowing invalid payloads through. Moreover, only `tasks.js:24` even mounts `validateBody`.
- **Expected Behaviour:** Request validation must reject malformed requests with `400 Bad Request` in production and be applied consistently across mutating endpoints.
- **Recommended Correction:** Enable enforcement by default (opt-out only if needed) and apply Zod schemas to all `POST`/`PUT`/`PATCH` routes.

### `API-002` — Fake/Swallowed Error Responses Returning `200 OK`
- **Severity:** `HIGH` | **Classification:** Confirmed defect
- **Affected Files:**
  - `server/routes/dashboard.js:45-62` (`calculateSalaryStats` catches all DB errors and returns zeroed stats with `200`)
  - `server/routes/projects.js:202-205` (`PATCH /:id` with empty body returns `200` without checking if project `:id` exists)
  - `server/routes/projects.js:359-368` (`PATCH /:id/stages/:stageId` ignores `rowCount === 0`, updates project status anyway, returns `200 { stage: undefined }`)
  - `server/routes/clients.js:196-199` (`PATCH /:id` ignores `rowCount === 0` and returns `200`)
  - `server/routes/dashboard.js:369-630` (`GET /admin/finances/breakdown` with invalid `type` returns `200 { items: [] }`)
- **Expected Behaviour:** Missing records must return `404`; invalid parameters must return `400`; internal DB failures must propagate or surface explicitly rather than returning fake zeroed `200` metrics.
- **Recommended Correction:** Check `rowCount === 0` -> `404`, validate `type` enum -> `400`, and propagate errors in `calculateSalaryStats`.

### `API-003` — Broken `POST /api/documents/upload` Disk-Path Mismatch & Cleanup Crash
- **Severity:** `HIGH` | **Classification:** Confirmed defect
- **Affected File:** `server/routes/documents.js:54-60,163-165,209-211,254-258`
- **Observed Behaviour:**
  1. Multer `storage.destination` (`L54-60`) reads `req.body.document_type` before multipart fields may be parsed, defaulting the disk folder to `/others/`, while the DB stores `getDocumentTypeSlug(document_type)` (`L209-211`) — causing subsequent `GET /:id/download` and `DELETE /:id` to fail with file-not-found.
  2. `document_type` validation (`L163-165`) runs *after* Multer writes files to disk, without unlinking them on `400`.
  3. On DB error (`L254-258`), `for (const file of req.files)` throws `TypeError: req.files is not iterable` because `upload.fields(...)` produces an object `{ files: [...], file: [...] }`, not an array.
- **Expected Behaviour:** Files must be stored at the exact path recorded in DB, and failed validations/transactions must cleanly unlink uploaded files.
- **Recommended Correction:** Write to a temp directory or parse/validate fields first, iterate `Object.values(req.files || {}).flat()` in `catch`, and unlink on `400`.

### `API-004` — Unvalidated Route/Query Parameters Causing `500` on Bad Input
- **Severity:** `MEDIUM` | **Classification:** Confirmed defect
- **Affected Files:** `routes/auth.js:19`, `routes/projects.js:31,162,249,266,352,384,417,553`, `routes/clients.js:48,157,271`, `routes/staff.js:42,52,76`, `routes/documents.js:357,423,557`, `routes/vendors.js:63,89`, `routes/settings.js:126,184,207,234,438,452`, `routes/reports.js:10-427`, `routes/dailyReports.js:16,105,135`
- **Observed Behaviour:** Non-numeric `:id` / `project_id` / `user_id` or invalid dates are passed directly to PostgreSQL (causing `22P02` / `22007` `500` errors) or `.toLowerCase()` on non-string `username` (`auth.js:19` -> `TypeError` `500`). `PATCH /api/settings/users/:id` (`settings.js:244,282,288`) sends `role = NULL` if `role` is omitted from body.
- **Expected Behaviour:** All IDs, dates, enums, and strings must be validated before DB queries, returning `400`.
- **Recommended Correction:** Add shared `parsePositiveInt` / `parseIsoDate` validators and strict Zod schemas.

### `API-005` — Unbounded `SELECT` Queries & Ignored Query Parameters
- **Severity:** `MEDIUM` | **Classification:** Confirmed defect
- **Affected Files:** `routes/auth.js:74`, `routes/projects.js:93-99,275`, `routes/clients.js:27-33`, `routes/staff.js:13-30,76-527`, `routes/tasks.js:105,148,215,254,304,338`, `routes/documents.js:294`, `routes/vendors.js:11`, `routes/settings.js:23`, `routes/dashboard.js:112,306,369-630,784`, `routes/reports.js:10-427`, `routes/dailyReports.js:84-132`
- **Observed Behaviour:** Most list/report endpoints lack `LIMIT`/pagination (or make `limit` optional) and `tasks.js:105` accepts `status` query param but ignores it.
- **Recommended Correction:** Enforce bounded pagination (`LIMIT`/`OFFSET` with max cap, e.g., 100–500) on all list endpoints and remove or implement `status` filtering.

### `API-006` — `POST /api/invoices` Trusts Client-Supplied Totals Without Verification
- **Severity:** `MEDIUM` | **Classification:** Confirmed defect
- **Affected File:** `server/routes/invoices.js:291-480`
- **Observed Behaviour:** Server inserts client-supplied `amount`, `items`, and `tax_details` without verifying `SUM(items) + GST === amount` or validating non-negative values in `POST /api/accounting/payroll` (`accounting.js:342-363`).
- **Recommended Correction:** Recompute/verify invoice totals server-side from `items` + `tax_details` and validate non-negative numeric fields.
