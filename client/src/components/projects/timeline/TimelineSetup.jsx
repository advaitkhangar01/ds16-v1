// client/src/components/projects/timeline/TimelineSetup.jsx
import React, { useState, useEffect } from 'react';
import { Layers, Play, CheckCircle2, Save, Building, ShieldCheck, Sparkles, FileText } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../../api/client';

export default function TimelineSetup({ projectId, config, onConfigSaved, onDraftGenerated, isManagement }) {
  const [formData, setFormData] = useState({
    floors_above_ground: 4,
    ground_floor_config: 'parking_and_rooms',
    has_terrace_tank_slab: true,
    parking_rooms_config: 'Standard',
    building_type: 'Residential Apartment',
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
        parking_floors: Array.isArray(config.parking_floors) ? config.parking_floors : [],
        start_date: config.start_date || new Date().toISOString().split('T')[0]
      });
    }
  }, [config]);

  const toggleParkingFloor = (type, name) => {
    setFormData(prev => {
      const current = prev.parking_floors || [];
      const exists = current.some(f => f.type === type);
      const updated = exists 
        ? current.filter(f => f.type !== type)
        : [...current, { type, name }];
      return { ...prev, parking_floors: updated };
    });
  };

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
  const slabStagesCount = formData.has_terrace_tank_slab ? floorsCount + 2 : floorsCount + 1;

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
        <div className="flex items-center justify-between border-b border-[#F0F0F0] pb-4">
          <div>
            <h3 className="text-base font-bold text-[#1A1A1A] flex items-center gap-2">
              <Building size={18} className="text-[#E05A1E]" />
              Building Configuration & Slab Generation Setup
            </h3>
            <p className="text-xs text-muted mt-0.5">
              Defines multi-storey floor rules and sequencing for automated activity drafting
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="text-xs font-semibold px-2.5 py-1 bg-slate-100 text-slate-700 rounded-md">
              Slab Calculation: <strong className="text-[#E05A1E]">{slabStagesCount} Slabs</strong> ({formData.has_terrace_tank_slab ? 'N + 2 rule' : 'N + 1 rule'})
            </span>
            <span className={`text-[11px] font-medium px-2 py-0.5 rounded ${floorsCount >= 3 ? 'bg-orange-50 text-[#E05A1E] border border-orange-200' : 'bg-slate-100 text-slate-600'}`}>
              {floorsCount >= 3 ? '★ 3rd-Floor Slab triggers Ground Brickwork (+1 day)' : 'Manual Ground Brickwork Scheduling (≤ G+2)'}
            </span>
          </div>
        </div>

        <form onSubmit={handleSaveConfig} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
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
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Floors Above Ground (N)</label>
            <input
              type="number"
              min="1"
              max="40"
              className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:border-[#E05A1E]"
              value={formData.floors_above_ground}
              onChange={(e) => setFormData({ ...formData, floors_above_ground: parseInt(e.target.value, 10) || 1 })}
              disabled={!isManagement}
            />
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
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Terrace Water Tank Slab (N+2 Rule)</label>
            <div className="flex items-center gap-3 pt-1">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={formData.has_terrace_tank_slab}
                  onChange={(e) => setFormData({ ...formData, has_terrace_tank_slab: e.target.checked })}
                  disabled={!isManagement}
                  className="rounded text-[#E05A1E] focus:ring-[#E05A1E]"
                />
                Include Overhead Water Tank & Lift Machine Slab (+1 Slab)
              </label>
            </div>
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

          <div className="space-y-1.5 md:col-span-2 lg:col-span-3 pt-2 border-t border-slate-100">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center justify-between">
              <span>Parking Floors Configuration</span>
              <span className="text-[11px] font-normal text-slate-500 lowercase">
                (Non-FSI / non-saleable builtup: B1, B2, Stilt, Podium Parking)
              </span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
              {[
                { type: 'basement_2', name: 'Basement 2' },
                { type: 'basement_1', name: 'Basement 1' },
                { type: 'stilt', name: 'Stilt Parking' },
                { type: 'upper_parking', name: 'Upper-floor Parking (Podium)' }
              ].map(opt => {
                const isChecked = (formData.parking_floors || []).some(f => f.type === opt.type);
                return (
                  <label
                    key={opt.type}
                    className={`flex items-center gap-2 p-2.5 rounded-lg border text-xs font-medium cursor-pointer transition-all ${
                      isChecked
                        ? 'bg-orange-50/70 border-orange-200 text-orange-950 font-semibold'
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleParkingFloor(opt.type, opt.name)}
                      disabled={!isManagement}
                      className="rounded text-[#E05A1E] focus:ring-[#E05A1E]"
                    />
                    <span>{opt.name}</span>
                  </label>
                );
              })}
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
