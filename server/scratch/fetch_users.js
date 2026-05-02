const { Pool } = require('pg');
require('dotenv').config({ path: './.env' });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/ds16'
});

async function run() {
  const { rows } = await pool.query('SELECT id, name, username, role FROM users');
  console.log(rows);
  process.exit(0);
}

run();
