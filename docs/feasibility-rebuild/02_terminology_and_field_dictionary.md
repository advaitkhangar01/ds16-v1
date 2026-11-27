# DS16 Area & Financial Feasibility Rebuild
## Document 02: Terminology Audit & Complete Field Dictionary

**Project:** Design Studio 16 (DS16)  
**Module:** Project Details → Area & Financial Feasibility  
**Status:** Authoritative Reference  
**Date:** November 2026

---

### 1. Purpose & Standards

This document establishes an unambiguous, architect-oriented terminology dictionary for the Design Studio 16 platform. It explicitly resolves historical ambiguities, conflations between rates and amounts, carpet vs. super built-up areas, permissible potential vs. proposed consumption, and calculated vs. overridden values.

---

### 2. Area Statement Terminology & Field Definitions

| Field / Concept | Database Column / Key | Unit of Measure | Precise Technical Definition | Distinction / Guardrail |
|---|---|---|---|---|
| **Plot Area** | `plot_area_sqm` | sq m | Gross surveyed or registered area of the land parcel. | Baseline for all development calculations. |
| **City Survey Area** | `city_survey_area_sqm` | sq m | Area recorded in official revenue records / PR card. | Informational baseline for revenue reconciliation. |
| **D.P. Deductions** | `dp_deductions_sqm` | sq m | Area surrendered or reserved for Development Plan roads, green buffers, or public amenities. | Subtracted from Plot Area to yield Plotable Area. |
| **Plotable Area** | `plotableAreaSqm` | sq m | Net developable plot area: `Plot Area - D.P. Deductions`. | Base upon which Basic FSI, Paid FSI, and TDR are multiplied. |
| **Road Width** | `road_width_m` | meters | Width of the access street (strictly 9m, 12m, 15m, 18m, or 24m). | Sole regulatory determinant of the Total TDR Factor. |
| **Total TDR Factor** | `total_tdr_factor` | factor (ratio) | Maximum regulatory TDR permissible based on road width: 9m=0.40, 12m=0.65, 15m=0.80, 18m=0.90, 24m=1.15. | Sourced from `ROAD_WIDTH_TOTAL_TDR_MAP`. Divided into Regular and Slum components. |
| **Regular TDR Factor** | `regular_tdr_factor` | factor (ratio) | Standard non-slum transferable development rights factor. Default: `Total TDR / 2`. | May be overridden by admin. Cannot exceed Total TDR. |
| **Slum TDR Factor** | `slum_tdr_factor` | factor (ratio) | Slum rehabilitation transferable development rights factor. Default: `Total TDR / 2`. | Read-only derived remainder: `Total TDR - Effective Regular TDR`. |
| **Basic FSI Factor** | `basic_fsi_factor` | factor (ratio) | Statutory non-premium Floor Space Index entitlement (typically 1.10). | Multiplied by Plotable Area to determine Basic FSI Area. |
| **Paid FSI Factor** | `paid_fsi_factor` | factor (ratio) | Premium FSI entitlement purchasable from local authority (typically 0.50). | Multiplied by Plotable Area; drives Premium FSI statutory charge (40% RR). |
| **Permissible P-Line Area** | `permissiblePlineTotalSqm`| sq m | Maximum statutory envelope: `(Basic + Paid + Permissible TDR) × (1 + Ancillary %)`. | Independent potential representing regulatory ceiling. Never conflated with proposed design. |
| **Proposed Total FSI Area**| `proposedTotalFsiSqm` | sq m | Total FSI consumption proposed by the architect: `Basic FSI + Paid FSI + Regular TDR + Slum TDR`. | Base area distributed across habitable floors. |
| **Proposed Ancillary Area**| `totalProposedAncillarySqm`| sq m | Additional permissible area: 60% for Residential floors, 80% for Commercial floors. | Drives Ancillary Area statutory charge (10% RR). |
| **Proposed P-Line Area** | `totalProposedPlineSqm` | sq m | Gross architectural building footprint envelope: `Proposed FSI Area + Proposed Ancillary Area`. | Sourced equally to floors; basis for Civil Construction Cost. |
| **Lobby Area** | `lobby_area_sqm` (per floor)| sq m | Common circulation, stairs, lifts, and corridors on each level. Default: 15% of floor P-Line. | Subtracted from P-Line to determine Built-up Area for Sale. |
| **Built-up Area for Sale** | `builtup_for_sale_sqm` | sq m | Net saleable floor builtup: `Floor P-Line Area - Floor Lobby Area`. | Area distributed among residential or commercial units. |
| **Carpet Area** | `carpet_area_sqm` (per unit)| sq m | Net usable floor area of an apartment or commercial unit (RERA carpet area). | Must never be confused with super built-up or gross pline. |
| **Super Built-up Area** | `super_buildup_area_sqft` | sq ft | Saleable commercial measurement: `(Carpet Area × 10.764) + Loading (typically 300 sq ft)`. | Multiplied by selling rate per sq ft to compute unit price. |

