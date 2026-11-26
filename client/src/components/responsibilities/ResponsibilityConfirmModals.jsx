// client/src/components/responsibilities/ResponsibilityConfirmModals.jsx
// Confirmation dialogs for employee acknowledgement, admin reset, and admin reversal

import React from 'react';
import { AlertTriangle, CheckCircle2, RotateCcw, X, ShieldAlert } from 'lucide-react';

/**
 * 1. Employee Acknowledgement Confirmation Dialog (Mandatory interaction)
 */
export function AcknowledgeConfirmModal({ responsibility, isOpen, onClose, onConfirm, loading }) {
  if (!isOpen || !responsibility) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-white rounded-2xl border border-gray-200 shadow-2xl p-6 space-y-5 animate-in zoom-in-95 duration-200">
        <div className="flex items-start justify-between">
          <div className="w-10 h-10 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center text-primary shrink-0">
            <CheckCircle2 size={20} />
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="text-gray-400 hover:text-gray-700 transition-colors p-1 rounded-lg hover:bg-gray-100"
          >
            <X size={18} />
          </button>
        </div>

        <div>
          <h3 className="text-base font-black text-gray-900 tracking-tight">
            Confirm Responsibility Completion
          </h3>
          <p className="text-xs text-gray-500 font-medium leading-relaxed mt-2">
            Are you sure you have completed this responsibility?
          </p>
          <div className="mt-3 p-3 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-800 font-medium leading-relaxed whitespace-pre-wrap max-h-36 overflow-y-auto">
            {responsibility.description}
          </div>
          <p className="text-[11px] text-amber-700 font-semibold bg-amber-50 border border-amber-200 rounded-xl p-3 mt-3 flex items-start gap-2">
            <AlertTriangle size={15} className="shrink-0 mt-0.5 text-amber-600" />
            <span>
              Once confirmed, your acknowledgement cannot be undone by you. Only an Admin can reset it.
            </span>
          </p>
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="btn-primary py-2 px-5 text-xs font-black uppercase tracking-wider disabled:opacity-50 flex items-center gap-2"
          >
            {loading ? 'Submitting...' : 'Confirm Completion'}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * 2. Admin Reset Acknowledgement Dialog
 */
export function ResetAckConfirmModal({ responsibility, isOpen, onClose, onConfirm, loading }) {
  if (!isOpen || !responsibility) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-white rounded-2xl border border-gray-200 shadow-2xl p-6 space-y-5 animate-in zoom-in-95 duration-200">
        <div className="flex items-start justify-between">
          <div className="w-10 h-10 rounded-xl bg-red-50 border border-red-100 flex items-center justify-center text-red-600 shrink-0">
            <RotateCcw size={20} />
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="text-gray-400 hover:text-gray-700 transition-colors p-1 rounded-lg hover:bg-gray-100"
          >
            <X size={18} />
          </button>
        </div>

        <div>
          <h3 className="text-base font-black text-gray-900 tracking-tight">
            Reset Employee Acknowledgement
          </h3>
          <p className="text-xs text-gray-500 font-medium leading-relaxed mt-2">
            Are you sure you want to reset this employee&apos;s acknowledgement? This will return the responsibility to <strong className="text-gray-900">Pending</strong> status and clear any existing completion records.
          </p>
          <div className="mt-3 p-3 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-800 font-medium leading-relaxed whitespace-pre-wrap max-h-36 overflow-y-auto">
            {responsibility.description}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="px-5 py-2 rounded-xl text-xs font-black uppercase tracking-wider bg-red-600 hover:bg-red-700 text-white shadow-sm transition-all disabled:opacity-50 flex items-center gap-1.5"
          >
            {loading ? 'Resetting...' : 'Reset to Pending'}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * 3. Admin Reverse Verification Dialog
 */
export function ReverseVerificationConfirmModal({ responsibility, isOpen, onClose, onConfirm, loading }) {
  if (!isOpen || !responsibility) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-white rounded-2xl border border-gray-200 shadow-2xl p-6 space-y-5 animate-in zoom-in-95 duration-200">
        <div className="flex items-start justify-between">
          <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600 shrink-0">
            <ShieldAlert size={20} />
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="text-gray-400 hover:text-gray-700 transition-colors p-1 rounded-lg hover:bg-gray-100"
          >
            <X size={18} />
          </button>
        </div>

        <div>
          <h3 className="text-base font-black text-gray-900 tracking-tight">
            Reverse Admin Verification
          </h3>
          <p className="text-xs text-gray-500 font-medium leading-relaxed mt-2">
            Are you sure you want to reverse verification for this responsibility?
          </p>
          <p className="text-xs text-gray-500 font-medium leading-relaxed mt-1">
            This will return the responsibility to <strong className="text-amber-800">Awaiting Admin Verification</strong>. The employee&apos;s acknowledgement will remain preserved.
          </p>
          <div className="mt-3 p-3 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-800 font-medium leading-relaxed whitespace-pre-wrap max-h-36 overflow-y-auto">
            {responsibility.description}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="px-5 py-2 rounded-xl text-xs font-black uppercase tracking-wider bg-amber-600 hover:bg-amber-700 text-white shadow-sm transition-all disabled:opacity-50 flex items-center gap-1.5"
          >
            {loading ? 'Reversing...' : 'Reverse Verification'}
          </button>
        </div>
      </div>
    </div>
  );
}
