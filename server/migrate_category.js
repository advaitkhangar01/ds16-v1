require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function run() {
  try {
    console.log('Adding category column to documents table...');
    await pool.query("ALTER TABLE documents ADD COLUMN IF NOT EXISTS category VARCHAR(50) NOT NULL DEFAULT 'document'");
    console.log('Success!');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  }
}

run();
