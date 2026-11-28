// client/src/components/projects/feasibility/AreaFeasibilityTab.jsx
// Two-tab Excel-structured Area Statement & Financial Viability module.
// Strictly delegates all calculations to the authoritative backend engine (/feasibility & /feasibility/preview).

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Calculator,
  FileSpreadsheet,
  FileText,
  Save,
  Building2,
  Coins,
  AlertTriangle,
  RefreshCw,
  CheckCircle2
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../../api/client';
import { ROAD_WIDTH_TOTAL_TDR_MAP, ROAD_WIDTH_TDR_MAP } from '../../../utils/feasibilityCalculations';

import AreaStatementForm from './AreaStatementForm';
import FinancialViabilityForm from './FinancialViabilityForm';

function validateAreaDraftClient(stmt = {}) {
  const numOrNull = (v) => {
    if (v === undefined || v === null || v === '') return null;
    const p = parseFloat(v);
    return Number.isFinite(p) ? p : null;
  };

  const plot = numOrNull(stmt.plot_area_sqm) ?? 0;
  const dp = numOrNull(stmt.dp_deductions_sqm) ?? 0;
  if (plot < 0) return 'Area Of Plot cannot be negative.';
  if (dp < 0) return 'Deductions For Proposed D.P. cannot be negative.';
  if (dp > plot + 0.0001) {
    return `Deductions For Proposed D.P. (${dp.toFixed(3)} m²) cannot exceed Area Of Plot (${plot.toFixed(3)} m²). Last valid data retained.`;
  }

  const paidMax = numOrNull(stmt.paid_fsi_factor) ?? 0.5;
  const propPaid = numOrNull(stmt.proposed_paid_fsi_factor);
  if (propPaid !== null && propPaid > paidMax + 0.0001) {
    return `Proposed Paid FSI (${propPaid}) cannot exceed Max Paid FSI (${paidMax}). Last valid data retained.`;
  }

  const isGunth = Boolean(stmt.is_gunthewari);
  const rw = numOrNull(stmt.road_width_m);
  const regTdr = numOrNull(stmt.regular_tdr_factor);
  const propReg = numOrNull(stmt.proposed_regular_tdr_factor);
  const propSlum = numOrNull(stmt.proposed_slum_tdr_factor);

  if (isGunth) {
    if (regTdr !== null && regTdr > 0.0001) {
      return 'Regular TDR is not permitted for Gunthewari plots (Slum TDR only).';
    }
    if (propReg !== null && propReg > 0.0001) {
      return 'Proposed Regular TDR cannot exceed 0 for Gunthewari plots.';
    }
    const maxGunthSlum = rw !== null && ROAD_WIDTH_TDR_MAP[rw]
      ? ROAD_WIDTH_TDR_MAP[rw].gunthewari
      : (numOrNull(stmt.slum_tdr_factor) ?? 0);
    if (propSlum !== null && propSlum > maxGunthSlum + 0.0001) {
      return `Proposed Slum TDR (${propSlum}) cannot exceed Gunthewari Slum TDR eligibility (${maxGunthSlum}).`;
    }
  } else if (rw !== null && ROAD_WIDTH_TOTAL_TDR_MAP[rw] !== undefined) {
    const roadTotal = ROAD_WIDTH_TOTAL_TDR_MAP[rw];
    if (regTdr !== null && (regTdr < 0 || regTdr > roadTotal + 0.0001)) {
      return `Permissible Regular TDR (${regTdr}) must be between 0 and Total Road TDR (${roadTotal}).`;
    }
    const effReg = regTdr !== null ? regTdr : Math.round((roadTotal / 2) * 10000) / 10000;
    const effSlum = Math.round((roadTotal - effReg) * 10000) / 10000;
    if (propReg !== null && propReg > effReg + 0.0001) {
      return `Proposed Regular TDR (${propReg}) cannot exceed Permissible Regular TDR (${effReg}).`;
    }
    if (propSlum !== null && propSlum > effSlum + 0.0001) {
      return `Proposed Slum TDR (${propSlum}) cannot exceed Permissible Slum TDR (${effSlum}).`;
    }
  }

  return null;
}

