# DS16 — Source Workbook & Formula Reconciliation Register

**Document ID:** `docs/feasibility-rebuild/20_formula_reconciliation_register.md`  
**Audit Date:** 2026-11-28  
**Phase:** Stage 1 — Audit and Formula Mapping (Phases 0.3, 0.4, 1.1, 1.2)  
**Source Precedence Applied:**
1. Explicit client corrections and decisions in the rebuild directive / prior client clarifications.
2. Original client Excel workbook (`Sample Financial Viability Asolkar Sir.xlsx`).
3. Original client PDF documents (when provided).
4. Existing DS16 implementation (`server/services/feasibilityEngine.js`, `server/routes/feasibility.js`, DB migrations).
5. Developer-created documentation (`docs/feasibility-rebuild/00`–`15`, `docs/financial_viability/*`, `docs/refinement/*`).

---

## 1. Primary Reference File Availability Audit

| # | Requested Primary Source | Status in Workspace | Verified Findings |
|---|---|---|---|
| 1 | `Sample Financial Viability Asolkar Sir.xlsx` | **PRESENT** | Located at `D:\Freelance\ds16-v1\Sample Financial Viability Asolkar Sir.xlsx` (34,421 bytes). Contains 3 worksheets: `PLOT NO. 01 Area (SQ ft)`, `Area (SQ M)`, `FINANCIAL VIABILITY`. Audited cell-by-cell below. |
| 2 | `FINANCIAL VIABILITY Calculation_17-09-2025.pdf` | **MISSING** | Not present in workspace or git history. Requested in `docs/feasibility-rebuild/reference/`. |
| 3 | `MANEWADA_ Commercial_ADVANCE PROPOSEL_(G+9)..24-11-2026.pdf` (+ 8 WhatsApp Images) | **PRESENT & INSPECTED** | 6-page PDF at workspace root (`2,496,564` bytes): Pages 1–5 CAD plans; Page 6 full embedded Area Statement, Floor P-Line, Parking, and Financial Viability sheet (`MR. SANDEEP MURDWAR, MANEWADA`). Companion JPEGs (`26–27 Nov 2026`, 6 unique images + 2 byte-identical copies) include full-resolution left/right sheet crops (`12.01.38 AM`, `12.02.20 AM`) and 3 client-annotated UI screenshots (`11.50.15 PM`, `11.51.28 PM`, `11.57.55 PM`). |
| 4 | `SHAUBHAGYA SARITA KALMESHWER Quick Report.pdf` | **PRESENT (NON-FEASIBILITY DOC)** | Located at `D:\Freelance\ds16-v1\SHAUBHAGYA SARITA KALMESHWER  Quick Report.pdf` (double space). Extracted all 2 pages: it is a **Task Chart / Gantt Schedule** (Tasks 1–30 from 07/09/26 to 21/03/27) with zero Area Statement or Financial Viability content. |

---

## 2. Source Workbook Register (`Sample Financial Viability Asolkar Sir.xlsx`)

### 2.1 Worksheet Metadata

| Worksheet | Dimensions | Print Orientation | Merged Ranges | Hidden Rows | Broken `#REF!` Cells |
|---|---|---|---|---|---|
| `PLOT NO. 01 Area (SQ ft)` | `A2:K47` | Landscape | 42 merged ranges (`A2:F2`, `A4:F4`, `B5:D5`..`B45:D45`, `A16:A17`, `B16:B17`, `C16:D17`, etc.) | Rows 37–43 (Dividing factor check block) | `A2`, `F23:I23`, `F26:I26`, `F30:I30`, `F31:I31`, `F33:I33`, `F34:I34`, `F36:I36`, `K36`, `F38:F40`, `F43` |
| `Area (SQ M)` | `A1:T80` | Landscape | 59 merged ranges (`A2:F2`, `A4:F4`, `B5:D5`..`B79:D79`, `A16:A17`, `B16:B17`, `C16:D17`, etc.) | Rows 33–39 (Dividing factor check block in Draft 1) | `K28`, `K29`, `K30` |
| `FINANCIAL VIABILITY` | `B1:S68` | Portrait | 65 merged ranges (`C1:J1`, `H3:I3`, `C12:D25`, `H12:I43`, `C36:F42`, `B46:J46`, `I47:J57`, `B60:D60`) | None | `G40` (`=#REF!*5500`) |

### 2.2 Cell & Formula Register — `Area (SQ M)`

