const request = require('supertest');
const app = require('../index');
const pool = require('../db');
const { signToken } = require('../middleware/auth');
const path = require('path');
const fs = require('fs');

describe('Phase 5: API & File Reliability Tests', () => {
  let adminToken;
  let adminUser;
  let testProject;

  beforeAll(async () => {
    // 1. Get or create admin user
    const { rows: users } = await pool.query("SELECT * FROM users WHERE role = 'admin' LIMIT 1");
    if (users.length > 0) {
      adminUser = users[0];
    } else {
      const { rows } = await pool.query(
        `INSERT INTO users (name, email, password_hash, role)
         VALUES ('Admin Reliability Test', 'admin_rel@example.com', 'hash', 'admin')
         RETURNING *`
      );
      adminUser = rows[0];
    }
    adminToken = signToken(adminUser.id);

    // 2. Create test client & test project
    let clientId;
    const { rows: clients } = await pool.query('SELECT id, name FROM clients LIMIT 1');
    if (clients.length > 0) {
      clientId = clients[0].id;
    } else {
      const { rows: newClient } = await pool.query(
        "INSERT INTO clients (name, email, phone) VALUES ('Reliability Client', 'rel_client@example.com', '9999999999') RETURNING id"
      );
      clientId = newClient[0].id;
    }

    const { rows: projects } = await pool.query(
      `INSERT INTO projects (name, client_id, client_name, type, status, created_by)
       VALUES ('File Reliability Project', $1, 'Reliability Client', 'architecture', 'in_progress', $2)
       RETURNING *`,
      [clientId, adminUser.id]
    );
    testProject = projects[0];
  });

  afterAll(async () => {
    if (testProject) {
      await pool.query('DELETE FROM projects WHERE id = $1', [testProject.id]);
    }
    await pool.end();
  });

  describe('API-001: Request Body Validation Enforcement', () => {
    it('rejects POST /api/tasks with missing required title with 400 Validation failed', async () => {
      const res = await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          project_id: testProject.id
          // missing title
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('Validation failed');
      expect(Array.isArray(res.body.details)).toBe(true);
      expect(res.body.details.some(d => d.path === 'title')).toBe(true);
    });

    it('rejects POST /api/finances/transactions with negative amount with 400', async () => {
      const res = await request(app)
        .post('/api/finances/transactions')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          category: 'Office Supplies',
          amount: -500 // negative amount
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('Validation failed');
      expect(res.body.details.some(d => d.path === 'amount')).toBe(true);
    });
  });

  describe('SEC-004: Timeline Evidence Upload File Validation', () => {
    it('rejects upload of dangerous file extension (.exe) with 400', async () => {
      // Create a dummy timeline task
      const { rows: [task] } = await pool.query(
        `INSERT INTO timeline_tasks (project_id, task_name, category, construction_stage, planned_start_date, planned_finish_date, duration_days, created_by)
         VALUES ($1, 'Inspection Task', 'Substructure', 'Excavation', CURRENT_DATE, CURRENT_DATE + 5, 5, $2)
         RETURNING *`,
        [testProject.id, adminUser.id]
      );

      const fakeScript = Buffer.from('MZ fake executable');
      const res = await request(app)
        .post(`/api/projects/${testProject.id}/timeline/tasks/${task.id}/evidence`)
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', fakeScript, 'malicious.exe');

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toMatch(/File type '\.exe' is not permitted/i);

      // Cleanup task
      await pool.query('DELETE FROM timeline_tasks WHERE id = $1', [task.id]);
    });
  });

  describe('API-003: Document Download Path Traversal Guard', () => {
    it('rejects download request with 403 if file_path traverses outside uploads directory', async () => {
      // Insert a malicious document record pointing to ../package.json
      const { rows: [doc] } = await pool.query(
        `INSERT INTO documents (project_id, uploaded_by, file_name, file_path, file_type, file_size)
         VALUES ($1, $2, 'traversal.json', '../package.json', 'application/json', 100)
         RETURNING *`,
        [testProject.id, adminUser.id]
      );

      const res = await request(app)
        .get(`/api/documents/${doc.id}/download`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(403);
      expect(res.body.error).toMatch(/Access denied/i);

      // Cleanup doc
      await pool.query('DELETE FROM documents WHERE id = $1', [doc.id]);
    });
  });
});
