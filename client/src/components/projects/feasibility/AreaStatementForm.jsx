// client/src/components/projects/feasibility/AreaStatementForm.jsx
import React from 'react';
import { Plus, Trash2, Building2, Calculator, Layers, RefreshCw, Car } from 'lucide-react';

const ROAD_WIDTHS = [9, 12, 15, 18, 24];

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

  // Road-width & Gunthewari rate helper
  const roadWidth = parseFloat(statement.road_width_m);
  const isGunthewari = Boolean(statement.is_gunthewari);
  let resolvedTdrBadge = null;
  if (!isNaN(roadWidth) && [9, 12, 15, 18, 24].includes(roadWidth)) {
    const rateMap = {
      9: { regular: 0.40, gunthewari: 0.20 },
      12: { regular: 0.65, gunthewari: 0.325 },
      15: { regular: 0.80, gunthewari: 0.40 },
      18: { regular: 0.90, gunthewari: 0.45 },
      24: { regular: 1.10, gunthewari: 0.50 }
    };
    const rate = isGunthewari ? rateMap[roadWidth].gunthewari : rateMap[roadWidth].regular;
    resolvedTdrBadge = `${rate} (${isGunthewari ? 'Gunthewari' : 'Regular'} @ ${roadWidth}m)`;
  }

  const handleRoadWidthChange = (val) => {
    const parsed = val ? parseFloat(val) : null;
    const rateMap = {
      9: { regular: 0.40, gunthewari: 0.20 },
      12: { regular: 0.65, gunthewari: 0.325 },
      15: { regular: 0.80, gunthewari: 0.40 },
      18: { regular: 0.90, gunthewari: 0.45 },
      24: { regular: 1.10, gunthewari: 0.50 }
    };
    let newRegularTdr = statement.regular_tdr_factor;
    if (parsed && rateMap[parsed]) {
      newRegularTdr = isGunthewari ? rateMap[parsed].gunthewari : rateMap[parsed].regular;
    }
    onUpdateStatement({
      road_width_m: parsed,
      regular_tdr_factor: newRegularTdr
    });
  };

  const handleGunthewariToggle = (gunthewariVal) => {
    const rateMap = {
      9: { regular: 0.40, gunthewari: 0.20 },
      12: { regular: 0.65, gunthewari: 0.325 },
      15: { regular: 0.80, gunthewari: 0.40 },
      18: { regular: 0.90, gunthewari: 0.45 },
      24: { regular: 1.10, gunthewari: 0.50 }
    };
    let newRegularTdr = statement.regular_tdr_factor;
    if (roadWidth && rateMap[roadWidth]) {
      newRegularTdr = gunthewariVal ? rateMap[roadWidth].gunthewari : rateMap[roadWidth].regular;
    }
    onUpdateStatement({
      is_gunthewari: gunthewariVal,
      regular_tdr_factor: newRegularTdr
    });
  };

  const handlePlineChange = (floor, newPlineStr) => {
    const pline = parseFloat(newPlineStr) || 0;
    const updates = { pline_area_sqm: newPlineStr };
    // If not manually overridden, auto-compute 15% lobby
    if (!floor.is_lobby_overridden) {
      updates.lobby_area_sqm = Math.round(pline * 0.15 * 100) / 100;
    }
    onUpdateFloor(floor.id, updates);
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

  const regTdr = parseFloat(statement.regular_tdr_factor) || 0;
  const slumTdr = parseFloat(statement.slum_tdr_factor) || 0;
  const combinedTdr = Math.round((regTdr + slumTdr) * 10000) / 10000;

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

      {/* 2. Building Use, Road Width & Gunthewari Classification */}
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
              {statement.is_gunthewari ? 'Gunthewari TDR rates active' : 'Standard Regular TDR rates active'}
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
                ★ TDR: {resolvedTdrBadge}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 3. Regulatory & FSI Factors (Dual TDR) */}
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
            <label className="text-[10px] font-semibold text-slate-600">Regular TDR Factor</label>
            <input
              type="number"
              step="0.001"
              placeholder="e.g. 0.40"
              className="w-full text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-800 focus:outline-none focus:border-[#E05A1E]"
              value={statement.regular_tdr_factor ?? ''}
              onChange={(e) => onUpdateStatement({ regular_tdr_factor: e.target.value })}
              disabled={!isPrivileged}
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-semibold text-slate-600">Slum TDR Factor</label>
            <input
              type="number"
              step="0.001"
              placeholder="e.g. 0.20"
              className="w-full text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-800 focus:outline-none focus:border-[#E05A1E]"
              value={statement.slum_tdr_factor ?? ''}
              onChange={(e) => onUpdateStatement({ slum_tdr_factor: e.target.value })}
              disabled={!isPrivileged}
            />
          </div>
        </div>
      </div>

      {/* 4. Dynamic Floor-wise Proposed P-Line Rows */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <Layers size={14} className="text-[#E05A1E]" />
              Proposed Floor-wise P-Line Area Rows ({floors.length} floors)
            </h4>
            <p className="text-[11px] text-muted">
              Lobby defaults to 15% of P-Line area with manual override preservation; Area For 1 Unit auto-computes Built-up Sale ÷ Units
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

        <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
          {floors.map((floor, idx) => {
            const isParking = floor.floor_type === 'parking';
            const units = parseInt(floor.no_of_units, 10) || 0;
            const sale = parseFloat(floor.builtup_for_sale_sqm) || 0;
            const areaFor1Unit = units > 0 ? (sale / units).toFixed(2) : '0.00';

            return (
              <div key={floor.id || idx} className={`p-3 rounded-xl border shadow-soft-sm space-y-2 transition-colors ${isParking ? 'bg-amber-50/40 border-amber-200' : 'bg-white border-slate-200 hover:border-orange-200'}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-1">
                    <input
                      type="text"
                      className="text-xs font-bold text-slate-800 bg-slate-50 border border-slate-200 rounded px-2 py-1 flex-1 focus:outline-none focus:border-[#E05A1E]"
                      value={floor.floor_name}
                      onChange={(e) => onUpdateFloor(floor.id, { floor_name: e.target.value })}
                      disabled={!isPrivileged}
                    />
                    <select
                      className="text-[11px] font-semibold bg-slate-100 border border-slate-200 rounded px-2 py-1 text-slate-700"
                      value={floor.floor_type || 'habitable'}
                      onChange={(e) => onUpdateFloor(floor.id, { 
                        floor_type: e.target.value,
                        builtup_for_sale_sqm: e.target.value === 'parking' ? 0 : floor.builtup_for_sale_sqm,
                        no_of_units: e.target.value === 'parking' ? 0 : (floor.no_of_units || 1)
                      })}
                      disabled={!isPrivileged}
                    >
                      <option value="habitable">Habitable Floor</option>
                      <option value="parking">Parking Floor (Non-FSI)</option>
                      <option value="service">Service / Utility Floor</option>
                      <option value="terrace">Terrace Level</option>
                    </select>
                  </div>

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

                <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 text-xs">
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
                      onChange={(e) => handlePlineChange(floor, e.target.value)}
                      disabled={!isPrivileged}
                    />
                  </div>

                  <div className="space-y-0.5">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] text-muted font-bold">Lobby ({unitLabel})</label>
                      {floor.is_lobby_overridden ? (
                        <button
                          type="button"
                          onClick={() => handleResetLobbyToDefault(floor)}
                          className="text-[9px] text-[#E05A1E] hover:underline flex items-center gap-0.5"
                          title="Reset to 15% default"
                        >
                          <RefreshCw size={9} /> Reset 15%
                        </button>
                      ) : (
                        <span className="text-[9px] text-slate-400 font-mono">Auto 15%</span>
                      )}
                    </div>
                    <input
                      type="number"
                      step="0.01"
                      className={`w-full border rounded px-2 py-1 text-slate-700 ${floor.is_lobby_overridden ? 'bg-orange-50/50 border-orange-200 font-semibold' : 'bg-slate-50 border-slate-200'}`}
                      value={floor.lobby_area_sqm || ''}
                      onChange={(e) => handleLobbyChange(floor, e.target.value)}
                      disabled={!isPrivileged}
                    />
                  </div>

                  <div className="space-y-0.5">
                    <label className="text-[10px] text-muted font-bold">Builtup Sale ({unitLabel})</label>
                    <input
                      type="number"
                      step="0.01"
                      className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1 font-semibold text-[#E05A1E]"
                      value={isParking ? 0 : (floor.builtup_for_sale_sqm || '')}
                      onChange={(e) => onUpdateFloor(floor.id, { builtup_for_sale_sqm: e.target.value })}
                      disabled={!isPrivileged || isParking}
                    />
                  </div>

                  <div className="space-y-0.5">
                    <label className="text-[10px] text-muted font-bold">No. Of Units</label>
                    <input
                      type="number"
                      min="0"
                      className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1 font-bold text-center text-slate-800"
                      value={isParking ? 0 : (floor.no_of_units ?? 1)}
                      onChange={(e) => onUpdateFloor(floor.id, { no_of_units: e.target.value })}
                      disabled={!isPrivileged || isParking}
                    />
                  </div>

                  <div className="space-y-0.5">
                    <label className="text-[10px] text-muted font-bold">Area For 1 Unit</label>
                    <div className="w-full bg-slate-100 border border-slate-200 rounded px-2 py-1 font-mono font-bold text-slate-800 text-right truncate">
                      {isParking ? '0.00' : `${areaFor1Unit} ${unitLabel}`}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
