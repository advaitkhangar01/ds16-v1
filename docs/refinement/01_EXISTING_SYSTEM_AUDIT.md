# Document 1 — Existing System Audit
## DS16 Project Timeline and Area & Financial Feasibility Module

### 1. Architectural Overview & Component Inventory
The DS16 web application is an enterprise architectural ERP and CRM built on Node.js (Express), PostgreSQL, and React (Vite, TailwindCSS).
The two modules targeted for refinement are integrated within the Project Details page (`/projects/:projectId`):
- **Project Timeline** (`client/src/components/projects/timeline/ProjectTimelineTab.jsx`)
- **Area Statement & Financial Feasibility** (`client/src/components/projects/feasibility/AreaFeasibilityTab.jsx`)

---

### 2. File-by-File Audit of Affected Modules

#### A. Backend Routes & Controllers
1. **`server/routes/feasibility.js`** (707 lines):
   - Handles CRUD for `project_area_statements`, `project_area_floors`, `project_financial_viabilities`, `project_salable_units`, snapshots, and exports.
   - Enforces RBAC via `requireFeasibilityAccess` (`canViewFinancials`, `design_head`, `project_head`) and `requireFeasibilityEdit` (`admin`, `back_office`, `accounts`, `design_head`, `project_head`).
   - Tenant isolation is strictly enforced using `WHERE project_id = $x`.
   - **Audit Finding**: Currently missing dedicated endpoints or parameters for parking floor definitions, independent Regular/Slum TDR fields, per-charge RR percentages, Gunthewari plot attributes, and soft-delete/enable-disable toggles for statutory charges.

2. **`server/routes/timeline.js`** (680 lines):
   - Manages timeline configurations, versions, draft activities, publishing, and reactive milestone recalculation.
   - Enforces project management authorization (`canManageProject`).
   - Supports `cost_estimate` in `timeline_tasks` schema, but does not display it in the main task list.

#### B. Calculation & Business Logic Services
1. **`server/services/feasibilityEngine.js`** (355 lines):
   - Authoritative backend calculation engine containing `calculateAreaMetrics` and `calculateFinancialMetrics`.
   - **Audit Finding 1**: Ancillary area calculation is currently hardcoded to `ancillaryResPct` (0.60) regardless of building use (`Commercial Complex` vs `Residential Apartment`).
   - **Audit Finding 2**: TDR is modeled as a single factor (`proposed_tdr_factor`) rather than independent Regular TDR and Slum TDR factors.
   - **Audit Finding 3**: Statutory charges in `statutoryMap` use hardcoded RR percentages (e.g., Ancillary: 10% RR, Development: 2% RR, Premium FSI: 40% RR, TDR Loading: 3% RR) instead of per-charge configurable percentages.
   - **Audit Finding 4**: Amalgamation charges (`plotAreaSqm * 200.00`) are actively calculated and summed into `totalStatutoryDemandA`.
   - **Audit Finding 5**: Gunthewari plot road-width based TDR matrix is not yet present.

2. **`server/services/timelineGenerator.js`** (599 lines):
   - Generates floor-wise construction activities.
   - Supports building configuration (`floors_above_ground`, `ground_floor_config`, `has_terrace_tank_slab`).
   - **Audit Finding**: Ground-floor configuration supports standard styles (`parking_and_rooms`, `stilt_parking`, `commercial_shops`), but lacks multi-level parking floor specifications (Basement 1, Basement 2, Stilt, Upper Floor Parking).

#### C. Database Schema (PostgreSQL)
1. **`timeline_configurations`**:
   - Stores building configuration. Lacks structured `parking_floors` metadata (currently uses single `ground_floor_config VARCHAR(50)`).
2. **`project_area_statements`**:
   - Stores baseline plot area, FSI factors, and TDR factor. Lacks `building_use`, `regular_tdr_factor`, `slum_tdr_factor`, `is_gunthewari`, and `road_width_m`.
3. **`project_area_floors`**:
   - Stores floor-wise P-Line area, lobby area, height, and usage type.
   - Lacks `no_of_units`, `area_for_1_unit`, `is_lobby_overridden`, and explicit `floor_type` ('parking' vs 'habitable').
4. **`project_statutory_charges`**:
   - Stores regulatory charges.
   - Lacks `is_enabled` (boolean toggle), `is_deleted` (archiving flag), and `rr_percentage` (independent RR percentage).
5. **`timeline_tasks`**:
   - Contains `cost_estimate NUMERIC(15, 2) DEFAULT 0`. Field exists in schema, but is not exposed in the Task List view.

#### D. Frontend Components
1. **`client/src/components/projects/feasibility/AreaFeasibilityTab.jsx`**:
   - Contains a client-side calculation mirror (`recalculateLive`).
   - **Audit Finding**: Contains hardcoded fallbacks (e.g. `0.545`, `24340`, `20000`, `30000`, `5500`, `234233`) which must be removed in favor of authoritative backend engine outputs to prevent UI-backend drift.
2. **`client/src/components/projects/feasibility/AreaStatementForm.jsx`**:
   - Renders plot inputs, FSI factors, and floor rows.
   - Lacks Gunthewari toggle, road-width dropdown, separate Regular/Slum TDR inputs, and automatic 15% lobby calculation with override detection.
3. **`client/src/components/projects/feasibility/FinancialViabilityForm.jsx`**:
   - Renders rates, development costs, and salable unit inventory.
   - Statutory charges are rendered without per-charge enable/disable checkboxes, per-charge RR percentage inputs, or soft-delete controls.
4. **`client/src/components/projects/feasibility/FeasibilityDocumentPreview.jsx`**:
   - Currently presents Plot Area and FSI potential in a single combined table.
   - Proposed Floor-wise table currently lacks the exact sequence: `Floor Level | Height (m) | P-Line Area (sq m) | Lobby Area (sq m) | Built-up for Sale (sq m) | No. Of Units | Area For 1 Unit`.
5. **`client/src/components/projects/timeline/TimelineTaskList.jsx`**:
   - Verified: Does not display any cost columns or estimates in the table, Excel export, or PDF export.
