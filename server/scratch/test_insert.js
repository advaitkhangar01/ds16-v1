require('dotenv').config({ override: true });
const pool = require('../db/index');

async function testInsert() {
  try {
    // Try to insert a dummy record
    const res = await pool.query(`
      INSERT INTO project_payment_stages (project_id, document_type, amount, initiated_by)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [1, 'Test Tag', 100, 1]); // Assuming project 1 and user 1 exist
    console.log('Insert success:', res.rows[0]);
  } catch (err) {
    console.error('Insert failed:', err.message);
    console.error('Full error:', err);
  } finally {
    await pool.end();
  }
}

testInsert();
