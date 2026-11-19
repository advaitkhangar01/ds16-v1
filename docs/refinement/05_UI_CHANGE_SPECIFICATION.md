# Document 5 — UI Change Specification
## Design Language & Component Interaction Plan

All changes strictly adhere to DS16 brand guidelines:
- Primary Color: `#E05A1E` (Warm Architectural Terracotta / International Orange)
- Backgrounds: `#F8FAFC` (Slate 50), Clean White `#FFFFFF`, Subtle Borders `#E2E8F0` / `#CBD5E1`
- Typography: Inter / System Font, sharp hierarchy, mono fonts for currency/numbers

---

### 1. Building Configuration — Parking Floors (`TimelineSetup.jsx`)
- **Placement**: Inside `Building Configuration & Slab Generation Setup` card.
- **Controls**:
  - Multi-checkbox or pill selector for parking floor types:
    - `[x] Basement 2`
    - `[x] Basement 1`
    - `[x] Stilt Parking`
    - `[ ] Upper-floor Parking (Podium)`
  - When upper-floor parking is checked, shows a counter `Podium Parking Floors: [ 1 ]`.
- **Feedback & Summary**:
  - Live preview badge: "Configured: B2 + B1 + Stilt + G+4 Residential + Tank Slab".
  - Clarifies that parking levels do not consume residential/commercial saleable FSI.

---

### 2. Area Statement Form Enhancements (`AreaStatementForm.jsx`)
- **Section 1: Plot Classification & Road Width (Gunthewari & TDR)**:
  - Dropdown: `Plot Classification`: `[ Regular Plot | Gunthewari Scheme Plot ]`.
  - Dropdown: `Road Width`: `[ 9 m | 12 m | 15 m | 18 m | 24 m ]`.
  - When selected, displays the auto-resolved TDR rate badge: e.g. "Applicable TDR Factor: 0.325 (Gunthewari 12m Road)".
  - Checkboxes for TDR Selection:
    - `[x] Regular TDR` $\to$ shows Factor input (auto-populated from road width or custom).
    - `[x] Slum TDR` $\to$ shows Factor input.
- **Section 2: Building Use (Ancillary Area %)**:
  - Dropdown: `Building Use`: `[ Residential (60% Ancillary) | Commercial (80% Ancillary) ]`.
- **Section 3: Floor-wise Proposed P-Line Table**:
  - Added columns: `No. Of Units` (editable number input, min 0, default 1), `Area For 1 Unit` (read-only auto-calculated font-mono badge).
  - Lobby Area input:
    - Displays badge: `Auto 15%` or `Manual Override`.
    - If user edits lobby area, badge turns into `Manual Override` with a small `Reset` icon button to re-link to automatic 15% calculation.

---

### 3. Financial Viability Form & Statutory Charges (`FinancialViabilityForm.jsx`)
- **Statutory Charges Section**:
  - Render a clean, structured table with per-row controls:
    1. **Checkbox (`[x]`)**: Toggles `is_enabled`.
       - When unchecked: Text is muted (`text-slate-400 line-through opacity-75`), amount is marked `(Excluded)`, excluded from total.
    2. **Charge Particulars**: Name and calculation basis.
    3. **RR Percentage Input**: Number input with `%` suffix (e.g. `[ 10.0 ] %`).
    4. **Applied RR Rate**: Read-only display of project RR rate.
    5. **Calculated Amount (₹)**: Read-only currency formatted display.
    6. **Actions**: Disable toggle, or Archive / Soft Delete button (respecting confirmation decision).

---

### 4. Feasibility Document Preview (`FeasibilityDocumentPreview.jsx`)

#### Table 1 — Plot Area Statement
| Sr. | Particulars | Permissible (Sq M) | Proposed (Sq M) |
| :---: | :--- | :---: | :---: |
| 1 | Area Of Plot | 270.00 | — |
| 2 | Deductions For Proposed D.P. Road / Reservation | 0.00 | — |
| 3 | Existing Built-up Area Deduction | 0.00 | — |
| **A** | **Plotable Area (Net Development Plot)** | **270.00** | **270.00** |

#### Table 2 — Permissible vs Proposed FSI Potential
| Sr. | Particulars | Permissible (Sq M) | Proposed (Sq M) |
| :---: | :--- | :---: | :---: |
| B | Basic Permissible FSI (1.10 × Plot Area) | 297.00 | 297.00 |
| C | Paid FSI (0.50 × Plot Area) | 135.00 | 135.00 |
| D1 | Regular TDR Utilization | 175.50 | 175.50 |
| D2 | Slum TDR Utilization | 0.00 | 0.00 |
| **E** | **Total Builtup Area (B + C + D)** | **607.50** | **607.50** |
| F | TOTAL FSI CONSUMPTION RATIO | 2.250 | 2.250 |
| G | Ancillary FSI (60% Residential / 80% Commercial) | 364.50 | 364.50 |
| **H** | **TOTAL PERMISSIBLE P-LINE AREA (E + G)** | **972.00** | **972.00** |

#### Table 3 — Floor-wise Proposed P-Line Area Statement (Exact Sequence)
| Floor Level | Height (m) | P-Line Area (sq m) | Lobby Area (sq m) | Built-up for Sale (sq m) | No. Of Units | Area For 1 Unit (sq m) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| Basement 2 (Parking) | 3.00 m | 240.00 | 0.00 | 0.00 | 0 | 0.00 |
| Basement 1 (Parking) | 3.00 m | 240.00 | 0.00 | 0.00 | 0 | 0.00 |
| Stilt Parking | 2.85 m | 220.00 | 20.00 | 0.00 | 0 | 0.00 |
| 1st Floor | 2.85 m | 185.00 | 27.75 (15%) | 157.25 | 2 | 78.63 |
| 2nd Floor | 2.85 m | 185.00 | 27.75 (15%) | 157.25 | 2 | 78.63 |
| **TOTAL** | **—** | **1,070.00** | **75.50** | **314.50** | **4** | **—** |

---

### 5. Task List Interface Verification (`TimelineTaskList.jsx`)
- Confirmed: No cost estimates, budgets, or monetary columns in the Task List view.
- Strictly displays: Activity Name, Milestone trigger tags, Stage, Floor / Zone, Planned Dates, Duration (Days), Status badge, Assignees, Actions.
