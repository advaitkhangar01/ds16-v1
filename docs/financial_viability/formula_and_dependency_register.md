# Formula and Dependency Register

This register documents every mathematical relationship in DS16 Financial Viability, categorized into:
1. **Existing Workbook Formulas** (Directly from `Sample Financial Viability Asolkar Sir.xlsx`)
2. **Verified DS16 Formulas** (Resolved engineering corrections for workbook defects)
3. **Newly Proposed Calculations** (Clearly demarcated; awaiting explicit user approval)

---

## 1. Existing Workbook Formulas (Authentic Reference)

### 1.1 FSI & Potential Factors
- **Total Permissible Potential**:
  $$\text{Total Potential (FSI)} = \text{Basic FSI (1.1)} + \text{Premium FSI (0.5)} + \text{TDR Factor (0.65)} = 2.25$$
  - *Workbook Reference*: Cell `G4 = D4 + E4 + F4`
  - *Inputs*: `statement.basic_fsi_factor`, `statement.paid_fsi_factor`, `statement.tdr_factor`
  - *Rounding*: 3 decimal places.

- **Proposed TDR Utilization Area**:
  $$\text{Proposed TDR Area } (m^2) = \text{Plot Area} \times \text{Proposed TDR Factor (0.545)}$$
  - *Workbook Reference*: Cell `F6 = C4 * 0.545`
  - *Inputs*: `statement.plot_area_sqm`, `statement.regular_tdr_factor`
  - *Rounding*: 2 decimal places.

### 1.2 Statutory & Municipal Demands (Section A — 12 Items)
All items derive from Ready Reckoner (RR) rate $R_{rr}$, Total Proposed P-Line area $A_{pline}$, Ancillary area $A_{anc}$, Paid FSI area $A_{paid}$, or TDR area $A_{tdr}$.

1. **Plan Registration Fees**:
   $$\text{Fee} = A_{pline} \times 5.90$$
   - *Workbook Reference*: Cell `H13 = E13 * G13` where `G13 = 5.9`
2. **Security Deposit**:
   $$\text{Deposit} = \min\big(1\% \times (A_{pline} \times \text{Cost-A Rate}), 75,000.00\big)$$
   - *Workbook Reference*: Cell `G14 = F14 * E14`, Cell `J14 = 75,000` cap.
   - *Cost-A Dependency*: Driven exclusively by `estimated_cost_a_rate` (₹15,000).
3. **Stacking Charges**:
   $$\text{Stacking} = \min\big(0.5\% \times (A_{pline} \times \text{Cost-A Rate}), 50,000.00\big)$$
   - *Workbook Reference*: Cell `G15 = 0.005 * E15`, Cell `J15 = 50,000` cap.
   - *Cost-A Dependency*: Driven exclusively by `estimated_cost_a_rate` (₹15,000).
4. **Ancillary Area Charges**:
   $$\text{Charges} = A_{anc} \times (10\% \times R_{rr})$$
   - *Workbook Reference*: Cell `G16 = (G10 * 0.1) * E16`
   - *RR Dependency*: 10% of RR rate per $m^2$ of ancillary area.
5. **Sewer Connection Charges**:
   $$\text{Charges} = A_{pline} \times 2.50$$
   - *Workbook Reference*: Cell `H17 = 2.5 * E17`
6. **Development Charges**:
   $$\text{Charges} = A_{pline} \times (2\% \times R_{rr})$$
   - *Workbook Reference*: Cell `G18 = (G10 * 0.02) * E18`
7. **Premium FSI Charges**:
   $$\text{Charges} = A_{paid} \times (40\% \times R_{rr})$$
   - *Workbook Reference*: Cell `G19 = (G10 * 0.4) * E19`
8. **Tree Plantation Deposit**:
   $$\text{Deposit} = \min\left(\frac{A_{pline}}{74.32} \times 500.00, 25,000.00\right)$$
   - *Workbook Reference*: Cell `F20 = E20 / 74.32`, Cell `H20 = 500 * F20`, max ₹25,000.
9. **Heritage Fund**:
   $$\text{Fund} = 2\% \times \text{Development Charges}$$
   - *Workbook Reference*: Cell `G21 = 0.02 * E21` where `E21 = J18` (Development Charges).
10. **Labour Welfare Cess**:
    $$\text{Cess} = 1\% \times (A_{pline} \times \text{Cost-B Rate})$$
    - *Workbook Reference*: Cell `G22 = 0.01 * E22` where `E22 = G9` (Total Cost B).
    - *Cost-B Dependency*: Driven exclusively by `estimated_cost_b_rate` (₹26,620).
11. **TDR Loading Charges**:
    $$\text{Charges} = A_{tdr} \times (3\% \times R_{rr})$$
    - *Workbook Reference*: Cell `G23 = (0.03 * G10) * E23`
12. **Labour Welfare on Parking Area**:
    $$\text{Parking Cess} = 1\% \times (A_{parking} \times \text{Cost-B Rate})$$
    - *Workbook Reference*: Cell `F25 = 225 * D9`, Cell `H25 = F25 * 0.01`.
    - *Cost-B Dependency*: Driven by parking area and `estimated_cost_b_rate` (₹26,620).

- **Total Statutory Demand (A)**:
  $$\text{Total Statutory Demand } (A) = \sum_{i=1}^{12} \text{Charge}_i \quad (\text{only enabled charges included})$$
  - *Workbook Reference*: Cell `J26 = SUM(J13:J25)`

