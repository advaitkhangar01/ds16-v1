import React from 'react';
import { FileText, Download, Printer, X } from 'lucide-react';

const MONTH_NAMES = [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export default function PayrollReportModal({
  isOpen,
  onClose,
  selectedMonth,
  selectedYear,
  employees = [],
  payrollHistory = [],
  rowIncentives = {},
  isExportingPayrollPdf = false,
  handleExportPayrollPDF
}) {
  if (!isOpen) return null;

  const modalTotalBase = employees.reduce((sum, e) => sum + parseFloat(e.base_salary || 0), 0);
  const modalTotalIncentives = employees.reduce((sum, e) => {
    const p = payrollHistory.find(ph => ph.user_id === e.id);
    return sum + (p ? parseFloat(p.incentives || 0) : parseFloat(rowIncentives[e.id] || 0));
  }, 0);
  const modalDisbursedNet = payrollHistory.reduce((sum, p) => sum + parseFloat(p.net_paid || 0), 0);
  const modalTotalNet = employees.reduce((sum, e) => {
    const p = payrollHistory.find(ph => ph.user_id === e.id);
    const base = parseFloat(e.base_salary || 0);
    const inc = p ? parseFloat(p.incentives || 0) : parseFloat(rowIncentives[e.id] || 0);
    const empNet = e.current_net_payable !== undefined ? e.current_net_payable : (e.net_salary_payable !== undefined ? e.net_salary_payable : (e.suggested_salary !== undefined ? e.suggested_salary : base));
    return sum + (p ? parseFloat(p.net_paid || 0) : (empNet + inc));
  }, 0);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 no-print-overlay">
      <div className="bg-white rounded-2xl max-w-5xl w-full border border-gray-200 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 my-8 flex flex-col max-h-[90vh]">
        
        {/* Modal Header Controls */}
        <div className="p-4 border-b border-gray-200 bg-gray-900 text-white flex items-center justify-between no-print">
          <div className="flex items-center gap-2">
            <FileText size={18} className="text-[#E05A1E]" />
            <h3 className="text-sm font-bold tracking-wide">Payroll & Salary Disbursement Report Preview</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleExportPayrollPDF}
              disabled={isExportingPayrollPdf}
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
        <div className="p-6 sm:p-8 overflow-y-auto space-y-6 flex-1 bg-white" id="printable-payroll-report-area">
          
          {/* Report Header */}
          <div className="border-b-2 border-slate-900 pb-4 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
            <div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">DESIGN STUDIO SIXTEEN</h1>
              <p className="text-xs text-slate-500 font-semibold mt-0.5">104, A, Pande Layout, Khamla, Nagpur • GSTIN: 27AJKPG8543M1ZN</p>
            </div>
            <div className="sm:text-right">
              <span className="inline-block px-3 py-1 bg-emerald-100 text-emerald-800 rounded-md text-xs font-black uppercase tracking-widest">
                Payroll Audit Statement
              </span>
              <p className="text-[11px] font-bold text-slate-500 mt-1">
                Period: {MONTH_NAMES[selectedMonth]} {selectedYear}
              </p>
              <p className="text-[10px] text-slate-400 font-medium">
                {employees.length} Staff Mapped ({payrollHistory.length} Disbursed)
              </p>
            </div>
          </div>

          {/* Executive Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Base Salaries</p>
              <p className="text-base font-black font-mono text-slate-900 mt-0.5">
                ₹{modalTotalBase.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </p>
              <p className="text-[10px] text-slate-500 font-semibold">{employees.length} Active Staff</p>
            </div>

            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Incentives</p>
              <p className="text-base font-black font-mono text-purple-600 mt-0.5">
                ₹{modalTotalIncentives.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </p>
              <p className="text-[10px] text-purple-700 font-semibold">Bonus & Adjustments</p>
            </div>

            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Net Payroll</p>
              <p className="text-base font-black font-mono text-emerald-600 mt-0.5">
                ₹{modalTotalNet.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </p>
              <p className="text-[10px] text-emerald-700 font-semibold">
                ₹{modalDisbursedNet.toLocaleString('en-IN', { minimumFractionDigits: 2 })} Disbursed
              </p>
            </div>

            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Disbursement Status</p>
              <p className="text-base font-black font-mono text-slate-800 mt-0.5">
                {payrollHistory.length} / {employees.length}
              </p>
              <p className="text-[10px] text-orange-600 font-semibold">
                {employees.length - payrollHistory.length} Pending
              </p>
            </div>
          </div>

          {/* Formatted Audit Table */}
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-900 text-white">
                  <th className="px-3 py-2.5 font-bold uppercase tracking-wider text-[10px] text-center w-8">#</th>
                  <th className="px-3 py-2.5 font-bold uppercase tracking-wider text-[10px]">Employee Name</th>
                  <th className="px-3 py-2.5 font-bold uppercase tracking-wider text-[10px]">Department</th>
                  <th className="px-3 py-2.5 font-bold uppercase tracking-wider text-[10px]">Role</th>
                  <th className="px-3 py-2.5 font-bold uppercase tracking-wider text-[10px]">Work Summary</th>
                  <th className="px-3 py-2.5 font-bold uppercase tracking-wider text-[10px] text-right">Base Salary</th>
                  <th className="px-3 py-2.5 font-bold uppercase tracking-wider text-[10px] text-right">Incentives</th>
                  <th className="px-3 py-2.5 font-bold uppercase tracking-wider text-[10px] text-right">Net Salary</th>
                  <th className="px-3 py-2.5 font-bold uppercase tracking-wider text-[10px] text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {employees.map((emp, idx) => {
                  const processed = payrollHistory.find(p => p.user_id === emp.id);
                  const base = parseFloat(emp.base_salary || 0);
                  const inc = processed ? parseFloat(processed.incentives || 0) : parseFloat(rowIncentives[emp.id] || 0);
                  const empNet = emp.current_net_payable !== undefined ? emp.current_net_payable : (emp.net_salary_payable !== undefined ? emp.net_salary_payable : (emp.suggested_salary !== undefined ? emp.suggested_salary : base));
                  const net = processed ? parseFloat(processed.net_paid || 0) : (empNet + inc);
                  const workSummary = `${emp.payable_days || emp.full_days_worked || 0} days`;

                  return (
                    <tr key={emp.id || idx} className={idx % 2 === 1 ? 'bg-slate-50/50' : 'bg-white'}>
                      <td className="px-3 py-2 text-center text-slate-400 font-mono text-[11px]">{idx + 1}</td>
                      <td className="px-3 py-2 font-semibold text-slate-900">{emp.name}</td>
                      <td className="px-3 py-2 text-slate-600">{emp.department}</td>
                      <td className="px-3 py-2 text-slate-500 capitalize">{emp.role}</td>
                      <td className="px-3 py-2 text-slate-600">{workSummary}</td>
                      <td className="px-3 py-2 text-right font-mono text-slate-700">₹{base.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                      <td className="px-3 py-2 text-right font-mono text-purple-600">₹{inc.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                      <td className="px-3 py-2 text-right font-mono font-bold text-slate-900">₹{net.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                      <td className="px-3 py-2 text-center whitespace-nowrap">
                        <span className={`inline-block px-2 py-0.5 text-[9px] font-black uppercase tracking-wider rounded-full ${processed ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                          {processed ? 'Paid' : 'Pending'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-slate-900 text-white font-bold border-t-2 border-slate-900">
                <tr>
                  <td colSpan={5} className="px-3 py-2.5 uppercase text-[10px]">Grand Total ({employees.length} Employees)</td>
                  <td className="px-3 py-2.5 text-right font-mono text-xs">₹{modalTotalBase.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-xs text-purple-400">₹{modalTotalIncentives.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-xs text-emerald-400">₹{modalTotalNet.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Report Footer */}
          <div className="pt-4 border-t border-slate-200 flex justify-between items-center text-[10px] text-slate-400">
            <p>This is a system-generated payroll audit report for Design Studio Sixteen.</p>
            <p>Page 1 of 1</p>
          </div>

        </div>
      </div>
    </div>
  );
}
