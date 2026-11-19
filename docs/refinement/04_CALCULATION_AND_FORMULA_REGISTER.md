# Document 4 — Calculation and Formula Register
## Single Authoritative Implementation: `server/services/feasibilityEngine.js`

This register documents all area, FSI, TDR, ancillary, lobby, and statutory calculations to ensure zero divergence between the backend engine, frontend preview, and exported documents.

---

### 1. Plot & FSI Calculations

#### Formula 1.1: Net Plotable Area
- **Equation**:
  $$\text{Plotable Area (sq m)} = \max(0, \text{Plot Area} - \text{D.P. Deductions})$$
- **Input Fields**: `statement.plot_area_sqm`, `statement.dp_deductions_sqm`
- **Output Field**: `areaMetrics.plotableAreaSqm`
- **Validation**: Cannot be negative.

#### Formula 1.2: Basic Permissible FSI Area
- **Equation**:
  $$\text{Basic FSI Area (sq m)} = \text{Plotable Area} \times \text{Basic FSI Factor}$$
- **Default Factor**: $1.10$
- **Input Fields**: `plotableAreaSqm`, `statement.basic_fsi_factor`
- **Output Field**: `areaMetrics.permissibleFsiSqm` / `areaMetrics.proposedBasicFsiSqm`

#### Formula 1.3: Paid FSI Area
- **Equation**:
  $$\text{Paid FSI Area (sq m)} = \text{Plotable Area} \times \text{Paid FSI Factor}$$
- **Default Factor**: $0.50$
- **Input Fields**: `plotableAreaSqm`, `statement.paid_fsi_factor`
- **Output Field**: `areaMetrics.permissiblePaidFsiSqm` / `areaMetrics.proposedPaidFsiSqm`

---

### 2. Dual TDR & Gunthewari Matrix (REQ-B, REQ-K)

#### Reference Table: Road-Width Based TDR Matrix
| Road Width | Regular TDR Factor | Gunthewari TDR Factor |
| :---: | :---: | :---: |
| **9 m** | 0.40 | 0.200 |
| **12 m** | 0.65 | 0.325 |
| **15 m** | 0.80 | 0.400 |
| **18 m** | 0.90 | 0.450 |
| **24 m** | 1.10 | 0.500 |

*Validation Rule*: Only these 5 road widths are recognized. Any other width requires explicit configuration or validation rejection. Never interpolate.

#### Formula 2.1: Regular TDR Area
- **Equation**:
  $$\text{Regular TDR Area (sq m)} = \text{Plotable Area} \times \text{Regular TDR Factor}$$
- **Input Fields**: `plotableAreaSqm`, `statement.regular_tdr_factor`
- **Output Field**: `areaMetrics.regularTdrSqm`

#### Formula 2.2: Slum TDR Area
- **Equation**:
  $$\text{Slum TDR Area (sq m)} = \text{Plotable Area} \times \text{Slum TDR Factor}$$
- **Input Fields**: `plotableAreaSqm`, `statement.slum_tdr_factor`
- **Output Field**: `areaMetrics.slumTdrSqm`

#### Formula 2.3: Combined Proposed TDR
- **Equation**:
  $$\text{Total Proposed TDR Area} = \text{Regular TDR Area} + \text{Slum TDR Area}$$
  $$\text{Combined Proposed TDR Factor} = \text{Regular TDR Factor} + \text{Slum TDR Factor}$$
- **Output Field**: `areaMetrics.proposedTdrSqm`, `areaMetrics.proposedTdrFactor`

#### Formula 2.4: Total Builtup Area
- **Equation**:
  $$\text{Total Builtup Area (sq m)} = \text{Basic FSI Area} + \text{Paid FSI Area} + \text{Total Proposed TDR Area}$$
- **Output Field**: `areaMetrics.proposedTotalBuiltupSqm`

---

### 3. Ancillary Area Calculation (REQ-D)

