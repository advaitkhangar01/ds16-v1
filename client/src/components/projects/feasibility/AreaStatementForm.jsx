// client/src/components/projects/feasibility/AreaStatementForm.jsx
// Authentic Excel-structured Area Statement (1..4, A..H) & exact 6-column Floor-wise Proposed P-Line Table.
// All derived figures render strictly from backend `areaMetrics` returned by /feasibility & /preview.

import React, { useState } from 'react';
import {
  Building2,
  RefreshCw,
  RotateCcw,
  AlertTriangle,
  Lock,
  Info
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  ROAD_WIDTHS,
  ROAD_WIDTH_TOTAL_TDR_MAP,
  ROAD_WIDTH_TDR_MAP,
  toDisplayArea,
  fromDisplayArea,
  formatArea,
  formatNum,
  deriveTdrSplit
} from '../../../utils/feasibilityCalculations';

/**
 * Unit-aware decimal input: edits smoothly in active unitDisplay ('sq_m' or 'sq_ft'),
 * validates on blur/commit (never silently clamping negative Net Plotable Area), and persists Sq M.
 */
function AreaUnitInput({
  valueSqm,
  unitDisplay,
  decimals = 3,
  disabled = false,
  placeholder = '0.000',
  className = '',
  onChangeSqm
}) {
  const [focused, setFocused] = useState(false);
  const [text, setText] = useState('');

  const formattedOutside =
    valueSqm === null || valueSqm === undefined || valueSqm === ''
      ? ''
      : Number(toDisplayArea(valueSqm, unitDisplay)).toFixed(decimals);

  const commitSqm = (raw, isBlur = false) => {
    const valSqm = raw === '' ? 0 : fromDisplayArea(raw, unitDisplay);
    if (!Number.isFinite(valSqm) || valSqm < 0) {
      if (isBlur) setFocused(false);
      return;
    }
    const roundedSqm = Math.round(valSqm * 10000) / 10000;
    const res = onChangeSqm(roundedSqm);
    if (res && res.ok === false && isBlur) {
      toast.error(res.error);
      setFocused(false);
    } else if (isBlur) {
      setFocused(false);
    }
  };

  return (
    <input
      type="number"
      step="any"
      min="0"
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
        commitSqm(raw, false);
      }}
      onBlur={() => commitSqm(text, true)}
      className={className}
    />
  );
}

/**
 * Plain decimal input for dimensionless factors, meters, percentages, or nullable auto-suggest fields.
 * Rejects invalid entries on commit/blur instead of silently clamping.
 */
function PlainDecimalInput({
  value,
  decimals = 3,
  nullable = false,
  disabled = false,
  placeholder = '',
  className = '',
  onChangeValue
}) {
  const [focused, setFocused] = useState(false);
  const [text, setText] = useState('');

  const formattedOutside =
    value === null || value === undefined || value === ''
      ? ''
      : Number(value).toFixed(decimals);

  const commitVal = (raw, isBlur = false) => {
    if (raw === '') {
      const res = onChangeValue(nullable ? null : 0);
      if (res && res.ok === false && isBlur) toast.error(res.error);
      if (isBlur) setFocused(false);
      return;
    }
    const parsed = parseFloat(raw);
    if (!Number.isFinite(parsed) || parsed < 0) {
      if (isBlur) {
        toast.error('Please enter a valid non-negative number.');
        setFocused(false);
      }
      return;
    }
    const res = onChangeValue(parsed);
    if (res && res.ok === false && isBlur) {
      toast.error(res.error);
      setFocused(false);
    } else if (isBlur) {
      setFocused(false);
    }
  };

  return (
    <input
      type="number"
      step="any"
      min="0"
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
        commitVal(raw, false);
      }}
      onBlur={() => commitVal(text, true)}
      className={className}
    />
  );
}

