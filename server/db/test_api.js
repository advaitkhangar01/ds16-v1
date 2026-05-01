// server/db/test_api.js
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const pool = require('./index');

async function test() {
  try {
    const today = '2026-04-27';

    const { rows: projectRows } = await pool.query(
      `SELECT p.id, p.name, p.client_name, p.type, p.status,
         COALESCE(json_agg(ps.* ORDER BY ps.id) FILTER (WHERE ps.id IS NOT NULL), '[]') as stages
       FROM projects p
       LEFT JOIN project_stages ps ON ps.project_id = p.id
       GROUP BY p.id
       ORDER BY p.id DESC 
       LIMIT 100`
    );
    console.log(`API Project Rows: ${projectRows.length}`);
    
    const { rows: countRows } = await pool.query('SELECT COUNT(*) FROM projects');
    console.log(`API Total Count: ${countRows[0].count}`);

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

test();
