// client/src/components/projects/feasibility/AreaFeasibilityTab.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Calculator,
  FileSpreadsheet,
  Download,
  Save,
  Camera,
  Layers,
  Sparkles,
  BarChart3,
  FileText,
  ArrowRight,
  TrendingUp,
  Coins,
  Building2,
  CheckCircle2
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
  const [searchParams, setSearchParams] = useSearchParams();

  const VALID_SUB_TABS = ['area-statement', 'financial-viability', 'project-summary', 'report-preview'];
  const normalizeTab = (raw) => {
    if (!raw) return 'area-statement';
    if (raw === 'section-area-statement') return 'area-statement';
    if (raw === 'section-financial-viability') return 'financial-viability';
    if (raw === 'section-project-summary') return 'project-summary';
    if (raw === 'section-report-preview') return 'report-preview';
    return VALID_SUB_TABS.includes(raw) ? raw : 'area-statement';
  };

  const [activeSubTab, setActiveSubTab] = useState(() => {
    return normalizeTab(searchParams.get('subtab') || searchParams.get('feasibilityTab'));
  });

  const [unitDisplay, setUnitDisplay] = useState('sq_m'); // 'sq_m' or 'sq_ft'

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

  // Sync state if URL query param changes (e.g. browser back/forward)
  useEffect(() => {
    const currentParam = normalizeTab(searchParams.get('subtab') || searchParams.get('feasibilityTab'));
    if (currentParam !== activeSubTab) {
      setActiveSubTab(currentParam);
    }
  }, [searchParams]);

  // Ensure valid sub-tab when projectId changes
  useEffect(() => {
    const currentParam = searchParams.get('subtab');
    if (currentParam && !VALID_SUB_TABS.includes(currentParam)) {
      setActiveSubTab('area-statement');
    }
  }, [projectId]);

  const handleSubTabChange = (tabId) => {
    setActiveSubTab(tabId);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('subtab', tabId);
      return next;
    }, { replace: true });
  };

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
      if (activeSubTab !== 'report-preview') {
        handleSubTabChange('report-preview');
        // Wait a frame for DOM to mount FeasibilityDocumentPreview
        await new Promise((resolve) => setTimeout(resolve, 350));
      }

      const element = document.getElementById('feasibility-document-canvas');
      if (!element) {
        toast.error('Unable to locate document canvas for PDF export');
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

  const SUB_TABS = [
    { id: 'area-statement', label: 'Area Statement', icon: Layers },
    { id: 'financial-viability', label: 'Financial Viability', icon: Calculator },
    { id: 'project-summary', label: 'Project Summary', icon: BarChart3 },
    { id: 'report-preview', label: 'Report Preview', icon: FileText }
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* ===================================================================== */}
      {/* INDEPENDENT SUB-TAB NAVIGATION & GLOBAL ACTION TOOLBAR                */}
      {/* ===================================================================== */}
      <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm border border-slate-200 rounded-xl shadow-sm p-2 sm:p-2.5 flex flex-col xl:flex-row xl:items-center justify-between gap-2.5">
        {/* 4 Independent Sub-tabs */}
        <nav aria-label="Feasibility Sub-tabs" className="flex items-center gap-1 sm:gap-1.5 overflow-x-auto no-scrollbar max-w-full py-0.5">
          {SUB_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeSubTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => handleSubTabChange(tab.id)}
                className={`px-3 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-2 whitespace-nowrap flex-shrink-0 ${
                  isActive
                    ? 'bg-[#E05A1E] text-white shadow-sm ring-1 ring-[#E05A1E]'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Icon size={14} className={isActive ? 'text-white' : 'text-slate-500'} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Global Controls & Actions */}
        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap justify-between sm:justify-end">
          {/* Unit Toggle */}
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
            <span className="hidden sm:inline">Snapshot</span>
          </button>

          <button
            type="button"
            onClick={handleExportExcel}
            className="text-xs font-semibold px-2.5 py-1.5 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1.5"
            title="Export Excel"
          >
            <FileSpreadsheet size={13} className="text-emerald-600" />
            <span className="hidden sm:inline">Excel</span>
          </button>

          <button
            type="button"
            onClick={handleExportPDF}
            disabled={exporting}
            className="text-xs font-semibold px-2.5 py-1.5 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1.5"
            title="Export PDF"
          >
            <Download size={13} className="text-red-600" />
            <span className="hidden sm:inline">{exporting ? 'Generating...' : 'PDF'}</span>
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
      {/* 1. AREA STATEMENT SUB-TAB PAGE                                        */}
      {/* ===================================================================== */}
      {activeSubTab === 'area-statement' && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 shadow-soft-sm space-y-5 animate-in fade-in duration-200">
          <div className="border-b border-slate-200 pb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wide flex items-center gap-2">
                <Layers size={16} className="text-[#E05A1E]" />
                Area Statement
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
        </div>
      )}

      {/* ===================================================================== */}
      {/* 2. FINANCIAL VIABILITY SUB-TAB PAGE                                   */}
      {/* ===================================================================== */}
      {activeSubTab === 'financial-viability' && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6 shadow-soft-sm space-y-5 animate-in fade-in duration-200">
          <div className="border-b border-slate-200 pb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wide flex items-center gap-2">
                <Calculator size={16} className="text-[#E05A1E]" />
                Financial Viability
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
        </div>
      )}

      {/* ===================================================================== */}
      {/* 3. CONSOLIDATED PROJECT SUMMARY SUB-TAB PAGE                          */}
      {/* ===================================================================== */}
      {activeSubTab === 'project-summary' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Header Banner */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-soft-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wide flex items-center gap-2">
                <BarChart3 size={16} className="text-[#E05A1E]" />
                Consolidated Project Summary
              </h2>
              <p className="text-xs text-muted mt-0.5">
                Authoritative executive overview of development potential, total project costs, and projected returns.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono text-slate-700 bg-slate-100 px-2.5 py-1 rounded border border-slate-200">
                Unit Basis: {unitLabel}
              </span>
              <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded border border-emerald-200">
                {statement.building_use || 'Residential'}
              </span>
            </div>
          </div>

          {/* Primary Executive KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-soft-sm">
              <div className="flex items-center justify-between text-slate-500 mb-1">
                <span className="text-[11px] font-bold uppercase tracking-wider">Permissible Builtup</span>
                <Building2 size={16} className="text-slate-400" />
              </div>
              <div className="font-mono text-xl font-black text-slate-900">
                {formatNum((areaMetrics.permissibleTotalBuiltupSqm || 0) * unitFactor)} <span className="text-xs font-normal text-slate-500">{unitLabel}</span>
              </div>
              <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
                <span>Total P-Line Potential:</span>
                <span className="font-bold text-slate-700">{formatNum((areaMetrics.permissiblePlineTotalSqm || 0) * unitFactor)} {unitLabel}</span>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-soft-sm">
              <div className="flex items-center justify-between text-slate-500 mb-1">
                <span className="text-[11px] font-bold uppercase tracking-wider">Proposed P-Line</span>
                <Layers size={16} className="text-[#E05A1E]" />
              </div>
              <div className="font-mono text-xl font-black text-[#E05A1E]">
                {formatNum((areaMetrics.effectiveProposedPlineSqm || areaMetrics.totalProposedPlineSqm || areaMetrics.proposedPlineTotalSqm || 0) * unitFactor)} <span className="text-xs font-normal text-slate-500">{unitLabel}</span>
              </div>
              <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
                <span>FSI Consumption:</span>
                <span className="font-bold text-slate-700">{formatNum(areaMetrics.proposedTotalFsi || 0, 2)} (Max: {formatNum(areaMetrics.permissibleTotalFsi || 0, 2)})</span>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-soft-sm">
              <div className="flex items-center justify-between text-slate-500 mb-1">
                <span className="text-[11px] font-bold uppercase tracking-wider">Total Project Cost</span>
                <Coins size={16} className="text-slate-400" />
              </div>
              <div className="font-mono text-xl font-black text-slate-900">
                {formatINR(financialMetrics.totalProjectCost)}
              </div>
              <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
                <span>Statutory Demand:</span>
                <span className="font-bold text-slate-700">{formatINR(financialMetrics.totalStatutoryDemandA)}</span>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-soft-sm">
              <div className="flex items-center justify-between text-slate-500 mb-1">
                <span className="text-[11px] font-bold uppercase tracking-wider">Projected Profit &amp; ROI</span>
                <TrendingUp size={16} className={(financialMetrics.netProfit || 0) >= 0 ? 'text-emerald-500' : 'text-red-500'} />
              </div>
              <div className={`font-mono text-xl font-black ${(financialMetrics.netProfit || 0) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {formatINR(financialMetrics.netProfit)}
              </div>
              <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
                <span>ROI / Margin:</span>
                <span className="font-bold text-emerald-700">{formatNum(financialMetrics.roiPct || 0, 1)}% / {formatNum(financialMetrics.profitMarginPct || 0, 1)}%</span>
              </div>
            </div>
          </div>

          {/* Detailed Dual Breakdown Panels */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left: Area Potential & Consumption Breakdown */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-soft-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                  <Layers size={14} className="text-[#E05A1E]" />
                  Area Statement Breakdown
                </h3>
                <button
                  type="button"
                  onClick={() => handleSubTabChange('area-statement')}
                  className="text-xs font-semibold text-[#E05A1E] hover:underline flex items-center gap-1"
                >
                  Edit Inputs <ArrowRight size={12} />
                </button>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-600">Plot Area</span>
                  <span className="font-mono font-bold text-slate-900">{formatNum((parseFloat(statement.plot_area_sqm) || 0) * unitFactor)} {unitLabel}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-600">Net Plotable Area</span>
                  <span className="font-mono font-bold text-slate-900">{formatNum((areaMetrics.plotableAreaSqm || 0) * unitFactor)} {unitLabel}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-600">Basic Permissible FSI Area</span>
                  <span className="font-mono font-bold text-slate-900">{formatNum((areaMetrics.permissibleFsiSqm || 0) * unitFactor)} {unitLabel}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-600">Paid FSI Area</span>
                  <span className="font-mono font-bold text-slate-900">{formatNum((areaMetrics.permissiblePaidFsiSqm || 0) * unitFactor)} {unitLabel}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-600">Regular TDR Area</span>
                  <span className="font-mono font-bold text-slate-900">{formatNum((areaMetrics.permissibleRegularTdrSqm || 0) * unitFactor)} {unitLabel}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-600">Slum TDR Area</span>
                  <span className="font-mono font-bold text-slate-900">{formatNum((areaMetrics.permissibleSlumTdrSqm || 0) * unitFactor)} {unitLabel}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-600">Total Built-up Area</span>
                  <span className="font-mono font-bold text-slate-900">{formatNum((areaMetrics.proposedTotalBuiltupSqm || 0) * unitFactor)} {unitLabel}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-600">Ancillary FSI Area</span>
                  <span className="font-mono font-bold text-slate-900">{formatNum((areaMetrics.totalProposedAncillarySqm || 0) * unitFactor)} {unitLabel}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100 bg-orange-50/50 px-2 rounded font-bold">
                  <span className="text-slate-800">Total Proposed P-Line</span>
                  <span className="font-mono text-[#E05A1E]">{formatNum((areaMetrics.effectiveProposedPlineSqm || areaMetrics.totalProposedPlineSqm || 0) * unitFactor)} {unitLabel}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-600">Total Saleable Area</span>
                  <span className="font-mono font-bold text-slate-900">{formatNum((areaMetrics.totalBuiltupForSaleSqm || 0) * unitFactor)} {unitLabel}</span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-slate-600">Total Configured Units</span>
                  <span className="font-mono font-bold text-slate-900">{areaMetrics.totalUnitsCount || 0} Units</span>
                </div>
              </div>
            </div>

            {/* Right: Financial Cost & Revenue Breakdown */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-soft-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                  <Calculator size={14} className="text-[#E05A1E]" />
                  Financial Viability Breakdown
                </h3>
                <button
                  type="button"
                  onClick={() => handleSubTabChange('financial-viability')}
                  className="text-xs font-semibold text-[#E05A1E] hover:underline flex items-center gap-1"
                >
                  Edit Assumptions <ArrowRight size={12} />
                </button>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-600">Total Statutory Demand (A)</span>
                  <span className="font-mono font-bold text-slate-900">{formatINR(financialMetrics.totalStatutoryDemandA)}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-600">Cost of TDR Purchase (B)</span>
                  <span className="font-mono font-bold text-slate-900">{formatINR(financialMetrics.costOfTdrB)}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-600">BPMS &amp; NOC Expenses (C)</span>
                  <span className="font-mono font-bold text-slate-900">{formatINR(financialMetrics.totalExpensesC)}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-600">Civil Construction Cost (D)</span>
                  <span className="font-mono font-bold text-slate-900">{formatINR(financialMetrics.costOfConstructionD)}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-600">Basement Construction (E)</span>
                  <span className="font-mono font-bold text-slate-900">{formatINR(financialMetrics.costOfBasementE)}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-600">Rent during Construction (F)</span>
                  <span className="font-mono font-bold text-slate-900">{formatINR(financialMetrics.rentCostF)}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-600">Stacked Parking Cost (G)</span>
                  <span className="font-mono font-bold text-slate-900">{formatINR(financialMetrics.stackedParkingCostG)}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-600">Plot Land Cost (H)</span>
                  <span className="font-mono font-bold text-slate-900">{formatINR(financialMetrics.costOfPlotH)}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100 bg-slate-50 px-2 rounded font-bold">
                  <span className="text-slate-900">Total Project Cost</span>
                  <span className="font-mono text-slate-900">{formatINR(financialMetrics.totalProjectCost)}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100 bg-emerald-50/50 px-2 rounded font-bold">
                  <span className="text-emerald-800">Total Estimated Receipts</span>
                  <span className="font-mono text-emerald-700">{formatINR(financialMetrics.totalReceipts)}</span>
                </div>
                <div className="flex justify-between py-1.5 bg-orange-50/50 px-2 rounded font-black">
                  <span className="text-slate-900">Net Project Profit</span>
                  <span className={`font-mono ${(financialMetrics.netProfit || 0) >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                    {formatINR(financialMetrics.netProfit)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Actions Footer */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-soft-sm flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-muted flex items-center gap-2">
              <CheckCircle2 size={15} className="text-emerald-600" />
              <span>Consolidated summary synchronized with Area Statement and Financial Viability models.</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleExportExcel}
                className="text-xs font-semibold px-3 py-1.5 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1.5"
              >
                <FileSpreadsheet size={13} className="text-emerald-600" />
                <span>Export Workbook</span>
              </button>
              <button
                type="button"
                onClick={() => handleSubTabChange('report-preview')}
                className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5"
              >
                <FileText size={13} />
                <span>Open Full Report Preview</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* 4. FULL-WIDTH REPORT PREVIEW SUB-TAB PAGE                             */}
      {/* ===================================================================== */}
      {activeSubTab === 'report-preview' && (
        <div className="space-y-4 animate-in fade-in duration-200">
          <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-soft-sm flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wide flex items-center gap-2">
                <FileText size={16} className="text-[#E05A1E]" />
                Full-Width Report Preview
              </h2>
              <p className="text-xs text-muted mt-0.5">
                Complete printable Area Statement and Financial Viability document preview, updated live from project inputs.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleExportPDF}
                disabled={exporting}
                className="text-xs font-bold px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors flex items-center gap-1.5 shadow-sm"
              >
                <Download size={13} />
                <span>{exporting ? 'Generating PDF...' : 'Download PDF Report'}</span>
              </button>
              <button
                type="button"
                onClick={handleExportExcel}
                className="text-xs font-bold px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors flex items-center gap-1.5 shadow-sm"
              >
                <FileSpreadsheet size={13} />
                <span>Export Excel</span>
              </button>
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
        </div>
      )}
    </div>
  );
}
