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
import KanbanBoard from '../../components/dashboard/KanbanBoard';

// --- New Compact Components ---

function QuickStats({ salary, attendance }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div className="bg-white border border-slate-100 p-4 rounded-2xl shadow-sm hover:shadow-md transition-all">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Monthly Earned</p>
        <div className="flex items-baseline gap-1.5">
          <span className="text-xl font-black text-slate-900 font-mono tracking-tight">₹{salary?.earned_this_month ?? 0}</span>
          {salary?.today_earned > 0 && <span className="text-[10px] font-bold text-emerald-500 font-mono">+{salary.today_earned}</span>}
        </div>
      </div>
      <div className="bg-white border border-slate-100 p-4 rounded-2xl shadow-sm hover:shadow-md transition-all">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Monthly Deductions</p>
        <div className="flex items-baseline gap-1.5">
          <span className="text-xl font-black text-red-500 font-mono tracking-tight">₹{salary?.deductions_this_month ?? 0}</span>
          {salary?.today_deductions > 0 && <span className="text-[10px] font-bold text-red-400 font-mono">+{salary.today_deductions}</span>}
        </div>
      </div>
      <div className="bg-emerald-50/50 border border-emerald-100 p-4 rounded-2xl shadow-sm">
        <p className="text-[10px] font-black text-emerald-700/60 uppercase tracking-widest mb-1">Team Present</p>
        <span className="text-xl font-black text-emerald-600 font-mono tracking-tight">{attendance?.present ?? 0}</span>
      </div>
      <div className="bg-red-50/50 border border-red-100 p-4 rounded-2xl shadow-sm">
        <p className="text-[10px] font-black text-red-700/60 uppercase tracking-widest mb-1">Team Absent</p>
        <span className="text-xl font-black text-red-500 font-mono tracking-tight">{attendance?.absent ?? 0}</span>
      </div>
    </div>
  );
}

