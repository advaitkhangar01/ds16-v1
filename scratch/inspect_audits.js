const pool = require('../server/db');

async function run() {
  try {
    const { rows } = await pool.query('SELECT * FROM expense_audits');
    console.log('Expense Audits:');
    console.log(rows);
  } catch (err) {
    console.error(err);
  } finally {
    pool.end();
  }
}

run();
