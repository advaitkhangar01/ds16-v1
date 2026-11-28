// client/src/components/projects/feasibility/FinancialViabilityForm.jsx
// Authentic Excel-structured Financial Viability sheet matching Sample Financial Viability Asolkar Sir.xlsx:
//   Area Overview Strip | Cost A/B & RR | Section A (Statutory + NMC Demand) | Section B (Cost of TDR)
//   | Section C (Additional Expenses) | Development Costs (H, D, Infra, Interest, E, F, G)
//   | Receipts (Period Required & Salable Units Cost) | Project Viability

import React, { useState } from 'react';
import {
  Sliders,
  RotateCcw,
  Plus,
  Pencil,
  Trash2,
  X,
  Check
} from 'lucide-react';
import { formatArea, formatNum, formatINR } from '../../../utils/feasibilityCalculations';

/**
 * Smooth numeric input preserving cursor focus during typing.
 */
function NumInput({
  value,
  decimals = 2,
  isInt = false,
  disabled = false,
  placeholder = '0',
  max = undefined,
  className = '',
  onChangeNum
}) {
  const [focused, setFocused] = useState(false);
  const [text, setText] = useState('');

  const formattedOutside =
    value === null || value === undefined || value === ''
      ? ''
      : isInt
        ? String(parseInt(value, 10) || 0)
        : Number(value).toFixed(decimals);

  return (
    <input
      type="number"
      step={isInt ? '1' : 'any'}
      min="0"
      max={max}
      disabled={disabled}
      placeholder={placeholder}
      value={focused ? text : formattedOutside}
      onFocus={() => {
        setFocused(true);
        setText(formattedOutside);
      }}
      onChange={(e) => {
        const raw = e.target.value;
        setText(raw);
        if (raw === '') {
          onChangeNum(0);
        } else {
          const parsed = isInt ? parseInt(raw, 10) : parseFloat(raw);
          if (Number.isFinite(parsed) && parsed >= 0) {
            onChangeNum(parsed);
          }
        }
      }}
      onBlur={() => setFocused(false)}
      className={className}
    />
  );
}

const EMPTY_UNIT_FORM = {
  unit_name: '',
  building_use: 'Residential',
  carpet_area_sqft: '',
  loading_mode: 'fixed_sqft',
  super_buildup_loading_sqft: '0',
  loading_pct: '0',
  unit_count: '1',
  landowner_unit_count: '0',
  rate_per_sqft: '0'
};

