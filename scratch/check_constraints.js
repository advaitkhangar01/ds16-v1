const pool = require('../server/db');

async function check() {
  try {
    const res = await pool.query(`
      SELECT conname, pg_get_constraintdef(oid) as def
      FROM pg_constraint
      WHERE conrelid = 'attendance'::regclass
    `);
    console.log('Attendance constraints:');
    console.table(res.rows);
  } catch (e) {
    console.error(e);
  } finally {
    pool.end();
  }
}

check();
