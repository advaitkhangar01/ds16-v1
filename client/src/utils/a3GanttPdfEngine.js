// client/src/utils/a3GanttPdfEngine.js
// Authoritative single-page full-composition Gantt Chart & Schedule PDF generation engine for DS16.
// Replaces multi-page fragmentation with exactly ONE continuous, print-ready PDF page.
// Supports custom uncompressed plotter dimensions (default) and proportional single-page standard sizes.

import { jsPDF } from 'jspdf';

// ─── Standard Paper Dimensions (in mm) ─────────────────────────────────────────
export const PAPER_SIZES = {
  custom: {
    label: 'Custom (Continuous Full Plotter)',
    description: 'Auto-sized to fit 100% of activities and timeline at full scale with zero compression'
  },
  A3: {
    label: 'A3 (Single Sheet - Scaled)',
    landscape: { width: 420, height: 297 },
    portrait:  { width: 297, height: 420 }
  },
  A4: {
    label: 'A4 (Single Sheet - Scaled)',
    landscape: { width: 297, height: 210 },
    portrait:  { width: 210, height: 297 }
  }
};

export const STANDARD_CONSTRUCTION_SECTIONS = [
  'Site Preparation',
  'RCC Work',
  'Masonry Work',
  'Finishing Work',
  'Additional Work'
];

export const STATUS_COLORS = {
  'Completed':   { hex: '#059669', rgb: [5, 150, 105], label: 'Completed' },
  'In Progress': { hex: '#E05A1E', rgb: [224, 90, 30], label: 'In Progress' },
  'On Hold':     { hex: '#9333EA', rgb: [147, 51, 234], label: 'On Hold' },
  'Not Started': { hex: '#94A3B8', rgb: [148, 163, 184], label: 'Not Started' },
  'Overdue':     { hex: '#DC2626', rgb: [220, 38, 38], label: 'Overdue' }
};

// ─── Helper Functions ──────────────────────────────────────────────────────────

