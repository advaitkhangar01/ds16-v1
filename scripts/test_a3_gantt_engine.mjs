// scripts/test_a3_gantt_engine.mjs
// Verification suite for DS16 A3 Construction Gantt Chart Exporter Engine

import assert from 'node:assert/strict';
import {
  PAPER_SIZES,
  organizeTaskRows,
  calculateTimelineSlices,
  buildPaginatedScheduleMatrix,
  generateA3GanttPdf
} from '../client/src/utils/a3GanttPdfEngine.js';

console.log('🧪 Running A3 Construction Gantt Chart Exporter Engine Tests...\n');

const sampleTasks = [
  {
    id: 1,
    task_name: 'Site Clearance & Leveling',
    section_name: 'Site Preparation',
    floor_zone: 'Ground',
    planned_start_date: '2026-03-01',
    planned_finish_date: '2026-03-10',
    duration_days: 10,
    status: 'Completed',
    order_index: 1
  },
  {
    id: 2,
    task_name: 'Excavation & Footings',
    section_name: 'Site Preparation',
    floor_zone: 'Substructure',
    planned_start_date: '2026-03-11',
    planned_finish_date: '2026-03-25',
    duration_days: 15,
    status: 'In Progress',
    order_index: 2
  },
  {
    id: 3,
    task_name: 'Plinth Beam Casting',
    section_name: 'RCC Work',
    floor_zone: 'Plinth',
    planned_start_date: '2026-03-26',
    planned_finish_date: '2026-04-10',
    duration_days: 16,
    status: 'Not Started',
    order_index: 3
  },
  {
    id: 4,
    task_name: '1st Slab RCC Casting',
    section_name: 'RCC Work',
    floor_zone: '1st Floor',
    planned_start_date: '2026-04-11',
    planned_finish_date: '2026-05-05',
    duration_days: 25,
    status: 'Not Started',
    is_milestone: true,
    order_index: 4
  }
];

// Test 1: Paper Dimensions
console.log('1. Paper Dimensions and Aspect Ratios:');
assert.equal(PAPER_SIZES.A3.landscape.width, 420, 'A3 Landscape width must be 420mm');
assert.equal(PAPER_SIZES.A3.landscape.height, 297, 'A3 Landscape height must be 297mm');
assert.equal(PAPER_SIZES.A3.portrait.width, 297, 'A3 Portrait width must be 297mm');
assert.equal(PAPER_SIZES.A3.portrait.height, 420, 'A3 Portrait height must be 420mm');
assert.equal(PAPER_SIZES.A4.landscape.width, 297, 'A4 Landscape width must be 297mm');
assert.equal(PAPER_SIZES.A4.landscape.height, 210, 'A4 Landscape height must be 210mm');
console.log('   ✓ Exact A3 & A4 dimensions confirmed');

// Test 2: Task Row Organization & Grouping
console.log('\n2. Task Row Organization & Grouping:');
const groupRows = organizeTaskRows(sampleTasks, 'groups');
assert.ok(groupRows.length > sampleTasks.length, 'Grouped rows must include section & subgroup headers');
assert.equal(groupRows.filter(r => r.type === 'task').length, 4, 'All 4 tasks must be present');
assert.ok(groupRows.some(r => r.type === 'section_header' && r.name === 'Site Preparation'));
assert.ok(groupRows.some(r => r.type === 'section_header' && r.name === 'RCC Work'));

const floorRows = organizeTaskRows(sampleTasks, 'floors');
assert.ok(floorRows.some(r => r.type === 'floor_header' && r.name === 'Substructure'));

const flatRows = organizeTaskRows(sampleTasks, 'none');
assert.equal(flatRows.length, 4, 'Un-grouped list must have exactly task rows');
console.log('   ✓ Hierarchical group, floor-wise, and flat ordering confirmed');

// Test 3: Horizontal Timeline Slicing
console.log('\n3. Horizontal Timeline Slicing:');
const { horizontalSlices } = calculateTimelineSlices(sampleTasks, { timelineScale: 'auto' }, 260);
assert.equal(horizontalSlices.length, 1, 'Short 3-month project must fit in 1 horizontal slice on A3');
assert.ok(horizontalSlices[0].months.length >= 3, 'Horizontal slice includes all project months');

const multiYearTasks = [
  ...sampleTasks,
  {
    id: 5,
    task_name: 'Terrace Waterproofing',
    section_name: 'Finishing Work',
    floor_zone: 'Terrace',
    planned_start_date: '2027-06-01',
    planned_finish_date: '2027-07-30',
    duration_days: 60,
    status: 'Not Started',
    order_index: 5
  }
];
const { horizontalSlices: multiSlices } = calculateTimelineSlices(multiYearTasks, { timelineScale: 'monthly' }, 260);
assert.ok(multiSlices.length > 1, 'Multi-year project must split into multiple consecutive slices');
for (let i = 0; i < multiSlices.length - 1; i++) {
  const currEnd = multiSlices[i].endDate.getTime();
  const nextStart = multiSlices[i + 1].startDate.getTime();
  assert.ok(nextStart - currEnd < 2 * 86400000, 'Slices must be continuous with no gaps');
}
console.log(`   ✓ Multi-year project successfully split into ${multiSlices.length} continuous horizontal slices`);

