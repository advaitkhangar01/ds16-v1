// scripts/test_a3_gantt_engine.mjs
// Verification suite for the Single-Page Full-Composition Gantt Exporter Engine
// Explicitly validates the user acceptance criterion:
// 283 activities spanning Nov 2026 to Apr 2027 present together on exactly ONE PDF page.

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolve project root
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Import engine from client codebase
const enginePath = path.join(rootDir, 'client', 'src', 'utils', 'a3GanttPdfEngine.js');
const {
  buildSinglePageScheduleMatrix,
  generateA3GanttPdf,
  organizeTaskRows,
  calculateFullTimeline,
  STATUS_COLORS
} = await import(`file://${enginePath}`);

console.log('🧪 Running Complete Single-Page Gantt Exporter Engine Tests...\n');

// ─── Test Case: 283 Construction Activities (Nov 2026 – Apr 2027) ─────────────

console.log('1. Generating 283 Realistic Construction Activities (Nov 2026 – Apr 2027)...');

const SECTIONS = ['Site Preparation', 'RCC Work', 'Masonry Work', 'Finishing Work', 'Additional Work'];
const FLOORS = ['Substructure', 'Plinth Level', 'Ground Floor', '1st Floor', '2nd Floor', '3rd Floor', 'Terrace'];
const STATUSES = ['Completed', 'In Progress', 'Not Started', 'On Hold', 'Overdue'];

const mockTasks = [];
const startDateBase = new Date(2026, 10, 2); // 2 Nov 2026
const endDateBase = new Date(2027, 3, 28);   // 28 Apr 2027
const totalSpanDays = Math.round((endDateBase - startDateBase) / 86400000);

for (let i = 0; i < 283; i++) {
  const sec = SECTIONS[i % SECTIONS.length];
  const flr = FLOORS[i % FLOORS.length];
  const status = STATUSES[i % STATUSES.length];

  // Distribute start dates evenly across Nov 2026 – Apr 2027
  const dayOffset = Math.floor((i / 283) * (totalSpanDays - 15));
  const tStart = new Date(startDateBase.getTime() + dayOffset * 86400000);
  const duration = (i % 12) + 3;
  const tFinish = new Date(tStart.getTime() + duration * 86400000);

  const task = {
    id: i + 1,
    task_name: `Construction Task #${i + 1} - ${sec} Detailed Execution for ${flr}`,
    section_name: sec,
    floor_zone: flr,
    floor_order: FLOORS.indexOf(flr),
    order_index: i + 1,
    planned_start_date: tStart.toISOString().split('T')[0],
    planned_finish_date: tFinish.toISOString().split('T')[0],
    duration_days: duration,
    status: status,
    is_milestone: i % 25 === 0
  };

  // Add realistic actual site execution variations:
  if (i % 7 === 1) {
    // 1) Delayed actual execution: starts 2 days late, finishes 4 days late
    const actStart = new Date(tStart.getTime() + 2 * 86400000);
    const actFinish = new Date(tFinish.getTime() + 4 * 86400000);
    task.actual_start_date = actStart.toISOString().split('T')[0];
    task.actual_finish_date = actFinish.toISOString().split('T')[0];
    task.photo_path = `uploads/projects/1/timeline_photos/photo_${i}.jpg`;
  } else if (i % 7 === 2) {
    // 2) Ongoing execution: started 1 day ago, not yet finished
    const actStart = new Date(tStart.getTime() - 1 * 86400000);
    task.actual_start_date = actStart.toISOString().split('T')[0];
    task.actual_finish_date = null;
  } else if (i % 7 === 3) {
    // 3) Identical execution: executed exactly on planned dates (single bar)
    task.actual_start_date = task.planned_start_date;
    task.actual_finish_date = task.planned_finish_date;
  }

  mockTasks.push(task);
}

assert.strictEqual(mockTasks.length, 283, 'Must have exactly 283 tasks in test dataset');
console.log(`   ✓ Created ${mockTasks.length} activities spanning from ${mockTasks[0].planned_start_date} to ${mockTasks[282].planned_finish_date}\n`);

// ─── Test 2: Single-Page Matrix Computation ────────────────────────────────────

console.log('2. Computing Single-Page Schedule Matrix...');

const projectMeta = {
  name: 'DS16 Luxury Residences - Wing A',
  client_name: 'Metro City Developers',
  location: 'Downtown Commercial Hub, Sector 14',
  start_date: '2026-11-01',
  published_version: '2.4'
};

const options = {
  paperSize: 'custom',
  activityGrouping: 'groups',
  timelineScale: 'auto',
  includeSidebar: true,
  includeDuration: true,
  includeDates: true,
  includeStatus: true,
  includeColorLegend: true,
  includeProjectDetails: true,
  includePageNumbers: true
};

const matrix = buildSinglePageScheduleMatrix(mockTasks, options, projectMeta);

console.log(`   • Total Pages: ${matrix.totalPages}`);
console.log(`   • Total Row Sheets: ${matrix.totalVerticalPages}`);
console.log(`   • Total Horizontal Slices: ${matrix.totalHorizontalSlices}`);
console.log(`   • Document Dimensions: ${matrix.layoutDimensions.width} mm × ${matrix.layoutDimensions.height} mm`);

