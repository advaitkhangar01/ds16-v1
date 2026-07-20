const pool = require('../server/db');

async function audit() {
  try {
    const users = await pool.query('SELECT id, name, username, role FROM users ORDER BY id');
    console.log('=== USERS ===');
    console.table(users.rows);

    const statuses = await pool.query('SELECT status, COUNT(*) FROM attendance GROUP BY status');
    console.log('\n=== ATTENDANCE STATUS COUNTS ===');
    console.table(statuses.rows);

  } catch (err) {
    console.error('Audit Error:', err);
  } finally {
    pool.end();
  }
}

audit();
