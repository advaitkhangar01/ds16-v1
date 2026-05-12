const pool = require('../server/db');

async function checkAttendanceCount() {
  try {
    const { rows } = await pool.query('SELECT COUNT(*) FROM attendance');
    console.log('Count:', rows[0].count);
    
    const { rows: users } = await pool.query('SELECT id, name, username, role FROM users');
    console.log('Users:', users);
    
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

checkAttendanceCount();
