// client/src/components/projects/timeline/TimelineActivityHistory.jsx
import React, { useState, useEffect } from 'react';
import { History, Shield, Clock, User, CheckCircle2, AlertCircle } from 'lucide-react';
import api from '../../../api/client';

export default function TimelineActivityHistory({ projectId, isManagement }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isManagement) return;
    api.get(`/projects/${projectId}/timeline/history`)
      .then(res => setHistory(res.data.history || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [projectId, isManagement]);

  if (!isManagement) {
    return (
      <div className="card p-8 text-center text-muted text-xs">
        <Shield size={24} className="mx-auto mb-2 text-slate-400" />
        Activity audit history is protected and restricted to project management personnel.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="card p-8 text-center text-xs text-muted">
        Loading audit history...
      </div>
    );
  }

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between border-b border-[#F0F0F0] pb-3">
        <div className="flex items-center gap-2">
          <History size={16} className="text-[#E05A1E]" />
          <h3 className="text-sm font-bold text-[#1A1A1A]">Timeline Audit Trail & Version Provenance</h3>
        </div>
        <span className="text-xs text-muted">{history.length} recorded events</span>
      </div>

      <div className="divide-y divide-slate-100">
        {history.length === 0 ? (
          <div className="p-8 text-center text-xs text-muted">
            No audit events recorded for this timeline yet.
          </div>
        ) : (
          history.map((h, i) => (
            <div key={h.id || i} className="py-3 px-2 flex items-start justify-between gap-4 text-xs">
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded text-[11px]">
                    {h.action}
                  </span>
                  {h.task_name && (
                    <span className="font-semibold text-slate-700">
                      Task: {h.task_name}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-[11px] text-muted">
                  <span className="flex items-center gap-1">
                    <User size={11} /> {h.user_name || 'System'} ({h.user_role || 'staff'})
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock size={11} /> {new Date(h.created_at).toLocaleString('en-GB')}
                  </span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
