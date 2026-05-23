import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/client';
import toast from 'react-hot-toast';

export default function InvoiceHistoryTab({ projectId, project }) {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const fetchInvoices = useCallback(async () => {
    try {
      const { data } = await api.get(`/invoices?project_id=${projectId}`);
      // Phase 3.4: Defensive guard — fall back to empty array if response is malformed
      setInvoices(Array.isArray(data?.invoices) ? data.invoices : []);
    } catch (err) {
      toast.error('Failed to load invoice history');
      setInvoices([]); // Ensure empty state renders cleanly
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  const handleViewInvoice = (invoice) => {
    navigate('/admin/invoice', { 
      state: { 
        preFill: {
          // Explicit mapping — never spread raw DB record to avoid snake_case/null contamination
          project_id: invoice.project_id || null,
          invoiceNo: invoice.invoice_no || '',
          date: invoice.date ? String(invoice.date).split('T')[0] : '',
          dueDate: invoice.due_date ? String(invoice.due_date).split('T')[0] : '',
          billToName: invoice.client_name || '',
          billToAddress: invoice.bill_to_address || '',
          billToGst: invoice.bill_to_gst || '',
          billToPhone: invoice.bill_to_phone || '',
          billToEmail: invoice.bill_to_email || '',
          accountNo: invoice.account_no || '',
          ifsc: invoice.ifsc || '',
          bankName: invoice.bank_name || '',
          items: Array.isArray(invoice.items) && invoice.items.length > 0
            ? invoice.items
            : [{ id: Date.now(), description: '', hsn: '', quantity: 1, rate: 0 }],
          cgstPercent: invoice.tax_details?.cgstPercent ?? 9,
          sgstPercent: invoice.tax_details?.sgstPercent ?? 9,
          igstPercent: invoice.tax_details?.igstPercent ?? 18,
        } 
      } 
    });
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-12 w-full rounded-lg" />
        <div className="skeleton h-12 w-full rounded-lg" />
        <div className="skeleton h-12 w-full rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-semibold text-[#1A1A1A] flex items-center gap-2">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <polyline points="10 9 9 9 8 9" />
          </svg>
          Invoice Archive
        </h3>
        <button 
          onClick={() => navigate('/admin/invoice', { 
            state: { 
              preFill: { 
                project_id: projectId,
                billToName: project?.client_display_name || project?.client_name || '',
                billToAddress: project?.location || '',
                billToGst: project?.gst_number || '',
                billToPhone: project?.primary_contact_phone || '',
                billToEmail: project?.primary_contact_email || '',
                items: [{ id: Date.now(), description: '', quantity: 1, rate: 0 }]
              } 
            } 
          })}
          className="text-[10px] font-bold text-[#E05A1E] uppercase tracking-widest hover:underline"
        >
          + Generate New
        </button>
      </div>

      <div className="overflow-hidden border border-[#EBEBEB] rounded-xl bg-white shadow-sm">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b border-[#F0F0F0] text-muted font-bold uppercase tracking-tighter">
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Invoice #</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F0F0F0]">
            {invoices.length === 0 ? (
              <tr>
                <td colSpan="5" className="px-4 py-10 text-center text-muted italic">
                  No invoices found for this project.
                </td>
              </tr>
            ) : (
              invoices.map((inv) => (
                <tr key={inv.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-4 py-4 text-[#1A1A1A] font-medium">
                    {new Date(inv.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </td>
                  <td className="px-4 py-4 font-mono text-[#E05A1E] font-bold">
                    {inv.invoice_no}
                  </td>
                  <td className="px-4 py-4 text-[#1A1A1A] font-bold">
                    ₹{parseFloat(inv.amount).toLocaleString('en-IN')}
                  </td>
                  <td className="px-4 py-4">
                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest border ${
                      inv.status === 'paid' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                      inv.status === 'sent' ? 'bg-blue-50 text-blue-600 border-blue-100' :
                      inv.status === 'cancelled' ? 'bg-red-50 text-red-600 border-red-100' :
                      'bg-orange-50 text-orange-600 border-orange-100'
                    }`}>
                      {inv.status}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-right">
                    <button 
                      onClick={() => handleViewInvoice(inv)}
                      className="bg-[#1A1A1A] text-white px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest hover:bg-[#E05A1E] transition-all"
                    >
                      View & Print
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {invoices.length > 0 && (
            <tfoot className="bg-gray-50 font-bold border-t border-[#F0F0F0]">
              <tr>
                <td className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase" colSpan={2}>
                  Total of {invoices.length} {invoices.length === 1 ? 'Invoice' : 'Invoices'}
                </td>
                <td className="px-4 py-3 text-[#E05A1E] font-black">
                  ₹{invoices.reduce((sum, inv) => sum + parseFloat(inv.amount || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex items-start gap-3">
        <span className="text-xl">ℹ️</span>
        <p className="text-[11px] text-blue-700 leading-relaxed font-medium">
          The <strong>Invoice Archive</strong> stores the exact state of the document at the time of generation. 
          Updating project details later will not affect archived invoices to maintain compliance.
        </p>
      </div>
    </div>
  );
}
