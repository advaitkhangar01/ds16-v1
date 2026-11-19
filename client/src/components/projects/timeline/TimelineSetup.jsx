// client/src/components/projects/timeline/TimelineSetup.jsx
import React, { useState, useEffect } from 'react';
import { Layers, Play, CheckCircle2, Save, Building, ShieldCheck, Sparkles, FileText, ArrowUpDown, Car, HelpCircle } from 'lucide-react';
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
    parking_floors: [],
    start_date: new Date().toISOString().split('T')[0]
  });
  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (config) {
      setFormData({
        floors_above_ground: config.floors_above_ground || 4,
        ground_floor_config: config.ground_floor_config || 'parking_and_rooms',
        has_terrace_tank_slab: config.has_terrace_tank_slab !== false,
        parking_rooms_config: config.parking_rooms_config || 'Standard',
        building_type: config.building_type || 'Residential Apartment',
        basement_count: config.basement_count !== undefined ? parseInt(config.basement_count, 10) : 0,
        upper_parking_count: config.upper_parking_count !== undefined ? parseInt(config.upper_parking_count, 10) : 0,
        has_stilt_parking: config.has_stilt_parking !== false,
        has_lift: config.has_lift !== false,
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

  const handleSaveConfig = async (e) => {
    if (e) e.preventDefault();
    if (!isManagement) {
      toast.error('Only authorized management personnel can edit timeline configuration');
      return;
    }
    setSaving(true);
    try {
      const res = await api.post(`/projects/${projectId}/timeline/config`, formData);
      toast.success('Timeline configuration saved');
      if (onConfigSaved) onConfigSaved(res.data.config);
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
      // First save configuration
      await api.post(`/projects/${projectId}/timeline/config`, formData);
      // Then generate draft
      const res = await api.post(`/projects/${projectId}/timeline/generate-draft`, formData);
      toast.success(`Generated ${res.data.count} draft activities!`);
      if (onDraftGenerated) onDraftGenerated(res.data.tasks);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to generate draft schedule');
    } finally {
      setGenerating(false);
    }
  };

  const floorsCount = parseInt(formData.floors_above_ground, 10) || 1;
  const basementsCount = parseInt(formData.basement_count, 10) || 0;
  const upperParkCount = parseInt(formData.upper_parking_count, 10) || 0;
  
  // Total structural slabs
  const totalSlabsCount = basementsCount + 1 + upperParkCount + floorsCount + (formData.has_terrace_tank_slab ? 1 : 0);

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
              Defines multi-storey floors, basements, upper parking, and elevator activities
            </p>
          </div>
          <div className="flex flex-col sm:items-end gap-1">
            <span className="text-xs font-semibold px-2.5 py-1 bg-slate-100 text-slate-700 rounded-md">
              Total Slabs: <strong className="text-[#E05A1E]">{totalSlabsCount} Slabs</strong> (Basement: {basementsCount}, Ground: 1, Podium: {upperParkCount}, Habitable: {floorsCount})
            </span>
            <span className={`text-[11px] font-medium px-2 py-0.5 rounded ${floorsCount >= 3 ? 'bg-orange-50 text-[#E05A1E] border border-orange-200' : 'bg-slate-100 text-slate-600'}`}>
              {floorsCount >= 3 ? '★ 3rd-Floor Slab triggers Ground Brickwork (+1 day)' : 'Manual Ground Brickwork Scheduling (≤ G+2)'}
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
                onChange={(e) => setFormData({ ...formData, floors_above_ground: parseInt(e.target.value, 10) || 1 })}
                disabled={!isManagement}
              />
              <p className="text-[10px] text-muted">Generates 1st to Nth floor columns, slabs, brickwork & services</p>
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

          {/* 3. Dedicated Lift / Elevator System Checkbox */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <ArrowUpDown size={15} className="text-[#E05A1E]" />
              Vertical Transportation & Elevator System
            </h4>
            <div className="bg-white p-3 rounded-lg border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  id="has_lift"
                  checked={formData.has_lift}
                  onChange={(e) => setFormData({ ...formData, has_lift: e.target.checked })}
                  disabled={!isManagement}
                  className="rounded text-[#E05A1E] focus:ring-[#E05A1E] mt-0.5"
                />
                <div>
                  <span className="text-xs font-bold text-slate-900 block">
                    Include Lift / Elevator Construction & Commissioning
                  </span>
                  <p className="text-[11px] text-muted mt-0.5">
                    Generates dedicated tasks: Lift Pit excavation & box waterproofing, RCC Lift Well Shaft, Lift Machine Room pedestals, mechanical/electrical installation, and government safety licensing & commissioning.
                  </p>
                </div>
              </label>

              <span className={`text-[11px] font-bold px-2 py-0.5 rounded shrink-0 ${formData.has_lift ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-500'}`}>
                {formData.has_lift ? 'Elevator Enabled' : 'No Elevator'}
              </span>
            </div>
          </div>
        </form>

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-4 border-t border-[#F0F0F0] flex-wrap gap-3">
          <div className="text-xs text-muted flex items-center gap-1.5">
            <ShieldCheck size={14} className="text-emerald-600" />
            Generating draft will not alter currently published project schedules.
          </div>
          {isManagement && (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleSaveConfig}
                disabled={saving}
                className="btn-secondary text-xs"
              >
                <Save size={14} />
                {saving ? 'Saving...' : 'Save Configuration'}
              </button>
              <button
                type="button"
                onClick={handleGenerateDraft}
                disabled={generating}
                className="btn-primary text-xs"
              >
                <Play size={14} />
                {generating ? 'Generating Activities...' : 'Generate Draft Activities'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