function OverrideControl({ overKey, title, currVal, calcVal, hasOverride, canEdit, onOpenOverride, onResetOverride }) {
  if (!canEdit) return <span className="text-[10px] text-slate-400">—</span>;
  return (
    <div className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => onOpenOverride(overKey, title, currVal, calcVal)}
        className={`px-2 py-0.5 rounded text-[10px] font-semibold border transition flex items-center gap-1 ${
          hasOverride
            ? 'bg-amber-100 text-amber-900 border-amber-300 hover:bg-amber-200'
            : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
        }`}
      >
        <Sliders className="w-2.5 h-2.5" />
        <span>{hasOverride ? 'Overridden' : 'Override'}</span>
      </button>
      {hasOverride && (
        <button
          type="button"
          title="Reset to calculated formula"
          onClick={() => onResetOverride(overKey)}
          className="text-rose-600 hover:text-rose-800"
        >
          <RotateCcw className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

export default function FinancialViabilityForm({
  statement = {},
  financial = {},
  statutoryCharges = [],
  salableUnits = [],
  areaMetrics = {},
  financialMetrics = {},
  unitDisplay = 'sq_m',
  canEdit = false,
  onUpdateFinancial,
  onUpdateStatutoryCharge,
  onOpenOverride,
  onResetOverride,
  onAddSalableUnit,
  onEditSalableUnit,
  onDeleteSalableUnit
}) {
  const [unitFormOpen, setUnitFormOpen] = useState(false);
  const [editingUnitId, setEditingUnitId] = useState(null);
  const [unitForm, setUnitForm] = useState(EMPTY_UNIT_FORM);
  const [unitSaving, setUnitSaving] = useState(false);

  const unitShort = unitDisplay === 'sq_ft' ? 'Sq. Ft.' : 'Sq. Mtr.';
  const effPlineSqm = Number(
    areaMetrics.totalProposedPlineSqm > 0
      ? areaMetrics.totalProposedPlineSqm
      : (areaMetrics.effectiveProposedPlineSqm ?? areaMetrics.calculatedProposedPlineSqm ?? 0)
  );

  const visibleStat = (financialMetrics.evaluatedStatutoryCharges || statutoryCharges || []).filter(
    (s) => !s.is_deleted && s.charge_code !== 'AMALGAMATION'
  );

  const evaluatedUnits = financialMetrics.evaluatedSalableUnits || salableUnits || [];

  const tdrDet = financialMetrics.costOfTdrB_details || {};
  const plotDet = financialMetrics.costOfPlotH_details || {};
  const constDet = financialMetrics.costOfConstructionD_details || {};
  const baseDet = financialMetrics.costOfBasementE_details || {};
  const rentDet = financialMetrics.rentCostF_details || {};
  const stackDet = financialMetrics.stackedParkingCostG_details || {};

  const isPlotIncluded = financialMetrics.isCostOfPlotIncluded !== false;
  const savedPlotRaw = Number(plotDet.raw_amount ?? financial.cost_of_plot ?? 0);

  const inlineInputCls =
    'w-28 px-2 py-1 text-right text-xs bg-white border border-slate-300 rounded focus:ring-2 focus:ring-slate-900 font-mono disabled:bg-slate-100 disabled:text-slate-500';
  const smallNumCls =
    'w-20 px-1.5 py-1 text-right text-xs bg-white border border-slate-300 rounded focus:ring-2 focus:ring-slate-900 font-mono disabled:bg-slate-100';

  // Open Salable Unit Add / Edit drawer
  const openAddUnit = () => {
    setEditingUnitId(null);
    setUnitForm({
      ...EMPTY_UNIT_FORM,
      building_use: statement.building_use === 'Commercial' ? 'Commercial' : 'Residential'
    });
    setUnitFormOpen(true);
  };

  const openEditUnit = (u) => {
    setEditingUnitId(u.id);
    setUnitForm({
      unit_name: u.unit_name || '',
      building_use: u.building_use || 'Residential',
      carpet_area_sqft: String(Number(u.carpet_area_sqft ?? 0)),
      loading_mode: u.loading_mode === 'percentage' ? 'percentage' : 'fixed_sqft',
      super_buildup_loading_sqft: String(Number(u.super_buildup_loading_sqft ?? 0)),
      loading_pct: String(Number(u.loading_pct ?? 0)),
      unit_count: String(parseInt(u.unit_count, 10) || 0),
      landowner_unit_count: String(parseInt(u.landowner_unit_count, 10) || 0),
      rate_per_sqft: String(Number(u.rate_per_sqft ?? 0))
    });
    setUnitFormOpen(true);
  };

  const submitUnitForm = async (e) => {
    e.preventDefault();
    setUnitSaving(true);
    const payload = {
      unit_name: unitForm.unit_name.trim() || 'Salable Unit',
      building_use: unitForm.building_use,
      carpet_area_sqft: parseFloat(unitForm.carpet_area_sqft) || 0,
      loading_mode: unitForm.loading_mode,
      super_buildup_loading_sqft: parseFloat(unitForm.super_buildup_loading_sqft) || 0,
      loading_pct: parseFloat(unitForm.loading_pct) || 0,
      unit_count: Math.max(0, parseInt(unitForm.unit_count, 10) || 0),
      landowner_unit_count: Math.max(0, parseInt(unitForm.landowner_unit_count, 10) || 0),
      rate_per_sqft: Math.max(0, parseFloat(unitForm.rate_per_sqft) || 0)
    };
    const ok = editingUnitId
      ? await onEditSalableUnit(editingUnitId, payload)
      : await onAddSalableUnit(payload);
    setUnitSaving(false);
    if (ok) {
      setUnitFormOpen(false);
      setEditingUnitId(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* 1. Top Area Overview Strip (Read-Only synced from Area Statement) */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="bg-slate-900 text-white px-4 py-2 flex items-center justify-between">
          <h3 className="text-xs font-bold tracking-wide uppercase">
            Area Overview Strip ({unitShort}) — Synced from Area Statement
          </h3>
          <span className="text-[11px] text-slate-300">
            Statutory &amp; RR Rate basis: Sq. Mtr. (Effective P-Line: {formatNum(effPlineSqm, 2)} m²)
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px] border-collapse font-mono">
            <thead>
              <tr className="bg-slate-100 text-slate-700 border-b border-slate-300 font-sans">
                <th className="py-1.5 px-2.5 text-left border-r border-slate-200">Tier</th>
                <th className="py-1.5 px-2 text-right border-r border-slate-200">PLOT AREA</th>
                <th className="py-1.5 px-2 text-right border-r border-slate-200">BASIC FSI</th>
                <th className="py-1.5 px-2 text-right border-r border-slate-200">PAID FSI</th>
                <th className="py-1.5 px-2 text-right border-r border-slate-200">TDR</th>
                <th className="py-1.5 px-2 text-right border-r border-slate-200">PRIMARY BUILTUP</th>
                <th className="py-1.5 px-2 text-right border-r border-slate-200">COMM. ANC (80%)</th>
                <th className="py-1.5 px-2 text-right border-r border-slate-200">RES. ANC (60%)</th>
                <th className="py-1.5 px-2.5 text-right">TOTAL P-LINE</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              <tr className="bg-slate-50 text-slate-600">
                <td className="py-1 px-2.5 font-sans font-semibold border-r border-slate-200">Factors</td>
                <td className="py-1 px-2 text-right border-r border-slate-200">{formatArea(areaMetrics.plotableAreaSqm, unitDisplay, 2)}</td>
                <td className="py-1 px-2 text-right border-r border-slate-200">{formatNum(statement.basic_fsi_factor ?? 1.1, 2)}</td>
                <td className="py-1 px-2 text-right border-r border-slate-200">{formatNum(areaMetrics.effectiveProposedPaidFsiFactor, 3)}</td>
                <td className="py-1 px-2 text-right border-r border-slate-200">{formatNum(areaMetrics.totalProposedTdrFactor, 3)}</td>
                <td className="py-1 px-2 text-right border-r border-slate-200">{formatNum(areaMetrics.proposedTotalFsi, 3)}</td>
                <td className="py-1 px-2 text-right border-r border-slate-200">{formatNum(areaMetrics.commAncillaryPct ?? 0.8, 2)}</td>
                <td className="py-1 px-2 text-right border-r border-slate-200">{formatNum(areaMetrics.resAncillaryPct ?? 0.6, 2)}</td>
                <td className="py-1 px-2.5 text-right text-slate-400">—</td>
              </tr>
              <tr>
                <td className="py-1.5 px-2.5 font-sans font-semibold text-slate-700 border-r border-slate-200">PERMISSIBLE</td>
                <td className="py-1.5 px-2 text-right border-r border-slate-200">{formatArea(areaMetrics.plotableAreaSqm, unitDisplay, 2)}</td>
                <td className="py-1.5 px-2 text-right border-r border-slate-200">{formatArea(areaMetrics.permissibleFsiSqm, unitDisplay, 2)}</td>
                <td className="py-1.5 px-2 text-right border-r border-slate-200">{formatArea(areaMetrics.permissiblePaidFsiSqm, unitDisplay, 2)}</td>
                <td className="py-1.5 px-2 text-right border-r border-slate-200">{formatArea(areaMetrics.permissibleTdrSqm, unitDisplay, 2)}</td>
                <td className="py-1.5 px-2 text-right border-r border-slate-200">{formatArea(areaMetrics.permissibleTotalBuiltupSqm, unitDisplay, 2)}</td>
                <td className="py-1.5 px-2 text-right border-r border-slate-200">{formatArea(areaMetrics.permissibleCommercialAncillarySqm, unitDisplay, 2)}</td>
                <td className="py-1.5 px-2 text-right border-r border-slate-200">{formatArea(areaMetrics.permissibleResidentialAncillarySqm, unitDisplay, 2)}</td>
                <td className="py-1.5 px-2.5 text-right font-semibold">{formatArea(areaMetrics.permissiblePlineTotalSqm, unitDisplay, 2)}</td>
              </tr>
              <tr className="bg-amber-50/60 font-bold text-slate-900">
                <td className="py-1.5 px-2.5 font-sans border-r border-slate-200">PROPOSED</td>
                <td className="py-1.5 px-2 text-right border-r border-slate-200">{formatArea(areaMetrics.plotableAreaSqm, unitDisplay, 2)}</td>
                <td className="py-1.5 px-2 text-right border-r border-slate-200">{formatArea(areaMetrics.proposedBasicFsiSqm, unitDisplay, 2)}</td>
                <td className="py-1.5 px-2 text-right border-r border-slate-200">{formatArea(areaMetrics.proposedPaidFsiSqm, unitDisplay, 2)}</td>
                <td className="py-1.5 px-2 text-right border-r border-slate-200">{formatArea(areaMetrics.proposedTdrSqm, unitDisplay, 2)}</td>
                <td className="py-1.5 px-2 text-right border-r border-slate-200">{formatArea(areaMetrics.proposedTotalBuiltupSqm, unitDisplay, 2)}</td>
                <td className="py-1.5 px-2 text-right border-r border-slate-200">{formatArea(areaMetrics.table1ProposedCommAncSqm ?? areaMetrics.proposedCommercialAncillarySqm, unitDisplay, 2)}</td>
                <td className="py-1.5 px-2 text-right border-r border-slate-200">{formatArea(areaMetrics.table1ProposedResAncSqm ?? areaMetrics.proposedResidentialAncillarySqm, unitDisplay, 2)}</td>
                <td className="py-1.5 px-2.5 text-right text-emerald-900">{formatArea(effPlineSqm, unitDisplay, 2)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* 2. Cost Norms & Ready Reckoner Rate */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="bg-slate-100 border-b border-slate-200 px-4 py-2 text-xs font-bold text-slate-800 uppercase tracking-wide">
          Cost Norms &amp; Ready Reckoner Rate (₹ / Sq. Mtr.)
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <tbody className="divide-y divide-slate-200">
              <tr>
                <td className="py-2 px-4 font-semibold text-slate-800 w-72 border-r border-slate-200">ESTIMATED COST-A</td>
                <td className="py-2 px-3 border-r border-slate-200 w-44">
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-400">₹</span>
                    <NumInput
                      disabled={!canEdit}
                      value={financial.estimated_cost_a_rate}
                      className={inlineInputCls}
                      onChangeNum={(v) => onUpdateFinancial({ estimated_cost_a_rate: v })}
                    />
                    <span className="text-[10px] text-slate-500">/ m²</span>
                  </div>
                </td>
                <td className="py-2 px-3 text-right font-mono text-slate-600 border-r border-slate-200 w-40">
                  × {formatNum(effPlineSqm, 2)} m²
                </td>
                <td className="py-2 px-4 text-right font-mono font-bold text-slate-900">
                  {formatINR(financialMetrics.estimatedCostA)}
                </td>
              </tr>
              <tr>
                <td className="py-2 px-4 font-semibold text-slate-800 border-r border-slate-200">ESTIMATED COST-B</td>
                <td className="py-2 px-3 border-r border-slate-200">
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-400">₹</span>
                    <NumInput
                      disabled={!canEdit}
                      value={financial.estimated_cost_b_rate}
                      className={inlineInputCls}
                      onChangeNum={(v) => onUpdateFinancial({ estimated_cost_b_rate: v })}
                    />
                    <span className="text-[10px] text-slate-500">/ m²</span>
                  </div>
                </td>
                <td className="py-2 px-3 text-right font-mono text-slate-600 border-r border-slate-200">
                  × {formatNum(effPlineSqm, 2)} m²
                </td>
                <td className="py-2 px-4 text-right font-mono font-bold text-slate-900">
                  {formatINR(financialMetrics.estimatedCostB)}
                </td>
              </tr>
              <tr className="bg-slate-50">
                <td className="py-2 px-4 font-bold text-slate-900 border-r border-slate-200">RR RATES RS</td>
                <td className="py-2 px-3 border-r border-slate-200">
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-400">₹</span>
                    <NumInput
                      disabled={!canEdit}
                      value={financial.rr_rate_per_sqm}
                      className={inlineInputCls}
                      onChangeNum={(v) => onUpdateFinancial({ rr_rate_per_sqm: v })}
                    />
                    <span className="text-[10px] text-slate-500">/ m²</span>
                  </div>
                </td>
                <td colSpan={2} className="py-2 px-4 text-[11px] text-slate-500">
                  Ready Reckoner base rate used by statutory charges and TDR purchase cost
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* 3. Section A: Statutory Charges & NMC Demand */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="bg-slate-900 text-white px-4 py-2 flex items-center justify-between">
          <h3 className="text-xs font-bold tracking-wide uppercase">
            Section A — Statutory Charges &amp; NMC Demand (Amalgamation Excluded)
          </h3>
          <span className="text-xs font-mono font-bold text-emerald-300">
            Total A: {formatINR(financialMetrics.totalStatutoryDemandA)}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100 text-slate-700 border-b border-slate-300 text-[11px]">
                <th className="py-2 px-2 text-center border-r border-slate-200 w-10">Inc</th>
                <th className="py-2 px-2 text-center border-r border-slate-200 w-10">Sr.</th>
                <th className="py-2 px-3 text-left border-r border-slate-200">Particulars</th>
                <th className="py-2 px-3 text-right border-r border-slate-200 w-28">RR % / Input</th>
                <th className="py-2 px-3 text-right border-r border-slate-200 w-36">Calculated (₹)</th>
                <th className="py-2 px-3 text-right border-r border-slate-200 w-36">Final Amount (₹)</th>
                <th className="py-2 px-3 text-center w-28">Override</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {visibleStat.map((sc, idx) => {
                const isEnabled = sc.is_enabled !== false;
                const isManualParking = sc.charge_code === 'LABOUR_WELFARE_PARKING';
                const isPctRr = sc.calculation_basis === 'pct_of_rr';

                return (
                  <tr key={sc.id || sc.charge_code} className={!isEnabled ? 'bg-slate-50 text-slate-400' : 'bg-white'}>
                    <td className="py-1.5 px-2 text-center border-r border-slate-200">
                      <input
                        type="checkbox"
                        disabled={!canEdit}
                        checked={isEnabled}
                        onChange={(e) => onUpdateStatutoryCharge(sc.id, { is_enabled: e.target.checked })}
                        className="rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                      />
                    </td>
                    <td className="py-1.5 px-2 text-center border-r border-slate-200 font-mono">{idx + 1}</td>
                    <td className="py-1.5 px-3 border-r border-slate-200">
                      <div className="font-medium text-slate-800">{sc.charge_name}</div>
                      {isManualParking && (
                        <span className="text-[10px] text-indigo-700 font-medium">Direct Manual Admin Input (FR-28)</span>
                      )}
                    </td>
                    <td className="py-1.5 px-3 text-right border-r border-slate-200">
                      {isPctRr ? (
                        <div className="inline-flex items-center gap-1">
                          <NumInput
                            decimals={2}
                            disabled={!canEdit || !isEnabled}
                            value={sc.rr_percentage ?? 0}
                            className="w-16 px-1.5 py-0.5 text-right text-xs bg-white border border-slate-300 rounded font-mono"
                            onChangeNum={(v) => onUpdateStatutoryCharge(sc.id, { rr_percentage: v })}
                          />
                          <span className="text-[10px] text-slate-500">%</span>
                        </div>
                      ) : isManualParking || sc.is_custom ? (
                        <NumInput
                          decimals={2}
                          disabled={!canEdit || !isEnabled}
                          value={sc.amount ?? 0}
                          className="w-24 px-1.5 py-0.5 text-right text-xs bg-white border border-slate-300 rounded font-mono"
                          onChangeNum={(v) => onUpdateStatutoryCharge(sc.id, { amount: v })}
                        />
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-1.5 px-3 text-right font-mono border-r border-slate-200">
                      {sc.calculated_amount !== null && sc.calculated_amount !== undefined
                        ? formatINR(sc.calculated_amount)
                        : <span className="text-[11px] font-sans text-slate-400">Manual</span>}
                    </td>
                    <td className="py-1.5 px-3 text-right font-mono font-semibold border-r border-slate-200 text-slate-900">
                      {formatINR(isEnabled ? sc.effective_amount : 0)}
                    </td>
                    <td className="py-1.5 px-3 text-center">
                      {isManualParking ? (
                        <span className="text-[10px] text-slate-400 font-medium">Manual</span>
                      ) : (
                        <OverrideControl
                          overKey={`statutory_${sc.charge_code}`}
                          title={sc.charge_name}
                          currVal={sc.effective_amount}
                          calcVal={sc.calculated_amount ?? sc.amount ?? 0}
                          hasOverride={sc.has_override}
                          canEdit={canEdit}
                          onOpenOverride={onOpenOverride}
                          onResetOverride={onResetOverride}
                        />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-slate-100 font-bold border-t-2 border-slate-400 text-slate-900">
                <td colSpan={5} className="py-2 px-4 text-right uppercase border-r border-slate-200">
                  NMC / DEMAND RS (TOTAL SECTION A)
                </td>
                <td className="py-2 px-3 text-right font-mono border-r border-slate-200">
                  {formatINR(financialMetrics.totalStatutoryDemandA)}
                </td>
                <td className="py-2 px-3 text-center font-mono text-xs">A</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* 4. Section B (Cost of TDR) + Section C (Additional Expenses) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Section B: TDR Purchase Cost */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
          <div className="bg-slate-800 text-white px-4 py-2 flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wide">Section B — Cost of TDR</h3>
            <span className="text-xs font-mono font-bold text-amber-300">B: {formatINR(financialMetrics.costOfTdrB)}</span>
          </div>
          <div className="p-4 space-y-3 flex-1">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                <div className="text-[10px] text-slate-500 uppercase font-semibold">Consumed TDR Area</div>
                <div className="font-mono font-bold text-slate-900 text-sm mt-0.5">
                  {formatNum(areaMetrics.proposedTdrSqm, 3)} m²
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  Reg: {formatNum(areaMetrics.regularTdrSqm, 2)} | Slum: {formatNum(areaMetrics.slumTdrSqm, 2)}
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  TDR Purchase Factor (% of RR Rate)
                </label>
                <div className="flex items-center gap-1.5">
                  <NumInput
                    decimals={2}
                    disabled={!canEdit}
                    value={Number(financial.tdr_purchase_factor ?? 0.55) * 100}
                    className={inlineInputCls}
                    onChangeNum={(pct) => onUpdateFinancial({ tdr_purchase_factor: Math.round((pct / 100) * 10000) / 10000 })}
                  />
                  <span className="text-xs text-slate-600 font-semibold">%</span>
                </div>
                <div className="text-[10px] text-slate-500 mt-1">
                  Default: 55% of RR ({formatINR(Number(financial.tdr_purchase_factor ?? 0.55) * Number(financial.rr_rate_per_sqm || 0))}/m²)
                </div>
              </div>
            </div>

            <div className="border-t border-slate-200 pt-3 flex items-center justify-between text-xs">
              <div>
                <div className="text-slate-600">
                  Calculated: <span className="font-mono font-semibold">{formatINR(tdrDet.calculated)}</span>
                </div>
                <div className="text-slate-900 font-bold text-sm mt-0.5">
                  Final Cost B: <span className="font-mono">{formatINR(financialMetrics.costOfTdrB)}</span>
                </div>
              </div>
              <OverrideControl
                overKey="cost_of_tdr"
                title="Cost of TDR (Section B)"
                currVal={financialMetrics.costOfTdrB}
                calcVal={tdrDet.calculated}
                hasOverride={tdrDet.has_override}
                canEdit={canEdit}
                onOpenOverride={onOpenOverride}
                onResetOverride={onResetOverride}
              />
            </div>
          </div>
        </div>

        {/* Section C: Additional Project Expenses */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="bg-slate-800 text-white px-4 py-2 flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wide">Section C — Additional Expenses</h3>
            <span className="text-xs font-mono font-bold text-emerald-300">C: {formatINR(financialMetrics.totalExpensesC)}</span>
          </div>
          <div className="divide-y divide-slate-200 text-xs">
            {[
              ['minor_expenses', '1. Minor Expenses'],
              ['bpms_staff_charges', '2. BPMS — Staff Charges'],
              ['airport_noc', '3. Airport NOC'],
              ['fire_noc', '4. Fire NOC'],
              ['entertainment_charges', '5. Entertainment Charges'],
              ['advocate_fees', '6. Consultants / Advocate Fees'],
              ['extra_stamp_duty', '7. Extra Stamp Duty on Potential']
            ].map(([fieldKey, label]) => (
              <div key={fieldKey} className="px-4 py-1.5 flex items-center justify-between gap-2">
                <span className="text-slate-700 font-medium">{label}</span>
                <div className="flex items-center gap-1">
                  <span className="text-slate-400">₹</span>
                  <NumInput
                    decimals={2}
                    disabled={!canEdit}
                    value={financial[fieldKey] ?? 0}
                    className={inlineInputCls}
                    onChangeNum={(v) => onUpdateFinancial({ [fieldKey]: v })}
                  />
                </div>
              </div>
            ))}
            <div className="px-4 py-2 bg-slate-100 flex items-center justify-between font-bold text-slate-900">
              <span>TOTAL ADDITIONAL EXPENSES (C)</span>
              <span className="font-mono">{formatINR(financialMetrics.totalExpensesC)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 5. Project Development Costs (H, D, Infra, Interest, E, F, G) */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="bg-slate-900 text-white px-4 py-2 flex items-center justify-between">
          <h3 className="text-xs font-bold tracking-wide uppercase">
            Project Development Costs (Sections H, D, Infrastructure, Interest, E, F, G)
          </h3>
          <span className="text-xs font-mono font-bold text-amber-300">
            Total Cost: {formatINR(financialMetrics.totalProjectCost)}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100 text-slate-700 border-b border-slate-300 text-[11px]">
                <th className="py-2 px-2.5 text-center border-r border-slate-200 w-12">Code</th>
                <th className="py-2 px-3 text-left border-r border-slate-200">Component</th>
                <th className="py-2 px-3 text-left border-r border-slate-200">Basis / Rate Inputs</th>
                <th className="py-2 px-3 text-right border-r border-slate-200 w-36">Calculated (₹)</th>
                <th className="py-2 px-3 text-right border-r border-slate-200 w-36">Final Cost (₹)</th>
                <th className="py-2 px-3 text-center w-28">Override</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {/* Cost of Plot H */}
              <tr className={isPlotIncluded ? 'bg-white' : 'bg-amber-50/40'}>
                <td className="py-2 px-2.5 text-center font-mono font-bold border-r border-slate-200">H</td>
                <td className="py-2 px-3 border-r border-slate-200">
                  <div className="font-semibold text-slate-800">COST OF PLOT</div>
                  <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-600 mt-1 cursor-pointer">
                    <input
                      type="checkbox"
                      disabled={!canEdit}
                      checked={isPlotIncluded}
                      onChange={(e) => onUpdateFinancial({ is_cost_of_plot_included: e.target.checked }, true)}
                      className="rounded border-slate-300 text-slate-900"
                    />
                    <span>Include in Total Project Cost</span>
                  </label>
                </td>
                <td className="py-2 px-3 border-r border-slate-200">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-slate-500">Lump-sum ₹</span>
                    <NumInput
                      decimals={2}
                      disabled={!canEdit}
                      value={financial.cost_of_plot ?? 0}
                      className={inlineInputCls}
                      onChangeNum={(v) => onUpdateFinancial({ cost_of_plot: v })}
                    />
                  </div>
                  {!isPlotIncluded && (
                    <div className="text-[10px] text-amber-800 mt-0.5">
                      Excluded from project total (Saved: {formatINR(savedPlotRaw)})
                    </div>
                  )}
                </td>
                <td className="py-2 px-3 text-right font-mono border-r border-slate-200">
                  {formatINR(savedPlotRaw)}
                </td>
                <td className="py-2 px-3 text-right font-mono font-bold border-r border-slate-200">
                  {formatINR(financialMetrics.costOfPlotH)}
                </td>
                <td className="py-2 px-3 text-center text-[10px] text-slate-400">Toggleable</td>
              </tr>

              {/* Civil Construction D */}
              <tr>
                <td className="py-2 px-2.5 text-center font-mono font-bold border-r border-slate-200">D</td>
                <td className="py-2 px-3 font-semibold text-slate-800 border-r border-slate-200">
                  COST OF CONSTRUCTION
                </td>
                <td className="py-2 px-3 border-r border-slate-200">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-mono text-slate-600">{formatNum(effPlineSqm, 2)} m² × ₹</span>
                    <NumInput
                      decimals={2}
                      disabled={!canEdit}
                      value={financial.cost_of_construction_rate ?? 0}
                      className={inlineInputCls}
                      onChangeNum={(v) => onUpdateFinancial({ cost_of_construction_rate: v })}
                    />
                    <span className="text-[10px] text-slate-500">/ m²</span>
                  </div>
                </td>
                <td className="py-2 px-3 text-right font-mono border-r border-slate-200">{formatINR(constDet.calculated)}</td>
                <td className="py-2 px-3 text-right font-mono font-bold border-r border-slate-200">{formatINR(financialMetrics.costOfConstructionD)}</td>
                <td className="py-2 px-3 text-center">
                  <OverrideControl
                    overKey="cost_of_construction"
                    title="Cost of Construction (Section D)"
                    currVal={financialMetrics.costOfConstructionD}
                    calcVal={constDet.calculated}
                    hasOverride={constDet.has_override}
                    canEdit={canEdit}
                    onOpenOverride={onOpenOverride}
                    onResetOverride={onResetOverride}
                  />
                </td>
              </tr>

              {/* Infrastructure */}
              <tr>
                <td className="py-2 px-2.5 text-center font-mono border-r border-slate-200">—</td>
                <td className="py-2 px-3 font-semibold text-slate-800 border-r border-slate-200">
                  COST OF INFRASTRUCTURE CONSTRUCTION
                </td>
                <td className="py-2 px-3 border-r border-slate-200">
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-400">₹</span>
                    <NumInput
                      decimals={2}
                      disabled={!canEdit}
                      value={financial.cost_of_infrastructure ?? 0}
                      className={inlineInputCls}
                      onChangeNum={(v) => onUpdateFinancial({ cost_of_infrastructure: v })}
                    />
                  </div>
                </td>
                <td className="py-2 px-3 text-right font-mono border-r border-slate-200">{formatINR(financial.cost_of_infrastructure)}</td>
                <td className="py-2 px-3 text-right font-mono font-bold border-r border-slate-200">{formatINR(financialMetrics.costOfInfrastructure)}</td>
                <td className="py-2 px-3 text-center text-[10px] text-slate-400">Direct</td>
              </tr>

              {/* Interest */}
              <tr>
                <td className="py-2 px-2.5 text-center font-mono border-r border-slate-200">—</td>
                <td className="py-2 px-3 font-semibold text-slate-800 border-r border-slate-200">INTEREST</td>
                <td className="py-2 px-3 border-r border-slate-200">
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-400">₹</span>
                    <NumInput
                      decimals={2}
                      disabled={!canEdit}
                      value={financial.interest_amount ?? 0}
                      className={inlineInputCls}
                      onChangeNum={(v) => onUpdateFinancial({ interest_amount: v })}
                    />
                  </div>
                </td>
                <td className="py-2 px-3 text-right font-mono border-r border-slate-200">{formatINR(financial.interest_amount)}</td>
                <td className="py-2 px-3 text-right font-mono font-bold border-r border-slate-200">{formatINR(financialMetrics.interestAmount)}</td>
                <td className="py-2 px-3 text-center text-[10px] text-slate-400">Direct</td>
              </tr>

              {/* Basement E */}
              <tr>
                <td className="py-2 px-2.5 text-center font-mono font-bold border-r border-slate-200">E</td>
                <td className="py-2 px-3 font-semibold text-slate-800 border-r border-slate-200">
                  COST OF BASEMENT CONSTRUCTION
                </td>
                <td className="py-2 px-3 border-r border-slate-200">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <NumInput
                      decimals={2}
                      disabled={!canEdit}
                      value={financial.basement_area_sqm ?? 0}
                      className={smallNumCls}
                      onChangeNum={(v) => onUpdateFinancial({ basement_area_sqm: v })}
                    />
                    <span className="text-[10px] text-slate-500">m² × ₹</span>
                    <NumInput
                      decimals={2}
                      disabled={!canEdit}
                      value={financial.basement_rate_per_sqm ?? 0}
                      className={inlineInputCls}
                      onChangeNum={(v) => onUpdateFinancial({ basement_rate_per_sqm: v })}
                    />
                  </div>
                </td>
                <td className="py-2 px-3 text-right font-mono border-r border-slate-200">{formatINR(baseDet.calculated)}</td>
                <td className="py-2 px-3 text-right font-mono font-bold border-r border-slate-200">{formatINR(financialMetrics.costOfBasementE)}</td>
                <td className="py-2 px-3 text-center">
                  <OverrideControl
                    overKey="cost_of_basement"
                    title="Cost of Basement Construction (Section E)"
                    currVal={financialMetrics.costOfBasementE}
                    calcVal={baseDet.calculated}
                    hasOverride={baseDet.has_override}
                    canEdit={canEdit}
                    onOpenOverride={onOpenOverride}
                    onResetOverride={onResetOverride}
                  />
                </td>
              </tr>

              {/* Rent F */}
              <tr>
                <td className="py-2 px-2.5 text-center font-mono font-bold border-r border-slate-200">F</td>
                <td className="py-2 px-3 font-semibold text-slate-800 border-r border-slate-200">RENT</td>
                <td className="py-2 px-3 border-r border-slate-200">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <NumInput
                      isInt
                      disabled={!canEdit}
                      value={financial.rent_tenements ?? 0}
                      className="w-14 px-1.5 py-1 text-right text-xs bg-white border border-slate-300 rounded font-mono"
                      onChangeNum={(v) => onUpdateFinancial({ rent_tenements: v })}
                    />
                    <span className="text-[10px] text-slate-500">ten. × ₹</span>
                    <NumInput
                      decimals={2}
                      disabled={!canEdit}
                      value={financial.rent_per_tenement_per_month ?? 0}
                      className={smallNumCls}
                      onChangeNum={(v) => onUpdateFinancial({ rent_per_tenement_per_month: v })}
                    />
                    <span className="text-[10px] text-slate-500">×</span>
                    <NumInput
                      isInt
                      disabled={!canEdit}
                      value={financial.rent_months ?? 0}
                      className="w-14 px-1.5 py-1 text-right text-xs bg-white border border-slate-300 rounded font-mono"
                      onChangeNum={(v) => onUpdateFinancial({ rent_months: v })}
                    />
                    <span className="text-[10px] text-slate-500">mo</span>
                  </div>
                </td>
                <td className="py-2 px-3 text-right font-mono border-r border-slate-200">{formatINR(rentDet.calculated)}</td>
                <td className="py-2 px-3 text-right font-mono font-bold border-r border-slate-200">{formatINR(financialMetrics.rentCostF)}</td>
                <td className="py-2 px-3 text-center">
                  <OverrideControl
                    overKey="rent_amount"
                    title="Rent (Section F)"
                    currVal={financialMetrics.rentCostF}
                    calcVal={rentDet.calculated}
                    hasOverride={rentDet.has_override}
                    canEdit={canEdit}
                    onOpenOverride={onOpenOverride}
                    onResetOverride={onResetOverride}
                  />
                </td>
              </tr>

              {/* Stacked Parking G */}
              <tr>
                <td className="py-2 px-2.5 text-center font-mono font-bold border-r border-slate-200">G</td>
                <td className="py-2 px-3 font-semibold text-slate-800 border-r border-slate-200">STACKED PARKING</td>
                <td className="py-2 px-3 border-r border-slate-200">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <NumInput
                      isInt
                      disabled={!canEdit}
                      value={financial.stacked_parking_slots ?? 0}
                      className="w-16 px-1.5 py-1 text-right text-xs bg-white border border-slate-300 rounded font-mono"
                      onChangeNum={(v) => onUpdateFinancial({ stacked_parking_slots: v })}
                    />
                    <span className="text-[10px] text-slate-500">slots × ₹</span>
                    <NumInput
                      decimals={2}
                      disabled={!canEdit}
                      value={financial.stacked_parking_cost_per_slot ?? 0}
                      className={inlineInputCls}
                      onChangeNum={(v) => onUpdateFinancial({ stacked_parking_cost_per_slot: v })}
                    />
                  </div>
                </td>
                <td className="py-2 px-3 text-right font-mono border-r border-slate-200">{formatINR(stackDet.calculated)}</td>
                <td className="py-2 px-3 text-right font-mono font-bold border-r border-slate-200">{formatINR(financialMetrics.stackedParkingCostG)}</td>
                <td className="py-2 px-3 text-center">
                  <OverrideControl
                    overKey="stacked_parking_cost"
                    title="Stacked Parking (Section G)"
                    currVal={financialMetrics.stackedParkingCostG}
                    calcVal={stackDet.calculated}
                    hasOverride={stackDet.has_override}
                    canEdit={canEdit}
                    onOpenOverride={onOpenOverride}
                    onResetOverride={onResetOverride}
                  />
                </td>
              </tr>
            </tbody>
            <tfoot>
              <tr className="bg-amber-50 font-bold border-t-2 border-slate-400 text-slate-900">
                <td colSpan={4} className="py-2.5 px-4 text-right border-r border-slate-200">
                  TOTAL PROJECT COST (A + B + C + D + E + F + G + H + Infra + Interest)
                </td>
                <td className="py-2.5 px-3 text-right font-mono text-sm border-r border-slate-200">
                  {formatINR(financialMetrics.totalProjectCost)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* 6. Receipts (1. Period Required | 2. Salable Units Cost | 3. Total) */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="bg-slate-900 text-white px-4 py-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs font-bold tracking-wide uppercase">
            Receipts (Salable Units &amp; Project Duration)
          </h3>
          {canEdit && (
            <button
              type="button"
              onClick={openAddUnit}
              className="px-2.5 py-1 text-[11px] font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded flex items-center gap-1"
            >
              <Plus className="w-3 h-3" />
              <span>Add Salable Unit Row</span>
            </button>
          )}
        </div>

        {/* Row 1: Period Required */}
        <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="font-semibold text-slate-800">1. Period Required</div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              disabled={!canEdit}
              value={financial.period_months ?? ''}
              placeholder="e.g., 21-24 Months"
              onChange={(e) => onUpdateFinancial({ period_months: e.target.value })}
              className="w-48 px-2.5 py-1 text-xs bg-white border border-slate-300 rounded font-medium focus:ring-2 focus:ring-slate-900"
            />
          </div>
        </div>

        {/* Inline Add / Edit Salable Unit Drawer */}
        {unitFormOpen && (
          <form onSubmit={submitUnitForm} className="p-4 bg-indigo-50/70 border-b border-indigo-200 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-indigo-950">
                {editingUnitId ? 'Edit Salable Unit Typology' : 'Add Salable Unit Typology'}
              </h4>
              <button type="button" onClick={() => setUnitFormOpen(false)} className="text-slate-500 hover:text-slate-800">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">Unit Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., 2 BHK Flat / Shop"
                  value={unitForm.unit_name}
                  onChange={(e) => setUnitForm((p) => ({ ...p, unit_name: e.target.value }))}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">Use Type</label>
                <select
                  value={unitForm.building_use}
                  onChange={(e) => setUnitForm((p) => ({ ...p, building_use: e.target.value }))}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs"
                >
                  <option value="Residential">Residential</option>
                  <option value="Commercial">Commercial</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">Carpet Area (Sq Ft)</label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  required
                  value={unitForm.carpet_area_sqft}
                  onChange={(e) => setUnitForm((p) => ({ ...p, carpet_area_sqft: e.target.value }))}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">Loading Mode</label>
                <div className="flex gap-1.5">
                  <select
                    value={unitForm.loading_mode}
                    onChange={(e) => setUnitForm((p) => ({ ...p, loading_mode: e.target.value }))}
                    className="w-28 px-2 py-1.5 bg-white border border-slate-300 rounded text-xs"
                  >
                    <option value="fixed_sqft">+ Sq Ft</option>
                    <option value="percentage">+ %</option>
                  </select>
                  {unitForm.loading_mode === 'percentage' ? (
                    <input
                      type="number"
                      step="any"
                      min="0"
                      placeholder="% Loading"
                      value={unitForm.loading_pct}
                      onChange={(e) => setUnitForm((p) => ({ ...p, loading_pct: e.target.value }))}
                      className="flex-1 px-2 py-1.5 bg-white border border-slate-300 rounded text-xs font-mono"
                    />
                  ) : (
                    <input
                      type="number"
                      step="any"
                      min="0"
                      placeholder="Sq Ft Loading"
                      value={unitForm.super_buildup_loading_sqft}
                      onChange={(e) => setUnitForm((p) => ({ ...p, super_buildup_loading_sqft: e.target.value }))}
                      className="flex-1 px-2 py-1.5 bg-white border border-slate-300 rounded text-xs font-mono"
                    />
                  )}
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">Total Units</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  required
                  value={unitForm.unit_count}
                  onChange={(e) => setUnitForm((p) => ({ ...p, unit_count: e.target.value }))}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">Landowner Units (Excluded)</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={unitForm.landowner_unit_count}
                  onChange={(e) => setUnitForm((p) => ({ ...p, landowner_unit_count: e.target.value }))}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">Rate / Sq Ft (₹)</label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  required
                  value={unitForm.rate_per_sqft}
                  onChange={(e) => setUnitForm((p) => ({ ...p, rate_per_sqft: e.target.value }))}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs font-mono"
                />
              </div>
              <div className="flex items-end justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setUnitFormOpen(false)}
                  className="px-3 py-1.5 text-xs bg-white border border-slate-300 rounded text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={unitSaving}
                  className="px-3.5 py-1.5 text-xs font-semibold bg-slate-900 text-white rounded hover:bg-slate-800 flex items-center gap-1"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{unitSaving ? 'Saving...' : (editingUnitId ? 'Update' : 'Add Unit')}</span>
                </button>
              </div>
            </div>
          </form>
        )}

        {/* Row 2 & 3: Salable Units Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100 text-slate-700 border-b border-slate-300 text-[11px]">
                <th className="py-2 px-3 text-left border-r border-slate-200">2. Salable Units Cost — Particular</th>
                <th className="py-2 px-2 text-right border-r border-slate-200">Carpet (ft²)</th>
                <th className="py-2 px-2 text-right border-r border-slate-200">Loading</th>
                <th className="py-2 px-2 text-right border-r border-slate-200">Super B/Up (ft²)</th>
                <th className="py-2 px-2 text-center border-r border-slate-200">Dev Units (Owner)</th>
                <th className="py-2 px-2 text-right border-r border-slate-200">Rate / ft² (₹)</th>
                <th className="py-2 px-2 text-right border-r border-slate-200">Unit Price (₹)</th>
                <th className="py-2 px-3 text-right border-r border-slate-200">Dev Amount (₹)</th>
                {canEdit && <th className="py-2 px-2 text-center w-16">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 font-mono">
              {evaluatedUnits.length === 0 ? (
                <tr>
                  <td colSpan={canEdit ? 9 : 8} className="py-6 text-center font-sans text-slate-500">
                    No salable unit rows added. Click &ldquo;Add Salable Unit Row&rdquo; above.
                  </td>
                </tr>
              ) : (
                evaluatedUnits.map((u) => {
                  const devUnits = u.developer_unit_count ?? (parseInt(u.unit_count, 10) || 0);
                  const ownUnits = u.landowner_unit_count ?? 0;
                  return (
                    <tr key={u.id} className="bg-white">
                      <td className="py-1.5 px-3 font-sans border-r border-slate-200">
                        <span className="font-medium text-slate-800">{u.unit_name || 'Salable Unit'}</span>
                        <span className="text-[10px] text-slate-500 ml-1.5">({u.building_use || 'Residential'})</span>
                      </td>
                      <td className="py-1.5 px-2 text-right border-r border-slate-200">{formatNum(u.carpet_area_sqft, 2)}</td>
                      <td className="py-1.5 px-2 text-right border-r border-slate-200 text-slate-600">
                        {u.loading_mode === 'percentage'
                          ? `+${formatNum(u.loading_pct, 1)}%`
                          : `+${formatNum(u.super_buildup_loading_sqft, 2)} ft²`}
                      </td>
                      <td className="py-1.5 px-2 text-right border-r border-slate-200 font-semibold">{formatNum(u.super_buildup_area_sqft, 2)}</td>
                      <td className="py-1.5 px-2 text-center border-r border-slate-200">
                        <span className="font-semibold text-slate-900">{devUnits}</span>
                        {ownUnits > 0 && (
                          <span className="text-[10px] text-amber-700 ml-1">({ownUnits} Owner)</span>
                        )}
                      </td>
                      <td className="py-1.5 px-2 text-right border-r border-slate-200">{formatINR(u.rate_per_sqft)}</td>
                      <td className="py-1.5 px-2 text-right border-r border-slate-200">{formatINR(u.unit_price)}</td>
                      <td className="py-1.5 px-3 text-right font-bold text-slate-900 border-r border-slate-200">{formatINR(u.developer_amount)}</td>
                      {canEdit && (
                        <td className="py-1.5 px-2 text-center">
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              title="Edit unit"
                              onClick={() => openEditUnit(u)}
                              className="text-slate-500 hover:text-slate-900"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              title="Delete unit"
                              onClick={() => onDeleteSalableUnit(u.id)}
                              className="text-slate-400 hover:text-rose-600"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
            <tfoot>
              <tr className="bg-emerald-50 font-bold border-t-2 border-slate-400 text-slate-900 font-mono">
                <td colSpan={4} className="py-2 px-3 font-sans border-r border-slate-200">
                  3. Total Developer Receipts
                  {(financialMetrics.totalLandownerUnits || 0) > 0 && (
                    <span className="text-[11px] font-normal text-amber-800 ml-2">
                      ({financialMetrics.totalLandownerUnits} Landowner units excluded from revenue)
                    </span>
                  )}
                </td>
                <td className="py-2 px-2 text-center border-r border-slate-200">{financialMetrics.totalDeveloperUnits || 0}</td>
                <td colSpan={2} className="py-2 px-2 border-r border-slate-200" />
                <td className="py-2 px-3 text-right text-sm text-emerald-900 border-r border-slate-200">
                  {formatINR(financialMetrics.totalReceipts)}
                </td>
                {canEdit && <td />}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* 7. Project Viability Closing Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden max-w-2xl">
        <div className="bg-slate-900 text-white px-4 py-2">
          <h3 className="text-xs font-bold tracking-wide uppercase">Project Viability</h3>
        </div>
        <table className="w-full text-xs border-collapse">
          <tbody className="divide-y divide-slate-200">
            <tr>
              <td className="py-2 px-3 text-center font-mono w-12 border-r border-slate-200">1</td>
              <td className="py-2 px-4 font-semibold text-slate-800 border-r border-slate-200">Project Cost</td>
              <td className="py-2 px-4 text-right font-mono font-semibold text-slate-900">{formatINR(financialMetrics.totalProjectCost)}</td>
            </tr>
            <tr>
              <td className="py-2 px-3 text-center font-mono border-r border-slate-200">2</td>
              <td className="py-2 px-4 font-semibold text-slate-800 border-r border-slate-200">Receipts (Developer)</td>
              <td className="py-2 px-4 text-right font-mono font-semibold text-slate-900">{formatINR(financialMetrics.totalReceipts)}</td>
            </tr>
            <tr className={(financialMetrics.netProfit || 0) >= 0 ? 'bg-emerald-50' : 'bg-rose-50'}>
              <td className="py-2.5 px-3 text-center font-mono font-bold border-r border-slate-200">3</td>
              <td className="py-2.5 px-4 font-bold text-slate-900 border-r border-slate-200">Profit (Receipts − Cost)</td>
              <td className={`py-2.5 px-4 text-right font-mono text-sm font-bold ${(financialMetrics.netProfit || 0) >= 0 ? 'text-emerald-900' : 'text-rose-800'}`}>
                {formatINR(financialMetrics.netProfit)}
              </td>
            </tr>
            <tr className="bg-slate-50">
              <td className="py-2 px-3 text-center font-mono font-bold border-r border-slate-200">4</td>
              <td className="py-2 px-4 font-bold text-slate-900 border-r border-slate-200">ROI (%)</td>
              <td className="py-2 px-4 text-right font-mono font-bold text-slate-900">
                {formatNum(financialMetrics.roiPct, 2)}%
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
