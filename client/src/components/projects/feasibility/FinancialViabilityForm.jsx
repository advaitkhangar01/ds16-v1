// client/src/components/projects/feasibility/FinancialViabilityForm.jsx
import React from 'react';
import { Plus, Trash2, IndianRupee, Layers, FileText, CheckSquare, Square } from 'lucide-react';

const formatINR = (val) => {
  if (val === undefined || val === null || isNaN(val)) return '₹0.00';
  return '₹' + Number(val).toLocaleString('en-IN', { maximumFractionDigits: 2 });
};

export default function FinancialViabilityForm({
  financial = {},
  floors = [],
  statutoryCharges = [],
  salableUnits = [],
  onUpdateFinancial,
  onUpdateFloor,
  onAddFloor,
  onDeleteFloor,
  onUpdateStatutoryCharge,
  onArchiveStatutoryCharge,
  unitDisplay = 'sq_m',
  isPrivileged,
  isAddingFloor = false
}) {
  const isSqft = unitDisplay === 'sq_ft';
  const unitLabel = isSqft ? 'sq ft' : 'sq m';

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

      {/* 2. Statutory & Regulatory Charges (Section A) */}
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

        <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
          {statutoryCharges.map((item, idx) => {
            const isEnabled = item.is_enabled !== false;
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

      {/* 3. BPMS & Municipal Clearance Expenses */}
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

      {/* 4. Floor-wise Salable Units & Cost for 1 Unit (Sourced from Area Statement) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <Layers size={14} className="text-[#E05A1E]" />
              Floor-wise Salable Units & Realization ({floors.length} floors)
            </h4>
            <p className="text-[11px] text-muted">
              Sourced directly from Area Statement; Cost for 1 Unit = Area For 1 Unit × Price per {unitLabel}
            </p>
          </div>
          {isPrivileged && (
            <button
              type="button"
              onClick={onAddFloor}
              disabled={isAddingFloor}
              className={`btn-primary text-xs py-1 px-2.5 flex items-center gap-1.5 ${isAddingFloor ? 'opacity-60 cursor-not-allowed' : ''}`}
            >
              <Plus size={13} />
              {isAddingFloor ? 'Adding Floor...' : 'Add Floor'}
            </button>
          )}
        </div>

        {floors.length === 0 ? (
          <div className="bg-slate-50 border border-dashed border-slate-300 rounded-xl p-8 text-center space-y-2">
            <Layers size={24} className="mx-auto text-slate-400" />
            <p className="text-xs font-semibold text-slate-700">No configured floors in Area Statement</p>
            <p className="text-[11px] text-muted max-w-sm mx-auto">
              Configure floor levels in the Area Statement tab or click Add Floor to begin modeling unit realizations.
            </p>
            {isPrivileged && (
              <button
                type="button"
                onClick={onAddFloor}
                disabled={isAddingFloor}
                className="btn-secondary text-xs py-1 px-3 mt-1 inline-flex items-center gap-1"
              >
                <Plus size={12} /> Add First Floor
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
            {floors.map((floor, idx) => {
              const isParking = floor.floor_type === 'parking';
              const units = parseInt(floor.no_of_units, 10) || 0;
              const sale = parseFloat(floor.builtup_for_sale_sqm) || 0;
              const areaFor1Unit = units > 0 ? (sale / units) : 0;
              const ratePerSqm = parseFloat(floor.rate_per_sqm) || 0;
              const costFor1Unit = areaFor1Unit > 0 && ratePerSqm > 0
                ? (areaFor1Unit * ratePerSqm)
                : (parseFloat(floor.cost_for_1_unit) || 0);
              const floorRealization = ratePerSqm > 0 ? (sale * ratePerSqm) : (costFor1Unit * units);

              return (
                <div
                  key={floor.id || idx}
                  className={`p-3 rounded-xl border shadow-soft-sm space-y-2 transition-colors ${
                    isParking ? 'bg-amber-50/40 border-amber-200' : 'bg-white border-slate-200 hover:border-orange-200'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-1">
                      <input
                        type="text"
                        className="text-xs font-bold text-slate-800 bg-slate-50 border border-slate-200 rounded px-2 py-1 flex-1 focus:outline-none focus:border-[#E05A1E]"
                        value={floor.floor_name}
                        onChange={(e) => onUpdateFloor && onUpdateFloor(floor.id, { floor_name: e.target.value })}
                        disabled={!isPrivileged}
                      />
                      <span className="text-[10px] font-semibold text-slate-600 bg-slate-100 border border-slate-200 rounded px-2 py-1">
                        {isParking ? 'Parking Floor' : (floor.usage_type || 'Residential')}
                      </span>
                    </div>

                    <div className="text-right">
                      <span className="text-[10px] text-muted block font-medium">Floor Realization</span>
                      <span className="text-xs font-mono font-bold text-emerald-700">
                        {isParking ? '₹0.00' : formatINR(floorRealization)}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-2 text-xs">
                    {/* 1. Floor Level */}
                    <div className="space-y-0.5">
                      <label className="text-[10px] text-muted font-bold">Level</label>
                      <div className="bg-slate-100 border border-slate-200 rounded px-2 py-1 text-slate-700 truncate font-semibold">
                        {floor.floor_name}
                      </div>
                    </div>

                    {/* 2. Height (m) */}
                    <div className="space-y-0.5">
                      <label className="text-[10px] text-muted font-bold">Height (m)</label>
                      <input
                        type="number"
                        step="0.01"
                        className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1 text-slate-700"
                        value={floor.height_meters || ''}
                        onChange={(e) => onUpdateFloor && onUpdateFloor(floor.id, { height_meters: e.target.value })}
                        disabled={!isPrivileged}
                      />
                    </div>

                    {/* 3. P-Line Area */}
                    <div className="space-y-0.5">
                      <label className="text-[10px] text-muted font-bold">P-Line ({unitLabel})</label>
                      <input
                        type="number"
                        step="0.01"
                        className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1 font-semibold text-slate-800"
                        value={floor.pline_area_sqm || ''}
                        onChange={(e) => onUpdateFloor && onUpdateFloor(floor.id, { pline_area_sqm: e.target.value })}
                        disabled={!isPrivileged}
                      />
                    </div>

                    {/* 4. Lobby Area */}
                    <div className="space-y-0.5">
                      <label className="text-[10px] text-muted font-bold">Lobby ({unitLabel})</label>
                      <input
                        type="number"
                        step="0.01"
                        className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1 text-slate-700"
                        value={floor.lobby_area_sqm || ''}
                        onChange={(e) => onUpdateFloor && onUpdateFloor(floor.id, { lobby_area_sqm: e.target.value, is_lobby_overridden: true })}
                        disabled={!isPrivileged}
                      />
                    </div>

                    {/* 5. Builtup for Sale */}
                    <div className="space-y-0.5">
                      <label className="text-[10px] text-muted font-bold">Sale Area ({unitLabel})</label>
                      <input
                        type="number"
                        step="0.01"
                        className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1 font-semibold text-[#E05A1E]"
                        value={isParking ? 0 : (floor.builtup_for_sale_sqm || '')}
                        onChange={(e) => onUpdateFloor && onUpdateFloor(floor.id, { builtup_for_sale_sqm: e.target.value })}
                        disabled={!isPrivileged || isParking}
                      />
                    </div>

                    {/* 6. No. Of Units */}
                    <div className="space-y-0.5">
                      <label className="text-[10px] text-muted font-bold">Units</label>
                      <input
                        type="number"
                        min="0"
                        className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1 font-bold text-center text-slate-800"
                        value={isParking ? 0 : (floor.no_of_units ?? 1)}
                        onChange={(e) => onUpdateFloor && onUpdateFloor(floor.id, { no_of_units: e.target.value })}
                        disabled={!isPrivileged || isParking}
                      />
                    </div>

                    {/* 7. Area For 1 Unit */}
                    <div className="space-y-0.5">
                      <label className="text-[10px] text-muted font-bold">Area / Unit</label>
                      <div className="w-full bg-slate-100 border border-slate-200 rounded px-2 py-1 font-mono font-bold text-slate-800 text-right truncate">
                        {isParking ? '0.00' : `${areaFor1Unit.toFixed(2)} ${unitLabel}`}
                      </div>
                    </div>

                    {/* 8. Price / sq m for Cost for 1 Unit (₹) */}
                    <div className="space-y-0.5">
                      <label className="text-[10px] text-muted font-bold">Price / {unitLabel} (₹)</label>
                      <input
                        type="number"
                        step="100"
                        placeholder="₹/sq m"
                        className="w-full bg-white border border-slate-200 rounded px-2 py-1 font-mono font-semibold text-slate-800 text-right focus:border-[#E05A1E]"
                        value={isParking ? 0 : (floor.rate_per_sqm || '')}
                        onChange={(e) => {
                          const newRate = parseFloat(e.target.value) || 0;
                          const newCost1 = areaFor1Unit > 0 ? Math.round(areaFor1Unit * newRate * 100) / 100 : 0;
                          onUpdateFloor && onUpdateFloor(floor.id, {
                            rate_per_sqm: e.target.value,
                            cost_for_1_unit: newCost1
                          });
                        }}
                        disabled={!isPrivileged || isParking}
                      />
                    </div>
                  </div>

                  {/* Unit Cost highlight bar */}
                  {!isParking && units > 0 && (
                    <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-[11px]">
                      <span className="text-muted">
                        Cost for 1 Unit ({areaFor1Unit.toFixed(2)} {unitLabel} × ₹{Number(ratePerSqm).toLocaleString('en-IN') || 0}/{unitLabel}):
                      </span>
                      <span className="font-mono font-bold text-[#E05A1E]">
                        {formatINR(costFor1Unit)}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
