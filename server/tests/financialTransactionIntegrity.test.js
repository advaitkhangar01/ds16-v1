// server/tests/financialTransactionIntegrity.test.js
// Automated verification of Financial Transaction Integrity (ROB-001, ROB-002, ROB-003, ROB-004, CALC-006, CALC-007)

const request = require('supertest');
const app = require('../index');
const pool = require('../db');
const { signToken } = require('../middleware/auth');

describe('Phase 3 Financial Transaction Integrity Tests', () => {
  let adminUser = null;
  let testClientId = null;
  let testProject = null;
  let testInvoice = null;

  beforeAll(async () => {
    // 1. Create admin user
    await pool.query("DELETE FROM users WHERE username = 'fti_admin'");
    const { rows: uRows } = await pool.query(
      `INSERT INTO users (name, role, username, password_hash)
       VALUES ('FTI Admin', 'admin', 'fti_admin', 'hashed')
       RETURNING id, role`
    );
    adminUser = { id: uRows[0].id, token: signToken(uRows[0].id) };

    // 2. Create client & project
    const { rows: cRows } = await pool.query(
      `INSERT INTO clients (name, email) VALUES ('FTI Client', 'fti@client.com') RETURNING id`
    );
    testClientId = cRows[0].id;

    const { rows: pRows } = await pool.query(
      `INSERT INTO projects (name, client_id, type, status, created_by, client_name)
       VALUES ('FTI Project', $1, 'Commercial', 'In Progress', $2, 'FTI Client')
       RETURNING id`,
      [testClientId, adminUser.id]
    );
    testProject = pRows[0];
  });

  afterAll(async () => {
    if (testInvoice) {
      await pool.query('DELETE FROM transactions WHERE reference_id = $1', [testInvoice.invoice_no]);
      await pool.query('DELETE FROM invoices WHERE id = $1', [testInvoice.id]);
    }
    if (testProject) {
      await pool.query('DELETE FROM projects WHERE id = $1', [testProject.id]);
    }
    if (testClientId) {
      await pool.query('DELETE FROM clients WHERE id = $1', [testClientId]);
    }
    await pool.query("DELETE FROM users WHERE username = 'fti_admin'");
  });

  describe('ROB-001: Row-level lock & Idempotent Invoice Payment', () => {
    beforeEach(async () => {
      // Create a fresh invoice
      const invoiceNo = `FTI-INV-${Date.now()}`;
      const { rows } = await pool.query(
        `INSERT INTO invoices (invoice_no, project_id, client_id, client_name, amount, received_amount, status, date, items, tax_details)
         VALUES ($1, $2, $3, 'FTI Client', 100000.00, 0, 'generated', CURRENT_DATE, '[]'::jsonb, '{"tdsAmount": 10000}'::jsonb)
         RETURNING *`,
        [invoiceNo, testProject.id, testClientId]
      );
      testInvoice = rows[0];
    });

    afterEach(async () => {
      if (testInvoice) {
        await pool.query('DELETE FROM transactions WHERE reference_id = $1', [testInvoice.invoice_no]);
        await pool.query('DELETE FROM invoices WHERE id = $1', [testInvoice.id]);
        testInvoice = null;
      }
    });

    it('Concurrent or sequential mark-paid requests cannot create duplicate transactions (ROB-001)', async () => {
      // Execute 2 simultaneous mark-paid requests
      const [res1, res2] = await Promise.all([
        request(app)
          .post(`/api/invoices/${testInvoice.id}/mark-paid`)
          .set('Authorization', `Bearer ${adminUser.token}`),
        request(app)
          .post(`/api/invoices/${testInvoice.id}/mark-paid`)
          .set('Authorization', `Bearer ${adminUser.token}`)
      ]);

      // Exactly one should succeed (200) and the other should be rejected (400)
      const statuses = [res1.statusCode, res2.statusCode].sort();
      expect(statuses).toEqual([200, 400]);

      // Verify transactions table has exactly ONE entry
      const { rows: txns } = await pool.query(
        "SELECT * FROM transactions WHERE reference_id = $1 AND category = 'project_receipt'",
        [testInvoice.invoice_no]
      );
      expect(txns.length).toBe(1);
      // Net amount = 100,000 - 10,000 (TDS) = 90,000
      expect(parseFloat(txns[0].amount)).toBe(90000);
    });

    it('Partial payment accurately deducts TDS in remainingBalance (CALC-006)', async () => {
      // Total: 100,000, TDS: 10,000. Net receivable = 90,000. Pay 40,000 -> remaining balance should be 50,000
      const res = await request(app)
        .post(`/api/invoices/${testInvoice.id}/record-payment`)
        .set('Authorization', `Bearer ${adminUser.token}`)
        .send({ amount: 40000 });

      expect(res.statusCode).toBe(200);
      expect(res.body.remainingBalance).toBe(50000);

      // Verify invoice received_amount is 40000
      const { rows } = await pool.query('SELECT received_amount, status FROM invoices WHERE id = $1', [testInvoice.id]);
      expect(parseFloat(rows[0].received_amount)).toBe(40000);
      expect(rows[0].status).toBe('generated');
    });
  });

  describe('ROB-002: Status transitions synchronize ledger transactions', () => {
    it('Setting status=paid via PATCH inserts transaction, and reverting resets it', async () => {
      const invoiceNo = `FTI-PATCH-${Date.now()}`;
      const { rows } = await pool.query(
        `INSERT INTO invoices (invoice_no, project_id, client_id, client_name, amount, received_amount, status, date, items, tax_details)
         VALUES ($1, $2, $3, 'FTI Client', 50000.00, 0, 'generated', CURRENT_DATE, '[]'::jsonb, '{"tdsAmount": 5000}'::jsonb)
         RETURNING *`,
        [invoiceNo, testProject.id, testClientId]
      );
      const inv = rows[0];

      // 1. Mark paid via PATCH
      const patchPaidRes = await request(app)
        .patch(`/api/invoices/${inv.id}/status`)
        .set('Authorization', `Bearer ${adminUser.token}`)
        .send({ status: 'paid' });

      expect(patchPaidRes.statusCode).toBe(200);
      expect(patchPaidRes.body.invoice.status).toBe('paid');

      // Check transactions has project_receipt of 45,000
      const { rows: t1 } = await pool.query(
        "SELECT * FROM transactions WHERE reference_id = $1 AND category = 'project_receipt'",
        [inv.invoice_no]
      );
      expect(t1.length).toBe(1);
      expect(parseFloat(t1[0].amount)).toBe(45000);

      // 2. Revert to generated via PATCH
      const patchRevertRes = await request(app)
        .patch(`/api/invoices/${inv.id}/status`)
        .set('Authorization', `Bearer ${adminUser.token}`)
        .send({ status: 'generated' });

      expect(patchRevertRes.statusCode).toBe(200);
      expect(patchRevertRes.body.invoice.status).toBe('generated');
      expect(parseFloat(patchRevertRes.body.invoice.received_amount)).toBe(0);

      // Check transaction was reversed
      const { rows: t2 } = await pool.query(
        "SELECT * FROM transactions WHERE reference_id = $1 AND category = 'project_receipt'",
        [inv.invoice_no]
      );
      expect(t2.length).toBe(0);

      // Cleanup
      await pool.query('DELETE FROM invoices WHERE id = $1', [inv.id]);
    });
  });

  describe('CALC-007: Manual payroll override preservation', () => {
    it('PUT /payroll/employees/:id preserves is_manual_override records', async () => {
      // Create user and manual override payroll record
      const { rows: u } = await pool.query(
        `INSERT INTO users (name, role, username, password_hash, base_salary)
         VALUES ('FTI Staff', 'employee', 'fti_staff', 'hashed', 30000)
         RETURNING id`
      );
      const staffId = u[0].id;

      await pool.query(
        `INSERT INTO payroll (user_id, month, year, base_salary, net_paid, is_manual_override)
         VALUES ($1, 10, 2026, 30000, 25000, TRUE)`,
        [staffId]
      );

      // Update employee salary through accounting endpoint
      const res = await request(app)
        .put(`/api/accounting/payroll/employees/${staffId}`)
        .set('Authorization', `Bearer ${adminUser.token}`)
        .send({
          base_salary: 35000,
          month: 10,
          year: 2026
        });

      expect(res.statusCode).toBe(200);

      // Verify users table was updated
      const { rows: userCheck } = await pool.query('SELECT base_salary FROM users WHERE id = $1', [staffId]);
      expect(parseFloat(userCheck[0].base_salary)).toBe(35000);

      // Verify payroll record with is_manual_override was NOT overwritten
      const { rows: payrollCheck } = await pool.query('SELECT base_salary, net_paid, is_manual_override FROM payroll WHERE user_id = $1 AND month = 10 AND year = 2026', [staffId]);
      expect(parseFloat(payrollCheck[0].net_paid)).toBe(25000);
      expect(payrollCheck[0].is_manual_override).toBe(true);

      // Cleanup
      await pool.query('DELETE FROM payroll WHERE user_id = $1', [staffId]);
      await pool.query('DELETE FROM users WHERE id = $1', [staffId]);
    });
  });
});