function AttendanceStatus({ attendance, onAction }) {
  const [loading, setLoading] = useState(false);
  const hasIn = !!attendance?.checkIn;
  const hasOut = !!attendance?.checkOut;

  async function handleCheck(type) {
    setLoading(true);
    try {
      if (type === 'in') {
        let coords = {};
        if (navigator.geolocation) {
          coords = await new Promise((res) => {
            navigator.geolocation.getCurrentPosition(
              (p) => res({ lat: p.coords.latitude, lng: p.coords.longitude }),
              () => res({}),
              { timeout: 5000 }
            );
          });
        }
        await api.post('/attendance/checkin', coords);
        toast.success('Check-in success! 🌅');
      } else {
        await api.post('/attendance/checkout');
        toast.success('Check-out success! 👋');
      }
      onAction();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Operation failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-slate-900 text-white rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-4 shadow-xl">
      <div className="flex items-center gap-4">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 ${hasIn ? 'border-emerald-500/50 text-emerald-500' : 'border-slate-700 text-slate-500'}`}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
        </div>
        <div>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Attendance Status</p>
          <p className="text-xs font-bold uppercase tracking-tight">
            {!hasIn ? 'Not Checked In' : hasOut ? 'Day Completed' : 'Shift Active'}
          </p>
        </div>
        <div className="h-8 w-px bg-slate-800 mx-2 hidden md:block" />
        <div className="hidden md:flex gap-4">
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase">In</p>
            <p className="text-xs font-mono font-black">{hasIn ? formatTimeIST(attendance.checkIn) : '--:--'}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase">Out</p>
            <p className="text-xs font-mono font-black">{hasOut ? formatTimeIST(attendance.checkOut) : '--:--'}</p>
          </div>
        </div>
      </div>

      <div className="flex gap-2 w-full md:w-auto">
        <button 
          onClick={() => handleCheck('in')}
          disabled={hasIn || loading}
          className="flex-1 md:flex-none px-6 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-black uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-emerald-500/20"
        >
          {loading && !hasIn ? '...' : 'Check In'}
        </button>
        <button 
          onClick={() => handleCheck('out')}
          disabled={!hasIn || hasOut || loading}
          className="flex-1 md:flex-none px-6 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-white text-xs font-black uppercase tracking-widest rounded-xl transition-all"
        >
          {loading && hasIn ? '...' : 'Check Out'}
        </button>
      </div>
    </div>
  );
}

function TeamAttendanceCompact({ records }) {
  return (
    <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest">Team Today</h3>
        <span className="text-[10px] font-bold text-emerald-500 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">Live</span>
      </div>
      <div className="space-y-2 max-h-[180px] overflow-y-auto pr-1 custom-scrollbar">
        {records.map(r => (
          <div key={r.id} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-none">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center">
                <span className="text-[10px] font-bold text-slate-400">{r.name.charAt(0)}</span>
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-bold text-slate-800 truncate">{r.name.split(' ')[0]}</p>
                <p className="text-[9px] text-slate-400 truncate uppercase">{r.department || 'Staff'}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-mono font-black text-slate-600">{r.checkIn ? formatTimeIST(r.checkIn) : '--:--'}</p>
              <span className={`text-[8px] font-bold uppercase ${r.status === 'working' ? 'text-emerald-500' : 'text-slate-300'}`}>
                {r.status === 'working' ? 'Present' : 'Away'}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MyTasksTable({ tasks }) {
  if (!tasks || tasks.length === 0) {
    return (
      <div className="bg-white border border-slate-100 rounded-2xl p-8 text-center shadow-sm">
        <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-3">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-300">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
        </div>
        <p className="text-sm font-bold text-slate-900">No active tasks</p>
        <p className="text-xs text-slate-400 mt-1">You're all caught up for now!</p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-50 flex items-center justify-between">
        <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest">My Assigned Tasks</h3>
        <span className="text-[10px] font-bold text-[#E05A1E] bg-orange-50 px-2 py-0.5 rounded-full border border-orange-100">
          {tasks.length} Active
        </span>
      </div>
      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50/50">
              <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Project</th>
              <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Task Details</th>
              <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right">Time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {tasks.map((task) => (
              <tr key={task.id} className="group hover:bg-slate-50/50 transition-colors cursor-pointer" onClick={() => window.location.href=`/projects/${task.project_id}`}>
                <td className="px-6 py-4">
                  <p className="text-[11px] font-black text-[#E05A1E] uppercase tracking-tight">{task.project_name}</p>
                </td>
                <td className="px-6 py-4 min-w-[200px]">
                  <p className="text-xs font-bold text-slate-800 line-clamp-1">{task.message}</p>
                </td>
                <td className="px-6 py-4">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest border ${
                    task.task_status === 'completed' ? 'bg-emerald-50 border-emerald-100 text-emerald-600' :
                    task.task_status === 'in_progress' ? 'bg-amber-50 border-amber-100 text-amber-600' :
                    'bg-slate-100 border-slate-200 text-slate-500'
                  }`}>
                    {task.task_status}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <span className="text-[10px] font-bold text-slate-400">{timeAgo(task.created_at)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
      <div className="space-y-6 max-w-[1600px] mx-auto">
        {/* Header Section */}
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6">
          <div className="min-w-0">
            <h1 className="text-2xl font-black text-slate-900 tracking-tight leading-none mb-2">
              Hey, {user?.name?.split(' ')[0]}!
            </h1>
            <p className="text-[11px] font-black text-emerald-500 uppercase tracking-widest flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Production Active • {todayIST()}
            </p>
          </div>
          
          <div className="flex-1 max-w-4xl">
            <AttendanceStatus 
              attendance={data?.attendance} 
              onAction={fetchData} 
            />
          </div>
        </div>

        {/* Stats & Team Section */}
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
          <div className="xl:col-span-3 space-y-6">
            <QuickStats 
              salary={data?.salary_stats} 
              attendance={data?.attendance_stats} 
            />
            <MyTasksTable tasks={data?.tasks} />
          </div>
          <div className="xl:col-span-1">
            <TeamAttendanceCompact records={data?.team_attendance || []} />
          </div>
        </div>

        {/* Main Content: Kanban Boards */}
        <div className="space-y-8">
          <div className="relative">
            <div className="absolute -left-4 top-0 bottom-0 w-1 bg-[#E05A1E] rounded-full hidden lg:block" />
            <h2 className="text-xl font-black text-slate-900 tracking-tight mb-4 flex items-center gap-3">
              Project Pipeline
              <span className="text-[10px] px-2 py-0.5 bg-slate-100 text-slate-400 rounded-full font-bold">Live Status</span>
            </h2>
            <KanbanBoard kanban={data?.kanban} />
          </div>

          <div className="relative">
            <div className="absolute -left-4 top-0 bottom-0 w-1 bg-slate-900 rounded-full hidden lg:block" />
            <h2 className="text-xl font-black text-slate-900 tracking-tight mb-4 flex items-center gap-3">
              Employee Tasks
              <span className="text-[10px] px-2 py-0.5 bg-slate-100 text-slate-400 rounded-full font-bold">Internal</span>
            </h2>
            <TaskKanbanBoard />
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
