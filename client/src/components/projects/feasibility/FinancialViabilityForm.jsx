// client/src/components/projects/feasibility/FinancialViabilityForm.jsx
import React, { useState } from 'react';
import { IndianRupee, Layers, CheckSquare, Square, ChevronDown, ChevronRight, Sliders, RefreshCw, AlertCircle, ShieldCheck } from 'lucide-react';

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
  const unitLabel = isSqft ? 'sq ft' : 'sq m';

  // Collapsible cards state
  const [openSections, setOpenSections] = useState({
    autoSourced: true,
    marketRr: true,
    costNorms: true,
    construction: true,
    realization: true,
    financing: false,
    statutory: true,
    conditional: false
  });

  const toggleSection = (sec) => {
    setOpenSections(prev => ({ ...prev, [sec]: !prev[sec] }));
  };

  // Active override popover state
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

  const hasBasement = (parseInt(financial.basement_area_sqm, 10) || 0) > 0 || floors.some(f => (f.floor_name || '').toLowerCase().includes('basement'));
  const hasStackedParking = (parseInt(financial.stacked_parking_slots, 10) || 0) > 0;

  return (
    <div className="space-y-6">
      {/* ========================================================
          CATEGORY A: AUTOMATICALLY SOURCED PROJECT METRICS
          ======================================================== */}
      <div className="bg-slate-50 rounded-xl border border-slate-200 overflow-hidden">
        <button
          type="button"
          onClick={() => toggleSection('autoSourced')}
          className="w-full px-4 py-3 bg-slate-100/70 hover:bg-slate-100 flex items-center justify-between text-left transition-colors"
        >
          <div className="flex items-center gap-2">
            <ShieldCheck size={16} className="text-emerald-600" />
            <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Category A — Automatically Sourced Project Information
            </span>
            <span className="text-[10px] px-2 py-0.5 bg-emerald-100 text-emerald-800 font-bold rounded">
              Single Source of Truth
            </span>
          </div>
          {openSections.autoSourced ? <ChevronDown size={14} className="text-slate-500" /> : <ChevronRight size={14} className="text-slate-500" />}
        </button>

        {openSections.autoSourced && (
          <div className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="p-2.5 bg-white rounded-lg border border-slate-200">
              <span className="text-[10px] text-muted block font-semibold">Plot Area</span>
              <span className="text-sm font-black text-slate-900 font-mono">
                {(parseFloat(statement.plot_area_sqm) || 0).toFixed(2)} {unitLabel}
              </span>
              <span className="text-[9px] text-emerald-700 block font-medium">Source: Area Statement</span>
            </div>

            <div className="p-2.5 bg-white rounded-lg border border-slate-200">
              <span className="text-[10px] text-muted block font-semibold">Total Proposed P-Line</span>
              <span className="text-sm font-black text-[#E05A1E] font-mono">
                {(areaMetrics.totalProposedPlineSqm || 0).toFixed(2)} {unitLabel}
              </span>
              <span className="text-[9px] text-emerald-700 block font-medium">Source: Floor Statement</span>
            </div>

            <div className="p-2.5 bg-white rounded-lg border border-slate-200">
              <span className="text-[10px] text-muted block font-semibold">Saleable Built-up Area</span>
              <span className="text-sm font-black text-slate-900 font-mono">
                {(areaMetrics.totalBuiltupForSaleSqm || 0).toFixed(2)} {unitLabel}
              </span>
              <span className="text-[9px] text-emerald-700 block font-medium">Source: Floor Statement (P-Line - Lobby)</span>
            </div>

            <div className="p-2.5 bg-white rounded-lg border border-slate-200">
              <span className="text-[10px] text-muted block font-semibold">Habitable Floors / Units</span>
              <span className="text-sm font-black text-slate-900 font-mono">
                {areaMetrics.applicableHabitableFloorsCount || 0} Floors / {areaMetrics.totalUnitsCount || 0} Units
              </span>
              <span className="text-[9px] text-emerald-700 block font-medium">Source: Building Config</span>
            </div>
          </div>
        )}
      </div>

      {/* ========================================================
          CATEGORY B: ESSENTIAL MANUAL ASSUMPTIONS (5 Groups)
          ======================================================== */}
      <div className="space-y-4">
        <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
          <IndianRupee size={14} className="text-[#E05A1E]" />
          Category B — Essential Project Financial Assumptions
        </h4>

        {/* Group 1: Market & Ready Reckoner Assumptions */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-soft-sm">
          <button
            type="button"
            onClick={() => toggleSection('marketRr')}
            className="w-full px-4 py-2.5 bg-slate-50 hover:bg-slate-100/70 flex items-center justify-between text-left transition-colors"
          >
            <span className="text-xs font-bold text-slate-800">1. Market & Ready Reckoner Assumptions</span>
            {openSections.marketRr ? <ChevronDown size={14} className="text-slate-500" /> : <ChevronRight size={14} className="text-slate-500" />}
          </button>
          {openSections.marketRr && (
            <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-700">Ready Reckoner (RR) Land Rate (₹/sq m)</label>
                <input
                  type="number"
                  step="1"
                  placeholder="e.g. 24340"
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 font-bold text-slate-900 focus:outline-none focus:border-[#E05A1E]"
                  value={financial.rr_rate_per_sqm ?? ''}
                  onChange={(e) => onUpdateFinancial({ rr_rate_per_sqm: e.target.value })}
                  disabled={!isPrivileged}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-700">Plot Acquisition Rate (₹/sq m)</label>
                <input
                  type="number"
                  step="1"
                  placeholder="e.g. 35000 (if applicable)"
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-slate-800 focus:outline-none focus:border-[#E05A1E]"
                  value={financial.cost_of_plot_rate_per_sqm ?? ''}
                  onChange={(e) => onUpdateFinancial({ cost_of_plot_rate_per_sqm: e.target.value })}
                  disabled={!isPrivileged}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-700">TDR Purchase Factor (55% RR default)</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.55"
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-slate-800 focus:outline-none focus:border-[#E05A1E]"
                  value={financial.tdr_purchase_factor ?? '0.55'}
                  onChange={(e) => onUpdateFinancial({ tdr_purchase_factor: e.target.value })}
                  disabled={!isPrivileged}
                />
              </div>
            </div>
          )}
        </div>

        {/* Group 2: Cost Norms (Cost A & Cost B Preserved Separately) */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-soft-sm">
          <button
            type="button"
            onClick={() => toggleSection('costNorms')}
            className="w-full px-4 py-2.5 bg-slate-50 hover:bg-slate-100/70 flex items-center justify-between text-left transition-colors"
          >
            <span className="text-xs font-bold text-slate-800">2. Statutory Cost Norms (Cost A & Cost B)</span>
            {openSections.costNorms ? <ChevronDown size={14} className="text-slate-500" /> : <ChevronRight size={14} className="text-slate-500" />}
          </button>
          {openSections.costNorms && (
            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-semibold text-slate-700">Estimated Cost A Rate (₹/sq m)</label>
                  <span className="text-[10px] text-muted">Drives Security Deposit & Stacking</span>
                </div>
                <input
                  type="number"
                  step="1"
                  placeholder="15000"
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 font-bold font-mono text-slate-900 focus:outline-none focus:border-[#E05A1E]"
                  value={financial.estimated_cost_a_rate ?? ''}
                  onChange={(e) => onUpdateFinancial({ estimated_cost_a_rate: e.target.value })}
                  disabled={!isPrivileged}
                />
                <span className="text-[10px] text-muted">
                  Total Cost A: {formatINR(financialMetrics.estimatedCostA || 0)}
                </span>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-semibold text-slate-700">Estimated Cost B Rate (₹/sq m)</label>
                  <span className="text-[10px] text-muted">Drives Labour Welfare Cess</span>
                </div>
                <input
                  type="number"
                  step="1"
                  placeholder="26620"
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 font-bold font-mono text-slate-900 focus:outline-none focus:border-[#E05A1E]"
                  value={financial.estimated_cost_b_rate ?? ''}
                  onChange={(e) => onUpdateFinancial({ estimated_cost_b_rate: e.target.value })}
                  disabled={!isPrivileged}
                />
                <span className="text-[10px] text-muted">
                  Total Cost B: {formatINR(financialMetrics.estimatedCostB || 0)}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Group 3: Construction Cost Assumptions */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-soft-sm">
          <button
            type="button"
            onClick={() => toggleSection('construction')}
            className="w-full px-4 py-2.5 bg-slate-50 hover:bg-slate-100/70 flex items-center justify-between text-left transition-colors"
          >
            <span className="text-xs font-bold text-slate-800">3. Civil Construction & Infrastructure Cost Assumptions</span>
            {openSections.construction ? <ChevronDown size={14} className="text-slate-500" /> : <ChevronRight size={14} className="text-slate-500" />}
          </button>
          {openSections.construction && (
            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-700">Civil Construction Rate (₹/sq m)</label>
                <input
                  type="number"
                  step="1"
                  placeholder="20000"
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 font-bold text-slate-900 focus:outline-none focus:border-[#E05A1E]"
                  value={financial.cost_of_construction_rate ?? ''}
                  onChange={(e) => onUpdateFinancial({ cost_of_construction_rate: e.target.value })}
                  disabled={!isPrivileged}
                />
                <div className="text-[10px] flex items-center justify-between pt-0.5">
                  <span className="text-muted">Total: {formatINR(financialMetrics.costOfConstructionD || 0)}</span>
                  {financialMetrics.costOfConstructionD_details?.has_override && (
                    <span className="text-amber-700 font-bold">Override Active</span>
                  )}
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-700">Infrastructure Expenses (₹ Lump-sum)</label>
                <input
                  type="number"
                  step="1"
                  placeholder="e.g. 1000000"
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-slate-800 focus:outline-none focus:border-[#E05A1E]"
                  value={financial.cost_of_infrastructure ?? ''}
                  onChange={(e) => onUpdateFinancial({ cost_of_infrastructure: e.target.value })}
                  disabled={!isPrivileged}
                />
              </div>
            </div>
          )}
        </div>

        {/* Group 4: Sales & Commercial Realization (Driven by Area Statement Floors) */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-soft-sm">
          <button
            type="button"
            onClick={() => toggleSection('realization')}
            className="w-full px-4 py-2.5 bg-slate-50 hover:bg-slate-100/70 flex items-center justify-between text-left transition-colors"
          >
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-800">4. Sales Realization by Floor</span>
              <span className="text-[10px] text-muted font-normal">
                (Sourced from Area Statement; Enter selling rates per sq.m)
              </span>
            </div>
            {openSections.realization ? <ChevronDown size={14} className="text-slate-500" /> : <ChevronRight size={14} className="text-slate-500" />}
          </button>
          {openSections.realization && (
            <div className="p-4 space-y-3">
              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 border-b text-[10px] uppercase font-bold text-slate-600">
                    <tr>
                      <th className="px-3 py-2">Floor Level</th>
                      <th className="px-3 py-2 text-right">Built-up Sale ({unitLabel})</th>
                      <th className="px-2 py-2 text-center">Units</th>
                      <th className="px-3 py-2 text-right">Selling Rate (₹/sq m)</th>
                      <th className="px-3 py-2 text-right">Floor Realization (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {floors.map((fl) => {
                      const isParking = fl.floor_type === 'parking';
                      const isTerrace = fl.floor_type === 'terrace';
                      const isHabitable = !isParking && !isTerrace;
                      const saleSqm = parseFloat(fl.builtup_for_sale_sqm) || 0;
                      const units = parseInt(fl.no_of_units, 10) || 0;
                      const rate = parseFloat(fl.rate_per_sqm) || 0;
                      const realization = rate > 0 ? (saleSqm * rate) : 0;

                      return (
                        <tr key={fl.id || fl.floor_key} className="hover:bg-slate-50">
                          <td className="px-3 py-2 font-bold text-slate-800">{fl.floor_name}</td>
                          <td className="px-3 py-2 text-right font-mono">{isHabitable ? saleSqm.toFixed(2) : '—'}</td>
                          <td className="px-2 py-2 text-center font-bold">{isHabitable ? units : '—'}</td>
                          <td className="px-3 py-2 text-right">
                            {isHabitable ? (
                              <input
                                type="number"
                                step="100"
                                placeholder="e.g. 50000"
                                className="w-28 text-right text-xs bg-slate-50 border border-slate-200 rounded px-2 py-1 font-mono font-bold text-slate-800 focus:outline-none focus:border-[#E05A1E]"
                                value={fl.rate_per_sqm || ''}
                                onChange={(e) => onUpdateFloor(fl.id, { rate_per_sqm: e.target.value })}
                                disabled={!isPrivileged}
                              />
                            ) : (
                              <span className="text-slate-400 font-mono">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right font-mono font-bold text-[#E05A1E]">
                            {isHabitable ? formatINR(realization) : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-slate-50 font-bold border-t text-xs">
                    <tr>
                      <td className="px-3 py-2">Total Expected Receipts</td>
                      <td className="px-3 py-2 text-right font-mono">{(areaMetrics.totalBuiltupForSaleSqm || 0).toFixed(2)} {unitLabel}</td>
                      <td className="px-2 py-2 text-center">{areaMetrics.totalUnitsCount || 0}</td>
                      <td className="px-3 py-2 text-right text-slate-400">—</td>
                      <td className="px-3 py-2 text-right font-mono text-emerald-700 font-black">
                        {formatINR(financialMetrics.totalReceipts || 0)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Group 5: Financing & Project Assumptions */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-soft-sm">
          <button
            type="button"
            onClick={() => toggleSection('financing')}
            className="w-full px-4 py-2.5 bg-slate-50 hover:bg-slate-100/70 flex items-center justify-between text-left transition-colors"
          >
            <span className="text-xs font-bold text-slate-800">5. Financing, Rent Compensation & Project Duration</span>
            {openSections.financing ? <ChevronDown size={14} className="text-slate-500" /> : <ChevronRight size={14} className="text-slate-500" />}
          </button>
          {openSections.financing && (
            <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-700">Project Period (Months)</label>
                <input
                  type="text"
                  placeholder="e.g. 18 Months"
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-slate-800 focus:outline-none focus:border-[#E05A1E]"
                  value={financial.period_months || ''}
                  onChange={(e) => onUpdateFinancial({ period_months: e.target.value })}
                  disabled={!isPrivileged}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-700">Rent Tenements</label>
                <input
                  type="number"
                  placeholder="0"
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-slate-800 focus:outline-none focus:border-[#E05A1E]"
                  value={financial.rent_tenements ?? ''}
                  onChange={(e) => onUpdateFinancial({ rent_tenements: e.target.value })}
                  disabled={!isPrivileged}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-700">Rent / Tenement / Month (₹)</label>
                <input
                  type="number"
                  placeholder="0"
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-slate-800 focus:outline-none focus:border-[#E05A1E]"
                  value={financial.rent_per_tenement_per_month ?? ''}
                  onChange={(e) => onUpdateFinancial({ rent_per_tenement_per_month: e.target.value })}
                  disabled={!isPrivileged}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ========================================================
          CATEGORY C: CONDITIONAL INPUTS
          ======================================================== */}
      {(hasBasement || hasStackedParking || openSections.conditional) && (
        <div className="bg-amber-50/40 p-4 rounded-xl border border-amber-200 space-y-3">
          <h4 className="text-xs font-bold text-amber-950 uppercase tracking-wider flex items-center gap-1.5">
            <Sliders size={14} className="text-amber-700" />
            Category C — Conditional Project Feature Expenses
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            {hasBasement && (
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-700">Basement Rate (₹/sq m)</label>
                <input
                  type="number"
                  placeholder="e.g. 5500"
                  className="w-full text-xs bg-white border border-amber-300 rounded-lg px-3 py-1.5 text-slate-800 focus:outline-none focus:border-[#E05A1E]"
                  value={financial.basement_rate_per_sqm ?? ''}
                  onChange={(e) => onUpdateFinancial({ basement_rate_per_sqm: e.target.value })}
                  disabled={!isPrivileged}
                />
              </div>
            )}
            {hasStackedParking && (
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-700">Stacked Parking Cost / Slot (₹)</label>
                <input
                  type="number"
                  placeholder="e.g. 250000"
                  className="w-full text-xs bg-white border border-amber-300 rounded-lg px-3 py-1.5 text-slate-800 focus:outline-none focus:border-[#E05A1E]"
                  value={financial.stacked_parking_cost_per_slot ?? ''}
                  onChange={(e) => onUpdateFinancial({ stacked_parking_cost_per_slot: e.target.value })}
                  disabled={!isPrivileged}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================
          STATUTORY CHARGES TABLE (12 Charges, Amalgamation Excluded)
          ======================================================== */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
            <Layers size={14} className="text-[#E05A1E]" />
            Statutory Charges (Section A — NMC Demand)
          </h4>
          <span className="text-[10px] text-muted">
            Individual RR %, caps & toggles preserved | Total Demand: {formatINR(financialMetrics.totalStatutoryDemandA || 0)}
          </span>
        </div>

        <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white shadow-soft-sm">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 border-b text-[10px] uppercase font-bold text-slate-600">
              <tr>
                <th className="px-3 py-2 w-8">Active</th>
                <th className="px-3 py-2">Statutory Item</th>
                <th className="px-3 py-2 text-right">RR %</th>
                <th className="px-3 py-2 text-right">Calculated (₹)</th>
                <th className="px-3 py-2 text-right">Effective (₹)</th>
                <th className="px-3 py-2 text-center w-24">Override</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {statutoryCharges
                .filter(sc => sc.charge_code !== 'AMALGAMATION')
                .map((sc) => {
                  const isEnabled = sc.is_enabled !== false;
                  const hasOverride = Boolean(sc.has_override);
                  const hasDrift = Boolean(sc.has_basis_drift);
                  const calculatedAmt = parseFloat(sc.calculated_amount) || 0;
                  const effectiveAmt = parseFloat(sc.effective_amount) || 0;
                  const overrideKey = `statutory_${sc.charge_code}`;

                  return (
                    <tr key={sc.id || sc.charge_code} className={`hover:bg-slate-50 ${!isEnabled ? 'opacity-50 bg-slate-50/50' : ''}`}>
                      <td className="px-3 py-2">
                        {isPrivileged && (
                          <button
                            type="button"
                            onClick={() => onUpdateStatutoryCharge(sc.id, { is_enabled: !isEnabled })}
                            className="text-slate-600 hover:text-[#E05A1E]"
                          >
                            {isEnabled ? <CheckSquare size={14} className="text-[#E05A1E]" /> : <Square size={14} />}
                          </button>
                        )}
                      </td>
                      <td className="px-3 py-2 font-bold text-slate-800">{sc.charge_name}</td>
                      <td className="px-3 py-2 text-right font-mono text-slate-600">
                        {sc.rr_percentage !== null && sc.rr_percentage !== undefined ? `${sc.rr_percentage}%` : '—'}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-slate-600">
                        {formatINR(calculatedAmt)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-bold text-slate-900">
                        {isEnabled ? formatINR(effectiveAmt) : '₹0.00'}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {isPrivileged && (
                          <div className="flex items-center justify-center gap-1">
                            {hasOverride ? (
                              <button
                                type="button"
                                onClick={() => handleOpenOverride(overrideKey, calculatedAmt)}
                                className={`text-[10px] px-1.5 py-0.5 rounded font-bold flex items-center gap-0.5 ${hasDrift ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'bg-orange-100 text-[#E05A1E]'}`}
                                title={hasDrift ? 'Calculation basis has changed! Click to review.' : 'Override active'}
                              >
                                {hasDrift && <AlertCircle size={10} />} Overridden
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleOpenOverride(overrideKey, calculatedAmt)}
                                className="text-[10px] text-slate-400 hover:text-[#E05A1E] underline"
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
      </div>

      {/* Controlled Override Modal Dialog */}
      {activeOverrideKey && (
        <div className="p-4 bg-amber-50 rounded-xl border border-amber-300 space-y-3">
          <h5 className="text-xs font-bold text-amber-950 uppercase tracking-wider flex items-center gap-1.5">
            <Sliders size={14} className="text-amber-700" />
            Set Controlled Manual Override for {activeOverrideKey}
          </h5>
          <p className="text-[11px] text-amber-900">
            Calculated value is <strong className="font-mono">{formatINR(overrideBasisVal || 0)}</strong>. Entering an override preserves the original calculation and tracks editor history.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-slate-700">Override Amount (₹)</label>
              <input
                type="number"
                step="0.01"
                placeholder={overrideBasisVal ? String(overrideBasisVal) : ''}
                className="w-full text-xs bg-white border border-amber-300 rounded-lg px-3 py-1.5 font-bold font-mono text-slate-900 focus:outline-none focus:border-[#E05A1E]"
                value={overrideValInput}
                onChange={(e) => setOverrideValInput(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-slate-700">Reason / Approved Demand Note</label>
              <input
                type="text"
                placeholder="e.g. Official NMC demand note received"
                className="w-full text-xs bg-white border border-amber-300 rounded-lg px-3 py-1.5 text-slate-800 focus:outline-none focus:border-[#E05A1E]"
                value={overrideReasonInput}
                onChange={(e) => setOverrideReasonInput(e.target.value)}
              />
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setActiveOverrideKey(null)}
              className="text-xs px-3 py-1 text-slate-600 hover:text-slate-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveOverrideModal}
              className="btn-primary text-xs py-1 px-3"
            >
              Save Override
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
