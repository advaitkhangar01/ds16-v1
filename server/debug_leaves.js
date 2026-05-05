require('dotenv').config({ path: require('path').join(__dirname, '.env'), override: true });
const pool = require('./db');
async function debug() {
  try {
    const res = await pool.query(`
      SELECT l.*, u.name as user_name, u.department, r.name as reviewer_name
      FROM leave_requests l
      JOIN users u ON l.user_id = u.id
      LEFT JOIN users r ON l.reviewed_by = r.id
      LIMIT 1
    `);
    console.log('Query successful:', res.rows);
    const rolesRes = await pool.query("SELECT DISTINCT role FROM users");
    console.log('Roles in users table:', rolesRes.rows.map(r => r.role));
  } catch (err) {
    console.error('Query failed:', err.message);
    const userRes = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'users'");
    console.log('Columns in users:', userRes.rows.map(r => r.column_name));
    const leaveRes = await pool.query("SELECT * FROM information_schema.columns WHERE table_name = 'leave_requests'");
    console.log('Columns in leave_requests:', leaveRes.rows.map(r => r.column_name));
  } finally {
    process.exit();
  }
}
debug();
