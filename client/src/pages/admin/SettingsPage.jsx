import React, { useState, useEffect, useMemo } from 'react';
import AppLayout from '../../components/layout/AppLayout';
import api from '../../api/client';
import toast from 'react-hot-toast';
import { 
  Users, 
  Clock, 
  Calendar as CalendarIcon, 
  Trash2, 
  Plus, 
  Shield, 
  UserPlus, 
  Key,
  Lock,
  Search,
  RefreshCw,
  X
} from 'lucide-react';

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('payroll');
  const [loading, setLoading] = useState(true);
  
  // Users State
  const [users, setUsers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showUserModal, setShowUserModal] = useState(false);
  const [newUser, setNewUser] = useState({ name: '', username: '', password: '', role: 'employee', department: '', phone: '' });
  
  // Password Reset State
  const [resetModal, setResetModal] = useState({ show: false, userId: null, userName: '', newPassword: '' });

  // Payroll Rules State
  const [payrollSettings, setPayrollSettings] = useState({
    office_start_time: '09:30',
    late_threshold_mins: '15',
    late_penalty_amount: '50',
    half_day_threshold_hours: '4',
    half_day_penalty_percent: '50',
    leave_penalty_type: 'daily_wage',
    leave_penalty_fixed: '0'
  });

  // Holidays State
  const [holidays, setHolidays] = useState([]);
  const [newHoliday, setNewHoliday] = useState({ date: '', name: '', is_paid: true });

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  const fetchData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'users') {
        const { data } = await api.get('/settings/users');
        setUsers(data.users || []);
      } else if (activeTab === 'payroll') {
        const { data } = await api.get('/settings/app');
        setPayrollSettings(prev => ({ ...prev, ...data }));
      } else if (activeTab === 'holidays') {
        const { data } = await api.get('/settings/holidays');
        setHolidays(data || []);
      }
    } catch (err) {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  // Memoized Filtered Users
  const filteredUsers = useMemo(() => {
    return users.filter(u => 
      u.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      u.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (u.department && u.department.toLowerCase().includes(searchQuery.toLowerCase()))
    );
  }, [users, searchQuery]);

  // User Handlers
  const handleCreateUser = async (e) => {
    e.preventDefault();
    try {
      await api.post('/settings/users', newUser);
      toast.success('User created successfully');
      setShowUserModal(false);
      setNewUser({ name: '', username: '', password: '', role: 'employee', department: '', phone: '' });
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create user');
    }
  };

  const handleDeleteUser = async (id) => {
    if (!window.confirm('Are you sure you want to delete this user?')) return;
    try {
      await api.delete(`/settings/users/${id}`);
      toast.success('User deleted');
      fetchData();
    } catch (err) {
      toast.error('Failed to delete user');
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    try {
      await api.patch(`/settings/users/${resetModal.userId}/reset-password`, { 
        newPassword: resetModal.newPassword 
      });
      toast.success(`Password reset for ${resetModal.userName}`);
      setResetModal({ show: false, userId: null, userName: '', newPassword: '' });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Reset failed');
    }
  };

  // Payroll Handlers
  const handleUpdatePayrollSettings = async (e) => {
    e.preventDefault();
    try {
      await api.post('/settings/app', payrollSettings);
      toast.success('Payroll rules updated');
    } catch (err) {
      toast.error('Failed to update settings');
    }
  };

  // Holiday Handlers
  const handleAddHoliday = async (e) => {
    e.preventDefault();
    try {
      await api.post('/settings/holidays', newHoliday);
      toast.success('Holiday added');
      setNewHoliday({ date: '', name: '', is_paid: true });
      fetchData();
    } catch (err) {
      toast.error('Failed to add holiday');
    }
  };

  const handleDeleteHoliday = async (id) => {
    try {
      await api.delete(`/settings/holidays/${id}`);
      toast.success('Holiday removed');
      fetchData();
    } catch (err) {
      toast.error('Failed to delete');
    }
  };

  return (
    <AppLayout>
      <div className="p-6 max-w-6xl mx-auto space-y-6 animate-in fade-in duration-500">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-black text-gray-900 tracking-tight uppercase italic">Administrative Control</h1>
            <p className="text-sm text-gray-500 font-medium tracking-tight">Manage users, payroll rules, and organization settings</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 p-1 bg-gray-100 w-fit rounded-xl">
          <button 
            onClick={() => setActiveTab('payroll')}
            className={`flex items-center gap-2 px-5 py-2.5 text-[11px] font-black uppercase tracking-widest rounded-lg transition-all ${activeTab === 'payroll' ? 'bg-white shadow-sm text-primary' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <Clock size={14} /> Payroll Rules
          </button>
          <button 
            onClick={() => setActiveTab('holidays')}
            className={`flex items-center gap-2 px-5 py-2.5 text-[11px] font-black uppercase tracking-widest rounded-lg transition-all ${activeTab === 'holidays' ? 'bg-white shadow-sm text-primary' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <CalendarIcon size={14} /> Holidays
          </button>
          <button 
            onClick={() => setActiveTab('users')}
            className={`flex items-center gap-2 px-5 py-2.5 text-[11px] font-black uppercase tracking-widest rounded-lg transition-all ${activeTab === 'users' ? 'bg-white shadow-sm text-primary' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <Users size={14} /> Users
          </button>
        </div>

        {/* Tab Content */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden min-h-[400px]">
          
          {/* User Management */}
          {activeTab === 'users' && (
            <div className="p-0">
              <div className="px-6 py-5 border-b border-gray-100 flex flex-wrap gap-4 justify-between items-center bg-gray-50/30">
                <div className="flex items-center gap-6">
                  <div>
                    <h2 className="text-lg font-bold text-gray-800">Users & Roles</h2>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Manage system access and permissions</p>
                  </div>
                  <div className="relative group">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-primary transition-colors" size={16} />
                    <input 
                      type="text" 
                      placeholder="Search users..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm w-64 focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/5 transition-all font-medium"
                    />
                    {searchQuery && (
                      <button 
                        onClick={() => setSearchQuery('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                </div>
                <button 
                  onClick={() => setShowUserModal(true)}
                  className="btn-primary"
                >
                  <UserPlus size={18} /> 
                  <span className="font-bold uppercase tracking-widest text-[10px]">Add User</span>
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="bg-gray-50/50 border-b border-gray-200">
                      <th className="px-6 py-4 font-bold text-gray-600 uppercase text-[10px] tracking-widest">User</th>
                      <th className="px-6 py-4 font-bold text-gray-600 uppercase text-[10px] tracking-widest">Role</th>
                      <th className="px-6 py-4 font-bold text-gray-600 uppercase text-[10px] tracking-widest">Department</th>
                      <th className="px-6 py-4 font-bold text-gray-600 uppercase text-[10px] tracking-widest">Phone</th>
                      <th className="px-6 py-4 font-bold text-gray-600 uppercase text-[10px] tracking-widest text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredUsers.map(u => (
                      <tr key={u.id} className="hover:bg-gray-50 transition-colors group">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                              {u.name.charAt(0)}
                            </div>
                            <div>
                              <div className="font-bold text-gray-900">{u.name}</div>
                              <div className="text-xs text-gray-500 font-medium">@{u.username}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${u.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                            {u.role}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-gray-600 font-medium">{u.department || '—'}</td>
                        <td className="px-6 py-4 text-gray-600 font-medium">{u.phone || '—'}</td>
                        <td className="px-6 py-4 text-center">
                          <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button 
                              onClick={() => setResetModal({ show: true, userId: u.id, userName: u.name, newPassword: '' })}
                              className="p-1.5 text-gray-400 hover:text-primary hover:bg-orange-50 rounded-lg transition-all" 
                              title="Reset Password"
                            >
                              <RefreshCw size={16} />
                            </button>
                            <button 
                              onClick={() => handleDeleteUser(u.id)} 
                              className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all" 
                              title="Delete User"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filteredUsers.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-20 text-center text-gray-400 font-bold uppercase tracking-widest text-xs">
                          No users found
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Payroll Rules */}
          {activeTab === 'payroll' && (
            <div className="p-8">
              <div className="max-w-3xl">
                <div className="flex items-center gap-3 mb-8">
                  <div className="p-3 bg-primary/10 rounded-2xl">
                    <Shield className="text-primary" size={24} />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">Payroll Calculation Rules</h2>
                    <p className="text-sm text-gray-500">Define office timings and automatic penalty structures</p>
                  </div>
                </div>

                <form onSubmit={handleUpdatePayrollSettings} className="space-y-8">
                  <section className="space-y-4">
                    <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest border-b border-gray-100 pb-2">Office Timing & Lateness</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-gray-700">Standard Start Time</label>
                        <input 
                          type="time"
                          value={payrollSettings.office_start_time}
                          onChange={(e) => setPayrollSettings({...payrollSettings, office_start_time: e.target.value})}
                          className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/5 transition-all"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-gray-700">Grace Period (Minutes)</label>
                        <input 
                          type="number"
                          value={payrollSettings.late_threshold_mins}
                          onChange={(e) => setPayrollSettings({...payrollSettings, late_threshold_mins: e.target.value})}
                          className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/5 transition-all"
                        />
                      </div>
                    </div>
                  </section>

                  <section className="space-y-4">
                    <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest border-b border-gray-100 pb-2">Penalty Structure</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-gray-700">Late Arrival Penalty (₹)</label>
                        <div className="relative">
                          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-xs">₹</span>
                          <input 
                            type="number"
                            value={payrollSettings.late_penalty_amount}
                            onChange={(e) => setPayrollSettings({...payrollSettings, late_penalty_amount: e.target.value})}
                            className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-8 pr-4 py-2.5 text-sm outline-none focus:border-primary"
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-gray-700">Half Day Penalty (%)</label>
                        <div className="relative">
                          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 text-xs">%</span>
                          <input 
                            type="number"
                            value={payrollSettings.half_day_penalty_percent}
                            onChange={(e) => setPayrollSettings({...payrollSettings, half_day_penalty_percent: e.target.value})}
                            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-primary"
                          />
                        </div>
                      </div>
                    </div>
                  </section>

                  <div className="pt-6 border-t border-gray-100 flex justify-end">
                    <button type="submit" className="btn-primary px-8">Save Payroll Rules</button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Holidays */}
          {activeTab === 'holidays' && (
            <div className="p-8">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
                <div className="space-y-6">
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">Add Holiday</h2>
                    <p className="text-sm text-gray-500 font-medium">Mark non-working days in the calendar</p>
                  </div>
                  <form onSubmit={handleAddHoliday} className="space-y-4 bg-gray-50/50 p-6 rounded-2xl border border-gray-100">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-700">Holiday Name</label>
                      <input 
                        type="text" required
                        value={newHoliday.name}
                        onChange={(e) => setNewHoliday({...newHoliday, name: e.target.value})}
                        placeholder="e.g., Independence Day"
                        className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-primary"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-gray-700">Date</label>
                      <input 
                        type="date" required
                        value={newHoliday.date}
                        onChange={(e) => setNewHoliday({...newHoliday, date: e.target.value})}
                        className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-primary"
                      />
                    </div>
                    <button type="submit" className="w-full btn-primary py-3">Add to List</button>
                  </form>
                </div>

                <div className="lg:col-span-2 space-y-6">
                  <h2 className="text-lg font-bold text-gray-900">Holiday Schedule</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {holidays.map(h => (
                      <div key={h.id} className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex justify-between items-center group">
                        <div>
                          <div className="font-bold text-gray-900">{h.name}</div>
                          <div className="text-xs text-gray-500 font-medium">{new Date(h.date).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
                        </div>
                        <button onClick={() => handleDeleteHoliday(h.id)} className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* User Modal */}
        {showUserModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
              <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                <h3 className="text-xl font-bold text-gray-900">Create New User</h3>
                <button onClick={() => setShowUserModal(false)} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
              </div>
              <form onSubmit={handleCreateUser} className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase ml-1">Full Name</label>
                    <input 
                      type="text" required
                      value={newUser.name}
                      onChange={(e) => setNewUser({...newUser, name: e.target.value})}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-primary"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase ml-1">Username</label>
                    <input 
                      type="text" required
                      value={newUser.username}
                      onChange={(e) => setNewUser({...newUser, username: e.target.value})}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-primary"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase ml-1">Password</label>
                  <div className="relative">
                    <Lock size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input 
                      type="password" required
                      value={newUser.password}
                      onChange={(e) => setNewUser({...newUser, password: e.target.value})}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-10 pr-4 py-2.5 text-sm outline-none focus:border-primary"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase ml-1">Role</label>
                    <select 
                      value={newUser.role}
                      onChange={(e) => setNewUser({...newUser, role: e.target.value})}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-primary"
                    >
                      <option value="employee">Employee</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase ml-1">Department</label>
                    <input 
                      type="text"
                      value={newUser.department}
                      onChange={(e) => setNewUser({...newUser, department: e.target.value})}
                      placeholder="e.g. Design"
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-primary"
                    />
                  </div>
                </div>
                <div className="pt-6 border-t border-gray-100 flex justify-end gap-3">
                  <button type="button" onClick={() => setShowUserModal(false)} className="px-6 py-2.5 text-sm font-bold text-gray-500 hover:bg-gray-100 rounded-xl transition-all">Cancel</button>
                  <button type="submit" className="px-6 py-2.5 text-sm font-bold text-white bg-primary hover:bg-[#C94E16] rounded-xl shadow-lg shadow-orange-100 transition-all active:scale-95">Create User</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Password Reset Modal */}
        {resetModal.show && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
              <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                <div>
                  <h3 className="text-xl font-bold text-gray-900">Reset Password</h3>
                  <p className="text-xs text-gray-500 font-medium">Changing password for {resetModal.userName}</p>
                </div>
                <button onClick={() => setResetModal({ ...resetModal, show: false })} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
              </div>
              <form onSubmit={handleResetPassword} className="p-6 space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase ml-1">New Password</label>
                  <div className="relative">
                    <Lock size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input 
                      type="password" required
                      placeholder="Min. 6 characters"
                      value={resetModal.newPassword}
                      onChange={(e) => setResetModal({...resetModal, newPassword: e.target.value})}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-10 pr-4 py-2.5 text-sm outline-none focus:border-primary"
                    />
                  </div>
                </div>
                <div className="pt-6 border-t border-gray-100 flex justify-end gap-3">
                  <button type="button" onClick={() => setResetModal({ ...resetModal, show: false })} className="px-6 py-2.5 text-sm font-bold text-gray-500 hover:bg-gray-100 rounded-xl transition-all">Cancel</button>
                  <button type="submit" className="px-6 py-2.5 text-sm font-bold text-white bg-primary hover:bg-[#C94E16] rounded-xl shadow-lg shadow-orange-100 transition-all active:scale-95">Reset Now</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
