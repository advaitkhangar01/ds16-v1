// server/tests/responsibilities.test.js
const request = require('supertest');
const app = require('../index');
const pool = require('../db');
const { signToken } = require('../middleware/auth');

describe('Responsibilities Workflow API', () => {
  let adminToken;
  let employeeToken;
  let adminUser;
  let employeeUser;
  let testRespId;

  beforeAll(async () => {
    const { rows: admins } = await pool.query("SELECT id, name, role FROM users WHERE role = 'admin' AND is_active IS NOT FALSE LIMIT 1");
    const { rows: emps } = await pool.query("SELECT id, name, role FROM users WHERE role = 'employee' AND is_active IS NOT FALSE LIMIT 1");
    adminUser = admins[0];
    employeeUser = emps[0];
    adminToken = signToken(adminUser.id);
    employeeToken = signToken(employeeUser.id);
  });

  afterAll(async () => {
    if (testRespId) {
      await pool.query('DELETE FROM responsibilities WHERE id = $1', [testRespId]).catch(() => {});
    }
  });

  test('POST /api/responsibilities - fails for unauthenticated request', async () => {
    const res = await request(app).post('/api/responsibilities').send({
      userId: employeeUser.id,
      description: 'Prepare tender documents',
    });
    expect(res.status).toBe(401);
  });

  test('POST /api/responsibilities - fails for employee (403)', async () => {
    const res = await request(app)
      .post('/api/responsibilities')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        userId: employeeUser.id,
        description: 'Prepare tender documents',
      });
    expect(res.status).toBe(403);
  });

  test('POST /api/responsibilities - creates responsibility for admin', async () => {
    const res = await request(app)
      .post('/api/responsibilities')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        userId: employeeUser.id,
        description: 'Review structural calculations and coordinate with site team.',
      });

    expect(res.status).toBe(201);
    expect(res.body.responsibility).toBeDefined();
    expect(res.body.responsibility.employee_acknowledged).toBe(false);
    expect(res.body.responsibility.admin_verified).toBe(false);
    testRespId = res.body.responsibility.id;
  });

  test('PATCH /api/responsibilities/:id/verify - fails before employee acknowledgement (400)', async () => {
    const res = await request(app)
      .patch(`/api/responsibilities/${testRespId}/verify`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
  });

  test('PATCH /api/responsibilities/:id/acknowledge - succeeds for assigned employee', async () => {
    const res = await request(app)
      .patch(`/api/responsibilities/${testRespId}/acknowledge`)
      .set('Authorization', `Bearer ${employeeToken}`);

    expect(res.status).toBe(200);
    expect(res.body.responsibility.employee_acknowledged).toBe(true);
    expect(res.body.responsibility.employee_acknowledged_at).toBeTruthy();
    expect(res.body.responsibility.admin_verified).toBe(false);
  });

  test('PATCH /api/responsibilities/:id/acknowledge - cannot be repeated by employee', async () => {
    const res = await request(app)
      .patch(`/api/responsibilities/${testRespId}/acknowledge`)
      .set('Authorization', `Bearer ${employeeToken}`);
    expect(res.status).toBe(400);
  });

  test('PATCH /api/responsibilities/:id/verify - succeeds for admin once acknowledged', async () => {
    const res = await request(app)
      .patch(`/api/responsibilities/${testRespId}/verify`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.responsibility.admin_verified).toBe(true);
    expect(res.body.responsibility.admin_verified_at).toBeTruthy();
  });

  test('PATCH /api/responsibilities/:id/reset-verification - admin reverses verification', async () => {
    const res = await request(app)
      .patch(`/api/responsibilities/${testRespId}/reset-verification`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.responsibility.admin_verified).toBe(false);
    expect(res.body.responsibility.employee_acknowledged).toBe(true);
  });

  test('PATCH /api/responsibilities/:id/reset-acknowledgement - admin resets to pending', async () => {
    const res = await request(app)
      .patch(`/api/responsibilities/${testRespId}/reset-acknowledgement`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.responsibility.employee_acknowledged).toBe(false);
    expect(res.body.responsibility.admin_verified).toBe(false);
  });

  test('DELETE /api/responsibilities/:id - admin deletes record', async () => {
    const res = await request(app)
      .delete(`/api/responsibilities/${testRespId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    testRespId = null;
  });
});
