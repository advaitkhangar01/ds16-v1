// client/src/components/responsibilities/AssignResponsibilityModal.jsx
// Modal for Admin to assign a new responsibility to an employee

import React, { useState, useEffect } from 'react';
import api from '../../api/client';
import toast from 'react-hot-toast';
import { PlusCircle, X, User } from 'lucide-react';

export default function AssignResponsibilityModal({ isOpen, onClose, onSuccess, defaultUserId }) {
  const [employees, setEmployees] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState(defaultUserId || '');
  const [description, setDescription] = useState('');
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (defaultUserId) {
      setSelectedUserId(defaultUserId);
    }
  }, [defaultUserId]);

  useEffect(() => {
    if (!isOpen) return;

    async function loadStaff() {
      setLoadingEmployees(true);
      try {
        const { data } = await api.get('/staff');
        setEmployees(data.staff || []);
      } catch (err) {
        toast.error('Failed to load employee list');
      } finally {
        setLoadingEmployees(false);
      }
    }
    loadStaff();
  }, [isOpen]);

  if (!isOpen) return null;

  async function handleSubmit(e) {
    e.preventDefault();

    const trimmed = description.trim();
    if (!trimmed) {
      return toast.error('Responsibility description cannot be empty');
    }

    if (!selectedUserId) {
      return toast.error('Please select an employee');
    }

    setSubmitting(true);
    try {
      await api.post('/responsibilities', {
        userId: parseInt(selectedUserId, 10),
        description: trimmed,
      });

      toast.success('Responsibility assigned successfully');
      setDescription('');
      onSuccess();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to assign responsibility');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200 overflow-y-auto">
      <div className="w-full max-w-lg bg-white rounded-2xl border border-gray-200 shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col my-8">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-100 bg-white rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center text-primary shrink-0">
              <PlusCircle size={20} />
            </div>
            <div>
              <h3 className="text-sm font-black text-gray-900 uppercase tracking-tight">
                Assign Responsibility
              </h3>
              <p className="text-[11px] text-gray-400 font-medium">
                Create a formal deliverable or role assignment
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            className="text-gray-400 hover:text-gray-800 transition-colors p-2 hover:bg-gray-50 rounded-full"
          >
            <X size={16} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Employee Selector */}
          <div>
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider block mb-1.5">
              Assigned Employee *
            </label>
            <div className="relative">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                required
                disabled={loadingEmployees || submitting}
                className="w-full bg-gray-50/50 border border-gray-200 rounded-xl pl-11 pr-4 py-2.5 text-xs font-bold text-gray-800 focus:outline-none focus:border-primary disabled:opacity-50"
              >
                <option value="">-- Select Employee --</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name} (@{emp.username}) — {emp.role}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Responsibility Description */}
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider">
                Responsibility Description *
              </label>
              <span className="text-[10px] text-gray-400 font-medium font-mono">
                {description.trim().length} chars
              </span>
            </div>
            <textarea
              required
              rows={4}
              placeholder="e.g. Prepare architectural drawings and submit them for internal review."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={submitting}
              className="w-full bg-gray-50/50 border border-gray-200 rounded-xl p-3.5 text-xs text-gray-800 font-medium focus:outline-none focus:border-primary leading-relaxed resize-y min-h-[100px] disabled:opacity-50"
            />
            <p className="text-[10px] text-gray-400 mt-1 font-medium">
              Enter a clear statement of what the employee is responsible for completing.
            </p>
          </div>

          {/* Initial State Notice */}
          <div className="bg-slate-50 border border-slate-200/70 rounded-xl p-3 text-[11px] text-slate-600 font-medium">
            <span className="font-bold text-slate-800">Initial State:</span> Assigned responsibilities start in <span className="font-bold text-slate-700">Pending</span> status. The employee must complete and acknowledge it before Admin verification.
          </div>

          {/* Actions */}
          <div className="pt-2 flex items-center justify-end gap-3 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !description.trim()}
              className="btn-primary py-2.5 px-6 text-xs font-black uppercase tracking-wider disabled:opacity-50 flex items-center gap-2"
            >
              {submitting ? 'Assigning...' : 'Assign Responsibility'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
