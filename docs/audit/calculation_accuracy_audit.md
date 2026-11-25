# DS16 — Calculation Accuracy & Formula Traceability Audit (`calculation_accuracy_audit.md`)

**Audit Date:** 2026-11-26  
**Scope:** `server/services/feasibilityEngine.js`, `server/services/timelineGenerator.js`, `server/services/buildingHierarchyService.js`, `server/utils/payroll.js`, `server/utils/salaryEngine.js`, `server/utils/attendanceRecalculator.js`, `server/routes/invoices.js`, `server/routes/monthlyClose.js`, `server/routes/finances.js`, and `client/src/components/projects/feasibility/`.

---

## 1. DS16 Area Statement & Financial Viability Checklist

| Check | Status | Evidence & Notes |
|---|---|---|
| Permissible & Proposed P-Line calculated independently | **Backend: PASS / Frontend: FAIL** | `feasibilityEngine.js:237,263-269,318-326` uses `tdr_factor` (default `0.65`) for Permissible and `regular + slum` for Proposed. `AreaFeasibilityTab.jsx:175,178` conflates them. |
| Residential Ancillary 60% rule | **PASS** | `feasibilityEngine.js:244` (`resAncillaryPct = 0.60`). |
| Commercial Ancillary 80% rule | **PASS** | `feasibilityEngine.js:245` (`commAncillaryPct = 0.80`). |
| Mixed-use preserves separate Res & Comm components | **PARTIAL FAIL** | `distributeFsiAndAncillary()` separates per floor (`feasibilityEngine.js:115-125,365-400`), but backward-compat alias `proposedAncillaryResSqm` (`L542`) applies `0.60` to total builtup; `AreaFeasibilityTab.jsx:109-114` & UI labels ignore `Mixed Use`. |
| Regular & Slum TDR from road width & plot classification; only required TDR used | **PARTIAL FAIL** | `ROAD_WIDTH_TDR_MAP` (`feasibilityEngine.js:12-18`) is enforced in `feasibility.js:190-196`, **but** `proposedTdrSqm` (`L276`) always sums both Regular + Slum TDR regardless of `is_gunthewari` or actual FSI requirement. |
| Floor-wise proposed P-Line equal-distribution rule | **PASS** | `distributeFsiAndAncillary()` (`feasibilityEngine.js:98-196`) distributes remaining FSI equally with cent-level rounding reconciliation. |
| Lobby 15% of P-Line default + manual override | **PASS** | `feasibilityEngine.js:404-410` (`pline * 0.15`, preserves `is_lobby_overridden`). |
| Built-up for Sale & Area for 1 Unit formulas | **Backend: PASS / Frontend: FAIL** | `sale = max(0, pline - lobby)`, `areaFor1Unit = round4(sale / noOfUnits)` (`feasibilityEngine.js:413-428`). Frontend `AreaFeasibilityTab.jsx:339` rounds to 2 decimals. |
| Financial Viability consumes Area Statement data | **PASS** | `calculateFinancialMetrics()` (`feasibilityEngine.js:605-619`) reads `areaMetrics` directly without recreating floors. |
| Statutory charges use individual RR % and bases | **PARTIAL FAIL** | `ANCILLARY_CHARGES` (10%), `DEVELOPMENT_CHARGES` (2%), `PREMIUM_FSI` (40%), `TDR_LOADING_CHARGES` (3%) use their respective bases (`L629-735`), **but** `HERITAGE_FUND` (`L662-665`) does not reference `DEVELOPMENT_CHARGES` effective amount. |
| Excluded statutory charges excluded from totals | **PASS** | `L698-702` filters `!item.is_deleted && item.is_enabled !== false`. |
| Manual overrides preserve original calculated values | **PASS** | `overrides` stores `calculated_amount` & `calculated_basis_val`, flagging `has_basis_drift` (`L675-696`). |
| Source changes invalidate/recalculate dependent metrics | **PARTIAL** | `GET /feasibility` recalculates statelessly, but `PUT`/`PATCH` endpoints do not return updated metrics. |

---

## 2. Formula Traceability Matrix

