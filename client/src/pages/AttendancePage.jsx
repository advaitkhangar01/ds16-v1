import { useState, useEffect, useCallback, useMemo } from 'react';
import AppLayout from '../components/layout/AppLayout';
import api from '../api/client';
import { formatTimeIST, formatDateIST, todayIST } from '../utils/time';
import { mapAttendance } from '../utils/attendance';
import AttendanceCard from '../components/ui/AttendanceCard';
import toast from 'react-hot-toast';

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
  const [view, setView] = useState('today'); // 'today' | 'all'
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showMarkForm, setShowMarkForm] = useState(false);
  const [historyView, setHistoryView] = useState('calendar'); // 'calendar' | 'table'
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState('');
  const [settings, setSettings] = useState(null);

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
    if (view === 'all' && historyView === 'calendar') {
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

  useEffect(() => {
    if (view === 'today') fetchToday();
    else fetchAll();
  }, [view, fetchToday, fetchAll]);

  // Summary for today
  const summary = view === 'today' ? {
    working: records.filter((r) => r.status === 'working' || r.status === 'completed').length,
    absent: records.filter((r) => r.status === 'absent').length,
    total: records.length
  } : null;

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
              onClick={() => setShowMarkForm(!showMarkForm)}
              className="btn-primary"
            >
              {showMarkForm ? 'Close Marker' : 'Mark Attendance'}
            </button>
            <div className="bg-[#F0F0F0] p-1 rounded-lg flex">
              <button
                onClick={() => setView('today')}
                className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${view === 'today' ? 'bg-white text-[#E05A1E] shadow-sm' : 'text-muted hover:text-[#1A1A1A]'}`}
              >TODAY</button>
              <button
                onClick={() => setView('all')}
                className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${view === 'all' ? 'bg-white text-[#E05A1E] shadow-sm' : 'text-muted hover:text-[#1A1A1A]'}`}
              >HISTORY</button>
            </div>
          </div>
        </div>

        {/* Legend */}
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

        {showMarkForm && (
          <div className="max-w-md animate-in fade-in slide-in-from-top-4 duration-300">
            <AttendanceCard attendance={myRecord} onAction={fetchToday} />
          </div>
        )}

        {/* Today summary cards */}
        {view === 'today' && summary && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="card bg-emerald-50 border-emerald-100 flex items-center gap-4 py-4">
              <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 font-bold">P</div>
              <div>
                <p className="text-[10px] font-bold text-emerald-700 uppercase">Present Today</p>
                <p className="text-2xl font-black text-emerald-600">{summary.working}</p>
              </div>
            </div>
            <div className="card bg-red-50 border-red-100 flex items-center gap-4 py-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center text-red-600 font-bold">A</div>
              <div>
                <p className="text-[10px] font-bold text-red-700 uppercase">Absent</p>
                <p className="text-2xl font-black text-red-600">{summary.absent}</p>
              </div>
            </div>
            <div className="card bg-orange-50 border-orange-100 flex items-center gap-4 py-4">
              <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center text-orange-600 font-bold">T</div>
              <div>
                <p className="text-[10px] font-bold text-orange-700 uppercase">Total Team</p>
                <p className="text-2xl font-black text-orange-600">{summary.total}</p>
              </div>
            </div>
          </div>
        )}

        {/* Filters */}
        {view === 'all' && (
          <div className="card flex items-center justify-between flex-wrap bg-[#F9F9F9] py-3">
             {historyView === 'calendar' ? (
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

        {/* Table */}
        {/* Calendar or Table View */}
        {view === 'all' && historyView === 'calendar' ? (
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
                
                return (
                  <div 
                    key={index} 
                    className="min-h-[120px] bg-white rounded-xl border border-[#F0F0F0] p-3 flex flex-col justify-between hover:border-[#E0E0E0] transition-all group shadow-sm hover:shadow-md"
                  >
                    <span className="text-sm font-black text-[#1A1A1A] group-hover:text-[#E05A1E] transition-colors">
                      {d}
                    </span>
                    
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {(selectedUser ? users.filter(u => u.id === parseInt(selectedUser)) : users).map(u => {
                        const record = dayRecords.find(r => r.user_id === u.id);
                        const isPresent = record && (record.status === 'working' || record.status === 'completed');
                        const isLate = record && record.checkIn && new Date(record.checkIn).getHours() >= 10 && new Date(record.checkIn).getMinutes() > 0;
                        const hoursWorked = record && record.checkIn && record.checkOut 
                          ? (new Date(record.checkOut) - new Date(record.checkIn)) / (1000 * 60 * 60) 
                          : 0;
                        const isHalfDay = record && record.checkIn && record.checkOut && hoursWorked > 0 && hoursWorked < 5;
                        
                        let statusText = 'Absent';
                        let styleClass = 'bg-red-50 text-red-700 border-red-500 hover:bg-red-100 hover:scale-105';
                        
                        if (isPresent) {
                          const checkInTime = new Date(record.checkIn);
                          const officeStartTimeStr = settings?.office_start_time || '09:30';
                          const lateThresholdMins = parseInt(settings?.late_threshold_mins || 15);
                          const halfDayThresholdHours = parseFloat(settings?.half_day_threshold_hours || 4);

                          const [startH, startM] = officeStartTimeStr.split(':').map(Number);
                          const officeStart = new Date(checkInTime);
                          officeStart.setHours(startH, startM, 0, 0);
                          const diffMins = (checkInTime - officeStart) / (1000 * 60);
                          const cellIsLate = diffMins > lateThresholdMins;

                          const cellHoursWorked = record.checkIn && record.checkOut 
                            ? (new Date(record.checkOut) - new Date(record.checkIn)) / (1000 * 60 * 60) 
                            : 0;
                          const cellIsHalfDay = record.checkIn && record.checkOut && cellHoursWorked > 0 && cellHoursWorked < halfDayThresholdHours;

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
                    <th className="px-5 py-4 text-[11px] font-black text-muted uppercase tracking-widest text-right">Location</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F0F0F0]">
                  {loading ? (
                    [...Array(6)].map((_, i) => (
                      <tr key={i}><td colSpan={6} className="px-5 py-4"><div className="skeleton h-8 w-full rounded" /></td></tr>
                    ))
                  ) : (selectedUser ? records.filter(r => r.user_id === parseInt(selectedUser)) : records).length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-5 py-12 text-center">
                        <p className="text-muted font-medium italic">No attendance records found for this period.</p>
                      </td>
                    </tr>
                  ) : (selectedUser ? records.filter(r => r.user_id === parseInt(selectedUser)) : records).map((r, i) => {
                    const isLate = r.checkIn && new Date(r.checkIn).getHours() >= 10 && new Date(r.checkIn).getMinutes() > 0;
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
                        {view === 'all' && <td className="px-5 py-4 text-sm font-medium text-[#1A1A1A]">{formatDateIST(r.date)}</td>}
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
                          {r.lat ? (
                            <span className="text-[10px] font-mono text-muted bg-[#F5F5F5] px-2 py-0.5 rounded border border-[#E0E0E0]">
                              {parseFloat(r.lat).toFixed(4)}, {parseFloat(r.lng).toFixed(4)}
                            </span>
                          ) : <span className="text-[10px] text-muted font-bold italic opacity-30">No Geodata</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
