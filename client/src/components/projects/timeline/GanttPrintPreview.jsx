// client/src/components/projects/timeline/GanttPrintPreview.jsx
import React from 'react';
import { STATUS_COLORS, formatShortDate, formatDateDisplay } from '../../../utils/a3GanttPdfEngine';

export default function GanttPrintPreview({ pageData, options = {}, zoom = 1.0 }) {
  if (!pageData) {
    return (
      <div className="flex items-center justify-center h-96 text-slate-400 text-sm">
        No page preview data available.
      </div>
    );
  }

  const { layout, project, slice, rows, pageNumber, totalPages, rowSheetIndex, totalRowSheets, timelineSliceIndex, totalTimelineSlices, dims } = pageData;
  const { sidebarCols, sidebarWidth, timelineWidth, printableWidth, headerHeight, tableHeaderHeight } = layout;

  // Scale in millimeters to pixels for crisp screen preview (1mm approx 3.78px at standard 96dpi screen)
  const mmToPx = 3.78 * zoom;

  const sheetWidthPx = dims.width * mmToPx;
  const sheetHeightPx = dims.height * mmToPx;

  return (
    <div className="flex justify-center items-start overflow-auto p-4 bg-slate-200/70 min-h-full">
      <div
        className="bg-white shadow-2xl border border-slate-300 relative select-none font-sans text-slate-800 transition-all flex flex-col justify-between"
        style={{
          width: `${sheetWidthPx}px`,
          height: `${sheetHeightPx}px`,
          minWidth: `${sheetWidthPx}px`,
          minHeight: `${sheetHeightPx}px`,
          padding: `${layout.marginTop * mmToPx}px ${layout.marginX * mmToPx}px ${layout.marginBottom * mmToPx}px ${layout.marginX * mmToPx}px`,
          boxSizing: 'border-box'
        }}
      >
        {/* Main Content (Header + Table) */}
        <div className="flex-1 flex flex-col">
          {/* ─── 1. Header ────────────────────────────────────────────── */}
          {options.includeProjectDetails !== false && (
            <div
              className="border border-slate-300 rounded-md bg-slate-50/80 mb-2 relative overflow-hidden flex flex-col justify-between"
              style={{ height: `${(headerHeight - 2) * mmToPx}px`, padding: `${2 * mmToPx}px ${4 * mmToPx}px` }}
            >
              {/* Brand orange top accent bar */}
              <div className="absolute top-0 left-0 right-0 h-1 bg-[#E05A1E]" />

              {/* Title & Metadata Top Row */}
              <div className="flex items-center justify-between pt-1">
                <div className="flex items-center gap-3">
                  <span className="font-extrabold tracking-tight text-slate-900" style={{ fontSize: `${3.2 * mmToPx}px` }}>
                    DESIGN STUDIO 16
                  </span>
                  <span className="font-bold text-[#E05A1E]" style={{ fontSize: `${2.4 * mmToPx}px` }}>
                    CONSTRUCTION SCHEDULE & GANTT CHART
                  </span>
                </div>
                <div className="flex items-center gap-3 text-right">
                  <span className="font-bold text-[#E05A1E]" style={{ fontSize: `${2.3 * mmToPx}px` }}>
                    {project.version}
                  </span>
                  <span className="text-slate-500 font-mono" style={{ fontSize: `${2.0 * mmToPx}px` }}>
                    Export: {formatShortDate(project.exportDate)}
                  </span>
                </div>
              </div>

              {/* Project Metadata Grid */}
              <div className="grid grid-cols-3 gap-2 border-t border-slate-200/80 pt-1 text-slate-600" style={{ fontSize: `${2.1 * mmToPx}px` }}>
                <div>
                  <span className="font-bold text-slate-400 mr-1.5 uppercase text-[9px]">Project:</span>
                  <span className="font-bold text-slate-800">{project.name}</span>
                </div>
                <div>
                  <span className="font-bold text-slate-400 mr-1.5 uppercase text-[9px]">Location:</span>
                  <span>{project.location}</span>
                </div>
                <div className="text-right">
                  <span className="font-bold text-slate-400 mr-1.5 uppercase text-[9px]">Scope:</span>
                  <span className="font-semibold text-slate-700">{slice.label}</span>
                </div>

                <div>
                  <span className="font-bold text-slate-400 mr-1.5 uppercase text-[9px]">Client:</span>
                  <span className="font-semibold">{project.clientName}</span>
                </div>
                <div>
                  <span className="font-bold text-slate-400 mr-1.5 uppercase text-[9px]">Start Date:</span>
                  <span>{formatDateDisplay(project.startDate)}</span>
                </div>
                <div className="text-right font-medium text-slate-500">
                  <span>Sheet R{rowSheetIndex}/{totalRowSheets} · Period C{timelineSliceIndex}/{totalTimelineSlices}</span>
                </div>
              </div>
            </div>
          )}

          {/* ─── 2. Schedule Table Container ──────────────────────────── */}
          <div className="border border-slate-300 rounded flex flex-col flex-1 overflow-hidden bg-white">
            {/* Table Header */}
            <div className="flex border-b border-slate-300 bg-slate-100/90 font-bold text-slate-700" style={{ height: `${tableHeaderHeight * mmToPx}px` }}>
              {/* Sidebar Header Columns */}
              {options.includeSidebar !== false && (
                <div className="flex border-r border-slate-300 bg-slate-100 flex-shrink-0" style={{ width: `${sidebarWidth * mmToPx}px` }}>
                  {sidebarCols.map((col) => (
                    <div
                      key={col.key}
                      className="border-r last:border-r-0 border-slate-200 flex items-center px-1.5"
                      style={{
                        width: `${col.width * mmToPx}px`,
                        justifyContent: col.align === 'center' ? 'center' : 'flex-start',
                        fontSize: `${2.0 * mmToPx}px`
                      }}
                    >
                      {col.label}
                    </div>
                  ))}
                </div>
              )}

              {/* Timeline Header Months & Weeks */}
              <div className="flex-1 flex flex-col relative" style={{ width: `${timelineWidth * mmToPx}px` }}>
                {/* Month Intervals */}
                <div className="flex border-b border-slate-200 flex-1">
                  {slice.months.map((m, idx) => {
                    const mDays = m.days;
                    const mWidthPx = (mDays * slice.dayWidthMm) * mmToPx;
                    return (
                      <div
                        key={idx}
                        className="border-r last:border-r-0 border-slate-200 flex items-center justify-center font-bold text-slate-800 truncate px-1"
                        style={{ width: `${mWidthPx}px`, fontSize: `${2.2 * mmToPx}px` }}
                      >
                        {m.label}
                      </div>
                    );
                  })}
                </div>

                {/* Sub-weeks */}
                <div className="flex h-1/2 bg-slate-50">
                  {slice.months.map((m, mIdx) => {
                    const mDays = m.days;
                    const mWidthPx = (mDays * slice.dayWidthMm) * mmToPx;
                    const weekWidthPx = mWidthPx / 4;
                    return (
                      <div key={mIdx} className="flex border-r last:border-r-0 border-slate-200" style={{ width: `${mWidthPx}px` }}>
                        {[1, 2, 3, 4].map((w) => (
                          <div
                            key={w}
                            className="border-r last:border-r-0 border-slate-200 flex items-center justify-center text-slate-400 font-mono text-[9px]"
                            style={{ width: `${weekWidthPx}px`, fontSize: `${1.7 * mmToPx}px` }}
                          >
                            W{w}
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Table Rows Body */}
            <div className="flex-1 flex flex-col divide-y divide-slate-100 relative">
              {rows.map((row, rIdx) => {
                const rowHPx = row.rowHeight * mmToPx;

                if (row.type === 'section_header') {
                  return (
                    <div
                      key={row.id}
                      className="flex items-center px-2 bg-slate-200/80 font-extrabold text-slate-900 border-t border-slate-300"
                      style={{ height: `${rowHPx}px`, fontSize: `${2.2 * mmToPx}px` }}
                    >
                      <span className="uppercase tracking-wider">{row.name}</span>
                      <span className="ml-2 font-normal text-slate-600" style={{ fontSize: `${1.8 * mmToPx}px` }}>
                        ({row.totalTasks} activities)
                      </span>
                    </div>
                  );
                }

                if (row.type === 'subgroup_header' || row.type === 'floor_header') {
                  return (
                    <div
                      key={row.id}
                      className="flex items-center px-3 bg-slate-100/60 font-semibold text-slate-700"
                      style={{ height: `${rowHPx}px`, fontSize: `${2.0 * mmToPx}px` }}
                    >
                      <span>▸ {row.name}</span>
                      <span className="ml-1.5 text-slate-400" style={{ fontSize: `${1.7 * mmToPx}px` }}>
                        ({row.totalTasks})
                      </span>
                    </div>
                  );
                }

                const t = row.task;
                const isEven = rIdx % 2 === 0;

                // Timeline bar calculation
                const startDate = t.planned_start_date ? new Date(t.planned_start_date) : null;
                const finishDate = t.planned_finish_date ? new Date(t.planned_finish_date) : startDate;

                let barEl = null;
                if (startDate && finishDate) {
                  const sliceStartTime = slice.startDate.getTime();
                  const sliceEndTime = slice.endDate.getTime();
                  const taskStartTime = startDate.getTime();
                  const taskEndTime = finishDate.getTime();

                  if (taskEndTime >= sliceStartTime && taskStartTime <= sliceEndTime) {
                    const startsBefore = taskStartTime < sliceStartTime;
                    const endsAfter = taskEndTime > sliceEndTime;

                    const effectiveStart = startsBefore ? slice.startDate : startDate;
                    const effectiveEnd = endsAfter ? slice.endDate : finishDate;

                    const startOffsetDays = Math.max(0, Math.round((effectiveStart - slice.startDate) / 86400000));
                    const durationDays = Math.max(1, Math.round((effectiveEnd - effectiveStart) / 86400000) + 1);

                    const barLeftPx = (startOffsetDays * slice.dayWidthMm) * mmToPx;
                    const barWidthPx = Math.max(4, (durationDays * slice.dayWidthMm) * mmToPx);

                    const isOverdue = t.is_overdue || (t.status !== 'Completed' && taskEndTime < Date.now());
                    const statusKey = isOverdue ? 'Overdue' : (t.status || 'Not Started');
                    const statusCfg = STATUS_COLORS[statusKey] || STATUS_COLORS['Not Started'];

                    barEl = (
                      <div
                        className="absolute rounded flex items-center px-1 text-white truncate shadow-2xs font-semibold cursor-default"
                        style={{
                          left: `${barLeftPx}px`,
                          width: `${barWidthPx}px`,
                          height: `${4.5 * mmToPx}px`,
                          top: `${(row.rowHeight - 4.5) / 2 * mmToPx}px`,
                          backgroundColor: statusCfg.hex,
                          fontSize: `${1.8 * mmToPx}px`
                        }}
                        title={`${t.task_name} (${t.planned_start_date} to ${t.planned_finish_date})`}
                      >
                        {startsBefore && <span className="mr-0.5 text-[8px]">◀</span>}
                        <span className="truncate">{barWidthPx > 45 ? t.task_name : ''}</span>
                        {endsAfter && <span className="ml-0.5 text-[8px]">▶</span>}
                      </div>
                    );
                  }
                }

                return (
                  <div
                    key={row.id}
                    className={`flex items-center ${isEven ? 'bg-white' : 'bg-slate-50/40'} hover:bg-slate-100/40`}
                    style={{ height: `${rowHPx}px` }}
                  >
                    {/* Left Sidebar Row Columns */}
                    {options.includeSidebar !== false && (
                      <div className="flex border-r border-slate-200 flex-shrink-0 h-full items-center" style={{ width: `${sidebarWidth * mmToPx}px` }}>
                        {sidebarCols.map((col) => {
                          let cellVal = '';
                          let isMilestone = Boolean(t.is_milestone || t.metadata?.is_trigger_milestone);

                          if (col.key === 'name') {
                            cellVal = (
                              <span className="truncate flex items-center gap-1 font-semibold text-slate-800">
                                {isMilestone && <span className="text-amber-500 font-bold">★</span>}
                                <span className="truncate">{t.task_name}</span>
                              </span>
                            );
                          } else if (col.key === 'level') {
                            cellVal = <span className="truncate text-slate-500">{t.floor_zone || '-'}</span>;
                          } else if (col.key === 'duration') {
                            cellVal = <span className="font-mono text-slate-600">{t.duration_days || 1}d</span>;
                          } else if (col.key === 'start') {
                            cellVal = <span className="font-mono text-slate-500">{formatShortDate(t.planned_start_date)}</span>;
                          } else if (col.key === 'finish') {
                            cellVal = <span className="font-mono text-slate-500">{formatShortDate(t.planned_finish_date)}</span>;
                          } else if (col.key === 'dates') {
                            cellVal = <span className="font-mono text-slate-500">{formatShortDate(t.planned_start_date)} - {formatShortDate(t.planned_finish_date)}</span>;
                          }

                          return (
                            <div
                              key={col.key}
                              className="border-r last:border-r-0 border-slate-100 h-full flex items-center px-1.5 truncate"
                              style={{
                                width: `${col.width * mmToPx}px`,
                                justifyContent: col.align === 'center' ? 'center' : 'flex-start',
                                fontSize: `${1.9 * mmToPx}px`
                              }}
                            >
                              {cellVal}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Right Timeline Bar Cell */}
                    <div className="flex-1 h-full relative" style={{ width: `${timelineWidth * mmToPx}px` }}>
                      {/* Grid guidelines for months */}
                      {slice.months.map((m, mIdx) => {
                        const mStartDays = Math.max(0, Math.round((m.start - slice.startDate) / 86400000));
                        const mLeftPx = (mStartDays * slice.dayWidthMm) * mmToPx;
                        return (
                          <div
                            key={mIdx}
                            className="absolute top-0 bottom-0 border-r border-slate-100 pointer-events-none"
                            style={{ left: `${mLeftPx}px` }}
                          />
                        );
                      })}

                      {barEl}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ─── 3. Legend & Footer Strip ─────────────────────────────── */}
        <div
          className="flex items-center justify-between text-slate-500 border-t border-slate-200/80 pt-1.5"
          style={{ fontSize: `${2.0 * mmToPx}px` }}
        >
          {/* Status Color Legend */}
          {options.includeColorLegend !== false && (
            <div className="flex items-center gap-3">
              <span className="font-bold text-slate-600">STATUS:</span>
              {Object.values(STATUS_COLORS).map(sc => (
                <div key={sc.label} className="flex items-center gap-1">
                  <div className="rounded-xs" style={{ width: `${2.8 * mmToPx}px`, height: `${2.8 * mmToPx}px`, backgroundColor: sc.hex }} />
                  <span>{sc.label}</span>
                </div>
              ))}
              <div className="flex items-center gap-1 ml-1 text-amber-600 font-semibold">
                <span>★</span>
                <span>Milestone / Slab Trigger</span>
              </div>
            </div>
          )}

          {/* Continuation Notice */}
          <div className="italic text-slate-400">
            {timelineSliceIndex < totalTimelineSlices && (
              <span>↳ Timeline continues horizontally on Page {pageNumber + 1}</span>
            )}
            {rowSheetIndex < totalRowSheets && timelineSliceIndex === totalTimelineSlices && (
              <span>↓ Activities continue vertically on Page {pageNumber + 1}</span>
            )}
          </div>

          {/* Page numbers */}
          {options.includePageNumbers !== false && (
            <div className="font-bold text-slate-700">
              Page {pageNumber} of {totalPages}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
