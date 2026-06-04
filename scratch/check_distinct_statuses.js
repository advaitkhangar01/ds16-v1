const pool = require('../server/db');

async function check() {
  try {
    const { rows } = await pool.query('SELECT DISTINCT status FROM attendance');
    console.log('Distinct statuses:', rows);
    
    const countRes = await pool.query('SELECT COUNT(*) FROM attendance');
    console.log('Total attendance records:', countRes.rows[0].count);
    
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

check();
