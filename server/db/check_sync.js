// server/db/check_sync.js
const axios = require('axios');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const pool = require('./index');

async function check() {
  try {
    console.log('--- Database Check ---');
    const { rows: dbRows } = await pool.query('SELECT COUNT(*) FROM projects');
    console.log(`Projects in DB (ds16): ${dbRows[0].count}`);

    console.log('\n--- API Check (Localhost:3001) ---');
    try {
      const res = await axios.get('http://localhost:3001/health');
      console.log('Backend Health:', res.data);
    } catch (e) {
      console.log('Backend not reachable on 3001 or no health endpoint');
    }

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

check();