### 1.3 Direct Development Costs (Sections B to H)
- **Cost of TDR (B)**:
  $$\text{Cost of TDR } (B) = A_{tdr} \times (55\% \times R_{rr})$$
  - *Workbook Reference*: Cell `J27 = (G10 * 0.55) * F6`
- **Minor Expenses & NOCs (C)**:
  $$\text{Total Expenses } (C) = \text{Minor Expenses} + \text{BPMS} + \text{Airport NOC} + \text{Fire NOC} + \text{Entertainment} + \text{Extra Stamp Duty} + \text{Legal}$$
  - *Workbook Reference*: Cell `J35 = SUM(J30:J34)`
- **Civil Construction Cost (D)**:
  $$\text{Civil Cost } (D) = A_{pline} \times \text{cost\_of\_construction\_rate}$$
  - *Workbook Reference*: Cell `G37 = J6 * 20000` (where ₹20,000 is manual rate `H37`).
- **Cost of Plot (H)**:
  $$\text{Plot Cost } (H) = \text{Plot Area} \times \text{cost\_of\_plot\_rate\_per\_sqm}$$
  - *Workbook Reference*: Cell `J36 = G36 * 50000`
- **Tenant Rent During Construction (F)**:
  $$\text{Rent Cost } (F) = \text{Tenements} \times \text{Rent/Month} \times \text{Months}$$
  - *Workbook Reference*: Cell `G41 = 15000 * 3 * 24` = ₹10,80,000
- **Stacked Parking Cost (G)**:
  $$\text{Parking Cost } (G) = \text{Stacked Slots} \times \text{Cost/Slot}$$
  - *Workbook Reference*: Cell `G42 = 10 * 200000` = ₹20,00,000
- **Total Project Development Cost**:
  $$\text{Total Cost} = A + B + C + D + E + F + G + H + \text{Infra} + \text{Interest}$$
  - *Workbook Reference*: Cell `J43 = J37 + J35 + J27 + J26 + J40 + J41 + J42 + J36`

### 1.4 Unit Realization & Profit
- **Super Built-Up Area per Unit**:
  $$\text{Super Built-Up } (ft^2) = \text{Carpet Area } (ft^2) + \text{Loading (300 } ft^2)$$
  - *Workbook Reference*: Cell `E50 = D50 + 300`
- **Unit Price**:
  $$\text{Unit Price } (₹) = \text{Super Built-Up } (ft^2) \times \text{Rate per } ft^2$$
  - *Workbook Reference*: Cell `H50 = E50 * G50`
- **Total Realization**:
  $$\text{Amount } (₹) = \text{Unit Price} \times \text{Unit Count}$$
  - *Workbook Reference*: Cell `I50 = H50 * F50`
- **Net Project Profit**:
  $$\text{Net Profit } (₹) = \text{Total Receipts} - \text{Total Project Cost}$$
  - *Workbook Reference*: Cell `D64 = D63 - D62` where `D63` is Receipts and `D62` is Project Cost.

---

## 2. Verified DS16 Formulas (Resolving Excel Defects)

| Defect / Anomaly in Excel | Excel Cell | Defect Description | Verified DS16 Formula | Status |
|:---|:---|:---|:---|:---|
| **Broken Basement Area Formula** | `G40` | Excel formula was `=#REF!*5500` due to missing cell link. | $\text{Basement Cost } (E) = \text{Basement Area } (m^2) \times \text{Basement Rate}$ | Verified & Active |
| **Receipts Sum Range Error** | `I53` | Excel had `=SUM(I50:J50)`, accidentally summing only the first unit row and omitting rows 51 & 52. | $\text{Total Receipts} = \sum_{k=1}^{N} \text{Amount}_k$ across all salable unit/floor rows. | Verified & Active |
| **Plot Cost Rate Mismatch** | `H36 vs J36` | Text label stated ₹30,000/sqm, but cell formula calculated with ₹50,000/sqm. | User specifies plot acquisition rate (or lump sum) explicitly. Default rate is non-hardcoded. | Verified & Active |
| **Amalgamation Charges Exclusion** | `B24:J24` | Excel included ₹200/sqm amalgamation charges. | Amalgamation charges excluded per approved DS16 requirements (REQ-J). | Retained Excluded |

---

## 3. Newly Proposed Calculations (Demarcated; Awaiting Approval)

These metrics are **NOT** defined by formulas in the reference workbook and are marked as non-authoritative until approved:

| Proposed Metric | Proposed Formula | Workbook Context | Status in DS16 |
|:---|:---|:---|:---|
| **Return on Investment (ROI %)** | $\text{ROI } (\%) = \left(\frac{\text{Net Profit}}{\text{Total Project Cost}}\right) \times 100$ | Workbook cell `B56` has text label `ROI` but empty cell value/formula. | **Proposed Metric (Non-Authoritative)** |
| **Profit Margin %** | $\text{Margin } (\%) = \left(\frac{\text{Net Profit}}{\text{Total Receipts}}\right) \times 100$ | Not present anywhere in the reference workbook. | **Proposed Metric (Non-Authoritative)** |
| **Gross Savings** | Pending business definition | Workbook cell `B54` has text label `Gross Savings` with empty cell value. | **Unresolved (Documented in Register)** |
| **Net Savings** | Pending business definition | Workbook cell `B55` has text label `Net savings` with empty cell value. | **Unresolved (Documented in Register)** |
| **Initial Investment** | Pending business definition | Workbook cell `B57` has text label `Initial Investment` with empty cell value. | **Unresolved (Documented in Register)** |
