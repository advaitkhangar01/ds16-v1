# DS16 Area & Financial Feasibility Rebuild
## Document 05: Calculation Formula Register & Mathematical Proofs

**Project:** Design Studio 16 (DS16)  
**Module:** Project Details → Area & Financial Feasibility  
**Status:** Authoritative Calculation Register  
**Date:** November 2026

---

### 1. Area Statement & Development Potential Formulas

#### 1.1 Plotable Area (Net Development Plot)
$$\text{Plotable Area} = \max(0, \text{Plot Area} - \text{D.P. Deductions})$$

#### 1.2 Basic FSI Potential
$$\text{Permissible Basic FSI (sq m)} = \text{Plotable Area} \times \text{Basic FSI Factor (1.10)}$$

#### 1.3 Paid / Premium FSI Potential
$$\text{Permissible Paid FSI (sq m)} = \text{Plotable Area} \times \text{Paid FSI Factor (0.50)}$$

#### 1.4 Total TDR Potential & 50/50 Split (Section 4 Rule)
$$\text{Total TDR Factor} = \text{ROAD\_WIDTH\_TOTAL\_TDR\_MAP}[\text{Road Width}]$$
Where:
- $9\text{m road} \implies 0.40$
- $12\text{m road} \implies 0.65$
- $15\text{m road} \implies 0.80$
- $18\text{m road} \implies 0.90$
- $24\text{m road} \implies 1.15$

**Default Split:**
$$\text{Regular TDR Factor} = \frac{\text{Total TDR Factor}}{2}, \quad \text{Slum TDR Factor} = \text{Total TDR Factor} - \text{Regular TDR Factor}$$

**Override Remainder Rule:**
If Regular TDR is manually overridden to $R$:
$$\text{Effective Regular TDR} = \max(0, \min(\text{Total TDR Factor}, R))$$
$$\text{Derived Slum TDR} = \text{Total TDR Factor} - \text{Effective Regular TDR}$$
$$\text{Permissible Total TDR Area (sq m)} = \text{Plotable Area} \times \text{Total TDR Factor}$$

#### 1.5 Permissible Total Builtup & Permissible P-Line
$$\text{Permissible Total Builtup (sq m)} = \text{Basic FSI} + \text{Paid FSI} + \text{Permissible Total TDR}$$
$$\text{Permissible Ancillary (sq m)} = \text{Permissible Total Builtup} \times (\text{Commercial ? } 0.80 : 0.60)$$
$$\text{Total Permissible P-Line Area (sq m)} = \text{Permissible Total Builtup} + \text{Permissible Ancillary}$$

#### 1.6 Proposed Development Potential
$$\text{Proposed Basic FSI Area} = \text{Plotable Area} \times \text{Basic FSI Factor}$$
$$\text{Proposed Paid FSI Area} = \text{Plotable Area} \times \text{Paid FSI Factor}$$
$$\text{Proposed Regular TDR Area} = \text{Plotable Area} \times \text{Regular TDR Factor}$$
$$\text{Proposed Slum TDR Area} = \text{Plotable Area} \times \text{Slum TDR Factor}$$
$$\text{Proposed Total FSI Area} = \text{Basic FSI} + \text{Paid FSI} + \text{Regular TDR} + \text{Slum TDR}$$

#### 1.7 Floor-wise FSI Distribution & Mixed-Use Ancillary Area
For $N$ applicable habitable floors:
- If floor is unoverridden:
  $$\text{Floor FSI} = \frac{\text{Remaining Unoverridden FSI}}{N_\text{unoverridden}}$$
  (with exact cent-level rounding reconciliation such that $\sum \text{Floor FSI} = \text{Target Proposed FSI}$).
- For each floor, ancillary area depends strictly on floor usage:
  $$\text{Floor Ancillary Area} = \begin{cases} \text{Floor FSI} \times 0.80 & \text{if Usage} = \text{Commercial} \\ \text{Floor FSI} \times 0.60 & \text{if Usage} = \text{Residential} \end{cases}$$
