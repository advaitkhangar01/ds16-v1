const pool = require('../server/db');

async function run() {
  try {
    const { rows } = await pool.query('SELECT * FROM users ORDER BY id');
    console.log('All Users Detail:', JSON.stringify(rows, null, 2));
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

run();
