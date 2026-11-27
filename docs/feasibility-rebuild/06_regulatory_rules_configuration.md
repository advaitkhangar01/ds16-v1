# DS16 Area & Financial Feasibility Rebuild
## Document 06: Regulatory Rules Configuration & UDCPR Standards

**Project:** Design Studio 16 (DS16)  
**Module:** Project Details → Area & Financial Feasibility  
**Governing Regulation:** Unified Development Control and Promotion Regulations (UDCPR) for Maharashtra State  
**Special Local Authority Profile:** Nagpur Municipal Corporation (NMC) / NIT  
**Date:** November 2026

---

### 1. Road Width & Total TDR Schedule (Section 4 Business Rule)

Total TDR is strictly determined by the width of the access road abutting the development plot.

| Road Width (m) | Total TDR Factor | Default Regular TDR (50%) | Default Slum TDR (50%) | Maximum Permissible TDR Potential | Regulatory Reference |
|---|---|---|---|---|---|
| **9.0 meters** | **0.40** | 0.200 | 0.200 | $0.40 \times \text{Plotable Area}$ | UDCPR Regulation 11.2 |
| **12.0 meters** | **0.65** | 0.325 | 0.325 | $0.65 \times \text{Plotable Area}$ | UDCPR Regulation 11.2 |
| **15.0 meters** | **0.80** | 0.400 | 0.400 | $0.80 \times \text{Plotable Area}$ | UDCPR Regulation 11.2 |
| **18.0 meters** | **0.90** | 0.450 | 0.450 | $0.90 \times \text{Plotable Area}$ | UDCPR Regulation 11.2 |
| **24.0 meters & above** | **1.15** | 0.575 | 0.575 | $1.15 \times \text{Plotable Area}$ | UDCPR Regulation 11.2 & Manewada Reference |

#### 1.1 TDR Governing Rules:
1. **Authoritative Total:** The total TDR factor cannot be freely invented. It is locked to the road width schedule.
2. **50/50 Split:** By default, Total TDR is split equally between Regular TDR ($50\%$) and Slum TDR ($50\%$).
3. **Regular TDR Override:** An admin may manually adjust Regular TDR. Slum TDR is automatically recalculated as the remainder:
   $$\text{Slum TDR} = \text{Total TDR} - \text{Effective Regular TDR}$$
4. **Reconciliation Guarantee:** The sum of Regular TDR and Slum TDR must always equal Total TDR.
5. **Upper Bound Constraint:** Regular TDR cannot exceed Total TDR. If an architect enters an amount higher than Total TDR, the system displays an alert and clamps Regular TDR to Total TDR, setting Slum TDR to 0.

---

### 2. Gunthewari Scheme Regularization Rules

Under the Maharashtra Gunthewari Developments (Regulation, Upgradation and Control) Act:
1. **TDR Prohibition:** Gunthewari plots are strictly ineligible for TDR generation or TDR consumption.
   - $\text{Total TDR Factor} = 0.00$
   - $\text{Regular TDR Factor} = 0.00$
   - $\text{Slum TDR Factor} = 0.00$
2. **Permissible Potential:** Limited strictly to Basic FSI ($1.10$) and Paid FSI ($0.50$).
3. **UI Enforcement:** Selecting "Gunthewari Scheme Plot" disables the road width TDR loading and suppresses TDR statutory loading charges.

---

### 3. Ancillary Area Regulatory Norms

Under UDCPR Chapter 6:
- **Residential Buildings / Floors:** $60\%$ of basic and premium FSI is permissible as Ancillary Area upon payment of $10\%$ Ready Reckoner charges.
- **Commercial Buildings / Floors:** $80\%$ of basic and premium FSI is permissible as Ancillary Area upon payment of $10\%$ Ready Reckoner charges.
- **Mixed-Use Buildings:** Ancillary area must be computed independently for each floor according to that floor's designated use (80% for commercial levels, 60% for residential levels).

---

### 4. Occupancy-Based Parking Standards (UDCPR Tables 8-B & 8-C)

#### 4.1 Commercial Space Parking Standards
- **Car Parking:** 2 Car spaces per $100\text{ sq m}$ of commercial carpet area.
- **Two-Wheeler Parking:** 6 Scooter spaces per $100\text{ sq m}$ of commercial carpet area.

#### 4.2 Residential Space Parking Standards (Tenement Bands)
- **Carpet Area $< 40\text{ sq m}$:** 0 Car spaces; 1 Scooter space per 2 tenements.
- **Carpet Area $40\text{ sq m to } 80\text{ sq m}$:** 1 Car space per 2 tenements; 1 Scooter space per 1 tenement.
- **Carpet Area $> 80\text{ sq m}$:** 1 Car space per 1 tenement; 2 Scooter spaces per 1 tenement.

#### 4.3 Mandatory Visitor Parking
- A mandatory addition of $5\%$ is added to the aggregate number of cars and two-wheelers.

#### 4.4 Nagpur Authority Reduction Factor
- For projects under the jurisdiction of Nagpur Municipal Corporation (NMC) / Nagpur Improvement Trust (NIT), a multiplier of **0.90** is applied to the aggregate parking requirement, acknowledging higher transit and compact urban provisions.
