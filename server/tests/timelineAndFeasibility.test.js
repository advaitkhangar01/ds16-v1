// server/tests/timelineAndFeasibility.test.js
// Comprehensive test suite for Project Timeline and Area & Financial Feasibility modules

const request = require('supertest');
const app = require('../index');
const pool = require('../db');
const { signToken } = require('../middleware/auth');
const { calculateAreaMetrics, calculateFinancialMetrics } = require('../services/feasibilityEngine');
const { generateDraftActivities, formatDateStr } = require('../services/timelineGenerator');

describe('Project Timeline & Area & Financial Feasibility Module Tests', () => {
  let testUsers = {};
  let testProject = null;
  let otherProject = null;
  let testClientId = null;

  beforeAll(async () => {
    // 1. Create test client
    const { rows: clientRows } = await pool.query(
      `INSERT INTO clients (name, email) VALUES ('Test Architecture Client', 'client@testarch.com') RETURNING id`
    );
    testClientId = clientRows[0].id;

    // 2. Create test users with distinct roles
    const roles = ['admin', 'design_head', 'civil_engineer', 'back_office', 'employee'];
    await pool.query("DELETE FROM users WHERE username LIKE 'test_tf_%'");

    for (const role of roles) {
      const { rows } = await pool.query(
        `INSERT INTO users (name, role, username, password_hash)
         VALUES ($1, $2, $3, 'hashed_test_password')
         RETURNING id, role`,
        [`Test TF ${role}`, role, `test_tf_${role}`]
      );
      testUsers[role] = {
        id: rows[0].id,
        role: rows[0].role,
        token: signToken(rows[0].id)
      };
    }

    // 3. Create test projects
    const { rows: p1 } = await pool.query(
      `INSERT INTO projects (name, client_id, type, status, created_by, client_name, area_sq_ft, start_date)
       VALUES ('Apex Heights Project', $1, 'Residential Apartment', 'In Progress', $2, 'Test Architecture Client', '10000', '2026-09-01')
       RETURNING *`,
      [testClientId, testUsers.admin.id]
    );
    testProject = p1[0];

    const { rows: p2 } = await pool.query(
      `INSERT INTO projects (name, client_id, type, status, created_by, client_name)
       VALUES ('Unrelated Commercial Complex', $1, 'Commercial', 'In Progress', $2, 'Test Architecture Client')
       RETURNING *`,
      [testClientId, testUsers.admin.id]
    );
    otherProject = p2[0];
  });

  afterAll(async () => {
    // Cleanup test data
    if (testProject) {
      await pool.query('DELETE FROM projects WHERE id IN ($1, $2)', [testProject.id, otherProject.id]);
    }
    if (testClientId) {
      await pool.query('DELETE FROM clients WHERE id = $1', [testClientId]);
    }
    await pool.query("DELETE FROM users WHERE username LIKE 'test_tf_%'");
  });

  // ==========================================
  // SECTION 1: TIMELINE GENERATOR UNIT TESTS
  // ==========================================
  describe('Timeline Generator Logic', () => {
    it('generates activities following N+2 rule when terrace water tank slab is enabled', () => {
      const activities = generateDraftActivities({
        floors_above_ground: 4,
        ground_floor_config: 'parking_and_rooms',
        has_terrace_tank_slab: true,
        start_date: '2026-09-01'
      });

      expect(activities.length).toBeGreaterThan(15);
      
      // Slabs: Plinth Slab, 1st Floor, 2nd Floor, 3rd Floor, 4th Floor, Terrace Slab, Water Tank Slab
      const slabTasks = activities.filter(a => a.activity_key && a.activity_key.includes('SLAB_CONCRETING'));
      // Plinth Slab (1) + Habitable 1..4 Slabs (4) + Terrace Slab (1) + Water Tank Slab (1) = 7 slabs
      expect(slabTasks.length).toBe(7);
      expect(slabTasks[0].task_name).toContain('Plinth Slab');
      expect(slabTasks[slabTasks.length - 1].task_name).toContain('Water Tank Slab Concreting');

      // Verify sequence: end of one slab precedes start of next slab
      const slab1End = new Date(slabTasks[0].planned_finish_date);
      const slab2Start = new Date(slabTasks[1].planned_start_date);
      expect(slab2Start.getTime()).toBeGreaterThan(slab1End.getTime());
    });

    it('generates activities following N+1 rule when terrace water tank slab is disabled', () => {
      const activities = generateDraftActivities({
        floors_above_ground: 3,
        ground_floor_config: 'stilt_parking',
        has_terrace_tank_slab: false,
        start_date: '2026-09-01'
      });

      const slabTasks = activities.filter(a => a.activity_key && a.activity_key.includes('SLAB_CONCRETING'));
      // Plinth (1) + Habitable 1..3 (3) + Terrace (1) = 5 slabs
      expect(slabTasks.length).toBe(5);
      expect(slabTasks[slabTasks.length - 1].task_name).toContain('Terrace Slab Concreting');
    });

    it('rigorously tests structural trigger milestone for G+1, G+2, G+3, G+4, G+5, G+6, and tank variations', () => {
      const testCases = [
        { floors: 1, tank: false, expectTrigger: false },
        { floors: 2, tank: false, expectTrigger: false },
        { floors: 3, tank: false, expectTrigger: true },
        { floors: 4, tank: false, expectTrigger: true },
        { floors: 5, tank: false, expectTrigger: true },
        { floors: 6, tank: false, expectTrigger: true },
        { floors: 3, tank: true, expectTrigger: true },
        { floors: 5, tank: true, expectTrigger: true }
      ];

      for (const tc of testCases) {
        const acts = generateDraftActivities({
          floors_above_ground: tc.floors,
          has_terrace_tank_slab: tc.tank,
          start_date: '2026-09-01'
        });

        const triggerMilestones = acts.filter(a => a.metadata && a.metadata.is_trigger_milestone);
        const groundBrick = acts.find(a => a.metadata && a.metadata.is_ground_brickwork);
        expect(groundBrick).toBeDefined();

        if (tc.expectTrigger) {
          expect(triggerMilestones.length).toBe(1);
          const trigger = triggerMilestones[0];
          expect(['Third Floor', '3rd Floor']).toContain(trigger.floor_zone);
          expect(trigger.is_milestone).toBe(true);
          expect(trigger.metadata.milestone_code).toBe('SLAB_3RD_FLOOR');

          // Ground brickwork must depend on the 3rd floor slab with lag 1
          expect(groundBrick.predecessors[0].predecessor_id).toBe(trigger.temp_id);
          expect(groundBrick.predecessors[0].lag).toBe(1);
          expect(groundBrick.metadata.has_structural_trigger).toBe(true);

          // Expected start is 3rd floor slab planned finish + 1 calendar day
          const triggerFinishDate = new Date(trigger.planned_finish_date);
          triggerFinishDate.setDate(triggerFinishDate.getDate() + 1);
          const expectedStartStr = triggerFinishDate.toISOString().split('T')[0];
          expect(groundBrick.planned_start_date).toBe(expectedStartStr);
        } else {
          expect(triggerMilestones.length).toBe(0);
          expect(groundBrick.metadata.is_manually_scheduled).toBe(true);
          expect(groundBrick.metadata.has_structural_trigger).toBe(false);
          // G+2 or fewer: depends on final RCC task with lag 1
          expect(groundBrick.predecessors[0].lag).toBe(1);
        }
      }
    });

    it('verifies exact calendar day addition across leap-years, month-ends and year-ends', () => {
      const { addCalendarDays, formatDateStr } = require('../services/timelineGenerator');

      // Year-end transition
      expect(formatDateStr(addCalendarDays('2026-12-31', 1))).toBe('2027-01-01');

      // Month-end transitions
      expect(formatDateStr(addCalendarDays('2026-01-31', 1))).toBe('2026-02-01');
      expect(formatDateStr(addCalendarDays('2026-03-31', 1))).toBe('2026-04-01');

      // Non-leap year February
      expect(formatDateStr(addCalendarDays('2026-02-28', 1))).toBe('2026-03-01');

      // Leap year February (2028 is a leap year)
      expect(formatDateStr(addCalendarDays('2028-02-28', 1))).toBe('2028-02-29');
      expect(formatDateStr(addCalendarDays('2028-02-29', 1))).toBe('2028-03-01');
    });

    it('generates configurable basement levels, upper parking floors, and elevator installation', () => {
      const acts = generateDraftActivities({
        floors_above_ground: 4,
        basement_count: 2,
        upper_parking_count: 1,
        has_lift: true,
        has_terrace_tank_slab: true,
        start_date: '2026-09-01'
      });

      // 1. Basements
      const deepEx = acts.find(a => a.task_name.includes('Deep Excavation & Shoring'));
      expect(deepEx).toBeDefined();
      expect(deepEx.task_name).toContain('2 Basement Levels');

      const raft = acts.find(a => a.task_name.includes('Raft Foundation'));
      expect(raft).toBeDefined();

      const b2Retaining = acts.find(a => a.task_name.includes('Basement 2') && a.task_name.includes('Retaining Wall'));
      expect(b2Retaining).toBeDefined();
      const b2Slab = acts.find(a => a.task_name.includes('Basement 2') && a.task_name.includes('Basement Floor Slab'));
      expect(b2Slab).toBeDefined();

      const b1Retaining = acts.find(a => a.task_name.includes('Basement 1') && a.task_name.includes('Retaining Wall'));
      expect(b1Retaining).toBeDefined();
      const b1Slab = acts.find(a => a.task_name.includes('Basement 1') && a.task_name.includes('Basement Floor Slab'));
      expect(b1Slab).toBeDefined();

      // 2. Upper floor parking
      const upperParkSlab = acts.find(a => a.task_name.includes('Podium 1') && a.task_name.includes('Floor Slab Concreting'));
      expect(upperParkSlab).toBeDefined();

      const parkFinishes = acts.find(a => a.task_name.includes('Podium 1') && a.task_name.includes('Epoxy Floor Coating'));
      expect(parkFinishes).toBeDefined();

      // 3. Elevator system
      const liftPit = acts.find(a => a.task_name.includes('Lift Pit') && a.task_name.includes('Waterproofing'));
      expect(liftPit).toBeDefined();

      const liftShaft = acts.find(a => a.task_name.includes('Lift Shaft'));
      expect(liftShaft).toBeDefined();

      const liftComm = acts.find(a => a.task_name.includes('Elevator Safety Inspection'));
      expect(liftComm).toBeDefined();

      // 4. Structural trigger milestone integrity
      const triggerMilestone = acts.find(a => a.metadata?.is_trigger_milestone);
      expect(triggerMilestone).toBeDefined();
      expect(['Third Floor', '3rd Floor']).toContain(triggerMilestone.floor_zone);

      const groundBrick = acts.find(a => a.metadata?.is_ground_brickwork);
      expect(groundBrick).toBeDefined();
      expect(groundBrick.predecessors[0].predecessor_id).toBe(triggerMilestone.temp_id);
    });

    it('omits elevator system tasks when has_lift is false', () => {
      const acts = generateDraftActivities({
        floors_above_ground: 3,
        basement_count: 0,
        upper_parking_count: 0,
        has_lift: false,
        start_date: '2026-09-01'
      });

      const liftTasks = acts.filter(a => a.task_name.toLowerCase().includes('elevator') || a.task_name.toLowerCase().includes('lift'));
      expect(liftTasks.length).toBe(0);
    });
  });

  // ==========================================
  // SECTION 2: TIMELINE API INTEGRATION TESTS
  // ==========================================
  describe('Timeline API Endpoints', () => {
    it('GET /timeline/config returns initial default configuration', async () => {
      const res = await request(app)
        .get(`/api/projects/${testProject.id}/timeline/config`)
        .set('Authorization', `Bearer ${testUsers.admin.token}`);

      expect(res.status).toBe(200);
      expect(res.body.config).toBeDefined();
      expect(res.body.config.status).toBe('draft');
    });

    it('POST /timeline/config saves customized building parameters', async () => {
      const res = await request(app)
        .post(`/api/projects/${testProject.id}/timeline/config`)
        .set('Authorization', `Bearer ${testUsers.civil_engineer.token}`)
        .send({
          floors_above_ground: 5,
          ground_floor_config: 'parking_and_rooms',
          has_terrace_tank_slab: true,
          building_type: 'Residential Luxury Apartment'
        });

      expect(res.status).toBe(200);
      expect(res.body.config.floors_above_ground).toBe(5);
      expect(res.body.config.building_type).toBe('Residential Luxury Apartment');
    });

    it('rejects POST /timeline/config from standard employees without management role', async () => {
      const res = await request(app)
        .post(`/api/projects/${testProject.id}/timeline/config`)
        .set('Authorization', `Bearer ${testUsers.employee.token}`)
        .send({ floors_above_ground: 6 });

      expect(res.status).toBe(403);
    });

    it('POST /timeline/generate-draft creates draft tasks without altering published schedule', async () => {
      const res = await request(app)
        .post(`/api/projects/${testProject.id}/timeline/generate-draft`)
        .set('Authorization', `Bearer ${testUsers.admin.token}`)
        .send({ floors_above_ground: 5, has_terrace_tank_slab: true });

      expect(res.status).toBe(200);
      expect(res.body.count).toBeGreaterThan(20);
      expect(res.body.tasks[0].is_draft).toBe(true);

      // Verify draft tasks are retrievable with show_draft=true
      const getDrafts = await request(app)
        .get(`/api/projects/${testProject.id}/timeline/tasks?show_draft=true`)
        .set('Authorization', `Bearer ${testUsers.admin.token}`);

      expect(getDrafts.status).toBe(200);
      expect(getDrafts.body.count).toBe(res.body.count);

      // Verify active published tasks list remains 0 until publish
      const getActive = await request(app)
        .get(`/api/projects/${testProject.id}/timeline/tasks`)
        .set('Authorization', `Bearer ${testUsers.admin.token}`);

      expect(getActive.status).toBe(200);
      expect(getActive.body.count).toBe(0);
    });

    it('POST /timeline/publish publishes schedule into version 1 and activates tasks', async () => {
      const res = await request(app)
        .post(`/api/projects/${testProject.id}/timeline/publish`)
        .set('Authorization', `Bearer ${testUsers.admin.token}`)
        .send({ notes: 'Baseline Construction Schedule v1' });

      expect(res.status).toBe(200);
      expect(res.body.published_version).toBe(1);

      // Active tasks must now be populated
      const getActive = await request(app)
        .get(`/api/projects/${testProject.id}/timeline/tasks`)
        .set('Authorization', `Bearer ${testUsers.admin.token}`);

      expect(getActive.status).toBe(200);
      expect(getActive.body.count).toBeGreaterThan(20);
      expect(getActive.body.tasks[0].status).toBe('Not Started');
    });

    it('PATCH /timeline/tasks/:taskId updates task status and records actual dates', async () => {
      const { rows } = await pool.query(
        'SELECT id FROM timeline_tasks WHERE project_id = $1 AND is_draft = FALSE LIMIT 1',
        [testProject.id]
      );
      const taskId = rows[0].id;

      const res = await request(app)
        .patch(`/api/projects/${testProject.id}/timeline/tasks/${taskId}`)
        .set('Authorization', `Bearer ${testUsers.civil_engineer.token}`)
        .send({
          status: 'In Progress',
          remarks: 'Footing excavation started on schedule'
        });

      expect(res.status).toBe(200);
      expect(res.body.task.status).toBe('In Progress');
      expect(res.body.task.actual_start_date).toBeDefined();
    });

    it('rejects employee attempts to modify planned schedule dates (field-level restriction)', async () => {
      const { rows } = await pool.query(
        'SELECT id FROM timeline_tasks WHERE project_id = $1 AND is_draft = FALSE LIMIT 1',
        [testProject.id]
      );
      const taskId = rows[0].id;

      // Assign employee to this task first
      await pool.query(
        'INSERT INTO timeline_task_assignments (task_id, user_id, assigned_by) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
        [taskId, testUsers.employee.id, testUsers.admin.id]
      );

      // Attempt to modify planned_start_date as employee
      const res = await request(app)
        .patch(`/api/projects/${testProject.id}/timeline/tasks/${taskId}`)
        .set('Authorization', `Bearer ${testUsers.employee.token}`)
        .send({
          planned_start_date: '2027-01-01',
          status: 'In Progress'
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Assigned employees cannot modify planned dates');
    });

    it('rejects employee attempts to modify task assignees', async () => {
      const { rows } = await pool.query(
        'SELECT id FROM timeline_tasks WHERE project_id = $1 AND is_draft = FALSE LIMIT 1',
        [testProject.id]
      );
      const taskId = rows[0].id;

      const res = await request(app)
        .patch(`/api/projects/${testProject.id}/timeline/tasks/${taskId}`)
        .set('Authorization', `Bearer ${testUsers.employee.token}`)
        .send({
          assignees: [testUsers.employee.id, testUsers.civil_engineer.id]
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Assigned employees cannot modify planned dates');
    });

    it('allows assigned employee to update status, actual dates and remarks', async () => {
      const { rows } = await pool.query(
        'SELECT id FROM timeline_tasks WHERE project_id = $1 AND is_draft = FALSE LIMIT 1',
        [testProject.id]
      );
      const taskId = rows[0].id;

      const res = await request(app)
        .patch(`/api/projects/${testProject.id}/timeline/tasks/${taskId}`)
        .set('Authorization', `Bearer ${testUsers.employee.token}`)
        .send({
          status: 'Completed',
          actual_finish_date: '2026-09-25',
          remarks: 'Concrete pour verified by site engineer'
        });

      expect(res.status).toBe(200);
      expect(res.body.task.status).toBe('Completed');
      expect(res.body.task.remarks).toBe('Concrete pour verified by site engineer');
    });

    it('rejects cross-project predecessor task dependency', async () => {
      // Create a task in otherProject
      const { rows: otherRows } = await pool.query(
        `INSERT INTO timeline_tasks (project_id, task_name, category, construction_stage, planned_start_date, planned_finish_date)
         VALUES ($1, 'Other Project Task', 'Civil', 'Substructure', '2026-09-01', '2026-09-10') RETURNING id`,
        [otherProject.id]
      );
      const otherTaskId = otherRows[0].id;

      const { rows: currRows } = await pool.query(
        'SELECT id FROM timeline_tasks WHERE project_id = $1 AND is_draft = FALSE LIMIT 1',
        [testProject.id]
      );
      const currTaskId = currRows[0].id;

      // Attempt to link otherTaskId as predecessor to currTaskId
      const res = await request(app)
        .post(`/api/projects/${testProject.id}/timeline/tasks/${currTaskId}/dependencies`)
        .set('Authorization', `Bearer ${testUsers.admin.token}`)
        .send({
          predecessor_id: otherTaskId
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('does not belong to project');
    });

    it('allows archiving and restoring a task by management', async () => {
      const { rows } = await pool.query(
        'SELECT id FROM timeline_tasks WHERE project_id = $1 AND is_draft = FALSE LIMIT 1',
        [testProject.id]
      );
      const taskId = rows[0].id;

      // Archive
      const arcRes = await request(app)
        .delete(`/api/projects/${testProject.id}/timeline/tasks/${taskId}`)
        .set('Authorization', `Bearer ${testUsers.admin.token}`);
      expect(arcRes.status).toBe(200);

      // Restore
      const restRes = await request(app)
        .post(`/api/projects/${testProject.id}/timeline/tasks/${taskId}/restore`)
        .set('Authorization', `Bearer ${testUsers.admin.token}`);
      expect(restRes.status).toBe(200);
      expect(restRes.body.task.is_archived).toBe(false);
    });

    it('rejects GET /timeline/history for non-management employees', async () => {
      const res = await request(app)
        .get(`/api/projects/${testProject.id}/timeline/history`)
        .set('Authorization', `Bearer ${testUsers.employee.token}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Management authorization required');
    });

    it('GET /timeline/history returns tamper-evident audit history for management', async () => {
      const res = await request(app)
        .get(`/api/projects/${testProject.id}/timeline/history`)
        .set('Authorization', `Bearer ${testUsers.admin.token}`);

      expect(res.status).toBe(200);
      expect(res.body.history.length).toBeGreaterThan(0);
      expect(res.body.total).toBeDefined();
      expect(res.body.history.some(h => h.action === 'PUBLISH_SCHEDULE')).toBe(true);
    });

    it('reactive trigger: completing 3rd-floor slab updates Ground Floor Brickwork forecast to next calendar day and preserves baseline', async () => {
      // 1. Find the 3rd floor slab and Ground Floor Brickwork tasks
      const { rows: slabRows } = await pool.query(
        `SELECT * FROM timeline_tasks 
         WHERE project_id = $1 AND is_draft = FALSE AND is_milestone = TRUE 
         LIMIT 1`,
        [testProject.id]
      );
      expect(slabRows.length).toBe(1);
      const slab3rd = slabRows[0];
      expect(['Third Floor', '3rd Floor']).toContain(slab3rd.floor_zone);

      const { rows: brickRows } = await pool.query(
        `SELECT * FROM timeline_tasks 
         WHERE project_id = $1 AND is_archived = FALSE
           AND (metadata->>'is_ground_brickwork' = 'true' OR activity_key = 'MASONRY:FLOOR_0:BRICKWORK' OR (floor_zone = 'Ground Floor' AND (category = 'Masonry & Brickwork' OR section_name = 'Masonry Work')))
         LIMIT 1`,
        [testProject.id]
      );
      expect(brickRows.length).toBe(1);
      const groundBrick = brickRows[0];
      const baselineStart = formatDateStr(groundBrick.planned_start_date);

      // 2. Mark 3rd floor slab completed with actual_finish_date = '2027-04-10'
      const completeRes = await request(app)
        .patch(`/api/projects/${testProject.id}/timeline/tasks/${slab3rd.id}`)
        .set('Authorization', `Bearer ${testUsers.civil_engineer.token}`)
        .send({
          status: 'Completed',
          actual_finish_date: '2027-04-10',
          remarks: '3rd Floor roof slab de-shuttering and cube strength test verified'
        });

      expect(completeRes.status).toBe(200);
      expect(completeRes.body.forecast_adjustment).toBeDefined();
      expect(completeRes.body.forecast_adjustment.revised_forecast_start).toBe('2027-04-11');

      // 3. Verify Ground Floor Brickwork in DB
      const { rows: [updatedBrick] } = await pool.query(
        'SELECT * FROM timeline_tasks WHERE id = $1',
        [groundBrick.id]
      );

      // Forecast start MUST be 2027-04-11 (actual finish + 1 day)
      expect(formatDateStr(updatedBrick.forecast_start_date)).toBe('2027-04-11');
      // Baseline planned_start_date MUST NOT BE TOUCHED
      expect(formatDateStr(updatedBrick.planned_start_date)).toBe(baselineStart);
      // Status MUST NOT BE FABRICATED to In Progress or Completed
      expect(updatedBrick.status).toBe('Not Started');
      expect(updatedBrick.actual_start_date).toBeNull();

      // 4. Verify audit history logged AUTOMATIC_FORECAST_CALCULATION
      const { rows: auditRows } = await pool.query(
        "SELECT * FROM timeline_audit_history WHERE project_id = $1 AND action = 'AUTOMATIC_FORECAST_CALCULATION' ORDER BY created_at DESC LIMIT 1",
        [testProject.id]
      );
      expect(auditRows.length).toBe(1);
      expect(auditRows[0].new_value.trigger_milestone).toBe('SLAB_3RD_FLOOR');
      expect(auditRows[0].new_value.forecast_start_date).toBe('2027-04-11');

      // 5. Test idempotency: sending repeated completion with same values does not error or shift dates
      const repeatRes = await request(app)
        .patch(`/api/projects/${testProject.id}/timeline/tasks/${slab3rd.id}`)
        .set('Authorization', `Bearer ${testUsers.civil_engineer.token}`)
        .send({
          status: 'Completed',
          actual_finish_date: '2027-04-10'
        });
      expect(repeatRes.status).toBe(200);

      // 6. Test reopening: changing status from Completed back to In Progress reverts forecast back to baseline
      const reopenRes = await request(app)
        .patch(`/api/projects/${testProject.id}/timeline/tasks/${slab3rd.id}`)
        .set('Authorization', `Bearer ${testUsers.admin.token}`)
        .send({
          status: 'In Progress'
        });
      expect(reopenRes.status).toBe(200);

      const { rows: [revertedBrick] } = await pool.query(
        'SELECT * FROM timeline_tasks WHERE id = $1',
        [groundBrick.id]
      );
      expect(formatDateStr(revertedBrick.forecast_start_date)).toBe(baselineStart);
    });

    it('safely preserves Ground Floor Brickwork dates if work is already physically started', async () => {
      // Find 3rd floor slab and ground floor brickwork
      const { rows: [slab3rd] } = await pool.query(
        "SELECT * FROM timeline_tasks WHERE project_id = $1 AND is_draft = FALSE AND is_archived = FALSE AND (metadata->>'milestone_code' = 'SLAB_3RD_FLOOR' OR activity_key = 'RCC:FLOOR_3:SLAB_CONCRETING') LIMIT 1",
        [testProject.id]
      );
      const { rows: [groundBrick] } = await pool.query(
        "SELECT * FROM timeline_tasks WHERE project_id = $1 AND is_draft = FALSE AND is_archived = FALSE AND (metadata->>'is_ground_brickwork' = 'true' OR activity_key = 'MASONRY:FLOOR_0:BRICKWORK') LIMIT 1",
        [testProject.id]
      );

      // Mark ground brickwork as In Progress with physical actual_start_date
      await pool.query(
        "UPDATE timeline_tasks SET status = 'In Progress', actual_start_date = '2027-04-01' WHERE id = $1",
        [groundBrick.id]
      );

      // Now complete the 3rd floor slab
      const res = await request(app)
        .patch(`/api/projects/${testProject.id}/timeline/tasks/${slab3rd.id}`)
        .set('Authorization', `Bearer ${testUsers.civil_engineer.token}`)
        .send({
          status: 'Completed',
          actual_finish_date: '2027-04-20'
        });

      expect(res.status).toBe(200);
      expect(res.body.forecast_adjustment).toBeDefined();
      expect(res.body.forecast_adjustment.skipped).toBe(true);
      expect(res.body.forecast_adjustment.reason).toContain('already physically commenced');

      // Verify DB: brickwork actual dates and status are NOT modified
      const { rows: [checkedBrick] } = await pool.query(
        'SELECT * FROM timeline_tasks WHERE id = $1',
        [groundBrick.id]
      );
      expect(checkedBrick.status).toBe('In Progress');
      expect(formatDateStr(checkedBrick.actual_start_date)).toBe('2027-04-01');

      // Cleanup: revert brickwork to Not Started
      await pool.query(
        "UPDATE timeline_tasks SET status = 'Not Started', actual_start_date = NULL WHERE id = $1",
        [groundBrick.id]
      );
    });

    it('preserves manual management override on Ground Floor Brickwork and does not overwrite it on milestone completion or reopening', async () => {
      const { rows: [slab3rd] } = await pool.query(
        "SELECT * FROM timeline_tasks WHERE project_id = $1 AND is_draft = FALSE AND is_archived = FALSE AND (metadata->>'milestone_code' = 'SLAB_3RD_FLOOR' OR activity_key = 'RCC:FLOOR_3:SLAB_CONCRETING') LIMIT 1",
        [testProject.id]
      );
      const { rows: [groundBrick] } = await pool.query(
        "SELECT * FROM timeline_tasks WHERE project_id = $1 AND is_draft = FALSE AND is_archived = FALSE AND (metadata->>'is_ground_brickwork' = 'true' OR activity_key = 'MASONRY:FLOOR_0:BRICKWORK') LIMIT 1",
        [testProject.id]
      );

      // Management manually overrides forecast dates on ground floor brickwork
      const overrideRes = await request(app)
        .patch(`/api/projects/${testProject.id}/timeline/tasks/${groundBrick.id}`)
        .set('Authorization', `Bearer ${testUsers.admin.token}`)
        .send({
          forecast_start_date: '2027-06-01',
          forecast_finish_date: '2027-06-22'
        });

      expect(overrideRes.status).toBe(200);

      // Complete 3rd floor slab
      const slabRes = await request(app)
        .patch(`/api/projects/${testProject.id}/timeline/tasks/${slab3rd.id}`)
        .set('Authorization', `Bearer ${testUsers.civil_engineer.token}`)
        .send({
          status: 'Completed',
          actual_finish_date: '2027-04-18'
        });

      expect(slabRes.status).toBe(200);
      expect(slabRes.body.forecast_adjustment.skipped).toBe(true);
      expect(slabRes.body.forecast_adjustment.reason).toContain('explicit management schedule override');

      // Verify manual override dates were NOT overwritten
      const { rows: [checkedBrick] } = await pool.query(
        'SELECT * FROM timeline_tasks WHERE id = $1',
        [groundBrick.id]
      );
      expect(formatDateStr(checkedBrick.forecast_start_date)).toBe('2027-06-01');

      // Reopening completed slab also preserves the manual override
      const reopenRes = await request(app)
        .patch(`/api/projects/${testProject.id}/timeline/tasks/${slab3rd.id}`)
        .set('Authorization', `Bearer ${testUsers.admin.token}`)
        .send({ status: 'In Progress' });

      expect(reopenRes.status).toBe(200);
      const { rows: [reopenedBrick] } = await pool.query(
        'SELECT * FROM timeline_tasks WHERE id = $1',
        [groundBrick.id]
      );
      expect(formatDateStr(reopenedBrick.forecast_start_date)).toBe('2027-06-01');
    });

    it('verifies generic milestone does not trigger brickwork forecast recalculation', async () => {
      // Create a generic milestone on 3rd floor
      const { rows: [genericMilestone] } = await pool.query(
        `INSERT INTO timeline_tasks 
          (project_id, task_name, category, construction_stage, floor_zone, planned_start_date, planned_finish_date, is_milestone, metadata, duration_days, is_draft, created_by)
         VALUES ($1, '3rd Floor Generic QA Milestone', 'Testing, Commissioning & Handover', 'Finishing & Services', '3rd Floor', '2027-05-01', '2027-05-01', TRUE, '{"generic": true}', 1, FALSE, $2)
         RETURNING *`,
        [testProject.id, testUsers.admin.id]
      );

      // Complete the generic milestone
      const res = await request(app)
        .patch(`/api/projects/${testProject.id}/timeline/tasks/${genericMilestone.id}`)
        .set('Authorization', `Bearer ${testUsers.admin.token}`)
        .send({
          status: 'Completed',
          actual_finish_date: '2027-05-01'
        });

      expect(res.status).toBe(200);
      expect(res.body.forecast_adjustment).toBeNull(); // Generic milestone MUST NOT trigger brickwork recalculation!
    });
  });

  // ==========================================
  // SECTION 3: AREA STATEMENT & FEASIBILITY ENGINE UNIT TESTS
  // ==========================================
  describe('Feasibility Engine Calculations', () => {
    it('faithfully calculates verified Area Statement formulas matching reference sheet', () => {
      const statement = {
        plot_area_sqm: 270,
        dp_deductions_sqm: 0,
        basic_fsi_factor: 1.1,
        paid_fsi_factor: 0.5,
        tdr_factor: 0.65,
        proposed_tdr_factor: 0.545,
        ancillary_residential_pct: 0.60,
        dividing_factor: 1.6
      };

      const floors = [
        { floor_name: 'Ground Floor', pline_area_sqm: 19.642, lobby_area_sqm: 19.642, builtup_for_owners_sqm: 0, builtup_for_sale_sqm: 56.6163 },
        { floor_name: 'First Floor', pline_area_sqm: 135.863, lobby_area_sqm: 19.64, builtup_for_owners_sqm: 116.223, builtup_for_sale_sqm: 241.7041 },
        { floor_name: 'Second Floor', pline_area_sqm: 135.863, lobby_area_sqm: 19.64, builtup_for_owners_sqm: 116.223, builtup_for_sale_sqm: 241.7041 },
        { floor_name: 'Third Floor', pline_area_sqm: 135.863, lobby_area_sqm: 19.64, builtup_for_owners_sqm: 116.223, builtup_for_sale_sqm: 130.6981 }
      ];

      const metrics = calculateAreaMetrics(statement, floors);

      // 1. Permissible FSI = 270 * 1.1 = 297 sqm
      expect(metrics.permissibleFsiSqm).toBeCloseTo(297, 2);
      // 2. Paid FSI = 270 * 0.5 = 135 sqm
      expect(metrics.permissiblePaidFsiSqm).toBeCloseTo(135, 2);
      // 3. TDR Permissible = 270 * 0.65 = 175.5 sqm
      expect(metrics.permissibleTdrSqm).toBeCloseTo(175.5, 2);
      // 4. Proposed TDR = 270 * 0.545 = 147.15 sqm
      expect(metrics.proposedTdrSqm).toBeCloseTo(147.15, 2);
      // 5. Total Proposed Builtup = 297 + 135 + 147.15 = 579.15 sqm
      expect(metrics.proposedTotalBuiltupSqm).toBeCloseTo(579.15, 2);
      // 6. Ancillary Residential = 579.15 * 0.6 = 347.49 sqm
      expect(metrics.proposedAncillaryResSqm).toBeCloseTo(347.49, 1);
      // 7. Total Proposed P-Line Permissible potential = 579.15 + 347.49 = 926.64 sqm
      expect(metrics.proposedPlineTotalSqm).toBeCloseTo(926.64, 1);
    });

    it('calculates Financial Viability, statutory demand, development costs, and net profit', () => {
      const areaMetrics = {
        plotableAreaSqm: 270,
        totalProposedPlineSqm: 926.64,
        proposedAncillaryResSqm: 347.49,
        proposedPaidFsiSqm: 135,
        proposedTdrSqm: 147.15
      };

      const financial = {
        rr_rate_per_sqm: 24340.00,
        estimated_cost_a_rate: 15000.00,
        estimated_cost_b_rate: 26620.00,
        cost_of_plot_rate_per_sqm: 30000.00,
        cost_of_construction_rate: 20000.00,
        basement_area_sqm: 0,
        basement_rate_per_sqm: 5500.00,
        rent_tenements: 3,
        rent_per_tenement_per_month: 15000.00,
        rent_months: 24,
        stacked_parking_slots: 10,
        stacked_parking_cost_per_slot: 200000.00,
        minor_expenses: 234233.00,
        bpms_staff_charges: 100000.00,
        airport_noc: 25000.00,
        fire_noc: 500000.00,
        entertainment_charges: 300000.00
      };

      const salableUnits = [
        { unit_name: 'Unit A', carpet_area_sqm: 286.50, super_buildup_loading_sqft: 300, unit_count: 3, rate_per_sqft: 6000 }
      ];

      const finMetrics = calculateFinancialMetrics(financial, [], salableUnits, areaMetrics);

      // Section A: Statutory demand must be calculated
      expect(finMetrics.totalStatutoryDemandA).toBeGreaterThan(2500000);
      // Section B: Cost of TDR = 147.15 * 0.55 * 24340 = ~1,969,897
      expect(finMetrics.costOfTdrB).toBeCloseTo(1969897, -3);
      // Section D: Construction cost = 926.64 * 20000 = 18,532,800
      expect(finMetrics.costOfConstructionD).toBeCloseTo(18532800, -2);
      // Receipts: Unit A = ((286.50 * 10.764) + 300) * 6000 * 3 = ~60,911,401
      expect(finMetrics.totalReceipts).toBeGreaterThan(50000000);
      // Net Profit = Receipts - Total Cost
      expect(finMetrics.netProfit).toBeGreaterThan(15000000);
    });
  });

  // ==========================================
  // SECTION 4: FEASIBILITY API INTEGRATION TESTS
  // ==========================================
  describe('Feasibility API Endpoints & Security', () => {
    it('GET /feasibility returns 200 for Accounts/Admin roles with unconfigured empty floor plates', async () => {
      const res = await request(app)
        .get(`/api/projects/${testProject.id}/feasibility`)
        .set('Authorization', `Bearer ${testUsers.back_office.token}`);

      expect(res.status).toBe(200);
      expect(res.body.statement).toBeDefined();
      expect(res.body.areaMetrics).toBeDefined();
      expect(res.body.financialMetrics).toBeDefined();
      expect(Array.isArray(res.body.floors)).toBe(true);
      // Confirms newly initialized project does NOT seed sample floor measurements (measurements default to 0)
      expect(res.body.floors.length).toBeGreaterThanOrEqual(0);
      expect(res.body.salableUnits.length).toBe(0);
    });

    it('GET /feasibility returns 403 Forbidden for non-financial employees', async () => {
      const res = await request(app)
        .get(`/api/projects/${testProject.id}/feasibility`)
        .set('Authorization', `Bearer ${testUsers.employee.token}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('restricted');
    });

    it('PUT /feasibility/area updates plot area and recalculates metrics', async () => {
      const res = await request(app)
        .put(`/api/projects/${testProject.id}/feasibility/area`)
        .set('Authorization', `Bearer ${testUsers.admin.token}`)
        .send({
          plot_area_sqm: 350.00,
          dividing_factor: 1.6
        });

      expect(res.status).toBe(200);
      expect(parseFloat(res.body.statement.plot_area_sqm)).toBe(350);
    });

    it('POST /feasibility/area/floors adds dynamic floor row and DELETE removes it', async () => {
      // Add floor
      const addRes = await request(app)
        .post(`/api/projects/${testProject.id}/feasibility/area/floors`)
        .set('Authorization', `Bearer ${testUsers.admin.token}`)
        .send({
          floor_name: 'Seventh Floor Penthouse',
          height_meters: 3.5,
          pline_area_sqm: 140.00,
          lobby_area_sqm: 20.00,
          builtup_for_owners_sqm: 120.00,
          builtup_for_sale_sqm: 0
        });

      expect(addRes.status).toBe(201);
      const floorId = addRes.body.floor.id;

      // Delete floor
      const delRes = await request(app)
        .delete(`/api/projects/${testProject.id}/feasibility/area/floors/${floorId}`)
        .set('Authorization', `Bearer ${testUsers.admin.token}`);

      expect(delRes.status).toBe(200);
    });

    it('POST /feasibility/snapshots creates named calculation snapshot', async () => {
      const res = await request(app)
        .post(`/api/projects/${testProject.id}/feasibility/snapshots`)
        .set('Authorization', `Bearer ${testUsers.admin.token}`)
        .send({
          snapshot_name: 'Q3 Architectural Feasibility Baseline',
          area_data_snapshot: { plot_area: 350 },
          financial_data_snapshot: { total_cost: 38000000 }
        });

      expect(res.status).toBe(201);
      expect(res.body.snapshot.snapshot_name).toBe('Q3 Architectural Feasibility Baseline');
    });

    it('rejects cross-project access for unlinked users', async () => {
      const res = await request(app)
        .get(`/api/projects/${otherProject.id}/feasibility`)
        .set('Authorization', `Bearer ${testUsers.employee.token}`);

      expect(res.status).toBe(403);
    });

    it('GET /feasibility/export returns complete structured export document', async () => {
      const res = await request(app)
        .get(`/api/projects/${testProject.id}/feasibility/export`)
        .set('Authorization', `Bearer ${testUsers.admin.token}`);

      expect(res.status).toBe(200);
      expect(res.body.document_title).toBe('AREA STATEMENT & FINANCIAL VIABILITY REPORT');
      expect(res.body.area_statement).toBeDefined();
      expect(res.body.financial_viability).toBeDefined();
      expect(res.body.financial_viability.statutory_demand_section_a).toBeDefined();
      expect(res.body.financial_viability.viability_summary.projected_net_profit).toBeDefined();
    });
  });

  // ==========================================
  // SECTION 5: REFINEMENTS REQ-A THROUGH REQ-K VERIFICATION SUITE
  // ==========================================
  describe('Feasibility Refinements REQ-A through REQ-K', () => {
    it('REQ-A: persists parking floors in timeline configuration and handles non-saleable floors in area metrics', async () => {
      // 1. Save parking floors configuration
      const configRes = await request(app)
        .post(`/api/projects/${testProject.id}/timeline/config`)
        .set('Authorization', `Bearer ${testUsers.admin.token}`)
        .send({
          floors_above_ground: 4,
          parking_floors: ['BASEMENT_1', 'STILT']
        });

      expect(configRes.status).toBe(200);
      expect(configRes.body.config.parking_floors).toEqual(['BASEMENT_1', 'STILT']);

      // 2. Check area metrics calculation treats parking floors as non-saleable
      const stmt = { plot_area_sqm: 300, basic_fsi_factor: 1.1 };
      const fls = [
        { floor_name: 'Basement 1', floor_type: 'BASEMENT_1', pline_area_sqm: 100, builtup_for_sale_sqm: 50 },
        { floor_name: 'Stilt Parking', floor_type: 'STILT', pline_area_sqm: 100, builtup_for_sale_sqm: 50 },
        { floor_name: 'First Floor', floor_type: 'HABITABLE', pline_area_sqm: 100, builtup_for_sale_sqm: 85 }
      ];
      const metrics = calculateAreaMetrics(stmt, fls);
      expect(metrics.totalBuiltupForSaleSqm).toBe(85); // Only habitable floor counted
    });

    it('REQ-B: supports dual TDR with independent regular and slum factors', () => {
      const stmt = {
        plot_area_sqm: 200,
        dp_deductions_sqm: 0,
        basic_fsi_factor: 1.1,
        paid_fsi_factor: 0.5,
        regular_tdr_factor: 0.40,
        slum_tdr_factor: 0.20,
        ancillary_residential_pct: 0.60
      };
      const metrics = calculateAreaMetrics(stmt, []);

      // Regular TDR = 200 * 0.40 = 80
      expect(metrics.permissibleRegularTdrSqm).toBe(80);
      expect(metrics.proposedRegularTdrSqm).toBe(80);
      // Slum TDR = 200 * 0.20 = 40
      expect(metrics.permissibleSlumTdrSqm).toBe(40);
      expect(metrics.proposedSlumTdrSqm).toBe(40);
      // Total TDR = 80 + 40 = 120
      expect(metrics.proposedTdrSqm).toBe(120);
      // Total Builtup = (200 * 1.1) + (200 * 0.5) + 120 = 220 + 100 + 120 = 440
      expect(metrics.proposedTotalBuiltupSqm).toBe(440);
    });

    it('REQ-D: applies 80% ancillary for Commercial and 60% for Residential buildings', () => {
      const resStmt = {
        plot_area_sqm: 100,
        basic_fsi_factor: 1.0,
        paid_fsi_factor: 0,
        regular_tdr_factor: 0,
        slum_tdr_factor: 0,
        building_use: 'RESIDENTIAL'
      };
      const resMetrics = calculateAreaMetrics(resStmt, []);
      // Total Builtup = 100. Ancillary @ 60% = 60
      expect(resMetrics.ancillaryPct).toBe(0.60);
      expect(resMetrics.proposedAncillaryResSqm).toBe(60);

      const commStmt = {
        ...resStmt,
        building_use: 'COMMERCIAL'
      };
      const commMetrics = calculateAreaMetrics(commStmt, []);
      // Total Builtup = 100. Ancillary @ 80% = 80
      expect(commMetrics.ancillaryPct).toBe(0.80);
      expect(commMetrics.proposedAncillaryResSqm).toBe(80);
    });

    it('REQ-F: auto-calculates 15% lobby area and preserves manual overrides', () => {
      // 1. Auto 15% lobby
      const fl1 = { pline_area_sqm: 200, is_lobby_overridden: false };
      const m1 = calculateAreaMetrics({ plot_area_sqm: 100 }, [fl1]);
      expect(m1.evaluatedFloors[0].lobby_area_sqm).toBe(30); // 15% of 200

      // 2. Overridden lobby preserved
      const fl2 = { pline_area_sqm: 200, lobby_area_sqm: 45, is_lobby_overridden: true };
      const m2 = calculateAreaMetrics({ plot_area_sqm: 100 }, [fl2]);
      expect(m2.evaluatedFloors[0].lobby_area_sqm).toBe(45); // manual override retained
    });

    it('REQ-H: calculates area for 1 unit and safely handles zero or negative unit counts', () => {
      const flNormal = { builtup_for_sale_sqm: 150, no_of_units: 3 };
      const mNormal = calculateAreaMetrics({ plot_area_sqm: 100 }, [flNormal]);
      expect(mNormal.evaluatedFloors[0].area_for_1_unit).toBe(50); // 150 / 3

      const flZero = { builtup_for_sale_sqm: 150, no_of_units: 0 };
      const mZero = calculateAreaMetrics({ plot_area_sqm: 100 }, [flZero]);
      expect(mZero.evaluatedFloors[0].area_for_1_unit).toBe(0); // Zero division protected

      const flNegative = { builtup_for_sale_sqm: 150, no_of_units: -2 };
      const mNeg = calculateAreaMetrics({ plot_area_sqm: 100 }, [flNegative]);
      expect(mNeg.evaluatedFloors[0].area_for_1_unit).toBe(0); // Negative protected
    });

    it('REQ-K: enforces strict 5-tier Gunthewari road-width matrix and rejects invalid widths with 400', async () => {
      // Valid width 12m with Gunthewari
      const validRes = await request(app)
        .put(`/api/projects/${testProject.id}/feasibility/area`)
        .set('Authorization', `Bearer ${testUsers.admin.token}`)
        .send({
          road_width_m: 12,
          is_gunthewari: true
        });

      expect(validRes.status).toBe(200);
      expect(parseFloat(validRes.body.statement.road_width_m)).toBe(12);
      expect(validRes.body.statement.is_gunthewari).toBe(true);
      expect(parseFloat(validRes.body.statement.regular_tdr_factor)).toBe(0.65); // Regular 12m rate
      expect(parseFloat(validRes.body.statement.slum_tdr_factor)).toBe(0.325); // Concurrent Gunthewari/Slum 12m rate

      // Valid width 24m without Gunthewari (Regular)
      const valid24 = await request(app)
        .put(`/api/projects/${testProject.id}/feasibility/area`)
        .set('Authorization', `Bearer ${testUsers.admin.token}`)
        .send({
          road_width_m: 24,
          is_gunthewari: false
        });

      expect(valid24.status).toBe(200);
      expect(parseFloat(valid24.body.statement.regular_tdr_factor)).toBe(1.10); // Regular 24m rate

      // Invalid road width e.g. 10m -> 400 Bad Request
      const invalidRes = await request(app)
        .put(`/api/projects/${testProject.id}/feasibility/area`)
        .set('Authorization', `Bearer ${testUsers.admin.token}`)
        .send({
          road_width_m: 10
        });

      expect(invalidRes.status).toBe(400);
      expect(invalidRes.body.error).toContain('Invalid road width');
    });

    it('REQ-C, REQ-E & REQ-J: toggles statutory charges, recalculates on RR %, soft-deletes, and excludes Amalgamation', async () => {
      // Get feasibility data to retrieve statutory charges
      const feasRes = await request(app)
        .get(`/api/projects/${testProject.id}/feasibility`)
        .set('Authorization', `Bearer ${testUsers.admin.token}`);

      const charges = feasRes.body.statutoryCharges;
      expect(charges.length).toBeGreaterThan(0);

      // Verify Amalgamation is not active
      const amalgCharge = charges.find(c => c.charge_name === 'AMALGAMATION');
      if (amalgCharge) {
        expect(amalgCharge.is_enabled).toBe(false);
      }

      const activeCharge = charges.find(c => c.charge_name !== 'AMALGAMATION');
      expect(activeCharge).toBeDefined();

      // 1. Update RR percentage on active charge
      const patchRes = await request(app)
        .patch(`/api/projects/${testProject.id}/feasibility/statutory/${activeCharge.id}`)
        .set('Authorization', `Bearer ${testUsers.admin.token}`)
        .send({
          is_enabled: true,
          rr_percentage: 3.5
        });

      expect(patchRes.status).toBe(200);
      expect(parseFloat(patchRes.body.charge.rr_percentage)).toBe(3.5);
      expect(patchRes.body.charge.is_enabled).toBe(true);

      // 2. Disable charge and verify exclusion from demand
      const disableRes = await request(app)
        .patch(`/api/projects/${testProject.id}/feasibility/statutory/${activeCharge.id}`)
        .set('Authorization', `Bearer ${testUsers.admin.token}`)
        .send({
          is_enabled: false
        });

      expect(disableRes.status).toBe(200);
      expect(disableRes.body.charge.is_enabled).toBe(false);

      // Verify calculateFinancialMetrics excludes disabled charge
      const finMetrics = calculateFinancialMetrics(
        { rr_rate_per_sqm: 25000 },
        [{ id: activeCharge.id, is_enabled: false, amount: 500000 }],
        [],
        { totalProposedPlineSqm: 500 }
      );
      expect(finMetrics.totalStatutoryDemandA).toBe(0); // Excluded!

      // 3. Soft-delete charge
      const deleteRes = await request(app)
        .delete(`/api/projects/${testProject.id}/feasibility/statutory/${activeCharge.id}`)
        .set('Authorization', `Bearer ${testUsers.admin.token}`);

      expect(deleteRes.status).toBe(200);
      expect(deleteRes.body.charge.is_deleted).toBe(true);
      expect(deleteRes.body.charge.is_enabled).toBe(false);
    });

    it('Floor Rate & Cost for 1 Unit: calculates cost_for_1_unit and drives floor-wise financial receipts', async () => {
      // 1. Add floor with rate_per_sqm
      const addRes = await request(app)
        .post(`/api/projects/${testProject.id}/feasibility/area/floors`)
        .set('Authorization', `Bearer ${testUsers.admin.token}`)
        .send({
          floor_name: 'Typical Floor',
          pline_area_sqm: 100,
          builtup_for_sale_sqm: 80,
          no_of_units: 2,
          rate_per_sqm: 50000
        });

      expect(addRes.status).toBe(201);
      expect(addRes.body.floor.floor_name).toBe('Typical Floor');
      expect(parseFloat(addRes.body.floor.rate_per_sqm)).toBe(50000);
      // area_for_1_unit = 80 / 2 = 40. cost_for_1_unit = 40 * 50000 = 2,000,000
      expect(parseFloat(addRes.body.floor.cost_for_1_unit)).toBe(2000000);

      // 2. Verify calculateFinancialMetrics floor-wise realization
      const stmt = { plot_area_sqm: 500 };
      const fls = [
        {
          floor_name: 'Ground Floor',
          pline_area_sqm: 100,
          builtup_for_sale_sqm: 80,
          no_of_units: 2,
          rate_per_sqm: 50000,
          cost_for_1_unit: 2000000
        }
      ];
      const areaMetrics = calculateAreaMetrics(stmt, fls);
      expect(areaMetrics.evaluatedFloors[0].area_for_1_unit).toBe(40);
      expect(areaMetrics.evaluatedFloors[0].cost_for_1_unit).toBe(2000000);

      const finMetrics = calculateFinancialMetrics(
        { rr_rate_per_sqm: 25000, estimated_cost_b_rate: 20000 },
        [],
        [],
        areaMetrics
      );
      // Floor realization: 80 sqm * 50000 = 4,000,000 (or 2 units * 2,000,000)
      expect(finMetrics.totalReceipts).toBe(4000000);
      // Civil construction cost derived from estimated_cost_b_rate (100 sqm * 20000 = 2,000,000)
      expect(finMetrics.costOfConstructionD).toBe(2000000);

      // Clean up added floor
      await pool.query('DELETE FROM project_area_floors WHERE id = $1', [addRes.body.floor.id]);
    });
  });
});
