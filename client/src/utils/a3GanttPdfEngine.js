// client/src/utils/a3GanttPdfEngine.js
// Authoritative calculation, pagination, layout & PDF generation engine for DS16 Construction Schedules
// Supports A3 & A4 in Landscape & Portrait with 2-Dimensional Intelligent Pagination

import { jsPDF } from 'jspdf';

// ─── Standard Paper Dimensions (in mm) ─────────────────────────────────────────
export const PAPER_SIZES = {
  A3: {
    landscape: { width: 420, height: 297 },
    portrait:  { width: 297, height: 420 }
  },
  A4: {
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
    return sorted.map((t, idx) => ({
      type: 'task',
      id: t.id || t.temp_id || `t-${idx}`,
      task: t,
      rowHeight: 6.5
    }));
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
        rows.push({
          type: 'task',
          id: t.id || t.temp_id || `t-${t.order_index}`,
          task: t,
          rowHeight: 6.5
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
      rowHeight: 8.0
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
        rowHeight: 6.5
      });

      sub.tasks.sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
      sub.tasks.forEach(t => {
        rows.push({
          type: 'task',
          id: t.id || t.temp_id || `t-${t.order_index}`,
          task: t,
          sectionName: secName,
          rowHeight: 6.5
        });
      });
    });
  });

  return rows;
}

// ─── Timeline Date Ranges & Horizontal Slices ─────────────────────────────────

/**
 * Calculates project overall date range and slices into horizontal printable segments.
 */
export function calculateTimelineSlices(tasks = [], options = {}, availableTimelineWidthMm = 260) {
  let minTime = Infinity;
  let maxTime = -Infinity;

  tasks.forEach(t => {
    const s = parseDateSafe(t.planned_start_date);
    const e = parseDateSafe(t.planned_finish_date);
    if (s && s.getTime() < minTime) minTime = s.getTime();
    if (e && e.getTime() > maxTime) maxTime = e.getTime();
  });

  const now = new Date();
  if (minTime === Infinity) minTime = now.getTime();
  if (maxTime === -Infinity) maxTime = minTime + 180 * 86400000;

  // Align start to the 1st of start month
  const projectStart = new Date(minTime);
  projectStart.setDate(1);
  projectStart.setHours(0, 0, 0, 0);

  // Align finish to end of finish month
  const projectFinish = new Date(maxTime);
  projectFinish.setMonth(projectFinish.getMonth() + 1);
  projectFinish.setDate(0);
  projectFinish.setHours(23, 59, 59, 999);

  // List all months in project span
  const allMonths = [];
  const curr = new Date(projectStart);
  while (curr <= projectFinish) {
    const mStart = new Date(curr);
    curr.setMonth(curr.getMonth() + 1);
    const mEnd = new Date(curr.getTime() - 1);
    allMonths.push({
      start: mStart,
      end: mEnd,
      label: mStart.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
      days: Math.round((mEnd - mStart) / 86400000) + 1
    });
  }

  const scale = options.timelineScale || 'auto';
  let monthsPerSlice = 6; // default for A3

  if (scale === 'weekly') {
    // In weekly view, fit ~14-16 weeks per page (approx 3.5 months)
    monthsPerSlice = availableTimelineWidthMm > 240 ? 4 : 3;
  } else if (scale === 'monthly') {
    // Pure monthly view
    monthsPerSlice = availableTimelineWidthMm > 240 ? 6 : 4;
  } else {
    // 'auto': choose based on total project length & available width
    if (allMonths.length <= 6 && availableTimelineWidthMm >= 220) {
      monthsPerSlice = allMonths.length;
    } else if (allMonths.length <= 8 && availableTimelineWidthMm >= 260) {
      monthsPerSlice = allMonths.length;
    } else {
      monthsPerSlice = availableTimelineWidthMm > 240 ? 6 : 4;
    }
  }

  monthsPerSlice = Math.max(1, monthsPerSlice);

  const horizontalSlices = [];
  for (let i = 0; i < allMonths.length; i += monthsPerSlice) {
    const sliceMonths = allMonths.slice(i, i + monthsPerSlice);
    const sliceStart = sliceMonths[0].start;
    const sliceEnd = sliceMonths[sliceMonths.length - 1].end;
    const totalDays = Math.round((sliceEnd - sliceStart) / 86400000) + 1;
    const dayWidthMm = availableTimelineWidthMm / totalDays;

    horizontalSlices.push({
      sliceIndex: horizontalSlices.length,
      startDate: sliceStart,
      endDate: sliceEnd,
      months: sliceMonths,
      totalDays,
      dayWidthMm,
      label: `${sliceMonths[0].label} – ${sliceMonths[sliceMonths.length - 1].label}`
    });
  }

  if (horizontalSlices.length === 0) {
    const defaultStart = new Date();
    const defaultEnd = new Date(defaultStart.getTime() + 180 * 86400000);
    horizontalSlices.push({
      sliceIndex: 0,
      startDate: defaultStart,
      endDate: defaultEnd,
      months: allMonths,
      totalDays: 180,
      dayWidthMm: availableTimelineWidthMm / 180,
      label: 'Overall Schedule'
    });
  }

  return { projectStart, projectFinish, allMonths, horizontalSlices };
}

