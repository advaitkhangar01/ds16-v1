import React, { useState, useRef, useEffect } from 'react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import toast from 'react-hot-toast';
import AppLayout from '../../components/layout/AppLayout';
import api from '../../api/client';
import ClientModal from '../../components/clients/ClientModal';
import convertNumberToWords from '../../utils/numberToWords';
import { COMPANY_CONFIG } from '../../config/company';
import { useLocation } from 'react-router-dom';


const INITIAL_FORM = {
  project_id: null,
  invoiceNo: '',
  date: new Date().toISOString().split('T')[0],
  refNo: '',
  buyerOrderNo: '',
  billToName: '',
  billToAddress: '',
  billToGst: '',
  billToPhone: '',
  billToEmail: '',
  shipToName: '',
  shipToAddress: '',
  items: [{ id: Date.now(), description: '', quantity: 1, rate: 0 }],
  cgstPercent: 9,
  sgstPercent: 9,
  igstPercent: 18,
  accountName: COMPANY_CONFIG.name,
  accountNo: '',
  ifsc: '',
  bankName: '',
  branch: '',
  upiId: '',
  dueDate: ''
};

const ITEM_CATALOG = [
  { description: 'Interior Design & Space Planning', rate: 15000 },
  { description: '3D Realistic Rendering (Per View)', rate: 5000 },
  { description: 'Full Turnkey Execution (Per Sqft)', rate: 1800 },
  { description: 'Modular Kitchen Fabrication', rate: 120000 },
  { description: 'False Ceiling Layout & Work', rate: 35000 },
  { description: 'Custom Wardrobes & Woodwork', rate: 65000 },
  { description: 'Site Visit Consultation', rate: 3000 }
];

