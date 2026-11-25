// client/src/components/projects/feasibility/FeasibilityDocumentPreview.jsx
import React, { useState, useEffect } from 'react';
import { Building2, Calculator, Layers, FileSpreadsheet, CheckCircle2, ShieldCheck, IndianRupee, Printer } from 'lucide-react';

const formatINR = (val) => {
  if (val === undefined || val === null || isNaN(val)) return '₹0.00';
  return '₹' + Number(val).toLocaleString('en-IN', { maximumFractionDigits: 2 });
};

const formatNumber = (val, decimals = 2) => {
  if (val === undefined || val === null || isNaN(val)) return '0.00';
  return Number(val).toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
};

export default function FeasibilityDocumentPreview({
  project,
  statement = {},
  floors = [],
  financial = {},
  statutoryCharges = [],
  salableUnits = [],
  areaMetrics = {},
  financialMetrics = {},
  unitDisplay = 'sq_m',
  activeSheet = 'area' // 'area' or 'financial'
}) {
  const [selectedSheet, setSelectedSheet] = useState(activeSheet || 'area');

  // Keep synchronized with parent tab navigation
  useEffect(() => {
    if (activeSheet) {
      setSelectedSheet(activeSheet);
    }
  }, [activeSheet]);

  const isSqft = unitDisplay === 'sq_ft';
  const unitFactor = isSqft ? 10.764 : 1;
  const unitLabel = isSqft ? 'Sq Ft' : 'Sq M';

  const buildingUse = statement.building_use || 'Residential';
  const isCommercial = buildingUse === 'Commercial' || buildingUse === 'COMMERCIAL';
  const ancillaryLabel = isCommercial ? 'Ancillary FSI (80% Commercial)' : 'Ancillary FSI (60% Residential)';

  return (
    <div className="space-y-3">
      {/* Sheet Switcher Toolbar */}
      <div className="flex items-center justify-between bg-slate-100 p-1.5 rounded-xl border border-slate-200">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setSelectedSheet('area')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${
              selectedSheet === 'area'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <Layers size={13} className={selectedSheet === 'area' ? 'text-[#E05A1E]' : ''} />
            Area Statement Sheet
          </button>

          <button
            onClick={() => setSelectedSheet('financial')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${
              selectedSheet === 'financial'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <Calculator size={13} className={selectedSheet === 'financial' ? 'text-[#E05A1E]' : ''} />
            Financial Viability Sheet
          </button>
        </div>

        <span className="text-[11px] text-slate-500 font-medium hidden sm:inline">
          Active Preview: <strong className="text-slate-800">{selectedSheet === 'area' ? 'Area Statement' : 'Financial Viability'}</strong>
        </span>
      </div>

      {/* ========================================================================= */}
      {/* CANVAS CONTAINER (EXPORTED TO PDF / PRINTED) */}
      {/* ========================================================================= */}
      <div
        id="feasibility-document-canvas"
        className="bg-white border border-[#CBD5E1] rounded-xl shadow-md p-6 sm:p-8 text-[#1A1A1A] space-y-6 text-xs max-w-full overflow-x-auto min-h-[700px]"
      >
        {selectedSheet === 'area' ? (
          /* ===================================================================== */
          /* 1. COMPLETE AREA STATEMENT REPORT SHEET                               */
          /* ===================================================================== */
          <div className="space-y-6">
            {/* Area Statement Header */}
            <div className="border-b-2 border-slate-900 pb-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-base tracking-tight text-[#E05A1E]">DESIGN STUDIO 16</span>
                  <span className="text-slate-300">|</span>
                  <span className="font-bold text-xs uppercase tracking-wider text-slate-800">Area Statement & FSI Potential Report</span>
                </div>
                <h2 className="text-base font-extrabold text-slate-900 mt-1">
                  {project?.name || 'Architectural Project'}
                </h2>
                <p className="text-[11px] text-slate-600">
                  {project?.client_name ? `Client: ${project.client_name}` : ''} {project?.location ? `• Location: ${project.location}` : ''}
                </p>
              </div>

              <div className="text-right text-[11px] bg-slate-50 border border-slate-200 rounded-lg p-2.5 space-y-0.5">
                <p><span className="text-slate-500 font-medium">Unit Basis:</span> <strong className="font-mono text-slate-900 uppercase">{unitLabel}</strong></p>
                <p><span className="text-slate-500 font-medium">Building Use:</span> <strong className="text-slate-900">{isCommercial ? 'Commercial (80% Ancillary)' : 'Residential (60% Ancillary)'}</strong></p>
                <p><span className="text-slate-500 font-medium">Road Width:</span> <strong className="text-slate-900">{statement.road_width_m ? `${statement.road_width_m}m ${statement.is_gunthewari ? '(Gunthewari)' : '(Regular)'}` : 'Not Specified'}</strong></p>
                <p><span className="text-slate-500 font-medium">Date:</span> <strong className="text-slate-900">{new Date().toLocaleDateString('en-GB')}</strong></p>
              </div>
            </div>

            {/* TABLE 1 — PERMISSIBLE AREA STATEMENT (STACKED SEQUENTIALLY) */}
            <div className="space-y-2">
              <div className="bg-slate-900 text-white px-3.5 py-2 font-bold rounded-t text-xs uppercase tracking-wider flex items-center justify-between">
                <span>Table 1 — Permissible Area Statement ({unitLabel})</span>
                <span className="text-[10px] font-normal lowercase tracking-normal text-slate-300">regulatory potential analysis</span>
              </div>

              <table className="w-full border-collapse border border-slate-300 text-left text-xs">
                <thead>
                  <tr className="bg-slate-100 text-slate-800 font-bold border-b border-slate-300">
                    <th className="border border-slate-300 px-2.5 py-1.5 w-12 text-center">Sr.</th>
                    <th className="border border-slate-300 px-3 py-1.5">Particulars</th>
                    <th className="border border-slate-300 px-3 py-1.5 text-right w-44">Permissible ({unitLabel})</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  <tr>
                    <td className="border border-slate-300 px-2.5 py-1 text-center font-mono font-medium">1</td>
                    <td className="border border-slate-300 px-3 py-1 font-medium text-slate-800">Area Of Plot</td>
                    <td className="border border-slate-300 px-3 py-1 text-right font-mono font-semibold">{formatNumber((statement.plot_area_sqm || 0) * unitFactor)}</td>
                  </tr>
                  <tr>
                    <td className="border border-slate-300 px-2.5 py-1 text-center font-mono font-medium">2</td>
                    <td className="border border-slate-300 px-3 py-1 text-slate-700">Deductions For Proposed D.P. Road / Reservation</td>
                    <td className="border border-slate-300 px-3 py-1 text-right font-mono">{formatNumber((statement.dp_deductions_sqm || 0) * unitFactor)}</td>
                  </tr>
                  <tr>
                    <td className="border border-slate-300 px-2.5 py-1 text-center font-mono font-medium">3</td>
                    <td className="border border-slate-300 px-3 py-1 text-slate-700">Existing Built-up Area Deduction</td>
                    <td className="border border-slate-300 px-3 py-1 text-right font-mono">{formatNumber((statement.existing_builtup_area_sqm || 0) * unitFactor)}</td>
                  </tr>
                  <tr className="bg-orange-50 font-bold border-t-2 border-slate-400">
                    <td className="border border-slate-300 px-2.5 py-1.5 text-center font-mono text-orange-950">A</td>
                    <td className="border border-slate-300 px-3 py-1.5 text-orange-950 font-extrabold">Plotable Area (Net Development Plot)</td>
                    <td className="border border-slate-300 px-3 py-1.5 text-right font-mono text-orange-950 font-extrabold">{formatNumber((areaMetrics.plotableAreaSqm || 0) * unitFactor)}</td>
                  </tr>
                  <tr>
                    <td className="border border-slate-300 px-2.5 py-1 text-center font-mono">B</td>
                    <td className="border border-slate-300 px-3 py-1 text-slate-800">Basic Permissible FSI ({statement.basic_fsi_factor || 1.1} × Plot Area)</td>
                    <td className="border border-slate-300 px-3 py-1 text-right font-mono font-semibold">{formatNumber((areaMetrics.permissibleFsiSqm || 0) * unitFactor)}</td>
                  </tr>
                  <tr>
                    <td className="border border-slate-300 px-2.5 py-1 text-center font-mono">C</td>
                    <td className="border border-slate-300 px-3 py-1 text-slate-800">Paid FSI ({statement.paid_fsi_factor || 0.5} × Plot Area)</td>
                    <td className="border border-slate-300 px-3 py-1 text-right font-mono">{formatNumber((areaMetrics.permissiblePaidFsiSqm || 0) * unitFactor)}</td>
                  </tr>
                  <tr>
                    <td className="border border-slate-300 px-2.5 py-1 text-center font-mono">D1</td>
                    <td className="border border-slate-300 px-3 py-1 text-slate-800">
                      Regular TDR Permissible {statement.road_width_m ? `(${statement.road_width_m}m road @ ${statement.regular_tdr_factor || 0})` : ''}
                    </td>
                    <td className="border border-slate-300 px-3 py-1 text-right font-mono">{formatNumber((areaMetrics.permissibleTdrSqm || 0) * unitFactor)}</td>
                  </tr>
                  <tr>
                    <td className="border border-slate-300 px-2.5 py-1 text-center font-mono">D2</td>
                    <td className="border border-slate-300 px-3 py-1 text-slate-800">Slum TDR Permissible</td>
                    <td className="border border-slate-300 px-3 py-1 text-right font-mono text-slate-400">—</td>
                  </tr>
                  <tr className="bg-slate-50 font-bold">
                    <td className="border border-slate-300 px-2.5 py-1 text-center font-mono">E</td>
                    <td className="border border-slate-300 px-3 py-1 text-slate-900">Total Builtup Area (B + C + D)</td>
                    <td className="border border-slate-300 px-3 py-1 text-right font-mono">{formatNumber((areaMetrics.permissibleTotalBuiltupSqm || 0) * unitFactor)}</td>
                  </tr>
                  <tr>
                    <td className="border border-slate-300 px-2.5 py-1 text-center font-mono">F</td>
                    <td className="border border-slate-300 px-3 py-1 text-slate-700">TOTAL FSI CONSUMPTION RATIO</td>
                    <td className="border border-slate-300 px-3 py-1 text-right font-mono">{formatNumber(areaMetrics.permissibleTotalFsi || 0, 3)}</td>
                  </tr>
                  <tr>
                    <td className="border border-slate-300 px-2.5 py-1 text-center font-mono">G</td>
                    <td className="border border-slate-300 px-3 py-1 text-slate-800">{ancillaryLabel}</td>
                    <td className="border border-slate-300 px-3 py-1 text-right font-mono">{formatNumber((areaMetrics.permissibleAncillaryResSqm || 0) * unitFactor)}</td>
                  </tr>
                  <tr className="bg-emerald-50 font-bold border-t-2 border-slate-400">
                    <td className="border border-slate-300 px-2.5 py-1.5 text-center font-mono text-emerald-950">H</td>
                    <td className="border border-slate-300 px-3 py-1.5 text-emerald-950 font-extrabold">TOTAL PERMISSIBLE P-LINE AREA (E + G)</td>
                    <td className="border border-slate-300 px-3 py-1.5 text-right font-mono text-emerald-950 font-extrabold">{formatNumber((areaMetrics.permissiblePlineTotalSqm || 0) * unitFactor)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* TABLE 2 — PROPOSED AREA STATEMENT (STACKED SEQUENTIALLY) */}
            <div className="space-y-2">
              <div className="bg-slate-800 text-white px-3.5 py-2 font-bold rounded-t text-xs uppercase tracking-wider flex items-center justify-between">
                <span>Table 2 — Proposed Area Statement ({unitLabel})</span>
                <span className="text-[10px] font-normal lowercase tracking-normal text-slate-300">architectural design proposal</span>
              </div>

              <table className="w-full border-collapse border border-slate-300 text-left text-xs">
                <thead>
                  <tr className="bg-slate-100 text-slate-800 font-bold border-b border-slate-300">
                    <th className="border border-slate-300 px-2.5 py-1.5 w-12 text-center">Sr.</th>
                    <th className="border border-slate-300 px-3 py-1.5">Particulars</th>
                    <th className="border border-slate-300 px-3 py-1.5 text-right w-44">Proposed ({unitLabel})</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  <tr>
                    <td className="border border-slate-300 px-2.5 py-1 text-center font-mono font-medium">1</td>
                    <td className="border border-slate-300 px-3 py-1 font-medium text-slate-800">Area Of Plot</td>
                    <td className="border border-slate-300 px-3 py-1 text-right font-mono text-slate-400">—</td>
                  </tr>
                  <tr>
                    <td className="border border-slate-300 px-2.5 py-1 text-center font-mono font-medium">2</td>
                    <td className="border border-slate-300 px-3 py-1 text-slate-700">Deductions For Proposed D.P. Road / Reservation</td>
                    <td className="border border-slate-300 px-3 py-1 text-right font-mono text-slate-400">—</td>
                  </tr>
                  <tr>
                    <td className="border border-slate-300 px-2.5 py-1 text-center font-mono font-medium">3</td>
                    <td className="border border-slate-300 px-3 py-1 text-slate-700">Existing Built-up Area Deduction</td>
                    <td className="border border-slate-300 px-3 py-1 text-right font-mono text-slate-400">—</td>
                  </tr>
                  <tr className="bg-orange-50 font-bold border-t-2 border-slate-400">
                    <td className="border border-slate-300 px-2.5 py-1.5 text-center font-mono text-orange-950">A</td>
                    <td className="border border-slate-300 px-3 py-1.5 text-orange-950 font-extrabold">Plotable Area (Net Development Plot)</td>
                    <td className="border border-slate-300 px-3 py-1.5 text-right font-mono text-orange-950 font-extrabold">{formatNumber((areaMetrics.plotableAreaSqm || 0) * unitFactor)}</td>
                  </tr>
                  <tr>
                    <td className="border border-slate-300 px-2.5 py-1 text-center font-mono">B</td>
                    <td className="border border-slate-300 px-3 py-1 text-slate-800">Basic Proposed FSI ({statement.basic_fsi_factor || 1.1} × Plot Area)</td>
                    <td className="border border-slate-300 px-3 py-1 text-right font-mono font-semibold">{formatNumber((areaMetrics.proposedBasicFsiSqm || 0) * unitFactor)}</td>
                  </tr>
                  <tr>
                    <td className="border border-slate-300 px-2.5 py-1 text-center font-mono">C</td>
                    <td className="border border-slate-300 px-3 py-1 text-slate-800">Paid Proposed FSI ({statement.paid_fsi_factor || 0.5} × Plot Area)</td>
                    <td className="border border-slate-300 px-3 py-1 text-right font-mono">{formatNumber((areaMetrics.proposedPaidFsiSqm || 0) * unitFactor)}</td>
                  </tr>
                  <tr>
                    <td className="border border-slate-300 px-2.5 py-1 text-center font-mono">D1</td>
                    <td className="border border-slate-300 px-3 py-1 text-slate-800">
                      Regular TDR Utilization {statement.road_width_m ? `(${statement.road_width_m}m road @ ${statement.regular_tdr_factor || 0})` : ''}
                    </td>
                    <td className="border border-slate-300 px-3 py-1 text-right font-mono font-semibold">{formatNumber((areaMetrics.regularTdrSqm || 0) * unitFactor)}</td>
                  </tr>
                  <tr>
                    <td className="border border-slate-300 px-2.5 py-1 text-center font-mono">D2</td>
                    <td className="border border-slate-300 px-3 py-1 text-slate-800">
                      Slum TDR Utilization {statement.slum_tdr_factor ? `(Factor ${statement.slum_tdr_factor})` : ''}
                    </td>
                    <td className="border border-slate-300 px-3 py-1 text-right font-mono font-semibold">{formatNumber((areaMetrics.slumTdrSqm || 0) * unitFactor)}</td>
                  </tr>
                  <tr className="bg-slate-50 font-bold">
                    <td className="border border-slate-300 px-2.5 py-1 text-center font-mono">E</td>
                    <td className="border border-slate-300 px-3 py-1 text-slate-900">Total Builtup Area (B + C + D)</td>
                    <td className="border border-slate-300 px-3 py-1 text-right font-mono text-[#E05A1E] font-extrabold">{formatNumber((areaMetrics.proposedTotalBuiltupSqm || 0) * unitFactor)}</td>
                  </tr>
                  <tr>
                    <td className="border border-slate-300 px-2.5 py-1 text-center font-mono">F</td>
                    <td className="border border-slate-300 px-3 py-1 text-slate-700">TOTAL FSI CONSUMPTION RATIO</td>
                    <td className="border border-slate-300 px-3 py-1 text-right font-mono font-bold">{formatNumber(areaMetrics.proposedTotalFsi || 0, 3)}</td>
                  </tr>
                  <tr>
                    <td className="border border-slate-300 px-2.5 py-1 text-center font-mono">G</td>
                    <td className="border border-slate-300 px-3 py-1 text-slate-800">{ancillaryLabel}</td>
                    <td className="border border-slate-300 px-3 py-1 text-right font-mono font-semibold">{formatNumber((areaMetrics.proposedAncillaryResSqm || 0) * unitFactor)}</td>
                  </tr>
                  <tr className="bg-emerald-50 font-bold border-t-2 border-slate-400">
                    <td className="border border-slate-300 px-2.5 py-1.5 text-center font-mono text-emerald-950">H</td>
                    <td className="border border-slate-300 px-3 py-1.5 text-emerald-950 font-extrabold">TOTAL PROPOSED P-LINE AREA (E + G)</td>
                    <td className="border border-slate-300 px-3 py-1.5 text-right font-mono text-emerald-950 font-extrabold">{formatNumber((areaMetrics.proposedPlineTotalSqm || 0) * unitFactor)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* TABLE 3 — PROPOSED FLOOR-WISE P-LINE STATEMENT (REQ-H EXACT SEQUENCE) */}
            <div className="space-y-2">
              <div className="bg-slate-800 text-white px-3.5 py-2 font-bold rounded-t text-xs uppercase tracking-wider flex items-center justify-between">
                <span>Table 3 — Proposed Floor-wise P-Line Area Statement</span>
                <span className="text-[10px] font-mono font-normal">Sequence: Level | Height | P-Line | Lobby | Saleable | Units | Area/Unit</span>
              </div>

              <table className="w-full border-collapse border border-slate-300 text-left text-xs">
                <thead>
                  <tr className="bg-slate-100 text-slate-800 font-bold border-b border-slate-300">
                    <th className="border border-slate-300 px-3 py-1.5">Floor Level</th>
                    <th className="border border-slate-300 px-2.5 py-1.5 text-right w-24">Height (m)</th>
                    <th className="border border-slate-300 px-2.5 py-1.5 text-right w-32">P-Line Area ({unitLabel})</th>
                    <th className="border border-slate-300 px-2.5 py-1.5 text-right w-32">Lobby Area ({unitLabel})</th>
                    <th className="border border-slate-300 px-2.5 py-1.5 text-right w-32">Built-up for Sale ({unitLabel})</th>
                    <th className="border border-slate-300 px-2.5 py-1.5 text-center w-24">No. Of Units</th>
                    <th className="border border-slate-300 px-2.5 py-1.5 text-right w-32">Area For 1 Unit ({unitLabel})</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {floors.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="border border-slate-300 py-8 text-center text-slate-400 italic">
                        No floor plates defined yet. Add floor levels in the Area Statement input form.
                      </td>
                    </tr>
                  ) : (
                    floors.map((f, idx) => {
                      const isParking = ['parking', 'BASEMENT_1', 'BASEMENT_2', 'STILT', 'UPPER_PARKING'].includes(f.floor_type?.toUpperCase?.() || f.floor_type);
                      const units = parseInt(f.no_of_units, 10) || 0;
                      const sale = parseFloat(f.builtup_for_sale_sqm) || 0;
                      const areaFor1Unit = units > 0 ? (sale / units) * unitFactor : 0;

                      return (
                        <tr key={idx} className={isParking ? 'bg-amber-50/40' : (idx % 2 === 1 ? 'bg-slate-50/50' : '')}>
                          <td className="border border-slate-300 px-3 py-1 font-medium">
                            {f.floor_name}
                            {isParking && (
                              <span className="ml-1.5 text-[9px] font-bold text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded border border-amber-300">
                                Parking (Non-FSI)
                              </span>
                            )}
                          </td>
                          <td className="border border-slate-300 px-2.5 py-1 text-right font-mono">{formatNumber(f.height_meters)}m</td>
                          <td className="border border-slate-300 px-2.5 py-1 text-right font-mono font-semibold">{formatNumber((f.pline_area_sqm || 0) * unitFactor)}</td>
                          <td className="border border-slate-300 px-2.5 py-1 text-right font-mono">
                            {formatNumber((f.lobby_area_sqm || 0) * unitFactor)}
                            {f.is_lobby_overridden && (
                              <span className="text-[8px] text-[#E05A1E] font-bold block leading-tight">*manual override</span>
                            )}
                          </td>
                          <td className="border border-slate-300 px-2.5 py-1 text-right font-mono text-[#E05A1E] font-semibold">
                            {isParking ? '—' : formatNumber((f.builtup_for_sale_sqm || 0) * unitFactor)}
                          </td>
                          <td className="border border-slate-300 px-2.5 py-1 text-center font-mono font-bold">
                            {isParking ? '—' : units}
                          </td>
                          <td className="border border-slate-300 px-2.5 py-1 text-right font-mono font-bold text-slate-800">
                            {isParking || units === 0 ? '—' : formatNumber(areaFor1Unit)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                  <tr className="bg-slate-200 font-bold border-t-2 border-slate-400">
                    <td className="border border-slate-300 px-3 py-1.5">TOTAL PROPOSED P-LINE (A)</td>
                    <td className="border border-slate-300 px-2.5 py-1.5 text-right font-mono">{formatNumber(areaMetrics.totalHeightMeters)}m</td>
                    <td className="border border-slate-300 px-2.5 py-1.5 text-right font-mono text-slate-900 font-extrabold">{formatNumber((areaMetrics.totalProposedPlineSqm || 0) * unitFactor)}</td>
                    <td className="border border-slate-300 px-2.5 py-1.5 text-right font-mono">{formatNumber((areaMetrics.totalLobbyAreaSqm || 0) * unitFactor)}</td>
                    <td className="border border-slate-300 px-2.5 py-1.5 text-right font-mono text-[#E05A1E] font-extrabold">{formatNumber((areaMetrics.totalBuiltupForSaleSqm || 0) * unitFactor)}</td>
                    <td className="border border-slate-300 px-2.5 py-1.5 text-center font-mono font-bold">{areaMetrics.totalUnitsCount || 0}</td>
                    <td className="border border-slate-300 px-2.5 py-1.5 text-right font-mono text-slate-400">—</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* TABLE 4 — SECONDARY REGULATORY FORMULAS & COMPLIANCE SUMMARY */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <ShieldCheck size={14} className="text-emerald-600" />
                FSI Compliance & Verification Summary (Dividing Factor 1.6)
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                  <span className="text-[10px] text-slate-500 uppercase font-semibold block">Base Dividing Area</span>
                  <span className="font-mono text-xs font-bold text-slate-900">{formatNumber((areaMetrics.baseDividingFactorSqm || 0) * unitFactor)}</span>
                </div>
                <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                  <span className="text-[10px] text-slate-500 uppercase font-semibold block">Derived Ancillary Area</span>
                  <span className="font-mono text-xs font-bold text-slate-900">{formatNumber((areaMetrics.derivedAncillaryAreaSqm || 0) * unitFactor)}</span>
                </div>
                <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                  <span className="text-[10px] text-slate-500 uppercase font-semibold block">Paid FSI Required</span>
                  <span className="font-mono text-xs font-bold text-slate-900">{formatNumber((areaMetrics.paidFsiRequiredSqm || 0) * unitFactor)}</span>
                </div>
                <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                  <span className="text-[10px] text-slate-500 uppercase font-semibold block">Area Potential Balance</span>
                  <span className={`font-mono text-xs font-bold ${areaMetrics.areaBalanceSqm >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                    {formatNumber((areaMetrics.areaBalanceSqm || 0) * unitFactor)}
                  </span>
                </div>
              </div>
            </div>

            {/* Sign-off Footer */}
            <div className="pt-8 border-t border-slate-200 grid grid-cols-2 sm:grid-cols-3 gap-6 text-center text-xs">
              <div className="space-y-6">
                <div className="border-b border-slate-400 w-36 mx-auto" />
                <span className="text-slate-600 block text-[11px] font-medium">Prepared by (Architect)</span>
              </div>
              <div className="space-y-6">
                <div className="border-b border-slate-400 w-36 mx-auto" />
                <span className="text-slate-600 block text-[11px] font-medium">Verified by (Lead Architect)</span>
              </div>
              <div className="space-y-6 col-span-2 sm:col-span-1">
                <div className="border-b border-slate-400 w-36 mx-auto" />
                <span className="text-slate-600 block text-[11px] font-medium">Client Acceptance</span>
              </div>
            </div>
          </div>
        ) : (
          /* ===================================================================== */
          /* 2. COMPLETE FINANCIAL VIABILITY REPORT SHEET                         */
          /* ===================================================================== */
          <div className="space-y-6">
            {/* Financial Viability Header */}
            <div className="border-b-2 border-slate-900 pb-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-base tracking-tight text-[#E05A1E]">DESIGN STUDIO 16</span>
                  <span className="text-slate-300">|</span>
                  <span className="font-bold text-xs uppercase tracking-wider text-slate-800">Financial Viability & Feasibility Report</span>
                </div>
                <h2 className="text-base font-extrabold text-slate-900 mt-1">
                  {project?.name || 'Architectural Project'}
                </h2>
                <p className="text-[11px] text-slate-600">
                  {project?.client_name ? `Client: ${project.client_name}` : ''} {project?.location ? `• Location: ${project.location}` : ''}
                </p>
              </div>

              <div className="text-right text-[11px] bg-slate-50 border border-slate-200 rounded-lg p-2.5 space-y-0.5">
                <p><span className="text-slate-500 font-medium">Ready Reckoner Rate:</span> <strong className="text-slate-900 font-bold">{financial.rr_rate_per_sqm ? `₹${Number(financial.rr_rate_per_sqm).toLocaleString('en-IN')}/sqm` : 'Not Configured'}</strong></p>
                <p><span className="text-slate-500 font-medium">Civil Construction:</span> <strong className="text-slate-900">{financial.cost_of_construction_rate ? `₹${Number(financial.cost_of_construction_rate).toLocaleString('en-IN')}/sqm` : 'Not Configured'}</strong></p>
                <p><span className="text-slate-500 font-medium">Date:</span> <strong className="text-slate-900">{new Date().toLocaleDateString('en-GB')}</strong></p>
              </div>
            </div>

            {/* SECTION A — STATUTORY & REGULATORY CHARGES */}
            <div className="space-y-2">
              <div className="bg-slate-900 text-white px-3.5 py-2 font-bold rounded-t text-xs uppercase tracking-wider flex items-center justify-between">
                <span>Section A — Statutory & Local Authority Demands</span>
                <span className="text-[10px] text-slate-300 font-normal">Ready Reckoner Benchmark Basis</span>
              </div>

              <table className="w-full border-collapse border border-slate-300 text-left text-xs">
                <thead>
                  <tr className="bg-slate-100 text-slate-800 font-bold border-b border-slate-300">
                    <th className="border border-slate-300 px-2.5 py-1.5 w-12 text-center">Sr.</th>
                    <th className="border border-slate-300 px-3 py-1.5">Statutory Charge Particulars</th>
                    <th className="border border-slate-300 px-2.5 py-1.5 text-center w-24">RR %</th>
                    <th className="border border-slate-300 px-3 py-1.5 text-right w-44">Calculated Demand (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {statutoryCharges.filter(c => !c.is_deleted).map((item, idx) => {
                    const isEnabled = item.is_enabled !== false;
                    return (
                      <tr key={item.id || idx} className={!isEnabled ? 'bg-slate-50/50 opacity-50' : ''}>
                        <td className="border border-slate-300 px-2.5 py-1 text-center font-mono">{idx + 1}</td>
                        <td className={`border border-slate-300 px-3 py-1 font-medium ${!isEnabled ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                          {item.charge_name}
                          {!isEnabled && (
                            <span className="ml-2 text-[9px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-300 no-underline font-bold uppercase">
                              Excluded
                            </span>
                          )}
                        </td>
                        <td className="border border-slate-300 px-2.5 py-1 text-center font-mono">
                          {item.rr_percentage ? `${item.rr_percentage}%` : '—'}
                        </td>
                        <td className={`border border-slate-300 px-3 py-1 text-right font-mono font-semibold ${!isEnabled ? 'text-slate-400' : 'text-slate-900'}`}>
                          {isEnabled ? formatINR(item.calculated_amount ?? item.amount) : '₹0.00'}
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="bg-slate-200 font-bold border-t-2 border-slate-400">
                    <td className="border border-slate-300 px-2.5 py-1.5 text-center font-mono text-slate-900">A</td>
                    <td className="border border-slate-300 px-3 py-1.5 text-slate-900 font-extrabold" colSpan="2">
                      TOTAL STATUTORY & LOCAL AUTHORITY DEMAND (SECTION A)
                    </td>
                    <td className="border border-slate-300 px-3 py-1.5 text-right font-mono text-slate-950 font-extrabold text-sm">
                      {formatINR(financialMetrics.totalStatutoryDemandA)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* SECTIONS B TO H — DIRECT DEVELOPMENT & INFRASTRUCTURE EXPENDITURES */}
            <div className="space-y-2">
              <div className="bg-slate-800 text-white px-3.5 py-2 font-bold rounded-t text-xs uppercase tracking-wider flex items-center justify-between">
                <span>Sections B to H — Direct Development & Civil Construction Costs</span>
                <span className="text-[10px] text-slate-300 font-normal">Execution & Land Expenditures</span>
              </div>

              <table className="w-full border-collapse border border-slate-300 text-left text-xs">
                <thead>
                  <tr className="bg-slate-100 text-slate-800 font-bold border-b border-slate-300">
                    <th className="border border-slate-300 px-2.5 py-1.5 w-12 text-center">Code</th>
                    <th className="border border-slate-300 px-3 py-1.5">Cost Head & Description</th>
                    <th className="border border-slate-300 px-3 py-1.5 text-right w-44">Amount (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  <tr>
                    <td className="border border-slate-300 px-2.5 py-1 font-mono text-center font-bold">B</td>
                    <td className="border border-slate-300 px-3 py-1 text-slate-800">
                      Cost of TDR Loading (55% of RR Rate ₹{financial.rr_rate_per_sqm || 0}/sqm × {formatNumber(areaMetrics.proposedTdrSqm)} sqm)
                    </td>
                    <td className="border border-slate-300 px-3 py-1 text-right font-mono font-semibold">{formatINR(financialMetrics.costOfTdrB)}</td>
                  </tr>
                  <tr>
                    <td className="border border-slate-300 px-2.5 py-1 font-mono text-center font-bold">C</td>
                    <td className="border border-slate-300 px-3 py-1 text-slate-800">
                      BPMS Staff, Fire & Airport NOCs, Minor Statutory Approvals
                    </td>
                    <td className="border border-slate-300 px-3 py-1 text-right font-mono">{formatINR(financialMetrics.totalExpensesC)}</td>
                  </tr>
                  <tr>
                    <td className="border border-slate-300 px-2.5 py-1 font-mono text-center font-bold">D</td>
                    <td className="border border-slate-300 px-3 py-1 text-slate-800">
                      Cost of Civil Construction (@ ₹{financial.cost_of_construction_rate || 0}/sqm × {formatNumber(areaMetrics.totalProposedPlineSqm || areaMetrics.proposedPlineTotalSqm)} sqm)
                    </td>
                    <td className="border border-slate-300 px-3 py-1 text-right font-mono font-semibold">{formatINR(financialMetrics.costOfConstructionD)}</td>
                  </tr>
                  <tr>
                    <td className="border border-slate-300 px-2.5 py-1 font-mono text-center font-bold">E</td>
                    <td className="border border-slate-300 px-3 py-1 text-slate-800">
                      Basement Construction Cost (@ ₹{financial.basement_rate_per_sqm || 0}/sqm × {financial.basement_area_sqm || 0} sqm)
                    </td>
                    <td className="border border-slate-300 px-3 py-1 text-right font-mono">{formatINR(financialMetrics.costOfBasementE)}</td>
                  </tr>
                  <tr>
                    <td className="border border-slate-300 px-2.5 py-1 font-mono text-center font-bold">F</td>
                    <td className="border border-slate-300 px-3 py-1 text-slate-800">
                      Rent Compensation During Construction ({financial.rent_tenements || 0} tenements × ₹{financial.rent_per_tenement_per_month || 0}/mo × {financial.rent_months || 0} mos)
                    </td>
                    <td className="border border-slate-300 px-3 py-1 text-right font-mono">{formatINR(financialMetrics.rentCostF)}</td>
                  </tr>
                  <tr>
                    <td className="border border-slate-300 px-2.5 py-1 font-mono text-center font-bold">G</td>
                    <td className="border border-slate-300 px-3 py-1 text-slate-800">
                      Mechanical / Stacked Car Parking Costs ({financial.stacked_parking_slots || 0} slots @ ₹{financial.stacked_parking_cost_per_slot || 0}/slot)
                    </td>
                    <td className="border border-slate-300 px-3 py-1 text-right font-mono">{formatINR(financialMetrics.stackedParkingCostG)}</td>
                  </tr>
                  <tr>
                    <td className="border border-slate-300 px-2.5 py-1 font-mono text-center font-bold">H</td>
                    <td className="border border-slate-300 px-3 py-1 text-slate-800">
                      Cost of Land / Plot Acquisition
                    </td>
                    <td className="border border-slate-300 px-3 py-1 text-right font-mono font-semibold">{formatINR(financialMetrics.costOfPlotH)}</td>
                  </tr>
                  <tr className="bg-orange-50 font-bold border-t-2 border-slate-400">
                    <td className="border border-slate-300 px-2.5 py-1.5 text-center font-mono text-orange-950">TOTAL</td>
                    <td className="border border-slate-300 px-3 py-1.5 text-orange-950 font-extrabold">
                      TOTAL PROJECT DEVELOPMENT EXPENDITURE (A to H)
                    </td>
                    <td className="border border-slate-300 px-3 py-1.5 text-right font-mono text-[#E05A1E] font-extrabold text-sm">
                      {formatINR(financialMetrics.totalProjectCost)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* SECTION I — SALABLE INVENTORY & REVENUE REALIZATION */}
            <div className="space-y-2">
              <div className="bg-slate-800 text-white px-3.5 py-2 font-bold rounded-t text-xs uppercase tracking-wider flex items-center justify-between">
                <span>Section I — Floor-wise Salable Inventory & Revenue Realization</span>
                <span className="text-[10px] text-slate-300 font-normal">Sourced from Table 3 Area Schedule</span>
              </div>

              <table className="w-full border-collapse border border-slate-300 text-left text-xs">
                <thead>
                  <tr className="bg-slate-100 text-slate-800 font-bold border-b border-slate-300">
                    <th className="border border-slate-300 px-3 py-1.5">Floor Level</th>
                    <th className="border border-slate-300 px-2.5 py-1.5 text-center w-16">Units</th>
                    <th className="border border-slate-300 px-2.5 py-1.5 text-right w-28">Sale Area ({unitLabel})</th>
                    <th className="border border-slate-300 px-2.5 py-1.5 text-right w-28">Area / Unit</th>
                    <th className="border border-slate-300 px-2.5 py-1.5 text-right w-28">Price / {unitLabel} (₹)</th>
                    <th className="border border-slate-300 px-2.5 py-1.5 text-right w-32">Cost / Unit (₹)</th>
                    <th className="border border-slate-300 px-3 py-1.5 text-right w-36">Total Realization (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {floors.filter(f => f.floor_type !== 'parking' && parseFloat(f.builtup_for_sale_sqm) > 0).length === 0 && salableUnits.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="border border-slate-300 py-8 text-center text-slate-400 italic">
                        No salable floors configured yet. Configure floor saleable areas in Area Statement or Financial Viability.
                      </td>
                    </tr>
                  ) : floors.filter(f => f.floor_type !== 'parking' && parseFloat(f.builtup_for_sale_sqm) > 0).length > 0 ? (
                    floors.filter(f => f.floor_type !== 'parking' && parseFloat(f.builtup_for_sale_sqm) > 0).map((fl, idx) => {
                      const units = parseInt(fl.no_of_units, 10) || 0;
                      const saleSqm = parseFloat(fl.builtup_for_sale_sqm) || 0;
                      const area1Unit = units > 0 ? (saleSqm / units) : 0;
                      const rate = parseFloat(fl.rate_per_sqm) || 0;
                      const cost1Unit = area1Unit > 0 && rate > 0 ? (area1Unit * rate) : (parseFloat(fl.cost_for_1_unit) || 0);
                      const realization = rate > 0 ? (saleSqm * rate) : (cost1Unit * units);

                      return (
                        <tr key={fl.id || idx}>
                          <td className="border border-slate-300 px-3 py-1 font-medium text-slate-800">{fl.floor_name}</td>
                          <td className="border border-slate-300 px-2.5 py-1 text-center font-mono font-bold">{units}</td>
                          <td className="border border-slate-300 px-2.5 py-1 text-right font-mono">{formatNumber(saleSqm * unitFactor)}</td>
                          <td className="border border-slate-300 px-2.5 py-1 text-right font-mono">{formatNumber(area1Unit * unitFactor)}</td>
                          <td className="border border-slate-300 px-2.5 py-1 text-right font-mono">{rate > 0 ? formatINR(rate) : '—'}</td>
                          <td className="border border-slate-300 px-2.5 py-1 text-right font-mono font-semibold text-[#E05A1E]">{formatINR(cost1Unit)}</td>
                          <td className="border border-slate-300 px-3 py-1 text-right font-mono font-bold text-emerald-800">{formatINR(realization)}</td>
                        </tr>
                      );
                    })
                  ) : (
                    salableUnits.map((u, idx) => (
                      <tr key={idx}>
                        <td className="border border-slate-300 px-3 py-1 font-medium text-slate-800">{u.unit_name}</td>
                        <td className="border border-slate-300 px-2.5 py-1 text-center font-mono font-bold">{u.unit_count}</td>
                        <td className="border border-slate-300 px-2.5 py-1 text-right font-mono">{formatNumber(u.carpet_area_sqft)}</td>
                        <td className="border border-slate-300 px-2.5 py-1 text-right font-mono">—</td>
                        <td className="border border-slate-300 px-2.5 py-1 text-right font-mono">{formatINR(u.rate_per_sqft)}</td>
                        <td className="border border-slate-300 px-2.5 py-1 text-right font-mono font-semibold text-[#E05A1E]">{formatINR(u.unit_price)}</td>
                        <td className="border border-slate-300 px-3 py-1 text-right font-mono font-bold text-emerald-800">{formatINR(u.total_amount)}</td>
                      </tr>
                    ))
                  )}
                  <tr className="bg-emerald-50 font-bold border-t-2 border-slate-400">
                    <td className="border border-slate-300 px-3 py-1.5 text-emerald-950 font-extrabold" colSpan="6">
                      GROSS ESTIMATED REALIZATION / RECEIPTS (SECTION I)
                    </td>
                    <td className="border border-slate-300 px-3 py-1.5 text-right font-mono text-emerald-950 font-extrabold text-sm">
                      {formatINR(financialMetrics.totalReceipts)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* SECTION J — EXECUTIVE FEASIBILITY & PROFITABILITY SUMMARY */}
            <div className="bg-slate-900 text-white p-5 rounded-xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <span className="font-extrabold text-xs uppercase tracking-wider text-orange-400">
                  Section J — Executive Financial Feasibility & Net Profitability Summary
                </span>
                <span className="text-[10px] text-slate-400">Overall Realization Balance</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                <div className="bg-slate-800/90 p-3 rounded-lg border border-slate-700">
                  <span className="text-[10px] text-slate-400 block uppercase font-bold tracking-wider">Total Project Cost</span>
                  <span className="font-mono text-sm font-extrabold text-slate-100">{formatINR(financialMetrics.totalProjectCost)}</span>
                </div>
                <div className="bg-slate-800/90 p-3 rounded-lg border border-slate-700">
                  <span className="text-[10px] text-slate-400 block uppercase font-bold tracking-wider">Gross Estimated Receipts</span>
                  <span className="font-mono text-sm font-extrabold text-emerald-400">{formatINR(financialMetrics.totalReceipts)}</span>
                </div>
                <div className="bg-slate-800/90 p-3 rounded-lg border border-slate-700">
                  <span className="text-[10px] text-slate-400 block uppercase font-bold tracking-wider">Projected Net Profit</span>
                  <span className={`font-mono text-sm font-extrabold ${financialMetrics.netProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {formatINR(financialMetrics.netProfit)}
                  </span>
                </div>
                <div className="bg-slate-800/90 p-3 rounded-lg border border-slate-700">
                  <span className="text-[10px] text-slate-400 block uppercase font-bold tracking-wider">Estimated ROI / Margin</span>
                  <span className="font-mono text-sm font-extrabold text-orange-400">
                    {formatNumber(financialMetrics.roiPct, 1)}% ROI ({formatNumber(financialMetrics.profitMarginPct, 1)}% Margin)
                  </span>
                </div>
              </div>
            </div>

            {/* Sign-off Footer */}
            <div className="pt-8 border-t border-slate-200 grid grid-cols-2 sm:grid-cols-3 gap-6 text-center text-xs">
              <div className="space-y-6">
                <div className="border-b border-slate-400 w-36 mx-auto" />
                <span className="text-slate-600 block text-[11px] font-medium">Prepared by (Accounts & Finance)</span>
              </div>
              <div className="space-y-6">
                <div className="border-b border-slate-400 w-36 mx-auto" />
                <span className="text-slate-600 block text-[11px] font-medium">Verified by (Lead Architect)</span>
              </div>
              <div className="space-y-6 col-span-2 sm:col-span-1">
                <div className="border-b border-slate-400 w-36 mx-auto" />
                <span className="text-slate-600 block text-[11px] font-medium">Client Acceptance</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
