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
  items: [{ id: Date.now(), description: '', hsn: '', quantity: 1, rate: 0 }],
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
  const [projects, setProjects] = useState([]);
  const [projectSearch, setProjectSearch] = useState('');
  const [isProjectDropdownOpen, setIsProjectDropdownOpen] = useState(false);
  const [projectStats, setProjectStats] = useState(null);
  const [showConfirmClear, setShowConfirmClear] = useState(false); // Phase 3.3: inline confirm
  const [savedInvoiceRef, setSavedInvoiceRef] = useState(null); // Phase 1: tracks last saved invoice for mark-paid
  
  const previewRef = useRef(null);
  const dropdownRef = useRef(null);
  const projectDropdownRef = useRef(null);
  const canvasRef = useRef(null);

  const location = useLocation();

  useEffect(() => {
    fetchClients();
    fetchRecentInvoices();
    fetchProjects();
    
    // Check for pre-fill data from ProjectDetail page
    if (location.state?.preFill) {
      const { preFill } = location.state;
      setFormData(prev => ({
        ...prev,
        ...preFill,
        // Guard: preFill.items can be null/undefined if navigating from InvoiceHistoryTab "Generate New"
        items: Array.isArray(preFill.items) && preFill.items.length > 0
          ? preFill.items.map(item => ({ ...item, id: item.id || Date.now() }))
          : INITIAL_FORM.items
      }));
      
      // If invoice number is missing, fetch next one
      if (!preFill.invoiceNo) {
        fetchNextInvoiceNumber();
      }
      
      // Clear state to prevent re-filling on refresh
      window.history.replaceState({}, document.title);
    } else {
      const saved = localStorage.getItem('ds16_invoice_draft');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          // Valid draft: must have items array and use camelCase form fields (not raw DB snake_case)
          const isValidDraft = parsed
            && Array.isArray(parsed.items)
            && parsed.items.length > 0
            && !parsed.invoice_no  // reject drafts contaminated with DB snake_case fields
            && !parsed.signature_data; // reject drafts with large Base64 blobs
          if (isValidDraft) {
            setFormData(parsed);
            setIsGstEnabled(parsed.cgstPercent > 0 || parsed.igstPercent > 0);
            setIsIgst(parsed.igstPercent > 0 && parsed.cgstPercent === 0);
          } else {
            localStorage.removeItem('ds16_invoice_draft');
            fetchNextInvoiceNumber();
          }
        } catch (e) {
          localStorage.removeItem('ds16_invoice_draft');
          fetchNextInvoiceNumber();
        }
      } else {
        fetchNextInvoiceNumber();
      }
    }

    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsClientDropdownOpen(false);
      }
      if (projectDropdownRef.current && !projectDropdownRef.current.contains(e.target)) {
        setIsProjectDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    // Wrap in try/catch — localStorage.setItem throws QuotaExceededError if storage is full
    // (e.g. if a large Base64 signature_data accidentally ends up in formData)
    try {
      // Exclude signature_data from draft — it's persisted in the DB, not localStorage
      const { signature_data, ...draftSafe } = formData;
      localStorage.setItem('ds16_invoice_draft', JSON.stringify(draftSafe));
    } catch (e) {
      console.warn('localStorage draft save failed (quota?):', e);
    }
  }, [formData]);

  useEffect(() => {
    if (formData.project_id) {
      fetchProjectStats(formData.project_id);
    } else {
      setProjectStats(null);
    }
  }, [formData.project_id]);

  const fetchProjectStats = async (pid) => {
    try {
      const { data } = await api.get(`/projects/${pid}/financial-summary`);
      setProjectStats(data);
    } catch (err) {
      console.error('Failed to fetch project stats', err);
    }
  };

  const fetchNextInvoiceNumber = async () => {
    try {
      const { data } = await api.get('/invoices/latest/number');
      if (data.nextNo) {
        setFormData(prev => ({ ...prev, invoiceNo: prev.invoiceNo || data.nextNo }));
      } else {
        generateInvoiceNumber(1);
      }
    } catch (err) {
      console.error('Failed to fetch next invoice number', err);
      generateInvoiceNumber(1);
    }
  };

  const generateInvoiceNumber = (count) => {
    const today = new Date();
    const year = today.getFullYear();
    const paddedCount = String(count).padStart(3, '0');
    const autoNo = `DS16-${year}-${paddedCount}`;
    setFormData(prev => ({ ...prev, invoiceNo: autoNo }));
  };

  const fetchProjects = async () => {
    try {
      const { data } = await api.get('/projects');
      setProjects(data.projects || []);
    } catch (err) {
      console.error('Failed to load projects', err);
    }
  };

  const fetchClients = async () => {
    try {
      const { data } = await api.get('/clients');
      // API returns { clients: [], page, limit } — extract the array
      setClients(Array.isArray(data) ? data : (data.clients || []));
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
    if (!formData.invoiceNo.trim()) {
      toast.error('Invoice Number is required');
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
        due_date: formData.dueDate,
        signature_data: signatureData || null
      };

      const { data } = await api.post('/invoices', payload);
      fetchRecentInvoices();
      return data.invoice;
    } catch (err) {
      // Handle duplicate invoice number — give the admin a clear, actionable error
      if (err.response?.status === 409) {
        toast.error(
          `Invoice #${formData.invoiceNo} already exists. Change the invoice number and try again.`,
          { duration: 6000 }
        );
        return null;
      }
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
    // Phase 3.2: Guard against malformed items from corrupted localStorage
    if (!formData || !Array.isArray(formData.items) || formData.items.length === 0) {
      return { subtotal: 0, cgst: 0, sgst: 0, igst: 0, grandTotal: 0 };
    }
    const subtotal = formData.items.reduce((acc, item) => {
      const qty = Number(item.quantity) || 0;
      const rate = Number(item.rate) || 0;
      return acc + (qty * rate);
    }, 0);
    let cgst = 0, sgst = 0, igst = 0;
    if (isGstEnabled) {
      if (isIgst) igst = subtotal * ((Number(formData.igstPercent) || 0) / 100);
      else {
        cgst = subtotal * ((Number(formData.cgstPercent) || 0) / 100);
        sgst = subtotal * ((Number(formData.sgstPercent) || 0) / 100);
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
    if (!formData.invoiceNo.trim()) {
      toast.error('Invoice Number is required');
      return;
    }
    setIsGenerating(true);
    try {
      // Phase 3.1: Save FIRST — if save fails, abort before generating PDF (no ghost invoices)
      const saved = await handleSaveInvoice();
      if (!saved) {
        // handleSaveInvoice already showed a toast; just abort
        setIsGenerating(false);
        return;
      }
      setSavedInvoiceRef(saved);

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
      toast.success('Invoice saved & PDF exported');
    } catch (error) {
      toast.error('Failed to generate PDF');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRecordIncome = async (savedInvoice) => {
    if (!formData.project_id) {
      toast.error('No project linked to this invoice');
      return;
    }
    if (!grandTotal || grandTotal <= 0) {
      toast.error('Invoice amount must be greater than 0');
      return;
    }
    if (!savedInvoice?.id) {
      toast.error('Save the invoice before marking as paid');
      return;
    }

    try {
      // Single atomic call: records finance entry + marks invoice paid in one DB transaction
      await api.post(`/invoices/${savedInvoice.id}/mark-paid`);
      toast.success('Invoice marked as paid and income recorded');
      fetchRecentInvoices();
    } catch (err) {
      const message = err.response?.data?.error || 'Failed to record payment';
      toast.error(message);
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
    // Phase 3.3: inline confirm — avoid browser-blocked window.confirm
    setShowConfirmClear(true);
  };

  const confirmReset = () => {
    localStorage.removeItem('ds16_invoice_draft');
    setFormData(INITIAL_FORM);
    setSignatureData(null);
    setSavedInvoiceRef(null);
    setShowConfirmClear(false);
    generateInvoiceNumber(1);
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

  // Phase 2: Restore a saved Base64 signature onto the canvas
  const restoreSignatureToCanvas = (base64) => {
    if (!base64 || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    };
    img.src = base64;
    setSignatureData(base64);
  };

  const filteredClients = (Array.isArray(clients) ? clients : []).filter(c => (c.name || '').toLowerCase().includes(clientSearch.toLowerCase()));

  const handleProjectSelect = (p) => {
    const client = (Array.isArray(clients) ? clients : []).find(c => c.id === p.client_id || c.name === p.client_name);
    setFormData(prev => ({
      ...prev,
      project_id: p.id,
      billToName: p.client_name || '',
      billToAddress: p.location || client?.address || '',
      billToGst: client?.gst_number || '',
      billToPhone: client?.primary_contact_phone || p.primary_contact_phone || '',
      billToEmail: client?.primary_contact_email || ''
    }));
    setProjectSearch('');
    setIsProjectDropdownOpen(false);
  };


  const filteredProjects = (projects || []).filter(p => 
    (p.name || '').toLowerCase().includes((projectSearch || '').toLowerCase()) ||
    (p.client_name || '').toLowerCase().includes((projectSearch || '').toLowerCase())
  );

  return (
    <AppLayout>
      <div className="flex flex-col lg:flex-row h-[calc(100vh-4.5rem)] lg:h-[calc(100vh-3rem)] bg-[#F0F2F5] overflow-hidden -m-4 lg:-m-6" style={{ fontFamily: '"Inter", sans-serif' }}>
        
        {/* Left: Interactive Input Form (Redesigned) */}
        <div className={`w-full lg:w-[450px] flex flex-col h-full bg-white border-r border-gray-200 shadow-xl z-10 transition-all duration-300 ${showHistory ? 'translate-x-64' : ''}`}>
          <div className="p-5 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
            <div>
              <h2 className="text-lg font-bold text-gray-800">Bill Generator</h2>
              <p className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold mt-0.5">Corporate Standard</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowHistory(!showHistory)} className="p-2 rounded-lg hover:bg-white transition-all text-gray-600 border border-transparent hover:border-gray-200 shadow-sm bg-white/50">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              </button>
              <button onClick={handleReset} className="p-2 rounded-lg hover:bg-white transition-all text-red-500 border border-transparent hover:border-red-100 shadow-sm bg-white/50" title="Reset Form">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 6L6 19M6 6l13 13"/></svg>
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-8 hide-scrollbar">
            
            {/* 1. Project & Client */}
            <section className="space-y-4">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-1 h-4 bg-[#E05A1E] rounded-full"></div>
                <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider">Project & Client</h3>
              </div>

              <div className="space-y-3">
                <div className="relative" ref={projectDropdownRef}>
                  <label className="label">Link Project</label>
                  <input 
                    type="text" 
                    value={projectSearch}
                    onChange={(e) => { setProjectSearch(e.target.value); setIsProjectDropdownOpen(true); }}
                    onFocus={() => setIsProjectDropdownOpen(true)}
                    className="input"
                    placeholder={formData.project_id ? "Project Linked" : "Search projects..."}
                  />
                  {isProjectDropdownOpen && (
                    <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-2xl max-h-60 overflow-y-auto p-1">
                      {filteredProjects.length === 0 ? (
                        <div className="p-4 text-xs text-gray-400 italic text-center">No projects found</div>
                      ) : (
                        filteredProjects.map(p => (
                          <div 
                            key={p.id} 
                            onClick={() => handleProjectSelect(p)}
                            className="p-3 hover:bg-gray-50 cursor-pointer rounded-lg transition-all"
                          >
                            <div className="flex justify-between items-center">
                              <span className="text-sm font-bold text-gray-800">{p.name}</span>
                              <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded font-bold">{p.client_name}</span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>

                <div className="relative" ref={dropdownRef}>
                  <div className="flex justify-between items-end mb-1">
                    <label className="label">Client Details *</label>
                    <button onClick={() => setShowClientModal(true)} className="text-[10px] text-[#E05A1E] font-bold hover:underline">NEW CLIENT</button>
                  </div>
                  <input 
                    type="text" 
                    value={clientSearch || formData.billToName}
                    onChange={(e) => { setClientSearch(e.target.value); setIsClientDropdownOpen(true); }}
                    onFocus={() => setIsClientDropdownOpen(true)}
                    className="input"
                    placeholder="Search or type client name..."
                  />
                  {isClientDropdownOpen && (
                    <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-2xl max-h-60 overflow-y-auto p-1">
                      {filteredClients.map(c => (
                        <div 
                          key={c.id} 
                          onClick={() => {
                            setFormData(prev => ({ 
                              ...prev, 
                              billToName: c.name, 
                              billToAddress: c.address || '',
                              billToGst: c.gst_number || '',
                              billToPhone: c.primary_contact_phone || '', 
                              billToEmail: c.primary_contact_email || '' 
                            }));
                            setIsClientDropdownOpen(false);
                            setClientSearch('');
                          }}
                          className="p-3 hover:bg-gray-50 cursor-pointer rounded-lg transition-all text-sm font-medium text-gray-800"
                        >
                          {c.name}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <textarea 
                  name="billToAddress" 
                  value={formData.billToAddress} 
                  onChange={handleChange} 
                  className="input min-h-[80px] py-3 text-xs" 
                  placeholder="Client Address"
                />

                <div className="grid grid-cols-2 gap-3">
                  <input type="text" name="billToGst" value={formData.billToGst} onChange={handleChange} className="input text-xs" placeholder="Client GSTIN" />
                  <input type="text" name="billToPhone" value={formData.billToPhone} onChange={handleChange} className="input text-xs" placeholder="Client Phone" />
                </div>
              </div>
            </section>

            {/* 2. Invoice Details */}
            <section className="space-y-4">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-1 h-4 bg-[#E05A1E] rounded-full"></div>
                <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider">Invoice Details</h3>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Invoice No *</label>
                  <input type="text" name="invoiceNo" value={formData.invoiceNo} onChange={handleChange} className="input font-mono font-bold text-blue-600" />
                </div>
                <div>
                  <label className="label">Date</label>
                  <input type="date" name="date" value={formData.date} onChange={handleChange} className="input" />
                </div>
                <div>
                  <label className="label">Due Date</label>
                  <input type="date" name="dueDate" value={formData.dueDate} onChange={handleChange} className="input" />
                </div>
                <div>
                  <label className="label">PO / Ref No</label>
                  <input type="text" name="refNo" value={formData.refNo} onChange={handleChange} className="input" placeholder="e.g. PO-9922" />
                </div>
              </div>
            </section>

            {/* 3. Line Items */}
            <section className="space-y-4">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <div className="w-1 h-4 bg-[#E05A1E] rounded-full"></div>
                  <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider">Line Items</h3>
                </div>
                <button onClick={() => setShowCatalog(!showCatalog)} className="text-[10px] text-blue-600 font-bold hover:underline">BROWSE CATALOG</button>
              </div>

              {showCatalog && (
                <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg grid grid-cols-1 gap-2 animate-in fade-in duration-200">
                  {ITEM_CATALOG.map((item, idx) => (
                    <button 
                      key={idx}
                      onClick={() => {
                        setFormData(prev => ({
                          ...prev,
                          items: [...prev.items, { id: Date.now(), description: item.description, hsn: '', quantity: 1, rate: item.rate }]
                        }));
                        setShowCatalog(false);
                      }}
                      className="flex justify-between items-center p-2 hover:bg-white rounded border border-transparent hover:border-blue-200 transition-all text-left group"
                    >
                      <span className="text-[11px] font-medium text-blue-800 line-clamp-1">{item.description}</span>
                      <span className="text-[10px] font-bold text-blue-600">₹{item.rate.toLocaleString()}</span>
                    </button>
                  ))}
                </div>
              )}

              <div className="space-y-4">
                {(formData.items || []).map((item, index) => (
                  <div key={item.id} className="p-4 bg-gray-50 border border-gray-100 rounded-xl relative group">
                    <button 
                      onClick={() => removeItem(item.id)} 
                      className="absolute -top-2 -right-2 w-6 h-6 bg-white border border-gray-200 rounded-full flex items-center justify-center text-red-500 hover:bg-red-500 hover:text-white transition-all shadow-sm opacity-0 group-hover:opacity-100"
                    >
                      &times;
                    </button>
                    <div className="space-y-3">
                      <textarea 
                        value={item.description} 
                        onChange={(e) => handleItemChange(item.id, 'description', e.target.value)}
                        className="input min-h-[60px] text-xs bg-white" 
                        placeholder="Service description..."
                      />
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="text-[9px] font-bold text-gray-400 uppercase">HSN/SAC</label>
                          <input type="text" value={item.hsn} onChange={(e) => handleItemChange(item.id, 'hsn', e.target.value)} className="input text-xs h-8 px-2" placeholder="9983" />
                        </div>
                        <div>
                          <label className="text-[9px] font-bold text-gray-400 uppercase">Qty</label>
                          <input type="number" value={item.quantity} onChange={(e) => handleItemChange(item.id, 'quantity', e.target.value)} className="input text-xs h-8 px-2 text-center" />
                        </div>
                        <div>
                          <label className="text-[9px] font-bold text-gray-400 uppercase">Rate (₹)</label>
                          <input type="number" value={item.rate} onChange={(e) => handleItemChange(item.id, 'rate', e.target.value)} className="input text-xs h-8 px-2 text-right" />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                <button onClick={addItem} className="w-full py-3 border-2 border-dashed border-gray-200 hover:border-[#E05A1E] hover:bg-orange-50 text-gray-400 hover:text-[#E05A1E] text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  ADD LINE ITEM
                </button>
              </div>
            </section>

            {/* 4. Financials */}
            <section className="space-y-4">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <div className="w-1 h-4 bg-[#E05A1E] rounded-full"></div>
                  <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider">Taxes & Banking</h3>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-gray-400 uppercase">GST</span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" checked={isGstEnabled} onChange={() => setIsGstEnabled(!isGstEnabled)} className="sr-only peer" />
                    <div className="w-8 h-4 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-[#E05A1E]"></div>
                  </label>
                </div>
              </div>

              {isGstEnabled && (
                <div className="flex gap-2 p-1 bg-gray-100 rounded-lg">
                  <button onClick={() => setIsIgst(false)} className={`flex-1 py-1.5 text-[10px] font-bold rounded-md transition-all ${!isIgst ? 'bg-white text-[#E05A1E] shadow-sm' : 'text-gray-500'}`}>CGST + SGST</button>
                  <button onClick={() => setIsIgst(true)} className={`flex-1 py-1.5 text-[10px] font-bold rounded-md transition-all ${isIgst ? 'bg-white text-[#E05A1E] shadow-sm' : 'text-gray-500'}`}>IGST ONLY</button>
                </div>
              )}

              <div className="p-4 bg-gray-50 border border-gray-100 rounded-xl space-y-3">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] font-bold text-gray-400 uppercase">Bank Details</label>
                  <button onClick={() => setShowBankDetails(!showBankDetails)} className="text-[10px] text-blue-600 font-bold hover:underline">
                    {showBankDetails ? 'HIDE' : 'SHOW'}
                  </button>
                </div>
                {showBankDetails && (
                  <div className="space-y-2">
                    <input type="text" name="accountNo" value={formData.accountNo} onChange={handleChange} className="input h-9 text-xs" placeholder="Account Number" />
                    <input type="text" name="ifsc" value={formData.ifsc} onChange={handleChange} className="input h-9 text-xs" placeholder="IFSC Code" />
                    <input type="text" name="bankName" value={formData.bankName} onChange={handleChange} className="input h-9 text-xs" placeholder="Bank Name & Branch" />
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <div className="border-b border-gray-100 pb-1">
                  <h3 className="text-[10px] font-bold text-gray-400 uppercase">Authorized Signature</h3>
                </div>
                <div className="flex flex-col items-center bg-white p-2 border border-gray-100 rounded-xl">
                  <canvas 
                    ref={canvasRef}
                    width={300} height={100}
                    onMouseDown={startDrawing} onMouseMove={draw} onMouseUp={stopDrawing} onMouseLeave={stopDrawing}
                    className="cursor-crosshair w-full h-24"
                  />
                  <button onClick={() => {
                    const canvas = canvasRef.current;
                    const ctx = canvas.getContext('2d');
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    setSignatureData(null);
                  }} className="text-[9px] text-gray-400 hover:text-red-500 mt-2 font-bold uppercase tracking-tighter">Clear Signature</button>
                </div>
              </div>
            </section>
          </div>

          <div className="p-5 bg-gray-50 border-t border-gray-100 space-y-3">
            {/* Phase 3.3: Inline confirm clear instead of window.confirm */}
            {showConfirmClear ? (
              <div className="flex gap-2 p-3 bg-red-50 border border-red-100 rounded-xl items-center">
                <p className="text-[10px] text-red-700 font-bold flex-1">Clear all form data?</p>
                <button onClick={confirmReset} className="text-[10px] font-black text-white bg-red-500 px-3 py-1.5 rounded-lg hover:bg-red-600 transition-all">Yes, Clear</button>
                <button onClick={() => setShowConfirmClear(false)} className="text-[10px] font-black text-gray-500 bg-white border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-all">Cancel</button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <button 
                  onClick={handleGeneratePDF} 
                  disabled={isGenerating}
                  className="btn-primary w-full justify-center shadow-lg shadow-orange-100"
                >
                  {isGenerating ? 'Saving...' : 'Export PDF'}
                </button>
                {formData.project_id && (
                  <button 
                    onClick={() => handleRecordIncome(savedInvoiceRef)}
                    className="btn-success w-full justify-center"
                    title={!savedInvoiceRef ? 'Export PDF first to save the invoice' : ''}
                  >
                    Record Paid
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Panel: Corporate Invoice Preview (A4) */}
        <div className="flex-1 h-full bg-[#525659] overflow-y-auto p-12 flex justify-center custom-scrollbar">
          <div 
            ref={previewRef}
            className="bg-white shadow-[0_20px_50px_rgba(0,0,0,0.3)] relative text-[#1A1A1A]"
            style={{ width: '210mm', minHeight: '297mm', padding: '20mm', boxSizing: 'border-box' }}
          >
            {/* Corporate Header */}
            <div className="flex justify-between items-start mb-12 border-b-2 border-gray-900 pb-8">
              <div className="flex items-center gap-5">
                <img src="/logo.jpg" alt="Logo" className="h-20 w-20 object-contain grayscale" />
                <div>
                  <h1 className="text-3xl font-black uppercase tracking-tight leading-none mb-1">{COMPANY_CONFIG.name}</h1>
                  <p className="text-xs font-bold text-gray-500 tracking-[0.3em] uppercase mb-4">Architecture • Interiors</p>
                  <div className="text-[10px] text-gray-600 leading-relaxed font-medium max-w-[300px]">
                    {COMPANY_CONFIG.address}<br />
                    GSTIN: {COMPANY_CONFIG.gst} • PAN: {COMPANY_CONFIG.pan}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <h2 className="text-4xl font-black text-gray-900 uppercase tracking-tighter mb-2">TAX INVOICE</h2>
                <div className="inline-block bg-gray-900 text-white text-[10px] px-3 py-1 font-black tracking-widest uppercase mb-6">Original Copy</div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-right text-[11px] font-bold">
                  <span className="text-gray-400 uppercase tracking-tighter">Invoice No:</span>
                  <span className="text-gray-900">{formData.invoiceNo}</span>
                  <span className="text-gray-400 uppercase tracking-tighter">Date:</span>
                  <span className="text-gray-900">{formData.date}</span>
                  {formData.dueDate && (
                    <>
                      <span className="text-gray-400 uppercase tracking-tighter">Due Date:</span>
                      <span className="text-gray-900">{formData.dueDate}</span>
                    </>
                  )}
                  {formData.refNo && (
                    <>
                      <span className="text-gray-400 uppercase tracking-tighter">Ref No:</span>
                      <span className="text-gray-900">{formData.refNo}</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Client Section */}
            <div className="grid grid-cols-2 gap-10 mb-12">
              <div>
                <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-4 border-b border-gray-100 pb-2">Billed To</h3>
                <div className="text-lg font-black text-gray-900 leading-tight mb-2">{formData.billToName || 'CLIENT NAME'}</div>
                <div className="text-[11px] text-gray-600 font-medium leading-relaxed whitespace-pre-wrap mb-3">
                  {formData.billToAddress}
                </div>
                <div className="space-y-1 text-[11px]">
                  {formData.billToGst && <p className="font-bold"><span className="text-gray-400 uppercase tracking-tighter">GSTIN:</span> {formData.billToGst}</p>}
                  {formData.billToPhone && <p className="font-medium"><span className="text-gray-400 uppercase tracking-tighter">Phone:</span> {formData.billToPhone}</p>}
                </div>
              </div>
              <div className="bg-gray-50 p-5 rounded-2xl border border-gray-100">
                <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-4 border-b border-gray-200 pb-2">Project Statistics</h3>
                {projectStats && typeof projectStats === 'object' ? (
                  <div>
                    <p className="text-[9px] font-bold text-gray-400 uppercase mb-1">Total Value</p>
                    <p className="text-sm font-black text-gray-900">₹{(projectStats.total_project_value ?? projectStats.total_income ?? 0).toLocaleString('en-IN')}</p>
                  </div>
                ) : (
                  <p className="text-[10px] text-gray-400 italic">No linked project data available</p>
                )}
              </div>
            </div>

            {/* Items Table */}
            <table className="w-full mb-10">
              <thead>
                <tr className="bg-gray-900 text-white text-[10px] font-black uppercase tracking-widest">
                  <th className="py-3 px-4 text-center w-12">#</th>
                  <th className="py-3 px-4 text-left">Description of Services</th>
                  <th className="py-3 px-4 text-center w-24">HSN/SAC</th>
                  <th className="py-3 px-4 text-center w-16">Qty</th>
                  <th className="py-3 px-4 text-right w-28">Rate</th>
                  <th className="py-3 px-4 text-right w-32">Amount</th>
                </tr>
              </thead>
              <tbody className="text-[11px] font-bold">
                {(formData.items || INITIAL_FORM.items).map((item, idx) => (
                  <tr key={item.id} className="border-b border-gray-100">
                    <td className="py-5 px-4 text-center text-gray-400">{idx + 1}</td>
                    <td className="py-5 px-4 text-gray-900 leading-relaxed whitespace-pre-wrap">{item.description || 'Professional Design Services'}</td>
                    <td className="py-5 px-4 text-center text-gray-600">{item.hsn || '9983'}</td>
                    <td className="py-5 px-4 text-center text-gray-900">{item.quantity}</td>
                    <td className="py-5 px-4 text-right text-gray-900">₹{parseFloat(item.rate).toLocaleString('en-IN')}</td>
                    <td className="py-5 px-4 text-right text-gray-900">₹{(item.quantity * item.rate).toLocaleString('en-IN')}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Footer Totals */}
            <div className="flex justify-end mb-12">
              <div className="w-[300px] space-y-2">
                <div className="flex justify-between text-[11px] font-bold">
                  <span className="text-gray-400 uppercase tracking-widest">Subtotal</span>
                  <span className="text-gray-900">₹{subtotal.toLocaleString('en-IN')}</span>
                </div>
                {isGstEnabled && !isIgst && (
                  <>
                    <div className="flex justify-between text-[11px] font-bold">
                      <span className="text-gray-400 uppercase tracking-widest">CGST ({formData.cgstPercent}%)</span>
                      <span className="text-gray-900">₹{cgst.toLocaleString('en-IN')}</span>
                    </div>
                    <div className="flex justify-between text-[11px] font-bold">
                      <span className="text-gray-400 uppercase tracking-widest">SGST ({formData.sgstPercent}%)</span>
                      <span className="text-gray-900">₹{sgst.toLocaleString('en-IN')}</span>
                    </div>
                  </>
                )}
                {isGstEnabled && isIgst && (
                  <div className="flex justify-between text-[11px] font-bold">
                    <span className="text-gray-400 uppercase tracking-widest">IGST ({formData.igstPercent}%)</span>
                    <span className="text-gray-900">₹{igst.toLocaleString('en-IN')}</span>
                  </div>
                )}
                <div className="flex justify-between items-center bg-gray-900 text-white p-4 rounded-xl mt-4">
                  <span className="text-xs font-black uppercase tracking-[0.2em]">Grand Total</span>
                  <span className="text-lg font-black font-mono">₹{grandTotal.toLocaleString('en-IN')}</span>
                </div>
              </div>
            </div>

            {/* Words & Bank */}
            <div className="grid grid-cols-2 gap-10 mb-12">
              <div className="space-y-6">
                <div>
                  <h4 className="text-[9px] font-black text-gray-400 uppercase tracking-[0.2em] mb-2">Amount in Words</h4>
                  <p className="text-[11px] font-black text-gray-900 italic">Rupees {convertNumberToWords(grandTotal)} Only</p>
                </div>
                <div className="bg-gray-50 p-5 rounded-2xl border border-gray-100">
                  <h4 className="text-[9px] font-black text-gray-400 uppercase tracking-[0.2em] mb-3">Bank Transfer Details</h4>
                  <div className="space-y-1.5 text-[10px] font-bold">
                    <p><span className="text-gray-400 uppercase tracking-tighter w-20 inline-block">A/C Name:</span> {formData.accountName}</p>
                    <p><span className="text-gray-400 uppercase tracking-tighter w-20 inline-block">A/C No:</span> {formData.accountNo}</p>
                    <p><span className="text-gray-400 uppercase tracking-tighter w-20 inline-block">IFSC Code:</span> {formData.ifsc}</p>
                    <p><span className="text-gray-400 uppercase tracking-tighter w-20 inline-block">Bank:</span> {formData.bankName}</p>
                  </div>
                </div>
              </div>
              <div className="flex flex-col items-end justify-between py-2">
                <div className="text-right">
                  <p className="text-[9px] font-black text-gray-400 uppercase tracking-[0.2em] mb-1">Authorized Signatory</p>
                  <p className="text-[11px] font-black uppercase tracking-tight">{COMPANY_CONFIG.name}</p>
                </div>
                <div className="mt-6">
                  {signatureData ? (
                    <img src={signatureData} alt="Signature" className="h-16 object-contain mix-blend-multiply" />
                  ) : (
                    <div className="h-16 w-48 border-b-2 border-dashed border-gray-200" />
                  )}
                </div>
              </div>
            </div>

            <div className="text-[9px] text-gray-400 font-bold uppercase tracking-widest text-center border-t border-gray-100 pt-8">
              Computer Generated Invoice • No Signature Required Unless Specified
            </div>
          </div>
        </div>

        {/* History Drawer Overlay */}
        {showHistory && (
          <div className="fixed inset-0 z-50 lg:relative lg:inset-auto lg:z-0">
             <div className="absolute inset-0 bg-black/50 lg:hidden" onClick={() => setShowHistory(false)} />
             <div className="absolute left-0 top-0 bottom-0 w-64 bg-gray-900 z-30 shadow-2xl flex flex-col transition-all duration-300">
                <div className="p-5 border-b border-white/10 flex justify-between items-center bg-gray-800">
                  <h3 className="text-[10px] font-black tracking-widest text-white uppercase">Invoice History</h3>
                  <button onClick={() => setShowHistory(false)} className="text-white/40 hover:text-white">&times;</button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                  {(recentInvoices || []).map(inv => (
                    <div 
                      key={inv.id}
                      onClick={() => {
                        setFormData({
                          // Only pick the form fields we care about — never spread raw DB columns
                          // (avoids signature_data Base64, created_at, id, etc. landing in formData)
                          ...INITIAL_FORM,
                          project_id: inv.project_id || null,
                          invoiceNo: inv.invoice_no || '',
                          date: inv.date ? inv.date.split('T')[0] : INITIAL_FORM.date,
                          dueDate: inv.due_date ? inv.due_date.split('T')[0] : '',
                          refNo: inv.ref_no || '',
                          billToName: inv.client_name || '',
                          billToAddress: inv.bill_to_address || '',
                          billToGst: inv.bill_to_gst || '',
                          billToPhone: inv.bill_to_phone || '',
                          billToEmail: inv.bill_to_email || '',
                          accountNo: inv.account_no || '',
                          ifsc: inv.ifsc || '',
                          bankName: inv.bank_name || '',
                          items: Array.isArray(inv.items)
                            ? inv.items.map(item => ({ ...item, id: item.id || Date.now(), hsn: item.hsn || '' }))
                            : INITIAL_FORM.items,
                          cgstPercent: inv.tax_details?.cgstPercent ?? 9,
                          sgstPercent: inv.tax_details?.sgstPercent ?? 9,
                          igstPercent: inv.tax_details?.igstPercent ?? 18,
                        });
                        setIsGstEnabled(inv.tax_details?.isGstEnabled ?? true);
                        setIsIgst(inv.tax_details?.isIgst ?? false);
                        // Phase 2: Restore archived signature to canvas
                        if (inv.signature_data) {
                          setTimeout(() => restoreSignatureToCanvas(inv.signature_data), 50);
                        } else {
                          // Clear canvas if no saved signature
                          const canvas = canvasRef.current;
                          if (canvas) canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
                          setSignatureData(null);
                        }
                        // Phase 1: Track the invoice so mark-paid can use its DB id
                        setSavedInvoiceRef(inv);
                        setShowHistory(false);
                      }}
                      className="p-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 cursor-pointer transition-all"
                    >
                      <div className="flex justify-between items-start mb-1">
                        <span className="text-[10px] font-black text-[#E05A1E]">{inv.invoice_no}</span>
                        <span className="text-[8px] text-white/40 uppercase font-black">{new Date(inv.date).toLocaleDateString()}</span>
                      </div>
                      <p className="text-[11px] text-white/80 font-bold truncate">{inv.client_name}</p>
                      <p className="text-[10px] text-white/60 font-black mt-2">₹{parseFloat(inv.amount).toLocaleString('en-IN')}</p>
                    </div>
                  ))}
                </div>
             </div>
          </div>
        )}
      </div>

      {showClientModal && (
        <ClientModal client={null} onClose={() => setShowClientModal(false)} onSave={() => { fetchClients(); setShowClientModal(false); }} />
      )}
    </AppLayout>
  );
}
