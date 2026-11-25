// client/src/components/projects/timeline/GanttExportModal.jsx
import React, { useState, useMemo } from 'react';
import {
  X,
  Printer,
  Download,
  Settings2,
  ZoomIn,
  ZoomOut,
  Maximize2,
  ChevronLeft,
  ChevronRight,
  Layers,
  Calendar,
  FileText,
  Sliders,
  CheckCircle2,
  HelpCircle,
  Sparkles,
  Info
} from 'lucide-react';
import toast from 'react-hot-toast';
import { buildPaginatedScheduleMatrix, generateA3GanttPdf } from '../../../utils/a3GanttPdfEngine';
import GanttPrintPreview from './GanttPrintPreview';

export default function GanttExportModal({ isOpen, onClose, tasks = [], project = {}, config = {} }) {
  if (!isOpen) return null;

  // Configuration options state
  const [paperSize, setPaperSize] = useState('A3'); // 'A3' or 'A4'
  const [orientation, setOrientation] = useState('landscape'); // 'landscape' or 'portrait'
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
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [zoomLevel, setZoomLevel] = useState(0.85); // 0.5, 0.75, 0.85, 1.0, 1.25
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
    includePageNumbers
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

  // Compute 2D pagination matrix whenever settings or tasks change
  const scheduleMatrix = useMemo(() => {
    return buildPaginatedScheduleMatrix(tasks, exportOptions, projectMetadata);
  }, [tasks, exportOptions, projectMetadata]);

  const { pages, totalPages, totalVerticalPages, totalHorizontalSlices } = scheduleMatrix;

  // Safe page navigation
  const safePageIndex = Math.min(currentPageIndex, Math.max(0, totalPages - 1));
  const activePageData = pages[safePageIndex] || pages[0];

  const handlePrevPage = () => {
    setCurrentPageIndex(prev => Math.max(0, prev - 1));
  };

  const handleNextPage = () => {
    setCurrentPageIndex(prev => Math.min(totalPages - 1, prev + 1));
  };

  // Export to Vector PDF
  const handleDownloadPdf = async () => {
    setIsExporting(true);
    const toastId = toast.loading('Generating vector A3 construction schedule PDF...');
    try {
      // Yield to event loop to allow loading toast render
      await new Promise(r => setTimeout(r, 60));

      const doc = generateA3GanttPdf(scheduleMatrix, exportOptions);
      const cleanProjectName = (projectMetadata.name || 'Project').replace(/[^a-zA-Z0-9_-]/g, '_');
      const filename = `${cleanProjectName}_Gantt_Schedule_${paperSize}_${orientation}.pdf`;

      doc.save(filename);
      toast.success(`Schedule exported successfully as ${paperSize} PDF`, { id: toastId });
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
      <div className="bg-slate-100 rounded-2xl shadow-2xl border border-slate-300 w-full max-w-[1540px] h-[95vh] flex flex-col overflow-hidden animate-in fade-in duration-200">
        
        {/* Top Header Bar */}
        <div className="bg-slate-900 text-white px-5 py-3.5 flex items-center justify-between border-b border-slate-800 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#E05A1E] flex items-center justify-center font-bold text-white shadow-sm">
              <Printer size={16} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm tracking-tight">A3 Construction Schedule Exporter</h3>
                <span className="bg-slate-800 text-[#E05A1E] border border-[#E05A1E]/30 text-[10px] font-mono px-2 py-0.5 rounded-full font-bold">
                  Print-Ready Layout
                </span>
              </div>
              <p className="text-xs text-slate-400">
                {projectMetadata.name} · {tasks.length} Activities · {totalPages} Paginated Sheet{totalPages > 1 ? 's' : ''}
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
              <span>{isExporting ? 'Generating PDF...' : `Download ${paperSize} PDF`}</span>
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
              
              {/* Paper & Orientation Section */}
              <div className="space-y-2.5">
                <label className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <Sliders size={13} className="text-[#E05A1E]" />
                  Paper Size & Orientation
                </label>
                
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPaperSize('A3')}
                    className={`py-2 px-3 rounded-lg border text-xs font-semibold flex items-center justify-between transition-all ${
                      paperSize === 'A3'
                        ? 'border-[#E05A1E] bg-orange-50 text-[#E05A1E] shadow-2xs'
                        : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <span>A3 (Plotter/Arch)</span>
                    <span className="text-[10px] text-muted">420×297</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaperSize('A4')}
                    className={`py-2 px-3 rounded-lg border text-xs font-semibold flex items-center justify-between transition-all ${
                      paperSize === 'A4'
                        ? 'border-[#E05A1E] bg-orange-50 text-[#E05A1E] shadow-2xs'
                        : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <span>A4 (Office/Desktop)</span>
                    <span className="text-[10px] text-muted">297×210</span>
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setOrientation('landscape')}
                    className={`py-1.5 px-3 rounded-lg border text-xs font-semibold text-center transition-all ${
                      orientation === 'landscape'
                        ? 'border-[#E05A1E] bg-orange-50 text-[#E05A1E]'
                        : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    Landscape (Default)
                  </button>
                  <button
                    type="button"
                    onClick={() => setOrientation('portrait')}
                    className={`py-1.5 px-3 rounded-lg border text-xs font-semibold text-center transition-all ${
                      orientation === 'portrait'
                        ? 'border-[#E05A1E] bg-orange-50 text-[#E05A1E]'
                        : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    Portrait
                  </button>
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
                    <option value="auto">Automatic (Intelligent Fit)</option>
                    <option value="monthly">Monthly View (Calendar Months)</option>
                    <option value="weekly">Weekly View (7-Day Subdivisions)</option>
                  </select>
                </div>

                <div className="space-y-1 pt-1">
                  <span className="text-[11px] font-semibold text-slate-600 block">Activity Grouping:</span>
                  <select
                    value={activityGrouping}
                    onChange={(e) => setActivityGrouping(e.target.value)}
                    className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 text-slate-700 focus:outline-none focus:border-[#E05A1E]"
                  >
                    <option value="groups">Construction Groups (RCC, Masonry, etc.)</option>
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
                    <span>Include Activity Sidebar</span>
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
                    <span>Include Start & End Dates</span>
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
                    <span>Include Page & Sheet Numbers</span>
                  </label>
                </div>
              </div>

              {/* 2D Pagination Summary Card */}
              <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 text-xs space-y-1.5">
                <div className="flex items-center justify-between font-bold text-slate-800">
                  <span className="flex items-center gap-1">
                    <Info size={13} className="text-[#E05A1E]" />
                    Pagination Matrix:
                  </span>
                  <span className="text-[#E05A1E] font-mono">{totalPages} Total Page{totalPages > 1 ? 's' : ''}</span>
                </div>
                <div className="text-[11px] text-slate-500 space-y-0.5">
                  <p>• Vertical Sheets (Activity Rows): <strong>{totalVerticalPages}</strong></p>
                  <p>• Horizontal Slices (Date Periods): <strong>{totalHorizontalSlices}</strong></p>
                  <p>• Current View: Sheet R{activePageData?.rowSheetIndex} · C{activePageData?.timelineSliceIndex}</p>
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
                <span>{isExporting ? 'Generating PDF...' : `Download ${paperSize} PDF`}</span>
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

          {/* ─── Right Document Viewer & Navigation ─────────────────────── */}
          <div className="flex-1 flex flex-col overflow-hidden bg-slate-200/90 relative">
            
            {/* Viewer Navigation Toolbar */}
            <div className="bg-white px-4 py-2 border-b border-slate-300 flex items-center justify-between text-xs z-10 flex-shrink-0">
              {/* Page Navigator */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePrevPage}
                  disabled={safePageIndex === 0}
                  className="p-1 rounded bg-slate-100 border border-slate-300 text-slate-700 hover:bg-slate-200 disabled:opacity-30 disabled:pointer-events-none"
                  title="Previous Page"
                >
                  <ChevronLeft size={16} />
                </button>

                <span className="font-semibold text-slate-700 text-xs">
                  Page <span className="font-bold text-slate-900">{safePageIndex + 1}</span> of <span className="font-bold text-slate-900">{totalPages}</span>
                </span>

                <button
                  type="button"
                  onClick={handleNextPage}
                  disabled={safePageIndex >= totalPages - 1}
                  className="p-1 rounded bg-slate-100 border border-slate-300 text-slate-700 hover:bg-slate-200 disabled:opacity-30 disabled:pointer-events-none"
                  title="Next Page"
                >
                  <ChevronRight size={16} />
                </button>

                <div className="h-4 w-px bg-slate-200 mx-1" />

                <span className="text-[11px] text-slate-500 hidden sm:inline">
                  Period: <strong>{activePageData?.slice?.label}</strong>
                </span>
              </div>

              {/* Zoom Controls */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setZoomLevel(prev => Math.max(0.4, prev - 0.15))}
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
                  onClick={() => setZoomLevel(prev => Math.min(1.8, prev + 0.15))}
                  className="p-1 rounded bg-slate-100 border border-slate-300 text-slate-700 hover:bg-slate-200"
                  title="Zoom In"
                >
                  <ZoomIn size={15} />
                </button>

                <button
                  type="button"
                  onClick={() => setZoomLevel(0.85)}
                  className="text-[11px] font-semibold px-2 py-1 bg-slate-100 border border-slate-300 rounded text-slate-700 hover:bg-slate-200 ml-1"
                >
                  Fit
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
