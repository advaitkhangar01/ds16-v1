// client/src/components/projects/timeline/TimelineGanttChart.jsx
import React, { useState, useMemo, useRef } from 'react';
import { Calendar, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Search, Filter, AlertCircle, Clock, CheckCircle2 } from 'lucide-react';

const STAGES = [
  'All Stages',
  'Site Preparation',
  'Substructure',
  'Superstructure & Slab',
  'Finishing & Services',
  'Handover'
];

export default function TimelineGanttChart({ tasks = [], onSelectTask }) {
  const [zoomLevel, setZoomLevel] = useState('month'); // 'week', 'month', 'quarter'
  const [search, setSearch] = useState('');
  const [selectedStage, setSelectedStage] = useState('All Stages');
  const [selectedStatus, setSelectedStatus] = useState('All Statuses');
  const scrollContainerRef = useRef(null);

  // Filter tasks
  const filteredTasks = useMemo(() => {
    return tasks.filter(t => {
      const matchSearch = !search.trim() || 
        t.task_name.toLowerCase().includes(search.toLowerCase()) ||
        (t.floor_zone && t.floor_zone.toLowerCase().includes(search.toLowerCase()));
      const matchStage = selectedStage === 'All Stages' || t.construction_stage === selectedStage;
      const matchStatus = selectedStatus === 'All Statuses' || t.status === selectedStatus;
      return matchSearch && matchStage && matchStatus;
    });
  }, [tasks, search, selectedStage, selectedStatus]);

  // Determine overall timeline boundaries
  const { minDate, maxDate, totalDays } = useMemo(() => {
    if (tasks.length === 0) {
      const now = new Date();
      return { minDate: now, maxDate: new Date(now.getTime() + 180 * 86400000), totalDays: 180 };
    }

    let minTime = Infinity;
    let maxTime = -Infinity;

    tasks.forEach(t => {
      if (t.planned_start_date) {
        const s = new Date(t.planned_start_date).getTime();
        if (s < minTime) minTime = s;
      }
      if (t.planned_finish_date) {
        const e = new Date(t.planned_finish_date).getTime();
        if (e > maxTime) maxTime = e;
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
    <div className="card space-y-4 p-4">
      {/* Controls Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 border-b border-[#F0F0F0] pb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search tasks or zones..."
              className="text-xs bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 focus:outline-none focus:border-[#E05A1E] w-48 text-slate-700"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <select
            className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 focus:outline-none focus:border-[#E05A1E]"
            value={selectedStage}
            onChange={(e) => setSelectedStage(e.target.value)}
          >
            {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>

          <select
            className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 focus:outline-none focus:border-[#E05A1E]"
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
          >
            <option value="All Statuses">All Statuses</option>
            <option value="Not Started">Not Started</option>
            <option value="In Progress">In Progress</option>
            <option value="Completed">Completed</option>
            <option value="On Hold">On Hold</option>
          </select>
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
        </div>
      </div>

      {/* Gantt Container */}
      <div className="flex border border-[#EBEBEB] rounded-xl overflow-hidden bg-white shadow-soft-sm">
        {/* Left Task Tree Column */}
        <div className="w-64 md:w-80 flex-shrink-0 border-r border-[#EBEBEB] bg-slate-50/70 z-10">
          <div className="h-10 border-b border-[#EBEBEB] px-3.5 flex items-center justify-between text-xs font-bold text-slate-700 bg-slate-100/80">
            <span>Task ({filteredTasks.length})</span>
            <span className="text-[10px] text-muted">Duration</span>
          </div>

          <div className="divide-y divide-slate-100 max-h-[550px] overflow-y-auto">
            {filteredTasks.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted">
                No scheduled activities match criteria
              </div>
            ) : (
              filteredTasks.map((t, idx) => (
                <div
                  key={t.id || idx}
                  onClick={() => onSelectTask && onSelectTask(t)}
                  className="h-11 px-3.5 flex items-center justify-between hover:bg-orange-50/50 cursor-pointer transition-colors group"
                >
                  <div className="truncate pr-2">
                    <p className="text-xs font-semibold text-slate-800 truncate group-hover:text-[#E05A1E] flex items-center gap-1">
                      {Boolean(t.is_milestone || t.metadata?.is_trigger_milestone) && (
                        <span className="text-amber-500 font-bold" title="3rd-Floor Slab Trigger">★</span>
                      )}
                      <span className="truncate">{t.task_name}</span>
                    </p>
                    <p className="text-[10px] text-muted flex items-center gap-1.5">
                      <span>{t.floor_zone || t.construction_stage}</span>
                      {Boolean(t.is_milestone || t.metadata?.is_trigger_milestone) && (
                        <span className="text-amber-700 font-bold bg-amber-50 px-1 rounded text-[9px]">Trigger</span>
                      )}
                      {t.is_overdue && (
                        <span className="text-red-600 font-bold flex items-center gap-0.5">
                          <AlertCircle size={10} /> Overdue
                        </span>
                      )}
                    </p>
                  </div>
                  <span className="text-[11px] font-mono text-slate-500 whitespace-nowrap bg-white px-1.5 py-0.5 rounded border border-slate-200">
                    {t.duration_days}d
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Horizontal Gantt Chart Scrollable Area */}
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-x-auto relative max-h-[590px]"
        >
          {/* Header Months */}
          <div className="h-10 border-b border-[#EBEBEB] relative bg-slate-100/80" style={{ width: timelineWidth }}>
            {calendarIntervals.map((interval, i) => (
              <div
                key={i}
                className="absolute top-0 bottom-0 border-r border-slate-200 px-2 flex items-center text-[11px] font-bold text-slate-600 truncate"
                style={{ left: interval.left, width: interval.width }}
              >
                {interval.label}
              </div>
            ))}
          </div>

          {/* Timeline Body Rows */}
          <div className="relative divide-y divide-slate-100" style={{ width: timelineWidth }}>
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

            {filteredTasks.map((t, idx) => {
              const startDate = t.planned_start_date ? new Date(t.planned_start_date) : minDate;
              const finishDate = t.planned_finish_date ? new Date(t.planned_finish_date) : startDate;
              const startDays = Math.max(0, Math.round((startDate - minDate) / 86400000));
              const taskSpanDays = Math.max(1, Math.round((finishDate - startDate) / 86400000) + 1);

              const barLeft = startDays * dayWidth;
              const barWidth = Math.max(dayWidth, taskSpanDays * dayWidth);

              return (
                <div key={t.id || idx} className="h-11 relative flex items-center hover:bg-slate-50/50">
                  {/* Task Bar */}
                  <div
                    onClick={() => onSelectTask && onSelectTask(t)}
                    className={`absolute h-7 rounded-md border shadow-soft-sm cursor-pointer transition-all hover:brightness-105 hover:scale-[1.01] flex items-center px-2 text-[11px] font-medium truncate ${getStatusColor(t.status, t.is_overdue)}`}
                    style={{ left: barLeft, width: barWidth }}
                    title={`${t.task_name} (${t.planned_start_date} to ${t.planned_finish_date}) - ${t.status}`}
                  >
                    <span className="truncate drop-shadow-sm">{t.task_name}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-muted flex-wrap pt-1">
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
      </div>
    </div>
  );
}