#### Formula 3.1: Building Use-Based Ancillary Area
- **Rule**:
  $$\text{Ancillary Percentage} = \begin{cases} 80\% (0.80) & \text{if Building Use } = \text{"Commercial"} \\ 60\% (0.60) & \text{if Building Use } = \text{"Residential" or default} \end{cases}$$
- **Equation**:
  $$\text{Ancillary Area (sq m)} = \text{Total Builtup Area} \times \text{Ancillary Percentage}$$
- **Equation for Total Permissible P-Line**:
  $$\text{Total Permissible P-Line Area (sq m)} = \text{Total Builtup Area} + \text{Ancillary Area}$$
- **Output Fields**: `areaMetrics.applicableAncillaryPct`, `areaMetrics.proposedAncillarySqm`, `areaMetrics.proposedPlineTotalSqm`

---

### 4. Floor-wise P-Line, Lobby & Unit Calculations (REQ-F, REQ-H)

#### Formula 4.1: Automatic Lobby Area (Default 15%)
- **Equation**:
  $$\text{Default Lobby Area} = \text{P-Line Area} \times 0.15$$
- **Override Rule**:
  - If `is_lobby_overridden == false`: `lobby_area_sqm = pline_area_sqm * 0.15`.
  - If `is_lobby_overridden == true`: preserve existing `lobby_area_sqm` regardless of changes to P-Line Area or other fields.
- **Output Field**: `floor.lobby_area_sqm`, `floor.is_lobby_overridden`

#### Formula 4.2: Built-up Area for Owners
- **Equation**:
  $$\text{Builtup for Owners} = \max(0, \text{P-Line Area} - \text{Lobby Area})$$
  *(Unless manually specified or Ground floor where owners is 0)*

#### Formula 4.3: Area For 1 Unit
- **Equation**:
  $$\text{Area For 1 Unit (sq m)} = \begin{cases} \dfrac{\text{Built-up for Sale}}{\text{No. Of Units}} & \text{if No. Of Units } > 0 \\ 0 & \text{if No. Of Units } \le 0 \text{ or null} \end{cases}$$
- **Output Field**: `floor.area_for_1_unit`
- **Zero-Division Guard**: Never evaluates division when `no_of_units <= 0`. Returns `0.00`.

---

### 5. Statutory Charges & RR Percentage Configuration (REQ-C, REQ-E, REQ-J)

#### Formula 5.1: Ready Reckoner Proportional Statutory Charges
For each statutory charge configured with an independent RR percentage:
$$\text{Charge Rate (₹/sq m)} = \left(\frac{\text{Configured RR Percentage}}{100}\right) \times \text{RR Rate}$$
$$\text{Calculated Amount (₹)} = \text{Applicable Area (sq m)} \times \text{Charge Rate}$$

- **Applicable Areas by Charge Code**:
  - `ANCILLARY_CHARGES`: $\text{Effective Ancillary Area} \times (\text{rr\_percentage}/100 \times \text{RR Rate})$ (Default 10%)
  - `DEVELOPMENT_CHARGES`: $\text{Effective P-Line Area} \times (\text{rr\_percentage}/100 \times \text{RR Rate})$ (Default 2%)
  - `PREMIUM_FSI`: $\text{Effective Paid FSI Area} \times (\text{rr\_percentage}/100 \times \text{RR Rate})$ (Default 40%)
  - `TDR_LOADING_CHARGES`: $\text{Effective TDR Area} \times (\text{rr\_percentage}/100 \times \text{RR Rate})$ (Default 3%)

#### Formula 5.2: Total Statutory Demand Sum (Section A)
$$\text{Total Statutory Demand (A)} = \sum_{i \in \text{charges},\, i.\text{is\_enabled} = \text{true},\, i.\text{is\_deleted} = \text{false}} i.\text{calculated\_amount}$$
- **Disabled Exclusion**: Any row with `is_enabled == false` contributes ₹0.00 to the total sum.
- **Amalgamation Exclusion**: `AMALGAMATION` is removed/disabled and contributes ₹0.00 to total statutory demand.
