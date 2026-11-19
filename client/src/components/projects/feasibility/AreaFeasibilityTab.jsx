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
    const costConst = effectivePline * (parseFloat(fin.cost_of_construction_rate) || 0);
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

    let receiptsSum = 0;
    u.forEach(un => {
      const c = parseFloat(un.carpet_area_sqm) || 0;
      const sup = (c * 10.764) + (parseFloat(un.super_buildup_loading_sqft) || 0);
      const pr = sup * (parseFloat(un.rate_per_sqft) || 0);
      receiptsSum += pr * (parseInt(un.unit_count, 10) || 1);
    });

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
    try {
      const res = await api.post(`/projects/${projectId}/feasibility/area/floors`, {
        floor_name: `Floor ${floors.length + 1}`,
        floor_type: 'HABITABLE',
        height_meters: 3.0,
        pline_area_sqm: 0,
        lobby_area_sqm: 0,
        builtup_for_owners_sqm: 0,
        builtup_for_sale_sqm: 0,
        no_of_units: 1,
        area_for_1_unit: 0,
        is_lobby_overridden: false
      });
      const newFloors = [...floors, res.data.floor];
      setFloors(newFloors);
      recalculateLive(statement, newFloors, financial, salableUnits, statutoryCharges);
      toast.success('Floor added');
    } catch {
      toast.error('Failed to add floor');
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
    // Table 1: Plot Area Statement
    const plotAreaRows = [
      { 'Particulars': 'Area of Plot', 'Permissible': statement.plot_area_sqm, 'Proposed': statement.plot_area_sqm },
      { 'Particulars': 'D.P. Deductions', 'Permissible': statement.dp_deductions_sqm || 0, 'Proposed': 0 },
      { 'Particulars': 'Plotable Area', 'Permissible': areaMetrics.plotableAreaSqm, 'Proposed': areaMetrics.plotableAreaSqm }
    ];

    // Table 2: Permissible vs Proposed FSI Potential
    const fsiRows = [
      { 'Particulars': `Basic FSI (${statement.basic_fsi_factor || 1.1})`, 'Permissible': areaMetrics.permissibleFsiSqm, 'Proposed': areaMetrics.proposedBasicFsiSqm },
      { 'Particulars': `Paid FSI (${statement.paid_fsi_factor || 0.5})`, 'Permissible': areaMetrics.permissiblePaidFsiSqm, 'Proposed': areaMetrics.proposedPaidFsiSqm },
      { 'Particulars': `Regular TDR (${statement.regular_tdr_factor || 0})`, 'Permissible': areaMetrics.permissibleRegularTdrSqm || 0, 'Proposed': areaMetrics.proposedRegularTdrSqm || 0 },
      { 'Particulars': `Slum TDR (${statement.slum_tdr_factor || 0})`, 'Permissible': areaMetrics.permissibleSlumTdrSqm || 0, 'Proposed': areaMetrics.proposedSlumTdrSqm || 0 },
      { 'Particulars': 'Total Permissible / Proposed Builtup Area', 'Permissible': areaMetrics.proposedTotalBuiltupSqm, 'Proposed': areaMetrics.proposedTotalBuiltupSqm },
      { 'Particulars': `Ancillary Area (${statement.building_use === 'COMMERCIAL' ? '80%' : '60%'})`, 'Permissible': areaMetrics.proposedAncillaryResSqm, 'Proposed': areaMetrics.proposedAncillaryResSqm },
      { 'Particulars': 'Total Proposed P-Line Area', 'Permissible': areaMetrics.proposedPlineTotalSqm, 'Proposed': areaMetrics.totalProposedPlineSqm }
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
    const wsPlot = XLSX.utils.json_to_sheet(plotAreaRows);
    const wsFsi = XLSX.utils.json_to_sheet(fsiRows);
    const wsFloors = XLSX.utils.json_to_sheet(floorRows);
    const wsFin = XLSX.utils.json_to_sheet(finRows);

    XLSX.utils.book_append_sheet(wb, wsPlot, 'Plot Area Statement');
    XLSX.utils.book_append_sheet(wb, wsFsi, 'FSI Potential');
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
              />
            )}

            {activeSubSection === 'financial' && (
              <FinancialViabilityForm
                financial={financial}
                salableUnits={salableUnits}
                statutoryCharges={statutoryCharges}
                onUpdateFinancial={handleUpdateFinancial}
                onAddSalableUnit={handleAddSalableUnit}
                onUpdateSalableUnit={handleUpdateSalableUnit}
                onDeleteSalableUnit={handleDeleteSalableUnit}
                onUpdateStatutoryCharge={handleUpdateStatutoryCharge}
                onArchiveStatutoryCharge={handleArchiveStatutoryCharge}
                isPrivileged={isPrivileged}
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
