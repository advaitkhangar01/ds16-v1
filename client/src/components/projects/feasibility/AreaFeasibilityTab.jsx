// client/src/components/projects/feasibility/AreaFeasibilityTab.jsx
import React, { useState, useEffect, useCallback } from 'react';
import {
  Calculator,
  FileSpreadsheet,
  Download,
  Save,
  Camera,
  Layers,
  Sparkles,
  BarChart3,
  FileText
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../../api/client';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

import AreaStatementForm from './AreaStatementForm';
import FinancialViabilityForm from './FinancialViabilityForm';
import FeasibilityDocumentPreview from './FeasibilityDocumentPreview';

const formatINR = (val) => {
  if (val === undefined || val === null || isNaN(val)) return '₹0.00';
  return '₹' + Number(val).toLocaleString('en-IN', { maximumFractionDigits: 2 });
};

const formatNum = (val, decimals = 2) => {
  if (val === undefined || val === null || isNaN(val)) return '0.00';
  return Number(val).toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
};

export default function AreaFeasibilityTab({ projectId, isPrivileged }) {
  const [unitDisplay, setUnitDisplay] = useState('sq_m'); // 'sq_m' or 'sq_ft'
  const [activeNav, setActiveNav] = useState('section-area-statement');

  const [project, setProject] = useState(null);
  const [statement, setStatement] = useState({});
  const [floors, setFloors] = useState([]);
  const [financial, setFinancial] = useState({});
  const [statutoryCharges, setStatutoryCharges] = useState([]);
  const [salableUnits, setSalableUnits] = useState([]);
  const [areaMetrics, setAreaMetrics] = useState({});
  const [financialMetrics, setFinancialMetrics] = useState({});
  const [, setSnapshots] = useState([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Fetch feasibility bundle
  const fetchData = useCallback(async () => {
    try {
      const [feasRes, snapRes] = await Promise.all([
        api.get(`/projects/${projectId}/feasibility`),
        api.get(`/projects/${projectId}/feasibility/snapshots`)
      ]);

      const data = feasRes.data;
      setProject(data.project);
      setStatement(data.statement || {});
      setFloors(data.floors || []);
      setFinancial(data.financial || {});
      setStatutoryCharges(data.statutoryCharges || []);
      setSalableUnits(data.salableUnits || []);
      setAreaMetrics(data.areaMetrics || {});
      setFinancialMetrics(data.financialMetrics || {});
      setUnitDisplay(data.statement?.unit_display || 'sq_m');
      setSnapshots(snapRes.data.snapshots || []);
    } catch (err) {
      console.error('Error loading feasibility data:', err);
      toast.error(err.response?.data?.error || 'Failed to load feasibility data');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Recalculate metrics client-side whenever inputs change for instant preview responsiveness
  const recalculateLive = (newStmt, newFloors, newFin, newUnits, newStatutory) => {
    const s = newStmt || statement;
    const f = newFloors || floors;
    const fin = newFin || financial;
    const u = newUnits || salableUnits;
    const scList = newStatutory || statutoryCharges;

    const plot = parseFloat(s.plot_area_sqm) || 0;
    const dp = parseFloat(s.dp_deductions_sqm) || 0;
    const plotable = Math.max(0, plot - dp);

    const basicFsi = plotable * (parseFloat(s.basic_fsi_factor) || 1.1);
    const paidFsi = plotable * (parseFloat(s.paid_fsi_factor) || 0.5);

    const permissibleTdrFactor = parseFloat(s.tdr_factor) !== undefined && !isNaN(parseFloat(s.tdr_factor))
      ? parseFloat(s.tdr_factor)
      : 0.65;
    const permissibleTdr = plotable * permissibleTdrFactor;
    const permissibleTotalBuiltup = basicFsi + paidFsi + permissibleTdr;

    const regTdrFactor = parseFloat(s.regular_tdr_factor) || 0;
    const slumTdrFactor = parseFloat(s.slum_tdr_factor) || 0;
    const regTdr = plotable * regTdrFactor;
    const slumTdr = plotable * slumTdrFactor;
    const totalTdr = regTdr + slumTdr;

    const totalBuiltup = basicFsi + paidFsi + totalTdr;
    const rawUse = (s.building_use || 'Residential').toLowerCase();
    const isMixedUse = rawUse.includes('mixed');
    const isCommercial = !isMixedUse && rawUse.includes('comm');
    const resAncillaryPct = parseFloat(s.ancillary_residential_pct) || 0.6;
    const commAncillaryPct = parseFloat(s.ancillary_commercial_pct) || 0.8;

    let commCount = 0;
    let resCount = 0;
    f.forEach(fl => {
      const u = (fl.usage_type || fl.floor_name || '').toLowerCase();
      if (u.includes('comm') || u.includes('shop') || u.includes('office')) commCount++;
      else if (!u.includes('parking') && !u.includes('terrace')) resCount++;
    });
    const totalHab = commCount + resCount;
    const commRatio = totalHab > 0 ? (commCount / totalHab) : (isCommercial ? 1 : 0);
    const resRatio = totalHab > 0 ? (resCount / totalHab) : (isCommercial ? 0 : 1);
    const effectiveAncillaryPct = isMixedUse
      ? (commRatio * commAncillaryPct + resRatio * resAncillaryPct)
      : (isCommercial ? commAncillaryPct : resAncillaryPct);

    const ancillary = totalBuiltup * effectiveAncillaryPct;
    const proposedPline = totalBuiltup + ancillary;
    const isProjectOverridden = Boolean(s.is_proposed_pline_overridden && parseFloat(s.total_proposed_pline_override_sqm) > 0);
    const effectiveProposedPline = isProjectOverridden
      ? parseFloat(s.total_proposed_pline_override_sqm)
      : proposedPline;

    let floorPlineSum = 0;
    let floorFsiSum = 0;
    let floorAncillarySum = 0;
    let floorLobbySum = 0;
    let floorOwnersSum = 0;
    let floorSaleSum = 0;
    let floorHeightSum = 0;
    let totalUnitsCount = 0;

    f.forEach((fl, idx) => {
      const p = parseFloat(fl.pline_area_sqm) || 0;
      const fsi = parseFloat(fl.fsi_area_sqm) || 0;
      const anc = parseFloat(fl.ancillary_area_sqm) || 0;
      const l = parseFloat(fl.lobby_area_sqm) || 0;
      const h = parseFloat(fl.height_meters) || 0;
      const o = parseFloat(fl.builtup_for_owners_sqm) !== undefined && !isNaN(parseFloat(fl.builtup_for_owners_sqm))
        ? parseFloat(fl.builtup_for_owners_sqm)
        : (idx === 0 ? 0 : Math.max(0, p - l));
      const sa = parseFloat(fl.builtup_for_sale_sqm) || 0;
      const unitCnt = parseInt(fl.no_of_units, 10) || 0;

      floorPlineSum += p;
      floorFsiSum += fsi;
      floorAncillarySum += anc;
      floorLobbySum += l;
      floorOwnersSum += o;
      floorSaleSum += sa;
      floorHeightSum += h;
      totalUnitsCount += unitCnt;
    });

    const divFactor = parseFloat(s.dividing_factor) || 1.6;
    const baseDiv = divFactor > 0 ? floorPlineSum / divFactor : 0;
    const derivedAnc = Math.max(0, floorPlineSum - baseDiv);
    const paidReq = Math.max(0, baseDiv - basicFsi - plotable * 0.3);

    const updatedArea = {
      ...areaMetrics,
      plotAreaSqm: plot,
      dpDeductionsSqm: dp,
      plotableAreaSqm: plotable,
      permissibleFsiSqm: basicFsi,
      proposedBasicFsiSqm: basicFsi,
      permissiblePaidFsiSqm: paidFsi,
      proposedPaidFsiSqm: paidFsi,
      permissibleRegularTdrSqm: regTdr,
      proposedRegularTdrSqm: regTdr,
      permissibleSlumTdrSqm: slumTdr,
      proposedSlumTdrSqm: slumTdr,
      permissibleTdrSqm: permissibleTdr,
      proposedTdrSqm: totalTdr,
      permissibleTotalBuiltupSqm: permissibleTotalBuiltup,
      proposedTotalBuiltupSqm: totalBuiltup,
      permissibleTotalFsi: plotable > 0 ? permissibleTotalBuiltup / plotable : 0,
      proposedTotalFsi: plotable > 0 ? (floorFsiSum > 0 ? floorFsiSum : totalBuiltup) / plotable : 0,
      proposedTotalFsiSqm: floorFsiSum > 0 ? floorFsiSum : totalBuiltup,
      permissibleAncillaryResSqm: ancillary,
      proposedAncillaryResSqm: ancillary,
      totalProposedAncillarySqm: floorAncillarySum > 0 ? floorAncillarySum : ancillary,
      permissiblePlineTotalSqm: proposedPline,
      proposedPlineTotalSqm: effectiveProposedPline,
      calculatedProposedPlineSqm: proposedPline,
      effectiveProposedPlineSqm: effectiveProposedPline,
      isProposedPlineOverridden: isProjectOverridden,
      totalProposedPlineSqm: floorPlineSum > 0 ? floorPlineSum : effectiveProposedPline,
      totalLobbyAreaSqm: floorLobbySum,
      totalBuiltupForOwnersSqm: floorOwnersSum,
      totalBuiltupForSaleSqm: floorSaleSum,
      totalHeightMeters: floorHeightSum,
      totalUnitsCount,
      baseDividingFactorSqm: baseDiv,
      derivedAncillaryAreaSqm: derivedAnc,
      paidFsiRequiredSqm: paidReq,
      areaBalanceSqm: effectiveProposedPline - floorPlineSum
    };
    setAreaMetrics(updatedArea);

    // Live financial recalculation
    const rr = parseFloat(fin.rr_rate_per_sqm) || 0;
    const effectivePline = floorPlineSum > 0 ? floorPlineSum : effectiveProposedPline;
    const constRate = parseFloat(fin.cost_of_construction_rate) || parseFloat(fin.estimated_cost_b_rate) || 0;
    const costConst = effectivePline * constRate;
    const estCostA = effectivePline * (parseFloat(fin.estimated_cost_a_rate) || 0);
    const estCostB = effectivePline * (parseFloat(fin.estimated_cost_b_rate) || 0);
    const costTdr = totalTdr * (parseFloat(fin.tdr_purchase_factor) || 0.55) * rr;
    const plotCost = parseFloat(fin.cost_of_plot) || plotable * (parseFloat(fin.cost_of_plot_rate_per_sqm) || 0);
    const basementCost = (parseFloat(fin.basement_area_sqm) || 0) * (parseFloat(fin.basement_rate_per_sqm) || 0);
    const rentCost =
      (parseInt(fin.rent_tenements, 10) || 0) *
      (parseFloat(fin.rent_per_tenement_per_month) || 0) *
      (parseInt(fin.rent_months, 10) || 0);
    const parkingCost =
      (parseInt(fin.stacked_parking_slots, 10) || 0) *
      (parseFloat(fin.stacked_parking_cost_per_slot) || 0);
    const minorNoc =
      (parseFloat(fin.minor_expenses) || 0) +
      (parseFloat(fin.bpms_staff_charges) || 0) +
      (parseFloat(fin.airport_noc) || 0) +
      (parseFloat(fin.fire_noc) || 0) +
      (parseFloat(fin.entertainment_charges) || 0);

    let statSum = 0;
    scList.forEach((sc) => {
      if (sc.is_enabled !== false && !sc.is_deleted && sc.charge_name !== 'AMALGAMATION' && sc.charge_code !== 'AMALGAMATION') {
        statSum += parseFloat(sc.effective_amount ?? sc.calculated_amount ?? sc.amount) || 0;
      }
    });

    const infraCost = parseFloat(fin.cost_of_infrastructure) || 0;
    const interestCost = parseFloat(fin.interest_amount) || 0;
    const totalCost = statSum + costTdr + minorNoc + costConst + basementCost + rentCost + parkingCost + plotCost + infraCost + interestCost;

    let floorReceiptsSum = 0;
    f.forEach((fl) => {
      const sale = parseFloat(fl.builtup_for_sale_sqm) || 0;
      const rate = parseFloat(fl.rate_per_sqm) || 0;
      const units = parseInt(fl.no_of_units, 10) || 0;
      const cost1Unit = parseFloat(fl.cost_for_1_unit) || (units > 0 ? (sale * rate) / units : 0);
      if (rate > 0 && sale > 0) {
        floorReceiptsSum += sale * rate;
      } else if (cost1Unit > 0 && units > 0) {
        floorReceiptsSum += cost1Unit * units;
      }
    });

    let receiptsSum = 0;
    if (floorReceiptsSum > 0) {
      receiptsSum = floorReceiptsSum;
    } else {
      u.forEach((un) => {
        const c = parseFloat(un.carpet_area_sqm) || 0;
        const sup = c * 10.764 + (parseFloat(un.super_buildup_loading_sqft) || 0);
        const pr = sup * (parseFloat(un.rate_per_sqft) || 0);
        receiptsSum += pr * (parseInt(un.unit_count, 10) || 1);
      });
    }

    const netProf = receiptsSum - totalCost;

    setFinancialMetrics((prev) => ({
      ...prev,
      estimatedCostA: estCostA,
      estimatedCostB: estCostB,
      totalStatutoryDemandA: statSum,
      costOfTdrB: costTdr,
      totalExpensesC: minorNoc,
      costOfPlotH: plotCost,
      costOfConstructionD: costConst,
      costOfBasementE: basementCost,
      rentCostF: rentCost,
      stackedParkingCostG: parkingCost,
      totalProjectCost: totalCost,
      totalReceipts: receiptsSum,
      netProfit: netProf,
      roiPct: totalCost > 0 ? (netProf / totalCost) * 100 : 0,
      profitMarginPct: receiptsSum > 0 ? (netProf / receiptsSum) * 100 : 0
    }));
  };

  const handleUpdateStatement = (updates) => {
    const updated = { ...statement, ...updates };
    setStatement(updated);
    recalculateLive(updated, floors, financial, salableUnits, statutoryCharges);
  };

  const handleReconcileFloors = async () => {
    try {
      const res = await api.post(`/projects/${projectId}/feasibility/area/reconcile-floors`);
      setFloors(res.data.floors || []);
      toast.success(res.data.message || 'Floors reconciled with Building Configuration');
      fetchData();
    } catch (err) {
      console.error('Error reconciling floors:', err);
      toast.error(err.response?.data?.error || 'Failed to reconcile floors');
    }
  };

  const handleSaveFinancialOverride = async (key, val, basisVal, reason) => {
    try {
      await api.put(`/projects/${projectId}/feasibility/financial/overrides`, {
        key,
        override_val: val,
        calculated_basis_val: basisVal,
        reason
      });
      toast.success(`Override saved for ${key}`);
      fetchData();
    } catch (err) {
      console.error('Error saving financial override:', err);
      toast.error(err.response?.data?.error || 'Failed to save override');
    }
  };

  const handleResetFinancialOverride = async (key) => {
    try {
      await api.post(`/projects/${projectId}/feasibility/financial/overrides/reset`, { key });
      toast.success(`Override reset for ${key}`);
      fetchData();
    } catch (err) {
      console.error('Error resetting financial override:', err);
      toast.error(err.response?.data?.error || 'Failed to reset override');
    }
  };

  const handleUpdateFloor = (id, updates) => {
    const newFloors = floors.map((f) => {
      if (f.id !== id) return f;
      const merged = { ...f, ...updates };
      const isParking = merged.floor_type === 'parking';
      const isTerrace = merged.floor_type === 'terrace';
      if (!isParking && !isTerrace) {
        const pline = parseFloat(merged.pline_area_sqm) || 0;
        const ancPct = merged.ancillary_pct || (merged.usage_type === 'Commercial' ? 0.8 : 0.6);
        const fsi = pline / (1 + ancPct);
        const anc = pline - fsi;
        const lobby = merged.is_lobby_overridden ? (parseFloat(merged.lobby_area_sqm) || 0) : Math.round(pline * 0.15 * 100) / 100;
        const sale = Math.max(0, pline - lobby);
        const units = parseInt(merged.no_of_units, 10) || 0;
        merged.fsi_area_sqm = Math.round(fsi * 100) / 100;
        merged.ancillary_area_sqm = Math.round(anc * 100) / 100;
        if (!merged.is_lobby_overridden) merged.lobby_area_sqm = lobby;
        merged.builtup_for_sale_sqm = Math.round(sale * 100) / 100;
        merged.area_for_1_unit = units > 0 ? Math.round((sale / units) * 100) / 100 : 0;
      }
      return merged;
    });
    setFloors(newFloors);
    recalculateLive(statement, newFloors, financial, salableUnits, statutoryCharges);
  };

  const handleUpdateFinancial = (updates) => {
    const updated = { ...financial, ...updates };
    setFinancial(updated);
    recalculateLive(statement, floors, updated, salableUnits, statutoryCharges);
  };

  const handleUpdateStatutoryCharge = (id, updates) => {
    const newCharges = statutoryCharges.map((sc) => {
      if (sc.id === id) {
        const updated = { ...sc, ...updates };
        if (updates.rr_percentage !== undefined) {
          const rr = parseFloat(financial.rr_rate_per_sqm) || 0;
          const pline = areaMetrics.totalProposedPlineSqm || areaMetrics.proposedPlineTotalSqm || 0;
          const pct = parseFloat(updates.rr_percentage) || 0;
          updated.calculated_amount = pline * rr * (pct / 100);
          updated.amount = updated.calculated_amount;
          updated.effective_amount = updated.calculated_amount;
        }
        return updated;
      }
      return sc;
    });
    setStatutoryCharges(newCharges);
    recalculateLive(statement, floors, financial, salableUnits, newCharges);
  };

  const handleSaveAll = async () => {
    setSaving(true);
    try {
      await api.put(`/projects/${projectId}/feasibility/area`, {
        ...statement,
        unit_display: unitDisplay
      });
      for (const fl of floors) {
        if (fl.id) {
          await api.put(`/projects/${projectId}/feasibility/area/floors/${fl.id}`, fl);
        }
      }
      await api.put(`/projects/${projectId}/feasibility/financial`, financial);
      for (const sc of statutoryCharges) {
        if (sc.id && !sc.is_deleted) {
          await api.patch(`/projects/${projectId}/feasibility/statutory/${sc.id}`, {
            is_enabled: sc.is_enabled,
            rr_percentage: sc.rr_percentage,
            amount: sc.calculated_amount ?? sc.amount
          });
        }
      }
      for (const un of salableUnits) {
        if (un.id) {
          await api.put(`/projects/${projectId}/feasibility/financial/salable-units/${un.id}`, un);
        }
      }

      toast.success('Feasibility parameters saved successfully');
      await fetchData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save feasibility parameters');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateSnapshot = async () => {
    const name = window.prompt('Enter snapshot name:', `Feasibility Snapshot ${new Date().toLocaleDateString('en-GB')}`);
    if (!name) return;
    try {
      const res = await api.post(`/projects/${projectId}/feasibility/snapshots`, {
        snapshot_name: name,
        area_data_snapshot: { statement, floors, areaMetrics },
        financial_data_snapshot: { financial, statutoryCharges, salableUnits, financialMetrics }
      });
      toast.success('Calculation snapshot recorded');
      setSnapshots((prev) => [res.data.snapshot, ...prev]);
    } catch {
      toast.error('Failed to create snapshot');
    }
  };

  // Export to Excel Workbook (preserves exact existing workbook structure)
  const handleExportExcel = () => {
    const permissibleRows = [
      { 'Sr.': '1', Particulars: 'Area of Plot', 'Permissible Value': statement.plot_area_sqm },
      { 'Sr.': '2', Particulars: 'D.P. Deductions', 'Permissible Value': statement.dp_deductions_sqm || 0 },
      { 'Sr.': '3', Particulars: 'Existing Built-up Area Deduction', 'Permissible Value': statement.existing_builtup_area_sqm || 0 },
      { 'Sr.': 'A', Particulars: 'Plotable Area (Net Development Plot)', 'Permissible Value': areaMetrics.plotableAreaSqm },
      { 'Sr.': 'B', Particulars: `Basic Permissible FSI (${statement.basic_fsi_factor || 1.1})`, 'Permissible Value': areaMetrics.permissibleFsiSqm },
      { 'Sr.': 'C', Particulars: `Paid FSI (${statement.paid_fsi_factor || 0.5})`, 'Permissible Value': areaMetrics.permissiblePaidFsiSqm },
      { 'Sr.': 'D1', Particulars: `Regular TDR (${statement.regular_tdr_factor || 0})`, 'Permissible Value': areaMetrics.permissibleRegularTdrSqm || 0 },
      { 'Sr.': 'D2', Particulars: `Slum TDR (${statement.slum_tdr_factor || 0})`, 'Permissible Value': areaMetrics.permissibleSlumTdrSqm || 0 },
      { 'Sr.': 'E', Particulars: 'Total Builtup Area (B + C + D)', 'Permissible Value': areaMetrics.permissibleTotalBuiltupSqm },
      { 'Sr.': 'F', Particulars: 'TOTAL FSI CONSUMPTION RATIO', 'Permissible Value': Number(areaMetrics.permissibleTotalFsi || 0).toFixed(3) },
      { 'Sr.': 'G', Particulars: `Ancillary FSI (${statement.building_use === 'COMMERCIAL' ? '80%' : '60%'})`, 'Permissible Value': areaMetrics.permissibleAncillaryResSqm },
      { 'Sr.': 'H', Particulars: 'TOTAL PERMISSIBLE P-LINE AREA (E + G)', 'Permissible Value': areaMetrics.permissiblePlineTotalSqm }
    ];

    const proposedRows = [
      { 'Sr.': '1', Particulars: 'Area of Plot', 'Proposed Value': '—' },
      { 'Sr.': '2', Particulars: 'D.P. Deductions', 'Proposed Value': '—' },
      { 'Sr.': '3', Particulars: 'Existing Built-up Area Deduction', 'Proposed Value': '—' },
      { 'Sr.': 'A', Particulars: 'Plotable Area (Net Development Plot)', 'Proposed Value': areaMetrics.plotableAreaSqm },
      { 'Sr.': 'B', Particulars: `Basic Proposed FSI (${statement.basic_fsi_factor || 1.1})`, 'Proposed Value': areaMetrics.proposedBasicFsiSqm },
      { 'Sr.': 'C', Particulars: `Paid Proposed FSI (${statement.paid_fsi_factor || 0.5})`, 'Proposed Value': areaMetrics.proposedPaidFsiSqm },
      { 'Sr.': 'D1', Particulars: `Regular TDR (${statement.regular_tdr_factor || 0})`, 'Proposed Value': areaMetrics.regularTdrSqm || 0 },
      { 'Sr.': 'D2', Particulars: `Slum TDR (${statement.slum_tdr_factor || 0})`, 'Proposed Value': areaMetrics.slumTdrSqm || 0 },
      { 'Sr.': 'E', Particulars: 'Total Builtup Area (B + C + D)', 'Proposed Value': areaMetrics.proposedTotalBuiltupSqm },
      { 'Sr.': 'F', Particulars: 'TOTAL FSI CONSUMPTION RATIO', 'Proposed Value': Number(areaMetrics.proposedTotalFsi || 0).toFixed(3) },
      { 'Sr.': 'G', Particulars: `Ancillary FSI (${statement.building_use === 'COMMERCIAL' ? '80%' : '60%'})`, 'Proposed Value': areaMetrics.proposedAncillaryResSqm },
      { 'Sr.': 'H', Particulars: 'TOTAL PROPOSED P-LINE AREA (E + G)', 'Proposed Value': areaMetrics.proposedPlineTotalSqm }
    ];

    const floorRows = floors.map((f) => {
      const isParking = ['parking', 'BASEMENT_1', 'BASEMENT_2', 'STILT', 'UPPER_PARKING'].includes(f.floor_type?.toUpperCase?.() || f.floor_type);
      const isTerrace = f.floor_type === 'terrace';
      const isHabitable = !isParking && !isTerrace;
      const u = f.usage_type || (statement.building_use === 'Commercial' ? 'Commercial' : (isParking ? 'Parking' : isTerrace ? 'Terrace' : 'Residential'));
      const units = parseInt(f.no_of_units, 10) || 0;
      const sale = parseFloat(f.builtup_for_sale_sqm) || 0;

      return {
        '1. Floor Level': f.floor_name,
        '2. Building Use': u,
        '3. Height (m)': f.height_meters || 3.0,
        '4. Proposed FSI Area (sq m)': isHabitable ? parseFloat(f.fsi_area_sqm || 0) : 0,
        '5. Ancillary Area (sq m)': isHabitable ? parseFloat(f.ancillary_area_sqm || 0) : 0,
        '6. Proposed P-Line Area (sq m)': parseFloat(f.pline_area_sqm || 0),
        '7. Lobby Area (sq m)': parseFloat(f.lobby_area_sqm || 0),
        '8. Built-up for Sale (sq m)': isHabitable ? sale : 0,
        '9. No. Of Units': isHabitable ? units : 0,
        '10. Area For 1 Unit (sq m)': isHabitable ? (f.area_for_1_unit || (units > 0 ? (sale / units).toFixed(2) : '0.00')) : 0
      };
    });

    const finRows = [
      { Category: 'Total Statutory Demand (A)', 'Amount (Rs)': financialMetrics.totalStatutoryDemandA },
      { Category: 'Cost of TDR (B)', 'Amount (Rs)': financialMetrics.costOfTdrB },
      { Category: 'NOC & BPMS Expenses (C)', 'Amount (Rs)': financialMetrics.totalExpensesC },
      { Category: 'Civil Construction Cost (D)', 'Amount (Rs)': financialMetrics.costOfConstructionD },
      { Category: 'Basement Cost (E)', 'Amount (Rs)': financialMetrics.costOfBasementE },
      { Category: 'Rent during Construction (F)', 'Amount (Rs)': financialMetrics.rentCostF },
      { Category: 'Stacked Parking (G)', 'Amount (Rs)': financialMetrics.stackedParkingCostG },
      { Category: 'Plot Land Cost (H)', 'Amount (Rs)': financialMetrics.costOfPlotH },
      { Category: 'TOTAL PROJECT COST', 'Amount (Rs)': financialMetrics.totalProjectCost },
      { Category: 'TOTAL ESTIMATED RECEIPTS', 'Amount (Rs)': financialMetrics.totalReceipts },
      { Category: 'NET PROJECT PROFIT', 'Amount (Rs)': financialMetrics.netProfit }
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(permissibleRows), 'Permissible Statement');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(proposedRows), 'Proposed Statement');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(floorRows), 'Floor Breakdown');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(finRows), 'Financial Viability');

    XLSX.writeFile(wb, `DS16_Feasibility_${project?.name || 'Statement'}.xlsx`);
    toast.success('Feasibility workbook exported to Excel');
  };

  // Export to PDF (multi-page A4 support for continuous vertical report)
  const handleExportPDF = async () => {
    setExporting(true);
    try {
      const element = document.getElementById('feasibility-document-canvas');
      if (!element) {
        toast.error('Unable to locate document canvas');
        return;
      }

      const canvas = await html2canvas(element, { scale: 2 });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imgHeight = (canvas.height * pdfWidth) / canvas.width;

      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeight);
      heightLeft -= pageHeight;

      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      pdf.save(`DS16_Feasibility_Report_${project?.name || 'Report'}.pdf`);
      toast.success('Feasibility report exported to PDF');
    } catch (err) {
      console.error('PDF export error:', err);
      toast.error('Failed to export PDF');
    } finally {
      setExporting(false);
    }
  };

  const scrollToSection = (sectionId) => {
    setActiveNav(sectionId);
    const el = document.getElementById(sectionId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-12 w-full rounded-xl" />
        <div className="skeleton h-96 rounded-xl" />
      </div>
    );
  }

  const isSqft = unitDisplay === 'sq_ft';
  const unitFactor = isSqft ? 10.764 : 1;
  const unitLabel = isSqft ? 'sq ft' : 'sq m';

  const navItems = [
    { id: 'section-area-statement', label: 'Area Statement', icon: Layers },
    { id: 'section-financial-viability', label: 'Financial Viability', icon: Calculator },
    { id: 'section-project-summary', label: 'Project Summary', icon: BarChart3 },
    { id: 'section-report-preview', label: 'Report Preview', icon: FileText }
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Compact Sticky Section Navigation & Save Toolbar */}
      <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm border border-slate-200 rounded-xl shadow-sm p-2.5 sm:px-4 sm:py-2.5 flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
        {/* Section Jump Links */}
        <nav aria-label="Feasibility sections" className="flex items-center gap-1.5 flex-wrap">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeNav === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => scrollToSection(item.id)}
                className={`px-2.5 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${
                  isActive
                    ? 'bg-[#E05A1E] text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Icon size={13} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Global Actions & Save */}
        <div className="flex items-center gap-2 flex-wrap justify-start lg:justify-end">
          <div className="flex items-center bg-slate-100 rounded-lg p-0.5 border border-slate-200 text-xs">
            <button
              type="button"
              onClick={() => setUnitDisplay('sq_m')}
              className={`px-2 py-1 rounded font-semibold transition-all ${
                unitDisplay === 'sq_m' ? 'bg-white text-[#E05A1E] shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Sq M (m²)
            </button>
            <button
              type="button"
              onClick={() => setUnitDisplay('sq_ft')}
              className={`px-2 py-1 rounded font-semibold transition-all ${
                unitDisplay === 'sq_ft' ? 'bg-white text-[#E05A1E] shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Sq Ft (ft²)
            </button>
          </div>

          <button
            type="button"
            onClick={handleCreateSnapshot}
            className="text-xs font-semibold px-2.5 py-1.5 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1.5"
            title="Snapshot calculation"
          >
            <Camera size={13} className="text-[#E05A1E]" />
            <span>Snapshot</span>
          </button>

          <button
            type="button"
            onClick={handleExportExcel}
            className="text-xs font-semibold px-2.5 py-1.5 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1.5"
            title="Export Excel"
          >
            <FileSpreadsheet size={13} className="text-emerald-600" />
            <span>Excel</span>
          </button>

          <button
            type="button"
            onClick={handleExportPDF}
            disabled={exporting}
            className="text-xs font-semibold px-2.5 py-1.5 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1.5"
            title="Export PDF"
          >
            <Download size={13} className="text-red-600" />
            <span>{exporting ? 'Generating...' : 'PDF'}</span>
          </button>

          {isPrivileged && (
            <button
              type="button"
              onClick={handleSaveAll}
              disabled={saving}
              className="btn-primary text-xs py-1.5 px-3.5"
            >
              <Save size={13} />
              <span>{saving ? 'Saving...' : 'Save Feasibility'}</span>
            </button>
          )}
        </div>
      </div>

      {/* ===================================================================== */}
      {/* SECTION A — AREA STATEMENT FORM                                       */}
      {/* ===================================================================== */}
      <section id="section-area-statement" className="scroll-mt-24 bg-white border border-slate-200 rounded-xl p-4 sm:p-6 shadow-soft-sm space-y-5">
        <div className="border-b border-slate-200 pb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wide flex items-center gap-2">
              <Layers size={16} className="text-[#E05A1E]" />
              Section A — Area Statement
            </h2>
            <p className="text-xs text-muted mt-0.5">
              Plot baseline, regulatory FSI &amp; TDR factors, building structure, and floor-wise P-Line distribution.
            </p>
          </div>
          <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200 flex items-center gap-1">
            <Sparkles size={12} /> Live Auto-Calculate
          </span>
        </div>

        <AreaStatementForm
          statement={statement}
          floors={floors}
          areaMetrics={areaMetrics}
          onUpdateStatement={handleUpdateStatement}
          onUpdateFloor={handleUpdateFloor}
          onReconcileFloors={handleReconcileFloors}
          unitDisplay={unitDisplay}
          isPrivileged={isPrivileged}
        />
      </section>

      {/* ===================================================================== */}
      {/* SECTION B — FINANCIAL VIABILITY FORM                                  */}
      {/* ===================================================================== */}
      <section id="section-financial-viability" className="scroll-mt-24 bg-white border border-slate-200 rounded-xl p-4 sm:p-6 shadow-soft-sm space-y-5">
        <div className="border-b border-slate-200 pb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wide flex items-center gap-2">
              <Calculator size={16} className="text-[#E05A1E]" />
              Section B — Financial Viability
            </h2>
            <p className="text-xs text-muted mt-0.5">
              Ready Reckoner assumptions, statutory cost norms, construction costs, floor-wise sales realisation, and NMC statutory charges.
            </p>
          </div>
          <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200 flex items-center gap-1">
            <Sparkles size={12} /> Synced with Area Statement
          </span>
        </div>

        <FinancialViabilityForm
          financial={financial}
          statement={statement}
          floors={floors}
          statutoryCharges={statutoryCharges}
          salableUnits={salableUnits}
          areaMetrics={areaMetrics}
          financialMetrics={financialMetrics}
          onUpdateFinancial={handleUpdateFinancial}
          onUpdateFloor={handleUpdateFloor}
          onUpdateStatutoryCharge={handleUpdateStatutoryCharge}
          onSaveOverride={handleSaveFinancialOverride}
          onResetOverride={handleResetFinancialOverride}
          unitDisplay={unitDisplay}
          isPrivileged={isPrivileged}
        />
      </section>

      {/* ===================================================================== */}
      {/* SECTION C — CONSOLIDATED PROJECT SUMMARY                              */}
      {/* ===================================================================== */}
      <section id="section-project-summary" className="scroll-mt-24 bg-slate-900 text-white rounded-xl p-5 sm:p-6 shadow-md space-y-5">
        <div className="border-b border-slate-800 pb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-extrabold uppercase tracking-wide text-orange-400 flex items-center gap-2">
              <BarChart3 size={16} />
              Section C — Consolidated Project Summary
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Authoritative area potential, development cost, and profitability snapshot.
            </p>
          </div>
          <span className="text-[11px] font-mono text-slate-300 bg-slate-800 px-2.5 py-1 rounded border border-slate-700">
            Unit Basis: {unitLabel}
          </span>
        </div>

        {/* Area & FSI Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="bg-slate-800/90 p-3.5 rounded-lg border border-slate-700">
            <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block">Plot Area</span>
            <span className="font-mono text-base font-extrabold text-white mt-1 block">
              {formatNum((parseFloat(statement.plot_area_sqm) || areaMetrics.plotAreaSqm || 0) * unitFactor)}
            </span>
            <span className="text-[10px] text-slate-400">{unitLabel}</span>
          </div>

          <div className="bg-slate-800/90 p-3.5 rounded-lg border border-slate-700">
            <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block">Permissible P-Line</span>
            <span className="font-mono text-base font-extrabold text-emerald-400 mt-1 block">
              {formatNum((areaMetrics.permissiblePlineTotalSqm || 0) * unitFactor)}
            </span>
            <span className="text-[10px] text-slate-400">{unitLabel}</span>
          </div>

          <div className="bg-slate-800/90 p-3.5 rounded-lg border border-slate-700">
            <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block">Proposed P-Line</span>
            <span className="font-mono text-base font-extrabold text-orange-400 mt-1 block">
              {formatNum((areaMetrics.effectiveProposedPlineSqm || areaMetrics.totalProposedPlineSqm || areaMetrics.proposedPlineTotalSqm || 0) * unitFactor)}
            </span>
            <span className="text-[10px] text-slate-400">{unitLabel}</span>
          </div>

          <div className="bg-slate-800/90 p-3.5 rounded-lg border border-slate-700">
            <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block">Total Ancillary Area</span>
            <span className="font-mono text-base font-extrabold text-slate-100 mt-1 block">
              {formatNum((areaMetrics.totalProposedAncillarySqm || areaMetrics.proposedAncillaryResSqm || 0) * unitFactor)}
            </span>
            <span className="text-[10px] text-slate-400">{unitLabel}</span>
          </div>

          <div className="bg-slate-800/90 p-3.5 rounded-lg border border-slate-700">
            <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block">FSI Potential / Used</span>
            <span className="font-mono text-base font-extrabold text-slate-100 mt-1 block">
              {formatNum(areaMetrics.permissibleTotalFsi || 0, 2)} / {formatNum(areaMetrics.proposedTotalFsi || 0, 2)}
            </span>
            <span className="text-[10px] text-slate-400">FSI Ratio</span>
          </div>

          <div className="bg-slate-800/90 p-3.5 rounded-lg border border-slate-700">
            <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block">Total Units</span>
            <span className="font-mono text-base font-extrabold text-white mt-1 block">
              {areaMetrics.totalUnitsCount || 0}
            </span>
            <span className="text-[10px] text-slate-400">Saleable Units</span>
          </div>
        </div>

        {/* Financial Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="bg-slate-800/90 p-3.5 rounded-lg border border-slate-700">
            <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block">Total Statutory Demand</span>
            <span className="font-mono text-sm font-extrabold text-slate-100 mt-1 block">
              {formatINR(financialMetrics.totalStatutoryDemandA)}
            </span>
          </div>

          <div className="bg-slate-800/90 p-3.5 rounded-lg border border-slate-700">
            <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block">Total Project Cost</span>
            <span className="font-mono text-sm font-extrabold text-slate-100 mt-1 block">
              {formatINR(financialMetrics.totalProjectCost)}
            </span>
          </div>

          <div className="bg-slate-800/90 p-3.5 rounded-lg border border-slate-700">
            <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block">Expected Receipts</span>
            <span className="font-mono text-sm font-extrabold text-emerald-400 mt-1 block">
              {formatINR(financialMetrics.totalReceipts)}
            </span>
          </div>

          <div className="bg-slate-800/90 p-3.5 rounded-lg border border-slate-700">
            <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block">Projected Profit</span>
            <span className={`font-mono text-sm font-extrabold mt-1 block ${(financialMetrics.netProfit || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {formatINR(financialMetrics.netProfit)}
            </span>
          </div>

          <div className="bg-slate-800/90 p-3.5 rounded-lg border border-slate-700">
            <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block">ROI / Profit Margin</span>
            <span className="font-mono text-sm font-extrabold text-orange-400 mt-1 block">
              {formatNum(financialMetrics.roiPct || 0, 1)}% / {formatNum(financialMetrics.profitMarginPct || 0, 1)}%
            </span>
          </div>
        </div>
      </section>

      {/* ===================================================================== */}
      {/* SECTION D — FULL-WIDTH REPORT PREVIEW                                 */}
      {/* ===================================================================== */}
      <section id="section-report-preview" className="scroll-mt-24 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          <div>
            <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wide flex items-center gap-2">
              <FileText size={16} className="text-[#E05A1E]" />
              Section D — Full-Width Formatted Report Preview
            </h2>
            <p className="text-xs text-muted mt-0.5">
              Complete printable Area Statement and Financial Viability report updated live from the inputs above.
            </p>
          </div>
        </div>

        <FeasibilityDocumentPreview
          project={project}
          statement={statement}
          floors={floors}
          financial={financial}
          statutoryCharges={statutoryCharges}
          salableUnits={salableUnits}
          areaMetrics={areaMetrics}
          financialMetrics={financialMetrics}
          unitDisplay={unitDisplay}
        />
      </section>
    </div>
  );
}