| Worksheet | Section | Cell Reference | Particular | Original Formula / Value | Unit | Dependency |
|---|---|---|---|---|---|---|
| Area (SQ M) | Header | A2:F2 | Project Title | `"PROPOSED BUILDING PLAN FOR MULTIFAMILY RESIDENTIAL UNIT ON PLOT NO. 82..."` | Text | Manual |
| Area (SQ M) | Area Statement | E6 / F6 | 1. Area Of Plot | `270` / `'-'` | sq m | Manual input |
| Area (SQ M) | Area Statement | E7 / F7 | 2. As Per City Survey Record | `=E6` (`270`) / `'-'` | sq m | `E6` |
| Area (SQ M) | Area Statement | E8 / F8 | 3. As per site | `=E7` (`270`) / `'-'` | sq m | `E7` |
| Area (SQ M) | Area Statement | E9 / F9 | 4. Deductions For Proposed D.P. | `0` / `'-'` | sq m | Manual input |
| Area (SQ M) | Area Statement | E10 / F10 | A. Plotable area | `=E7` (`270`) / `=E10` (`270`) | sq m | `E7` (Note: workbook did not subtract `E9` because `E9=0`) |
| Area (SQ M) | Area Statement | D11 / E11 / F11 | B. Permissible FSI - 1.1 Times of Plot Area | `1.1` / `=E10*1.1` (`297`) / `=F10*1.1` (`297`) | factor / sq m | `E10`, `F10` |
| Area (SQ M) | Area Statement | D12 / E12 / F12 | C. Paid FSI (50% of Plot Area) | `0.5` / `=E10*0.5` (`135`) / `=F10*0.5` (`135`) | factor / sq m | `E10`, `F10` |
| Area (SQ M) | Area Statement | D13 / E13 / F13 | D. TDR (65% of Plot Area) | `0.65` / `=E10*0.65` (`175.5`) / `=F10*0.545` (`147.15`) | factor / sq m | `E10`, `F10` (Notice Proposed uses `0.545` vs Permissible `0.65`) |
| Area (SQ M) | Area Statement | E14 / F14 | E. Total Builtup Area (B+C+D) | `=E11+E12+E13` (`607.5`) / `=F11+F12+F13` (`579.15`) | sq m | `E11:E13`, `F11:F13` |
| Area (SQ M) | Area Statement | D15 / E15 / F15 | F. TOTAL FSI = 1.1 + 0.5 + 0.65 = 2.25 | `2.25` / `=1.1+0.5+0.65` (`2.25`) / `=F14/F10` (`2.145`) | ratio | `F14`, `F10` |
| Area (SQ M) | Area Statement | C16 / E16 / F16 | G. ANCILLARY — Comm. = 80% | blank / blank / blank (`0`) | sq m | None in this residential sheet |
| Area (SQ M) | Area Statement | C17 / E17 / F17 | G. ANCILLARY — Residential = 60% | `=E14*0.6` (`364.5`) / `=F14*0.6` (`347.49`) | sq m | `E14`, `F14` |
| Area (SQ M) | Area Statement | E18 / F18 | H. Total Permissible P-Line Area (G+E) | `=E14+E16+E17` (`972`) / `=F14+F17` (`926.64`) | sq m | `E14,E16,E17` / `F14,F17` |
| Area (SQ M) | Floor Block 1 (Red) | R20:R32 | Six floors @ 2.85m (G+6+7th row) | `F23=19.642`, `F24:F30=135.863`, `G23=F23`, `G24:G30=19.64`, `H24:H30=F-G`, `I23=56.6163`, `I24:I25=241.7041`, `I26=130.6981`, `F32=SUM(F23:F31)=970.683` | sq m / m | `F23:I31` (Draft trial; `K28:K30` contain `#REF!`) |
| Area (SQ M) | Hidden Check (Block 1) | R33:R39 | Existing / Dividing Factor 1.6 Check | `F33=0`, `F34=F32-F33`, `F35=F34/1.6`, `F36=F32-F35`, `F37=F10*1.1`, `F38=F10*0.3`, `F39=F35-F37-F38` | sq m | `F32`, `F10` |
| Area (SQ M) | Margin / Split (Block 1) | R41:R45 | Margin & Owner/Sale/Use Ratios | `E41=E31/5` (`3.99`), `H41=H32/H42` (`55%`), `I41=I32/H42` (`45%`), `I44=F32` (`100%` residential) | m / % | `E31, H32, I32, F32` |
| Area (SQ M) | Floor Block 2 (Red) | R46:R61 | Six floors @ 3.3m (Draft 2) | `F49=19.642`, `F50:F55=148.5`, `F58=910.642`, `E60=E18-F58` (`61.358`), `E61=E57/5` (`3.96`) | sq m / m | `E18`, `F49:F57` |
| Area (SQ M) | Floor Block 3 (Green) | R64:R79 | Six floors @ 3.3m (Active linked to Financial Viability) | `F67=blank`, `F68=151.0175`, `F69=135.49`, `F70=F68`, `F71=F69`, `F72=F70`, `F73=F71`, `G68:G73=19.65`, `H=F-G`, `F76=859.5225`, `E78=E18-F76` (`112.4775`), `E79=E75/5` (`3.96`) | sq m / m | Linked into `FINANCIAL VIABILITY` `D50:D52` |

### 2.3 Cell & Formula Register — `PLOT NO. 01 Area (SQ ft)`

| Worksheet | Section | Cell Reference | Particular | Original Formula / Value | Unit | Dependency |
|---|---|---|---|---|---|---|
| PLOT NO. 01 Area (SQ ft) | Header | A2 | Broken Title Formula | `=#REF!` | — | Broken external/sheet reference |
| PLOT NO. 01 Area (SQ ft) | Area Statement | E6:E14 / F10:F14 | Plot, Survey, Site, DP, Plotable, FSI, Paid FSI, TDR, Total Builtup | `='Area (SQ M)'!<cell>*10.764` (Labels in `B11` say `1.25` and `B13` say `100%`, mismatched with `'Area (SQ M)'` values `1.1` & `65%`) | sq ft | `'Area (SQ M)'!E6:F14` |
| PLOT NO. 01 Area (SQ ft) | Area Statement | E15 / F15 | TOTAL FSI (**DEFECT IN SOURCE**) | `='Area (SQ M)'!E15*10.764` (`24.219`) / `='Area (SQ M)'!F15*10.764` (`23.089`) | erroneous | Erroneously multiplies dimensionless FSI ratio by `10.764` |
| PLOT NO. 01 Area (SQ ft) | Area Statement | E16:E18 / F16:F18 | Ancillary & Total Permissible P-Line | `='Area (SQ M)'!<cell>*10.764` | sq ft | `'Area (SQ M)'!E16:F18` |
| PLOT NO. 01 Area (SQ ft) | Floor Statement | R20:R36 | Ground to Twelfth Floor | Rows 21, 22, 24, 25, 27, 28, 29 link `'Area (SQ M)'!F23..F30*10.764`; rows 23, 26, 30, 31, 33, 34 contain `#REF!`; `F36:I36=SUM(...)` evaluates `#REF!` | sq ft | `'Area (SQ M)'` Block 1 (corrupted references) |
| PLOT NO. 01 Area (SQ ft) | Hidden Check | R37:R43 | Dividing Factor 1.6 Check | `F38:F40`, `F43` cascade `#REF!` from `F36`; `F41=F10*1.1`, `F42=F10*0.3` | sq ft | `F36`, `F10` |
| PLOT NO. 01 Area (SQ ft) | Margin | E45 | Margin | `6` | m | Manual |

### 2.4 Cell & Formula Register — `FINANCIAL VIABILITY`

