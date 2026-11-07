const pool = require('../server/db');

async function checkSchemas() {
  try {
    const res = await pool.query(`
      SELECT table_schema, table_name 
      FROM information_schema.tables 
      WHERE table_name IN ('attendance', 'payroll', 'users')
    `);
    console.table(res.rows);
  } catch (e) {
    console.error(e);
  } finally {
    pool.end();
  }
}

checkSchemas();