export default function InvoicePage() {
  const [formData, setFormData] = useState(INITIAL_FORM);
  const [isGenerating, setIsGenerating] = useState(false);
  const [clients, setClients] = useState([]);
  const [clientSearch, setClientSearch] = useState('');
  const [isClientDropdownOpen, setIsClientDropdownOpen] = useState(false);
  const [showClientModal, setShowClientModal] = useState(false);
  const [isGstEnabled, setIsGstEnabled] = useState(true);
  const [isIgst, setIsIgst] = useState(false);
  const [showBankDetails, setShowBankDetails] = useState(true);
  const [showCatalog, setShowCatalog] = useState(false);
  const [signatureData, setSignatureData] = useState(null);
  const [validationErrors, setValidationErrors] = useState({});
  const [usedInvoiceNumbers, setUsedInvoiceNumbers] = useState([]);
  const [sessionInvoiceCount, setSessionInvoiceCount] = useState(1);
  const [recentInvoices, setRecentInvoices] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [projectStats, setProjectStats] = useState(null);
  
  const previewRef = useRef(null);
  const dropdownRef = useRef(null);
  const canvasRef = useRef(null);

  const location = useLocation();

  useEffect(() => {
    fetchClients();
    fetchRecentInvoices();
    
    // Check for pre-fill data from ProjectDetail page
    if (location.state?.preFill) {
      const { preFill } = location.state;
      setFormData(prev => ({
        ...prev,
        ...preFill,
        items: preFill.items.map(item => ({ ...item, id: item.id || Date.now() }))
      }));
      // Clear state to prevent re-filling on refresh
      window.history.replaceState({}, document.title);
    } else {
      const saved = localStorage.getItem('ds16_invoice_draft');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          // Defensive check: ensure items is an array and other critical fields exist
          if (parsed && Array.isArray(parsed.items)) {
            setFormData(parsed);
            setIsGstEnabled(parsed.cgstPercent > 0 || parsed.igstPercent > 0);
            setIsIgst(parsed.igstPercent > 0 && parsed.cgstPercent === 0);
          } else {
            console.warn('Invalid draft format, resetting to initial form');
            localStorage.removeItem('ds16_invoice_draft');
            generateInvoiceNumber(1);
          }
        } catch (e) {
          console.error('Failed to parse draft', e);
          localStorage.removeItem('ds16_invoice_draft');
          generateInvoiceNumber(1);
        }
      } else {
        generateInvoiceNumber(1);
      }
    }

    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsClientDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    localStorage.setItem('ds16_invoice_draft', JSON.stringify(formData));
    if (formData.project_id) {
      fetchProjectStats(formData.project_id);
    } else {
      setProjectStats(null);
    }
  }, [formData]);

  const fetchProjectStats = async (pid) => {
    try {
      const { data } = await api.get(`/projects/${pid}/financial-summary`);
      setProjectStats(data);
    } catch (err) {
      console.error('Failed to fetch project stats', err);
    }
  };

  const generateInvoiceNumber = (count) => {
    const today = new Date();
    const year = today.getFullYear();
    const paddedCount = String(count).padStart(3, '0');
    const autoNo = `DS16-${year}-${paddedCount}`;
    setFormData(prev => ({ ...prev, invoiceNo: autoNo }));
  };

  const fetchClients = async () => {
    try {
      const { data } = await api.get('/clients');
      setClients(data);
    } catch (err) {
      toast.error('Failed to load clients');
    }
  };

  const fetchRecentInvoices = async () => {
    try {
      const { data } = await api.get('/invoices');
      if (data && Array.isArray(data.invoices)) {
        setRecentInvoices(data.invoices.slice(0, 10)); // Top 10
      }
    } catch (err) {
      console.error('Failed to load recent invoices', err);
    }
  };

  const handleSaveInvoice = async (status = 'generated') => {
    if (!formData.billToName.trim()) {
      toast.error('Client Name is required');
      return null;
    }
    
    try {
      const payload = {
        invoice_no: formData.invoiceNo,
        project_id: formData.project_id,
        client_id: clients.find(c => c.name === formData.billToName)?.id,
        client_name: formData.billToName,
        amount: grandTotal,
        date: formData.date,
        items: formData.items,
        tax_details: {
          cgstPercent: formData.cgstPercent,
          sgstPercent: formData.sgstPercent,
          igstPercent: formData.igstPercent,
          isGstEnabled,
          isIgst
        },
        status,
        due_date: formData.dueDate
      };

      const { data } = await api.post('/invoices', payload);
      fetchRecentInvoices();
      return data.invoice;
    } catch (err) {
      toast.error('Failed to save invoice to history');
      return null;
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (validationErrors[name]) {
      setValidationErrors(prev => {
        const copy = { ...prev };
        delete copy[name];
        return copy;
      });
    }
  };

  const handleItemChange = (id, field, value) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items.map(item => item.id === id ? { ...item, [field]: value } : item)
    }));
  };

  const addItem = () => {
    setFormData(prev => ({
      ...prev,
      items: [...prev.items, { id: Date.now(), description: '', quantity: 1, rate: 0 }]
    }));
  };

  const selectFromCatalog = (catalogItem) => {
    setFormData(prev => ({
      ...prev,
      items: [...prev.items, { id: Date.now(), description: catalogItem.description, quantity: 1, rate: catalogItem.rate }]
    }));
    toast.success('Catalog item added');
    setShowCatalog(false);
  };

  const removeItem = (id) => {
    if (formData.items.length === 1) {
      toast.error('At least 1 item is required');
      return;
    }
    setFormData(prev => ({
      ...prev,
      items: prev.items.filter(item => item.id !== id)
    }));
  };

  const calculateTotals = () => {
    const subtotal = formData.items.reduce((acc, item) => acc + (Number(item.quantity) * Number(item.rate)), 0);
    let cgst = 0, sgst = 0, igst = 0;
    if (isGstEnabled) {
      if (isIgst) igst = subtotal * (Number(formData.igstPercent) / 100);
      else {
        cgst = subtotal * (Number(formData.cgstPercent) / 100);
        sgst = subtotal * (Number(formData.sgstPercent) / 100);
      }
    }
    return { subtotal, cgst, sgst, igst, grandTotal: Math.round(subtotal + cgst + sgst + igst) };
  };

  const { subtotal, cgst, sgst, igst, grandTotal } = calculateTotals();

  const handleGeneratePDF = async () => {
    if (!formData.billToName.trim()) {
      toast.error('Client Name is required');
      return;
    }
    setIsGenerating(true);
    try {
      const element = previewRef.current;
      const canvas = await html2canvas(element, { scale: 2, useCORS: true });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgWidth = 210;
      const pageHeight = 295;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }
      pdf.save(`Invoice_${formData.invoiceNo}.pdf`);
      toast.success('Premium PDF exported');
      
      // Auto-save to history
      await handleSaveInvoice();
    } catch (error) {
      toast.error('Failed to generate PDF');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRecordIncome = async () => {
    if (!formData.project_id) {
      toast.error('No project linked to this invoice');
      return;
    }
    if (!grandTotal || grandTotal <= 0) {
      toast.error('Invoice amount must be greater than 0');
      return;
    }

    try {
      await api.post('/finances/transactions', {
        type: 'income',
        category: 'project_receipt',
        amount: grandTotal,
        description: `Invoice ${formData.invoiceNo} - ${formData.billToName}`,
        project_id: formData.project_id,
        reference_id: formData.invoiceNo,
        date: formData.date
      });
      toast.success('Recorded as Project Income');
      
      // Also ensure invoice is saved
      await handleSaveInvoice('paid');
    } catch (err) {
      toast.error('Failed to record income');
    }
  };

  const shareWhatsApp = () => {
    const msg = `Hi ${formData.billToName}, Invoice ${formData.invoiceNo} from Design Studio 16 is generated for ₹${grandTotal.toLocaleString('en-IN')}.`;
    window.open(`https://wa.me/${formData.billToPhone.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  const shareEmail = () => {
    window.open(`mailto:${formData.billToEmail}?subject=Invoice ${formData.invoiceNo}&body=Please find attached your invoice.`, '_blank');
  };

  const handleReset = () => {
    if (window.confirm('Clear form?')) {
      localStorage.removeItem('ds16_invoice_draft');
      setFormData(INITIAL_FORM);
      setSignatureData(null);
      generateInvoiceNumber(1);
    }
  };

  const startDrawing = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#0D0D0D';
    ctx.beginPath();
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
    canvas.isDrawing = true;
  };

  const draw = (e) => {
    const canvas = canvasRef.current;
    if (!canvas || !canvas.isDrawing) return;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    ctx.stroke();
  };

  const stopDrawing = () => {
    const canvas = canvasRef.current;
    if (canvas && canvas.isDrawing) {
      canvas.isDrawing = false;
      setSignatureData(canvas.toDataURL());
    }
  };

  const filteredClients = clients.filter(c => c.name.toLowerCase().includes(clientSearch.toLowerCase()));

  return (
    <AppLayout>
      <div className="flex flex-col lg:flex-row h-[calc(100vh-4rem)] lg:h-[calc(100vh-3rem)] -mx-4 -my-4 lg:-mx-6 lg:-my-6 bg-[#EFEFEC] overflow-hidden" style={{ fontFamily: '"DM Sans", sans-serif' }}>
        
        {/* Left: Interactive Input Form */}
        <div className={`w-full lg:w-1/2 flex flex-col h-full bg-[#F9F8F6] border-r border-[#E5E2DC] transition-all duration-300 ${showHistory ? 'lg:translate-x-64' : ''}`}>
          <div className="p-4 border-b border-[#E5E2DC] flex justify-between items-center bg-[#F9F8F6]">
            <div className="flex items-center gap-4">
              <button 
                onClick={() => setShowHistory(!showHistory)}
                className={`p-2 rounded-lg transition-all ${showHistory ? 'bg-[#E85C1A] text-white' : 'hover:bg-[#EFEFEC] text-[#A09890]'}`}
                title="History"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 8v4l3 3" />
                  <circle cx="12" cy="12" r="9" />
                </svg>
              </button>
              <h2 className="text-sm font-semibold text-[#0D0D0D] tracking-wide">Billing Engine</h2>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={handleReset} className="text-xs text-[#A09890] hover:text-[#0D0D0D] hover:underline underline-offset-2 transition-all font-medium">
                Reset
              </button>
              <button 
                onClick={handleGeneratePDF} 
                disabled={isGenerating}
                className="bg-[#E85C1A] hover:bg-[#D44A0D] text-white text-xs tracking-widest px-4 py-2 rounded-[4px] font-semibold transition-all flex items-center gap-2 shadow-sm"
              >
                {isGenerating ? 'GENERATING...' : '↓ DOWNLOAD PDF'}
              </button>
              {formData.project_id && (
                <button 
                  onClick={handleRecordIncome}
                  className="bg-green-600 hover:bg-green-700 text-white text-xs tracking-widest px-4 py-2 rounded-[4px] font-semibold transition-all flex items-center gap-2 shadow-sm"
                >
                  ✓ RECORD INCOME
                </button>
              )}
            </div>
          </div>
          
          {/* History Drawer Overlay (Desktop) */}
          {showHistory && (
            <div className="absolute left-0 top-0 bottom-0 w-64 bg-[#1C1C1C] z-30 shadow-2xl animate-in slide-in-from-left duration-300 flex flex-col">
              <div className="p-4 border-b border-white/10 flex justify-between items-center">
                <h3 className="text-[10px] font-black tracking-widest text-white uppercase">Invoice History</h3>
                <button onClick={() => setShowHistory(false)} className="text-white/40 hover:text-white text-xl font-bold">&times;</button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {recentInvoices.length === 0 ? (
                  <p className="text-[10px] text-white/30 italic text-center py-10">No recent invoices</p>
                ) : (
                  recentInvoices.map(inv => (
                    <div 
                      key={inv.id}
                      onClick={() => {
                        setFormData({
                          ...INITIAL_FORM,
                          ...inv,
                          items: inv.items.map(item => ({ ...item, id: item.id || Date.now() })),
                          cgstPercent: inv.tax_details?.cgstPercent || 9,
                          sgstPercent: inv.tax_details?.sgstPercent || 9,
                          igstPercent: inv.tax_details?.igstPercent || 18,
                        });
                        setIsGstEnabled(inv.tax_details?.isGstEnabled ?? true);
                        setIsIgst(inv.tax_details?.isIgst ?? false);
                        setShowHistory(false);
                        toast.success('Invoice loaded');
                      }}
                      className="p-3 rounded bg-white/5 border border-white/10 hover:bg-white/10 cursor-pointer transition-all group"
                    >
                      <div className="flex justify-between items-start mb-1">
                        <span className="text-[11px] font-mono text-[#E85C1A] font-bold">{inv.invoice_no}</span>
                        <span className="text-[9px] text-white/40">{new Date(inv.date).toLocaleDateString()}</span>
                      </div>
                      <p className="text-[10px] text-white/80 font-medium truncate">{inv.client_name}</p>
                      <p className="text-[10px] text-white/60 font-bold mt-1">₹{parseFloat(inv.amount).toLocaleString('en-IN')}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
          
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            
            {/* 1. Client Integration */}
            <section className="space-y-4">
              <div className="flex justify-between items-end border-b border-[#E0DDD8] pb-1">
                <h3 className="text-[10px] font-normal tracking-[0.15em] text-[#A09890] uppercase">Client Integration</h3>
                <button onClick={() => setShowClientModal(true)} className="text-[10px] text-[#0D0D0D] underline hover:no-underline font-medium">
                  + Add New Client
                </button>
              </div>

              <div className="relative" ref={dropdownRef}>
                <label className="block text-[10px] tracking-[0.12em] text-[#A09890] uppercase font-normal mb-1">Search & Select Client *</label>
                <input 
                  type="text" 
                  value={clientSearch}
                  onChange={(e) => { setClientSearch(e.target.value); setIsClientDropdownOpen(true); }}
                  onFocus={() => setIsClientDropdownOpen(true)}
                  className="w-full bg-white border border-[#D8D4CD] rounded-[6px] px-3 py-2 text-[#0D0D0D] text-sm placeholder-[#AAAAAA] focus:border-[#E85C1A] focus:ring-0 focus:outline-none transition-all"
                  placeholder="Find client..."
                />
                {isClientDropdownOpen && (
                  <div className="absolute z-20 mt-1 w-full bg-white border border-[#D8D4CD] rounded-[6px] shadow-lg max-h-48 overflow-y-auto">
                    {filteredClients.map(c => (
                      <div 
                        key={c.id} 
                        onClick={() => {
                          setFormData(prev => ({ ...prev, billToName: c.name, billToPhone: c.primary_contact_phone || '', billToEmail: c.primary_contact_email || '' }));
                          setIsClientDropdownOpen(false);
                          setClientSearch('');
                        }}
                        className="p-2 hover:bg-[#F7F6F4] cursor-pointer text-sm font-medium text-[#0D0D0D]"
                      >
                        {c.name}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] tracking-[0.12em] text-[#A09890] uppercase font-normal mb-1">Bill To Address</label>
                  <textarea name="billToAddress" value={formData.billToAddress} onChange={handleChange} className="w-full bg-white border border-[#D8D4CD] rounded-[6px] px-3 py-1.5 text-[#0D0D0D] text-xs h-16 focus:border-[#E85C1A] focus:outline-none focus:ring-0" />
                </div>
                <div>
                  <label className="block text-[10px] tracking-[0.12em] text-[#A09890] uppercase font-normal mb-1">Ship To Address</label>
                  <textarea name="shipToAddress" value={formData.shipToAddress} onChange={handleChange} className="w-full bg-white border border-[#D8D4CD] rounded-[6px] px-3 py-1.5 text-[#0D0D0D] text-xs h-16 focus:border-[#E85C1A] focus:outline-none focus:ring-0" />
                </div>
              </div>
            </section>

            {/* Sharing Buttons */}
            <section className="flex gap-4">
              <button onClick={shareWhatsApp} className="flex-1 py-2 border border-[#25D366] text-[#25D366] hover:bg-[#25D366]/10 rounded-[6px] text-[11px] tracking-wide font-medium transition-all text-center">
                WhatsApp
              </button>
              <button onClick={shareEmail} className="flex-1 py-2 border border-[#4A90D9] text-[#4A90D9] hover:bg-[#4A90D9]/10 rounded-[6px] text-[11px] tracking-wide font-medium transition-all text-center">
                Email
              </button>
            </section>

            {/* Invoice Meta */}
            <section className="space-y-4">
              <div className="border-b border-[#E0DDD8] pb-1">
                <h3 className="text-[10px] font-normal tracking-[0.15em] text-[#A09890] uppercase">Invoice Meta</h3>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-[10px] tracking-[0.12em] text-[#A09890] uppercase font-normal mb-1">Invoice No *</label>
                  <input type="text" name="invoiceNo" value={formData.invoiceNo} onChange={handleChange} className="w-full bg-white border border-[#D8D4CD] rounded-[6px] px-3 py-2 text-[#0D0D0D] text-sm focus:border-[#E85C1A] focus:outline-none focus:ring-0 font-mono" />
                </div>
                <div>
                  <label className="block text-[10px] tracking-[0.12em] text-[#A09890] uppercase font-normal mb-1">Date *</label>
                  <input type="date" name="date" value={formData.date} onChange={handleChange} className="w-full bg-white border border-[#D8D4CD] rounded-[6px] px-3 py-2 text-[#0D0D0D] text-sm focus:border-[#E85C1A] focus:outline-none focus:ring-0" />
                </div>
                <div>
                  <label className="block text-[10px] tracking-[0.12em] text-[#A09890] uppercase font-normal mb-1">Due Date</label>
                  <input type="date" name="dueDate" value={formData.dueDate} onChange={handleChange} className="w-full bg-white border border-[#D8D4CD] rounded-[6px] px-3 py-2 text-[#0D0D0D] text-sm focus:border-[#E85C1A] focus:outline-none focus:ring-0" />
                </div>
              </div>
            </section>

            {/* Line Items */}
            <section className="space-y-3">
              <div className="flex justify-between items-end border-b border-[#E0DDD8] pb-1">
                <h3 className="text-[10px] font-normal tracking-[0.15em] text-[#A09890] uppercase">Line Items</h3>
                <button onClick={() => setShowCatalog(!showCatalog)} className="text-[10px] font-medium text-[#A09890] hover:text-[#0D0D0D]">
                  {showCatalog ? 'Close Catalog' : 'Browse Catalog'}
                </button>
              </div>

              {showCatalog && (
                <div className="bg-[#F7F6F4] p-3 rounded-[6px] border border-[#E0DDD8] grid grid-cols-2 gap-2 max-h-40 overflow-y-auto">
                  {ITEM_CATALOG.map((item, idx) => (
                    <div key={idx} onClick={() => selectFromCatalog(item)} className="p-2 hover:bg-[#EFEFEC] cursor-pointer rounded text-xs font-medium text-[#0D0D0D] flex justify-between">
                      <span>{item.description}</span>
                      <span className="font-mono text-[#E85C1A]">₹{item.rate}</span>
                    </div>
                  ))}
                </div>
              )}

              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-[#1C1C1C] text-[#A09890] font-normal uppercase tracking-[0.12em] text-[9px]">
                  <tr>
                    <th className="py-2 px-2 text-center w-8">#</th>
                    <th className="py-2 px-2">Description</th>
                    <th className="py-2 px-2 w-16 text-center">Qty</th>
                    <th className="py-2 px-2 w-24 text-right">Rate</th>
                    <th className="py-2 px-2 w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E0DDD8]">
                  {formData.items.map((item, idx) => (
                    <tr key={item.id}>
                      <td className="py-2 px-1 text-center font-mono text-gray-400">{idx + 1}</td>
                      <td className="py-1 px-1">
                        <input type="text" value={item.description} onChange={(e) => handleItemChange(item.id, 'description', e.target.value)} className="w-full border-none focus:ring-0 focus:outline-none p-1 text-xs bg-transparent" placeholder="Item description" />
                      </td>
                      <td className="py-1 px-1">
                        <input type="number" value={item.quantity} onChange={(e) => handleItemChange(item.id, 'quantity', e.target.value)} className="w-full border-none focus:ring-0 focus:outline-none p-1 text-xs bg-transparent text-center font-mono" />
                      </td>
                      <td className="py-1 px-1">
                        <input type="number" value={item.rate} onChange={(e) => handleItemChange(item.id, 'rate', e.target.value)} className="w-full border-none focus:ring-0 focus:outline-none p-1 text-xs bg-transparent text-right font-mono" />
                      </td>
                      <td className="py-1 px-1 text-center">
                        <button onClick={() => removeItem(item.id)} className="text-red-400 hover:text-red-600 font-bold text-base">&times;</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button onClick={addItem} className="w-full py-2 border border-dashed border-[#D8D4CD] hover:border-[#E85C1A] text-[10px] tracking-widest text-[#A09890] hover:text-[#E85C1A] font-semibold uppercase rounded-[6px] transition-all bg-white">
                + ADD LINE ITEM
              </button>
            </section>

            {/* Tax Engine */}
            <section className="space-y-4">
              <div className="flex justify-between items-center border-b border-[#E0DDD8] pb-1">
                <h3 className="text-[10px] font-normal tracking-[0.15em] text-[#A09890] uppercase">Tax Engine</h3>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" checked={isGstEnabled} onChange={() => setIsGstEnabled(!isGstEnabled)} className="sr-only peer" />
                  <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#E85C1A]"></div>
                </label>
              </div>
              {isGstEnabled && (
                <div className="flex gap-2">
                  <button onClick={() => setIsIgst(false)} className={`text-[10px] tracking-wider px-3 py-1.5 rounded-[4px] border ${!isIgst ? 'bg-[#E85C1A] text-white border-[#E85C1A]' : 'bg-transparent text-[#6B6560] border-[#D8D4CD]'}`}>
                    CGST + SGST
                  </button>
                  <button onClick={() => setIsIgst(true)} className={`text-[10px] tracking-wider px-3 py-1.5 rounded-[4px] border ${isIgst ? 'bg-[#E85C1A] text-white border-[#E85C1A]' : 'bg-transparent text-[#6B6560] border-[#D8D4CD]'}`}>
                    IGST
                  </button>
                </div>
              )}
            </section>

            {/* Digital Signature Pad */}
            <section className="space-y-4">
              <div className="border-b border-[#E0DDD8] pb-1">
                <h3 className="text-[10px] font-normal tracking-[0.18em] text-[#A09890] uppercase">Authorized Signature</h3>
              </div>
              <div className="flex flex-col items-center">
                <canvas 
                  ref={canvasRef}
                  width={300} height={100}
                  onMouseDown={startDrawing} onMouseMove={draw} onMouseUp={stopDrawing} onMouseLeave={stopDrawing}
                  className="rounded-[6px] cursor-crosshair border border-[#D8D4CD]"
                  style={{ backgroundColor: '#FAFAF8', backgroundImage: 'radial-gradient(#D8D4CD 1px, transparent 1px)', backgroundSize: '12px 12px' }}
                />
              </div>
            </section>
          </div>
        </div>

        {/* Right Panel: Premium Invoice Preview */}
        <div className="w-full lg:w-1/2 h-full bg-[#EFEFEC] overflow-y-auto p-10 flex justify-center">
          <div 
            ref={previewRef}
            className="bg-white shadow-[0_4px_40px_rgba(0,0,0,0.12)] relative"
            style={{ width: '210mm', minHeight: '297mm', padding: '24mm', boxSizing: 'border-box' }}
          >
            {/* 40px/5px Top Orange Accent Bar */}
            <div className="absolute top-0 left-0 right-0 h-[5px] bg-[#E85C1A]" />

            {/* Proforma Watermark */}
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', overflow: 'hidden', zIndex: 0 }}>
              <span style={{ fontSize: '72px', fontFamily: '"Playfair Display", serif', fontWeight: 700, color: 'rgba(0,0,0,0.04)', transform: 'rotate(-30deg)', userSelect: 'none', whiteSpace: 'nowrap', letterSpacing: '0.2em' }}>
                PROFORMA
              </span>
            </div>

            {/* Header Branding */}
            <div className="flex justify-between items-start border-b border-[#E0DDD8] pb-8 mt-4 relative z-10">
              <div className="flex items-start gap-4">
                <img src="/logo.jpg" alt="Logo" className="h-14 w-14 object-contain" />
                <div>
                  <h1 className="text-[26px] font-bold tracking-tight text-[#0D0D0D] leading-none mb-1" style={{ fontFamily: '"Playfair Display", serif' }}>
                    {COMPANY_CONFIG.name}
                  </h1>
                  <span className="text-[9px] font-normal tracking-[0.2em] text-[#E85C1A] uppercase">
                    Architecture & Interior Design
                  </span>
                  <p className="text-[11px] text-[#6B6560] leading-relaxed max-w-xs mt-3">
                    {COMPANY_CONFIG.address}
                  </p>
                </div>
              </div>
              <div className="text-right flex flex-col items-end">
                <div className="text-[38px] font-bold tracking-tight text-[#0D0D0D] uppercase leading-none" style={{ fontFamily: '"Playfair Display", serif' }}>
                  Invoice
                </div>
                <div className="border border-[#0D0D0D] text-[#0D0D0D] text-[9px] tracking-[0.18em] uppercase px-2 py-0.5 mt-2 rounded-[2px]">
                  PROFORMA
                </div>
                <div className="mt-6 font-mono text-[11px] text-[#0D0D0D] space-y-1">
                  <p><span className="text-gray-400">Invoice:</span> {formData.invoiceNo}</p>
                  <p><span className="text-gray-400">Date:</span> {formData.date}</p>
                  {formData.dueDate && <p><span className="text-gray-400 text-red-500 font-bold">Due Date:</span> {formData.dueDate}</p>}
                </div>
              </div>
            </div>

            {/* Parties Section */}
            <div className="grid grid-cols-2 py-8 border-b border-[#E0DDD8] gap-0 relative z-10">
              <div className="pr-10 border-r border-[#E0DDD8]">
                <h4 className="text-[9px] tracking-[0.18em] text-[#A09890] uppercase font-normal mb-3">BILLED TO</h4>
                <div className="text-[15px] font-semibold text-[#0D0D0D] tracking-tight">{formData.billToName || 'Add Client Info'}</div>
                <div className="text-[11px] text-[#6B6560] leading-relaxed pt-1 whitespace-pre-wrap">{formData.billToAddress}</div>
                {formData.billToPhone && <div className="text-[11px] font-mono text-[#0D0D0D] pt-2">{formData.billToPhone}</div>}
              </div>
              <div className="pl-10">
                <h4 className="text-[9px] tracking-[0.18em] text-[#A09890] uppercase font-normal mb-3">PROJECT DETAILS</h4>
                <div className="text-[11px] text-[#6B6560] leading-relaxed whitespace-pre-wrap">{formData.shipToAddress || 'No project site mapped'}</div>
              </div>
            </div>

            {/* Line Items Table */}
            <div className="mt-8 relative z-10">
              <table className="w-full text-left text-[11px] border-collapse">
                <thead>
                  <tr className="border-b border-[#0D0D0D] text-[#A09890] font-normal tracking-[0.15em] uppercase text-[9px]">
                    <th className="py-3 px-2 w-12 text-center">No.</th>
                    <th className="py-3 px-2">Description</th>
                    <th className="py-3 px-2 w-16 text-center">Qty</th>
                    <th className="py-3 px-2 w-28 text-right">Unit Rate</th>
                    <th className="py-3 px-2 w-32 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F0EDE8] text-[#0D0D0D]">
                  {formData.items.map((item, index) => (
                    <tr key={item.id} className={index % 2 === 0 ? 'bg-white' : 'bg-[#FAFAF8]'}>
                      <td className="py-4 px-2 text-center text-gray-400 font-mono">{index + 1}</td>
                      <td className="py-4 px-2 font-medium whitespace-pre-wrap leading-relaxed">{item.description || 'Consultation / Design Service'}</td>
                      <td className="py-4 px-2 text-center font-mono">{item.quantity}</td>
                      <td className="py-4 px-2 text-right font-mono">₹{(Number(item.rate)).toLocaleString('en-IN')}</td>
                      <td className="py-4 px-2 text-right font-mono font-medium">₹{(Number(item.quantity) * Number(item.rate)).toLocaleString('en-IN')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals Section */}
            <div className="flex justify-end mt-6 border-t border-[#E0DDD8] pt-4 relative z-10">
              <div className="w-1/2 text-[11px] space-y-2 text-[#6B6560]">
                <div className="flex justify-between">
                  <span>Subtotal:</span>
                  <span className="font-mono text-[#0D0D0D]">₹{subtotal.toLocaleString('en-IN')}</span>
                </div>
                {isGstEnabled && !isIgst && (
                  <>
                    <div className="flex justify-between">
                      <span>CGST ({formData.cgstPercent}%):</span>
                      <span className="font-mono text-[#0D0D0D]">₹{cgst.toLocaleString('en-IN')}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>SGST ({formData.sgstPercent}%):</span>
                      <span className="font-mono text-[#0D0D0D]">₹{sgst.toLocaleString('en-IN')}</span>
                    </div>
                  </>
                )}
                {isGstEnabled && isIgst && (
                  <div className="flex justify-between">
                    <span>IGST ({formData.igstPercent}%):</span>
                    <span className="font-mono text-[#0D0D0D]">₹{igst.toLocaleString('en-IN')}</span>
                  </div>
                )}
                <div className="flex justify-between items-center py-2 px-3 border border-[#0D0D0D] rounded-[4px] mt-4 font-normal text-[#0D0D0D]">
                  <span className="text-[10px] font-black tracking-widest uppercase" style={{ fontFamily: '"Playfair Display", serif' }}>Grand Total:</span>
                  <span className="text-sm font-bold font-mono">₹{grandTotal.toLocaleString('en-IN')}</span>
                </div>
              </div>
            </div>

            {/* Financial Summary Section */}
            {projectStats && typeof projectStats.total_project_value === 'number' && (
              <div className="mt-8 p-4 border border-[#E0DDD8] rounded-[4px] bg-[#FAFAF8] relative z-10">
                <h4 className="text-[9px] font-black tracking-[0.2em] text-[#A09890] uppercase mb-3 text-center">Project Financial Overview</h4>
                <div className="grid grid-cols-4 gap-4 text-center">
                  <div>
                    <p className="text-[8px] text-[#A09890] uppercase mb-1">Total Project Value</p>
                    <p className="text-[11px] font-bold text-[#0D0D0D]">₹{(projectStats.total_project_value || 0).toLocaleString('en-IN')}</p>
                  </div>
                  <div>
                    <p className="text-[8px] text-[#A09890] uppercase mb-1">Previously Paid</p>
                    <p className="text-[11px] font-bold text-[#0D0D0D]">₹{(projectStats.total_paid || 0).toLocaleString('en-IN')}</p>
                  </div>
                  <div>
                    <p className="text-[8px] text-[#A09890] uppercase mb-1">This Invoice</p>
                    <p className="text-[11px] font-bold text-[#E85C1A]">₹{(grandTotal || 0).toLocaleString('en-IN')}</p>
                  </div>
                  <div>
                    <p className="text-[8px] text-[#A09890] uppercase mb-1">Balance Remaining</p>
                    <p className="text-[11px] font-black text-red-600">₹{((projectStats.total_project_value || 0) - (projectStats.total_paid || 0) - (grandTotal || 0)).toLocaleString('en-IN')}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Total In Words */}
            <div className="mt-8 p-4 bg-[#F7F6F4] border-l-[3px] border-[#E85C1A] relative z-10 flex flex-col">
              <span className="text-[9px] font-normal tracking-[0.18em] text-[#A09890] uppercase mb-1">TOTAL IN WORDS</span>
              <p className="text-xs font-semibold text-[#0D0D0D] italic" style={{ fontFamily: '"Playfair Display", serif' }}>
                Rupees {convertNumberToWords(grandTotal)}
              </p>
            </div>

            {/* Bank details and footer */}
            <div className="grid grid-cols-2 text-[11px] mt-10 pt-6 border-t border-[#E0DDD8] gap-10 relative z-10">
              <div className="space-y-1.5 text-[#6B6560]">
                <h4 className="text-[9px] font-normal tracking-[0.18em] text-[#A09890] uppercase mb-2">BANKING DETAILS</h4>
                <p><span className="text-gray-400">Account Name:</span> <span className="text-[#0D0D0D] font-medium">{formData.accountName}</span></p>
                <p><span className="text-gray-400">A/c Number:</span> <span className="text-[#0D0D0D] font-mono">{formData.accountNo}</span></p>
                <p><span className="text-gray-400">IFSC Code:</span> <span className="text-[#0D0D0D] font-mono">{formData.ifsc}</span></p>
                <p><span className="text-gray-400">Bank:</span> <span className="text-[#0D0D0D] font-medium">{formData.bankName}</span></p>
              </div>
              <div className="flex flex-col items-end justify-between">
                <div className="text-right">
                  <p className="text-[9px] font-normal tracking-[0.2em] text-[#A09890] uppercase mb-1">AUTHORIZED REPRESENTATIVE</p>
                  <p className="text-xs font-bold text-[#0D0D0D] uppercase tracking-wider">{COMPANY_CONFIG.name}</p>
                </div>
                <div className="text-right mt-4">
                  {signatureData ? (
                    <img src={signatureData} alt="Signature" className="h-10 object-contain mix-blend-multiply" />
                  ) : (
                    <div className="h-10 w-40 border-b border-dashed border-[#D8D4CD]" />
                  )}
                </div>
              </div>
            </div>

            <div className="absolute bottom-6 left-[24mm] right-[24mm] text-[8px] text-[#A09890] text-center border-t border-[#E0DDD8] pt-2 font-medium">
              Declaration: This document sets forth verified accounting parameters for selected resources.
            </div>
          </div>
        </div>
      </div>

      {showClientModal && (
        <ClientModal client={null} onClose={() => setShowClientModal(false)} onSave={() => { fetchClients(); setShowClientModal(false); }} />
      )}
    </AppLayout>
  );
}