$$\text{Floor P-Line Area} = \text{Floor FSI Area} + \text{Floor Ancillary Area}$$

#### 1.8 Reverse-Derivation from Overridden Floor P-Line
If an architect manually overrides a floor's P-Line area to $P_\text{override}$:
$$\text{Multiplier} = 1 + \text{Ancillary \%} = \begin{cases} 1.80 & \text{Commercial} \\ 1.60 & \text{Residential} \end{cases}$$
$$\text{Derived Floor FSI} = \frac{P_\text{override}}{\text{Multiplier}}, \quad \text{Derived Floor Ancillary} = P_\text{override} - \text{Derived Floor FSI}$$

#### 1.9 Lobby and Saleable Area (10 Mandatory Columns)
For each habitable floor:
1. **Floor Level:** `floor_name`
2. **Building Use:** `usage_type` ('Commercial' or 'Residential')
3. **Height:** `height_meters` (default: 3.00m residential, 3.30–3.60m commercial)
4. **FSI Area:** $\text{Floor FSI (sq m)}$
5. **Ancillary Area:** $\text{Floor Ancillary (sq m)}$
6. **P-Line Area:** $\text{Floor FSI} + \text{Floor Ancillary}$
7. **Lobby Area (15% Default):** $\text{Floor P-Line} \times 0.15$ (or overridden value)
8. **Built-up Area for Sale:** $\text{Floor P-Line} - \text{Floor Lobby Area}$
9. **Number of Units:** `no_of_units` (integer $\ge 1$)
10. **Area for 1 Unit:** $\frac{\text{Built-up Area for Sale}}{\text{Number of Units}}$

---

### 2. Occupancy Parking Calculation Formulas (UDCPR Table 8-B / 8-C)

#### 2.1 Commercial Parking Requirement
$$\text{Required Commercial Cars} = \left\lceil \frac{\text{Commercial Carpet Area (sq m)}}{100} \times 2 \right\rceil$$
$$\text{Required Commercial Two-Wheelers} = \left\lceil \frac{\text{Commercial Carpet Area (sq m)}}{100} \times 6 \right\rceil$$

#### 2.2 Residential Parking Requirement (Tenement Bands)
- Tenements $< 40\text{ sqm}$: 0 cars, $0.5$ two-wheelers per tenement.
- Tenements $40\text{ to }80\text{ sqm}$: $0.5$ cars per tenement, $1.0$ two-wheeler per tenement.
- Tenements $> 80\text{ sqm}$: $1.0$ car per tenement, $2.0$ two-wheelers per tenement.

#### 2.3 Visitor Parking (5%) & Authority Multiplier (0.90 for Nagpur)
$$\text{Base Cars} = \text{Comm Cars} + \text{Res Cars}, \quad \text{Base Two-Wheelers} = \text{Comm 2W} + \text{Res 2W}$$
$$\text{Total Required Cars} = \left\lceil (\text{Base Cars} \times 1.05) \times 0.90 \right\rceil$$
$$\text{Total Required Two-Wheelers} = \left\lceil (\text{Base Two-Wheelers} \times 1.05) \times 0.90 \right\rceil$$

---

### 3. Financial Viability Formulas & Cost Breakdown

#### 3.1 Benchmark Statutory Cost Norms
$$\text{Estimated Cost A} = \text{Effective Proposed P-Line} \times \text{Cost A Rate (₹15,000/sq m)}$$
$$\text{Estimated Cost B} = \text{Effective Proposed P-Line} \times \text{Cost B Rate (₹26,620/sq m)}$$

