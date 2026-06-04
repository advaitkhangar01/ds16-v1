const pool = require('../server/db');

async function check() {
  try {
    const { rows } = await pool.query('SELECT id, name, role, username FROM users ORDER BY id');
    console.log('Database users:', rows);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

check();
