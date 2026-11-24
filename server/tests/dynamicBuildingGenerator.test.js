const request = require('supertest');
const app = require('../index');
const pool = require('../db');
const { signToken } = require('../middleware/auth');
const { generateDraftActivities, calculateStructuralSlabs } = require('../services/timelineGenerator');

describe('Dynamic Building Configuration & Automated Activity Generation Tests', () => {
  let testProject;
  let adminUser;
  let engineerUser;
  let testClientId;

  beforeAll(async () => {
    // 1. Create client
    const { rows: clientRows } = await pool.query(
      "INSERT INTO clients (name, email) VALUES ('Dynamic Test Client', 'dyn@testclient.com') RETURNING id"
    );
    testClientId = clientRows[0].id;

    // 2. Fetch or create users
    const { rows: admins } = await pool.query("SELECT * FROM users WHERE role = 'admin' LIMIT 1");
    adminUser = admins[0];

    const { rows: engineers } = await pool.query("SELECT * FROM users WHERE role = 'civil_engineer' LIMIT 1");
    engineerUser = engineers[0] || adminUser;

    // Create a dedicated test project
    const { rows: [proj] } = await pool.query(
      `INSERT INTO projects (name, client_id, type, status, created_by, client_name)
       VALUES ('Dynamic Building Timeline Test Project', $1, 'Residential', 'Planning', $2, 'Dynamic Test Client')
       RETURNING *`,
      [testClientId, adminUser.id]
    );
    testProject = proj;

    // Generate JWT tokens
    adminUser.token = signToken(adminUser.id);
    engineerUser.token = signToken(engineerUser.id);
  });

  afterAll(async () => {
    if (testProject) {
      await pool.query('DELETE FROM timeline_tasks WHERE project_id = $1', [testProject.id]);
      await pool.query('DELETE FROM timeline_configurations WHERE project_id = $1', [testProject.id]);
      await pool.query('DELETE FROM projects WHERE id = $1', [testProject.id]);
    }
    if (testClientId) {
      await pool.query('DELETE FROM clients WHERE id = $1', [testClientId]);
    }
    await pool.end();
  });

  describe('1. Structural Slab Breakdown & Slab Counter Formula', () => {
    it('accurately computes slabs for G+1 (low-rise)', () => {
      const breakdown = calculateStructuralSlabs({
        basement_count: 0,
        upper_parking_count: 0,
        floors_above_ground: 1,
        has_terrace_tank_slab: false
      });
      // 0 basements + 1 plinth + 0 podiums + 1 habitable + 1 terrace + 0 tank = 3 total slabs
      expect(breakdown.totalSlabs).toBe(3);
      expect(breakdown.plinthSlabs).toBe(1);
      expect(breakdown.habitableSlabs).toBe(1);
      expect(breakdown.terraceSlabs).toBe(1);
      expect(breakdown.tankSlabs).toBe(0);
    });

    it('accurately computes slabs for 2 basements + 2 podiums + G+8 habitable + terrace + tank (high-rise)', () => {
      const breakdown = calculateStructuralSlabs({
        basement_count: 2,
        upper_parking_count: 2,
        floors_above_ground: 8,
        has_terrace_tank_slab: true
      });
      // 2 basements + 1 plinth + 2 podiums + 8 habitable + 1 terrace + 1 tank = 15 total slabs
      expect(breakdown.totalSlabs).toBe(15);
      expect(breakdown.basementSlabs).toBe(2);
      expect(breakdown.plinthSlabs).toBe(1);
      expect(breakdown.podiumSlabs).toBe(2);
      expect(breakdown.habitableSlabs).toBe(8);
      expect(breakdown.terraceSlabs).toBe(1);
      expect(breakdown.tankSlabs).toBe(1);
    });
  });

  describe('2. Five Main Construction Groups & Sequence Ordering', () => {
    it('produces activities grouped strictly into Site Preparation, RCC Work, Masonry Work, Finishing Work, Additional Work', () => {
      const activities = generateDraftActivities({
        floors_above_ground: 4,
        basement_count: 1,
        upper_parking_count: 1,
        has_terrace_tank_slab: true,
        has_lift: true,
        additional_work_config: { elevation: true, lift: true, fire_fighting: true, solar: true }
      });

      const sections = activities.map(a => a.section_name);
      const uniqueSections = [...new Set(sections)];

      expect(uniqueSections).toEqual([
        'Site Preparation',
        'RCC Work',
        'Masonry Work',
        'Finishing Work',
        'Additional Work'
      ]);

      // Verify strict chronological order
      let lastOrder = -1;
      for (const a of activities) {
        expect(a.order_index).toBeGreaterThan(lastOrder);
        lastOrder = a.order_index;
      }
    });
  });

  describe('3. Masonry Trigger & Dependency Rules Across Dynamic Heights', () => {
    it('for N >= 3 (e.g. G+4), Ground Floor Brickwork triggers from 3rd slab casting with configured lag', () => {
      const lagDays = 2;
      const activities = generateDraftActivities({
        floors_above_ground: 4,
        has_terrace_tank_slab: true,
        masonry_lag_days: lagDays
      });

      const groundBrickwork = activities.find(a => a.activity_key === 'MASONRY:FLOOR_0:BRICKWORK');
      expect(groundBrickwork).toBeDefined();

      const triggerPred = groundBrickwork.predecessors.find(p => p.predecessor_key === 'RCC:FLOOR_3:SLAB_CONCRETING');
      expect(triggerPred).toBeDefined();
      expect(triggerPred.lag).toBe(lagDays);

      const slab3 = activities.find(a => a.activity_key === 'RCC:FLOOR_3:SLAB_CONCRETING');
      expect(slab3.metadata.is_trigger_milestone).toBe(true);
      expect(slab3.metadata.milestone_code).toBe('SLAB_3RD_FLOOR');
    });

    it('for N < 3 (e.g. G+2), Ground Floor Brickwork triggers after all RCC slabs finish', () => {
      const activities = generateDraftActivities({
        floors_above_ground: 2,
        has_terrace_tank_slab: true
      });

      const groundBrickwork = activities.find(a => a.activity_key === 'MASONRY:FLOOR_0:BRICKWORK');
      expect(groundBrickwork).toBeDefined();

      // Does not depend on 3rd floor slab because 3rd floor does not exist
      const triggerPred = groundBrickwork.predecessors.find(p => p.predecessor_key === 'RCC:FLOOR_3:SLAB_CONCRETING');
      expect(triggerPred).toBeUndefined();

      // Depends on the last RCC task (Water Tank Slab or Terrace Slab)
      const lastRcc = activities.filter(a => a.section_name === 'RCC Work').slice(-1)[0];
      const hasPred = groundBrickwork.predecessors.some(p => p.predecessor_id === lastRcc.temp_id || p.predecessor_key === lastRcc.activity_key);
      expect(hasPred).toBe(true);
    });
  });

  describe('4. Additional Work Checkboxes & Lift System Toggle', () => {
    it('correctly includes or excludes Elevation, Lift, Fire Fighting, and Solar tasks', () => {
      const withAll = generateDraftActivities({
        floors_above_ground: 3,
        additional_work_config: { elevation: true, lift: true, fire_fighting: true, solar: true }
      });
      const additionalKeys = withAll.filter(a => a.section_name === 'Additional Work').map(a => a.activity_key);
      expect(additionalKeys).toContain('ADDITIONAL:ELEVATION');
      expect(additionalKeys).toContain('ADDITIONAL:LIFT_INSTALLATION');
      expect(additionalKeys).toContain('ADDITIONAL:LIFT_COMMISSIONING');
      expect(additionalKeys).toContain('ADDITIONAL:FIRE_FIGHTING');
      expect(additionalKeys).toContain('ADDITIONAL:SOLAR_INSTALLATION');

      const withNone = generateDraftActivities({
        floors_above_ground: 3,
        has_lift: false,
        additional_work_config: { elevation: false, lift: false, fire_fighting: false, solar: false }
      });
      const noneKeys = withNone.filter(a => a.section_name === 'Additional Work').map(a => a.activity_key);
      expect(noneKeys.length).toBe(0);
    });
  });

  describe('5. Automatic Save & Safe Database Reconciliation (API)', () => {
    it('POST /timeline/config saves configuration, auto-generates draft tasks, and returns reconciliation summary', async () => {
      const res = await request(app)
        .post(`/api/projects/${testProject.id}/timeline/config`)
        .set('Authorization', `Bearer ${adminUser.token}`)
        .send({
          floors_above_ground: 3,
          basement_count: 1,
          upper_parking_count: 0,
          has_stilt_parking: true,
          has_terrace_tank_slab: true,
          has_lift: true,
          masonry_lag_days: 1,
          additional_work_config: { elevation: true, lift: true, fire_fighting: false, solar: false }
        });

      expect(res.status).toBe(200);
      expect(res.body.reconciliation).toBeDefined();
      expect(res.body.reconciliation.created).toBeGreaterThan(30);
      expect(res.body.slabs).toBeDefined();
      // 1 basement + 1 plinth + 0 podiums + 3 habitable + 1 terrace + 1 tank = 7 slabs
      expect(res.body.slabs.totalSlabs).toBe(7);
    });

    it('re-saving identical configuration is idempotent and does not create duplicate tasks', async () => {
      const res = await request(app)
        .post(`/api/projects/${testProject.id}/timeline/config`)
        .set('Authorization', `Bearer ${adminUser.token}`)
        .send({
          floors_above_ground: 3,
          basement_count: 1,
          upper_parking_count: 0,
          has_stilt_parking: true,
          has_terrace_tank_slab: true,
          has_lift: true,
          masonry_lag_days: 1,
          additional_work_config: { elevation: true, lift: true, fire_fighting: false, solar: false }
        });

      expect(res.status).toBe(200);
      expect(res.body.reconciliation.created).toBe(0);
      expect(res.body.reconciliation.archived).toBe(0);
      expect(res.body.reconciliation.retained + res.body.reconciliation.updated).toBeGreaterThan(30);
    });

    it('publishing timeline promotes draft tasks to active schedule v1', async () => {
      const publishRes = await request(app)
        .post(`/api/projects/${testProject.id}/timeline/publish`)
        .set('Authorization', `Bearer ${adminUser.token}`)
        .send({ notes: 'Initial publish for dynamic building' });

      expect(publishRes.status).toBe(200);
      expect(publishRes.body.published_version).toBe(1);

      const tasksRes = await request(app)
        .get(`/api/projects/${testProject.id}/timeline/tasks`)
        .set('Authorization', `Bearer ${adminUser.token}`);

      expect(tasksRes.status).toBe(200);
      expect(tasksRes.body.count).toBeGreaterThan(30);
    });

    it('preserves completed/in-progress tasks and progress when configuration is modified post-publish', async () => {
      // Find Site Demarcation and mark Completed
      const { rows: [siteTask] } = await pool.query(
        "SELECT * FROM timeline_tasks WHERE project_id = $1 AND activity_key = 'SITE:CLEARING' AND is_archived = FALSE LIMIT 1",
        [testProject.id]
      );
      expect(siteTask).toBeDefined();

      await pool.query(
        "UPDATE timeline_tasks SET status = 'Completed', actual_start_date = '2027-01-01', actual_finish_date = '2027-01-05' WHERE id = $1",
        [siteTask.id]
      );

      // Now change configuration: add 1 floor (from 3 to 4) and enable Solar
      const updateConfigRes = await request(app)
        .post(`/api/projects/${testProject.id}/timeline/config`)
        .set('Authorization', `Bearer ${adminUser.token}`)
        .send({
          floors_above_ground: 4,
          basement_count: 1,
          upper_parking_count: 0,
          has_stilt_parking: true,
          has_terrace_tank_slab: true,
          has_lift: true,
          masonry_lag_days: 1,
          additional_work_config: { elevation: true, lift: true, fire_fighting: false, solar: true }
        });

      expect(updateConfigRes.status).toBe(200);
      expect(updateConfigRes.body.reconciliation.created).toBeGreaterThan(0); // Floor 4 tasks and solar created
      expect(updateConfigRes.body.reconciliation.retained).toBeGreaterThanOrEqual(1); // Site task retained

      // Verify site task retains its Completed status and actual dates
      const { rows: [retainedTask] } = await pool.query(
        'SELECT * FROM timeline_tasks WHERE id = $1',
        [siteTask.id]
      );
      expect(retainedTask.status).toBe('Completed');
      expect(retainedTask.actual_start_date).toBeDefined();
      expect(retainedTask.actual_finish_date).toBeDefined();
    });
  });
});
