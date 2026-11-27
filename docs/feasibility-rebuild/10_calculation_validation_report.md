# DS16 Area & Financial Feasibility Rebuild
## Document 10: Calculation Validation & Benchmark Reconciliation Report

**Project:** Design Studio 16 (DS16)  
**Module:** Project Details → Area & Financial Feasibility  
**Primary Reference Proposal:** Manewada Commercial + Residential Development Proposal  
**Benchmark Verification:** 100% Reconciled  
**Date:** November 2026

---

### 1. Executive Summary

The Manewada feasibility proposal serves as the primary real-world benchmark for the DS16 rebuild. This report provides a parameter-by-parameter, side-by-side mathematical reconciliation proving that the authoritative DS16 calculation engine reproduces every critical value from the proposal with exact decimal precision.

---

### 2. Side-by-Side Mathematical Reconciliation

| Parameter / Metric | Manewada Reference Value | DS16 Engine Calculated Value | Difference / Variance | Reconciliation Status |
|---|---|---|---|---|
| **Plot Area** | 1,101.140 sq m | 1,101.140 sq m | 0.000 sq m | **Exact Match** |
| **D.P. Deductions** | 0.000 sq m | 0.000 sq m | 0.000 sq m | **Exact Match** |
| **Plotable Area** | 1,101.140 sq m | 1,101.140 sq m | 0.000 sq m | **Exact Match** |
| **Road Width** | 24.00 meters | 24.00 meters | 0.00 meters | **Exact Match** |
| **Total TDR Factor** | 1.150 | 1.150 | 0.000 | **Exact Match** |
| **Regular TDR Factor** | 0.575 (50% default) | 0.575 (50% default) | 0.000 | **Exact Match** |
| **Slum TDR Factor** | 0.575 (50% default) | 0.575 (50% default) | 0.000 | **Exact Match** |
| **Basic FSI Factor** | 1.100 | 1.100 | 0.000 | **Exact Match** |
| **Paid FSI Factor** | 0.500 | 0.500 | 0.000 | **Exact Match** |
| **Basic FSI Area** | 1,211.254 sq m | 1,211.254 sq m | 0.000 sq m | **Exact Match** |
| **Paid FSI Area** | 550.570 sq m | 550.570 sq m | 0.000 sq m | **Exact Match** |
| **Permissible TDR Area** | 1,266.311 sq m | 1,266.311 sq m | 0.000 sq m | **Exact Match** |
| **Primary FSI Sum (B+C+D)**| 3,028.135 sq m | 3,028.135 sq m | 0.000 sq m | **Exact Match** |
| **Permissible P-Line Potential**| 7,267.524 sq m | 7,267.524 sq m | 0.000 sq m | **Exact Match** |
| **Residential Ancillary (60%)**| 1,816.881 sq m | 1,816.881 sq m | 0.000 sq m | **Exact Match** |
| **Commercial Ancillary (80%)** | 2,422.508 sq m | 2,422.508 sq m | 0.000 sq m | **Exact Match** |
| **Proposed Floor-wise Sum** | 4,072.080 sq m | 4,072.080 sq m | 0.000 sq m | **Exact Match** |
| **Benchmark Residual Diff** | 0.377 sq m | 0.377 sq m | 0.000 sq m | **Exact Match** |
| **Ready Reckoner (RR) Rate** | ₹24,340.00 / sq m | ₹24,340.00 / sq m | ₹0.00 | **Exact Match** |
| **Cost A Rate** | ₹15,000.00 / sq m | ₹15,000.00 / sq m | ₹0.00 | **Exact Match** |
| **Cost B Rate** | ₹26,620.00 / sq m | ₹26,620.00 / sq m | ₹0.00 | **Exact Match** |
| **Cost of Plot (Lump-sum)** | ₹16,59,37,393.44 | ₹16,59,37,393.44 | ₹0.00 | **Exact Match** |
| **Parking Commercial Cars** | 2 slots / 100 sqm | 2 slots / 100 sqm | 0 slots | **Exact Match** |
| **Parking Authority Multiplier**| 0.90 (Nagpur NMC/NIT) | 0.90 (Nagpur NMC/NIT) | 0.00 | **Exact Match** |

---

### 3. Key Regression Learnings

1. **Permissible vs. Proposed Disconnect:** The Manewada reference documented a permissible ceiling of $7,267.524\text{ sq m}$, but proposed a structural footprint of $4,072.080\text{ sq m}$ across 6 levels. DS16 now strictly segregates maximum potential from actual proposed utilization.
2. **Dual Ancillary Baseline:** The Manewada proposal calculated historical potential by applying both 60% and 80% to the undivided primary FSI base ($3,028.135\text{ sq m}$). DS16 preserves this as `sourceUnallocatedPermissiblePlineSqm` while calculating actual floor-by-floor ancillary areas based on each floor's designated use.
3. **Cost of Plot Inclusion:** Manewada recorded a land acquisition cost of ₹16,59,37,393.44. In DS16, this is modeled as an explicit lump-sum cost line in Section H with an on/off inclusion toggle, preventing improper inflation of construction ROI when land is already owned or equity-funded.
