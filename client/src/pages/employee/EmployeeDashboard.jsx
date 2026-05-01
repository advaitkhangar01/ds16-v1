// client/src/pages/employee/EmployeeDashboard.jsx
// Employee dashboard: check-in/out, my tasks, my projects

import { useState, useEffect, useCallback } from 'react';
import AppLayout from '../../components/layout/AppLayout';
import { useAuth } from '../../context/AuthContext';
import api from '../../api/client';
import { formatTimeIST, todayIST, timeAgo, formatIST } from '../../utils/time';
import { mapAttendance } from '../../utils/attendance';
import AttendanceCard from '../../components/ui/AttendanceCard';
import toast from 'react-hot-toast';
import TaskModal from '../../components/projects/TaskModal';

// ── Team Attendance Table (New)
function TeamAttendanceTable({ records }) {
  return (
    <div className="card h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-[#1A1A1A]">Team Attendance Today</h3>
        <span className="text-[10px] text-muted uppercase tracking-wider font-medium">Live Status</span>
      </div>
      <div className="flex-1 overflow-y-auto scrollbar-thin max-h-[400px]">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-[#F0F0F0]">
              <th className="text-[10px] font-bold text-muted uppercase py-2">Name</th>
              <th className="text-[10px] font-bold text-muted uppercase py-2">Check-In</th>
              <th className="text-[10px] font-bold text-muted uppercase py-2 text-right">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F5F5F5]">
            {records.map((r) => {
              const isLate = r.checkIn && new Date(r.checkIn).getHours() >= 10 && new Date(r.checkIn).getMinutes() > 0;
              return (
                <tr key={r.id} className="group hover:bg-[#FAFAFA] transition-colors">
                  <td className="py-2.5">
                    <p className="text-xs font-medium text-[#1A1A1A] group-hover:text-[#E05A1E] transition-colors">{r.name}</p>
                    <p className="text-[10px] text-muted truncate max-w-[100px]">{r.department || 'Staff'}</p>
                  </td>
                  <td className="py-2.5">
                    <p className={`text-xs font-semibold ${isLate ? 'text-red-500' : r.checkIn ? 'text-emerald-600' : 'text-muted'}`}>
                      {r.checkIn ? formatTimeIST(r.checkIn) : '—'}
                    </p>
                  </td>
                  <td className="py-2.5 text-right">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-tighter ${
                      r.status === 'working' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' :
                      r.status === 'completed' ? 'bg-blue-50 text-blue-600 border border-blue-100' :
                      'bg-red-50 text-red-500 border border-red-100'
                    }`}>
                      {r.status === 'working' ? 'Present' : r.status === 'completed' ? 'Done' : 'Absent'}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-4 pt-3 border-t border-[#F0F0F0]">
        <a href="/attendance" className="text-[11px] font-bold text-[#E05A1E] hover:underline flex items-center gap-1 group">
          View Detailed Log 
          <span className="group-hover:translate-x-0.5 transition-transform">→</span>
        </a>
      </div>
    </div>
  );
}

// ── Stats Cards
function TeamStats({ stats }) {
  return (
    <div className="grid grid-cols-2 gap-4 h-full">
      <div className="card bg-emerald-50/50 border-emerald-100 flex flex-col justify-center items-center text-center py-6">
        <p className="text-[10px] font-bold text-emerald-700 uppercase mb-1">Present Today</p>
        <p className="text-4xl font-black text-emerald-600 tracking-tight">{stats?.present ?? 0}</p>
      </div>
      <div className="card bg-red-50/50 border-red-100 flex flex-col justify-center items-center text-center py-6">
        <p className="text-[10px] font-bold text-red-700 uppercase mb-1">Absent</p>
        <p className="text-4xl font-black text-red-500 tracking-tight">{stats?.absent ?? 0}</p>
      </div>
    </div>
  );
}

// ── My tasks list
function MyTasks({ tasks }) {
  return (
    <div className="card">
      <h3 className="text-base font-semibold text-[#1A1A1A] mb-4">
        My Tasks
        {tasks?.length > 0 && (
          <span className="ml-2 px-2 py-0.5 rounded-full bg-[rgba(224,90,30,0.08)] text-[#E05A1E] text-xs border border-[rgba(224,90,30,0.2)]">
            {tasks.length}
          </span>
        )}
      </h3>

      {!tasks?.length && (
        <p className="text-muted text-sm text-center py-6">No tasks assigned yet</p>
      )}

      <div className="space-y-3">
        {tasks?.map((task) => (
          <a key={task.id} href={`/projects/${task.project_id}`}
            className="block p-3 rounded-lg border border-[#E0E0E0] hover:border-[rgba(224,90,30,0.3)] bg-white transition-all group">
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-[#E05A1E] mb-1 font-medium">{task.project_name}</p>
                <p className="text-sm text-[#1A1A1A] line-clamp-2">{task.message}</p>
                <div className="flex items-center gap-2 mt-2">
                  <span className={`badge ${
                    task.task_status === 'completed' ? 'badge-completed'
                    : task.task_status === 'in_progress' ? 'badge-in-progress'
                    : 'badge-pending'
                  }`}>
                    {task.task_status}
                  </span>
                  <span className="text-xs text-muted font-medium">{timeAgo(task.created_at)}</span>
                </div>
              </div>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}

// ── My projects
function MyProjects({ projects }) {
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-[#1A1A1A]">My Projects</h3>
        <a href="/projects" className="text-xs text-[#E05A1E] hover:text-[#C94E16] font-bold">View all →</a>
      </div>

      {!projects?.length && (
        <p className="text-muted text-sm text-center py-6">No projects assigned</p>
      )}

      <div className="space-y-3">
        {projects?.slice(0, 5).map((p) => {
          const activeStage = p.stages?.find(s => s?.status === 'in_progress')
            || p.stages?.find(s => s?.status === 'pending');
          return (
            <a key={p.id} href={`/projects/${p.id}`}
              className="block p-3 rounded-lg border border-[#E0E0E0] hover:border-[rgba(224,90,30,0.3)] bg-white transition-all">
              <p className="text-sm font-medium text-[#1A1A1A] truncate">{p.name}</p>
              <p className="text-xs text-muted truncate">{p.client_name}</p>
              <div className="flex items-center gap-2 mt-2">
                <span className="badge badge-pending text-[10px] uppercase font-bold tracking-tighter">{p.type}</span>
                {activeStage && (
                  <span className="badge badge-in-progress text-[10px] uppercase font-bold tracking-tighter">{activeStage.stage_name}</span>
                )}
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
}

function TaskKanbanBoard() {
  const [kanbanData, setKanbanData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const fetchKanban = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/tasks?view=kanban');
      setKanbanData(data.kanban || []);
    } catch (err) {
      toast.error('Failed to load task board');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchKanban();
  }, [fetchKanban]);

  const openTask = (taskId) => {
    setSelectedTaskId(taskId);
    setIsModalOpen(true);
  };

  if (loading) {
    return <div className="card skeleton h-60 w-full rounded" />;
  }

  return (
    <div className="card w-full">
      <div className="flex items-center gap-2 mb-6">
        <h3 className="text-lg font-black text-[#1A1A1A]">Task Board (All Employees)</h3>
      </div>
      
      <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-thin">
        {kanbanData.map((col) => (
          <div key={col.username || col.name} className="flex flex-col min-w-[280px] bg-slate-50 border border-slate-100 rounded-xl p-3 min-h-[400px]">
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-200/60">
              <span className="text-xs font-black text-slate-700 uppercase tracking-wider">{col.name}</span>
              <span className="px-1.5 py-0.5 rounded bg-white text-[10px] font-bold text-slate-400 border border-slate-200">
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
                  <p className="text-xs font-bold text-slate-800 line-clamp-2 mb-2 group-hover:text-[#E05A1E] transition-colors">{t.title}</p>
                  
                  <div className="flex items-center justify-between gap-2 mt-3 pt-2 border-t border-slate-50 flex-wrap">
                    <span className="text-[9px] font-black uppercase tracking-tight bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded border border-slate-200">
                      {t.stage}
                    </span>
                    <span className={`text-[9px] font-black uppercase tracking-tight px-1.5 py-0.5 rounded border ${
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

      <TaskModal 
        taskId={selectedTaskId}
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); fetchKanban(); }}
      />
    </div>
  );
}

export default function EmployeeDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const { data: res } = await api.get('/dashboard/employee');
      const { data: attToday } = await api.get('/attendance/today');
      
      setData({
        ...res,
        attendance: mapAttendance(res.attendance),
        team_attendance: attToday.attendance.map(mapAttendance)
      });
    } catch {
      toast.error('Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleAttendanceAction = (updatedAttendance) => {
    // Refresh fully to sync team list and stats
    fetchData();
  };

  useEffect(() => { fetchData(); }, [fetchData]);

  // Skeleton
  if (loading) {
    return (
      <AppLayout>
        <div className="space-y-6">
          <div className="skeleton h-8 w-48 rounded" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="card h-48 skeleton rounded" />
            ))}
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-[#1A1A1A] tracking-tight">
              Good {new Date().getHours() < 12 ? 'Morning' : new Date().getHours() < 17 ? 'Afternoon' : 'Evening'}, {user?.name?.split(' ')[0]} 👋
            </h1>
            <p className="text-muted text-sm font-medium mt-0.5">{todayIST()}</p>
          </div>
          <div className="bg-white border border-[#E0E0E0] rounded-full px-4 py-1.5 shadow-sm flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[11px] font-bold text-[#1A1A1A] uppercase">Production Build v1.6</span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Attendance Card */}
          <AttendanceCard attendance={data?.attendance} onAction={handleAttendanceAction} />
          
          {/* Team stats and Team Table */}
          <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
            <TeamStats stats={data?.team_stats} />
            <TeamAttendanceTable records={data?.team_attendance || []} />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <MyTasks tasks={data?.tasks} />
          <MyProjects projects={data?.projects} />
        </div>

        <div className="w-full">
          <TaskKanbanBoard />
        </div>
      </div>
    </AppLayout>
  );
}
