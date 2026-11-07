import React from 'react';
import { FileText, Download, Printer, X } from 'lucide-react';

export default function ExpensesReportModal({
  isOpen,
  onClose,
  expenses = [],
  isExportingExpensesPdf = false,
  handleExportExpensesPDF
}) {
  if (!isOpen) return null;

  const totalExpenseOutflow = expenses.reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);
  const categoriesCount = new Set(expenses.map(e => e.category)).size;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 no-print-overlay">
      <div className="bg-white rounded-2xl max-w-5xl w-full border border-gray-200 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 my-8 flex flex-col max-h-[90vh]">
        
        {/* Modal Header Controls */}
        <div className="p-4 border-b border-gray-200 bg-gray-900 text-white flex items-center justify-between no-print">
          <div className="flex items-center gap-2">
            <FileText size={18} className="text-[#E05A1E]" />
            <h3 className="text-sm font-bold tracking-wide">Expense Accounting Report Preview</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleExportExpensesPDF}
              disabled={isExportingExpensesPdf}
              className="px-3 py-1.5 bg-[#E05A1E] hover:bg-[#c94e16] text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm"
            >
              <Download size={14} />
              <span>Download PDF</span>
            </button>
            <button
              onClick={() => window.print()}
              className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 border border-gray-700"
            >
              <Printer size={14} />
              <span>Print</span>
            </button>
            <button
              onClick={onClose}
              className="p-1 text-gray-400 hover:text-white rounded-lg transition-colors ml-2"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Document Content */}
        <div className="p-6 sm:p-8 overflow-y-auto space-y-6 flex-1 bg-white" id="printable-expenses-report-area">
          
          {/* Report Header */}
          <div className="border-b-2 border-slate-900 pb-4 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
            <div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">DESIGN STUDIO SIXTEEN</h1>
              <p className="text-xs text-slate-500 font-semibold mt-0.5">104, A, Pande Layout, Khamla, Nagpur • GSTIN: 27AJKPG8543M1ZN</p>
            </div>
            <div className="sm:text-right">
              <span className="inline-block px-3 py-1 bg-blue-100 text-blue-800 rounded-md text-xs font-black uppercase tracking-widest">
                Expense Audit Statement
              </span>
              <p className="text-[11px] font-bold text-slate-500 mt-1">
                Generated: {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
              </p>
              <p className="text-[10px] text-slate-400 font-medium">
                Total Records: {expenses.length} Entries
              </p>
            </div>
          </div>

          {/* Executive Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Expense Outflow</p>
              <p className="text-base font-black font-mono text-slate-900 mt-0.5">
                ₹{totalExpenseOutflow.toLocaleString('en-IN')}
              </p>
              <p className="text-[10px] text-slate-500 font-semibold">{expenses.length} Records Tracked</p>
            </div>

            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Categories Mapped</p>
              <p className="text-base font-black font-mono text-slate-800 mt-0.5">
                {categoriesCount} Categories
              </p>
              <p className="text-[10px] text-slate-500 font-semibold">Active Ledger Allocation</p>
            </div>

            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Audit Status</p>
              <p className="text-base font-black font-mono text-emerald-600 mt-0.5">
                System Verified
              </p>
              <p className="text-[10px] text-emerald-700 font-semibold">Period Locks Enforced</p>
            </div>
          </div>

          {/* Formatted Audit Table */}
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-900 text-white">
                  <th className="px-3 py-2.5 font-bold uppercase tracking-wider text-[10px] text-center w-8">#</th>
                  <th className="px-3 py-2.5 font-bold uppercase tracking-wider text-[10px]">Date</th>
                  <th className="px-3 py-2.5 font-bold uppercase tracking-wider text-[10px]">Category</th>
                  <th className="px-3 py-2.5 font-bold uppercase tracking-wider text-[10px]">Description</th>
                  <th className="px-3 py-2.5 font-bold uppercase tracking-wider text-[10px] text-right">Amount</th>
                  <th className="px-3 py-2.5 font-bold uppercase tracking-wider text-[10px] text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {expenses.slice().sort((a,b) => new Date(b.date) - new Date(a.date)).map((exp, idx) => (
                  <tr key={exp.id || idx} className={idx % 2 === 1 ? 'bg-slate-50/50' : 'bg-white'}>
                    <td className="px-3 py-2 text-center text-slate-400 font-mono text-[11px]">{idx + 1}</td>
                    <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{new Date(exp.date).toLocaleDateString('en-IN')}</td>
                    <td className="px-3 py-2 font-semibold text-slate-900">{exp.category}</td>
                    <td className="px-3 py-2 text-slate-600 italic">{exp.description || '-'}</td>
                    <td className="px-3 py-2 text-right font-mono font-bold text-slate-900">₹{parseFloat(exp.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td className="px-3 py-2 text-center whitespace-nowrap">
                      <span className={`inline-block px-2 py-0.5 text-[9px] font-black uppercase tracking-wider rounded-full ${exp.is_verified ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                        {exp.is_verified ? 'Verified' : 'Unverified'}
                      </span>
                      {exp.period_unlock_id && (
                        <span className="block text-[8px] font-bold text-amber-600 mt-0.5">Backdated</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-900 text-white font-bold border-t-2 border-slate-900">
                <tr>
                  <td colSpan={4} className="px-3 py-2.5 uppercase text-[10px]">Total Expenses ({expenses.length} Records)</td>
                  <td className="px-3 py-2.5 text-right font-mono text-xs text-orange-400">₹{totalExpenseOutflow.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Report Footer */}
          <div className="pt-4 border-t border-slate-200 flex justify-between items-center text-[10px] text-slate-400">
            <p>This is a system-generated expense audit report for Design Studio Sixteen.</p>
            <p>Page 1 of 1</p>
          </div>

        </div>
      </div>
    </div>
  );
}
