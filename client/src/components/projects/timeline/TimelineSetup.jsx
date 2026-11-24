// client/src/components/projects/timeline/TimelineSetup.jsx
import React, { useState, useEffect } from 'react';
import { Layers, Play, CheckCircle2, Save, Building, ShieldCheck, Sparkles, FileText, ArrowUpDown, Car, Sun, Flame, Paintbrush, Clock } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../../api/client';

export default function TimelineSetup({ projectId, config, onConfigSaved, onDraftGenerated, isManagement }) {
  const [formData, setFormData] = useState({
    floors_above_ground: 4,
    ground_floor_config: 'parking_and_rooms',
    has_terrace_tank_slab: true,
    parking_rooms_config: 'Standard',
    building_type: 'Residential Apartment',
    basement_count: 0,
    upper_parking_count: 0,
    has_stilt_parking: true,
    has_lift: true,
    additional_work_config: {
      elevation: false,
      lift: true,
      fire: false,
      solar: false
    },
    masonry_lag_days: 1,
    parking_floors: [],
    start_date: new Date().toISOString().split('T')[0]
  });
  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (config) {
      const rawAdd = config.additional_work_config || {};
      const isLift = (rawAdd.lift !== undefined) 
        ? Boolean(typeof rawAdd.lift === 'object' ? rawAdd.lift.enabled : rawAdd.lift)
        : (config.has_lift !== false);

      setFormData({
        floors_above_ground: config.floors_above_ground || 4,
        ground_floor_config: config.ground_floor_config || 'parking_and_rooms',
        has_terrace_tank_slab: config.has_terrace_tank_slab !== false,
        parking_rooms_config: config.parking_rooms_config || 'Standard',
        building_type: config.building_type || 'Residential Apartment',
        basement_count: config.basement_count !== undefined ? parseInt(config.basement_count, 10) : 0,
        upper_parking_count: config.upper_parking_count !== undefined ? parseInt(config.upper_parking_count, 10) : 0,
        has_stilt_parking: config.has_stilt_parking !== false,
        has_lift: isLift,
        additional_work_config: {
          elevation: Boolean(typeof rawAdd.elevation === 'object' ? rawAdd.elevation.enabled : rawAdd.elevation),
          lift: isLift,
          fire: Boolean(typeof rawAdd.fire === 'object' ? rawAdd.fire.enabled : rawAdd.fire),
          solar: Boolean(typeof rawAdd.solar === 'object' ? rawAdd.solar.enabled : rawAdd.solar)
        },
        masonry_lag_days: config.masonry_lag_days !== undefined ? parseInt(config.masonry_lag_days, 10) : 1,
        parking_floors: Array.isArray(config.parking_floors) ? config.parking_floors : [],
        start_date: config.start_date || new Date().toISOString().split('T')[0]
      });
    }
  }, [config]);

  useEffect(() => {
    api.get(`/projects/${projectId}/timeline/templates`)
      .then(res => setTemplates(res.data.templates || []))
      .catch(() => {});
  }, [projectId]);

  const handleApplyTemplate = (templateId) => {
    const tmpl = templates.find(t => t.id === parseInt(templateId, 10));
    if (!tmpl) return;
    setFormData(prev => ({
      ...prev,
      building_type: tmpl.building_type || prev.building_type,
      floors_above_ground: tmpl.default_floors || prev.floors_above_ground
    }));
    toast.success(`Template applied: ${tmpl.name}`);
  };

  const handleToggleAdditional = (key) => {
    if (!isManagement) return;
    setFormData(prev => {
      const nextAdd = { ...prev.additional_work_config, [key]: !prev.additional_work_config[key] };
      const nextForm = { ...prev, additional_work_config: nextAdd };
      if (key === 'lift') {
        nextForm.has_lift = nextAdd.lift;
      }
      return nextForm;
    });
  };

  const handleSaveConfig = async (e) => {
    if (e) e.preventDefault();
    if (!isManagement) {
      toast.error('Only authorized management personnel can edit timeline configuration');
      return;
    }
    setSaving(true);
    try {
      const res = await api.post(`/projects/${projectId}/timeline/config`, formData);
      const recon = res.data.reconciliation;
      if (recon) {
        toast.success(
          `Configuration saved! Active activities: ${recon.totalActive} (${recon.createdCount} new, ${recon.updatedCount} updated, ${recon.retainedCount} preserved)`,
          { duration: 5000 }
        );
      } else {
        toast.success('Building configuration saved and schedule reconciled');
      }
      if (onConfigSaved) onConfigSaved(res.data.config);
      if (onDraftGenerated) onDraftGenerated(res.data.reconciliation);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateDraft = async () => {
    if (!isManagement) {
      toast.error('Only authorized management personnel can generate schedules');
      return;
    }
    setGenerating(true);
    try {
      // Save configuration which automatically generates & reconciles activities
      const res = await api.post(`/projects/${projectId}/timeline/config`, formData);
      toast.success(`Schedule reconciled successfully (${res.data.reconciliation?.totalActive || 0} activities)!`);
      if (onConfigSaved) onConfigSaved(res.data.config);
      if (onDraftGenerated) onDraftGenerated(res.data.reconciliation);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to generate draft schedule');
    } finally {
      setGenerating(false);
    }
  };

  // Authoritative Structural Slab Breakdown Calculation
  const floorsCount = Math.max(1, parseInt(formData.floors_above_ground, 10) || 4);
  const basementsCount = Math.max(0, parseInt(formData.basement_count, 10) || 0);
  const upperParkCount = Math.max(0, parseInt(formData.upper_parking_count, 10) || 0);
  const hasTankSlab = formData.has_terrace_tank_slab !== false;

  const slabBreakdown = {
    basement: basementsCount,
    plinth: 1,
    podium: upperParkCount,
    habitable: floorsCount,
    terrace: 1,
    tank: hasTankSlab ? 1 : 0,
    total: basementsCount + 1 + upperParkCount + floorsCount + 1 + (hasTankSlab ? 1 : 0)
  };

  return (
    <div className="space-y-6">
      {/* Template Selector Card */}
      <div className="card bg-gradient-to-r from-orange-50/40 via-white to-slate-50 border-orange-100">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#E05A1E]/10 flex items-center justify-center text-[#E05A1E]">
              <Sparkles size={20} />
            </div>
            <div>
              <h4 className="text-sm font-bold text-[#1A1A1A]">Construction Template Library</h4>
              <p className="text-xs text-muted">Initialize timeline with tested architectural project structures</p>
            </div>
          </div>
          <div className="flex items-center gap-2 w-full md:w-auto">
            <select
              className="text-xs bg-white border border-[#EBEBEB] rounded-lg px-3 py-2 font-medium text-slate-700 focus:outline-none focus:border-[#E05A1E]"
              value={selectedTemplate}
              onChange={(e) => {
                setSelectedTemplate(e.target.value);
                if (e.target.value) handleApplyTemplate(e.target.value);
              }}
              disabled={!isManagement}
            >
              <option value="">Select a starting template...</option>
              {templates.map(t => (
                <option key={t.id} value={t.id}>{t.name} ({t.building_type})</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Configuration Form */}
      <div className="card space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-[#F0F0F0] pb-4 gap-3">
          <div>
            <h3 className="text-base font-bold text-[#1A1A1A] flex items-center gap-2">
              <Building size={18} className="text-[#E05A1E]" />
              Building Configuration & Automated Schedule Setup
            </h3>
            <p className="text-xs text-muted mt-0.5">
              Defines multi-storey floors, basements, upper parking, vertical transportation, and optional additional work
            </p>
          </div>
          <div className="flex flex-col sm:items-end gap-1">
            <span className="text-xs font-semibold px-2.5 py-1 bg-slate-100 text-slate-700 rounded-md">
              Total Structural Slabs: <strong className="text-[#E05A1E]">{slabBreakdown.total} Slabs</strong>
            </span>
            <span className="text-[10px] text-slate-500">
              (Basements: {slabBreakdown.basement}, Plinth: 1, Podium: {slabBreakdown.podium}, Habitable: {slabBreakdown.habitable}, Terrace: 1, Tank: {slabBreakdown.tank})
            </span>
            <span className={`text-[11px] font-medium px-2 py-0.5 rounded mt-0.5 ${floorsCount >= 3 ? 'bg-orange-50 text-[#E05A1E] border border-orange-200' : 'bg-slate-100 text-slate-600'}`}>
              {floorsCount >= 3 ? '★ 3rd-Floor Slab triggers Ground Brickwork (+1 calendar day)' : 'Ground Brickwork follows complete RCC (≤ G+2)'}
            </span>
          </div>
        </div>

        <form onSubmit={handleSaveConfig} className="space-y-6">
          {/* 1. Core Building Parameters */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Building Type</label>
              <select
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:border-[#E05A1E]"
                value={formData.building_type}
                onChange={(e) => setFormData({ ...formData, building_type: e.target.value })}
                disabled={!isManagement}
              >
                <option value="Residential Apartment">Residential Apartment</option>
                <option value="Commercial Complex">Commercial Complex</option>
                <option value="Mixed Use (Commercial + Residential)">Mixed Use (Commercial + Residential)</option>
                <option value="Independent Bungalow / Villa">Independent Bungalow / Villa</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Habitable Floors Above Ground (N)</label>
              <input
                type="number"
                min="1"
                max="50"
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 font-bold focus:outline-none focus:border-[#E05A1E]"
                value={formData.floors_above_ground}
                onChange={(e) => setFormData({ ...formData, floors_above_ground: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                disabled={!isManagement}
              />
              <p className="text-[10px] text-muted">Generates 1st to Nth floor columns, slabs, brickwork & finishing</p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Ground Floor Configuration</label>
              <select
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:border-[#E05A1E]"
                value={formData.ground_floor_config}
                onChange={(e) => setFormData({ ...formData, ground_floor_config: e.target.value })}
                disabled={!isManagement}
              >
                <option value="parking_and_rooms">Stilt Parking + Security / Guard Rooms</option>
                <option value="commercial_shops">Ground Floor Commercial Retail / Shops</option>
                <option value="full_parking">Full Stilt / Stacked Parking Only</option>
                <option value="residential">Residential Ground Floor Units</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Baseline Project Start Date</label>
              <input
                type="date"
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:border-[#E05A1E]"
                value={formData.start_date}
                onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                disabled={!isManagement}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Masonry Floor Progression Lag</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  max="30"
                  className="w-24 text-center text-xs font-bold bg-slate-50 border border-slate-200 rounded-lg px-2 py-2 text-slate-800 focus:outline-none focus:border-[#E05A1E]"
                  value={formData.masonry_lag_days}
                  onChange={(e) => setFormData({ ...formData, masonry_lag_days: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                  disabled={!isManagement}
                />
                <span className="text-[11px] text-slate-600 font-medium">calendar day(s) between floor brickwork starts</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Terrace Water Tank Slab (N+2 Rule)</label>
              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="has_terrace_tank_slab"
                  checked={formData.has_terrace_tank_slab}
                  onChange={(e) => setFormData({ ...formData, has_terrace_tank_slab: e.target.checked })}
                  disabled={!isManagement}
                  className="rounded text-[#E05A1E] focus:ring-[#E05A1E]"
                />
                <label htmlFor="has_terrace_tank_slab" className="text-xs font-medium text-slate-700 cursor-pointer">
                  Include Overhead Water Tank & Parapet Slab
                </label>
              </div>
            </div>
          </div>

          {/* 2. Configurable Basements & Parking Section */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-4">
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <Car size={15} className="text-[#E05A1E]" />
              Configurable Parking & Basements Setup
            </h4>
            
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Basement Counter */}
              <div className="bg-white p-3 rounded-lg border border-slate-200 space-y-2">
                <label className="text-xs font-bold text-slate-700 block">Number of Basements (Below Ground)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    max="5"
                    className="w-24 text-center text-sm font-bold bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-slate-900 focus:outline-none focus:border-[#E05A1E]"
                    value={formData.basement_count}
                    onChange={(e) => setFormData({ ...formData, basement_count: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                    disabled={!isManagement}
                  />
                  <span className="text-[11px] text-slate-600 font-medium">
                    {formData.basement_count > 0 ? `${formData.basement_count} level(s) (${Array.from({ length: formData.basement_count }, (_, i) => `B${i + 1}`).join(', ')})` : 'No Basements'}
                  </span>
                </div>
                <p className="text-[10px] text-muted">
                  Generates deep shoring, raft foundation, retaining walls, sump pump & B1/B2 slabs.
                </p>
              </div>

              {/* Upper-Floor Parking Counter */}
              <div className="bg-white p-3 rounded-lg border border-slate-200 space-y-2">
                <label className="text-xs font-bold text-slate-700 block">Upper-Floor / Podium Parking Levels</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    max="6"
                    className="w-24 text-center text-sm font-bold bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-slate-900 focus:outline-none focus:border-[#E05A1E]"
                    value={formData.upper_parking_count}
                    onChange={(e) => setFormData({ ...formData, upper_parking_count: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                    disabled={!isManagement}
                  />
                  <span className="text-[11px] text-slate-600 font-medium">
                    {formData.upper_parking_count > 0 ? `${formData.upper_parking_count} podium level(s)` : 'No Upper Parking'}
                  </span>
                </div>
                <p className="text-[10px] text-muted">
                  Generates podium parking slabs, vehicle access ramps, and heavy-duty epoxy finishes.
                </p>
              </div>

              {/* Ground-Level Stilt Parking Toggle */}
              <div className="bg-white p-3 rounded-lg border border-slate-200 space-y-2">
                <label className="text-xs font-bold text-slate-700 block">Ground Stilt Parking</label>
                <div className="pt-1.5">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-700">
                    <input
                      type="checkbox"
                      checked={formData.has_stilt_parking}
                      onChange={(e) => setFormData({ ...formData, has_stilt_parking: e.target.checked })}
                      disabled={!isManagement}
                      className="rounded text-[#E05A1E] focus:ring-[#E05A1E]"
                    />
                    <span>Include Ground Floor Stilt Parking</span>
                  </label>
                </div>
                <p className="text-[10px] text-muted">
                  Configures ground floor level for covered vehicle parking and driver amenities.
                </p>
              </div>
            </div>
          </div>

          {/* 3. Section 5: Additional Work Optional Activities */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-4">
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <Layers size={15} className="text-[#E05A1E]" />
              Additional Work — Optional Activities
            </h4>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Option 1: Elevation Work */}
              <div 
                onClick={() => handleToggleAdditional('elevation')}
                className={`bg-white p-3.5 rounded-lg border cursor-pointer transition-all ${formData.additional_work_config.elevation ? 'border-[#E05A1E] ring-1 ring-[#E05A1E]/30 bg-orange-50/20' : 'border-slate-200 hover:border-slate-300'}`}
              >
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.additional_work_config.elevation}
                    onChange={() => {}}
                    disabled={!isManagement}
                    className="rounded text-[#E05A1E] focus:ring-[#E05A1E] mt-0.5"
                  />
                  <div>
                    <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <Paintbrush size={13} className="text-[#E05A1E]" />
                      Elevation Work
                    </span>
                    <p className="text-[10px] text-muted mt-1 leading-snug">
                      External architectural facade, double-coat plastering & weatherproof texture paint.
                    </p>
                  </div>
                </label>
              </div>

              {/* Option 2: Lift Installation */}
              <div 
                onClick={() => handleToggleAdditional('lift')}
                className={`bg-white p-3.5 rounded-lg border cursor-pointer transition-all ${formData.additional_work_config.lift ? 'border-[#E05A1E] ring-1 ring-[#E05A1E]/30 bg-orange-50/20' : 'border-slate-200 hover:border-slate-300'}`}
              >
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.additional_work_config.lift}
                    onChange={() => {}}
                    disabled={!isManagement}
                    className="rounded text-[#E05A1E] focus:ring-[#E05A1E] mt-0.5"
                  />
                  <div>
                    <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <ArrowUpDown size={13} className="text-[#E05A1E]" />
                      Lift Installation
                    </span>
                    <p className="text-[10px] text-muted mt-1 leading-snug">
                      Lift pit waterproofing, shaft wall casting, machine room, assembly & safety licensing.
                    </p>
                  </div>
                </label>
              </div>

              {/* Option 3: Fire Fighting Work */}
              <div 
                onClick={() => handleToggleAdditional('fire')}
                className={`bg-white p-3.5 rounded-lg border cursor-pointer transition-all ${formData.additional_work_config.fire ? 'border-[#E05A1E] ring-1 ring-[#E05A1E]/30 bg-orange-50/20' : 'border-slate-200 hover:border-slate-300'}`}
              >
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.additional_work_config.fire}
                    onChange={() => {}}
                    disabled={!isManagement}
                    className="rounded text-[#E05A1E] focus:ring-[#E05A1E] mt-0.5"
                  />
                  <div>
                    <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <Flame size={13} className="text-rose-600" />
                      Fire Fighting Work
                    </span>
                    <p className="text-[10px] text-muted mt-1 leading-snug">
                      Wet riser main pipes, basement pump room, sprinklers & fire department NOC inspection.
                    </p>
                  </div>
                </label>
              </div>

              {/* Option 4: Solar Installation */}
              <div 
                onClick={() => handleToggleAdditional('solar')}
                className={`bg-white p-3.5 rounded-lg border cursor-pointer transition-all ${formData.additional_work_config.solar ? 'border-[#E05A1E] ring-1 ring-[#E05A1E]/30 bg-orange-50/20' : 'border-slate-200 hover:border-slate-300'}`}
              >
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.additional_work_config.solar}
                    onChange={() => {}}
                    disabled={!isManagement}
                    className="rounded text-[#E05A1E] focus:ring-[#E05A1E] mt-0.5"
                  />
                  <div>
                    <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <Sun size={13} className="text-amber-500" />
                      Solar Installation
                    </span>
                    <p className="text-[10px] text-muted mt-1 leading-snug">
                      Rooftop solar PV frame mounting, inverter synchronization & DISCOM net-metering.
                    </p>
                  </div>
                </label>
              </div>
            </div>
          </div>
        </form>

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-4 border-t border-[#F0F0F0] flex-wrap gap-3">
          <div className="text-xs text-muted flex items-center gap-1.5">
            <ShieldCheck size={14} className="text-emerald-600" />
            Saving configuration automatically generates and reconciles timeline activities safely preserving completed tasks.
          </div>
          {isManagement && (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleSaveConfig}
                disabled={saving}
                className="btn-primary text-xs py-2 px-5 flex items-center gap-2 shadow-sm"
              >
                <Save size={14} />
                {saving ? 'Saving & Generating...' : 'Save Configuration & Generate Schedule'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