export default function AreaFeasibilityTab({ projectId, user, isAdmin, isAccounts, isPrivileged }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawSubtab = searchParams.get('subtab');
  const initialTab = rawSubtab === 'financial-viability' ? 'financial-viability' : 'area-statement';

  const [activeSubtab, setActiveSubtab] = useState(initialTab);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [exportingType, setExportingType] = useState(null);
  const [validationError, setValidationError] = useState(null);

  const [project, setProject] = useState(null);
  const [statement, setStatement] = useState({});
  const [floors, setFloors] = useState([]);
  const [financial, setFinancial] = useState({});
  const [statutoryCharges, setStatutoryCharges] = useState([]);
  const [salableUnits, setSalableUnits] = useState([]);
  const [areaMetrics, setAreaMetrics] = useState({});
  const [financialMetrics, setFinancialMetrics] = useState({});

  const [unitDisplay, setUnitDisplay] = useState('sq_m');
  const [isDirty, setIsDirty] = useState(false);
  const [dirtyModules, setDirtyModules] = useState({
    area: false,
    floors: false,
    financial: false,
    statutoryIds: new Set()
  });

  // Override Modal State
  const [overrideModal, setOverrideModal] = useState(null);
  const [overrideInput, setOverrideInput] = useState('');
  const [overrideReason, setOverrideReason] = useState('');

  const canEdit = Boolean(
    isPrivileged ||
    isAdmin ||
    isAccounts ||
    ['admin', 'back_office', 'accounts', 'design_head', 'project_head'].includes(user?.role)
  );

  // Refs for race-free debounced /preview calls
  const draftRef = useRef({ statement: {}, floors: [], financial: {}, statutoryCharges: [], salableUnits: [] });
  const previewTimerRef = useRef(null);
  const previewSeqRef = useRef(0);

  useEffect(() => {
    draftRef.current = { statement, floors, financial, statutoryCharges, salableUnits };
  }, [statement, floors, financial, statutoryCharges, salableUnits]);

  // Normalize any stale URL query subtabs (e.g. old project-summary or report-preview) to strictly 2 tabs
  useEffect(() => {
    const paramTab = searchParams.get('subtab');
    if (paramTab && paramTab !== 'area-statement' && paramTab !== 'financial-viability') {
      const next = new URLSearchParams(searchParams);
      next.set('subtab', 'area-statement');
      setSearchParams(next, { replace: true });
      setActiveSubtab('area-statement');
    } else if (paramTab === 'financial-viability' || paramTab === 'area-statement') {
      setActiveSubtab(paramTab);
    }
  }, [searchParams, setSearchParams]);

  const handleTabChange = (tabId) => {
    setActiveSubtab(tabId);
    const next = new URLSearchParams(searchParams);
    next.set('subtab', tabId);
    setSearchParams(next, { replace: true });
  };

  const fetchData = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setValidationError(null);
    try {
      const res = await api.get(`/projects/${projectId}/feasibility`);
      const data = res.data || {};
      setProject(data.project || null);
      setStatement(data.statement || {});
      setFloors(data.floors || []);
      setFinancial(data.financial || {});
      setStatutoryCharges(data.statutoryCharges || []);
      setSalableUnits(data.salableUnits || []);
      setAreaMetrics(data.areaMetrics || {});
      setFinancialMetrics(data.financialMetrics || {});
      setUnitDisplay(data.statement?.unit_display === 'sq_ft' ? 'sq_ft' : 'sq_m');
      setIsDirty(false);
      setDirtyModules({ area: false, floors: false, financial: false, statutoryIds: new Set() });
    } catch (err) {
      console.error('Failed to load feasibility data:', err);
      toast.error(err.response?.data?.error || 'Failed to load feasibility module');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchData();
    return () => {
      if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    };
  }, [fetchData]);

  // Execute live calculation preview strictly on backend engine
  const executePreview = useCallback(async (payload) => {
    const seq = ++previewSeqRef.current;
    setPreviewing(true);
    try {
      const res = await api.post(`/projects/${projectId}/feasibility/preview`, payload);
      if (seq !== previewSeqRef.current) return; // Discard stale response
      const data = res.data || {};
      if (data.areaMetrics) setAreaMetrics(data.areaMetrics);
      if (data.financialMetrics) setFinancialMetrics(data.financialMetrics);
      setValidationError(null);
    } catch (err) {
      if (seq !== previewSeqRef.current) return;
      const msg = err.response?.data?.error || 'Calculation preview failed';
      setValidationError(msg);
    } finally {
      if (seq === previewSeqRef.current) setPreviewing(false);
    }
  }, [projectId]);

  const schedulePreview = useCallback((nextDraft, immediate = false) => {
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    if (immediate) {
      executePreview(nextDraft);
    } else {
      previewTimerRef.current = setTimeout(() => {
        executePreview(draftRef.current);
      }, 220);
    }
  }, [executePreview]);

  // Draft updaters (no inline shadow math — everything validated and computed by backend preview)
  const handleUpdateStatement = useCallback((patch, immediate = false) => {
    const candidate = { ...draftRef.current.statement, ...patch };
    const err = validateAreaDraftClient(candidate);
    if (err) {
      setValidationError(err);
      return { ok: false, error: err };
    }
    setValidationError(null);
    setStatement(() => {
      const nextDraft = { ...draftRef.current, statement: candidate };
      draftRef.current = nextDraft;
      schedulePreview(nextDraft, immediate);
      return candidate;
    });
    setIsDirty(true);
    setDirtyModules((prev) => ({ ...prev, area: true }));
    return { ok: true };
  }, [schedulePreview]);

  const handleToggleUnitDisplay = (nextUnit) => {
    setUnitDisplay(nextUnit);
    handleUpdateStatement({ unit_display: nextUnit }, false);
  };

  const handleUpdateFloor = useCallback((floorId, patch, immediate = false) => {
    setValidationError(null);
    setFloors((prev) => {
      const nextFloors = prev.map((fl) => (fl.id === floorId ? { ...fl, ...patch } : fl));
      const nextDraft = { ...draftRef.current, floors: nextFloors };
      draftRef.current = nextDraft;
      schedulePreview(nextDraft, immediate);
      return nextFloors;
    });
    setIsDirty(true);
    setDirtyModules((prev) => ({ ...prev, floors: true }));
  }, [schedulePreview]);

  const handleUpdateFinancial = useCallback((patch, immediate = false) => {
    setValidationError(null);
    setFinancial((prev) => {
      const nextFin = { ...prev, ...patch };
      const nextDraft = { ...draftRef.current, financial: nextFin };
      draftRef.current = nextDraft;
      schedulePreview(nextDraft, immediate);
      return nextFin;
    });
    setIsDirty(true);
    setDirtyModules((prev) => ({ ...prev, financial: true }));
  }, [schedulePreview]);

  const handleUpdateStatutoryCharge = useCallback((chargeId, patch) => {
    setValidationError(null);
    setStatutoryCharges((prev) => {
      const nextCharges = prev.map((sc) => (sc.id === chargeId ? { ...sc, ...patch } : sc));
      const nextDraft = { ...draftRef.current, statutoryCharges: nextCharges };
      draftRef.current = nextDraft;
      schedulePreview(nextDraft, true);
      return nextCharges;
    });
    setIsDirty(true);
    setDirtyModules((prev) => {
      const nextIds = new Set(prev.statutoryIds);
      nextIds.add(chargeId);
      return { ...prev, statutoryIds: nextIds };
    });
  }, [schedulePreview]);

  // Unified Persist All Changes
  const handleSaveAll = async ({ silent = false } = {}) => {
    if (!canEdit) return false;
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);

    const snap = draftRef.current;
    const preErr = validateAreaDraftClient(snap.statement);
    if (preErr) {
      setValidationError(preErr);
      toast.error(preErr);
      return false;
    }

    setSaving(true);
    setValidationError(null);

    try {
      // 1. Area Statement (omit manual total/slum TDR when road_width_m is selected so backend enforces road-width balance)
      const hasRoadWidth = snap.statement.road_width_m !== null && snap.statement.road_width_m !== undefined && snap.statement.road_width_m !== '';
      const stmtPayload = {
        plot_area_sqm: snap.statement.plot_area_sqm,
        city_survey_area_sqm: snap.statement.city_survey_area_sqm,
        site_area_sqm: snap.statement.site_area_sqm,
        dp_deductions_sqm: snap.statement.dp_deductions_sqm,
        existing_builtup_area_sqm: snap.statement.existing_builtup_area_sqm,
        margin_meters: snap.statement.margin_meters,
        dividing_factor: snap.statement.dividing_factor,
        basic_fsi_factor: snap.statement.basic_fsi_factor,
        paid_fsi_factor: snap.statement.paid_fsi_factor,
        proposed_paid_fsi_factor: snap.statement.proposed_paid_fsi_factor,
        ...(!hasRoadWidth ? {
          tdr_factor: snap.statement.tdr_factor,
          total_tdr_factor: snap.statement.total_tdr_factor,
          slum_tdr_factor: snap.statement.slum_tdr_factor
        } : {}),
        regular_tdr_factor: snap.statement.is_gunthewari ? 0 : snap.statement.regular_tdr_factor,
        proposed_regular_tdr_factor: snap.statement.is_gunthewari ? 0 : snap.statement.proposed_regular_tdr_factor,
        proposed_slum_tdr_factor: snap.statement.proposed_slum_tdr_factor,
        is_gunthewari: snap.statement.is_gunthewari,
        road_width_m: snap.statement.road_width_m,
        building_use: snap.statement.building_use,
        primary_fsi_residential_pct: snap.statement.primary_fsi_residential_pct,
        ancillary_commercial_pct: snap.statement.ancillary_commercial_pct,
        ancillary_residential_pct: snap.statement.ancillary_residential_pct,
        unit_display: unitDisplay,
        total_proposed_pline_override_sqm: snap.statement.total_proposed_pline_override_sqm,
        is_proposed_pline_overridden: snap.statement.is_proposed_pline_overridden,
        proposed_pline_override_reason: snap.statement.proposed_pline_override_reason,
        expected_version: snap.statement.version
      };
      const areaRes = await api.put(`/projects/${projectId}/feasibility/area`, stmtPayload);
      const nextStmtVersion = areaRes.data?.statement?.version;

      // 2. Floor batch update (exact 6-column data + internal dependencies preserved)
      if (snap.floors.length > 0 && dirtyModules.floors) {
        const floorPayload = snap.floors.map((fl) => ({
          id: fl.id,
          floor_type: fl.floor_type,
          height_meters: fl.height_meters,
          pline_area_sqm: fl.pline_area_sqm,
          is_pline_overridden: fl.is_pline_overridden,
          pline_override_reason: fl.pline_override_reason,
          lobby_area_sqm: fl.lobby_area_sqm,
          is_lobby_overridden: fl.is_lobby_overridden,
          builtup_for_owners_sqm: fl.builtup_for_owners_sqm,
          usage_type: fl.usage_type,
          no_of_units: fl.no_of_units,
          remarks: fl.remarks
        }));
        await api.put(`/projects/${projectId}/feasibility/area/floors/batch`, { floors: floorPayload });
      }

      // 3. Financial Viability
      const finPayload = {
        rr_rate_per_sqm: snap.financial.rr_rate_per_sqm,
        tdr_purchase_factor: snap.financial.tdr_purchase_factor,
        estimated_cost_a_rate: snap.financial.estimated_cost_a_rate,
        estimated_cost_b_rate: snap.financial.estimated_cost_b_rate,
        cost_of_plot: snap.financial.cost_of_plot,
        is_cost_of_plot_included: snap.financial.is_cost_of_plot_included,
        cost_of_construction_rate: snap.financial.cost_of_construction_rate,
        cost_of_infrastructure: snap.financial.cost_of_infrastructure,
        basement_area_sqm: snap.financial.basement_area_sqm,
        basement_rate_per_sqm: snap.financial.basement_rate_per_sqm,
        interest_amount: snap.financial.interest_amount,
        rent_tenements: snap.financial.rent_tenements,
        rent_per_tenement_per_month: snap.financial.rent_per_tenement_per_month,
        rent_months: snap.financial.rent_months,
        stacked_parking_slots: snap.financial.stacked_parking_slots,
        stacked_parking_cost_per_slot: snap.financial.stacked_parking_cost_per_slot,
        minor_expenses: snap.financial.minor_expenses,
        bpms_staff_charges: snap.financial.bpms_staff_charges,
        airport_noc: snap.financial.airport_noc,
        fire_noc: snap.financial.fire_noc,
        entertainment_charges: snap.financial.entertainment_charges,
        extra_stamp_duty: snap.financial.extra_stamp_duty,
        advocate_fees: snap.financial.advocate_fees,
        period_months: snap.financial.period_months,
        notes: snap.financial.notes,
        expected_version: snap.financial.version
      };
      await api.put(`/projects/${projectId}/feasibility/financial`, finPayload);

      // 4. Modified Statutory Charges
      for (const chargeId of dirtyModules.statutoryIds) {
        const sc = snap.statutoryCharges.find((c) => c.id === chargeId);
        if (!sc) continue;
        await api.patch(`/projects/${projectId}/feasibility/statutory/${chargeId}`, {
          is_enabled: sc.is_enabled,
          rr_percentage: sc.rr_percentage,
          amount: sc.amount
        });
      }

      if (nextStmtVersion) {
        setStatement((prev) => ({ ...prev, version: nextStmtVersion }));
      }
      await fetchData();
      if (!silent) toast.success('Feasibility data saved and synchronized');
      return true;
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to save feasibility changes';
      setValidationError(msg);
      toast.error(msg);
      return false;
    } finally {
      setSaving(false);
    }
  };

  // Floor Management Actions (sourced cleanly from Central Building Structure)
  const handleReconcileFloors = async () => {
    if (!canEdit) return;
    try {
      if (isDirty) {
        const ok = await handleSaveAll({ silent: true });
        if (!ok) return;
      }
      const res = await api.post(`/projects/${projectId}/feasibility/area/reconcile-floors`);
      setFloors(res.data?.floors || []);
      if (res.data?.areaMetrics) setAreaMetrics(res.data.areaMetrics);
      if (res.data?.financialMetrics) setFinancialMetrics(res.data.financialMetrics);
      toast.success('Floor hierarchy generated / synced from building configuration');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to sync floors');
    }
  };

  // Salable Units CRUD (preserves unsaved financial/area draft changes!)
  const handleAddSalableUnit = async (unitPayload) => {
    if (!canEdit) return false;
    try {
      const res = await api.post(`/projects/${projectId}/feasibility/financial/salable-units`, unitPayload);
      const created = res.data?.unit;
      if (created) {
        setSalableUnits((prev) => {
          const nextUnits = [...prev, created];
          const nextDraft = { ...draftRef.current, salableUnits: nextUnits };
          draftRef.current = nextDraft;
          schedulePreview(nextDraft, true);
          return nextUnits;
        });
      }
      toast.success('Salable unit added');
      return true;
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to add salable unit');
      return false;
    }
  };

  const handleEditSalableUnit = async (unitId, unitPayload) => {
    if (!canEdit) return false;
    try {
      const res = await api.put(`/projects/${projectId}/feasibility/financial/salable-units/${unitId}`, unitPayload);
      const updated = res.data?.unit;
      if (updated) {
        setSalableUnits((prev) => {
          const nextUnits = prev.map((u) => (u.id === unitId ? updated : u));
          const nextDraft = { ...draftRef.current, salableUnits: nextUnits };
          draftRef.current = nextDraft;
          schedulePreview(nextDraft, true);
          return nextUnits;
        });
      }
      toast.success('Salable unit updated');
      return true;
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update salable unit');
      return false;
    }
  };

  const handleDeleteSalableUnit = async (unitId) => {
    if (!canEdit) return;
    try {
      await api.delete(`/projects/${projectId}/feasibility/financial/salable-units/${unitId}`);
      setSalableUnits((prev) => {
        const nextUnits = prev.filter((u) => u.id !== unitId);
        const nextDraft = { ...draftRef.current, salableUnits: nextUnits };
        draftRef.current = nextDraft;
        schedulePreview(nextDraft, true);
        return nextUnits;
      });
      toast.success('Salable unit removed');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete salable unit');
    }
  };

  // Overrides Modal Actions (preserves unsaved draft edits without wiping!)
  const openOverrideModal = (key, title, currentValue, calculatedBasisVal) => {
    const existing = financial?.overrides?.[key];
    setOverrideModal({ key, title, calculatedBasisVal, existing });
    setOverrideInput(existing ? String(existing.override_val) : String(Math.round((currentValue || 0) * 100) / 100));
    setOverrideReason(existing?.reason || '');
  };

  const submitOverrideModal = async (e) => {
    e.preventDefault();
    if (!overrideModal) return;
    const val = parseFloat(overrideInput);
    if (isNaN(val) || val < 0) {
      toast.error('Please enter a valid non-negative override amount');
      return;
    }
    try {
      const res = await api.put(`/projects/${projectId}/feasibility/financial/overrides`, {
        key: overrideModal.key,
        override_val: val,
        calculated_basis_val: overrideModal.calculatedBasisVal,
        reason: overrideReason
      });
      const updatedFin = res.data?.financial || {};
      setFinancial((prev) => {
        const nextFin = {
          ...prev,
          overrides: updatedFin.overrides,
          override_history: updatedFin.override_history,
          version: updatedFin.version
        };
        const nextDraft = { ...draftRef.current, financial: nextFin };
        draftRef.current = nextDraft;
        schedulePreview(nextDraft, true);
        return nextFin;
      });
      setOverrideModal(null);
      toast.success(`${overrideModal.title} override saved`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save override');
    }
  };

  const handleResetOverride = async (key) => {
    try {
      const res = await api.post(`/projects/${projectId}/feasibility/financial/overrides/reset`, { key });
      const updatedFin = res.data?.financial || {};
      setFinancial((prev) => {
        const nextFin = {
          ...prev,
          overrides: updatedFin.overrides,
          override_history: updatedFin.override_history,
          version: updatedFin.version
        };
        const nextDraft = { ...draftRef.current, financial: nextFin };
        draftRef.current = nextDraft;
        schedulePreview(nextDraft, true);
        return nextFin;
      });
      toast.success('Reverted to formula calculated value');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to reset override');
    }
  };

  // Authoritative Backend Excel / PDF Download
  const handleDownloadExport = async (type) => {
    if (isDirty && canEdit) {
      const savedOk = await handleSaveAll({ silent: true });
      if (!savedOk) {
        toast.error('Resolve validation errors and save before exporting');
        return;
      }
    }
    setExportingType(type);
    try {
      const response = await api.get(`/projects/${projectId}/feasibility/export/${type}`, {
        responseType: 'blob'
      });
      const disposition = response.headers?.['content-disposition'] || '';
      const match = disposition.match(/filename="?([^"]+)"?/i);
      const fallbackName = `DS16_Feasibility_${project?.name || projectId}.${type === 'excel' ? 'xlsx' : 'pdf'}`;
      const filename = match ? match[1] : fallbackName;

      const blob = new Blob([response.data], {
        type: type === 'excel'
          ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          : 'application/pdf'
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success(`${type === 'excel' ? 'Excel (.xlsx)' : 'PDF'} downloaded`);
    } catch (err) {
      console.error(`Failed to export ${type}:`, err);
      toast.error(`Failed to export ${type === 'excel' ? 'Excel' : 'PDF'}`);
    } finally {
      setExportingType(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-500 gap-2 text-sm">
        <RefreshCw className="w-4 h-4 animate-spin" />
        <span>Loading Area Statement &amp; Financial Viability...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Top 2-Tab Header & Actions Bar */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex bg-slate-100 p-1 rounded-lg border border-slate-200">
            <button
              type="button"
              onClick={() => handleTabChange('area-statement')}
              className={`px-3.5 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition ${
                activeSubtab === 'area-statement'
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>Area Statement</span>
            </button>
            <button
              type="button"
              onClick={() => handleTabChange('financial-viability')}
              className={`px-3.5 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition ${
                activeSubtab === 'financial-viability'
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              <Coins className="w-3.5 h-3.5" />
              <span>Financial Viability</span>
            </button>
          </div>

          <div className="flex items-center gap-1.5 text-[11px] text-slate-600 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-md">
            <Calculator className="w-3 h-3 text-slate-500" />
            <span>{areaMetrics.isGunthewari ? 'Gunthewari (Slum TDR Only)' : 'Regular Development'}</span>
            <span className="text-slate-300">|</span>
            <span>{statement.building_use || 'Residential'}</span>
            {statement.road_width_m && (
              <>
                <span className="text-slate-300">|</span>
                <span>{statement.road_width_m}m Road</span>
              </>
            )}
          </div>

          {previewing && (
            <span className="text-[11px] text-indigo-600 font-medium flex items-center gap-1">
              <RefreshCw className="w-3 h-3 animate-spin" />
              Calculating...
            </span>
          )}
          {!previewing && isDirty && (
            <span className="text-[11px] bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded font-medium">
              Unsaved changes
            </span>
          )}
          {!previewing && !isDirty && (
            <span className="text-[11px] text-emerald-700 flex items-center gap-1 font-medium">
              <CheckCircle2 className="w-3 h-3" />
              Synced
            </span>
          )}
        </div>

        {/* Unit Switcher & Authoritative Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => handleToggleUnitDisplay('sq_m')}
              className={`px-2.5 py-1 rounded-md font-medium transition ${
                unitDisplay === 'sq_m' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Sq M (m²)
            </button>
            <button
              type="button"
              onClick={() => handleToggleUnitDisplay('sq_ft')}
              className={`px-2.5 py-1 rounded-md font-medium transition ${
                unitDisplay === 'sq_ft' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Sq Ft (ft²)
            </button>
          </div>

          <button
            type="button"
            disabled={!!exportingType || saving}
            onClick={() => handleDownloadExport('excel')}
            className="px-3 py-1.5 rounded-lg border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>{exportingType === 'excel' ? 'Exporting...' : 'Excel (.xlsx)'}</span>
          </button>

          <button
            type="button"
            disabled={!!exportingType || saving}
            onClick={() => handleDownloadExport('pdf')}
            className="px-3 py-1.5 rounded-lg border border-rose-300 bg-rose-50 hover:bg-rose-100 text-rose-800 text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>{exportingType === 'pdf' ? 'Exporting...' : 'PDF'}</span>
          </button>

          {canEdit && (
            <button
              type="button"
              disabled={saving}
              onClick={() => handleSaveAll()}
              className="px-3.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{saving ? 'Saving...' : 'Save Changes'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Inline Backend Validation Banner */}
      {validationError && (
        <div className="bg-rose-50 border border-rose-200 rounded-lg px-3.5 py-2.5 text-xs text-rose-800 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
          <span className="font-medium">{validationError}</span>
        </div>
      )}

      {/* Strictly Two Tab Views */}
      {activeSubtab === 'area-statement' ? (
        <AreaStatementForm
          statement={statement}
          floors={floors}
          areaMetrics={areaMetrics}
          unitDisplay={unitDisplay}
          canEdit={canEdit}
          onUpdateStatement={handleUpdateStatement}
          onUpdateFloor={handleUpdateFloor}
          onReconcileFloors={handleReconcileFloors}
        />
      ) : (
        <FinancialViabilityForm
          statement={statement}
          financial={financial}
          statutoryCharges={statutoryCharges}
          salableUnits={salableUnits}
          areaMetrics={areaMetrics}
          financialMetrics={financialMetrics}
          unitDisplay={unitDisplay}
          canEdit={canEdit}
          onUpdateFinancial={handleUpdateFinancial}
          onUpdateStatutoryCharge={handleUpdateStatutoryCharge}
          onOpenOverride={openOverrideModal}
          onResetOverride={handleResetOverride}
          onAddSalableUnit={handleAddSalableUnit}
          onEditSalableUnit={handleEditSalableUnit}
          onDeleteSalableUnit={handleDeleteSalableUnit}
        />
      )}

      {/* Admin Override Modal */}
      {overrideModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <form
            onSubmit={submitOverrideModal}
            className="bg-white rounded-xl border border-slate-200 shadow-xl w-full max-w-md p-5 space-y-4"
          >
            <div className="flex items-start justify-between">
              <div>
                <h4 className="text-sm font-bold text-slate-900">Override: {overrideModal.title}</h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  Formula Basis Value: ₹{Number(overrideModal.calculatedBasisVal || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Override Final Amount (₹)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                value={overrideInput}
                onChange={(e) => setOverrideInput(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-slate-900 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Audit Reason (Optional)
              </label>
              <input
                type="text"
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                placeholder="e.g., Approved demand note adjustment"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setOverrideModal(null)}
                className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 rounded-lg border border-slate-200"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 text-xs font-semibold bg-slate-900 text-white rounded-lg hover:bg-slate-800"
              >
                Save Override
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
