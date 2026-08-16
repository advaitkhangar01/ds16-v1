const pool = require('../server/db');

async function run() {
  try {
    const { fields } = await pool.query('SELECT * FROM payroll LIMIT 0');
    console.log('Payroll columns:');
    console.log(fields.map(f => f.name));
  } catch (err) {
    console.error(err);
  } finally {
    pool.end();
  }
}

run();