| Output Metric | Input → Formula → Backend Function → Stored / API → Frontend | Mismatch Flag |
|---|---|---|
| `plotableAreaSqm` | `plot_area_sqm - dp_deduction_sqm` → `calculateAreaMetrics` (`feasibilityEngine.js:260`) → API `areaMetrics.plotableAreaSqm` → `AreaFeasibilityTab.jsx:97` | **MISMATCH:** Frontend also subtracts `existing_builtup_area_sqm` |
| `permissiblePlineTotalSqm` | `(basicFsi + paidFsi + tdr_factor) * plotable` × `(1 + res/commPct)` → `calculateAreaMetrics` (`L263-269,318-326`) → `AreaFeasibilityTab.jsx:178` | **MISMATCH:** Frontend sets equal to `proposedPline` |
| `proposedTdrSqm` | `(regularTdrFactor + slumTdrFactor) * plotable` → `calculateAreaMetrics` (`L274-276`) | **DEFECT:** Always sums both TDRs regardless of plot classification or FSI need |
| `area_for_1_unit` | `round4(builtup_for_sale_sqm / no_of_units)` → `calculateAreaMetrics` (`L425`) → `AreaFeasibilityTab.jsx:339` | **MISMATCH:** Frontend rounds to 2 decimals |
| `HERITAGE_FUND` | `0.02 * devCharge` → `calculateFinancialMetrics` (`feasibilityEngine.js:662-665`) | **DEFECT:** Uses `effectivePlineSqm * 0.02 * rrRate` instead of `DEVELOPMENT_CHARGES` effective amount |
| `totalCost` (Viability) | `demandA + infra + extraStamp + advocate + tdrPurchase + construction + interest` → `calculateFinancialMetrics` (`L801`) → `AreaFeasibilityTab.jsx:227` | **MISMATCH:** Frontend omits `cost_of_infrastructure` & `interest_amount` |
| `remainingBalance` (Invoice) | `totalAmount - tdsAmount - finalReceived` → `invoices.js:775,805` → `invoices.js:841` | **DEFECT:** Response at `L841` omits `tdsAmount` |
| `pending` Receivables (Close) | `SUM(GREATEST(amount - tdsAmount - received_amount, 0))` → `finances.js:503` vs `monthlyClose.js:74` | **DEFECT:** `monthlyClose.js:74` omits `tdsAmount` |
| `autoCheckout` `late_minutes` | `CASE WHEN is_late THEN late_minutes ELSE 0 END` → `attendance.js:64-66,123,136` | **DEFECT:** `a.is_late` missing from `SELECT`, always zeroes `late_minutes` |

---

## 3. Calculation Findings

### `CALC-001` — `AreaFeasibilityTab.jsx` Diverges from Backend `feasibilityEngine.js` on 6 Formulas
- **Severity:** `HIGH` | **Classification:** Confirmed defect
- **Affected File:** `client/src/components/projects/feasibility/AreaFeasibilityTab.jsx:97,109-114,175-183,203,213-227,339,357-364`
- **Observed Behaviour:** Live preview (`recalculateLive`, `handleUpdateFloor`, `handleUpdateStatutoryCharge`) subtracts `existing_builtup_area_sqm` from plotable area, overwrites `permissiblePlineTotalSqm` with `proposedPline`, ignores `Mixed Use` 80% commercial split, omits `extra_stamp_duty`/`advocate_fees`/`cost_of_infrastructure`/`interest_amount`, and rounds `area_for_1_unit` to 2 decimals instead of 4.
- **Expected Behaviour:** UI live preview must match `feasibilityEngine.js` identically or consume backend-recalculated responses.
- **Recommended Correction:** Return recalculated `areaMetrics` & `financialMetrics` from `feasibility.js` `PUT`/`PATCH` endpoints and align `recalculateLive` or remove duplicate client math.

### `CALC-002` — `HERITAGE_FUND` Ignores `DEVELOPMENT_CHARGES` Effective/Overridden Amount
- **Severity:** `MEDIUM` | **Classification:** Confirmed defect
- **Affected File:** `server/services/feasibilityEngine.js:662-665`
- **Observed Behaviour:** `HERITAGE_FUND` computes `effectivePlineSqm * 0.02 * rrRate` directly (with `rr_percentage` defaulting to `null`) instead of `0.02 * developmentChargeEffectiveAmount`.
- **Expected Behaviour:** `HERITAGE_FUND` should derive from the actual `DEVELOPMENT_CHARGES` amount (or document if it is strictly 2% of `effectivePlineSqm * rrRate` independent of `DEVELOPMENT_CHARGES` overrides).
- **Recommended Correction:** Compute `DEVELOPMENT_CHARGES` first and pass its `effective_amount` into `HERITAGE_FUND`.

