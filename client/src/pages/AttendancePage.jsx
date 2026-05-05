import { useState, useEffect, useCallback, useMemo } from 'react';
import AppLayout from '../components/layout/AppLayout';
import api from '../api/client';
import { formatTimeIST, formatDateIST, todayIST } from '../utils/time';
import { mapAttendance } from '../utils/attendance';
import AttendanceCard from '../components/ui/AttendanceCard';
import toast from 'react-hot-toast';
import { UserCheck, UserX, CalendarOff, Clock, UserMinus } from 'lucide-react';
import { ATTENDANCE_STATUS, VIEW_MODES } from '../config/constants';

function AttendanceBadge({ status, checkIn, checkOut, settings }) {
  const officeStartTimeStr = settings?.office_start_time || '09:30';
  const lateThresholdMins = parseInt(settings?.late_threshold_mins || 15);
  const halfDayThresholdHours = parseFloat(settings?.half_day_threshold_hours || 4);

  let isLate = false;
  if (checkIn) {
    const checkInTime = new Date(checkIn);
    const [startH, startM] = officeStartTimeStr.split(':').map(Number);
    const officeStart = new Date(checkInTime);
    officeStart.setHours(startH, startM, 0, 0);
    const diffMins = (checkInTime - officeStart) / (1000 * 60);
    isLate = diffMins > lateThresholdMins;
  }

  const hoursWorked = checkIn && checkOut ? (new Date(checkOut) - new Date(checkIn)) / (1000 * 60 * 60) : 0;
  const isHalfDay = checkIn && checkOut && hoursWorked > 0 && hoursWorked < halfDayThresholdHours;

  if (isHalfDay) {
    return <span className="badge bg-sky-50 text-sky-600 border-sky-200 font-bold">◑ Half Day</span>;
  }
  if (status === 'working' || status === 'completed') {
    return (
      <span className={`badge ${isLate ? 'bg-red-50 text-red-600 border-red-200' : 'badge-working'}`}>
        ● {isLate ? 'Late Arrival' : 'Present'}
      </span>
    );
  }
  return <span className="badge badge-absent text-red-600">Absent</span>;
}

