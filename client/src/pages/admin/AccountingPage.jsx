import React, { useState, useEffect, useMemo } from 'react';
import AppLayout from '../../components/layout/AppLayout';
import api from '../../api/client';
import toast from 'react-hot-toast';
import { timeAgo } from '../../utils/time';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';
import { 
  TrendingUp, TrendingDown, IndianRupee, Briefcase, 
  Download, Calendar, Filter, ArrowUpRight, ArrowDownRight,
  Activity, Receipt, Trash2, FileText, CheckCircle2, Plus, X, Lock,
  LayoutList, LayoutDashboard, CreditCard, Clock, Search
} from 'lucide-react';
import FinancialBreakdownModal from '../../components/dashboard/FinancialBreakdownModal';

const EXPENSE_CATEGORIES = [
  "Mobile Bill",
  "Electric Bill",
  "Rent",
  "Bank installments",
  "Office maintenance",
  "Stationary",
  "Printer Agency Payment",
  "Liasoning Agency Payment",
  "Computer Maintainence",
  "Travel Convinience",
  "Other 1",
  "Other 2",
  "Other 3",
  "Other 4",
  "Other 5",
  "Incentives",
  "Salaries"
];

const getExtensionCategory = (ext) => {
  ext = ext.toLowerCase();
  if (['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tiff', '.svg', '.heic'].includes(ext)) return 'image';
  if (['.pdf'].includes(ext)) return 'pdf';
  if (['.doc', '.docx', '.xls', '.xlsx', '.csv', '.ppt', '.pptx', '.txt', '.rtf'].includes(ext)) return 'office';
  return 'default';
};

const getReceiptIcon = (fileName) => {
  if (!fileName) return null;
  const parts = fileName.split('.');
  const ext = parts.length > 1 ? '.' + parts.pop().toLowerCase() : '';
  const category = getExtensionCategory(ext);
  
  const icons = {
    pdf: { color: 'text-red-500', icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="15" x2="12" y2="15"/></svg>
    )},
    office: { color: 'text-blue-600', icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M8 13h2"/><path d="M8 17h2"/><path d="M14 13h2"/><path d="M14 17h2"/></svg>
    )},
    image: { color: 'text-pink-500', icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
    )},
    default: { color: 'text-slate-400', icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>
    )}
  };
  
  return icons[category] || icons.default;
};

