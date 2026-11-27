# DS16 Area & Financial Feasibility Rebuild
## Document 08: Test Strategy & Verification Matrix

**Project:** Design Studio 16 (DS16)  
**Module:** Project Details → Area & Financial Feasibility  
**Status:** 100% Pass Rate Across All Suites  
**Date:** November 2026

---

### 1. Test Architecture & Quality Objectives

The test strategy for the Area & Financial Feasibility rebuild guarantees:
1. **Mathematical Accuracy:** Every formula reconciles to the exact decimal against real-world approved proposals.
2. **Client-Server Parity:** Zero mathematical drift between backend calculations (`feasibilityEngine.js`) and client live calculation (`feasibilityCalculations.js`).
3. **Override Integrity:** All overrides (TDR, Cost of Plot, Civil Construction, Basement, Rent, Stacked Parking, Statutory Items) allow explicit zero, detect basis drift, and support clean reset.
4. **Regulatory Conformance:** Road widths, TDR 50/50 splits, UDCPR Table 8-B/8-C parking, and Gunthewari restrictions are strictly validated.

---

### 2. Test Suite Inventory

| Test Suite | File Path | Focus & Coverage | Test Count | Status |
|---|---|---|---|---|
| **Manewada Benchmark** | `server/tests/manewadaBenchmark.test.js` | Full end-to-end regression against the primary reference proposal: 1,101.140 sqm plot, 24m road, Basic FSI 1.10, Paid FSI 0.50, Source TDR 1.15, Primary FSI 3,028.135 sqm, Permissible P-Line 7,267.524 sqm, Cost of Plot ₹16,59,37,393.44, UDCPR parking. | 6 tests | **PASS** |
| **Equal P-Line Distribution** | `server/tests/equalPlineDistribution.test.js` | Equal FSI & P-Line distribution across habitable floors with cent-level rounding reconciliation, reverse-derivation of overridden floor P-Line, mixed-use commercial (80%) vs residential (60%) ancillary tracking, and 10 mandatory table columns. | 13 tests | **PASS** |
| **Calculation Parity** | `server/tests/feasibilityCalculationsParity.test.js` | Verifies that client-side `feasibilityCalculations.js` produces identical results to server-side `feasibilityEngine.js` across area statements, mixed-use ancillary, and financial metrics. | 5 tests | **PASS** |
| **Statutory Overrides & Plot Toggle** | `server/tests/statutoryOverridesAndPlotRemoval.test.js` | Verifies Cost of Plot Section H inclusion/exclusion toggle, removal of plot acquisition rate derivation, basis drift detection on statutory charges, and 12 statutory items. | 13 tests | **PASS** |
| **TDR Split & Domain Overrides** | `server/tests/tdrSplitAndOverrides.test.js` | Verifies 50/50 TDR split across all 5 road widths (9m, 12m, 15m, 18m, 24m), Regular TDR manual override, Slum TDR remainder calculation, clamping of exceedances, and override buttons across Sections B, D, E, F, G, H including explicit 0. | 14 tests | **PASS** |

**Total:** 5 test suites, 51 automated tests, **51 passing (100% success rate)**.

---

### 3. Frontend Production Build Verification

- **Command:** `npm run build` (executed in `client/` using Vite v5.4.21)
- **Result:** Completed with **0 errors**.
- **Output:** Built production bundle (`dist/`) in 16.11 seconds.
