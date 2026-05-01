// server/db/final_check.js
process.env.NODE_ENV = 'development';
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const pool = require('./index');

async function check() {
  try {
    const { rows: p } = await pool.query('SELECT COUNT(*) FROM projects');
    const { rows: c } = await pool.query('SELECT COUNT(*) FROM clients');
    const { rows: v } = await pool.query('SELECT COUNT(*) FROM vendors');
    
    console.log('--- Database Status ---');
    console.log(`Projects: ${p[0].count}`);
    console.log(`Clients:  ${c[0].count}`);
    console.log(`Vendors:  ${v[0].count}`);
    
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

check();