export function formatDateDisplay(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatShortDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

export function parseDateSafe(val) {
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

// ─── Task Organization & Grouping ─────────────────────────────────────────────

/**
 * Organizes tasks into displayable rows according to selected grouping strategy.
 * Returns flattened rows with hierarchy metadata.
 */
export function organizeTaskRows(tasks = [], groupingMode = 'groups') {
  if (!tasks || tasks.length === 0) return [];

  // Normalize section names
  const normalized = tasks.map(t => ({
    ...t,
    section_name: t.section_name === 'Polishing Work' ? 'Finishing Work' : (t.section_name || 'RCC Work'),
    floor_zone: t.floor_zone || 'General',
    floor_order: t.floor_order !== undefined ? t.floor_order : 0,
    order_index: t.order_index !== undefined ? t.order_index : 0
  }));

  if (groupingMode === 'none') {
    // Flat sorted by planned_start_date then order_index
    const sorted = [...normalized].sort((a, b) => {
      const aStart = a.planned_start_date ? new Date(a.planned_start_date).getTime() : 0;
      const bStart = b.planned_start_date ? new Date(b.planned_start_date).getTime() : 0;
      if (aStart !== bStart) return aStart - bStart;
      return (a.order_index || 0) - (b.order_index || 0);
    });
    return sorted.map((t, idx) => {
      const hasActualStart = Boolean(t.actual_start_date);
      const hasActualFinish = Boolean(t.actual_finish_date);
      const isSameAsPlanned = hasActualStart && hasActualFinish &&
        t.actual_start_date === t.planned_start_date &&
        t.actual_finish_date === t.planned_finish_date;
      const hasTwoBars = hasActualStart && !isSameAsPlanned;

      return {
        type: 'task',
        id: t.id || t.temp_id || `t-${idx}`,
        task: t,
        hasTwoBars,
        rowHeight: hasTwoBars ? 9.2 : 6.5
      };
    });
  }

  if (groupingMode === 'floors') {
    // Group primarily by Floor Level / Zone
    const floorMap = new Map();
    normalized.forEach(t => {
      const fKey = t.floor_zone;
      if (!floorMap.has(fKey)) {
        floorMap.set(fKey, {
          floor_name: fKey,
          floor_order: t.floor_order,
          tasks: []
        });
      }
      floorMap.get(fKey).tasks.push(t);
    });

    const sortedFloors = Array.from(floorMap.values()).sort((a, b) => a.floor_order - b.floor_order);
    const rows = [];
    sortedFloors.forEach(f => {
      rows.push({
        type: 'floor_header',
        id: `fl-${f.floor_name}`,
        name: f.floor_name,
        totalTasks: f.tasks.length,
        rowHeight: 7.5
      });
      f.tasks.sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
      f.tasks.forEach(t => {
        const hasActualStart = Boolean(t.actual_start_date);
        const hasActualFinish = Boolean(t.actual_finish_date);
        const isSameAsPlanned = hasActualStart && hasActualFinish &&
          t.actual_start_date === t.planned_start_date &&
          t.actual_finish_date === t.planned_finish_date;
        const hasTwoBars = hasActualStart && !isSameAsPlanned;

        rows.push({
          type: 'task',
          id: t.id || t.temp_id || `t-${t.order_index}`,
          task: t,
          hasTwoBars,
          rowHeight: hasTwoBars ? 9.2 : 6.5
        });
      });
    });
    return rows;
  }

  // Default: 'groups' (Construction Groups -> Floor Subgroups -> Tasks)
  const rows = [];
  STANDARD_CONSTRUCTION_SECTIONS.forEach(secName => {
    const secTasks = normalized.filter(t => t.section_name === secName);
    if (secTasks.length === 0) return;

    rows.push({
      type: 'section_header',
      id: `sec-${secName}`,
      name: secName,
      totalTasks: secTasks.length,
      rowHeight: 8.5
    });

    // Subgroup by floor
    const subMap = new Map();
    secTasks.forEach(t => {
      const fKey = t.floor_zone;
      if (!subMap.has(fKey)) {
        subMap.set(fKey, {
          floor_name: fKey,
          floor_order: t.floor_order,
          tasks: []
        });
      }
      subMap.get(fKey).tasks.push(t);
    });

    const sortedSubs = Array.from(subMap.values()).sort((a, b) => a.floor_order - b.floor_order);
    sortedSubs.forEach(sub => {
      rows.push({
        type: 'subgroup_header',
        id: `sg-${secName}-${sub.floor_name}`,
        name: sub.floor_name,
        sectionName: secName,
        totalTasks: sub.tasks.length,
        rowHeight: 7.0
      });

      sub.tasks.sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
      sub.tasks.forEach(t => {
        const hasActualStart = Boolean(t.actual_start_date);
        const hasActualFinish = Boolean(t.actual_finish_date);
        const isSameAsPlanned = hasActualStart && hasActualFinish &&
          t.actual_start_date === t.planned_start_date &&
          t.actual_finish_date === t.planned_finish_date;
        const hasTwoBars = hasActualStart && !isSameAsPlanned;

        rows.push({
          type: 'task',
          id: t.id || t.temp_id || `t-${t.order_index}`,
          task: t,
          sectionName: secName,
          hasTwoBars,
          rowHeight: hasTwoBars ? 9.2 : 6.5
        });
      });
    });
  });

  return rows;
}

// ─── Full Timeline Calculation (Single Continuous Range) ──────────────────────

/**
 * Calculates the complete project date range without horizontal slicing.
 * Returns { projectStart, projectFinish, allMonths, totalDays, dayWidthMm }
 */
export function calculateFullTimeline(tasks = [], options = {}, availableWidthMm = null) {
  let minTime = Infinity;
  let maxTime = -Infinity;

  const now = new Date();
  const nowTime = now.getTime();

  tasks.forEach(t => {
    const s = parseDateSafe(t.planned_start_date);
    const e = parseDateSafe(t.planned_finish_date);
    if (s && s.getTime() < minTime) minTime = s.getTime();
    if (e && e.getTime() > maxTime) maxTime = e.getTime();

    const as = parseDateSafe(t.actual_start_date);
    const af = parseDateSafe(t.actual_finish_date);
    if (as && as.getTime() < minTime) minTime = as.getTime();
    if (af && af.getTime() > maxTime) maxTime = af.getTime();
    if (as && !af && nowTime > maxTime) maxTime = nowTime;
  });
  if (minTime === Infinity) minTime = now.getTime();
  if (maxTime === -Infinity) maxTime = minTime + 180 * 86400000;

  // Align start to the 1st of the start month
  const projectStart = new Date(minTime);
  projectStart.setDate(1);
  projectStart.setHours(0, 0, 0, 0);

  // Align finish to the end of the finish month
  const projectFinish = new Date(maxTime);
  projectFinish.setMonth(projectFinish.getMonth() + 1);
  projectFinish.setDate(0);
  projectFinish.setHours(23, 59, 59, 999);

  // Collect all months in the project span
  const allMonths = [];
  const curr = new Date(projectStart);
  while (curr <= projectFinish) {
    const mStart = new Date(curr);
    curr.setMonth(curr.getMonth() + 1);
    const mEnd = new Date(curr.getTime() - 1);
    const daysInMonth = Math.round((mEnd - mStart) / 86400000) + 1;

    allMonths.push({
      start: mStart,
      end: mEnd,
      label: mStart.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
      days: daysInMonth
    });
  }

  const totalDays = Math.max(1, Math.round((projectFinish - projectStart) / 86400000) + 1);

  // Determine dayWidthMm:
  // If availableWidthMm is explicitly given (e.g. scaling to fit a fixed sheet), use that.
  // Otherwise calculate dynamic readable width based on scale option.
  let dayWidthMm = 2.8; // default ~85mm per 30-day month
  const scale = options.timelineScale || 'auto';

  if (availableWidthMm && availableWidthMm > 0) {
    dayWidthMm = availableWidthMm / totalDays;
  } else {
    if (scale === 'weekly') {
      dayWidthMm = 3.4; // ~102mm per month
    } else if (scale === 'monthly') {
      dayWidthMm = 2.4; // ~72mm per month
    } else {
      // 'auto'
      if (allMonths.length <= 4) {
        dayWidthMm = 3.5;
      } else if (allMonths.length <= 8) {
        dayWidthMm = 2.8;
      } else if (allMonths.length <= 15) {
        dayWidthMm = 2.2;
      } else {
        dayWidthMm = 1.8;
      }
    }
  }

  const timelineWidth = totalDays * dayWidthMm;

  return {
    projectStart,
    projectFinish,
    allMonths,
    totalDays,
    dayWidthMm,
    timelineWidth,
    label: `${allMonths[0]?.label || ''} – ${allMonths[allMonths.length - 1]?.label || ''}`
  };
}

// ─── Single-Page Full-Composition Matrix Builder ──────────────────────────────

/**
 * Builds the complete single-page composition metadata for the entire Gantt schedule.
 * Exactly ONE page is produced.
 */
export function buildSinglePageScheduleMatrix(tasks = [], options = {}, project = {}) {
  const paper = (options.paperSize || 'custom').toLowerCase();
  const orientation = (options.orientation || 'landscape').toLowerCase();

  // 1. Organize all task rows into full hierarchy
  const allRows = organizeTaskRows(tasks, options.activityGrouping || 'groups');

  // 2. Calculate dynamic sidebar column widths based on actual task content
  const includeSidebar = options.includeSidebar !== false;
  let sidebarWidth = 0;
  let sidebarCols = [];

  if (includeSidebar) {
    // Determine maximum length of task names to prevent clipping
    let maxNameLen = 20;
    tasks.forEach(t => {
      const len = (t.task_name || '').length;
      if (len > maxNameLen) maxNameLen = len;
    });

    // Approximate ~1.3mm per character at 7pt Helvetica + padding
    const calculatedNameColWidth = Math.min(105, Math.max(72, Math.round(maxNameLen * 1.35)));

    sidebarCols = [
      { key: 'name', label: 'Activity Description', width: calculatedNameColWidth },
      { key: 'level', label: 'Floor / Level', width: 28 },
      { key: 'duration', label: 'Days', width: 14, align: 'center' },
      { key: 'start', label: 'Planned Start', width: 20 },
      { key: 'finish', label: 'Planned Finish', width: 20 }
    ];

    sidebarWidth = sidebarCols.reduce((sum, c) => sum + c.width, 0);
  }

  // 3. Margin & Layout Header / Footer heights
  const marginX = 14;
  const marginTop = 12;
  const marginBottom = 12;

  const headerHeight = options.includeProjectDetails !== false ? 28 : 12;
  const tableHeaderHeight = 12; // 6mm months + 6mm weeks
  const footerHeight = options.includeColorLegend !== false ? 14 : 8;

  // 4. Sum of all row heights
  const totalRowsHeight = allRows.reduce((sum, r) => sum + (r.rowHeight || 6.5), 0);
  const totalContentHeight = headerHeight + tableHeaderHeight + totalRowsHeight + footerHeight;

  // 5. Timeline Calculation
  const isFixedStandardPaper = paper === 'a3' || paper === 'a4';

  let dims = { width: 0, height: 0 };
  let finalTimeline = null;
  let scaleFactor = 1.0;

  if (isFixedStandardPaper && options.fitToPaper === true) {
    // Proportional single-page scaling to fit fixed sheet (e.g. user insists on fitting to 420x297)
    const stdDims = PAPER_SIZES[paper.toUpperCase()][orientation] || PAPER_SIZES.A3.landscape;
    dims = { ...stdDims };

    const printableW = dims.width - (marginX * 2);
    const printableH = dims.height - marginTop - marginBottom;

    // Available timeline width on this sheet
    const availableTLWidth = Math.max(60, printableW - sidebarWidth);
    finalTimeline = calculateFullTimeline(tasks, options, availableTLWidth);

    // If rows exceed height, calculate proportional scale factor
    if (totalContentHeight > printableH) {
      scaleFactor = printableH / totalContentHeight;
    }
  } else {
    // Custom continuous full-scale page (Default & Recommended)
    // No compression, no distortion, complete unclipped canvas
    finalTimeline = calculateFullTimeline(tasks, options, null);
    const calculatedWidth = marginX * 2 + sidebarWidth + finalTimeline.timelineWidth;
    const calculatedHeight = marginTop + totalContentHeight + marginBottom;

    // Round up to clean integer mm
    dims = {
      width: Math.max(320, Math.ceil(calculatedWidth)),
      height: Math.max(220, Math.ceil(calculatedHeight))
    };
  }

  const printableWidth = dims.width - (marginX * 2);
  const printableHeight = dims.height - marginTop - marginBottom;
  const timelineWidth = printableWidth - sidebarWidth;

  const timelineSlice = {
    sliceIndex: 0,
    startDate: finalTimeline.projectStart,
    endDate: finalTimeline.projectFinish,
    months: finalTimeline.allMonths,
    totalDays: finalTimeline.totalDays,
    dayWidthMm: finalTimeline.dayWidthMm,
    label: finalTimeline.label
  };

  const projectInfo = {
    name: project.name || 'DS16 Construction Project',
    clientName: project.client_name || project.client_display_name || 'Client',
    location: project.location || project.city || 'Site Location',
    startDate: project.start_date || (tasks[0] ? tasks[0].planned_start_date : null),
    version: project.published_version ? `Schedule v${project.published_version}` : 'Schedule v1.0',
    exportDate: new Date()
  };

  // Build the SINGLE complete page object
  const singlePage = {
    pageNumber: 1,
    totalPages: 1,
    rowSheetIndex: 1,
    totalRowSheets: 1,
    timelineSliceIndex: 1,
    totalTimelineSlices: 1,
    rows: allRows,
    slice: timelineSlice,
    paper: paper === 'custom' ? 'Custom Plotter' : paper.toUpperCase(),
    orientation: dims.width >= dims.height ? 'landscape' : 'portrait',
    dims,
    scaleFactor,
    layout: {
      marginX,
      marginTop,
      marginBottom,
      headerHeight,
      tableHeaderHeight,
      footerHeight,
      printableWidth,
      printableHeight,
      sidebarWidth,
      sidebarCols,
      timelineWidth,
      timelineLeft: marginX + sidebarWidth,
      totalRowsHeight
    },
    project: projectInfo
  };

  return {
    pages: [singlePage],
    totalPages: 1,
    totalVerticalPages: 1,
    totalHorizontalSlices: 1,
    projectStart: finalTimeline.projectStart,
    projectFinish: finalTimeline.projectFinish,
    allMonths: finalTimeline.allMonths,
    totalActivities: tasks.length,
    layoutDimensions: dims
  };
}

// Backward-compatibility alias
export const buildPaginatedScheduleMatrix = buildSinglePageScheduleMatrix;

// ─── Direct Vector PDF Generation Engine (via jsPDF) ──────────────────────────

/**
 * Generates an exact, vector-based, print-ready PDF containing the complete Gantt chart on exactly ONE page.
 * Returns the jsPDF document object.
 */
export function generateA3GanttPdf(matrixData, options = {}) {
  const { pages } = matrixData;
  if (!pages || pages.length === 0) {
    throw new Error('No pages generated for schedule export.');
  }

  const page = pages[0]; // Exactly ONE complete page
  const orientation = page.dims.width >= page.dims.height ? 'landscape' : 'portrait';

  const doc = new jsPDF({
    orientation,
    unit: 'mm',
    format: [page.dims.width, page.dims.height],
    compress: true
  });

  renderPdfSinglePage(doc, page, options);

  return doc;
}

/**
 * Vector draws the entire continuous Gantt chart onto the single PDF page.
 */
function renderPdfSinglePage(doc, page, options) {
  const { layout, project, slice, rows } = page;
  const { marginX, marginTop, sidebarWidth, sidebarCols, timelineWidth, timelineLeft, headerHeight, tableHeaderHeight } = layout;

  let currentY = marginTop;

  // ─── 1. Header Banner ───────────────────────────────────────────────────────
  if (options.includeProjectDetails !== false) {
    // Brand orange top accent stripe
    doc.setFillColor(224, 90, 30); // #E05A1E
    doc.rect(marginX, currentY, layout.printableWidth, 2.0, 'F');

    currentY += 2.5;

    // Header container
    doc.setFillColor(248, 250, 252); // slate-50
    doc.setDrawColor(203, 213, 225); // slate-300
    doc.rect(marginX, currentY, layout.printableWidth, headerHeight - 2.5, 'FD');

    // Branding Title Left
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(15, 23, 42); // slate-900
    doc.text('DESIGN STUDIO 16', marginX + 5, currentY + 7);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(224, 90, 30);
    doc.text('COMPLETE CONSTRUCTION SCHEDULE & GANTT CHART', marginX + 68, currentY + 7);

    // Project metadata grid
    const metaY = currentY + 14;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139); // slate-500

    doc.text('PROJECT:', marginX + 5, metaY);
    doc.text('CLIENT:', marginX + 5, metaY + 6);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text(truncateText(doc, project.name, 90), marginX + 26, metaY);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text(truncateText(doc, project.clientName, 90), marginX + 26, metaY + 6);

    // Center column: Location & Start Date
    const col2X = marginX + 130;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text('LOCATION:', col2X, metaY);
    doc.text('START DATE:', col2X, metaY + 6);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    doc.text(truncateText(doc, project.location, 65), col2X + 26, metaY);
    doc.text(formatDateDisplay(project.startDate), col2X + 26, metaY + 6);

    // Right column: Revision, Timeline Scope, Complete Schedule Badge
    const col3X = layout.printableWidth + marginX - 5;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(224, 90, 30);
    doc.text(project.version, col3X, metaY - 6, { align: 'right' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text(`Timeline: ${slice.label}`, col3X, metaY, { align: 'right' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(5, 150, 105); // emerald-600
    doc.text(`1 Complete Continuous Composition · ${rows.filter(r => r.type === 'task').length} Activities`, col3X, metaY + 6, { align: 'right' });

    currentY += (headerHeight - 2.5) + 2.5;
  }

  // ─── 2. Table Header (Sidebar Columns + Timeline Months & Weeks) ────────────
  const tableHeaderY = currentY;

  // Sidebar Header Background
  if (options.includeSidebar !== false) {
    doc.setFillColor(241, 245, 249); // slate-100
    doc.setDrawColor(203, 213, 225); // slate-300
    doc.rect(marginX, tableHeaderY, sidebarWidth, tableHeaderHeight, 'FD');

    let colX = marginX;
    sidebarCols.forEach(col => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(51, 65, 85);

      const textX = col.align === 'center' ? colX + (col.width / 2) : colX + 3.5;
      doc.text(col.label, textX, tableHeaderY + 7.5, { align: col.align || 'left' });

      // Column separator line
      doc.line(colX + col.width, tableHeaderY, colX + col.width, tableHeaderY + tableHeaderHeight);
      colX += col.width;
    });
  }

  // Timeline Header Background
  doc.setFillColor(241, 245, 249);
  doc.setDrawColor(203, 213, 225);
  doc.rect(timelineLeft, tableHeaderY, timelineWidth, tableHeaderHeight, 'FD');

  // Month intervals (Top half of table header)
  const monthRowH = 6.0;
  const subRowH = tableHeaderHeight - monthRowH;

  slice.months.forEach(m => {
    const mStartDays = Math.max(0, Math.round((m.start - slice.startDate) / 86400000));
    const mDays = m.days;
    const mLeft = timelineLeft + (mStartDays * slice.dayWidthMm);
    const mWidth = mDays * slice.dayWidthMm;

    // Month box
    doc.setDrawColor(203, 213, 225);
    doc.rect(mLeft, tableHeaderY, mWidth, monthRowH, 'D');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(30, 41, 59);
    doc.text(m.label, mLeft + (mWidth / 2), tableHeaderY + 4.3, { align: 'center' });

    // Sub-ticks (Weeks: W1, W2, W3, W4)
    const weeksInMonth = 4;
    const weekWidth = mWidth / weeksInMonth;
    for (let w = 0; w < weeksInMonth; w++) {
      const wX = mLeft + (w * weekWidth);
      doc.setDrawColor(226, 232, 240);
      doc.rect(wX, tableHeaderY + monthRowH, weekWidth, subRowH, 'D');

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(100, 116, 139);
      doc.text(`W${w + 1}`, wX + (weekWidth / 2), tableHeaderY + monthRowH + 4.1, { align: 'center' });
    }
  });

  currentY += tableHeaderHeight;

  // ─── 3. Activity Rows & Gantt Bars ──────────────────────────────────────────
  rows.forEach((row, rowIdx) => {
    const rowH = row.rowHeight;
    const rowY = currentY;

    if (row.type === 'section_header') {
      // Construction Group Header Band
      doc.setFillColor(226, 232, 240); // slate-200
      doc.setDrawColor(203, 213, 225);
      doc.rect(marginX, rowY, layout.printableWidth, rowH, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(15, 23, 42);
      doc.text(row.name.toUpperCase(), marginX + 4, rowY + 5.6);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(71, 85, 105);
      doc.text(`${row.totalTasks} activities`, marginX + sidebarWidth - 4, rowY + 5.6, { align: 'right' });

    } else if (row.type === 'subgroup_header' || row.type === 'floor_header') {
      // Subgroup / Floor Header Band
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.rect(marginX, rowY, layout.printableWidth, rowH, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(51, 65, 85);
      doc.text(`▸ ${row.name}`, marginX + 8, rowY + 4.8);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(148, 163, 184);
      doc.text(`${row.totalTasks} items`, marginX + sidebarWidth - 4, rowY + 4.8, { align: 'right' });

    } else {
      // Task Row
      const t = row.task;
      const isEven = rowIdx % 2 === 0;

      // Row background
      doc.setFillColor(isEven ? 255 : 250, isEven ? 255 : 250, isEven ? 255 : 252);
      doc.setDrawColor(241, 245, 249);
      doc.rect(marginX, rowY, layout.printableWidth, rowH, 'FD');

      // Sidebar values
      if (options.includeSidebar !== false) {
        let colX = marginX;
        sidebarCols.forEach(col => {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7);
          doc.setTextColor(30, 41, 59);

          if (col.key === 'name') {
            const isMilestone = Boolean(t.is_milestone || t.metadata?.is_trigger_milestone);
            let nameText = t.task_name;
            if (isMilestone) {
              nameText = `★ ${nameText}`;
              doc.setTextColor(217, 119, 6);
              doc.setFont('helvetica', 'bold');
            }
            doc.text(truncateText(doc, nameText, col.width - 5), colX + 6, rowY + 4.5);
          } else if (col.key === 'level') {
            doc.setTextColor(71, 85, 105);
            doc.text(truncateText(doc, t.floor_zone || '-', col.width - 4), colX + 3.5, rowY + 4.5);
          } else if (col.key === 'duration') {
            doc.text(`${t.duration_days || 1}d`, colX + (col.width / 2), rowY + 4.5, { align: 'center' });
          } else if (col.key === 'start') {
            doc.text(formatShortDate(t.planned_start_date), colX + 3.5, rowY + 4.5);
          } else if (col.key === 'finish') {
            doc.text(formatShortDate(t.planned_finish_date), colX + 3.5, rowY + 4.5);
          }

          // Column border
          doc.setDrawColor(226, 232, 240);
          doc.line(colX + col.width, rowY, colX + col.width, rowY + rowH);
          colX += col.width;
        });
      }

      // Vertical grid lines across timeline (month boundaries & weeks)
      slice.months.forEach(m => {
        const mStartDays = Math.max(0, Math.round((m.start - slice.startDate) / 86400000));
        const mLeft = timelineLeft + (mStartDays * slice.dayWidthMm);
        doc.setDrawColor(241, 245, 249);
        doc.line(mLeft, rowY, mLeft, rowY + rowH);
      });

      // Render Gantt Task Bars
      const startDate = parseDateSafe(t.planned_start_date);
      const finishDate = parseDateSafe(t.planned_finish_date) || startDate;

      if (row.hasTwoBars) {
        // ─── TWO BARS: Planned Baseline (Top) + Actual Execution (Bottom) ───
        if (startDate && finishDate) {
          const startOffsetDays = Math.max(0, Math.round((startDate - slice.startDate) / 86400000));
          const durationDays = Math.max(1, Math.round((finishDate - startDate) / 86400000) + 1);
          const barX = timelineLeft + (startOffsetDays * slice.dayWidthMm);
          const barW = Math.max(2.5, durationDays * slice.dayWidthMm);
          const barH = 3.2;
          const barY = rowY + 1.2;

          const isOverdue = t.is_overdue || (t.status !== 'Completed' && finishDate.getTime() < Date.now());
          const statusKey = isOverdue ? 'Overdue' : (t.status || 'Not Started');
          const statusCfg = STATUS_COLORS[statusKey] || STATUS_COLORS['Not Started'];

          doc.setFillColor(statusCfg.rgb[0], statusCfg.rgb[1], statusCfg.rgb[2]);
          doc.setDrawColor(Math.max(0, statusCfg.rgb[0] - 25), Math.max(0, statusCfg.rgb[1] - 25), Math.max(0, statusCfg.rgb[2] - 25));
          doc.roundedRect(barX, barY, barW, barH, 0.6, 0.6, 'FD');

          if (barW > 24) {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(5.0);
            doc.setTextColor(255, 255, 255);
            doc.text(truncateText(doc, `Planned: ${t.task_name}`, barW - 4), barX + 2, barY + 2.3);
          }
        }

        // Bottom Bar: Actual Execution
        const actualStartDate = parseDateSafe(t.actual_start_date);
        const actualFinishDate = parseDateSafe(t.actual_finish_date) || new Date();
        const isOngoing = !t.actual_finish_date;

        if (actualStartDate) {
          const actualStartOffset = Math.max(0, Math.round((actualStartDate - slice.startDate) / 86400000));
          const actualDuration = Math.max(1, Math.round((actualFinishDate - actualStartDate) / 86400000) + 1);
          const actBarX = timelineLeft + (actualStartOffset * slice.dayWidthMm);
          const actBarW = Math.max(2.5, actualDuration * slice.dayWidthMm);
          const actBarH = 3.2;
          const actBarY = rowY + 4.8;

          doc.setFillColor(14, 116, 144); // cyan-700
          doc.setDrawColor(8, 145, 178);  // cyan-600

          if (isOngoing) {
            doc.setLineDashPattern([1.5, 0.8], 0);
          }
          doc.roundedRect(actBarX, actBarY, actBarW, actBarH, 0.6, 0.6, 'FD');
          if (isOngoing) {
            doc.setLineDashPattern([], 0);
          }

          if (actBarW > 24) {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(5.0);
            doc.setTextColor(255, 255, 255);
            const actLabel = isOngoing ? 'Actual (Ongoing)' : 'Actual Execution';
            doc.text(truncateText(doc, actLabel, actBarW - 4), actBarX + 2, actBarY + 2.3);
          }
        }
      } else {
        // ─── SINGLE BAR: Planned Baseline ───
        if (startDate && finishDate) {
          const startOffsetDays = Math.max(0, Math.round((startDate - slice.startDate) / 86400000));
          const durationDays = Math.max(1, Math.round((finishDate - startDate) / 86400000) + 1);

          const barX = timelineLeft + (startOffsetDays * slice.dayWidthMm);
          const barW = Math.max(2.5, durationDays * slice.dayWidthMm);
          const barH = 4.2;
          const barY = rowY + (rowH - barH) / 2;

          const isOverdue = t.is_overdue || (t.status !== 'Completed' && finishDate.getTime() < Date.now());
          const statusKey = isOverdue ? 'Overdue' : (t.status || 'Not Started');
          const statusCfg = STATUS_COLORS[statusKey] || STATUS_COLORS['Not Started'];

          doc.setFillColor(statusCfg.rgb[0], statusCfg.rgb[1], statusCfg.rgb[2]);
          doc.setDrawColor(Math.max(0, statusCfg.rgb[0] - 25), Math.max(0, statusCfg.rgb[1] - 25), Math.max(0, statusCfg.rgb[2] - 25));
          doc.roundedRect(barX, barY, barW, barH, 0.8, 0.8, 'FD');

          const isMilestone = Boolean(t.is_milestone || t.metadata?.is_trigger_milestone);
          if (isMilestone) {
            doc.setTextColor(255, 255, 255);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(6.5);
            doc.text('★', barX + 1.2, barY + 3.1);
          }

          if (barW > 26) {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(5.5);
            doc.setTextColor(255, 255, 255);
            const textOffset = isMilestone ? 4.5 : 2.0;
            const insideText = truncateText(doc, t.task_name, barW - textOffset - 2);
            doc.text(insideText, barX + textOffset, barY + 3.0);
          }
        }
      }
    }

    // Horizontal bottom row divider
    doc.setDrawColor(226, 232, 240);
    doc.line(marginX, rowY + rowH, marginX + layout.printableWidth, rowY + rowH);

    currentY += rowH;
  });

  // Table bounding outer border
  const totalTableH = currentY - tableHeaderY;
  doc.setDrawColor(203, 213, 225);
  doc.rect(marginX, tableHeaderY, layout.printableWidth, totalTableH, 'D');

  // Today Vertical Line (dashed red line across entire table)
  const today = new Date();
  if (today >= slice.startDate && today <= slice.endDate) {
    const todayOffsetDays = Math.round((today - slice.startDate) / 86400000);
    const todayX = timelineLeft + (todayOffsetDays * slice.dayWidthMm);

    doc.setDrawColor(220, 38, 38); // red-600
    doc.setLineDashPattern([2, 1], 0);
    doc.line(todayX, tableHeaderY, todayX, currentY);
    doc.setLineDashPattern([], 0); // reset line style

    doc.setFillColor(220, 38, 38);
    doc.circle(todayX, tableHeaderY - 1.2, 1.2, 'F');
  }

  // ─── 4. Legend & Footer Strip ───────────────────────────────────────────────
  const footerY = page.dims.height - layout.marginBottom - 3;

  if (options.includeColorLegend !== false) {
    let legX = marginX + 3;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(71, 85, 105);
    doc.text('STATUS:', legX, footerY);
    legX += 14;

    Object.values(STATUS_COLORS).forEach(sc => {
      doc.setFillColor(sc.rgb[0], sc.rgb[1], sc.rgb[2]);
      doc.rect(legX, footerY - 2.8, 3.2, 3.2, 'F');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(71, 85, 105);
      doc.text(sc.label, legX + 4.5, footerY);
      legX += 20;
    });

    // Milestone indicator
    doc.setTextColor(217, 119, 6);
    doc.setFont('helvetica', 'bold');
    doc.text('★', legX, footerY);
    doc.setTextColor(71, 85, 105);
    doc.setFont('helvetica', 'normal');
    doc.text('Milestone / Slab Trigger', legX + 3.5, footerY);
    legX += 28;

    // Actual Execution
    doc.setFillColor(14, 116, 144);
    doc.rect(legX, footerY - 2.8, 3.2, 3.2, 'F');
    doc.setFont('helvetica', 'normal');
    doc.text('Actual Execution', legX + 4.5, footerY);
    legX += 26;

    // Actual Ongoing
    doc.setFillColor(14, 116, 144);
    doc.setDrawColor(8, 145, 178);
    doc.setLineDashPattern([1, 0.5], 0);
    doc.rect(legX, footerY - 2.8, 3.2, 3.2, 'FD');
    doc.setLineDashPattern([], 0);
    doc.text('Actual (Ongoing)', legX + 4.5, footerY);
  }

  // Center Authority Brand Notice
  const noticeX = marginX + (layout.printableWidth / 2);
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.text('Design Studio 16 Enterprise Management · Authoritative Single-Page Construction Schedule', noticeX, footerY, { align: 'center' });

  // Page numbering right: Exactly Page 1 of 1
  if (options.includePageNumbers !== false) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    doc.text('Page 1 of 1 (Complete Schedule)', marginX + layout.printableWidth - 2, footerY, { align: 'right' });
  }
}

/**
 * Text truncator helper ensuring strings fit in mm boundaries without clipping
 */
function truncateText(doc, text, maxWidthMm) {
  if (!text) return '';
  const str = String(text);
  if (doc.getTextWidth(str) <= maxWidthMm) return str;

  let truncated = str;
  while (truncated.length > 3 && doc.getTextWidth(truncated + '…') > maxWidthMm) {
    truncated = truncated.slice(0, -1);
  }
  return truncated + '…';
}
