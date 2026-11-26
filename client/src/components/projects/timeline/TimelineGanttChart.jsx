// client/src/components/projects/timeline/TimelineGanttChart.jsx
import React, { useState, useMemo, useRef } from 'react';
import { Calendar, ChevronDown, ChevronRight, Search, AlertCircle, Clock, CheckCircle2, Maximize2, Minimize2, Layers, ChevronsDown, ChevronsUp, Printer, Camera } from 'lucide-react';
import GanttExportModal from './GanttExportModal';

const STANDARD_SECTIONS = [
  'Site Preparation',
  'RCC Work',
  'Masonry Work',
  'Finishing Work',
  'Additional Work'
];

export default function TimelineGanttChart({ tasks = [], onSelectTask, project = {}, config = {} }) {
  const [zoomLevel, setZoomLevel] = useState('month'); // 'week', 'month', 'quarter'
  const [search, setSearch] = useState('');
  const [selectedSection, setSelectedSection] = useState('All');
  const [selectedStatus, setSelectedStatus] = useState('All');
  const [isExpanded, setIsExpanded] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState(new Set());
  const [collapsedSubgroups, setCollapsedSubgroups] = useState(new Set());
  const scrollContainerRef = useRef(null);

  // Toggle section collapse
  const toggleSection = (secName) => {
    setCollapsedSections(prev => {
      const next = new Set(prev);
      if (next.has(secName)) next.delete(secName);
      else next.add(secName);
      return next;
    });
  };

  // Toggle subgroup collapse
  const toggleSubgroup = (groupKey) => {
    setCollapsedSubgroups(prev => {
      const next = new Set(prev);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
      return next;
    });
  };

  const collapseAll = () => {
    setCollapsedSections(new Set(STANDARD_SECTIONS));
  };

  const expandAll = () => {
    setCollapsedSections(new Set());
    setCollapsedSubgroups(new Set());
  };

  // Normalise section names (handling legacy 'Polishing Work')
  const normalizedTasks = useMemo(() => {
    return tasks.map(t => ({
      ...t,
      section_name: t.section_name === 'Polishing Work' ? 'Finishing Work' : (t.section_name || 'RCC Work')
    }));
  }, [tasks]);

  // Filter tasks by search, section and status
  const filteredTasks = useMemo(() => {
    return normalizedTasks.filter(t => {
      const matchSearch = !search.trim() || 
        t.task_name.toLowerCase().includes(search.toLowerCase()) ||
        (t.floor_zone && t.floor_zone.toLowerCase().includes(search.toLowerCase())) ||
        (t.activity_key && t.activity_key.toLowerCase().includes(search.toLowerCase()));
      const matchSection = selectedSection === 'All' || t.section_name === selectedSection;
      const matchStatus = selectedStatus === 'All' || t.status === selectedStatus;
      return matchSearch && matchSection && matchStatus;
    });
  }, [normalizedTasks, search, selectedSection, selectedStatus]);

  // Hierarchical grouping: Section -> Floor Subgroup -> Task
  const groupedHierarchy = useMemo(() => {
    const groups = [];

    STANDARD_SECTIONS.forEach(secName => {
      const secTasks = filteredTasks.filter(t => t.section_name === secName);
      if (secTasks.length === 0) return;

      // Group secTasks by floor_zone / floor_order
      const subgroupMap = new Map();

      secTasks.forEach(task => {
        const subKey = task.floor_zone || 'General';
        if (!subgroupMap.has(subKey)) {
          subgroupMap.set(subKey, {
            subgroup_name: subKey,
            floor_order: task.floor_order !== undefined ? task.floor_order : 0,
            tasks: []
          });
        }
        subgroupMap.get(subKey).tasks.push(task);
      });

      // Sort subgroups by floor_order ascending, then order_index
      const sortedSubgroups = Array.from(subgroupMap.values()).sort((a, b) => a.floor_order - b.floor_order);
      sortedSubgroups.forEach(sg => {
        sg.tasks.sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
      });

      groups.push({
        section_name: secName,
        total_tasks: secTasks.length,
        subgroups: sortedSubgroups
      });
    });

    return groups;
  }, [filteredTasks]);

  // Flattened visible items for table and Gantt grid alignment
  const visibleRows = useMemo(() => {
    const rows = [];

    groupedHierarchy.forEach(sec => {
      const isSecCollapsed = collapsedSections.has(sec.section_name);
      rows.push({
        type: 'section_header',
        key: `sec-${sec.section_name}`,
        section_name: sec.section_name,
        total_tasks: sec.total_tasks,
        isCollapsed: isSecCollapsed
      });

      if (!isSecCollapsed) {
        sec.subgroups.forEach(sg => {
          const sgKey = `${sec.section_name}:${sg.subgroup_name}`;
          const isSgCollapsed = collapsedSubgroups.has(sgKey);

          rows.push({
            type: 'subgroup_header',
            key: `sg-${sgKey}`,
            section_name: sec.section_name,
            subgroup_name: sg.subgroup_name,
            total_tasks: sg.tasks.length,
            isCollapsed: isSgCollapsed,
            groupKey: sgKey
          });

          if (!isSgCollapsed) {
            sg.tasks.forEach(t => {
              rows.push({
                type: 'task_row',
                key: `task-${t.id || t.temp_id || t.activity_key}`,
                task: t
              });
            });
          }
        });
      }
    });

    return rows;
  }, [groupedHierarchy, collapsedSections, collapsedSubgroups]);

  // Overall timeline date boundaries
  const { minDate, maxDate, totalDays } = useMemo(() => {
    if (tasks.length === 0) {
      const now = new Date();
      return { minDate: now, maxDate: new Date(now.getTime() + 180 * 86400000), totalDays: 180 };
    }

    let minTime = Infinity;
    let maxTime = -Infinity;

    const nowTime = new Date().getTime();
    tasks.forEach(t => {
      if (t.planned_start_date) {
        const s = new Date(t.planned_start_date).getTime();
        if (s < minTime) minTime = s;
      }
      if (t.planned_finish_date) {
        const e = new Date(t.planned_finish_date).getTime();
        if (e > maxTime) maxTime = e;
      }
      // Account for actual site execution dates (starts earlier, finishes later, or ongoing)
      if (t.actual_start_date) {
        const as = new Date(t.actual_start_date).getTime();
        if (as < minTime) minTime = as;
        if (!t.actual_finish_date) {
          if (nowTime > maxTime) maxTime = nowTime;
        }
      }
      if (t.actual_finish_date) {
        const af = new Date(t.actual_finish_date).getTime();
        if (af > maxTime) maxTime = af;
      }
    });

    if (minTime === Infinity) minTime = new Date().getTime();
    if (maxTime === -Infinity) maxTime = minTime + 180 * 86400000;

    // Buffer 15 days on each side
    const min = new Date(minTime - 15 * 86400000);
    const max = new Date(maxTime + 20 * 86400000);
    const days = Math.max(30, Math.round((max - min) / 86400000));

    return { minDate: min, maxDate: max, totalDays: days };
  }, [tasks]);

  // Pixel scaling per day based on zoom
  const dayWidth = useMemo(() => {
    if (zoomLevel === 'week') return 36;
    if (zoomLevel === 'month') return 18;
    return 8; // quarter
  }, [zoomLevel]);

  const timelineWidth = totalDays * dayWidth;

  // Generate calendar header intervals
  const calendarIntervals = useMemo(() => {
    const intervals = [];
    const curr = new Date(minDate);
    curr.setDate(1);

    while (curr <= maxDate) {
      const monthStart = new Date(curr);
      curr.setMonth(curr.getMonth() + 1);
      const monthEnd = new Date(curr);
      const daysInMonth = Math.round((monthEnd - monthStart) / 86400000);

      const offsetDays = Math.max(0, Math.round((monthStart - minDate) / 86400000));
      intervals.push({
        label: monthStart.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
        left: offsetDays * dayWidth,
        width: daysInMonth * dayWidth
      });
    }
    return intervals;
  }, [minDate, maxDate, dayWidth]);

  // Today marker position
  const todayOffset = useMemo(() => {
    const today = new Date();
    const days = Math.round((today - minDate) / 86400000);
    if (days >= 0 && days <= totalDays) {
      return days * dayWidth;
    }
    return null;
  }, [minDate, totalDays, dayWidth]);

  const scrollToToday = () => {
    if (scrollContainerRef.current && todayOffset !== null) {
      scrollContainerRef.current.scrollTo({
        left: Math.max(0, todayOffset - 250),
        behavior: 'smooth'
      });
    }
  };

  const getStatusColor = (status, isOverdue) => {
    if (isOverdue) return 'bg-red-500 border-red-600 text-white';
    switch (status) {
      case 'Completed': return 'bg-emerald-600 border-emerald-700 text-white';
      case 'In Progress': return 'bg-[#E05A1E] border-[#C94E16] text-white';
      case 'On Hold': return 'bg-purple-600 border-purple-700 text-white';
      default: return 'bg-slate-300 border-slate-400 text-slate-800';
    }
  };

  return (
    <div className={`card space-y-4 p-4 transition-all ${isExpanded ? 'fixed inset-4 z-50 overflow-auto bg-white shadow-2xl border-2 border-[#E05A1E]/30 rounded-2xl' : ''}`}>
      {/* Controls Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 border-b border-[#F0F0F0] pb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search activities or levels..."
              className="text-xs bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 focus:outline-none focus:border-[#E05A1E] w-48 text-slate-700"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <select
            className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 focus:outline-none focus:border-[#E05A1E]"
            value={selectedSection}
            onChange={(e) => setSelectedSection(e.target.value)}
          >
            <option value="All">All Construction Groups</option>
            {STANDARD_SECTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>

          <select
            className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 focus:outline-none focus:border-[#E05A1E]"
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
          >
            <option value="All">All Statuses</option>
            <option value="Not Started">Not Started</option>
            <option value="In Progress">In Progress</option>
            <option value="Completed">Completed</option>
            <option value="On Hold">On Hold</option>
          </select>

          <div className="flex items-center gap-1 border-l border-slate-200 pl-2">
            <button
              onClick={expandAll}
              className="text-[11px] font-semibold text-slate-600 hover:text-[#E05A1E] px-1.5 py-1 rounded hover:bg-slate-100 flex items-center gap-1"
              title="Expand All Groups"
            >
              <ChevronsDown size={13} />
              Expand
            </button>
            <button
              onClick={collapseAll}
              className="text-[11px] font-semibold text-slate-600 hover:text-[#E05A1E] px-1.5 py-1 rounded hover:bg-slate-100 flex items-center gap-1"
              title="Collapse All Groups"
            >
              <ChevronsUp size={13} />
              Collapse
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 justify-end">
          <div className="flex items-center bg-slate-100 rounded-lg p-0.5 border border-slate-200 text-xs">
            <button
              onClick={() => setZoomLevel('week')}
              className={`px-2 py-1 rounded font-medium transition-all ${zoomLevel === 'week' ? 'bg-white text-[#E05A1E] shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
            >
              Weekly
            </button>
            <button
              onClick={() => setZoomLevel('month')}
              className={`px-2 py-1 rounded font-medium transition-all ${zoomLevel === 'month' ? 'bg-white text-[#E05A1E] shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
            >
              Monthly
            </button>
            <button
              onClick={() => setZoomLevel('quarter')}
              className={`px-2 py-1 rounded font-medium transition-all ${zoomLevel === 'quarter' ? 'bg-white text-[#E05A1E] shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
            >
              Quarterly
            </button>
          </div>

          <button
            onClick={scrollToToday}
            className="text-xs font-semibold px-2.5 py-1.5 bg-slate-100 text-slate-700 hover:bg-[#E05A1E] hover:text-white rounded-lg transition-colors flex items-center gap-1"
          >
            <Calendar size={13} />
            Today
          </button>

          <button
            onClick={() => setIsExportModalOpen(true)}
            className="text-xs font-semibold px-2.5 py-1.5 bg-[#E05A1E] text-white hover:bg-[#C94E16] rounded-lg transition-colors flex items-center gap-1.5 shadow-2xs"
            title="Export Construction Gantt Chart (A3 / A4 PDF)"
          >
            <Printer size={13} />
            <span>Export</span>
          </button>

          <button
            onClick={() => setIsExpanded(!isExpanded)}
            title={isExpanded ? "Exit Expanded View" : "Maximize Gantt Chart"}
            className="text-xs font-semibold px-2.5 py-1.5 bg-slate-100 text-slate-700 hover:bg-slate-900 hover:text-white rounded-lg transition-colors flex items-center gap-1.5"
          >
            {isExpanded ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
            <span className="hidden sm:inline">{isExpanded ? "Collapse" : "Expand"}</span>
          </button>
        </div>
      </div>

      {/* Gantt Container */}
      <div className={`flex border border-[#EBEBEB] rounded-xl overflow-hidden bg-white shadow-soft-sm ${isExpanded ? 'h-[calc(100vh-180px)]' : 'min-h-[680px]'}`}>
        {/* Left Hierarchical Activity Tree Column */}
        <div className="w-80 sm:w-96 md:w-[440px] flex-shrink-0 border-r border-[#EBEBEB] bg-slate-50/70 z-10 flex flex-col">
          <div className="h-11 border-b border-[#EBEBEB] px-4 flex items-center justify-between text-xs font-bold text-slate-700 bg-slate-100/90 flex-shrink-0">
            <span>Activity / Floor Hierarchy ({filteredTasks.length})</span>
            <span className="text-[10px] text-muted">Days</span>
          </div>

          <div className="divide-y divide-slate-100 overflow-y-auto flex-1">
            {visibleRows.length === 0 ? (
              <div className="p-8 text-center text-xs text-muted">
                No scheduled activities match criteria
              </div>
            ) : (
              visibleRows.map((row) => {
                if (row.type === 'section_header') {
                  return (
                    <div
                      key={row.key}
                      onClick={() => toggleSection(row.section_name)}
                      className="h-10 px-3 bg-slate-200/80 hover:bg-slate-200 cursor-pointer flex items-center justify-between transition-colors border-t border-slate-300 font-bold text-xs text-slate-800"
                    >
                      <div className="flex items-center gap-2">
                        {row.isCollapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
                        <span className="uppercase tracking-wider text-[11px] font-extrabold text-slate-900">{row.section_name}</span>
                      </div>
                      <span className="text-[10px] bg-slate-300/80 px-2 py-0.5 rounded-full text-slate-700">
                        {row.total_tasks} tasks
                      </span>
                    </div>
                  );
                }

                if (row.type === 'subgroup_header') {
                  return (
                    <div
                      key={row.key}
                      onClick={() => toggleSubgroup(row.groupKey)}
                      className="h-8 pl-6 pr-3 bg-slate-100/70 hover:bg-slate-100 cursor-pointer flex items-center justify-between transition-colors text-xs text-slate-700 font-semibold"
                    >
                      <div className="flex items-center gap-1.5">
                        {row.isCollapsed ? <ChevronRight size={13} className="text-slate-500" /> : <ChevronDown size={13} className="text-slate-500" />}
                        <span className="text-slate-800">{row.subgroup_name}</span>
                      </div>
                      <span className="text-[9px] bg-white px-1.5 py-0.5 rounded border border-slate-200 text-slate-500">
                        {row.total_tasks}
                      </span>
                    </div>
                  );
                }

                const t = row.task;
                const hasActualStart = Boolean(t.actual_start_date);
                const hasActualFinish = Boolean(t.actual_finish_date);
                const isOngoing = hasActualStart && !hasActualFinish;

                const isSameAsPlanned = hasActualStart && hasActualFinish &&
                  t.actual_start_date === t.planned_start_date &&
                  t.actual_finish_date === t.planned_finish_date;

                const hasTwoBars = hasActualStart && !isSameAsPlanned;
                const rowHeightClass = hasTwoBars ? 'h-14 min-h-[56px]' : 'h-11 min-h-[44px]';

                return (
                  <div
                    key={row.key}
                    onClick={() => onSelectTask && onSelectTask(t)}
                    className={`${rowHeightClass} pl-9 pr-4 flex items-center justify-between hover:bg-orange-50/60 cursor-pointer transition-colors group`}
                  >
                    <div className="truncate pr-3">
                      <p className="text-xs font-semibold text-slate-800 truncate group-hover:text-[#E05A1E] flex items-center gap-1.5">
                        {Boolean(t.is_milestone || t.metadata?.is_trigger_milestone) && (
                          <span className="text-amber-500 font-bold text-sm" title="Third Slab Trigger">★</span>
                        )}
                        <span className="truncate">{t.task_name}</span>
                        {t.photo_path && (
                          <Camera size={12} className="text-[#E05A1E] flex-shrink-0" title="Site execution photo attached" />
                        )}
                      </p>
                      <p className="text-[10px] text-muted flex items-center gap-2 mt-0.5">
                        <span className="font-medium text-slate-600 bg-slate-200/60 px-1.5 py-0.2 rounded text-[9px]">
                          {t.floor_zone}
                        </span>
                        {hasTwoBars && (
                          <span className="font-semibold text-cyan-700 bg-cyan-50 border border-cyan-200 px-1.5 py-0.2 rounded text-[8px]">
                            {isOngoing ? 'Actual Ongoing' : 'Planned vs Actual'}
                          </span>
                        )}
                        {Boolean(t.is_milestone || t.metadata?.is_trigger_milestone) && (
                          <span className="text-amber-700 font-bold bg-amber-100/80 px-1.5 py-0.2 rounded text-[8px]">
                            Trigger
                          </span>
                        )}
                        {t.is_overdue && (
                          <span className="text-red-600 font-bold flex items-center gap-0.5">
                            <AlertCircle size={10} /> Overdue
                          </span>
                        )}
                      </p>
                    </div>
                    <span className="text-[10px] font-mono text-slate-600 whitespace-nowrap bg-white px-1.5 py-0.5 rounded border border-slate-200 shadow-2xs font-semibold">
                      {t.duration_days}d
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Horizontal Gantt Chart Scrollable Area */}
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-x-auto relative overflow-y-auto flex flex-col"
        >
          {/* Header Months */}
          <div className="h-11 border-b border-[#EBEBEB] relative bg-slate-100/90 flex-shrink-0" style={{ width: timelineWidth }}>
            {calendarIntervals.map((interval, i) => (
              <div
                key={i}
                className="absolute top-0 bottom-0 border-r border-slate-200 px-3 flex items-center text-[11px] font-bold text-slate-700 truncate tracking-wide"
                style={{ left: interval.left, width: interval.width }}
              >
                {interval.label}
              </div>
            ))}
          </div>

          {/* Timeline Body Rows (Strictly 1:1 Height Alignment with Left Tree) */}
          <div className="relative divide-y divide-slate-100 flex-1" style={{ width: timelineWidth }}>
            {/* Today Line */}
            {todayOffset !== null && (
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-20 pointer-events-none"
                style={{ left: todayOffset }}
              >
                <span className="absolute -top-6 -left-6 bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full shadow-sm">
                  Today
                </span>
              </div>
            )}

            {visibleRows.map((row) => {
              if (row.type === 'section_header') {
                return (
                  <div key={row.key} className="h-10 bg-slate-200/50 border-t border-slate-300 pointer-events-none" />
                );
              }

              if (row.type === 'subgroup_header') {
                return (
                  <div key={row.key} className="h-8 bg-slate-100/40 pointer-events-none" />
                );
              }

              const t = row.task;
              const hasActualStart = Boolean(t.actual_start_date);
              const hasActualFinish = Boolean(t.actual_finish_date);
              const isOngoing = hasActualStart && !hasActualFinish;

              const isSameAsPlanned = hasActualStart && hasActualFinish &&
                t.actual_start_date === t.planned_start_date &&
                t.actual_finish_date === t.planned_finish_date;

              const hasTwoBars = hasActualStart && !isSameAsPlanned;
              const rowHeightClass = hasTwoBars ? 'h-14 min-h-[56px]' : 'h-11 min-h-[44px]';

              // Planned Schedule Coordinates
              const startDate = t.planned_start_date ? new Date(t.planned_start_date) : minDate;
              const finishDate = t.planned_finish_date ? new Date(t.planned_finish_date) : startDate;
              const startDays = Math.max(0, Math.round((startDate - minDate) / 86400000));
              const taskSpanDays = Math.max(1, Math.round((finishDate - startDate) / 86400000) + 1);

              const barLeft = startDays * dayWidth;
              const barWidth = Math.max(dayWidth, taskSpanDays * dayWidth);

              // Actual Execution Coordinates (if two bars)
              let actualBarLeft = 0;
              let actualBarWidth = 0;
              if (hasTwoBars) {
                const actualStartDate = new Date(t.actual_start_date);
                const actualFinishDate = hasActualFinish ? new Date(t.actual_finish_date) : new Date();
                const actualStartDays = Math.max(0, Math.round((actualStartDate - minDate) / 86400000));
                const actualSpanDays = Math.max(1, Math.round((actualFinishDate - actualStartDate) / 86400000) + 1);
                actualBarLeft = actualStartDays * dayWidth;
                actualBarWidth = Math.max(dayWidth, actualSpanDays * dayWidth);
              }

              return (
                <div key={row.key} className={`${rowHeightClass} relative flex items-center hover:bg-slate-50/50`}>
                  {hasTwoBars ? (
                    <>
                      {/* Top Bar: Planned Schedule Baseline */}
                      <div
                        onClick={() => onSelectTask && onSelectTask(t)}
                        className={`absolute h-5 rounded-md border shadow-2xs cursor-pointer transition-all hover:brightness-105 flex items-center px-2 text-[10px] font-semibold truncate ${getStatusColor(t.status, t.is_overdue)}`}
                        style={{ left: barLeft, width: barWidth, top: '6px' }}
                        title={`Planned Baseline: ${t.planned_start_date} to ${t.planned_finish_date} (${t.duration_days}d) - ${t.status}`}
                      >
                        <span className="truncate drop-shadow-sm font-medium">Planned: {t.task_name}</span>
                      </div>

                      {/* Bottom Bar: Actual Site Execution */}
                      <div
                        onClick={() => onSelectTask && onSelectTask(t)}
                        className={`absolute h-5 rounded-md border shadow-2xs cursor-pointer transition-all hover:brightness-105 flex items-center px-2 text-[10px] font-semibold truncate ${
                          isOngoing
                            ? 'bg-[repeating-linear-gradient(45deg,#0e7490,#0e7490_8px,#0891b2_8px,#0891b2_16px)] border-cyan-500 text-white'
                            : 'bg-cyan-700 border-cyan-800 text-white'
                        }`}
                        style={{ left: actualBarLeft, width: actualBarWidth, top: '29px' }}
                        title={`Actual Site Execution: ${t.actual_start_date} to ${isOngoing ? 'Present (Ongoing)' : t.actual_finish_date}`}
                      >
                        <span className="truncate drop-shadow-sm">
                          Actual: {t.actual_start_date} → {isOngoing ? 'Ongoing' : t.actual_finish_date}
                        </span>
                      </div>
                    </>
                  ) : (
                    /* Single Bar: Planned Baseline (No actual dates or matches planned) */
                    <div
                      onClick={() => onSelectTask && onSelectTask(t)}
                      className={`absolute h-7 rounded-lg border shadow-soft-sm cursor-pointer transition-all hover:brightness-105 hover:scale-[1.01] flex items-center px-2.5 text-[11px] font-semibold truncate ${getStatusColor(t.status, t.is_overdue)}`}
                      style={{ left: barLeft, width: barWidth }}
                      title={`${t.task_name} (${t.planned_start_date} to ${t.planned_finish_date}) - ${t.status}`}
                    >
                      <span className="truncate drop-shadow-sm">{t.task_name}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Legend & Summary Footer */}
      <div className="flex items-center justify-between text-xs text-muted flex-wrap gap-3 pt-1">
        <div className="flex items-center gap-4 flex-wrap">
          <span className="font-semibold text-slate-700">Status Legend:</span>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-slate-300 border border-slate-400" />
            <span>Not Started</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-[#E05A1E]" />
            <span>In Progress</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-emerald-600" />
            <span>Completed</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-purple-600" />
            <span>On Hold</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-red-500" />
            <span>Overdue</span>
          </div>

          <div className="flex items-center gap-1.5 border-l border-slate-300 pl-3">
            <div className="w-3 h-3 rounded bg-cyan-700 border border-cyan-800" />
            <span className="font-medium text-slate-700">Actual Execution</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-[repeating-linear-gradient(45deg,#0e7490,#0e7490_3px,#0891b2_3px,#0891b2_6px)] border border-cyan-600" />
            <span className="font-medium text-slate-700">Actual (Ongoing)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Camera size={13} className="text-[#E05A1E]" />
            <span className="font-medium text-slate-700">Photo Evidence</span>
          </div>
        </div>

        <div className="text-[11px] text-slate-500 font-medium">
          Showing {filteredTasks.length} of {tasks.length} total activities
        </div>
      </div>

      {/* A3 Construction Schedule Export Modal */}
      <GanttExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        tasks={filteredTasks.length > 0 ? filteredTasks : tasks}
        project={project}
        config={config}
      />
    </div>
  );
}
