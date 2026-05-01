require('dotenv').config();
const pool = require('./db');

async function inspect() {
  try {
    const { rows } = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'projects'
    `);
    console.log('--- Projects Table Columns ---');
    console.table(rows);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

inspect();
