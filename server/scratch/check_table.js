const { Pool } = require('pg');
require('dotenv').config({ path: '../.env' });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

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
