// client/src/components/projects/feasibility/AreaStatementForm.jsx
import React, { useState } from 'react';
import {
  Building2,
  Calculator,
  Layers,
  RefreshCw,
  AlertTriangle,
  ShieldCheck,
  CheckCircle2,
  Sliders,
  ChevronDown,
  ChevronRight,
  Car,
  Info
} from 'lucide-react';
import { deriveTdrSplit, ROAD_WIDTH_TOTAL_TDR_MAP } from '../../../utils/feasibilityCalculations';

const ROAD_WIDTHS = [9, 12, 15, 18, 24];

const ROAD_WIDTH_TDR_MAP = {
  9: { regular: 0.20, slum: 0.20 },
  12: { regular: 0.325, slum: 0.325 },
  15: { regular: 0.40, slum: 0.40 },
  18: { regular: 0.45, slum: 0.45 },
  24: { regular: 0.575, slum: 0.575 }
};

export default function AreaStatementForm({
  statement = {},
  floors = [],
  areaMetrics = {},
  onUpdateStatement,
  onUpdateFloor,
  onReconcileFloors,
  unitDisplay = 'sq_m',
  isPrivileged
}) {
  const isSqft = unitDisplay === 'sq_ft';
  const unitFactor = isSqft ? 10.764 : 1;
  const unitLabel = isSqft ? 'sq ft' : 'sq m';

  const [showProjectOverrideModal, setShowProjectOverrideModal] = useState(false);
  const [projectOverrideVal, setProjectOverrideVal] = useState(statement.total_proposed_pline_override_sqm || '');
  const [projectOverrideReason, setProjectOverrideReason] = useState(statement.proposed_pline_override_reason || '');

  // Mobile/Tablet expandable floor cards state
  const [expandedFloorKeys, setExpandedFloorKeys] = useState({});

  const toggleFloorCard = (key) => {
    setExpandedFloorKeys((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Road-width & Dual TDR helper (50/50 split with override support)
  const roadWidth = parseFloat(statement.road_width_m);
  const totalTdrFromRoad = !isNaN(roadWidth) && ROAD_WIDTH_TOTAL_TDR_MAP[roadWidth] !== undefined
    ? ROAD_WIDTH_TOTAL_TDR_MAP[roadWidth]
    : 0.65;

  const currentTotalTdr = statement.total_tdr_factor !== undefined && !isNaN(parseFloat(statement.total_tdr_factor))
    ? parseFloat(statement.total_tdr_factor)
    : totalTdrFromRoad;

  const rawReqRegular = statement.regular_tdr_factor !== undefined && statement.regular_tdr_factor !== null
    ? statement.regular_tdr_factor
    : null;

  const tdrSplit = deriveTdrSplit(currentTotalTdr, rawReqRegular);
  const isRegularOverridden = tdrSplit.isRegularTdrOverridden;
  const effectiveRegularTdr = tdrSplit.regularTdrFactor;
  const effectiveSlumTdr = tdrSplit.slumTdrFactor;
  const isRegularExceedingTotal = (parseFloat(statement.regular_tdr_factor) || 0) > currentTotalTdr;

  let resolvedTdrBadge = null;
  if (!isNaN(roadWidth) && ROAD_WIDTH_TOTAL_TDR_MAP[roadWidth] !== undefined) {
    resolvedTdrBadge = `Road ${roadWidth}m: Total TDR ${totalTdrFromRoad.toFixed(3)} (50% Regular: ${(totalTdrFromRoad / 2).toFixed(3)} | 50% Slum: ${(totalTdrFromRoad / 2).toFixed(3)})`;
  }

  const handleRoadWidthChange = (val) => {
    const parsed = val ? parseFloat(val) : null;
    const newTotalTdr = parsed && ROAD_WIDTH_TOTAL_TDR_MAP[parsed] !== undefined
      ? ROAD_WIDTH_TOTAL_TDR_MAP[parsed]
      : 0.65;
    const split = deriveTdrSplit(newTotalTdr, null);
    onUpdateStatement({
      road_width_m: parsed,
      total_tdr_factor: newTotalTdr,
      regular_tdr_factor: split.regularTdrFactor,
      slum_tdr_factor: split.slumTdrFactor,
      is_regular_tdr_overridden: false
    });
  };

  const handleRegularTdrChange = (val) => {
    const parsed = val === '' ? '' : parseFloat(val);
    const split = deriveTdrSplit(currentTotalTdr, parsed === '' ? null : parsed);
    onUpdateStatement({
      regular_tdr_factor: val,
      slum_tdr_factor: split.slumTdrFactor,
      is_regular_tdr_overridden: split.isRegularTdrOverridden
    });
  };

  const handleResetRegularTdr = () => {
    const split = deriveTdrSplit(currentTotalTdr, null);
    onUpdateStatement({
      regular_tdr_factor: split.regularTdrFactor,
      slum_tdr_factor: split.slumTdrFactor,
      is_regular_tdr_overridden: false
    });
  };

  const handleGunthewariToggle = (gunthewariVal) => {
    onUpdateStatement({
      is_gunthewari: gunthewariVal
    });
  };

  const handleLobbyChange = (floor, newLobbyStr) => {
    onUpdateFloor(floor.id, {
      lobby_area_sqm: newLobbyStr,
      is_lobby_overridden: true
    });
  };

  const handleResetLobbyToDefault = (floor) => {
    const pline = parseFloat(floor.pline_area_sqm) || 0;
    onUpdateFloor(floor.id, {
      lobby_area_sqm: Math.round(pline * 0.15 * 100) / 100,
      is_lobby_overridden: false
    });
  };

  const handleResetFloorPline = (floor) => {
    onUpdateFloor(floor.id, {
      is_pline_overridden: false,
      pline_override_reason: null
    });
  };

  const handleSaveProjectPlineOverride = () => {
    const parsed = parseFloat(projectOverrideVal);
    if (!isNaN(parsed) && parsed >= 0) {
      onUpdateStatement({
        total_proposed_pline_override_sqm: parsed,
        is_proposed_pline_overridden: true,
        proposed_pline_override_reason: projectOverrideReason
      });
    }
    setShowProjectOverrideModal(false);
  };

  const handleResetProjectPlineOverride = () => {
    onUpdateStatement({
      total_proposed_pline_override_sqm: null,
      is_proposed_pline_overridden: false,
      proposed_pline_override_reason: null
    });
    setProjectOverrideVal('');
    setProjectOverrideReason('');
    setShowProjectOverrideModal(false);
  };

  const regTdr = parseFloat(statement.regular_tdr_factor) || 0;
  const slumTdr = parseFloat(statement.slum_tdr_factor) || 0;
  const combinedTdr = Math.round((regTdr + slumTdr) * 10000) / 10000;

  const permissiblePline = areaMetrics.permissiblePlineTotalSqm || 0;
  const calculatedProposedPline = areaMetrics.calculatedProposedPlineSqm || areaMetrics.proposedPlineTotalSqm || 0;
  const effectiveProposedPline = areaMetrics.effectiveProposedPlineSqm || calculatedProposedPline;
  const isProjectOverridden = Boolean(areaMetrics.isProposedPlineOverridden || statement.is_proposed_pline_overridden);

  // Parking configuration helper
  const parkingConfig = typeof statement.parking_config === 'string'
    ? (() => { try { return JSON.parse(statement.parking_config || '{}'); } catch { return {}; } })()
    : (statement.parking_config || {});

  const updateParkingConfig = (patch) => {
    const updatedCfg = { ...parkingConfig, ...patch };
    onUpdateStatement({ parking_config: updatedCfg });
  };

  const parkingReq = areaMetrics.parkingRequirements || {};

  return (
    <div className="space-y-6">
      {/* 1. Plot & Survey Baseline + 2. Building Use & Plot Regulatory Classification */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Plot & Survey Baseline */}
        <div className="lg:col-span-4 bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
          <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
            <Building2 size={14} className="text-[#E05A1E] shrink-0" />
            Plot &amp; Survey Baseline
          </h4>
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-slate-700 block">Plot Area ({unitLabel})</label>
            <input
              type="number"
              step="0.01"
              placeholder="e.g. 500"
              className="w-full text-sm bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-900 font-bold font-mono focus:outline-none focus:border-[#E05A1E]"
              value={statement.plot_area_sqm || ''}
              onChange={(e) => onUpdateStatement({ plot_area_sqm: e.target.value })}
              disabled={!isPrivileged}
            />
            <p className="text-[11px] text-muted leading-snug">
              Primary baseline for all FSI potential and permissible area calculations.
            </p>
          </div>
        </div>

        {/* Building Use & Plot Regulatory Classification */}
        <div className="lg:col-span-8 bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
          <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
            <Building2 size={14} className="text-[#E05A1E] shrink-0" />
            Building Use &amp; Plot Regulatory Classification
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-700 block">Building Use</label>
              <select
                className="w-full text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-2 text-slate-800 font-semibold focus:outline-none focus:border-[#E05A1E]"
                value={statement.building_use || 'Residential'}
                onChange={(e) => onUpdateStatement({ building_use: e.target.value })}
                disabled={!isPrivileged}
              >
                <option value="Residential">Residential (60% Ancillary FSI)</option>
                <option value="Commercial">Commercial (80% Ancillary FSI)</option>
                <option value="Mixed Use">Mixed Use (Commercial + Residential)</option>
              </select>
              <span className="text-[11px] text-muted block">
                {statement.building_use === 'Commercial' ? '80% Ancillary applied' : '60% Ancillary applied'}
              </span>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-700 block">Plot Classification</label>
              <select
                className="w-full text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-2 text-slate-800 font-semibold focus:outline-none focus:border-[#E05A1E]"
                value={statement.is_gunthewari ? 'gunthewari' : 'regular'}
                onChange={(e) => handleGunthewariToggle(e.target.value === 'gunthewari')}
                disabled={!isPrivileged}
              >
                <option value="regular">Regular Development Plot</option>
                <option value="gunthewari">Gunthewari Scheme Plot</option>
              </select>
              <span className="text-[11px] text-muted block">
                {statement.is_gunthewari ? 'Gunthewari status active' : 'Regular Development plot active'}
              </span>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-700 block">Road Width</label>
              <select
                className="w-full text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-2 text-slate-800 font-semibold focus:outline-none focus:border-[#E05A1E]"
                value={statement.road_width_m || ''}
                onChange={(e) => handleRoadWidthChange(e.target.value)}
                disabled={!isPrivileged}
              >
                <option value="">Select Road Width...</option>
                {ROAD_WIDTHS.map((rw) => (
                  <option key={rw} value={rw}>{rw} meters road</option>
                ))}
              </select>
              {resolvedTdrBadge && (
                <span className="text-[11px] text-[#E05A1E] font-medium block leading-snug">
                  {resolvedTdrBadge}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 3. Regulatory FSI & Dual TDR Assumptions */}
      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
            <Calculator size={14} className="text-[#E05A1E] shrink-0" />
            Regulatory FSI &amp; Dual TDR Assumptions
          </h4>
          <span className="text-[11px] font-bold text-[#E05A1E] bg-orange-50 px-2.5 py-0.5 rounded-full border border-orange-200">
            Total TDR Factor: {currentTotalTdr.toFixed(3)}
          </span>
        </div>

        {/* Visual formula breakdown banner */}
        <div className={`p-2.5 rounded-lg border text-xs flex flex-wrap items-center justify-between gap-2 ${isRegularOverridden ? 'bg-amber-50/80 border-amber-300 text-amber-950' : 'bg-blue-50/80 border-blue-200 text-blue-950'}`}>
          <div className="flex items-center gap-2">
            <Info size={14} className={isRegularOverridden ? 'text-amber-600 shrink-0' : 'text-blue-600 shrink-0'} />
            <span>
              <strong>TDR Formula:</strong> Regular TDR ({effectiveRegularTdr.toFixed(3)}) + Slum TDR ({effectiveSlumTdr.toFixed(3)}) = Total TDR ({currentTotalTdr.toFixed(3)})
            </span>
          </div>
          <div className="flex items-center gap-2">
            {isRegularOverridden ? (
              <span className="text-[10px] font-bold px-2 py-0.5 bg-amber-200 text-amber-900 rounded flex items-center gap-1">
                <Sliders size={10} /> Admin Overridden
              </span>
            ) : (
              <span className="text-[10px] font-bold px-2 py-0.5 bg-blue-100 text-blue-800 rounded">
                Default 50 / 50 Split
              </span>
            )}
          </div>
        </div>

        {isRegularExceedingTotal && (
          <div className="p-2.5 bg-red-50 border border-red-300 rounded-lg flex items-center gap-2 text-xs text-red-800">
            <AlertTriangle size={14} className="text-red-600 shrink-0" />
            <span>
              <strong>Constraint Violation:</strong> Regular TDR ({parseFloat(statement.regular_tdr_factor)}) cannot exceed Total TDR ({currentTotalTdr}). Slum TDR is clamped to 0. Please correct the value.
            </span>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-600 block">Basic FSI Factor</label>
            <input
              type="number"
              step="0.01"
              className="w-full text-xs bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-800 font-mono font-semibold focus:outline-none focus:border-[#E05A1E]"
              value={statement.basic_fsi_factor !== undefined ? statement.basic_fsi_factor : 1.1}
              onChange={(e) => onUpdateStatement({ basic_fsi_factor: e.target.value })}
              disabled={!isPrivileged}
            />
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-600 block">Paid FSI Factor</label>
            <input
              type="number"
              step="0.01"
              className="w-full text-xs bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-800 font-mono font-semibold focus:outline-none focus:border-[#E05A1E]"
              value={statement.paid_fsi_factor !== undefined ? statement.paid_fsi_factor : 0.5}
              onChange={(e) => onUpdateStatement({ paid_fsi_factor: e.target.value })}
              disabled={!isPrivileged}
            />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between gap-1">
              <label className="text-[11px] font-semibold text-slate-600">Regular TDR Factor</label>
              {isRegularOverridden && isPrivileged && (
                <button
                  type="button"
                  onClick={handleResetRegularTdr}
                  className="text-[10px] text-red-600 hover:underline flex items-center gap-0.5 font-semibold"
                  title="Reset to 50/50 default split"
                >
                  <RefreshCw size={9} /> Reset (50%)
                </button>
              )}
            </div>
            <div className="relative">
              <input
                type="number"
                step="0.001"
                className={`w-full text-xs border rounded-lg px-3 py-2 font-mono font-bold focus:outline-none focus:border-[#E05A1E] ${
                  isRegularOverridden ? 'bg-amber-50 border-amber-300 text-amber-950' : 'bg-white border-slate-200 text-slate-800'
                }`}
                value={statement.regular_tdr_factor !== undefined && statement.regular_tdr_factor !== null ? statement.regular_tdr_factor : effectiveRegularTdr}
                onChange={(e) => handleRegularTdrChange(e.target.value)}
                disabled={!isPrivileged}
              />
              {isRegularOverridden && (
                <span className="absolute right-2 top-2 text-[9px] font-bold px-1.5 py-0.5 bg-amber-200 text-amber-900 rounded">
                  Override
                </span>
              )}
            </div>
            <span className="text-[10px] text-slate-500">
              Default 50%: {tdrSplit.defaultRegularTdrFactor.toFixed(3)}
            </span>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between gap-1">
              <label className="text-[11px] font-semibold text-slate-600">Slum TDR Factor</label>
              <span className="text-[10px] text-slate-500 font-medium">Remainder</span>
            </div>
            <div className="w-full text-xs bg-slate-100 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 font-bold font-mono">
              {effectiveSlumTdr.toFixed(3)}
            </div>
            <span className="text-[10px] text-slate-500">
              Auto: Total ({currentTotalTdr.toFixed(3)}) − Regular ({effectiveRegularTdr.toFixed(3)})
            </span>
          </div>
        </div>
      </div>

      {/* 4. Permissible and Proposed P-Line Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Permissible Potential */}
        <div className="bg-emerald-50/50 p-4 rounded-xl border border-emerald-200 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-bold text-emerald-900 uppercase tracking-wider flex items-center gap-1.5">
              <ShieldCheck size={14} className="text-emerald-600 shrink-0" />
              Total Permissible P-Line
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded">
              Independent Potential
            </span>
          </div>
          <div className="text-2xl font-black text-emerald-950 font-mono">
            {(permissiblePline * unitFactor).toFixed(2)} <span className="text-sm font-semibold">{unitLabel}</span>
          </div>
          <div className="text-[11px] text-emerald-800/80 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span>Built-up FSI: <strong className="font-mono">{((areaMetrics.permissibleTotalBuiltupSqm || 0) * unitFactor).toFixed(2)}</strong> {unitLabel}</span>
              <span>•</span>
              <span>Total Ancillary: <strong className="font-mono">{((areaMetrics.permissibleTotalAncillarySqm || areaMetrics.permissibleAncillaryResSqm || 0) * unitFactor).toFixed(2)}</strong> {unitLabel}</span>
            </div>
            {statement.building_use === 'Mixed Use' && (
              <div className="text-[10px] bg-emerald-100/60 p-1.5 rounded text-emerald-900 flex flex-wrap items-center gap-2">
                <span>Res Ancillary (60%): <strong className="font-mono">{((areaMetrics.permissibleResidentialAncillarySqm || 0) * unitFactor).toFixed(2)}</strong></span>
                <span>|</span>
                <span>Comm Ancillary (80%): <strong className="font-mono">{((areaMetrics.permissibleCommercialAncillarySqm || 0) * unitFactor).toFixed(2)}</strong></span>
              </div>
            )}
            {statement.building_use === 'Mixed Use' && areaMetrics.sourceUnallocatedPermissiblePlineSqm && (
              <div className="text-[10px] bg-emerald-100/40 p-1.5 rounded text-emerald-900 flex flex-wrap items-center justify-between gap-1 border border-emerald-200">
                <span>Historical Source Potential: <strong className="font-mono">{((areaMetrics.sourceUnallocatedPermissiblePlineSqm || 0) * unitFactor).toFixed(2)}</strong> {unitLabel}</span>
                <span className="text-[9px] text-emerald-700">(Dual Ancillary Baseline)</span>
              </div>
            )}
            <div className="text-[11px] text-emerald-700">
              Calculated from Plot ({((parseFloat(statement.plot_area_sqm) || 0) * unitFactor).toFixed(2)} {unitLabel}) × Permissible Factors
            </div>
          </div>
        </div>

        {/* Proposed Development & Equal Distribution Source */}
        <div className={`p-4 rounded-xl border space-y-2 ${isProjectOverridden ? 'bg-amber-50/60 border-amber-300' : 'bg-orange-50/50 border-orange-200'}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
              <Calculator size={14} className="text-[#E05A1E] shrink-0" />
              Total Proposed P-Line
            </span>
            <div className="flex items-center gap-2 flex-wrap">
              {isProjectOverridden ? (
                <span className="text-[10px] font-bold px-2 py-0.5 bg-amber-200 text-amber-900 rounded flex items-center gap-1">
                  <Sliders size={10} /> Override Active
                </span>
              ) : (
                <span className="text-[10px] font-bold px-2 py-0.5 bg-orange-100 text-[#E05A1E] rounded flex items-center gap-1">
                  <CheckCircle2 size={10} /> Auto-Calculated
                </span>
              )}
              {isPrivileged && (
                <button
                  type="button"
                  onClick={() => setShowProjectOverrideModal(true)}
                  className="text-[11px] text-[#E05A1E] hover:underline font-semibold"
                >
                  {isProjectOverridden ? 'Edit Override' : 'Override Total'}
                </button>
              )}
            </div>
          </div>

          <div className="text-2xl font-black text-slate-900 font-mono">
            {(effectiveProposedPline * unitFactor).toFixed(2)} <span className="text-sm font-semibold">{unitLabel}</span>
          </div>

          <div className="text-[11px] text-slate-600 space-y-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>
                {isProjectOverridden ? (
                  <span className="text-amber-800 font-medium">Calculated: {(calculatedProposedPline * unitFactor).toFixed(2)} {unitLabel}</span>
                ) : (
                  <span>Distributed across {areaMetrics.applicableHabitableFloorsCount || floors.filter(f => f.floor_type !== 'parking' && f.floor_type !== 'terrace').length} habitable floors</span>
                )}
              </span>
              {isProjectOverridden && isPrivileged && (
                <button
                  type="button"
                  onClick={handleResetProjectPlineOverride}
                  className="text-[11px] text-red-600 hover:underline flex items-center gap-0.5 font-semibold"
                >
                  <RefreshCw size={10} /> Reset to Calculated
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-orange-200/60 text-[11px]">
              <span className="text-slate-700">
                Floor Sum: <strong className="font-mono">{((areaMetrics.floorSumPlineSqm || 0) * unitFactor).toFixed(2)}</strong> {unitLabel}
              </span>
              {areaMetrics.sourceProposedPlineDifferenceSqm !== undefined && Math.abs(areaMetrics.sourceProposedPlineDifferenceSqm) > 0.001 && (
                <span className="text-amber-800 bg-amber-100/90 border border-amber-300 px-2 py-0.5 rounded text-[10px] font-semibold" title="Benchmark residual difference between target P-Line and floor sum">
                  Benchmark Diff: {areaMetrics.sourceProposedPlineDifferenceSqm > 0 ? `+${areaMetrics.sourceProposedPlineDifferenceSqm.toFixed(3)}` : areaMetrics.sourceProposedPlineDifferenceSqm.toFixed(3)} sq m
                </span>
              )}
            </div>
            {statement.building_use === 'Mixed Use' && (
              <div className="text-[10px] bg-orange-100/60 p-1.5 rounded text-orange-900 flex flex-wrap items-center gap-2">
                <span>Res FSI: <strong className="font-mono">{((areaMetrics.proposedResidentialFsiSqm || 0) * unitFactor).toFixed(2)}</strong> (60%: {((areaMetrics.proposedResidentialAncillarySqm || 0) * unitFactor).toFixed(2)})</span>
                <span>|</span>
                <span>Comm FSI: <strong className="font-mono">{((areaMetrics.proposedCommercialFsiSqm || 0) * unitFactor).toFixed(2)}</strong> (80%: {((areaMetrics.proposedCommercialAncillarySqm || 0) * unitFactor).toFixed(2)})</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Project Override Modal Dialog */}
      {showProjectOverrideModal && (
        <div className="p-4 bg-amber-50 rounded-xl border border-amber-300 space-y-3">
          <h5 className="text-xs font-bold text-amber-950 uppercase tracking-wider flex items-center gap-1.5">
            <Sliders size={14} className="text-amber-700" />
            Override Total Proposed P-Line Area
          </h5>
          <p className="text-xs text-amber-900">
            Engine-calculated proposed P-Line is <strong className="font-mono">{calculatedProposedPline.toFixed(2)} sq m</strong>. Entering an override will redistribute the updated target equally across all applicable floors.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-700">Target Proposed P-Line (sq m)</label>
              <input
                type="number"
                step="0.01"
                placeholder={calculatedProposedPline.toFixed(2)}
                className="w-full text-xs bg-white border border-amber-300 rounded-lg px-3 py-2 font-bold font-mono text-slate-900 focus:outline-none focus:border-[#E05A1E]"
                value={projectOverrideVal}
                onChange={(e) => setProjectOverrideVal(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-700">Justification / Reason</label>
              <input
                type="text"
                placeholder="e.g. Architect revised client brief"
                className="w-full text-xs bg-white border border-amber-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:border-[#E05A1E]"
                value={projectOverrideReason}
                onChange={(e) => setProjectOverrideReason(e.target.value)}
              />
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setShowProjectOverrideModal(false)}
              className="text-xs px-3 py-1.5 text-slate-600 hover:text-slate-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveProjectPlineOverride}
              className="btn-primary text-xs py-1.5 px-3"
            >
              Apply Override
            </button>
          </div>
        </div>
      )}

      {/* 5. Centralised Building Structure */}
      <div className="bg-sky-50/70 p-4 rounded-xl border border-sky-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <Layers className="text-sky-600 shrink-0 mt-0.5" size={16} />
          <div>
            <h5 className="text-xs font-bold text-sky-950">
              Centralised Building Structure ({floors.length} configured floors)
            </h5>
            <p className="text-[11px] text-sky-800 leading-relaxed">
              Building Configuration is the sole authoritative source for floors, basements and vertical hierarchy. Equal P-Line distribution flows automatically to habitable levels.
            </p>
          </div>
        </div>
        {isPrivileged && (
          <button
            type="button"
            onClick={onReconcileFloors}
            className="text-xs px-3 py-1.5 bg-sky-100 hover:bg-sky-200 text-sky-900 font-bold rounded-lg border border-sky-300 flex items-center gap-1.5 shrink-0 self-start sm:self-center transition-colors"
            title="Re-synchronize floor records from Building Configuration"
          >
            <RefreshCw size={12} />
            Re-sync Floors
          </button>
        )}
      </div>

      {/* Inconsistency Warning Alert */}
      {areaMetrics.isPlineInconsistent && (
        <div className="p-3.5 bg-amber-50 rounded-xl border border-amber-300 flex items-center gap-3 text-amber-900">
          <AlertTriangle className="text-amber-600 shrink-0" size={18} />
          <div className="text-xs font-semibold">
            {areaMetrics.plineInconsistencyMessage || 'Total overridden floor P-Lines exceed project proposed P-Line. Please review floor overrides.'}
          </div>
        </div>
      )}

      {/* 6. Floor-wise Proposed P-Line Area Statement */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
          <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
            <Layers size={14} className="text-[#E05A1E] shrink-0" />
            Floor-wise Proposed P-Line Area Statement ({floors.length} levels)
          </h4>
          <span className="text-[11px] text-muted">
            Formula: FSI + Ancillary = P-Line | Lobby = 15% | Sale = P-Line − Lobby | Unit Area = Sale ÷ Units
          </span>
        </div>

        {/* Desktop Full-Width Table (xl and up — zero nested horizontal scroll) */}
        <div className="hidden xl:block border border-slate-200 rounded-xl bg-white overflow-hidden">
          <table className="w-full text-xs text-left border-collapse">
            <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-700 uppercase tracking-wider">
              <tr>
                <th className="px-2.5 py-2.5">1. Floor Level</th>
                <th className="px-2 py-2.5 text-center">2. Use</th>
                <th className="px-2 py-2.5 text-center">3. Height (m)</th>
                <th className="px-2 py-2.5 text-right">4. FSI ({unitLabel})</th>
                <th className="px-2 py-2.5 text-right">5. Ancillary ({unitLabel})</th>
                <th className="px-2 py-2.5 text-right">6. P-Line ({unitLabel})</th>
                <th className="px-2 py-2.5 text-right">7. Lobby ({unitLabel})</th>
                <th className="px-2 py-2.5 text-right">8. Saleable ({unitLabel})</th>
                <th className="px-2 py-2.5 text-center">9. Units</th>
                <th className="px-2.5 py-2.5 text-right">10. Area/Unit ({unitLabel})</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {floors.map((floor, idx) => {
                const isParking = floor.floor_type === 'parking';
                const isTerrace = floor.floor_type === 'terrace';
                const isHabitable = !isParking && !isTerrace;
                const isPlineOverridden = Boolean(floor.is_pline_overridden);
                const isLobbyOverridden = Boolean(floor.is_lobby_overridden);
                const plineVal = parseFloat(floor.pline_area_sqm) || 0;
                const fsiVal = parseFloat(floor.fsi_area_sqm) || 0;
                const ancillaryVal = parseFloat(floor.ancillary_area_sqm) || 0;
                const ancPct = floor.ancillary_pct || (floor.usage_type === 'Commercial' ? 0.8 : 0.6);
                const lobbyVal = parseFloat(floor.lobby_area_sqm) || 0;
                const saleVal = parseFloat(floor.builtup_for_sale_sqm) || 0;
                const units = parseInt(floor.no_of_units, 10) || 0;
                const area1Unit = parseFloat(floor.area_for_1_unit) || 0;
                const floorUsage = floor.usage_type || (statement.building_use === 'Commercial' ? 'Commercial' : (isParking ? 'Parking' : isTerrace ? 'Terrace' : 'Residential'));

                return (
                  <tr
                    key={floor.id || floor.floor_key || idx}
                    className={`hover:bg-slate-50/70 transition-colors ${isParking ? 'bg-amber-50/30' : isTerrace ? 'bg-slate-50/40' : ''}`}
                  >
                    <td className="px-2.5 py-2 font-bold text-slate-800">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span>{floor.floor_name}</span>
                        {isParking && (
                          <span className="text-[9px] px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded font-semibold">Parking</span>
                        )}
                        {isTerrace && (
                          <span className="text-[9px] px-1.5 py-0.5 bg-slate-200 text-slate-700 rounded font-semibold">Terrace</span>
                        )}
                      </div>
                    </td>

                    <td className="px-2 py-2 text-center">
                      {isHabitable ? (
                        statement.building_use === 'Mixed Use' ? (
                          <select
                            className="text-[11px] bg-white border border-slate-200 rounded px-1.5 py-1 font-semibold text-slate-700 focus:outline-none focus:border-[#E05A1E]"
                            value={floor.usage_type || 'Residential'}
                            onChange={(e) => onUpdateFloor(floor.id, { usage_type: e.target.value })}
                            disabled={!isPrivileged}
                          >
                            <option value="Residential">Residential (60%)</option>
                            <option value="Commercial">Commercial (80%)</option>
                          </select>
                        ) : (
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${floorUsage === 'Commercial' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'}`}>
                            {floorUsage}
                          </span>
                        )
                      ) : (
                        <span className="text-slate-400 font-mono text-[10px]">{isParking ? 'Parking' : 'Terrace'}</span>
                      )}
                    </td>

                    <td className="px-2 py-2 text-center">
                      <input
                        type="number"
                        step="0.01"
                        className="w-14 text-center text-xs bg-slate-50 border border-slate-200 rounded px-1 py-1 text-slate-700 focus:outline-none focus:border-[#E05A1E]"
                        value={floor.height_meters || 3.00}
                        onChange={(e) => onUpdateFloor(floor.id, { height_meters: e.target.value })}
                        disabled={!isPrivileged}
                      />
                    </td>

                    <td className="px-2 py-2 text-right font-mono font-semibold text-slate-800 tabular-nums">
                      {isHabitable ? (fsiVal * unitFactor).toFixed(2) : '0.00'}
                    </td>

                    <td className="px-2 py-2 text-right font-mono text-slate-700 tabular-nums">
                      {isHabitable ? (
                        <span>
                          {(ancillaryVal * unitFactor).toFixed(2)}{' '}
                          <span className="text-[10px] text-muted">({Math.round(ancPct * 100)}%)</span>
                        </span>
                      ) : (
                        <span className="text-slate-400">0.00</span>
                      )}
                    </td>

                    <td className="px-2 py-2 text-right">
                      {isHabitable ? (
                        <div className="flex items-center justify-end gap-1">
                          <input
                            type="number"
                            step="0.01"
                            className={`w-20 text-right text-xs border rounded px-1.5 py-1 font-bold font-mono ${isPlineOverridden ? 'bg-amber-50 border-amber-300 text-amber-900' : 'bg-white border-slate-200 text-slate-800 focus:border-[#E05A1E]'}`}
                            value={plineVal || ''}
                            onChange={(e) => onUpdateFloor(floor.id, {
                              pline_area_sqm: e.target.value,
                              is_pline_overridden: true
                            })}
                            disabled={!isPrivileged}
                            title={isPlineOverridden ? (floor.pline_override_reason || 'Manual P-Line override') : 'Equal share'}
                          />
                          {isPlineOverridden && isPrivileged && (
                            <button
                              type="button"
                              onClick={() => handleResetFloorPline(floor)}
                              className="text-slate-400 hover:text-red-600 p-0.5"
                              title="Reset to Equal Share"
                            >
                              <RefreshCw size={11} />
                            </button>
                          )}
                        </div>
                      ) : (
                        <span className="font-mono text-slate-400">0.00</span>
                      )}
                    </td>

                    <td className="px-2 py-2 text-right">
                      {isHabitable ? (
                        <div className="flex items-center justify-end gap-1">
                          {isLobbyOverridden && isPrivileged && (
                            <button
                              type="button"
                              onClick={() => handleResetLobbyToDefault(floor)}
                              className="text-slate-400 hover:text-[#E05A1E] p-0.5"
                              title="Reset Lobby to 15% default"
                            >
                              <RefreshCw size={10} />
                            </button>
                          )}
                          <input
                            type="number"
                            step="0.01"
                            className={`w-16 text-right text-xs border rounded px-1.5 py-1 font-mono ${isLobbyOverridden ? 'bg-orange-50 border-orange-300 font-semibold text-orange-950' : 'bg-slate-50 border-slate-200 text-slate-700'}`}
                            value={lobbyVal || ''}
                            onChange={(e) => handleLobbyChange(floor, e.target.value)}
                            disabled={!isPrivileged}
                          />
                        </div>
                      ) : (
                        <span className="font-mono text-slate-400">0.00</span>
                      )}
                    </td>

                    <td className="px-2 py-2 text-right font-mono font-bold text-[#E05A1E] tabular-nums">
                      {isHabitable ? (saleVal * unitFactor).toFixed(2) : '0.00'}
                    </td>

                    <td className="px-2 py-2 text-center">
                      {isHabitable ? (
                        <input
                          type="number"
                          min="0"
                          className="w-14 text-center text-xs font-bold bg-white border border-slate-200 rounded px-1 py-1 text-slate-800 focus:outline-none focus:border-[#E05A1E]"
                          value={units}
                          onChange={(e) => onUpdateFloor(floor.id, { no_of_units: e.target.value })}
                          disabled={!isPrivileged}
                        />
                      ) : (
                        <span className="text-slate-400 font-mono">0</span>
                      )}
                    </td>

                    <td className="px-2.5 py-2 text-right font-mono font-bold text-slate-800 tabular-nums">
                      {isHabitable ? (units > 0 ? (area1Unit * unitFactor).toFixed(2) : '0.00') : '0.00'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-slate-50 border-t-2 border-slate-200 font-bold text-[11px] text-slate-800">
              <tr>
                <td className="px-2.5 py-2.5 uppercase tracking-wider text-slate-600">
                  Total ({floors.length})
                </td>
                <td className="px-2 py-2.5 text-center text-slate-400 font-normal">—</td>
                <td className="px-2 py-2.5 text-center font-mono">
                  {(areaMetrics.totalHeightMeters || 0).toFixed(2)} m
                </td>
                <td className="px-2 py-2.5 text-right font-mono text-slate-800 font-bold">
                  {((areaMetrics.proposedTotalFsiSqm || 0) * unitFactor).toFixed(2)}
                </td>
                <td className="px-2 py-2.5 text-right font-mono text-slate-700">
                  {((areaMetrics.totalProposedAncillarySqm || 0) * unitFactor).toFixed(2)}
                </td>
                <td className="px-2 py-2.5 text-right font-mono text-slate-900 font-black">
                  {((areaMetrics.totalProposedPlineSqm || 0) * unitFactor).toFixed(2)}
                </td>
                <td className="px-2 py-2.5 text-right font-mono text-slate-700">
                  {((areaMetrics.totalLobbyAreaSqm || 0) * unitFactor).toFixed(2)}
                </td>
                <td className="px-2 py-2.5 text-right font-mono text-[#E05A1E] font-black">
                  {((areaMetrics.totalBuiltupForSaleSqm || 0) * unitFactor).toFixed(2)}
                </td>
                <td className="px-2 py-2.5 text-center font-mono font-black text-slate-900">
                  {areaMetrics.totalUnitsCount || 0}
                </td>
                <td className="px-2.5 py-2.5 text-right text-slate-400 font-normal">—</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Mobile & Tablet Expandable Floor Cards (< xl — zero horizontal scroll) */}
        <div className="xl:hidden space-y-2.5">
          {floors.map((floor, idx) => {
            const floorKey = floor.id || floor.floor_key || idx;
            const isExpanded = Boolean(expandedFloorKeys[floorKey]);
            const isParking = floor.floor_type === 'parking';
            const isTerrace = floor.floor_type === 'terrace';
            const isHabitable = !isParking && !isTerrace;
            const isPlineOverridden = Boolean(floor.is_pline_overridden);
            const isLobbyOverridden = Boolean(floor.is_lobby_overridden);
            const plineVal = parseFloat(floor.pline_area_sqm) || 0;
            const fsiVal = parseFloat(floor.fsi_area_sqm) || 0;
            const ancillaryVal = parseFloat(floor.ancillary_area_sqm) || 0;
            const ancPct = floor.ancillary_pct || (floor.usage_type === 'Commercial' ? 0.8 : 0.6);
            const lobbyVal = parseFloat(floor.lobby_area_sqm) || 0;
            const saleVal = parseFloat(floor.builtup_for_sale_sqm) || 0;
            const units = parseInt(floor.no_of_units, 10) || 0;
            const area1Unit = parseFloat(floor.area_for_1_unit) || 0;
            const floorUsage = floor.usage_type || (statement.building_use === 'Commercial' ? 'Commercial' : (isParking ? 'Parking' : isTerrace ? 'Terrace' : 'Residential'));

            return (
              <div
                key={floorKey}
                className={`rounded-xl border border-slate-200 overflow-hidden bg-white ${isParking ? 'bg-amber-50/30' : ''}`}
              >
                <button
                  type="button"
                  onClick={() => toggleFloorCard(floorKey)}
                  className="w-full px-3.5 py-2.5 flex items-center justify-between gap-2 text-left bg-slate-50/80 hover:bg-slate-100/70 transition-colors"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-bold text-slate-900">{floor.floor_name}</span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        isParking ? 'bg-amber-100 text-amber-800' :
                        isTerrace ? 'bg-slate-200 text-slate-700' :
                        floorUsage === 'Commercial' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'
                      }`}>
                        {isParking ? 'Parking' : isTerrace ? 'Terrace' : floorUsage}
                      </span>
                      {isPlineOverridden && (
                        <span className="text-[9px] px-1.5 py-0.5 bg-amber-100 text-amber-900 rounded font-bold">Override</span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-600 mt-0.5 font-mono">
                      P-Line: <strong>{(plineVal * unitFactor).toFixed(2)}</strong> • Sale: <strong className="text-[#E05A1E]">{(saleVal * unitFactor).toFixed(2)}</strong> • Units: <strong>{units}</strong>
                    </div>
                  </div>
                  {isExpanded ? <ChevronDown size={15} className="text-slate-500 shrink-0" /> : <ChevronRight size={15} className="text-slate-500 shrink-0" />}
                </button>

                {isExpanded && (
                  <div className="p-3.5 border-t border-slate-100 grid grid-cols-2 gap-3 text-xs">
                    {isHabitable && statement.building_use === 'Mixed Use' && (
                      <div className="col-span-2 space-y-1">
                        <label className="text-[11px] font-semibold text-slate-600 block">Building Use</label>
                        <select
                          className="w-full text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 font-semibold text-slate-700"
                          value={floor.usage_type || 'Residential'}
                          onChange={(e) => onUpdateFloor(floor.id, { usage_type: e.target.value })}
                          disabled={!isPrivileged}
                        >
                          <option value="Residential">Residential (60%)</option>
                          <option value="Commercial">Commercial (80%)</option>
                        </select>
                      </div>
                    )}

                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-slate-600 block">Height (m)</label>
                      <input
                        type="number"
                        step="0.01"
                        className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-800 font-mono"
                        value={floor.height_meters || 3.00}
                        onChange={(e) => onUpdateFloor(floor.id, { height_meters: e.target.value })}
                        disabled={!isPrivileged}
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-slate-600 block">No. of Units</label>
                      {isHabitable ? (
                        <input
                          type="number"
                          min="0"
                          className="w-full text-xs font-bold bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-800 font-mono"
                          value={units}
                          onChange={(e) => onUpdateFloor(floor.id, { no_of_units: e.target.value })}
                          disabled={!isPrivileged}
                        />
                      ) : (
                        <div className="text-xs font-mono text-slate-400 py-1.5">0</div>
                      )}
                    </div>

                    <div className="space-y-0.5">
                      <span className="text-[11px] text-slate-500 block">FSI Area ({unitLabel})</span>
                      <span className="font-mono font-semibold text-slate-800">{isHabitable ? (fsiVal * unitFactor).toFixed(2) : '0.00'}</span>
                    </div>

                    <div className="space-y-0.5">
                      <span className="text-[11px] text-slate-500 block">Ancillary ({Math.round(ancPct * 100)}%)</span>
                      <span className="font-mono font-semibold text-slate-800">{isHabitable ? (ancillaryVal * unitFactor).toFixed(2) : '0.00'}</span>
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] font-semibold text-slate-600">Proposed P-Line (sq m)</label>
                        {isPlineOverridden && isPrivileged && (
                          <button
                            type="button"
                            onClick={() => handleResetFloorPline(floor)}
                            className="text-[10px] text-red-600 hover:underline flex items-center gap-0.5"
                          >
                            <RefreshCw size={9} /> Reset
                          </button>
                        )}
                      </div>
                      {isHabitable ? (
                        <input
                          type="number"
                          step="0.01"
                          className={`w-full text-xs border rounded-lg px-2.5 py-1.5 font-bold font-mono ${isPlineOverridden ? 'bg-amber-50 border-amber-300 text-amber-900' : 'bg-white border-slate-200 text-slate-800'}`}
                          value={plineVal || ''}
                          onChange={(e) => onUpdateFloor(floor.id, {
                            pline_area_sqm: e.target.value,
                            is_pline_overridden: true
                          })}
                          disabled={!isPrivileged}
                        />
                      ) : (
                        <div className="text-xs font-mono text-slate-400 py-1.5">0.00</div>
                      )}
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] font-semibold text-slate-600">Lobby Area (sq m)</label>
                        {isLobbyOverridden && isPrivileged && (
                          <button
                            type="button"
                            onClick={() => handleResetLobbyToDefault(floor)}
                            className="text-[10px] text-[#E05A1E] hover:underline flex items-center gap-0.5"
                          >
                            <RefreshCw size={9} /> Reset
                          </button>
                        )}
                      </div>
                      {isHabitable ? (
                        <input
                          type="number"
                          step="0.01"
                          className={`w-full text-xs border rounded-lg px-2.5 py-1.5 font-mono ${isLobbyOverridden ? 'bg-orange-50 border-orange-300 font-semibold text-orange-950' : 'bg-slate-50 border-slate-200 text-slate-700'}`}
                          value={lobbyVal || ''}
                          onChange={(e) => handleLobbyChange(floor, e.target.value)}
                          disabled={!isPrivileged}
                        />
                      ) : (
                        <div className="text-xs font-mono text-slate-400 py-1.5">0.00</div>
                      )}
                    </div>

                    <div className="space-y-0.5">
                      <span className="text-[11px] text-slate-500 block">Built-up Sale ({unitLabel})</span>
                      <span className="font-mono font-bold text-[#E05A1E]">{isHabitable ? (saleVal * unitFactor).toFixed(2) : '0.00'}</span>
                    </div>

                    <div className="space-y-0.5">
                      <span className="text-[11px] text-slate-500 block">Area for 1 Unit ({unitLabel})</span>
                      <span className="font-mono font-bold text-slate-800">{isHabitable && units > 0 ? (area1Unit * unitFactor).toFixed(2) : '0.00'}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Mobile Totals Card */}
          <div className="bg-slate-100 p-3.5 rounded-xl border border-slate-200 grid grid-cols-2 gap-2.5 text-xs">
            <div>
              <span className="text-[10px] text-slate-500 uppercase font-semibold block">Total Proposed P-Line</span>
              <span className="font-mono font-black text-slate-900">{((areaMetrics.totalProposedPlineSqm || 0) * unitFactor).toFixed(2)} {unitLabel}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 uppercase font-semibold block">Total Built-up Sale</span>
              <span className="font-mono font-black text-[#E05A1E]">{((areaMetrics.totalBuiltupForSaleSqm || 0) * unitFactor).toFixed(2)} {unitLabel}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 uppercase font-semibold block">Total Height / Units</span>
              <span className="font-mono font-bold text-slate-800">{(areaMetrics.totalHeightMeters || 0).toFixed(2)} m / {areaMetrics.totalUnitsCount || 0} units</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 uppercase font-semibold block">Total Lobby Area</span>
              <span className="font-mono font-bold text-slate-800">{((areaMetrics.totalLobbyAreaSqm || 0) * unitFactor).toFixed(2)} {unitLabel}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 7. FSI Compliance Summary */}
      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
        <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
          <ShieldCheck size={14} className="text-emerald-600 shrink-0" />
          FSI Compliance Summary (Dividing Factor {statement.dividing_factor || 1.6})
        </h4>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white p-3 rounded-lg border border-slate-200">
            <span className="text-[11px] text-slate-500 font-semibold block">Base Dividing Area</span>
            <span className="font-mono text-sm font-bold text-slate-900">
              {((areaMetrics.baseDividingFactorSqm || 0) * unitFactor).toFixed(2)} <span className="text-[11px] font-normal text-slate-500">{unitLabel}</span>
            </span>
          </div>
          <div className="bg-white p-3 rounded-lg border border-slate-200">
            <span className="text-[11px] text-slate-500 font-semibold block">Derived Ancillary Area</span>
            <span className="font-mono text-sm font-bold text-slate-900">
              {((areaMetrics.derivedAncillaryAreaSqm || 0) * unitFactor).toFixed(2)} <span className="text-[11px] font-normal text-slate-500">{unitLabel}</span>
            </span>
          </div>
          <div className="bg-white p-3 rounded-lg border border-slate-200">
            <span className="text-[11px] text-slate-500 font-semibold block">Paid FSI Required</span>
            <span className="font-mono text-sm font-bold text-slate-900">
              {((areaMetrics.paidFsiRequiredSqm || 0) * unitFactor).toFixed(2)} <span className="text-[11px] font-normal text-slate-500">{unitLabel}</span>
            </span>
          </div>
          <div className="bg-white p-3 rounded-lg border border-slate-200">
            <span className="text-[11px] text-slate-500 font-semibold block">Area Potential Balance</span>
            <span className={`font-mono text-sm font-bold ${(areaMetrics.areaBalanceSqm || 0) >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
              {((areaMetrics.areaBalanceSqm || 0) * unitFactor).toFixed(2)} <span className="text-[11px] font-normal text-slate-500">{unitLabel}</span>
            </span>
          </div>
        </div>
      </div>

      {/* 8. Occupancy-Based Parking Statement (UDCPR Chapter 8) */}
      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Car size={16} className="text-[#E05A1E] shrink-0" />
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              8. Occupancy-Based Parking Statement (UDCPR Chapter 8)
            </h4>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold px-2 py-0.5 bg-orange-100 text-[#E05A1E] rounded">
              NMC Multiplier: {parkingReq.authorityMultiplier || 0.90}
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 bg-slate-200 text-slate-700 rounded">
              Visitor: {parkingReq.visitorParkingPct || 5}%
            </span>
          </div>
        </div>

        {/* Input Configuration Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-700 block">Commercial Carpet ({unitLabel})</label>
            <input
              type="number"
              step="0.01"
              placeholder={((parkingReq.commercialCarpetSqm || 0) * unitFactor).toFixed(2)}
              className="w-full text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 font-mono text-slate-800 focus:outline-none focus:border-[#E05A1E]"
              value={parkingConfig.commercial_carpet_sqm ?? ''}
              onChange={(e) => updateParkingConfig({ commercial_carpet_sqm: e.target.value })}
              disabled={!isPrivileged}
            />
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-700 block">Tenements 40-80 sqm</label>
            <input
              type="number"
              min="0"
              placeholder={String(parkingReq.residentialTenements40_80 || 0)}
              className="w-full text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 font-mono text-slate-800 focus:outline-none focus:border-[#E05A1E]"
              value={parkingConfig.residential_tenements_40_80 ?? ''}
              onChange={(e) => updateParkingConfig({ residential_tenements_40_80: e.target.value })}
              disabled={!isPrivileged}
            />
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-700 block">Tenements &lt; 40 sqm</label>
            <input
              type="number"
              min="0"
              placeholder="0"
              className="w-full text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 font-mono text-slate-800 focus:outline-none focus:border-[#E05A1E]"
              value={parkingConfig.residential_tenements_under_40 ?? ''}
              onChange={(e) => updateParkingConfig({ residential_tenements_under_40: e.target.value })}
              disabled={!isPrivileged}
            />
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-700 block">Tenements &gt; 80 sqm</label>
            <input
              type="number"
              min="0"
              placeholder="0"
              className="w-full text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 font-mono text-slate-800 focus:outline-none focus:border-[#E05A1E]"
              value={parkingConfig.residential_tenements_over_80 ?? ''}
              onChange={(e) => updateParkingConfig({ residential_tenements_over_80: e.target.value })}
              disabled={!isPrivileged}
            />
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-700 block">Proposed Cars</label>
            <input
              type="number"
              min="0"
              placeholder="0"
              className="w-full text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 font-mono font-bold text-slate-900 focus:outline-none focus:border-[#E05A1E]"
              value={parkingConfig.proposed_cars ?? ''}
              onChange={(e) => updateParkingConfig({ proposed_cars: e.target.value })}
              disabled={!isPrivileged}
            />
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-700 block">Proposed 2-Wheelers</label>
            <input
              type="number"
              min="0"
              placeholder="0"
              className="w-full text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 font-mono font-bold text-slate-900 focus:outline-none focus:border-[#E05A1E]"
              value={parkingConfig.proposed_two_wheelers ?? ''}
              onChange={(e) => updateParkingConfig({ proposed_two_wheelers: e.target.value })}
              disabled={!isPrivileged}
            />
          </div>
        </div>

        {/* Requirements & Surplus Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          {/* Commercial Parking Norm */}
          <div className="p-3 bg-white rounded-lg border border-slate-200 space-y-1">
            <span className="text-[11px] font-bold text-purple-900 uppercase tracking-wide block">
              Commercial Norm
            </span>
            <div className="text-[11px] text-slate-600">
              Carpet: <strong className="font-mono">{((parkingReq.commercialCarpetSqm || 0) * unitFactor).toFixed(2)}</strong> {unitLabel}
            </div>
            <div className="text-[11px] font-mono text-slate-800">
              Base Cars (2/100 sqm): <strong>{(parkingReq.commercialCars || 0).toFixed(2)}</strong>
            </div>
            <div className="text-[11px] font-mono text-slate-800">
              Base Scooters (6/100 sqm): <strong>{(parkingReq.commercialTwoWheelers || 0).toFixed(2)}</strong>
            </div>
          </div>

          {/* Residential Parking Norm */}
          <div className="p-3 bg-white rounded-lg border border-slate-200 space-y-1">
            <span className="text-[11px] font-bold text-blue-900 uppercase tracking-wide block">
              Residential Norm
            </span>
            <div className="text-[11px] text-slate-600">
              Total Tenements: <strong className="font-mono">{parkingReq.totalResidentialTenements || 0}</strong>
            </div>
            <div className="text-[11px] font-mono text-slate-800">
              Base Cars: <strong>{(parkingReq.residentialCars || 0).toFixed(2)}</strong>
            </div>
            <div className="text-[11px] font-mono text-slate-800">
              Base Scooters: <strong>{(parkingReq.residentialTwoWheelers || 0).toFixed(2)}</strong>
            </div>
          </div>

          {/* Gross Demand & NMC Multiplier */}
          <div className="p-3 bg-white rounded-lg border border-slate-200 space-y-1">
            <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wide block">
              Gross + Visitor (5%) × 0.90
            </span>
            <div className="text-[11px] font-mono text-slate-700">
              Gross Cars: <strong>{(parkingReq.totalGrossCars || 0).toFixed(2)}</strong>
            </div>
            <div className="text-[11px] font-mono text-slate-700">
              Gross Scooters: <strong>{(parkingReq.totalGrossTwoWheelers || 0).toFixed(2)}</strong>
            </div>
            <div className="text-[10px] text-slate-500 pt-0.5">
              Ceil after authority multiplier (0.90) applied
            </div>
          </div>

          {/* Net Requirement vs Proposed */}
          <div className="p-3 bg-slate-100/90 rounded-lg border border-slate-300 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-900 uppercase tracking-wide">
                Compliance Status
              </span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${parkingReq.isCarRequirementMet && parkingReq.isTwoWheelerRequirementMet ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                {parkingReq.isCarRequirementMet && parkingReq.isTwoWheelerRequirementMet ? 'Compliant' : 'Review Parking'}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-slate-700">Cars: Req <strong>{parkingReq.requiredCars || 0}</strong> | Prop <strong>{parkingReq.proposedCars || 0}</strong></span>
              <span className={`font-bold px-1.5 py-0.2 rounded text-[11px] ${(parkingReq.surplusDeficitCars || 0) >= 0 ? 'text-emerald-700 bg-emerald-50' : 'text-red-600 bg-red-50'}`}>
                {(parkingReq.surplusDeficitCars || 0) >= 0 ? `+${parkingReq.surplusDeficitCars || 0}` : parkingReq.surplusDeficitCars}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-slate-700">Scooters: Req <strong>{parkingReq.requiredTwoWheelers || 0}</strong> | Prop <strong>{parkingReq.proposedTwoWheelers || 0}</strong></span>
              <span className={`font-bold px-1.5 py-0.2 rounded text-[11px] ${(parkingReq.surplusDeficitTwoWheelers || 0) >= 0 ? 'text-emerald-700 bg-emerald-50' : 'text-red-600 bg-red-50'}`}>
                {(parkingReq.surplusDeficitTwoWheelers || 0) >= 0 ? `+${parkingReq.surplusDeficitTwoWheelers || 0}` : parkingReq.surplusDeficitTwoWheelers}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
