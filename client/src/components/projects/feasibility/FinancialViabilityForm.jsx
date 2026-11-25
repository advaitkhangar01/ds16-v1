// client/src/components/projects/feasibility/FinancialViabilityForm.jsx
import React, { useState } from 'react';
import {
  IndianRupee,
  Layers,
  CheckSquare,
  Square,
  ChevronDown,
  ChevronRight,
  Sliders,
  RefreshCw,
  AlertCircle,
  ShieldCheck
} from 'lucide-react';

const formatINR = (val) => {
  if (val === undefined || val === null || isNaN(val)) return '₹0.00';
  return '₹' + Number(val).toLocaleString('en-IN', { maximumFractionDigits: 2 });
};

export default function FinancialViabilityForm({
  financial = {},
  statement = {},
  floors = [],
  statutoryCharges = [],
  salableUnits = [],
  areaMetrics = {},
  financialMetrics = {},
  onUpdateFinancial,
  onUpdateFloor,
  onUpdateStatutoryCharge,
  onSaveOverride,
  onResetOverride,
  unitDisplay = 'sq_m',
  isPrivileged
}) {
  const isSqft = unitDisplay === 'sq_ft';
  const unitFactor = isSqft ? 10.764 : 1;
  const unitLabel = isSqft ? 'sq ft' : 'sq m';

  const [openSections, setOpenSections] = useState({
    autoSourced: true,
    marketRr: true,
    costNorms: true,
    construction: true,
    realization: true,
    financing: true,
    statutory: true,
    conditional: false
  });

  const toggleSection = (sec) => {
    setOpenSections((prev) => ({ ...prev, [sec]: !prev[sec] }));
  };

  // Active override modal state
  const [activeOverrideKey, setActiveOverrideKey] = useState(null);
  const [overrideValInput, setOverrideValInput] = useState('');
  const [overrideReasonInput, setOverrideReasonInput] = useState('');
  const [overrideBasisVal, setOverrideBasisVal] = useState(null);

  const handleOpenOverride = (key, currentCalculated) => {
    setActiveOverrideKey(key);
    const existing = financial.overrides?.[key];
    setOverrideValInput(existing?.override_val ?? currentCalculated ?? '');
    setOverrideReasonInput(existing?.reason || '');
    setOverrideBasisVal(currentCalculated);
  };

  const handleSaveOverrideModal = () => {
    if (activeOverrideKey && onSaveOverride) {
      onSaveOverride(activeOverrideKey, overrideValInput, overrideBasisVal, overrideReasonInput);
    }
    setActiveOverrideKey(null);
  };

  const hasBasement =
    (parseInt(financial.basement_area_sqm, 10) || 0) > 0 ||
    floors.some((f) => (f.floor_name || '').toLowerCase().includes('basement'));
  const hasStackedParking = (parseInt(financial.stacked_parking_slots, 10) || 0) > 0;
  const visibleStatutoryCharges = statutoryCharges.filter((sc) => sc.charge_code !== 'AMALGAMATION');

  return (
    <div className="space-y-6">
      {/* 1. Automatically Sourced Project Information */}
      <div className="bg-slate-50 rounded-xl border border-slate-200 overflow-hidden">
        <button
          type="button"
          onClick={() => toggleSection('autoSourced')}
          className="w-full px-4 py-3 bg-slate-100/70 hover:bg-slate-100 flex items-center justify-between gap-2 text-left transition-colors"
        >
          <div className="flex items-center gap-2 flex-wrap">
            <ShieldCheck size={16} className="text-emerald-600 shrink-0" />
            <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              1. Automatically Sourced Project Information
            </span>
            <span className="text-[10px] px-2 py-0.5 bg-emerald-100 text-emerald-800 font-bold rounded">
              Single Source of Truth
            </span>
          </div>
          {openSections.autoSourced ? (
            <ChevronDown size={14} className="text-slate-500 shrink-0" />
          ) : (
            <ChevronRight size={14} className="text-slate-500 shrink-0" />
          )}
        </button>

        {openSections.autoSourced && (
          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            <div className="p-3 bg-white rounded-lg border border-slate-200">
              <span className="text-[11px] text-muted block font-semibold">Plot Area</span>
              <span className="text-sm font-black text-slate-900 font-mono">
                {((parseFloat(statement.plot_area_sqm) || 0) * unitFactor).toFixed(2)} {unitLabel}
              </span>
              <span className="text-[10px] text-emerald-700 block font-medium">Source: Area Statement</span>
            </div>

            <div className="p-3 bg-white rounded-lg border border-slate-200">
              <span className="text-[11px] text-muted block font-semibold">Total Proposed P-Line</span>
              <span className="text-sm font-black text-[#E05A1E] font-mono">
                {((areaMetrics.totalProposedPlineSqm || areaMetrics.proposedPlineTotalSqm || 0) * unitFactor).toFixed(2)} {unitLabel}
              </span>
              <span className="text-[10px] text-emerald-700 block font-medium">Source: Floor Statement</span>
            </div>

            <div className="p-3 bg-white rounded-lg border border-slate-200">
              <span className="text-[11px] text-muted block font-semibold">Saleable Built-up Area</span>
              <span className="text-sm font-black text-slate-900 font-mono">
                {((areaMetrics.totalBuiltupForSaleSqm || 0) * unitFactor).toFixed(2)} {unitLabel}
              </span>
              <span className="text-[10px] text-emerald-700 block font-medium">Source: Floor Statement (P-Line − Lobby)</span>
            </div>

            <div className="p-3 bg-white rounded-lg border border-slate-200">
              <span className="text-[11px] text-muted block font-semibold">Habitable Floors / Units</span>
              <span className="text-sm font-black text-slate-900 font-mono">
                {areaMetrics.applicableHabitableFloorsCount || floors.filter(f => f.floor_type !== 'parking' && f.floor_type !== 'terrace').length} Floors / {areaMetrics.totalUnitsCount || 0} Units
              </span>
              <span className="text-[10px] text-emerald-700 block font-medium">Source: Building Config</span>
            </div>
          </div>
        )}
      </div>

      {/* 2. Market & Ready Reckoner Assumptions */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <button
          type="button"
          onClick={() => toggleSection('marketRr')}
          className="w-full px-4 py-3 bg-slate-50 hover:bg-slate-100/70 flex items-center justify-between gap-2 text-left transition-colors"
        >
          <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
            <IndianRupee size={14} className="text-[#E05A1E] shrink-0" />
            2. Market &amp; Ready Reckoner Assumptions
          </span>
          {openSections.marketRr ? (
            <ChevronDown size={14} className="text-slate-500 shrink-0" />
          ) : (
            <ChevronRight size={14} className="text-slate-500 shrink-0" />
          )}
        </button>
        {openSections.marketRr && (
          <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-700 block">
                Ready Reckoner (RR) Land Rate (₹/sq m)
              </label>
              <input
                type="number"
                step="1"
                placeholder="e.g. 24340"
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-bold font-mono text-slate-900 focus:outline-none focus:border-[#E05A1E]"
                value={financial.rr_rate_per_sqm ?? ''}
                onChange={(e) => onUpdateFinancial({ rr_rate_per_sqm: e.target.value })}
                disabled={!isPrivileged}
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-700 block">
                Plot Acquisition Rate (₹/sq m)
              </label>
              <input
                type="number"
                step="1"
                placeholder="e.g. 35000 (if applicable)"
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-mono text-slate-800 focus:outline-none focus:border-[#E05A1E]"
                value={financial.cost_of_plot_rate_per_sqm ?? ''}
                onChange={(e) => onUpdateFinancial({ cost_of_plot_rate_per_sqm: e.target.value })}
                disabled={!isPrivileged}
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-700 block">
                TDR Purchase Factor (55% RR default)
              </label>
              <input
                type="number"
                step="0.01"
                placeholder="0.55"
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-mono text-slate-800 focus:outline-none focus:border-[#E05A1E]"
                value={financial.tdr_purchase_factor ?? '0.55'}
                onChange={(e) => onUpdateFinancial({ tdr_purchase_factor: e.target.value })}
                disabled={!isPrivileged}
              />
            </div>
          </div>
        )}
      </div>

      {/* 3. Statutory Cost Norms — Cost A and Cost B + 4. Civil Construction & Infrastructure Costs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 3. Statutory Cost Norms */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <button
            type="button"
            onClick={() => toggleSection('costNorms')}
            className="w-full px-4 py-3 bg-slate-50 hover:bg-slate-100/70 flex items-center justify-between gap-2 text-left transition-colors"
          >
            <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              3. Statutory Cost Norms — Cost A &amp; Cost B
            </span>
            {openSections.costNorms ? (
              <ChevronDown size={14} className="text-slate-500 shrink-0" />
            ) : (
              <ChevronRight size={14} className="text-slate-500 shrink-0" />
            )}
          </button>
          {openSections.costNorms && (
            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-700 block">
                  Estimated Cost A Rate (₹/sq m)
                </label>
                <input
                  type="number"
                  step="1"
                  placeholder="15000"
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-bold font-mono text-slate-900 focus:outline-none focus:border-[#E05A1E]"
                  value={financial.estimated_cost_a_rate ?? ''}
                  onChange={(e) => onUpdateFinancial({ estimated_cost_a_rate: e.target.value })}
                  disabled={!isPrivileged}
                />
                <span className="text-[11px] text-muted block">
                  Drives Security Deposit &amp; Stacking • Total: <strong className="font-mono text-slate-800">{formatINR(financialMetrics.estimatedCostA || 0)}</strong>
                </span>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-700 block">
                  Estimated Cost B Rate (₹/sq m)
                </label>
                <input
                  type="number"
                  step="1"
                  placeholder="26620"
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-bold font-mono text-slate-900 focus:outline-none focus:border-[#E05A1E]"
                  value={financial.estimated_cost_b_rate ?? ''}
                  onChange={(e) => onUpdateFinancial({ estimated_cost_b_rate: e.target.value })}
                  disabled={!isPrivileged}
                />
                <span className="text-[11px] text-muted block">
                  Drives Labour Welfare Cess • Total: <strong className="font-mono text-slate-800">{formatINR(financialMetrics.estimatedCostB || 0)}</strong>
                </span>
              </div>
            </div>
          )}
        </div>

        {/* 4. Civil Construction & Infrastructure Costs */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <button
            type="button"
            onClick={() => toggleSection('construction')}
            className="w-full px-4 py-3 bg-slate-50 hover:bg-slate-100/70 flex items-center justify-between gap-2 text-left transition-colors"
          >
            <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              4. Civil Construction &amp; Infrastructure Costs
            </span>
            {openSections.construction ? (
              <ChevronDown size={14} className="text-slate-500 shrink-0" />
            ) : (
              <ChevronRight size={14} className="text-slate-500 shrink-0" />
            )}
          </button>
          {openSections.construction && (
            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-700 block">
                  Civil Construction Rate (₹/sq m)
                </label>
                <input
                  type="number"
                  step="1"
                  placeholder="20000"
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-bold font-mono text-slate-900 focus:outline-none focus:border-[#E05A1E]"
                  value={financial.cost_of_construction_rate ?? ''}
                  onChange={(e) => onUpdateFinancial({ cost_of_construction_rate: e.target.value })}
                  disabled={!isPrivileged}
                />
                <div className="text-[11px] flex items-center justify-between gap-2 pt-0.5">
                  <span className="text-muted">Total: <strong className="font-mono text-slate-800">{formatINR(financialMetrics.costOfConstructionD || 0)}</strong></span>
                  {financialMetrics.costOfConstructionD_details?.has_override && (
                    <span className="text-amber-700 font-bold">Override Active</span>
                  )}
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-700 block">
                  Infrastructure Expenses (₹ Lump-sum)
                </label>
                <input
                  type="number"
                  step="1"
                  placeholder="e.g. 1000000"
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-mono text-slate-800 focus:outline-none focus:border-[#E05A1E]"
                  value={financial.cost_of_infrastructure ?? ''}
                  onChange={(e) => onUpdateFinancial({ cost_of_infrastructure: e.target.value })}
                  disabled={!isPrivileged}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 5. Sales Realisation by Floor */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <button
          type="button"
          onClick={() => toggleSection('realization')}
          className="w-full px-4 py-3 bg-slate-50 hover:bg-slate-100/70 flex items-center justify-between gap-2 text-left transition-colors"
        >
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              5. Sales Realisation by Floor
            </span>
            <span className="text-[11px] text-muted font-normal">
              (Sourced from Area Statement; enter selling rates per sq m)
            </span>
          </div>
          {openSections.realization ? (
            <ChevronDown size={14} className="text-slate-500 shrink-0" />
          ) : (
            <ChevronRight size={14} className="text-slate-500 shrink-0" />
          )}
        </button>

        {openSections.realization && (
          <div className="p-4 space-y-3">
            {/* Desktop Table (md and up — zero nested horizontal scroll) */}
            <div className="hidden md:block border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase font-bold text-slate-600">
                  <tr>
                    <th className="px-3 py-2.5">Floor Level</th>
                    <th className="px-3 py-2.5 text-right">Built-up Sale ({unitLabel})</th>
                    <th className="px-2 py-2.5 text-center">Units</th>
                    <th className="px-3 py-2.5 text-right">Selling Rate (₹/sq m)</th>
                    <th className="px-3 py-2.5 text-right">Floor Realisation (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {floors.map((fl, idx) => {
                    const isParking = fl.floor_type === 'parking';
                    const isTerrace = fl.floor_type === 'terrace';
                    const isHabitable = !isParking && !isTerrace;
                    const saleSqm = parseFloat(fl.builtup_for_sale_sqm) || 0;
                    const units = parseInt(fl.no_of_units, 10) || 0;
                    const rate = parseFloat(fl.rate_per_sqm) || 0;
                    const realization = rate > 0 ? saleSqm * rate : 0;

                    return (
                      <tr key={fl.id || fl.floor_key || idx} className="hover:bg-slate-50">
                        <td className="px-3 py-2 font-bold text-slate-800">{fl.floor_name}</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums">
                          {isHabitable ? (saleSqm * unitFactor).toFixed(2) : '—'}
                        </td>
                        <td className="px-2 py-2 text-center font-bold font-mono">{isHabitable ? units : '—'}</td>
                        <td className="px-3 py-2 text-right">
                          {isHabitable ? (
                            <input
                              type="number"
                              step="100"
                              placeholder="e.g. 50000"
                              className="w-32 text-right text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 font-mono font-bold text-slate-800 focus:outline-none focus:border-[#E05A1E]"
                              value={fl.rate_per_sqm || ''}
                              onChange={(e) => onUpdateFloor(fl.id, { rate_per_sqm: e.target.value })}
                              disabled={!isPrivileged}
                            />
                          ) : (
                            <span className="text-slate-400 font-mono">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-bold text-[#E05A1E] tabular-nums">
                          {isHabitable ? formatINR(realization) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-slate-50 font-bold border-t border-slate-200 text-xs">
                  <tr>
                    <td className="px-3 py-2.5">Total Expected Receipts</td>
                    <td className="px-3 py-2.5 text-right font-mono">
                      {((areaMetrics.totalBuiltupForSaleSqm || 0) * unitFactor).toFixed(2)} {unitLabel}
                    </td>
                    <td className="px-2 py-2.5 text-center font-mono">{areaMetrics.totalUnitsCount || 0}</td>
                    <td className="px-3 py-2.5 text-right text-slate-400">—</td>
                    <td className="px-3 py-2.5 text-right font-mono text-emerald-700 font-black">
                      {formatINR(financialMetrics.totalReceipts || 0)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Mobile Structured Floor Realisation Cards (< md) */}
            <div className="md:hidden space-y-2.5">
              {floors.map((fl, idx) => {
                const isParking = fl.floor_type === 'parking';
                const isTerrace = fl.floor_type === 'terrace';
                const isHabitable = !isParking && !isTerrace;
                const saleSqm = parseFloat(fl.builtup_for_sale_sqm) || 0;
                const units = parseInt(fl.no_of_units, 10) || 0;
                const rate = parseFloat(fl.rate_per_sqm) || 0;
                const realization = rate > 0 ? saleSqm * rate : 0;

                return (
                  <div
                    key={fl.id || fl.floor_key || idx}
                    className={`p-3 rounded-xl border border-slate-200 space-y-2 text-xs ${!isHabitable ? 'bg-slate-50/70 opacity-75' : 'bg-white'}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-slate-900">{fl.floor_name}</span>
                      <span className="font-mono font-bold text-[#E05A1E]">
                        {isHabitable ? formatINR(realization) : 'Non-saleable'}
                      </span>
                    </div>
                    {isHabitable && (
                      <>
                        <div className="flex items-center justify-between text-[11px] text-slate-600 font-mono">
                          <span>Saleable: {(saleSqm * unitFactor).toFixed(2)} {unitLabel}</span>
                          <span>Units: {units}</span>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[11px] font-semibold text-slate-600 block">Selling Rate (₹/sq m)</label>
                          <input
                            type="number"
                            step="100"
                            placeholder="e.g. 50000"
                            className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 font-mono font-bold text-slate-800 focus:outline-none focus:border-[#E05A1E]"
                            value={fl.rate_per_sqm || ''}
                            onChange={(e) => onUpdateFloor(fl.id, { rate_per_sqm: e.target.value })}
                            disabled={!isPrivileged}
                          />
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-xs font-bold">
                <span className="text-emerald-950">Total Expected Receipts</span>
                <span className="font-mono text-emerald-700">{formatINR(financialMetrics.totalReceipts || 0)}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 6. Financing, Rent Compensation & Project Duration */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <button
          type="button"
          onClick={() => toggleSection('financing')}
          className="w-full px-4 py-3 bg-slate-50 hover:bg-slate-100/70 flex items-center justify-between gap-2 text-left transition-colors"
        >
          <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
            6. Financing, Rent Compensation &amp; Project Duration
          </span>
          {openSections.financing ? (
            <ChevronDown size={14} className="text-slate-500 shrink-0" />
          ) : (
            <ChevronRight size={14} className="text-slate-500 shrink-0" />
          )}
        </button>
        {openSections.financing && (
          <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-700 block">Project Period (Months)</label>
              <input
                type="text"
                placeholder="e.g. 18 Months"
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:border-[#E05A1E]"
                value={financial.period_months || ''}
                onChange={(e) => onUpdateFinancial({ period_months: e.target.value })}
                disabled={!isPrivileged}
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-700 block">Rent Tenements</label>
              <input
                type="number"
                placeholder="0"
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-mono text-slate-800 focus:outline-none focus:border-[#E05A1E]"
                value={financial.rent_tenements ?? ''}
                onChange={(e) => onUpdateFinancial({ rent_tenements: e.target.value })}
                disabled={!isPrivileged}
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-700 block">Rent / Tenement / Month (₹)</label>
              <input
                type="number"
                placeholder="0"
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-mono text-slate-800 focus:outline-none focus:border-[#E05A1E]"
                value={financial.rent_per_tenement_per_month ?? ''}
                onChange={(e) => onUpdateFinancial({ rent_per_tenement_per_month: e.target.value })}
                disabled={!isPrivileged}
              />
            </div>
          </div>
        )}
      </div>

      {/* 7. Statutory and Regulatory Charges */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <button
          type="button"
          onClick={() => toggleSection('statutory')}
          className="w-full px-4 py-3 bg-slate-50 hover:bg-slate-100/70 flex flex-wrap items-center justify-between gap-2 text-left transition-colors"
        >
          <div className="flex items-center gap-2 flex-wrap">
            <Layers size={14} className="text-[#E05A1E] shrink-0" />
            <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              7. Statutory and Regulatory Charges (Section A — NMC Demand)
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono font-bold text-slate-800 bg-white px-2.5 py-0.5 rounded border border-slate-200">
              Total Demand: {formatINR(financialMetrics.totalStatutoryDemandA || 0)}
            </span>
            {openSections.statutory ? (
              <ChevronDown size={14} className="text-slate-500 shrink-0" />
            ) : (
              <ChevronRight size={14} className="text-slate-500 shrink-0" />
            )}
          </div>
        </button>

        {openSections.statutory && (
          <div className="p-4">
            {/* Desktop Table (md and up — zero nested horizontal scroll) */}
            <div className="hidden md:block border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase font-bold text-slate-600">
                  <tr>
                    <th className="px-3 py-2.5 w-14 text-center">Active</th>
                    <th className="px-3 py-2.5">Statutory Item</th>
                    <th className="px-3 py-2.5 text-right w-20">RR %</th>
                    <th className="px-3 py-2.5 text-right w-36">Calculated (₹)</th>
                    <th className="px-3 py-2.5 text-right w-36">Effective (₹)</th>
                    <th className="px-3 py-2.5 text-center w-32">Override</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visibleStatutoryCharges.map((sc) => {
                    const isEnabled = sc.is_enabled !== false;
                    const hasOverride = Boolean(sc.has_override);
                    const hasDrift = Boolean(sc.has_basis_drift);
                    const calculatedAmt = parseFloat(sc.calculated_amount) || 0;
                    const effectiveAmt = parseFloat(sc.effective_amount ?? sc.calculated_amount ?? sc.amount) || 0;
                    const overrideKey = `statutory_${sc.charge_code}`;

                    return (
                      <tr key={sc.id || sc.charge_code} className={`hover:bg-slate-50 ${!isEnabled ? 'opacity-50 bg-slate-50/50' : ''}`}>
                        <td className="px-3 py-2 text-center">
                          {isPrivileged && (
                            <button
                              type="button"
                              onClick={() => onUpdateStatutoryCharge(sc.id, { is_enabled: !isEnabled })}
                              className="text-slate-600 hover:text-[#E05A1E] inline-flex items-center justify-center"
                            >
                              {isEnabled ? <CheckSquare size={15} className="text-[#E05A1E]" /> : <Square size={15} />}
                            </button>
                          )}
                        </td>
                        <td className="px-3 py-2 font-bold text-slate-800">{sc.charge_name}</td>
                        <td className="px-3 py-2 text-right font-mono text-slate-600 tabular-nums">
                          {sc.rr_percentage !== null && sc.rr_percentage !== undefined ? `${sc.rr_percentage}%` : '—'}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-slate-600 tabular-nums">
                          {formatINR(calculatedAmt)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-bold text-slate-900 tabular-nums">
                          {isEnabled ? formatINR(effectiveAmt) : '₹0.00'}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {isPrivileged && (
                            <div className="flex items-center justify-center gap-1.5">
                              {hasOverride ? (
                                <button
                                  type="button"
                                  onClick={() => handleOpenOverride(overrideKey, calculatedAmt)}
                                  className={`text-[10px] px-2 py-0.5 rounded font-bold flex items-center gap-0.5 ${
                                    hasDrift ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'bg-orange-100 text-[#E05A1E]'
                                  }`}
                                  title={hasDrift ? 'Calculation basis has changed! Click to review.' : 'Override active'}
                                >
                                  {hasDrift && <AlertCircle size={10} />} Overridden
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleOpenOverride(overrideKey, calculatedAmt)}
                                  className="text-[11px] text-slate-500 hover:text-[#E05A1E] underline"
                                >
                                  Override
                                </button>
                              )}
                              {hasOverride && onResetOverride && (
                                <button
                                  type="button"
                                  onClick={() => onResetOverride(overrideKey)}
                                  className="text-slate-400 hover:text-red-600 p-0.5"
                                  title="Reset to Calculated"
                                >
                                  <RefreshCw size={11} />
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Structured Statutory Charge Cards (< md) */}
            <div className="md:hidden space-y-2.5">
              {visibleStatutoryCharges.map((sc) => {
                const isEnabled = sc.is_enabled !== false;
                const hasOverride = Boolean(sc.has_override);
                const hasDrift = Boolean(sc.has_basis_drift);
                const calculatedAmt = parseFloat(sc.calculated_amount) || 0;
                const effectiveAmt = parseFloat(sc.effective_amount ?? sc.calculated_amount ?? sc.amount) || 0;
                const overrideKey = `statutory_${sc.charge_code}`;

                return (
                  <div
                    key={sc.id || sc.charge_code}
                    className={`p-3 rounded-xl border border-slate-200 space-y-2 text-xs ${!isEnabled ? 'opacity-60 bg-slate-50' : 'bg-white'}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2 min-w-0">
                        {isPrivileged && (
                          <button
                            type="button"
                            onClick={() => onUpdateStatutoryCharge(sc.id, { is_enabled: !isEnabled })}
                            className="text-slate-600 hover:text-[#E05A1E] mt-0.5 shrink-0"
                          >
                            {isEnabled ? <CheckSquare size={15} className="text-[#E05A1E]" /> : <Square size={15} />}
                          </button>
                        )}
                        <span className="font-bold text-slate-900 leading-snug">{sc.charge_name}</span>
                      </div>
                      <span className="font-mono font-bold text-slate-900 shrink-0">
                        {isEnabled ? formatINR(effectiveAmt) : '₹0.00'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2 text-[11px] text-slate-600">
                      <span className="font-mono">
                        RR: {sc.rr_percentage !== null && sc.rr_percentage !== undefined ? `${sc.rr_percentage}%` : '—'} • Calc: {formatINR(calculatedAmt)}
                      </span>
                      {isPrivileged && (
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleOpenOverride(overrideKey, calculatedAmt)}
                            className={`text-[10px] px-2 py-0.5 rounded font-semibold ${
                              hasOverride
                                ? hasDrift ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'bg-orange-100 text-[#E05A1E]'
                                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                            }`}
                          >
                            {hasOverride ? 'Overridden' : 'Override'}
                          </button>
                          {hasOverride && onResetOverride && (
                            <button
                              type="button"
                              onClick={() => onResetOverride(overrideKey)}
                              className="text-slate-400 hover:text-red-600 p-0.5"
                              title="Reset to Calculated"
                            >
                              <RefreshCw size={11} />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* 8. Conditional Expenses and Additional Financial Inputs */}
      <div className="bg-amber-50/40 rounded-xl border border-amber-200 overflow-hidden">
        <button
          type="button"
          onClick={() => toggleSection('conditional')}
          className="w-full px-4 py-3 bg-amber-50/80 hover:bg-amber-100/50 flex items-center justify-between gap-2 text-left transition-colors"
        >
          <span className="text-xs font-bold text-amber-950 uppercase tracking-wider flex items-center gap-1.5">
            <Sliders size={14} className="text-amber-700 shrink-0" />
            8. Conditional Expenses &amp; Additional Financial Inputs
          </span>
          {openSections.conditional || hasBasement || hasStackedParking ? (
            <ChevronDown size={14} className="text-amber-700 shrink-0" />
          ) : (
            <ChevronRight size={14} className="text-amber-700 shrink-0" />
          )}
        </button>

        {(hasBasement || hasStackedParking || openSections.conditional) && (
          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-700 block">Basement Area (sq m)</label>
              <input
                type="number"
                placeholder="0"
                className="w-full text-xs bg-white border border-amber-300 rounded-lg px-3 py-2 font-mono text-slate-800 focus:outline-none focus:border-[#E05A1E]"
                value={financial.basement_area_sqm ?? ''}
                onChange={(e) => onUpdateFinancial({ basement_area_sqm: e.target.value })}
                disabled={!isPrivileged}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-700 block">Basement Rate (₹/sq m)</label>
              <input
                type="number"
                placeholder="e.g. 5500"
                className="w-full text-xs bg-white border border-amber-300 rounded-lg px-3 py-2 font-mono text-slate-800 focus:outline-none focus:border-[#E05A1E]"
                value={financial.basement_rate_per_sqm ?? ''}
                onChange={(e) => onUpdateFinancial({ basement_rate_per_sqm: e.target.value })}
                disabled={!isPrivileged}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-700 block">Stacked Parking Slots</label>
              <input
                type="number"
                placeholder="0"
                className="w-full text-xs bg-white border border-amber-300 rounded-lg px-3 py-2 font-mono text-slate-800 focus:outline-none focus:border-[#E05A1E]"
                value={financial.stacked_parking_slots ?? ''}
                onChange={(e) => onUpdateFinancial({ stacked_parking_slots: e.target.value })}
                disabled={!isPrivileged}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-700 block">Stacked Parking Cost / Slot (₹)</label>
              <input
                type="number"
                placeholder="e.g. 250000"
                className="w-full text-xs bg-white border border-amber-300 rounded-lg px-3 py-2 font-mono text-slate-800 focus:outline-none focus:border-[#E05A1E]"
                value={financial.stacked_parking_cost_per_slot ?? ''}
                onChange={(e) => onUpdateFinancial({ stacked_parking_cost_per_slot: e.target.value })}
                disabled={!isPrivileged}
              />
            </div>
          </div>
        )}
      </div>

      {/* Controlled Override Modal Dialog */}
      {activeOverrideKey && (
        <div className="p-4 bg-amber-50 rounded-xl border border-amber-300 space-y-3">
          <h5 className="text-xs font-bold text-amber-950 uppercase tracking-wider flex items-center gap-1.5">
            <Sliders size={14} className="text-amber-700" />
            Set Controlled Manual Override for {activeOverrideKey}
          </h5>
          <p className="text-xs text-amber-900">
            Calculated value is <strong className="font-mono">{formatINR(overrideBasisVal || 0)}</strong>. Entering an override preserves the original calculation and tracks editor history.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-700">Override Amount (₹)</label>
              <input
                type="number"
                step="0.01"
                placeholder={overrideBasisVal ? String(overrideBasisVal) : ''}
                className="w-full text-xs bg-white border border-amber-300 rounded-lg px-3 py-2 font-bold font-mono text-slate-900 focus:outline-none focus:border-[#E05A1E]"
                value={overrideValInput}
                onChange={(e) => setOverrideValInput(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-700">Reason / Approved Demand Note</label>
              <input
                type="text"
                placeholder="e.g. Official NMC demand note received"
                className="w-full text-xs bg-white border border-amber-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:border-[#E05A1E]"
                value={overrideReasonInput}
                onChange={(e) => setOverrideReasonInput(e.target.value)}
              />
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setActiveOverrideKey(null)}
              className="text-xs px-3 py-1.5 text-slate-600 hover:text-slate-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveOverrideModal}
              className="btn-primary text-xs py-1.5 px-3"
            >
              Save Override
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