#### 3.2 Section A: Statutory Charges (NMC Demand)
1. `PLAN_REGISTRATION`: $\text{P-Line Area} \times 5.90$
2. `SECURITY_DEPOSIT`: $\min(0.01 \times \text{Estimated Cost A}, 75,000.00)$
3. `STACKING_CHARGES`: $\min(0.005 \times \text{Estimated Cost A}, 50,000.00)$
4. `ANCILLARY_CHARGES`: $\text{Total Proposed Ancillary Area} \times (10\% \times \text{RR Rate})$
5. `SEWER_CONNECTION`: $\text{P-Line Area} \times 2.50$
6. `DEVELOPMENT_CHARGES`: $\text{P-Line Area} \times (2\% \times \text{RR Rate})$
7. `PREMIUM_FSI`: $\text{Proposed Paid FSI Area} \times (40\% \times \text{RR Rate})$
8. `TREE_PLANTATION`: $\min\left(\frac{\text{P-Line Area}}{74.32} \times 500.00, 25,000.00\right)$
9. `HERITAGE_FUND`: $2\% \text{ of effective Development Charges}$
10. `LABOUR_WELFARE_CESS`: $1\% \text{ of Estimated Cost B}$
11. `TDR_LOADING_CHARGES`: $\text{Proposed Total TDR Area} \times (3\% \times \text{RR Rate})$
12. `LABOUR_WELFARE_PARKING`: Direct manual input or controlled override.
$$\text{Total Statutory Demand (Section A)} = \sum_{\text{enabled charges}} \text{Effective Charge Amount}$$

#### 3.3 Sections B through H Development Costs
- **Section B (Cost of TDR):**
  $$\text{Cost of TDR} = \text{Proposed Total TDR Area} \times \text{RR Rate} \times \text{TDR Purchase Factor (0.55)}$$
- **Section C (Minor Expenses & NOCs):**
  $$\text{Minor Expenses} = \sum (\text{BPMS} + \text{Airport NOC} + \text{Fire NOC} + \text{Legal} + \text{Misc})$$
- **Section D (Civil Construction):**
  $$\text{Civil Construction Cost} = \text{Effective Proposed P-Line Area} \times \text{Construction Rate (₹/sq m)}$$
- **Section E (Basement Construction):**
  $$\text{Basement Cost} = \text{Basement Area (sq m)} \times \text{Basement Rate (₹/sq m)}$$
- **Section F (Rent Compensation):**
  $$\text{Rent Cost} = \text{Tenements} \times \text{Monthly Rent} \times \text{Project Duration (Months)}$$
- **Section G (Stacked Car Parking):**
  $$\text{Stacked Parking Cost} = \text{Slots} \times \text{Cost per Slot (₹)}$$
- **Section H (Cost of Plot):**
  $$\text{Cost of Plot} = \begin{cases} \text{Lump-sum Amount (or override)} & \text{if Included in Cost} \\ 0.00 & \text{if Excluded (raw amount retained)} \end{cases}$$

#### 3.4 Total Project Cost, Receipts & Profitability
$$\text{Total Project Cost} = A + B + C + D + E + F + G + H + \text{Infrastructure} + \text{Interest}$$

**Developer Sales Receipts:**
For each salable unit typology:
$$\text{Unit Super Built-up (sq ft)} = (\text{Carpet Area (sq m)} \times 10.764) + \text{Loading (sq ft)}$$
$$\text{Unit Price (₹)} = \text{Unit Super Built-up} \times \text{Selling Rate (₹/sq ft)}$$
$$\text{Developer Units} = \text{Total Unit Count} - \text{Landowner Allocated Units}$$
$$\text{Developer Realization} = \text{Unit Price} \times \text{Developer Units}$$
$$\text{Total Expected Receipts} = \sum \text{Developer Realization (or Floor-wise Realizations)}$$

**Profitability Metrics:**
$$\text{Net Project Profit (₹)} = \text{Total Expected Receipts} - \text{Total Project Cost}$$
$$\text{Return on Investment (ROI \%)} = \frac{\text{Net Project Profit}}{\text{Total Project Cost}} \times 100$$
$$\text{Profit Margin (\%)} = \frac{\text{Net Project Profit}}{\text{Total Expected Receipts}} \times 100$$
