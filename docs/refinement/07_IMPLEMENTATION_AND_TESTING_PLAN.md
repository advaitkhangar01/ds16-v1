# Document 7 — Implementation and Testing Plan
## Phased Implementation, Verification & Acceptance Criteria

---

### Phase 1 — Database & Configuration Foundation
- **Goal**: Apply database migration `030`, extend models and configuration endpoints.
- **Tasks**:
  1. Author `server/db/migrations/030_feasibility_and_timeline_refinements.sql` and corresponding down migration.
  2. Run migration on local PostgreSQL database `ds16`.
  3. Verify table columns, constraints, foreign keys, and existing project backfills.
  4. Extend `timeline_configurations` API (`server/routes/timeline.js`) to support `parking_floors`.
  5. Extend `project_area_statements` API (`server/routes/feasibility.js`) to accept and validate:
     - `building_use` (`'Residential' | 'Commercial'`)
     - `regular_tdr_factor` and `slum_tdr_factor`
     - `is_gunthewari` and `road_width_m` (strictly validated against `[9, 12, 15, 18, 24]`).
  6. Add statutory charge patch endpoint (`PATCH /api/projects/:projectId/feasibility/statutory/:chargeId`) for `is_enabled` and `rr_percentage`.

---

### Phase 2 — Area Statement Calculation Engine Enhancements
- **Goal**: Update authoritative calculations in `server/services/feasibilityEngine.js`.
- **Tasks**:
  1. Update `calculateAreaMetrics`:
     - Calculate Ancillary Area using building use: 80% if Commercial, 60% if Residential.
     - Dual TDR calculations: calculate Regular TDR area, Slum TDR area, and combined total TDR area.
     - Automatic 15% lobby calculation with override detection (`is_lobby_overridden`).
     - Calculate `area_for_1_unit = builtup_for_sale_sqm / no_of_units` with safe zero-unit handling.
     - Treat parking floors as non-FSI, non-saleable builtup.
  2. Remove client-side duplicated/hardcoded fallbacks in `AreaFeasibilityTab.jsx` (`recalculateLive`) to ensure authoritative consistency with backend calculations.

---

### Phase 3 — Financial Viability & Statutory Charge Refinements
- **Goal**: Refine statutory calculations and remove Amalgamation charges.
- **Tasks**:
  1. Update `calculateFinancialMetrics` in `server/services/feasibilityEngine.js`:
     - Calculate per-charge RR proportional amounts using each charge's independent `rr_percentage`.
     - Filter out any statutory charges where `is_enabled === false` or `is_deleted === true` from `totalStatutoryDemandA`.
     - Remove active calculation of Amalgamation Charges.
  2. Seed default statutory charges without Amalgamation charges for new projects.
  3. Support soft-deletion / archiving awaiting final user confirmation on permanent delete vs archive.

---

### Phase 4 — UI & Document Presentation Updates
- **Goal**: Update React components to reflect exact layouts and interaction specifications.
- **Tasks**:
  1. **Building Configuration (`TimelineSetup.jsx`)**: Add parking floors configuration (Basement 1, Basement 2, Stilt, Upper-floor parking).
  2. **Area Statement Form (`AreaStatementForm.jsx`)**:
     - Add Gunthewari toggle & road-width dropdown (9m, 12m, 15m, 18m, 24m) with rate feedback.
     - Add dual TDR inputs (Regular & Slum TDR).
     - Add Building Use selector (Residential 60% / Commercial 80%).
     - Add `No. Of Units` and `Area For 1 Unit` to floor rows.
     - Add auto 15% lobby calculation with `Auto 15%` / `Manual Override` badge and reset button.
  3. **Financial Viability Form (`FinancialViabilityForm.jsx`)**:
     - Add enable/disable checkbox per statutory charge row.
     - Add editable RR percentage per charge.
  4. **Document Preview (`FeasibilityDocumentPreview.jsx`)**:
     - Split into two distinct stacked tables: Table 1 (Plot Area Statement) and Table 2 (Permissible vs Proposed FSI Potential).
     - Update Floor-wise table to exact sequence: `Floor Level | Height (m) | P-Line Area | Lobby Area | Built-up for Sale | No. Of Units | Area For 1 Unit`.
  5. **Task List (`TimelineTaskList.jsx`)**: Verify zero cost-related details exposed.

---

### Phase 5 — Comprehensive Testing & Verification
- **Goal**: End-to-end verification across all 22 required testing scenarios.
- **Test Scenarios**:
  1. Project with Basement 1 and Basement 2 parking floors.
  2. Project with Stilt and Upper-floor parking.
  3. Project with both Regular and Slum TDR selected.
  4. Project with one statutory charge unchecked (verify row stays visible, excluded from total).
  5. Re-enable a previously unchecked statutory charge.
  6. Different RR percentages for different statutory charges.
  7. Commercial ancillary area at 80%.
  8. Residential ancillary area at 60%.
  9. Lobby default at 15% of P-Line area.
  10. Manual lobby override followed by unrelated edits.
  11. Manual lobby override followed by P-Line area change.
  12. Area For 1 Unit recalculation after changing unit count.
  13. Zero unit count handling (division by zero safety).
  14. Every supplied road-width TDR combination (9m, 12m, 15m, 18m, 24m).
  15. Unsupported road-width validation (e.g. 10m rejected).
  16. Gunthewari classification change and recalculation.
  17. Amalgamation charge exclusion from totals.
  18. Task List without cost details.
  19. Separate Plot Area and FSI Potential tables.
  20. Existing projects with saved data before migration (backward compatibility).
  21. Users with different DS16 roles (RBAC validation).
  22. Preview and exported document consistency.
- **Regression Command Execution**:
  - `cd server; npm test` (all 13 test suites must pass 100%).
  - `cd client; npm run build` (Vite production build must succeed with 0 errors).
