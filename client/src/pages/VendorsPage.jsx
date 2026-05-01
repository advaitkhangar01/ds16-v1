// client/src/pages/VendorsPage.jsx
// Vendor catalog - Kanban style grouping with CRUD

import { useState, useEffect, useCallback } from 'react';
import AppLayout from '../components/layout/AppLayout';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

const VENDOR_CATEGORIES = [
  'Carpenter', 'Electrician', 'Plumber', 'POP', 'Contractor', 
  'Painter', 'Fabricator', 'Glass Work', 'Tile Work', 
  'Civil Work', 'Other'
];

// --- Modal for Create/Edit
function VendorModal({ vendor, onClose, onSave }) {
  const [form, setForm] = useState(vendor || { 
    name: '', category: 'Carpenter', phone: '', email: '', remarks: '' 
  });
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim() || !form.category) {
      toast.error('Name and category are required');
      return;
    }
    setLoading(true);
    try {
      if (vendor?.id) {
        const { data } = await api.patch(`/vendors/${vendor.id}`, form);
        toast.success('Vendor updated');
        onSave(data);
      } else {
        const { data } = await api.post('/vendors', form);
        toast.success('Vendor added');
        onSave(data);
      }
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Operation failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md card border border-[#E0E0E0] shadow-2xl animate-in fade-in zoom-in duration-200">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-semibold text-[#1A1A1A]">
            {vendor ? 'Edit Vendor' : 'Add New Vendor'}
          </h3>
          <button onClick={onClose} className="text-muted hover:text-[#1A1A1A] transition-colors">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label text-xs font-semibold uppercase tracking-wider mb-1.5 block">Vendor Name *</label>
            <input className="input" placeholder="e.g. Rajesh Carpentry" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className="label text-xs font-semibold uppercase tracking-wider mb-1.5 block">Category *</label>
            <select className="input" value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {VENDOR_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label text-xs font-semibold uppercase tracking-wider mb-1.5 block">Phone</label>
              <input className="input" placeholder="10-digit number" value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div>
              <label className="label text-xs font-semibold uppercase tracking-wider mb-1.5 block">Email</label>
              <input className="input" type="email" placeholder="email@example.com" value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="label text-xs font-semibold uppercase tracking-wider mb-1.5 block">Remarks / Notes</label>
            <textarea className="input min-h-[80px]" placeholder="Experience, specialty, etc." value={form.remarks}
              onChange={(e) => setForm({ ...form, remarks: e.target.value })} />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">Cancel</button>
            <button type="submit" disabled={loading} className="btn-primary flex-1 justify-center">
              {loading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : vendor ? 'Update Vendor' : 'Add Vendor'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function VendorsPage() {
  const { isAdmin } = useAuth();
  const [vendors, setVendors] = useState([]);
  const [grouped, setGrouped] = useState({});
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState({ show: false, vendor: null });
  const [historyModal, setHistoryModal] = useState({ show: false, vendor: null });

  const fetchVendors = useCallback(async () => {
    try {
      const { data } = await api.get('/vendors');
      setVendors(data.vendors);
      setGrouped(data.grouped);
    } catch {
      toast.error('Failed to load vendors');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchVendors(); }, [fetchVendors]);

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Delete vendor "${name}"?`)) return;
    try {
      await api.delete(`/vendors/${id}`);
      toast.success('Vendor deleted');
      fetchVendors();
    } catch (err) {
      toast.error('Failed to delete vendor');
    }
  };

  const handleSave = () => {
    fetchVendors();
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-[#1A1A1A]">Vendors</h1>
            <p className="text-muted text-sm mt-0.5">{vendors.length} specialists available</p>
          </div>
          {isAdmin && (
            <button onClick={() => setModal({ show: true, vendor: null })} className="btn-primary">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Add Vendor
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64">
             <div className="w-10 h-10 border-2 border-[#E05A1E] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="flex gap-6 overflow-x-auto pb-6 scrollbar-thin scrollbar-thumb-gray-200">
            {VENDOR_CATEGORIES.map((category) => {
              const categoryVendors = vendors.filter(v => v.category === category);
              if (categoryVendors.length === 0 && !isAdmin) return null;

              return (
                <div key={category} className="min-w-[300px] max-w-[300px] flex flex-col gap-4">
                  <div className="flex items-center justify-between px-1">
                    <h3 className="text-sm font-bold text-[#1A1A1A] flex items-center gap-2 uppercase tracking-wide">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#E05A1E]"></span>
                      {category}s
                      <span className="text-[10px] bg-[#F5F5F5] text-muted px-1.5 py-0.5 rounded-full font-medium">
                        {categoryVendors.length}
                      </span>
                    </h3>
                  </div>

                  <div className="flex flex-col gap-3 min-h-[100px] bg-[#F8F9FA]/50 p-2 rounded-xl border border-dashed border-[#E0E0E0]">
                    {categoryVendors.map((v) => (
                      <div key={v.id} className="card group hover:border-[rgba(224,90,30,0.3)] hover:shadow-md transition-all duration-200">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1 min-w-0">
                            <h4 className="text-sm font-semibold text-[#1A1A1A] truncate">{v.name}</h4>
                          </div>
                          {isAdmin && (
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button 
                                onClick={() => setModal({ show: true, vendor: v })}
                                className="p-1 text-muted hover:text-[#E05A1E] transition-colors"
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                                </svg>
                              </button>
                              <button 
                                onClick={() => handleDelete(v.id, v.name)}
                                className="p-1 text-muted hover:text-red-500 transition-colors"
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"/>
                                </svg>
                              </button>
                            </div>
                          )}
                        </div>

                        <div className="flex items-center justify-between mt-auto pt-2">
                           <button 
                             onClick={() => setHistoryModal({ show: true, vendor: v })}
                             className="text-[10px] font-bold text-[#E05A1E] hover:underline flex items-center gap-1"
                           >
                             <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 3h12M6 8h12M6 13l8.5 8M6 13h3a5 5 0 0 1 5-5" /></svg>
                             View Payments
                           </button>
                        </div>
                        
                        <div className="space-y-1.5">
                          {v.phone && (
                            <div className="flex items-center gap-2 text-xs text-muted">
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l2.19-2.19a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                              </svg>
                              {v.phone}
                            </div>
                          )}
                          {v.email && (
                            <div className="flex items-center gap-2 text-xs text-muted">
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
                              </svg>
                              {v.email}
                            </div>
                          )}
                          {v.remarks && (
                            <p className="text-[10px] text-muted line-clamp-2 italic pt-1 border-t border-[#F0F0F0] mt-1.5">{v.remarks}</p>
                          )}
                        </div>
                      </div>
                    ))}
                    {categoryVendors.length === 0 && (
                      <div className="flex-1 flex flex-col items-center justify-center py-8 text-center">
                        <p className="text-[10px] text-muted italic">No {category.toLowerCase()}s</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {modal.show && (
        <VendorModal 
          vendor={modal.vendor} 
          onClose={() => setModal({ show: false, vendor: null })} 
          onSave={handleSave}
        />
      )}

      {historyModal.show && (
        <VendorHistoryModal 
          vendor={historyModal.vendor} 
          onClose={() => setHistoryModal({ show: false, vendor: null })} 
        />
      )}
    </AppLayout>
  );
}

function VendorHistoryModal({ vendor, onClose }) {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchHistory() {
      try {
        const { data } = await api.get(`/finances/transactions?vendor_id=${vendor.id}&category=vendor_payment`);
        setPayments(data.transactions);
      } catch (err) {
        toast.error('Failed to load payment history');
      } finally {
        setLoading(false);
      }
    }
    fetchHistory();
  }, [vendor.id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-2xl card border border-[#E0E0E0] shadow-2xl animate-in fade-in zoom-in duration-200 p-0 overflow-hidden">
        <div className="p-6 border-b border-[#F0F0F0] flex items-center justify-between bg-gray-50/50">
          <div>
            <h3 className="text-lg font-bold text-[#1A1A1A]">Payment History</h3>
            <p className="text-xs text-muted">Vendor: <span className="text-[#E05A1E] font-bold">{vendor.name}</span></p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-[#1A1A1A] transition-colors">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className="max-h-[400px] overflow-y-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-white border-b border-[#F0F0F0] sticky top-0">
              <tr>
                <th className="px-6 py-4 font-bold text-muted uppercase tracking-widest">Date</th>
                <th className="px-6 py-4 font-bold text-muted uppercase tracking-widest">Project</th>
                <th className="px-6 py-4 font-bold text-muted uppercase tracking-widest">Description</th>
                <th className="px-6 py-4 font-bold text-muted uppercase tracking-widest text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0F0F0]">
              {loading ? (
                [1, 2, 3].map(i => (
                  <tr key={i}>
                    <td className="px-6 py-4"><div className="skeleton h-3 w-16 rounded" /></td>
                    <td className="px-6 py-4"><div className="skeleton h-3 w-32 rounded" /></td>
                    <td className="px-6 py-4"><div className="skeleton h-3 w-48 rounded" /></td>
                    <td className="px-6 py-4 text-right"><div className="skeleton h-3 w-12 ml-auto rounded" /></td>
                  </tr>
                ))
              ) : payments.length === 0 ? (
                <tr>
                  <td colSpan="4" className="px-6 py-10 text-center text-muted italic">No payments found for this vendor</td>
                </tr>
              ) : (
                payments.map(p => (
                  <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 text-muted">
                      {new Date(p.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="px-6 py-4 font-medium text-[#1A1A1A]">
                      {p.project_name || 'General'}
                    </td>
                    <td className="px-6 py-4 text-muted italic">
                      {p.description}
                    </td>
                    <td className="px-6 py-4 text-right font-bold text-emerald-600">
                      ₹{parseFloat(p.amount).toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        <div className="p-6 bg-gray-50 border-t border-[#F0F0F0] flex justify-between items-center">
          <span className="text-[10px] font-bold text-muted uppercase tracking-widest">Total Paid To Date</span>
          <span className="text-base font-black text-[#1A1A1A]">
            ₹{payments.reduce((sum, p) => sum + parseFloat(p.amount), 0).toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  );
}