| Worksheet | Section | Cell Reference | Particular | Original Formula / Value | Unit | Dependency |
|---|---|---|---|---|---|---|
| FINANCIAL VIABILITY | Area Overview | C4:I4 | Plot & Potential Factors | `C4=270`, `D4=1.1`, `E4=0.5`, `F4=0.65`, `G4==D4+E4+F4` (`2.25`), `H4=0.8`, `I4=0.6` | sq m / factor | Manual inputs (note `C4` not linked to `'Area (SQ M)'!E6`) |
| FINANCIAL VIABILITY | Area Overview | D5:J5 | PERMISSIBLE Row | `D5==C4*D4` (`297`), `E5==C4*E4` (`135`), `F5==C4*F4` (`175.5`), `G5==E5+D5+F5` (`607.5`), `H5=0`, `I5==G5*0.6` (`364.5`), `J5==SUM(G5:I5)` (`972`) | sq m | `C4:F4` |
| FINANCIAL VIABILITY | Area Overview | D6:J6 | PROPOSED Row | `D6==C4*D4` (`297`), `E6==C4*E4` (`135`), `F6==C4*0.545` (`147.15`), `G6=='Area (SQ M)'!F14` (`579.15`), `H6=='Area (SQ M)'!F16` (`0`), `I6=='Area (SQ M)'!F17` (`347.49`), `J6==SUM(G6:I6)` (`926.64`) | sq m | `C4:E4`, `'Area (SQ M)'!F14:F17` |
| FINANCIAL VIABILITY | Cost Norms | C8:G8 | ESTIMATED COST-A | `D8=15000`, `E8==J6` (`926.64`), `G8==E8*D8` (`13,899,600.00`) | ₹/sq m, sq m, ₹ | `D8`, `J6` |
| FINANCIAL VIABILITY | Cost Norms | C9:G9 | ESTIMATED COST-B | `D9=26620`, `E9==J6` (`926.64`), `G9==E9*D9` (`24,667,156.80`) | ₹/sq m, sq m, ₹ | `D9`, `J6` |
| FINANCIAL VIABILITY | RR Rate | E10:G10 | RR RATES RS | `G10=24340` | ₹/sq m | Manual input |
| FINANCIAL VIABILITY | Statutory (A) | B13:J13 | 1. PLAN REGISTRATION FEES | `E13==J6`, `G13=5.9`, `H13==G13*E13`, `J13==H13` (`5,467.18`) | ₹ | `J6`, `G13` |
| FINANCIAL VIABILITY | Statutory (A) | B14:J14 | 2. SECURITY DEPOSIT(MAX-RS 75000.00) 1% | `E14==G8`, `F14==1/100`, `G14==F14*E14` (`138,996`), `H14==G14`, `J14=75000` (hardcoded cap) | ₹ | `G8` |
| FINANCIAL VIABILITY | Statutory (A) | B15:J15 | 3. STACKING CHARGES (MAX RS 50000.00).05% | `E15==G8`, `F15=0.005` (`0.5%`), `G15==F15*E15` (`69,498`), `H15==G15`, `J15=50000` (hardcoded cap) | ₹ | `G8` |
| FINANCIAL VIABILITY | Statutory (A) | B16:J16 | 4. ANCILLARY AREA (10% OF RR) | `E16==I6` (`347.49`), `F16==G10*0.1`, `G16==F16*E16`, `H16==G16`, `J16==H16` (`845,790.66`) | ₹ | `I6`, `G10` |
| FINANCIAL VIABILITY | Statutory (A) | B17:J17 | 5. SEWER CONNECTION CHARGES | `E17==J6`, `F17=2.5`, `G17==F17`, `H17==G17*E17`, `J17==H17` (`2,316.60`) | ₹ | `J6` |
| FINANCIAL VIABILITY | Statutory (A) | B18:J18 | 6. DEVELOPMENT CHARGES (2% OF RR) | `E18==J6`, `F18==G10*0.02`, `G18==F18*E18`, `H18==G18`, `J18==H18` (`451,088.35`) | ₹ | `J6`, `G10` |
| FINANCIAL VIABILITY | Statutory (A) | B19:J19 | 7. PREMIUM FSI CHARGES (40% OF RR) | `E19==E6` (`135`), `F19==G10*0.4`, `G19==F19*E19`, `H19==G19`, `J19==H19` (`1,314,360.00`) | ₹ | `E6`, `G10` |
| FINANCIAL VIABILITY | Statutory (A) | B20:J20 | 8. TREE PLANTATION(RS 500.00/74.32 SQM(MAX 25000.00) | `E20==J6`, `F20==E20/74.32` (`12.468`, fmt `0`), `G20=500`, `H20==G20*F20`, `J20==H20` (`6,234.12`) | ₹ | `J6` (Cap in label only; `J20` has no `MIN`) |
| FINANCIAL VIABILITY | Statutory (A) | B21:J21 | 9. HERITAGE FUND( 2% OF Development Charges) | `E21==J18`, `F21=0.02`, `G21==F21*E21`, `H21==G21`, `J21==H21` (`9,021.77`) | ₹ | `J18` |
| FINANCIAL VIABILITY | Statutory (A) | B22:J22 | 10. LABOUR WELFARE CESS (1% of RR Const. cost) | `E22==G9`, `F22=0.01`, `G22==F22*E22`, `H22==G22`, `J22==H22` (`246,671.57`) | ₹ | `G9` |
| FINANCIAL VIABILITY | Statutory (A) | B23:J23 | 11. TDR LOADING CHARGES (3% OF RR RATES) | `E23==F6` (`147.15`), `F23==0.03*G10`, `G23==F23*E23`, `H23==G23`, `J23==H23` (`107,448.93`) | ₹ | `F6`, `G10` |
| FINANCIAL VIABILITY | Statutory (A) | B24:J24 | 12. AMALGAMATION CHARGES (RS 200.00 PER SQM) | `E24==C4`, `G24=200`, `J24==G24*E24` (`54,000.00`) | ₹ | `C4` (Client directive: exclude) |
| FINANCIAL VIABILITY | Statutory (A) | B25:J25 | 13. LABOUR WALFARE ON PARKING AREA | `E25=225`, `F25==E25*D9`, `G25=1`, `H25==F25*0.01`, `J25==H25` (`59,895.00`) | ₹ | `E25`, `D9` (Client directive: manual Admin input) |
| FINANCIAL VIABILITY | Statutory (A) | I26:K26 | NMC/DEMAND RS (Total A) | `J26==SUM(J13:J25)` (`3,227,294.18`), `K26='A'` | ₹ | `J13:J25` |
| FINANCIAL VIABILITY | TDR Cost (B) | B27:K27 | 14. COST OF TDR (B) | `D27==F6` (`147.15`), `E27==G10*0.55`, `J27==E27*D27` (`1,969,897.05`), `K27='B'` | ₹ | `F6`, `G10` |
| FINANCIAL VIABILITY | Expenses (C) | C29:J29 | MINOR EXPENSES | `J29=234233` (**Omitted from `J35` sum!**) | ₹ | Manual |
| FINANCIAL VIABILITY | Expenses (C) | C30:J30 | BPMS -STAFF CHARGES | `J30=100000` | ₹ | Manual |
| FINANCIAL VIABILITY | Expenses (C) | C31:J31 | AIRPORT NOC | `J31=25000` | ₹ | Manual |
| FINANCIAL VIABILITY | Expenses (C) | C32:J32 | FIRE NOC | `J32=500000` | ₹ | Manual |
| FINANCIAL VIABILITY | Expenses (C) | C33:J33 | ENTERTAINMENT CHARGES | `J33=300000` | ₹ | Manual |
| FINANCIAL VIABILITY | Expenses (C) | C34:J34 | EXTRA STAMP DUTY ON POTENTIAL | `G34='FROM ADVOCATE'`, `J34=blank` | ₹ | Manual / Advocate |
| FINANCIAL VIABILITY | Expenses (C) | H35:K35 | TOTAL (C) | `J35==SUM(J30:J34)` (`925,000.00`), `K35='C'` | ₹ | `J30:J34` |
| FINANCIAL VIABILITY | Plot Cost (H) | C36:K36 | COST OF PLOT (H) | `G36=270`, `H36='30,000 per sqm'`, `J36==G36*50000` (`13,500,000.00`), `K36='H'` | ₹ | Conflict `H36` (`30k`) vs `J36` (`50k`); superseded by lump-sum rule |
| FINANCIAL VIABILITY | Construction (D) | C37:K37 | COST OF CONSTRUCTION (D) | `G37==J6*20000` (`18,532,800.00`), `H37='20,000 per sqm'`, `J37==G37`, `K37='D'` | ₹ | `J6` |
| FINANCIAL VIABILITY | Infra / Interest | C38 / C39 | COST OF INFRASTRUCTURE CONSTRUCTION / INTEREST | blank / blank | ₹ | Manual |
| FINANCIAL VIABILITY | Basement (E) | C40:K40 | COST OF BASEMENT CONSTRUCTION (E) | `G40==#REF!*5500` (`#REF!`), `H40='5,500 per sqm'`, `J40=blank`, `K40='E'` | ₹ | Broken `#REF!` in `G40`; `J40` empty |
| FINANCIAL VIABILITY | Rent (F) | C41:K41 | RENT (F) | `G41==15000*3*24` (`1,080,000`), `H41='15,000 per Tenement'`, `J41=blank`, `K41='F'` | ₹ | `J41` blank -> omitted from `J43` |
| FINANCIAL VIABILITY | Parking (G) | C42:K42 | STACKED PARKING (G) | `G42==10*200000` (`2,000,000`), `H42='2 lac per Stack'`, `J42=blank`, `K42='G'` | ₹ | `J42` blank -> omitted from `J43` |
| FINANCIAL VIABILITY | Total Cost | H43:J43 | TOTAL (A+B+C+D+E+F+G) | `J43==J37+J35+J27+J26+J40+J41+J42+J36` (`38,154,991.23`) | ₹ | `J26, J27, J35, J36, J37, J40, J41, J42` (Note: label omits `H`, `J43` includes `J36` (`H`) and omits `J38, J39, J29`) |
| FINANCIAL VIABILITY | Receipts | R45 | Project Header Note | `D45='FINANCIAL CALCULATION FOR DEVELOPMENT OF PROJECT AT N=MADHAV NAGAR, MATE CHOWK'` | Text | Stale template header |
| FINANCIAL VIABILITY | Receipts | B48:I48 | 1. Period Required | `I48='21-24 Months'` | Text | Manual |
| FINANCIAL VIABILITY | Receipts | C50:I50 | 2. Salable Units Cost — Row 1 | `D50==('Area (SQ M)'!F68+'Area (SQ M)'!F69)*10.764` (`3083.97`), `E50==D50+300` (`3383.97`), `F50=3`, `G50=6000`, `H50==E50*G50`, `I50==H50*F50` (`60,911,401.14`) | sq ft / ₹ | `'Area (SQ M)'!F68:F69` |
| FINANCIAL VIABILITY | Receipts | C51:I51 | Row 2 (`RESIDENTIAL UNITS 01`) | `D51==('Area (SQ M)'!F69+'Area (SQ M)'!F70)*10.764` (`3083.97`), `E51==D51+300`, `F51=3`, `G51=6000`, `H51==E51*G51`, `I51==H51*F51` (`60,911,401.14`) | sq ft / ₹ | `'Area (SQ M)'!F69:F70` |
| FINANCIAL VIABILITY | Receipts | C52:I52 | Row 3 (`RESIDENTIAL UNITS 01`) | `D52==('Area (SQ M)'!F70+'Area (SQ M)'!F71)*10.764` (`3083.97`), `E52==D52+300`, `F52=3`, `G52=6000`, `H52==E52*G52`, `I52==H52*F52` (`60,911,401.14`) | sq ft / ₹ | `'Area (SQ M)'!F70:F71` |
| FINANCIAL VIABILITY | Receipts | B53:I53 | 3. Total (**DEFECT IN SOURCE**) | `I53==SUM(I50:J50)` (`60,911,401.14`) | ₹ | Erroneously sums `I50:J50` instead of `I50:I52`, omitting rows 51 & 52 |
| FINANCIAL VIABILITY | Receipts | B54:B57 | 4. Gross Savings / 5. Net savings / 6. ROI / 7. Initial Investment | Text labels only; value cells completely blank | — | Unresolved in workbook |
| FINANCIAL VIABILITY | Viability | B62:D62 | 1. Project Cost | `D62==J43` (`38,154,991`) | ₹ | `J43` |
| FINANCIAL VIABILITY | Viability | B63:D63 | 2. Receipts | `D63==I53` (`60,911,401`) | ₹ | `I53` |
| FINANCIAL VIABILITY | Viability | B64:D64 | 3. Profit | `D64==D63-D62` (`22,756,410`) | ₹ | `D63`, `D62` |
| FINANCIAL VIABILITY | Scratchpad | M21:Q23, L33:L34, N47:Q50, M60:S63 | Ad-hoc notes & scratch math | e.g., `M60*M61=3000*5000`, `N50=30000`, `O50=25000`, `O62:S63` | — | Non-print working scratch cells |

### 2.5 Primary Source Findings — `MANEWADA_ Commercial_ADVANCE PROPOSEL_(G+9)..24-11-2026.pdf` (Page 6) & WhatsApp Client Images (26–27 Nov 2026)

Inspected all 6 pages of `MANEWADA_ Commercial_ADVANCE PROPOSEL_(G+9)..24-11-2026.pdf` (Pages 1–5 CAD plans; Page 6 full embedded feasibility sheet) and the 8 uploaded WhatsApp images (`6` unique images; `(1)` copies at `12.01.38 AM` and `12.02.20 AM` are byte-identical `ac7d262b6813` and `d1c69adb3fb6`):

| Source File | Observed Client Values / Formulas / Annotations | Reconciliation Impact |
|---|---|---|
| `11.48.40 PM.jpeg` & `12.01.38 AM.jpeg` (Manewada Page 6 Left) | Plot `1101.140`, Survey `1101.140`, Site `1101.140`, DP `0.000`, Plotable `1101.140`. Permissible: Basic `1.1` (`1211.254`), Paid `0.5` (`550.570`), TDR `115%` (`1266.311`), Builtup `3028.135`, Total FSI `2.750`, Comm Anc `80% = 2422.508`, Res Anc `60% = 1816.881`, **Permissible P-Line `7267.524` (`3028.135 + 2422.508 + 1816.881`)**. Proposed: Basic `1211.254`, Paid `295.106` (left helper says `0.36`, actual ratio `0.268`), TDR `0.000`, Builtup `1506.360`, Comm `749.216` (= GF `269.04` + FF `480.176`), Res `1816.881`, Proposed P-Line `4072.457` (`43835.922 sq ft` via `10.764`), Floor sum `4072.080` (`43831.869 sq ft`), Diff `0.377`. | Proves Paid FSI (`295.106 < 550.570`) and TDR (`0.000 < 1266.311`) can be partially used or zero. Exposes template double-add of `80% + 60% = 140%` ancillary (`7267.524`) and hardcoded `749.216` Comm P-Line in `G.Comm` Proposed. |
| `12.01.38 AM.jpeg` (Parking Table) | Comm: `749.216 / 100 × 2 = 14.984` cars, `× 6 = 44.953` scooters. Res (`40–80 sqm`): `32 / 2 × 1 = 16` cars, `× 2 = 32` scooters. `+5%` Visitor (`1.549` cars, `3.848` 2W) -> `Total (A) = 32.534` / `80.801`. `× 0.9 = B`: `29.280` / `72.721`. **Grand Total Required: `29` cars (`Math.round(29.280)`), `73` scooters (`Math.round(72.721)`)**; Provided `34` / `75`. | **Confirms `Math.round` (`29` cars, `73` 2W)** over existing DS16 `Math.ceil` (`30` cars). `< 40 sqm` band not present in Manewada fixture. |
| `12.02.20 AM.jpeg` (Manewada Page 6 Right — Financial Viability) | RR Rate `42890.00`; Cost A `15000` (`61,086,847.80`); Cost B `26620` (`1,08,408,792.56`). **Statutory (A) Total `1,79,69,470.86`**: Plan Reg `24,027.49`; Sec Dep `75,000` cap; Stacking `50,000` cap (col `CHARGES` displays `0.01` = formatted `0.005`, `AMOUNT = 305,434.24`); **Ancillary `77,92,602.61` (`1816.88 × 4289.00` — Res only!)**; Sewer `10,181.14`; Dev `34,93,353.20`; Premium FSI `50,62,830.30` (`295.11 × 17156.00`); **Tree `27,398.12` (NOT capped at 25,000!)**; Heritage `69,867.06`; Labour Cess `10,84,087.93`; TDR Loading `0.00`; **Amalgamation `2,20,228.00` (included in A!)**; **Parking Welfare `59,895.00` (`225 × 26620 × 1%`)**. Sec B Cost of TDR `0.00`. **Sec C `41,08,430.40`**: Minor Expenses blank, BPMS `50,000`, Airport `25,000`, Fire `1,00,000`, Entertainment `3,50,000`, **Consultants Fees `35,83,430.40` (`4072.08 × ₹880/sqm`)**, Extra Stamp Duty blank. **Sec H Cost of Plot `16,59,37,393.44` (`11,852.671 sqft × 14,000`)**. **Sec D Cost of Construction `8,95,85,760.00` (`4072.08 × 22,000`)**. Sec E `1,479,720`, F `1,080,000`, G `2,000,000` left blank in Final col `J` -> Total `27,76,01,054.70`. **Receipts `48,09,12,588.37`**: 7 rows (`Comm Type 01..03`, `Res Type 01..04`, `35` units total), **Super B/Up = Area × `1.30` (+30% loading!)**, note `"After giving thre Flats to Owner"` yet all 35 units summed. Profit `20,33,11,534`. | Reveals key diffs vs later rebuild rules: (1) Plot Cost formula vs lump-sum; (2) Amalgamation included vs excluded; (3) Parking Labour Welfare formula vs manual; (4) Ancillary charge Res-only vs Res+Comm; (5) Tree Plantation uncapped `27,398.12` vs `25,000` cap; (6) Section C label `CONSULTANTS FEES` (`4072.08 × 880` or manual); (7) Loading `+30%` multiplier vs `+300 sqft` in Asolkar Sir. |
| `11.50.15 PM.jpeg`, `11.51.28 PM.jpeg`, `11.57.55 PM.jpeg` (Client Annotated DS16 Screenshots, 26 Nov 2026) | On an older DS16 screen (`1101.140` plot, Mixed Use, `24m`, Regular TDR `1.100` + Slum TDR `0.500` -> `5637.84` Permissible P-Line): (1) `11.50.15 PM`: Client circled `5637.84`, drew arrow to **`7267`**, wrote `"Refer Screen shot"`; (2) `11.51.28 PM`: Client put red **`X`** on `Slum TDR Factor [0.500]` writing **`"No Need"`**; (3) `11.57.55 PM`: Client labeled Basic=`1211` (`A`), Paid=`550.5` (`B`), Regular TDR=`1266` (`C`, i.e. `1.15×`), `A+B+C = 3028.135`, `(a) Resi Ancillary (60%) 1816`, `(b) Commercial Ancillary 2422`, and wrote **`FSI Total = A + B + C + a + b`**. | **CONFLICTING DIRECTIVES:** Nov 26 screenshots show `"No Need"` on Slum TDR, TDR `1.15`, and `P-Line = A+B+C+a+b = 7267`, directly conflicting with the Rebuild Prompt (`24m Total TDR 1.10 = 0.55 Regular + 0.55 Slum` in Phase 3.5; separate Comm 80% / Res 60% in Phase 3.7). Must get explicit client confirmation on which takes precedence! |

---

## 3. Formula Reconciliation Register

| ID | Particular | Client Formula | Source Reference | Existing Formula (`feasibilityEngine.js` / UI) | Required Formula | Status |
|---|---|---|---|---|---|---|
| **FR-01** | SQM to SQFT Conversion | `10.7639104167` (Rebuild Spec 4.8); both Excel sheets used `10.764` | Rebuild Spec 4.8 vs Asolkar Sir & Manewada `12.01.38`/`12.02.20` | `SQM_TO_SQFT = 10.764` | `10.7639104167` per Phase 0.4 precedence #1 (note minor variance vs legacy Excel) | **INCORRECT** (Update `10.764` → `10.7639104167`) |
| **FR-02** | Net Plotable Area | `Plot Area - Proposed DP Deductions` (City Survey & Site kept independent) | Scope Correction §5; Asolkar Sir `E6:E10` | `Math.max(0, plotArea - dpDeductions)` in engine; UI hides Survey, Site, DP inputs | `Math.max(0, Plot Area - Proposed DP Deductions)`; expose independent `City Survey`, `Site`, `DP Deductions` in Area Statement | **CONFIRMED** (Scope Correction §5; restore missing UI fields) |
| **FR-03** | Basic FSI Area | `Net Plotable Area × Basic FSI Factor` (`1.10`) | Asolkar Sir; Manewada `12.01.38`; Spec 3.4 | `plotableAreaSqm * basicFsiFactor` | `Net Plotable Area × Basic FSI Factor` | **CONFIRMED** |
| **FR-04** | Permissible Paid FSI Area | `Net Plotable Area × Paid FSI Factor` (`0.50`) | Asolkar Sir; Manewada `12.01.38`; Spec 3.4 | `plotableAreaSqm * paidFsiFactor` | `Net Plotable Area × Paid FSI Factor` | **CONFIRMED** |
| **FR-05** | Proposed / Chargeable Paid FSI | Auto-suggested Paid FSI consumption with architect editing and separate calculated vs effective values | Scope Correction §5; Spec 3.4 | Hardcodes `proposedPaidFsiSqm = permissiblePaidFsiSqm` | Auto-suggest `calculatedProposedPaidFsiFactor`, allow architect edit `proposed_paid_fsi_factor` (`0..paid_fsi_factor`), charge only `effectiveProposedPaidFsiSqm` | **CONFIRMED / IMPLEMENT** |
| **FR-06** | 24m Road Width Total TDR | Regular plots use Road-Width Total TDR (`9m: 0.40, 12m: 0.65, 15m: 0.80, 18m: 0.90, 24m: 1.10`); Manewada `1.15` treated as project reference/override | Scope Correction §2, §5; `ROAD_WIDTH_TOTAL_TDR_MAP`; `tdrSplitAndOverrides.test.js` | `ROAD_WIDTH_TOTAL_TDR_MAP[24] = 1.10` | Preserve `ROAD_WIDTH_TOTAL_TDR_MAP` (`24m = 1.10`) as configurable matrix | **CONFIRMED** |
| **FR-07** | Regular & Slum TDR Split | Regular plots split Total TDR 50/50 (`Regular + Slum = Total`); Admin edits Regular, Slum = remainder | Spec 3.5; `tdrSplitAndOverrides.test.js` | `deriveTdrSplit()` implements 50/50 split and HTTP 400 validation | Preserve `deriveTdrSplit()` for Regular plots; enforce HTTP 400 on invalid split | **CONFIRMED** |
| **FR-08** | Gunthewari Plot TDR Eligibility | **Regular plots use Total TDR; Gunthewari uses Slum TDR only** (`Regular TDR = 0` locked) | Scope Correction §5 (`FR-08`); `ROAD_WIDTH_TDR_MAP` (`slum` tiers: `9m:0.20, 12m:0.325, 15m:0.40, 18m:0.45, 24m:0.55`) | `calculateAreaMetrics` & `PUT /area` read `is_gunthewari` and **never apply it** | For `is_gunthewari = true`: set `regularTdrFactor = 0`, `slumTdrFactor = ROAD_WIDTH_TDR_MAP[rw].slum` (`total / 2`), `totalTdrFactor = slumTdrFactor`; reject `regular_tdr_factor > 0` | **CONFIRMED / IMPLEMENT** |
| **FR-09** | Proposed / Actual TDR Consumed | Auto-suggested Regular & Slum TDR consumption with architect editing and separate calculated vs effective values; unused TDR never charged | Scope Correction §5; Spec 3.6; Asolkar & Manewada | `proposedTdrSqm = regularTdrSqm + slumTdrSqm` (always 100% consumed!) | Auto-suggest `proposed_regular_tdr_factor` / `proposed_slum_tdr_factor`, allow architect edits (`<= permissible`), charge only effective consumed TDR in Sec A & B | **CONFIRMED / IMPLEMENT** |
| **FR-10** | Primary FSI | `Basic FSI + Effective Proposed Paid FSI + Effective Proposed TDR` | Spec 3.6; Asolkar & Manewada Row E (`B+C+D`) | Labeled "Total Builtup Area" (`proposedTotalBuiltupSqm`); uses 100% Paid FSI & TDR | Align labels (`Primary FSI / Total Builtup`) and sum effective proposed components | **INCORRECT → FIX** |
| **FR-11** | Ancillary Area & Mixed-Use Primary FSI Allocation | **Explicit Residential / Commercial Primary FSI allocation totaling 100%, with separate 60% Res & 80% Comm ancillary** | Scope Correction §5 (`FR-11`); Spec 3.7 | Permissible splits by floor count ratio; ignores explicit `%` allocation | Residential `100%/0%`; Commercial `0%/100%`; Mixed Use explicit `primary_fsi_residential_pct + primary_fsi_commercial_pct = 100%`; Ancillary `60% Res` + `80% Comm` applied to respective portions | **CONFIRMED / IMPLEMENT** |
| **FR-12** | P-Line, Area Balance & Margin (`H/5`) | `Permissible P-Line = Builtup + Ancillary`; `Area Balance = Permissible P-Line - Proposed P-Line`; `Margin = Total Height / 5`; existing builtup / dividing factor retained in optional check | Spec 3.8; Asolkar `Area (SQ M)` Row 18, 60, 79 | `permissiblePline` & floor `totalProposedPline` computed; `Margin H/5` not displayed in Floor Statement footer | Display exact Area Statement rows + Floor Statement `Area Balance` & `Margin H/5`; keep optional `existing_builtup` & `dividing_factor` without extra clutter | **INCORRECT → FIX** |
| **FR-13** | Floor-wise P-Line Table (10 Columns) | Floor-wise hierarchy distributed by Building Use Primary FSI pool, Lobby 15% default, Sale = P-Line - Lobby, Area/Unit = Sale / Units | Scope Correction §1, §5; Spec 3.9 | Competing `handleUpdateFloor` math in `AreaFeasibilityTab.jsx`; abbreviated headers; sq_ft input bug | Remove competing frontend math, convert table/inputs cleanly on `Sq M / Sq Ft`, keep 10 standard headers | **INCORRECT → FIX** |
| **FR-14** | Occupancy Parking Statement | **EXCLUDED FROM REBUILD SCOPE** | Scope Correction §§3, 5, 7 (*"Do not implement the excluded parking calculation reference"*) | Rendered in Section 8 of `AreaStatementForm.jsx` | Remove Parking Calculations section from UI, documents, and exports; retain DB `parking_config` column untouched | **EXCLUDED / REMOVE FROM UI** |
| **FR-15** | Cost A, Cost B, Actual Construction Cost | Cost A (`15,000`), Cost B (`26,620`), Actual Construction (`cost_of_construction_rate`); never add A/B into total | Spec 4.3; Scope Correction §§2, 5; Manewada `12.02.20` | `constRate = cost_of_construction_rate || estimated_cost_b_rate || 0` (**falls back to Cost B ₹26,620 & drops `0`!**) | Strictly decouple Actual Construction Rate from Cost B (`parseNum(cost_of_construction_rate, 0)`); preserve explicit `0` | **CONFIRMED / FIX BUG** |
| **FR-16** | Cost of Plot (Section H) | Direct lump-sum Admin input (`cost_of_plot`), include/exclude toggle preserving saved amount; remove dead rate input | Scope Correction §5; Spec 4.4 | Engine obeys lump-sum & toggle, **but** UI keeps dead `Plot Acquisition Rate` input | Remove dead `Plot Acquisition Rate` field from UI; preserve raw amount when excluded | **CONFIRMED / REMOVE DEAD UI** |
| **FR-17** | Statutory 1: Plan Registration Fees | `Proposed P-Line × ₹5.90/sqm` | Asolkar `J13`; Manewada `12.02.20`; Spec 4.5 | `effectivePlineSqm * 5.90` | `Effective Proposed P-Line × 5.90` | **CONFIRMED** |
| **FR-18** | Statutory 2: Security Deposit | `min(1% of Cost A, ₹75,000)` | Asolkar `R14`; Manewada `12.02.20`; Spec 4.5 | `estimatedCostA > 0 ? min(0.01 * estimatedCostA, 75000) : 0` | `min(0.01 * Estimated Cost A, 75000)` | **CONFIRMED** |
| **FR-19** | Statutory 3: Stacking Charges | `min(0.5% of Cost A, ₹50,000)` | Asolkar `R15`; Manewada `12.02.20`; Spec 4.5 | `estimatedCostA > 0 ? min(0.005 * estimatedCostA, 50000) : 0` | `min(0.005 * Estimated Cost A, 50000)` | **CONFIRMED** |
| **FR-20** | Statutory 4: Ancillary Area Charges | `Total Effective Ancillary Area × (10% × RR Rate)` | Scope Correction §5; Spec 4.5 | `effectiveAncillarySqm * (10% * rrRate)` | `Total Effective Ancillary Area (Res 60% + Comm 80%) × (10% × RR Rate)` | **CONFIRMED** |
| **FR-21** | Statutory 5: Sewer Connection Charges | `Proposed P-Line × ₹2.50/sqm` | Asolkar `R17`; Manewada `12.02.20`; Spec 4.5 | `effectivePlineSqm * 2.50` | `Effective Proposed P-Line × 2.50` | **CONFIRMED** |
| **FR-22** | Statutory 6: Development Charges | `Proposed P-Line × (2% × RR Rate)` | Asolkar `R18`; Manewada `12.02.20`; Spec 4.5 | `effectivePlineSqm * (2% * rrRate)` | `Effective Proposed P-Line × (2% × RR Rate)` | **CONFIRMED** |
| **FR-23** | Statutory 7: Premium FSI Charges | `Effective Chargeable Paid FSI Area × (40% × RR Rate)` | Scope Correction §5; Manewada Row 7; Spec 4.5 | Uses `permissiblePaidFsiSqm` (overcharges unused Paid FSI!) | `Effective Proposed (Chargeable) Paid FSI Area × (40% × RR Rate)` | **CONFIRMED / FIX BUG** |
| **FR-24** | Statutory 8: Tree Plantation | `min((Effective P-Line / 74.32) × 500, 25000)` | Scope Correction §5 (*approved statutory rule*); Asolkar label `(MAX 25000.00)` | `min((effectivePlineSqm / 74.32) * 500, 25000)` | Preserve approved `min((P-Line / 74.32) * 500, 25000)` with Admin override support | **CONFIRMED** |
| **FR-25** | Statutory 9: Heritage Fund | `2% of effective Development Charges` (`0` if disabled) | Asolkar `R21`; Manewada `12.02.20`; Spec 4.5 | `0.02 * effectiveDevCharges` | `2% × Effective Development Charges` | **CONFIRMED** |
| **FR-26** | Statutory 10: Labour Welfare Cess | `1% of RR Construction Cost (Cost B)` | Asolkar `R22`; Manewada `12.02.20`; Spec 4.5 | `0.01 * estimatedCostB` | `1% × Estimated Cost B` | **CONFIRMED** |
| **FR-27** | Statutory 11: TDR Loading Charges | `3% of RR Rate × Effective Chargeable TDR Area` | Scope Correction §5; Manewada Row 11; Spec 4.5 | Uses `permissibleTdrSqm` (overcharges unused TDR!) | `Effective Proposed TDR Area × (3% × RR Rate)` | **CONFIRMED / FIX BUG** |
| **FR-28** | Statutory 12: Labour Welfare on Parking | Pure manual Admin input (`amount`), preserving explicit `0` (no override modal or residual override lookup) | Scope Correction §5; Spec 4.5 & 4.6 | Engine checks `overrides` map first (`L1020`) | Pure manual input (`is_manual: true`, remove `overrides` lookup & reject override API on it) | **CONFIRMED / FIX BUG** |
| **FR-29** | Amalgamation Charges | Excluded as payable item (`0`) | Scope Correction §5; Spec 4.7 (`REQ-J`) | Returns `0`, hidden in UI | Keep excluded (`0`, hidden from demand table) | **CONFIRMED** |
| **FR-30** | Additional Project Costs (Sec C + Infra + Interest + E + F + G) | Approved Excel rows: `Minor Expenses`, `BPMS`, `Airport NOC`, `Fire NOC`, `Entertainment`, `Consultants / Advocate Fees`, `Extra Stamp Duty`, `Infra`, `Interest`, `Basement E`, `Rent F`, `Stacked Parking G` | Scope Correction §§2, 7; Asolkar `R29:R42` | Engine sums all Sec C & Interest cols, **but UI lacks 8 inputs**; `PUT /financial` parses text `period_months` as int! | Restore all missing Sec C & Interest inputs in Financial Viability form; separate `period_months` (text) from `rent_months` (int); fix Basement/Stacked shadow bugs | **CONFIRMED / RESTORE UI & FIX BUGS** |
| **FR-31** | TDR Acquisition Cost (Sec B) | `Effective Chargeable TDR Area × RR Rate × tdr_purchase_factor` (`0.55` default, explicit `0` preserved, Admin override supported) | Scope Correction §5; Asolkar `R27` | Uses `permissibleTdrSqm` & hardcodes `0.55` (`L1154`); `tdr_purchase_factor` DB column missing! | Add DB col `tdr_purchase_factor`, use `parseNum(financial.tdr_purchase_factor, 0.55)`, compute on Effective Proposed TDR only | **CONFIRMED / FIX BUG & SCHEMA** |
| **FR-32** | Receipts & Salable Units Cost | Single unified Receipts table inside Financial Viability (`Period Required` + unit rows with `Super B/Up = Carpet + Loading` where Loading supports `+sq ft` or `+%`, `Rate/Sq ft`, Landowner unit exclusion from Developer Receipts) | Scope Correction §§2, 3, 7; Asolkar `R46:R53` | Competing `Sales Realisation by Floor` (`floors.rate_per_sqm`); `unit_count || 1` & `rate_per_sqft || 6000` drop `0`; `10.764`; no unit Edit | Remove duplicate Section 5 Floor Sales; unify into Receipts `Salable Units Cost` with Add/Edit/Delete & `%` or `sq ft` loading; fix `||` zero bugs & `10.7639104167` | **CONFIRMED / UNIFY & FIX** |
| **FR-33** | Total Project Cost | `A + B + C + D + E + F + G + H(if included) + Infra + Interest` (Cost A/B never added) | Scope Correction §2; Spec 4.9 | `A+B+C+D+E+F+G+H(if included)+Infra+Interest` | Keep approved formula cleanly | **CONFIRMED** |
| **FR-34** | Project Viability & Profit / ROI | `Project Cost`, `Receipts` (Developer), `Profit = Receipts - Project Cost`; `ROI (%) = Profit / Total Project Cost × 100` (rows 4, 5, 7 left un-invented / blank per Excel) | Scope Correction §§2, 3; Asolkar `R54:R64` | `netProfit = totalReceipts - totalProjectCost`; `roiPct = netProfit / totalProjectCost * 100` | Display exact `Project Viability` (`Project Cost`, `Receipts`, `Profit`) + `ROI %` cleanly without inventing unapproved formulas for `Gross Savings` / `Initial Investment` | **CONFIRMED** |

---

## 4. Scope Correction Resolution Status

All critical functional & architectural questions required to begin **Stage 2–9** have been resolved by the **Scope Correction & Final Scope Clarification**:
1. **Strict 2-Tab Document Scope:** `Area Statement` and `Financial Viability` ONLY (no `Project Summary`, `Report Preview`, KPI cards, `Occupancy Parking`, or separate `Sales Inventory`).
2. **Resolved Formula Rules:** Net Plotable = `Plot - DP`; Paid FSI & TDR have auto-suggested calculated + architect-editable effective values; Gunthewari uses Slum TDR only (`Regular = 0`); Mixed Use uses explicit Res % + Comm % summing to `100%` with independent `60%` / `80%` ancillary; Cost of Plot lump-sum toggle, statutory charges, `10.7639104167`, and `0` preservation rules confirmed.
3. **Preserved Non-Blocking Notes:** `FINANCIAL VIABILITY Calculation_17-09-2025.pdf` was never provided (flagged in [reference/README.md](file:///D:/Freelance/ds16-v1/docs/feasibility-rebuild/reference/README.md)); all calculations in the two target tables are now completely grounded in `Sample Financial Viability Asolkar Sir.xlsx`, Manewada PDF supporting rules, and the explicit approved business directives without guessing unapproved formulas.
