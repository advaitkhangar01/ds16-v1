// client/src/components/projects/timeline/GanttExportModal.jsx
import React, { useState, useMemo } from 'react';
import {
  X,
  Printer,
  Download,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Layers,
  Calendar,
  FileText,
  Sliders,
  CheckCircle2,
  Info,
  Sparkles
} from 'lucide-react';
import toast from 'react-hot-toast';
import { buildSinglePageScheduleMatrix, generateA3GanttPdf } from '../../../utils/a3GanttPdfEngine';
import GanttPrintPreview from './GanttPrintPreview';

export default function GanttExportModal({ isOpen, onClose, tasks = [], project = {}, config = {} }) {
  if (!isOpen) return null;

  // Configuration options state
  // 'custom' = uncompressed continuous plotter (default)
  // 'A3' = fit to single A3 sheet
  // 'A4' = fit to single A4 sheet
  const [paperSize, setPaperSize] = useState('custom');
  const [orientation, setOrientation] = useState('landscape');
  const [timelineScale, setTimelineScale] = useState('auto'); // 'auto', 'monthly', 'weekly'
  const [activityGrouping, setActivityGrouping] = useState('groups'); // 'groups', 'floors', 'none'

  // Feature Toggles
  const [includeSidebar, setIncludeSidebar] = useState(true);
  const [includeDuration, setIncludeDuration] = useState(true);
  const [includeDates, setIncludeDates] = useState(true);
  const [includeStatus, setIncludeStatus] = useState(true);
  const [includeColorLegend, setIncludeColorLegend] = useState(true);
  const [includeProjectDetails, setIncludeProjectDetails] = useState(true);
  const [includePageNumbers, setIncludePageNumbers] = useState(true);

  // Preview Viewport Controls
  const [zoomLevel, setZoomLevel] = useState(0.55); // Default comfortable overview
  const [isExporting, setIsExporting] = useState(false);

  // Consolidated options object
  const exportOptions = useMemo(() => ({
    paperSize,
    orientation,
    timelineScale,
    activityGrouping,
    includeSidebar,
    includeDuration,
    includeDates,
    includeStatus,
    includeColorLegend,
    includeProjectDetails,
    includePageNumbers,
    fitToPaper: paperSize !== 'custom'
  }), [
    paperSize,
    orientation,
    timelineScale,
    activityGrouping,
    includeSidebar,
    includeDuration,
    includeDates,
    includeStatus,
    includeColorLegend,
    includeProjectDetails,
    includePageNumbers
  ]);

  // Combined project metadata
  const projectMetadata = useMemo(() => ({
    name: project.name || 'Construction Project',
    client_name: project.client_name || project.client_display_name || 'Design Studio 16 Client',
    location: project.location || project.city || 'Project Site',
    start_date: project.start_date || (tasks[0] ? tasks[0].planned_start_date : null),
    published_version: config.published_version || 1
  }), [project, tasks, config]);

  // Compute Single-Page schedule composition
  const scheduleMatrix = useMemo(() => {
    return buildSinglePageScheduleMatrix(tasks, exportOptions, projectMetadata);
  }, [tasks, exportOptions, projectMetadata]);

  const activePageData = scheduleMatrix.pages[0];
  const { layoutDimensions } = scheduleMatrix;

  // Export to Single-Page Vector PDF
  const handleDownloadPdf = async () => {
    setIsExporting(true);
    const toastId = toast.loading('Generating complete single-page Gantt chart PDF...');
    try {
      // Yield to event loop to allow loading toast render
      await new Promise(r => setTimeout(r, 60));

      const doc = generateA3GanttPdf(scheduleMatrix, exportOptions);
      const cleanProjectName = (projectMetadata.name || 'Project').replace(/[^a-zA-Z0-9_-]/g, '_');
      const filename = `${cleanProjectName}_Complete_Schedule_${layoutDimensions.width}x${layoutDimensions.height}mm.pdf`;

      doc.save(filename);
      toast.success(`Complete schedule exported successfully as 1-page PDF (${layoutDimensions.width}×${layoutDimensions.height} mm)`, { id: toastId });
    } catch (err) {
      console.error('PDF export error:', err);
      toast.error(err.message || 'Failed to generate PDF', { id: toastId });
    } finally {
      setIsExporting(false);
    }
  };

  // Direct Browser Print
  const handlePrintSchedule = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4">
      <div className="bg-slate-100 rounded-2xl shadow-2xl border border-slate-300 w-full max-w-[1580px] h-[95vh] flex flex-col overflow-hidden animate-in fade-in duration-200">
        
        {/* Top Header Bar */}
        <div className="bg-slate-900 text-white px-5 py-3.5 flex items-center justify-between border-b border-slate-800 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#E05A1E] flex items-center justify-center font-bold text-white shadow-sm">
              <Printer size={16} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm tracking-tight">Complete Construction Schedule Exporter</h3>
                <span className="bg-emerald-950 text-emerald-400 border border-emerald-500/30 text-[10px] font-mono px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                  <CheckCircle2 size={10} /> Exactly 1 Complete Page
                </span>
              </div>
              <p className="text-xs text-slate-400">
                {projectMetadata.name} · {tasks.length} Activities · Entire Timeline {activePageData?.slice?.label}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={handleDownloadPdf}
              disabled={isExporting}
              className="btn-primary text-xs py-1.5 px-3.5 flex items-center gap-1.5 shadow-sm disabled:opacity-50"
            >
              <Download size={14} />
              <span>{isExporting ? 'Generating PDF...' : 'Download Complete PDF (1 Page)'}</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
              title="Close Exporter"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Main Body: Configuration Sidebar (Left) + Document Viewer (Right) */}
        <div className="flex-1 flex overflow-hidden">
          
          {/* ─── Left Configuration Sidebar ─────────────────────────────── */}
          <div className="w-80 md:w-88 border-r border-slate-200 bg-white flex flex-col justify-between overflow-y-auto flex-shrink-0 p-4 space-y-5">
            <div className="space-y-5">
              
              {/* Paper Format Section */}
              <div className="space-y-2.5">
                <label className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <Sliders size={13} className="text-[#E05A1E]" />
                  Page Sizing & Layout Model
                </label>
                
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => setPaperSize('custom')}
                    className={`w-full p-2.5 rounded-xl border text-left transition-all ${
                      paperSize === 'custom'
                        ? 'border-[#E05A1E] bg-orange-50/70 shadow-xs ring-1 ring-[#E05A1E]/30'
                        : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900 flex items-center gap-1">
                        Continuous Full Plotter
                        <span className="bg-[#E05A1E] text-white text-[9px] px-1.5 py-0.2 rounded font-bold">Recommended</span>
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Auto-calculates uncompressed dimensions ({layoutDimensions.width} × {layoutDimensions.height} mm) so all 283 activities and dates remain 100% legible.
                    </p>
                  </button>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setPaperSize('A3')}
                      className={`p-2 rounded-lg border text-xs font-semibold flex flex-col text-left transition-all ${
                        paperSize === 'A3'
                          ? 'border-[#E05A1E] bg-orange-50 text-[#E05A1E]'
                          : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <span className="font-bold">A3 Single Sheet</span>
                      <span className="text-[10px] text-slate-400">420 × 297 mm</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPaperSize('A4')}
                      className={`p-2 rounded-lg border text-xs font-semibold flex flex-col text-left transition-all ${
                        paperSize === 'A4'
                          ? 'border-[#E05A1E] bg-orange-50 text-[#E05A1E]'
                          : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <span className="font-bold">A4 Single Sheet</span>
                      <span className="text-[10px] text-slate-400">297 × 210 mm</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Timeline Scale & Grouping */}
              <div className="space-y-2.5 pt-2 border-t border-slate-100">
                <label className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <Calendar size={13} className="text-[#E05A1E]" />
                  Timeline Scale & Grouping
                </label>

                <div className="space-y-1">
                  <span className="text-[11px] font-semibold text-slate-600 block">Date Scale:</span>
                  <select
                    value={timelineScale}
                    onChange={(e) => setTimelineScale(e.target.value)}
                    className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 text-slate-700 focus:outline-none focus:border-[#E05A1E]"
                  >
                    <option value="auto">Automatic (Optimal Fit)</option>
                    <option value="weekly">Weekly View (Detailed 7-Day Subdivisions)</option>
                    <option value="monthly">Monthly View (Calendar Months)</option>
                  </select>
                </div>

                <div className="space-y-1 pt-1">
                  <span className="text-[11px] font-semibold text-slate-600 block">Activity Grouping:</span>
                  <select
                    value={activityGrouping}
                    onChange={(e) => setActivityGrouping(e.target.value)}
                    className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 text-slate-700 focus:outline-none focus:border-[#E05A1E]"
                  >
                    <option value="groups">Construction Groups (Site, RCC, Masonry, etc.)</option>
                    <option value="floors">Floor-wise (Level Hierarchy)</option>
                    <option value="none">No Grouping (Flat Sequential)</option>
                  </select>
                </div>
              </div>

              {/* Document Inclusions / Toggles */}
              <div className="space-y-2.5 pt-2 border-t border-slate-100">
                <label className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <Layers size={13} className="text-[#E05A1E]" />
                  Include in Export
                </label>

                <div className="space-y-2 text-xs text-slate-700">
                  <label className="flex items-center gap-2 cursor-pointer hover:text-slate-900">
                    <input
                      type="checkbox"
                      checked={includeSidebar}
                      onChange={(e) => setIncludeSidebar(e.target.checked)}
                      className="rounded border-slate-300 text-[#E05A1E] focus:ring-[#E05A1E]"
                    />
                    <span>Include Activity Sidebar Columns</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer hover:text-slate-900">
                    <input
                      type="checkbox"
                      checked={includeDuration}
                      onChange={(e) => setIncludeDuration(e.target.checked)}
                      className="rounded border-slate-300 text-[#E05A1E] focus:ring-[#E05A1E]"
                    />
                    <span>Include Task Duration (Days)</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer hover:text-slate-900">
                    <input
                      type="checkbox"
                      checked={includeDates}
                      onChange={(e) => setIncludeDates(e.target.checked)}
                      className="rounded border-slate-300 text-[#E05A1E] focus:ring-[#E05A1E]"
                    />
                    <span>Include Planned Start & Finish Dates</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer hover:text-slate-900">
                    <input
                      type="checkbox"
                      checked={includeStatus}
                      onChange={(e) => setIncludeStatus(e.target.checked)}
                      className="rounded border-slate-300 text-[#E05A1E] focus:ring-[#E05A1E]"
                    />
                    <span>Include Status Indicators & Colors</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer hover:text-slate-900">
                    <input
                      type="checkbox"
                      checked={includeColorLegend}
                      onChange={(e) => setIncludeColorLegend(e.target.checked)}
                      className="rounded border-slate-300 text-[#E05A1E] focus:ring-[#E05A1E]"
                    />
                    <span>Include Colour Legend & Footnotes</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer hover:text-slate-900">
                    <input
                      type="checkbox"
                      checked={includeProjectDetails}
                      onChange={(e) => setIncludeProjectDetails(e.target.checked)}
                      className="rounded border-slate-300 text-[#E05A1E] focus:ring-[#E05A1E]"
                    />
                    <span>Include DS16 Header & Project Info</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer hover:text-slate-900">
                    <input
                      type="checkbox"
                      checked={includePageNumbers}
                      onChange={(e) => setIncludePageNumbers(e.target.checked)}
                      className="rounded border-slate-300 text-[#E05A1E] focus:ring-[#E05A1E]"
                    />
                    <span>Include Page 1 of 1 Indicator</span>
                  </label>
                </div>
              </div>

              {/* Single Page Composition Summary Card */}
              <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 text-xs space-y-1.5">
                <div className="flex items-center justify-between font-bold text-slate-800">
                  <span className="flex items-center gap-1 text-slate-900">
                    <Info size={13} className="text-[#E05A1E]" />
                    Single-Page Composition:
                  </span>
                  <span className="text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded font-mono font-bold">
                    Exactly 1 Page
                  </span>
                </div>
                <div className="text-[11px] text-slate-600 space-y-1 pt-1">
                  <p>• Activities: <strong>{tasks.length} tasks</strong> across all construction groups</p>
                  <p>• Timeline Span: <strong>{activePageData?.slice?.label}</strong> ({activePageData?.slice?.totalDays} days)</p>
                  <p>• Document Size: <strong>{layoutDimensions.width} mm × {layoutDimensions.height} mm</strong> ({activePageData?.orientation})</p>
                  <p className="text-emerald-600 font-semibold">• Zero pagination fragmentation: entire schedule in one continuous view</p>
                </div>
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="pt-4 border-t border-slate-100 flex flex-col gap-2">
              <button
                type="button"
                onClick={handleDownloadPdf}
                disabled={isExporting}
                className="w-full btn-primary text-xs py-2.5 flex items-center justify-center gap-2 shadow-xs disabled:opacity-50"
              >
                <Download size={14} />
                <span>{isExporting ? 'Generating PDF...' : 'Download Complete PDF (1 Page)'}</span>
              </button>

              <button
                type="button"
                onClick={onClose}
                className="w-full text-xs font-semibold py-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors text-center"
              >
                Cancel & Return
              </button>
            </div>
          </div>

          {/* ─── Right Document Viewer & Controls ───────────────────────── */}
          <div className="flex-1 flex flex-col overflow-hidden bg-slate-200/90 relative">
            
            {/* Viewer Navigation & Zoom Toolbar */}
            <div className="bg-white px-4 py-2 border-b border-slate-300 flex items-center justify-between text-xs z-10 flex-shrink-0">
              
              {/* Status Badge */}
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold text-xs">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  Continuous Composition Preview (1 Page)
                </span>

                <span className="text-[11px] text-slate-500 hidden sm:inline">
                  Timeline: <strong>{activePageData?.slice?.label}</strong>
                </span>
              </div>

              {/* Zoom Controls */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setZoomLevel(prev => Math.max(0.2, +(prev - 0.1).toFixed(2)))}
                  className="p-1 rounded bg-slate-100 border border-slate-300 text-slate-700 hover:bg-slate-200"
                  title="Zoom Out"
                >
                  <ZoomOut size={15} />
                </button>

                <span className="text-[11px] font-mono text-slate-600 w-12 text-center">
                  {Math.round(zoomLevel * 100)}%
                </span>

                <button
                  type="button"
                  onClick={() => setZoomLevel(prev => Math.min(1.5, +(prev + 0.1).toFixed(2)))}
                  className="p-1 rounded bg-slate-100 border border-slate-300 text-slate-700 hover:bg-slate-200"
                  title="Zoom In"
                >
                  <ZoomIn size={15} />
                </button>

                <div className="h-4 w-px bg-slate-200 mx-1" />

                <button
                  type="button"
                  onClick={() => setZoomLevel(0.35)}
                  className="text-[11px] font-semibold px-2 py-1 bg-slate-100 border border-slate-300 rounded text-slate-700 hover:bg-slate-200"
                  title="Fit whole chart height on screen"
                >
                  Fit View
                </button>

                <button
                  type="button"
                  onClick={() => setZoomLevel(1.0)}
                  className="text-[11px] font-semibold px-2 py-1 bg-slate-100 border border-slate-300 rounded text-slate-700 hover:bg-slate-200"
                  title="100% full scale inspection"
                >
                  100%
                </button>
              </div>
            </div>

            {/* Document Sheet Canvas Preview */}
            <div className="flex-1 overflow-auto">
              <GanttPrintPreview
                pageData={activePageData}
                options={exportOptions}
                zoom={zoomLevel}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
