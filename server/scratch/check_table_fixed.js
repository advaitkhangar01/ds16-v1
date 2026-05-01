require('dotenv').config({ override: true });
const pool = require('../db/index');

async function checkTable() {
  try {
    const res = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'project_payment_stages'
    `);
    console.log('Columns in project_payment_stages:');
    console.table(res.rows);
  } catch (err) {
    console.error('Error checking table:', err);
  } finally {
    await pool.end();
  }
}

checkTable();
