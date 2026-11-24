// client/src/components/projects/timeline/TimelineTaskList.jsx
import React, { useState, useMemo } from 'react';
import { Search, Filter, Download, ArrowUpDown, CheckSquare, Square, AlertCircle, FileSpreadsheet, Plus, Edit2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import toast from 'react-hot-toast';

export default function TimelineTaskList({ tasks = [], onSelectTask, onAddTask, onUpdateTaskStatus, isManagement }) {
  const [search, setSearch] = useState('');
  const [selectedSection, setSelectedSection] = useState('All');
  const [selectedStage, setSelectedStage] = useState('All');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedStatus, setSelectedStatus] = useState('All');
  const [sortField, setSortField] = useState('order_index');
  const [sortAsc, setSortAsc] = useState(true);
  const [selectedTaskIds, setSelectedTaskIds] = useState(new Set());

  const STANDARD_SECTIONS = ['All', 'Site Preparation', 'RCC Work', 'Masonry Work', 'Finishing Work', 'Additional Work'];

  // Distinct filters
  const stages = useMemo(() => ['All', ...new Set(tasks.map(t => t.construction_stage).filter(Boolean))], [tasks]);
  const categories = useMemo(() => ['All', ...new Set(tasks.map(t => t.category).filter(Boolean))], [tasks]);

  const normalizedTasks = useMemo(() => {
    return tasks.map(t => ({
      ...t,
      section_name: t.section_name === 'Polishing Work' ? 'Finishing Work' : (t.section_name || 'RCC Work')
    }));
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    return normalizedTasks.filter(t => {
      const matchSearch = !search.trim() ||
        t.task_name.toLowerCase().includes(search.toLowerCase()) ||
        (t.floor_zone && t.floor_zone.toLowerCase().includes(search.toLowerCase())) ||
        (t.remarks && t.remarks.toLowerCase().includes(search.toLowerCase())) ||
        (t.activity_key && t.activity_key.toLowerCase().includes(search.toLowerCase()));

      const matchSection = selectedSection === 'All' || t.section_name === selectedSection;
      const matchStage = selectedStage === 'All' || t.construction_stage === selectedStage;
      const matchCat = selectedCategory === 'All' || t.category === selectedCategory;
      const matchStatus = selectedStatus === 'All' || t.status === selectedStatus;

      return matchSearch && matchSection && matchStage && matchCat && matchStatus;
    }).sort((a, b) => {
      let valA = a[sortField];
      let valB = b[sortField];
      if (valA === undefined || valA === null) valA = '';
      if (valB === undefined || valB === null) valB = '';
      if (valA < valB) return sortAsc ? -1 : 1;
      if (valA > valB) return sortAsc ? 1 : -1;
      return 0;
    });
  }, [normalizedTasks, search, selectedSection, selectedStage, selectedCategory, selectedStatus, sortField, sortAsc]);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  const toggleSelectAll = () => {
    if (selectedTaskIds.size === filteredTasks.length) {
      setSelectedTaskIds(new Set());
    } else {
      setSelectedTaskIds(new Set(filteredTasks.map(t => t.id)));
    }
  };

  const toggleSelectTask = (id, e) => {
    e.stopPropagation();
    const next = new Set(selectedTaskIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedTaskIds(next);
  };

  const handleBulkStatus = async (status) => {
    if (selectedTaskIds.size === 0) return;
    try {
      for (const id of selectedTaskIds) {
        if (onUpdateTaskStatus) await onUpdateTaskStatus(id, status);
      }
      setSelectedTaskIds(new Set());
      toast.success(`Updated status for ${selectedTaskIds.size} activities`);
    } catch {
      toast.error('Failed to update bulk status');
    }
  };

  // Export to Excel
  const handleExportExcel = () => {
    if (filteredTasks.length === 0) {
      toast.error('No tasks to export');
      return;
    }
    const exportData = filteredTasks.map((t, idx) => ({
      'Sr. No.': idx + 1,
      'Activity Name': t.task_name,
      'Category': t.category,
      'Stage': t.construction_stage,
      'Floor / Zone': t.floor_zone || '',
      'Planned Start': t.planned_start_date || '',
      'Planned Finish': t.planned_finish_date || '',
      'Actual Start': t.actual_start_date || '',
      'Actual Finish': t.actual_finish_date || '',
      'Duration (Days)': t.duration_days,
      'Status': t.status,
      'Assignees': (t.assignees || []).map(a => a.name).join(', '),
      'Remarks': t.remarks || ''
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Construction Schedule');
    XLSX.writeFile(wb, 'DS16_Construction_Timeline.xlsx');
    toast.success('Schedule exported to Excel');
  };

  // Export to PDF
  const handleExportPDF = () => {
    if (filteredTasks.length === 0) {
      toast.error('No tasks to export');
      return;
    }
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    doc.setFontSize(14);
    doc.text('Design Studio 16 — Construction Project Schedule', 14, 15);
    doc.setFontSize(9);
    doc.text(`Generated: ${new Date().toLocaleDateString('en-GB')} | Total Activities: ${filteredTasks.length}`, 14, 22);

    let y = 30;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text('Sr.', 14, y);
    doc.text('Activity Name', 24, y);
    doc.text('Stage', 95, y);
    doc.text('Floor / Zone', 140, y);
    doc.text('Planned Start', 180, y);
    doc.text('Planned End', 210, y);
    doc.text('Days', 240, y);
    doc.text('Status', 255, y);

    y += 3;
    doc.line(14, y, 280, y);
    y += 5;

    doc.setFont('helvetica', 'normal');
    filteredTasks.forEach((t, i) => {
      if (y > 185) {
        doc.addPage();
        y = 20;
      }
      doc.text(`${i + 1}`, 14, y);
      doc.text(t.task_name.substring(0, 40), 24, y);
      doc.text((t.construction_stage || '').substring(0, 22), 95, y);
      doc.text((t.floor_zone || '').substring(0, 18), 140, y);
      doc.text(t.planned_start_date || '', 180, y);
      doc.text(t.planned_finish_date || '', 210, y);
      doc.text(`${t.duration_days}`, 240, y);
      doc.text(t.status, 255, y);
      y += 6;
    });

    doc.save('DS16_Construction_Timeline.pdf');
    toast.success('Schedule exported to PDF');
  };

  const getStatusBadge = (status, isOverdue) => {
    if (isOverdue) return <span className="badge bg-red-100 text-red-700 border border-red-200">Overdue</span>;
    switch (status) {
      case 'Completed': return <span className="badge badge-completed">Completed</span>;
      case 'In Progress': return <span className="badge badge-in-progress">In Progress</span>;
      case 'On Hold': return <span className="badge bg-purple-50 text-purple-700 border border-purple-200">On Hold</span>;
      default: return <span className="badge badge-absent">Not Started</span>;
    }
  };

  return (
    <div className="card space-y-4">
      {/* Search & Filter Toolbar */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 border-b border-[#F0F0F0] pb-3">
        <div className="flex items-center gap-2 flex-wrap flex-1">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search activities, zones, remarks..."
              className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 focus:outline-none focus:border-[#E05A1E] text-slate-700"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <select
            className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 focus:outline-none focus:border-[#E05A1E]"
            value={selectedSection}
            onChange={(e) => setSelectedSection(e.target.value)}
          >
            {STANDARD_SECTIONS.map(s => <option key={s} value={s}>{s === 'All' ? 'All Construction Groups' : s}</option>)}
          </select>

          <select
            className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 focus:outline-none focus:border-[#E05A1E]"
            value={selectedStage}
            onChange={(e) => setSelectedStage(e.target.value)}
          >
            {stages.map(s => <option key={s} value={s}>{s}</option>)}
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
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {selectedTaskIds.size > 0 && isManagement && (
            <div className="flex items-center gap-1.5 bg-orange-50 border border-orange-200 px-2 py-1 rounded-lg">
              <span className="text-xs font-bold text-[#E05A1E]">{selectedTaskIds.size} selected:</span>
              <button
                onClick={() => handleBulkStatus('In Progress')}
                className="text-[11px] font-semibold bg-white text-slate-700 px-2 py-0.5 rounded border border-slate-200 hover:border-[#E05A1E]"
              >
                Mark In Progress
              </button>
              <button
                onClick={() => handleBulkStatus('Completed')}
                className="text-[11px] font-semibold bg-white text-emerald-700 px-2 py-0.5 rounded border border-emerald-200 hover:bg-emerald-50"
              >
                Mark Completed
              </button>
            </div>
          )}

          <button
            onClick={handleExportExcel}
            className="text-xs font-semibold px-2.5 py-1.5 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1.5"
            title="Export Excel"
          >
            <FileSpreadsheet size={13} className="text-emerald-600" />
            Excel
          </button>
          <button
            onClick={handleExportPDF}
            className="text-xs font-semibold px-2.5 py-1.5 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1.5"
            title="Export PDF"
          >
            <Download size={13} className="text-red-600" />
            PDF
          </button>
          {isManagement && (
            <button
              onClick={onAddTask}
              className="btn-primary text-xs py-1.5 px-3"
            >
              <Plus size={14} />
              Add Activity
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto border border-[#EBEBEB] rounded-xl">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-100/90 text-slate-700 border-b border-[#EBEBEB] font-bold">
              {isManagement && (
                <th className="py-2.5 px-3 w-8">
                  <button onClick={toggleSelectAll} className="text-slate-500 hover:text-slate-800">
                    {selectedTaskIds.size > 0 && selectedTaskIds.size === filteredTasks.length ? (
                      <CheckSquare size={14} className="text-[#E05A1E]" />
                    ) : (
                      <Square size={14} />
                    )}
                  </button>
                </th>
              )}
              <th className="py-2.5 px-3 cursor-pointer hover:text-[#E05A1E]" onClick={() => handleSort('task_name')}>
                <div className="flex items-center gap-1">Activity Name <ArrowUpDown size={11} /></div>
              </th>
              <th className="py-2.5 px-3 cursor-pointer hover:text-[#E05A1E]" onClick={() => handleSort('construction_stage')}>
                <div className="flex items-center gap-1">Stage <ArrowUpDown size={11} /></div>
              </th>
              <th className="py-2.5 px-3 cursor-pointer hover:text-[#E05A1E]" onClick={() => handleSort('floor_zone')}>
                <div className="flex items-center gap-1">Floor / Zone <ArrowUpDown size={11} /></div>
              </th>
              <th className="py-2.5 px-3 cursor-pointer hover:text-[#E05A1E]" onClick={() => handleSort('planned_start_date')}>
                <div className="flex items-center gap-1">Planned Dates <ArrowUpDown size={11} /></div>
              </th>
              <th className="py-2.5 px-3 text-center cursor-pointer hover:text-[#E05A1E]" onClick={() => handleSort('duration_days')}>
                <div className="flex items-center justify-center gap-1">Days <ArrowUpDown size={11} /></div>
              </th>
              <th className="py-2.5 px-3 cursor-pointer hover:text-[#E05A1E]" onClick={() => handleSort('status')}>
                <div className="flex items-center gap-1">Status <ArrowUpDown size={11} /></div>
              </th>
              <th className="py-2.5 px-3">Assignees</th>
              <th className="py-2.5 px-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {filteredTasks.length === 0 ? (
              <tr>
                <td colSpan={isManagement ? 9 : 8} className="py-12 text-center text-muted">
                  No construction activities found matching the filters.
                </td>
              </tr>
            ) : (
              filteredTasks.map((t) => (
                <tr
                  key={t.id}
                  onClick={() => onSelectTask && onSelectTask(t)}
                  className="hover:bg-orange-50/40 cursor-pointer transition-colors group"
                >
                  {isManagement && (
                    <td className="py-2.5 px-3">
                      <button onClick={(e) => toggleSelectTask(t.id, e)} className="text-slate-400 hover:text-slate-700">
                        {selectedTaskIds.has(t.id) ? (
                          <CheckSquare size={14} className="text-[#E05A1E]" />
                        ) : (
                          <Square size={14} />
                        )}
                      </button>
                    </td>
                  )}
                  <td className="py-2.5 px-3 font-semibold text-slate-800 group-hover:text-[#E05A1E]">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span>{t.task_name}</span>
                      {Boolean(t.is_milestone || t.metadata?.is_trigger_milestone) && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                          ★ 3rd-Floor Trigger
                        </span>
                      )}
                      {Boolean(t.metadata?.is_ground_brickwork) && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-orange-50 text-[#E05A1E] border border-orange-200">
                          {t.metadata?.has_structural_trigger ? 'Triggered +1d' : 'Manual Schedule'}
                        </span>
                      )}
                      {t.is_overdue && (
                        <AlertCircle size={12} className="text-red-500 flex-shrink-0" title="Overdue task" />
                      )}
                    </div>
                    {t.remarks && <p className="text-[10px] text-muted line-clamp-1 font-normal">{t.remarks}</p>}
                    {Array.isArray(t.dependencies) && t.dependencies.length > 0 && (
                      <p className="text-[10px] text-slate-400 mt-0.5 font-normal">
                        Dep: {t.dependencies.map(d => `${d.name || d.predecessor_id} (${d.type}${d.lag ? `+${d.lag}d` : ''})`).join(', ')}
                      </p>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-slate-600 font-medium whitespace-nowrap">
                    {t.construction_stage}
                  </td>
                  <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">
                    {t.floor_zone || '—'}
                  </td>
                  <td className="py-2.5 px-3 font-mono text-[11px] text-slate-700 whitespace-nowrap">
                    <div>
                      <span className="text-[10px] text-muted uppercase">Plan: </span>
                      {t.planned_start_date} <span className="text-muted">→</span> {t.planned_finish_date}
                    </div>
                    {t.forecast_start_date && t.forecast_start_date !== t.planned_start_date && (
                      <div className="text-amber-700 font-semibold text-[10px]">
                        <span>Forecast: </span>
                        {t.forecast_start_date} <span className="text-muted">→</span> {t.forecast_finish_date}
                      </div>
                    )}
                    {(t.actual_start_date || t.actual_finish_date) && (
                      <div className="text-emerald-700 font-semibold text-[10px]">
                        <span>Actual: </span>
                        {t.actual_start_date || '—'} <span className="text-muted">→</span> {t.actual_finish_date || 'In Progress'}
                      </div>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-700 whitespace-nowrap">
                    {t.duration_days}d
                  </td>
                  <td className="py-2.5 px-3 whitespace-nowrap">
                    {getStatusBadge(t.status, t.is_overdue)}
                  </td>
                  <td className="py-2.5 px-3 whitespace-nowrap">
                    <div className="flex items-center gap-1 flex-wrap">
                      {(t.assignees || []).length > 0 ? (
                        t.assignees.map((a, i) => (
                          <span key={i} className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-medium border border-slate-200">
                            {a.name}
                          </span>
                        ))
                      ) : (
                        <span className="text-muted text-[10px]">Unassigned</span>
                      )}
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-right whitespace-nowrap">
                    <button
                      onClick={(e) => { e.stopPropagation(); onSelectTask(t); }}
                      className="p-1 hover:bg-slate-100 rounded text-slate-500 hover:text-[#E05A1E] transition-colors"
                      title="Edit Activity"
                    >
                      <Edit2 size={13} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