// Test 4: Two-Dimensional Matrix & Vertical Pagination
console.log('\n4. Two-Dimensional Matrix & Vertical Pagination:');
const smallMatrix = buildPaginatedScheduleMatrix(sampleTasks, { paperSize: 'A3', orientation: 'landscape' }, { name: 'Villa Schedule' });
assert.equal(smallMatrix.totalPages, 1, 'Small project must fit on 1 A3 page');
assert.equal(smallMatrix.pages[0].pageNumber, 1);
assert.equal(smallMatrix.pages[0].project.name, 'Villa Schedule');

// 120 tasks test
const manyTasks = [];
for (let i = 1; i <= 120; i++) {
  manyTasks.push({
    id: i,
    task_name: `Construction Activity #${i}`,
    section_name: i <= 25 ? 'Site Preparation' : (i <= 75 ? 'RCC Work' : 'Finishing Work'),
    floor_zone: `Floor ${Math.floor(i / 15)}`,
    planned_start_date: '2026-03-01',
    planned_finish_date: '2026-05-15',
    duration_days: 15,
    status: i % 3 === 0 ? 'Completed' : (i % 3 === 1 ? 'In Progress' : 'Not Started'),
    order_index: i
  });
}

const largeMatrix = buildPaginatedScheduleMatrix(manyTasks, { paperSize: 'A3', orientation: 'landscape' }, { name: 'Tower Construction' });
assert.ok(largeMatrix.totalVerticalPages > 1, '120 activities must paginate into multiple vertical sheets');
assert.ok(largeMatrix.totalPages >= largeMatrix.totalVerticalPages);

largeMatrix.pages.forEach((p, idx) => {
  assert.equal(p.pageNumber, idx + 1, 'Page numbering must be sequential 1..N');
  assert.ok(p.rows.length > 0, 'No empty page allowed');
  assert.ok(p.layout.sidebarCols.length > 0, 'Sidebar must be repeated on every page');
});
console.log(`   ✓ 120 activities cleanly paginated into ${largeMatrix.totalVerticalPages} vertical sheets with zero empty pages`);

// 2D Matrix test (Many tasks + Multi-year span)
const massiveTasks = [];
for (let i = 1; i <= 100; i++) {
  const monthOffset = (i % 16);
  const startMonth = 3 + monthOffset;
  const year = startMonth > 12 ? 2027 : 2026;
  const normalizedMonth = ((startMonth - 1) % 12) + 1;
  const monthStr = normalizedMonth < 10 ? `0${normalizedMonth}` : `${normalizedMonth}`;

  massiveTasks.push({
    id: i,
    task_name: `Activity ${i}`,
    section_name: i < 40 ? 'RCC Work' : 'Finishing Work',
    floor_zone: `Zone ${i % 4}`,
    planned_start_date: `${year}-${monthStr}-01`,
    planned_finish_date: `${year}-${monthStr}-25`,
    duration_days: 25,
    status: 'In Progress',
    order_index: i
  });
}

const matrix2D = buildPaginatedScheduleMatrix(
  massiveTasks,
  { paperSize: 'A3', orientation: 'landscape', timelineScale: 'monthly' },
  { name: 'Metro Project', client_name: 'Metro Authority' }
);

assert.ok(matrix2D.totalVerticalPages > 1, 'Massive tasks must have multiple vertical sheets');
assert.ok(matrix2D.totalHorizontalSlices > 1, '16-month duration must have multiple horizontal slices');
assert.equal(matrix2D.totalPages, matrix2D.totalVerticalPages * matrix2D.totalHorizontalSlices, 'Total pages must equal Rows x Slices');
console.log(`   ✓ 2D Matrix verified: ${matrix2D.totalVerticalPages} Row Sheets × ${matrix2D.totalHorizontalSlices} Timeline Slices = ${matrix2D.totalPages} total pages`);

// Test 5: Vector PDF Generation
console.log('\n5. Vector PDF Generation:');
const doc = generateA3GanttPdf(smallMatrix, { includeProjectDetails: true, includeSidebar: true, includeColorLegend: true });
assert.ok(doc, 'PDF doc must be instantiated');
assert.equal(doc.internal.getNumberOfPages(), smallMatrix.totalPages, 'PDF page count must match calculated totalPages');

const largeDoc = generateA3GanttPdf(largeMatrix, { includeProjectDetails: true, includeSidebar: true });
assert.equal(largeDoc.internal.getNumberOfPages(), largeMatrix.totalPages, 'Large PDF page count must match matrix totalPages');
console.log(`   ✓ Vector PDF generated successfully with exact ${largeMatrix.totalPages} pages`);

console.log('\n🎉 ALL A3 GANTT EXPORTER TESTS PASSED PERFECTLY!\n');
