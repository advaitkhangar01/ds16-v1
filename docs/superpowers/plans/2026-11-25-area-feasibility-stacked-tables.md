# Area Feasibility Stacked Tables Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the combined Area Statement table in the Feasibility Document Preview into two distinct tables—one for Permissible values and one for Proposed values—stacked sequentially below one another with matching rows and unit display responsiveness.

**Architecture:** Update `FeasibilityDocumentPreview.jsx` to render two sequential, styled table blocks: Table 1 for Permissible Potential and Table 2 for Proposed Architectural Design, maintaining identical row metrics (1, 2, A through H). Align `handleExportExcel` in `AreaFeasibilityTab.jsx` so exported Excel workbooks mirror the sequential structure.

**Tech Stack:** React (Vite, TailwindCSS, Lucide-react), SheetJS (`xlsx`), jsPDF & html2canvas.

**Spec:** User request: "can we create separate tables for proposed and permissible values. with same rows and columns. only separate tables for both of these column" stacked sequentially below one another.

## Global Constraints

- Units: Both tables must respect the live unit toggle (`sq_m` vs `sq_ft`) with factor `10.764` when `sq_ft` is active.
- Exact Rows in Both Tables:
  1. `1` - Area Of Plot
  2. `2` - Deductions For Proposed D.P. Road / Reservation
  3. `A` - Plotable Area (Net Development Plot)
  4. `B` - Basic FSI
  5. `C` - Paid FSI
  6. `D` - TDR Area
  7. `E` - Total Builtup Area (B + C + D)
  8. `F` - TOTAL FSI CONSUMPTION RATIO
  9. `G` - Ancillary FSI (60% Residential)
  10. `H` - TOTAL P-LINE AREA (E + G)
- Printing & Canvas: The container `#feasibility-document-canvas` must remain compatible with `html2canvas` for high-resolution PDF generation without overflowing or clipping.

## Review Focus

- Unit conversion (`unitFactor`) applied consistently to all area fields in both tables.
- Decimal formatting: FSI consumption ratio (Row F) formatted to 3 decimal places; all area values formatted to 2 decimals.
- Empty values: Row 1 & Row 2 in the Proposed table correctly display an em-dash (`—`) since deductions and raw plot areas belong to the boundary survey/permissible baseline.
- Table headers and aesthetic hierarchy: Clear distinction between the Permissible table header (slate/indigo tone) and Proposed table header (emerald/slate tone) for intuitive visual scanning.
- Excel Export: Area Statement worksheet accurately outputs both tables sequentially with clear section dividers.

---

### Task 1: Refactor Document Preview into Sequentially Stacked Tables

**Files:**
- Modify: `client/src/components/projects/feasibility/FeasibilityDocumentPreview.jsx`

**Interfaces:**
- Consumes: `statement`, `areaMetrics`, `unitDisplay`, `unitFactor`, `unitLabel`, `formatNumber`
- Produces: Two stacked table elements inside `#feasibility-document-canvas`

- [ ] **Step 1: Construct the Permissible Area Statement Table**
Render the first table block with title `1. Permissible Area Statement (${unitLabel})` containing:
- Table Headers: `Sr.` (center, w-10), `Particulars` (left), `Permissible (${unitLabel})` (right, w-36).
- Rows 1, 2, A through H mapping to `statement.plot_area_sqm`, `statement.dp_deductions_sqm`, `areaMetrics.plotableAreaSqm`, `areaMetrics.permissibleFsiSqm`, `areaMetrics.permissiblePaidFsiSqm`, `areaMetrics.permissibleTdrSqm`, `areaMetrics.permissibleTotalBuiltupSqm`, `areaMetrics.permissibleTotalFsi`, `areaMetrics.permissibleAncillaryResSqm`, `areaMetrics.permissiblePlineTotalSqm`.

- [ ] **Step 2: Construct the Proposed Area Statement Table**
Render the second table block directly below Table 1 with title `2. Proposed Area Statement (${unitLabel})` containing:
- Table Headers: `Sr.` (center, w-10), `Particulars` (left), `Proposed (${unitLabel})` (right, w-36).
- Rows 1 & 2 showing `—`.
- Rows A through H mapping to `areaMetrics.plotableAreaSqm`, `areaMetrics.proposedBasicFsiSqm`, `areaMetrics.proposedPaidFsiSqm`, `areaMetrics.proposedTdrSqm`, `areaMetrics.proposedTotalBuiltupSqm`, `areaMetrics.proposedTotalFsi`, `areaMetrics.proposedAncillaryResSqm`, `areaMetrics.proposedPlineTotalSqm`.
- Highlight Row E (Total Builtup) and Row H (Total Proposed P-Line) with matching theme accent colors.

- [ ] **Step 3: Verify subsequent sections and numbering**
Adjust sub-heading labels for the remaining sections so the document hierarchy remains coherent:
- 3. Proposed Floor-wise P-Line Breakdown
- 4. Statutory & Local Authority Charges (Section A)
- 5. Project Direct Development Costs (Sections B to H)
- 6. Project Salable Receipts & Realization
- 7. Executive Profitability Summary

- [ ] **Step 4: Verify client build**
Run: `npm --prefix client run build`
Expected: Build succeeds with 0 errors.

---

### Task 2: Update Excel Export Format for Stacked Area Tables

**Files:**
- Modify: `client/src/components/projects/feasibility/AreaFeasibilityTab.jsx:310-357`

**Interfaces:**
- Consumes: `statement`, `areaMetrics`, `floors`, `financialMetrics`
- Produces: `XLSX` worksheet `Area Statement` containing sequential tables for Permissible and Proposed metrics.

- [ ] **Step 1: Update `handleExportExcel` structure**
In `AreaFeasibilityTab.jsx`, structure `areaRows` to present:
1. Permissible Potential Table rows (`Sr`, `Particulars`, `Permissible Value`)
2. Separator row
3. Proposed Area Statement rows (`Sr`, `Particulars`, `Proposed Value`)

- [ ] **Step 2: Verify client build**
Run: `npm --prefix client run build`
Expected: Build succeeds with 0 errors.

---

### Task 3: End-to-End Visual and Functional Verification

**Files:**
- Test: `client/src/components/projects/feasibility/FeasibilityDocumentPreview.jsx`
- Test: `client/src/components/projects/feasibility/AreaFeasibilityTab.jsx`

- [ ] **Step 1: Run frontend build and lint check**
Run: `npm --prefix client run build`
Expected: Build completes successfully.

- [ ] **Step 2: Run server test suite**
Run: `npm --prefix server test`
Expected: Feasibility calculation tests continue to pass without regressions.
