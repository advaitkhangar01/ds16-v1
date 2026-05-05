import React, { useState, useEffect, useMemo } from 'react';
import AppLayout from '../../components/layout/AppLayout';
import api from '../../api/client';
import toast from 'react-hot-toast';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';
import { 
  TrendingUp, TrendingDown, IndianRupee, Briefcase, 
  Download, Calendar, Filter, ArrowUpRight, ArrowDownRight,
  Activity, Receipt, Trash2, FileText, CheckCircle2, Plus, X, Lock
} from 'lucide-react';

const EXPENSE_CATEGORIES = [
  "Rent",
  "Electricity",
  "Water",
  "Stationery",
  "Software/SaaS",
  "Travel",
  "Marketing",
  "Site Labor",
  "Materials",
  "Furniture",
  "Miscellaneous"
];

export default function AccountingPage() {
  const [activeTab, setActiveTab] = useState('summary');
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [filters, setFilters] = useState({
    startDate: '',
    endDate: '',
    projectId: ''
  });

  // Summary Data
  const [summary, setSummary] = useState({
    totalIncome: 0,
    totalExpense: 0,
    netProfit: 0
  });

  // Chart Data
  const [chartData, setChartData] = useState({
    trend: [],
    categories: []
  });



  // Expenses Data
  const [expenses, setExpenses] = useState([]);

  const [projects, setProjects] = useState([]);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalData, setModalData] = useState({ category: '', amount: '', date: new Date().toISOString().split('T')[0], description: '', receipt: null });

  // Payroll Data
  const [employees, setEmployees] = useState([]);
  const [payrollHistory, setPayrollHistory] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [auditedCategories, setAuditedCategories] = useState({}); // category -> boolean

  const groupedExpenses = useMemo(() => {
    const groups = {};
    EXPENSE_CATEGORIES.forEach(cat => groups[cat] = []);
    
    expenses.forEach(exp => {
      const cat = exp.category || 'Miscellaneous';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(exp);
    });
    return groups;
  }, [expenses]);

  const categoryTotals = useMemo(() => {
    const totals = {};
    Object.entries(groupedExpenses).forEach(([cat, items]) => {
      totals[cat] = items.reduce((sum, item) => sum + parseFloat(item.amount || 0), 0);
    });
    return totals;
  }, [groupedExpenses]);

  useEffect(() => {
    fetchProjects();
  }, []);

  useEffect(() => {
    fetchSummary();
    if (activeTab === 'summary') fetchChartData();
    if (activeTab === 'expenses') {
      fetchExpenses();
      fetchAudits();
    }
    if (activeTab === 'payroll') fetchPayrollData();

  }, [activeTab, selectedMonth, selectedYear, filters]);

  const fetchProjects = async () => {
    try {
      const { data } = await api.get('/projects');
      setProjects(data.projects || []);
    } catch (err) {
      console.error('Failed to load projects');
    }
  };

  const fetchSummary = async () => {
    try {
      const { startDate, endDate, projectId } = filters;
      let url = `/finances/summary?`;
      if (startDate) url += `&start_date=${startDate}`;
      if (endDate) url += `&end_date=${endDate}`;
      if (projectId) url += `&project_id=${projectId}`;
      
      const { data } = await api.get(url);
      
      setSummary({
        totalIncome: data.total_income,
        billedIncome: data.billed_income,
        receivedIncome: data.received_income,
        pendingIncome: data.pending_income,
        unbilledIncome: data.unbilled_income,
        totalExpense: data.total_expense,
        netProfit: data.net_profit
      });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchChartData = async () => {
    try {
      const { projectId } = filters;
      let url = `/finances/charts?`;
      if (projectId) url += `&project_id=${projectId}`;
      const { data } = await api.get(url);
      setChartData(data);
    } catch (err) {
      console.error('Failed to load chart data');
    }
  };



  const fetchExpenses = async () => {
    try {
      const { startDate, endDate } = filters;
      let url = `/finances/transactions?type=expense`;
      if (startDate) url += `&start_date=${startDate}`;
      if (endDate) url += `&end_date=${endDate}`;
      
      const { data } = await api.get(url);
      // Explicitly filter out vendor payments from the general expense list
      setExpenses(data.transactions.filter(t => t.category !== 'vendor_payment'));
    } catch (err) {
      toast.error('Failed to load expenses');
    }
  };

  const fetchAudits = async () => {
    try {
      // For auditing, we use the selectedMonth/Year from the payroll filter or current date if not set
      const { data } = await api.get(`/accounting/expenses/audits?month=${selectedMonth}&year=${selectedYear}`);
      setAuditedCategories(data);
    } catch (err) {
      console.error('Failed to load audits');
    }
  };

  const toggleAudit = async (category) => {
    const newVal = !auditedCategories[category];
    setAuditedCategories(prev => ({ ...prev, [category]: newVal }));
    
    try {
      await api.post('/accounting/expenses/audits', {
        category,
        month: selectedMonth,
        year: selectedYear,
        is_verified: newVal
      });
    } catch (err) {
      toast.error('Failed to save audit status');
      // Revert local state
      setAuditedCategories(prev => ({ ...prev, [category]: !newVal }));
    }
  };

  const fetchPayrollData = async () => {
    try {
      const [empRes, histRes] = await Promise.all([
        api.get(`/accounting/payroll/employees?month=${selectedMonth}&year=${selectedYear}`),
        api.get(`/accounting/payroll/history?month=${selectedMonth}&year=${selectedYear}`)
      ]);
      setEmployees(empRes.data);
      setPayrollHistory(histRes.data);
    } catch (err) {
      toast.error('Failed to load payroll data');
    }
  };



  const handleAddExpense = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    const amountVal = parseFloat(modalData.amount);
    if (isNaN(amountVal) || amountVal <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    if (!modalData.date) {
      toast.error('Please select a date');
      return;
    }

    setIsSubmitting(true);
    const formData = new FormData();
    formData.append('type', 'expense');
    formData.append('category', modalData.category); 
    formData.append('amount', amountVal);
    formData.append('date', modalData.date);
    formData.append('description', modalData.description || '');
    
    if (modalData.receipt) {
      formData.append('receipt', modalData.receipt);
    }

    try {
      await api.post('/finances/transactions', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      toast.success('Expense recorded');
      setIsAddModalOpen(false);
      setModalData({ category: '', amount: '', date: new Date().toISOString().split('T')[0], description: '', receipt: null });
      fetchExpenses();
      fetchSummary();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to record expense');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isDeletable = (dateStr) => {
    if (!dateStr) return true;
    const date = new Date(dateStr);
    const diff = Date.now() - date.getTime();
    const days = diff / (1000 * 60 * 60 * 24);
    return days < 15;
  };

  const handleDeleteExpense = async (id, date) => {
    if (!isDeletable(date)) {
      toast.error('Expenses older than 15 days are irreversible');
      return;
    }
    if (!window.confirm('Delete this transaction?')) return;
    try {
      await api.delete(`/finances/transactions/${id}`);
      toast.success('Transaction deleted');
      fetchExpenses();
      fetchSummary();
    } catch (err) {
      toast.error('Failed to delete');
    }
  };

  const handleProcessPayroll = async (emp) => {
    const suggested = emp.suggested_salary;
    const breakdown = `
      Full Days: ${emp.full_days}
      Half Days: ${emp.half_days} (${emp.half_days * 0.5}d)
      Late Penalty: -${emp.late_penalty_days}d
      Unpaid Leaves: -${emp.unpaid_leaves}
      Paid Holidays: +${emp.paid_holidays}
      Final Payable Days: ${emp.payable_days}
    `;
    const finalAmount = prompt(`Confirm payment for ${emp.name}:\n${breakdown}\nSuggested Amount:`, suggested);
    
    if (finalAmount === null) return;

    try {
      // 1. Save to payroll table (legacy/detail)
      await api.post('/accounting/payroll', {
        user_id: emp.id,
        base_salary: emp.base_salary,
        bonus: 0,
        deductions: 0,
        net_paid: parseFloat(finalAmount),
        month: selectedMonth,
        year: selectedYear,
        status: 'paid'
      });

      // 2. Save to unified transactions (financial source of truth)
      await api.post('/finances/transactions', {
        type: 'expense',
        category: 'salary',
        amount: parseFloat(finalAmount),
        date: new Date().toISOString().split('T')[0],
        description: `Salary for ${emp.name} - ${new Date(0, selectedMonth - 1).toLocaleString('default', { month: 'long' })} ${selectedYear}`,
        employee_id: emp.id
      });

      toast.success(`Payroll processed for ${emp.name}`);
      fetchPayrollData();
      fetchSummary();
    } catch (err) {
      toast.error('Failed to process payroll');
    }
  };

  const handleExportCSV = () => {
    if (expenses.length === 0) {
      toast.error('No data to export');
      return;
    }

    const headers = ['Date', 'Category', 'Vendor', 'Description', 'Amount'];
    const rows = expenses.map(exp => [
      new Date(exp.date).toLocaleDateString(),
      exp.category,
      exp.vendor_name || 'N/A',
      exp.description?.replace(/,/g, ';'), // Escape commas
      exp.amount
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `DS16_Expenses_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Report exported');
  };

  return (
    <AppLayout>
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">Accounting Control</h1>
          <div className="flex bg-gray-100 p-1 rounded-lg">
            {['summary', 'payroll', 'expenses'].map((tab) => (
              <button 
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 text-sm font-bold rounded-md transition-all capitalize ${activeTab === tab ? 'bg-white shadow-sm text-primary' : 'text-gray-500 hover:text-gray-700'}`}
              >
                {tab.replace('-', ' ')}
              </button>
            ))}
          </div>
        </div>

        {/* Filters Bar */}
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Filter size={16} className="text-gray-400" />
            <span className="text-sm font-bold text-gray-700">Filters:</span>
          </div>
          
          <div className="flex items-center gap-2">
            <Calendar size={14} className="text-gray-400" />
            <input 
              type="date" 
              value={filters.startDate}
              onChange={(e) => setFilters({...filters, startDate: e.target.value})}
              className="bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 text-xs outline-none focus:border-primary"
            />
            <span className="text-gray-400">to</span>
            <input 
              type="date" 
              value={filters.endDate}
              onChange={(e) => setFilters({...filters, endDate: e.target.value})}
              className="bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 text-xs outline-none focus:border-primary"
            />
          </div>

          {activeTab !== 'expenses' && (
            <div className="flex items-center gap-2">
              <Briefcase size={14} className="text-gray-400" />
              <select 
                value={filters.projectId}
                onChange={(e) => setFilters({...filters, projectId: e.target.value})}
                className="bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 text-xs outline-none focus:border-primary min-w-[150px]"
              >
                <option value="">All Projects</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          )}

          <button 
            onClick={() => setFilters({ startDate: '', endDate: '', projectId: '' })}
            className="text-xs text-gray-400 hover:text-primary font-medium"
          >
            Clear Filters
          </button>

          <div className="flex-1" />

          {activeTab === 'expenses' && (
            <button 
              onClick={handleExportCSV}
              className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-bold transition-all"
            >
              <Download size={14} />
              Export CSV
            </button>
          )}
        </div>

        {/* Tab Content */}
        {activeTab === 'summary' && (
          <div className="space-y-6 animate-in fade-in duration-500">
            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Box 1: Total Project Value */}
              <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm relative overflow-hidden group">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Total Project Value</p>
                <h3 className="text-2xl font-black text-gray-900 mt-2">₹{(Number(summary.totalIncome) || 0).toLocaleString('en-IN')}</h3>
                <div className="absolute top-0 right-0 p-3 opacity-5">
                  <Briefcase size={40} />
                </div>
              </div>

              {/* Box 2: Billed Amount */}
              <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm relative overflow-hidden group">
                <p className="text-[10px] font-bold text-blue-500 uppercase tracking-widest">Billed Amount</p>
                <h3 className="text-2xl font-black text-blue-600 mt-2">₹{(Number(summary.billedIncome) || 0).toLocaleString('en-IN')}</h3>
                <div className="absolute top-0 right-0 p-3 opacity-5 text-blue-600">
                  <FileText size={40} />
                </div>
              </div>

              {/* Box 3: Unbilled Amount */}
              <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm relative overflow-hidden group">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Unbilled Amount</p>
                <h3 className="text-2xl font-black text-gray-600 mt-2">₹{(Number(summary.unbilledIncome) || 0).toLocaleString('en-IN')}</h3>
                <div className="absolute top-0 right-0 p-3 opacity-5">
                  <TrendingUp size={40} />
                </div>
              </div>

              {/* Box 4: Total Expenses */}
              <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm relative overflow-hidden group">
                <p className="text-[10px] font-bold text-red-400 uppercase tracking-widest">Total Expenses</p>
                <h3 className="text-2xl font-black text-red-500 mt-2">₹{(summary.totalExpense || 0).toLocaleString('en-IN')}</h3>
                <p className="text-[10px] text-muted mt-1 italic">Excl. vendor payments</p>
                <div className="absolute top-0 right-0 p-3 opacity-5 text-red-500">
                  <ArrowDownRight size={40} />
                </div>
              </div>

              {/* Box 5: Received Amount */}
              <div className="bg-white p-5 rounded-xl border border-emerald-100 shadow-sm relative overflow-hidden group">
                <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">Received Amount</p>
                <h3 className="text-2xl font-black text-emerald-600 mt-2">₹{(Number(summary.receivedIncome) || 0).toLocaleString('en-IN')}</h3>
                <div className="absolute top-0 right-0 p-3 opacity-10 text-emerald-600">
                  <CheckCircle2 size={40} />
                </div>
              </div>

              {/* Box 6: Pending Amount */}
              <div className="bg-white p-5 rounded-xl border border-orange-100 shadow-sm relative overflow-hidden group">
                <p className="text-[10px] font-bold text-orange-500 uppercase tracking-widest">Pending Amount</p>
                <h3 className="text-2xl font-black text-orange-600 mt-2">₹{(Number(summary.pendingIncome) || 0).toLocaleString('en-IN')}</h3>
                <div className="absolute top-0 right-0 p-3 opacity-10 text-orange-500">
                  <Activity size={40} />
                </div>
              </div>

              {/* Box 7: Profit & Loss */}
              <div className="bg-white p-5 rounded-xl border border-blue-100 shadow-sm relative overflow-hidden group md:col-span-2">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">Profit & Loss (Realized)</p>
                    <div className="flex items-baseline gap-3 mt-2">
                      <h3 className={`text-2xl font-black ${((summary.receivedIncome || 0) - (summary.totalExpense || 0)) >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                        ₹{((summary.receivedIncome || 0) - (summary.totalExpense || 0)).toLocaleString('en-IN')}
                      </h3>
                      <span className="text-[10px] font-bold text-gray-400 italic">Formula: Received - Expenses</span>
                    </div>
                  </div>
                  <div className="p-2 bg-blue-50 rounded-lg">
                    <Activity size={20} className="text-blue-600" />
                  </div>
                </div>
              </div>
            </div>

            {/* Charts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wider">Monthly Performance</h3>
                  <div className="flex items-center gap-4 text-[10px] font-bold uppercase tracking-tighter">
                    <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-green-500"/> Income</div>
                    <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-red-400"/> Expense</div>
                  </div>
                </div>
                <div className="h-64 w-full">
                  {chartData.trend?.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData.trend} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                        <XAxis dataKey="month_year" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 600, fill: '#999' }} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 600, fill: '#999' }} />
                        <Tooltip 
                          contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                          cursor={{ fill: '#f8fafc' }}
                        />
                        <Bar dataKey="income" fill="#10b981" radius={[4, 4, 0, 0]} barSize={20} />
                        <Bar dataKey="expense" fill="#f87171" radius={[4, 4, 0, 0]} barSize={20} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-gray-400 italic text-xs">
                      No trend data available for this period
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wider mb-6">Expense Distribution</h3>
                <div className="h-64 w-full flex">
                  {chartData.categories?.length > 0 ? (
                    <>
                      <div className="w-1/2">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={chartData.categories}
                              innerRadius={60}
                              outerRadius={80}
                              paddingAngle={5}
                              dataKey="value"
                            >
                              {chartData.categories.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f59e0b', '#10b981', '#06b6d4', '#3b82f6'][index % 8]} />
                              ))}
                            </Pie>
                            <Tooltip />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="w-1/2 overflow-y-auto pr-2 space-y-2">
                        {chartData.categories.map((cat, idx) => (
                          <div key={cat.name} className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f59e0b', '#10b981', '#06b6d4', '#3b82f6'][idx % 8] }} />
                              <span className="text-[10px] font-bold text-gray-600 truncate max-w-[100px]">{cat.name}</span>
                            </div>
                            <span className="text-[10px] font-mono font-bold text-gray-400">₹{parseFloat(cat.value).toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="w-full flex flex-col items-center justify-center text-gray-400 italic text-xs">
                      No expense breakdown available
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}



        {activeTab === 'expenses' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            


            {/* Expense Matrix */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                  <FileText size={18} className="text-gray-400" />
                  Expense Management Matrix
                </h3>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-2 py-1">
                    <Calendar size={14} className="text-gray-400" />
                    <select 
                      value={selectedMonth} 
                      onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                      className="text-xs font-bold bg-transparent outline-none cursor-pointer"
                    >
                      {Array.from({ length: 12 }, (_, i) => (
                        <option key={i+1} value={i+1}>{new Date(0, i).toLocaleString('default', { month: 'long' })}</option>
                      ))}
                    </select>
                    <select 
                      value={selectedYear} 
                      onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                      className="text-xs font-bold bg-transparent outline-none cursor-pointer border-l pl-2"
                    >
                      {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                  <span className="px-2 py-1 bg-primary/10 text-primary text-[10px] font-black rounded-md uppercase">
                    {expenses.length} Records
                  </span>
                </div>
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-white border-b border-gray-100">
                      <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest w-[20%]">Category</th>
                      <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest w-[35%]">Transactions</th>
                      <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest w-[25%]">Latest Remarks</th>
                      <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest w-[15%] text-right">Total Amount</th>
                      <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest w-[5%] text-center">✔</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {EXPENSE_CATEGORIES.map(cat => {
                      const items = groupedExpenses[cat] || [];
                      const total = categoryTotals[cat] || 0;
                      
                      return (
                        <tr key={cat} className="hover:bg-gray-50/50 transition-colors group">
                          <td className="px-6 py-4 align-top">
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-xs font-bold text-gray-700">{cat}</span>
                              <button 
                                onClick={() => {
                                  setModalData({ ...modalData, category: cat });
                                  setIsAddModalOpen(true);
                                }}
                                className="w-7 h-7 rounded-lg bg-orange-600 text-white flex items-center justify-center hover:bg-orange-700 transition-all shadow-md active:scale-90 flex-shrink-0"
                                title={`Add ${cat} Expense`}
                              >
                                <Plus size={16} strokeWidth={3} />
                              </button>
                            </div>
                          </td>
                          <td className="px-6 py-4 align-top">
                            <div className="flex flex-wrap gap-2">
                              {items.length > 0 ? (
                                items.map(exp => (
                                  <div key={exp.id} className="group/chip relative">
                                    <div className="inline-flex items-center gap-1.5 bg-white border border-gray-200 rounded-full px-2.5 py-1 text-[10px] font-bold text-gray-600 shadow-sm hover:border-primary hover:bg-orange-50/30 transition-all">
                                      <span className="text-gray-400">{new Date(exp.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                                      <span className="text-gray-900">₹{parseFloat(exp.amount).toLocaleString()}</span>
                                      {exp.receipt_url && (
                                        <a 
                                          href={`${import.meta.env.VITE_API_URL || ''}${exp.receipt_url}`} 
                                          target="_blank" 
                                          rel="noopener noreferrer"
                                          className="text-primary hover:text-primary-dark"
                                        >
                                          <Receipt size={10} />
                                        </a>
                                      )}
                                      {isDeletable(exp.date) ? (
                                        <button 
                                          onClick={() => handleDeleteExpense(exp.id, exp.date)}
                                          className="ml-1 text-gray-300 hover:text-red-500 opacity-0 group-hover/chip:opacity-100 transition-opacity"
                                          title="Delete transaction"
                                        >
                                          <Trash2 size={10} />
                                        </button>
                                      ) : (
                                        <Lock size={10} className="ml-1 text-gray-300" title="Irreversible (15+ days)" />
                                      )}
                                    </div>
                                  </div>
                                ))
                              ) : (
                                <span className="text-[10px] text-gray-300 italic py-1">No transactions</span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 align-top">
                            <div className="flex flex-col gap-1">
                              {items.slice(-2).map(exp => (
                                <div key={exp.id} className="text-[10px] text-gray-500 truncate max-w-[200px]" title={exp.description}>
                                  • {exp.description || 'No remark'}
                                </div>
                              ))}
                              {items.length > 2 && (
                                <span className="text-[9px] text-gray-300">+{items.length - 2} more</span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 align-top text-right">
                            <span className={`text-xs font-black font-mono ${total > 0 ? 'text-gray-900' : 'text-gray-300'}`}>
                              ₹{total.toLocaleString('en-IN')}
                            </span>
                          </td>
                          <td className="px-6 py-4 align-top text-center">
                            <div className="flex items-center justify-center gap-2 mt-0.5">
                              <input 
                                type="checkbox"
                                checked={!!auditedCategories[cat]}
                                onChange={() => toggleAudit(cat)}
                                className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer transition-all"
                              />
                              {auditedCategories[cat] && (
                                <CheckCircle2 size={12} className="text-emerald-500 animate-in zoom-in duration-200" />
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'payroll' && (
          <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-4 rounded-xl border border-gray-200">
              <h2 className="text-lg font-semibold text-gray-800">Payroll Management</h2>
              <div className="flex gap-2">
                <select 
                  value={selectedMonth} 
                  onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                  className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-primary"
                >
                  {Array.from({ length: 12 }, (_, i) => (
                    <option key={i+1} value={i+1}>{new Date(0, i).toLocaleString('default', { month: 'long' })}</option>
                  ))}
                </select>
                <select 
                  value={selectedYear} 
                  onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                  className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-primary"
                >
                  {[2023, 2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="p-4 bg-gray-50 border-b border-gray-200">
                <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wider">Active Employees</h3>
              </div>
              <table className="w-full text-left text-sm">
                <thead className="bg-white border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-4 font-bold text-gray-600 uppercase tracking-tighter text-[11px]">Employee</th>
                    <th className="px-6 py-4 font-bold text-gray-600 uppercase tracking-tighter text-[11px] text-center">Attendance</th>
                    <th className="px-6 py-4 font-bold text-gray-600 uppercase tracking-tighter text-[11px] text-center">Half Days</th>
                    <th className="px-6 py-4 font-bold text-gray-600 uppercase tracking-tighter text-[11px] text-center">Late</th>
                    <th className="px-6 py-4 font-bold text-gray-600 uppercase tracking-tighter text-[11px] text-center">Leaves</th>
                    <th className="px-6 py-4 font-bold text-gray-600 uppercase tracking-tighter text-[11px] text-right">Base Salary</th>
                    <th className="px-6 py-4 font-bold text-gray-600 uppercase tracking-tighter text-[11px] text-right">Payable</th>
                    <th className="px-6 py-4 font-bold text-gray-600 uppercase tracking-tighter text-[11px] text-center">Status</th>
                    <th className="px-6 py-4 font-bold text-gray-600 uppercase tracking-tighter text-[11px] text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {employees.map(emp => {
                    const processed = payrollHistory.find(p => p.user_id === emp.id);
                    return (
                      <tr key={emp.id} className="hover:bg-gray-50/80 transition-colors group/row">
                        <td className="px-6 py-4">
                          <div className="font-bold text-gray-900">{emp.name}</div>
                          <div className="text-[10px] text-gray-400 font-bold uppercase">{emp.department}</div>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className="font-bold text-gray-800">{emp.full_days || 0}</span>
                          <span className="text-[10px] text-gray-400 font-bold ml-1">/ {emp.total_days}</span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className={`font-bold ${emp.half_days > 0 ? 'text-orange-600' : 'text-gray-400'}`}>
                            {emp.half_days || 0}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <div className="flex flex-col items-center">
                            <span className={`font-bold ${emp.late_count > 0 ? 'text-red-500' : 'text-gray-400'}`}>
                              {emp.late_count || 0}
                            </span>
                            {emp.late_penalty_days > 0 && (
                              <span className="text-[9px] font-black text-red-400">-{emp.late_penalty_days}d</span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className={`font-bold ${emp.unpaid_leaves > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                            {emp.unpaid_leaves || 0}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right font-mono text-xs font-bold text-gray-600">
                          <div className="flex items-center justify-end gap-1">
                            <span>₹{parseFloat(emp.base_salary).toLocaleString('en-IN')}</span>
                            <button 
                              onClick={async () => {
                                const newSal = prompt('Enter new base salary:', emp.base_salary);
                                if (newSal !== null) {
                                  try {
                                    await api.put(`/accounting/payroll/employees/${emp.id}`, { base_salary: parseFloat(newSal) });
                                    toast.success('Salary updated');
                                    fetchPayrollData();
                                  } catch (err) {
                                    toast.error('Update failed');
                                  }
                                }
                              }}
                              className="text-gray-300 hover:text-primary opacity-0 group-hover/row:opacity-100 transition-opacity"
                            >
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                            </button>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right relative group">
                          <div className="font-black text-primary font-mono cursor-help">
                            ₹{Number(processed ? processed.net_paid : emp.suggested_salary || 0).toLocaleString('en-IN')}
                          </div>
                          
                          {/* Breakdown Tooltip */}
                          <div className="absolute bottom-full right-0 mb-2 w-48 bg-gray-900 text-white rounded-xl p-3 shadow-2xl opacity-0 group-hover:opacity-100 pointer-events-none transition-all z-50 transform translate-y-2 group-hover:translate-y-0">
                            <div className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2 border-b border-gray-700 pb-1">Salary Breakdown</div>
                            <div className="space-y-1.5">
                              <div className="flex justify-between text-[11px]">
                                <span className="text-gray-400">Full Days:</span>
                                <span className="font-bold">{emp.full_days}</span>
                              </div>
                              <div className="flex justify-between text-[11px]">
                                <span className="text-gray-400">Half Days (0.5):</span>
                                <span className="font-bold text-orange-400">{emp.half_days} ({emp.half_days * 0.5}d)</span>
                              </div>
                              <div className="flex justify-between text-[11px]">
                                <span className="text-gray-400">Paid Holidays:</span>
                                <span className="font-bold text-emerald-400">+{emp.paid_holidays}</span>
                              </div>
                              <div className="flex justify-between text-[11px]">
                                <span className="text-gray-400">Late Cut:</span>
                                <span className="font-bold text-red-400">-{emp.late_penalty_days}d</span>
                              </div>
                              <div className="flex justify-between text-[11px]">
                                <span className="text-gray-400">Unpaid Leaves:</span>
                                <span className="font-bold text-red-400">-{emp.unpaid_leaves}</span>
                              </div>
                              <div className="flex justify-between text-[11px] pt-1 border-t border-gray-700 mt-1">
                                <span className="font-black">Payable Days:</span>
                                <span className="font-black text-primary">{emp.payable_days}d</span>
                              </div>
                            </div>
                            <div className="absolute top-full right-4 w-2 h-2 bg-gray-900 transform rotate-45 -translate-y-1"></div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center">
                          {processed ? (
                            <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded text-[9px] font-black uppercase tracking-widest">Paid</span>
                          ) : (
                            <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-[9px] font-black uppercase tracking-widest">Pending</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-center">
                          {!processed && (
                            <button 
                              onClick={() => handleProcessPayroll(emp)}
                              className="bg-primary/10 hover:bg-primary text-primary hover:text-white px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all active:scale-95"
                            >
                              Process
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {/* Add Expense Modal */}
        {isAddModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-100 animate-in zoom-in-95 duration-300">
              <div className="p-6 border-b border-gray-50 flex justify-between items-center bg-gray-50/50">
                <div>
                  <h2 className="text-lg font-black text-gray-900">Add Office Expense</h2>
                  <p className="text-[10px] font-bold text-primary uppercase tracking-widest">{modalData.category}</p>
                </div>
                <button 
                  onClick={() => setIsAddModalOpen(false)}
                  className="p-2 hover:bg-white rounded-full transition-colors text-gray-400 hover:text-gray-600 shadow-sm"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleAddExpense} className="p-6 space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase ml-1">Amount (₹)</label>
                  <input 
                    type="number" required autoFocus
                    value={modalData.amount}
                    onChange={(e) => setModalData({...modalData, amount: e.target.value})}
                    placeholder="0.00"
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-primary focus:bg-white transition-all shadow-inner font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase ml-1">Date</label>
                  <input 
                    type="date" required
                    value={modalData.date}
                    onChange={(e) => setModalData({...modalData, date: e.target.value})}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-primary focus:bg-white transition-all shadow-inner"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase ml-1">Description</label>
                  <textarea 
                    value={modalData.description}
                    onChange={(e) => setModalData({...modalData, description: e.target.value})}
                    placeholder="Enter brief remarks..."
                    rows={3}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-primary focus:bg-white transition-all shadow-inner resize-none"
                  />
                </div>

                <div className="flex gap-4">
                  <div className="flex-1 space-y-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase ml-1">Receipt</label>
                    <label className="flex items-center justify-center w-full h-[46px] bg-gray-50 border border-gray-200 rounded-xl cursor-pointer hover:border-primary hover:text-primary transition-all shadow-inner group">
                      <Receipt size={16} className={modalData.receipt ? 'text-primary' : 'text-gray-400'} />
                      <span className="text-xs font-bold ml-2 truncate max-w-[150px]">
                        {modalData.receipt ? modalData.receipt.name : 'Attach Bill'}
                      </span>
                      <input 
                        type="file" 
                        onChange={(e) => setModalData({...modalData, receipt: e.target.files[0]})}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>

                <div className="pt-2">
                  <button 
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full h-12 bg-orange-600 text-white rounded-xl text-sm font-black uppercase tracking-widest shadow-lg shadow-orange-100 hover:bg-orange-700 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isSubmitting ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Saving...
                      </>
                    ) : (
                      'Save Transaction'
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {activeTab === 'expenses' && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
              <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                <TrendingUp size={18} className="text-emerald-500" />
                Recent Expense History
              </h3>
              <p className="text-[10px] font-bold text-gray-400 italic">Records older than 15 days are locked for auditing integrity</p>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50/30">
                    <th className="px-6 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">Date</th>
                    <th className="px-6 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">Category</th>
                    <th className="px-6 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">Description</th>
                    <th className="px-6 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Amount</th>
                    <th className="px-6 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {expenses.slice().sort((a,b) => new Date(b.date) - new Date(a.date)).slice(0, 20).map(exp => (
                    <tr key={exp.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-6 py-4 text-xs font-medium text-gray-500">
                        {new Date(exp.date).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4">
                        <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-[9px] font-black uppercase tracking-widest">
                          {exp.category}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs text-gray-600 italic">
                        {exp.description || '-'}
                      </td>
                      <td className="px-6 py-4 text-right font-mono text-xs font-black text-gray-900">
                        ₹{parseFloat(exp.amount).toLocaleString('en-IN')}
                      </td>
                      <td className="px-6 py-4 text-center">
                        {isDeletable(exp.date) ? (
                          <div className="flex items-center justify-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" title="Editable" />
                            <button 
                              onClick={() => handleDeleteExpense(exp.id, exp.date)}
                              className="text-gray-300 hover:text-red-500 transition-colors"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-center gap-2 text-gray-400">
                            <Lock size={12} />
                            <span className="text-[9px] font-bold uppercase">Locked</span>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                  {expenses.length === 0 && (
                    <tr>
                      <td colSpan="5" className="px-6 py-12 text-center text-gray-400 italic text-sm">
                        No recent history available
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

    </AppLayout>
  );
}
