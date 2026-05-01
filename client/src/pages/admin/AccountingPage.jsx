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
  ChevronRight, Activity, Receipt, Plus, Trash2, FileText, CheckCircle2
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

  // Project Health Data
  const [projectHealth, setProjectHealth] = useState([]);

  // Expenses Data
  const [expenses, setExpenses] = useState([]);
  const [newExpense, setNewExpense] = useState({ category: '', amount: '', date: new Date().toISOString().split('T')[0], description: '', project_id: '', receipt: null });
  const [projects, setProjects] = useState([]);

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
    if (activeTab === 'project-health') fetchProjectHealth();
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
      
      // Fetch vendor payments total to subtract from office expenses
      let vendorUrl = `/finances/summary?category=vendor_payment`;
      if (startDate) vendorUrl += `&start_date=${startDate}`;
      if (endDate) vendorUrl += `&end_date=${endDate}`;
      if (projectId) vendorUrl += `&project_id=${projectId}`;
      const { data: vendorData } = await api.get(vendorUrl);
      
      const vPay = parseFloat(vendorData.total_expense) || 0;
      const totalInc = parseFloat(data.total_income) || 0;
      const totalExp = (parseFloat(data.total_expense) || 0) - vPay;

      setSummary({
        totalIncome: totalInc,
        totalExpense: totalExp,
        netProfit: totalInc - totalExp
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

  const fetchProjectHealth = async () => {
    try {
      const { data } = await api.get('/reports/project-pnl');
      setProjectHealth(data);
    } catch (err) {
      toast.error('Failed to load project health report');
    }
  };

  const fetchExpenses = async () => {
    try {
      const { startDate, endDate, projectId } = filters;
      let url = `/finances/transactions?type=expense`;
      if (startDate) url += `&start_date=${startDate}`;
      if (endDate) url += `&end_date=${endDate}`;
      if (projectId) url += `&project_id=${projectId}`;
      
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
    
    const amountVal = parseFloat(newExpense.amount);
    if (isNaN(amountVal) || amountVal <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    if (!newExpense.category) {
      toast.error('Please select a category');
      return;
    }

    const formData = new FormData();
    formData.append('type', 'expense');
    formData.append('category', newExpense.category); 
    formData.append('amount', amountVal);
    formData.append('date', newExpense.date);
    formData.append('description', newExpense.description || '');
    
    if (newExpense.project_id) {
      formData.append('project_id', newExpense.project_id);
    }
    if (newExpense.receipt) {
      formData.append('receipt', newExpense.receipt);
    }

    try {
      await api.post('/finances/transactions', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      toast.success('Expense recorded');
      setNewExpense({ category: '', amount: '', date: new Date().toISOString().split('T')[0], description: '', project_id: '', receipt: null });
      fetchExpenses();
      fetchSummary();
    } catch (err) {
      console.error('Expense add error:', err.response?.data || err.message);
      toast.error(err.response?.data?.error || 'Failed to record expense');
    }
  };

  const handleDeleteExpense = async (id) => {
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
    const finalAmount = prompt(`Confirm payment amount for ${emp.name} (${emp.days_present} days present):`, suggested);
    
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

    const headers = ['Date', 'Category', 'Project', 'Vendor', 'Description', 'Amount'];
    const rows = expenses.map(exp => [
      new Date(exp.date).toLocaleDateString(),
      exp.category,
      exp.project_name || 'Global',
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
            {['summary', 'project-health', 'payroll', 'expenses'].map((tab) => (
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
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                  <ArrowUpRight size={48} className="text-green-600" />
                </div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Total Income</p>
                <div className="flex items-baseline gap-2 mt-2">
                  <h3 className="text-3xl font-black text-green-600">₹{(summary.totalIncome || 0).toLocaleString('en-IN')}</h3>
                </div>
                <div className="mt-4 flex items-center gap-1 text-[10px] font-bold text-green-600 bg-green-50 w-fit px-2 py-0.5 rounded-full">
                  <TrendingUp size={10} />
                  <span>Real-time Inward</span>
                </div>
              </div>

              <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                  <ArrowDownRight size={48} className="text-red-500" />
                </div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Total Expenses</p>
                <div className="flex items-baseline gap-2 mt-2">
                  <h3 className="text-3xl font-black text-red-500">₹{(summary.totalExpense || 0).toLocaleString('en-IN')}</h3>
                </div>
                <div className="mt-4 flex items-center gap-1 text-[10px] font-bold text-red-500 bg-red-50 w-fit px-2 py-0.5 rounded-full">
                  <TrendingDown size={10} />
                  <span>Operational Outflow</span>
                </div>
              </div>

              <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                  <Activity size={48} className={summary.netProfit >= 0 ? 'text-blue-600' : 'text-red-600'} />
                </div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Net Profit / Balance</p>
                <div className="flex items-baseline gap-2 mt-2">
                  <h3 className={`text-3xl font-black ${summary.netProfit >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                    ₹{(summary.netProfit || 0).toLocaleString('en-IN')}
                  </h3>
                </div>
                <div className={`mt-4 flex items-center gap-1 text-[10px] font-bold ${summary.netProfit >= 0 ? 'text-blue-600 bg-blue-50' : 'text-red-600 bg-red-50'} w-fit px-2 py-0.5 rounded-full`}>
                  <Activity size={10} />
                  <span>Financial Health</span>
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

        {activeTab === 'project-health' && (
          <div className="space-y-4 animate-in slide-in-from-bottom-4 duration-500">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {projectHealth.map(proj => (
                <div key={proj.id} className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm hover:border-primary/30 transition-all group">
                  <div className="flex justify-between items-start mb-4">
                    <div className="min-w-0">
                      <h3 className="text-sm font-black text-gray-900 truncate group-hover:text-primary transition-colors">{proj.name}</h3>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">{proj.client_name}</p>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest ${
                      proj.status === 'completed' ? 'bg-green-100 text-green-700' : 
                      proj.status === 'execution' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {proj.status}
                    </span>
                  </div>

                  <div className="space-y-3">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-gray-500 font-medium">Invoiced Income</span>
                      <span className="font-bold text-green-600">₹{parseFloat(proj.total_income).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-gray-500 font-medium">Direct Expenses</span>
                      <span className="font-bold text-red-500">₹{parseFloat(proj.total_expense).toLocaleString()}</span>
                    </div>
                    <div className="pt-2 border-t border-gray-50 flex justify-between items-center">
                      <span className="text-xs font-black text-gray-800 uppercase tracking-tighter">Gross Profit</span>
                      <span className={`text-sm font-black ${proj.net_profit >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                        ₹{parseFloat(proj.net_profit).toLocaleString()}
                      </span>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 flex justify-end border-t border-gray-50">
                    <button 
                      onClick={() => {
                        setFilters({ ...filters, projectId: proj.id.toString() });
                        setActiveTab('summary');
                      }}
                      className="text-[10px] font-black text-primary uppercase tracking-widest flex items-center gap-1 hover:gap-2 transition-all"
                    >
                      View Detailed P&L <ChevronRight size={12} />
                    </button>
                  </div>
                </div>
              ))}
              {projectHealth.length === 0 && (
                <div className="col-span-full py-20 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center text-gray-400">
                  <Activity size={48} className="mb-4 opacity-20" />
                  <p className="text-sm font-bold uppercase tracking-widest">No project data found</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'expenses' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            
            {/* Quick Log Section */}
            <div className="bg-gray-50/50 border-2 border-dashed border-gray-200 rounded-2xl p-6">
              <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
                <Plus size={18} className="text-primary" />
                Quick Log Expense
              </h3>
              
              <form onSubmit={handleAddExpense} className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-6 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase ml-1">Category</label>
                  <select 
                    required
                    value={newExpense.category}
                    onChange={(e) => setNewExpense({...newExpense, category: e.target.value})}
                    className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-primary shadow-sm"
                  >
                    <option value="">Select</option>
                    {EXPENSE_CATEGORIES.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase ml-1">Amount (₹)</label>
                  <input 
                    type="number" required
                    value={newExpense.amount}
                    onChange={(e) => setNewExpense({...newExpense, amount: e.target.value})}
                    placeholder="0.00"
                    className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-primary shadow-sm font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase ml-1">Date</label>
                  <input 
                    type="date" required
                    value={newExpense.date}
                    onChange={(e) => setNewExpense({...newExpense, date: e.target.value})}
                    className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-primary shadow-sm"
                  />
                </div>

                <div className="space-y-1 lg:col-span-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase ml-1">Project</label>
                  <select 
                    value={newExpense.project_id}
                    onChange={(e) => setNewExpense({...newExpense, project_id: e.target.value})}
                    className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-primary shadow-sm"
                  >
                    <option value="">None (Office)</option>
                    {projects.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1 lg:col-span-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase ml-1">Description</label>
                  <input 
                    type="text"
                    value={newExpense.description}
                    onChange={(e) => setNewExpense({...newExpense, description: e.target.value})}
                    placeholder="Brief note..."
                    className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs outline-none focus:border-primary shadow-sm"
                  />
                </div>

                <div className="flex items-end gap-2">
                  <div className="flex-1 space-y-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase ml-1">Receipt</label>
                    <label className="flex items-center justify-center h-[34px] bg-white border border-gray-200 rounded-lg cursor-pointer hover:border-primary hover:text-primary transition-all shadow-sm">
                      <Receipt size={14} className={newExpense.receipt ? 'text-primary' : 'text-gray-400'} />
                      <span className="text-[10px] font-bold ml-1 truncate max-w-[50px]">
                        {newExpense.receipt ? 'File' : 'Link'}
                      </span>
                      <input 
                        type="file" 
                        onChange={(e) => setNewExpense({...newExpense, receipt: e.target.files[0]})}
                        className="hidden"
                      />
                    </label>
                  </div>
                  <button 
                    type="submit"
                    className="h-[34px] px-4 bg-primary text-white rounded-lg text-xs font-bold shadow-lg shadow-orange-100 hover:bg-primary-dark transition-all active:scale-95 whitespace-nowrap"
                  >
                    Log
                  </button>
                </div>
              </form>
            </div>

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
                            <span className="text-xs font-bold text-gray-700 block mt-1">{cat}</span>
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
                                      <button 
                                        onClick={() => handleDeleteExpense(exp.id)}
                                        className="ml-1 text-gray-300 hover:text-red-500 opacity-0 group-hover/chip:opacity-100 transition-opacity"
                                      >
                                        <Trash2 size={10} />
                                      </button>
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
                    <th className="px-6 py-4 font-semibold text-gray-600">Employee</th>
                    <th className="px-6 py-4 font-semibold text-gray-600">Department</th>
                    <th className="px-6 py-4 font-semibold text-gray-600 text-center">Attendance</th>
                    <th className="px-6 py-4 font-semibold text-gray-600 text-right">Base Salary</th>
                    <th className="px-6 py-4 font-semibold text-gray-600 text-right">Payable (Suggested)</th>
                    <th className="px-6 py-4 font-semibold text-gray-600 text-center">Status</th>
                    <th className="px-6 py-4 font-semibold text-gray-600 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {employees.map(emp => {
                    const processed = payrollHistory.find(p => p.user_id === emp.id);
                    return (
                      <tr key={emp.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 font-medium text-gray-900">{emp.name}</td>
                        <td className="px-6 py-4 text-gray-600">{emp.department}</td>
                        <td className="px-6 py-4 text-center">
                          <div className="flex flex-col items-center">
                            <span className="font-bold text-gray-800">{emp.days_present || 0}</span>
                            <span className="text-[10px] text-gray-400 uppercase tracking-tighter">of {emp.total_days} days</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right font-mono">
                          <div className="flex items-center justify-end gap-2">
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
                              className="text-gray-300 hover:text-primary"
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                            </button>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right font-mono font-bold text-primary">
                          ₹{(processed ? processed.net_paid : emp.suggested_salary).toLocaleString('en-IN')}
                        </td>
                        <td className="px-6 py-4 text-center">
                          {processed ? (
                            <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-[10px] font-bold uppercase tracking-wide">Paid</span>
                          ) : (
                            <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full text-[10px] font-bold uppercase tracking-wide">Pending</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-center">
                          {!processed && (
                            <button 
                              onClick={() => handleProcessPayroll(emp)}
                              className="text-primary hover:underline text-xs font-bold uppercase tracking-wider"
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
      </div>

    </AppLayout>
  );
}
