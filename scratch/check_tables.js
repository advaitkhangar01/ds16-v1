const pool = require('../server/db');

async function run() {
  try {
    const { rows } = await pool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name"
    );
    for (const r of rows) {
      const c = await pool.query(`SELECT count(*) FROM "${r.table_name}"`);
      if (parseInt(c.rows[0].count, 10) > 0) {
        console.log(`${r.table_name}: ${c.rows[0].count}`);
      }
    }
  } catch (err) {
    console.error(err);
  } finally {
    pool.end();
  }
}

run();
