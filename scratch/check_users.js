const pool = require('../server/db');

async function run() {
  try {
    const users = await pool.query(`
      SELECT u.id, u.name, u.role, u.department, u.is_active, u.base_salary, u.hourly_rate, u.batch_id,
             b.name as batch_name, b.office_start_time, b.late_threshold_time, b.half_day_cutoff_time, b.min_working_hours
      FROM users u
      LEFT JOIN attendance_batches b ON u.batch_id = b.id
      ORDER BY u.id
    `);
    console.log('=== USERS & BATCH MAPPING ===');
    console.table(users.rows);

    const batches = await pool.query('SELECT * FROM attendance_batches ORDER BY id');
    console.log('=== ATTENDANCE BATCHES ===');
    console.table(batches.rows);

    const attCount = await pool.query('SELECT count(*) FROM attendance');
    console.log('Attendance record count:', attCount.rows[0].count);

    const payCount = await pool.query('SELECT count(*) FROM payroll');
    console.log('Payroll record count:', payCount.rows[0].count);

    const logsCount = await pool.query('SELECT count(*) FROM monthly_closing_log');
    console.log('Monthly closing log count:', logsCount.rows[0].count);

    const attemptsCount = await pool.query('SELECT count(*) FROM attendance_attempts');
    console.log('Attendance attempts count:', attemptsCount.rows[0].count);

    const appSettings = await pool.query('SELECT key, value FROM app_settings ORDER BY key');
    console.log('=== APP SETTINGS ===');
    console.table(appSettings.rows);
  } catch (err) {
    console.error(err);
  } finally {
    pool.end();
  }
}

run();
