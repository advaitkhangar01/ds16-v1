// server/tests/accessControlNegative.test.js
// Automated negative and authorization verification tests for DS16 Access Control (SEC-001, SEC-002, SEC-003)

const request = require('supertest');
const app = require('../index');
const pool = require('../db');
const { signToken } = require('../middleware/auth');

describe('Phase 2 Access Control & Authorization Negative Tests', () => {
  let testUsers = {};
  let testClientId = null;
  let assignedProject = null;
  let unassignedProject = null;
  let unassignedTask = null;

  beforeAll(async () => {
    // 1. Create client
    const { rows: clientRows } = await pool.query(
      `INSERT INTO clients (name, email) VALUES ('AC Test Client', 'ac_client@test.com') RETURNING id`
    );
    testClientId = clientRows[0].id;

    // 2. Create users: admin, project_head, employee_a, employee_b
    const roles = [
      { name: 'AC Admin', role: 'admin', username: 'ac_test_admin' },
      { name: 'AC Project Head', role: 'project_head', username: 'ac_test_head' },
      { name: 'AC Employee A', role: 'employee', username: 'ac_test_emp_a' },
      { name: 'AC Employee B', role: 'employee', username: 'ac_test_emp_b' }
    ];

    await pool.query("DELETE FROM users WHERE username LIKE 'ac_test_%'");

    for (const r of roles) {
      const { rows } = await pool.query(
        `INSERT INTO users (name, role, username, password_hash)
         VALUES ($1, $2, $3, 'hashed_pwd')
         RETURNING id, role`,
        [r.name, r.role, r.username]
      );
      testUsers[r.username] = {
        id: rows[0].id,
        role: rows[0].role,
        token: signToken(rows[0].id)
      };
    }

    // 3. Create two projects
    const { rows: p1 } = await pool.query(
      `INSERT INTO projects (name, client_id, type, status, created_by, client_name)
       VALUES ('AC Assigned Project', $1, 'Residential', 'In Progress', $2, 'AC Test Client')
       RETURNING *`,
      [testClientId, testUsers.ac_test_admin.id]
    );
    assignedProject = p1[0];

    const { rows: p2 } = await pool.query(
      `INSERT INTO projects (name, client_id, type, status, created_by, client_name)
       VALUES ('AC Unassigned Project', $1, 'Commercial', 'In Progress', $2, 'AC Test Client')
       RETURNING *`,
      [testClientId, testUsers.ac_test_admin.id]
    );
    unassignedProject = p2[0];

    // Create a stage for unassigned project
    await pool.query(
      `INSERT INTO project_stages (project_id, stage_name, status)
       VALUES ($1, 'Concept', 'pending')
       ON CONFLICT (project_id, stage_name) DO NOTHING`,
      [unassignedProject.id]
    );

    // 4. Assign Employee A to assignedProject ONLY
    await pool.query(
      `INSERT INTO project_assignments (project_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [assignedProject.id, testUsers.ac_test_emp_a.id]
    );

    // 5. Create a task assigned to Employee B in unassignedProject
    const { rows: tRows } = await pool.query(
      `INSERT INTO tasks (project_id, title, assigned_to, created_by, status)
       VALUES ($1, 'Private Task for Emp B', $2, $3, 'pending')
       RETURNING *`,
      [unassignedProject.id, testUsers.ac_test_emp_b.id, testUsers.ac_test_admin.id]
    );
    unassignedTask = tRows[0];
  });

  afterAll(async () => {
    // Cleanup
    if (unassignedTask) {
      await pool.query('DELETE FROM tasks WHERE id = $1', [unassignedTask.id]);
    }
    if (assignedProject && unassignedProject) {
      await pool.query('DELETE FROM project_assignments WHERE project_id IN ($1, $2)', [assignedProject.id, unassignedProject.id]);
      await pool.query('DELETE FROM project_stages WHERE project_id IN ($1, $2)', [assignedProject.id, unassignedProject.id]);
      await pool.query('DELETE FROM projects WHERE id IN ($1, $2)', [assignedProject.id, unassignedProject.id]);
    }
    if (testClientId) {
      await pool.query('DELETE FROM clients WHERE id = $1', [testClientId]);
    }
    await pool.query("DELETE FROM users WHERE username LIKE 'ac_test_%'");
  });

  describe('SEC-002: Role-based Project and Client Mutation Permissions', () => {
    it('Employee cannot create a project (403)', async () => {
      const res = await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${testUsers.ac_test_emp_a.token}`)
        .send({
          name: 'Unauthorized Project',
          client_id: testClientId,
          type: 'Residential'
        });
      expect(res.statusCode).toBe(403);
    });

    it('Project Head CAN create a project (201)', async () => {
      const res = await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${testUsers.ac_test_head.token}`)
        .send({
          name: 'Head Created Project',
          client_id: testClientId,
          type: 'Residential'
        });
      expect(res.statusCode).toBe(201);
      // Clean it up immediately
      await pool.query('DELETE FROM projects WHERE id = $1', [res.body.project.id]);
    });

    it('Employee cannot modify project stages on unassigned projects (403)', async () => {
      const { rows: stages } = await pool.query(
        'SELECT id FROM project_stages WHERE project_id = $1 LIMIT 1',
        [unassignedProject.id]
      );
      const stageId = stages[0].id;

      const res = await request(app)
        .patch(`/api/projects/${unassignedProject.id}/stages/${stageId}`)
        .set('Authorization', `Bearer ${testUsers.ac_test_emp_a.token}`)
        .send({ status: 'completed' });
      expect(res.statusCode).toBe(403);
    });

    it('Employee cannot add stakeholders to a project (403)', async () => {
      const res = await request(app)
        .post(`/api/projects/${assignedProject.id}/stakeholders`)
        .set('Authorization', `Bearer ${testUsers.ac_test_emp_a.token}`)
        .send({ name: 'Hacked Stakeholder', phone: '9999999999' });
      expect(res.statusCode).toBe(403);
    });

    it('Employee cannot create clients (403)', async () => {
      const res = await request(app)
        .post('/api/clients')
        .set('Authorization', `Bearer ${testUsers.ac_test_emp_a.token}`)
        .send({ name: 'Unauthorized Client' });
      expect(res.statusCode).toBe(403);
    });
  });

  describe('SEC-001 & SEC-003: Task and Project Isolation', () => {
    it('Employee A cannot access Employee B task in unassigned project (403)', async () => {
      const res = await request(app)
        .get(`/api/tasks/${unassignedTask.id}`)
        .set('Authorization', `Bearer ${testUsers.ac_test_emp_a.token}`);
      expect(res.statusCode).toBe(403);
    });

    it('Employee B CAN access their own assigned task (200)', async () => {
      const res = await request(app)
        .get(`/api/tasks/${unassignedTask.id}`)
        .set('Authorization', `Bearer ${testUsers.ac_test_emp_b.token}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.task.id).toBe(unassignedTask.id);
    });

    it('Employee A kanban does not leak unassignedProject tasks', async () => {
      const res = await request(app)
        .get('/api/tasks?view=kanban')
        .set('Authorization', `Bearer ${testUsers.ac_test_emp_a.token}`);
      expect(res.statusCode).toBe(200);

      // Verify unassignedTask does not appear in Employee A kanban
      const allTasks = res.body.kanban.flatMap(col => col.tasks);
      const leaked = allTasks.find(t => t.id === unassignedTask.id);
      expect(leaked).toBeUndefined();
    });
  });

  describe('SEC-003: Attendance and Leave Reason Masking', () => {
    it('Employee today attendance masks peer GPS and late minutes', async () => {
      const res = await request(app)
        .get('/api/attendance/today')
        .set('Authorization', `Bearer ${testUsers.ac_test_emp_a.token}`);
      expect(res.statusCode).toBe(200);

      const peerRows = res.body.attendance.filter(r => r.user_id === testUsers.ac_test_emp_b.id);
      if (peerRows.length > 0) {
        expect(peerRows[0].lat).toBeNull();
        expect(peerRows[0].lng).toBeNull();
        expect(peerRows[0].late_minutes).toBeNull();
      }
    });

    it('Employee dashboard masks colleague leave reasons', async () => {
      // Create an approved leave request for Employee B with sensitive reason
      const { rows: lr } = await pool.query(
        `INSERT INTO leave_requests (user_id, type, start_date, end_date, reason, status)
         VALUES ($1, 'sick', CURRENT_DATE, CURRENT_DATE + 1, 'Sensitive Medical Condition', 'approved')
         RETURNING id`,
        [testUsers.ac_test_emp_b.id]
      );

      const res = await request(app)
        .get('/api/dashboard/employee')
        .set('Authorization', `Bearer ${testUsers.ac_test_emp_a.token}`);
      expect(res.statusCode).toBe(200);

      const activeLeaves = res.body.active_team_leaves || [];
      const empBLeave = activeLeaves.find(l => l.user_id === testUsers.ac_test_emp_b.id);
      if (empBLeave) {
        expect(empBLeave.reason).toBeNull();
      }

      // Cleanup leave
      await pool.query('DELETE FROM leave_requests WHERE id = $1', [lr[0].id]);
    });
  });
});