export default function AreaStatementForm({
  statement = {},
  floors = [],
  areaMetrics = {},
  unitDisplay = 'sq_m',
  canEdit = false,
  onUpdateStatement,
  onUpdateFloor,
  onReconcileFloors
}) {
  const unitShort = unitDisplay === 'sq_ft' ? 'Sq. Ft.' : 'Sq. Mtr.';
  const isGunthewari = Boolean(statement.is_gunthewari);
  const buildingUse = statement.building_use || 'Residential';
  const isMixedUse = buildingUse === 'Mixed Use';
  const roadWidth = statement.road_width_m ? Number(statement.road_width_m) : '';

  const evaluatedFloors = areaMetrics.evaluatedFloors || floors;
  const evalById = new Map(evaluatedFloors.map((f) => [f.id, f]));

  const primaryResPct =
    statement.primary_fsi_residential_pct !== null && statement.primary_fsi_residential_pct !== undefined
      ? Number(statement.primary_fsi_residential_pct)
      : Number(areaMetrics.primaryFsiResidentialPct ?? (buildingUse === 'Commercial' ? 0 : buildingUse === 'Mixed Use' ? 50 : 100));
  const primaryCommPct = Math.max(0, Math.round((100 - primaryResPct) * 100) / 100);

  // FR-08 & Section 3: Switching classification revalidates & resets proposed consumption to new eligibility
  const handleClassificationChange = (gunth) => {
    if (!canEdit) return;
    if (roadWidth && ROAD_WIDTH_TDR_MAP[roadWidth]) {
      const tier = ROAD_WIDTH_TDR_MAP[roadWidth];
      if (gunth) {
        onUpdateStatement({
          is_gunthewari: true,
          regular_tdr_factor: 0,
          slum_tdr_factor: tier.gunthewari,
          total_tdr_factor: tier.gunthewari,
          tdr_factor: tier.gunthewari,
          proposed_regular_tdr_factor: 0,
          proposed_slum_tdr_factor: null
        }, true);
      } else {
        const total = ROAD_WIDTH_TOTAL_TDR_MAP[roadWidth];
        onUpdateStatement({
          is_gunthewari: false,
          regular_tdr_factor: tier.regular,
          slum_tdr_factor: tier.slum,
          total_tdr_factor: total,
          tdr_factor: total,
          proposed_regular_tdr_factor: null,
          proposed_slum_tdr_factor: null
        }, true);
      }
    } else if (gunth) {
      const currentSlum = Number(statement.slum_tdr_factor ?? areaMetrics.slumTdrFactor ?? 0);
      onUpdateStatement({
        is_gunthewari: true,
        regular_tdr_factor: 0,
        slum_tdr_factor: currentSlum,
        total_tdr_factor: currentSlum,
        tdr_factor: currentSlum,
        proposed_regular_tdr_factor: 0,
        proposed_slum_tdr_factor: null
      }, true);
    } else {
      onUpdateStatement({
        is_gunthewari: false,
        proposed_regular_tdr_factor: null,
        proposed_slum_tdr_factor: null
      }, true);
    }
  };

  // Total TDR is strictly road-width derived; changing road width resets & revalidates proposed consumption
  const handleRoadWidthChange = (val) => {
    if (!canEdit || !val) return;
    const w = Number(val);
    const tier = ROAD_WIDTH_TDR_MAP[w];
    if (!tier) return;
    if (isGunthewari) {
      onUpdateStatement({
        road_width_m: w,
        regular_tdr_factor: 0,
        slum_tdr_factor: tier.gunthewari,
        total_tdr_factor: tier.gunthewari,
        tdr_factor: tier.gunthewari,
        proposed_regular_tdr_factor: 0,
        proposed_slum_tdr_factor: null
      }, true);
    } else {
      const total = ROAD_WIDTH_TOTAL_TDR_MAP[w];
      onUpdateStatement({
        road_width_m: w,
        regular_tdr_factor: tier.regular,
        slum_tdr_factor: tier.slum,
        total_tdr_factor: total,
        tdr_factor: total,
        proposed_regular_tdr_factor: null,
        proposed_slum_tdr_factor: null
      }, true);
    }
  };

  const handleBuildingUseChange = (nextUse) => {
    if (!canEdit) return;
    const nextResPct = nextUse === 'Residential' ? 100 : nextUse === 'Commercial' ? 0 : 50;
    onUpdateStatement({
      building_use: nextUse,
      primary_fsi_residential_pct: nextResPct
    }, true);
  };

  // Regular TDR editable only on Regular plots within road-width Total TDR; Slum = Total - Regular
  const handlePermRegTdrChange = (val) => {
    if (!canEdit || isGunthewari) return { ok: false, error: 'Regular TDR is locked for Gunthewari plots.' };
    if (!roadWidth || ROAD_WIDTH_TOTAL_TDR_MAP[roadWidth] === undefined) {
      return { ok: false, error: 'Select an Abutting Road Width (9m–24m) before editing Regular TDR.' };
    }
    const total = ROAD_WIDTH_TOTAL_TDR_MAP[roadWidth];
    const split = deriveTdrSplit(total, val, false);
    if (!split.isSplitValid) {
      return onUpdateStatement({
        total_tdr_factor: total,
        tdr_factor: total,
        regular_tdr_factor: val
      });
    }
    const propReg = statement.proposed_regular_tdr_factor;
    const propSlum = statement.proposed_slum_tdr_factor;
    return onUpdateStatement({
      total_tdr_factor: split.totalTdrFactor,
      tdr_factor: split.totalTdrFactor,
      regular_tdr_factor: split.regularTdrFactor,
      slum_tdr_factor: split.slumTdrFactor,
      ...(propReg !== null && propReg !== undefined && propReg > split.regularTdrFactor ? { proposed_regular_tdr_factor: null } : {}),
      ...(propSlum !== null && propSlum !== undefined && propSlum > split.slumTdrFactor ? { proposed_slum_tdr_factor: null } : {})
    });
  };

  const inputCls =
    'w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md focus:ring-2 focus:ring-slate-900 focus:border-slate-900 font-mono disabled:bg-slate-100 disabled:text-slate-500';
  const tblInputCls =
    'w-24 px-1.5 py-1 text-right text-xs bg-white border border-slate-300 rounded focus:ring-1 focus:ring-slate-900 font-mono disabled:bg-slate-100';

  const commAncPct = Number(areaMetrics.commAncillaryPct ?? 0.8);
  const resAncPct = Number(areaMetrics.resAncillaryPct ?? 0.6);

  return (
    <div className="space-y-4">
      {/* 1. Compact Contextual Plot, Classification & Factor Inputs */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-slate-700" />
            <h3 className="text-sm font-bold text-slate-900">Plot &amp; Permissible / Proposed Parameters</h3>
          </div>
          <span className="text-[11px] text-slate-500">Editing in {unitShort} (canonical storage in Sq. Mtr.)</span>
        </div>

        {/* Plot Area & Independent Records (FR-02 & Section 4) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">1. Area Of Plot ({unitShort})</label>
            <AreaUnitInput
              valueSqm={statement.plot_area_sqm}
              unitDisplay={unitDisplay}
              disabled={!canEdit}
              className={inputCls}
              onChangeSqm={(sqm) => onUpdateStatement({ plot_area_sqm: sqm })}
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">2. As Per City Survey Record ({unitShort})</label>
            <AreaUnitInput
              valueSqm={statement.city_survey_area_sqm}
              unitDisplay={unitDisplay}
              disabled={!canEdit}
              className={inputCls}
              onChangeSqm={(sqm) => onUpdateStatement({ city_survey_area_sqm: sqm })}
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">3. As per site ({unitShort})</label>
            <AreaUnitInput
              valueSqm={statement.site_area_sqm}
              unitDisplay={unitDisplay}
              disabled={!canEdit}
              className={inputCls}
              onChangeSqm={(sqm) => onUpdateStatement({ site_area_sqm: sqm })}
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">4. Deductions For Proposed D.P. ({unitShort})</label>
            <AreaUnitInput
              valueSqm={statement.dp_deductions_sqm}
              unitDisplay={unitDisplay}
              disabled={!canEdit}
              className={inputCls}
              onChangeSqm={(sqm) => onUpdateStatement({ dp_deductions_sqm: sqm })}
            />
          </div>
        </div>

        {/* Building Use, Mixed-Use Allocation & Road Width / Gunthewari Classification */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">Building Use</label>
            <select
              disabled={!canEdit}
              value={buildingUse}
              onChange={(e) => handleBuildingUseChange(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md focus:ring-2 focus:ring-slate-900"
            >
              <option value="Residential">Residential (60% Ancillary)</option>
              <option value="Commercial">Commercial (80% Ancillary)</option>
              <option value="Mixed Use">Mixed Use (60% Res / 80% Comm)</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">Plot Classification (FR-08)</label>
            <select
              disabled={!canEdit}
              value={isGunthewari ? 'gunthewari' : 'regular'}
              onChange={(e) => handleClassificationChange(e.target.value === 'gunthewari')}
              className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md focus:ring-2 focus:ring-slate-900"
            >
              <option value="regular">Regular Development (Regular + Slum TDR)</option>
              <option value="gunthewari">Gunthewari Plot (Slum TDR Only)</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">Abutting Road Width</label>
            <select
              disabled={!canEdit}
              value={roadWidth}
              onChange={(e) => handleRoadWidthChange(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md focus:ring-2 focus:ring-slate-900"
            >
              {!roadWidth && <option value="">Select Road Width (9m–24m)</option>}
              {ROAD_WIDTHS.map((w) => (
                <option key={w} value={w}>
                  {w} m ({isGunthewari ? `Slum ${ROAD_WIDTH_TDR_MAP[w].gunthewari}` : `Total ${ROAD_WIDTH_TOTAL_TDR_MAP[w].toFixed(2)}`})
                </option>
              ))}
            </select>
          </div>

          {isMixedUse ? (
            <div className="bg-indigo-50/70 border border-indigo-200 rounded-lg p-2">
              <label className="block text-[11px] font-bold text-indigo-900 mb-1">
                Primary FSI Allocation (FR-11, Total 100%)
              </label>
              <div className="flex items-center gap-2 text-xs">
                <div className="flex-1">
                  <span className="text-[10px] text-indigo-700">Res %</span>
                  <PlainDecimalInput
                    decimals={1}
                    disabled={!canEdit}
                    value={primaryResPct}
                    className="w-full px-2 py-1 text-xs bg-white border border-indigo-300 rounded font-mono"
                    onChangeValue={(val) => {
                      if (val < 0 || val > 100) {
                        return { ok: false, error: 'Residential percentage must be between 0 and 100.' };
                      }
                      return onUpdateStatement({ primary_fsi_residential_pct: val });
                    }}
                  />
                </div>
                <div className="flex-1">
                  <span className="text-[10px] text-indigo-700">Comm %</span>
                  <PlainDecimalInput
                    decimals={1}
                    disabled={!canEdit}
                    value={primaryCommPct}
                    className="w-full px-2 py-1 text-xs bg-white border border-indigo-300 rounded font-mono"
                    onChangeValue={(val) => {
                      if (val < 0 || val > 100) {
                        return { ok: false, error: 'Commercial percentage must be between 0 and 100.' };
                      }
                      return onUpdateStatement({ primary_fsi_residential_pct: Math.round((100 - val) * 100) / 100 });
                    }}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-end pb-1">
              {isGunthewari ? (
                <div className="w-full text-[11px] bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-2.5 py-1.5 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 shrink-0" />
                  <span>Gunthewari: Regular TDR locked at 0 (Slum TDR only).</span>
                </div>
              ) : (
                <div className="w-full text-[11px] bg-slate-50 border border-slate-200 text-slate-600 rounded-lg px-2.5 py-1.5 flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 shrink-0 text-slate-500" />
                  <span>Total TDR road-derived; Slum TDR = Total − Regular.</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Permissible & Proposed FSI/TDR Consumption Factors (Section 3 & FR-05/09) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 pt-1">
          {/* Permissible Factors Box */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
                Permissible Potential Factors
              </div>
              <span className="text-[11px] font-mono font-semibold text-slate-700">
                Road Total TDR: {formatNum(areaMetrics.totalTdrFactor, 3)}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div>
                <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">Basic FSI</label>
                <PlainDecimalInput
                  decimals={2}
                  disabled={!canEdit}
                  value={statement.basic_fsi_factor ?? 1.1}
                  className={inputCls}
                  onChangeValue={(v) => onUpdateStatement({ basic_fsi_factor: v })}
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">Max Paid FSI</label>
                <PlainDecimalInput
                  decimals={2}
                  disabled={!canEdit}
                  value={statement.paid_fsi_factor ?? 0.5}
                  className={inputCls}
                  onChangeValue={(v) => onUpdateStatement({ paid_fsi_factor: v })}
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">
                  Perm. Reg TDR {isGunthewari && '(Locked)'}
                </label>
                <PlainDecimalInput
                  decimals={3}
                  disabled={!canEdit || isGunthewari || !roadWidth}
                  value={isGunthewari ? 0 : (areaMetrics.regularTdrFactor ?? 0)}
                  className={inputCls}
                  onChangeValue={handlePermRegTdrChange}
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">
                  Perm. Slum TDR (Balance)
                </label>
                <input
                  type="text"
                  readOnly
                  disabled
                  value={formatNum(areaMetrics.slumTdrFactor ?? 0, 3)}
                  className={inputCls}
                />
              </div>
            </div>
          </div>

          {/* Proposed Consumption Factors Box (FR-05/09) */}
          <div className="bg-emerald-50/50 border border-emerald-200 rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-900">
                Proposed Utilization Factors (FR-05 / FR-09)
              </div>
              {(areaMetrics.isProposedPaidFsiEdited || areaMetrics.isProposedTdrEdited) && canEdit && (
                <button
                  type="button"
                  onClick={() =>
                    onUpdateStatement(
                      {
                        proposed_paid_fsi_factor: null,
                        proposed_regular_tdr_factor: isGunthewari ? 0 : null,
                        proposed_slum_tdr_factor: null,
                        proposed_tdr_factor: null
                      },
                      true
                    )
                  }
                  className="text-[10px] font-semibold text-emerald-800 hover:text-emerald-950 flex items-center gap-1 underline"
                >
                  <RotateCcw className="w-3 h-3" />
                  Reset to Auto-Suggested
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div>
                <label className="block text-[10px] font-semibold text-slate-700 mb-0.5">
                  Proposed Paid FSI{' '}
                  <span className="text-[9px] text-slate-500">
                    ({areaMetrics.isProposedPaidFsiEdited ? 'Edited' : `Auto ${Number(areaMetrics.suggestedPaidFsiFactor ?? 0).toFixed(3)}`})
                  </span>
                </label>
                <PlainDecimalInput
                  decimals={3}
                  nullable
                  disabled={!canEdit}
                  value={
                    statement.proposed_paid_fsi_factor !== null && statement.proposed_paid_fsi_factor !== undefined
                      ? statement.proposed_paid_fsi_factor
                      : areaMetrics.effectiveProposedPaidFsiFactor
                  }
                  className={inputCls}
                  onChangeValue={(v) => onUpdateStatement({ proposed_paid_fsi_factor: v })}
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-slate-700 mb-0.5">
                  Prop. Regular TDR{' '}
                  <span className="text-[9px] text-slate-500">
                    ({isGunthewari ? 'Locked 0' : `Auto ${Number(areaMetrics.suggestedRegularTdrFactor ?? 0).toFixed(3)}`})
                  </span>
                </label>
                <PlainDecimalInput
                  decimals={3}
                  nullable
                  disabled={!canEdit || isGunthewari}
                  value={
                    isGunthewari
                      ? 0
                      : (statement.proposed_regular_tdr_factor !== null && statement.proposed_regular_tdr_factor !== undefined
                          ? statement.proposed_regular_tdr_factor
                          : areaMetrics.effectiveProposedRegularTdrFactor)
                  }
                  className={inputCls}
                  onChangeValue={(v) => onUpdateStatement({ proposed_regular_tdr_factor: v })}
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-slate-700 mb-0.5">
                  Prop. Slum TDR{' '}
                  <span className="text-[9px] text-slate-500">
                    (Auto {Number(areaMetrics.suggestedSlumTdrFactor ?? 0).toFixed(3)})
                  </span>
                </label>
                <PlainDecimalInput
                  decimals={3}
                  nullable
                  disabled={!canEdit}
                  value={
                    statement.proposed_slum_tdr_factor !== null && statement.proposed_slum_tdr_factor !== undefined
                      ? statement.proposed_slum_tdr_factor
                      : areaMetrics.effectiveProposedSlumTdrFactor
                  }
                  className={inputCls}
                  onChangeValue={(v) => onUpdateStatement({ proposed_slum_tdr_factor: v })}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Authentic Excel Table 1: Area Statement (1..4, A..H) */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="bg-slate-900 text-white px-4 py-2.5 flex items-center justify-between">
          <h3 className="text-xs font-bold tracking-wide uppercase">
            Table 1 — Area Statement ({unitShort}) — Permissible vs Proposed
          </h3>
          <span className="text-[11px] text-slate-300">
            Unused Paid FSI / TDR is excluded from Section A &amp; Section B costs
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100 text-slate-700 border-b border-slate-300 text-[11px]">
                <th className="py-2 px-3 text-center border-r border-slate-200 w-12">Sr.</th>
                <th className="py-2 px-3 text-left border-r border-slate-200">Particulars</th>
                <th className="py-2 px-3 text-left border-r border-slate-200">Allocation / Notes</th>
                <th className="py-2 px-3 text-right border-r border-slate-200 w-24">Perm. Factor</th>
                <th className="py-2 px-3 text-right border-r border-slate-200 w-36">Permissible ({unitShort})</th>
                <th className="py-2 px-3 text-right border-r border-slate-200 w-36">Proposed ({unitShort})</th>
                <th className="py-2 px-3 text-right w-24">Prop. Factor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 font-mono">
              <tr>
                <td className="py-1.5 px-3 text-center font-sans border-r border-slate-200">1</td>
                <td className="py-1.5 px-3 font-sans border-r border-slate-200">Area Of Plot</td>
                <td className="py-1.5 px-3 font-sans text-slate-500 border-r border-slate-200">Gross Plot Area</td>
                <td className="py-1.5 px-3 text-right border-r border-slate-200 text-slate-400">—</td>
                <td className="py-1.5 px-3 text-right border-r border-slate-200">{formatArea(areaMetrics.plotAreaSqm, unitDisplay, 3)}</td>
                <td className="py-1.5 px-3 text-right border-r border-slate-200 text-slate-400">—</td>
                <td className="py-1.5 px-3 text-right text-slate-400">—</td>
              </tr>
              <tr>
                <td className="py-1.5 px-3 text-center font-sans border-r border-slate-200">2</td>
                <td className="py-1.5 px-3 font-sans border-r border-slate-200">As Per City Survey Record</td>
                <td className="py-1.5 px-3 font-sans text-slate-500 border-r border-slate-200">Independent PR record</td>
                <td className="py-1.5 px-3 text-right border-r border-slate-200 text-slate-400">—</td>
                <td className="py-1.5 px-3 text-right border-r border-slate-200">{formatArea(areaMetrics.citySurveyAreaSqm, unitDisplay, 3)}</td>
                <td className="py-1.5 px-3 text-right border-r border-slate-200 text-slate-400">—</td>
                <td className="py-1.5 px-3 text-right text-slate-400">—</td>
              </tr>
              <tr>
                <td className="py-1.5 px-3 text-center font-sans border-r border-slate-200">3</td>
                <td className="py-1.5 px-3 font-sans border-r border-slate-200">As per site</td>
                <td className="py-1.5 px-3 font-sans text-slate-500 border-r border-slate-200">Actual site measurement</td>
                <td className="py-1.5 px-3 text-right border-r border-slate-200 text-slate-400">—</td>
                <td className="py-1.5 px-3 text-right border-r border-slate-200">{formatArea(areaMetrics.siteAreaSqm, unitDisplay, 3)}</td>
                <td className="py-1.5 px-3 text-right border-r border-slate-200 text-slate-400">—</td>
                <td className="py-1.5 px-3 text-right text-slate-400">—</td>
              </tr>
              <tr>
                <td className="py-1.5 px-3 text-center font-sans border-r border-slate-200">4</td>
                <td className="py-1.5 px-3 font-sans border-r border-slate-200">Deductions For Proposed D.P.</td>
                <td className="py-1.5 px-3 font-sans text-slate-500 border-r border-slate-200">Road / DP deduction</td>
                <td className="py-1.5 px-3 text-right border-r border-slate-200 text-slate-400">—</td>
                <td className="py-1.5 px-3 text-right border-r border-slate-200">{formatArea(areaMetrics.dpDeductionsSqm, unitDisplay, 3)}</td>
                <td className="py-1.5 px-3 text-right border-r border-slate-200 text-slate-400">—</td>
                <td className="py-1.5 px-3 text-right text-slate-400">—</td>
              </tr>
              <tr className="bg-slate-50 font-semibold">
                <td className="py-1.5 px-3 text-center font-sans border-r border-slate-200">A</td>
                <td className="py-1.5 px-3 font-sans border-r border-slate-200">Plotable area (1 − 4)</td>
                <td className="py-1.5 px-3 font-sans text-slate-500 font-normal border-r border-slate-200">Net Plotable Basis</td>
                <td className="py-1.5 px-3 text-right border-r border-slate-200 text-slate-400">—</td>
                <td className="py-1.5 px-3 text-right border-r border-slate-200">{formatArea(areaMetrics.plotableAreaSqm, unitDisplay, 3)}</td>
                <td className="py-1.5 px-3 text-right border-r border-slate-200">{formatArea(areaMetrics.plotableAreaSqm, unitDisplay, 3)}</td>
                <td className="py-1.5 px-3 text-right text-slate-400">—</td>
              </tr>
              <tr>
                <td className="py-1.5 px-3 text-center font-sans border-r border-slate-200">B</td>
                <td className="py-1.5 px-3 font-sans border-r border-slate-200">Basic Permissible FSI</td>
                <td className="py-1.5 px-3 font-sans text-slate-500 border-r border-slate-200">Base FSI of Net Plotable</td>
                <td className="py-1.5 px-3 text-right border-r border-slate-200">{formatNum(statement.basic_fsi_factor ?? 1.1, 3)}</td>
                <td className="py-1.5 px-3 text-right border-r border-slate-200">{formatArea(areaMetrics.permissibleFsiSqm, unitDisplay, 3)}</td>
                <td className="py-1.5 px-3 text-right border-r border-slate-200">{formatArea(areaMetrics.proposedBasicFsiSqm, unitDisplay, 3)}</td>
                <td className="py-1.5 px-3 text-right">{formatNum(statement.basic_fsi_factor ?? 1.1, 3)}</td>
              </tr>
              <tr>
                <td className="py-1.5 px-3 text-center font-sans border-r border-slate-200">C</td>
                <td className="py-1.5 px-3 font-sans border-r border-slate-200">Paid FSI</td>
                <td className="py-1.5 px-3 font-sans text-slate-500 border-r border-slate-200">
                  {areaMetrics.isProposedPaidFsiEdited ? 'Architect edited utilization' : 'Auto-suggested utilization'}
                </td>
                <td className="py-1.5 px-3 text-right border-r border-slate-200">{formatNum(statement.paid_fsi_factor ?? 0.5, 3)}</td>
                <td className="py-1.5 px-3 text-right border-r border-slate-200">{formatArea(areaMetrics.permissiblePaidFsiSqm, unitDisplay, 3)}</td>
                <td className="py-1.5 px-3 text-right border-r border-slate-200 font-semibold text-emerald-800">{formatArea(areaMetrics.proposedPaidFsiSqm, unitDisplay, 3)}</td>
                <td className="py-1.5 px-3 text-right font-semibold text-emerald-800">{formatNum(areaMetrics.effectiveProposedPaidFsiFactor, 3)}</td>
              </tr>
              <tr>
                <td className="py-1.5 px-3 text-center font-sans border-r border-slate-200">D1</td>
                <td className="py-1.5 px-3 font-sans border-r border-slate-200">Regular TDR</td>
                <td className="py-1.5 px-3 font-sans text-slate-500 border-r border-slate-200">
                  {areaMetrics.isGunthewari ? 'Ineligible (Gunthewari = 0)' : 'Regular TDR component'}
                </td>
                <td className="py-1.5 px-3 text-right border-r border-slate-200">{formatNum(areaMetrics.regularTdrFactor, 3)}</td>
                <td className="py-1.5 px-3 text-right border-r border-slate-200">{formatArea(areaMetrics.permissibleRegularTdrSqm, unitDisplay, 3)}</td>
                <td className="py-1.5 px-3 text-right border-r border-slate-200">{formatArea(areaMetrics.regularTdrSqm, unitDisplay, 3)}</td>
                <td className="py-1.5 px-3 text-right">{formatNum(areaMetrics.effectiveProposedRegularTdrFactor, 3)}</td>
              </tr>
              <tr>
                <td className="py-1.5 px-3 text-center font-sans border-r border-slate-200">D2</td>
                <td className="py-1.5 px-3 font-sans border-r border-slate-200">Slum TDR</td>
                <td className="py-1.5 px-3 font-sans text-slate-500 border-r border-slate-200">
                  {areaMetrics.isGunthewari ? 'Gunthewari Slum TDR only' : 'Remaining TDR balance'}
                </td>
                <td className="py-1.5 px-3 text-right border-r border-slate-200">{formatNum(areaMetrics.slumTdrFactor, 3)}</td>
                <td className="py-1.5 px-3 text-right border-r border-slate-200">{formatArea(areaMetrics.permissibleSlumTdrSqm, unitDisplay, 3)}</td>
                <td className="py-1.5 px-3 text-right border-r border-slate-200">{formatArea(areaMetrics.slumTdrSqm, unitDisplay, 3)}</td>
                <td className="py-1.5 px-3 text-right">{formatNum(areaMetrics.effectiveProposedSlumTdrFactor, 3)}</td>
              </tr>
              <tr className="bg-slate-50 font-semibold">
                <td className="py-1.5 px-3 text-center font-sans border-r border-slate-200">D</td>
                <td className="py-1.5 px-3 font-sans border-r border-slate-200">Total TDR (D1 + D2)</td>
                <td className="py-1.5 px-3 font-sans text-slate-500 font-normal border-r border-slate-200">Road-width derived Total</td>
                <td className="py-1.5 px-3 text-right border-r border-slate-200">{formatNum(areaMetrics.totalTdrFactor, 3)}</td>
                <td className="py-1.5 px-3 text-right border-r border-slate-200">{formatArea(areaMetrics.permissibleTdrSqm, unitDisplay, 3)}</td>
                <td className="py-1.5 px-3 text-right border-r border-slate-200">{formatArea(areaMetrics.proposedTdrSqm, unitDisplay, 3)}</td>
                <td className="py-1.5 px-3 text-right">{formatNum(areaMetrics.totalProposedTdrFactor, 3)}</td>
              </tr>
              <tr className="bg-slate-100 font-bold">
                <td className="py-1.5 px-3 text-center font-sans border-r border-slate-200">E</td>
                <td className="py-1.5 px-3 font-sans border-r border-slate-200">Primary FSI / Total Builtup Area (B+C+D)</td>
                <td className="py-1.5 px-3 font-sans text-slate-600 font-normal border-r border-slate-200">Primary FSI Basis</td>
                <td className="py-1.5 px-3 text-right border-r border-slate-200 text-slate-400">—</td>
                <td className="py-1.5 px-3 text-right border-r border-slate-200">{formatArea(areaMetrics.permissibleTotalBuiltupSqm, unitDisplay, 3)}</td>
                <td className="py-1.5 px-3 text-right border-r border-slate-200">{formatArea(areaMetrics.proposedTotalBuiltupSqm, unitDisplay, 3)}</td>
                <td className="py-1.5 px-3 text-right text-slate-400">—</td>
              </tr>
              <tr>
                <td className="py-1.5 px-3 text-center font-sans border-r border-slate-200">F</td>
                <td className="py-1.5 px-3 font-sans border-r border-slate-200">TOTAL FSI Ratio (E / A)</td>
                <td className="py-1.5 px-3 font-sans text-slate-500 border-r border-slate-200">Dimensionless ratio</td>
                <td className="py-1.5 px-3 text-right border-r border-slate-200 text-slate-400">—</td>
                <td className="py-1.5 px-3 text-right border-r border-slate-200">{formatNum(areaMetrics.permissibleTotalFsi, 3)}</td>
                <td className="py-1.5 px-3 text-right border-r border-slate-200">{formatNum(areaMetrics.proposedTotalFsi, 3)}</td>
                <td className="py-1.5 px-3 text-right text-slate-400">—</td>
              </tr>
              <tr>
                <td className="py-1.5 px-3 text-center font-sans border-r border-slate-200">G1</td>
                <td className="py-1.5 px-3 font-sans border-r border-slate-200">ANCILLARY — Comm. ({Math.round(commAncPct * 100)}%)</td>
                <td className="py-1.5 px-3 font-sans text-slate-500 border-r border-slate-200">
                  Comm. Primary Alloc: {formatNum(areaMetrics.primaryFsiCommercialPct ?? 0, 1)}%
                </td>
                <td className="py-1.5 px-3 text-right border-r border-slate-200">{formatNum((areaMetrics.primaryFsiCommercialPct ?? 0) / 100, 3)}</td>
                <td className="py-1.5 px-3 text-right border-r border-slate-200">{formatArea(areaMetrics.permissibleCommercialAncillarySqm, unitDisplay, 3)}</td>
                <td className="py-1.5 px-3 text-right border-r border-slate-200">{formatArea(areaMetrics.table1ProposedCommAncSqm ?? areaMetrics.proposedCommercialAncillarySqm, unitDisplay, 3)}</td>
                <td className="py-1.5 px-3 text-right">{formatNum((areaMetrics.primaryFsiCommercialPct ?? 0) / 100, 3)}</td>
              </tr>
              <tr>
                <td className="py-1.5 px-3 text-center font-sans border-r border-slate-200">G2</td>
                <td className="py-1.5 px-3 font-sans border-r border-slate-200">ANCILLARY — Residential ({Math.round(resAncPct * 100)}%)</td>
                <td className="py-1.5 px-3 font-sans text-slate-500 border-r border-slate-200">
                  Res. Primary Alloc: {formatNum(areaMetrics.primaryFsiResidentialPct ?? 100, 1)}%
                </td>
                <td className="py-1.5 px-3 text-right border-r border-slate-200">{formatNum((areaMetrics.primaryFsiResidentialPct ?? 100) / 100, 3)}</td>
                <td className="py-1.5 px-3 text-right border-r border-slate-200">{formatArea(areaMetrics.permissibleResidentialAncillarySqm, unitDisplay, 3)}</td>
                <td className="py-1.5 px-3 text-right border-r border-slate-200">{formatArea(areaMetrics.table1ProposedResAncSqm ?? areaMetrics.proposedResidentialAncillarySqm, unitDisplay, 3)}</td>
                <td className="py-1.5 px-3 text-right">{formatNum((areaMetrics.primaryFsiResidentialPct ?? 100) / 100, 3)}</td>
              </tr>
              <tr className="bg-emerald-50 font-bold border-t-2 border-slate-400">
                <td className="py-2 px-3 text-center font-sans border-r border-slate-200">H</td>
                <td className="py-2 px-3 font-sans border-r border-slate-200">Total P-Line Area (E + G1 + G2)</td>
                <td className="py-2 px-3 font-sans font-normal text-emerald-900 border-r border-slate-200">
                  {areaMetrics.isProposedPlineOverridden
                    ? 'Manual Total P-Line Override active'
                    : 'Permissible vs Proposed Potential'}
                </td>
                <td className="py-2 px-3 text-right border-r border-slate-200 text-slate-400">—</td>
                <td className="py-2 px-3 text-right border-r border-slate-200 text-slate-900">{formatArea(areaMetrics.permissiblePlineTotalSqm, unitDisplay, 3)}</td>
                <td className="py-2 px-3 text-right border-r border-slate-200 text-emerald-900">
                  {formatArea(
                    areaMetrics.isProposedPlineOverridden
                      ? areaMetrics.effectiveProposedPlineSqm
                      : (areaMetrics.proposedPlineTotalSqm ?? areaMetrics.effectiveProposedPlineSqm),
                    unitDisplay,
                    3
                  )}
                </td>
                <td className="py-2 px-3 text-right font-sans">
                  {canEdit && (
                    areaMetrics.isProposedPlineOverridden ? (
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateStatement({
                            is_proposed_pline_overridden: false,
                            total_proposed_pline_override_sqm: null
                          }, true)
                        }
                        className="text-[10px] text-rose-700 underline hover:text-rose-900"
                      >
                        Reset H
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateStatement({
                            is_proposed_pline_overridden: true,
                            total_proposed_pline_override_sqm: areaMetrics.calculatedProposedPlineSqm || 0
                          }, true)
                        }
                        className="text-[10px] text-slate-600 underline hover:text-slate-900"
                      >
                        Override
                      </button>
                    )
                  )}
                </td>
              </tr>
              {statement.is_proposed_pline_overridden && (
                <tr className="bg-amber-50/70">
                  <td colSpan={5} className="py-1.5 px-3 text-right font-sans text-[11px] font-semibold text-amber-900 border-r border-slate-200">
                    Manual Proposed Total P-Line Override ({unitShort}):
                  </td>
                  <td className="py-1.5 px-3 text-right border-r border-slate-200">
                    <AreaUnitInput
                      valueSqm={statement.total_proposed_pline_override_sqm}
                      unitDisplay={unitDisplay}
                      disabled={!canEdit}
                      className={tblInputCls}
                      onChangeSqm={(sqm) => onUpdateStatement({ total_proposed_pline_override_sqm: sqm })}
                    />
                  </td>
                  <td className="py-1.5 px-3 text-[10px] font-sans text-amber-800">
                    Calc: {formatArea(areaMetrics.calculatedProposedPlineSqm, unitDisplay, 2)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 3. Authentic Excel Table 2: Exact 6-Column Proposed P-Line Area Statement */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="bg-slate-800 text-white px-4 py-2.5 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-xs font-bold tracking-wide uppercase">
              Table 2 — Proposed P-Line Area Statement ({unitShort})
            </h3>
            <p className="text-[11px] text-slate-300 mt-0.5">
              Floors synchronized from Central Building Configuration ({areaMetrics.applicableHabitableFloorsCount || 0} habitable floors)
            </p>
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={onReconcileFloors}
              className="px-2.5 py-1 text-[11px] font-semibold bg-white/10 hover:bg-white/20 text-white rounded border border-white/20 flex items-center gap-1"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Sync From Building Config</span>
            </button>
          )}
        </div>

        {areaMetrics.isPlineInconsistent && areaMetrics.plineInconsistencyMessage && (
          <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-xs text-amber-800 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
            <span>{areaMetrics.plineInconsistencyMessage}</span>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100 text-slate-700 border-b border-slate-300 text-[11px]">
                <th className="py-2 px-3 text-left border-r border-slate-200">1. Floor</th>
                <th className="py-2 px-3 text-center border-r border-slate-200">2. Height (m)</th>
                <th className="py-2 px-3 text-right border-r border-slate-200">3. P-Line Area ({unitShort})</th>
                <th className="py-2 px-3 text-right border-r border-slate-200">4. Lobby Area ({unitShort})</th>
                <th className="py-2 px-3 text-right border-r border-slate-200">5. Built-up for Owners ({unitShort})</th>
                <th className="py-2 px-3 text-right">6. Built-up for Sale ({unitShort})</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 font-mono">
              {floors.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center font-sans text-slate-500">
                    No floor rows configured. Click &ldquo;Sync From Building Config&rdquo;.
                  </td>
                </tr>
              ) : (
                floors.map((fl) => {
                  const ev = evalById.get(fl.id) || fl;
                  const isHabitable = fl.floor_type !== 'parking' && fl.floor_type !== 'terrace';

                  return (
                    <tr key={fl.id} className={isHabitable ? 'bg-white' : 'bg-slate-50/70 text-slate-500'}>
                      <td className="py-1.5 px-3 font-sans font-medium text-slate-800 border-r border-slate-200 whitespace-nowrap">
                        {fl.floor_name}
                      </td>
                      <td className="py-1.5 px-3 text-center border-r border-slate-200">
                        <PlainDecimalInput
                          decimals={2}
                          disabled={!canEdit}
                          value={fl.height_meters ?? 0}
                          className="w-20 px-1.5 py-0.5 text-center text-xs bg-white border border-slate-300 rounded font-mono disabled:bg-slate-100"
                          onChangeValue={(v) => onUpdateFloor(fl.id, { height_meters: v })}
                        />
                      </td>
                      <td className="py-1.5 px-3 text-right border-r border-slate-200">
                        <div className="inline-flex items-center gap-1">
                          {isHabitable ? (
                            <AreaUnitInput
                              decimals={2}
                              disabled={!canEdit}
                              valueSqm={fl.is_pline_overridden ? fl.pline_area_sqm : ev.pline_area_sqm}
                              unitDisplay={unitDisplay}
                              className={`w-24 px-1.5 py-0.5 text-right text-xs border rounded font-mono ${
                                fl.is_pline_overridden
                                  ? 'bg-amber-50 border-amber-400 font-semibold text-amber-900'
                                  : 'bg-white border-slate-300'
                              }`}
                              onChangeSqm={(sqm) =>
                                onUpdateFloor(fl.id, { pline_area_sqm: sqm, is_pline_overridden: true })
                              }
                            />
                          ) : (
                            <span className="text-slate-400">0.00</span>
                          )}
                          {fl.is_pline_overridden && canEdit && (
                            <button
                              type="button"
                              title="Reset manual P-Line override to equal distribution"
                              onClick={() => onUpdateFloor(fl.id, { is_pline_overridden: false }, true)}
                              className="text-amber-700 hover:text-amber-950"
                            >
                              <RotateCcw className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="py-1.5 px-3 text-right border-r border-slate-200">
                        <div className="inline-flex items-center gap-1">
                          {isHabitable ? (
                            <AreaUnitInput
                              decimals={2}
                              disabled={!canEdit}
                              valueSqm={fl.is_lobby_overridden ? fl.lobby_area_sqm : ev.lobby_area_sqm}
                              unitDisplay={unitDisplay}
                              className={`w-24 px-1.5 py-0.5 text-right text-xs border rounded font-mono ${
                                fl.is_lobby_overridden
                                  ? 'bg-amber-50 border-amber-400 font-semibold text-amber-900'
                                  : 'bg-white border-slate-300'
                              }`}
                              onChangeSqm={(sqm) =>
                                onUpdateFloor(fl.id, { lobby_area_sqm: sqm, is_lobby_overridden: true })
                              }
                            />
                          ) : (
                            <span className="text-slate-400">0.00</span>
                          )}
                          {fl.is_lobby_overridden && canEdit && (
                            <button
                              type="button"
                              title="Reset manual Lobby override to 15%"
                              onClick={() => onUpdateFloor(fl.id, { is_lobby_overridden: false }, true)}
                              className="text-amber-700 hover:text-amber-950"
                            >
                              <RotateCcw className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="py-1.5 px-3 text-right border-r border-slate-200">
                        {isHabitable ? (
                          <AreaUnitInput
                            decimals={2}
                            disabled={!canEdit}
                            valueSqm={fl.builtup_for_owners_sqm ?? ev.builtup_for_owners_sqm ?? 0}
                            unitDisplay={unitDisplay}
                            className="w-24 px-1.5 py-0.5 text-right text-xs bg-white border border-slate-300 rounded font-mono disabled:bg-slate-100"
                            onChangeSqm={(sqm) =>
                              onUpdateFloor(fl.id, { builtup_for_owners_sqm: sqm })
                            }
                          />
                        ) : (
                          <span className="text-slate-400">0.00</span>
                        )}
                      </td>
                      <td className="py-1.5 px-3 text-right font-semibold text-slate-900">
                        {formatArea(ev.builtup_for_sale_sqm, unitDisplay, 2)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            <tfoot>
              <tr className="bg-slate-100 font-bold border-t-2 border-slate-400 font-mono text-slate-900">
                <td className="py-2 px-3 font-sans border-r border-slate-200">TOTAL</td>
                <td className="py-2 px-3 text-center border-r border-slate-200">{formatNum(areaMetrics.totalHeightMeters, 2)} m</td>
                <td className="py-2 px-3 text-right border-r border-slate-200 text-emerald-900">{formatArea(areaMetrics.totalProposedPlineSqm, unitDisplay, 2)}</td>
                <td className="py-2 px-3 text-right border-r border-slate-200">{formatArea(areaMetrics.totalLobbyAreaSqm, unitDisplay, 2)}</td>
                <td className="py-2 px-3 text-right border-r border-slate-200">{formatArea(areaMetrics.totalBuiltupForOwnersSqm, unitDisplay, 2)}</td>
                <td className="py-2 px-3 text-right">{formatArea(areaMetrics.totalBuiltupForSaleSqm, unitDisplay, 2)}</td>
              </tr>
              <tr className="bg-slate-50 border-t border-slate-200 text-[11px]">
                <td colSpan={2} className="py-1.5 px-3 font-semibold text-slate-700 border-r border-slate-200">
                  Area Balance (Permissible H − Proposed Floor Sum)
                </td>
                <td className="py-1.5 px-3 text-right font-mono font-bold text-slate-900 border-r border-slate-200">
                  {formatArea(areaMetrics.areaBalanceSqm, unitDisplay, 2)}
                </td>
                <td colSpan={3} className="py-1.5 px-3 font-semibold text-slate-700">
                  Margin Required (Total Height H / 5):{' '}
                  <span className="font-mono font-bold text-slate-900">{formatNum(areaMetrics.marginHBy5Meters, 2)} m</span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
