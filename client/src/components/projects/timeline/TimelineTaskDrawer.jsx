// client/src/components/projects/timeline/TimelineTaskDrawer.jsx
import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Calendar,
  Clock,
  UserCheck,
  Shield,
  Trash2,
  Archive,
  CheckCircle2,
  AlertCircle,
  Camera,
  UploadCloud,
  Eye,
  RefreshCw,
  Image as ImageIcon
} from 'lucide-react';
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

const MAX_PHOTO_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

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

  // Photo State
  const [photoData, setPhotoData] = useState(null);
  const [selectedPhotoFile, setSelectedPhotoFile] = useState(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [removingPhoto, setRemovingPhoto] = useState(false);
  const [isViewPhotoModalOpen, setIsViewPhotoModalOpen] = useState(false);
  const fileInputRef = useRef(null);

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

      if (task.photo_path) {
        setPhotoData({
          photo_path: task.photo_path,
          photo_name: task.photo_name,
          photo_size: task.photo_size,
          photo_mime: task.photo_mime,
          photo_uploaded_at: task.photo_uploaded_at
        });
        setPhotoPreviewUrl(`/${task.photo_path}`);
      } else {
        setPhotoData(null);
        setPhotoPreviewUrl(null);
      }
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
      setPhotoData(null);
      setPhotoPreviewUrl(null);
    }
    setSelectedPhotoFile(null);
  }, [task, isOpen]);

  // Clean up object URLs on unmount/change
  useEffect(() => {
    return () => {
      if (photoPreviewUrl && photoPreviewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(photoPreviewUrl);
      }
    };
  }, [photoPreviewUrl]);

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

  const handleActualDateChange = (field, val) => {
    setFormData(prev => {
      const updated = { ...prev, [field]: val };
      if (updated.actual_start_date && updated.actual_finish_date) {
        if (new Date(updated.actual_finish_date) < new Date(updated.actual_start_date)) {
          toast.error('Actual finish date cannot precede actual start date', { id: 'actual-date-err' });
        }
      }
      return updated;
    });
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

  // ─── Photo Upload & File Management ─────────────────────────────────────────

  const handlePhotoSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input value so re-selecting same file triggers change
    e.target.value = '';

    // 1. Validate file size (max 5 MB)
    if (file.size > MAX_PHOTO_BYTES) {
      toast.error('File exceeds maximum 5 MB limit. Please select a smaller photo.');
      return;
    }

    // 2. Validate file type
    if (!ALLOWED_PHOTO_TYPES.includes(file.type)) {
      toast.error('Unsupported format. Only JPG, PNG, and WebP images are permitted.');
      return;
    }

    // 3. Create local preview
    const previewUrl = URL.createObjectURL(file);
    setSelectedPhotoFile(file);
    setPhotoPreviewUrl(previewUrl);

    // If editing existing task, upload immediately
    if (task && task.id) {
      setUploadingPhoto(true);
      const toastId = toast.loading('Uploading site execution photo...');
      try {
        const photoFormData = new FormData();
        photoFormData.append('photo', file);

        const res = await api.post(`/projects/${projectId}/timeline/tasks/${task.id}/photo`, photoFormData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });

        setPhotoData(res.data.photo);
        setPhotoPreviewUrl(`/${res.data.photo.photo_path}`);
        setSelectedPhotoFile(null);
        toast.success('Site execution photo uploaded successfully', { id: toastId });
        onTaskUpdated && onTaskUpdated();
      } catch (err) {
        console.error('Failed to upload photo:', err);
        toast.error(err.response?.data?.error || 'Failed to upload photo', { id: toastId });
        // Revert to original photo if upload failed
        if (task.photo_path) {
          setPhotoPreviewUrl(`/${task.photo_path}`);
        } else {
          setPhotoPreviewUrl(null);
        }
        setSelectedPhotoFile(null);
      } finally {
        setUploadingPhoto(false);
      }
    }
  };

  const handleRemovePhoto = async () => {
    if (task && task.id && photoData) {
      setRemovingPhoto(true);
      const toastId = toast.loading('Removing photo...');
      try {
        await api.delete(`/projects/${projectId}/timeline/tasks/${task.id}/photo`);
        setPhotoData(null);
        setPhotoPreviewUrl(null);
        setSelectedPhotoFile(null);
        toast.success('Site execution photo removed', { id: toastId });
        onTaskUpdated && onTaskUpdated();
      } catch (err) {
        toast.error(err.response?.data?.error || 'Failed to remove photo', { id: toastId });
      } finally {
        setRemovingPhoto(false);
      }
    } else {
      // Just clear local draft photo
      setSelectedPhotoFile(null);
      setPhotoPreviewUrl(null);
      setPhotoData(null);
    }
  };

  // Format file size for display
  const formatFileSize = (bytes) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  // ─── Save Task Submission ───────────────────────────────────────────────────

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validate actual dates
    if (formData.actual_start_date && formData.actual_finish_date) {
      if (new Date(formData.actual_finish_date) < new Date(formData.actual_start_date)) {
        toast.error('Actual finish date cannot precede actual start date');
        return;
      }
    }

    setSaving(true);
    try {
      if (task) {
        await api.patch(`/projects/${projectId}/timeline/tasks/${task.id}`, formData);
        toast.success('Activity updated successfully');
      } else {
        const res = await api.post(`/projects/${projectId}/timeline/tasks`, formData);
        const newTask = res.data.task;

        // If a photo was selected during new activity creation, upload it now
        if (selectedPhotoFile && newTask?.id) {
          try {
            const photoFormData = new FormData();
            photoFormData.append('photo', selectedPhotoFile);
            await api.post(`/projects/${projectId}/timeline/tasks/${newTask.id}/photo`, photoFormData, {
              headers: { 'Content-Type': 'multipart/form-data' }
            });
          } catch (uploadErr) {
            console.warn('Initial photo upload deferred error:', uploadErr);
          }
        }
        toast.success('Activity created successfully');
      }

      onTaskUpdated && onTaskUpdated();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save activity');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (isHard = false) => {
    if (!task) return;
    const confirmMsg = isHard 
      ? 'Are you sure you want to PERMANENTLY delete this activity? This cannot be undone.'
      : 'Are you sure you want to archive this activity?';
    if (!window.confirm(confirmMsg)) return;

    try {
      await api.delete(`/projects/${projectId}/timeline/tasks/${task.id}${isHard ? '?hard=true' : ''}`);
      toast.success(isHard ? 'Activity permanently deleted' : 'Activity archived');
      onTaskDeleted && onTaskDeleted(task.id);
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete activity');
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/40 backdrop-blur-2xs flex justify-end animate-in fade-in duration-200">
        <div className="bg-white w-full max-w-xl h-full shadow-2xl flex flex-col justify-between border-l border-slate-200">
          
          {/* Header */}
          <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#E05A1E]" />
              <h3 className="font-bold text-sm text-slate-800">
                {task ? 'Edit Construction Activity' : 'New Construction Activity'}
              </h3>
            </div>
            <button
              onClick={onClose}
              className="p-1 rounded-lg hover:bg-slate-200 text-slate-500 transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          {/* Form Body */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            <form onSubmit={handleSubmit} className="space-y-4">
              
              {/* Task Name */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Activity Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. RCC Column Concreting First Floor"
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:border-[#E05A1E] font-medium"
                  value={formData.task_name}
                  onChange={(e) => setFormData({ ...formData, task_name: e.target.value })}
                  disabled={!isManagement && Boolean(task)}
                />
              </div>

              {/* Category & Stage */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Category</label>
                  <select
                    className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 text-slate-800 focus:outline-none focus:border-[#E05A1E]"
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    disabled={!isManagement && Boolean(task)}
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
                    disabled={!isManagement && Boolean(task)}
                  >
                    {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              {/* Floor Zone & Status */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Floor / Zone</label>
                  <input
                    type="text"
                    placeholder="e.g. Ground Floor, Plinth"
                    className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:border-[#E05A1E]"
                    value={formData.floor_zone}
                    onChange={(e) => setFormData({ ...formData, floor_zone: e.target.value })}
                    disabled={!isManagement && Boolean(task)}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Status</label>
                  <select
                    className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 text-slate-800 font-semibold focus:outline-none focus:border-[#E05A1E]"
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

              {/* Planned Schedule (Authoritative Baseline) */}
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                    <Calendar size={13} className="text-[#E05A1E]" /> Planned Schedule (Baseline)
                  </span>
                  <span className="text-[10px] text-muted font-mono font-bold">
                    {formData.duration_days} Day{formData.duration_days > 1 ? 's' : ''}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] text-muted font-bold uppercase">Planned Start</label>
                    <input
                      type="date"
                      required
                      className="w-full text-xs bg-white border border-slate-200 rounded-md px-2 py-1.5 text-slate-700 font-medium"
                      value={formData.planned_start_date}
                      onChange={(e) => handleDateChange(e.target.value, formData.planned_finish_date)}
                      disabled={!isManagement && Boolean(task)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-muted font-bold uppercase">Planned Finish</label>
                    <input
                      type="date"
                      required
                      className="w-full text-xs bg-white border border-slate-200 rounded-md px-2 py-1.5 text-slate-700 font-medium"
                      value={formData.planned_finish_date}
                      onChange={(e) => handleDateChange(formData.planned_start_date, e.target.value)}
                      disabled={!isManagement && Boolean(task)}
                    />
                  </div>
                </div>

                {isManagement && (
                  <div className="pt-1">
                    <label className="text-[10px] text-muted font-bold uppercase block mb-1">Duration (Working Days)</label>
                    <input
                      type="number"
                      min="1"
                      className="w-24 text-xs bg-white border border-slate-200 rounded-md px-2 py-1 text-slate-700 font-mono"
                      value={formData.duration_days}
                      onChange={(e) => handleDurationChange(e.target.value)}
                    />
                  </div>
                )}
              </div>

              {/* Slab Milestone Banner (if trigger) */}
              {task?.metadata?.is_trigger_milestone && (
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

              {/* Actual Site Execution Dates (Independent Records) */}
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                    <Clock size={13} className="text-emerald-600" /> Actual Site Execution Dates
                  </span>
                  <span className="text-[10px] text-slate-400 italic">
                    Independent of baseline
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] text-muted font-bold uppercase">Actual Start</label>
                    <input
                      type="date"
                      className="w-full text-xs bg-white border border-slate-200 rounded-md px-2 py-1.5 text-slate-700 font-medium"
                      value={formData.actual_start_date}
                      onChange={(e) => handleActualDateChange('actual_start_date', e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-muted font-bold uppercase">Actual Finish</label>
                    <input
                      type="date"
                      className="w-full text-xs bg-white border border-slate-200 rounded-md px-2 py-1.5 text-slate-700 font-medium"
                      value={formData.actual_finish_date}
                      onChange={(e) => handleActualDateChange('actual_finish_date', e.target.value)}
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

              {/* ─── SITE EXECUTION PHOTO SECTION ───────────────────────────── */}
              <div className="space-y-2 pt-3 border-t border-slate-200">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <Camera size={14} className="text-[#E05A1E]" />
                    Site Execution Photo
                  </label>
                  {(photoData || selectedPhotoFile) && (
                    <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <CheckCircle2 size={11} /> 1 Photo Attached
                    </span>
                  )}
                </div>

                <p className="text-[11px] text-slate-500">
                  Upload one site photograph as supporting evidence for this activity. Maximum file size: 5 MB.
                </p>

                {/* Hidden File Input */}
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handlePhotoSelect}
                  className="hidden"
                />

                {/* Photo Present State */}
                {(photoData || selectedPhotoFile) ? (
                  <div className="border border-slate-200 rounded-xl p-3 bg-slate-50 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Thumbnail Preview */}
                      <div 
                        onClick={() => setIsViewPhotoModalOpen(true)}
                        className="w-16 h-16 rounded-lg bg-slate-200 border border-slate-300 overflow-hidden flex-shrink-0 cursor-pointer relative group"
                        title="Click to view full photo"
                      >
                        {photoPreviewUrl ? (
                          <img
                            src={photoPreviewUrl}
                            alt="Site evidence"
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-slate-400">
                            <ImageIcon size={20} />
                          </div>
                        )}
                        <div className="absolute inset-0 bg-slate-900/30 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity">
                          <Eye size={16} />
                        </div>
                      </div>

                      {/* File Metadata */}
                      <div className="min-w-0 text-xs space-y-0.5">
                        <p className="font-semibold text-slate-800 truncate" title={photoData?.photo_name || selectedPhotoFile?.name}>
                          {photoData?.photo_name || selectedPhotoFile?.name || 'Site_Photo.jpg'}
                        </p>
                        <p className="text-[10px] text-slate-500">
                          Size: {formatFileSize(photoData?.photo_size || selectedPhotoFile?.size)}
                        </p>
                        {photoData?.photo_uploaded_at && (
                          <p className="text-[10px] text-slate-400">
                            Uploaded: {new Date(photoData.photo_uploaded_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </p>
                        )}
                        {uploadingPhoto && (
                          <p className="text-[10px] text-[#E05A1E] font-medium animate-pulse">
                            Uploading photo to server...
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => setIsViewPhotoModalOpen(true)}
                        className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-white rounded-md border border-slate-200 transition-colors"
                        title="View Full Photo"
                      >
                        <Eye size={14} />
                      </button>

                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploadingPhoto}
                        className="px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-md transition-colors flex items-center gap-1"
                        title="Replace current photograph"
                      >
                        <RefreshCw size={12} className={uploadingPhoto ? 'animate-spin' : ''} />
                        <span>Replace</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleRemovePhoto}
                        disabled={removingPhoto}
                        className="p-1.5 text-red-600 hover:bg-red-50 border border-red-200 rounded-md transition-colors"
                        title="Remove Photograph"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Empty Upload State */
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-slate-300 hover:border-[#E05A1E] rounded-xl p-5 bg-slate-50/60 hover:bg-orange-50/30 text-center cursor-pointer transition-all space-y-1.5 group"
                  >
                    <div className="w-10 h-10 rounded-full bg-slate-100 group-hover:bg-orange-100 text-slate-500 group-hover:text-[#E05A1E] flex items-center justify-center mx-auto transition-colors">
                      <UploadCloud size={20} />
                    </div>
                    <div className="text-xs font-semibold text-slate-700 group-hover:text-[#E05A1E]">
                      {uploadingPhoto ? 'Uploading Photo...' : 'Upload Site Photo'}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      Accepted formats: JPG, PNG, WebP · Maximum size: 5 MB
                    </div>
                  </div>
                )}
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

      {/* ─── Full-Resolution Photo Viewer Lightbox Modal ───────────────────── */}
      {isViewPhotoModalOpen && photoPreviewUrl && (
        <div className="fixed inset-0 z-60 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-4xl max-h-[90vh] w-full flex flex-col overflow-hidden shadow-2xl">
            {/* Modal Header */}
            <div className="px-5 py-3 border-b border-slate-800 flex items-center justify-between text-white">
              <div className="flex items-center gap-2 truncate pr-4">
                <Camera size={16} className="text-[#E05A1E]" />
                <span className="font-bold text-xs truncate">
                  {photoData?.photo_name || selectedPhotoFile?.name || 'Site Photo Evidence'}
                </span>
                <span className="text-[10px] text-slate-400 font-mono">
                  ({formatFileSize(photoData?.photo_size || selectedPhotoFile?.size)})
                </span>
              </div>
              <button
                onClick={() => setIsViewPhotoModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Image Viewer Body */}
            <div className="flex-1 overflow-auto flex items-center justify-center p-4 bg-slate-950/50 min-h-[350px]">
              <img
                src={photoPreviewUrl}
                alt={photoData?.photo_name || 'Activity Site Evidence'}
                className="max-h-[75vh] max-w-full object-contain rounded-lg shadow-lg"
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
