// client/src/components/projects/feasibility/AreaStatementForm.jsx
import React from 'react';
import { Plus, Trash2, HelpCircle, Building2, Calculator, Layers } from 'lucide-react';

export default function AreaStatementForm({
  statement,
  floors,
  onUpdateStatement,
  onAddFloor,
  onUpdateFloor,
  onDeleteFloor,
  unitDisplay,
  isPrivileged
}) {
  const isSqft = unitDisplay === 'sq_ft';
  const unitLabel = isSqft ? 'sq ft' : 'sq m';

  return (
    <div className="space-y-6">
      {/* 1. Base Plot Dimensions */}
      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
        <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
          <Building2 size={14} className="text-[#E05A1E]" />
          Plot & Survey Baseline Inputs
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-600">Plot Area ({unitLabel})</label>
            <input
              type="number"
              step="0.01"
              className="w-full text-xs bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-slate-800 focus:outline-none focus:border-[#E05A1E]"
              value={statement.plot_area_sqm || ''}
              onChange={(e) => onUpdateStatement({ plot_area_sqm: e.target.value })}
              disabled={!isPrivileged}
            />
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-600">D.P. Road / Reservation Deductions ({unitLabel})</label>
            <input
              type="number"
              step="0.01"
              className="w-full text-xs bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-slate-800 focus:outline-none focus:border-[#E05A1E]"
              value={statement.dp_deductions_sqm || 0}
              onChange={(e) => onUpdateStatement({ dp_deductions_sqm: e.target.value })}
              disabled={!isPrivileged}
            />
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-600">Existing Built-up Area Deduction ({unitLabel})</label>
            <input
              type="number"
              step="0.01"
              className="w-full text-xs bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-slate-800 focus:outline-none focus:border-[#E05A1E]"
              value={statement.existing_builtup_area_sqm || 0}
              onChange={(e) => onUpdateStatement({ existing_builtup_area_sqm: e.target.value })}
              disabled={!isPrivileged}
            />
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-600">Margin / Setback Requirement (m)</label>
            <input
              type="number"
              step="0.01"
              className="w-full text-xs bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-slate-800 focus:outline-none focus:border-[#E05A1E]"
              value={statement.margin_meters || 0}
              onChange={(e) => onUpdateStatement({ margin_meters: e.target.value })}
              disabled={!isPrivileged}
            />
          </div>
        </div>
      </div>

      {/* 2. Regulatory & FSI Factors */}
      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
        <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
          <Calculator size={14} className="text-[#E05A1E]" />
          Regulatory FSI & Dividing Assumptions
        </h4>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="space-y-1">
            <label className="text-[10px] font-semibold text-slate-600">Basic FSI Factor</label>
            <input
              type="number"
              step="0.01"
              className="w-full text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-800 focus:outline-none focus:border-[#E05A1E]"
              value={statement.basic_fsi_factor || 1.1}
              onChange={(e) => onUpdateStatement({ basic_fsi_factor: e.target.value })}
              disabled={!isPrivileged}
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-semibold text-slate-600">Paid FSI Factor</label>
            <input
              type="number"
              step="0.01"
              className="w-full text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-800 focus:outline-none focus:border-[#E05A1E]"
              value={statement.paid_fsi_factor || 0.5}
              onChange={(e) => onUpdateStatement({ paid_fsi_factor: e.target.value })}
              disabled={!isPrivileged}
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-semibold text-slate-600">Proposed TDR Factor</label>
            <input
              type="number"
              step="0.001"
              placeholder="e.g. 0.545"
              className="w-full text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-800 focus:outline-none focus:border-[#E05A1E]"
              value={statement.proposed_tdr_factor !== undefined && statement.proposed_tdr_factor !== null && statement.proposed_tdr_factor !== '' ? statement.proposed_tdr_factor : ''}
              onChange={(e) => onUpdateStatement({ proposed_tdr_factor: e.target.value })}
              disabled={!isPrivileged}
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-semibold text-slate-600">Dividing Factor</label>
            <input
              type="number"
              step="0.01"
              className="w-full text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-800 font-bold focus:outline-none focus:border-[#E05A1E]"
              value={statement.dividing_factor || 1.6}
              onChange={(e) => onUpdateStatement({ dividing_factor: e.target.value })}
              disabled={!isPrivileged}
            />
          </div>
        </div>
      </div>

      {/* 3. Dynamic Floor-wise Proposed P-Line Rows */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <Layers size={14} className="text-[#E05A1E]" />
              Proposed Floor-wise P-Line Area Rows ({floors.length} floors)
            </h4>
            <p className="text-[11px] text-muted">
              Builtup for Owners automatically computes (P-Line - Lobby) or accepts custom architectural entry
            </p>
          </div>
          {isPrivileged && (
            <button
              type="button"
              onClick={onAddFloor}
              className="btn-primary text-xs py-1 px-2.5"
            >
              <Plus size={13} />
              Add Floor
            </button>
          )}
        </div>

        <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
          {floors.map((floor, idx) => (
            <div key={floor.id || idx} className="bg-white p-3 rounded-xl border border-slate-200 shadow-soft-sm space-y-2 hover:border-orange-200 transition-colors">
              <div className="flex items-center justify-between gap-2">
                <input
                  type="text"
                  className="text-xs font-bold text-slate-800 bg-slate-50 border border-slate-200 rounded px-2 py-1 flex-1 focus:outline-none focus:border-[#E05A1E]"
                  value={floor.floor_name}
                  onChange={(e) => onUpdateFloor(floor.id, { floor_name: e.target.value })}
                  disabled={!isPrivileged}
                />
                {isPrivileged && floors.length > 1 && (
                  <button
                    type="button"
                    onClick={() => onDeleteFloor(floor.id)}
                    className="p-1 text-slate-400 hover:text-red-600 rounded transition-colors"
                    title="Delete floor"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
                <div className="space-y-0.5">
                  <label className="text-[10px] text-muted font-bold">Height (m)</label>
                  <input
                    type="number"
                    step="0.01"
                    className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1 text-slate-700"
                    value={floor.height_meters || ''}
                    onChange={(e) => onUpdateFloor(floor.id, { height_meters: e.target.value })}
                    disabled={!isPrivileged}
                  />
                </div>

                <div className="space-y-0.5">
                  <label className="text-[10px] text-muted font-bold">P-Line Area ({unitLabel})</label>
                  <input
                    type="number"
                    step="0.01"
                    className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1 font-semibold text-slate-800"
                    value={floor.pline_area_sqm || ''}
                    onChange={(e) => onUpdateFloor(floor.id, { pline_area_sqm: e.target.value })}
                    disabled={!isPrivileged}
                  />
                </div>

                <div className="space-y-0.5">
                  <label className="text-[10px] text-muted font-bold">Lobby Area ({unitLabel})</label>
                  <input
                    type="number"
                    step="0.01"
                    className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1 text-slate-700"
                    value={floor.lobby_area_sqm || ''}
                    onChange={(e) => onUpdateFloor(floor.id, { lobby_area_sqm: e.target.value })}
                    disabled={!isPrivileged}
                  />
                </div>

                <div className="space-y-0.5">
                  <label className="text-[10px] text-muted font-bold">Builtup Owners</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Auto (P-L)"
                    className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1 text-slate-700"
                    value={floor.builtup_for_owners_sqm ?? ''}
                    onChange={(e) => onUpdateFloor(floor.id, { builtup_for_owners_sqm: e.target.value === '' ? null : e.target.value })}
                    disabled={!isPrivileged}
                  />
                </div>

                <div className="space-y-0.5 col-span-2 sm:col-span-1">
                  <label className="text-[10px] text-muted font-bold">Builtup Sale</label>
                  <input
                    type="number"
                    step="0.01"
                    className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1 font-semibold text-[#E05A1E]"
                    value={floor.builtup_for_sale_sqm || ''}
                    onChange={(e) => onUpdateFloor(floor.id, { builtup_for_sale_sqm: e.target.value })}
                    disabled={!isPrivileged}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
