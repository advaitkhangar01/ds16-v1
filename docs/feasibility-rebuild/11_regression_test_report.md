# DS16 Area & Financial Feasibility Rebuild
## Document 11: Regression Test Execution Report

**Project:** Design Studio 16 (DS16)  
**Module:** Project Details → Area & Financial Feasibility  
**Execution Environment:** Node.js v20.19.0 / Jest v29.7.0  
**Execution Date:** November 2026  
**Final Status:** 100% Passing (51 of 51 tests passed)

---

### 1. Test Suite Summary

```text
PASS tests/tdrSplitAndOverrides.test.js
PASS tests/statutoryOverridesAndPlotRemoval.test.js
PASS tests/feasibilityCalculationsParity.test.js
PASS tests/equalPlineDistribution.test.js
PASS tests/manewadaBenchmark.test.js

Test Suites: 5 passed, 5 total
Tests:       51 passed, 51 total
Snapshots:   0 total
Time:        1.262 s
Ran all test suites matching tests/tdrSplitAndOverrides.test.js|tests/manewadaBenchmark.test.js|tests/equalPlineDistribution.test.js|tests/feasibilityCalculationsParity.test.js|tests/statutoryOverridesAndPlotRemoval.test.js.
```

---

### 2. Detailed Suite Breakdown

#### 2.1 Suite 1: `tests/tdrSplitAndOverrides.test.js` (14 Tests — PASS)
- `ROAD_WIDTH_TOTAL_TDR_MAP contains all prescribed regulatory road widths`: Verifies 9m (0.40), 12m (0.65), 15m (0.80), 18m (0.90), 24m (1.15).
- `Default 50/50 split across all road widths`: Verifies equal division into regular and slum halves.
- `Regular TDR override recalculates Slum TDR as exact remainder`: Verifies that overriding Regular TDR recalculates Slum TDR as `Total TDR - Regular TDR`.
- `Regular TDR override with zero (0) leaves full remainder to Slum TDR`: Verifies explicit zero regular TDR allocation.
- `Clamps Regular TDR when exceeding Total TDR and derives Slum TDR as 0`: Verifies boundary constraint.
- `calculateAreaMetrics respects Road Width and 50/50 TDR split in full area statements`: Verifies permissible and proposed potential.
- `calculateAreaMetrics respects Regular TDR override and derives Slum TDR remainder`: Verifies end-to-end area calculations with overrides.
- `Overrides Section B (Cost of TDR)`: Verifies calculated basis vs override and basis drift.
- `Overrides Section D (Civil Construction Cost) including explicit zero`: Verifies explicit 0 override on construction.
- `Overrides Section E (Basement Cost)`: Verifies basement override.
- `Overrides Section F (Rent / Relocation Compensation)`: Verifies tenant rent compensation override.
- `Overrides Section G (Stacked Car Parking Cost)`: Verifies mechanical parking override.
- `Overrides Section H (Cost of Plot) and verifies inclusion toggle`: Verifies lump-sum override and inclusion toggle.
- `Overrides Labour Welfare on Parking Area in statutory table`: Verifies parking labour cess override.

#### 2.2 Suite 2: `tests/manewadaBenchmark.test.js` (6 Tests — PASS)
- `BENCH-001`: Plot Baseline & Road Width Classification (1,101.140 sqm, 24m road, 1.15 TDR).
- `BENCH-002`: Development Potential & Primary FSI (Basic 1.10, Paid 0.50, TDR 1.15 -> 3,028.135 sqm).
- `BENCH-003`: Permissible vs. Proposed P-Line Disconnect (7,267.524 sqm permissible vs 4,072.080 sqm proposed).
- `BENCH-004`: Cost of Plot Lump-Sum & Financial Baseline (₹16,59,37,393.44 plot cost).
- `BENCH-005`: Multi-Unit & Multi-Floor Structural Integrity (6 levels, 4,072.080 sqm, residual diff 0.377 sqm).
- `BENCH-006`: Parking Requirements & Authority Multiplier (commercial carpet, residential tenements, 5% visitor, 0.90 Nagpur factor).

#### 2.3 Suite 3: `tests/equalPlineDistribution.test.js` (13 Tests — PASS)
- Cent-level rounding reconciliation across unoverridden floors ($\sum \text{Floor} = \text{Target}$).
- Reverse-derivation of floor FSI and Ancillary from overridden P-Line.
- Inconsistency detection when sum of overridden floors exceeds project target.
- 10 mandatory table columns verification.
- Mixed-use commercial (80%) and residential (60%) independent tracking.

#### 2.4 Suite 4: `tests/feasibilityCalculationsParity.test.js` (5 Tests — PASS)
- Mathematical parity between client-side `feasibilityCalculations.js` and server-side `feasibilityEngine.js`.
- Mixed-use dual ancillary calculation parity.
- Statutory demand parity.
- Financial viability ROI and Net Profit parity.

#### 2.5 Suite 5: `tests/statutoryOverridesAndPlotRemoval.test.js` (13 Tests — PASS)
- Cost of Plot Section H inclusion/exclusion toggle.
- Non-binding nature of plot acquisition rate per sqm.
- 12 statutory charges calculation basis.
- Basis drift detection when parameters change after override.

---

### 3. Client Build Verification

```text
> client@0.0.0 build
> vite build

vite v5.4.21 building for production...
✓ 2973 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                   1.07 kB │ gzip:   0.52 kB
dist/assets/index-Bc3F_wha.js   234.67 kB │ gzip:  76.75 kB
✓ built in 16.11s
```
Client build finished with **0 errors**.
