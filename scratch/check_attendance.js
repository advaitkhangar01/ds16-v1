const pool = require('../server/db');

async function checkAttendance() {
  try {
    const { rows } = await pool.query('SELECT * FROM attendance ORDER BY date DESC, id DESC LIMIT 5');
    console.log(JSON.stringify(rows, null, 2));
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

checkAttendance();
