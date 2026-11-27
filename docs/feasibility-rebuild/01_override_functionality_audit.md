# DS16 Area & Financial Feasibility Rebuild
## Document 01: Override Functionality Audit & Repair Register

**Project:** Design Studio 16 (DS16)  
**Module:** Project Details → Area & Financial Feasibility  
**Status:** 100% Repaired & Verified  
**Date:** November 2026

---

### 1. Executive Summary

A comprehensive audit of the previous implementation revealed why override controls were previously reported as "non-functional" or incomplete:
1. **Missing UI Triggers:** Sections B (Cost of TDR), D (Civil Construction), E (Basement Cost), F (Rent Compensation), and G (Stacked Parking) had no Override or Reset buttons in `FinancialViabilityForm.jsx`.
2. **Exclusion of `0` Values:** Project-level P-Line override and financial override handlers used `if (parsed > 0)` or `if (val)`, which silently rejected `0` (e.g. for turnkey contracts or zero plot cost).
3. **Missing Statutory Inputs:** `Labour Welfare on Parking Area` had no input or override handling in the statutory table, causing calculation mismatch.
4. **Hardcoded TDR Display:** Regular and Slum TDR factors were rendered as read-only static text with no override input or reset to the 50/50 split.
5. **State Synchronization Lag:** Overrides saved to the backend did not immediately update local component state until a full page reload or refetch completed.

All 5 root causes have been systematically repaired across the database, backend routes, calculation engines, and React UI forms.

---

### 2. Comprehensive Inventory of Override Controls

The table below catalogs every single override control across the entire Area & Financial Feasibility domain:

| Item / Section | Override Key | UI Component | Modal / Input Type | Calculated Basis | Override Lifecycle | Reset Mechanism |
|---|---|---|---|---|---|---|
| **Regular TDR Factor** | `regular_tdr_factor` | `AreaStatementForm.jsx` | Inline numeric input with Override badge | Default 50% of Total TDR (from Road Width) | Sets `is_regular_tdr_overridden: true`. Recalculates Slum TDR as remainder. Clamps to Total TDR if exceeded. | "Reset (50%)" button resets to `Total TDR / 2` and clears override flag. |
| **Project Total Proposed P-Line** | `total_proposed_pline_override_sqm` | `AreaStatementForm.jsx` | Dedicated Project Override Modal | `(Basic + Paid + TDR) × (1 + Ancillary)` | Redistributes overridden target equally across habitable floors with cent reconciliation. Allows explicit `0`. | "Reset to Calculated" button clears override in database and restores engine target. |
| **Floor P-Line Area** | `pline_area_sqm` (per floor) | `AreaStatementForm.jsx` (Table Col 6) | Inline numeric table input | Equal floor share of project P-Line | Sets `is_pline_overridden: true`. Reverse-derives floor FSI and Ancillary based on floor use. | "Reset to Equal Share" button (Refresh icon) restores floor to equal share. |
| **Floor Lobby Area** | `lobby_area_sqm` (per floor) | `AreaStatementForm.jsx` (Table Col 7) | Inline numeric table input | 15% of Floor P-Line Area | Sets `is_lobby_overridden: true`. Recalculates Built-up for Sale = P-Line - Lobby. | "Reset to 15% default" button restores 15% default. |
| **Cost of TDR (Section B)** | `cost_of_tdr` | `FinancialViabilityForm.jsx` | Controlled Override Modal Dialog | `Proposed TDR × RR Rate × TDR Factor (0.55)` | Saves to `financial.overrides['cost_of_tdr']`. Sets effective cost to override. Flags drift if basis changes > ₹1. | "Reset" button calls `POST /financial/overrides/reset` and restores calculated amount. |
| **Civil Construction (Section D)** | `cost_of_construction` | `FinancialViabilityForm.jsx` | Controlled Override Modal Dialog | `Proposed P-Line × Construction Rate` | Saves to `financial.overrides['cost_of_construction']`. Supports explicit `0`. Tracks approved demand note/reason. | "Reset" button restores `Proposed P-Line × Rate`. |
| **Basement Cost (Section E)** | `cost_of_basement` | `FinancialViabilityForm.jsx` | Controlled Override Modal Dialog | `Basement Area × Basement Rate` | Saves to `financial.overrides['cost_of_basement']`. Updates Section E effective cost. | "Reset" button restores calculated area × rate. |
| **Rent / Relocation (Section F)** | `rent_amount` | `FinancialViabilityForm.jsx` | Controlled Override Modal Dialog | `Tenements × Rate/Tenement/Mo × Months` | Saves to `financial.overrides['rent_amount']`. Updates Section F effective cost. | "Reset" button restores calculated amount. |
| **Stacked Parking (Section G)** | `stacked_parking_cost` | `FinancialViabilityForm.jsx` | Controlled Override Modal Dialog | `Slots × Cost/Slot` | Saves to `financial.overrides['stacked_parking_cost']`. Updates Section G effective cost. | "Reset" button restores calculated amount. |
| **Cost of Plot (Section H)** | `cost_of_plot` | `FinancialViabilityForm.jsx` | Controlled Override Modal Dialog | Direct lump-sum input `cost_of_plot` | Saves to `financial.overrides['cost_of_plot']`. Supports inclusion toggle (`is_cost_of_plot_included`). | "Reset" button restores direct input `cost_of_plot`. |
| **Statutory Charges (12 Items)** | `statutory_${charge_code}` | `FinancialViabilityForm.jsx` (Table Col 6) | Controlled Override Modal Dialog | Specific regulatory formula (RR %, Cost A %, etc.) | Saves to `financial.overrides['statutory_${code}']`. Replaces calculated amount in Total Demand A. Detects basis drift. | "Reset" button calls reset route, removing override and re-enabling formula calculation. |
| **Labour Welfare on Parking Area** | `statutory_LABOUR_WELFARE_PARKING` | `FinancialViabilityForm.jsx` | Inline input + Controlled Override Modal | Manual entered amount or override | Saves to `financial.overrides['statutory_LABOUR_WELFARE_PARKING']`. Sourced into Total Demand A. | "Reset" button clears override and restores manual baseline. |

---

### 3. Override Lifecycle & Data Integrity Guarantees

Every override in DS16 strictly adheres to the 5-phase lifecycle:
1. **Display:** When no override exists, the interface displays the mathematically calculated value with a neutral label.
2. **Initiation:** Clicking "Admin Override" opens a controlled modal displaying the exact engine-calculated basis value (`overrideBasisVal`) and prompts for the new override amount and justification reason.
3. **Persistence:** The override payload `{ key, override_val, calculated_basis_val, reason }` is persisted to `project_financial_viabilities.overrides` JSONB via `PUT /api/projects/:projectId/feasibility/financial/overrides`. The API strictly validates that `override_val` is a non-negative number (`parsedVal >= 0`).
4. **Drift Detection:** If project parameters (e.g., plot area, road width, ready reckoner rate) change after an override has been saved, the engine automatically detects that `Math.abs(currentCalculated - calculated_basis_val) > 1.0` and flags `has_basis_drift: true`. The UI immediately surfaces an amber "Basis Drift" warning badge, alerting architects that the baseline has shifted.
5. **Reset:** Clicking "Reset" executes `POST /api/projects/:projectId/feasibility/financial/overrides/reset`, removing the key from `overrides`, restoring the authoritative engine calculation immediately, and syncing component state.
