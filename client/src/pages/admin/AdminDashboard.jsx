// client/src/pages/admin/AdminDashboard.jsx
// Admin dashboard: attendance summary, today's tasks, kanban board

import { useState, useEffect, useCallback } from 'react';
import AppLayout from '../../components/layout/AppLayout';
import api from '../../api/client';
import { formatTimeIST, todayIST } from '../../utils/time';
import { mapAttendance } from '../../utils/attendance';
import AttendanceCard from '../../components/ui/AttendanceCard';
import toast from 'react-hot-toast';
import TaskModal from '../../components/projects/TaskModal';
import KanbanBoard from '../../components/dashboard/KanbanBoard';

// ── Skeleton loader
function StatSkeleton() {
  return (
    <div className="card">
      <div className="skeleton h-4 w-24 mb-3 rounded" />
      <div className="skeleton h-8 w-12 rounded" />
    </div>
  );
}

// ── Attendance stat cards
function AttendanceStats({ data }) {
  const stats = [
    { label: 'Total Team', value: data?.total ?? '—', color: 'text-[#1A1A1A]', bg: 'bg-[rgba(224,90,30,0.07)]', border: 'border-[rgba(224,90,30,0.18)]' },
    { label: 'Present Today', value: data?.checked_in ?? '—', color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' },
    { label: 'Checked Out', value: data?.checked_out ?? '—', color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200' },
    { label: 'Absent', value: data?.absent ?? '—', color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200' },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((s) => (
        <div key={s.label} className={`card ${s.bg} border ${s.border}`}>
          <p className="text-xs font-medium text-muted mb-2">{s.label}</p>
          <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
        </div>
      ))}
    </div>
  );
}

// ── Project type stats cards
function ProjectTypeStats({ counts }) {
  const stats = [
    { label: 'Construction Projects', value: counts?.construction ?? 0, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200' },
    { label: 'Interior Projects', value: counts?.interior ?? 0, color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-200' },
    { label: 'Liasoning Projects', value: counts?.liaisoning ?? 0, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200' },
    { label: 'Rendering Projects', value: counts?.rendering ?? 0, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((s) => (
        <div key={s.label} className={`card ${s.bg} border ${s.border}`}>
          <p className="text-xs font-medium text-muted mb-2">{s.label}</p>
          <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
        </div>
      ))}
    </div>
  );
}

// ── Financial summary boxes
function FinancialStats({ finances }) {
  const stats = [
    { 
      label: 'Total Project Value', 
      value: finances?.total_amount ?? 0, 
      color: 'text-gray-900', 
      bg: 'bg-gray-50/50', 
      border: 'border-gray-100',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
        </svg>
      )
    },
    { 
      label: 'Billed Amount', 
      value: finances?.billed_amount ?? 0, 
      color: 'text-blue-600', 
      bg: 'bg-blue-50/50', 
      border: 'border-blue-100',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 3h12"></path>
          <path d="M6 8h12"></path>
          <path d="M6 13c6.667 0 6.667-10 0-10"></path>
          <path d="m11 13 6 8"></path>
        </svg>
      )
    },
    { 
      label: 'Received Amount', 
      value: finances?.received_amount ?? 0, 
      color: 'text-emerald-600', 
      bg: 'bg-emerald-50/50', 
      border: 'border-emerald-100',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
          <polyline points="22 4 12 14.01 9 11.01"></polyline>
        </svg>
      )
    },
    { 
      label: 'Pending Amount', 
      value: finances?.pending_amount ?? 0, 
      color: 'text-orange-600', 
      bg: 'bg-orange-50/50', 
      border: 'border-orange-100',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <polyline points="12 6 12 12 16 14"></polyline>
        </svg>
      )
    },
    { 
      label: 'Total Expenses', 
      value: finances?.expense_amount ?? 0, 
      color: 'text-red-600', 
      bg: 'bg-red-50/50', 
      border: 'border-red-100',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 12V8H6a2 2 0 0 1-2-2c0-1.1.9-2 2-2h12v4"></path>
          <path d="M4 6v12c0 1.1.9 2 2 2h14v-4"></path>
          <path d="M18 12a2 2 0 0 0-2 2c0 1.1.9 2 2 2h4v-4h-4z"></path>
        </svg>
      )
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6">
      {stats.map((s) => (
        <div key={s.label} className={`relative overflow-hidden group p-6 rounded-2xl bg-white border ${s.border} shadow-sm hover:shadow-md transition-all duration-300`}>
          <div className={`absolute top-0 right-0 w-24 h-24 -mr-8 -mt-8 rounded-full ${s.bg} opacity-50 group-hover:scale-110 transition-transform duration-500`} />
          
          <div className="relative flex items-center justify-between mb-4">
            <div className={`p-2.5 rounded-xl ${s.bg} ${s.color}`}>
              {s.icon}
            </div>
            <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest group-hover:text-slate-400 transition-colors">Real-time</span>
          </div>

          <div className="relative">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-tight mb-1">{s.label}</p>
            <h3 className={`text-2xl font-black ${s.color} tracking-tight`}>
              ₹{Number(s.value).toLocaleString('en-IN')}
            </h3>
          </div>
          
          <div className={`absolute bottom-0 left-0 w-full h-1 ${s.bg} scale-x-0 group-hover:scale-x-100 origin-left transition-transform duration-500`} />
        </div>
      ))}
    </div>
  );
}