export default function AttendancePage() {
  const [records, setRecords] = useState([]);
  const [myRecord, setMyRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState(VIEW_MODES.TODAY); 
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showMarkForm, setShowMarkForm] = useState(false);
  const [historyView, setHistoryView] = useState(VIEW_MODES.CALENDAR); 
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState('');
  const [settings, setSettings] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all'); 
  const [showLeaveForm, setShowLeaveForm] = useState(false);
  const [leaves, setLeaves] = useState([]);
  const [leaveLoading, setLeaveLoading] = useState(false);
  const [leaveStatusFilter, setLeaveStatusFilter] = useState('all');
  const [leaveForm, setLeaveForm] = useState({ start_date: '', end_date: '', type: 'casual', reason: '' });
  const [manualForm, setManualForm] = useState({ 
    user_id: '', 
    date: todayIST(), 
    check_in: '', 
    check_out: '', 
    status: ATTENDANCE_STATUS.WORKING,
    is_late: false,
    late_minutes: 0
  });

  // Fetch settings
  useEffect(() => {
    api.get('/settings/app')
      .then(({ data }) => setSettings(data))
      .catch(err => console.error('Failed to load settings', err));
  }, []);

  // Fetch full team member list on mount
  useEffect(() => {
    api.get('/attendance/today')
      .then(({ data }) => {
        const userList = (data.attendance || []).map(r => ({
          id: r.user_id,
          name: r.name,
          role: r.role,
          department: r.department
        }));
        setUsers(userList);
      })
      .catch(err => console.error('Failed to load users', err));
  }, []);

  // Sync date range filters with the visible calendar month
  useEffect(() => {
    if (view === VIEW_MODES.HISTORY && historyView === VIEW_MODES.CALENDAR) {
      const firstDay = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-01`;
      const lastDay = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(new Date(currentYear, currentMonth + 1, 0).getDate()).padStart(2, '0')}`;
      setDateFrom(firstDay);
      setDateTo(lastDay);
    }
  }, [currentMonth, currentYear, view, historyView]);

  // Group records by local date string
  const recordsByDate = useMemo(() => {
    const mapping = {};
    records.forEach(r => {
      if (!r.date) return;
      const dateObj = new Date(r.date);
      const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' });
      const dateStr = formatter.format(dateObj);
      
      if (!mapping[dateStr]) mapping[dateStr] = [];
      mapping[dateStr].push(r);
    });
    return mapping;
  }, [records]);

  // Filter records based on selected user and status
  const filteredRecords = useMemo(() => {
    let filtered = records;
    if (selectedUser) {
      const userId = parseInt(selectedUser);
      filtered = filtered.filter(r => r.user_id === userId);
    }
    
    if (statusFilter !== 'all') {
      if (statusFilter === ATTENDANCE_STATUS.PRESENT) {
        filtered = filtered.filter(r => r.checkIn);
      } else if (statusFilter === 'late') {
        filtered = filtered.filter(r => r.is_late);
      } else if (statusFilter === ATTENDANCE_STATUS.HALF_DAY) {
        filtered = filtered.filter(r => r.status === ATTENDANCE_STATUS.HALF_DAY);
      } else if (statusFilter === ATTENDANCE_STATUS.ABSENT) {
        filtered = filtered.filter(r => r.status === ATTENDANCE_STATUS.ABSENT);
      } else if (statusFilter === ATTENDANCE_STATUS.LEAVE) {
        filtered = filtered.filter(r => r.status === ATTENDANCE_STATUS.LEAVE);
      }
    }
    
    return filtered;
  }, [records, selectedUser, statusFilter]);

  // Generate complete calendar grid cells
  const cells = useMemo(() => {
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const firstDayIndex = new Date(currentYear, currentMonth, 1).getDay();
    
    const tempCells = [];
    for (let i = 0; i < firstDayIndex; i++) {
      tempCells.push({ empty: true });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      tempCells.push({ day: d });
    }
    
    const totalCells = Math.ceil((firstDayIndex + daysInMonth) / 7) * 7;
    for (let i = tempCells.length; i < totalCells; i++) {
      tempCells.push({ empty: true });
    }
    return tempCells;
  }, [currentMonth, currentYear]);

  const fetchToday = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/attendance/today');
      // Backend now returns { attendance: [], my_attendance: {} }
      const mapped = (data.attendance || []).map(mapAttendance);
      // Competitive Sort: Earliest check-in first, then alphabet
      mapped.sort((a, b) => {
        if (a.checkIn && b.checkIn) return new Date(a.checkIn) - new Date(b.checkIn);
        if (a.checkIn) return -1;
        if (b.checkIn) return 1;
        return a.name.localeCompare(b.name);
      });
      setRecords(mapped);
      setMyRecord(mapAttendance(data.my_attendance));
    } catch {
      toast.error('Failed to load attendance');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      let url = '/attendance/all?limit=200';
      if (dateFrom && dateTo) url += `&from=${dateFrom}&to=${dateTo}`;
      const { data } = await api.get(url);
      setRecords((data.attendance || []).map(mapAttendance));
    } catch {
      toast.error('Failed to load attendance');
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo]);

  const fetchLeaves = useCallback(async () => {
    try {
      setLeaveLoading(true);
      const { data } = await api.get('/leaves');
      setLeaves(data.leaves || []);
    } catch {
      toast.error('Failed to load leaves');
    } finally {
      setLeaveLoading(false);
    }
  }, []);

  useEffect(() => {
    if (view === VIEW_MODES.TODAY) fetchToday();
    else if (view === VIEW_MODES.HISTORY) fetchAll();
    else if (view === 'leaves') fetchLeaves();
  }, [view, fetchToday, fetchAll, fetchLeaves]);

  // Summary calculation for the current view
  const summary = useMemo(() => {
    if (!records.length) return null;
    
    // We base the total on the employee filter but NOT the status filter 
    // so percentages remain meaningful relative to the whole team/employee
    const baseRecords = selectedUser ? records.filter(r => r.user_id === parseInt(selectedUser)) : records;
    if (!baseRecords.length) return null;

    const counts = {
      present: baseRecords.filter(r => r.checkIn).length,
      late: baseRecords.filter(r => r.is_late).length,
      halfDay: baseRecords.filter(r => r.status === ATTENDANCE_STATUS.HALF_DAY).length,
      absent: baseRecords.filter(r => r.status === ATTENDANCE_STATUS.ABSENT).length,
      leave: baseRecords.filter(r => r.status === ATTENDANCE_STATUS.LEAVE).length,
      total: baseRecords.length
    };

    const getPct = (val) => Math.round((val / counts.total) * 100) || 0;

    return {
      ...counts,
      percentages: {
        present: getPct(counts.present),
        late: getPct(counts.late),
        halfDay: getPct(counts.halfDay),
        absent: getPct(counts.absent),
        leave: getPct(counts.leave)
      }
    };
  }, [records, selectedUser]);

  const leaveSummary = useMemo(() => {
    if (!leaves.length) return { pending: 0, approved: 0, rejected: 0 };
    return {
      pending: leaves.filter(l => l.status === 'pending').length,
      approved: leaves.filter(l => l.status === 'approved').length,
      rejected: leaves.filter(l => l.status === 'rejected').length,
      total: leaves.length
    };
  }, [leaves]);

  const filteredLeaves = useMemo(() => {
    if (leaveStatusFilter === 'all') return leaves;
    return leaves.filter(l => l.status === leaveStatusFilter);
  }, [leaves, leaveStatusFilter]);

  async function handleManualMark(e) {
    e.preventDefault();
    try {
      await api.post('/attendance/manual', manualForm);
      toast.success('Attendance updated successfully');
      setShowMarkForm(false);
      if (view === VIEW_MODES.TODAY) fetchToday();
      else fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update attendance');
    }
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-black text-[#1A1A1A] tracking-tight">Team Attendance</h1>
            <p className="text-muted text-sm font-medium">{todayIST()}</p>
          </div>
           <div className="flex items-center gap-3">
             <button
                onClick={() => setShowLeaveForm(true)}
                className="btn-secondary"
              >
                Apply Leave
              </button>
             <button
              onClick={() => setShowMarkForm(!showMarkForm)}
              className="btn-primary"
            >
              {showMarkForm ? 'Close Marker' : 'Mark Attendance'}
            </button>
            <div className="bg-[#F0F0F0] p-1 rounded-lg flex">
              <button
                onClick={() => setView(VIEW_MODES.TODAY)}
                className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${view === VIEW_MODES.TODAY ? 'bg-white text-[#E05A1E] shadow-sm' : 'text-muted hover:text-[#1A1A1A]'}`}
              >TODAY</button>
              <button
                onClick={() => setView(VIEW_MODES.HISTORY)}
                className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${view === VIEW_MODES.HISTORY ? 'bg-white text-[#E05A1E] shadow-sm' : 'text-muted hover:text-[#1A1A1A]'}`}
              >HISTORY</button>
               <button
                onClick={() => setView('leaves')}
                className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${view === 'leaves' ? 'bg-white text-[#E05A1E] shadow-sm' : 'text-muted hover:text-[#1A1A1A]'}`}
              >LEAVES</button>
            </div>
          </div>
        </div>

        {/* Legend */}
        {view !== 'leaves' && (
          <div className="flex flex-wrap gap-x-6 gap-y-2 px-1">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-50 border border-emerald-500" />
            <span className="text-[10px] font-black text-muted uppercase tracking-wider">Present</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-amber-50 border border-amber-500" />
            <span className="text-[10px] font-black text-muted uppercase tracking-wider">Late Arrival</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-sky-50 border border-sky-500" />
            <span className="text-[10px] font-black text-muted uppercase tracking-wider">Half Day</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-red-50 border border-red-500" />
            <span className="text-[10px] font-black text-muted uppercase tracking-wider">Absent</span>
          </div>
        </div>
      )}

        {showMarkForm && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-in fade-in slide-in-from-top-4 duration-300">
            <div className="lg:col-span-4 h-full">
              <AttendanceCard attendance={myRecord} onAction={(r) => { setMyRecord(r); fetchToday(); }} />
            </div>
            
            {settings?.role === 'admin' && (
              <div className="lg:col-span-8">
                <div className="card h-full">
                  <div className="flex items-center gap-2 mb-4">
                     <div className="w-8 h-8 rounded-lg bg-[#E05A1E]/10 flex items-center justify-center text-[#E05A1E]">
                      <Clock size={18} />
                     </div>
                     <h3 className="text-base font-black text-[#1A1A1A]">Admin Manual Marker</h3>
                  </div>
                  
                  <form onSubmit={handleManualMark} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="label">Select Employee</label>
                      <select required className="input text-xs font-bold" value={manualForm.user_id} onChange={e => setManualForm({...manualForm, user_id: e.target.value})}>
                        <option value="">Choose User...</option>
                        {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="label">Date</label>
                      <input type="date" required className="input text-xs" value={manualForm.date} onChange={e => setManualForm({...manualForm, date: e.target.value})} />
                    </div>
                    <div>
                      <label className="label">Check-In Time</label>
                      <input type="datetime-local" className="input text-xs" value={manualForm.check_in} onChange={e => setManualForm({...manualForm, check_in: e.target.value})} />
                    </div>
                     <div>
                      <label className="label">Check-Out Time</label>
                      <input type="datetime-local" className="input text-xs" value={manualForm.check_out} onChange={e => setManualForm({...manualForm, check_out: e.target.value})} />
                    </div>
                    <div>
                      <label className="label">Base Status</label>
                      <select className="input text-xs font-bold" value={manualForm.status} onChange={e => setManualForm({...manualForm, status: e.target.value})}>
                        {Object.values(ATTENDANCE_STATUS).map(s => <option key={s} value={s}>{s.toUpperCase()}</option>)}
                      </select>
                    </div>
                    <div className="flex items-end pb-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" className="w-4 h-4 rounded border-slate-300 text-[#E05A1E] focus:ring-[#E05A1E]" checked={manualForm.is_late} onChange={e => setManualForm({...manualForm, is_late: e.target.checked})} />
                        <span className="text-xs font-bold text-[#1A1A1A]">Mark as Late</span>
                      </label>
                    </div>
                    <div className="md:col-span-2 flex justify-end gap-3 mt-2">
                      <button type="button" onClick={() => setShowMarkForm(false)} className="px-4 py-2 text-xs font-bold text-muted hover:text-[#1A1A1A] transition-colors" >Cancel</button>
                      <button type="submit" className="btn-primary">Update Attendance</button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Optimized Summary Cards (Interactive Filtering) */}
        {view !== 'leaves' && summary && (
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            {[
              { id: ATTENDANCE_STATUS.PRESENT, label: 'Present', count: summary.present, pct: summary.percentages.present, icon: UserCheck, color: 'emerald' },
              { id: 'late', label: 'Late', count: summary.late, pct: summary.percentages.late, icon: Clock, color: 'amber' },
              { id: ATTENDANCE_STATUS.HALF_DAY, label: 'Half Day', count: summary.halfDay, pct: summary.percentages.halfDay, icon: UserMinus, color: 'sky' },
              { id: ATTENDANCE_STATUS.ABSENT, label: 'Absent', count: summary.absent, pct: summary.percentages.absent, icon: UserX, color: 'red' },
              { id: ATTENDANCE_STATUS.LEAVE, label: 'Leave', count: summary.leave, pct: summary.percentages.leave, icon: CalendarOff, color: 'violet' }
            ].map(card => (
              <div 
                key={card.id}
                onClick={() => setStatusFilter(statusFilter === card.id ? 'all' : card.id)}
                className={`card cursor-pointer transition-all duration-300 flex items-center gap-4 py-4 px-5 group 
                           ${statusFilter === card.id ? 'ring-2 ring-[#E05A1E] ring-offset-2 scale-[1.02] shadow-lg' : 'hover:shadow-md hover:scale-[1.01]'} 
                           bg-${card.color}-50 border-${card.color}-100`}
              >
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-110 
                                bg-${card.color}-100 text-${card.color}-600`}>
                  <card.icon size={24} strokeWidth={2.5} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-[10px] font-black uppercase tracking-wider text-${card.color}-700 truncate`}>
                    {card.label}
                  </p>
                  <div className="flex items-baseline gap-2">
                    <p className={`text-2xl font-black text-${card.color}-600`}>{card.count}</p>
                    <span className={`text-[10px] font-bold text-${card.color}-500 opacity-60`}>({card.pct}%)</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Filters */}
        {view === VIEW_MODES.HISTORY && (
          <div className="card flex items-center justify-between flex-wrap bg-[#F9F9F9] py-3">
             {historyView === VIEW_MODES.CALENDAR ? (
               <div className="flex items-center gap-4">
                 <button 
                   onClick={() => {
                     if (currentMonth === 0) {
                       setCurrentMonth(11);
                       setCurrentYear(prev => prev - 1);
                     } else {
                       setCurrentMonth(prev => prev - 1);
                     }
                   }}
                   className="px-3 py-1 text-xs font-bold rounded-md bg-white border border-[#E0E0E0] text-[#1A1A1A] hover:bg-[#F5F5F5] transition-colors"
                 >
                   &larr; Prev
                 </button>
                 <span className="text-sm font-bold text-[#1A1A1A] min-w-[120px] text-center">
                   {new Date(currentYear, currentMonth).toLocaleString('en-IN', { month: 'long', year: 'numeric' })}
                 </span>
                 <button 
                   onClick={() => {
                     if (currentMonth === 11) {
                       setCurrentMonth(0);
                       setCurrentYear(prev => prev + 1);
                     } else {
                       setCurrentMonth(prev => prev + 1);
                     }
                   }}
                   className="px-3 py-1 text-xs font-bold rounded-md bg-white border border-[#E0E0E0] text-[#1A1A1A] hover:bg-[#F5F5F5] transition-colors"
                 >
                   Next &rarr;
                 </button>
               </div>
             ) : (
               <div className="flex items-center gap-2 flex-wrap">
                 <span className="text-xs font-bold text-muted uppercase">Filter:</span>
                 <input type="date" className="input py-1.5 w-auto" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                 <span className="text-muted text-xs">to</span>
                 <input type="date" className="input py-1.5 w-auto" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                 <button onClick={fetchAll} className="btn-primary py-1.5">Apply</button>
                 <button onClick={() => { setDateFrom(''); setDateTo(''); }} className="btn-secondary py-1.5">Clear</button>
               </div>
             )}

             <div className="flex items-center gap-2 mt-2 sm:mt-0">
               <span className="text-xs font-bold text-muted uppercase">Employee:</span>
               <select 
                 value={selectedUser} 
                 onChange={(e) => setSelectedUser(e.target.value)}
                 className="px-3 py-1.5 text-xs font-bold rounded-md bg-white border border-[#E0E0E0] text-[#1A1A1A] focus:outline-none focus:border-[#E05A1E] transition-colors"
               >
                 <option value="">All Team Members</option>
                 {users.map(u => (
                   <option key={u.id} value={u.id}>{u.name}</option>
                 ))}
               </select>
             </div>

             <div className="bg-[#F0F0F0] p-1 rounded-lg flex mt-2 sm:mt-0">
               <button
                 onClick={() => setHistoryView('calendar')}
                 className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${historyView === 'calendar' ? 'bg-white text-[#E05A1E] shadow-sm' : 'text-muted hover:text-[#1A1A1A]'}`}
               >CALENDAR</button>
               <button
                 onClick={() => setHistoryView('table')}
                 className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${historyView === 'table' ? 'bg-white text-[#E05A1E] shadow-sm' : 'text-muted hover:text-[#1A1A1A]'}`}
               >TABLE</button>
             </div>
          </div>
        )}

        {/* Calendar or Table View */}
        {view !== 'leaves' && (
          view === VIEW_MODES.HISTORY && historyView === VIEW_MODES.CALENDAR ? (
          <div className="card p-4 bg-white shadow-sm">
            {/* Weekdays Header */}
            <div className="grid grid-cols-7 gap-2 mb-2 text-center">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                <div key={day} className="text-xs font-black text-muted uppercase tracking-widest py-2">
                  {day}
                </div>
              ))}
            </div>
            
            {/* Days Grid */}
            <div className="grid grid-cols-7 gap-3">
              {cells.map((cell, index) => {
                if (cell.empty) {
                  return <div key={index} className="min-h-[120px] bg-[#FAFAFA] rounded-xl border border-dashed border-[#F0F0F0]" />;
                }
                
                const d = cell.day;
                const cellDateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                const dayRecords = recordsByDate[cellDateStr] || [];
                
                // Check if this date is in the future
                const today = new Date();
                today.setHours(0,0,0,0);
                const cellDate = new Date(currentYear, currentMonth, d);
                const isFuture = cellDate > today;

                return (
                  <div 
                    key={index} 
                    className="min-h-[120px] bg-white rounded-xl border border-[#F0F0F0] p-3 flex flex-col justify-between hover:border-[#E0E0E0] transition-all group shadow-sm hover:shadow-md"
                  >
                    <span className="text-sm font-black text-[#1A1A1A] group-hover:text-[#E05A1E] transition-colors">
                      {d}
                    </span>
                    
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {!isFuture && (selectedUser ? users.filter(u => u.id === parseInt(selectedUser)) : users).map(u => {
                        const record = dayRecords.find(r => r.user_id === u.id);
                        const isPresent = record && (record.status === ATTENDANCE_STATUS.WORKING || record.status === ATTENDANCE_STATUS.COMPLETED);
                        
                        let statusText = 'Absent';
                        let styleClass = 'bg-red-50 text-red-700 border-red-500 hover:bg-red-100 hover:scale-105';
                        let cellIsLate = false;
                        let cellIsHalfDay = false;
                        
                        if (isPresent) {
                          const checkInTime = new Date(record.checkIn);
                          const officeStartTimeStr = settings?.office_start_time || '09:30';
                          const lateThresholdMins = parseInt(settings?.late_threshold_mins || 15);
                          const halfDayThresholdHours = parseFloat(settings?.half_day_threshold_hours || 4);

                          const [startH, startM] = officeStartTimeStr.split(':').map(Number);
                          const officeStart = new Date(checkInTime);
                          officeStart.setHours(startH, startM, 0, 0);
                          const diffMins = (checkInTime - officeStart) / (1000 * 60);
                          cellIsLate = diffMins > lateThresholdMins;

                          const cellHoursWorked = record.checkIn && record.checkOut 
                            ? (new Date(record.checkOut) - new Date(record.checkIn)) / (1000 * 60 * 60) 
                            : 0;
                          cellIsHalfDay = record.checkIn && record.checkOut && cellHoursWorked > 0 && cellHoursWorked < halfDayThresholdHours;

                          if (cellIsHalfDay) {
                            statusText = 'Half Day';
                            styleClass = 'bg-sky-50 text-sky-700 border-sky-500 hover:bg-sky-100 hover:scale-105';
                          } else if (cellIsLate) {
                            statusText = 'Present (Late)';
                            styleClass = 'bg-amber-50 text-amber-700 border-amber-500 hover:bg-amber-100 hover:scale-105';
                          } else {
                            statusText = 'Present';
                            styleClass = 'bg-emerald-50 text-emerald-700 border-emerald-500 hover:bg-emerald-100 hover:scale-105';
                          }
                        } else if (record?.status === ATTENDANCE_STATUS.LEAVE) {
                          statusText = 'Leave';
                          styleClass = 'bg-violet-50 text-violet-700 border-violet-500 hover:bg-violet-100 hover:scale-105';
                        }

                        // Filter dots based on statusFilter
                        if (statusFilter !== 'all') {
                          let matches = false;
                          if (statusFilter === ATTENDANCE_STATUS.PRESENT) matches = isPresent;
                          else if (statusFilter === 'late') matches = cellIsLate;
                          else if (statusFilter === ATTENDANCE_STATUS.HALF_DAY) matches = cellIsHalfDay;
                          else if (statusFilter === ATTENDANCE_STATUS.ABSENT) matches = statusText === 'Absent';
                          else if (statusFilter === ATTENDANCE_STATUS.LEAVE) matches = statusText === 'Leave';
                          
                          if (!matches) return null;
                        }
                        
                        const initials = u.name.split(' ').map(n => n[0]).join('').toUpperCase();
                        
                        return (
                          <div 
                            key={u.id}
                            title={`${u.name} (${statusText})`}
                            className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all border cursor-help ${styleClass}`}
                          >
                            {initials}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="card p-0 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-[#FAFAFA] border-b border-[#E0E0E0]">
                    <th className="px-5 py-4 text-[11px] font-black text-muted uppercase tracking-widest">Team Member</th>
                    {view === 'all' && <th className="px-5 py-4 text-[11px] font-black text-muted uppercase tracking-widest">Date</th>}
                    <th className="px-5 py-4 text-[11px] font-black text-muted uppercase tracking-widest">In / Out</th>
                    <th className="px-5 py-4 text-[11px] font-black text-muted uppercase tracking-widest">Status</th>
                    <th className="px-5 py-4 text-[11px] font-black text-muted uppercase tracking-widest text-right">Geo Zone</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F0F0F0]">
                  {loading ? (
                    [...Array(6)].map((_, i) => (
                      <tr key={i}><td colSpan={6} className="px-5 py-4"><div className="skeleton h-8 w-full rounded" /></td></tr>
                    ))
                  ) : filteredRecords.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-5 py-12 text-center">
                        <p className="text-muted font-medium italic">No attendance records found for this period.</p>
                      </td>
                    </tr>
                  ) : filteredRecords.map((r, i) => {
                    const isLate = r.is_late;
                    return (
                      <tr key={i} className="group hover:bg-[#FDFDFD] transition-colors">
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${r.role === 'admin' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}>
                              {r.name.charAt(0)}
                            </div>
                            <div>
                              <p className="text-sm font-bold text-[#1A1A1A] group-hover:text-[#E05A1E] transition-colors">{r.name}</p>
                              <p className="text-[10px] text-muted font-bold uppercase tracking-tighter">{r.department || (r.role === 'admin' ? 'Management' : 'Staff')}</p>
                            </div>
                          </div>
                        </td>
                        {view === VIEW_MODES.HISTORY && <td className="px-5 py-4 text-sm font-medium text-[#1A1A1A]">{formatDateIST(r.date)}</td>}
                        <td className="px-5 py-4">
                          <div className="flex flex-col">
                            <span className={`text-xs font-black ${r.checkIn ? 'text-emerald-600' : 'text-muted'}`}>
                              {r.checkIn ? `IN: ${formatTimeIST(r.checkIn)}` : 'NOT CHECKED IN'}
                            </span>
                            {r.checkOut && (
                              <span className="text-[10px] font-bold text-blue-600">OUT: {formatTimeIST(r.checkOut)}</span>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <AttendanceBadge status={r.status} checkIn={r.checkIn} checkOut={r.checkOut} settings={settings} />
                        </td>
                        <td className="px-5 py-4 text-right">
                          {r.checkin_zone ? (
                            <div className="flex flex-col items-end gap-1">
                              {/* Zone Badge */}
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest border ${
                                r.checkin_zone === 'strict'  ? 'bg-emerald-50 text-emerald-600 border-emerald-200' :
                                r.checkin_zone === 'buffer'  ? 'bg-amber-50 text-amber-600 border-amber-200' :
                                                               'bg-red-50 text-red-600 border-red-200'
                              }`}>
                                {r.checkin_zone === 'strict'  ? '● Inside' :
                                 r.checkin_zone === 'buffer'  ? '⚠ Boundary' : '✕ Outside'}
                                {r.checkin_distance != null && (
                                  <span className="font-mono opacity-70">· {r.checkin_distance}m</span>
                                )}
                              </span>
                              {/* Accuracy */}
                              {r.checkin_accuracy != null && (
                                <span className="text-[9px] font-mono text-slate-400">±{Math.round(r.checkin_accuracy)}m GPS</span>
                              )}
                              {/* Boundary flag */}
                              {r.is_boundary_checkin && (
                                <span className="text-[9px] text-amber-500 font-bold">GPS Variance</span>
                              )}
                              {/* Checkout outside flag */}
                              {r.checkout_outside_zone && (
                                <span className="text-[9px] text-red-500 font-bold">↩ Out: Outside Office</span>
                              )}
                            </div>
                          ) : r.lat ? (
                            <span className="text-[10px] font-mono text-muted bg-[#F5F5F5] px-2 py-0.5 rounded border border-[#E0E0E0]">
                              {parseFloat(r.lat).toFixed(4)}, {parseFloat(r.lng).toFixed(4)}
                            </span>
                          ) : (
                            <span className="text-[10px] text-muted font-bold italic opacity-30">No Geodata</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}

        {view === 'leaves' && (
          <div className="space-y-6 animate-in fade-in duration-500">
            {/* Leave Header & Stats */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
               <div>
                  <h3 className="text-xl font-black text-[#1A1A1A] tracking-tight">
                    {settings?.role === 'admin' ? 'Leave Management' : 'My Leave Requests'}
                  </h3>
                  <p className="text-xs font-medium text-muted uppercase tracking-widest mt-1">
                    {leaveSummary.pending} Pending Review • {leaveSummary.approved} Approved
                  </p>
               </div>
               
               <div className="flex items-center gap-2 bg-[#F0F0F0] p-1 rounded-xl border border-[#E0E0E0]">
                  {['all', 'pending', 'approved', 'rejected'].map(stat => (
                    <button
                      key={stat}
                      onClick={() => setLeaveStatusFilter(stat)}
                      className={`px-4 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${
                        leaveStatusFilter === stat ? 'bg-white text-[#E05A1E] shadow-sm' : 'text-muted hover:text-[#1A1A1A]'
                      }`}
                    >
                      {stat}
                    </button>
                  ))}
               </div>
            </div>

            {/* Leave Request Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {leaveLoading ? (
                Array(3).fill(0).map((_, i) => <div key={i} className="card skeleton h-48 rounded-2xl" />)
              ) : filteredLeaves.length === 0 ? (
                <div className="col-span-full py-20 text-center flex flex-col items-center">
                   <div className="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center text-slate-300 mb-4 border border-slate-100">
                      <CalendarOff size={32} />
                   </div>
                   <p className="text-sm font-bold text-slate-400 italic">No leave applications found matching your filter.</p>
                </div>
              ) : filteredLeaves.map((l) => (
                <div key={l.id} className="card group hover:border-[#E05A1E]/30 hover:shadow-xl transition-all duration-300 p-5 border-slate-200 relative overflow-hidden rounded-2xl flex flex-col justify-between">
                  {/* Status Indicator Bar */}
                  <div className={`absolute top-0 left-0 w-1.5 h-full ${
                    l.status === 'approved' ? 'bg-emerald-500' :
                    l.status === 'rejected' ? 'bg-red-500' :
                    'bg-amber-400'
                  }`} />
                  
                  <div>
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600 text-sm font-black uppercase">
                          {l.user_name?.split(' ').map(n => n[0]).join('') || 'ME'}
                        </div>
                        <div>
                          <p className="text-sm font-black text-[#1A1A1A]">{l.user_name || 'My Application'}</p>
                          <p className="text-[10px] text-muted font-bold uppercase tracking-tighter">{l.department || 'Employee'}</p>
                        </div>
                      </div>
                      <span className={`px-2 py-1 rounded-lg border text-[9px] font-black uppercase tracking-widest ${
                        l.status === 'approved' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                        l.status === 'rejected' ? 'bg-red-50 text-red-600 border-red-100' :
                        'bg-amber-50 text-amber-600 border-amber-100'
                      }`}>
                        {l.status}
                      </span>
                    </div>

                    <div className="space-y-3 mb-6">
                      <div className="flex items-center gap-4">
                        <div className="flex-1">
                           <p className="text-[9px] font-black text-muted uppercase tracking-widest mb-0.5">Start Date</p>
                           <p className="text-xs font-bold text-[#1A1A1A]">{formatDateIST(l.start_date)}</p>
                        </div>
                        <div className="w-px h-6 bg-slate-200" />
                        <div className="flex-1">
                           <p className="text-[9px] font-black text-muted uppercase tracking-widest mb-0.5">End Date</p>
                           <p className="text-xs font-bold text-[#1A1A1A]">{formatDateIST(l.end_date)}</p>
                        </div>
                      </div>
                      
                      <div className="bg-slate-50/80 rounded-xl p-3 border border-slate-100">
                         <p className="text-[9px] font-black text-muted uppercase tracking-widest mb-1">Reason & Type ({l.type})</p>
                         <p className="text-xs text-[#444] font-medium leading-relaxed italic line-clamp-2">"{l.reason}"</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                    <p className="text-[9px] font-black text-muted uppercase tracking-widest">
                      Applied {formatDateIST(l.created_at)}
                    </p>
                    
                    {/* Admin Actions */}
                    {l.status === 'pending' && settings?.role === 'admin' && (
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={async () => {
                            try {
                              await api.patch(`/leaves/${l.id}`, { status: 'approved' });
                              toast.success('Leave approved');
                              fetchLeaves();
                            } catch { toast.error('Failed to update'); }
                          }}
                          className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-[10px] font-black uppercase tracking-widest shadow-lg shadow-emerald-200 hover:bg-emerald-700 transition-all"
                        >Approve</button>
                        <button 
                          onClick={async () => {
                            try {
                              await api.patch(`/leaves/${l.id}`, { status: 'rejected' });
                              toast.success('Leave rejected');
                              fetchLeaves();
                            } catch { toast.error('Failed to update'); }
                          }}
                          className="px-3 py-1.5 bg-slate-100 text-red-600 border border-red-100 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-red-50 transition-all"
                        >Reject</button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Apply Leave Modal */}
        {showLeaveForm && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="card w-full max-w-md animate-in zoom-in-95 duration-200 shadow-2xl">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-black text-[#1A1A1A]">Apply for Leave</h3>
                <button onClick={() => setShowLeaveForm(false)} className="text-muted hover:text-red-500 transition-colors">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M18 6L6 18M6 6l12 12"/></svg>
                </button>
              </div>
              
              <form onSubmit={async (e) => {
                e.preventDefault();
                try {
                  await api.post('/leaves', leaveForm);
                  toast.success('Leave request submitted!');
                  setShowLeaveForm(false);
                  if (view === 'leaves') fetchLeaves();
                } catch { toast.error('Failed to submit leave'); }
              }} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label">Start Date</label>
                    <input type="date" required className="input" value={leaveForm.start_date} onChange={e => setLeaveForm({...leaveForm, start_date: e.target.value})} />
                  </div>
                  <div>
                    <label className="label">End Date</label>
                    <input type="date" required className="input" value={leaveForm.end_date} onChange={e => setLeaveForm({...leaveForm, end_date: e.target.value})} />
                  </div>
                </div>
                <div>
                  <label className="label">Type</label>
                  <select className="input" value={leaveForm.type} onChange={e => setLeaveForm({...leaveForm, type: e.target.value})}>
                    <option value="casual">Casual Leave</option>
                    <option value="sick">Sick Leave</option>
                    <option value="emergency">Emergency Leave</option>
                    <option value="unpaid">Unpaid Leave</option>
                  </select>
                </div>
                <div>
                  <label className="label">Reason</label>
                  <textarea required className="input min-h-[100px]" placeholder="Briefly explain the reason..." value={leaveForm.reason} onChange={e => setLeaveForm({...leaveForm, reason: e.target.value})} />
                </div>
                <button type="submit" className="btn-primary w-full py-3 text-base">Submit Application</button>
              </form>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
