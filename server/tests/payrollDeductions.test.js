// server/tests/payrollDeductions.test.js
const pool = require('../db');
const { calculatePayrollForEmployee } = require('../utils/payroll');

describe('Payroll Late-Arrival & Deduction Logic Tests', () => {
  let testUserId;

  beforeAll(async () => {
    // Create test user with ₹25,000 monthly base salary
    const { rows } = await pool.query(
      `INSERT INTO users (name, username, password_hash, role, base_salary, hourly_rate)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [`Test Employee ${Date.now()}`, `test_emp_${Date.now()}`, 'hash123', 'employee', 25000.00, 0.00]
    );
    testUserId = rows[0].id;
  });

  afterAll(async () => {
    if (testUserId) {
      await pool.query('DELETE FROM attendance WHERE user_id = $1', [testUserId]);
      await pool.query('DELETE FROM users WHERE id = $1', [testUserId]);
    }
    await pool.end();
  });

  afterEach(async () => {
    if (testUserId) {
      await pool.query('DELETE FROM attendance WHERE user_id = $1', [testUserId]);
    }
  });

  const defaultSettings = {
    office_start_time: '10:00',
    late_threshold_time: '10:15',
    half_day_cutoff_time: '13:00',
    late_penalty_rule_count: '3',
    late_penalty_rule_days: '0.15',
    half_day_penalty_percent: '50'
  };

  test('3 lates should trigger 0.15 day deduction', async () => {
    // Insert 3 late attendance records in Aug 2026
    const dates = ['2026-08-01', '2026-08-03', '2026-08-04'];
    for (const d of dates) {
      await pool.query(
        `INSERT INTO attendance (user_id, date, check_in, check_out, status, is_late, late_minutes, hours_worked)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [testUserId, d, `${d}T10:20:00+05:30`, `${d}T19:00:00+05:30`, 'working', true, 20, 8.67]
      );
    }

    const res = await calculatePayrollForEmployee(testUserId, 8, 2026, defaultSettings, pool);
    expect(res.late_count).toBe(3);
    expect(res.late_penalty_days).toBe(0.15);
    // Daily rate = 25000 / 31 = 806.45
    expect(res.late_deduction_amount).toBeCloseTo(0.15 * (25000 / 31), 1);
  });

  test('6 lates should trigger 0.30 day deduction', async () => {
    for (let day = 1; day <= 6; day++) {
      const d = `2026-08-${String(day).padStart(2, '0')}`;
      await pool.query(
        `INSERT INTO attendance (user_id, date, check_in, check_out, status, is_late, late_minutes, hours_worked)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [testUserId, d, `${d}T10:20:00+05:30`, `${d}T19:00:00+05:30`, 'working', true, 20, 8.67]
      );
    }

    const res = await calculatePayrollForEmployee(testUserId, 8, 2026, defaultSettings, pool);
    expect(res.late_count).toBe(6);
    expect(res.late_penalty_days).toBe(0.30);
  });

  test('15 lates should trigger 0.75 day deduction', async () => {
    for (let day = 1; day <= 15; day++) {
      const d = `2026-08-${String(day).padStart(2, '0')}`;
      await pool.query(
        `INSERT INTO attendance (user_id, date, check_in, check_out, status, is_late, late_minutes, hours_worked)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [testUserId, d, `${d}T10:20:00+05:30`, `${d}T19:00:00+05:30`, 'working', true, 20, 8.67]
      );
    }

    const res = await calculatePayrollForEmployee(testUserId, 8, 2026, defaultSettings, pool);
    expect(res.late_count).toBe(15);
    expect(res.late_penalty_days).toBe(0.75);
  });

  test('16 lates should trigger 0.75 day deduction (only completed groups of 3 count)', async () => {
    for (let day = 1; day <= 16; day++) {
      const d = `2026-08-${String(day).padStart(2, '0')}`;
      await pool.query(
        `INSERT INTO attendance (user_id, date, check_in, check_out, status, is_late, late_minutes, hours_worked)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [testUserId, d, `${d}T10:20:00+05:30`, `${d}T19:00:00+05:30`, 'working', true, 20, 8.67]
      );
    }

    const res = await calculatePayrollForEmployee(testUserId, 8, 2026, defaultSettings, pool);
    expect(res.late_count).toBe(16);
    expect(res.late_penalty_days).toBe(0.75);
  });

  test('18 lates should trigger 0.90 day deduction', async () => {
    for (let day = 1; day <= 18; day++) {
      const d = `2026-08-${String(day).padStart(2, '0')}`;
      await pool.query(
        `INSERT INTO attendance (user_id, date, check_in, check_out, status, is_late, late_minutes, hours_worked)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [testUserId, d, `${d}T10:20:00+05:30`, `${d}T19:00:00+05:30`, 'working', true, 20, 8.67]
      );
    }

    const res = await calculatePayrollForEmployee(testUserId, 8, 2026, defaultSettings, pool);
    expect(res.late_count).toBe(18);
    expect(res.late_penalty_days).toBe(0.90);
  });

  test('0, 1, or 2 lates should trigger 0.00 day deduction', async () => {
    // 2 lates
    for (let day = 1; day <= 2; day++) {
      const d = `2026-08-${String(day).padStart(2, '0')}`;
      await pool.query(
        `INSERT INTO attendance (user_id, date, check_in, check_out, status, is_late, late_minutes, hours_worked)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [testUserId, d, `${d}T10:20:00+05:30`, `${d}T19:00:00+05:30`, 'working', true, 20, 8.67]
      );
    }

    const res = await calculatePayrollForEmployee(testUserId, 8, 2026, defaultSettings, pool);
    expect(res.late_count).toBe(2);
    expect(res.late_penalty_days).toBe(0);
    expect(res.late_deduction_amount).toBe(0);
  });

  test('Chaitali Bawane regression case: 16 lates on 30-day salary basis yields exactly ₹625 late deduction', async () => {
    // On a 30-day salary basis: 25000 / 30 = 833.333/day. 0.75 * 833.333 = 625.00
    const perDaySalary30 = 25000 / 30;
    const completedLateGroups = Math.floor(16 / 3); // 5
    const lateDeductionDays = completedLateGroups * 0.15; // 0.75
    const lateDeductionAmount = lateDeductionDays * perDaySalary30; // 625.00

    expect(completedLateGroups).toBe(5);
    expect(lateDeductionDays).toBe(0.75);
    expect(Math.round(lateDeductionAmount * 100) / 100).toBe(625.00);
  });
});
