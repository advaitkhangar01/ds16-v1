const pool = require('../server/db');

async function run() {
  try {
    const { rows } = await pool.query('SELECT * FROM attendance_batches ORDER BY id');
    console.log('Attendance Batches:', rows);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

run();
