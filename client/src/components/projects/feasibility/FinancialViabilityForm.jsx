// client/src/components/projects/feasibility/FinancialViabilityForm.jsx
import React from 'react';
import { Plus, Trash2, IndianRupee, Layers, FileText, Home, ShieldAlert, CheckSquare, Square } from 'lucide-react';

const formatINR = (val) => {
  if (val === undefined || val === null || isNaN(val)) return '₹0.00';
  return '₹' + Number(val).toLocaleString('en-IN', { maximumFractionDigits: 2 });
};

export default function FinancialViabilityForm({
  financial = {},
  statutoryCharges = [],
  salableUnits = [],
  onUpdateFinancial,
  onUpdateStatutoryCharge,
  onArchiveStatutoryCharge,
  onAddSalableUnit,
  onUpdateSalableUnit,
  onDeleteSalableUnit,
  isPrivileged
}) {
  const rrRate = parseFloat(financial.rr_rate_per_sqm) || 0;

  return (
    <div className="space-y-6">
      {/* 1. Rates & Benchmark Costs */}
      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
        <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
          <IndianRupee size={14} className="text-[#E05A1E]" />
          Statutory Benchmark Rates & Construction Cost Assumptions
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-600">Ready Reckoner (RR) Rate (₹/sq m)</label>
            <input
              type="number"
              step="1"
              placeholder="e.g. 25000"
              className="w-full text-xs bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-slate-800 font-bold focus:outline-none focus:border-[#E05A1E]"
              value={financial.rr_rate_per_sqm ?? ''}
              onChange={(e) => onUpdateFinancial({ rr_rate_per_sqm: e.target.value })}
              disabled={!isPrivileged}
            />
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-600">Estimated Cost A Rate (₹/sq m)</label>
            <input
              type="number"
              step="1"
              placeholder="e.g. 15000"
              className="w-full text-xs bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-slate-800 focus:outline-none focus:border-[#E05A1E]"
              value={financial.estimated_cost_a_rate ?? ''}
              onChange={(e) => onUpdateFinancial({ estimated_cost_a_rate: e.target.value })}
              disabled={!isPrivileged}
            />
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-600">Estimated Cost B Rate (₹/sq m)</label>
            <input
              type="number"
              step="1"
              placeholder="e.g. 26000"
              className="w-full text-xs bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-slate-800 focus:outline-none focus:border-[#E05A1E]"
              value={financial.estimated_cost_b_rate ?? ''}
              onChange={(e) => onUpdateFinancial({ estimated_cost_b_rate: e.target.value })}
              disabled={!isPrivileged}
            />
          </div>
        </div>
      </div>

      {/* 2. Statutory & Regulatory Charges (Section A) - REQ-C & REQ-E */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <FileText size={14} className="text-[#E05A1E]" />
              Statutory & Regulatory Charges ({statutoryCharges.filter(c => c.is_enabled !== false).length} active)
            </h4>
            <p className="text-[11px] text-muted">
              Uncheck to exclude from total demand while preserving row; RR % is independently configurable per charge
            </p>
          </div>
        </div>

        <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
          {statutoryCharges.map((item, idx) => {
            const isEnabled = item.is_enabled !== false;
            const hasRrPct = item.rr_percentage !== null && item.rr_percentage !== undefined && item.rr_percentage !== '';
            const calculatedAmt = item.calculated_amount ?? item.amount ?? 0;

            return (
              <div
                key={item.id || idx}
                className={`p-3 rounded-xl border transition-all ${
                  isEnabled
                    ? 'bg-white border-slate-200 hover:border-orange-200 shadow-soft-sm'
                    : 'bg-slate-50 border-slate-200 opacity-60'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 flex-1 min-w-0">
                    <button
                      type="button"
                      onClick={() => isPrivileged && onUpdateStatutoryCharge && onUpdateStatutoryCharge(item.id, { is_enabled: !isEnabled })}
                      disabled={!isPrivileged}
                      className="text-slate-600 hover:text-[#E05A1E] transition-colors flex-shrink-0"
                      title={isEnabled ? 'Uncheck to exclude from calculation' : 'Check to enable in calculation'}
                    >
                      {isEnabled ? (
                        <CheckSquare size={16} className="text-[#E05A1E]" />
                      ) : (
                        <Square size={16} className="text-slate-400" />
                      )}
                    </button>

                    <div className="min-w-0 flex-1">
                      <p className={`text-xs font-semibold truncate ${isEnabled ? 'text-slate-800' : 'text-slate-400 line-through'}`}>
                        {item.charge_name}
                      </p>
                      <p className="text-[10px] text-muted truncate">
                        Code: {item.charge_code} {item.calculation_basis ? `• Basis: ${item.calculation_basis}` : ''}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 flex-shrink-0">
                    {/* Per-Charge RR Percentage Input if applicable */}
                    {['ANCILLARY_CHARGES', 'DEVELOPMENT_CHARGES', 'PREMIUM_FSI', 'TDR_LOADING_CHARGES', 'HERITAGE_FUND'].includes(item.charge_code) && (
                      <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded px-2 py-1">
                        <label className="text-[10px] font-bold text-slate-500">RR %:</label>
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          max="100"
                          className="w-12 text-xs bg-transparent font-bold text-slate-800 text-center focus:outline-none"
                          value={item.rr_percentage ?? ''}
                          placeholder="%"
                          onChange={(e) => onUpdateStatutoryCharge && onUpdateStatutoryCharge(item.id, { rr_percentage: e.target.value })}
                          disabled={!isPrivileged || !isEnabled}
                        />
                        <span className="text-[10px] text-muted">%</span>
                      </div>
                    )}

                    {/* Calculated Amount */}
                    <div className="text-right min-w-[90px]">
                      <span className={`font-mono text-xs font-bold ${isEnabled ? 'text-slate-800' : 'text-slate-400'}`}>
                        {formatINR(calculatedAmt)}
                      </span>
                      {!isEnabled && (
                        <span className="text-[9px] text-amber-600 block font-semibold uppercase">Excluded</span>
                      )}
                    </div>

                    {/* Soft Delete / Archive Action */}
                    {isPrivileged && (
                      <button
                        type="button"
                        onClick={() => onArchiveStatutoryCharge && onArchiveStatutoryCharge(item.id)}
                        className="p-1 text-slate-300 hover:text-red-600 transition-colors rounded"
                        title="Archive / Remove charge"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. Direct Project Development Costs */}
      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
        <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
          <Home size={14} className="text-[#E05A1E]" />
          Direct Development & Civil Construction Costs
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-600">Construction Rate (₹/sq m)</label>
            <input
              type="number"
              step="100"
              placeholder="e.g. 20000"
              className="w-full text-xs bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-slate-800 font-bold focus:outline-none focus:border-[#E05A1E]"
              value={financial.cost_of_construction_rate ?? ''}
              onChange={(e) => onUpdateFinancial({ cost_of_construction_rate: e.target.value })}
              disabled={!isPrivileged}
            />
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-600">Plot Purchase Rate (₹/sq m)</label>
            <input
              type="number"
              step="100"
              placeholder="e.g. 30000"
              className="w-full text-xs bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-slate-800 focus:outline-none focus:border-[#E05A1E]"
              value={financial.cost_of_plot_rate_per_sqm ?? ''}
              onChange={(e) => onUpdateFinancial({ cost_of_plot_rate_per_sqm: e.target.value })}
              disabled={!isPrivileged}
            />
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-600">Cost of Plot Lump Sum (₹)</label>
            <input
              type="number"
              placeholder="0 (Auto from Plot Area * Rate)"
              className="w-full text-xs bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-slate-800 focus:outline-none focus:border-[#E05A1E]"
              value={financial.cost_of_plot ?? ''}
              onChange={(e) => onUpdateFinancial({ cost_of_plot: e.target.value })}
              disabled={!isPrivileged}
            />
          </div>
        </div>

        {/* Basement, Rent & Stacked Parking */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-200">
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-600">Basement Area (sq m)</label>
            <input
              type="number"
              step="0.01"
              placeholder="0.00"
              className="w-full text-xs bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-slate-800 focus:outline-none focus:border-[#E05A1E]"
              value={financial.basement_area_sqm ?? ''}
              onChange={(e) => onUpdateFinancial({ basement_area_sqm: e.target.value })}
              disabled={!isPrivileged}
            />
            <p className="text-[10px] text-muted">Rate: ₹{financial.basement_rate_per_sqm || 0}/sq m</p>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-600">Rent during Construction</label>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                placeholder="Tenements"
                className="w-16 text-xs bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-center"
                value={financial.rent_tenements ?? ''}
                onChange={(e) => onUpdateFinancial({ rent_tenements: e.target.value })}
                disabled={!isPrivileged}
              />
              <span className="text-[10px] text-muted">×</span>
              <input
                type="number"
                placeholder="₹/mo"
                className="w-20 text-xs bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-center"
                value={financial.rent_per_tenement_per_month ?? ''}
                onChange={(e) => onUpdateFinancial({ rent_per_tenement_per_month: e.target.value })}
                disabled={!isPrivileged}
              />
              <span className="text-[10px] text-muted">×</span>
              <input
                type="number"
                placeholder="Months"
                className="w-16 text-xs bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-center"
                value={financial.rent_months ?? ''}
                onChange={(e) => onUpdateFinancial({ rent_months: e.target.value })}
                disabled={!isPrivileged}
              />
              <span className="text-[10px] text-muted">mo</span>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-600">Stacked Parking</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                placeholder="Slots"
                className="w-20 text-xs bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-center font-bold"
                value={financial.stacked_parking_slots ?? ''}
                onChange={(e) => onUpdateFinancial({ stacked_parking_slots: e.target.value })}
                disabled={!isPrivileged}
              />
              <input
                type="number"
                placeholder="₹ / slot"
                className="w-24 text-xs bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-center"
                value={financial.stacked_parking_cost_per_slot ?? ''}
                onChange={(e) => onUpdateFinancial({ stacked_parking_cost_per_slot: e.target.value })}
                disabled={!isPrivileged}
              />
            </div>
          </div>
        </div>
      </div>

      {/* 4. BPMS & Municipal Clearance Expenses */}
      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
        <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
          <FileText size={14} className="text-[#E05A1E]" />
          BPMS, Municipal NOC & Statutory Clearances
        </h4>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <div className="space-y-0.5">
            <label className="text-[10px] font-semibold text-slate-600">Fire NOC (₹)</label>
            <input
              type="number"
              placeholder="0"
              className="w-full text-xs bg-white border border-slate-200 rounded-md px-2 py-1"
              value={financial.fire_noc ?? ''}
              onChange={(e) => onUpdateFinancial({ fire_noc: e.target.value })}
              disabled={!isPrivileged}
            />
          </div>
          <div className="space-y-0.5">
            <label className="text-[10px] font-semibold text-slate-600">BPMS Staff (₹)</label>
            <input
              type="number"
              placeholder="0"
              className="w-full text-xs bg-white border border-slate-200 rounded-md px-2 py-1"
              value={financial.bpms_staff_charges ?? ''}
              onChange={(e) => onUpdateFinancial({ bpms_staff_charges: e.target.value })}
              disabled={!isPrivileged}
            />
          </div>
          <div className="space-y-0.5">
            <label className="text-[10px] font-semibold text-slate-600">Airport NOC (₹)</label>
            <input
              type="number"
              placeholder="0"
              className="w-full text-xs bg-white border border-slate-200 rounded-md px-2 py-1"
              value={financial.airport_noc ?? ''}
              onChange={(e) => onUpdateFinancial({ airport_noc: e.target.value })}
              disabled={!isPrivileged}
            />
          </div>
          <div className="space-y-0.5">
            <label className="text-[10px] font-semibold text-slate-600">Entertainment (₹)</label>
            <input
              type="number"
              placeholder="0"
              className="w-full text-xs bg-white border border-slate-200 rounded-md px-2 py-1"
              value={financial.entertainment_charges ?? ''}
              onChange={(e) => onUpdateFinancial({ entertainment_charges: e.target.value })}
              disabled={!isPrivileged}
            />
          </div>
        </div>
      </div>

      {/* 5. Salable Units & Project Receipts */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <Layers size={14} className="text-[#E05A1E]" />
              Salable Units & Projected Receipts ({salableUnits.length} configurations)
            </h4>
            <p className="text-[11px] text-muted">
              Super Built-up Area auto-computes: Carpet Area (sq ft) + 300 sq ft loading rule
            </p>
          </div>
          {isPrivileged && (
            <button
              type="button"
              onClick={onAddSalableUnit}
              className="btn-primary text-xs py-1 px-2.5"
            >
              <Plus size={13} />
              Add Unit Type
            </button>
          )}
        </div>

        <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
          {salableUnits.map((u, idx) => (
            <div key={u.id || idx} className="bg-white p-3 rounded-xl border border-slate-200 shadow-soft-sm space-y-2 hover:border-orange-200 transition-colors">
              <div className="flex items-center justify-between gap-2">
                <input
                  type="text"
                  className="text-xs font-bold text-slate-800 bg-slate-50 border border-slate-200 rounded px-2 py-1 flex-1 focus:outline-none focus:border-[#E05A1E]"
                  value={u.unit_name}
                  onChange={(e) => onUpdateSalableUnit(u.id, { unit_name: e.target.value })}
                  disabled={!isPrivileged}
                />
                {isPrivileged && salableUnits.length > 1 && (
                  <button
                    type="button"
                    onClick={() => onDeleteSalableUnit(u.id)}
                    className="p-1 text-slate-400 hover:text-red-600 rounded transition-colors"
                    title="Delete unit type"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div className="space-y-0.5">
                  <label className="text-[10px] text-muted font-bold">Carpet Area (sq m)</label>
                  <input
                    type="number"
                    step="0.01"
                    className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1 font-semibold text-slate-800"
                    value={u.carpet_area_sqm || ''}
                    onChange={(e) => onUpdateSalableUnit(u.id, { carpet_area_sqm: e.target.value })}
                    disabled={!isPrivileged}
                  />
                </div>

                <div className="space-y-0.5">
                  <label className="text-[10px] text-muted font-bold">Units Count</label>
                  <input
                    type="number"
                    min="1"
                    className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1 font-bold text-slate-800 text-center"
                    value={u.unit_count || 1}
                    onChange={(e) => onUpdateSalableUnit(u.id, { unit_count: e.target.value })}
                    disabled={!isPrivileged}
                  />
                </div>

                <div className="space-y-0.5">
                  <label className="text-[10px] text-muted font-bold">Rate (₹/sq ft)</label>
                  <input
                    type="number"
                    step="50"
                    className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1 font-semibold text-[#E05A1E]"
                    value={u.rate_per_sqft || 6000}
                    onChange={(e) => onUpdateSalableUnit(u.id, { rate_per_sqft: e.target.value })}
                    disabled={!isPrivileged}
                  />
                </div>

                <div className="space-y-0.5">
                  <label className="text-[10px] text-muted font-bold">Total Projected</label>
                  <div className="w-full bg-slate-100 border border-slate-200 rounded px-2 py-1 font-mono font-bold text-slate-800 text-right truncate">
                    ₹{(u.total_amount ? Number(u.total_amount).toLocaleString('en-IN') : '—')}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