### `CALC-003` — Regular + Slum TDR Both Automatically Summed Regardless of Plot Classification or Need
- **Severity:** `HIGH` | **Classification:** Probable defect requiring business clarification
- **Affected Files:** `server/services/feasibilityEngine.js:223-225,274-276`, `server/routes/feasibility.js:207-210`
- **Observed Behaviour:** Any valid `road_width_meters` populates and sums both `regularTdrFactor` and `slumTdrFactor` into `proposedTdrSqm`, even for non-Slum/non-Gunthewari plots or when full TDR is not required.
- **Expected Behaviour:** Per DS16 rules, Regular and Slum TDR should be independently controlled by plot classification/selection and only required TDR should be utilised for proposed FSI.
- **Recommended Correction:** Confirm with stakeholders whether `regular_tdr_factor` and `slum_tdr_factor` should be gated by plot classification / explicit toggles rather than unconditionally summed.

### `CALC-004` — Falsy-Zero (`|| default`) Overwrites Explicit `0` Inputs Across Engines and Routes
- **Severity:** `MEDIUM` | **Classification:** Confirmed defect
- **Affected Files:** `server/services/feasibilityEngine.js:237,257,402,825-828`, `server/routes/feasibility.js:426,743-746,792-795`, `server/routes/timeline.js:400`, `server/routes/projects.js:42`, `server/routes/documents.js:529`
- **Observed Behaviour:** Using `parseFloat(val) || default` or `val || null` silently converts valid `0` values (`tdr_factor = 0`, `no_of_units = 0`, `masonry_lag_days = 0`, `area_sq_ft = 0`, `amount = 0`) into non-zero defaults or `NULL`.
- **Expected Behaviour:** Use nullish checks (`val !== undefined && val !== null && val !== '' ? Number(val) : default`).
- **Recommended Correction:** Replace `|| default` with explicit null/undefined/NaN helper `numOrDefault(val, defaultVal)`.

### `CALC-005` — Auto-Checkout Always Zeroes `late_minutes` & `is_late`
- **Severity:** `HIGH` | **Classification:** Confirmed defect
- **Affected File:** `server/routes/attendance.js:64-66,123,136`
- **Observed Behaviour:** `autoCheckoutPendingRecords` omits `a.is_late` from its `SELECT` query (`L64-66`). Thus `r.is_late` (`L123`) is `undefined`, causing `CASE WHEN $4::boolean THEN late_minutes ELSE 0 END` (`L136`) to wipe `late_minutes` to `0` and `is_late` to `null` for every employee who forgets to check out.
- **Expected Behaviour:** Preserve `a.is_late` and `a.late_minutes` on auto-checkout.
- **Business Impact:** Employees who are late and fail to check out evade late-penalty deductions in payroll.
- **Recommended Correction:** Add `a.is_late` to the `SELECT` list at `attendance.js:64-66`.

### `CALC-006` — Invoice `remainingBalance` & Monthly Close `pending` Omit `tdsAmount`
- **Severity:** `HIGH` | **Classification:** Confirmed defect
- **Affected Files:** `server/routes/invoices.js:841`, `server/routes/monthlyClose.js:74`
- **Observed Behaviour:** `POST /api/invoices/:id/record-payment` returns `remainingBalance: Math.max(0, totalAmount - finalReceived)` without subtracting `tds`, contradicting `L775` and `L805`. `monthlyClose.js:74` computes `GREATEST(amount - received_amount, 0)` without subtracting `tdsAmount`, contradicting `finances.js:503`.
- **Expected Behaviour:** Both must subtract `COALESCE((tax_details->>'tdsAmount')::numeric, 0)` consistently.
- **Recommended Correction:** Subtract `tds` in `invoices.js:841` and `monthlyClose.js:74`.

### `CALC-007` — `PUT /api/accounting/payroll/employees/:id` Overwrites Manual Payroll Overrides
- **Severity:** `HIGH` | **Classification:** Confirmed defect
- **Affected File:** `server/routes/accounting.js:275-307`
- **Observed Behaviour:** Updating an employee's `base_salary` recalculates and overwrites existing `payroll` rows for the current month without checking `is_manual_override = TRUE` (unlike `monthlyClose.js:511-522`).
- **Expected Behaviour:** Preserve `is_manual_override = TRUE` payroll records (or require explicit override reset).
- **Recommended Correction:** Add `AND COALESCE(is_manual_override, FALSE) = FALSE` to `accounting.js:300-305`.
