// client/src/pages/TasksPage.jsx
import { useState, useEffect, useCallback } from 'react';
import AppLayout from '../components/layout/AppLayout';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import TaskModal from '../components/projects/TaskModal';
import { formatIST } from '../utils/time';

export default function TasksPage() {
  const { user } = useAuth();
  const [projects, setProjects] = useState([]);
  const [users, setUsers] = useState([]);
  const [kanbanData, setKanbanData] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Create Task Form State
  const [title, setTitle] = useState('');
  const [projectId, setProjectId] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [viewMode, setViewMode] = useState('active'); // 'active' or 'history'
  const [submitting, setSubmitting] = useState(false);

  // Discussion Modal State
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [projRes, usersRes, kanbanRes] = await Promise.all([
        api.get('/projects'),
        api.get('/auth/users'),
        api.get(`/tasks?view=${viewMode === 'history' ? 'history' : 'kanban'}`)
      ]);
      setProjects(projRes.data.projects || []);
      setUsers(usersRes.data.users || []);
      
      setKanbanData(kanbanRes.data.kanban || []);
    } catch (err) {
      toast.error('Failed to load task resources');
    } finally {
      setLoading(false);
    }
  }, [viewMode]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleCreateTask(e) {
    e.preventDefault();
    if (!title.trim() || !projectId) {
      return toast.error('Please provide a title and select a project');
    }

    setSubmitting(true);
    try {
      await api.post('/tasks', {
        project_id: parseInt(projectId),
        title: title.trim(),
        assigned_to: assignedTo ? parseInt(assignedTo) : null,
        participants: assignedTo ? [parseInt(assignedTo)] : []
      });
      setTitle('');
      setProjectId('');
      setAssignedTo('');
      toast.success('Task successfully assigned');
      // Refresh board
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create task');
    } finally {
      setSubmitting(false);
    }
  }

  const openTask = (taskId) => {
    setSelectedTaskId(taskId);
    setIsModalOpen(true);
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-black text-[#1A1A1A] tracking-tight">Task Manager</h1>
          <p className="text-muted text-sm font-medium mt-0.5">Global productivity tracking</p>
        </div>

        {/* Create Task Panel */}
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-[rgba(224,90,30,0.08)] border border-[rgba(224,90,30,0.18)] flex items-center justify-center text-[#E05A1E]">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
            </div>
            <h2 className="text-base font-black text-[#1A1A1A]">Create Separate Task</h2>
          </div>

          <form onSubmit={handleCreateTask} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div className="md:col-span-1">
              <label className="text-[10px] font-black text-muted uppercase tracking-wider">Task Title</label>
              <input
                type="text"
                className="input mt-1"
                placeholder="Type task objective..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div>
              <label className="text-[10px] font-black text-muted uppercase tracking-wider">Project Link</label>
              <select
                className="input mt-1"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
              >
                <option value="">Select Project...</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[10px] font-black text-muted uppercase tracking-wider">Assign To</label>
              <select
                className="input mt-1"
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
              >
                <option value="">Unassigned</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                ))}
              </select>
            </div>

            {/* Removed Project Stage selection as requested */}

            <div className="md:col-span-3 flex justify-end">
              <button
                type="submit"
                disabled={submitting || !title.trim() || !projectId}
                className="btn-primary"
              >
                {submitting ? 'Submitting...' : 'Link & Dispatch Task'}
              </button>
            </div>
          </form>
        </div>

        {/* Kanban Section */}
        {loading ? (
          <div className="card skeleton h-96 w-full rounded" />
        ) : (
          <div className="card w-full">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <h3 className="text-lg font-black text-[#1A1A1A]">
                {viewMode === 'history' ? 'Task History (Passed)' : 'Task Board (All Employees)'}
              </h3>
              
              <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 self-start">
                <button 
                  onClick={() => setViewMode('active')}
                  className={`px-4 py-1.5 text-xs font-black uppercase tracking-widest rounded-lg transition-all ${
                    viewMode === 'active' ? 'bg-white text-[#1A1A1A] shadow-sm' : 'text-slate-400 hover:text-slate-600'
                  }`}
                >
                  Active
                </button>
                <button 
                  onClick={() => setViewMode('history')}
                  className={`px-4 py-1.5 text-xs font-black uppercase tracking-widest rounded-lg transition-all ${
                    viewMode === 'history' ? 'bg-white text-[#1A1A1A] shadow-sm' : 'text-slate-400 hover:text-slate-600'
                  }`}
                >
                  History
                </button>
              </div>
            </div>
            
            <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-thin">
              {kanbanData.map((col) => (
                <div key={col.username || col.name} className="flex flex-col min-w-[280px] bg-slate-50 border border-slate-100 rounded-xl p-3 min-h-[400px]">
                  <div className="flex items-start justify-between mb-4 pb-2 border-b border-slate-200/60">
                    <div className="flex flex-col">
                      <span className="text-xs font-black text-slate-700 uppercase tracking-wider">{col.name}</span>
                      {col.department && (
                        <span className="text-[10px] font-bold text-slate-400 mt-0.5 uppercase tracking-wide">{col.department}</span>
                      )}
                    </div>
                    <span className="px-1.5 py-0.5 rounded bg-white text-[10px] font-bold text-slate-400 border border-slate-200 h-fit mt-0.5">
                      {col.tasks?.length || 0}
                    </span>
                  </div>
                  
                  <div className="flex-1 space-y-3">
                    {col.tasks?.length === 0 && (
                      <div className="text-center py-12 text-slate-300 italic text-xs">No tasks</div>
                    )}
                    {col.tasks?.map((t) => (
                      <div 
                        key={t.id}
                        onClick={() => openTask(t.id)}
                        className="bg-white border border-slate-200 rounded-xl p-3 hover:border-[#E05A1E]/50 hover:shadow-md cursor-pointer transition-all group relative overflow-hidden"
                      >
                        <div className="absolute top-0 left-0 w-1 h-full bg-[#E05A1E] opacity-0 group-hover:opacity-100 transition-opacity" />
                        <p className="text-xs font-bold text-slate-800 line-clamp-2 mb-1 group-hover:text-[#E05A1E] transition-colors">{t.title}</p>
                        <p className="text-[10px] text-muted mb-2 font-medium flex items-center gap-1.5">
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                          {formatIST(t.created_at)}
                        </p>

                        <div className="flex items-center justify-between gap-2 mt-3 pt-2 border-t border-slate-50 flex-wrap">
                          <span className="text-[9px] font-black uppercase tracking-tight bg-slate-100 text-[#E05A1E] px-1.5 py-0.5 rounded border border-slate-200">
                            {t.project_name}
                          </span>
                          <span className={`text-[9px] font-black uppercase tracking-tight px-1.5 py-0.5 rounded border ${
                            t.status === 'passed' ? 'bg-emerald-50 border-emerald-200 text-emerald-600' :
                            t.status === 'done' ? 'bg-emerald-50 border-emerald-200 text-emerald-600' :
                            t.status === 'in_progress' ? 'bg-amber-50 border-amber-200 text-amber-600' :
                            t.status === 'review' ? 'bg-purple-50 border-purple-200 text-purple-600' :
                            'bg-slate-100 border-slate-200 text-slate-400'
                          }`}>
                            {t.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <TaskModal 
        taskId={selectedTaskId}
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); fetchData(); }}
      />
    </AppLayout>
  );
}
