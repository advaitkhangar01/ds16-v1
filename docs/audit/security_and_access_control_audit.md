# DS16 — Security & Access Control Audit (`security_and_access_control_audit.md`)

**Audit Date:** 2026-11-26  
**Scope:** Authentication, RBAC, project isolation, file security, input validation, and secret/log hygiene across `server/`.

---

## 1. Confirmed Security Findings

### `SEC-001` — `checkProjectAccess()` Does Not Enforce Project-Level Isolation
- **Severity:** `CRITICAL` | **Classification:** Confirmed defect (AI/defensive antipattern)
- **Affected File:** `server/middleware/accessControl.js:13-95`
- **Relevant Function:** `checkProjectAccess`
- **Observed Behaviour:** Despite its JSDoc (`L7`: *"Employees have access if they are assigned to the project or mentioned in a comment/task"*), lines `84-90` only verify `SELECT id FROM projects WHERE id = $1` and then execute `return next()` with the comment: *"Every authenticated user has access to any existing project for non-financial resources"*. It never checks `project_assignments` or `tasks`.
- **Expected Behaviour:** Non-privileged users (`employee`, `design`, `liasoning`, `civil_engineer`, etc.) must only access projects they are assigned to (or have tasks in).
- **Business Impact:** Any authenticated employee can read/modify documents, timeline tasks, and project details of any project in the firm by changing `:id` / `project_id` (IDOR).
- **Recommended Correction:** Query `project_assignments` (and/or `tasks` / `task_participants`) in `checkProjectAccess()` for non-management roles and return `403` if unassigned. Also validate numeric `resourceId`/`projectId` *before* the role skip at `L19`.

### `SEC-002` — Missing Authorization & Ownership Checks on Project Mutating Endpoints
- **Severity:** `HIGH` | **Classification:** Confirmed defect
- **Affected Files:**
  - `server/routes/projects.js:20` (`POST /api/projects` — any authenticated user can create projects)
  - `server/routes/projects.js:352` (`PATCH /api/projects/:id/stages/:stageId` — no role check, no `checkProjectAccess`)
  - `server/routes/projects.js:445,486,525` (`POST/PATCH/DELETE /api/projects/:id/stakeholders` — no role check, no `checkProjectAccess`)
  - `server/routes/projects.js:613` (`POST /api/projects/:id/vendors` — no role check, no `checkProjectAccess`)
  - `server/routes/clients.js:80` (`POST /api/clients` — any user can create clients)
  - `server/routes/vendors.js:42,63` (`POST/PATCH /api/vendors` — any user can create/modify vendors)
- **Expected Behaviour:** Project, stage, stakeholder, vendor, and client mutations must enforce appropriate management/accounting roles and project access.
- **Recommended Correction:** Apply `requireAdmin` or management role middleware + `checkProjectAccess()` consistently across all mutating endpoints.

### `SEC-003` — Cross-Project Task & Leave Reason Exposure to Regular Employees
- **Severity:** `HIGH` | **Classification:** Confirmed defect
- **Affected Files:**
  - `server/routes/tasks.js:108-194` (`GET /api/tasks?view=kanban|history|scheduled`)
  - `server/routes/dashboard.js:784-789,826,841` (`GET /api/dashboard/employee`)
  - `server/routes/attendance.js:590-668` (`GET /api/attendance/today`)
  - `server/routes/projects.js:119-120` (`GET /api/projects/:id`), `server/routes/clients.js:48-77` (`GET /api/clients/:id`)
- **Observed Behaviour:**
  - `tasks.js` returns all unassigned tasks across all projects to regular employees in `kanban`/`history`/`scheduled` views.
  - `dashboard.js` exposes all team members' `leave_requests.reason` and all projects to every employee.
  - `attendance.js` `GET /today` exposes all active employees' attendance status, check-in/out times, and late minutes to any employee.
  - `projects.js:119-120` and `clients.js:48-77` expose client `gst_number` and `pan_number` to non-accounting employees.
