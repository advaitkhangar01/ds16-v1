/* eslint-disable react-hooks/set-state-in-effect, no-unused-vars */
import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import AppLayout from '../../components/layout/AppLayout';
import api from '../../api/client';
import toast from 'react-hot-toast';
import { formatDateIST, formatTimeIST } from '../../utils/time';
import UserModal from '../../components/staff/UserModal';
import ResetPasswordModal from '../../components/staff/ResetPasswordModal';
import { 
  ArrowLeft, 
  User, 
  MapPin, 
  Calendar, 
  CheckSquare, 
  Briefcase, 
  IndianRupee,
  Clock,
  CheckCircle,
  AlertTriangle,
  FileText,
  PieChart,
  Activity,
  Plus,
  Key
} from 'lucide-react';

export default function StaffDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [showEditModal, setShowEditModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);

  const fetchStaffDetail = useCallback(async () => {
    try {
      setLoading(true);
      const { data: res } = await api.get(`/staff/${id}`);
      setData(res);
    } catch (err) {
      toast.error('Failed to load employee details');
      navigate('/admin/staff');
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  useEffect(() => {
    fetchStaffDetail();
  }, [fetchStaffDetail]);

  if (loading) {
    return (
      <AppLayout>
        <div className="space-y-6 max-w-6xl mx-auto">
          <div className="skeleton h-8 w-48 rounded" />
          <div className="skeleton h-60 rounded-3xl" />
          <div className="skeleton h-96 rounded-3xl" />
        </div>
      </AppLayout>
    );
  }

  if (!data) return null;

  const { employee, projects, tasks, attendanceStats, attendance, leaveStats, leaves, payroll } = data;

  const roleColors = 
    employee.role === 'admin' ? 'bg-purple-50 text-purple-700 border-purple-100' :
    employee.role === 'back_office' || employee.role === 'accounts' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
    employee.role === 'design_head' ? 'bg-amber-50 text-amber-700 border-amber-100' :
    employee.role === 'design' ? 'bg-orange-50 text-orange-700 border-orange-100' :
    employee.role === 'liasoning' ? 'bg-teal-50 text-teal-700 border-teal-100' :
    employee.role === 'civil_engineer' ? 'bg-indigo-50 text-indigo-700 border-indigo-100' :
    'bg-blue-50 text-blue-700 border-blue-100';

  return (
    <AppLayout>
      <div className="space-y-6 max-w-6xl mx-auto animate-in fade-in duration-500 pb-12">
        {/* Navigation & Breadcrumbs */}
        <nav className="flex items-center gap-2 text-xs font-semibold">
          <Link to="/admin/staff" className="text-gray-400 hover:text-primary transition-colors flex items-center gap-1">
            <ArrowLeft size={12} /> Staff Management
          </Link>
          <span className="text-gray-300">/</span>
          <span className="text-gray-800">{employee.name}</span>
        </nav>

        {/* Premium Profile Header Card */}
        <div className="bg-white border border-gray-200 rounded-3xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 -mr-20 -mt-20 bg-orange-50/30 rounded-full" />
          
          <div className="flex items-center gap-5 relative z-10">
            <div className="w-16 h-16 rounded-2xl bg-orange-100 border border-orange-200 flex items-center justify-center text-primary font-black text-2xl shadow-sm">
              {employee.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl font-black text-gray-900 tracking-tight">{employee.name}</h1>
              <div className="flex items-center gap-2.5 mt-1.5 flex-wrap">
                <span className="text-xs font-semibold text-gray-400">@{employee.username}</span>
                <span className={`px-2.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border ${roleColors}`}>
                  {employee.role === 'design_head' ? 'Design Head' : 
                   employee.role === 'design' ? 'Design' : 
                   employee.role === 'back_office' ? 'Back Office' : 
                   employee.role === 'accounts' ? 'Accounts' : 
                   employee.role === 'liasoning' ? 'Liasoning' : 
                   employee.role === 'civil_engineer' ? 'Civil Engineer' : 
                   employee.role === 'employee' ? 'Employee' : employee.role}
                </span>
                {employee.department && (
                  <span className="px-2.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200">
                    {employee.department}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 relative z-10 flex-wrap">
            <button 
              onClick={() => setShowEditModal(true)}
              className="btn-secondary px-4 py-2.5 text-xs font-black uppercase tracking-wider flex items-center gap-1.5 hover:border-primary/50"
            >
              <User size={14} className="text-primary" /> Edit Profile
            </button>
            <button 
              onClick={() => setShowResetModal(true)}
              className="btn-secondary px-4 py-2.5 text-xs font-black uppercase tracking-wider flex items-center gap-1.5 hover:border-primary/50 text-slate-700"
            >
              <Key size={14} className="text-amber-500" /> Reset Password
            </button>
            <div className="h-8 w-px bg-gray-200 mx-1" />
            <div className="text-right">
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block leading-none mb-1">Contract Wages</span>
              <span className="text-lg font-black text-gray-800 font-mono">₹{Number(employee.base_salary || 0).toLocaleString('en-IN')}/mo</span>
            </div>
          </div>
        </div>

        {/* Dashboard Subtabs */}
        <div className="flex border-b border-gray-200 overflow-x-auto hide-scrollbar sticky top-0 bg-base z-20 pt-2">
          {[
            { id: 'overview', label: 'Overview', icon: PieChart },
            { id: 'attendance', label: 'Attendance Logs', icon: Clock, count: attendance.length },
            { id: 'projects', label: 'Projects & Tasks', icon: Briefcase, count: projects.length + tasks.length },
            { id: 'payroll', label: 'Payroll Ledger', icon: IndianRupee, count: payroll.length },
            { id: 'leaves', label: 'Leave Requests', icon: Calendar, count: leaves.length },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-5 py-3 text-xs font-black uppercase tracking-widest whitespace-nowrap border-b-2 transition-all flex items-center gap-2 ${
                activeTab === tab.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-gray-400 hover:text-gray-900'
              }`}
            >
              <tab.icon size={13} />
              {tab.label}
              {tab.count !== undefined && (
                <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                  activeTab === tab.id ? 'bg-orange-100 text-primary' : 'bg-gray-100 text-gray-400'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab Contents */}
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
          
          {/* OVERVIEW TAB */}
          {activeTab === 'overview' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
              {/* Profile Card & Info */}
              <div className="lg:col-span-2 space-y-6">
                <div className="card">
                  <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wide mb-4">Core Employee Profile</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-sm">
                    <div className="space-y-1">
                      <p className="text-xs text-gray-400 font-bold uppercase tracking-wide">Phone Number</p>
                      <p className="font-semibold text-gray-900">{employee.phone || 'No phone registered'}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-gray-400 font-bold uppercase tracking-wide">Primary Department</p>
                      <p className="font-semibold text-gray-900">{employee.department || 'Not assigned'}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-gray-400 font-bold uppercase tracking-wide">Hourly billing rate</p>
                      <p className="font-semibold text-gray-900 font-mono">₹{Number(employee.hourly_rate || 0).toLocaleString()}/hr</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-gray-400 font-bold uppercase tracking-wide">Registered Since</p>
                      <p className="font-semibold text-gray-900">{formatDateIST(employee.created_at)}</p>
                    </div>
                  </div>
                </div>

                {/* Team Quick Stats summary */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                  <div className="bg-slate-50 border border-slate-100 p-5 rounded-2xl">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Check-Ins Recorded</p>
                    <span className="text-xl font-black text-slate-900 font-mono">{attendanceStats.total_present} days</span>
                  </div>
                  <div className="bg-slate-50 border border-slate-100 p-5 rounded-2xl">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Avg. Daily Hours</p>
                    <span className="text-xl font-black text-slate-900 font-mono">{attendanceStats.avg_hours} hrs</span>
                  </div>
                  <div className="bg-slate-50 border border-slate-100 p-5 rounded-2xl">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Late Arrivals</p>
                    <span className="text-xl font-black text-red-500 font-mono">{attendanceStats.total_late} times</span>
                  </div>
                </div>

                {/* Live Task Telemetry */}
                <div className="card">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wide">Assigned Projects Overview</h3>
                    <span className="text-[9px] font-black bg-orange-100 text-primary border border-orange-200 px-2 py-0.5 rounded-full uppercase">Current</span>
                  </div>
                  {projects.length === 0 ? (
                    <p className="text-xs text-gray-400 italic py-6 text-center">No projects assigned to this employee yet.</p>
                  ) : (
                    <div className="space-y-3">
                      {projects.slice(0, 5).map(p => (
                        <div key={p.id} className="flex justify-between items-center p-3.5 bg-gray-50 border border-gray-100 rounded-xl hover:border-primary/40 transition-colors">
                          <div>
                            <p className="text-xs font-black text-gray-800 leading-tight">{p.name}</p>
                            <p className="text-[10px] text-gray-400 mt-0.5 uppercase font-bold">{p.type}</p>
                          </div>
                          <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${
                            p.status === 'Completed' ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'
                          }`}>
                            {p.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Sidebar breakdown */}
              <div className="space-y-6">
                {/* Financial Summary */}
                <div className="bg-slate-900 border border-slate-800 text-white p-6 rounded-3xl shadow-sm relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-24 h-24 -mr-8 -mt-8 rounded-full bg-slate-800 opacity-60" />
                  <h3 className="text-[10px] font-black text-primary uppercase tracking-widest mb-4">Compensation Summary</h3>
                  
                  <div className="space-y-4">
                    <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                      <span className="text-xs text-slate-400">Monthly Base Salary</span>
                      <span className="text-sm font-bold text-white font-mono">₹{Number(employee.base_salary || 0).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                      <span className="text-xs text-slate-400">Hourly Rate</span>
                      <span className="text-sm font-bold text-white font-mono">₹{Number(employee.hourly_rate || 0).toLocaleString()}/hr</span>
                    </div>
                    <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                      <span className="text-xs text-slate-400">Approved Leaves</span>
                      <span className="text-sm font-bold text-white font-mono">{leaveStats.approved_leaves} Requests</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-slate-400">Pending Leaves</span>
                      <span className="text-sm font-bold text-amber-400 font-mono">{leaveStats.pending_leaves} Requests</span>
                    </div>
                  </div>
                </div>

                {/* Quick Info Alerts */}
                {attendanceStats.total_late >= 3 && (
                  <div className="bg-amber-50 border border-amber-200 p-5 rounded-2xl flex gap-3.5">
                    <AlertTriangle className="text-amber-600 shrink-0 mt-0.5" size={20} />
                    <div>
                      <h4 className="text-xs font-black text-amber-900 uppercase">Late compliance warning</h4>
                      <p className="text-[11px] text-amber-700 mt-1 leading-relaxed">
                        This employee has recorded <strong>{attendanceStats.total_late}</strong> late arrivals. According to payroll settings, every 3 late arrivals may incur deductions.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ATTENDANCE TAB */}
          {activeTab === 'attendance' && (
            <div className="card space-y-6">
              <div className="flex justify-between items-center border-b border-gray-100 pb-4">
                <div>
                  <h3 className="text-sm font-black text-gray-800 uppercase tracking-wide">Historical Attendance Logs</h3>
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">Showing last 50 check-ins</p>
                </div>
                <div className="flex gap-2">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-full text-[10px] font-black uppercase tracking-wider">
                    Present: {attendanceStats.total_present}
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-red-50 text-red-700 border border-red-100 rounded-full text-[10px] font-black uppercase tracking-wider">
                    Lates: {attendanceStats.total_late}
                  </span>
                </div>
              </div>

              {attendance.length === 0 ? (
                <p className="text-xs text-gray-400 italic text-center py-16">No check-in records logged for this employee.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200 text-[10px] font-black uppercase tracking-widest text-gray-400">
                        <th className="px-6 py-4">Date</th>
                        <th className="px-6 py-4">Check-In</th>
                        <th className="px-6 py-4">Check-Out</th>
                        <th className="px-6 py-4">Hours Worked</th>
                        <th className="px-6 py-4">Geo Location</th>
                        <th className="px-6 py-4 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 font-medium text-gray-600">
                      {attendance.map((att) => {
                        const isLate = att.is_late === true;
                        return (
                          <tr key={att.id} className="hover:bg-gray-50/50 transition-colors">
                            <td className="px-6 py-4 font-bold text-gray-900">{formatDateIST(att.date)}</td>
                            <td className="px-6 py-4">
                              <span className={isLate ? 'text-red-500 font-bold' : 'text-emerald-600 font-bold'}>
                                {att.check_in ? formatTimeIST(att.check_in) : '—'}
                              </span>
                              {isLate && (
                                <span className="block text-[9px] font-black text-red-400 uppercase tracking-tighter mt-0.5">
                                  Late (+{att.late_minutes} mins)
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-4 font-bold text-slate-800">
                              {att.check_out ? formatTimeIST(att.check_out) : '—'}
                            </td>
                            <td className="px-6 py-4 font-bold font-mono text-gray-900">
                              {att.hours_worked > 0 ? `${parseFloat(att.hours_worked).toFixed(1)} hrs` : '—'}
                            </td>
                            <td className="px-6 py-4">
                              {att.checkin_zone ? (
                                <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-tighter ${
                                  att.checkin_zone === 'strict' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-amber-50 text-amber-600 border border-amber-100'
                                }`}>
                                  {att.checkin_zone} zone
                                </span>
                              ) : (
                                <span className="text-gray-300">—</span>
                              )}
                              {att.checkin_distance && (
                                <span className="block text-[9px] text-gray-400 font-mono mt-0.5">{parseFloat(att.checkin_distance).toFixed(1)}m from office</span>
                              )}
                            </td>
                            <td className="px-6 py-4 text-center">
                              <span className={`inline-flex px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${
                                att.status === 'working' ? 'bg-emerald-50 text-emerald-600' :
                                att.status === 'completed' ? 'bg-blue-50 text-blue-600' :
                                att.status === 'half_day' ? 'bg-amber-50 text-amber-600' :
                                'bg-red-50 text-red-500'
                              }`}>
                                {att.status === 'working' ? 'Present' : att.status === 'completed' ? 'Done' : att.status === 'half_day' ? 'Half Day' : att.status}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* PROJECTS & TASKS TAB */}
          {activeTab === 'projects' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
              {/* Projects List */}
              <div className="lg:col-span-1 space-y-6">
                <div className="card">
                  <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wide mb-4">Assigned Projects</h3>
                  {projects.length === 0 ? (
                    <p className="text-xs text-gray-400 italic py-6 text-center">No projects assigned.</p>
                  ) : (
                    <div className="space-y-4">
                      {projects.map(p => (
                        <div key={p.id} className="p-4 bg-gray-50 border border-gray-100 rounded-2xl">
                          <h4 className="text-xs font-black text-gray-900 leading-tight">{p.name}</h4>
                          <div className="flex justify-between items-center mt-3 text-[10px] font-bold uppercase text-gray-400">
                            <span>{p.type}</span>
                            <span className={p.status === 'Completed' ? 'text-emerald-600' : 'text-blue-600'}>{p.status}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Tasks List */}
              <div className="lg:col-span-2 space-y-6">
                <div className="card">
                  <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wide mb-4">Live Tasks Directory</h3>
                  {tasks.length === 0 ? (
                    <p className="text-xs text-gray-400 italic py-16 text-center">No tasks assigned to this employee.</p>
                  ) : (
                    <div className="space-y-4">
                      {tasks.map(t => (
                        <div key={t.id} className="p-4 bg-white border border-gray-200 rounded-2xl hover:border-primary/50 transition-colors relative overflow-hidden group">
                          <div className="absolute top-0 left-0 w-1 h-full bg-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                          
                          <div className="flex justify-between items-start gap-4 flex-wrap">
                            <div>
                              <p className="text-xs font-black text-gray-800 leading-tight group-hover:text-primary transition-colors">{t.title}</p>
                              {t.description && <p className="text-[11px] text-gray-400 mt-1 line-clamp-2">{t.description}</p>}
                            </div>
                            <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border ${
                              t.status === 'passed' ? 'bg-emerald-50 border-emerald-100 text-emerald-600' :
                              t.status === 'done' ? 'bg-emerald-50 border-emerald-100 text-emerald-600' :
                              t.status === 'in_progress' ? 'bg-amber-50 border-amber-100 text-amber-600' :
                              t.status === 'review' ? 'bg-purple-50 border-purple-100 text-purple-600' :
                              'bg-slate-100 border-slate-200 text-slate-400'
                            }`}>
                              {t.status}
                            </span>
                          </div>

                          <div className="flex gap-2 items-center mt-3 pt-3 border-t border-gray-50 text-[9px] font-black uppercase text-gray-400 tracking-wider">
                            <span>Project: <span className="text-[#E05A1E]">{t.project_name}</span></span>
                            <span>•</span>
                            <span>Stage: {t.stage}</span>
                            <span>•</span>
                            <span>Created: {formatDateIST(t.created_at)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* PAYROLL TAB */}
          {activeTab === 'payroll' && (
            <div className="card space-y-6">
              <div className="flex justify-between items-center border-b border-gray-100 pb-4">
                <div>
                  <h3 className="text-sm font-black text-gray-800 uppercase tracking-wide">Historical Payroll Records</h3>
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">Payout records and ledger receipts</p>
                </div>
              </div>

              {payroll.length === 0 ? (
                <div className="text-center py-16 bg-gray-50/50 rounded-2xl border border-dashed border-gray-200 flex flex-col items-center">
                  <FileText className="text-gray-300 mb-3 animate-pulse" size={32} />
                  <p className="text-xs text-gray-400 italic">No payroll logs found for this employee.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200 text-[10px] font-black uppercase tracking-widest text-gray-400">
                        <th className="px-6 py-4">Month / Year</th>
                        <th className="px-6 py-4">Base Salary</th>
                        <th className="px-6 py-4">Bonus & Incentives</th>
                        <th className="px-6 py-4 text-red-500">Deductions</th>
                        <th className="px-6 py-4">Net Paid</th>
                        <th className="px-6 py-4">Payment Date</th>
                        <th className="px-6 py-4 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 font-medium text-gray-600 font-mono">
                      {payroll.map((pay) => {
                        const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
                        return (
                          <tr key={pay.id} className="hover:bg-gray-50/50 transition-colors text-slate-800">
                            <td className="px-6 py-4 font-bold text-gray-900 font-sans">{months[pay.month - 1]} {pay.year}</td>
                            <td className="px-6 py-4 font-bold">₹{Number(pay.base_salary).toLocaleString()}</td>
                            <td className="px-6 py-4 text-emerald-600 font-bold">
                              ₹{(Number(pay.bonus) + Number(pay.incentives)).toLocaleString()}
                            </td>
                            <td className="px-6 py-4 text-red-500 font-bold">
                              ₹{Number(pay.deductions).toLocaleString()}
                            </td>
                            <td className="px-6 py-4 font-black text-gray-900">
                              ₹{Number(pay.net_paid).toLocaleString()}
                            </td>
                            <td className="px-6 py-4 font-bold text-slate-500 font-sans">
                              {pay.payment_date ? formatDateIST(pay.payment_date) : '—'}
                            </td>
                            <td className="px-6 py-4 text-center">
                              <span className={`inline-flex px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${
                                pay.status === 'paid' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-amber-50 text-amber-700 border border-amber-100'
                              }`}>
                                {pay.status}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* LEAVES TAB */}
          {activeTab === 'leaves' && (
            <div className="card space-y-6">
              <div className="flex justify-between items-center border-b border-gray-100 pb-4">
                <div>
                  <h3 className="text-sm font-black text-gray-800 uppercase tracking-wide">Leave Requests History</h3>
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">Approved, pending and rejected leave applications</p>
                </div>
                <div className="flex gap-2">
                  <span className="px-3 py-1 bg-emerald-50 text-emerald-700 rounded-full text-[10px] font-black uppercase">
                    Approved: {leaveStats.approved_leaves}
                  </span>
                  <span className="px-3 py-1 bg-amber-50 text-amber-700 rounded-full text-[10px] font-black uppercase">
                    Pending: {leaveStats.pending_leaves}
                  </span>
                </div>
              </div>

              {leaves.length === 0 ? (
                <p className="text-xs text-gray-400 italic text-center py-16">No leave requests recorded for this employee.</p>
              ) : (
                <div className="space-y-4">
                  {leaves.map((leave) => (
                    <div key={leave.id} className="p-4 bg-gray-50 border border-gray-100 rounded-2xl">
                      <div className="flex justify-between items-start gap-4 flex-wrap">
                        <div>
                          <p className="text-xs font-black text-gray-800 leading-tight">
                            {formatDateIST(leave.start_date)} — {formatDateIST(leave.end_date)}
                          </p>
                          <p className="text-[10px] text-gray-400 font-bold uppercase mt-1">Reason: <span className="text-slate-600 font-medium normal-case">{leave.reason || 'Not specified'}</span></p>
                          {leave.remarks && (
                            <p className="text-[10px] text-amber-600 font-bold uppercase mt-1">Admin remarks: <span className="text-amber-800 font-medium normal-case">{leave.remarks}</span></p>
                          )}
                        </div>

                        <div className="flex items-center gap-3">
                          <span className="text-[10px] font-black text-primary bg-orange-50 border border-orange-100 px-2 py-0.5 rounded uppercase">
                            {parseFloat(leave.amount)} Day(s) ({leave.type})
                          </span>
                          
                          <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest ${
                            leave.status === 'approved' ? 'bg-emerald-50 text-emerald-700' :
                            leave.status === 'pending' ? 'bg-amber-50 text-amber-700' :
                            'bg-red-50 text-red-700'
                          }`}>
                            {leave.status}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>
      </div>
      {showEditModal && (
        <UserModal 
          user={employee}
          onClose={() => setShowEditModal(false)}
          onSave={fetchStaffDetail}
        />
      )}
      {showResetModal && (
        <ResetPasswordModal 
          userId={employee.id}
          userName={employee.username}
          onClose={() => setShowResetModal(false)}
        />
      )}
    </AppLayout>
  );
}
