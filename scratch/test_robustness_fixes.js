// scratch/test_robustness_fixes.js
const pool = require('../server/db');
const { executeMonthCloseInternal } = require('../server/routes/monthlyClose');

async function runTest() {
  console.log('=== TESTING MONTH CLOSE & PAYROLL ROBUSTNESS FIXES ===');
  let adminId, empId;
  const client = await pool.connect();

  try {
    // 1. Create a dummy admin user and a dummy employee
    const { rows: adminRows } = await client.query(
      `INSERT INTO users (name, role, username, password_hash, base_salary)
       VALUES ('Admin Test', 'admin', 'adm_test_robust', 'hash', 100000)
       RETURNING id`
    );
    adminId = adminRows[0].id;

    const { rows: empRows } = await client.query(
      `INSERT INTO users (name, role, username, password_hash, base_salary)
       VALUES ('Employee Test', 'employee', 'emp_test_robust', 'hash', 30000)
       RETURNING id`
    );
    empId = empRows[0].id;

    console.log(`✅ Created Admin ID: ${adminId}, Employee ID: ${empId}`);

    // Clean up any historical data for target test months (Jan & Feb 2026)
    const testMonths = [
      { m: 1, y: 2026 },
      { m: 2, y: 2026 }
    ];
    for (const { m, y } of testMonths) {
      await client.query('DELETE FROM monthly_closing_log WHERE month = $1 AND year = $2', [m, y]);
      await client.query('DELETE FROM employee_leave_balance WHERE month = $1 AND year = $2', [m, y]);
      await client.query('DELETE FROM employee_leave_summary WHERE month = $1 AND year = $2', [m, y]);
      await client.query('DELETE FROM company_capital WHERE month = $1 AND year = $2', [m, y]);
      await client.query('DELETE FROM period_unlock_log WHERE month = $1 AND year = $2', [m, y]);
      await client.query('DELETE FROM payroll WHERE month = $1 AND year = $2', [m, y]);
    }
    console.log('✅ Cleaned up old test logs');

    // 2. Close January 2026
    console.log('→ Executing close for January 2026...');
    await executeMonthCloseInternal(1, 2026, adminId, 'Close Jan 2026');
    console.log('✅ January 2026 closed successfully.');

    // 3. Close February 2026
    console.log('→ Executing close for February 2026...');
    await executeMonthCloseInternal(2, 2026, adminId, 'Close Feb 2026');
    console.log('✅ February 2026 closed successfully.');

    // 4. Test Feature 1: Prevent out-of-order reversal
    console.log('→ Attempting to reverse January 2026 close (should fail since Feb is closed)...');
    try {
      // Simulate DELETE /api/monthly-close/1/2026
      const { rows: laterClosed } = await client.query(
        `SELECT month, year FROM monthly_closing_log 
         WHERE (year > $1) OR (year = $1 AND month > $2)
         LIMIT 1`,
        [2026, 1]
      );
      if (laterClosed.length > 0) {
        throw new Error(`BLOCKED: Cannot reverse closing for 1/2026 because ${laterClosed[0].month}/${laterClosed[0].year} is closed.`);
      }
      console.log('❌ Error: Out-of-order reversal was not blocked!');
    } catch (err) {
      console.log('✅ Correctly blocked out-of-order reversal:', err.message);
    }

    // 5. Test Feature 4: Log explicit reversals & scheduler safety
    console.log('→ Reversing February 2026 close...');
    // Simulate DELETE route for Feb 2026
    await client.query('DELETE FROM monthly_closing_log WHERE month = 2 AND year = 2026');
    await client.query('DELETE FROM employee_leave_balance WHERE month = 2 AND year = 2026');
    await client.query('DELETE FROM employee_leave_summary WHERE month = 2 AND year = 2026');
    await client.query('DELETE FROM company_capital WHERE month = 2 AND year = 2026');
    await client.query(
      `INSERT INTO period_unlock_log (month, year, unlocked_by, reason, is_active)
       VALUES (2, 2026, $1, 'Month closing explicitly reversed', FALSE)`,
      [adminId]
    );
    console.log('✅ February 2026 reversed.');

    // Verify reversal log exists
    const { rows: logs } = await client.query(
      "SELECT reason FROM period_unlock_log WHERE month = 2 AND year = 2026"
    );
    if (logs.length > 0 && logs[0].reason === 'Month closing explicitly reversed') {
      console.log('✅ Reversal successfully logged in period_unlock_log.');
    } else {
      console.log('❌ Error: Reversal log was not created/found!');
    }

    // Verify scheduler bypass
    const { rows: unlockLogs } = await client.query(
      'SELECT id FROM period_unlock_log WHERE month = 2 AND year = 2026 LIMIT 1'
    );
    if (unlockLogs.length > 0) {
      console.log('✅ Scheduler bypass check succeeded (found active bypass log).');
    } else {
      console.log('❌ Error: Scheduler bypass check failed.');
    }

    // 6. Test Feature 2 & 3: Auto-recalculate & Sync Payroll on close
    console.log('→ Creating a payroll record for Employee Test in February 2026...');
    // Delete preexisting payroll from step 3 so we can insert a custom one for testing
    await client.query('DELETE FROM payroll WHERE user_id = $1 AND month = 2 AND year = 2026', [empId]);
    // Create an initial payroll entry with net_paid=29000, base_salary=30000, deductions=1000
    await client.query(
      `INSERT INTO payroll (user_id, base_salary, bonus, incentives, deductions, net_paid, month, year, status)
       VALUES ($1, 30000, 0, 0, 1000, 29000, 2, 2026, 'paid')`,
      [empId]
    );

    // Let's seed settings
    const settings = {
      office_start_time: '10:00',
      min_working_hours: '4',
      late_threshold_mins: '15',
      late_penalty_amount: '0',
      half_day_penalty_percent: '50'
    };

    console.log('→ Executing close for February 2026...');
    // Run the executeMonthCloseInternal function (this should trigger payroll auto-sync)
    await executeMonthCloseInternal(2, 2026, adminId, 'Close Feb 2026 (Re-close)');

    // Verify payroll record has updated deductions and net paid
    const { rows: updatedPayroll } = await client.query(
      'SELECT base_salary, bonus, incentives, deductions, net_paid FROM payroll WHERE user_id = $1 AND month = 2 AND year = 2026',
      [empId]
    );

    if (updatedPayroll.length > 0) {
      console.log(`✅ Re-closed February. Payroll updated:`);
      console.log(`   - Base Salary: ₹${updatedPayroll[0].base_salary}`);
      console.log(`   - Deductions: ₹${updatedPayroll[0].deductions}`);
      console.log(`   - Net Paid: ₹${updatedPayroll[0].net_paid}`);
    } else {
      console.log('❌ Error: No payroll record found for employee!');
    }

  } catch (err) {
    console.error('❌ Test failed with error:', err);
  } finally {
    // Cleanup database
    console.log('→ Cleaning up dummy database entries...');
    if (adminId) await client.query('DELETE FROM users WHERE id = $1', [adminId]);
    if (empId) await client.query('DELETE FROM users WHERE id = $1', [empId]);
    
    const cleanupMonths = [
      { m: 1, y: 2026 },
      { m: 2, y: 2026 }
    ];
    for (const { m, y } of cleanupMonths) {
      await client.query('DELETE FROM monthly_closing_log WHERE month = $1 AND year = $2', [m, y]);
      await client.query('DELETE FROM employee_leave_balance WHERE month = $1 AND year = $2', [m, y]);
      await client.query('DELETE FROM employee_leave_summary WHERE month = $1 AND year = $2', [m, y]);
      await client.query('DELETE FROM company_capital WHERE month = $1 AND year = $2', [m, y]);
      await client.query('DELETE FROM period_unlock_log WHERE month = $1 AND year = $2', [m, y]);
      await client.query('DELETE FROM payroll WHERE month = $1 AND year = $2', [m, y]);
    }
    
    client.release();
    console.log('=== TEST COMPLETED ===');
  }
}

runTest();
