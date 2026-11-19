# Document 6 — Security and RBAC Impact Assessment
## Authorization & Auditability Controls

### 1. Existing DS16 Roles & Access Rules
The DS16 platform defines the following role hierarchy:
- `superadmin` / `admin`: Full administrative access to all modules, billing, payroll, timeline, and feasibility.
- `accounts` / `back_office`: Access to invoices, transactions, payroll, and financial feasibility.
- `design_head` / `project_head`: Elevated architectural management roles with feasibility view/edit access and project timeline configuration authority.
- `site_engineer` / `architect` / `intern`: Standard operational staff with access to assigned project tasks and timeline execution updates; **strictly forbidden** from editing financial viability, RR rates, statutory charges, or building baselines.

---

### 2. Endpoint-by-Endpoint Permission Matrix for Refined Features

| API Endpoint | Method | Operation | Authorized Roles | Unauthorized Handling |
| :--- | :---: | :--- | :--- | :--- |
| `/api/projects/:projectId/timeline/config` | `POST` | Update building & parking floor configuration | `admin`, `design_head`, `project_head` | Returns `403 Forbidden` for standard employees |
| `/api/projects/:projectId/feasibility/area` | `PUT` | Update plot area, building use, road width, Gunthewari, dual TDR | `admin`, `back_office`, `accounts`, `design_head`, `project_head` | Returns `403 Forbidden` for standard employees |
| `/api/projects/:projectId/feasibility/area/floors` | `POST` | Add floor row with parking type, units, and lobby | `admin`, `back_office`, `accounts`, `design_head`, `project_head` | Returns `403 Forbidden` |
| `/api/projects/:projectId/feasibility/area/floors/:id` | `PUT` | Update floor, override lobby, set unit count | `admin`, `back_office`, `accounts`, `design_head`, `project_head` | Returns `403 Forbidden` |
| `/api/projects/:projectId/feasibility/financial` | `PUT` | Update RR rates, development costs, parking costs | `admin`, `back_office`, `accounts`, `design_head`, `project_head` | Returns `403 Forbidden` |
| `/api/projects/:projectId/feasibility/statutory/:id` | `PATCH` | Enable/disable statutory charge, edit per-charge RR % | `admin`, `back_office`, `accounts`, `design_head`, `project_head` | Returns `403 Forbidden` |
| `/api/projects/:projectId/feasibility/statutory/:id` | `DELETE` | Soft-delete / archive statutory charge | `admin`, `accounts`, `design_head`, `project_head` | Returns `403 Forbidden` |

---

### 3. Server-Side Security Enforcement Rules
1. **Never Rely on Client-Side UI Hiding**: Frontend disables or hides edit inputs for non-privileged users; backend independently validates permissions in middleware (`requireFeasibilityEdit`).
2. **Strict Project Isolation (Multi-Tenant Safety)**: Every SQL query explicitly scopes to `WHERE project_id = $1` or `WHERE financial_viability_id = (SELECT id FROM project_financial_viabilities WHERE project_id = $1)`. Accessing or updating records belonging to another project returns `404 Not Found`.
3. **Audit Trail Recording**:
   - Every change to area statements, building use, TDR factors, lobby overrides, statutory charge enable/disable toggles, or per-charge RR percentages writes an immutable audit record to `feasibility_audit_logs`.
   - Recorded fields: `project_id`, `user_id`, `action`, `module`, `entity_type`, `old_value (JSONB)`, `new_value (JSONB)`, and `created_at`.
4. **Input Sanitization & Validation**:
   - Road widths are strictly checked against the set `[9, 12, 15, 18, 24]`.
   - Number of units must be $\ge 0$.
   - Percentages are restricted to valid positive ranges ($0 \dots 100\%$).
