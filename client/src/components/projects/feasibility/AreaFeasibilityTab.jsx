// client/src/components/projects/feasibility/AreaFeasibilityTab.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { Calculator, FileSpreadsheet, Download, Save, Camera, Layers, Eye, Smartphone, RefreshCw, Sparkles, Shield } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../../api/client';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

import AreaStatementForm from './AreaStatementForm';
import FinancialViabilityForm from './FinancialViabilityForm';
import FeasibilityDocumentPreview from './FeasibilityDocumentPreview';

export default function AreaFeasibilityTab({ projectId, user, isAdmin, isAccounts, isPrivileged }) {
  const [activeSubSection, setActiveSubSection] = useState('area'); // 'area', 'financial', 'snapshots'
  const [unitDisplay, setUnitDisplay] = useState('sq_m'); // 'sq_m' or 'sq_ft'
  const [mobileView, setMobileView] = useState('both'); // 'form', 'preview', 'both'

  const [project, setProject] = useState(null);
  const [statement, setStatement] = useState({});
  const [floors, setFloors] = useState([]);
  const [financial, setFinancial] = useState({});
  const [statutoryCharges, setStatutoryCharges] = useState([]);
  const [salableUnits, setSalableUnits] = useState([]);
  const [areaMetrics, setAreaMetrics] = useState({});
  const [financialMetrics, setFinancialMetrics] = useState({});
  const [snapshots, setSnapshots] = useState([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [isAddingFloor, setIsAddingFloor] = useState(false);

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

    // Fast client-side mirror
    const plot = parseFloat(s.plot_area_sqm) || 0;
    const dp = parseFloat(s.dp_deductions_sqm) || 0;
    const plotable = Math.max(0, plot - dp);

    const basicFsi = plotable * (parseFloat(s.basic_fsi_factor) || 1.1);
    const paidFsi = plotable * (parseFloat(s.paid_fsi_factor) || 0.5);

    const regTdrFactor = parseFloat(s.regular_tdr_factor) || 0;
    const slumTdrFactor = parseFloat(s.slum_tdr_factor) || 0;
    const regTdr = plotable * regTdrFactor;
    const slumTdr = plotable * slumTdrFactor;
    const totalTdr = regTdr + slumTdr;

    const totalBuiltup = basicFsi + paidFsi + totalTdr;
    const ancillaryPct = s.building_use === 'COMMERCIAL'
      ? 0.8
      : (parseFloat(s.ancillary_residential_pct) || 0.6);
    const ancillary = totalBuiltup * ancillaryPct;
    const proposedPline = totalBuiltup + ancillary;

    let floorPlineSum = 0;
    let floorLobbySum = 0;
    let floorOwnersSum = 0;
    let floorSaleSum = 0;
    let floorHeightSum = 0;

    f.forEach((fl, idx) => {
      const p = parseFloat(fl.pline_area_sqm) || 0;
      const l = parseFloat(fl.lobby_area_sqm) || 0;
      const h = parseFloat(fl.height_meters) || 0;
      const o = parseFloat(fl.builtup_for_owners_sqm) !== undefined && !isNaN(parseFloat(fl.builtup_for_owners_sqm))
        ? parseFloat(fl.builtup_for_owners_sqm)
        : (idx === 0 ? 0 : Math.max(0, p - l));
      const sa = parseFloat(fl.builtup_for_sale_sqm) || 0;

      floorPlineSum += p;
      floorLobbySum += l;
      floorOwnersSum += o;
      floorSaleSum += sa;
      floorHeightSum += h;
    });

    const divFactor = parseFloat(s.dividing_factor) || 1.6;
    const baseDiv = divFactor > 0 ? (floorPlineSum / divFactor) : 0;
    const derivedAnc = Math.max(0, floorPlineSum - baseDiv);
    const paidReq = Math.max(0, baseDiv - basicFsi - (plotable * 0.3));

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
      proposedTdrSqm: totalTdr,
      proposedTotalBuiltupSqm: totalBuiltup,
      proposedAncillaryResSqm: ancillary,
      proposedPlineTotalSqm: proposedPline,
      totalProposedPlineSqm: floorPlineSum,
      totalLobbyAreaSqm: floorLobbySum,
      totalBuiltupForOwnersSqm: floorOwnersSum,
      totalBuiltupForSaleSqm: floorSaleSum,
      totalHeightMeters: floorHeightSum,
      baseDividingFactorSqm: baseDiv,
      derivedAncillaryAreaSqm: derivedAnc,
      paidFsiRequiredSqm: paidReq
    };
    setAreaMetrics(updatedArea);

    // Live financial recalculation
    const rr = parseFloat(fin.rr_rate_per_sqm) || 0;
    const effectivePline = floorPlineSum > 0 ? floorPlineSum : proposedPline;
    const constRate = parseFloat(fin.cost_of_construction_rate) || parseFloat(fin.estimated_cost_b_rate) || 0;
    const costConst = effectivePline * constRate;
    const costTdr = totalTdr * (parseFloat(fin.tdr_purchase_factor) || 0.55) * rr;
    const plotCost = parseFloat(fin.cost_of_plot) || (plotable * (parseFloat(fin.cost_of_plot_rate_per_sqm) || 0));
    const basementCost = (parseFloat(fin.basement_area_sqm) || 0) * (parseFloat(fin.basement_rate_per_sqm) || 0);
    const rentCost = (parseInt(fin.rent_tenements, 10) || 0) * (parseFloat(fin.rent_per_tenement_per_month) || 0) * (parseInt(fin.rent_months, 10) || 0);
    const parkingCost = (parseInt(fin.stacked_parking_slots, 10) || 0) * (parseFloat(fin.stacked_parking_cost_per_slot) || 0);
    const minorNoc = (parseFloat(fin.minor_expenses) || 0) + (parseFloat(fin.bpms_staff_charges) || 0) + (parseFloat(fin.airport_noc) || 0) + (parseFloat(fin.fire_noc) || 0) + (parseFloat(fin.entertainment_charges) || 0);

    let statSum = 0;
    scList.forEach(sc => {
      if (sc.is_enabled !== false && !sc.is_deleted && sc.charge_name !== 'AMALGAMATION') {
        statSum += parseFloat(sc.calculated_amount ?? sc.amount) || 0;
      }
    });

    const totalCost = statSum + costTdr + minorNoc + costConst + basementCost + rentCost + parkingCost + plotCost;

    // Floor-wise receipts calculation
    let floorReceiptsSum = 0;
    f.forEach(fl => {
      const sale = parseFloat(fl.builtup_for_sale_sqm) || 0;
      const rate = parseFloat(fl.rate_per_sqm) || 0;
      const units = parseInt(fl.no_of_units, 10) || 0;
      const cost1Unit = parseFloat(fl.cost_for_1_unit) || (units > 0 ? (sale * rate) / units : 0);
      if (rate > 0 && sale > 0) {
        floorReceiptsSum += (sale * rate);
      } else if (cost1Unit > 0 && units > 0) {
        floorReceiptsSum += (cost1Unit * units);
      }
    });

    let receiptsSum = 0;
    if (floorReceiptsSum > 0) {
      receiptsSum = floorReceiptsSum;
    } else {
      u.forEach(un => {
        const c = parseFloat(un.carpet_area_sqm) || 0;
        const sup = (c * 10.764) + (parseFloat(un.super_buildup_loading_sqft) || 0);
        const pr = sup * (parseFloat(un.rate_per_sqft) || 0);
        receiptsSum += pr * (parseInt(un.unit_count, 10) || 1);
      });
    }

    const netProf = receiptsSum - totalCost;

    setFinancialMetrics(prev => ({
      ...prev,
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

  const handleAddFloor = async () => {
    if (isAddingFloor) return;
    setIsAddingFloor(true);
    try {
      const nextOrder = floors.length + 1;
      let defaultName = `Floor ${nextOrder}`;
      if (nextOrder === 1) defaultName = 'Ground Floor';
      else if (nextOrder === 2) defaultName = '1st Floor';
      else if (nextOrder === 3) defaultName = '2nd Floor';
      else if (nextOrder === 4) defaultName = '3rd Floor';
      else defaultName = `${nextOrder - 1}th Floor`;

      const res = await api.post(`/projects/${projectId}/feasibility/area/floors`, {
        floor_name: defaultName,
        floor_type: 'habitable',
        height_meters: 3.0,
        pline_area_sqm: 0,
        lobby_area_sqm: 0,
        builtup_for_owners_sqm: 0,
        builtup_for_sale_sqm: 0,
        no_of_units: 1,
        area_for_1_unit: 0,
        rate_per_sqm: parseFloat(financial.rr_rate_per_sqm) || 0,
        cost_for_1_unit: 0,
        is_lobby_overridden: false
      });
      const newFloors = [...floors, res.data.floor];
      setFloors(newFloors);
      recalculateLive(statement, newFloors, financial, salableUnits, statutoryCharges);
      toast.success(`${res.data.floor?.floor_name || 'Floor'} added`);
    } catch (err) {
      console.error('Error adding floor:', err);
      toast.error(err.response?.data?.error || 'Failed to add floor');
    } finally {
      setIsAddingFloor(false);
    }
  };

  const handleUpdateFloor = (id, updates) => {
    const newFloors = floors.map(f => f.id === id ? { ...f, ...updates } : f);
    setFloors(newFloors);
    recalculateLive(statement, newFloors, financial, salableUnits, statutoryCharges);
  };

  const handleDeleteFloor = async (id) => {
    try {
      await api.delete(`/projects/${projectId}/feasibility/area/floors/${id}`);
      const newFloors = floors.filter(f => f.id !== id);
      setFloors(newFloors);
      recalculateLive(statement, newFloors, financial, salableUnits, statutoryCharges);
      toast.success('Floor removed');
    } catch {
      toast.error('Failed to remove floor');
    }
  };

  const handleUpdateFinancial = (updates) => {
    const updated = { ...financial, ...updates };
    setFinancial(updated);
    recalculateLive(statement, floors, updated, salableUnits, statutoryCharges);
  };

  const handleUpdateStatutoryCharge = (id, updates) => {
    const newCharges = statutoryCharges.map(sc => {
      if (sc.id === id) {
        const updated = { ...sc, ...updates };
        if (updates.rr_percentage !== undefined) {
          const rr = parseFloat(financial.rr_rate_per_sqm) || 0;
          const pline = areaMetrics.totalProposedPlineSqm || areaMetrics.proposedPlineTotalSqm || 0;
          const pct = parseFloat(updates.rr_percentage) || 0;
          updated.calculated_amount = (pline * rr * (pct / 100));
          updated.amount = updated.calculated_amount;
        }
        return updated;
      }
      return sc;
    });
    setStatutoryCharges(newCharges);
    recalculateLive(statement, floors, financial, salableUnits, newCharges);
  };

  const handleArchiveStatutoryCharge = async (id) => {
    try {
      await api.delete(`/projects/${projectId}/feasibility/statutory/${id}`);
      const newCharges = statutoryCharges.map(sc => 
        sc.id === id ? { ...sc, is_deleted: true, is_enabled: false } : sc
      );
      setStatutoryCharges(newCharges);
      recalculateLive(statement, floors, financial, salableUnits, newCharges);
      toast.success('Statutory charge archived');
    } catch {
      toast.error('Failed to archive statutory charge');
    }
  };

  const handleAddSalableUnit = async () => {
    try {
      const res = await api.post(`/projects/${projectId}/feasibility/financial/salable-units`, {
        unit_name: `Unit Type ${String.fromCharCode(65 + salableUnits.length)}`,
        carpet_area_sqm: 0,
        super_buildup_loading_sqft: 0,
        unit_count: 1,
        rate_per_sqft: 0
      });
      const newUnits = [...salableUnits, res.data.unit];
      setSalableUnits(newUnits);
      recalculateLive(statement, floors, financial, newUnits, statutoryCharges);
      toast.success('Salable unit added');
    } catch {
      toast.error('Failed to add salable unit');
    }
  };

  const handleUpdateSalableUnit = (id, updates) => {
    const newUnits = salableUnits.map(u => u.id === id ? { ...u, ...updates } : u);
    setSalableUnits(newUnits);
    recalculateLive(statement, floors, financial, newUnits, statutoryCharges);
  };

  const handleDeleteSalableUnit = async (id) => {
    try {
      await api.delete(`/projects/${projectId}/feasibility/financial/salable-units/${id}`);
      const newUnits = salableUnits.filter(u => u.id !== id);
      setSalableUnits(newUnits);
      recalculateLive(statement, floors, financial, newUnits, statutoryCharges);
      toast.success('Salable unit removed');
    } catch {
      toast.error('Failed to remove salable unit');
    }
  };

  const handleSaveAll = async () => {
    setSaving(true);
    try {
      // 1. Save area statement
      await api.put(`/projects/${projectId}/feasibility/area`, {
        ...statement,
        unit_display: unitDisplay
      });
      // 2. Save floor updates
      for (const fl of floors) {
        if (fl.id) {
          await api.put(`/projects/${projectId}/feasibility/area/floors/${fl.id}`, fl);
        }
      }
      // 3. Save financial parameters
      await api.put(`/projects/${projectId}/feasibility/financial`, financial);
      // 4. Save statutory charge updates
      for (const sc of statutoryCharges) {
        if (sc.id && !sc.is_deleted) {
          await api.patch(`/projects/${projectId}/feasibility/statutory/${sc.id}`, {
            is_enabled: sc.is_enabled,
            rr_percentage: sc.rr_percentage,
            amount: sc.calculated_amount ?? sc.amount
          });
        }
      }
      // 5. Save salable unit updates
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
      setSnapshots(prev => [res.data.snapshot, ...prev]);
    } catch {
      toast.error('Failed to create snapshot');
    }
  };

  // Export to Excel Workbook
  const handleExportExcel = () => {
    // Table 1: Permissible Area Statement
    const permissibleRows = [
      { 'Sr.': '1', 'Particulars': 'Area of Plot', 'Permissible Value': statement.plot_area_sqm },
      { 'Sr.': '2', 'Particulars': 'D.P. Deductions', 'Permissible Value': statement.dp_deductions_sqm || 0 },
      { 'Sr.': '3', 'Particulars': 'Existing Built-up Area Deduction', 'Permissible Value': statement.existing_builtup_area_sqm || 0 },
      { 'Sr.': 'A', 'Particulars': 'Plotable Area (Net Development Plot)', 'Permissible Value': areaMetrics.plotableAreaSqm },
      { 'Sr.': 'B', 'Particulars': `Basic Permissible FSI (${statement.basic_fsi_factor || 1.1})`, 'Permissible Value': areaMetrics.permissibleFsiSqm },
      { 'Sr.': 'C', 'Particulars': `Paid FSI (${statement.paid_fsi_factor || 0.5})`, 'Permissible Value': areaMetrics.permissiblePaidFsiSqm },
      { 'Sr.': 'D1', 'Particulars': `Regular TDR (${statement.regular_tdr_factor || 0})`, 'Permissible Value': areaMetrics.permissibleRegularTdrSqm || 0 },
      { 'Sr.': 'D2', 'Particulars': `Slum TDR (${statement.slum_tdr_factor || 0})`, 'Permissible Value': areaMetrics.permissibleSlumTdrSqm || 0 },
      { 'Sr.': 'E', 'Particulars': 'Total Builtup Area (B + C + D)', 'Permissible Value': areaMetrics.permissibleTotalBuiltupSqm },
      { 'Sr.': 'F', 'Particulars': 'TOTAL FSI CONSUMPTION RATIO', 'Permissible Value': Number(areaMetrics.permissibleTotalFsi || 0).toFixed(3) },
      { 'Sr.': 'G', 'Particulars': `Ancillary FSI (${statement.building_use === 'COMMERCIAL' ? '80%' : '60%'})`, 'Permissible Value': areaMetrics.permissibleAncillaryResSqm },
      { 'Sr.': 'H', 'Particulars': 'TOTAL PERMISSIBLE P-LINE AREA (E + G)', 'Permissible Value': areaMetrics.permissiblePlineTotalSqm }
    ];

    // Table 2: Proposed Area Statement
    const proposedRows = [
      { 'Sr.': '1', 'Particulars': 'Area of Plot', 'Proposed Value': '—' },
      { 'Sr.': '2', 'Particulars': 'D.P. Deductions', 'Proposed Value': '—' },
      { 'Sr.': '3', 'Particulars': 'Existing Built-up Area Deduction', 'Proposed Value': '—' },
      { 'Sr.': 'A', 'Particulars': 'Plotable Area (Net Development Plot)', 'Proposed Value': areaMetrics.plotableAreaSqm },
      { 'Sr.': 'B', 'Particulars': `Basic Proposed FSI (${statement.basic_fsi_factor || 1.1})`, 'Proposed Value': areaMetrics.proposedBasicFsiSqm },
      { 'Sr.': 'C', 'Particulars': `Paid Proposed FSI (${statement.paid_fsi_factor || 0.5})`, 'Proposed Value': areaMetrics.proposedPaidFsiSqm },
      { 'Sr.': 'D1', 'Particulars': `Regular TDR (${statement.regular_tdr_factor || 0})`, 'Proposed Value': areaMetrics.regularTdrSqm || 0 },
      { 'Sr.': 'D2', 'Particulars': `Slum TDR (${statement.slum_tdr_factor || 0})`, 'Proposed Value': areaMetrics.slumTdrSqm || 0 },
      { 'Sr.': 'E', 'Particulars': 'Total Builtup Area (B + C + D)', 'Proposed Value': areaMetrics.proposedTotalBuiltupSqm },
      { 'Sr.': 'F', 'Particulars': 'TOTAL FSI CONSUMPTION RATIO', 'Proposed Value': Number(areaMetrics.proposedTotalFsi || 0).toFixed(3) },
      { 'Sr.': 'G', 'Particulars': `Ancillary FSI (${statement.building_use === 'COMMERCIAL' ? '80%' : '60%'})`, 'Proposed Value': areaMetrics.proposedAncillaryResSqm },
      { 'Sr.': 'H', 'Particulars': 'TOTAL PROPOSED P-LINE AREA (E + G)', 'Proposed Value': areaMetrics.proposedPlineTotalSqm }
    ];

    // Floor breakdown: 7-column sequence
    const floorRows = floors.map(f => ({
      'Floor Level': f.floor_name,
      'Height (m)': f.height_meters,
      'P-Line Area (sq m)': f.pline_area_sqm,
      'Lobby Area (sq m)': f.lobby_area_sqm,
      'Built-up for Sale (sq m)': f.builtup_for_sale_sqm,
      'No. Of Units': f.no_of_units || 1,
      'Area For 1 Unit': f.area_for_1_unit || (f.no_of_units > 0 ? ((f.builtup_for_sale_sqm || 0) / f.no_of_units).toFixed(2) : '0.00')
    }));

    const finRows = [
      { 'Category': 'Total Statutory Demand (A)', 'Amount (Rs)': financialMetrics.totalStatutoryDemandA },
      { 'Category': 'Cost of TDR (B)', 'Amount (Rs)': financialMetrics.costOfTdrB },
      { 'Category': 'NOC & BPMS Expenses (C)', 'Amount (Rs)': financialMetrics.totalExpensesC },
      { 'Category': 'Civil Construction Cost (D)', 'Amount (Rs)': financialMetrics.costOfConstructionD },
      { 'Category': 'Basement Cost (E)', 'Amount (Rs)': financialMetrics.costOfBasementE },
      { 'Category': 'Rent during Construction (F)', 'Amount (Rs)': financialMetrics.rentCostF },
      { 'Category': 'Stacked Parking (G)', 'Amount (Rs)': financialMetrics.stackedParkingCostG },
      { 'Category': 'Plot Land Cost (H)', 'Amount (Rs)': financialMetrics.costOfPlotH },
      { 'Category': 'TOTAL PROJECT COST', 'Amount (Rs)': financialMetrics.totalProjectCost },
      { 'Category': 'TOTAL ESTIMATED RECEIPTS', 'Amount (Rs)': financialMetrics.totalReceipts },
      { 'Category': 'NET PROJECT PROFIT', 'Amount (Rs)': financialMetrics.netProfit }
    ];

    const wb = XLSX.utils.book_new();
    const wsPermissible = XLSX.utils.json_to_sheet(permissibleRows);
    const wsProposed = XLSX.utils.json_to_sheet(proposedRows);
    const wsFloors = XLSX.utils.json_to_sheet(floorRows);
    const wsFin = XLSX.utils.json_to_sheet(finRows);

    XLSX.utils.book_append_sheet(wb, wsPermissible, 'Permissible Statement');
    XLSX.utils.book_append_sheet(wb, wsProposed, 'Proposed Statement');
    XLSX.utils.book_append_sheet(wb, wsFloors, 'Floor Breakdown');
    XLSX.utils.book_append_sheet(wb, wsFin, 'Financial Viability');

    XLSX.writeFile(wb, `DS16_Feasibility_${project?.name || 'Statement'}.xlsx`);
    toast.success('Feasibility workbook exported to Excel');
  };

  // Export to PDF
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
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      const docType = activeSubSection === 'area' ? 'Area_Statement' : 'Financial_Viability';
      pdf.save(`DS16_${docType}_${project?.name || 'Report'}.pdf`);
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
        <div className="skeleton h-10 w-full rounded-xl" />
        <div className="skeleton h-96 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      {/* Top Controls Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#EBEBEB] pb-3">
        {/* Navigation Sub-Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto">
          <button
            onClick={() => setActiveSubSection('area')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap ${
              activeSubSection === 'area'
                ? 'bg-[#E05A1E] text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Layers size={14} />
            Area Statement
          </button>

          <button
            onClick={() => setActiveSubSection('financial')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap ${
              activeSubSection === 'financial'
                ? 'bg-[#E05A1E] text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Calculator size={14} />
            Financial Viability
          </button>
        </div>

        {/* Global Toolbar Options */}
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {/* Unit Toggle */}
          <div className="flex items-center bg-slate-100 rounded-lg p-0.5 border border-slate-200 text-xs">
            <button
              onClick={() => setUnitDisplay('sq_m')}
              className={`px-2 py-1 rounded font-semibold transition-all ${
                unitDisplay === 'sq_m' ? 'bg-white text-[#E05A1E] shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Sq M (m²)
            </button>
            <button
              onClick={() => setUnitDisplay('sq_ft')}
              className={`px-2 py-1 rounded font-semibold transition-all ${
                unitDisplay === 'sq_ft' ? 'bg-white text-[#E05A1E] shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Sq Ft (ft²)
            </button>
          </div>

          {/* Mobile Split Toggle */}
          <div className="flex lg:hidden items-center bg-slate-100 rounded-lg p-0.5 border border-slate-200 text-xs">
            <button
              onClick={() => setMobileView('form')}
              className={`px-2 py-1 rounded font-medium ${mobileView === 'form' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}
            >
              Form
            </button>
            <button
              onClick={() => setMobileView('preview')}
              className={`px-2 py-1 rounded font-medium ${mobileView === 'preview' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}
            >
              Document
            </button>
          </div>

          <button
            onClick={handleCreateSnapshot}
            className="text-xs font-semibold px-2.5 py-1.5 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1.5"
            title="Snapshot calculation"
          >
            <Camera size={13} className="text-[#E05A1E]" />
            Snapshot
          </button>

          <button
            onClick={handleExportExcel}
            className="text-xs font-semibold px-2.5 py-1.5 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1.5"
            title="Export Excel"
          >
            <FileSpreadsheet size={13} className="text-emerald-600" />
            Excel
          </button>

          <button
            onClick={handleExportPDF}
            disabled={exporting}
            className="text-xs font-semibold px-2.5 py-1.5 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1.5"
            title="Export PDF"
          >
            <Download size={13} className="text-red-600" />
            {exporting ? 'Generating...' : 'PDF'}
          </button>

          {isPrivileged && (
            <button
              onClick={handleSaveAll}
              disabled={saving}
              className="btn-primary text-xs py-1.5 px-3.5"
            >
              <Save size={13} />
              {saving ? 'Saving...' : 'Save Feasibility'}
            </button>
          )}
        </div>
      </div>

      {/* ======================================================== */}
      {/* TWO-PANEL SPREADSHEET EXPERIENCE: (FORM LEFT | PREVIEW RIGHT) */}
      {/* ======================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Panel: Structured Input Form */}
        <div className={`lg:col-span-5 space-y-4 ${mobileView === 'preview' ? 'hidden lg:block' : 'block'}`}>
          <div className="card border-slate-200">
            <div className="border-b border-slate-200 pb-3 mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
                  {activeSubSection === 'area' ? 'Area Statement Inputs' : 'Financial Viability Inputs'}
                </h3>
                <p className="text-[11px] text-muted">
                  Changes immediately update the formatted report preview on the right.
                </p>
              </div>
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 flex items-center gap-1">
                <Sparkles size={11} /> Live Auto-Calculate
              </span>
            </div>

            {activeSubSection === 'area' && (
              <AreaStatementForm
                statement={statement}
                floors={floors}
                onUpdateStatement={handleUpdateStatement}
                onAddFloor={handleAddFloor}
                onUpdateFloor={handleUpdateFloor}
                onDeleteFloor={handleDeleteFloor}
                unitDisplay={unitDisplay}
                isPrivileged={isPrivileged}
                isAddingFloor={isAddingFloor}
              />
            )}

            {activeSubSection === 'financial' && (
              <FinancialViabilityForm
                financial={financial}
                floors={floors}
                statutoryCharges={statutoryCharges}
                salableUnits={salableUnits}
                onUpdateFinancial={handleUpdateFinancial}
                onUpdateFloor={handleUpdateFloor}
                onAddFloor={handleAddFloor}
                onDeleteFloor={handleDeleteFloor}
                onUpdateStatutoryCharge={handleUpdateStatutoryCharge}
                onArchiveStatutoryCharge={handleArchiveStatutoryCharge}
                unitDisplay={unitDisplay}
                isPrivileged={isPrivileged}
                isAddingFloor={isAddingFloor}
              />
            )}
          </div>
        </div>

        {/* Right Panel: Live Document Preview */}
        <div className={`lg:col-span-7 ${mobileView === 'form' ? 'hidden lg:block' : 'block'}`}>
          <div className="sticky top-4">
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
              activeSheet={activeSubSection}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
