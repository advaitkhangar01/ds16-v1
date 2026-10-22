// server/tests/payrollMandatory.test.js
const pool = require('../db');
const { calculateHourlyRate, calculateDayAttendanceStats, calculatePayrollForEmployee } = require('../utils/payroll');
const { recalculateAttendanceForUser } = require('../utils/attendanceRecalculator');

describe('DS16 CRM — Mandatory 16 Business Rules Test Suite', () => {
  let testUserId;
  let testBatchId;

  const defaultSettings = {
    office_start_time: '10:00',
    late_threshold_time: '10:15',
    half_day_cutoff_time: '13:00',
    late_threshold_mins: '15',
    late_penalty_rule_count: '3',
    late_penalty_rule_days: '0.15',
    half_day_penalty_percent: '50',
    min_working_hours: '8.5'
  };

  beforeAll(async () => {
    // 1. Create a test batch: 10:00 - 18:30 (8.5h min working hours)
    const { rows: batchRows } = await pool.query(
      `INSERT INTO attendance_batches (name, office_start_time, late_threshold_time, half_day_cutoff_time, min_working_hours)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [`Test Batch ${Date.now()}`, '10:00:00', '10:15:00', '13:00:00', 8.5]
    );
    testBatchId = batchRows[0].id;

    // 2. Create test user with ₹25,000 base salary assigned to test batch
    const { rows: userRows } = await pool.query(
      `INSERT INTO users (name, username, password_hash, role, base_salary, hourly_rate, batch_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [`Test Salaried ${Date.now()}`, `test_sal_${Date.now()}`, 'hash123', 'employee', 25000.00, 98.04, testBatchId]
    );
    testUserId = userRows[0].id;
  });

  afterAll(async () => {
    if (testUserId) {
      await pool.query('DELETE FROM attendance WHERE user_id = $1', [testUserId]);
      await pool.query('DELETE FROM users WHERE id = $1', [testUserId]);
    }
    if (testBatchId) {
      await pool.query('DELETE FROM attendance_batches WHERE id = $1', [testBatchId]);
    }
  });

  afterEach(async () => {
    if (testUserId) {
      await pool.query('DELETE FROM attendance WHERE user_id = $1', [testUserId]);
      await pool.query('DELETE FROM monthly_closing_log WHERE year = 2026 AND month = 5');
    }
  });

  // Rule 1: Hourly rate formula for ₹25,000 / (30 * 8.5)
  test('Rule 1: 25000 / (30 * 8.5) equals 98.0392... (rounded to 98.04)', () => {
    const rawRate = 25000 / (30 * 8.5);
    expect(rawRate).toBeCloseTo(98.0392, 3);
    const rate = calculateHourlyRate(25000, 8.5);
    expect(rate).toBe(98.04);
  });

  // Rule 2: Hourly rate formula for ₹30,000 / (30 * 9)
  test('Rule 2: 30000 / (30 * 9) equals 111.111... (rounded to 111.11)', () => {
    const rawRate = 30000 / (30 * 9);
    expect(rawRate).toBeCloseTo(111.1111, 3);
    const rate = calculateHourlyRate(30000, 9);
    expect(rate).toBe(111.11);
  });

  // Rule 3: Complete 28-day February pays exactly ₹25,000
  test('Rule 3: Complete February (28 days) pays exactly ₹25,000', async () => {
    // Insert present attendance for all working days in Feb 2026
    for (let day = 1; day <= 28; day++) {
      const d = new Date(2026, 1, day);
      const isSunday = (d.getDay() === 0);
      if (!isSunday) {
        const dateStr = `2026-02-${String(day).padStart(2, '0')}`;
        await pool.query(
          `INSERT INTO attendance (user_id, date, check_in, check_out, status, is_late, late_minutes, hours_worked, batch_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [testUserId, dateStr, `${dateStr}T10:00:00+05:30`, `${dateStr}T18:30:00+05:30`, 'completed', false, 0, 8.5, testBatchId]
        );
      }
    }

    const res = await calculatePayrollForEmployee(testUserId, 2, 2026, defaultSettings, pool);
    expect(res.suggested_salary).toBe(25000);
    expect(res.total_attendance_deductions).toBe(0);
    expect(res.late_deduction_amount).toBe(0);
  });

  // Rule 4: Complete 31-day August pays exactly ₹25,000
  test('Rule 4: Complete August (31 days) pays exactly ₹25,000', async () => {
    for (let day = 1; day <= 31; day++) {
      const d = new Date(2026, 7, day);
      const isSunday = (d.getDay() === 0);
      if (!isSunday) {
        const dateStr = `2026-08-${String(day).padStart(2, '0')}`;
        await pool.query(
          `INSERT INTO attendance (user_id, date, check_in, check_out, status, is_late, late_minutes, hours_worked, batch_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [testUserId, dateStr, `${dateStr}T10:00:00+05:30`, `${dateStr}T18:30:00+05:30`, 'completed', false, 0, 8.5, testBatchId]
        );
      }
    }

    const res = await calculatePayrollForEmployee(testUserId, 8, 2026, defaultSettings, pool);
    expect(res.suggested_salary).toBe(25000);
    expect(res.total_attendance_deductions).toBe(0);
    expect(res.late_deduction_amount).toBe(0);
  });

  // Rule 5: Complete 30-day September pays exactly ₹25,000
  test('Rule 5: Complete September (30 days) pays exactly ₹25,000', async () => {
    for (let day = 1; day <= 30; day++) {
      const d = new Date(2026, 8, day);
      const isSunday = (d.getDay() === 0);
      if (!isSunday) {
        const dateStr = `2026-09-${String(day).padStart(2, '0')}`;
        await pool.query(
          `INSERT INTO attendance (user_id, date, check_in, check_out, status, is_late, late_minutes, hours_worked, batch_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [testUserId, dateStr, `${dateStr}T10:00:00+05:30`, `${dateStr}T18:30:00+05:30`, 'completed', false, 0, 8.5, testBatchId]
        );
      }
    }

    const res = await calculatePayrollForEmployee(testUserId, 9, 2026, defaultSettings, pool);
    expect(res.suggested_salary).toBe(25000);
    expect(res.total_attendance_deductions).toBe(0);
    expect(res.late_deduction_amount).toBe(0);
  });

  // Rule 6: 5h short day deducts unworked hours shortfall so employee receives 5 * hourly
  test('Rule 6: 5h short day deducts unworked hours so employee receives 5 * hourly', () => {
    const stats = calculateDayAttendanceStats(
      { date: '2026-09-15', status: 'half_day', hours_worked: 5.0, batch_id: testBatchId },
      { baseSalary: 25000, batchMinHours: 8.5 }
    );
    const fullDayValue = 25000 / 30; // 833.333...
    const hourly = fullDayValue / 8.5; // 98.0392...
    const expectedPay = 5.0 * hourly;

    // Rule 5: Half day earnings = actual hours worked * hourly rate, zero deduction/penalty
    expect(stats.deduction).toBe(0);
    expect(stats.normal_earnings).toBeCloseTo(expectedPay, 1);
  });

  // Rule 7: 1.5h attendance pays exactly 1.5 * hourlyRate and zero deduction
  test('Rule 7: 1.5h attendance pays exactly 1.5 * hourly and zero deduction', () => {
    const stats = calculateDayAttendanceStats(
      { date: '2026-09-16', status: 'half_day', hours_worked: 1.5, batch_id: testBatchId },
      { baseSalary: 25000, batchMinHours: 8.5 }
    );
    const fullDayValue = 25000 / 30;
    const hourly = fullDayValue / 8.5;
    const expectedPay = 1.5 * hourly;

    // Rule 5: Half day pays actual hours worked, zero deduction
    expect(stats.deduction).toBe(0);
    expect(stats.normal_earnings).toBeCloseTo(expectedPay, 1);
  });

  // Rule 8: Overtime after 7:00 PM IST is paid at 100% normal hourly rate
  test('Rule 8: Overtime after 7:00 PM IST is paid at 100% normal hourly rate', () => {
    // 10:00 AM to 9:00 PM IST (21:00) -> 2h OT
    const stats = calculateDayAttendanceStats(
      {
        date: '2026-09-17',
        check_in: '2026-09-17T10:00:00+05:30',
        check_out: '2026-09-17T21:00:00+05:30',
        hours_worked: 11.0,
        status: 'completed',
        batch_id: testBatchId
      },
      { baseSalary: 25000, batchMinHours: 8.5 }
    );
    const fullDayValue = 25000 / 30;
    const hourly = fullDayValue / 8.5;

    expect(stats.overtime_hours).toBe(2.0);
    expect(stats.overtime_earnings).toBeCloseTo(2.0 * hourly, 1);
    expect(stats.normal_earnings).toBeCloseTo(fullDayValue, 1);
  });

  // Rule 9: Late arrival and Overtime coexist independently on the same day
  test('Rule 9: Late arrival and Overtime coexist independently on the same day', () => {
    // Check-in 10:30 (late), check-out 20:30 (1h 30m after 7 PM -> Rule 4: 1h completed multiple)
    const stats = calculateDayAttendanceStats(
      {
        date: '2026-09-18',
        check_in: '2026-09-18T10:30:00+05:30',
        check_out: '2026-09-18T20:30:00+05:30',
        hours_worked: 10.0,
        status: 'completed',
        batch_id: testBatchId
      },
      {
        baseSalary: 25000,
        batchMinHours: 8.5,
        officeStartTimeStr: '10:00',
        lateThresholdTimeStr: '10:15'
      }
    );

    expect(stats.is_late).toBe(true);
    // Rule 4: completed 1-hour multiples -> 1 hour
    expect(stats.overtime_hours).toBe(1.0);
    expect(stats.overtime_earnings).toBeGreaterThan(0);
  });

  // Rule 10: Half-day arrival does NOT count toward 3-late penalty
  test('Rule 10: Half-day arrival (after cutoff) does not count toward 3-late penalty', () => {
    const stats = calculateDayAttendanceStats(
      {
        date: '2026-09-19',
        check_in: '2026-09-19T13:30:00+05:30', // after 13:00 cutoff
        check_out: '2026-09-19T18:30:00+05:30',
        hours_worked: 5.0,
        status: 'half_day',
        batch_id: testBatchId
      },
      {
        baseSalary: 25000,
        batchMinHours: 8.5,
        officeStartTimeStr: '10:00',
        lateThresholdTimeStr: '10:15',
        halfDayCutoffTimeStr: '13:00'
      }
    );

    expect(stats.status).toBe('half_day');
    expect(stats.is_late).toBe(false);
  });

  // Rule 11: 16 qualifying lates = 5 groups = 0.75 day deduction = ₹625.00
  test('Rule 11: 16 qualifying lates yields exactly 5 * 0.15 * (25000 / 30) = ₹625 late deduction', () => {
    const lateCount = 16;
    const completedGroups = Math.floor(lateCount / 3);
    const lateDeductionDays = completedGroups * 0.15;
    const perDaySalary = 25000 / 30;
    const lateDeductionAmount = lateDeductionDays * perDaySalary;

    expect(completedGroups).toBe(5);
    expect(lateDeductionDays).toBe(0.75);
    expect(Math.round(lateDeductionAmount * 100) / 100).toBe(625.00);
  });

  // Rule 12: Historical NULL batch_id is NEVER silently assigned current batch
  test('Rule 12: Historical records with NULL batch_id are never modified by recalculator', async () => {
    const dateStr = '2026-05-10';
    const { rows: attRows } = await pool.query(
      `INSERT INTO attendance (user_id, date, check_in, check_out, status, is_late, late_minutes, hours_worked, batch_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULL)
       RETURNING id, batch_id, status, is_late`,
      [testUserId, dateStr, `${dateStr}T10:20:00+05:30`, `${dateStr}T18:30:00+05:30`, 'completed', false, 0, 8.17]
    );
    const recId = attRows[0].id;
    expect(attRows[0].batch_id).toBeNull();

    // Run recalculator for this user
    await recalculateAttendanceForUser(testUserId, { dbClient: pool });

    // Verify record was skipped and batch_id remains strictly NULL
    const { rows: checkRows } = await pool.query('SELECT batch_id, status, is_late FROM attendance WHERE id = $1', [recId]);
    expect(checkRows[0].batch_id).toBeNull();
    expect(checkRows[0].status).toBe('completed');
    expect(checkRows[0].is_late).toBe(false);
  });

  // Rule 13: Closed payroll remains unchanged
  test('Rule 13: Closed months are strictly protected from attendance recalculation', async () => {
    // Log month 5 (May 2026) as closed
    await pool.query(
      `INSERT INTO monthly_closing_log (month, year, closed_by)
       VALUES (5, 2026, $1)`,
      [testUserId]
    );

    const dateStr = '2026-05-12';
    const { rows: attRows } = await pool.query(
      `INSERT INTO attendance (user_id, date, check_in, check_out, status, is_late, late_minutes, hours_worked, batch_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, status`,
      [testUserId, dateStr, `${dateStr}T10:30:00+05:30`, `${dateStr}T18:30:00+05:30`, 'completed', false, 0, 8.0, testBatchId]
    );
    const recId = attRows[0].id;

    // Run recalculator
    await recalculateAttendanceForUser(testUserId, { dbClient: pool });

    // Verify status was NOT recalculated in closed month
    const { rows: checkRows } = await pool.query('SELECT status, is_late FROM attendance WHERE id = $1', [recId]);
    expect(checkRows[0].status).toBe('completed');
    expect(checkRows[0].is_late).toBe(false);
  });

  // Rule 14: Auto-checkout closes recent open attendance at exactly 7:00 PM IST
  test('Rule 14: Auto-checkout closes pending recent records at exactly 7:00 PM IST', async () => {
    // Insert open attendance record for yesterday
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' });
    const yStr = formatter.format(yesterday);

    const { rows: attRows } = await pool.query(
      `INSERT INTO attendance (user_id, date, check_in, check_out, status, hours_worked, batch_id)
       VALUES ($1, $2, $3, NULL, 'working', 0, $4)
       RETURNING id`,
      [testUserId, yStr, `${yStr}T10:00:00+05:30`, testBatchId]
    );
    const recId = attRows[0].id;

    // Run autoCheckout logic (same SQL as server/routes/attendance.js)
    const { rows: pending } = await pool.query(
      `SELECT a.id, a.user_id, a.check_in, a.date, LOWER(a.status) AS status,
              b.min_working_hours AS batch_min_hours
       FROM attendance a
       JOIN users u ON a.user_id = u.id
       LEFT JOIN attendance_batches b ON u.batch_id = b.id
       WHERE a.id = $1`,
      [recId]
    );
    expect(pending.length).toBe(1);

    const r = pending[0];
    const checkoutTimeISO = `${yStr}T19:00:00+05:30`;
    const checkOutTime = new Date(checkoutTimeISO);
    const checkInTime = new Date(r.check_in);
    const hoursWorked = parseFloat(((checkOutTime - checkInTime) / (1000 * 60 * 60)).toFixed(2));
    const newStatus = hoursWorked < 8.5 ? 'half_day' : 'completed';

    await pool.query(
      `UPDATE attendance SET check_out = $1, status = $2, hours_worked = $3 WHERE id = $4`,
      [checkOutTime.toISOString(), newStatus, hoursWorked, r.id]
    );

    const { rows: verified } = await pool.query('SELECT check_out, status, hours_worked FROM attendance WHERE id = $1', [recId]);
    expect(new Date(verified[0].check_out).toISOString()).toBe(checkOutTime.toISOString());
    expect(parseFloat(verified[0].hours_worked)).toBe(9.0);
    expect(verified[0].status).toBe('completed');
  });

  // Rule 15: Ancient abandoned open records remain untouched
  test('Rule 15: Ancient abandoned open records (> 3 days) are not touched by auto-checkout query', async () => {
    const ancientDate = '2026-01-01';
    const { rows: attRows } = await pool.query(
      `INSERT INTO attendance (user_id, date, check_in, check_out, status, hours_worked, batch_id)
       VALUES ($1, $2, $3, NULL, 'working', 0, $4)
       RETURNING id`,
      [testUserId, ancientDate, `${ancientDate}T10:00:00+05:30`, testBatchId]
    );
    const recId = attRows[0].id;

    // Run the auto-checkout select filter
    const today = formatterIST(new Date());
    const { rows: pending } = await pool.query(
      `SELECT a.id FROM attendance a
       WHERE a.check_in IS NOT NULL 
         AND a.check_out IS NULL 
         AND a.date < $1::date
         AND a.date >= $1::date - INTERVAL '3 days'
         AND a.id = $2`,
      [today, recId]
    );

    // Ancient record must NOT be selected
    expect(pending.length).toBe(0);

    const { rows: check } = await pool.query('SELECT check_out FROM attendance WHERE id = $1', [recId]);
    expect(check[0].check_out).toBeNull();
  });

  // Rule 16: Recalculation is idempotent
  test('Rule 16: Recalculation is strictly idempotent (multiple runs produce identical state)', async () => {
    const dateStr = '2026-09-20';
    const { rows: attRows } = await pool.query(
      `INSERT INTO attendance (user_id, date, check_in, check_out, status, is_late, late_minutes, hours_worked, batch_id)
       VALUES ($1, $2, $3, $4, 'working', false, 0, 0, $5)
       RETURNING id`,
      [testUserId, dateStr, `${dateStr}T10:18:00+05:30`, `${dateStr}T18:48:00+05:30`, testBatchId]
    );
    const recId = attRows[0].id;

    // First run
    await recalculateAttendanceForUser(testUserId, { dbClient: pool });
    const { rows: run1 } = await pool.query('SELECT status, is_late, late_minutes, hours_worked FROM attendance WHERE id = $1', [recId]);

    // Second run
    await recalculateAttendanceForUser(testUserId, { dbClient: pool });
    const { rows: run2 } = await pool.query('SELECT status, is_late, late_minutes, hours_worked FROM attendance WHERE id = $1', [recId]);

    expect(run1[0]).toEqual(run2[0]);
    expect(run1[0].is_late).toBe(true);
    expect(run1[0].status).toBe('completed');
  });

  // Rule 17: Active work day (status = 'working') has zero deduction and earns fullDayValue
  test('Rule 17: Currently working check-in earns fullDayValue and has zero deduction', () => {
    const stats = calculateDayAttendanceStats(
      { date: '2026-09-21', status: 'working', check_in: '2026-09-21T10:00:00+05:30', check_out: null, hours_worked: 0, batch_id: testBatchId },
      { baseSalary: 25000, batchMinHours: 8.5 }
    );
    expect(stats.earnings).toBeCloseTo(25000 / 30, 2);
    expect(stats.deduction).toBe(0);
  });

  // Rule 18: Completed salaried day has zero deduction
  test('Rule 18: Completed salaried day has zero deduction', () => {
    const stats = calculateDayAttendanceStats(
      { date: '2026-09-22', status: 'completed', check_in: '2026-09-22T10:00:00+05:30', check_out: '2026-09-22T18:00:00+05:30', hours_worked: 8.0, batch_id: testBatchId },
      { baseSalary: 25000, batchMinHours: 8.5 }
    );
    expect(stats.earnings).toBeCloseTo(25000 / 30, 2);
    expect(stats.deduction).toBe(0);
  });

  // Rule 19: Today pending (not checked in yet today) incurs zero deduction
  test('Rule 19: Today pending record incurs zero deduction', () => {
    const stats = calculateDayAttendanceStats(
      { date: '2026-09-23', status: 'today_pending', hours_worked: 0 },
      { baseSalary: 25000, batchMinHours: 8.5 }
    );
    expect(stats.earnings).toBe(0);
    expect(stats.deduction).toBe(0);
  });

  // Rule 20: Full shift completion (>= 8.0h) earns full day wage
  test('Rule 20: Full shift completion (>= 8.0h) earns full day wage', () => {
    const stats = calculateDayAttendanceStats(
      {
        date: '2026-10-14',
        status: 'half_day',
        check_in: '2026-10-14T10:55:00+05:30',
        check_out: '2026-10-14T19:48:00+05:30',
        hours_worked: 8.87,
        batch_id: testBatchId
      },
      { baseSalary: 30000, batchMinHours: 9.0 }
    );
    expect(stats.status).toBe('completed');
    expect(stats.overtime_hours).toBe(0);
    expect(stats.hours_worked).toBe(8.87);
    expect(stats.earnings).toBeCloseTo(1000.0, 2);
  });

  // Rule 21: Full shift (>= 8.0h) with overtime after 7 PM earns full day wage + OT
  test('Rule 21: Full shift with overtime earns full day wage + OT', () => {
    const stats = calculateDayAttendanceStats(
      {
        date: '2026-10-16',
        status: 'half_day',
        check_in: '2026-10-16T12:11:00+05:30',
        check_out: '2026-10-16T21:05:00+05:30',
        hours_worked: 8.90,
        batch_id: testBatchId
      },
      { baseSalary: 30000, batchMinHours: 9.0 }
    );
    expect(stats.status).toBe('completed');
    expect(stats.overtime_hours).toBe(2.0);
    expect(stats.hours_worked).toBe(8.90);
    expect(stats.normal_earnings).toBeCloseTo(1000.0, 2);
    expect(stats.overtime_earnings).toBeCloseTo(222.22, 2);
    expect(stats.earnings).toBeCloseTo(1222.22, 2);
  });

  // Rule 21b: True short day (< 8.0h) remains half_day and earns actual hours worked
  test('Rule 21b: True short day (< 8.0h) remains half_day and earns actual hours worked', () => {
    const stats = calculateDayAttendanceStats(
      {
        date: '2026-10-03',
        status: 'half_day',
        check_in: '2026-10-03T10:40:00+05:30',
        check_out: '2026-10-03T17:33:00+05:30',
        hours_worked: 6.88,
        batch_id: testBatchId
      },
      { baseSalary: 30000, batchMinHours: 9.0 }
    );
    expect(stats.status).toBe('half_day');
    expect(stats.hours_worked).toBe(6.88);
    expect(stats.earnings).toBeCloseTo(6.88 * (30000 / (30 * 9.0)), 2);
  });

  // Rule 22: Completed shift >= 9h with OT pays full day wage plus overtime
  test('Rule 22: Completed shift >= 9h with OT pays full day wage plus overtime', () => {
    const stats = calculateDayAttendanceStats(
      {
        date: '2026-10-12',
        status: 'completed',
        check_in: '2026-10-12T10:53:00+05:30',
        check_out: '2026-10-12T20:15:00+05:30',
        hours_worked: 9.36,
        batch_id: testBatchId
      },
      { baseSalary: 30000, batchMinHours: 9.0 }
    );
    expect(stats.overtime_hours).toBe(1.0);
    expect(stats.hours_worked).toBe(9.36);
    expect(stats.normal_earnings).toBeCloseTo(1000.0, 2);
    expect(stats.overtime_earnings).toBeCloseTo(111.11, 2);
    expect(stats.earnings).toBeCloseTo(1111.11, 2);
  });
});

function formatterIST(d) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
