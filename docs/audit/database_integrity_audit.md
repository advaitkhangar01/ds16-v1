# DS16 — Database Integrity & Migration Audit (`database_integrity_audit.md`)

**Audit Date:** 2026-11-26  
**Scope:** `server/db/schema.sql`, `server/db/migrations/*.sql`, `server/db/migrations/down/*.sql`, `server/db/seed.sql`, `server/db/seed.js`, and `server/utils/migrator.js`.

---

## 1. Schema & Migration Findings

### `DB-001` — `019` and `026` Migrations Fail on Fresh `schema.sql` Installation
- **Severity:** `CRITICAL` | **Classification:** Confirmed defect
- **Affected Files:**
  - `server/db/migrations/019_prevent_cascade_data_loss_and_add_soft_delete.sql:29-32`
  - `server/db/migrations/026_baseline_schema_consolidation.sql:305-306`
  - `server/db/schema.sql:303-311`
- **Observed Behaviour:**
  1. `019:29-32` executes `ALTER TABLE employee_leave_balance ...`, but `employee_leave_balance` is not in `schema.sql` and is only created later in `026:260-272` and `add_monthly_closing.sql:20-32`.
  2. `026:305-306` executes `DELETE FROM expense_audits a USING expense_audits b WHERE a.id < b.id ...`, but `expense_audits` in `schema.sql:303-311` has **no `id` column** (PK is `(category, month, year)`).
- **Expected Behaviour:** Fresh installations (`schema.sql` + `npm run migrate`) must succeed cleanly without SQL errors.
- **Business Impact:** Clean deployments and CI/test database provisioning fail mid-migration.
- **Recommended Correction:** Guard `019:29-32` with `IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'employee_leave_balance')` and fix `026:305-306` to use `ctid` or check for `id` column existence.

### `DB-002` — Severe Schema Drift Between `schema.sql` and `migrations/`
- **Severity:** `HIGH` | **Classification:** Confirmed defect
- **Affected Files:** `server/db/schema.sql`, `server/db/migrations/015`–`035`, `add_invoice_stages_junction.sql`, `add_monthly_closing.sql`
- **Observed Behaviour:**
  - 24 tables created in migrations (`tenants`, `daily_reports`, `employee_leave_balance`, `company_capital`, `attendance_dropdown_masters`, `invoice_payment_stages`, `schema_migrations`, and all 17 `028` timeline/feasibility tables) are absent from `schema.sql`.
  - Conflicting definitions exist for `monthly_closing_log` (`schema.sql:388-401` has `is_verified`, `verified_by`, `financial_snapshot`; `026:246-258` / `add_monthly_closing.sql:5-17` have `had_pending_payroll`, `close_reason`, `snapshot`), `period_unlock_log`, `notifications`, `audit_logs`, and `attendance_batches` (`min_working_hours DEFAULT 9.00` vs `4.00`).
  - Migrations `001`–`014` are missing from the repository.
- **Expected Behaviour:** `schema.sql` and migrations must agree on one canonical schema.
- **Recommended Correction:** Reconcile `schema.sql` with the post-`035` schema and add `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` for missing columns on `monthly_closing_log`.

### `DB-003` — Non-Numeric Migration Filenames Sort After `035`
- **Severity:** `MEDIUM` | **Classification:** Confirmed defect
- **Affected Files:** `server/utils/migrator.js:34-36`, `server/db/migrations/add_invoice_stages_junction.sql`, `server/db/migrations/add_monthly_closing.sql`
- **Observed Behaviour:** `migrator.js` sorts filenames lexicographically (`'0'` < `'a'`), so `add_invoice_stages_junction.sql` and `add_monthly_closing.sql` execute *after* `035_*.sql` rather than in chronological order.
- **Recommended Correction:** Keep existing applied filenames immutable for production compatibility (avoid renaming already-applied files), and enforce strict numeric prefixes (`036_...`) for all future migrations.

### `DB-004` — Missing `UNIQUE` Constraints Causing `ON CONFLICT DO NOTHING` No-Ops & Duplicate Risks
- **Severity:** `HIGH` | **Classification:** Confirmed defect
- **Affected Files:**
  - `server/db/migrations/028_project_timeline_and_feasibility.sql:37-64,319,326` (`timeline_activity_catalogue`, `construction_templates`)
  - `server/db/migrations/034_timeline_activity_identity_and_reconciliation.sql:19-21` (`timeline_tasks`)
  - `server/db/schema.sql:176-182` (`project_stages`), `schema.sql:49-81` (`client_contacts`, `client_banking`)
  - `server/db/migrations/028:264-273` (`project_feasibility_snapshots`)
  - `server/db/migrations/026:31-41` (`project_payment_stages` missing `uq_project_payment_stages_type` present in `schema.sql:195`)
- **Observed Behaviour:**
  - `028:319,326` uses `ON CONFLICT DO NOTHING` on `timeline_activity_catalogue` and `construction_templates` without any `UNIQUE` constraint, so re-running inserts duplicates.
  - `timeline_tasks` only has a non-unique index on `(project_id, activity_key)` (`034:19-21`).
  - `project_stages` lacks `UNIQUE (project_id, stage_name)`.
  - `project_feasibility_snapshots` lacks `UNIQUE (project_id, version_number)`.
- **Recommended Correction:** Add the missing `UNIQUE` constraints/indexes after deduplicating any existing rows.

### `DB-005` — Nullable Foreign Keys & Missing Referential Integrity
- **Severity:** `MEDIUM` | **Classification:** Confirmed defect
- **Affected Files:** `server/db/schema.sql:51,62,73,87,191,258-259,266,277,285,316,443`
- **Observed Behaviour:** `payroll.user_id` (`ON DELETE RESTRICT`, yet nullable), `invoices.project_id`, `invoices.client_id`, `projects.client_id`, `transactions.type`, `client_contacts.client_id`, `client_addresses.client_id`, `client_banking.client_id` are all nullable. `transactions.reference_id` is an untyped `VARCHAR(100)` with no FK.
- **Recommended Correction:** Enforce `NOT NULL` on core ownership FKs (`payroll.user_id`, `client_*.client_id`, `transactions.type`, `projects.client_id` where backfilled).

### `DB-006` — Destructive `TRUNCATE` in `seed.sql` & Hardcoded Prod Patch in `020`
- **Severity:** `MEDIUM` | **Classification:** Confirmed defect
- **Affected Files:** `server/db/seed.sql:6`, `server/db/migrations/020_standardize_attendance_and_restore_records.sql:9-12`
- **Observed Behaviour:** `seed.sql:6` runs `TRUNCATE ... RESTART IDENTITY CASCADE` on 7 core tables; `020:9-12` hardcodes `user_id = 1` and date `'2026-05-05'`.
- **Recommended Correction:** Guard `seed.js` against running in `NODE_ENV === 'production'` without an explicit override flag; avoid data-specific patches in future migrations.