- **Recommended Correction:** Scope `tasks.js` and `dashboard.js` to the user's assigned projects/tasks, mask `leave_requests.reason` and colleague attendance details for non-managers, and gate `gst_number`/`pan_number` behind `canViewFinancials`.

### `SEC-004` — Unfiltered Timeline Evidence File Uploads & Path Traversal Risk
- **Severity:** `HIGH` | **Classification:** Confirmed defect
- **Affected Files:**
  - `server/routes/timeline.js:15-36,1418` (`uploadEvidence`)
  - `server/routes/documents.js:567` (`GET /:id/download`)
- **Observed Behaviour:**
  - `timeline.js` `uploadEvidence` has **no `fileFilter`** — any executable/script file (`.html`, `.js`, `.exe`, `.sh`) up to 25 MB can be uploaded. Furthermore, `req.params.projectId` is interpolated into `path.join` (`timeline.js:17-18`), and `admin`/`design_head`/`project_head` bypass `checkProjectAccess` numeric validation (`accessControl.js:19`).
  - `documents.js:567` uses `path.join(__dirname, '..', doc.file_path)` without `path.resolve` + `startsWith(uploadsRoot)` verification.
- **Recommended Correction:** Apply strict extension/MIME allowlists to `uploadEvidence`, validate `projectId` as a positive integer before Multer runs, and enforce `path.resolve` boundary checks on `documents.js:567`.

### `SEC-005` — JWT Accepted in URL Query String (`?token=`)
- **Severity:** `MEDIUM` | **Classification:** Confirmed defect
- **Affected File:** `server/middleware/auth.js:51-53`
- **Observed Behaviour:** `extractToken` accepts `?token=...` on every `authenticate` endpoint, not just media/download endpoints.
- **Business Impact:** JWTs in URLs leak into Nginx access logs, PM2 logs, browser history, and `Referer` headers.
- **Recommended Correction:** Rely on HTTP-only `ds16_token` cookie for browser media/downloads and restrict `?token=` (or remove it in favor of short-lived signed download URLs).

### `SEC-006` — Unauthenticated `POST /api/auth/logout` & No Token Revocation
- **Severity:** `LOW` | **Classification:** Architectural concern
- **Affected Files:** `server/routes/auth.js:66-69`, `server/middleware/auth.js:122-124`
- **Observed Behaviour:** `logout` clears the cookie, but 7-day JWTs remain valid until expiry if stolen.
- **Recommended Correction:** Shorten JWT expiry or add a `token_version` column on `users` checked in `authenticate`.

### `SEC-007` — Raw Internal/SQL Errors & Request Bodies Leaked in Responses/Logs
- **Severity:** `MEDIUM` | **Classification:** Confirmed defect
- **Affected Files:**
  - Responses: `routes/accounting.js:91,118,132,155,173,213,316,337,376,410,423`, `routes/monthlyClose.js:406,637,656,707,743,788,863`, `routes/documents.js:350,416,501`, `routes/attendance.js:585`
  - Logs: `routes/finances.js:336` (logs full `req.body`), `routes/leaves.js:149-150` (logs full SQL + params)
- **Observed Behaviour:** Production error responses return `err.message` directly (exposing PostgreSQL table/constraint names).
- **Recommended Correction:** Return generic error messages in `NODE_ENV === 'production'` and log details server-side with redacted sensitive fields.

### `SEC-008` — Rate Limiting Applied Only to `/api/auth/login`
- **Severity:** `LOW` | **Classification:** Architectural concern
- **Affected File:** `server/index.js:74-82`
- **Observed Behaviour:** No global API rate limiting exists; only `/api/auth/login` is rate-limited.
- **Recommended Correction:** Add a reasonable global rate limiter on `/api/` (e.g., 300–500 req/15m per IP) to mitigate DoS on heavy report/dashboard endpoints.