// ─── 2-Dimensional Pagination Matrix Builder ──────────────────────────────────

/**
 * Calculates the complete 2D page matrix for the document.
 * Returns { pages, totalPages, verticalCount, horizontalCount, layoutDimensions }
 */
export function buildPaginatedScheduleMatrix(tasks = [], options = {}, project = {}) {
  const paper = (options.paperSize || 'A3').toUpperCase();
  const orientation = (options.orientation || 'landscape').toLowerCase();
  const dims = (PAPER_SIZES[paper] && PAPER_SIZES[paper][orientation]) 
    ? PAPER_SIZES[paper][orientation] 
    : PAPER_SIZES.A3.landscape;

  const marginX = 12;
  const marginTop = 10;
  const marginBottom = 10;

  const headerHeight = options.includeProjectDetails !== false ? 26 : 14;
  const tableHeaderHeight = 11;
  const footerHeight = options.includeColorLegend !== false ? 14 : 9;

  const printableWidth = dims.width - (marginX * 2);
  const printableHeight = dims.height - marginTop - marginBottom;
  const availableContentHeight = printableHeight - headerHeight - tableHeaderHeight - footerHeight;

  // Sidebar column widths (in mm)
  const includeSidebar = options.includeSidebar !== false;
  let sidebarWidth = 0;
  let sidebarCols = [];

  if (includeSidebar) {
    if (paper === 'A4' && orientation === 'portrait') {
      sidebarWidth = 85;
      sidebarCols = [
        { key: 'name', label: 'Activity Description', width: 45 },
        { key: 'duration', label: 'Days', width: 14, align: 'center' },
        { key: 'dates', label: 'Dates', width: 26 }
      ];
    } else if (paper === 'A4' && orientation === 'landscape') {
      sidebarWidth = 110;
      sidebarCols = [
        { key: 'name', label: 'Activity Description', width: 52 },
        { key: 'level', label: 'Floor / Level', width: 22 },
        { key: 'duration', label: 'Days', width: 12, align: 'center' },
        { key: 'dates', label: 'Dates', width: 24 }
      ];
    } else {
      // A3 Standard
      sidebarWidth = 132;
      sidebarCols = [
        { key: 'name', label: 'Activity Description', width: 56 },
        { key: 'level', label: 'Floor / Level', width: 26 },
        { key: 'duration', label: 'Days', width: 14, align: 'center' },
        { key: 'start', label: 'Planned Start', width: 18 },
        { key: 'finish', label: 'Planned Finish', width: 18 }
      ];
    }
  }

  const timelineWidth = printableWidth - sidebarWidth;

  // 1. Organize all task rows based on grouping
  const allRows = organizeTaskRows(tasks, options.activityGrouping || 'groups');

  // 2. Vertical Pagination (Row Slicing with Orphan Prevention)
  const verticalSheets = [];
  let currentRowSlice = [];
  let currentAccumulatedHeight = 0;

  for (let i = 0; i < allRows.length; i++) {
    const row = allRows[i];
    const isHeader = row.type === 'section_header' || row.type === 'floor_header';

    // Lookahead: If header is placed at very bottom of page without enough tasks, push to next sheet
    let headerNeedsPageBreak = false;
    if (isHeader) {
      const remainingHeight = availableContentHeight - currentAccumulatedHeight;
      // Header needs at least its own height + at least 2 task rows (~20mm)
      if (remainingHeight < 22 && currentRowSlice.length > 0) {
        headerNeedsPageBreak = true;
      }
    }

    if (currentAccumulatedHeight + row.rowHeight > availableContentHeight || headerNeedsPageBreak) {
      if (currentRowSlice.length > 0) {
        verticalSheets.push(currentRowSlice);
        currentRowSlice = [];
        currentAccumulatedHeight = 0;
      }
    }

    currentRowSlice.push(row);
    currentAccumulatedHeight += row.rowHeight;
  }

  if (currentRowSlice.length > 0) {
    verticalSheets.push(currentRowSlice);
  }

  if (verticalSheets.length === 0) {
    verticalSheets.push([]);
  }

  // 3. Horizontal Pagination (Timeline Slices)
  const { projectStart, projectFinish, allMonths, horizontalSlices } = calculateTimelineSlices(
    tasks,
    options,
    timelineWidth
  );

  // 4. Build 2D Page Matrix
  const pages = [];
  const totalVerticalPages = verticalSheets.length;
  const totalHorizontalSlices = horizontalSlices.length;
  const totalPages = totalVerticalPages * totalHorizontalSlices;

  let pageNum = 1;

  for (let vIdx = 0; vIdx < totalVerticalPages; vIdx++) {
    const vRows = verticalSheets[vIdx];

    for (let hIdx = 0; hIdx < totalHorizontalSlices; hIdx++) {
      const hSlice = horizontalSlices[hIdx];

      pages.push({
        pageNumber: pageNum,
        totalPages,
        rowSheetIndex: vIdx + 1,
        totalRowSheets: totalVerticalPages,
        timelineSliceIndex: hIdx + 1,
        totalTimelineSlices: totalHorizontalSlices,
        rows: vRows,
        slice: hSlice,
        paper,
        orientation,
        dims,
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
          timelineLeft: marginX + sidebarWidth
        },
        project: {
          name: project.name || 'DS16 Construction Project',
          clientName: project.client_name || project.client_display_name || 'Client',
          location: project.location || project.city || 'Site Location',
          startDate: project.start_date || (tasks[0] ? tasks[0].planned_start_date : null),
          version: project.published_version ? `Schedule v${project.published_version}` : 'Schedule v1.0',
          exportDate: new Date()
        }
      });

      pageNum++;
    }
  }

  return {
    pages,
    totalPages,
    totalVerticalPages,
    totalHorizontalSlices,
    projectStart,
    projectFinish,
    allMonths,
    layoutDimensions: dims
  };
}

