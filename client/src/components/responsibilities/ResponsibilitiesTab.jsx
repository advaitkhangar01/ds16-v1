// client/src/components/responsibilities/ResponsibilitiesTab.jsx
// Tabular interface for My Profile -> Responsibilities sub-tab

import React, { useState, useMemo } from 'react';
import api from '../../api/client';
import toast from 'react-hot-toast';
import { formatDateIST } from '../../utils/time';
import {
  CheckSquare,
  Plus,
  Clock,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  Trash2,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import {
  AcknowledgeConfirmModal,
  ResetAckConfirmModal,
  ReverseVerificationConfirmModal,
} from './ResponsibilityConfirmModals';
import AssignResponsibilityModal from './AssignResponsibilityModal';

export default function ResponsibilitiesTab({
  responsibilities = [],
  employee,
  currentUser,
  onRefresh,
}) {
  const isAdmin = currentUser?.role === 'admin';
  const isEmployeeSelf = currentUser?.id === employee?.id;

  // Modals state
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [acknowledgeTarget, setAcknowledgeTarget] = useState(null);
  const [resetAckTarget, setResetAckTarget] = useState(null);
  const [reverseVerificationTarget, setReverseVerificationTarget] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Sorting:
  // 1. Pending (employee_acknowledged = false, admin_verified = false)
  // 2. Awaiting Admin Verification (employee_acknowledged = true, admin_verified = false)
  // 3. Completed (employee_acknowledged = true, admin_verified = true)
  // Within groups: oldest first (created_at ASC), stable by id ASC
  const sortedResponsibilities = useMemo(() => {
    return [...responsibilities].sort((a, b) => {
      const getRank = (item) => {
        if (!item.employee_acknowledged && !item.admin_verified) return 1;
        if (item.employee_acknowledged && !item.admin_verified) return 2;
        return 3;
      };

      const rankA = getRank(a);
      const rankB = getRank(b);

      if (rankA !== rankB) return rankA - rankB;

      const dateA = new Date(a.created_at || 0).getTime();
      const dateB = new Date(b.created_at || 0).getTime();
      if (dateA !== dateB) return dateA - dateB;

      return a.id - b.id;
    });
  }, [responsibilities]);

  // Counts
  const counts = useMemo(() => {
    let pending = 0;
    let awaiting = 0;
    let completed = 0;

    responsibilities.forEach((r) => {
      if (r.employee_acknowledged && r.admin_verified) {
        completed++;
      } else if (r.employee_acknowledged && !r.admin_verified) {
        awaiting++;
      } else {
        pending++;
      }
    });

    return { total: responsibilities.length, pending, awaiting, completed };
  }, [responsibilities]);

  // Handlers
  async function handleConfirmAcknowledge() {
    if (!acknowledgeTarget) return;
    setActionLoading(true);
    try {
      await api.patch(`/responsibilities/${acknowledgeTarget.id}/acknowledge`);
      toast.success('Responsibility acknowledged and submitted for Admin verification');
      setAcknowledgeTarget(null);
      onRefresh();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to acknowledge responsibility');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleConfirmResetAck() {
    if (!resetAckTarget) return;
    setActionLoading(true);
    try {
      await api.patch(`/responsibilities/${resetAckTarget.id}/reset-acknowledgement`);
      toast.success('Employee acknowledgement reset to Pending');
      setResetAckTarget(null);
      onRefresh();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to reset acknowledgement');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleAdminVerify(resp) {
    if (!isAdmin) return;
    if (!resp.employee_acknowledged) {
      return toast.error('Cannot verify: Employee must acknowledge completion first.');
    }

    try {
      await api.patch(`/responsibilities/${resp.id}/verify`);
      toast.success('Responsibility verified and completed');
      onRefresh();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to verify responsibility');
    }
  }

  async function handleConfirmReverseVerification() {
    if (!reverseVerificationTarget) return;
    setActionLoading(true);
    try {
      await api.patch(`/responsibilities/${reverseVerificationTarget.id}/reset-verification`);
      toast.success('Admin verification reversed to Awaiting Verification');
      setReverseVerificationTarget(null);
      onRefresh();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to reverse verification');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDeleteResponsibility(id) {
    if (!isAdmin) return;
    if (!window.confirm('Are you sure you want to delete this responsibility? This action will be logged in the audit trail.')) {
      return;
    }

    try {
      await api.delete(`/responsibilities/${id}`);
      toast.success('Responsibility deleted');
      onRefresh();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete responsibility');
    }
  }

  return (
    <div className="card space-y-6">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-gray-100 pb-4 gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-black text-gray-900 uppercase tracking-wide flex items-center gap-2">
              <CheckSquare size={16} className="text-primary" />
              Assigned Responsibilities
            </h3>
            <span className="text-[10px] font-bold text-gray-400 bg-gray-100 px-2.5 py-0.5 rounded-full">
              {counts.total} Total
            </span>
          </div>
          <p className="text-[11px] text-gray-400 font-medium mt-1">
            Track individual work obligations, employee completion acknowledgements, and Admin verifications
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Status summary pills */}
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-100 text-slate-700 border border-slate-200 rounded-full text-[10px] font-black uppercase tracking-wider">
            Pending: {counts.pending}
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-full text-[10px] font-black uppercase tracking-wider">
            Awaiting Verification: {counts.awaiting}
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-[10px] font-black uppercase tracking-wider">
            Completed: {counts.completed}
          </span>

          {/* Admin Assign Button */}
          {isAdmin && (
            <button
              onClick={() => setShowAssignModal(true)}
              className="btn-primary py-2 px-4 text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-sm no-print"
            >
              <Plus size={14} />
              Assign Responsibility
            </button>
          )}
        </div>
      </div>

      {/* Responsibilities Table */}
      {sortedResponsibilities.length === 0 ? (
        <div className="py-16 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-gray-50 border border-gray-200 flex items-center justify-center text-gray-400 mx-auto">
            <CheckSquare size={22} />
          </div>
          <p className="text-xs font-semibold text-gray-500">
            {isAdmin
              ? 'No responsibilities assigned yet. Use Assign Responsibility to create one.'
              : 'No responsibilities have been assigned to you yet.'}
          </p>
          {isAdmin && (
            <button
              onClick={() => setShowAssignModal(true)}
              className="btn-secondary py-2 px-4 text-xs font-bold inline-flex items-center gap-1.5 mx-auto"
            >
              <Plus size={14} />
              + Assign Responsibility
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-soft-sm">
          <table className="w-full text-left text-xs table-fixed">
            <thead>
              <tr className="bg-gray-50/80 border-b border-gray-200 text-[10px] font-black uppercase tracking-widest text-gray-400 select-none">
                <th className="w-16 px-4 py-3.5 text-center">S.No.</th>
                <th className="px-6 py-3.5">Responsibility Description</th>
                <th className="w-32 px-4 py-3.5 text-center">Employee</th>
                <th className="w-32 px-4 py-3.5 text-center">Admin</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 font-medium text-gray-700">
              {sortedResponsibilities.map((resp, idx) => {
                const isAcknowledged = resp.employee_acknowledged === true;
                const isVerified = resp.admin_verified === true;

                // Status classification
                let statusLabel = 'Pending';
                let statusBadgeClass = 'bg-slate-100 text-slate-700 border-slate-200';
                let rowBgClass = 'hover:bg-gray-50/60';

                if (isAcknowledged && isVerified) {
                  statusLabel = 'Completed';
                  statusBadgeClass = 'bg-emerald-50 text-emerald-700 border-emerald-200';
                  rowBgClass = 'bg-emerald-50/20 hover:bg-emerald-50/40';
                } else if (isAcknowledged && !isVerified) {
                  statusLabel = 'Awaiting Admin Verification';
                  statusBadgeClass = 'bg-amber-50 text-amber-800 border-amber-200';
                  rowBgClass = 'bg-amber-50/20 hover:bg-amber-50/40';
                }

                // Checkbox controls logic
                // Column 3: Employee
                let canClickEmployeeCheckbox = false;
                let employeeCheckboxTitle = '';

                if (!isAcknowledged) {
                  if (isEmployeeSelf) {
                    canClickEmployeeCheckbox = true;
                    employeeCheckboxTitle = 'Click to acknowledge completion';
                  } else {
                    employeeCheckboxTitle = 'Awaiting employee acknowledgement';
                  }
                } else {
                  if (isAdmin) {
                    canClickEmployeeCheckbox = true;
                    employeeCheckboxTitle = 'Admin: Click to reset acknowledgement to Pending';
                  } else {
                    employeeCheckboxTitle = 'Acknowledged (Cannot be unchecked by employee)';
                  }
                }

                // Column 4: Admin
                let canClickAdminCheckbox = false;
                let adminCheckboxTitle = '';

                if (isAdmin) {
                  if (!isVerified) {
                    if (isAcknowledged) {
                      canClickAdminCheckbox = true;
                      adminCheckboxTitle = 'Click to verify and complete responsibility';
                    } else {
                      adminCheckboxTitle = 'Requires employee acknowledgement first';
                    }
                  } else {
                    canClickAdminCheckbox = true;
                    adminCheckboxTitle = 'Click to reverse Admin verification';
                  }
                } else {
                  adminCheckboxTitle = isVerified ? 'Verified by Admin' : 'Awaiting Admin verification';
                }

                return (
                  <tr key={resp.id} className={`transition-colors ${rowBgClass}`}>
                    {/* S.No. (Formatted 01, 02...) */}
                    <td className="px-4 py-4 text-center font-mono text-xs font-black text-gray-400 select-none align-top pt-5">
                      {String(idx + 1).padStart(2, '0')}
                    </td>

                    {/* Responsibility Description (Multi-line, Wrapping, Full statement) */}
                    <td className="px-6 py-4 align-top">
                      <div className="space-y-2">
                        <p className="text-xs font-bold text-gray-900 leading-relaxed break-words whitespace-pre-wrap">
                          {resp.description}
                        </p>

                        <div className="flex items-center gap-2.5 flex-wrap pt-1">
                          {/* Visual Status Badge */}
                          <span className={`inline-flex px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border ${statusBadgeClass}`}>
                            {statusLabel}
                          </span>

                          {/* Timestamps */}
                          {resp.employee_acknowledged_at && (
                            <span className="text-[10px] text-gray-400 font-semibold flex items-center gap-1">
                              <UserCheck size={11} className="text-primary" />
                              Ack: {formatDateIST(resp.employee_acknowledged_at)}
                            </span>
                          )}

                          {resp.admin_verified_at && (
                            <span className="text-[10px] text-gray-400 font-semibold flex items-center gap-1">
                              <ShieldCheck size={11} className="text-emerald-600" />
                              Verified: {formatDateIST(resp.admin_verified_at)}
                            </span>
                          )}

                          {/* Admin Delete Action */}
                          {isAdmin && (
                            <button
                              onClick={() => handleDeleteResponsibility(resp.id)}
                              className="text-gray-300 hover:text-red-500 transition-colors p-1 rounded hover:bg-red-50 ml-auto no-print"
                              title="Delete responsibility"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Column 3: Employee Checkbox */}
                    <td className="px-4 py-4 text-center align-middle">
                      <div className="flex flex-col items-center justify-center gap-1">
                        <label
                          className={`inline-flex items-center justify-center p-1.5 rounded-lg transition-all ${
                            canClickEmployeeCheckbox
                              ? 'cursor-pointer hover:bg-orange-50 active:scale-95'
                              : 'cursor-not-allowed opacity-75'
                          }`}
                          title={employeeCheckboxTitle}
                        >
                          <input
                            type="checkbox"
                            checked={isAcknowledged}
                            disabled={!canClickEmployeeCheckbox}
                            onChange={() => {
                              if (!canClickEmployeeCheckbox) return;
                              if (!isAcknowledged) {
                                setAcknowledgeTarget(resp);
                              } else if (isAdmin) {
                                setResetAckTarget(resp);
                              }
                            }}
                            className="w-5 h-5 rounded-md border-gray-300 text-primary focus:ring-primary focus:ring-offset-0 transition-colors cursor-pointer disabled:cursor-not-allowed"
                          />
                        </label>
                        <span className="text-[9px] font-black uppercase tracking-widest text-gray-400">
                          {isAcknowledged ? 'Acked' : 'Pending'}
                        </span>
                      </div>
                    </td>

                    {/* Column 4: Admin Checkbox */}
                    <td className="px-4 py-4 text-center align-middle">
                      <div className="flex flex-col items-center justify-center gap-1">
                        <label
                          className={`inline-flex items-center justify-center p-1.5 rounded-lg transition-all ${
                            canClickAdminCheckbox
                              ? 'cursor-pointer hover:bg-emerald-50 active:scale-95'
                              : 'cursor-not-allowed opacity-75'
                          }`}
                          title={adminCheckboxTitle}
                        >
                          <input
                            type="checkbox"
                            checked={isVerified}
                            disabled={!canClickAdminCheckbox}
                            onChange={() => {
                              if (!canClickAdminCheckbox) return;
                              if (!isVerified) {
                                handleAdminVerify(resp);
                              } else {
                                setReverseVerificationTarget(resp);
                              }
                            }}
                            className="w-5 h-5 rounded-md border-gray-300 text-emerald-600 focus:ring-emerald-500 focus:ring-offset-0 transition-colors cursor-pointer disabled:cursor-not-allowed"
                          />
                        </label>
                        <span className="text-[9px] font-black uppercase tracking-widest text-gray-400">
                          {isVerified ? 'Verified' : 'Pending'}
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Confirmation Modals */}
      <AcknowledgeConfirmModal
        responsibility={acknowledgeTarget}
        isOpen={Boolean(acknowledgeTarget)}
        onClose={() => setAcknowledgeTarget(null)}
        onConfirm={handleConfirmAcknowledge}
        loading={actionLoading}
      />

      <ResetAckConfirmModal
        responsibility={resetAckTarget}
        isOpen={Boolean(resetAckTarget)}
        onClose={() => setResetAckTarget(null)}
        onConfirm={handleConfirmResetAck}
        loading={actionLoading}
      />

      <ReverseVerificationConfirmModal
        responsibility={reverseVerificationTarget}
        isOpen={Boolean(reverseVerificationTarget)}
        onClose={() => setReverseVerificationTarget(null)}
        onConfirm={handleConfirmReverseVerification}
        loading={actionLoading}
      />

      {/* Admin Assign Modal */}
      {isAdmin && (
        <AssignResponsibilityModal
          isOpen={showAssignModal}
          onClose={() => setShowAssignModal(false)}
          onSuccess={onRefresh}
          defaultUserId={employee?.id}
        />
      )}
    </div>
  );
}
