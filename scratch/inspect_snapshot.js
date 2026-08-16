const pool = require('../server/db');

async function run() {
  try {
    const { rows } = await pool.query('SELECT * FROM monthly_closing_log');
    rows.forEach(r => {
      console.log(`Month: ${r.month}, Year: ${r.year}`);
      console.log(JSON.stringify(r.snapshot, null, 2));
    });
  } catch (err) {
    console.error(err);
  } finally {
    pool.end();
  }
}

run();
