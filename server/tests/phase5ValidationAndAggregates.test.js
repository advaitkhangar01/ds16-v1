// server/tests/phase5ValidationAndAggregates.test.js
const request = require('supertest');
const app = require('../index');
const jwt = require('jsonwebtoken');

describe('Phase 5: Server-side Aggregates and Log-only Zod Request Validation', () => {
  let adminToken;

  beforeAll(() => {
    // Generate valid test JWT token for admin
    adminToken = jwt.sign(
      { userId: 1, role: 'admin' },
      process.env.JWT_SECRET || 'DS16_jwt_super_secret_change_this_in_production_2024',
      { expiresIn: '1h' }
    );
  });

  describe('1. Server-side Aggregates on Invoices & Transactions', () => {
    it('GET /api/invoices returns structured summary alongside invoice array', async () => {
      const res = await request(app)
        .get('/api/invoices')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.invoices)).toBe(true);
      expect(res.body.summary).toBeDefined();
      expect(typeof res.body.summary.totalCount).toBe('number');
      expect(typeof res.body.summary.totalAmount).toBe('number');
      expect(typeof res.body.summary.totalReceived).toBe('number');
      expect(typeof res.body.summary.totalPending).toBe('number');
    });

    it('GET /api/finances/transactions returns structured summary alongside transactions array', async () => {
      const res = await request(app)
        .get('/api/finances/transactions')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.transactions)).toBe(true);
      expect(res.body.summary).toBeDefined();
      expect(typeof res.body.summary.totalCount).toBe('number');
      expect(typeof res.body.summary.totalAmount).toBe('number');
    });
  });

  describe('2. Log-only Zod Validation Middleware Behavior', () => {
    it('Allows requests through in log-only mode without throwing 400 for unexpected schema shape', async () => {
      delete process.env.ENFORCE_REQUEST_VALIDATION;

      const res = await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          // Missing required 'title', invalid priority
          project_id: 1,
          priority: 'INVALID_PRIORITY_XYZ'
        });

      // Route handler's own validation will respond ("project_id and title are required"),
      // proving that Zod in log-only mode did NOT preemptively reject the request
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('project_id and title are required');
    });

    it('Rejects request with Zod details when ENFORCE_REQUEST_VALIDATION is true', async () => {
      process.env.ENFORCE_REQUEST_VALIDATION = 'true';

      const res = await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          // Missing required title
          project_id: 1,
          priority: 'INVALID_PRIORITY_XYZ'
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
      expect(Array.isArray(res.body.details)).toBe(true);
      expect(res.body.details.some(d => d.path === 'title')).toBe(true);

      // Clean up env flag
      delete process.env.ENFORCE_REQUEST_VALIDATION;
    });
  });
});
