// client/src/components/projects/timeline/TimelineTaskDrawer.jsx
import React, { useState, useEffect } from 'react';
import { X, Calendar, Clock, UserCheck, Shield, Trash2, Archive, CheckCircle2, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../../api/client';

const CATEGORIES = [
  'Site Preparation & Excavation',
  'Foundation & Substructure',
  'RCC Structural Construction',
  'Masonry & Brickwork',
  'Plumbing & Sanitary',
  'Electrical & Low Voltage',
  'Plastering & Surface Preparation',
  'Waterproofing',
  'Flooring & Tiling',
  'Doors, Windows & Fabrication',
  'Painting & Finishing',
  'External Development & Site Works',
  'Testing, Commissioning & Handover'
];

const STAGES = [
  'Site Preparation',
  'Substructure',
  'Superstructure & Slab',
  'Finishing & Services',
  'Handover'
];

export default function TimelineTaskDrawer({
  isOpen,
  onClose,
  task,
  projectId,
  users = [],
  allTasks = [],
  onTaskUpdated,
  onTaskDeleted,
  isManagement,
  isAdmin
}) {
  const [formData, setFormData] = useState({
    task_name: '',
    category: 'RCC Structural Construction',
    construction_stage: 'Superstructure & Slab',
    floor_zone: '',
    planned_start_date: new Date().toISOString().split('T')[0],
    planned_finish_date: new Date().toISOString().split('T')[0],
    actual_start_date: '',
    actual_finish_date: '',
    duration_days: 14,
    status: 'Not Started',
    remarks: '',
    cost_estimate: 0,
    assignees: [],
    predecessors: []
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (task) {
      setFormData({
        task_name: task.task_name || '',
        category: task.category || 'RCC Structural Construction',
        construction_stage: task.construction_stage || 'Superstructure & Slab',
        floor_zone: task.floor_zone || '',
        planned_start_date: task.planned_start_date || new Date().toISOString().split('T')[0],
        planned_finish_date: task.planned_finish_date || new Date().toISOString().split('T')[0],
        actual_start_date: task.actual_start_date || '',
        actual_finish_date: task.actual_finish_date || '',
        duration_days: task.duration_days || 14,
        status: task.status || 'Not Started',
        remarks: task.remarks || '',
        cost_estimate: task.cost_estimate || 0,
        assignees: (task.assignees || []).map(a => a.id),
        predecessors: (task.dependencies || []).map(d => d.predecessor_id)
      });
    } else {
      setFormData({
        task_name: '',
        category: 'RCC Structural Construction',
        construction_stage: 'Superstructure & Slab',
        floor_zone: '',
        planned_start_date: new Date().toISOString().split('T')[0],
        planned_finish_date: new Date().toISOString().split('T')[0],
        actual_start_date: '',
        actual_finish_date: '',
        duration_days: 14,
        status: 'Not Started',
        remarks: '',
        cost_estimate: 0,
        assignees: [],
        predecessors: []
      });
    }
  }, [task, isOpen]);

  if (!isOpen) return null;

  // Auto-recalculate duration when planned dates change
  const handleDateChange = (start, finish) => {
    const s = new Date(start);
    const f = new Date(finish);
    let days = formData.duration_days;
    if (!isNaN(s.getTime()) && !isNaN(f.getTime()) && f >= s) {
      days = Math.round((f - s) / (1000 * 60 * 60 * 24)) + 1;
    }
    setFormData(prev => ({
      ...prev,
      planned_start_date: start,
      planned_finish_date: finish,
      duration_days: Math.max(1, days)
    }));
  };

  const handleDurationChange = (days) => {
    const numDays = parseInt(days, 10) || 1;
    const s = new Date(formData.planned_start_date);
    if (!isNaN(s.getTime())) {
      const f = new Date(s);
      f.setDate(f.getDate() + numDays - 1);
      setFormData(prev => ({
        ...prev,
        duration_days: numDays,
        planned_finish_date: f.toISOString().split('T')[0]
      }));
    } else {
      setFormData(prev => ({ ...prev, duration_days: numDays }));
    }
  };

  const handleToggleAssignee = (userId) => {
    setFormData(prev => {
      const exists = prev.assignees.includes(userId);
      return {
        ...prev,
        assignees: exists ? prev.assignees.filter(id => id !== userId) : [...prev.assignees, userId]
      };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.task_name.trim()) {
      toast.error('Task name is required');
      return;
    }

    setSaving(true);
    try {
      if (task && task.id) {
        // Update existing task
        const res = await api.patch(`/projects/${projectId}/timeline/tasks/${task.id}`, formData);
        toast.success('Activity updated successfully');
        if (onTaskUpdated) onTaskUpdated(res.data.task);
      } else {
        // Create new task
        const res = await api.post(`/projects/${projectId}/timeline/tasks`, formData);
        toast.success('Activity created successfully');
        if (onTaskUpdated) onTaskUpdated(res.data.task);
      }
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save activity');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (permanent = false) => {
    if (!task || !task.id) return;
    const msg = permanent
      ? `Permanently delete activity "${task.task_name}"? This cannot be undone.`
      : `Archive activity "${task.task_name}"?`;
    if (!window.confirm(msg)) return;

    try {
      await api.delete(`/projects/${projectId}/timeline/tasks/${task.id}?permanent=${permanent}`);
      toast.success(permanent ? 'Activity permanently deleted' : 'Activity archived');
      if (onTaskDeleted) onTaskDeleted(task.id);
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete activity');
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/40 backdrop-blur-sm flex justify-end animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-white h-full shadow-2xl flex flex-col justify-between overflow-y-auto">
        {/* Header */}
        <div>
          <div className="p-4 border-b border-[#EBEBEB] flex items-center justify-between bg-slate-50">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#E05A1E]">
                {task ? 'Edit Construction Activity' : 'New Construction Activity'}
              </span>
              <h3 className="text-base font-bold text-[#1A1A1A] truncate max-w-sm">
                {formData.task_name || 'Activity Details'}
              </h3>
            </div>
            <button
              onClick={onClose}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/50 transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Activity Name *</label>
              <input
                type="text"
                required
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:border-[#E05A1E]"
                value={formData.task_name}
                onChange={(e) => setFormData({ ...formData, task_name: e.target.value })}
                disabled={!isManagement && task}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Category</label>
                <select
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 text-slate-800 focus:outline-none focus:border-[#E05A1E]"
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  disabled={!isManagement && task}
                >
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Stage</label>
                <select
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 text-slate-800 focus:outline-none focus:border-[#E05A1E]"
                  value={formData.construction_stage}
                  onChange={(e) => setFormData({ ...formData, construction_stage: e.target.value })}
                  disabled={!isManagement && task}
                >
                  {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Floor / Zone</label>
                <input
                  type="text"
                  placeholder="e.g. 2nd Floor, Stilt Area"
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:border-[#E05A1E]"
                  value={formData.floor_zone}
                  onChange={(e) => setFormData({ ...formData, floor_zone: e.target.value })}
                  disabled={!isManagement && task}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Status</label>
                <select
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 font-semibold text-slate-800 focus:outline-none focus:border-[#E05A1E]"
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                >
                  <option value="Not Started">Not Started</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Completed">Completed</option>
                  <option value="On Hold">On Hold</option>
                </select>
              </div>
            </div>

            {/* Planned Dates & Duration */}
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-3">
              <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <Calendar size={13} className="text-[#E05A1E]" /> Planned Schedule
              </span>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <label className="text-[10px] text-muted font-bold uppercase">Start Date</label>
                  <input
                    type="date"
                    className="w-full text-xs bg-white border border-slate-200 rounded-md px-2 py-1.5 text-slate-700"
                    value={formData.planned_start_date}
                    onChange={(e) => handleDateChange(e.target.value, formData.planned_finish_date)}
                    disabled={!isManagement && task}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-muted font-bold uppercase">Finish Date</label>
                  <input
                    type="date"
                    className="w-full text-xs bg-white border border-slate-200 rounded-md px-2 py-1.5 text-slate-700"
                    value={formData.planned_finish_date}
                    onChange={(e) => handleDateChange(formData.planned_start_date, e.target.value)}
                    disabled={!isManagement && task}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-muted font-bold uppercase">Days</label>
                  <input
                    type="number"
                    min="1"
                    className="w-full text-xs bg-white border border-slate-200 rounded-md px-2 py-1.5 text-slate-700 font-mono font-bold text-center"
                    value={formData.duration_days}
                    onChange={(e) => handleDurationChange(e.target.value)}
                    disabled={!isManagement && task}
                  />
                </div>
              </div>
            </div>

            {/* Milestone Trigger Notice */}
            {Boolean(task && (task.is_milestone || task.metadata?.is_trigger_milestone)) && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900 space-y-1">
                <p className="font-bold flex items-center gap-1.5 text-amber-800">
                  <CheckCircle2 size={14} className="text-amber-600" />
                  Third-Floor Slab Structural Milestone Trigger
                </p>
                <p className="text-[11px] text-amber-700 leading-relaxed">
                  Marking this milestone as <strong>Completed</strong> records actual structural completion and dynamically updates the <strong>Ground Floor Brickwork</strong> forecast start to the following calendar day. Original planned baseline dates remain preserved.
                </p>
              </div>
            )}

            {/* Actual Dates */}
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-3">
              <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <Clock size={13} className="text-emerald-600" /> Actual Site Execution Dates
              </span>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] text-muted font-bold uppercase">Actual Start</label>
                  <input
                    type="date"
                    className="w-full text-xs bg-white border border-slate-200 rounded-md px-2 py-1.5 text-slate-700"
                    value={formData.actual_start_date}
                    onChange={(e) => setFormData({ ...formData, actual_start_date: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-muted font-bold uppercase">Actual Finish</label>
                  <input
                    type="date"
                    className="w-full text-xs bg-white border border-slate-200 rounded-md px-2 py-1.5 text-slate-700"
                    value={formData.actual_finish_date}
                    onChange={(e) => setFormData({ ...formData, actual_finish_date: e.target.value })}
                  />
                </div>
              </div>
            </div>

            {/* Assignees Selection */}
            {isManagement && (
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Assigned Engineers & Supervisors</label>
                <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-1.5 border border-slate-200 rounded-lg bg-slate-50">
                  {users.map(u => {
                    const selected = formData.assignees.includes(u.id);
                    return (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => handleToggleAssignee(u.id)}
                        className={`text-xs px-2.5 py-1 rounded-md font-medium transition-all ${
                          selected
                            ? 'bg-[#E05A1E] text-white shadow-sm'
                            : 'bg-white text-slate-700 border border-slate-200 hover:border-slate-400'
                        }`}
                      >
                        {u.name} ({u.role})
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Remarks */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Remarks & Site Notes</label>
              <textarea
                rows="3"
                placeholder="Inspection notes, trade details, material batches..."
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:border-[#E05A1E]"
                value={formData.remarks}
                onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
              />
            </div>
          </form>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-[#EBEBEB] bg-slate-50 flex items-center justify-between">
          <div>
            {task && isManagement && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleDelete(false)}
                  className="p-1.5 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded transition-colors"
                  title="Archive Task"
                >
                  <Archive size={16} />
                </button>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => handleDelete(true)}
                    className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                    title="Permanently Delete Task"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary text-xs py-2 px-3"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={saving}
              className="btn-primary text-xs py-2 px-4"
            >
              {saving ? 'Saving...' : (task ? 'Save Changes' : 'Create Activity')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
