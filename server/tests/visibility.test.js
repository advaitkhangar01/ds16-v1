const request = require('supertest');
const app = require('../index');
const pool = require('../db');
const { signToken } = require('../middleware/auth');

describe('Visibility & Access Control Tests', () => {
  let testUsers = {};
  let testProjects = {};
  let testVendors = [];

  beforeAll(async () => {
    // 1. Create a dummy client
    const { rows: clientRows } = await pool.query(
      `INSERT INTO clients (name, email) VALUES ('Test Visibility Client', 'test@visibility.com') RETURNING id`
    );
    const clientId = clientRows[0].id;

    // 2. Create mock users with different roles
    const roles = ['admin', 'project_head', 'design_head', 'employee', 'back_office'];
    for (const role of roles) {
      const { rows } = await pool.query(
        `INSERT INTO users (name, role, username, password_hash) 
         VALUES ($1, $2, $3, 'hashed_placeholder') RETURNING id, role`,
        [`Test ${role}`, role, `test_${role}`]
      );
      testUsers[role] = {
        id: rows[0].id,
        token: signToken(rows[0].id)
      };
    }

    // 3. Create mock projects
    // Project 1: Design Proposal status
    const { rows: p1Rows } = await pool.query(
      `INSERT INTO projects (name, client_id, type, status, created_by, client_name) 
       VALUES ('Proj Design Proposal', $1, 'Residential', 'Design Proposal', $2, 'Test Visibility Client') RETURNING id`,
      [clientId, testUsers.admin.id]
    );
    testProjects['proposal'] = p1Rows[0].id;

    // Project 2: Sanction status
    const { rows: p2Rows } = await pool.query(
      `INSERT INTO projects (name, client_id, type, status, created_by, client_name) 
       VALUES ('Proj Sanction', $1, 'Residential', 'Sanction', $2, 'Test Visibility Client') RETURNING id`,
      [clientId, testUsers.admin.id]
    );
    testProjects['sanction'] = p2Rows[0].id;

    // Project 3: Under Sanctioning status
    const { rows: p3Rows } = await pool.query(
      `INSERT INTO projects (name, client_id, type, status, created_by, client_name) 
       VALUES ('Proj Under Sanctioning', $1, 'Residential', 'Under Sanctioning', $2, 'Test Visibility Client') RETURNING id`,
      [clientId, testUsers.admin.id]
    );
    testProjects['under_sanctioning'] = p3Rows[0].id;

    // 4. Assign Employee to Project 1 (Design Proposal)
    await pool.query(
      `INSERT INTO project_assignments (project_id, user_id) VALUES ($1, $2)`,
      [testProjects.proposal, testUsers.employee.id]
    );

    // 5. Create mock vendors
    const { rows: v1Rows } = await pool.query(
      `INSERT INTO vendors (name, category) VALUES ('Test Vendor A', 'Carpenter') RETURNING id`
    );
    testVendors.push(v1Rows[0].id);

    const { rows: v2Rows } = await pool.query(
      `INSERT INTO vendors (name, category) VALUES ('Test Vendor B', 'Electrician') RETURNING id`
    );
    testVendors.push(v2Rows[0].id);
  });

  afterAll(async () => {
    // Clean up in reverse order of dependencies
    await pool.query(`DELETE FROM project_assignments WHERE user_id IN ($1, $2, $3, $4, $5)`, [
      testUsers.admin.id,
      testUsers.project_head.id,
      testUsers.design_head.id,
      testUsers.employee.id,
      testUsers.back_office.id
    ]);

    await pool.query(`DELETE FROM projects WHERE id IN ($1, $2, $3)`, [
      testProjects.proposal,
      testProjects.sanction,
      testProjects.under_sanctioning
    ]);

    await pool.query(`DELETE FROM users WHERE id IN ($1, $2, $3, $4, $5)`, [
      testUsers.admin.id,
      testUsers.project_head.id,
      testUsers.design_head.id,
      testUsers.employee.id,
      testUsers.back_office.id
    ]);

    await pool.query(`DELETE FROM clients WHERE name = 'Test Visibility Client'`);
    await pool.query(`DELETE FROM vendors WHERE id IN ($1, $2)`, [testVendors[0], testVendors[1]]);
  });

  describe('GET /api/projects - Visibility', () => {
    it('Admin should see all projects', async () => {
      const res = await request(app)
        .get('/api/projects')
        .set('Authorization', `Bearer ${testUsers.admin.token}`);
      expect(res.statusCode).toBe(200);
      const projectIds = res.body.projects.map(p => p.id);
      expect(projectIds).toContain(testProjects.proposal);
      expect(projectIds).toContain(testProjects.sanction);
      expect(projectIds).toContain(testProjects.under_sanctioning);
    });

    it('Project Head should see all projects', async () => {
      const res = await request(app)
        .get('/api/projects')
        .set('Authorization', `Bearer ${testUsers.project_head.token}`);
      expect(res.statusCode).toBe(200);
      const projectIds = res.body.projects.map(p => p.id);
      expect(projectIds).toContain(testProjects.proposal);
      expect(projectIds).toContain(testProjects.sanction);
      expect(projectIds).toContain(testProjects.under_sanctioning);
    });

    it('Design Head should see all projects', async () => {
      const res = await request(app)
        .get('/api/projects')
        .set('Authorization', `Bearer ${testUsers.design_head.token}`);
      expect(res.statusCode).toBe(200);
      const projectIds = res.body.projects.map(p => p.id);
      expect(projectIds).toContain(testProjects.proposal);
      expect(projectIds).toContain(testProjects.sanction);
      expect(projectIds).toContain(testProjects.under_sanctioning);
    });

    it('Regular Employee should see only their assigned projects', async () => {
      const res = await request(app)
        .get('/api/projects')
        .set('Authorization', `Bearer ${testUsers.employee.token}`);
      expect(res.statusCode).toBe(200);
      const projectIds = res.body.projects.map(p => p.id);
      expect(projectIds).toContain(testProjects.proposal);
      expect(projectIds).not.toContain(testProjects.sanction);
      expect(projectIds).not.toContain(testProjects.under_sanctioning);
    });

    it('Accounts / Back Office should see only sanction stage projects', async () => {
      const res = await request(app)
        .get('/api/projects')
        .set('Authorization', `Bearer ${testUsers.back_office.token}`);
      expect(res.statusCode).toBe(200);
      const projectIds = res.body.projects.map(p => p.id);
      expect(projectIds).not.toContain(testProjects.proposal);
      expect(projectIds).toContain(testProjects.sanction);
      expect(projectIds).toContain(testProjects.under_sanctioning);
    });
  });

  describe('GET /api/projects/:id - Access Control', () => {
    it('Employee should access their assigned project', async () => {
      const res = await request(app)
        .get(`/api/projects/${testProjects.proposal}`)
        .set('Authorization', `Bearer ${testUsers.employee.token}`);
      expect(res.statusCode).toBe(200);
    });

    it('Employee should be denied access to unassigned projects', async () => {
      const res = await request(app)
        .get(`/api/projects/${testProjects.sanction}`)
        .set('Authorization', `Bearer ${testUsers.employee.token}`);
      expect(res.statusCode).toBe(403);
    });

    it('Accounts should access sanction stage project', async () => {
      const res = await request(app)
        .get(`/api/projects/${testProjects.sanction}`)
        .set('Authorization', `Bearer ${testUsers.back_office.token}`);
      expect(res.statusCode).toBe(200);
    });

    it('Accounts should be denied access to non-sanction stage projects', async () => {
      const res = await request(app)
        .get(`/api/projects/${testProjects.proposal}`)
        .set('Authorization', `Bearer ${testUsers.back_office.token}`);
      expect(res.statusCode).toBe(403);
    });
  });

  describe('GET /api/vendors - Visibility', () => {
    it('All roles should see all vendors', async () => {
      for (const role of ['admin', 'employee', 'back_office']) {
        const res = await request(app)
          .get('/api/vendors')
          .set('Authorization', `Bearer ${testUsers[role].token}`);
        expect(res.statusCode).toBe(200);
        const vendorIds = res.body.vendors.map(v => v.id);
        expect(vendorIds).toContain(testVendors[0]);
        expect(vendorIds).toContain(testVendors[1]);
      }
    });
  });
});