---

### 3. Financial Viability Terminology & Cost Sections

| Section / Item | Technical Identifier | Calculation Formula / Source | Admin Override Key | Business Meaning & Rules |
|---|---|---|---|---|
| **Ready Reckoner (RR) Rate** | `rr_rate_per_sqm` | Government published land stamp rate (₹/sq m) | None | Benchmark rate driving all percentage-based statutory charges. |
| **Estimated Cost A** | `estimatedCostA` | `Proposed P-Line (sq m) × Cost A Rate (₹15,000 default)` | None | Benchmark cost driving Security Deposit (1% capped at ₹75k) and Stacking Charges (0.5% capped at ₹50k). |
| **Estimated Cost B** | `estimatedCostB` | `Proposed P-Line (sq m) × Cost B Rate (₹26,620 default)` | None | Benchmark construction cost driving Labour Welfare Cess (1%). |
| **Section A: Statutory Charges** | `totalStatutoryDemandA` | Sum of all active NMC / Local Authority charges | `statutory_${charge_code}` | Mandatory municipal statutory fees for plan sanction. |
| **Section B: Cost of TDR** | `costOfTdrB` | `Proposed TDR Area (sq m) × RR Rate × TDR Factor (0.55)` | `cost_of_tdr` | Market acquisition cost for Regular and Slum TDR certificates. |
| **Section C: Minor Expenses** | `totalExpensesC` | Sum of BPMS, Fire, Airport, Legal, and Miscellaneous expenses | None | Direct project administrative and NOC expenditures. |
| **Section D: Civil Construction**| `costOfConstructionD` | `Proposed P-Line (sq m) × Construction Rate (₹/sq m)` | `cost_of_construction` | Core superstructure, core, shell, and civil building cost. |
| **Section E: Basement Cost** | `costOfBasementE` | `Basement Area (sq m) × Basement Rate (₹/sq m)` | `cost_of_basement` | Substructure, earth retention, and basement parking construction. |
| **Section F: Rent / Relocation** | `rentCostF` | `Tenements × Monthly Rent × Project Duration (Months)` | `rent_amount` | Tenant transit accommodation / owner displacement compensation. |
| **Section G: Stacked Parking** | `stackedParkingCostG` | `Stacked Parking Slots × Cost per Slot (₹)` | `stacked_parking_cost` | Mechanical car lift / puzzle parking system supply and installation. |
| **Section H: Cost of Plot** | `costOfPlotH` | Direct lump-sum input `cost_of_plot` (₹) | `cost_of_plot` | Direct land acquisition cost. Can be included/excluded via toggle. |
| **Total Project Cost** | `totalProjectCost` | `A + B + C + D + E + F + G + H + Infrastructure + Interest` | None | Total capital expenditure required to execute the project. |
| **Total Sales Realization** | `totalReceipts` | Sum of developer unit prices or floor-wise realizations | None | Gross anticipated revenue from selling residential & commercial stock. |
| **Net Project Profit** | `netProfit` | `Total Sales Realization - Total Project Cost` | None | Expected bottom-line developer profit before taxation. |
| **Return on Investment (ROI)** | `roiPct` | `(Net Profit / Total Project Cost) × 100` | None | Developer financial yield percentage. |
