// client/src/components/projects/timeline/ProjectTimelineTab.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { Settings, BarChart3, ListTodo, History, Plus, Send, AlertCircle, CheckCircle2, Clock } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../../api/client';
import TimelineSetup from './TimelineSetup';
import TimelineGanttChart from './TimelineGanttChart';
import TimelineTaskList from './TimelineTaskList';
import TimelineTaskDrawer from './TimelineTaskDrawer';
import TimelineActivityHistory from './TimelineActivityHistory';

export default function ProjectTimelineTab({ projectId, user, isAdmin, isManagement }) {
  const [activeSubTab, setActiveSubTab] = useState('gantt'); // 'setup', 'gantt', 'tasks', 'history'
  const [config, setConfig] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [draftTasks, setDraftTasks] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTask, setSelectedTask] = useState(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);

  // Fetch timeline data
  const fetchData = useCallback(async () => {
    try {
      const [confRes, tasksRes, draftsRes, usersRes] = await Promise.all([
        api.get(`/projects/${projectId}/timeline/config`),
        api.get(`/projects/${projectId}/timeline/tasks`),
        api.get(`/projects/${projectId}/timeline/tasks?show_draft=true`),
        api.get('/auth/users')
      ]);

      setConfig(confRes.data.config);
      setTasks(tasksRes.data.tasks || []);
      setDraftTasks(draftsRes.data.tasks || []);
      setUsers(usersRes.data.users || []);

      // If no published tasks yet, default to setup or draft review
      if ((tasksRes.data.tasks || []).length === 0 && (draftsRes.data.tasks || []).length > 0) {
        setActiveSubTab('tasks');
      } else if ((tasksRes.data.tasks || []).length === 0) {
        setActiveSubTab('setup');
      }
    } catch (err) {
      console.error('Error fetching timeline data:', err);
      toast.error('Failed to load project timeline');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleOpenNewTask = () => {
    setSelectedTask(null);
    setIsDrawerOpen(true);
  };

  const handleSelectTask = (task) => {
    setSelectedTask(task);
    setIsDrawerOpen(true);
  };

  const handlePublishSchedule = async () => {
    if (!window.confirm('Publish current draft activities as active project schedule?')) return;
    setPublishing(true);
    try {
      const res = await api.post(`/projects/${projectId}/timeline/publish`, {
        notes: `Published Schedule v${(config?.published_version || 0) + 1}`
      });
      toast.success(res.data.message);
      await fetchData();
      setActiveSubTab('gantt');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to publish schedule');
    } finally {
      setPublishing(false);
    }
  };

  const handleUpdateTaskStatus = async (taskId, newStatus) => {
    try {
      const res = await api.patch(`/projects/${projectId}/timeline/tasks/${taskId}`, { status: newStatus });
      if (res.data.forecast_adjustment) {
        await fetchData();
      } else {
        setTasks(prev => prev.map(t => t.id === taskId ? res.data.task : t));
      }
      toast.success(res.data.message || `Task status updated to ${newStatus}`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update task status');
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-10 w-full rounded-xl" />
        <div className="skeleton h-64 rounded-xl" />
      </div>
    );
  }

  const isPublished = config?.status === 'published' && tasks.length > 0;
  const hasDraftPending = draftTasks.length > 0;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Schedule Status & Publishing Notice Banner */}
      {hasDraftPending && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-soft-sm">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center flex-shrink-0">
              <Clock size={16} />
            </div>
            <div>
              <p className="text-xs font-bold text-amber-900">
                Draft Schedule Prepared ({draftTasks.length} draft activities pending review)
              </p>
              <p className="text-[11px] text-amber-700">
                Review the generated activities below. When satisfied, publish to activate the timeline.
              </p>
            </div>
          </div>
          {isManagement && (
            <button
              onClick={handlePublishSchedule}
              disabled={publishing}
              className="btn-primary text-xs py-2 px-4 shadow-sm"
            >
              <Send size={13} />
              {publishing ? 'Publishing...' : 'Publish Schedule'}
            </button>
          )}
        </div>
      )}

      {/* Internal Navigation Sub-tabs Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#EBEBEB] pb-2">
        <div className="flex items-center gap-1 overflow-x-auto">
          {[
            { id: 'setup', label: 'Timeline Setup', icon: Settings },
            { id: 'gantt', label: 'Gantt Chart', icon: BarChart3, count: tasks.length },
            { id: 'tasks', label: 'Task List', icon: ListTodo, count: tasks.length || draftTasks.length },
            isManagement && { id: 'history', label: 'Activity History', icon: History }
          ].filter(Boolean).map(tab => {
            const Icon = tab.icon;
            const isActive = activeSubTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveSubTab(tab.id)}
                className={`px-3 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap ${
                  isActive
                    ? 'bg-[#E05A1E] text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Icon size={14} />
                <span>{tab.label}</span>
                {tab.count !== undefined && tab.count > 0 && (
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${isActive ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'}`}>
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <span className={`px-2.5 py-1 rounded-md text-[11px] font-bold border ${
            isPublished
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : 'bg-amber-50 text-amber-700 border-amber-200'
          }`}>
            {isPublished ? `v${config.published_version} Active Schedule` : 'Draft Schedule'}
          </span>

          {isManagement && (
            <button
              onClick={handleOpenNewTask}
              className="btn-primary text-xs py-1.5 px-3"
            >
              <Plus size={14} />
              Add Activity
            </button>
          )}
        </div>
      </div>

      {/* Sub-tab Content */}
      {activeSubTab === 'setup' && (
        <TimelineSetup
          projectId={projectId}
          config={config}
          onConfigSaved={async (updated) => {
            setConfig(updated);
            await fetchData();
            setActiveSubTab('gantt');
          }}
          onDraftGenerated={async () => {
            await fetchData();
            setActiveSubTab('gantt');
          }}
          isManagement={isManagement}
        />
      )}

      {activeSubTab === 'gantt' && (
        <TimelineGanttChart
          tasks={tasks.length > 0 ? tasks : draftTasks}
          onSelectTask={handleSelectTask}
        />
      )}

      {activeSubTab === 'tasks' && (
        <TimelineTaskList
          tasks={tasks.length > 0 ? tasks : draftTasks}
          onSelectTask={handleSelectTask}
          onAddTask={handleOpenNewTask}
          onUpdateTaskStatus={handleUpdateTaskStatus}
          isManagement={isManagement}
        />
      )}

      {activeSubTab === 'history' && (
        <TimelineActivityHistory
          projectId={projectId}
          isManagement={isManagement}
        />
      )}

      {/* Shared Task Drawer */}
      <TimelineTaskDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        task={selectedTask}
        projectId={projectId}
        users={users}
        allTasks={tasks}
        onTaskUpdated={fetchData}
        onTaskDeleted={fetchData}
        isManagement={isManagement}
        isAdmin={isAdmin}
      />
    </div>
  );
}
