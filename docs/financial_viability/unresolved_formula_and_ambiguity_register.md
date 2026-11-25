# Unresolved Formula and Ambiguity Register

This document records all broken, ambiguous, conflicting, or incomplete formulas identified in the reference workbook `Sample Financial Viability Asolkar Sir.xlsx` (Sheet: `FINANCIAL VIABILITY`).

As mandated by DS16 implementation rules:
**Do not invent replacements or substitute arbitrary formulas for unresolved workbook items. Document them transparently.**

---

### Ambiguity 1: Broken Formula in Cost of Basement Construction
- **Workbook Cell**: `G40`
- **Formula in Workbook**: `=#REF!*5500`
- **Issue**: The cell reference for basement area was broken (likely due to a deleted or moved row in the `Area (SQ M)` worksheet).
- **Impact**: In Excel, this results in a `#REF!` cascade into total project development costs (`J43`).
- **DS16 Resolution**: Sourced directly from DS16 Building Configuration / Area Statement basement floors (`basement_area_sqm`). If a project has basement floors, Basement Cost = $\text{Basement Area} \times \text{Basement Rate}$ (with rate defaulting to configurable input).
- **Status**: Resolved & Documented.

---

### Ambiguity 2: Receipts Sum Range Omission (Excel Calculation Defect)
- **Workbook Cell**: `I53`
- **Formula in Workbook**: `=SUM(I50:J50)`
- **Issue**: Rows 50, 51, and 52 each represent a unit realization row (`I50: ₹6,09,11,401.14`, `I51: ₹6,09,11,401.14`, `I52: ₹6,09,11,401.14`). The author intended to sum all rows (`SUM(I50:I52)` = ₹18,27,34,203.42) but erroneously wrote `=SUM(I50:J50)`. Because cell `J50` is blank, the workbook's Total Receipts only accounted for row 50, understating revenue by 66.7%.
- **Impact**: Gross project receipts in cell `I53` and net profit in cell `D64` were severely distorted in the sample workbook.
- **DS16 Resolution**: In DS16, Total Receipts is calculated dynamically across all active salable unit rows ($\sum_{k=1}^N \text{Amount}_k$).
- **Status**: Resolved & Documented.

---

### Ambiguity 3: Plot Cost Rate Label vs Formula Conflict
- **Workbook Cell**: `H36` vs `J36`
- **Content in Workbook**:
  - Cell `H36` text label: `30,000 per sqm`
  - Cell `J36` formula: `=G36*50000` (where `G36 = 270`)
- **Issue**: The descriptive text explicitly states a benchmark rate of ₹30,000 per sq m, but the calculation formula multiplies the plot area by ₹50,000 per sq m.
- **Impact**: Causes a 66.7% discrepancy in land acquisition cost (₹81,00,000 vs ₹1,35,00,000).
- **DS16 Resolution**: DS16 does not hardcode ₹30,000 or ₹50,000. It provides an explicit `cost_of_plot_rate_per_sqm` assumption field (and optional lump-sum override `cost_of_plot`), allowing the user to specify the true acquisition rate.
- **Status**: Resolved & Documented.

---

### Ambiguity 4: Blank Summary Labels (Gross Savings, Net Savings, ROI, Initial Investment)
- **Workbook Cells**: `B54:I57`
- **Content in Workbook**:
  - `B54`: `4 | Gross Savings` (Columns C to I are completely empty)
  - `B55`: `5 | Net savings` (Columns C to I are completely empty)
  - `B56`: `6 | ROI` (Columns C to I are completely empty)
  - `B57`: `7 | Initial Investment` (Columns C to I are completely empty)
- **Issue**: The author created headings for these metrics but never entered any formula, expression, or value.
- **Impact**: Any formula claiming to be "from the workbook" for Gross Savings or Net Savings would be fabricated.
- **DS16 Resolution**:
  - Net Profit is calculated authoritatively using the workbook's explicit formula in cell `D64`: $\text{Net Profit} = \text{Total Receipts} - \text{Total Project Cost}$.
  - Standard financial ROI %: $(\text{Profit} / \text{Cost}) \times 100$ is categorized as a **Proposed Metric** and clearly distinguished from workbook formulas.
  - Gross Savings, Net Savings, and Initial Investment remain uncalculated until explicit business rules are provided.
- **Status**: Unresolved in Workbook; Categorized as Proposed / Pending Approval.

---

### Ambiguity 5: Extra Stamp Duty Text Reference
- **Workbook Cell**: `C34`, `G34`
- **Content in Workbook**: `C34: EXTRA STAMP DUTY ON POTENTIAL`, `G34: FROM ADVOCATE`
- **Issue**: There is no formula. The note indicates this fee is determined ad-hoc by a legal advocate.
- **DS16 Resolution**: Modeled as an optional conditional expense input (`extra_stamp_duty`), defaulting to ₹0.00 unless entered by the user.
- **Status**: Resolved as Conditional Input.

---

### Ambiguity 6: Scratch Calculation Columns (Columns M to S)
- **Workbook Cells**: `M60:S64`
- **Content in Workbook**:
  - `M60 = 3000 (area of plot)`, `M61 = 5000 (rates of plot)`, `M62 = M60 * M61` (₹1,50,00,000)
  - `O62 = 10000`, `P62 = 30`, `Q62 = O62 / P62` (333.33), `R62 = 12`, `S62 = Q62 * R62` (4000), `O63 = O62 - S62` (6000)
- **Issue**: These cells contain disconnected scratchpad calculations unrelated to the primary project numbers (plot area is 270 in cell C4, but 3000 in cell M60).
- **DS16 Resolution**: Excluded from authoritative DS16 calculation engine.
- **Status**: Documented as Scratch Artifacts.

---

### Ambiguity 7: Fixed 300 Sq Ft Super Built-Up Loading
- **Workbook Cells**: `E50:E52`
- **Formula in Workbook**: `=D50+300`
- **Issue**: The workbook adds a flat 300 sq ft loading to every unit carpet area. In standard architectural practice, loading is either a percentage (e.g. 25–35%) or varies by building typology.
- **DS16 Resolution**: `super_buildup_loading_sqft` is configurable per unit configuration, defaulting to 300.00 if user wishes to replicate the reference workbook, but not universally forced.
- **Status**: Resolved with Configurable Loading Rule.
