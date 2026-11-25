// client/src/components/projects/feasibility/FeasibilityDocumentPreview.jsx
import React from 'react';
import { ShieldCheck } from 'lucide-react';

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
  unitDisplay = 'sq_m'
}) {
  const isSqft = unitDisplay === 'sq_ft';
  const unitFactor = isSqft ? 10.764 : 1;
  const unitLabel = isSqft ? 'Sq Ft' : 'Sq M';

  const buildingUse = statement.building_use || 'Residential';
  const isCommercial = buildingUse === 'Commercial' || buildingUse === 'COMMERCIAL';
  const ancillaryLabel = isCommercial ? 'Ancillary FSI (80% Commercial)' : 'Ancillary FSI (60% Residential)';

  const salableFloors = floors.filter(
    (f) => f.floor_type !== 'parking' && f.floor_type !== 'terrace' && parseFloat(f.builtup_for_sale_sqm) > 0
  );

  return (
    <div
      id="feasibility-document-canvas"
      className="bg-white border border-[#CBD5E1] rounded-xl shadow-md p-4 sm:p-6 lg:p-8 text-[#1A1A1A] space-y-10 text-xs w-full"
    >
      {/* ===================================================================== */}
      {/* 1. COMPLETE AREA STATEMENT REPORT                                     */}
      {/* ===================================================================== */}
      <div className="space-y-6">
        {/* Area Statement Header */}
        <div className="border-b-2 border-slate-900 pb-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-extrabold text-base tracking-tight text-[#E05A1E]">DESIGN STUDIO 16</span>
              <span className="text-slate-300 hidden sm:inline">|</span>
              <span className="font-bold text-xs uppercase tracking-wider text-slate-800">
                Area Statement &amp; FSI Potential Report
              </span>
            </div>
            <h2 className="text-base font-extrabold text-slate-900 mt-1">
              {project?.name || 'Architectural Project'}
            </h2>
            <p className="text-[11px] text-slate-600">
              {project?.client_name ? `Client: ${project.client_name}` : ''}{' '}
              {project?.location ? `• Location: ${project.location}` : ''}
            </p>
          </div>

          <div className="w-full sm:w-auto sm:text-right text-[11px] bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-0.5">
            <p>
              <span className="text-slate-500 font-medium">Unit Basis:</span>{' '}
              <strong className="font-mono text-slate-900 uppercase">{unitLabel}</strong>
            </p>
            <p>
              <span className="text-slate-500 font-medium">Building Use:</span>{' '}
              <strong className="text-slate-900">{isCommercial ? 'Commercial (80% Ancillary)' : 'Residential (60% Ancillary)'}</strong>
            </p>
            <p>
              <span className="text-slate-500 font-medium">Road Width:</span>{' '}
              <strong className="text-slate-900">
                {statement.road_width_m ? `${statement.road_width_m}m ${statement.is_gunthewari ? '(Gunthewari)' : '(Regular)'}` : 'Not Specified'}
              </strong>
            </p>
            <p>
              <span className="text-slate-500 font-medium">Date:</span>{' '}
              <strong className="text-slate-900">{new Date().toLocaleDateString('en-GB')}</strong>
            </p>
          </div>
        </div>

        {/* TABLE 1 — PERMISSIBLE AREA STATEMENT */}
        <div className="space-y-2">
          <div className="bg-slate-900 text-white px-3.5 py-2 font-bold rounded-t text-xs uppercase tracking-wider flex flex-wrap items-center justify-between gap-2">
            <span>Table 1 — Permissible Area Statement ({unitLabel})</span>
            <span className="text-[10px] font-normal lowercase tracking-normal text-slate-300">
              regulatory potential analysis
            </span>
          </div>

          <div className="w-full overflow-x-auto">
            <table className="w-full border-collapse border border-slate-300 text-left text-xs">
              <thead>
                <tr className="bg-slate-100 text-slate-800 font-bold border-b border-slate-300">
                  <th className="border border-slate-300 px-2 py-2 w-10 sm:w-14 text-center">Sr.</th>
                  <th className="border border-slate-300 px-2.5 sm:px-3 py-2">Particulars</th>
                  <th className="border border-slate-300 px-2.5 sm:px-3 py-2 text-right w-28 sm:w-44">Permissible ({unitLabel})</th>
                </tr>
              </thead>
            <tbody className="divide-y divide-slate-200">
              <tr>
                <td className="border border-slate-300 px-2 py-1.5 text-center font-mono font-medium">1</td>
                <td className="border border-slate-300 px-2.5 sm:px-3 py-1.5 font-medium text-slate-800">Area Of Plot</td>
                <td className="border border-slate-300 px-2.5 sm:px-3 py-1.5 text-right font-mono font-semibold tabular-nums">
                  {formatNumber((statement.plot_area_sqm || 0) * unitFactor)}
                </td>
              </tr>
              <tr>
                <td className="border border-slate-300 px-2 py-1.5 text-center font-mono font-medium">2</td>
                <td className="border border-slate-300 px-2.5 sm:px-3 py-1.5 text-slate-700">
                  Deductions For Proposed D.P. Road / Reservation
                </td>
                <td className="border border-slate-300 px-2.5 sm:px-3 py-1.5 text-right font-mono tabular-nums">
                  {formatNumber((statement.dp_deductions_sqm || 0) * unitFactor)}
                </td>
              </tr>
              <tr>
                <td className="border border-slate-300 px-2 py-1.5 text-center font-mono font-medium">3</td>
                <td className="border border-slate-300 px-2.5 sm:px-3 py-1.5 text-slate-700">Existing Built-up Area Deduction</td>
                <td className="border border-slate-300 px-2.5 sm:px-3 py-1.5 text-right font-mono tabular-nums">
                  {formatNumber((statement.existing_builtup_area_sqm || 0) * unitFactor)}
                </td>
              </tr>
              <tr className="bg-orange-50 font-bold border-t-2 border-slate-400">
                <td className="border border-slate-300 px-2 py-1.5 text-center font-mono text-orange-950">A</td>
                <td className="border border-slate-300 px-2.5 sm:px-3 py-1.5 text-orange-950 font-extrabold">
                  Plotable Area (Net Development Plot)
                </td>
                <td className="border border-slate-300 px-2.5 sm:px-3 py-1.5 text-right font-mono text-orange-950 font-extrabold tabular-nums">
                  {formatNumber((areaMetrics.plotableAreaSqm || 0) * unitFactor)}
                </td>
              </tr>
              <tr>
                <td className="border border-slate-300 px-2 py-1.5 text-center font-mono">B</td>
                <td className="border border-slate-300 px-2.5 sm:px-3 py-1.5 text-slate-800">
                  Basic Permissible FSI ({statement.basic_fsi_factor || 1.1} × Plot Area)
                </td>
                <td className="border border-slate-300 px-2.5 sm:px-3 py-1.5 text-right font-mono font-semibold tabular-nums">
                  {formatNumber((areaMetrics.permissibleFsiSqm || 0) * unitFactor)}
                </td>
              </tr>
              <tr>
                <td className="border border-slate-300 px-2 py-1.5 text-center font-mono">C</td>
                <td className="border border-slate-300 px-2.5 sm:px-3 py-1.5 text-slate-800">
                  Paid FSI ({statement.paid_fsi_factor || 0.5} × Plot Area)
                </td>
                <td className="border border-slate-300 px-2.5 sm:px-3 py-1.5 text-right font-mono tabular-nums">
                  {formatNumber((areaMetrics.permissiblePaidFsiSqm || 0) * unitFactor)}
                </td>
              </tr>
              <tr>
                <td className="border border-slate-300 px-2 py-1.5 text-center font-mono">D1</td>
                <td className="border border-slate-300 px-2.5 sm:px-3 py-1.5 text-slate-800">
                  Regular TDR Permissible {statement.road_width_m ? `(${statement.road_width_m}m road @ ${statement.regular_tdr_factor || 0})` : ''}
                </td>
                <td className="border border-slate-300 px-2.5 sm:px-3 py-1.5 text-right font-mono tabular-nums">
                  {formatNumber((areaMetrics.permissibleRegularTdrSqm ?? areaMetrics.permissibleTdrSqm ?? 0) * unitFactor)}
                </td>
              </tr>
              <tr>
                <td className="border border-slate-300 px-2 py-1.5 text-center font-mono">D2</td>
                <td className="border border-slate-300 px-2.5 sm:px-3 py-1.5 text-slate-800">
                  Slum TDR Permissible {statement.slum_tdr_factor ? `(Factor ${statement.slum_tdr_factor})` : ''}
                </td>
                <td className="border border-slate-300 px-2.5 sm:px-3 py-1.5 text-right font-mono tabular-nums">
                  {areaMetrics.permissibleSlumTdrSqm ? formatNumber(areaMetrics.permissibleSlumTdrSqm * unitFactor) : '—'}
                </td>
              </tr>
              <tr className="bg-slate-50 font-bold">
                <td className="border border-slate-300 px-2 py-1.5 text-center font-mono">E</td>
                <td className="border border-slate-300 px-2.5 sm:px-3 py-1.5 text-slate-900">Total Builtup Area (B + C + D)</td>
                <td className="border border-slate-300 px-2.5 sm:px-3 py-1.5 text-right font-mono tabular-nums">
                  {formatNumber((areaMetrics.permissibleTotalBuiltupSqm || 0) * unitFactor)}
                </td>
              </tr>
              <tr>
                <td className="border border-slate-300 px-2 py-1.5 text-center font-mono">F</td>
                <td className="border border-slate-300 px-2.5 sm:px-3 py-1.5 text-slate-700">TOTAL FSI CONSUMPTION RATIO</td>
                <td className="border border-slate-300 px-2.5 sm:px-3 py-1.5 text-right font-mono tabular-nums">
                  {formatNumber(areaMetrics.permissibleTotalFsi || 0, 3)}
                </td>
              </tr>
              {statement.building_use === 'Mixed Use' ? (
                <>
                  <tr>
                    <td className="border border-slate-300 px-2 py-1.5 text-center font-mono">G1</td>
                    <td className="border border-slate-300 px-2.5 sm:px-3 py-1.5 text-slate-800">Residential Ancillary FSI (60%)</td>
                    <td className="border border-slate-300 px-2.5 sm:px-3 py-1.5 text-right font-mono tabular-nums">
                      {formatNumber((areaMetrics.permissibleResidentialAncillarySqm || 0) * unitFactor)}
                    </td>
                  </tr>
                  <tr>
                    <td className="border border-slate-300 px-2 py-1.5 text-center font-mono">G2</td>
                    <td className="border border-slate-300 px-2.5 sm:px-3 py-1.5 text-slate-800">Commercial Ancillary FSI (80%)</td>
                    <td className="border border-slate-300 px-2.5 sm:px-3 py-1.5 text-right font-mono tabular-nums">
                      {formatNumber((areaMetrics.permissibleCommercialAncillarySqm || 0) * unitFactor)}
                    </td>
                  </tr>
                  <tr className="bg-slate-50 font-semibold">
                    <td className="border border-slate-300 px-2 py-1.5 text-center font-mono">G</td>
                    <td className="border border-slate-300 px-2.5 sm:px-3 py-1.5 text-slate-900">
                      Total Permissible Ancillary Area (G1 + G2)
                    </td>
                    <td className="border border-slate-300 px-2.5 sm:px-3 py-1.5 text-right font-mono tabular-nums">
                      {formatNumber((areaMetrics.permissibleTotalAncillarySqm || 0) * unitFactor)}
                    </td>
                  </tr>
                </>
              ) : (
                <tr>
                  <td className="border border-slate-300 px-2 py-1.5 text-center font-mono">G</td>
                  <td className="border border-slate-300 px-2.5 sm:px-3 py-1.5 text-slate-800">{ancillaryLabel}</td>
                  <td className="border border-slate-300 px-2.5 sm:px-3 py-1.5 text-right font-mono tabular-nums">
                    {formatNumber((areaMetrics.permissibleAncillaryResSqm || 0) * unitFactor)}
                  </td>
                </tr>
              )}
              <tr className="bg-emerald-50 font-bold border-t-2 border-slate-400">
                <td className="border border-slate-300 px-2 py-2 text-center font-mono text-emerald-950">H</td>
                <td className="border border-slate-300 px-2.5 sm:px-3 py-2 text-emerald-950 font-extrabold">
                  TOTAL PERMISSIBLE P-LINE AREA (E + G)
                </td>
                <td className="border border-slate-300 px-2.5 sm:px-3 py-2 text-right font-mono text-emerald-950 font-extrabold tabular-nums">
                  {formatNumber((areaMetrics.permissiblePlineTotalSqm || 0) * unitFactor)}
                </td>
              </tr>
            </tbody>
          </table>
          </div>
        </div>

        {/* TABLE 2 — PROPOSED AREA STATEMENT */}
        <div className="space-y-2">
          <div className="bg-slate-800 text-white px-3.5 py-2 font-bold rounded-t text-xs uppercase tracking-wider flex flex-wrap items-center justify-between gap-2">
            <span>Table 2 — Proposed Area Statement ({unitLabel})</span>
            <span className="text-[10px] font-normal lowercase tracking-normal text-slate-300">
              architectural design proposal
            </span>
          </div>

          <div className="w-full overflow-x-auto">
            <table className="w-full border-collapse border border-slate-300 text-left text-xs">
              <thead>
                <tr className="bg-slate-100 text-slate-800 font-bold border-b border-slate-300">
                  <th className="border border-slate-300 px-2 py-2 w-10 sm:w-14 text-center">Sr.</th>
                  <th className="border border-slate-300 px-2.5 sm:px-3 py-2">Particulars</th>
                  <th className="border border-slate-300 px-2.5 sm:px-3 py-2 text-right w-28 sm:w-44">Proposed ({unitLabel})</th>
                </tr>
              </thead>
            <tbody className="divide-y divide-slate-200">
              <tr>
                <td className="border border-slate-300 px-2 py-1.5 text-center font-mono font-medium">1</td>
                <td className="border border-slate-300 px-2.5 sm:px-3 py-1.5 font-medium text-slate-800">Area Of Plot</td>
                <td className="border border-slate-300 px-2.5 sm:px-3 py-1.5 text-right font-mono text-slate-400">—</td>
              </tr>
              <tr>
                <td className="border border-slate-300 px-2 py-1.5 text-center font-mono font-medium">2</td>
                <td className="border border-slate-300 px-2.5 sm:px-3 py-1.5 text-slate-700">
                  Deductions For Proposed D.P. Road / Reservation
                </td>
                <td className="border border-slate-300 px-2.5 sm:px-3 py-1.5 text-right font-mono text-slate-400">—</td>
              </tr>
              <tr>
                <td className="border border-slate-300 px-2 py-1.5 text-center font-mono font-medium">3</td>
                <td className="border border-slate-300 px-2.5 sm:px-3 py-1.5 text-slate-700">Existing Built-up Area Deduction</td>
                <td className="border border-slate-300 px-2.5 sm:px-3 py-1.5 text-right font-mono text-slate-400">—</td>
              </tr>
              <tr className="bg-orange-50 font-bold border-t-2 border-slate-400">
                <td className="border border-slate-300 px-2 py-1.5 text-center font-mono text-orange-950">A</td>
                <td className="border border-slate-300 px-2.5 sm:px-3 py-1.5 text-orange-950 font-extrabold">
                  Plotable Area (Net Development Plot)
                </td>
                <td className="border border-slate-300 px-2.5 sm:px-3 py-1.5 text-right font-mono text-orange-950 font-extrabold tabular-nums">
                  {formatNumber((areaMetrics.plotableAreaSqm || 0) * unitFactor)}
                </td>
              </tr>
              <tr>
                <td className="border border-slate-300 px-2 py-1.5 text-center font-mono">B</td>
                <td className="border border-slate-300 px-2.5 sm:px-3 py-1.5 text-slate-800">
                  Basic Proposed FSI ({statement.basic_fsi_factor || 1.1} × Plot Area)
                </td>
                <td className="border border-slate-300 px-2.5 sm:px-3 py-1.5 text-right font-mono font-semibold tabular-nums">
                  {formatNumber((areaMetrics.proposedBasicFsiSqm || 0) * unitFactor)}
                </td>
              </tr>
              <tr>
                <td className="border border-slate-300 px-2 py-1.5 text-center font-mono">C</td>
                <td className="border border-slate-300 px-2.5 sm:px-3 py-1.5 text-slate-800">
                  Paid Proposed FSI ({statement.paid_fsi_factor || 0.5} × Plot Area)
                </td>
                <td className="border border-slate-300 px-2.5 sm:px-3 py-1.5 text-right font-mono tabular-nums">
                  {formatNumber((areaMetrics.proposedPaidFsiSqm || 0) * unitFactor)}
                </td>
              </tr>
              <tr>
                <td className="border border-slate-300 px-2 py-1.5 text-center font-mono">D1</td>
                <td className="border border-slate-300 px-2.5 sm:px-3 py-1.5 text-slate-800">
                  Regular TDR Utilization {statement.road_width_m ? `(${statement.road_width_m}m road @ ${statement.regular_tdr_factor || 0})` : ''}
                </td>
                <td className="border border-slate-300 px-2.5 sm:px-3 py-1.5 text-right font-mono font-semibold tabular-nums">
                  {formatNumber((areaMetrics.proposedRegularTdrSqm ?? areaMetrics.regularTdrSqm ?? 0) * unitFactor)}
                </td>
              </tr>
              <tr>
                <td className="border border-slate-300 px-2 py-1.5 text-center font-mono">D2</td>
                <td className="border border-slate-300 px-2.5 sm:px-3 py-1.5 text-slate-800">
                  Slum TDR Utilization {statement.slum_tdr_factor ? `(Factor ${statement.slum_tdr_factor})` : ''}
                </td>
                <td className="border border-slate-300 px-2.5 sm:px-3 py-1.5 text-right font-mono font-semibold tabular-nums">
                  {formatNumber((areaMetrics.proposedSlumTdrSqm ?? areaMetrics.slumTdrSqm ?? 0) * unitFactor)}
                </td>
              </tr>
              <tr className="bg-slate-50 font-bold">
                <td className="border border-slate-300 px-2 py-1.5 text-center font-mono">E</td>
                <td className="border border-slate-300 px-2.5 sm:px-3 py-1.5 text-slate-900">Total Builtup Area (B + C + D)</td>
                <td className="border border-slate-300 px-2.5 sm:px-3 py-1.5 text-right font-mono text-[#E05A1E] font-extrabold tabular-nums">
                  {formatNumber((areaMetrics.proposedTotalBuiltupSqm || 0) * unitFactor)}
                </td>
              </tr>
              <tr>
                <td className="border border-slate-300 px-2 py-1.5 text-center font-mono">F</td>
                <td className="border border-slate-300 px-2.5 sm:px-3 py-1.5 text-slate-700">TOTAL FSI CONSUMPTION RATIO</td>
                <td className="border border-slate-300 px-2.5 sm:px-3 py-1.5 text-right font-mono font-bold tabular-nums">
                  {formatNumber(areaMetrics.proposedTotalFsi || 0, 3)}
                </td>
              </tr>
              {statement.building_use === 'Mixed Use' ? (
                <>
                  <tr>
                    <td className="border border-slate-300 px-2 py-1.5 text-center font-mono">G1</td>
                    <td className="border border-slate-300 px-2.5 sm:px-3 py-1.5 text-slate-800">
                      Residential Ancillary Area (60% × {formatNumber((areaMetrics.proposedResidentialFsiSqm || 0) * unitFactor)})
                    </td>
                    <td className="border border-slate-300 px-2.5 sm:px-3 py-1.5 text-right font-mono tabular-nums">
                      {formatNumber((areaMetrics.proposedResidentialAncillarySqm || 0) * unitFactor)}
                    </td>
                  </tr>
                  <tr>
                    <td className="border border-slate-300 px-2 py-1.5 text-center font-mono">G2</td>
                    <td className="border border-slate-300 px-2.5 sm:px-3 py-1.5 text-slate-800">
                      Commercial Ancillary Area (80% × {formatNumber((areaMetrics.proposedCommercialFsiSqm || 0) * unitFactor)})
                    </td>
                    <td className="border border-slate-300 px-2.5 sm:px-3 py-1.5 text-right font-mono tabular-nums">
                      {formatNumber((areaMetrics.proposedCommercialAncillarySqm || 0) * unitFactor)}
                    </td>
                  </tr>
                  <tr className="bg-slate-50 font-semibold">
                    <td className="border border-slate-300 px-2 py-1.5 text-center font-mono">G</td>
                    <td className="border border-slate-300 px-2.5 sm:px-3 py-1.5 text-slate-900">
                      Total Proposed Ancillary Area (G1 + G2)
                    </td>
                    <td className="border border-slate-300 px-2.5 sm:px-3 py-1.5 text-right font-mono text-[#E05A1E] font-bold tabular-nums">
                      {formatNumber((areaMetrics.totalProposedAncillarySqm || areaMetrics.proposedAncillaryResSqm || 0) * unitFactor)}
                    </td>
                  </tr>
                </>
              ) : (
                <tr>
                  <td className="border border-slate-300 px-2 py-1.5 text-center font-mono">G</td>
                  <td className="border border-slate-300 px-2.5 sm:px-3 py-1.5 text-slate-800">{ancillaryLabel}</td>
                  <td className="border border-slate-300 px-2.5 sm:px-3 py-1.5 text-right font-mono font-semibold tabular-nums">
                    {formatNumber((areaMetrics.proposedAncillaryResSqm || 0) * unitFactor)}
                  </td>
                </tr>
              )}
              <tr className="bg-emerald-50 font-bold border-t-2 border-slate-400">
                <td className="border border-slate-300 px-2 py-2 text-center font-mono text-emerald-950">H</td>
                <td className="border border-slate-300 px-2.5 sm:px-3 py-2 text-emerald-950 font-extrabold">
                  TOTAL PROPOSED P-LINE AREA (E + G)
                </td>
                <td className="border border-slate-300 px-2.5 sm:px-3 py-2 text-right font-mono text-emerald-950 font-extrabold tabular-nums">
                  {formatNumber((areaMetrics.effectiveProposedPlineSqm || areaMetrics.proposedPlineTotalSqm || 0) * unitFactor)}
                </td>
              </tr>
            </tbody>
          </table>
          </div>
        </div>

        {/* TABLE 3 — PROPOSED FLOOR-WISE P-LINE STATEMENT */}
        <div className="space-y-2">
          <div className="bg-slate-800 text-white px-3.5 py-2 font-bold rounded-t text-xs uppercase tracking-wider flex flex-wrap items-center justify-between gap-2">
            <span>Table 3 — Proposed Floor-wise P-Line Area Statement</span>
            <span className="text-[10px] font-mono font-normal text-slate-300">
              10-Column Regulatory Breakdown ({unitLabel})
            </span>
          </div>

          {/* Desktop / Tablet Document Table (md and up) */}
          <div className="hidden md:block">
            <table className="w-full border-collapse border border-slate-300 text-left text-xs">
              <thead>
                <tr className="bg-slate-100 text-slate-800 font-bold border-b border-slate-300 text-[11px]">
                  <th className="border border-slate-300 px-2 py-2">1. Level</th>
                  <th className="border border-slate-300 px-2 py-2 text-center">2. Use</th>
                  <th className="border border-slate-300 px-2 py-2 text-right">3. Height (m)</th>
                  <th className="border border-slate-300 px-2 py-2 text-right">4. FSI ({unitLabel})</th>
                  <th className="border border-slate-300 px-2 py-2 text-right">5. Ancillary ({unitLabel})</th>
                  <th className="border border-slate-300 px-2 py-2 text-right">6. P-Line ({unitLabel})</th>
                  <th className="border border-slate-300 px-2 py-2 text-right">7. Lobby ({unitLabel})</th>
                  <th className="border border-slate-300 px-2 py-2 text-right">8. Saleable ({unitLabel})</th>
                  <th className="border border-slate-300 px-2 py-2 text-center">9. Units</th>
                  <th className="border border-slate-300 px-2 py-2 text-right">10. Area/Unit ({unitLabel})</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {floors.length === 0 ? (
                  <tr>
                    <td colSpan="10" className="border border-slate-300 py-8 text-center text-slate-400 italic">
                      No floor plates defined yet. Add floor levels in the Area Statement input form.
                    </td>
                  </tr>
                ) : (
                  floors.map((f, idx) => {
                    const isParking = ['parking', 'BASEMENT_1', 'BASEMENT_2', 'STILT', 'UPPER_PARKING'].includes(f.floor_type?.toUpperCase?.() || f.floor_type);
                    const isTerrace = f.floor_type === 'terrace';
                    const isHabitable = !isParking && !isTerrace;
                    const units = parseInt(f.no_of_units, 10) || 0;
                    const fsi = parseFloat(f.fsi_area_sqm) || 0;
                    const ancillary = parseFloat(f.ancillary_area_sqm) || 0;
                    const ancPct = f.ancillary_pct || (f.usage_type === 'Commercial' ? 0.8 : 0.6);
                    const pline = parseFloat(f.pline_area_sqm) || 0;
                    const lobby = parseFloat(f.lobby_area_sqm) || 0;
                    const sale = parseFloat(f.builtup_for_sale_sqm) || 0;
                    const areaFor1Unit = parseFloat(f.area_for_1_unit) || (units > 0 ? sale / units : 0);
                    const floorUsage = f.usage_type || (statement.building_use === 'Commercial' ? 'Commercial' : (isParking ? 'Parking' : isTerrace ? 'Terrace' : 'Residential'));

                    return (
                      <tr key={idx} className={isParking ? 'bg-amber-50/40' : (idx % 2 === 1 ? 'bg-slate-50/50' : '')}>
                        <td className="border border-slate-300 px-2 py-1.5 font-medium">
                          {f.floor_name}
                          {isParking && (
                            <span className="ml-1 text-[9px] font-bold text-amber-800 bg-amber-100 px-1 py-0.5 rounded border border-amber-300">
                              Parking
                            </span>
                          )}
                        </td>
                        <td className="border border-slate-300 px-2 py-1.5 text-center font-medium">
                          {isHabitable ? (
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${floorUsage === 'Commercial' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'}`}>
                              {floorUsage}
                            </span>
                          ) : (
                            <span className="text-slate-400 font-mono text-[10px]">{isParking ? 'Parking' : 'Terrace'}</span>
                          )}
                        </td>
                        <td className="border border-slate-300 px-2 py-1.5 text-right font-mono tabular-nums">{formatNumber(f.height_meters)}m</td>
                        <td className="border border-slate-300 px-2 py-1.5 text-right font-mono font-medium text-slate-800 tabular-nums">
                          {isHabitable ? formatNumber(fsi * unitFactor) : '—'}
                        </td>
                        <td className="border border-slate-300 px-2 py-1.5 text-right font-mono text-slate-700 tabular-nums">
                          {isHabitable ? (
                            <span>
                              {formatNumber(ancillary * unitFactor)}{' '}
                              <span className="text-[10px] text-muted">({Math.round(ancPct * 100)}%)</span>
                            </span>
                          ) : '—'}
                        </td>
                        <td className="border border-slate-300 px-2 py-1.5 text-right font-mono font-semibold text-slate-900 tabular-nums">
                          {formatNumber(pline * unitFactor)}
                        </td>
                        <td className="border border-slate-300 px-2 py-1.5 text-right font-mono tabular-nums">
                          {formatNumber(lobby * unitFactor)}
                          {f.is_lobby_overridden && (
                            <span className="text-[9px] text-[#E05A1E] font-bold block leading-tight">*override</span>
                          )}
                        </td>
                        <td className="border border-slate-300 px-2 py-1.5 text-right font-mono text-[#E05A1E] font-semibold tabular-nums">
                          {isParking || isTerrace ? '—' : formatNumber(sale * unitFactor)}
                        </td>
                        <td className="border border-slate-300 px-2 py-1.5 text-center font-mono font-bold">
                          {isParking || isTerrace ? '—' : units}
                        </td>
                        <td className="border border-slate-300 px-2 py-1.5 text-right font-mono font-bold text-slate-800 tabular-nums">
                          {isParking || isTerrace || units === 0 ? '—' : formatNumber(areaFor1Unit * unitFactor)}
                        </td>
                      </tr>
                    );
                  })
                )}
                <tr className="bg-slate-200 font-bold border-t-2 border-slate-400 text-[11px]">
                  <td className="border border-slate-300 px-2 py-2 uppercase font-extrabold">TOTAL ({floors.length})</td>
                  <td className="border border-slate-300 px-2 py-2 text-center text-slate-400 font-normal">—</td>
                  <td className="border border-slate-300 px-2 py-2 text-right font-mono tabular-nums">{formatNumber(areaMetrics.totalHeightMeters)}m</td>
                  <td className="border border-slate-300 px-2 py-2 text-right font-mono text-slate-800 font-bold tabular-nums">
                    {formatNumber((areaMetrics.proposedTotalFsiSqm || 0) * unitFactor)}
                  </td>
                  <td className="border border-slate-300 px-2 py-2 text-right font-mono text-slate-700 tabular-nums">
                    {formatNumber((areaMetrics.totalProposedAncillarySqm || 0) * unitFactor)}
                  </td>
                  <td className="border border-slate-300 px-2 py-2 text-right font-mono text-slate-900 font-extrabold tabular-nums">
                    {formatNumber((areaMetrics.totalProposedPlineSqm || 0) * unitFactor)}
                  </td>
                  <td className="border border-slate-300 px-2 py-2 text-right font-mono tabular-nums">
                    {formatNumber((areaMetrics.totalLobbyAreaSqm || 0) * unitFactor)}
                  </td>
                  <td className="border border-slate-300 px-2 py-2 text-right font-mono text-[#E05A1E] font-extrabold tabular-nums">
                    {formatNumber((areaMetrics.totalBuiltupForSaleSqm || 0) * unitFactor)}
                  </td>
                  <td className="border border-slate-300 px-2 py-2 text-center font-mono font-bold">{areaMetrics.totalUnitsCount || 0}</td>
                  <td className="border border-slate-300 px-2 py-2 text-right font-mono text-slate-400">—</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Mobile Reading Layout for Table 3 (< md) */}
          <div className="md:hidden space-y-2.5">
            {floors.map((f, idx) => {
              const isParking = ['parking', 'BASEMENT_1', 'BASEMENT_2', 'STILT', 'UPPER_PARKING'].includes(f.floor_type?.toUpperCase?.() || f.floor_type);
              const isTerrace = f.floor_type === 'terrace';
              const isHabitable = !isParking && !isTerrace;
              const units = parseInt(f.no_of_units, 10) || 0;
              const fsi = parseFloat(f.fsi_area_sqm) || 0;
              const ancillary = parseFloat(f.ancillary_area_sqm) || 0;
              const pline = parseFloat(f.pline_area_sqm) || 0;
              const lobby = parseFloat(f.lobby_area_sqm) || 0;
              const sale = parseFloat(f.builtup_for_sale_sqm) || 0;
              const areaFor1Unit = parseFloat(f.area_for_1_unit) || (units > 0 ? sale / units : 0);
              const floorUsage = f.usage_type || (statement.building_use === 'Commercial' ? 'Commercial' : (isParking ? 'Parking' : isTerrace ? 'Terrace' : 'Residential'));

              return (
                <div key={idx} className="border border-slate-300 rounded-lg p-3 space-y-2 bg-white">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
                    <span className="font-bold text-slate-900">{f.floor_name}</span>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">{floorUsage}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                    <div className="flex justify-between"><span className="text-slate-500">Height:</span><span className="font-mono">{formatNumber(f.height_meters)}m</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Units:</span><span className="font-mono font-bold">{isHabitable ? units : '—'}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">FSI:</span><span className="font-mono">{isHabitable ? formatNumber(fsi * unitFactor) : '—'}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Ancillary:</span><span className="font-mono">{isHabitable ? formatNumber(ancillary * unitFactor) : '—'}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">P-Line:</span><span className="font-mono font-semibold">{formatNumber(pline * unitFactor)}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Lobby:</span><span className="font-mono">{formatNumber(lobby * unitFactor)}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Saleable:</span><span className="font-mono font-bold text-[#E05A1E]">{isHabitable ? formatNumber(sale * unitFactor) : '—'}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Area/Unit:</span><span className="font-mono">{isHabitable && units > 0 ? formatNumber(areaFor1Unit * unitFactor) : '—'}</span></div>
                  </div>
                </div>
              );
            })}
            <div className="bg-slate-200 border border-slate-400 rounded-lg p-3 grid grid-cols-2 gap-2 text-[11px] font-bold">
              <div>P-Line: <span className="font-mono">{formatNumber((areaMetrics.totalProposedPlineSqm || 0) * unitFactor)} {unitLabel}</span></div>
              <div>Saleable: <span className="font-mono text-[#E05A1E]">{formatNumber((areaMetrics.totalBuiltupForSaleSqm || 0) * unitFactor)} {unitLabel}</span></div>
              <div>Height: <span className="font-mono">{formatNumber(areaMetrics.totalHeightMeters)}m</span></div>
              <div>Units: <span className="font-mono">{areaMetrics.totalUnitsCount || 0}</span></div>
            </div>
          </div>
        </div>

        {/* TABLE 4 — FSI COMPLIANCE SUMMARY */}
        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
          <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
            <ShieldCheck size={14} className="text-emerald-600 shrink-0" />
            FSI Compliance &amp; Verification Summary (Dividing Factor {statement.dividing_factor || 1.6})
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <div className="bg-white p-2.5 rounded-lg border border-slate-200">
              <span className="text-[10px] text-slate-500 uppercase font-semibold block">Base Dividing Area</span>
              <span className="font-mono text-xs font-bold text-slate-900">
                {formatNumber((areaMetrics.baseDividingFactorSqm || 0) * unitFactor)}
              </span>
            </div>
            <div className="bg-white p-2.5 rounded-lg border border-slate-200">
              <span className="text-[10px] text-slate-500 uppercase font-semibold block">Derived Ancillary Area</span>
              <span className="font-mono text-xs font-bold text-slate-900">
                {formatNumber((areaMetrics.derivedAncillaryAreaSqm || 0) * unitFactor)}
              </span>
            </div>
            <div className="bg-white p-2.5 rounded-lg border border-slate-200">
              <span className="text-[10px] text-slate-500 uppercase font-semibold block">Paid FSI Required</span>
              <span className="font-mono text-xs font-bold text-slate-900">
                {formatNumber((areaMetrics.paidFsiRequiredSqm || 0) * unitFactor)}
              </span>
            </div>
            <div className="bg-white p-2.5 rounded-lg border border-slate-200">
              <span className="text-[10px] text-slate-500 uppercase font-semibold block">Area Potential Balance</span>
              <span className={`font-mono text-xs font-bold ${(areaMetrics.areaBalanceSqm || 0) >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                {formatNumber((areaMetrics.areaBalanceSqm || 0) * unitFactor)}
              </span>
            </div>
          </div>
        </div>

        {/* Sign-off Footer (Area Statement) */}
        <div className="pt-8 border-t border-slate-200 grid grid-cols-2 sm:grid-cols-3 gap-6 text-center text-xs">
          <div className="space-y-6">
            <div className="border-b border-slate-400 w-full max-w-[144px] mx-auto" />
            <span className="text-slate-600 block text-[11px] font-medium">Prepared by (Architect)</span>
          </div>
          <div className="space-y-6">
            <div className="border-b border-slate-400 w-full max-w-[144px] mx-auto" />
            <span className="text-slate-600 block text-[11px] font-medium">Verified by (Lead Architect)</span>
          </div>
          <div className="space-y-6 col-span-2 sm:col-span-1">
            <div className="border-b border-slate-400 w-full max-w-[144px] mx-auto" />
            <span className="text-slate-600 block text-[11px] font-medium">Client Acceptance</span>
          </div>
        </div>
      </div>

      {/* Visual Divider between Area Statement Report and Financial Viability Report */}
      <div className="border-t-4 border-dashed border-slate-300" />

      {/* ===================================================================== */}
      {/* 2. COMPLETE FINANCIAL VIABILITY REPORT                                */}
      {/* ===================================================================== */}
      <div className="space-y-6">
        {/* Financial Viability Header */}
        <div className="border-b-2 border-slate-900 pb-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-extrabold text-base tracking-tight text-[#E05A1E]">DESIGN STUDIO 16</span>
              <span className="text-slate-300 hidden sm:inline">|</span>
              <span className="font-bold text-xs uppercase tracking-wider text-slate-800">
                Financial Viability &amp; Feasibility Report
              </span>
            </div>
            <h2 className="text-base font-extrabold text-slate-900 mt-1">
              {project?.name || 'Architectural Project'}
            </h2>
            <p className="text-[11px] text-slate-600">
              {project?.client_name ? `Client: ${project.client_name}` : ''}{' '}
              {project?.location ? `• Location: ${project.location}` : ''}
            </p>
          </div>

          <div className="w-full sm:w-auto sm:text-right text-[11px] bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-0.5">
            <p>
              <span className="text-slate-500 font-medium">Ready Reckoner Rate:</span>{' '}
              <strong className="text-slate-900 font-bold">
                {financial.rr_rate_per_sqm ? `₹${Number(financial.rr_rate_per_sqm).toLocaleString('en-IN')}/sqm` : 'Not Configured'}
              </strong>
            </p>
            <p>
              <span className="text-slate-500 font-medium">Civil Construction:</span>{' '}
              <strong className="text-slate-900">
                {financial.cost_of_construction_rate ? `₹${Number(financial.cost_of_construction_rate).toLocaleString('en-IN')}/sqm` : 'Not Configured'}
              </strong>
            </p>
            <p>
              <span className="text-slate-500 font-medium">Date:</span>{' '}
              <strong className="text-slate-900">{new Date().toLocaleDateString('en-GB')}</strong>
            </p>
          </div>
        </div>

        {/* SECTION A — STATUTORY & REGULATORY CHARGES */}
        <div className="space-y-2">
          <div className="bg-slate-900 text-white px-3.5 py-2 font-bold rounded-t text-xs uppercase tracking-wider flex flex-wrap items-center justify-between gap-2">
            <span>Section A — Statutory &amp; Local Authority Demands</span>
            <span className="text-[10px] text-slate-300 font-normal">Ready Reckoner Benchmark Basis</span>
          </div>

          <div className="w-full overflow-x-auto">
            <table className="w-full border-collapse border border-slate-300 text-left text-xs">
              <thead>
                <tr className="bg-slate-100 text-slate-800 font-bold border-b border-slate-300">
                  <th className="border border-slate-300 px-2 py-2 w-10 sm:w-12 text-center">Sr.</th>
                  <th className="border border-slate-300 px-2.5 sm:px-3 py-2">Statutory Charge Particulars</th>
                  <th className="border border-slate-300 px-2 py-2 text-center w-16 sm:w-24">RR %</th>
                  <th className="border border-slate-300 px-2.5 sm:px-3 py-2 text-right w-28 sm:w-44">Calculated Demand (₹)</th>
                </tr>
              </thead>
            <tbody className="divide-y divide-slate-200">
              {statutoryCharges.filter((c) => !c.is_deleted && c.charge_code !== 'AMALGAMATION').map((item, idx) => {
                const isEnabled = item.is_enabled !== false;
                return (
                  <tr key={item.id || idx} className={!isEnabled ? 'bg-slate-50/50 opacity-50' : ''}>
                    <td className="border border-slate-300 px-2 py-1.5 text-center font-mono">{idx + 1}</td>
                    <td className={`border border-slate-300 px-2.5 sm:px-3 py-1.5 font-medium ${!isEnabled ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                      {item.charge_name}
                      {!isEnabled && (
                        <span className="ml-2 text-[9px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-300 no-underline font-bold uppercase">
                          Excluded
                        </span>
                      )}
                    </td>
                    <td className="border border-slate-300 px-2 py-1.5 text-center font-mono">
                      {item.rr_percentage ? `${item.rr_percentage}%` : '—'}
                    </td>
                    <td className={`border border-slate-300 px-2.5 sm:px-3 py-1.5 text-right font-mono font-semibold tabular-nums ${!isEnabled ? 'text-slate-400' : 'text-slate-900'}`}>
                      {isEnabled ? formatINR(item.calculated_amount ?? item.amount) : '₹0.00'}
                    </td>
                  </tr>
                );
              })}
              <tr className="bg-slate-200 font-bold border-t-2 border-slate-400">
                <td className="border border-slate-300 px-2 py-2 text-center font-mono text-slate-900">A</td>
                <td className="border border-slate-300 px-2.5 sm:px-3 py-2 text-slate-900 font-extrabold" colSpan="2">
                  TOTAL STATUTORY &amp; LOCAL AUTHORITY DEMAND (SECTION A)
                </td>
                <td className="border border-slate-300 px-2.5 sm:px-3 py-2 text-right font-mono text-slate-950 font-extrabold text-sm tabular-nums">
                  {formatINR(financialMetrics.totalStatutoryDemandA)}
                </td>
              </tr>
            </tbody>
          </table>
          </div>
        </div>

        {/* SECTIONS B TO H — DIRECT DEVELOPMENT & INFRASTRUCTURE EXPENDITURES */}
        <div className="space-y-2">
          <div className="bg-slate-800 text-white px-3.5 py-2 font-bold rounded-t text-xs uppercase tracking-wider flex flex-wrap items-center justify-between gap-2">
            <span>Sections B to H — Direct Development &amp; Civil Construction Costs</span>
            <span className="text-[10px] text-slate-300 font-normal">Execution &amp; Land Expenditures</span>
          </div>

          <div className="w-full overflow-x-auto">
            <table className="w-full border-collapse border border-slate-300 text-left text-xs">
              <thead>
                <tr className="bg-slate-100 text-slate-800 font-bold border-b border-slate-300">
                  <th className="border border-slate-300 px-2 py-2 w-12 sm:w-14 text-center">Code</th>
                  <th className="border border-slate-300 px-2.5 sm:px-3 py-2">Cost Head &amp; Description</th>
                  <th className="border border-slate-300 px-2.5 sm:px-3 py-2 text-right w-28 sm:w-44">Amount (₹)</th>
                </tr>
              </thead>
            <tbody className="divide-y divide-slate-200">
              <tr>
                <td className="border border-slate-300 px-2 py-1.5 font-mono text-center font-bold">B</td>
                <td className="border border-slate-300 px-2.5 sm:px-3 py-1.5 text-slate-800">
                  Cost of TDR Loading (55% of RR Rate ₹{financial.rr_rate_per_sqm || 0}/sqm × {formatNumber(areaMetrics.proposedTdrSqm)} sqm)
                </td>
                <td className="border border-slate-300 px-2.5 sm:px-3 py-1.5 text-right font-mono font-semibold tabular-nums">
                  {formatINR(financialMetrics.costOfTdrB)}
                </td>
              </tr>
              <tr>
                <td className="border border-slate-300 px-2 py-1.5 font-mono text-center font-bold">C</td>
                <td className="border border-slate-300 px-2.5 sm:px-3 py-1.5 text-slate-800">
                  BPMS Staff, Fire &amp; Airport NOCs, Minor Statutory Approvals
                </td>
                <td className="border border-slate-300 px-2.5 sm:px-3 py-1.5 text-right font-mono tabular-nums">
                  {formatINR(financialMetrics.totalExpensesC)}
                </td>
              </tr>
              <tr>
                <td className="border border-slate-300 px-2 py-1.5 font-mono text-center font-bold">D</td>
                <td className="border border-slate-300 px-2.5 sm:px-3 py-1.5 text-slate-800">
                  Cost of Civil Construction (@ ₹{financial.cost_of_construction_rate || 0}/sqm × {formatNumber(areaMetrics.totalProposedPlineSqm || areaMetrics.proposedPlineTotalSqm)} sqm)
                </td>
                <td className="border border-slate-300 px-2.5 sm:px-3 py-1.5 text-right font-mono font-semibold tabular-nums">
                  {formatINR(financialMetrics.costOfConstructionD)}
                </td>
              </tr>
              <tr>
                <td className="border border-slate-300 px-2 py-1.5 font-mono text-center font-bold">E</td>
                <td className="border border-slate-300 px-2.5 sm:px-3 py-1.5 text-slate-800">
                  Basement Construction Cost (@ ₹{financial.basement_rate_per_sqm || 0}/sqm × {financial.basement_area_sqm || 0} sqm)
                </td>
                <td className="border border-slate-300 px-2.5 sm:px-3 py-1.5 text-right font-mono tabular-nums">
                  {formatINR(financialMetrics.costOfBasementE)}
                </td>
              </tr>
              <tr>
                <td className="border border-slate-300 px-2 py-1.5 font-mono text-center font-bold">F</td>
                <td className="border border-slate-300 px-2.5 sm:px-3 py-1.5 text-slate-800">
                  Rent Compensation During Construction ({financial.rent_tenements || 0} tenements × ₹{financial.rent_per_tenement_per_month || 0}/mo × {financial.rent_months || 0} mos)
                </td>
                <td className="border border-slate-300 px-2.5 sm:px-3 py-1.5 text-right font-mono tabular-nums">
                  {formatINR(financialMetrics.rentCostF)}
                </td>
              </tr>
              <tr>
                <td className="border border-slate-300 px-2 py-1.5 font-mono text-center font-bold">G</td>
                <td className="border border-slate-300 px-2.5 sm:px-3 py-1.5 text-slate-800">
                  Mechanical / Stacked Car Parking Costs ({financial.stacked_parking_slots || 0} slots @ ₹{financial.stacked_parking_cost_per_slot || 0}/slot)
                </td>
                <td className="border border-slate-300 px-2.5 sm:px-3 py-1.5 text-right font-mono tabular-nums">
                  {formatINR(financialMetrics.stackedParkingCostG)}
                </td>
              </tr>
              <tr>
                <td className="border border-slate-300 px-2 py-1.5 font-mono text-center font-bold">H</td>
                <td className="border border-slate-300 px-2.5 sm:px-3 py-1.5 text-slate-800">
                  Cost of Land / Plot Acquisition
                </td>
                <td className="border border-slate-300 px-2.5 sm:px-3 py-1.5 text-right font-mono font-semibold tabular-nums">
                  {formatINR(financialMetrics.costOfPlotH)}
                </td>
              </tr>
              <tr className="bg-orange-50 font-bold border-t-2 border-slate-400">
                <td className="border border-slate-300 px-2 py-2 text-center font-mono text-orange-950">TOTAL</td>
                <td className="border border-slate-300 px-2.5 sm:px-3 py-2 text-orange-950 font-extrabold">
                  TOTAL PROJECT DEVELOPMENT EXPENDITURE (A to H)
                </td>
                <td className="border border-slate-300 px-2.5 sm:px-3 py-2 text-right font-mono text-[#E05A1E] font-extrabold text-sm tabular-nums">
                  {formatINR(financialMetrics.totalProjectCost)}
                </td>
              </tr>
            </tbody>
          </table>
          </div>
        </div>

        {/* SECTION I — SALABLE INVENTORY & REVENUE REALIZATION */}
        <div className="space-y-2">
          <div className="bg-slate-800 text-white px-3.5 py-2 font-bold rounded-t text-xs uppercase tracking-wider flex flex-wrap items-center justify-between gap-2">
            <span>Section I — Floor-wise Salable Inventory &amp; Revenue Realization</span>
            <span className="text-[10px] text-slate-300 font-normal">Sourced from Table 3 Area Schedule</span>
          </div>

          {/* Desktop / Tablet Table (md and up) */}
          <div className="hidden md:block">
            <table className="w-full border-collapse border border-slate-300 text-left text-xs">
              <thead>
                <tr className="bg-slate-100 text-slate-800 font-bold border-b border-slate-300">
                  <th className="border border-slate-300 px-3 py-2">Floor Level</th>
                  <th className="border border-slate-300 px-2.5 py-2 text-center w-16">Units</th>
                  <th className="border border-slate-300 px-2.5 py-2 text-right">Sale Area ({unitLabel})</th>
                  <th className="border border-slate-300 px-2.5 py-2 text-right">Area / Unit</th>
                  <th className="border border-slate-300 px-2.5 py-2 text-right">Price / {unitLabel} (₹)</th>
                  <th className="border border-slate-300 px-2.5 py-2 text-right">Cost / Unit (₹)</th>
                  <th className="border border-slate-300 px-3 py-2 text-right">Total Realization (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {salableFloors.length === 0 && salableUnits.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="border border-slate-300 py-8 text-center text-slate-400 italic">
                      No salable floors configured yet. Configure floor saleable areas in Area Statement or Financial Viability.
                    </td>
                  </tr>
                ) : salableFloors.length > 0 ? (
                  salableFloors.map((fl, idx) => {
                    const units = parseInt(fl.no_of_units, 10) || 0;
                    const saleSqm = parseFloat(fl.builtup_for_sale_sqm) || 0;
                    const area1Unit = units > 0 ? saleSqm / units : 0;
                    const rate = parseFloat(fl.rate_per_sqm) || 0;
                    const cost1Unit = area1Unit > 0 && rate > 0 ? area1Unit * rate : (parseFloat(fl.cost_for_1_unit) || 0);
                    const realization = rate > 0 ? saleSqm * rate : cost1Unit * units;

                    return (
                      <tr key={fl.id || idx}>
                        <td className="border border-slate-300 px-3 py-1.5 font-medium text-slate-800">{fl.floor_name}</td>
                        <td className="border border-slate-300 px-2.5 py-1.5 text-center font-mono font-bold">{units}</td>
                        <td className="border border-slate-300 px-2.5 py-1.5 text-right font-mono tabular-nums">{formatNumber(saleSqm * unitFactor)}</td>
                        <td className="border border-slate-300 px-2.5 py-1.5 text-right font-mono tabular-nums">{formatNumber(area1Unit * unitFactor)}</td>
                        <td className="border border-slate-300 px-2.5 py-1.5 text-right font-mono tabular-nums">{rate > 0 ? formatINR(rate) : '—'}</td>
                        <td className="border border-slate-300 px-2.5 py-1.5 text-right font-mono font-semibold text-[#E05A1E] tabular-nums">{formatINR(cost1Unit)}</td>
                        <td className="border border-slate-300 px-3 py-1.5 text-right font-mono font-bold text-emerald-800 tabular-nums">{formatINR(realization)}</td>
                      </tr>
                    );
                  })
                ) : (
                  salableUnits.map((u, idx) => (
                    <tr key={idx}>
                      <td className="border border-slate-300 px-3 py-1.5 font-medium text-slate-800">{u.unit_name}</td>
                      <td className="border border-slate-300 px-2.5 py-1.5 text-center font-mono font-bold">{u.unit_count}</td>
                      <td className="border border-slate-300 px-2.5 py-1.5 text-right font-mono tabular-nums">{formatNumber(u.carpet_area_sqft)}</td>
                      <td className="border border-slate-300 px-2.5 py-1.5 text-right font-mono">—</td>
                      <td className="border border-slate-300 px-2.5 py-1.5 text-right font-mono tabular-nums">{formatINR(u.rate_per_sqft)}</td>
                      <td className="border border-slate-300 px-2.5 py-1.5 text-right font-mono font-semibold text-[#E05A1E] tabular-nums">{formatINR(u.unit_price)}</td>
                      <td className="border border-slate-300 px-3 py-1.5 text-right font-mono font-bold text-emerald-800 tabular-nums">{formatINR(u.total_amount)}</td>
                    </tr>
                  ))
                )}
                <tr className="bg-emerald-50 font-bold border-t-2 border-slate-400">
                  <td className="border border-slate-300 px-3 py-2 text-emerald-950 font-extrabold" colSpan="6">
                    GROSS ESTIMATED REALIZATION / RECEIPTS (SECTION I)
                  </td>
                  <td className="border border-slate-300 px-3 py-2 text-right font-mono text-emerald-950 font-extrabold text-sm tabular-nums">
                    {formatINR(financialMetrics.totalReceipts)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Mobile Reading Layout for Section I (< md) */}
          <div className="md:hidden space-y-2.5">
            {salableFloors.map((fl, idx) => {
              const units = parseInt(fl.no_of_units, 10) || 0;
              const saleSqm = parseFloat(fl.builtup_for_sale_sqm) || 0;
              const area1Unit = units > 0 ? saleSqm / units : 0;
              const rate = parseFloat(fl.rate_per_sqm) || 0;
              const cost1Unit = area1Unit > 0 && rate > 0 ? area1Unit * rate : (parseFloat(fl.cost_for_1_unit) || 0);
              const realization = rate > 0 ? saleSqm * rate : cost1Unit * units;

              return (
                <div key={fl.id || idx} className="border border-slate-300 rounded-lg p-3 space-y-1.5 bg-white">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-1">
                    <span className="font-bold text-slate-900">{fl.floor_name}</span>
                    <span className="font-mono font-bold text-emerald-800">{formatINR(realization)}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                    <div className="flex justify-between"><span className="text-slate-500">Units:</span><span className="font-mono font-bold">{units}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Sale Area:</span><span className="font-mono">{formatNumber(saleSqm * unitFactor)}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Rate:</span><span className="font-mono">{rate > 0 ? formatINR(rate) : '—'}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Cost/Unit:</span><span className="font-mono text-[#E05A1E]">{formatINR(cost1Unit)}</span></div>
                  </div>
                </div>
              );
            })}
            <div className="bg-emerald-50 border border-emerald-300 rounded-lg p-3 flex items-center justify-between font-bold text-xs">
              <span className="text-emerald-950">GROSS RECEIPTS (SECTION I)</span>
              <span className="font-mono text-emerald-950">{formatINR(financialMetrics.totalReceipts)}</span>
            </div>
          </div>
        </div>

        {/* SECTION J — EXECUTIVE FEASIBILITY & PROFITABILITY SUMMARY */}
        <div className="bg-slate-900 text-white p-5 rounded-xl space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
            <span className="font-extrabold text-xs uppercase tracking-wider text-orange-400">
              Section J — Executive Financial Feasibility &amp; Net Profitability Summary
            </span>
            <span className="text-[10px] text-slate-400">Overall Realization Balance</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-center">
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
              <span className={`font-mono text-sm font-extrabold ${(financialMetrics.netProfit || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
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

        {/* Sign-off Footer (Financial Viability) */}
        <div className="pt-8 border-t border-slate-200 grid grid-cols-2 sm:grid-cols-3 gap-6 text-center text-xs">
          <div className="space-y-6">
            <div className="border-b border-slate-400 w-full max-w-[144px] mx-auto" />
            <span className="text-slate-600 block text-[11px] font-medium">Prepared by (Accounts &amp; Finance)</span>
          </div>
          <div className="space-y-6">
            <div className="border-b border-slate-400 w-full max-w-[144px] mx-auto" />
            <span className="text-slate-600 block text-[11px] font-medium">Verified by (Lead Architect)</span>
          </div>
          <div className="space-y-6 col-span-2 sm:col-span-1">
            <div className="border-b border-slate-400 w-full max-w-[144px] mx-auto" />
            <span className="text-slate-600 block text-[11px] font-medium">Client Acceptance</span>
          </div>
        </div>
      </div>
    </div>
  );
}
