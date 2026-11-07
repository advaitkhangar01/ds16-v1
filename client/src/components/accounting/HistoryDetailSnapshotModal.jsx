import React from 'react';
import { X } from 'lucide-react';

export default function HistoryDetailSnapshotModal({
  isOpen,
  onClose,
  historyDetail
}) {
  if (!isOpen || !historyDetail) return null;

  const log = historyDetail.log;
  const snapshot = log?.snapshot || {};

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-4xl w-full border border-gray-100 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 my-8">
        <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-gray-50 to-white">
          <div>
            <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">
              Business Archive Snapshot: {new Date(log.year, log.month - 1).toLocaleString('default', { month: 'long', year: 'numeric' })}
            </h3>
            <p className="text-[10px] text-muted mt-0.5 leading-relaxed">
              Closed on {new Date(log.closed_at).toLocaleDateString()} by {log.closed_by_name || 'System Admin'}
            </p>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          {/* Financial Snapshot Summary Card */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-gray-50 border border-gray-100 rounded-xl p-4">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Total Project Billed</p>
              <h4 className="text-base font-black text-gray-900 mt-1">₹{parseFloat(snapshot?.revenue?.billed || 0).toLocaleString()}</h4>
              <span className="text-[9px] text-muted italic">Billed to clients this month</span>
            </div>
            <div className="bg-emerald-50/40 border border-emerald-100 rounded-xl p-4">
              <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Revenue Received</p>
              <h4 className="text-base font-black text-emerald-600 mt-1">₹{parseFloat(snapshot?.revenue?.received || 0).toLocaleString()}</h4>
              <span className="text-[9px] text-muted italic">Cash collected in bank</span>
            </div>
            <div className="bg-red-50/40 border border-red-100 rounded-xl p-4">
              <p className="text-[10px] font-bold text-red-500 uppercase tracking-wider">Expenses (Total)</p>
              <h4 className="text-base font-black text-red-500 mt-1">₹{parseFloat(snapshot?.expenses?.total || 0).toLocaleString()}</h4>
              <span className="text-[9px] text-muted italic">Overheads + Salaries (Excl. Vendors)</span>
            </div>
            <div className="bg-blue-50/40 border border-blue-100 rounded-xl p-4">
              <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">Net Realized Profit</p>
              <h4 className="text-base font-black text-blue-600 mt-1">₹{parseFloat(snapshot?.profit_loss?.realized || 0).toLocaleString()}</h4>
              <span className="text-[9px] text-muted italic">Realized Cash Margin</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Overhead Expenses Breakdown by Category */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="bg-gray-50 px-4 py-3 border-b border-gray-100 font-bold text-xs text-gray-700">
                Expense Category Breakdown
              </div>
              <div className="p-4">
                {snapshot?.expenses?.by_category ? (
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="py-2 text-gray-400 font-bold uppercase text-[9px]">Category</th>
                        <th className="py-2 text-right text-gray-400 font-bold uppercase text-[9px]">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 font-medium">
                      {Object.entries(snapshot.expenses.by_category).map(([cat, val]) => (
                        <tr key={cat}>
                          <td className="py-2 text-gray-600">{cat}</td>
                          <td className="py-2 text-right text-slate-800 font-mono">₹{parseFloat(val).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="text-center py-4 text-xs text-gray-400 italic">No expense breakdown saved.</p>
                )}
              </div>
            </div>

            {/* Leaves & HR summary */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden space-y-6">
              <div>
                <div className="bg-gray-50 px-4 py-3 border-b border-gray-100 font-bold text-xs text-gray-700">
                  HR Leaves & Payroll summary
                </div>
                <div className="p-4">
                  <table className="w-full text-left text-xs border-collapse">
                    <tbody className="divide-y divide-gray-50 font-medium">
                      <tr>
                        <td className="py-2.5 text-gray-500">Total Employees</td>
                        <td className="py-2.5 text-right text-gray-800 font-bold">{snapshot?.hr?.total_employees}</td>
                      </tr>
                      <tr>
                        <td className="py-2.5 text-gray-500">Salaries Released</td>
                        <td className="py-2.5 text-right text-gray-800 font-bold">{snapshot?.hr?.payroll_processed} employees</td>
                      </tr>
                      <tr>
                        <td className="py-2.5 text-gray-500">Salaries Deferred</td>
                        <td className="py-2.5 text-right text-amber-600 font-bold">{snapshot?.hr?.payroll_pending} employees</td>
                      </tr>
                      <tr>
                        <td className="py-2.5 text-gray-500">Total Approved Leave Days</td>
                        <td className="py-2.5 text-right text-gray-800 font-bold">{snapshot?.hr?.total_leave_days_taken} days</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Project Metrics */}
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="bg-gray-50 px-4 py-3 border-b border-gray-100 font-bold text-xs text-gray-700">
                  Project Statistics
                </div>
                <div className="p-4">
                  <table className="w-full text-left text-xs border-collapse">
                    <tbody className="divide-y divide-gray-50 font-medium">
                      <tr>
                        <td className="py-2.5 text-gray-500">Active Design Projects</td>
                        <td className="py-2.5 text-right text-gray-800 font-bold">{snapshot?.projects?.total_active}</td>
                      </tr>
                      <tr>
                        <td className="py-2.5 text-gray-500">Milestones Completed This Month</td>
                        <td className="py-2.5 text-right text-emerald-600 font-bold">{snapshot?.projects?.completed_this_month}</td>
                      </tr>
                      <tr>
                        <td className="py-2.5 text-gray-500">New Onboardings This Month</td>
                        <td className="py-2.5 text-right text-[#E05A1E] font-bold">{snapshot?.projects?.new_this_month}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>

          {/* Employee Leaves Rolling Balance Ledger Snapshot */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="bg-gray-50 px-4 py-3 border-b border-gray-100 font-bold text-xs text-gray-700">
              Rolling Leave Balance Ledgers Snapshot
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/50">
                    <th className="py-3 px-4 font-bold text-gray-400 uppercase text-[9px]">Employee</th>
                    <th className="py-3 px-4 font-bold text-gray-400 uppercase text-[9px]">Department</th>
                    <th className="py-3 px-4 font-bold text-gray-400 uppercase text-[9px] text-right">Opening Balance</th>
                    <th className="py-3 px-4 font-bold text-gray-400 uppercase text-[9px] text-right">Earned</th>
                    <th className="py-3 px-4 font-bold text-gray-400 uppercase text-[9px] text-right">Leaves Used</th>
                    <th className="py-3 px-4 font-bold text-gray-400 uppercase text-[9px] text-right">Closing Balance</th>
                    <th className="py-3 px-4 font-bold text-gray-400 uppercase text-[9px] text-right">Unpaid Leaves</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-medium text-slate-700">
                  {historyDetail.leaves?.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="py-6 text-center text-gray-400 italic">No leave registers archived for this month.</td>
                    </tr>
                  ) : historyDetail.leaves?.map(leave => (
                    <tr key={leave.id} className="hover:bg-gray-50/30">
                      <td className="py-3 px-4 font-bold text-gray-900">{leave.employee_name}</td>
                      <td className="py-3 px-4 capitalize text-gray-500">{leave.department || 'N/A'}</td>
                      <td className="py-3 px-4 text-right font-mono text-gray-500">{parseFloat(leave.opening_balance).toFixed(1)}</td>
                      <td className="py-3 px-4 text-right font-mono text-emerald-600">+{parseFloat(leave.earned).toFixed(1)}</td>
                      <td className="py-3 px-4 text-right font-mono text-red-500">-{parseFloat(leave.leaves_taken).toFixed(1)}</td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-gray-900">{parseFloat(leave.closing_balance).toFixed(1)}</td>
                      <td className={`py-3 px-4 text-right font-mono font-bold ${parseFloat(leave.unpaid_leaves) > 0 ? 'text-amber-600' : 'text-gray-400'}`}>
                        {parseFloat(leave.unpaid_leaves) > 0 ? `${parseFloat(leave.unpaid_leaves).toFixed(1)} unpaid` : '0.0'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Unlock Logs Audit Trail */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="bg-gray-50 px-4 py-3 border-b border-gray-100 font-bold text-xs text-gray-700">
              Backdated Entries Period Unlock Audit Trail Logs
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/50">
                    <th className="py-3 px-4 font-bold text-gray-400 uppercase text-[9px]">Unlocked At</th>
                    <th className="py-3 px-4 font-bold text-gray-400 uppercase text-[9px]">Unlocked By</th>
                    <th className="py-3 px-4 font-bold text-gray-400 uppercase text-[9px]">Unlock Reason Justification</th>
                    <th className="py-3 px-4 font-bold text-gray-400 uppercase text-[9px]">Re-locked At</th>
                    <th className="py-3 px-4 font-bold text-gray-400 uppercase text-[9px]">Re-locked By</th>
                    <th className="py-3 px-4 font-bold text-gray-400 uppercase text-[9px] text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-medium text-slate-700">
                  {historyDetail.unlocks?.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="py-6 text-center text-gray-400 italic">No backdated unlock history logs found for this month.</td>
                    </tr>
                  ) : historyDetail.unlocks?.map(ulock => (
                    <tr key={ulock.id} className="hover:bg-gray-50/30">
                      <td className="py-3 px-4 font-mono text-gray-500">
                        {new Date(ulock.unlocked_at).toLocaleDateString()} {new Date(ulock.unlocked_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="py-3 px-4 font-semibold text-gray-800">{ulock.unlocked_by_name || 'Admin'}</td>
                      <td className="py-3 px-4 text-gray-600 max-w-[200px] truncate" title={ulock.reason}>{ulock.reason}</td>
                      <td className="py-3 px-4 font-mono text-gray-500">
                        {ulock.relocked_at ? `${new Date(ulock.relocked_at).toLocaleDateString()} ${new Date(ulock.relocked_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}` : '-'}
                      </td>
                      <td className="py-3 px-4 text-gray-800">{ulock.relocked_by_name || (ulock.relocked_at ? 'Admin' : '-')}</td>
                      <td className="py-3 px-4 text-center">
                        <span className={`inline-block px-2 py-0.5 border rounded-full text-[9px] font-black uppercase tracking-wider ${ulock.is_active ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                          {ulock.is_active ? 'Active' : 'Closed'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="p-4 bg-gray-50 border-t border-gray-100 flex justify-end">
          <button 
            onClick={onClose}
            className="px-6 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-black uppercase tracking-widest transition-all active:scale-[0.98]"
          >
            Close Snapshot
          </button>
        </div>
      </div>
    </div>
  );
}
