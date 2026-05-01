// server/db/verify.js
const { Client } = require('pg');
const connectionString = 'postgresql://postgres:data47265@localhost:5432/ds16';

async function verify() {
  const client = new Client({ connectionString });
  try {
    await client.connect();
    const { rows } = await client.query('SELECT COUNT(*) FROM projects');
    console.log(`Verified Project Count: ${rows[0].count}`);
    
    const { rows: p } = await client.query('SELECT id, name, status FROM projects LIMIT 5');
    console.table(p);
    
    await client.end();
  } catch (err) {
    console.error(err);
  }
}

verify();
