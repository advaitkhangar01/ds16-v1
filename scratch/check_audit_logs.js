const pool = require('../server/db');

async function checkAudit() {
  try {
    const res = await pool.query('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 20');
    console.table(res.rows);
  } catch (e) {
    console.error(e.message);
  } finally {
    pool.end();
  }
}

checkAudit();
