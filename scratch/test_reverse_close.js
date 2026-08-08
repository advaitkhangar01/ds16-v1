const pool = require('../server/db');
const { executeMonthCloseInternal } = require('../server/routes/monthlyClose');

async function test() {
  console.log('--- Testing Month Close Execution & Reversal ---');
  try {
    // 1. Create a dummy admin user
    const { rows: users } = await pool.query("INSERT INTO users (name, role, username, password_hash) VALUES ('Admin Test', 'admin', 'adm_test', 'hash') RETURNING id");
    const adminId = users[0].id;

    // Clean up past logs for January 2020
    await pool.query('DELETE FROM period_unlock_log WHERE month = 1 AND year = 2020');
    await pool.query('DELETE FROM monthly_closing_log WHERE month = 1 AND year = 2020');
    await pool.query('DELETE FROM employee_leave_balance WHERE month = 1 AND year = 2020');
    await pool.query('DELETE FROM employee_leave_summary WHERE month = 1 AND year = 2020');
    await pool.query('DELETE FROM company_capital WHERE month = 1 AND year = 2020');

    // 2. Execute Month Close
    console.log('1. Executing close for 01/2020...');
    const closed = await executeMonthCloseInternal(1, 2020, adminId, 'Test Close');
    console.log('✅ Month closed successfully. Log ID:', closed.id);

    // 3. Attempt to reverse Month Close (the code inside DELETE /api/monthly-close/:month/:year)
    console.log('2. Reversing close for 01/2020...');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const logRes = await client.query(
        'DELETE FROM monthly_closing_log WHERE month = 1 AND year = 2020 RETURNING id'
      );
      console.log('   - monthly_closing_log deleted. Rows:', logRes.rowCount);

      await client.query('DELETE FROM employee_leave_balance WHERE month = 1 AND year = 2020');
      console.log('   - employee_leave_balance deleted');

      await client.query('DELETE FROM employee_leave_summary WHERE month = 1 AND year = 2020');
      console.log('   - employee_leave_summary deleted');

      await client.query('DELETE FROM company_capital WHERE month = 1 AND year = 2020');
      console.log('   - company_capital deleted');

      await client.query(
        'UPDATE expense_audits SET is_verified = FALSE, verified_at = NOW(), verified_by = $1 WHERE month = 1 AND year = 2020',
        [adminId]
      );
      console.log('   - expense_audits updated');

      await client.query(
        'UPDATE period_unlock_log SET is_active = FALSE, relocked_at = NOW(), relocked_by = $1 WHERE month = 1 AND year = 2020',
        [adminId]
      );
      console.log('   - period_unlock_log updated');

      await client.query('COMMIT');
      console.log('✅ COMMIT successful! Reversal complete.');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    // Clean up admin user
    await pool.query('DELETE FROM users WHERE id = $1', [adminId]);
    console.log('✅ Cleanup finished.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Test failed with error:', err);
    process.exit(1);
  }
}

test();