// ── Today's tasks panel
function TodaysTasks({ tasks }) {
  return (
    <div className="card h-full">
      <h3 className="text-base font-semibold text-[#1A1A1A] mb-4">Today's Tasks</h3>
      {tasks?.length === 0 && (
        <p className="text-muted text-sm text-center py-10 opacity-60 italic">No tasks assigned today</p>
      )}
      <div className="space-y-4">
        {tasks?.map((group) => (
          <div key={group.project_id}>
            <a href={`/projects/${group.project_id}`}
              className="text-xs font-semibold text-[#E05A1E] hover:text-[#C94E16] uppercase tracking-wide mb-2 block">
              {group.project_name}
            </a>
            <div className="space-y-2 ml-2">
              {group.tasks.map((t) => (
                <div key={t.id} className="flex items-start gap-3 p-3 rounded-lg bg-[#F5F5F5] border border-[#EBEBEB]">
                  <div className="w-6 h-6 rounded-full bg-[rgba(224,90,30,0.1)] border border-[rgba(224,90,30,0.2)] flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-[10px] text-[#E05A1E] font-bold">
                      {t.assigned_to_name?.charAt(0)}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-medium text-[#1A1A1A]">{t.assigned_to_name}</span>
                      <span className={`badge ${t.status === 'passed' ? 'badge-completed' : t.status === 'done' ? 'badge-completed' : t.status === 'in_progress' ? 'badge-in-progress' : 'badge-pending'}`}>
                        {t.status}
                      </span>
                    </div>
                    <p className="text-xs text-muted mt-1 line-clamp-2">{t.title}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Team Attendance Table
function TeamAttendanceTable({ records }) {
  return (
    <div className="card h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-[#1A1A1A]">Team Status Today</h3>
        <span className="text-[10px] text-muted uppercase tracking-wider font-bold">Real-time</span>
      </div>
      <div className="flex-1 overflow-y-auto scrollbar-thin max-h-[400px]">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-[#F0F0F0]">
              <th className="text-[10px] font-bold text-muted uppercase py-2">Member</th>
              <th className="text-[10px] font-bold text-muted uppercase py-2">Check-In</th>
              <th className="text-[10px] font-bold text-muted uppercase py-2 text-right">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F5F5F5]">
            {records.map((r, i) => {
              const isLate = r.checkIn && new Date(r.checkIn).getHours() >= 10 && new Date(r.checkIn).getMinutes() > 0;
              return (
                <tr key={i} className="group hover:bg-[#FAFAFA] transition-colors">
                  <td className="py-2.5">
                    <p className="text-xs font-bold text-[#1A1A1A] group-hover:text-[#E05A1E] transition-colors">{r.name}</p>
                    <p className="text-[10px] text-muted truncate">{r.role === 'admin' ? 'Admin' : (r.department || 'Staff')}</p>
                  </td>
                  <td className="py-2.5">
                    <p className={`text-xs font-bold ${isLate ? 'text-red-500' : r.checkIn ? 'text-emerald-600' : 'text-muted opacity-40'}`}>
                      {r.checkIn ? formatTimeIST(r.checkIn) : '—'}
                    </p>
                  </td>
                  <td className="py-2.5 text-right">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-tighter shadow-sm border ${
                      r.status === 'working' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                      r.status === 'completed' ? 'bg-blue-50 text-blue-600 border-blue-100' :
                      'bg-red-50 text-red-500 border-red-100'
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
          Open Official Logs 
          <span className="group-hover:translate-x-0.5 transition-transform">→</span>
        </a>
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
        <h3 className="text-lg font-black text-[#1A1A1A]">Task Board (By Employee)</h3>
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

      <TaskModal 
        taskId={selectedTaskId}
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); fetchKanban(); }}
      />
    </div>
  );
}

export default function AdminDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchDashboard = useCallback(async () => {
    try {
      const { data: res } = await api.get('/dashboard/admin');
      const { data: att } = await api.get('/attendance/today');
      
      setData({
        ...res,
        team_attendance: att.attendance.map(mapAttendance),
        my_attendance: mapAttendance(att.my_attendance)
      });
    } catch (err) {
      toast.error('Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleAttendanceAction = () => {
    fetchDashboard();
  };

  useEffect(() => { fetchDashboard(); }, [fetchDashboard]);

  // Auto-refresh every 60s
  useEffect(() => {
    const t = setInterval(fetchDashboard, 60000);
    return () => clearInterval(t);
  }, [fetchDashboard]);

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-[#1A1A1A] tracking-tight">Admin Dashboard</h1>
            <p className="text-muted text-sm font-medium mt-0.5">{todayIST()}</p>
          </div>
          <button
            onClick={fetchDashboard}
            disabled={loading}
            className="btn-secondary disabled:opacity-50"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={loading ? 'animate-spin' : ''}>
              <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
            </svg>
            <span className="text-xs font-bold uppercase">{loading ? 'Refreshing...' : 'Refresh'}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1">
            <AttendanceCard attendance={data?.my_attendance} onAction={handleAttendanceAction} />
          </div>
          <div className="lg:col-span-2">
            {loading ? (
              <div className="grid grid-cols-2 gap-4 h-full">
                {[...Array(4)].map((_, i) => <StatSkeleton key={i} />)}
              </div>
            ) : (
              <div className="flex flex-col gap-4 h-full">
                <AttendanceStats data={data?.attendance} />
                <ProjectTypeStats counts={data?.type_counts} />
              </div>
            )}
          </div>
        </div>

        {/* Financial Summary Section */}
        {!loading && <FinancialStats finances={data?.finances} />}

        {/* Main content grid */}
        <div className="space-y-6">
          <div className="w-full">
            {loading ? (
              <div className="card skeleton h-96 rounded" />
            ) : (
              <KanbanBoard kanban={data?.kanban} />
            )}
          </div>

          <div className="w-full">
            <TaskKanbanBoard />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {loading ? (
              <>
                <div className="card skeleton h-96 rounded" />
                <div className="card skeleton h-96 rounded" />
              </>
            ) : (
              <>
                <TeamAttendanceTable records={data?.team_attendance || []} />
                <TodaysTasks tasks={data?.todays_tasks} />
              </>
            )}
          </div>
        </div>

        {/* Quick links */}
        <div className="grid grid-cols-2 gap-4">
          <a href="/projects"
            className="card flex items-center gap-4 hover:border-[rgba(224,90,30,0.4)] transition-all group cursor-pointer">
            <div className="w-10 h-10 rounded-lg bg-[rgba(224,90,30,0.08)] border border-[rgba(224,90,30,0.18)] flex items-center justify-center flex-shrink-0">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#E05A1E" strokeWidth="2">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-[#1A1A1A] group-hover:text-[#E05A1E] transition-colors">All Projects</p>
              <p className="text-xs text-muted font-medium">{data?.total_projects ?? 0} total projects</p>
            </div>
          </a>
          <a href="/attendance"
            className="card flex items-center gap-4 hover:border-emerald-400 transition-all group cursor-pointer">
            <div className="w-10 h-10 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center flex-shrink-0">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-[#1A1A1A] group-hover:text-emerald-600 transition-colors">Attendance Log</p>
              <p className="text-xs text-muted font-medium">View official team records</p>
            </div>
          </a>
        </div>
      </div>
    </AppLayout>
  );
}
