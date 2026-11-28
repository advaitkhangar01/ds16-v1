// server/services/feasibilityExportService.js
// Generates genuine formula-driven Excel (.xlsx) workbooks and clean vector PDF documents
// strictly reflecting the two approved DS16 Feasibility tables:
//   1. Area Statement (Sq M & Sq Ft + Floor-wise P-Line Table)
//   2. Financial Viability (Area Overview, Cost Norms, Section A..H, Receipts, Viability)

const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const { SQM_TO_SQFT, parseNum } = require('./feasibilityEngine');

const BORDER_THIN = {
  top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
};

const BORDER_TOTAL = {
  top: { style: 'thin', color: { argb: 'FF334155' } },
  left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  bottom: { style: 'double', color: { argb: 'FF0F172A' } },
  right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
};

const FILL_HEADER = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
const FILL_SUBHEADER = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
const FILL_ACCENT = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF7ED' } };
const FILL_GREEN = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFECFDF5' } };

const FONT_TITLE = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
const FONT_SUBTITLE = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF0F172A' } };
const FONT_TH = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF0F172A' } };
const FONT_TD = { name: 'Calibri', size: 9, color: { argb: 'FF1E293B' } };
const FONT_TD_BOLD = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF0F172A' } };
const FONT_MUTED = { name: 'Calibri', size: 8, italic: true, color: { argb: 'FF64748B' } };

const FMT_AREA3 = '#,##0.000';
const FMT_AREA2 = '#,##0.00';
const FMT_FACTOR = '0.000';
const FMT_INR = '₹#,##0.00';
const FMT_PCT = '0.00%';
const FMT_INT = '#,##0';

function styleRowCells(ws, rowNum, colStart, colEnd, { font = FONT_TD, fill = null, border = BORDER_THIN, align = null } = {}) {
  const row = ws.getRow(rowNum);
  for (let c = colStart; c <= colEnd; c++) {
    const cell = row.getCell(c);
    cell.font = font;
    if (fill) cell.fill = fill;
    if (border) cell.border = border;
    if (align && align[c]) cell.alignment = align[c];
  }
}