// ─── Direct PDF Generation Engine (via jsPDF Vector Drawing) ──────────────────

/**
 * Generates an exact, vector-based, print-ready PDF from the calculated matrix.
 * Returns the jsPDF document object.
 */
export function generateA3GanttPdf(matrixData, options = {}) {
  const { pages, totalPages } = matrixData;
  if (!pages || pages.length === 0) {
    throw new Error('No pages generated for schedule export.');
  }

  const firstPage = pages[0];
  const doc = new jsPDF({
    orientation: firstPage.orientation,
    unit: 'mm',
    format: [firstPage.dims.width, firstPage.dims.height]
  });

  pages.forEach((page, pageIdx) => {
    if (pageIdx > 0) {
      doc.addPage([page.dims.width, page.dims.height], page.orientation);
    }

    renderPdfPage(doc, page, options);
  });

  return doc;
}

/**
 * Vector draws a single paginated A3/A4 page in jsPDF.
 */
function renderPdfPage(doc, page, options) {
  const { layout, project, slice, rows, pageNumber, totalPages, rowSheetIndex, totalRowSheets, timelineSliceIndex, totalTimelineSlices } = page;
  const { marginX, marginTop, sidebarWidth, sidebarCols, timelineWidth, timelineLeft, headerHeight, tableHeaderHeight } = layout;

  let currentY = marginTop;

  // ─── 1. Header Banner ───────────────────────────────────────────────────────
  if (options.includeProjectDetails !== false) {
    // Top border brand stripe
    doc.setFillColor(224, 90, 30); // #E05A1E
    doc.rect(marginX, currentY, layout.printableWidth, 1.5, 'F');

    currentY += 2;

    // Header background container
    doc.setFillColor(248, 250, 252); // #F8FAFC
    doc.setDrawColor(226, 232, 240); // #E2E8F0
    doc.rect(marginX, currentY, layout.printableWidth, headerHeight - 2, 'FD');

    // Branding Title Left
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(15, 23, 42); // slate-900
    doc.text('DESIGN STUDIO 16', marginX + 4, currentY + 6);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(224, 90, 30);
    doc.text('CONSTRUCTION SCHEDULE & GANTT CHART', marginX + 54, currentY + 6);

    // Project metadata grid
    const metaY = currentY + 12;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139); // slate-500

    doc.text('PROJECT:', marginX + 4, metaY);
    doc.text('CLIENT:', marginX + 4, metaY + 5.5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    doc.text(truncateText(doc, project.name, 70), marginX + 22, metaY);
    doc.setFont('helvetica', 'normal');
    doc.text(truncateText(doc, project.clientName, 70), marginX + 22, metaY + 5.5);

    // Center column: Location & Start Date
    const col2X = marginX + 110;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text('LOCATION:', col2X, metaY);
    doc.text('START DATE:', col2X, metaY + 5.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(15, 23, 42);
    doc.text(truncateText(doc, project.location, 55), col2X + 22, metaY);
    doc.text(formatDateDisplay(project.startDate), col2X + 22, metaY + 5.5);

    // Right column: Revision, Date, Sheet index
    const col3X = layout.printableWidth + marginX - 4;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(224, 90, 30);
    doc.text(project.version, col3X, metaY - 5, { align: 'right' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    doc.text(`Timeline Scope: ${slice.label}`, col3X, metaY);
    doc.text(`Sheet: Section R${rowSheetIndex}/${totalRowSheets} · Period C${timelineSliceIndex}/${totalTimelineSlices}`, col3X, metaY + 5.5, { align: 'right' });

    currentY += (headerHeight - 2) + 2;
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
      doc.setFontSize(7);
      doc.setTextColor(51, 65, 85);

      const textX = col.align === 'center' ? colX + (col.width / 2) : colX + 3;
      doc.text(col.label, textX, tableHeaderY + 6.5, { align: col.align || 'left' });

      // Column separator
      doc.line(colX + col.width, tableHeaderY, colX + col.width, tableHeaderY + tableHeaderHeight);
      colX += col.width;
    });
  }

  // Timeline Header Background
  doc.setFillColor(241, 245, 249);
  doc.setDrawColor(203, 213, 225);
  doc.rect(timelineLeft, tableHeaderY, timelineWidth, tableHeaderHeight, 'FD');

  // Month intervals (Top half of table header)
  const monthRowH = 5.5;
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
    doc.setFontSize(7.5);
    doc.setTextColor(30, 41, 59);
    doc.text(m.label, mLeft + (mWidth / 2), tableHeaderY + 4, { align: 'center' });

    // Sub-ticks (Weeks: W1, W2, W3, W4)
    const weeksInMonth = 4;
    const weekWidth = mWidth / weeksInMonth;
    for (let w = 0; w < weeksInMonth; w++) {
      const wX = mLeft + (w * weekWidth);
      doc.setDrawColor(226, 232, 240);
      doc.rect(wX, tableHeaderY + monthRowH, weekWidth, subRowH, 'D');

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6);
      doc.setTextColor(100, 116, 139);
      doc.text(`W${w + 1}`, wX + (weekWidth / 2), tableHeaderY + monthRowH + 3.8, { align: 'center' });
    }
  });

  currentY += tableHeaderHeight;

  // ─── 3. Activity Rows & Gantt Bars ──────────────────────────────────────────
  const rowStartY = currentY;

  rows.forEach((row, rowIdx) => {
    const rowH = row.rowHeight;
    const rowY = currentY;

    if (row.type === 'section_header') {
      // Construction Group Header
      doc.setFillColor(226, 232, 240); // slate-200
      doc.setDrawColor(203, 213, 225);
      doc.rect(marginX, rowY, layout.printableWidth, rowH, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(15, 23, 42);
      doc.text(row.name.toUpperCase(), marginX + 3, rowY + 5.2);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(71, 85, 105);
      doc.text(`${row.totalTasks} activities`, marginX + sidebarWidth - 4, rowY + 5.2, { align: 'right' });

    } else if (row.type === 'subgroup_header' || row.type === 'floor_header') {
      // Subgroup / Floor Header
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.rect(marginX, rowY, layout.printableWidth, rowH, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(51, 65, 85);
      doc.text(`▸ ${row.name}`, marginX + 7, rowY + 4.5);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(148, 163, 184);
      doc.text(`${row.totalTasks} items`, marginX + sidebarWidth - 4, rowY + 4.5, { align: 'right' });

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
            if (isMilestone) nameText = `★ ${nameText}`;
            doc.text(truncateText(doc, nameText, col.width - 6), colX + 8, rowY + 4.4);
          } else if (col.key === 'level') {
            doc.setTextColor(71, 85, 105);
            doc.text(truncateText(doc, t.floor_zone || '-', col.width - 4), colX + 3, rowY + 4.4);
          } else if (col.key === 'duration') {
            doc.text(`${t.duration_days || 1}d`, colX + (col.width / 2), rowY + 4.4, { align: 'center' });
          } else if (col.key === 'start') {
            doc.text(formatShortDate(t.planned_start_date), colX + 3, rowY + 4.4);
          } else if (col.key === 'finish') {
            doc.text(formatShortDate(t.planned_finish_date), colX + 3, rowY + 4.4);
          } else if (col.key === 'dates') {
            const dtRange = `${formatShortDate(t.planned_start_date)} - ${formatShortDate(t.planned_finish_date)}`;
            doc.text(dtRange, colX + 3, rowY + 4.4);
          }

          // Column border
          doc.setDrawColor(226, 232, 240);
          doc.line(colX + col.width, rowY, colX + col.width, rowY + rowH);
          colX += col.width;
        });
      }

      // Vertical grid lines across timeline
      slice.months.forEach(m => {
        const mStartDays = Math.max(0, Math.round((m.start - slice.startDate) / 86400000));
        const mLeft = timelineLeft + (mStartDays * slice.dayWidthMm);
        doc.setDrawColor(241, 245, 249);
        doc.line(mLeft, rowY, mLeft, rowY + rowH);
      });

      // Render Gantt Task Bar
      const startDate = parseDateSafe(t.planned_start_date);
      const finishDate = parseDateSafe(t.planned_finish_date) || startDate;

      if (startDate && finishDate) {
        const sliceStartTime = slice.startDate.getTime();
        const sliceEndTime = slice.endDate.getTime();
        const taskStartTime = startDate.getTime();
        const taskEndTime = finishDate.getTime();

        // Check if task overlaps this horizontal timeline slice
        const isVisibleInSlice = taskEndTime >= sliceStartTime && taskStartTime <= sliceEndTime;

        if (isVisibleInSlice) {
          const startsBeforeSlice = taskStartTime < sliceStartTime;
          const endsAfterSlice = taskEndTime > sliceEndTime;

          const effectiveStart = startsBeforeSlice ? slice.startDate : startDate;
          const effectiveEnd = endsAfterSlice ? slice.endDate : finishDate;

          const startOffsetDays = Math.max(0, Math.round((effectiveStart - slice.startDate) / 86400000));
          const durationDays = Math.max(1, Math.round((effectiveEnd - effectiveStart) / 86400000) + 1);

          const barX = timelineLeft + (startOffsetDays * slice.dayWidthMm);
          const rawBarW = durationDays * slice.dayWidthMm;
          const barW = Math.max(2, Math.min(rawBarW, (timelineLeft + timelineWidth) - barX));
          const barH = 4.2;
          const barY = rowY + (rowH - barH) / 2;

          // Status Color
          const isOverdue = t.is_overdue || (t.status !== 'Completed' && taskEndTime < Date.now());
          const statusKey = isOverdue ? 'Overdue' : (t.status || 'Not Started');
          const statusCfg = STATUS_COLORS[statusKey] || STATUS_COLORS['Not Started'];

          doc.setFillColor(statusCfg.rgb[0], statusCfg.rgb[1], statusCfg.rgb[2]);
          doc.setDrawColor(Math.max(0, statusCfg.rgb[0] - 25), Math.max(0, statusCfg.rgb[1] - 25), Math.max(0, statusCfg.rgb[2] - 25));

          // Draw rounded or clipped bar
          doc.roundedRect(barX, barY, barW, barH, 1, 1, 'FD');

          // Continuation indicators
          if (startsBeforeSlice) {
            doc.setFillColor(255, 255, 255);
            doc.text('◀', barX + 0.8, barY + 3.1);
          }
          if (endsAfterSlice) {
            doc.setFillColor(255, 255, 255);
            doc.text('▶', barX + barW - 2.5, barY + 3.1);
          }

          // Bar text if bar width allows
          if (barW > 24) {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(5.5);
            doc.setTextColor(255, 255, 255);
            const insideText = truncateText(doc, t.task_name, barW - 6);
            doc.text(insideText, barX + (startsBeforeSlice ? 3.5 : 2), barY + 3.0);
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

  // Today Vertical Line (if inside slice)
  const today = new Date();
  if (today >= slice.startDate && today <= slice.endDate) {
    const todayOffsetDays = Math.round((today - slice.startDate) / 86400000);
    const todayX = timelineLeft + (todayOffsetDays * slice.dayWidthMm);

    doc.setDrawColor(220, 38, 38); // red-600
    doc.setLineDashPattern([2, 1], 0);
    doc.line(todayX, tableHeaderY, todayX, currentY);
    doc.setLineDashPattern([], 0); // reset

    doc.setFillColor(220, 38, 38);
    doc.circle(todayX, tableHeaderY - 1, 1.2, 'F');
  }

  // ─── 4. Legend & Footer Strip ───────────────────────────────────────────────
  const footerY = page.dims.height - layout.marginBottom - 4;

  if (options.includeColorLegend !== false) {
    let legX = marginX + 2;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(71, 85, 105);
    doc.text('STATUS:', legX, footerY);
    legX += 13;

    Object.values(STATUS_COLORS).forEach(sc => {
      doc.setFillColor(sc.rgb[0], sc.rgb[1], sc.rgb[2]);
      doc.rect(legX, footerY - 2.8, 3.2, 3.2, 'F');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(71, 85, 105);
      doc.text(sc.label, legX + 4.5, footerY);
      legX += 19;
    });

    // Milestone indicator
    doc.setTextColor(217, 119, 6);
    doc.setFont('helvetica', 'bold');
    doc.text('★', legX, footerY);
    doc.setTextColor(71, 85, 105);
    doc.setFont('helvetica', 'normal');
    doc.text('Milestone / Slab Trigger', legX + 3.5, footerY);
  }

  // Center Continuation / Navigation Notice
  if (totalTimelineSlices > 1 || totalRowSheets > 1) {
    const noticeX = marginX + (layout.printableWidth / 2);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(6.5);
    doc.setTextColor(148, 163, 184);

    let notice = '';
    if (timelineSliceIndex < totalTimelineSlices) {
      notice = `↳ Timeline continues horizontally on Page ${pageNumber + 1}`;
    } else if (rowSheetIndex < totalRowSheets) {
      notice = `↓ Activities continue vertically on Page ${pageNumber + 1}`;
    }
    if (notice) doc.text(notice, noticeX, footerY, { align: 'center' });
  }

  // Page numbering right
  if (options.includePageNumbers !== false) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(71, 85, 105);
    const pageStr = `Page ${pageNumber} of ${totalPages}`;
    doc.text(pageStr, marginX + layout.printableWidth - 2, footerY, { align: 'right' });
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
