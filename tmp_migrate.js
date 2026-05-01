require('dotenv').config({ path: './server/.env' });
const pool = require('./server/db');

async function run() {
  try {
    console.log('Adding category column to documents table...');
    await pool.query("ALTER TABLE documents ADD COLUMN IF NOT EXISTS category VARCHAR(50) NOT NULL DEFAULT 'document'");
    console.log('Success!');
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

run();