function fmtInrPdf(val) {
  const n = Number(val) || 0;
  return 'Rs. ' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtNumPdf(val, dec = 2) {
  const n = Number(val) || 0;
  return n.toLocaleString('en-IN', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

/**
 * Populate both 'Area (SQ M)' and formula-linked 'Area (SQ FT)' worksheets.
 */
function buildAreaSheets(wb, data) {
  const { project = {}, statement = {}, floors = [], areaMetrics = {} } = data;
  const projectTitle = `${project.name || 'DS16 Project'}${project.location ? ` — ${project.location}` : ''}`;

  const wsM = wb.addWorksheet('Area (SQ M)', {
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    views: [{ state: 'frozen', ySplit: 4 }]
  });

  const wsF = wb.addWorksheet('Area (SQ FT)', {
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    views: [{ state: 'frozen', ySplit: 4 }]
  });

  const colWidths = [9, 36, 18, 16, 18, 18, 16];
  colWidths.forEach((w, i) => {
    wsM.getColumn(i + 1).width = w;
    wsF.getColumn(i + 1).width = w;
  });

  // Helper to configure banner & metadata on each sheet
  const initBanner = (ws, unitHeader) => {
    ws.mergeCells('A1:G1');
    ws.getCell('A1').value = `DESIGN STUDIO 16 — AREA STATEMENT (${unitHeader})`;
    ws.getCell('A1').font = FONT_TITLE;
    ws.getCell('A1').fill = FILL_HEADER;
    ws.getCell('A1').alignment = { vertical: 'middle', horizontal: 'center' };
    ws.getRow(1).height = 24;

    ws.mergeCells('A2:G2');
    ws.getCell('A2').value = `Project: ${projectTitle}  |  Building Use: ${areaMetrics.buildingUse || 'Residential'}  |  Classification: ${areaMetrics.isGunthewari ? 'Gunthewari (Slum TDR Only)' : 'Regular Development'}  |  Road Width: ${areaMetrics.roadWidth ? `${areaMetrics.roadWidth} m` : 'N/A'}`;
    ws.getCell('A2').font = FONT_SUBTITLE;
    ws.getCell('A2').fill = FILL_SUBHEADER;
    ws.getCell('A2').alignment = { vertical: 'middle', horizontal: 'left' };
    ws.getCell('A2').border = BORDER_THIN;
    ws.getRow(2).height = 20;
  };

  initBanner(wsM, 'SQ. M.');
  initBanner(wsF, 'SQ. FT.');

  // Table 1: Area Statement (Rows 4..20 on Area (SQ M))
  // Exact mapping:
  // R4: Column headers
  // R5: 1. Area Of Plot
  // R6: 2. As Per City Survey Record
  // R7: 3. As per site
  // R8: 4. Deductions For Proposed D.P.
  // R9: A. Plotable area (=E5-E8)
  // R10: B. Basic Permissible FSI
  // R11: C. Paid FSI
  // R12: D1. Regular TDR
  // R13: D2. Slum TDR
  // R14: D. Total TDR (=E12+E13)
  // R15: E. Primary FSI / Total Builtup Area (=E10+E11+E14)
  // R16: F. TOTAL FSI Ratio (=E15/E9)
  // R17: G1. Ancillary - Comm. = 80%
  // R18: G2. Ancillary - Residential = 60%
  // R19: H. Total P-Line Area (G+E) (=E15+E17+E18)
  const populateTable1Headers = (ws, unitTxt) => {
    ws.getCell('A4').value = 'Sr. No.';
    ws.getCell('B4').value = 'Particulars';
    ws.getCell('C4').value = 'Allocation / Notes';
    ws.getCell('D4').value = 'Perm. Factor';
    ws.getCell('E4').value = `Permissible (${unitTxt})`;
    ws.getCell('F4').value = `Proposed (${unitTxt})`;
    ws.getCell('G4').value = 'Prop. Factor';
    styleRowCells(ws, 4, 1, 7, {
      font: FONT_TH,
      fill: FILL_SUBHEADER,
      border: BORDER_THIN,
      align: { 1: { horizontal: 'center' }, 4: { horizontal: 'right' }, 5: { horizontal: 'right' }, 6: { horizontal: 'right' }, 7: { horizontal: 'right' } }
    });
    ws.getRow(4).height = 20;
  };

  populateTable1Headers(wsM, 'Sq. Mtr.');
  populateTable1Headers(wsF, 'Sq. Ft.');

  const plotArea = parseNum(statement.plot_area_sqm, 0);
  const surveyArea = parseNum(statement.city_survey_area_sqm, 0);
  const siteArea = parseNum(statement.site_area_sqm, 0);
  const dpDed = parseNum(statement.dp_deductions_sqm, 0);
  const basicFactor = parseNum(statement.basic_fsi_factor, 1.1);
  const maxPaidFactor = parseNum(statement.paid_fsi_factor, 0.5);
  const propPaidFactor = parseNum(areaMetrics.effectiveProposedPaidFsiFactor, maxPaidFactor);
  const permRegFactor = parseNum(areaMetrics.regularTdrFactor, 0);
  const permSlumFactor = parseNum(areaMetrics.slumTdrFactor, 0);
  const propRegFactor = parseNum(areaMetrics.effectiveProposedRegularTdrFactor, permRegFactor);
  const propSlumFactor = parseNum(areaMetrics.effectiveProposedSlumTdrFactor, permSlumFactor);
  const commShare = parseNum(areaMetrics.primaryFsiCommercialPct, 0) / 100;
  const resShare = parseNum(areaMetrics.primaryFsiResidentialPct, 100) / 100;
  const commAncPct = parseNum(areaMetrics.commAncillaryPct, 0.8);
  const resAncPct = parseNum(areaMetrics.resAncillaryPct, 0.6);

  const areaRowsSpec = [
    { r: 5, sr: '1', part: 'Area Of Plot', note: 'Gross Plot Area', perm: plotArea, prop: '-' },
    { r: 6, sr: '2', part: 'As Per City Survey Record', note: 'Independent PR record', perm: surveyArea, prop: '-' },
    { r: 7, sr: '3', part: 'As per site', note: 'Actual measured at site', perm: siteArea, prop: '-' },
    { r: 8, sr: '4', part: 'Deductions For Proposed D.P.', note: 'Road / DP deduction', perm: dpDed, prop: '-' },
    { r: 9, sr: 'A', part: 'Plotable area', note: 'Plot Area - D.P. Deductions', permFormula: 'MAX(0,E5-E8)', propFormula: 'E9', bold: true, fill: FILL_SUBHEADER, valPerm: areaMetrics.plotableAreaSqm, valProp: areaMetrics.plotableAreaSqm },
    { r: 10, sr: 'B', part: 'Basic Permissible FSI', note: `${basicFactor.toFixed(2)} of Plotable`, permFactor: basicFactor, propFactor: basicFactor, permFormula: 'E9*D10', propFormula: 'F9*G10', valPerm: areaMetrics.permissibleFsiSqm, valProp: areaMetrics.proposedBasicFsiSqm },
    { r: 11, sr: 'C', part: 'Paid FSI', note: `Max ${(maxPaidFactor * 100).toFixed(1)}% / Prop ${(propPaidFactor * 100).toFixed(1)}%`, permFactor: maxPaidFactor, propFactor: propPaidFactor, permFormula: 'E9*D11', propFormula: 'F9*G11', valPerm: areaMetrics.permissiblePaidFsiSqm, valProp: areaMetrics.proposedPaidFsiSqm },
    { r: 12, sr: 'D1', part: 'Regular TDR', note: areaMetrics.isGunthewari ? 'Ineligible (Gunthewari)' : 'Regular TDR share', permFactor: permRegFactor, propFactor: propRegFactor, permFormula: 'E9*D12', propFormula: 'F9*G12', valPerm: areaMetrics.permissibleRegularTdrSqm, valProp: areaMetrics.regularTdrSqm },
    { r: 13, sr: 'D2', part: 'Slum TDR', note: areaMetrics.isGunthewari ? 'Gunthewari Slum TDR only' : 'Slum TDR share', permFactor: permSlumFactor, propFactor: propSlumFactor, permFormula: 'E9*D13', propFormula: 'F9*G13', valPerm: areaMetrics.permissibleSlumTdrSqm, valProp: areaMetrics.slumTdrSqm },
    { r: 14, sr: 'D', part: 'Total TDR (D1 + D2)', note: 'Combined TDR potential/consumed', permFactorFormula: 'D12+D13', propFactorFormula: 'G12+G13', valFactorPerm: permRegFactor + permSlumFactor, valFactorProp: propRegFactor + propSlumFactor, permFormula: 'E12+E13', propFormula: 'F12+F13', bold: true, valPerm: areaMetrics.permissibleTdrSqm, valProp: areaMetrics.proposedTdrSqm },
    { r: 15, sr: 'E', part: 'Primary FSI / Total Builtup Area (B+C+D)', note: 'Base + Paid + Consumed TDR', permFormula: 'E10+E11+E14', propFormula: 'F10+F11+F14', bold: true, fill: FILL_SUBHEADER, valPerm: areaMetrics.permissibleTotalBuiltupSqm, valProp: areaMetrics.proposedTotalBuiltupSqm },
    { r: 16, sr: 'F', part: 'TOTAL FSI Ratio', note: 'Dimensionless FSI ratio', isRatio: true, permFormula: 'IF(E9>0,E15/E9,0)', propFormula: 'IF(F9>0,F15/F9,0)', valPerm: areaMetrics.permissibleTotalFsi, valProp: areaMetrics.proposedTotalFsi },
    { r: 17, sr: 'G1', part: `ANCILLARY — Comm. (${Math.round(commAncPct * 100)}%)`, note: `Primary Alloc: ${(commShare * 100).toFixed(1)}%`, permFactor: commShare, propFactor: commShare, permFormula: `E15*D17*${commAncPct}`, propFormula: `F15*G17*${commAncPct}`, valPerm: areaMetrics.permissibleCommercialAncillarySqm, valProp: areaMetrics.table1ProposedCommAncSqm ?? areaMetrics.proposedCommercialAncillarySqm },
    { r: 18, sr: 'G2', part: `ANCILLARY — Residential (${Math.round(resAncPct * 100)}%)`, note: `Primary Alloc: ${(resShare * 100).toFixed(1)}%`, permFactor: resShare, propFactor: resShare, permFormula: `E15*D18*${resAncPct}`, propFormula: `F15*G18*${resAncPct}`, valPerm: areaMetrics.permissibleResidentialAncillarySqm, valProp: areaMetrics.table1ProposedResAncSqm ?? areaMetrics.proposedResidentialAncillarySqm },
    { r: 19, sr: 'H', part: 'Total P-Line Area (E + G1 + G2)', note: 'Permissible vs Proposed Potential', permFormula: 'E15+E17+E18', propFormula: 'F15+F17+F18', bold: true, fill: FILL_GREEN, border: BORDER_TOTAL, valPerm: areaMetrics.permissiblePlineTotalSqm, valProp: areaMetrics.proposedPlineTotalSqm ?? areaMetrics.effectiveProposedPlineSqm ?? 0 }
  ];

  for (const rowSpec of areaRowsSpec) {
    const r = rowSpec.r;
    const mRow = wsM.getRow(r);
    const fRow = wsF.getRow(r);
    mRow.height = 18;
    fRow.height = 18;

    mRow.getCell(1).value = rowSpec.sr;
    mRow.getCell(2).value = rowSpec.part;
    mRow.getCell(3).value = rowSpec.note;
    fRow.getCell(1).value = rowSpec.sr;
    fRow.getCell(2).value = rowSpec.part;
    fRow.getCell(3).value = rowSpec.note;

    if (rowSpec.permFactorFormula) {
      mRow.getCell(4).value = { formula: rowSpec.permFactorFormula, result: roundVal(rowSpec.valFactorPerm) };
      fRow.getCell(4).value = { formula: `'Area (SQ M)'!D${r}`, result: roundVal(rowSpec.valFactorPerm) };
    } else if (rowSpec.permFactor !== undefined) {
      mRow.getCell(4).value = rowSpec.permFactor;
      fRow.getCell(4).value = { formula: `'Area (SQ M)'!D${r}`, result: rowSpec.permFactor };
    }
    mRow.getCell(4).numFmt = FMT_FACTOR;
    fRow.getCell(4).numFmt = FMT_FACTOR;

    if (rowSpec.propFactorFormula) {
      mRow.getCell(7).value = { formula: rowSpec.propFactorFormula, result: roundVal(rowSpec.valFactorProp) };
      fRow.getCell(7).value = { formula: `'Area (SQ M)'!G${r}`, result: roundVal(rowSpec.valFactorProp) };
    } else if (rowSpec.propFactor !== undefined) {
      mRow.getCell(7).value = rowSpec.propFactor;
      fRow.getCell(7).value = { formula: `'Area (SQ M)'!G${r}`, result: rowSpec.propFactor };
    }
    mRow.getCell(7).numFmt = FMT_FACTOR;
    fRow.getCell(7).numFmt = FMT_FACTOR;

    // Permissible Column (E)
    if (rowSpec.permFormula) {
      mRow.getCell(5).value = { formula: rowSpec.permFormula, result: Number(rowSpec.valPerm || 0) };
      if (rowSpec.isRatio) {
        // Dimensionless ratio — copy directly without multiplying by 10.7639104167!
        fRow.getCell(5).value = { formula: `'Area (SQ M)'!E${r}`, result: Number(rowSpec.valPerm || 0) };
      } else {
        fRow.getCell(5).value = { formula: `'Area (SQ M)'!E${r}*${SQM_TO_SQFT}`, result: Number(rowSpec.valPerm || 0) * SQM_TO_SQFT };
      }
    } else {
      mRow.getCell(5).value = rowSpec.perm;
      fRow.getCell(5).value = { formula: `'Area (SQ M)'!E${r}*${SQM_TO_SQFT}`, result: Number(rowSpec.perm || 0) * SQM_TO_SQFT };
    }
    mRow.getCell(5).numFmt = FMT_AREA3;
    fRow.getCell(5).numFmt = FMT_AREA3;

    // Proposed Column (F)
    if (rowSpec.propFormula) {
      mRow.getCell(6).value = { formula: rowSpec.propFormula, result: Number(rowSpec.valProp || 0) };
      if (rowSpec.isRatio) {
        fRow.getCell(6).value = { formula: `'Area (SQ M)'!F${r}`, result: Number(rowSpec.valProp || 0) };
      } else {
        fRow.getCell(6).value = { formula: `'Area (SQ M)'!F${r}*${SQM_TO_SQFT}`, result: Number(rowSpec.valProp || 0) * SQM_TO_SQFT };
      }
    } else {
      mRow.getCell(6).value = rowSpec.prop;
      fRow.getCell(6).value = rowSpec.prop;
    }
    if (rowSpec.propFormula) {
      mRow.getCell(6).numFmt = FMT_AREA3;
      fRow.getCell(6).numFmt = FMT_AREA3;
    }

    const rowStyle = {
      font: rowSpec.bold ? FONT_TD_BOLD : FONT_TD,
      fill: rowSpec.fill || null,
      border: rowSpec.border || BORDER_THIN,
      align: { 1: { horizontal: 'center' }, 4: { horizontal: 'right' }, 5: { horizontal: 'right' }, 6: { horizontal: 'right' }, 7: { horizontal: 'right' } }
    };
    styleRowCells(wsM, r, 1, 7, rowStyle);
    styleRowCells(wsF, r, 1, 7, rowStyle);
  }

  // Table 2: Floor-wise Proposed P-Line Area Statement (Exact 6 Excel columns starting at Row 21)
  const buildFloorHeader = (ws, unitTxt) => {
    ws.mergeCells('A21:G21');
    ws.getCell('A21').value = `PROPOSED P-LINE AREA STATEMENT (${unitTxt})`;
    ws.getCell('A21').font = FONT_SUBTITLE;
    ws.getCell('A21').fill = FILL_ACCENT;
    ws.getCell('A21').border = BORDER_THIN;
    ws.getRow(21).height = 20;

    const hRow = ws.getRow(22);
    hRow.height = 22;
    ws.mergeCells('A22:B22');
    hRow.getCell(1).value = '1. Floor';
    hRow.getCell(3).value = '2. Height (m)';
    hRow.getCell(4).value = `3. P-Line Area (${unitTxt})`;
    hRow.getCell(5).value = `4. Lobby Area (${unitTxt})`;
    hRow.getCell(6).value = `5. Built-up for Owners (${unitTxt})`;
    hRow.getCell(7).value = `6. Built-up for Sale (${unitTxt})`;
    styleRowCells(ws, 22, 1, 7, {
      font: FONT_TH,
      fill: FILL_SUBHEADER,
      border: BORDER_THIN,
      align: { 1: { horizontal: 'left' }, 3: { horizontal: 'center' }, 4: { horizontal: 'right' }, 5: { horizontal: 'right' }, 6: { horizontal: 'right' }, 7: { horizontal: 'right' } }
    });
  };

  buildFloorHeader(wsM, 'Sq. Mtr.');
  buildFloorHeader(wsF, 'Sq. Ft.');

  const startFloorRow = 23;
  floors.forEach((fl, idx) => {
    const r = startFloorRow + idx;
    const isHabitable = fl.floor_type !== 'parking' && fl.floor_type !== 'terrace';
    const height = parseNum(fl.height_meters, 0);
    const pline = parseNum(fl.pline_area_sqm, 0);
    const lobby = parseNum(fl.lobby_area_sqm, 0);
    const owners = isHabitable ? parseNum(fl.builtup_for_owners_sqm, 0) : 0;
    const sale = isHabitable ? parseNum(fl.builtup_for_sale_sqm, 0) : 0;

    const mRow = wsM.getRow(r);
    const fRow = wsF.getRow(r);
    mRow.height = 18;
    fRow.height = 18;

    wsM.mergeCells(`A${r}:B${r}`);
    wsF.mergeCells(`A${r}:B${r}`);

    mRow.getCell(1).value = fl.floor_name;
    mRow.getCell(3).value = height;
    mRow.getCell(4).value = pline;
    mRow.getCell(5).value = isHabitable && !fl.is_lobby_overridden ? { formula: `D${r}*0.15`, result: lobby } : lobby;
    mRow.getCell(6).value = owners;
    mRow.getCell(7).value = isHabitable ? { formula: `MAX(0,D${r}-E${r}-F${r})`, result: sale } : 0;

    // Area (SQ FT) links every cell cleanly to Area (SQ M)
    fRow.getCell(1).value = { formula: `'Area (SQ M)'!A${r}`, result: fl.floor_name };
    fRow.getCell(3).value = { formula: `'Area (SQ M)'!C${r}`, result: height };
    for (const c of [4, 5, 6, 7]) {
      const colLet = wsM.getColumn(c).letter;
      fRow.getCell(c).value = { formula: `'Area (SQ M)'!${colLet}${r}*${SQM_TO_SQFT}`, result: [pline, lobby, owners, sale][c - 4] * SQM_TO_SQFT };
    }

    for (const rowObj of [mRow, fRow]) {
      [3, 4, 5, 6, 7].forEach((c) => { rowObj.getCell(c).numFmt = FMT_AREA2; });
    }

    const flAlign = { 1: { horizontal: 'left' }, 3: { horizontal: 'center' }, 4: { horizontal: 'right' }, 5: { horizontal: 'right' }, 6: { horizontal: 'right' }, 7: { horizontal: 'right' } };
    styleRowCells(wsM, r, 1, 7, { font: FONT_TD, border: BORDER_THIN, align: flAlign });
    styleRowCells(wsF, r, 1, 7, { font: FONT_TD, border: BORDER_THIN, align: flAlign });
  });

  const endFloorRow = floors.length > 0 ? startFloorRow + floors.length - 1 : startFloorRow;
  const totalRowNum = endFloorRow + 1;
  const populateFloorTotal = (ws, isSqftSheet) => {
    const tRow = ws.getRow(totalRowNum);
    tRow.height = 20;
    ws.mergeCells(`A${totalRowNum}:B${totalRowNum}`);
    tRow.getCell(1).value = 'TOTAL';
    const sumCols = floors.length > 0 ? (c) => `SUM(${c}${startFloorRow}:${c}${endFloorRow})` : () => '0';
    tRow.getCell(3).value = { formula: sumCols('C'), result: areaMetrics.totalHeightMeters || 0 };
    tRow.getCell(4).value = { formula: sumCols('D'), result: (areaMetrics.totalProposedPlineSqm || 0) * (isSqftSheet ? SQM_TO_SQFT : 1) };
    tRow.getCell(5).value = { formula: sumCols('E'), result: (areaMetrics.totalLobbyAreaSqm || 0) * (isSqftSheet ? SQM_TO_SQFT : 1) };
    tRow.getCell(6).value = { formula: sumCols('F'), result: (areaMetrics.totalBuiltupForOwnersSqm || 0) * (isSqftSheet ? SQM_TO_SQFT : 1) };
    tRow.getCell(7).value = { formula: sumCols('G'), result: (areaMetrics.totalBuiltupForSaleSqm || 0) * (isSqftSheet ? SQM_TO_SQFT : 1) };

    [3, 4, 5, 6, 7].forEach((c) => { tRow.getCell(c).numFmt = FMT_AREA2; });

    styleRowCells(ws, totalRowNum, 1, 7, {
      font: FONT_TD_BOLD,
      fill: FILL_SUBHEADER,
      border: BORDER_TOTAL,
      align: { 1: { horizontal: 'left' }, 3: { horizontal: 'center' }, 4: { horizontal: 'right' }, 5: { horizontal: 'right' }, 6: { horizontal: 'right' }, 7: { horizontal: 'right' } }
    });

    // Area Balance & Margin H/5 rows matching Excel layout
    const balRow = ws.getRow(totalRowNum + 2);
    balRow.getCell(1).value = 'Area Balance (Permissible P-Line − Floor Proposed Sum)';
    ws.mergeCells(`A${totalRowNum + 2}:C${totalRowNum + 2}`);
    balRow.getCell(4).value = { formula: `E19-D${totalRowNum}`, result: ((areaMetrics.permissiblePlineTotalSqm || 0) - (areaMetrics.totalProposedPlineSqm || 0)) * (isSqftSheet ? SQM_TO_SQFT : 1) };
    balRow.getCell(4).numFmt = FMT_AREA2;
    styleRowCells(ws, totalRowNum + 2, 1, 4, { font: FONT_TD_BOLD, border: BORDER_THIN, align: { 4: { horizontal: 'right' } } });

    const marRow = ws.getRow(totalRowNum + 3);
    marRow.getCell(1).value = 'Margin (H / 5)';
    ws.mergeCells(`A${totalRowNum + 3}:B${totalRowNum + 3}`);
    marRow.getCell(3).value = { formula: `C${totalRowNum}/5`, result: areaMetrics.marginHBy5Meters || 0 };
    marRow.getCell(3).numFmt = FMT_AREA2;
    styleRowCells(ws, totalRowNum + 3, 1, 3, { font: FONT_TD_BOLD, border: BORDER_THIN, align: { 3: { horizontal: 'center' } } });
  };

  populateFloorTotal(wsM, false);
  populateFloorTotal(wsF, true);

  return { floorTotalRowNum: totalRowNum };
}

/**
 * Populate 'FINANCIAL VIABILITY' worksheet strictly matching original Excel hierarchy with live formulas.
 */
function buildFinancialSheet(wb, data, areaMeta) {
  const { project = {}, statement = {}, floors = [], financial = {}, statutoryCharges = [], salableUnits = [], areaMetrics = {}, financialMetrics = {} } = data;
  const ws = wb.addWorksheet('FINANCIAL VIABILITY', {
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
  });

  const colWidths = [8, 38, 16, 14, 15, 16, 14, 16, 18];
  colWidths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  ws.mergeCells('A1:I1');
  ws.getCell('A1').value = `FINANCIAL VIABILITY — ${project.name || 'DS16 Project'}`;
  ws.getCell('A1').font = FONT_TITLE;
  ws.getCell('A1').fill = FILL_HEADER;
  ws.getCell('A1').alignment = { vertical: 'middle', horizontal: 'center' };
  ws.getRow(1).height = 24;

  // Row 3..6: Top Area Overview Strip linked directly to 'Area (SQ M)'
  const ovHdr = ws.getRow(3);
  ovHdr.values = ['PLOT AREA', 'BASIC FSI', 'PREMIUM FSI', 'TDR', 'TOTAL POTENTIAL', 'Comm. Anc (80%)', 'Res. Anc (60%)', 'P-LINE', 'UNIT'];
  styleRowCells(ws, 3, 1, 9, { font: FONT_TH, fill: FILL_SUBHEADER, border: BORDER_THIN, align: { 1: { horizontal: 'right' }, 2: { horizontal: 'right' }, 3: { horizontal: 'right' }, 4: { horizontal: 'right' }, 5: { horizontal: 'right' }, 6: { horizontal: 'right' }, 7: { horizontal: 'right' }, 8: { horizontal: 'right' }, 9: { horizontal: 'center' } } });

  const factorRow = ws.getRow(4);
  factorRow.getCell(1).value = { formula: "'Area (SQ M)'!E9", result: areaMetrics.plotableAreaSqm || 0 };
  factorRow.getCell(2).value = { formula: "'Area (SQ M)'!D10", result: parseNum(statement.basic_fsi_factor, 1.1) };
  factorRow.getCell(3).value = { formula: "'Area (SQ M)'!D11", result: parseNum(statement.paid_fsi_factor, 0.5) };
  factorRow.getCell(4).value = { formula: "'Area (SQ M)'!D14", result: parseNum(areaMetrics.totalTdrFactor, 0) };
  factorRow.getCell(5).value = { formula: 'B4+C4+D4' };
  factorRow.getCell(6).value = parseNum(areaMetrics.commAncillaryPct, 0.8);
  factorRow.getCell(7).value = parseNum(areaMetrics.resAncillaryPct, 0.6);
  factorRow.getCell(8).value = 'Factor/Sqm';
  factorRow.getCell(9).value = 'Factors';
  [1].forEach((c) => { factorRow.getCell(c).numFmt = FMT_AREA2; });
  [2, 3, 4, 5, 6, 7].forEach((c) => { factorRow.getCell(c).numFmt = FMT_FACTOR; });
  styleRowCells(ws, 4, 1, 9, { font: FONT_TD_BOLD, border: BORDER_THIN });

  const permOv = ws.getRow(5);
  permOv.getCell(1).value = 'PERMISSIBLE';
  permOv.getCell(2).value = { formula: "'Area (SQ M)'!E10", result: areaMetrics.permissibleFsiSqm || 0 };
  permOv.getCell(3).value = { formula: "'Area (SQ M)'!E11", result: areaMetrics.permissiblePaidFsiSqm || 0 };
  permOv.getCell(4).value = { formula: "'Area (SQ M)'!E14", result: areaMetrics.permissibleTdrSqm || 0 };
  permOv.getCell(5).value = { formula: "'Area (SQ M)'!E15", result: areaMetrics.permissibleTotalBuiltupSqm || 0 };
  permOv.getCell(6).value = { formula: "'Area (SQ M)'!E17", result: areaMetrics.permissibleCommercialAncillarySqm || 0 };
  permOv.getCell(7).value = { formula: "'Area (SQ M)'!E18", result: areaMetrics.permissibleResidentialAncillarySqm || 0 };
  permOv.getCell(8).value = { formula: "'Area (SQ M)'!E19", result: areaMetrics.permissiblePlineTotalSqm || 0 };
  permOv.getCell(9).value = 'Sq. Mtr.';
  [2, 3, 4, 5, 6, 7, 8].forEach((c) => { permOv.getCell(c).numFmt = FMT_AREA2; });
  styleRowCells(ws, 5, 1, 9, { font: FONT_TD, border: BORDER_THIN });

  const floorTotalRow = areaMeta.floorTotalRowNum;
  const hasHabitableFloors = (areaMetrics.applicableHabitableFloorsCount || 0) > 0 && floors.length > 0;
  const effPlineCellRef = (areaMetrics.isProposedPlineOverridden || !hasHabitableFloors)
    ? "'Area (SQ M)'!F19"
    : `'Area (SQ M)'!D${floorTotalRow}`;
  const effPlineVal = areaMetrics.totalProposedPlineSqm > 0
    ? areaMetrics.totalProposedPlineSqm
    : (areaMetrics.effectiveProposedPlineSqm || areaMetrics.calculatedProposedPlineSqm || 0);

  const propOv = ws.getRow(6);
  propOv.getCell(1).value = 'PROPOSED';
  propOv.getCell(2).value = { formula: "'Area (SQ M)'!F10", result: areaMetrics.proposedBasicFsiSqm || 0 };
  propOv.getCell(3).value = { formula: "'Area (SQ M)'!F11", result: areaMetrics.proposedPaidFsiSqm || 0 };
  propOv.getCell(4).value = { formula: "'Area (SQ M)'!F14", result: areaMetrics.proposedTdrSqm || 0 };
  propOv.getCell(5).value = { formula: "'Area (SQ M)'!F15", result: areaMetrics.proposedTotalBuiltupSqm || 0 };
  propOv.getCell(6).value = { formula: "'Area (SQ M)'!F17", result: areaMetrics.table1ProposedCommAncSqm ?? areaMetrics.proposedCommercialAncillarySqm ?? 0 };
  propOv.getCell(7).value = { formula: "'Area (SQ M)'!F18", result: areaMetrics.table1ProposedResAncSqm ?? areaMetrics.proposedResidentialAncillarySqm ?? 0 };
  propOv.getCell(8).value = { formula: effPlineCellRef, result: effPlineVal };
  propOv.getCell(9).value = 'Sq. Mtr.';
  [2, 3, 4, 5, 6, 7, 8].forEach((c) => { propOv.getCell(c).numFmt = FMT_AREA2; });
  styleRowCells(ws, 6, 1, 9, { font: FONT_TD_BOLD, fill: FILL_ACCENT, border: BORDER_THIN });

  // Row 8..10: Cost Norms & Ready Reckoner Rate
  const costARate = parseNum(financial.estimated_cost_a_rate, 0);
  const costBRate = parseNum(financial.estimated_cost_b_rate, 0);
  const rrRate = parseNum(financial.rr_rate_per_sqm, 0);

  const rCostA = ws.getRow(8);
  rCostA.getCell(2).value = 'ESTIMATED COST-A';
  rCostA.getCell(3).value = costARate;
  rCostA.getCell(4).value = { formula: 'H6', result: effPlineVal };
  rCostA.getCell(5).value = { formula: 'C8*D8', result: financialMetrics.estimatedCostA || 0 };
  rCostA.getCell(3).numFmt = FMT_INR;
  rCostA.getCell(4).numFmt = FMT_AREA2;
  rCostA.getCell(5).numFmt = FMT_INR;
  styleRowCells(ws, 8, 2, 5, { font: FONT_TD, border: BORDER_THIN });

  const rCostB = ws.getRow(9);
  rCostB.getCell(2).value = 'ESTIMATED COST-B';
  rCostB.getCell(3).value = costBRate;
  rCostB.getCell(4).value = { formula: 'H6', result: effPlineVal };
  rCostB.getCell(5).value = { formula: 'C9*D9', result: financialMetrics.estimatedCostB || 0 };
  rCostB.getCell(3).numFmt = FMT_INR;
  rCostB.getCell(4).numFmt = FMT_AREA2;
  rCostB.getCell(5).numFmt = FMT_INR;
  styleRowCells(ws, 9, 2, 5, { font: FONT_TD, border: BORDER_THIN });

  const rRr = ws.getRow(10);
  rRr.getCell(2).value = 'RR RATES RS';
  rRr.getCell(3).value = rrRate;
  rRr.getCell(3).numFmt = FMT_INR;
  styleRowCells(ws, 10, 2, 5, { font: FONT_TD_BOLD, fill: FILL_SUBHEADER, border: BORDER_THIN });

  // Section A: Statutory Charges Table (Row 12 header)
  const statHdr = ws.getRow(12);
  statHdr.values = ['Sr. No.', 'PARTICULARS', 'BASIS / AREA', 'RATE / %', 'CALCULATED (Rs.)', 'STATUS / NOTE', '', '', 'FINAL AMOUNT (Rs.)'];
  ws.mergeCells('F12:H12');
  styleRowCells(ws, 12, 1, 9, { font: FONT_TH, fill: FILL_SUBHEADER, border: BORDER_THIN, align: { 1: { horizontal: 'center' }, 3: { horizontal: 'right' }, 4: { horizontal: 'right' }, 5: { horizontal: 'right' }, 9: { horizontal: 'right' } } });

  const visibleStat = (statutoryCharges || []).filter((s) => !s.is_deleted && s.charge_code !== 'AMALGAMATION');
  let currRow = 13;
  const statStartRow = currRow;
  const rowIndexByCode = {};
  visibleStat.forEach((sc, idx) => {
    rowIndexByCode[sc.charge_code] = statStartRow + idx;
  });

  visibleStat.forEach((sc, idx) => {
    const row = ws.getRow(currRow);
    const isEnabled = sc.is_enabled !== false;
    const effAmt = parseNum(sc.effective_amount, 0);
    const calcAmt = sc.calculated_amount !== null && sc.calculated_amount !== undefined ? parseNum(sc.calculated_amount, 0) : null;

    row.getCell(1).value = idx + 1;
    row.getCell(2).value = sc.charge_name;
    ws.mergeCells(`F${currRow}:H${currRow}`);
    row.getCell(6).value = !isEnabled
      ? 'Disabled'
      : sc.is_manual
        ? 'Manual Admin Input'
        : sc.has_override
          ? 'Admin Overridden'
          : 'Auto Calculated';

    // Basis & Rate & Formulas
    const rrPctVal = sc.rr_percentage !== null && sc.rr_percentage !== undefined ? Number(sc.rr_percentage) / 100 : null;
    if (sc.charge_code === 'PLAN_REGISTRATION') {
      row.getCell(3).value = { formula: 'H6', result: effPlineVal };
      row.getCell(4).value = 5.90;
      row.getCell(5).value = { formula: `C${currRow}*D${currRow}`, result: calcAmt };
    } else if (sc.charge_code === 'SECURITY_DEPOSIT') {
      row.getCell(3).value = { formula: 'E8', result: financialMetrics.estimatedCostA || 0 };
      row.getCell(4).value = 0.01;
      row.getCell(4).numFmt = FMT_PCT;
      row.getCell(5).value = { formula: `IF(C${currRow}>0,MIN(C${currRow}*D${currRow},75000),0)`, result: calcAmt };
    } else if (sc.charge_code === 'STACKING_CHARGES') {
      row.getCell(3).value = { formula: 'E8', result: financialMetrics.estimatedCostA || 0 };
      row.getCell(4).value = 0.005;
      row.getCell(4).numFmt = FMT_PCT;
      row.getCell(5).value = { formula: `IF(C${currRow}>0,MIN(C${currRow}*D${currRow},50000),0)`, result: calcAmt };
    } else if (sc.charge_code === 'ANCILLARY_CHARGES') {
      const table1AncSum = parseNum(areaMetrics.table1ProposedCommAncSqm, 0) + parseNum(areaMetrics.table1ProposedResAncSqm, 0);
      const ancMatchesTable1 = Math.abs(parseNum(areaMetrics.totalProposedAncillarySqm, 0) - table1AncSum) < 0.05;
      row.getCell(3).value = ancMatchesTable1
        ? { formula: 'F6+G6', result: areaMetrics.totalProposedAncillarySqm || 0 }
        : parseNum(areaMetrics.totalProposedAncillarySqm, 0);
      row.getCell(4).value = { formula: `${rrPctVal ?? 0.10}*C10`, result: (rrPctVal ?? 0.10) * rrRate };
      row.getCell(5).value = { formula: `C${currRow}*D${currRow}`, result: calcAmt };
    } else if (sc.charge_code === 'SEWER_CONNECTION') {
      row.getCell(3).value = { formula: 'H6', result: effPlineVal };
      row.getCell(4).value = 2.50;
      row.getCell(5).value = { formula: `C${currRow}*D${currRow}`, result: calcAmt };
    } else if (sc.charge_code === 'DEVELOPMENT_CHARGES') {
      row.getCell(3).value = { formula: 'H6', result: effPlineVal };
      row.getCell(4).value = { formula: `${rrPctVal ?? 0.02}*C10`, result: (rrPctVal ?? 0.02) * rrRate };
      row.getCell(5).value = { formula: `C${currRow}*D${currRow}`, result: calcAmt };
    } else if (sc.charge_code === 'PREMIUM_FSI') {
      row.getCell(3).value = { formula: 'C6', result: areaMetrics.proposedPaidFsiSqm || 0 };
      row.getCell(4).value = { formula: `${rrPctVal ?? 0.40}*C10`, result: (rrPctVal ?? 0.40) * rrRate };
      row.getCell(5).value = { formula: `C${currRow}*D${currRow}`, result: calcAmt };
    } else if (sc.charge_code === 'TREE_PLANTATION') {
      row.getCell(3).value = { formula: 'H6', result: effPlineVal };
      row.getCell(4).value = 500;
      row.getCell(5).value = { formula: `IF(C${currRow}>0,MIN((C${currRow}/74.32)*D${currRow},25000),0)`, result: calcAmt };
    } else if (sc.charge_code === 'HERITAGE_FUND') {
      const devR = rowIndexByCode['DEVELOPMENT_CHARGES'];
      const devCharge = visibleStat.find((x) => x.charge_code === 'DEVELOPMENT_CHARGES');
      const devEff = devCharge && devCharge.is_enabled !== false ? parseNum(devCharge.effective_amount, 0) : 0;
      row.getCell(3).value = devR ? { formula: `I${devR}`, result: devEff } : 0;
      row.getCell(4).value = 0.02;
      row.getCell(4).numFmt = FMT_PCT;
      row.getCell(5).value = { formula: `C${currRow}*D${currRow}`, result: calcAmt };
    } else if (sc.charge_code === 'LABOUR_WELFARE_CESS') {
      row.getCell(3).value = { formula: 'E9', result: financialMetrics.estimatedCostB || 0 };
      row.getCell(4).value = 0.01;
      row.getCell(4).numFmt = FMT_PCT;
      row.getCell(5).value = { formula: `C${currRow}*D${currRow}`, result: calcAmt };
    } else if (sc.charge_code === 'TDR_LOADING_CHARGES') {
      row.getCell(3).value = { formula: 'D6', result: areaMetrics.proposedTdrSqm || 0 };
      row.getCell(4).value = { formula: `${rrPctVal ?? 0.03}*C10`, result: (rrPctVal ?? 0.03) * rrRate };
      row.getCell(5).value = { formula: `C${currRow}*D${currRow}`, result: calcAmt };
    } else {
      row.getCell(3).value = '-';
      row.getCell(4).value = '-';
      row.getCell(5).value = calcAmt !== null ? calcAmt : parseNum(sc.amount, 0);
    }

    if (!isEnabled) {
      row.getCell(9).value = 0;
    } else if (sc.has_override || sc.is_manual || sc.is_custom) {
      row.getCell(9).value = effAmt;
    } else {
      row.getCell(9).value = { formula: `E${currRow}`, result: effAmt };
    }

    row.getCell(3).numFmt = FMT_AREA2;
    if (typeof row.getCell(4).numFmt !== 'string' || !row.getCell(4).numFmt.includes('%')) {
      row.getCell(4).numFmt = FMT_INR;
    }
    row.getCell(5).numFmt = FMT_INR;
    row.getCell(9).numFmt = FMT_INR;

    styleRowCells(ws, currRow, 1, 9, { font: FONT_TD, border: BORDER_THIN, align: { 1: { horizontal: 'center' }, 3: { horizontal: 'right' }, 4: { horizontal: 'right' }, 5: { horizontal: 'right' }, 9: { horizontal: 'right' } } });
    currRow++;
  });

  const statEndRow = currRow - 1;
  const totalARowNum = currRow++;
  const rTotA = ws.getRow(totalARowNum);
  rTotA.getCell(2).value = 'NMC / DEMAND RS (TOTAL A)';
  rTotA.getCell(8).value = 'A';
  rTotA.getCell(9).value = visibleStat.length > 0
    ? { formula: `SUM(I${statStartRow}:I${statEndRow})`, result: financialMetrics.totalStatutoryDemandA || 0 }
    : 0;
  rTotA.getCell(9).numFmt = FMT_INR;
  styleRowCells(ws, totalARowNum, 1, 9, { font: FONT_TD_BOLD, fill: FILL_SUBHEADER, border: BORDER_TOTAL, align: { 8: { horizontal: 'center' }, 9: { horizontal: 'right' } } });

  // Section B: Cost of TDR
  const tdrRowNum = currRow++;
  const tdrFactor = parseNum(financial.tdr_purchase_factor, 0.55);
  const tdrDet = financialMetrics.costOfTdrB_details || {};
  const rTdr = ws.getRow(tdrRowNum);
  rTdr.getCell(1).value = visibleStat.length + 1;
  rTdr.getCell(2).value = `COST OF TDR (${(tdrFactor * 100).toFixed(0)}% of RR)`;
  rTdr.getCell(3).value = { formula: 'D6', result: areaMetrics.proposedTdrSqm || 0 };
  rTdr.getCell(4).value = { formula: `${tdrFactor}*C10`, result: tdrFactor * rrRate };
  rTdr.getCell(5).value = { formula: `C${tdrRowNum}*D${tdrRowNum}`, result: tdrDet.calculated || 0 };
  ws.mergeCells(`F${tdrRowNum}:G${tdrRowNum}`);
  rTdr.getCell(6).value = tdrDet.has_override ? 'Admin Overridden' : 'TDR RS';
  rTdr.getCell(8).value = 'B';
  rTdr.getCell(9).value = tdrDet.has_override
    ? parseNum(tdrDet.effective, 0)
    : { formula: `E${tdrRowNum}`, result: parseNum(financialMetrics.costOfTdrB, 0) };
  rTdr.getCell(3).numFmt = FMT_AREA2;
  rTdr.getCell(4).numFmt = FMT_INR;
  rTdr.getCell(5).numFmt = FMT_INR;
  rTdr.getCell(9).numFmt = FMT_INR;
  styleRowCells(ws, tdrRowNum, 1, 9, { font: FONT_TD_BOLD, fill: FILL_SUBHEADER, border: BORDER_THIN, align: { 1: { horizontal: 'center' }, 3: { horizontal: 'right' }, 4: { horizontal: 'right' }, 5: { horizontal: 'right' }, 8: { horizontal: 'center' }, 9: { horizontal: 'right' } } });

  currRow++; // spacer

  // Section C: Additional Project Expenses (Rows matched cleanly to DB & Excel)
  const secCItems = [
    ['MINOR EXPENSES', parseNum(financial.minor_expenses, 0)],
    ['BPMS - STAFF CHARGES', parseNum(financial.bpms_staff_charges, 0)],
    ['AIRPORT NOC', parseNum(financial.airport_noc, 0)],
    ['FIRE NOC', parseNum(financial.fire_noc, 0)],
    ['ENTERTAINMENT CHARGES', parseNum(financial.entertainment_charges, 0)],
    ['CONSULTANTS / ADVOCATE FEES', parseNum(financial.advocate_fees, 0)],
    ['EXTRA STAMP DUTY ON POTENTIAL', parseNum(financial.extra_stamp_duty, 0)]
  ];
  const secCStart = currRow;
  for (const [label, amt] of secCItems) {
    const rObj = ws.getRow(currRow);
    rObj.getCell(2).value = label;
    rObj.getCell(9).value = amt;
    rObj.getCell(9).numFmt = FMT_INR;
    styleRowCells(ws, currRow, 1, 9, { font: FONT_TD, border: BORDER_THIN, align: { 9: { horizontal: 'right' } } });
    currRow++;
  }
  const secCEnd = currRow - 1;
  const totalCRowNum = currRow++;
  const rTotC = ws.getRow(totalCRowNum);
  rTotC.getCell(2).value = 'TOTAL ADDITIONAL EXPENSES (C)';
  rTotC.getCell(8).value = 'C';
  rTotC.getCell(9).value = { formula: `SUM(I${secCStart}:I${secCEnd})`, result: financialMetrics.totalExpensesC || 0 };
  rTotC.getCell(9).numFmt = FMT_INR;
  styleRowCells(ws, totalCRowNum, 1, 9, { font: FONT_TD_BOLD, fill: FILL_SUBHEADER, border: BORDER_TOTAL, align: { 8: { horizontal: 'center' }, 9: { horizontal: 'right' } } });

  // Sections D..H + Infra + Interest
  const plotDet = financialMetrics.costOfPlotH_details || {};
  const isPlotInc = financialMetrics.isCostOfPlotIncluded !== false;
  const plotRaw = parseNum(plotDet.raw_amount ?? financial.cost_of_plot, 0);
  const plotRowNum = currRow++;
  const rPlot = ws.getRow(plotRowNum);
  rPlot.getCell(2).value = isPlotInc ? 'COST OF PLOT' : `COST OF PLOT (Excluded; Saved: ₹${fmtNumPdf(plotRaw)})`;
  rPlot.getCell(8).value = 'H';
  rPlot.getCell(9).value = isPlotInc ? parseNum(financialMetrics.costOfPlotH, 0) : 0;
  rPlot.getCell(9).numFmt = FMT_INR;
  styleRowCells(ws, plotRowNum, 1, 9, { font: FONT_TD, border: BORDER_THIN, align: { 8: { horizontal: 'center' }, 9: { horizontal: 'right' } } });

  const constDet = financialMetrics.costOfConstructionD_details || {};
  const constRate = parseNum(financial.cost_of_construction_rate, 0);
  const constRowNum = currRow++;
  const rConst = ws.getRow(constRowNum);
  rConst.getCell(2).value = 'COST OF CONSTRUCTION';
  rConst.getCell(3).value = { formula: 'H6', result: effPlineVal };
  rConst.getCell(4).value = constRate;
  rConst.getCell(5).value = { formula: `C${constRowNum}*D${constRowNum}`, result: constDet.calculated || 0 };
  rConst.getCell(6).value = constDet.has_override ? 'Overridden' : 'per sq m';
  rConst.getCell(8).value = 'D';
  rConst.getCell(9).value = constDet.has_override ? parseNum(constDet.effective, 0) : { formula: `E${constRowNum}`, result: parseNum(financialMetrics.costOfConstructionD, 0) };
  rConst.getCell(3).numFmt = FMT_AREA2;
  rConst.getCell(4).numFmt = FMT_INR;
  rConst.getCell(5).numFmt = FMT_INR;
  rConst.getCell(9).numFmt = FMT_INR;
  styleRowCells(ws, constRowNum, 1, 9, { font: FONT_TD, border: BORDER_THIN, align: { 3: { horizontal: 'right' }, 4: { horizontal: 'right' }, 5: { horizontal: 'right' }, 8: { horizontal: 'center' }, 9: { horizontal: 'right' } } });

  const infraRowNum = currRow++;
  const rInfra = ws.getRow(infraRowNum);
  rInfra.getCell(2).value = 'COST OF INFRASTRUCTURE CONSTRUCTION';
  rInfra.getCell(9).value = parseNum(financial.cost_of_infrastructure, 0);
  rInfra.getCell(9).numFmt = FMT_INR;
  styleRowCells(ws, infraRowNum, 1, 9, { font: FONT_TD, border: BORDER_THIN, align: { 9: { horizontal: 'right' } } });

  const intRowNum = currRow++;
  const rInt = ws.getRow(intRowNum);
  rInt.getCell(2).value = 'INTEREST';
  rInt.getCell(9).value = parseNum(financial.interest_amount, 0);
  rInt.getCell(9).numFmt = FMT_INR;
  styleRowCells(ws, intRowNum, 1, 9, { font: FONT_TD, border: BORDER_THIN, align: { 9: { horizontal: 'right' } } });

  const baseDet = financialMetrics.costOfBasementE_details || {};
  const baseRowNum = currRow++;
  const rBase = ws.getRow(baseRowNum);
  rBase.getCell(2).value = 'COST OF BASEMENT CONSTRUCTION';
  rBase.getCell(3).value = parseNum(financial.basement_area_sqm, 0);
  rBase.getCell(4).value = parseNum(financial.basement_rate_per_sqm, 0);
  rBase.getCell(5).value = { formula: `C${baseRowNum}*D${baseRowNum}`, result: baseDet.calculated || 0 };
  rBase.getCell(8).value = 'E';
  rBase.getCell(9).value = baseDet.has_override ? parseNum(baseDet.effective, 0) : { formula: `E${baseRowNum}`, result: parseNum(financialMetrics.costOfBasementE, 0) };
  rBase.getCell(3).numFmt = FMT_AREA2;
  rBase.getCell(4).numFmt = FMT_INR;
  rBase.getCell(5).numFmt = FMT_INR;
  rBase.getCell(9).numFmt = FMT_INR;
  styleRowCells(ws, baseRowNum, 1, 9, { font: FONT_TD, border: BORDER_THIN, align: { 3: { horizontal: 'right' }, 4: { horizontal: 'right' }, 5: { horizontal: 'right' }, 8: { horizontal: 'center' }, 9: { horizontal: 'right' } } });

  const rentDet = financialMetrics.rentCostF_details || {};
  const rentRowNum = currRow++;
  const rRent = ws.getRow(rentRowNum);
  rRent.getCell(2).value = 'RENT';
  rRent.getCell(3).value = parseInt(financial.rent_tenements, 10) || 0;
  rRent.getCell(4).value = parseNum(financial.rent_per_tenement_per_month, 0);
  rRent.getCell(5).value = parseInt(financial.rent_months, 10) || 0;
  rRent.getCell(6).value = { formula: `C${rentRowNum}*D${rentRowNum}*E${rentRowNum}`, result: rentDet.calculated || 0 };
  rRent.getCell(8).value = 'F';
  rRent.getCell(9).value = rentDet.has_override ? parseNum(rentDet.effective, 0) : { formula: `F${rentRowNum}`, result: parseNum(financialMetrics.rentCostF, 0) };
  rRent.getCell(3).numFmt = FMT_INT;
  rRent.getCell(4).numFmt = FMT_INR;
  rRent.getCell(5).numFmt = FMT_INT;
  rRent.getCell(6).numFmt = FMT_INR;
  rRent.getCell(9).numFmt = FMT_INR;
  styleRowCells(ws, rentRowNum, 1, 9, { font: FONT_TD, border: BORDER_THIN, align: { 3: { horizontal: 'right' }, 4: { horizontal: 'right' }, 5: { horizontal: 'right' }, 6: { horizontal: 'right' }, 8: { horizontal: 'center' }, 9: { horizontal: 'right' } } });

  const stackDet = financialMetrics.stackedParkingCostG_details || {};
  const stackRowNum = currRow++;
  const rStack = ws.getRow(stackRowNum);
  rStack.getCell(2).value = 'STACKED PARKING';
  rStack.getCell(3).value = parseInt(financial.stacked_parking_slots, 10) || 0;
  rStack.getCell(4).value = parseNum(financial.stacked_parking_cost_per_slot, 0);
  rStack.getCell(5).value = { formula: `C${stackRowNum}*D${stackRowNum}`, result: stackDet.calculated || 0 };
  rStack.getCell(8).value = 'G';
  rStack.getCell(9).value = stackDet.has_override ? parseNum(stackDet.effective, 0) : { formula: `E${stackRowNum}`, result: parseNum(financialMetrics.stackedParkingCostG, 0) };
  rStack.getCell(3).numFmt = FMT_INT;
  rStack.getCell(4).numFmt = FMT_INR;
  rStack.getCell(5).numFmt = FMT_INR;
  rStack.getCell(9).numFmt = FMT_INR;
  styleRowCells(ws, stackRowNum, 1, 9, { font: FONT_TD, border: BORDER_THIN, align: { 3: { horizontal: 'right' }, 4: { horizontal: 'right' }, 5: { horizontal: 'right' }, 8: { horizontal: 'center' }, 9: { horizontal: 'right' } } });

  const totalCostRowNum = currRow++;
  const rTotCost = ws.getRow(totalCostRowNum);
  rTotCost.getCell(2).value = 'TOTAL PROJECT COST (A+B+C+D+E+F+G+H+Infra+Interest)';
  rTotCost.getCell(9).value = {
    formula: `I${totalARowNum}+I${tdrRowNum}+I${totalCRowNum}+I${plotRowNum}+I${constRowNum}+I${infraRowNum}+I${intRowNum}+I${baseRowNum}+I${rentRowNum}+I${stackRowNum}`,
    result: financialMetrics.totalProjectCost || 0
  };
  rTotCost.getCell(9).numFmt = FMT_INR;
  styleRowCells(ws, totalCostRowNum, 1, 9, { font: FONT_TD_BOLD, fill: FILL_ACCENT, border: BORDER_TOTAL, align: { 9: { horizontal: 'right' } } });

  currRow++; // spacer

  // Receipts Section
  const recBanner = currRow++;
  ws.mergeCells(`A${recBanner}:I${recBanner}`);
  ws.getCell(`A${recBanner}`).value = 'RECEIPTS (SALABLE UNITS & REALISATION)';
  ws.getCell(`A${recBanner}`).font = FONT_SUBTITLE;
  ws.getCell(`A${recBanner}`).fill = FILL_SUBHEADER;
  ws.getCell(`A${recBanner}`).border = BORDER_THIN;

  const recHdr = currRow++;
  ws.getRow(recHdr).values = ['Sr. No.', 'Particular', 'Carpet Area (Sq ft)', 'Loading / Super B/Up', 'Total Units (Owner)', 'Dev Units', 'Rate / Sq ft', 'Unit Price', 'Amount (Rs.)'];
  styleRowCells(ws, recHdr, 1, 9, { font: FONT_TH, fill: FILL_SUBHEADER, border: BORDER_THIN, align: { 1: { horizontal: 'center' }, 3: { horizontal: 'right' }, 4: { horizontal: 'right' }, 5: { horizontal: 'center' }, 6: { horizontal: 'center' }, 7: { horizontal: 'right' }, 8: { horizontal: 'right' }, 9: { horizontal: 'right' } } });

  const perRow = currRow++;
  ws.getRow(perRow).getCell(1).value = 1;
  ws.getRow(perRow).getCell(2).value = 'Period Required';
  ws.getRow(perRow).getCell(9).value = financial.period_months || '—';
  styleRowCells(ws, perRow, 1, 9, { font: FONT_TD, border: BORDER_THIN, align: { 1: { horizontal: 'center' }, 9: { horizontal: 'right' } } });

  const unitsHdrRow = currRow++;
  ws.getRow(unitsHdrRow).getCell(1).value = 2;
  ws.getRow(unitsHdrRow).getCell(2).value = 'Salable Units Cost';
  styleRowCells(ws, unitsHdrRow, 1, 9, { font: FONT_TD_BOLD, border: BORDER_THIN, align: { 1: { horizontal: 'center' } } });

  const evaluatedUnits = financialMetrics.evaluatedSalableUnits || salableUnits || [];
  const uStart = currRow;
  evaluatedUnits.forEach((u) => {
    const r = currRow++;
    const uRow = ws.getRow(r);
    const cSqft = parseNum(u.carpet_area_sqft, 0);
    const sSqft = parseNum(u.super_buildup_area_sqft, 0);
    const lPct = parseNum(u.loading_pct, 0);
    const lSqft = parseNum(u.super_buildup_loading_sqft, 0);
    const devU = parseInt(u.developer_unit_count ?? u.unit_count, 10) || 0;
    const ownU = parseInt(u.landowner_unit_count, 10) || 0;
    const rate = parseNum(u.rate_per_sqft, 0);
    const uPrice = parseNum(u.unit_price, 0);
    const devAmt = parseNum(u.developer_amount, 0);

    uRow.getCell(2).value = `${u.unit_name || 'Unit'} (${u.building_use || 'Residential'})`;
    uRow.getCell(3).value = cSqft;
    uRow.getCell(4).value = u.loading_mode === 'percentage'
      ? { formula: `C${r}*(1+${lPct / 100})`, result: sSqft }
      : { formula: `C${r}+${lSqft}`, result: sSqft };
    uRow.getCell(5).value = ownU > 0 ? `${u.unit_count} (${ownU} Owner)` : `${u.unit_count || 0}`;
    uRow.getCell(6).value = devU;
    uRow.getCell(7).value = rate;
    uRow.getCell(8).value = { formula: `D${r}*G${r}`, result: uPrice };
    uRow.getCell(9).value = { formula: `H${r}*F${r}`, result: devAmt };

    uRow.getCell(3).numFmt = FMT_AREA2;
    uRow.getCell(4).numFmt = FMT_AREA2;
    uRow.getCell(6).numFmt = FMT_INT;
    uRow.getCell(7).numFmt = FMT_INR;
    uRow.getCell(8).numFmt = FMT_INR;
    uRow.getCell(9).numFmt = FMT_INR;
    styleRowCells(ws, r, 1, 9, { font: FONT_TD, border: BORDER_THIN, align: { 3: { horizontal: 'right' }, 4: { horizontal: 'right' }, 5: { horizontal: 'center' }, 6: { horizontal: 'center' }, 7: { horizontal: 'right' }, 8: { horizontal: 'right' }, 9: { horizontal: 'right' } } });
  });
  const uEnd = currRow - 1;

  const recTotalRowNum = currRow++;
  const rRecTot = ws.getRow(recTotalRowNum);
  rRecTot.getCell(1).value = 3;
  rRecTot.getCell(2).value = 'Total Developer Receipts';
  rRecTot.getCell(6).value = evaluatedUnits.length > 0 ? { formula: `SUM(F${uStart}:F${uEnd})`, result: financialMetrics.totalDeveloperUnits || 0 } : 0;
  rRecTot.getCell(9).value = evaluatedUnits.length > 0 ? { formula: `SUM(I${uStart}:I${uEnd})`, result: financialMetrics.totalReceipts || 0 } : 0;
  rRecTot.getCell(6).numFmt = FMT_INT;
  rRecTot.getCell(9).numFmt = FMT_INR;
  styleRowCells(ws, recTotalRowNum, 1, 9, { font: FONT_TD_BOLD, fill: FILL_GREEN, border: BORDER_TOTAL, align: { 1: { horizontal: 'center' }, 6: { horizontal: 'center' }, 9: { horizontal: 'right' } } });

  currRow++; // spacer

  // Project Viability Block
  const vTitleRow = currRow++;
  ws.mergeCells(`A${vTitleRow}:D${vTitleRow}`);
  ws.getCell(`A${vTitleRow}`).value = 'Project Viability';
  ws.getCell(`A${vTitleRow}`).font = FONT_SUBTITLE;
  ws.getCell(`A${vTitleRow}`).fill = FILL_SUBHEADER;
  ws.getCell(`A${vTitleRow}`).border = BORDER_THIN;

  const vCostRow = currRow++;
  ws.getRow(vCostRow).getCell(1).value = 1;
  ws.getRow(vCostRow).getCell(2).value = 'Project Cost';
  ws.getRow(vCostRow).getCell(4).value = { formula: `I${totalCostRowNum}`, result: financialMetrics.totalProjectCost || 0 };
  ws.getRow(vCostRow).getCell(4).numFmt = FMT_INR;
  styleRowCells(ws, vCostRow, 1, 4, { font: FONT_TD, border: BORDER_THIN, align: { 1: { horizontal: 'center' }, 4: { horizontal: 'right' } } });

  const vRecRow = currRow++;
  ws.getRow(vRecRow).getCell(1).value = 2;
  ws.getRow(vRecRow).getCell(2).value = 'Receipts (Developer)';
  ws.getRow(vRecRow).getCell(4).value = { formula: `I${recTotalRowNum}`, result: financialMetrics.totalReceipts || 0 };
  ws.getRow(vRecRow).getCell(4).numFmt = FMT_INR;
  styleRowCells(ws, vRecRow, 1, 4, { font: FONT_TD, border: BORDER_THIN, align: { 1: { horizontal: 'center' }, 4: { horizontal: 'right' } } });

  const vProfRow = currRow++;
  ws.getRow(vProfRow).getCell(1).value = 3;
  ws.getRow(vProfRow).getCell(2).value = 'Profit';
  ws.getRow(vProfRow).getCell(4).value = { formula: `D${vRecRow}-D${vCostRow}`, result: financialMetrics.netProfit || 0 };
  ws.getRow(vProfRow).getCell(4).numFmt = FMT_INR;
  styleRowCells(ws, vProfRow, 1, 4, { font: { ...FONT_TD_BOLD, size: 11 }, fill: FILL_ACCENT, border: BORDER_TOTAL, align: { 1: { horizontal: 'center' }, 4: { horizontal: 'right' } } });

  const vRoiRow = currRow++;
  ws.getRow(vRoiRow).getCell(1).value = 4;
  ws.getRow(vRoiRow).getCell(2).value = 'ROI (%)';
  ws.getRow(vRoiRow).getCell(4).value = { formula: `IF(D${vCostRow}>0,D${vProfRow}/D${vCostRow},0)`, result: (financialMetrics.roiPct || 0) / 100 };
  ws.getRow(vRoiRow).getCell(4).numFmt = FMT_PCT;
  styleRowCells(ws, vRoiRow, 1, 4, { font: FONT_TD_BOLD, border: BORDER_THIN, align: { 1: { horizontal: 'center' }, 4: { horizontal: 'right' } } });
}

function roundVal(v) {
  return Number.isFinite(v) ? v : 0;
}

/**
 * Generate full genuine formula-driven XLSX buffer.
 */
async function generateFeasibilityExcelBuffer(data) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Design Studio 16 (DS16)';
  wb.created = new Date();
  wb.calcProperties = { fullCalcOnLoad: true };

  const areaMeta = buildAreaSheets(wb, data);
  buildFinancialSheet(wb, data, areaMeta);

  return wb.xlsx.writeBuffer();
}

/**
 * Draw crisp tabular rows inside PDFKit with auto page-break & repeating table header.
 */
function drawPdfTable(doc, { title, columns, rows, totalRow = null, startY = null }) {
  const leftX = doc.page.margins.left;
  const maxWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const pageBottom = doc.page.height - doc.page.margins.bottom - 20;

  let y = startY !== null ? startY : doc.y;
  if (y + 42 > pageBottom) {
    doc.addPage();
    y = doc.page.margins.top;
  }

  if (title) {
    doc.rect(leftX, y, maxWidth, 16).fill('#F1F5F9').stroke('#CBD5E1');
    doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(8.5).text(title, leftX + 6, y + 4, { width: maxWidth - 12 });
    y += 16;
  }

  const totalColW = columns.reduce((s, c) => s + c.w, 0);
  const scaledCols = columns.map((c) => ({ ...c, width: (c.w / totalColW) * maxWidth }));

  const drawHeader = () => {
    doc.rect(leftX, y, maxWidth, 18).fill('#E2E8F0').stroke('#94A3B8');
    let cx = leftX;
    scaledCols.forEach((col) => {
      doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(7.5).text(col.label, cx + 4, y + 5, {
        width: col.width - 8,
        align: col.align || 'left'
      });
      cx += col.width;
    });
    y += 18;
  };

  drawHeader();

  rows.forEach((r, idx) => {
    const rowH = r._height || 16;
    if (y + rowH > pageBottom) {
      doc.addPage();
      y = doc.page.margins.top;
      drawHeader();
    }
    const bg = r._highlight ? '#ECFDF5' : (r._bold ? '#F8FAFC' : (idx % 2 === 1 ? '#FAFAFA' : '#FFFFFF'));
    doc.rect(leftX, y, maxWidth, rowH).fill(bg).stroke('#CBD5E1');
    let cx = leftX;
    scaledCols.forEach((col, cIdx) => {
      const val = r[cIdx] !== undefined && r[cIdx] !== null ? String(r[cIdx]) : '';
      doc.fillColor('#1E293B')
        .font(r._bold ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(7.5)
        .text(val, cx + 4, y + 4, { width: col.width - 8, align: col.align || 'left' });
      cx += col.width;
    });
    y += rowH;
  });

  if (totalRow) {
    if (y + 18 > pageBottom) {
      doc.addPage();
      y = doc.page.margins.top;
      drawHeader();
    }
    doc.rect(leftX, y, maxWidth, 18).fill('#FFF7ED').stroke('#94A3B8');
    let cx = leftX;
    scaledCols.forEach((col, cIdx) => {
      const val = totalRow[cIdx] !== undefined && totalRow[cIdx] !== null ? String(totalRow[cIdx]) : '';
      doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(7.8).text(val, cx + 4, y + 5, {
        width: col.width - 8,
        align: col.align || 'left'
      });
      cx += col.width;
    });
    y += 18;
  }

  doc.y = y + 8;
  return doc.y;
}

/**
 * Generate structured vector PDF containing strictly Area Statement and Financial Viability.
 */
async function generateFeasibilityPdfBuffer(data) {
  const { project = {}, statement = {}, floors = [], financial = {}, statutoryCharges = [], areaMetrics = {}, financialMetrics = {} } = data;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margins: { top: 28, bottom: 28, left: 28, right: 28 },
      bufferPages: true
    });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // PAGE 1 (LANDSCAPE): AREA STATEMENT
    const pageW = doc.page.width - 56;
    doc.rect(28, 28, pageW, 24).fill('#1E293B');
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(11).text('DESIGN STUDIO 16 — AREA STATEMENT', 36, 35);
    doc.font('Helvetica').fontSize(8.5).text(`Project: ${project.name || 'DS16 Project'}  |  Use: ${areaMetrics.buildingUse || 'Residential'}  |  ${areaMetrics.isGunthewari ? 'Gunthewari (Slum TDR Only)' : 'Regular Plot'}  |  Road: ${areaMetrics.roadWidth || '—'} m`, 28, 56);
    doc.y = 72;

    const plotArea = parseNum(statement.plot_area_sqm, 0);
    const surveyArea = parseNum(statement.city_survey_area_sqm, 0);
    const siteArea = parseNum(statement.site_area_sqm, 0);
    const dpDed = parseNum(statement.dp_deductions_sqm, 0);

    const areaTableRows = [
      ['1', 'Area Of Plot', fmtNumPdf(plotArea, 3), '—', fmtNumPdf(plotArea * SQM_TO_SQFT, 2), '—'],
      ['2', 'As Per City Survey Record', fmtNumPdf(surveyArea, 3), '—', fmtNumPdf(surveyArea * SQM_TO_SQFT, 2), '—'],
      ['3', 'As per site', fmtNumPdf(siteArea, 3), '—', fmtNumPdf(siteArea * SQM_TO_SQFT, 2), '—'],
      ['4', 'Deductions For Proposed D.P.', fmtNumPdf(dpDed, 3), '—', fmtNumPdf(dpDed * SQM_TO_SQFT, 2), '—'],
      Object.assign(['A', 'Plotable area', fmtNumPdf(areaMetrics.plotableAreaSqm, 3), fmtNumPdf(areaMetrics.plotableAreaSqm, 3), fmtNumPdf((areaMetrics.plotableAreaSqm || 0) * SQM_TO_SQFT, 2), fmtNumPdf((areaMetrics.plotableAreaSqm || 0) * SQM_TO_SQFT, 2)], { _bold: true }),
      ['B', `Basic FSI (${parseNum(statement.basic_fsi_factor, 1.1).toFixed(2)})`, fmtNumPdf(areaMetrics.permissibleFsiSqm, 3), fmtNumPdf(areaMetrics.proposedBasicFsiSqm, 3), fmtNumPdf((areaMetrics.permissibleFsiSqm || 0) * SQM_TO_SQFT, 2), fmtNumPdf((areaMetrics.proposedBasicFsiSqm || 0) * SQM_TO_SQFT, 2)],
      ['C', `Paid FSI (Max ${parseNum(statement.paid_fsi_factor, 0.5).toFixed(2)} / Prop ${parseNum(areaMetrics.effectiveProposedPaidFsiFactor, 0).toFixed(2)})`, fmtNumPdf(areaMetrics.permissiblePaidFsiSqm, 3), fmtNumPdf(areaMetrics.proposedPaidFsiSqm, 3), fmtNumPdf((areaMetrics.permissiblePaidFsiSqm || 0) * SQM_TO_SQFT, 2), fmtNumPdf((areaMetrics.proposedPaidFsiSqm || 0) * SQM_TO_SQFT, 2)],
      ['D1', `Regular TDR (${parseNum(areaMetrics.regularTdrFactor, 0).toFixed(3)} / Prop ${parseNum(areaMetrics.effectiveProposedRegularTdrFactor, 0).toFixed(3)})`, fmtNumPdf(areaMetrics.permissibleRegularTdrSqm, 3), fmtNumPdf(areaMetrics.regularTdrSqm, 3), fmtNumPdf((areaMetrics.permissibleRegularTdrSqm || 0) * SQM_TO_SQFT, 2), fmtNumPdf((areaMetrics.regularTdrSqm || 0) * SQM_TO_SQFT, 2)],
      ['D2', `Slum TDR (${parseNum(areaMetrics.slumTdrFactor, 0).toFixed(3)} / Prop ${parseNum(areaMetrics.effectiveProposedSlumTdrFactor, 0).toFixed(3)})`, fmtNumPdf(areaMetrics.permissibleSlumTdrSqm, 3), fmtNumPdf(areaMetrics.slumTdrSqm, 3), fmtNumPdf((areaMetrics.permissibleSlumTdrSqm || 0) * SQM_TO_SQFT, 2), fmtNumPdf((areaMetrics.slumTdrSqm || 0) * SQM_TO_SQFT, 2)],
      Object.assign(['D', 'Total TDR (D1 + D2)', fmtNumPdf(areaMetrics.permissibleTdrSqm, 3), fmtNumPdf(areaMetrics.proposedTdrSqm, 3), fmtNumPdf((areaMetrics.permissibleTdrSqm || 0) * SQM_TO_SQFT, 2), fmtNumPdf((areaMetrics.proposedTdrSqm || 0) * SQM_TO_SQFT, 2)], { _bold: true }),
      Object.assign(['E', 'Primary FSI / Total Builtup Area (B+C+D)', fmtNumPdf(areaMetrics.permissibleTotalBuiltupSqm, 3), fmtNumPdf(areaMetrics.proposedTotalBuiltupSqm, 3), fmtNumPdf((areaMetrics.permissibleTotalBuiltupSqm || 0) * SQM_TO_SQFT, 2), fmtNumPdf((areaMetrics.proposedTotalBuiltupSqm || 0) * SQM_TO_SQFT, 2)], { _bold: true }),
      ['F', 'TOTAL FSI Ratio', fmtNumPdf(areaMetrics.permissibleTotalFsi, 3), fmtNumPdf(areaMetrics.proposedTotalFsi, 3), 'Ratio', 'Ratio'],
      ['G1', `Ancillary — Commercial (80% of ${parseNum(areaMetrics.primaryFsiCommercialPct, 0).toFixed(1)}%)`, fmtNumPdf(areaMetrics.permissibleCommercialAncillarySqm, 3), fmtNumPdf(areaMetrics.table1ProposedCommAncSqm ?? areaMetrics.proposedCommercialAncillarySqm, 3), fmtNumPdf((areaMetrics.permissibleCommercialAncillarySqm || 0) * SQM_TO_SQFT, 2), fmtNumPdf((areaMetrics.table1ProposedCommAncSqm ?? areaMetrics.proposedCommercialAncillarySqm ?? 0) * SQM_TO_SQFT, 2)],
      ['G2', `Ancillary — Residential (60% of ${parseNum(areaMetrics.primaryFsiResidentialPct, 100).toFixed(1)}%)`, fmtNumPdf(areaMetrics.permissibleResidentialAncillarySqm, 3), fmtNumPdf(areaMetrics.table1ProposedResAncSqm ?? areaMetrics.proposedResidentialAncillarySqm, 3), fmtNumPdf((areaMetrics.permissibleResidentialAncillarySqm || 0) * SQM_TO_SQFT, 2), fmtNumPdf((areaMetrics.table1ProposedResAncSqm ?? areaMetrics.proposedResidentialAncillarySqm ?? 0) * SQM_TO_SQFT, 2)],
      Object.assign(['H', 'Total Permissible / Proposed P-Line Area (E+G)', fmtNumPdf(areaMetrics.permissiblePlineTotalSqm, 3), fmtNumPdf(areaMetrics.proposedPlineTotalSqm, 3), fmtNumPdf((areaMetrics.permissiblePlineTotalSqm || 0) * SQM_TO_SQFT, 2), fmtNumPdf((areaMetrics.proposedPlineTotalSqm || 0) * SQM_TO_SQFT, 2)], { _bold: true, _highlight: true })
    ];

    drawPdfTable(doc, {
      title: 'TABLE 1: AREA STATEMENT (PERMISSIBLE VS PROPOSED)',
      columns: [
        { label: 'Sr.', w: 30, align: 'center' },
        { label: 'Particulars', w: 220 },
        { label: 'Permissible (Sq.m)', w: 95, align: 'right' },
        { label: 'Proposed (Sq.m)', w: 95, align: 'right' },
        { label: 'Permissible (Sq.ft)', w: 95, align: 'right' },
        { label: 'Proposed (Sq.ft)', w: 95, align: 'right' }
      ],
      rows: areaTableRows
    });

    const floorPdfRows = floors.map((fl) => [
      fl.floor_name,
      fmtNumPdf(fl.height_meters, 2),
      fmtNumPdf(fl.pline_area_sqm, 2),
      fmtNumPdf(fl.lobby_area_sqm, 2),
      fmtNumPdf(fl.builtup_for_owners_sqm, 2),
      fmtNumPdf(fl.builtup_for_sale_sqm, 2)
    ]);

    drawPdfTable(doc, {
      title: `TABLE 2: FLOOR-WISE PROPOSED P-LINE AREA STATEMENT  (Area Balance: ${fmtNumPdf(areaMetrics.areaBalanceSqm, 2)} sq m | Margin H/5: ${fmtNumPdf(areaMetrics.marginHBy5Meters, 2)} m)`,
      columns: [
        { label: '1. Floor', w: 190 },
        { label: '2. Height (m)', w: 75, align: 'center' },
        { label: '3. P-Line Area (m²)', w: 105, align: 'right' },
        { label: '4. Lobby Area (m²)', w: 105, align: 'right' },
        { label: '5. Built-up for Owners (m²)', w: 110, align: 'right' },
        { label: '6. Built-up for Sale (m²)', w: 110, align: 'right' }
      ],
      rows: floorPdfRows,
      totalRow: [
        'TOTAL',
        fmtNumPdf(areaMetrics.totalHeightMeters, 2),
        fmtNumPdf(areaMetrics.totalProposedPlineSqm, 2),
        fmtNumPdf(areaMetrics.totalLobbyAreaSqm, 2),
        fmtNumPdf(areaMetrics.totalBuiltupForOwnersSqm, 2),
        fmtNumPdf(areaMetrics.totalBuiltupForSaleSqm, 2)
      ]
    });

    // NEXT DOCUMENT (PORTRAIT): FINANCIAL VIABILITY
    doc.addPage({ size: 'A4', layout: 'portrait', margins: { top: 28, bottom: 28, left: 28, right: 28 } });
    const pW = doc.page.width - 56;
    doc.rect(28, 28, pW, 24).fill('#1E293B');
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(11).text('DESIGN STUDIO 16 — FINANCIAL VIABILITY', 36, 35);
    doc.font('Helvetica').fontSize(8.5).text(`Project: ${project.name || 'DS16 Project'}  |  RR Rate: ${fmtInrPdf(financialMetrics.rrRate)} / sq m  |  Cost A: ${fmtInrPdf(financial.estimated_cost_a_rate)}  |  Cost B: ${fmtInrPdf(financial.estimated_cost_b_rate)}`, 28, 56);
    doc.y = 72;

    const visibleStat = (statutoryCharges || []).filter((s) => !s.is_deleted && s.charge_code !== 'AMALGAMATION');
    const statPdfRows = visibleStat.map((sc, i) => [
      String(i + 1),
      sc.charge_name,
      sc.is_enabled === false ? 'Disabled' : (sc.is_manual ? 'Manual' : (sc.has_override ? 'Override' : 'Formula')),
      sc.calculated_amount !== null && sc.calculated_amount !== undefined ? fmtInrPdf(sc.calculated_amount) : '—',
      fmtInrPdf(sc.is_enabled === false ? 0 : sc.effective_amount)
    ]);

    drawPdfTable(doc, {
      title: 'SECTION A: STATUTORY CHARGES & NMC DEMAND',
      columns: [
        { label: 'Sr.', w: 30, align: 'center' },
        { label: 'Particulars', w: 215 },
        { label: 'Type', w: 70, align: 'center' },
        { label: 'Calculated', w: 105, align: 'right' },
        { label: 'Final Amount', w: 110, align: 'right' }
      ],
      rows: statPdfRows,
      totalRow: ['A', 'NMC / DEMAND RS (TOTAL SECTION A)', '', '', fmtInrPdf(financialMetrics.totalStatutoryDemandA)]
    });

    const devRows = [
      ['B', `Cost of TDR (${(parseNum(financial.tdr_purchase_factor, 0.55) * 100).toFixed(0)}% RR)`, fmtInrPdf(financialMetrics.costOfTdrB)],
      ['C1', 'Minor Expenses', fmtInrPdf(financial.minor_expenses)],
      ['C2', 'BPMS - Staff Charges', fmtInrPdf(financial.bpms_staff_charges)],
      ['C3', 'Airport NOC', fmtInrPdf(financial.airport_noc)],
      ['C4', 'Fire NOC', fmtInrPdf(financial.fire_noc)],
      ['C5', 'Entertainment Charges', fmtInrPdf(financial.entertainment_charges)],
      ['C6', 'Consultants / Advocate Fees', fmtInrPdf(financial.advocate_fees)],
      ['C7', 'Extra Stamp Duty on Potential', fmtInrPdf(financial.extra_stamp_duty)],
      Object.assign(['C', 'Total Additional Expenses (C)', fmtInrPdf(financialMetrics.totalExpensesC)], { _bold: true }),
      ['H', financialMetrics.isCostOfPlotIncluded === false ? `Cost of Plot (Excluded; Saved ${fmtInrPdf(financialMetrics.costOfPlotH_details?.raw_amount)})` : 'Cost of Plot', fmtInrPdf(financialMetrics.costOfPlotH)],
      ['D', `Cost of Construction (@ ${fmtInrPdf(financial.cost_of_construction_rate)} / sq m)`, fmtInrPdf(financialMetrics.costOfConstructionD)],
      ['—', 'Cost of Infrastructure Construction', fmtInrPdf(financial.cost_of_infrastructure)],
      ['—', 'Interest', fmtInrPdf(financial.interest_amount)],
      ['E', 'Cost of Basement Construction', fmtInrPdf(financialMetrics.costOfBasementE)],
      ['F', 'Rent', fmtInrPdf(financialMetrics.rentCostF)],
      ['G', 'Stacked Parking', fmtInrPdf(financialMetrics.stackedParkingCostG)]
    ];

    drawPdfTable(doc, {
      title: 'SECTIONS B THROUGH H: TDR, EXPENSES & PROJECT DEVELOPMENT COSTS',
      columns: [
        { label: 'Code', w: 40, align: 'center' },
        { label: 'Cost Component', w: 360 },
        { label: 'Amount (Rs.)', w: 130, align: 'right' }
      ],
      rows: devRows,
      totalRow: ['TOTAL', 'TOTAL PROJECT COST (A+B+C+D+E+F+G+H+Infra+Interest)', fmtInrPdf(financialMetrics.totalProjectCost)]
    });

    const unitPdfRows = (financialMetrics.evaluatedSalableUnits || []).map((u, idx) => [
      String(idx + 1),
      `${u.unit_name || 'Unit'} (${u.building_use || 'Res'})`,
      fmtNumPdf(u.carpet_area_sqft, 2),
      fmtNumPdf(u.super_buildup_area_sqft, 2),
      u.landowner_unit_count > 0 ? `${u.developer_unit_count} (+${u.landowner_unit_count} Own)` : String(u.developer_unit_count),
      fmtInrPdf(u.rate_per_sqft),
      fmtInrPdf(u.developer_amount)
    ]);

    drawPdfTable(doc, {
      title: `RECEIPTS — SALABLE UNITS COST  (Period Required: ${financial.period_months || '—'})`,
      columns: [
        { label: 'Sr.', w: 26, align: 'center' },
        { label: 'Particular', w: 150 },
        { label: 'Carpet (ft²)', w: 62, align: 'right' },
        { label: 'Super B/Up (ft²)', w: 72, align: 'right' },
        { label: 'Dev Units', w: 62, align: 'center' },
        { label: 'Rate/ft²', w: 68, align: 'right' },
        { label: 'Developer Amount', w: 98, align: 'right' }
      ],
      rows: unitPdfRows,
      totalRow: ['3', 'Total Developer Receipts', '', '', String(financialMetrics.totalDeveloperUnits || 0), '', fmtInrPdf(financialMetrics.totalReceipts)]
    });

    drawPdfTable(doc, {
      title: 'PROJECT VIABILITY SUMMARY',
      columns: [
        { label: 'Sr.', w: 40, align: 'center' },
        { label: 'Particular', w: 360 },
        { label: 'Amount / %', w: 130, align: 'right' }
      ],
      rows: [
        ['1', 'Project Cost', fmtInrPdf(financialMetrics.totalProjectCost)],
        ['2', 'Receipts (Developer)', fmtInrPdf(financialMetrics.totalReceipts)],
        Object.assign(['3', 'Profit (Receipts - Cost)', fmtInrPdf(financialMetrics.netProfit)], { _bold: true, _highlight: true }),
        ['4', 'ROI (%)', `${fmtNumPdf(financialMetrics.roiPct, 2)}%`]
      ]
    });

    // Stamp page numbers on every page
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      const pw = doc.page.width - 56;
      doc.fillColor('#64748B').font('Helvetica').fontSize(7.5).text(
        `Design Studio 16 (DS16) — Feasibility Report   |   Page ${i + 1} of ${range.count}`,
        28,
        doc.page.height - 20,
        { width: pw, align: 'center' }
      );
    }

    doc.end();
  });
}

module.exports = {
  generateFeasibilityExcelBuffer,
  generateFeasibilityPdfBuffer
};
