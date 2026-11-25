# Excel-to-DS16 Field Mapping Register

Reference Workbook: `Sample Financial Viability Asolkar Sir.xlsx` (Sheet: `FINANCIAL VIABILITY`)

| Excel Cell | Excel Label / Particular | Current Formula / Value | Classification | Authoritative DS16 Source / Module | Target Database Field | Calculation Dependency / Rule |
|:---|:---|:---|:---|:---|:---|:---|
| **C1** | FINANCIAL VIABILITY | Sheet Title | Header | Static UI Header | N/A | Subtab Title |
| **C3:J3** | Column Headers | PLOT AREA, BASIC FSI, etc. | Header | Static UI Table Headers | N/A | Overview Table Structure |
| **C4** | PLOT AREA | `270` | **Auto-Sourced (Cat A)** | **Area Statement** | `project_area_statements.plot_area_sqm` | Sourced from Area Statement; read-only in Financial Viability |
| **D4** | BASIC FSI | `1.1` | **Auto-Sourced (Cat A)** | **Area Statement** | `project_area_statements.basic_fsi_factor` | Sourced from Area Statement; read-only in Financial Viability |
| **E4** | PREMIUM FSI | `0.5` | **Auto-Sourced (Cat A)** | **Area Statement** | `project_area_statements.paid_fsi_factor` | Sourced from Area Statement; read-only in Financial Viability |
| **F4** | TDR | `0.65` | **Auto-Sourced (Cat A)** | **Area Statement** | `project_area_statements.tdr_factor` | Sourced from Area Statement; read-only in Financial Viability |
| **G4** | TOTAL POTENTIAL | `=D4+E4+F4` (2.25) | **Calculated** | Calculation Engine | Derived in `areaMetrics.permissibleTotalFsi` | Sum of FSI factors |
| **H4** | ANCILLARY AREA (Comm) | `0.8` (80%) | **Auto-Sourced (Cat A)** | **Area Statement** | `project_area_statements.ancillary_commercial_pct` | Applied when building use is Commercial |
| **I4** | ANCILLARY AREA (Res) | `0.6` (60%) | **Auto-Sourced (Cat A)** | **Area Statement** | `project_area_statements.ancillary_residential_pct` | Applied when building use is Residential |
| **C5:J5** | PERMISSIBLE ROW | Permissible Potential | **Calculated** | Calculation Engine | `areaMetrics` | Derived plotable area, permissible FSI, TDR, and P-Line |
| **C6:J6** | PROPOSED ROW | Proposed Potential | **Calculated** | Calculation Engine | `areaMetrics` | Sourced from Floor Plates (`totalProposedPlineSqm`, etc.) |
| **C8:D8** | ESTIMATED COST-A | `15000` | **Essential Assumption (Cat B)** | Financial Viability | `project_financial_viabilities.estimated_cost_a_rate` | Drives Municipal Security Deposit & Stacking Charges |
| **E8** | P-Line for Cost-A | `=J6` (926.64) | **Auto-Sourced (Cat A)** | Floor Plates / Area Stmt | `areaMetrics.totalProposedPlineSqm` | Total Proposed P-Line area |
| **G8** | Total Cost-A Amount | `=E8*D8` (₹1,38,99,600) | **Calculated** | Calculation Engine | Derived in `financialMetrics.estimatedCostA` | `totalProposedPlineSqm * estimated_cost_a_rate` |
| **C9:D9** | ESTIMATED COST-B | `26620` | **Essential Assumption (Cat B)** | Financial Viability | `project_financial_viabilities.estimated_cost_b_rate` | Drives Labour Welfare Cess & Parking Labour Cess |
| **E9** | P-Line for Cost-B | `=J6` (926.64) | **Auto-Sourced (Cat A)** | Floor Plates / Area Stmt | `areaMetrics.totalProposedPlineSqm` | Total Proposed P-Line area |
| **G9** | Total Cost-B Amount | `=E9*D9` (₹2,46,67,156.80) | **Calculated** | Calculation Engine | Derived in `financialMetrics.estimatedCostB` | `totalProposedPlineSqm * estimated_cost_b_rate` |
| **E10:G10**| RR RATES RS | `24340` | **Essential Assumption (Cat B)** | Financial Viability | `project_financial_viabilities.rr_rate_per_sqm` | Ready Reckoner benchmark rate (₹/sq m) |
| **B13:J13**| PLAN REGISTRATION FEES | `=J6 * 5.9` (₹5,467.18) | **Calculated / Override (Cat D)**| Calculation Engine | `project_statutory_charges` (`PLAN_REGISTRATION`) | Rate: ₹5.90/sq m of P-Line area |
| **B14:J14**| SECURITY DEPOSIT | `=1% * G8`, Cap: ₹75,000 | **Calculated / Override (Cat D)**| Calculation Engine | `project_statutory_charges` (`SECURITY_DEPOSIT`) | 1% of Cost A, capped at ₹75,000 |
| **B15:J15**| STACKING CHARGES | `=0.5% * G8`, Cap: ₹50,000| **Calculated / Override (Cat D)**| Calculation Engine | `project_statutory_charges` (`STACKING_CHARGES`) | 0.5% of Cost A, capped at ₹50,000 |
| **B16:J16**| ANCILLARY AREA CHARGES | `=I6 * (10% * RR)` | **Calculated / Override (Cat D)**| Calculation Engine | `project_statutory_charges` (`ANCILLARY_CHARGES`) | Ancillary Area * (10% of RR Rate) |
| **B17:J17**| SEWER CONNECTION | `=J6 * 2.5` (₹2,316.60) | **Calculated / Override (Cat D)**| Calculation Engine | `project_statutory_charges` (`SEWER_CONNECTION`) | Rate: ₹2.50/sq m of P-Line area |
| **B18:J18**| DEVELOPMENT CHARGES | `=J6 * (2% * RR)` | **Calculated / Override (Cat D)**| Calculation Engine | `project_statutory_charges` (`DEVELOPMENT_CHARGES`) | P-Line Area * (2% of RR Rate) |
| **B19:J19**| PREMIUM FSI CHARGES | `=E6 * (40% * RR)` | **Calculated / Override (Cat D)**| Calculation Engine | `project_statutory_charges` (`PREMIUM_FSI`) | Paid FSI Area * (40% of RR Rate) |
| **B20:J20**| TREE PLANTATION | `=(J6/74.32)*500`, Cap: 25k| **Calculated / Override (Cat D)**| Calculation Engine | `project_statutory_charges` (`TREE_PLANTATION`) | ₹500 per 74.32 sq m P-Line, max ₹25,000 |
| **B21:J21**| HERITAGE FUND | `=2% * Development Charges`| **Calculated / Override (Cat D)**| Calculation Engine | `project_statutory_charges` (`HERITAGE_FUND`) | 2% of Development Charges |
| **B22:J22**| LABOUR WELFARE CESS | `=1% * G9` | **Calculated / Override (Cat D)**| Calculation Engine | `project_statutory_charges` (`LABOUR_WELFARE_CESS`) | 1% of Total Cost B |
| **B23:J23**| TDR LOADING CHARGES | `=F6 * (3% * RR)` | **Calculated / Override (Cat D)**| Calculation Engine | `project_statutory_charges` (`TDR_LOADING_CHARGES`) | TDR Area * (3% of RR Rate) |
| **B24:J24**| AMALGAMATION CHARGES | `=C4 * 200` | **Excluded (REQ-J)** | Excluded | `project_statutory_charges` (`AMALGAMATION`) | Excluded per approved DS16 requirements |
| **B25:J25**| LABOUR WELFARE ON PARKING| `=1% * (Parking Area * Cost B)`| **Calculated / Override (Cat D)**| Calculation Engine | `project_statutory_charges` (`LABOUR_WELFARE_PARKING`)| 1% of parking area (225 sqm) * Cost B rate |
| **I26:J26**| NMC DEMAND TOTAL (A) | `=SUM(J13:J25)` | **Calculated / Override (Cat D)**| Calculation Engine | Derived in `financialMetrics.totalStatutoryDemandA`| Sum of all enabled statutory charges |
| **B27:J27**| COST OF TDR (B) | `=TDR Area * 55% * RR` | **Calculated / Override (Cat D)**| Calculation Engine | Derived in `financialMetrics.costOfTdrB` | Sourced TDR area * 0.55 * RR rate |
| **C29:J29**| MINOR EXPENSES | `234233` | **Conditional Input (Cat C)** | Financial Viability | `project_financial_viabilities.minor_expenses` | Miscellaneous municipal expenses |
| **C30:J30**| BPMS STAFF CHARGES | `100000` | **Conditional Input (Cat C)** | Financial Viability | `project_financial_viabilities.bpms_staff_charges` | Building Plan Management System scrutiny fees |
| **C31:J31**| AIRPORT NOC | `25000` | **Conditional Input (Cat C)** | Financial Viability | `project_financial_viabilities.airport_noc` | Height clearance NOC from AAI |
| **C32:J32**| FIRE NOC | `500000` | **Conditional Input (Cat C)** | Financial Viability | `project_financial_viabilities.fire_noc` | Fire & emergency services NOC fees |
| **C33:J33**| ENTERTAINMENT CHARGES | `300000` | **Conditional Input (Cat C)** | Financial Viability | `project_financial_viabilities.entertainment_charges` | Liaison and administrative costs |
| **C34:J34**| EXTRA STAMP DUTY | `FROM ADVOCATE` | **Conditional Input (Cat C)** | Financial Viability | `project_financial_viabilities.extra_stamp_duty` | Legal stamp duty assessment |
| **H35:J35**| TOTAL EXPENSES (C) | `=SUM(J30:J34)` | **Calculated** | Calculation Engine | Derived in `financialMetrics.totalExpensesC` | Sum of municipal NOCs and minor expenses |
| **C36:J36**| COST OF PLOT (H) | Text: 30k, Calc: `270 * 50k` | **Essential Assumption (Cat B)** | Financial Viability | `project_financial_viabilities.cost_of_plot_rate_per_sqm` | Acquisition rate per sq m or lump sum |
| **C37:J37**| COST OF CONSTRUCTION (D)| `=J6 * 20000` | **Essential Assumption (Cat B)** | Financial Viability | `project_financial_viabilities.cost_of_construction_rate` | Construction rate per sq m * P-Line area |
| **C38** | INFRASTRUCTURE COST | Blank in Excel | **Conditional Input (Cat C)** | Financial Viability | `project_financial_viabilities.cost_of_infrastructure` | Offsite utility, drainage, transformer infra |
| **C39** | INTEREST | Blank in Excel | **Conditional Input (Cat C)** | Financial Viability | `project_financial_viabilities.interest_amount` | Construction finance loan interest |
| **C40:J40**| BASEMENT CONSTRUCTION (E)| `=#REF! * 5500` | **Calculated / Override (Cat D)**| Building Config / Fin Viab| `financialMetrics.costOfBasementE` | Basement Area (from Config) * Basement Rate |
| **C41:J41**| RENT EXPENSES (F) | `=15000 * 3 * 24` | **Essential Assumption (Cat B)** | Financial Viability | `financialMetrics.rentCostF` | Tenements * Rent/mo * Months |
| **C42:J42**| STACKED PARKING (G) | `=10 * 200000` | **Conditional Input (Cat C)** | Parking Config / Fin Viab | `financialMetrics.stackedParkingCostG` | Slots count (from config) * Cost per slot |
| **H43:J43**| TOTAL PROJECT COST | `=Sum(A+B+C+D+E+F+G+H)` | **Calculated / Override (Cat D)**| Calculation Engine | Derived in `financialMetrics.totalProjectCost` | Comprehensive project development expenditure |
| **B48:I48**| Period Required | `21-24 Months` | **Essential Assumption (Cat B)** | Financial Viability | `project_financial_viabilities.period_months` | Project execution timeline |
| **C50:I52**| Salable Units Realization | Linked floor areas * rate | **Auto-Sourced (Cat A) + Assumption (Cat B)** | Area Statement Floors | `project_area_floors` / `project_salable_units` | Carpet area + 300 loading * selling rate |
| **B53:I53**| TOTAL RECEIPTS | `=SUM(I50:J50)` | **Calculated** | Calculation Engine | Derived in `financialMetrics.totalReceipts` | Total realization across all salable units |
| **B54:B57**| Gross/Net Savings, ROI, Init Inv | Blank labels in Excel | **Unresolved / Proposed** | Documented | Flagged in Unresolved Register | No formula in workbook; pending approval |
| **B62:D62**| Project Cost Summary | `=J43` | **Calculated** | Calculation Engine | Derived in `financialMetrics.totalProjectCost` | Re-statement of Total Project Cost |
| **B63:D63**| Receipts Summary | `=I53` | **Calculated** | Calculation Engine | Derived in `financialMetrics.totalReceipts` | Re-statement of Total Receipts |
| **B64:D64**| PROFIT | `=D63 - D62` | **Calculated** | Calculation Engine | Derived in `financialMetrics.netProfit` | Total Receipts minus Total Project Cost |
