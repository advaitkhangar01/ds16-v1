// client/src/components/projects/feasibility/FeasibilityDocumentPreview.jsx
import React from 'react';
import { Building, Calculator, CheckCircle2, AlertTriangle, FileSpreadsheet } from 'lucide-react';

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
  const ancillaryLabel = buildingUse === 'Commercial' ? 'Ancillary FSI (80% Commercial)' : 'Ancillary FSI (60% Residential)';

  return (
    <div id="feasibility-document-canvas" className="bg-white border border-[#CBD5E1] rounded-xl shadow-md p-6 text-[#1A1A1A] space-y-6 text-xs max-w-full overflow-x-auto">
      {/* Document Header */}
      <div className="border-b-2 border-slate-800 pb-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-sm tracking-tight text-[#E05A1E]">DESIGN STUDIO 16</span>
            <span className="text-slate-400">|</span>
            <span className="font-bold text-xs text-slate-800">FEASIBILITY REPORT</span>
          </div>
          <p className="text-[11px] font-semibold text-slate-600 mt-0.5">
            Project: <strong className="text-slate-900">{project?.name || 'Architectural Project'}</strong> — Area Statement & Financial Viability
          </p>
        </div>
        <div className="text-right text-[10px] text-muted">
          <p>Unit Basis: <strong className="text-slate-900 uppercase font-mono">{unitLabel}</strong></p>
          <p>Ready Reckoner: <strong className="text-slate-900">{financial.rr_rate_per_sqm ? `₹${Number(financial.rr_rate_per_sqm).toLocaleString('en-IN')}/sqm` : 'Not Configured'}</strong></p>
        </div>
      </div>

      {/* ======================================================== */}
      {/* TABLE 1 — PLOT AREA STATEMENT (REQ-G) */}
      {/* ======================================================== */}
      <div className="space-y-2">
        <div className="bg-slate-800 text-white px-3 py-1.5 font-bold rounded-t text-[11px] uppercase tracking-wider flex items-center justify-between">
          <span>Table 1 — Plot Area Statement ({unitLabel})</span>
          <span className="text-[10px] font-normal lowercase tracking-normal text-slate-300">site & survey baselines</span>
        </div>

        <table className="w-full border-collapse border border-slate-300 text-left text-[11px]">
          <thead>
            <tr className="bg-slate-100 text-slate-800 font-bold border-b border-slate-300">
              <th className="border border-slate-300 px-2 py-1 w-10 text-center">Sr.</th>
              <th className="border border-slate-300 px-2.5 py-1">Particulars</th>
              <th className="border border-slate-300 px-2.5 py-1 text-right w-28">Permissible ({unitLabel})</th>
              <th className="border border-slate-300 px-2.5 py-1 text-right w-28">Proposed ({unitLabel})</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            <tr>
              <td className="border border-slate-300 px-2 py-0.5 text-center font-mono">1</td>
              <td className="border border-slate-300 px-2.5 py-0.5">Area Of Plot</td>
              <td className="border border-slate-300 px-2.5 py-0.5 text-right font-mono">{formatNumber((statement.plot_area_sqm || 0) * unitFactor)}</td>
              <td className="border border-slate-300 px-2.5 py-0.5 text-right font-mono">—</td>
            </tr>
            <tr>
              <td className="border border-slate-300 px-2 py-0.5 text-center font-mono">2</td>
              <td className="border border-slate-300 px-2.5 py-0.5">Deductions For Proposed D.P. Road / Reservation</td>
              <td className="border border-slate-300 px-2.5 py-0.5 text-right font-mono">{formatNumber((statement.dp_deductions_sqm || 0) * unitFactor)}</td>
              <td className="border border-slate-300 px-2.5 py-0.5 text-right font-mono">—</td>
            </tr>
            <tr>
              <td className="border border-slate-300 px-2 py-0.5 text-center font-mono">3</td>
              <td className="border border-slate-300 px-2.5 py-0.5">Existing Built-up Area Deduction</td>
              <td className="border border-slate-300 px-2.5 py-0.5 text-right font-mono">{formatNumber((statement.existing_builtup_area_sqm || 0) * unitFactor)}</td>
              <td className="border border-slate-300 px-2.5 py-0.5 text-right font-mono">—</td>
            </tr>
            <tr className="bg-orange-50/70 font-bold border-t-2 border-slate-300">
              <td className="border border-slate-300 px-2 py-0.5 text-center font-mono">A</td>
              <td className="border border-slate-300 px-2.5 py-0.5 text-orange-950">Plotable Area (Net Development Plot)</td>
              <td className="border border-slate-300 px-2.5 py-0.5 text-right font-mono text-orange-950">{formatNumber((areaMetrics.plotableAreaSqm || 0) * unitFactor)}</td>
              <td className="border border-slate-300 px-2.5 py-0.5 text-right font-mono text-orange-950">{formatNumber((areaMetrics.plotableAreaSqm || 0) * unitFactor)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ======================================================== */}
      {/* TABLE 2 — PERMISSIBLE VS PROPOSED FSI POTENTIAL (REQ-G & REQ-B & REQ-D) */}
      {/* ======================================================== */}
      <div className="space-y-2">
        <div className="bg-slate-700 text-white px-3 py-1.5 font-bold rounded-t text-[11px] uppercase tracking-wider flex items-center justify-between">
          <span>Table 2 — Permissible vs Proposed FSI Potential</span>
          <span className="text-[10px] font-normal lowercase tracking-normal text-slate-300">regulatory potential analysis</span>
        </div>

        <table className="w-full border-collapse border border-slate-300 text-left text-[11px]">
          <thead>
            <tr className="bg-slate-100 text-slate-800 font-bold border-b border-slate-300">
              <th className="border border-slate-300 px-2 py-1 w-10 text-center">Sr.</th>
              <th className="border border-slate-300 px-2.5 py-1">FSI Component</th>
              <th className="border border-slate-300 px-2.5 py-1 text-right w-28">Permissible ({unitLabel})</th>
              <th className="border border-slate-300 px-2.5 py-1 text-right w-28">Proposed ({unitLabel})</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            <tr>
              <td className="border border-slate-300 px-2 py-0.5 text-center font-mono">B</td>
              <td className="border border-slate-300 px-2.5 py-0.5">Basic Permissible FSI ({statement.basic_fsi_factor || 1.1} × Plot Area)</td>
              <td className="border border-slate-300 px-2.5 py-0.5 text-right font-mono">{formatNumber((areaMetrics.permissibleFsiSqm || 0) * unitFactor)}</td>
              <td className="border border-slate-300 px-2.5 py-0.5 text-right font-mono">{formatNumber((areaMetrics.proposedBasicFsiSqm || 0) * unitFactor)}</td>
            </tr>
            <tr>
              <td className="border border-slate-300 px-2 py-0.5 text-center font-mono">C</td>
              <td className="border border-slate-300 px-2.5 py-0.5">Paid FSI ({statement.paid_fsi_factor || 0.5} × Plot Area)</td>
              <td className="border border-slate-300 px-2.5 py-0.5 text-right font-mono">{formatNumber((areaMetrics.permissiblePaidFsiSqm || 0) * unitFactor)}</td>
              <td className="border border-slate-300 px-2.5 py-0.5 text-right font-mono">{formatNumber((areaMetrics.proposedPaidFsiSqm || 0) * unitFactor)}</td>
            </tr>
            <tr>
              <td className="border border-slate-300 px-2 py-0.5 text-center font-mono">D1</td>
              <td className="border border-slate-300 px-2.5 py-0.5">
                Regular TDR Utilization {statement.road_width_m ? `(${statement.road_width_m}m road)` : ''}
              </td>
              <td className="border border-slate-300 px-2.5 py-0.5 text-right font-mono">{formatNumber((areaMetrics.permissibleTdrSqm || 0) * unitFactor)}</td>
              <td className="border border-slate-300 px-2.5 py-0.5 text-right font-mono">{formatNumber((areaMetrics.regularTdrSqm || 0) * unitFactor)}</td>
            </tr>
            <tr>
              <td className="border border-slate-300 px-2 py-0.5 text-center font-mono">D2</td>
              <td className="border border-slate-300 px-2.5 py-0.5">Slum TDR Utilization</td>
              <td className="border border-slate-300 px-2.5 py-0.5 text-right font-mono">—</td>
              <td className="border border-slate-300 px-2.5 py-0.5 text-right font-mono">{formatNumber((areaMetrics.slumTdrSqm || 0) * unitFactor)}</td>
            </tr>
            <tr className="bg-slate-50 font-bold">
              <td className="border border-slate-300 px-2 py-0.5 text-center font-mono">E</td>
              <td className="border border-slate-300 px-2.5 py-0.5">Total Builtup Area (B + C + D)</td>
              <td className="border border-slate-300 px-2.5 py-0.5 text-right font-mono">{formatNumber((areaMetrics.permissibleTotalBuiltupSqm || 0) * unitFactor)}</td>
              <td className="border border-slate-300 px-2.5 py-0.5 text-right font-mono text-[#E05A1E]">{formatNumber((areaMetrics.proposedTotalBuiltupSqm || 0) * unitFactor)}</td>
            </tr>
            <tr>
              <td className="border border-slate-300 px-2 py-0.5 text-center font-mono">F</td>
              <td className="border border-slate-300 px-2.5 py-0.5">TOTAL FSI CONSUMPTION RATIO</td>
              <td className="border border-slate-300 px-2.5 py-0.5 text-right font-mono">{formatNumber(areaMetrics.permissibleTotalFsi || 0, 3)}</td>
              <td className="border border-slate-300 px-2.5 py-0.5 text-right font-mono">{formatNumber(areaMetrics.proposedTotalFsi || 0, 3)}</td>
            </tr>
            <tr>
              <td className="border border-slate-300 px-2 py-0.5 text-center font-mono">G</td>
              <td className="border border-slate-300 px-2.5 py-0.5">{ancillaryLabel}</td>
              <td className="border border-slate-300 px-2.5 py-0.5 text-right font-mono">{formatNumber((areaMetrics.permissibleAncillaryResSqm || 0) * unitFactor)}</td>
              <td className="border border-slate-300 px-2.5 py-0.5 text-right font-mono">{formatNumber((areaMetrics.proposedAncillaryResSqm || 0) * unitFactor)}</td>
            </tr>
            <tr className="bg-emerald-50/80 font-bold border-t-2 border-slate-400">
              <td className="border border-slate-300 px-2 py-1 text-center font-mono">H</td>
              <td className="border border-slate-300 px-2.5 py-1 text-emerald-900">TOTAL PERMISSIBLE P-LINE AREA (E + G)</td>
              <td className="border border-slate-300 px-2.5 py-1 text-right font-mono text-emerald-900">{formatNumber((areaMetrics.permissiblePlineTotalSqm || 0) * unitFactor)}</td>
              <td className="border border-slate-300 px-2.5 py-1 text-right font-mono text-emerald-900">{formatNumber((areaMetrics.proposedPlineTotalSqm || 0) * unitFactor)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ======================================================== */}
      {/* 3. PROPOSED FLOOR-WISE P-LINE STATEMENT (REQ-H EXACT SEQUENCE) */}
      {/* ======================================================== */}
      <div className="space-y-2">
        <div className="bg-slate-700 text-white px-3 py-1.5 font-bold rounded-t text-[11px] uppercase tracking-wider flex items-center justify-between">
          <span>Proposed Floor-wise P-Line Area Statement</span>
          <span className="text-[10px] font-mono font-normal">Height, Units & Area Allocation</span>
        </div>

        <table className="w-full border-collapse border border-slate-300 text-left text-[11px]">
          <thead>
            <tr className="bg-slate-100 text-slate-800 font-bold border-b border-slate-300">
              <th className="border border-slate-300 px-2.5 py-1">Floor Level</th>
              <th className="border border-slate-300 px-2 py-1 text-right w-20">Height (m)</th>
              <th className="border border-slate-300 px-2 py-1 text-right w-28">P-Line Area ({unitLabel})</th>
              <th className="border border-slate-300 px-2 py-1 text-right w-28">Lobby Area ({unitLabel})</th>
              <th className="border border-slate-300 px-2 py-1 text-right w-28">Built-up for Sale ({unitLabel})</th>
              <th className="border border-slate-300 px-2 py-1 text-center w-20">No. Of Units</th>
              <th className="border border-slate-300 px-2 py-1 text-right w-28">Area For 1 Unit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {floors.length === 0 ? (
              <tr>
                <td colSpan="7" className="border border-slate-300 py-6 text-center text-slate-400 italic font-sans">
                  No floor plates defined yet. Add floor levels in the Area Statement form on the left.
                </td>
              </tr>
            ) : (
              floors.map((f, idx) => {
                const isParking = f.floor_type === 'parking';
                const units = parseInt(f.no_of_units, 10) || 0;
                const sale = parseFloat(f.builtup_for_sale_sqm) || 0;
                const areaFor1Unit = units > 0 ? (sale / units) * unitFactor : 0;

                return (
                  <tr key={idx} className={isParking ? 'bg-amber-50/30' : (idx % 2 === 1 ? 'bg-slate-50/50' : '')}>
                    <td className="border border-slate-300 px-2.5 py-0.5 font-medium">
                      {f.floor_name}
                      {isParking && <span className="ml-1 text-[9px] font-semibold text-amber-700">(Parking)</span>}
                    </td>
                    <td className="border border-slate-300 px-2 py-0.5 text-right font-mono">{formatNumber(f.height_meters)}m</td>
                    <td className="border border-slate-300 px-2 py-0.5 text-right font-mono font-semibold">{formatNumber((f.pline_area_sqm || 0) * unitFactor)}</td>
                    <td className="border border-slate-300 px-2 py-0.5 text-right font-mono">
                      {formatNumber((f.lobby_area_sqm || 0) * unitFactor)}
                      {f.is_lobby_overridden && <span className="text-[8px] text-[#E05A1E] font-bold block">*override</span>}
                    </td>
                    <td className="border border-slate-300 px-2 py-0.5 text-right font-mono text-[#E05A1E] font-semibold">{formatNumber((f.builtup_for_sale_sqm || 0) * unitFactor)}</td>
                    <td className="border border-slate-300 px-2 py-0.5 text-center font-mono font-bold">{isParking ? '—' : units}</td>
                    <td className="border border-slate-300 px-2 py-0.5 text-right font-mono font-bold text-slate-800">
                      {isParking || units === 0 ? '—' : formatNumber(areaFor1Unit)}
                    </td>
                  </tr>
                );
              })
            )}
            <tr className="bg-slate-200/90 font-bold border-t-2 border-slate-400">
              <td className="border border-slate-300 px-2.5 py-1">TOTAL PROPOSED P-LINE (A)</td>
              <td className="border border-slate-300 px-2 py-1 text-right font-mono">{formatNumber(areaMetrics.totalHeightMeters)}m</td>
              <td className="border border-slate-300 px-2 py-1 text-right font-mono text-slate-900">{formatNumber((areaMetrics.totalProposedPlineSqm || 0) * unitFactor)}</td>
              <td className="border border-slate-300 px-2 py-1 text-right font-mono">{formatNumber((areaMetrics.totalLobbyAreaSqm || 0) * unitFactor)}</td>
              <td className="border border-slate-300 px-2 py-1 text-right font-mono text-[#E05A1E]">{formatNumber((areaMetrics.totalBuiltupForSaleSqm || 0) * unitFactor)}</td>
              <td className="border border-slate-300 px-2 py-1 text-center font-mono font-bold">{areaMetrics.totalUnitsCount || 0}</td>
              <td className="border border-slate-300 px-2 py-1 text-right font-mono">—</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ======================================================== */}
      {/* 4. FINANCIAL VIABILITY & STATUTORY CHARGES (NMC DEMANDS) */}
      {/* ======================================================== */}
      <div className="space-y-2">
        <div className="bg-slate-800 text-white px-3 py-1.5 font-bold rounded-t text-[11px] uppercase tracking-wider flex items-center justify-between">
          <span>Statutory & Local Authority Charges (Section A)</span>
          <span className="text-[10px] text-slate-300">Ready Reckoner Basis</span>
        </div>

        <table className="w-full border-collapse border border-slate-300 text-left text-[11px]">
          <thead>
            <tr className="bg-slate-100 text-slate-800 font-bold border-b border-slate-300">
              <th className="border border-slate-300 px-2 py-1 w-10 text-center">Sr.</th>
              <th className="border border-slate-300 px-2.5 py-1">Statutory Particulars</th>
              <th className="border border-slate-300 px-2.5 py-1 text-right w-36">Calculated Amount (₹)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {statutoryCharges.filter(c => !c.is_deleted).map((item, idx) => {
              const isEnabled = item.is_enabled !== false;
              return (
                <tr key={item.id || idx} className={!isEnabled ? 'bg-slate-50/50 opacity-60' : ''}>
                  <td className="border border-slate-300 px-2 py-0.5 text-center font-mono">{idx + 1}</td>
                  <td className={`border border-slate-300 px-2.5 py-0.5 font-medium ${!isEnabled ? 'line-through text-slate-400' : ''}`}>
                    {item.charge_name}
                    {!isEnabled && <span className="ml-1 text-[9px] text-amber-600 no-underline font-bold uppercase">(Excluded)</span>}
                  </td>
                  <td className={`border border-slate-300 px-2.5 py-0.5 text-right font-mono ${!isEnabled ? 'text-slate-400' : ''}`}>
                    {isEnabled ? formatINR(item.calculated_amount ?? item.amount) : '₹0.00'}
                  </td>
                </tr>
              );
            })}
            <tr className="bg-slate-200/90 font-bold border-t-2 border-slate-400">
              <td className="border border-slate-300 px-2 py-1 text-center font-mono">A</td>
              <td className="border border-slate-300 px-2.5 py-1">TOTAL STATUTORY & LOCAL AUTHORITY DEMAND</td>
              <td className="border border-slate-300 px-2.5 py-1 text-right font-mono text-slate-900">{formatINR(financialMetrics.totalStatutoryDemandA)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ======================================================== */}
      {/* 5. DEVELOPMENT COSTS & TDR BREAKDOWN */}
      {/* ======================================================== */}
      <div className="space-y-2">
        <div className="bg-slate-700 text-white px-3 py-1.5 font-bold rounded-t text-[11px] uppercase tracking-wider flex items-center justify-between">
          <span>Project Direct Development Costs (Sections B to H)</span>
          <span className="text-[10px] text-slate-300">Civil & Infrastructure</span>
        </div>

        <table className="w-full border-collapse border border-slate-300 text-left text-[11px]">
          <tbody className="divide-y divide-slate-200">
            <tr>
              <td className="border border-slate-300 px-2 py-0.5 font-mono text-center w-10">B</td>
              <td className="border border-slate-300 px-2.5 py-0.5">Cost of TDR Loading (55% of RR Rate)</td>
              <td className="border border-slate-300 px-2.5 py-0.5 text-right font-mono w-36">{formatINR(financialMetrics.costOfTdrB)}</td>
            </tr>
            <tr>
              <td className="border border-slate-300 px-2 py-0.5 font-mono text-center">C</td>
              <td className="border border-slate-300 px-2.5 py-0.5">BPMS Staff, Fire & Airport NOC, Statutory Approvals</td>
              <td className="border border-slate-300 px-2.5 py-0.5 text-right font-mono">{formatINR(financialMetrics.totalExpensesC)}</td>
            </tr>
            <tr>
              <td className="border border-slate-300 px-2 py-0.5 font-mono text-center">D</td>
              <td className="border border-slate-300 px-2.5 py-0.5">Cost of Civil Construction (@ ₹{financial.cost_of_construction_rate || 0}/sqm)</td>
              <td className="border border-slate-300 px-2.5 py-0.5 text-right font-mono">{formatINR(financialMetrics.costOfConstructionD)}</td>
            </tr>
            <tr>
              <td className="border border-slate-300 px-2 py-0.5 font-mono text-center">E</td>
              <td className="border border-slate-300 px-2.5 py-0.5">Basement Construction Cost (@ ₹{financial.basement_rate_per_sqm || 0}/sqm)</td>
              <td className="border border-slate-300 px-2.5 py-0.5 text-right font-mono">{formatINR(financialMetrics.costOfBasementE)}</td>
            </tr>
            <tr>
              <td className="border border-slate-300 px-2 py-0.5 font-mono text-center">F</td>
              <td className="border border-slate-300 px-2.5 py-0.5">Rent During Construction Period ({financial.rent_months || 0} mos)</td>
              <td className="border border-slate-300 px-2.5 py-0.5 text-right font-mono">{formatINR(financialMetrics.rentCostF)}</td>
            </tr>
            <tr>
              <td className="border border-slate-300 px-2 py-0.5 font-mono text-center">G</td>
              <td className="border border-slate-300 px-2.5 py-0.5">Stacked Car Parking Costs ({financial.stacked_parking_slots || 0} slots)</td>
              <td className="border border-slate-300 px-2.5 py-0.5 text-right font-mono">{formatINR(financialMetrics.stackedParkingCostG)}</td>
            </tr>
            <tr>
              <td className="border border-slate-300 px-2 py-0.5 font-mono text-center">H</td>
              <td className="border border-slate-300 px-2.5 py-0.5">Cost of Land / Plot Purchase</td>
              <td className="border border-slate-300 px-2.5 py-0.5 text-right font-mono">{formatINR(financialMetrics.costOfPlotH)}</td>
            </tr>
            <tr className="bg-slate-200/90 font-bold border-t-2 border-slate-400">
              <td className="border border-slate-300 px-2 py-1 text-center font-mono">TOTAL</td>
              <td className="border border-slate-300 px-2.5 py-1">TOTAL PROJECT DEVELOPMENT EXPENDITURE (A to H)</td>
              <td className="border border-slate-300 px-2.5 py-1 text-right font-mono text-[#E05A1E] font-bold">{formatINR(financialMetrics.totalProjectCost)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ======================================================== */}
      {/* 6. SALABLE INVENTORY & RECEIPTS */}
      {/* ======================================================== */}
      <div className="space-y-2">
        <div className="bg-slate-700 text-white px-3 py-1.5 font-bold rounded-t text-[11px] uppercase tracking-wider flex items-center justify-between">
          <span>Project Salable Inventory & Revenue Realization</span>
          <span className="text-[10px] text-slate-300">Carpet + 300 sq ft Loading</span>
        </div>

        <table className="w-full border-collapse border border-slate-300 text-left text-[11px]">
          <thead>
            <tr className="bg-slate-100 text-slate-800 font-bold border-b border-slate-300">
              <th className="border border-slate-300 px-2.5 py-1">Unit Description</th>
              <th className="border border-slate-300 px-2 py-1 text-right w-24">Carpet (sq ft)</th>
              <th className="border border-slate-300 px-2 py-1 text-right w-24">Super (sq ft)</th>
              <th className="border border-slate-300 px-2 py-1 text-center w-16">Count</th>
              <th className="border border-slate-300 px-2 py-1 text-right w-24">Rate (₹/sq ft)</th>
              <th className="border border-slate-300 px-2.5 py-1 text-right w-32">Total Value (₹)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {salableUnits.length === 0 ? (
              <tr>
                <td colSpan="6" className="border border-slate-300 py-6 text-center text-slate-400 italic">
                  No salable units configured yet. Configure units in the Financial Viability tab.
                </td>
              </tr>
            ) : (
              salableUnits.map((u, idx) => (
                <tr key={idx}>
                  <td className="border border-slate-300 px-2.5 py-0.5 font-medium">{u.unit_name}</td>
                  <td className="border border-slate-300 px-2 py-0.5 text-right font-mono">{formatNumber(u.carpet_area_sqft)}</td>
                  <td className="border border-slate-300 px-2 py-0.5 text-right font-mono">{formatNumber(u.super_buildup_area_sqft)}</td>
                  <td className="border border-slate-300 px-2 py-0.5 text-center font-mono font-bold">{u.unit_count}</td>
                  <td className="border border-slate-300 px-2 py-0.5 text-right font-mono">{formatINR(u.rate_per_sqft)}</td>
                  <td className="border border-slate-300 px-2.5 py-0.5 text-right font-mono font-semibold text-emerald-800">{formatINR(u.total_amount)}</td>
                </tr>
              ))
            )}
            <tr className="bg-emerald-50/80 font-bold border-t-2 border-slate-400">
              <td className="border border-slate-300 px-2.5 py-1">GROSS PROJECT RECEIPTS</td>
              <td className="border border-slate-300 px-2 py-1 text-right font-mono">{formatNumber(financialMetrics.totalSalableCarpetSqft)}</td>
              <td className="border border-slate-300 px-2 py-1 text-right font-mono">{formatNumber(financialMetrics.totalSalableSuperSqft)}</td>
              <td className="border border-slate-300 px-2 py-1 text-center font-mono">—</td>
              <td className="border border-slate-300 px-2 py-1 text-right font-mono">—</td>
              <td className="border border-slate-300 px-2.5 py-1 text-right font-mono text-emerald-900 font-bold">{formatINR(financialMetrics.totalReceipts)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ======================================================== */}
      {/* 7. FINANCIAL FEASIBILITY EXECUTIVE SUMMARY */}
      {/* ======================================================== */}
      <div className="bg-slate-900 text-white p-4 rounded-xl space-y-3">
        <div className="flex items-center justify-between border-b border-slate-700 pb-2">
          <span className="font-bold text-xs uppercase tracking-wider text-orange-400">Executive Financial Feasibility Summary</span>
          <span className="text-[10px] text-slate-400">Net Viability Realization</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
          <div className="bg-slate-800/80 p-2.5 rounded-lg border border-slate-700">
            <span className="text-[10px] text-slate-400 block uppercase font-bold">Total Project Cost</span>
            <span className="font-mono text-sm font-bold text-slate-100">{formatINR(financialMetrics.totalProjectCost)}</span>
          </div>
          <div className="bg-slate-800/80 p-2.5 rounded-lg border border-slate-700">
            <span className="text-[10px] text-slate-400 block uppercase font-bold">Gross Estimated Receipts</span>
            <span className="font-mono text-sm font-bold text-emerald-400">{formatINR(financialMetrics.totalReceipts)}</span>
          </div>
          <div className="bg-slate-800/80 p-2.5 rounded-lg border border-slate-700">
            <span className="text-[10px] text-slate-400 block uppercase font-bold">Projected Net Profit</span>
            <span className={`font-mono text-sm font-bold ${financialMetrics.netProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {formatINR(financialMetrics.netProfit)}
            </span>
          </div>
          <div className="bg-slate-800/80 p-2.5 rounded-lg border border-slate-700">
            <span className="text-[10px] text-slate-400 block uppercase font-bold">Estimated ROI / Margin</span>
            <span className="font-mono text-sm font-bold text-orange-400">
              {formatNumber(financialMetrics.roiPct, 1)}% ROI ({formatNumber(financialMetrics.profitMarginPct, 1)}% Margin)
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
