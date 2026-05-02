const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: './.env' });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/ds16'
});

async function run() {
  const passwordHash = await bcrypt.hash('test1234', 10);
  const { rows } = await pool.query(
    'INSERT INTO users (name, username, role, password_hash, base_salary) VALUES ($1, $2, $3, $4, $5) RETURNING id',
    ['Test Employee', 'testemp', 'employee', passwordHash, 30000]
  );
  console.log('Created test user:', rows[0]);
  process.exit(0);
}

run();
