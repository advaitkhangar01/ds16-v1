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
  statement,
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
      {/* 1. AREA STATEMENT TABLE (AUTHENTIC SPREADSHEET PRESENTATION) */}
      {/* ======================================================== */}
      <div className="space-y-2">
        <div className="bg-slate-800 text-white px-3 py-1.5 font-bold rounded-t text-[11px] uppercase tracking-wider flex items-center justify-between">
          <span>Area Statement ({unitLabel})</span>
          <span className="text-[10px] font-normal lowercase tracking-normal text-slate-300">verified potential calculations</span>
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
            <tr className="bg-orange-50/50 font-semibold">
              <td className="border border-slate-300 px-2 py-0.5 text-center font-mono">A</td>
              <td className="border border-slate-300 px-2.5 py-0.5">Plotable Area (Net Development Plot)</td>
              <td className="border border-slate-300 px-2.5 py-0.5 text-right font-mono">{formatNumber((areaMetrics.plotableAreaSqm || 0) * unitFactor)}</td>
              <td className="border border-slate-300 px-2.5 py-0.5 text-right font-mono">{formatNumber((areaMetrics.plotableAreaSqm || 0) * unitFactor)}</td>
            </tr>
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
              <td className="border border-slate-300 px-2 py-0.5 text-center font-mono">D</td>
              <td className="border border-slate-300 px-2.5 py-0.5">TDR Utilization ({statement.tdr_factor || 0.65} Permissible / {statement.proposed_tdr_factor || 0} Proposed)</td>
              <td className="border border-slate-300 px-2.5 py-0.5 text-right font-mono">{formatNumber((areaMetrics.permissibleTdrSqm || 0) * unitFactor)}</td>
              <td className="border border-slate-300 px-2.5 py-0.5 text-right font-mono">{formatNumber((areaMetrics.proposedTdrSqm || 0) * unitFactor)}</td>
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
              <td className="border border-slate-300 px-2.5 py-0.5">Ancillary FSI (60% Residential)</td>
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
      {/* 2. PROPOSED FLOOR-WISE P-LINE STATEMENT */}
      {/* ======================================================== */}
      <div className="space-y-2">
        <div className="bg-slate-700 text-white px-3 py-1.5 font-bold rounded-t text-[11px] uppercase tracking-wider flex items-center justify-between">
          <span>Proposed P-Line Floor Breakdown</span>
          <span className="text-[10px] font-mono font-normal">Height & Area Allocation</span>
        </div>

        <table className="w-full border-collapse border border-slate-300 text-left text-[11px]">
          <thead>
            <tr className="bg-slate-100 text-slate-800 font-bold border-b border-slate-300">
              <th className="border border-slate-300 px-2 py-1">Floor Level</th>
              <th className="border border-slate-300 px-2 py-1 text-right w-20">Height (m)</th>
              <th className="border border-slate-300 px-2 py-1 text-right w-24">P-Line Area</th>
              <th className="border border-slate-300 px-2 py-1 text-right w-24">Lobby Area</th>
              <th className="border border-slate-300 px-2 py-1 text-right w-24">Builtup Owners</th>
              <th className="border border-slate-300 px-2 py-1 text-right w-24">Builtup Sale</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {floors.length === 0 ? (
              <tr>
                <td colSpan="6" className="border border-slate-300 py-6 text-center text-slate-400 italic font-sans">
                  No floor plates defined yet. Add floor levels in the Area Statement form on the left.
                </td>
              </tr>
            ) : (
              floors.map((f, idx) => (
                <tr key={idx} className={idx % 2 === 1 ? 'bg-slate-50/50' : ''}>
                  <td className="border border-slate-300 px-2.5 py-0.5 font-medium">{f.floor_name}</td>
                  <td className="border border-slate-300 px-2 py-0.5 text-right font-mono">{formatNumber(f.height_meters)}m</td>
                  <td className="border border-slate-300 px-2 py-0.5 text-right font-mono font-semibold">{formatNumber(f.pline_area_sqm * unitFactor)}</td>
                  <td className="border border-slate-300 px-2 py-0.5 text-right font-mono">{formatNumber(f.lobby_area_sqm * unitFactor)}</td>
                  <td className="border border-slate-300 px-2 py-0.5 text-right font-mono">{formatNumber(f.builtup_for_owners_sqm * unitFactor)}</td>
                  <td className="border border-slate-300 px-2 py-0.5 text-right font-mono text-[#E05A1E] font-semibold">{formatNumber(f.builtup_for_sale_sqm * unitFactor)}</td>
                </tr>
              ))
            )}
            <tr className="bg-slate-200/90 font-bold border-t-2 border-slate-400">
              <td className="border border-slate-300 px-2.5 py-1">TOTAL PROPOSED P-LINE (A)</td>
              <td className="border border-slate-300 px-2 py-1 text-right font-mono">{formatNumber(areaMetrics.totalHeightMeters)}m</td>
              <td className="border border-slate-300 px-2 py-1 text-right font-mono text-slate-900">{formatNumber((areaMetrics.totalProposedPlineSqm || 0) * unitFactor)}</td>
              <td className="border border-slate-300 px-2 py-1 text-right font-mono">{formatNumber((areaMetrics.totalLobbyAreaSqm || 0) * unitFactor)}</td>
              <td className="border border-slate-300 px-2 py-1 text-right font-mono">{formatNumber((areaMetrics.totalBuiltupForOwnersSqm || 0) * unitFactor)}</td>
              <td className="border border-slate-300 px-2 py-1 text-right font-mono text-[#E05A1E]">{formatNumber((areaMetrics.totalBuiltupForSaleSqm || 0) * unitFactor)}</td>
            </tr>
          </tbody>
        </table>

        {/* Secondary Calculations Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-mono text-[10px]">
          <div className="bg-slate-50 border border-slate-200 p-1.5 rounded">
            <span className="text-muted block">Existing Deduction:</span>
            <strong>{formatNumber((statement.existing_builtup_area_sqm || 0) * unitFactor)} {unitLabel}</strong>
          </div>
          <div className="bg-slate-50 border border-slate-200 p-1.5 rounded">
            <span className="text-muted block">Dividing Factor 1.6:</span>
            <strong>{formatNumber((areaMetrics.baseDividingFactorSqm || 0) * unitFactor)} {unitLabel}</strong>
          </div>
          <div className="bg-slate-50 border border-slate-200 p-1.5 rounded">
            <span className="text-muted block">Derived Ancillary:</span>
            <strong>{formatNumber((areaMetrics.derivedAncillaryAreaSqm || 0) * unitFactor)} {unitLabel}</strong>
          </div>
          <div className="bg-orange-50 border border-orange-200 p-1.5 rounded text-[#E05A1E]">
            <span className="text-muted block">Paid FSI Required:</span>
            <strong>{formatNumber((areaMetrics.paidFsiRequiredSqm || 0) * unitFactor)} {unitLabel}</strong>
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 3. FINANCIAL VIABILITY & STATUTORY CHARGES (NMC DEMANDS) */}
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
            {statutoryCharges.map((item, idx) => (
              <tr key={item.id || idx}>
                <td className="border border-slate-300 px-2 py-0.5 text-center font-mono">{idx + 1}</td>
                <td className="border border-slate-300 px-2.5 py-0.5 font-medium">{item.charge_name}</td>
                <td className="border border-slate-300 px-2.5 py-0.5 text-right font-mono">{formatINR(item.calculated_amount ?? item.amount)}</td>
              </tr>
            ))}
            <tr className="bg-slate-200/90 font-bold border-t-2 border-slate-400">
              <td className="border border-slate-300 px-2 py-1 text-center font-mono">A</td>
              <td className="border border-slate-300 px-2.5 py-1">TOTAL STATUTORY & LOCAL AUTHORITY DEMAND</td>
              <td className="border border-slate-300 px-2.5 py-1 text-right font-mono text-slate-900">{formatINR(financialMetrics.totalStatutoryDemandA)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ======================================================== */}
      {/* 4. DEVELOPMENT COSTS & TDR BREAKDOWN */}
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
              <td className="border border-slate-300 px-2.5 py-0.5">Civil Construction Cost (P-Line × {financial.cost_of_construction_rate ? `₹${Number(financial.cost_of_construction_rate).toLocaleString('en-IN')}` : '₹0'}/sqm)</td>
              <td className="border border-slate-300 px-2.5 py-0.5 text-right font-mono">{formatINR(financialMetrics.costOfConstructionD)}</td>
            </tr>
            <tr>
              <td className="border border-slate-300 px-2 py-0.5 font-mono text-center">E</td>
              <td className="border border-slate-300 px-2.5 py-0.5">Basement Construction Cost ({financial.basement_area_sqm || 0} sqm × {financial.basement_rate_per_sqm ? `₹${Number(financial.basement_rate_per_sqm).toLocaleString('en-IN')}` : '₹0'})</td>
              <td className="border border-slate-300 px-2.5 py-0.5 text-right font-mono">{formatINR(financialMetrics.costOfBasementE)}</td>
            </tr>
            <tr>
              <td className="border border-slate-300 px-2 py-0.5 font-mono text-center">F</td>
              <td className="border border-slate-300 px-2.5 py-0.5">Tenant Rent during Construction ({financial.rent_tenements || 0} tenements × {financial.rent_months || 0} mos)</td>
              <td className="border border-slate-300 px-2.5 py-0.5 text-right font-mono">{formatINR(financialMetrics.rentCostF)}</td>
            </tr>
            <tr>
              <td className="border border-slate-300 px-2 py-0.5 font-mono text-center">G</td>
              <td className="border border-slate-300 px-2.5 py-0.5">Stacked Parking System ({financial.stacked_parking_slots || 0} stacks)</td>
              <td className="border border-slate-300 px-2.5 py-0.5 text-right font-mono">{formatINR(financialMetrics.stackedParkingCostG)}</td>
            </tr>
            <tr>
              <td className="border border-slate-300 px-2 py-0.5 font-mono text-center">H</td>
              <td className="border border-slate-300 px-2.5 py-0.5">Plot Land Cost</td>
              <td className="border border-slate-300 px-2.5 py-0.5 text-right font-mono">{formatINR(financialMetrics.costOfPlotH)}</td>
            </tr>
            <tr className="bg-red-50/70 font-bold border-t-2 border-slate-400">
              <td className="border border-slate-300 px-2 py-1 font-mono text-center">TOTAL</td>
              <td className="border border-slate-300 px-2.5 py-1 text-red-950">TOTAL PROJECT DEVELOPMENT COST (A + B + C + D + E + F + G + H)</td>
              <td className="border border-slate-300 px-2.5 py-1 text-right font-mono text-red-700">{formatINR(financialMetrics.totalProjectCost)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ======================================================== */}
      {/* 5. PROJECT RECEIPTS & EXECUTIVE SUMMARY */}
      {/* ======================================================== */}
      <div className="space-y-2">
        <div className="bg-emerald-800 text-white px-3 py-1.5 font-bold rounded-t text-[11px] uppercase tracking-wider flex items-center justify-between">
          <span>Project Salable Receipts & Realization</span>
          <span className="text-[10px] text-emerald-200">Revenue Stream</span>
        </div>

        <table className="w-full border-collapse border border-slate-300 text-left text-[11px]">
          <thead>
            <tr className="bg-slate-100 text-slate-800 font-bold border-b border-slate-300">
              <th className="border border-slate-300 px-2 py-1">Salable Particulars</th>
              <th className="border border-slate-300 px-2 py-1 text-right">Carpet (sq ft)</th>
              <th className="border border-slate-300 px-2 py-1 text-right">Super B/Up (sq ft)</th>
              <th className="border border-slate-300 px-2 py-1 text-center">Units</th>
              <th className="border border-slate-300 px-2 py-1 text-right">Rate/sq ft</th>
              <th className="border border-slate-300 px-2 py-1 text-right w-36">Total Amount (₹)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {salableUnits.length === 0 ? (
              <tr>
                <td colSpan={6} className="border border-slate-300 py-6 text-center text-slate-400 italic font-sans">
                  No salable inventory configured yet. Add unit inventory in the Financial Viability form on the left.
                </td>
              </tr>
            ) : (
              salableUnits.map((u, idx) => (
                <tr key={u.id || idx}>
                  <td className="border border-slate-300 px-2.5 py-0.5 font-medium">{u.unit_name}</td>
                  <td className="border border-slate-300 px-2 py-0.5 text-right font-mono">{formatNumber(u.carpet_area_sqft)}</td>
                  <td className="border border-slate-300 px-2 py-0.5 text-right font-mono font-semibold">{formatNumber(u.super_buildup_area_sqft)}</td>
                  <td className="border border-slate-300 px-2 py-0.5 text-center font-bold font-mono">{u.unit_count}</td>
                  <td className="border border-slate-300 px-2 py-0.5 text-right font-mono">₹{formatNumber(u.rate_per_sqft, 0)}</td>
                  <td className="border border-slate-300 px-2 py-0.5 text-right font-mono font-bold text-emerald-700">{formatINR(u.total_amount)}</td>
                </tr>
              ))
            )}
            <tr className="bg-emerald-50/80 font-bold border-t-2 border-slate-400">
              <td colSpan={5} className="border border-slate-300 px-2.5 py-1 text-emerald-950">TOTAL ESTIMATED RECEIPTS</td>
              <td className="border border-slate-300 px-2.5 py-1 text-right font-mono text-emerald-800 font-bold">{formatINR(financialMetrics.totalReceipts)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ======================================================== */}
      {/* 6. EXECUTIVE PROFITABILITY SUMMARY BOX */}
      {/* ======================================================== */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white p-4 rounded-xl shadow-md grid grid-cols-1 sm:grid-cols-3 gap-4 border border-slate-700">
        <div>
          <span className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">Total Project Cost</span>
          <p className="text-base font-bold font-mono text-slate-200">{formatINR(financialMetrics.totalProjectCost)}</p>
        </div>
        <div>
          <span className="text-[10px] text-emerald-400 uppercase tracking-wider font-bold">Total Projected Receipts</span>
          <p className="text-base font-bold font-mono text-emerald-300">{formatINR(financialMetrics.totalReceipts)}</p>
        </div>
        <div className="border-l-0 sm:border-l border-slate-700 sm:pl-4">
          <span className="text-[10px] text-[#E05A1E] uppercase tracking-wider font-bold">Net Project Profit</span>
          <p className="text-lg font-extrabold font-mono text-white">
            {formatINR(financialMetrics.netProfit)}
          </p>
          <span className="text-[10px] text-emerald-400 font-bold">
            ROI: {formatNumber(financialMetrics.roiPct, 1)}% | Margin: {formatNumber(financialMetrics.profitMarginPct, 1)}%
          </span>
        </div>
      </div>
    </div>
  );
}