assert.strictEqual(matrix.totalPages, 1, 'Acceptance Criterion Failed: Must produce exactly 1 total page');
assert.strictEqual(matrix.pages.length, 1, 'Must have exactly 1 page object');
assert.strictEqual(matrix.totalVerticalPages, 1, 'Must have zero vertical sheet fragmentation');
assert.strictEqual(matrix.totalHorizontalSlices, 1, 'Must have zero horizontal timeline slicing');

const page = matrix.pages[0];
const taskRows = page.rows.filter(r => r.type === 'task');
assert.strictEqual(taskRows.length, 283, 'All 283 tasks must be present in the single page row composition');

const twoBarRows = taskRows.filter(r => r.hasTwoBars);
const singleBarRows = taskRows.filter(r => !r.hasTwoBars);
console.log(`   • Two-Bar Rows (Planned + Actual): ${twoBarRows.length}`);
console.log(`   • Single-Bar Rows: ${singleBarRows.length}`);
assert(twoBarRows.length > 0, 'Must identify rows requiring dual-bar rendering');
assert(twoBarRows.every(r => r.rowHeight === 9.2), 'Dual-bar rows must be 9.2 mm high');
assert(singleBarRows.every(r => r.rowHeight === 6.5), 'Single-bar rows must be 6.5 mm high');

console.log(`   ✓ Exactly ONE page produced containing all ${taskRows.length} activities, dual-bar height differentiation verified\n`);

// ─── Test 3: Date Range and Timeline Alignment ────────────────────────────────

console.log('3. Validating Continuous Timeline Date Scope...');

const slice = page.slice;
console.log(`   • Timeline Label: ${slice.label}`);
console.log(`   • Timeline Start: ${slice.startDate.toISOString().split('T')[0]}`);
console.log(`   • Timeline End: ${slice.endDate.toISOString().split('T')[0]}`);
console.log(`   • Months Included: ${slice.months.map(m => m.label).join(', ')}`);
console.log(`   • Total Timeline Days: ${slice.totalDays}`);

assert(slice.startDate.getMonth() <= 10 && slice.startDate.getFullYear() === 2026, 'Timeline must start in November 2026 or earlier');
assert(slice.endDate.getMonth() >= 3 && slice.endDate.getFullYear() === 2027, 'Timeline must end in April 2027 or later');
assert(slice.months.length >= 6, 'Must include all 6 months (Nov, Dec, Jan, Feb, Mar, Apr)');
console.log('   ✓ Full project date range is continuous without gaps or divisions\n');

// ─── Test 4: Custom Dimensions & Readability Preservation ─────────────────────

console.log('4. Verifying Uncompressed Custom Dimensions & Readability...');

console.log(`   • Sidebar Width: ${page.layout.sidebarWidth} mm across ${page.layout.sidebarCols.length} columns`);
console.log(`   • Activity Description Col: ${page.layout.sidebarCols[0].width} mm`);
console.log(`   • Timeline Width: ${page.layout.timelineWidth} mm`);
console.log(`   • Total Rows Height: ${page.layout.totalRowsHeight} mm`);
console.log(`   • Total Page Height: ${page.dims.height} mm`);

assert(page.layout.sidebarCols[0].width >= 72, 'Activity description column must be wide enough to prevent truncation');
assert(page.dims.height > 1500, 'Page height must dynamically accommodate all 283 rows at full readable scale (>1.5 meters)');
assert(page.dims.width > 500, 'Page width must accommodate complete timeline (>500 mm)');
console.log('   ✓ Custom dimensions preserve 100% readability without compressing rows or truncating labels\n');

// ─── Test 5: Vector PDF Generation ────────────────────────────────────────────

console.log('5. Generating Vector PDF Document...');

const doc = generateA3GanttPdf(matrix, options);
const numPages = doc.getNumberOfPages();

console.log(`   • jsPDF Document Page Count: ${numPages}`);
assert.strictEqual(numPages, 1, 'Final PDF document must contain exactly ONE page');

const outDir = path.join(rootDir, 'server', 'uploads');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}
const outPath = path.join(outDir, 'test_283_activities_single_page.pdf');
const pdfBytes = doc.output('arraybuffer');
fs.writeFileSync(outPath, Buffer.from(pdfBytes));

const stat = fs.statSync(outPath);
console.log(`   • Generated PDF File Size: ${(stat.size / 1024).toFixed(1)} KB`);
console.log(`   • Saved to: ${outPath}`);
assert(stat.size > 20000, 'PDF file must be valid and substantial in size');
console.log('   ✓ Vector PDF verified and saved successfully with exactly 1 page\n');

// ─── Test 6: A3/A4 Scaled Mode Verification ───────────────────────────────────

console.log('6. Verifying Standard Paper Size Mode (A3 Single Page)...');

const a3Options = {
  ...options,
  paperSize: 'A3',
  fitToPaper: true
};

const a3Matrix = buildSinglePageScheduleMatrix(mockTasks, a3Options, projectMeta);
assert.strictEqual(a3Matrix.totalPages, 1, 'A3 mode must also produce exactly 1 page');
assert.strictEqual(a3Matrix.pages[0].dims.width, 420, 'A3 width must be 420 mm');
assert.strictEqual(a3Matrix.pages[0].dims.height, 297, 'A3 height must be 297 mm');
console.log('   ✓ A3 Single Page mode verified: fits on exactly 1 page (420 × 297 mm)\n');

console.log('🎉 ALL SINGLE-PAGE GANTT EXPORTER TESTS PASSED PERFECTLY!');
console.log('   • 283 activities spanning Nov 2026 – Apr 2027 confirmed on exactly ONE PDF page.');
