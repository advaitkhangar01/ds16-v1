require('dotenv').config({ override: true });
const pool = require('../db/index');

async function checkDefaults() {
  try {
    const res = await pool.query(`
      SELECT column_name, column_default, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'project_payment_stages'
    `);
    console.log('Defaults in project_payment_stages:');
    console.table(res.rows);
  } catch (err) {
    console.error('Error checking defaults:', err);
  } finally {
    await pool.end();
  }
}

checkDefaults();
