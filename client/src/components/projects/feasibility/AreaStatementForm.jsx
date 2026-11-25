// client/src/components/projects/feasibility/AreaStatementForm.jsx
import React, { useState } from 'react';
import { Building2, Calculator, Layers, RefreshCw, AlertTriangle, ShieldCheck, CheckCircle2, Sliders, ExternalLink } from 'lucide-react';

const ROAD_WIDTHS = [9, 12, 15, 18, 24];

const ROAD_WIDTH_TDR_MAP = {
  9: { regular: 0.40, slum: 0.20 },
  12: { regular: 0.65, slum: 0.325 },
  15: { regular: 0.80, slum: 0.40 },
  18: { regular: 0.90, slum: 0.45 },
  24: { regular: 1.10, slum: 0.50 }
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
  const unitLabel = isSqft ? 'sq ft' : 'sq m';

  const [showProjectOverrideModal, setShowProjectOverrideModal] = useState(false);
  const [projectOverrideVal, setProjectOverrideVal] = useState(statement.total_proposed_pline_override_sqm || '');
  const [projectOverrideReason, setProjectOverrideReason] = useState(statement.proposed_pline_override_reason || '');

  // Floor override popover state
  const [activeFloorOverrideId, setActiveFloorOverrideId] = useState(null);
  const [floorOverrideVal, setFloorOverrideVal] = useState('');
  const [floorOverrideReason, setFloorOverrideReason] = useState('');

  // Road-width & Dual TDR helper
  const roadWidth = parseFloat(statement.road_width_m);
  let resolvedTdrBadge = null;
  if (!isNaN(roadWidth) && ROAD_WIDTH_TDR_MAP[roadWidth]) {
    const rates = ROAD_WIDTH_TDR_MAP[roadWidth];
    resolvedTdrBadge = `Regular TDR: ${rates.regular} | Slum TDR: ${rates.slum} (@ ${roadWidth}m road)`;
  }

  const handleRoadWidthChange = (val) => {
    const parsed = val ? parseFloat(val) : null;
    let newRegularTdr = 0;
    let newSlumTdr = 0;
    if (parsed && ROAD_WIDTH_TDR_MAP[parsed]) {
      newRegularTdr = ROAD_WIDTH_TDR_MAP[parsed].regular;
      newSlumTdr = ROAD_WIDTH_TDR_MAP[parsed].slum;
    }
    onUpdateStatement({
      road_width_m: parsed,
      regular_tdr_factor: newRegularTdr,
      slum_tdr_factor: newSlumTdr
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

  const handleSaveFloorPlineOverride = (floorId) => {
    const parsed = parseFloat(floorOverrideVal);
    if (!isNaN(parsed) && parsed >= 0) {
      onUpdateFloor(floorId, {
        pline_area_sqm: parsed,
        is_pline_overridden: true,
        pline_override_reason: floorOverrideReason
      });
    }
    setActiveFloorOverrideId(null);
  };

  const handleResetFloorPline = (floor) => {
    onUpdateFloor(floor.id, {
      is_pline_overridden: false,
      pline_override_reason: null
    });
  };

  const handleSaveProjectPlineOverride = () => {
    const parsed = parseFloat(projectOverrideVal);
    if (!isNaN(parsed) && parsed > 0) {
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

  // Permissible & Proposed totals from areaMetrics
  const permissiblePline = areaMetrics.permissiblePlineTotalSqm || 0;
  const calculatedProposedPline = areaMetrics.calculatedProposedPlineSqm || 0;
  const effectiveProposedPline = areaMetrics.effectiveProposedPlineSqm || calculatedProposedPline;
  const isProjectOverridden = Boolean(areaMetrics.isProposedPlineOverridden);

  return (
    <div className="space-y-6">
      {/* 1. Base Plot Dimensions — Plot Area is the authoritative baseline */}
      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
        <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
          <Building2 size={14} className="text-[#E05A1E]" />
          Plot & Survey Baseline Inputs
        </h4>
        <div className="max-w-sm space-y-1">
          <label className="text-[11px] font-semibold text-slate-700">Plot Area ({unitLabel})</label>
          <input
            type="number"
            step="0.01"
            placeholder="e.g. 500"
            className="w-full text-xs bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-800 font-bold focus:outline-none focus:border-[#E05A1E] shadow-2xs"
            value={statement.plot_area_sqm || ''}
            onChange={(e) => onUpdateStatement({ plot_area_sqm: e.target.value })}
            disabled={!isPrivileged}
          />
          <p className="text-[10px] text-muted">Primary baseline for all FSI potential and permissible area calculations</p>
        </div>
      </div>

      {/* 2. Building Use, Road Width & Plot Classification */}
      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
        <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
          <Building2 size={14} className="text-[#E05A1E]" />
          Building Use & Plot Regulatory Classification
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-600">Building Use</label>
            <select
              className="w-full text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-800 font-semibold focus:outline-none focus:border-[#E05A1E]"
              value={statement.building_use || 'Residential'}
              onChange={(e) => onUpdateStatement({ building_use: e.target.value })}
              disabled={!isPrivileged}
            >
              <option value="Residential">Residential (60% Ancillary FSI)</option>
              <option value="Commercial">Commercial (80% Ancillary FSI)</option>
              <option value="Mixed Use">Mixed Use (Commercial + Residential)</option>
            </select>
            <span className="text-[10px] text-muted">
              {statement.building_use === 'Commercial' ? '★ 80% Ancillary applied' : '★ 60% Ancillary applied'}
            </span>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-600">Plot Classification</label>
            <select
              className="w-full text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-800 font-semibold focus:outline-none focus:border-[#E05A1E]"
              value={statement.is_gunthewari ? 'gunthewari' : 'regular'}
              onChange={(e) => handleGunthewariToggle(e.target.value === 'gunthewari')}
              disabled={!isPrivileged}
            >
              <option value="regular">Regular Development Plot</option>
              <option value="gunthewari">Gunthewari Scheme Plot</option>
            </select>
            <span className="text-[10px] text-muted">
              {statement.is_gunthewari ? 'Gunthewari status active' : 'Regular Development plot active'}
            </span>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-600">Road Width</label>
            <select
              className="w-full text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-800 font-semibold focus:outline-none focus:border-[#E05A1E]"
              value={statement.road_width_m || ''}
              onChange={(e) => handleRoadWidthChange(e.target.value)}
              disabled={!isPrivileged}
            >
              <option value="">Select Road Width...</option>
              {ROAD_WIDTHS.map(rw => (
                <option key={rw} value={rw}>{rw} meters road</option>
              ))}
            </select>
            {resolvedTdrBadge && (
              <span className="text-[10px] text-[#E05A1E] font-medium block">
                ★ {resolvedTdrBadge}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 3. Regulatory & FSI Factors (Dual TDR Automatically Derived) */}
      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
        <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <Calculator size={14} className="text-[#E05A1E]" />
            Regulatory FSI & Dual TDR Assumptions
          </span>
          <span className="text-[10px] font-bold text-[#E05A1E]">
            Combined TDR Factor: {combinedTdr}
          </span>
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
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-semibold text-slate-600">Regular TDR Factor</label>
              <span className="text-[9px] text-[#E05A1E] font-medium">Derived</span>
            </div>
            <div className="w-full text-xs bg-slate-100 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-800 font-bold font-mono">
              {regTdr.toFixed(3)}
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-semibold text-slate-600">Slum TDR Factor</label>
              <span className="text-[9px] text-[#E05A1E] font-medium">Derived</span>
            </div>
            <div className="w-full text-xs bg-slate-100 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-800 font-bold font-mono">
              {slumTdr.toFixed(3)}
            </div>
          </div>
        </div>
      </div>

      {/* 4. Total Permissible vs Total Proposed P-Line Cards & Controlled Project Override */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Permissible Potential */}
        <div className="bg-emerald-50/50 p-4 rounded-xl border border-emerald-200 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-900 uppercase tracking-wider flex items-center gap-1.5">
              <ShieldCheck size={14} className="text-emerald-600" />
              Total Permissible P-Line
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded">
              Independent Potential
            </span>
          </div>
          <div className="text-2xl font-black text-emerald-950 font-mono">
            {permissiblePline.toFixed(2)} <span className="text-sm font-semibold">{unitLabel}</span>
          </div>
          <div className="text-[11px] text-emerald-800/80 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span>Built-up FSI: <strong className="font-mono">{(areaMetrics.permissibleTotalBuiltupSqm || 0).toFixed(2)}</strong> {unitLabel}</span>
              <span>•</span>
              <span>Total Ancillary: <strong className="font-mono">{(areaMetrics.permissibleTotalAncillarySqm || areaMetrics.permissibleAncillaryResSqm || 0).toFixed(2)}</strong> {unitLabel}</span>
            </div>
            {statement.building_use === 'Mixed Use' && (
              <div className="text-[10px] bg-emerald-100/60 p-1.5 rounded text-emerald-900 flex items-center gap-2">
                <span>Res Ancillary (60%): <strong className="font-mono">{(areaMetrics.permissibleResidentialAncillarySqm || 0).toFixed(2)}</strong></span>
                <span>|</span>
                <span>Comm Ancillary (80%): <strong className="font-mono">{(areaMetrics.permissibleCommercialAncillarySqm || 0).toFixed(2)}</strong></span>
              </div>
            )}
            <div className="text-[10px] text-emerald-700">Calculated from Plot ({statement.plot_area_sqm || 0} {unitLabel}) × Permissible Factors</div>
          </div>
        </div>

        {/* Proposed Development & Equal Distribution Source */}
        <div className={`p-4 rounded-xl border space-y-2 ${isProjectOverridden ? 'bg-amber-50/60 border-amber-300' : 'bg-orange-50/50 border-orange-200'}`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
              <Calculator size={14} className="text-[#E05A1E]" />
              Total Proposed P-Line
            </span>
            <div className="flex items-center gap-2">
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
                  className="text-[10px] text-[#E05A1E] hover:underline font-semibold"
                >
                  {isProjectOverridden ? 'Edit Override' : 'Override Total'}
                </button>
              )}
            </div>
          </div>

          <div className="text-2xl font-black text-slate-900 font-mono">
            {effectiveProposedPline.toFixed(2)} <span className="text-sm font-semibold">{unitLabel}</span>
          </div>

          <div className="text-[11px] text-slate-600 space-y-1">
            <div className="flex items-center justify-between">
              <span>
                {isProjectOverridden ? (
                  <span className="text-amber-800 font-medium">Calculated: {calculatedProposedPline.toFixed(2)} {unitLabel}</span>
                ) : (
                  <span>Distributed across {areaMetrics.applicableHabitableFloorsCount || 0} habitable floors</span>
                )}
              </span>
              {isProjectOverridden && isPrivileged && (
                <button
                  type="button"
                  onClick={handleResetProjectPlineOverride}
                  className="text-[10px] text-red-600 hover:underline flex items-center gap-0.5 font-semibold"
                >
                  <RefreshCw size={10} /> Reset to Calculated
                </button>
              )}
            </div>
            {statement.building_use === 'Mixed Use' && (
              <div className="text-[10px] bg-orange-100/60 p-1.5 rounded text-orange-900 flex items-center gap-2">
                <span>Res FSI: <strong className="font-mono">{(areaMetrics.proposedResidentialFsiSqm || 0).toFixed(2)}</strong> (60%: {(areaMetrics.proposedResidentialAncillarySqm || 0).toFixed(2)})</span>
                <span>|</span>
                <span>Comm FSI: <strong className="font-mono">{(areaMetrics.proposedCommercialFsiSqm || 0).toFixed(2)}</strong> (80%: {(areaMetrics.proposedCommercialAncillarySqm || 0).toFixed(2)})</span>
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
          <p className="text-[11px] text-amber-900">
            Engine-calculated proposed P-Line is <strong className="font-mono">{calculatedProposedPline.toFixed(2)} {unitLabel}</strong>. Entering an override will redistribute the updated target equally across all applicable floors.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-slate-700">Target Proposed P-Line ({unitLabel})</label>
              <input
                type="number"
                step="0.01"
                placeholder={calculatedProposedPline.toFixed(2)}
                className="w-full text-xs bg-white border border-amber-300 rounded-lg px-3 py-1.5 font-bold font-mono text-slate-900 focus:outline-none focus:border-[#E05A1E]"
                value={projectOverrideVal}
                onChange={(e) => setProjectOverrideVal(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-slate-700">Justification / Reason</label>
              <input
                type="text"
                placeholder="e.g. Architect revised client brief"
                className="w-full text-xs bg-white border border-amber-300 rounded-lg px-3 py-1.5 text-slate-800 focus:outline-none focus:border-[#E05A1E]"
                value={projectOverrideReason}
                onChange={(e) => setProjectOverrideReason(e.target.value)}
              />
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setShowProjectOverrideModal(false)}
              className="text-xs px-3 py-1 text-slate-600 hover:text-slate-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveProjectPlineOverride}
              className="btn-primary text-xs py-1 px-3"
            >
              Apply Override
            </button>
          </div>
        </div>
      )}

      {/* 5. Central Building Configuration Single Source Governance Banner */}
      <div className="bg-sky-50/70 p-3.5 rounded-xl border border-sky-200 flex items-center justify-between gap-4">
        <div className="flex items-start gap-2.5">
          <Layers className="text-sky-600 shrink-0 mt-0.5" size={16} />
          <div>
            <h5 className="text-xs font-bold text-sky-950">
              Centralised Building Structure ({floors.length} configured floors)
            </h5>
            <p className="text-[11px] text-sky-800">
              Building Configuration is the sole authoritative source for floors, basements and vertical hierarchy. Equal P-Line distribution flows automatically to habitable levels.
            </p>
          </div>
        </div>
        {isPrivileged && (
          <button
            type="button"
            onClick={onReconcileFloors}
            className="text-xs px-3 py-1.5 bg-sky-100 hover:bg-sky-200 text-sky-900 font-bold rounded-lg border border-sky-300 flex items-center gap-1.5 shrink-0 transition-colors"
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

      {/* 6. Floor-wise Area Statement Table (Mandatory 10 Columns) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
            <Layers size={14} className="text-[#E05A1E]" />
            Floor-wise Area Statement ({floors.length} levels)
          </h4>
          <span className="text-[10px] text-muted">
            Formula: FSI Area + Ancillary Area = P-Line Area | Lobby = 15% | Built-up Sale = P-Line - Lobby | Area 1 Unit = Sale ÷ Units
          </span>
        </div>

        <div className="overflow-x-auto border border-slate-200 rounded-xl shadow-soft-sm bg-white">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-700 uppercase tracking-wider">
              <tr>
                <th className="px-3 py-2.5">1. Floor Level</th>
                <th className="px-2.5 py-2.5 text-center">2. Building Use</th>
                <th className="px-2 py-2.5 text-center">3. Height (m)</th>
                <th className="px-2.5 py-2.5 text-right">4. FSI Area ({unitLabel})</th>
                <th className="px-2.5 py-2.5 text-right">5. Ancillary ({unitLabel})</th>
                <th className="px-2.5 py-2.5 text-right">6. Proposed P-Line ({unitLabel})</th>
                <th className="px-2.5 py-2.5 text-right">7. Lobby Area ({unitLabel})</th>
                <th className="px-2.5 py-2.5 text-right">8. Built-up Sale ({unitLabel})</th>
                <th className="px-2 py-2.5 text-center">9. No. of Units</th>
                <th className="px-2.5 py-2.5 text-right">10. Area for 1 Unit ({unitLabel})</th>
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
                    {/* 1. Floor Level */}
                    <td className="px-3 py-2">
                      <div className="font-bold text-slate-800 flex items-center gap-1.5">
                        <span>{floor.floor_name}</span>
                        {isParking && (
                          <span className="text-[9px] px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded font-semibold">
                            Parking
                          </span>
                        )}
                        {isTerrace && (
                          <span className="text-[9px] px-1.5 py-0.5 bg-slate-200 text-slate-700 rounded font-semibold">
                            Terrace
                          </span>
                        )}
                      </div>
                    </td>

                    {/* 2. Building Use */}
                    <td className="px-2.5 py-2 text-center">
                      {isHabitable ? (
                        statement.building_use === 'Mixed Use' ? (
                          <select
                            className="text-[11px] bg-white border border-slate-200 rounded px-1.5 py-0.5 font-semibold text-slate-700 focus:outline-none focus:border-[#E05A1E]"
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
                        <span className="text-slate-400 font-mono text-[10px]">
                          {isParking ? 'Parking' : 'Terrace'}
                        </span>
                      )}
                    </td>

                    {/* 3. Height (m) */}
                    <td className="px-2 py-2 text-center">
                      <input
                        type="number"
                        step="0.01"
                        className="w-14 text-center text-xs bg-slate-50 border border-slate-200 rounded px-1 py-0.5 text-slate-700 focus:outline-none focus:border-[#E05A1E]"
                        value={floor.height_meters || 3.00}
                        onChange={(e) => onUpdateFloor(floor.id, { height_meters: e.target.value })}
                        disabled={!isPrivileged}
                      />
                    </td>

                    {/* 4. Proposed FSI Area (sq m) */}
                    <td className="px-2.5 py-2 text-right font-mono font-semibold text-slate-800">
                      {isHabitable ? fsiVal.toFixed(2) : '0.00'}
                    </td>

                    {/* 5. Ancillary Area (sq m) with 60%/80% badge */}
                    <td className="px-2.5 py-2 text-right">
                      {isHabitable ? (
                        <div className="flex items-center justify-end gap-1 font-mono font-medium text-slate-700">
                          <span>{ancillaryVal.toFixed(2)}</span>
                          <span className="text-[9px] text-muted">
                            ({Math.round(ancPct * 100)}%)
                          </span>
                        </div>
                      ) : (
                        <span className="font-mono text-slate-400">0.00</span>
                      )}
                    </td>

                    {/* 6. Proposed P-Line Area (sq m) with equal distribution & override support */}
                    <td className="px-2.5 py-2 text-right">
                      {isHabitable ? (
                        <div className="flex items-center justify-end gap-1">
                          {isPlineOverridden && (
                            <span className="text-[8px] px-1 py-0.5 bg-amber-100 text-amber-900 rounded font-bold" title={floor.pline_override_reason || 'Manual override'}>
                              Overridden
                            </span>
                          )}
                          <input
                            type="number"
                            step="0.01"
                            className={`w-20 text-right text-xs border rounded px-1.5 py-0.5 font-bold font-mono ${isPlineOverridden ? 'bg-amber-50 border-amber-300 text-amber-900' : 'bg-white border-slate-200 text-slate-800 focus:border-[#E05A1E]'}`}
                            value={plineVal || ''}
                            onChange={(e) => onUpdateFloor(floor.id, {
                              pline_area_sqm: e.target.value,
                              is_pline_overridden: true
                            })}
                            disabled={!isPrivileged}
                          />
                          {isPlineOverridden && isPrivileged && (
                            <button
                              type="button"
                              onClick={() => handleResetFloorPline(floor)}
                              className="text-slate-400 hover:text-red-600 p-0.5"
                              title="Reset to Equal Share"
                            >
                              <RefreshCw size={10} />
                            </button>
                          )}
                        </div>
                      ) : (
                        <span className="font-mono text-slate-400">0.00</span>
                      )}
                    </td>

                    {/* 7. Lobby Area (sq m) (15% default or overridden) */}
                    <td className="px-2.5 py-2 text-right">
                      {isHabitable ? (
                        <div className="flex items-center justify-end gap-1">
                          {isLobbyOverridden && (
                            <button
                              type="button"
                              onClick={() => handleResetLobbyToDefault(floor)}
                              className="text-[9px] text-[#E05A1E] hover:underline flex items-center gap-0.5 font-medium"
                              title="Reset to 15% default"
                            >
                              <RefreshCw size={8} /> Reset
                            </button>
                          )}
                          <input
                            type="number"
                            step="0.01"
                            className={`w-16 text-right text-xs border rounded px-1 py-0.5 font-mono ${isLobbyOverridden ? 'bg-orange-50 border-orange-300 font-semibold text-orange-950' : 'bg-slate-50 border-slate-200 text-slate-700'}`}
                            value={lobbyVal || ''}
                            onChange={(e) => handleLobbyChange(floor, e.target.value)}
                            disabled={!isPrivileged}
                          />
                        </div>
                      ) : (
                        <span className="font-mono text-slate-400">0.00</span>
                      )}
                    </td>

                    {/* 8. Built-up for Sale (sq m) (P-Line - Lobby) */}
                    <td className="px-2.5 py-2 text-right font-mono font-bold text-[#E05A1E]">
                      {isHabitable ? saleVal.toFixed(2) : '0.00'}
                    </td>

                    {/* 9. No. of Units (Independently editable per floor) */}
                    <td className="px-2 py-2 text-center">
                      {isHabitable ? (
                        <input
                          type="number"
                          min="0"
                          className="w-14 text-center text-xs font-bold bg-white border border-slate-200 rounded px-1 py-0.5 text-slate-800 focus:outline-none focus:border-[#E05A1E]"
                          value={units}
                          onChange={(e) => onUpdateFloor(floor.id, { no_of_units: e.target.value })}
                          disabled={!isPrivileged}
                        />
                      ) : (
                        <span className="text-slate-400 font-mono">0</span>
                      )}
                    </td>

                    {/* 10. Area for 1 Unit (sq m) (Built-up Sale / Units) */}
                    <td className="px-2.5 py-2 text-right font-mono font-bold text-slate-800">
                      {isHabitable ? (units > 0 ? area1Unit.toFixed(2) : '0.00') : '0.00'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {/* Table Summary Footer */}
            <tfoot className="bg-slate-50 border-t-2 border-slate-200 font-bold text-[11px] text-slate-800">
              <tr>
                <td className="px-3 py-2.5 uppercase tracking-wider text-slate-600">
                  Total ({floors.length} Levels)
                </td>
                <td className="px-2.5 py-2.5 text-center text-slate-400 font-normal">
                  —
                </td>
                <td className="px-2 py-2.5 text-center font-mono">
                  {(areaMetrics.totalHeightMeters || 0).toFixed(2)} m
                </td>
                <td className="px-2.5 py-2.5 text-right font-mono text-slate-800 font-bold">
                  {(areaMetrics.proposedTotalFsiSqm || 0).toFixed(2)} {unitLabel}
                </td>
                <td className="px-2.5 py-2.5 text-right font-mono text-slate-700">
                  {(areaMetrics.totalProposedAncillarySqm || 0).toFixed(2)} {unitLabel}
                </td>
                <td className="px-2.5 py-2.5 text-right font-mono text-slate-900 font-black">
                  {(areaMetrics.totalProposedPlineSqm || 0).toFixed(2)} {unitLabel}
                </td>
                <td className="px-2.5 py-2.5 text-right font-mono text-slate-700">
                  {(areaMetrics.totalLobbyAreaSqm || 0).toFixed(2)} {unitLabel}
                </td>
                <td className="px-2.5 py-2.5 text-right font-mono text-[#E05A1E] font-black">
                  {(areaMetrics.totalBuiltupForSaleSqm || 0).toFixed(2)} {unitLabel}
                </td>
                <td className="px-2 py-2.5 text-center font-mono font-black text-slate-900">
                  {areaMetrics.totalUnitsCount || 0}
                </td>
                <td className="px-2.5 py-2.5 text-right text-slate-400 font-normal">
                  —
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