export default function AccountingPage() {
  const [activeTab, setActiveTab] = useState('summary');
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [filters, setFilters] = useState({
    startDate: '',
    endDate: '',
    projectId: ''
  });
  const [rowIncentives, setRowIncentives] = useState({});
  const [isProcessing, setIsProcessing] = useState({});

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

  // Invoices Data
  const [invoices, setInvoices] = useState([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [invoiceFilter, setInvoiceFilter] = useState('all'); // 'all', 'generated', 'draft'

  const filteredInvoicesList = useMemo(() => {
    if (invoiceFilter === 'generated') {
      return invoices.filter(inv => inv.status !== 'draft');
    }
    if (invoiceFilter === 'draft') {
      return invoices.filter(inv => inv.status === 'draft');
    }
    return invoices;
  }, [invoices, invoiceFilter]);

  const [projects, setProjects] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [viewType, setViewType] = useState('table'); // table or kanban
  const [modalData, setModalData] = useState({ category: '', amount: '', date: new Date().toISOString().split('T')[0], description: '', receipt: null, projectId: '' });
  const [financialModal, setFinancialModal] = useState({ isOpen: false, type: '', label: '' });

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
      // 1. Filter by selected month and year
      const expDate = new Date(exp.date);
      const expMonth = expDate.getMonth() + 1;
      const expYear = expDate.getFullYear();
      if (expMonth !== selectedMonth || expYear !== selectedYear) {
        return;
      }

      // 2. Normalize category name casing/plurality
      let cat = exp.category || 'Miscellaneous';
      const trimmedLower = cat.trim().toLowerCase();
      if (trimmedLower === 'salary' || trimmedLower === 'salaries') {
        cat = 'Salaries';
      } else if (trimmedLower === 'incentive' || trimmedLower === 'incentives') {
        cat = 'Incentives';
      } else {
        // Find match in EXPENSE_CATEGORIES case-insensitively
        const match = EXPENSE_CATEGORIES.find(c => c.toLowerCase() === trimmedLower);
        if (match) {
          cat = match;
        }
      }

      if (!groups[cat]) groups[cat] = [];
      groups[cat].push({
        ...exp,
        category: cat // Use normalized category
      });
    });
    return groups;
  }, [expenses, selectedMonth, selectedYear]);

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
    if (activeTab === 'invoices') fetchInvoices();

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
        currentProjectValue: data.current_project_value,
        billedIncome: data.billed_income,
        receivedIncome: data.received_income,
        pendingIncome: data.pending_income,
        unbilledIncome: data.unbilled_income,
        totalIncentives: data.total_incentives || 0,
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
      const { startDate, endDate, projectId } = filters;
      let url = `/finances/charts?`;
      if (startDate) url += `&start_date=${startDate}`;
      if (endDate) url += `&end_date=${endDate}`;
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

  const fetchInvoices = async () => {
    setLoadingInvoices(true);
    try {
      const { data } = await api.get('/invoices', {
        params: {
          project_id: filters.projectId || undefined,
          start_date: filters.startDate || undefined,
          end_date: filters.endDate || undefined,
          limit: 100
        }
      });
      setInvoices(data.invoices || []);
    } catch (err) {
      console.error('Failed to load invoices', err);
      toast.error('Failed to load invoices');
    } finally {
      setLoadingInvoices(false);
    }
  };

  const handleMarkPaid = async (id) => {
    if (!window.confirm('Are you sure you want to mark this invoice as Paid? This will automatically record a finance income transaction.')) return;
    try {
      await api.post(`/invoices/${id}/mark-paid`);
      toast.success('Invoice marked as paid and income recorded!');
      fetchInvoices();
      fetchSummary();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to mark invoice as paid');
    }
  };



  const handleAddExpense = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!modalData.category) {
      toast.error('Please select a category');
      return;
    }

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
    
    if (modalData.projectId) {
      formData.append('project_id', modalData.projectId);
    }
    
    if (modalData.receipt) {
      formData.append('receipt', modalData.receipt);
    }

    try {
      await api.post('/finances/transactions', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      toast.success('Expense recorded');
      setModalData({ category: '', amount: '', date: new Date().toISOString().split('T')[0], description: '', receipt: null, projectId: '' });
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

  const handleProcessPayroll = async (emp, manualIncentive = null) => {
    const suggested = emp.suggested_salary;
    const isManual = manualIncentive !== null;
    
    let incentiveAmount = isManual ? manualIncentive : '0';
    let finalAmount = suggested + parseFloat(incentiveAmount || 0);

    if (!isManual) {
      const isHourly = parseFloat(emp.hourly_rate) > 0;
      const breakdown = isHourly 
        ? `
        Hourly Rate: ₹${emp.hourly_rate}
        Total Hours: ${emp.total_hours}h
        Calculation: ₹${emp.hourly_rate} * ${emp.total_hours}
      `
        : `
        Full Days: ${emp.full_days}
        Half Days: ${emp.half_days} (${emp.half_days * 0.5}d)
        Late Penalty: -${emp.late_penalty_days}d
        Unpaid Leaves: -${emp.unpaid_leaves}
        Paid Holidays: +${emp.paid_holidays}
        Final Payable Days: ${emp.payable_days}
      `;
      incentiveAmount = prompt(`Enter Incentives for ${emp.name} (optional):`, '0');
      if (incentiveAmount === null) return;

      finalAmount = prompt(`Confirm payment for ${emp.name}:\n${breakdown}\nIncentive: ₹${incentiveAmount}\nSuggested Amount:`, (emp.suggested_salary + parseFloat(incentiveAmount || 0)));
      if (finalAmount === null) return;
    }

    setIsProcessing(prev => ({ ...prev, [emp.id]: true }));


    try {
      // 1. Save to payroll table (legacy/detail)
      await api.post('/accounting/payroll', {
        user_id: emp.id,
        base_salary: emp.base_salary,
        bonus: 0,
        incentives: parseFloat(incentiveAmount) || 0,
        deductions: 0,
        net_paid: parseFloat(finalAmount),
        month: selectedMonth,
        year: selectedYear,
        status: 'paid'
      });

      // 2. Refresh local data
      toast.success(`Payroll processed for ${emp.name}`);
      fetchPayrollData();
      fetchSummary();
      fetchExpenses(); // Added to refresh the expense matrix
    } catch (err) {
      toast.error('Failed to process payroll');
    } finally {
      setIsProcessing(prev => ({ ...prev, [emp.id]: false }));
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
            {['summary', 'payroll', 'expenses', 'invoices'].map((tab) => (
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
              <div 
                className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm relative overflow-hidden group cursor-pointer hover:shadow-md hover:border-gray-200 transition-all active:scale-[0.98]"
                onClick={() => setFinancialModal({ isOpen: true, type: 'total', label: 'Total Project Value' })}
              >
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Total Project Value</p>
                <h3 className="text-xl font-black text-gray-900 mt-2">₹{(Number(summary.totalIncome) || 0).toLocaleString('en-IN')}</h3>
                <div className="absolute top-0 right-0 p-3 opacity-5 group-hover:opacity-10 transition-opacity">
                  <Briefcase size={40} />
                </div>
              </div>

              {/* Box 2: Current Project Value */}
              <div 
                className="bg-white p-5 rounded-xl border border-purple-100 shadow-sm relative overflow-hidden group cursor-pointer hover:shadow-md hover:border-purple-200 transition-all active:scale-[0.98]"
                onClick={() => setFinancialModal({ isOpen: true, type: 'current', label: 'Current Project Value' })}
              >
                <p className="text-[10px] font-bold text-purple-500 uppercase tracking-widest">Current Project Value</p>
                <h3 className="text-xl font-black text-purple-600 mt-2">₹{(Number(summary.currentProjectValue) || 0).toLocaleString('en-IN')}</h3>
                <div className="absolute top-0 right-0 p-3 opacity-5 text-purple-600 group-hover:opacity-10 transition-opacity">
                  <IndianRupee size={40} />
                </div>
              </div>

              {/* Box 3: Billed Amount */}
              <div 
                className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm relative overflow-hidden group cursor-pointer hover:shadow-md hover:border-blue-200 transition-all active:scale-[0.98]"
                onClick={() => setFinancialModal({ isOpen: true, type: 'billed', label: 'Billed Amount' })}
              >
                <p className="text-[10px] font-bold text-blue-500 uppercase tracking-widest">Billed Amount</p>
                <h3 className="text-xl font-black text-blue-600 mt-2">₹{(Number(summary.billedIncome) || 0).toLocaleString('en-IN')}</h3>
                <div className="absolute top-0 right-0 p-3 opacity-5 text-blue-600 group-hover:opacity-10 transition-opacity">
                  <FileText size={40} />
                </div>
              </div>

              {/* Box 4: Unbilled Amount */}
              <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm relative overflow-hidden group">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Unbilled Amount</p>
                <h3 className="text-xl font-black text-gray-600 mt-2">₹{(Number(summary.unbilledIncome) || 0).toLocaleString('en-IN')}</h3>
                <div className="absolute top-0 right-0 p-3 opacity-5">
                  <TrendingUp size={40} />
                </div>
              </div>

              {/* Box 5: Received Amount */}
              <div 
                className="bg-white p-5 rounded-xl border border-emerald-100 shadow-sm relative overflow-hidden group cursor-pointer hover:shadow-md hover:border-emerald-200 transition-all active:scale-[0.98]"
                onClick={() => setFinancialModal({ isOpen: true, type: 'received', label: 'Received Amount' })}
              >
                <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">Received Amount</p>
                <h3 className="text-xl font-black text-emerald-600 mt-2">₹{(Number(summary.receivedIncome) || 0).toLocaleString('en-IN')}</h3>
                <div className="absolute top-0 right-0 p-3 opacity-10 text-emerald-600 group-hover:opacity-20 transition-opacity">
                  <CheckCircle2 size={40} />
                </div>
              </div>

              {/* Box 6: Pending Amount */}
              <div 
                className="bg-white p-5 rounded-xl border border-orange-100 shadow-sm relative overflow-hidden group cursor-pointer hover:shadow-md hover:border-orange-200 transition-all active:scale-[0.98]"
                onClick={() => setFinancialModal({ isOpen: true, type: 'pending', label: 'Pending Amount' })}
              >
                <p className="text-[10px] font-bold text-orange-500 uppercase tracking-widest">Pending Amount</p>
                <h3 className="text-xl font-black text-orange-600 mt-2">₹{(Number(summary.pendingIncome) || 0).toLocaleString('en-IN')}</h3>
                <div className="absolute top-0 right-0 p-3 opacity-10 text-orange-500 group-hover:opacity-20 transition-opacity">
                  <Activity size={40} />
                </div>
              </div>

              {/* Box 7: Total Expenses */}
              <div 
                className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm relative overflow-hidden group cursor-pointer hover:shadow-md hover:border-red-200 transition-all active:scale-[0.98]"
                onClick={() => setFinancialModal({ isOpen: true, type: 'expenses', label: 'Total Expenses' })}
              >
                <p className="text-[10px] font-bold text-red-400 uppercase tracking-widest">Total Expenses</p>
                <h3 className="text-xl font-black text-red-500 mt-2">₹{(summary.totalExpense || 0).toLocaleString('en-IN')}</h3>
                <p className="text-[10px] text-muted mt-1 italic">Excl. vendor payments</p>
                <div className="absolute top-0 right-0 p-3 opacity-5 text-red-500">
                  <ArrowDownRight size={40} />
                </div>
              </div>

              {/* Box 8: Incentives */}
              <div className="bg-white p-5 rounded-xl border border-purple-100 shadow-sm relative overflow-hidden group">
                <p className="text-[10px] font-bold text-purple-600 uppercase tracking-widest">Incentives Paid</p>
                <h3 className="text-xl font-black text-purple-600 mt-2">₹{(Number(summary.totalIncentives) || 0).toLocaleString('en-IN')}</h3>
                <div className="absolute top-0 right-0 p-3 opacity-10 text-purple-600">
                  <TrendingUp size={40} />
                </div>
              </div>

              {/* Box 9: Profit & Loss */}
              <div className="bg-white p-5 rounded-xl border border-blue-100 shadow-sm relative overflow-hidden group md:col-span-2">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">Profit & Loss (Realized)</p>
                    <div className="flex items-baseline gap-3 mt-2">
                      <h3 className={`text-xl font-black ${((summary.receivedIncome || 0) - (summary.totalExpense || 0)) >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
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
                        <YAxis
                          axisLine={false}
                          tickLine={false}
                          tick={{ fontSize: 10, fontWeight: 600, fill: '#999' }}
                          tickFormatter={(v) => v >= 100000 ? `₹${(v / 100000).toFixed(1)}L` : v >= 1000 ? `₹${(v / 1000).toFixed(0)}K` : `₹${v}`}
                        />
                        <Tooltip
                          contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '12px' }}
                          cursor={{ fill: '#f8fafc' }}
                          formatter={(value, name) => [`₹${Number(value).toLocaleString('en-IN')}`, name.charAt(0).toUpperCase() + name.slice(1)]}
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
                            <Tooltip
                              contentStyle={{ borderRadius: '10px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '12px' }}
                              formatter={(value, name) => [`₹${Number(value).toLocaleString('en-IN')}`, name]}
                            />
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
            {/* Inline Expense Entry Card */}
            <div className="card bg-gray-50/50 border-dashed border-2 p-6 rounded-2xl">
              <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                Record Office Expense
              </h3>
              <form onSubmit={handleAddExpense} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Expense Category</label>
                    <select 
                      className="input w-full text-sm h-[38px] cursor-pointer" 
                      value={modalData.category} 
                      onChange={e => setModalData({ ...modalData, category: e.target.value })} 
                      required
                    >
                      <option value="">-- Select Category --</option>
                      {EXPENSE_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Amount (₹)</label>
                    <input 
                      type="number" 
                      placeholder="0.00" 
                      value={modalData.amount} 
                      onChange={e => setModalData({ ...modalData, amount: e.target.value })} 
                      className="input w-full text-sm h-[38px] font-mono" 
                      required 
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Date</label>
                    <input 
                      type="date" 
                      value={modalData.date} 
                      onChange={e => setModalData({ ...modalData, date: e.target.value })} 
                      className="input w-full text-sm h-[38px]" 
                      required 
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Project (Optional)</label>
                    <select 
                      className="input w-full text-sm h-[38px] cursor-pointer" 
                      value={modalData.projectId} 
                      onChange={e => setModalData({ ...modalData, projectId: e.target.value })}
                    >
                      <option value="">-- General Expense --</option>
                      {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Receipt (Optional)</label>
                    <input 
                      type="file" 
                      onChange={e => setModalData({ ...modalData, receipt: e.target.files[0] })} 
                      className="input w-full text-sm h-[38px] p-1 cursor-pointer" 
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Description / Remark</label>
                    <input 
                      type="text" 
                      value={modalData.description} 
                      onChange={e => setModalData({ ...modalData, description: e.target.value })} 
                      placeholder="Add a remark..." 
                      className="input w-full text-sm h-[38px]" 
                    />
                  </div>
                </div>
                <div className="flex justify-end pt-2">
                  <button 
                    type="submit" 
                    disabled={isSubmitting} 
                    className="btn-primary"
                  >
                    {isSubmitting ? (
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Recording...
                      </div>
                    ) : 'Record Expense'}
                  </button>
                </div>
              </form>
            </div>

            {/* Expense Matrix */}
            <div className="card p-0 overflow-hidden border-[#EBEBEB]">
              <div className="p-4 border-b border-[#EBEBEB] flex items-center justify-between bg-white">
                <h3 className="text-sm font-bold flex items-center gap-2">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>
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
                  <span className="badge badge-in-progress">
                    {Object.values(groupedExpenses).reduce((sum, list) => sum + list.length, 0)} Records this Month
                  </span>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50/80 border-b border-[#EBEBEB]">
                      <th className="py-3 px-4 text-[10px] font-bold text-muted uppercase w-10">#</th>
                      <th className="py-3 px-4 text-[10px] font-bold text-muted uppercase w-[20%]">Category</th>
                      <th className="py-3 px-4 text-[10px] font-bold text-muted uppercase w-[35%]">Transactions</th>
                      <th className="py-3 px-4 text-[10px] font-bold text-muted uppercase w-[25%]">Remarks</th>
                      <th className="py-3 px-4 text-[10px] font-bold text-muted uppercase w-[15%] text-right">Total Amount</th>
                      <th className="py-3 px-4 text-[10px] font-bold text-muted uppercase w-10 text-center">✔</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EBEBEB]">
                    {EXPENSE_CATEGORIES.map((cat, idx) => {
                      const items = groupedExpenses[cat] || [];
                      const total = categoryTotals[cat] || 0;

                      return (
                        <tr key={cat} className="hover:bg-gray-50/30 transition-colors">
                          <td className="py-3 px-4 align-top text-[10px] text-muted font-bold">{idx + 1}</td>
                          <td className="py-3 px-4 align-top text-xs font-medium text-slate-800">
                            <div className="flex items-center gap-2 mt-0.5">
                              <span>{cat}</span>
                              <button 
                                onClick={() => {
                                  setModalData({ ...modalData, category: cat });
                                  window.scrollTo({ top: 180, behavior: 'smooth' });
                                  toast.success(`Selected ${cat} category in form above.`);
                                }}
                                className="w-5 h-5 rounded bg-orange-100 hover:bg-orange-200 text-orange-600 flex items-center justify-center transition-all"
                                title={`Record ${cat} Expense`}
                              >
                                <Plus size={12} strokeWidth={3} />
                              </button>
                            </div>
                          </td>
                          <td className="py-3 px-4 align-top">
                            <div className="space-y-3">
                              {items.length > 0 ? items.map(exp => {
                                const isSys = exp.source === 'payroll';
                                const canDel = isDeletable(exp.date) && !isSys;
                                const receiptIconData = getReceiptIcon(exp.receipt_url);

                                return (
                                  <div key={exp.id} className="flex flex-col gap-1 group">
                                    <div className="flex items-center gap-2">
                                      {exp.receipt_url ? (
                                        <span className={receiptIconData.color}>{receiptIconData.icon}</span>
                                      ) : (
                                        <span className="text-gray-400">
                                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                                        </span>
                                      )}
                                      <span className="text-xs font-bold text-slate-800">₹{parseFloat(exp.amount).toLocaleString('en-IN')}</span>
                                      <span className="text-[10px] text-muted">({new Date(exp.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })})</span>
                                      
                                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        {exp.receipt_url && (
                                          <a 
                                            href={`${import.meta.env.VITE_API_URL || ''}${exp.receipt_url}`} 
                                            target="_blank" 
                                            rel="noopener noreferrer"
                                            className="p-1 hover:text-[#E05A1E]"
                                            title="View receipt"
                                          >
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                                          </a>
                                        )}
                                        {canDel && (
                                          <button 
                                            onClick={() => handleDeleteExpense(exp.id, exp.date)} 
                                            className="p-1 hover:text-red-500"
                                            title="Delete transaction"
                                          >
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                                          </button>
                                        )}
                                        {!canDel && (
                                          <span className="text-gray-300" title={isSys ? "System Generated (Payroll)" : "Irreversible (15+ days)"}>
                                            <Lock size={10} />
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2 text-[10px] text-muted pl-5">
                                      {exp.creator_name && <span>by {exp.creator_name}</span>}
                                      {exp.creator_name && <span>•</span>}
                                      <span>{timeAgo(exp.created_at || exp.date)}</span>
                                      {exp.project_name && (
                                        <>
                                          <span>•</span>
                                          <span className="text-primary font-medium" title={`Tagged to Project: ${exp.project_name}`}>
                                            {exp.project_name}
                                          </span>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                );
                              }) : <span className="text-[10px] text-slate-300 italic font-normal">No transactions</span>}
                            </div>
                          </td>
                          <td className="py-3 px-4 align-top">
                            <div className="space-y-3 pl-1">
                              {items.length > 0 ? items.map(exp => (
                                <div key={exp.id} className="text-[10px] text-slate-500 truncate h-8 flex items-center" title={exp.description || 'No remark'}>
                                  {exp.description || '-'}
                                </div>
                              )) : '-'}
                            </div>
                          </td>
                          <td className="py-3 px-4 align-top text-right text-xs font-black font-mono text-slate-800">
                            ₹ {total.toLocaleString('en-IN')}
                          </td>
                          <td className="py-3 px-4 text-center align-top">
                            <div className="flex flex-col items-center justify-center gap-1 mt-0.5">
                              <input 
                                type="checkbox" 
                                checked={!!auditedCategories[cat]} 
                                onChange={() => toggleAudit(cat)} 
                                className="w-4 h-4 rounded border-gray-300 text-[#E05A1E] focus:ring-[#E05A1E] cursor-pointer" 
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
                  <tfoot className="bg-gray-50 font-bold border-t-2 border-[#EBEBEB]">
                    <tr>
                      <td className="py-3 px-4" colSpan={3}><div className="text-right text-[10px] uppercase text-muted">Grand Total</div></td>
                      <td className="py-3 px-4"></td>
                      <td className="py-3 px-4 text-right text-sm text-[#E05A1E] font-mono font-black">
                        ₹ {Object.values(categoryTotals).reduce((sum, val) => sum + val, 0).toLocaleString('en-IN')}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'payroll' && (
          <div className="space-y-6 animate-in fade-in duration-500">
            {/* Payroll Header & Month Picker */}
            <div className="flex flex-col gap-6 bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-primary/10 rounded-xl text-primary">
                    <CreditCard size={24} />
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-gray-900 tracking-tight">Active Monthly Payroll</h2>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Processing salaries for all departments</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex bg-gray-100 p-1 rounded-xl mr-2">
                    <button 
                      onClick={() => setViewType('table')}
                      className={`p-1.5 rounded-lg transition-all ${viewType === 'table' ? 'bg-white shadow-sm text-primary' : 'text-gray-400 hover:text-gray-600'}`}
                      title="Table View"
                    >
                      <LayoutList size={18} />
                    </button>
                    <button 
                      onClick={() => setViewType('kanban')}
                      className={`p-1.5 rounded-lg transition-all ${viewType === 'kanban' ? 'bg-white shadow-sm text-primary' : 'text-gray-400 hover:text-gray-600'}`}
                      title="Kanban View"
                    >
                      <LayoutDashboard size={18} />
                    </button>
                  </div>
                  <div className="flex items-center gap-2 bg-gray-50 border border-gray-100 px-3 py-2 rounded-xl">
                    <Calendar size={16} className="text-gray-400" />
                    <select 
                      value={selectedMonth}
                      onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                      className="bg-transparent text-sm font-bold outline-none cursor-pointer"
                    >
                      {Array.from({ length: 12 }, (_, i) => (
                        <option key={i + 1} value={i + 1}>{new Date(0, i).toLocaleString('default', { month: 'long' })}</option>
                      ))}
                    </select>
                    <select 
                      value={selectedYear}
                      onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                      className="bg-transparent text-sm font-bold outline-none cursor-pointer border-l border-gray-200 pl-2"
                    >
                      {[2024, 2025, 2026].map(y => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Search & Progress Bar */}
              <div className="flex flex-col md:flex-row items-center gap-6 pt-4 border-t border-gray-50">
                <div className="relative flex-1 group w-full">
                  <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-primary transition-colors" />
                  <input 
                    type="text"
                    placeholder="Search by name or department..."
                    value={filters.payrollSearch || ''}
                    onChange={(e) => setFilters({...filters, payrollSearch: e.target.value})}
                    className="w-full bg-gray-50 border border-gray-100 rounded-xl pl-11 pr-4 py-3 text-sm outline-none focus:bg-white focus:border-primary/30 transition-all shadow-inner"
                  />
                </div>

                <div className="flex-1 w-full space-y-2">
                  <div className="flex justify-between items-end">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Disbursement Progress</p>
                    <p className="text-xs font-black text-primary font-mono">{payrollHistory.length} / {employees.length}</p>
                  </div>
                  <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden shadow-inner">
                    <div 
                      className="h-full bg-primary transition-all duration-1000 ease-out shadow-[0_0_10px_rgba(224,90,30,0.3)]"
                      style={{ width: `${(payrollHistory.length / (employees.length || 1)) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {viewType === 'kanban' ? (
              /* Kanban View */
              <>
                <div className="flex flex-col bg-slate-50 border border-slate-200 rounded-2xl overflow-hidden shadow-inner max-w-2xl mx-auto w-full h-[calc(100vh-420px)]">
                  <div className="p-4 border-b border-slate-200 bg-white flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                      <h3 className="text-xs font-black text-slate-700 uppercase tracking-widest">Pending Payment</h3>
                    </div>
                    <span className="px-2 py-0.5 bg-slate-100 rounded-full text-[10px] font-bold text-slate-400 border border-slate-200">
                      {employees.filter(emp => !payrollHistory.some(p => p.user_id === emp.id)).length}
                    </span>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                    {employees
                      .filter(emp => !payrollHistory.some(p => p.user_id === emp.id))
                      .filter(emp => {
                        const search = (filters.payrollSearch || '').toLowerCase();
                        return emp.name.toLowerCase().includes(search) || emp.department.toLowerCase().includes(search);
                      })
                      .map(emp => (
                      <div 
                        key={emp.id}
                        className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:border-primary/50 hover:shadow-md transition-all group"
                      >
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <p className="font-black text-gray-900">{emp.name}</p>
                              <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider ${emp.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                                {emp.role}
                              </span>
                            </div>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{emp.department}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs font-black text-primary font-mono">₹{(emp.suggested_salary || 0).toLocaleString('en-IN')}</p>
                            <p className="text-[8px] font-bold text-gray-400 uppercase">Suggested</p>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 mb-4">
                          <div className="bg-slate-50 p-2 rounded-lg border border-slate-100 text-center">
                            <p className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">Attendance</p>
                            <p className="text-xs font-black text-slate-700">{emp.payable_days}d</p>
                          </div>
                          <div className="bg-slate-50 p-2 rounded-lg border border-slate-100 text-center">
                            <p className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">Base Sal.</p>
                            <p className="text-xs font-black text-slate-700">
                              ₹{parseFloat(emp.hourly_rate) > 0 ? `${emp.hourly_rate}/hr` : parseFloat(emp.base_salary).toLocaleString('en-IN')}
                            </p>
                          </div>
                          <div className="bg-slate-50 p-2 rounded-lg border border-slate-100 text-center">
                            <p className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">Work</p>
                            <p className="text-xs font-black text-slate-700">{parseFloat(emp.hourly_rate) > 0 ? `${emp.total_hours}h` : `${emp.payable_days}d`}</p>
                          </div>
                        </div>
                        <button 
                          onClick={() => handleProcessPayroll(emp)}
                          className="w-full py-2 bg-primary/5 hover:bg-primary text-primary hover:text-white rounded-lg text-[10px] font-black uppercase tracking-widest transition-all group-hover:scale-[1.02]"
                        >
                          Process Payment
                        </button>
                      </div>
                    ))}
                    {employees.filter(emp => !payrollHistory.some(p => p.user_id === emp.id)).length === 0 && (
                      <div className="h-full flex flex-col items-center justify-center text-slate-300 py-12">
                        <CheckCircle2 size={40} className="opacity-20 mb-3" />
                        <p className="text-xs font-bold italic">All salaries processed!</p>
                      </div>
                    )}
                  </div>
                </div>
              </>
            ) : (
                      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-50/50 border-b border-gray-100">
                        <th className="px-6 py-4 font-bold text-gray-600 uppercase tracking-tighter text-[11px]">Employee / Role</th>
                        <th className="px-6 py-4 font-bold text-gray-600 uppercase tracking-tighter text-[11px] text-center">Attendance</th>
                        <th className="px-6 py-4 font-bold text-gray-600 uppercase tracking-tighter text-[11px] text-center">Half Days</th>
                        <th className="px-6 py-4 font-bold text-gray-600 uppercase tracking-tighter text-[11px] text-center">Late</th>
                        <th className="px-6 py-4 font-bold text-gray-600 uppercase tracking-tighter text-[11px] text-center">Leaves</th>
                        <th className="px-6 py-4 font-bold text-gray-600 uppercase tracking-tighter text-[11px] text-right">Base / Hourly</th>
                        <th className="px-6 py-4 font-bold text-gray-600 uppercase tracking-tighter text-[11px] text-center">Hours</th>
                        <th className="px-6 py-4 font-bold text-gray-600 uppercase tracking-tighter text-[11px] text-right">Incentives</th>
                        <th className="px-6 py-4 font-bold text-gray-600 uppercase tracking-tighter text-[11px] text-right">Net Payable</th>
                        <th className="px-6 py-4 font-bold text-gray-600 uppercase tracking-tighter text-[11px] text-center">Paid Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {employees
                        .filter(emp => {
                          const search = (filters.payrollSearch || '').toLowerCase();
                          return emp.name.toLowerCase().includes(search) || emp.department.toLowerCase().includes(search);
                        })
                        .map(emp => {
                        const processed = payrollHistory.find(p => p.user_id === emp.id);
                        return (
                          <tr key={emp.id} className={`hover:bg-gray-50/80 transition-colors group/row ${processed ? 'bg-emerald-50/10' : ''}`}>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2">
                                <div className="font-bold text-gray-900">{emp.name}</div>
                                <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider ${emp.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                                  {emp.role}
                                </span>
                              </div>
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
                            <td className="px-6 py-4 text-right">
                              <div className="flex flex-col items-end gap-1">
                                <div className="flex items-center gap-1 font-mono text-xs font-bold text-gray-600">
                                  <span>₹{parseFloat(emp.base_salary).toLocaleString('en-IN')}</span>
                                  {!processed && (
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
                                  )}
                                </div>
                                <div className="flex items-center gap-1 font-mono text-[10px] font-bold text-primary italic">
                                  <span>₹{parseFloat(emp.hourly_rate || 0).toLocaleString('en-IN')}/hr</span>
                                  {!processed && (
                                    <button 
                                      onClick={async () => {
                                        const newRate = prompt('Enter new hourly rate:', emp.hourly_rate);
                                        if (newRate !== null) {
                                          try {
                                            await api.put(`/accounting/payroll/employees/${emp.id}`, { hourly_rate: parseFloat(newRate) });
                                            toast.success('Hourly rate updated');
                                            fetchPayrollData();
                                          } catch (err) {
                                            toast.error('Update failed');
                                          }
                                        }
                                      }}
                                      className="text-gray-300 hover:text-primary opacity-0 group-hover/row:opacity-100 transition-opacity"
                                    >
                                      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                    </button>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-center">
                              <span className={`font-bold ${emp.total_hours > 0 ? 'text-primary' : 'text-gray-400'}`}>
                                {emp.total_hours || 0}h
                              </span>
                            </td>
                            <td className="px-6 py-4 text-right">
                              {processed ? (
                                <span className="font-mono text-xs font-bold text-gray-600">₹{parseFloat(processed.incentives).toLocaleString('en-IN')}</span>
                              ) : (
                                <input 
                                  type="number"
                                  placeholder="Incentive"
                                  value={rowIncentives[emp.id] || ''}
                                  onChange={(e) => setRowIncentives({...rowIncentives, [emp.id]: e.target.value})}
                                  className="w-20 bg-gray-50 border border-gray-200 rounded px-2 py-1 text-xs text-right outline-none focus:border-primary transition-all font-mono"
                                />
                              )}
                            </td>
                            <td className="px-6 py-4 text-right relative group">
                              <div className="font-black text-primary font-mono cursor-help">
                                ₹{Number(processed ? processed.net_paid : (emp.suggested_salary + parseFloat(rowIncentives[emp.id] || 0))).toLocaleString('en-IN')}
                              </div>
                              
                              {/* Breakdown Tooltip */}
                              <div className="absolute bottom-full right-0 mb-2 w-48 bg-gray-900 text-white rounded-xl p-3 shadow-2xl opacity-0 group-hover:opacity-100 pointer-events-none transition-all z-50 transform translate-y-2 group-hover:translate-y-0">
                                <div className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2 border-b border-gray-700 pb-1">Salary Breakdown</div>
                                <div className="space-y-1.5">
                                  {parseFloat(emp.hourly_rate) > 0 ? (
                                    <>
                                      <div className="flex justify-between text-[11px]">
                                        <span className="text-gray-400">Hourly Rate:</span>
                                        <span className="font-bold">₹{emp.hourly_rate}</span>
                                      </div>
                                      <div className="flex justify-between text-[11px]">
                                        <span className="text-gray-400">Total Hours:</span>
                                        <span className="font-bold text-primary">{emp.total_hours}h</span>
                                      </div>
                                    </>
                                  ) : (
                                    <>
                                      <div className="flex justify-between text-[11px]">
                                        <span className="text-gray-400">Full Days:</span>
                                        <span className="font-bold">{emp.full_days}</span>
                                      </div>
                                      <div className="flex justify-between text-[11px]">
                                        <span className="text-gray-400">Half Days:</span>
                                        <span className="font-bold text-orange-400">{emp.half_days * 0.5}d</span>
                                      </div>
                                      <div className="flex justify-between text-[11px]">
                                        <span className="text-gray-400">Late Penalty:</span>
                                        <span className="font-bold text-red-400">-{emp.late_penalty_days}d</span>
                                      </div>
                                      <div className="flex justify-between text-[11px] pt-1 border-t border-gray-700 mt-1 font-black">
                                        <span>Payable Days:</span>
                                        <span className="text-primary">{emp.payable_days}d</span>
                                      </div>
                                    </>
                                  )}
                                  <div className="flex justify-between text-[11px] pt-1 border-t border-gray-700 mt-1">
                                    <span className="text-gray-400 italic text-[9px]">
                                      {parseFloat(emp.hourly_rate) > 0 ? `Formula: ₹${emp.hourly_rate} * ${emp.total_hours}h` : `Base: ₹${emp.base_salary}`}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-center">
                              <div className="flex items-center justify-center">
                                {processed ? (
                                  <div className="flex items-center gap-1.5 text-emerald-600">
                                    <CheckCircle2 size={16} />
                                    <span className="text-[10px] font-black uppercase tracking-widest">Paid</span>
                                  </div>
                                ) : (
                                  <label className="relative inline-flex items-center cursor-pointer group/check">
                                    <input 
                                      type="checkbox"
                                      className="sr-only"
                                      disabled={isProcessing[emp.id]}
                                      onChange={(e) => {
                                        if (e.target.checked) {
                                          handleProcessPayroll(emp, rowIncentives[emp.id] || '0');
                                        }
                                      }}
                                    />
                                    <div className={`w-5 h-5 border-2 rounded transition-all flex items-center justify-center ${isProcessing[emp.id] ? 'border-gray-200 bg-gray-50' : 'border-gray-300 group-hover/check:border-primary bg-white'}`}>
                                      {isProcessing[emp.id] ? (
                                        <div className="w-3 h-3 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                                      ) : (
                                        <div className="w-2.5 h-2.5 bg-primary rounded-sm opacity-0 transform scale-50 transition-all peer-checked:opacity-100 peer-checked:scale-100" />
                                      )}
                                    </div>
                                    <span className="ml-2 text-[10px] font-bold text-gray-400 group-hover/check:text-primary transition-colors">Mark Paid</span>
                                  </label>
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
            )}

            {/* Salary History Section Below */}
            <div className="mt-12 pt-8 border-t border-gray-100 space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-50 rounded-lg text-emerald-600">
                    <Clock size={20} />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-gray-900">Recent Disbursements</h3>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Payment history for {new Date(0, selectedMonth - 1).toLocaleString('default', { month: 'long' })} {selectedYear}</p>
                  </div>
                </div>
                <div className="px-3 py-1 bg-emerald-50 rounded-full text-[10px] font-black text-emerald-600 border border-emerald-100">
                  Total Paid: {payrollHistory.length}
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-50/50 border-b border-gray-100">
                        <th className="px-6 py-4 font-bold text-gray-600 uppercase tracking-tighter text-[11px]">Employee</th>
                        <th className="px-6 py-4 font-bold text-gray-600 uppercase tracking-tighter text-[11px] text-center">Paid Date</th>
                        <th className="px-6 py-4 font-bold text-gray-600 uppercase tracking-tighter text-[11px] text-right">Base Salary</th>
                        <th className="px-6 py-4 font-bold text-gray-600 uppercase tracking-tighter text-[11px] text-right">Incentive</th>
                        <th className="px-6 py-4 font-bold text-gray-600 uppercase tracking-tighter text-[11px] text-right font-black">Net Paid</th>
                        <th className="px-6 py-4 font-bold text-gray-600 uppercase tracking-tighter text-[11px] text-center">Reference</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {payrollHistory
                        .filter(record => {
                          const search = (filters.payrollSearch || '').toLowerCase();
                          return record.name.toLowerCase().includes(search) || record.department.toLowerCase().includes(search);
                        })
                        .map(record => (
                        <tr key={record.id} className="hover:bg-gray-50/50 transition-colors">
                          <td className="px-6 py-4">
                            <p className="font-bold text-gray-900">{record.name}</p>
                            <p className="text-[10px] font-bold text-gray-400 uppercase">{record.department}</p>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className="text-xs font-bold text-gray-600">{new Date(record.payment_date).toLocaleDateString()}</span>
                          </td>
                          <td className="px-6 py-4 text-right font-mono text-xs font-bold text-gray-600">
                            ₹{parseFloat(record.base_salary).toLocaleString('en-IN')}
                          </td>
                          <td className="px-6 py-4 text-right font-mono text-xs font-bold text-purple-600">
                            +₹{parseFloat(record.incentives).toLocaleString('en-IN')}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <span className="font-black text-emerald-600 font-mono">₹{(record.net_paid || 0).toLocaleString('en-IN')}</span>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded text-[9px] font-black uppercase tracking-widest">Completed</span>
                          </td>
                        </tr>
                      ))}
                      {payrollHistory.length === 0 && (
                        <tr>
                          <td colSpan="6" className="px-6 py-12 text-center text-gray-400 italic text-xs">
                            No disbursements recorded for this month yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
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
                        {isDeletable(exp.date) && exp.source !== 'payroll' ? (
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
                            <Lock size={12} className={exp.source === 'payroll' ? 'text-blue-400' : ''} />
                            <span className="text-[9px] font-bold uppercase">{exp.source === 'payroll' ? 'Payroll' : 'Locked'}</span>
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

        {activeTab === 'invoices' && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                <Receipt size={18} className="text-primary" />
                Invoice History
              </h3>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex bg-gray-100 p-1 rounded-xl shadow-inner">
                  {[
                    { id: 'all', label: 'All' },
                    { id: 'generated', label: 'Generated' },
                    { id: 'draft', label: 'Drafts' }
                  ].map((filter) => (
                    <button
                      key={filter.id}
                      onClick={() => setInvoiceFilter(filter.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all capitalize ${
                        invoiceFilter === filter.id
                          ? 'bg-white shadow-sm text-primary'
                          : 'text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>
                <span className="badge badge-in-progress bg-gray-100 text-gray-700">{filteredInvoicesList.length} Invoices</span>
              </div>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50/30">
                    <th className="px-6 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">Invoice No</th>
                    <th className="px-6 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">Client</th>
                    <th className="px-6 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">Project</th>
                    <th className="px-6 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">Date / Due Date</th>
                    <th className="px-6 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Amount</th>
                    <th className="px-6 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Status</th>
                    <th className="px-6 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {loadingInvoices ? (
                    <tr>
                      <td colSpan="7" className="px-6 py-12 text-center">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <div className="w-8 h-8 border-2 border-[#E05A1E] border-t-transparent rounded-full animate-spin" />
                          <p className="text-gray-400 text-xs italic">Loading invoice history...</p>
                        </div>
                      </td>
                    </tr>
                  ) : filteredInvoicesList.map(inv => {
                    const statusColors = {
                      paid: 'bg-emerald-50 text-emerald-700 border-emerald-200',
                      generated: 'bg-sky-50 text-sky-700 border-sky-200',
                      sent: 'bg-indigo-50 text-indigo-700 border-indigo-200',
                      draft: 'bg-gray-50 text-gray-600 border-gray-200',
                      cancelled: 'bg-red-50 text-red-700 border-red-200'
                    };
                    const statusColor = statusColors[inv.status] || 'bg-gray-50 text-gray-600 border-gray-200';
                    return (
                      <tr key={inv.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-6 py-4">
                          <span className="font-mono font-bold text-sm text-[#E05A1E]">
                            {inv.invoice_no}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-xs font-semibold text-gray-700">
                          {inv.client_name_full || inv.client_name || '-'}
                        </td>
                        <td className="px-6 py-4">
                          {inv.project_name ? (
                            <span className="px-2 py-0.5 bg-gray-100 text-gray-700 text-[10px] font-black uppercase tracking-wider rounded">
                               {inv.project_name}
                            </span>
                          ) : (
                            <span className="text-gray-400 text-xs italic">No Project</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-xs text-gray-500">
                          <div className="flex flex-col gap-0.5">
                            <span>Issued: {new Date(inv.date).toLocaleDateString()}</span>
                            {inv.due_date && <span className="text-[10px] text-gray-400">Due: {new Date(inv.due_date).toLocaleDateString()}</span>}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right font-mono text-sm font-black text-gray-900">
                          ₹{parseFloat(inv.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className={`inline-block px-2.5 py-0.5 border rounded-full text-[10px] font-black uppercase tracking-wider ${statusColor}`}>
                            {inv.status}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-end gap-2">
                            {inv.status !== 'paid' && inv.project_id && (
                              <button
                                onClick={() => handleMarkPaid(inv.id)}
                                className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1"
                                title="Mark as Paid"
                              >
                                <CheckCircle2 size={12} />
                                Mark Paid
                              </button>
                            )}
                            <a
                              href={`/admin/invoice?invoice_id=${inv.id}`}
                              className="px-2.5 py-1 bg-gray-50 hover:bg-gray-100 text-gray-700 border border-gray-200 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1"
                              title="View / Print Invoice"
                            >
                              <FileText size={12} />
                              View
                            </a>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {!loadingInvoices && filteredInvoicesList.length === 0 && (
                    <tr>
                      <td colSpan="7" className="px-6 py-12 text-center text-gray-400 italic text-sm">
                        {invoiceFilter === 'generated' ? 'No generated invoices found.' : 
                         invoiceFilter === 'draft' ? 'No draft invoices found.' : 
                         'No invoice history available. Use the Invoice Editor to create new invoices.'}
                      </td>
                    </tr>
                  )}
                </tbody>
                {filteredInvoicesList.length > 0 && (
                  <tfoot className="bg-gray-50/80 font-bold border-t border-gray-200">
                    <tr>
                      <td className="px-6 py-4 text-xs font-bold text-gray-500 uppercase" colSpan={4}>
                        <div className="flex items-center gap-4">
                          <span>Total of {filteredInvoicesList.length} {filteredInvoicesList.length === 1 ? 'Invoice' : 'Invoices'}</span>
                          <span className="text-[10px] text-gray-400 font-normal normal-case">
                            (Paid: ₹{filteredInvoicesList.filter(i => i.status === 'paid').reduce((sum, i) => sum + parseFloat(i.amount || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })} | 
                            Pending: ₹{filteredInvoicesList.filter(i => i.status !== 'paid' && i.status !== 'cancelled').reduce((sum, i) => sum + parseFloat(i.amount || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })})
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right font-mono text-sm font-black text-[#E05A1E]">
                        ₹{filteredInvoicesList.reduce((sum, inv) => sum + parseFloat(inv.amount || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td colSpan={2}></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Breakdown Modal */}
      <FinancialBreakdownModal 
        isOpen={financialModal.isOpen}
        onClose={() => setFinancialModal({ ...financialModal, isOpen: false })}
        type={financialModal.type}
        label={financialModal.label}
      />

    </AppLayout>
  );
}
