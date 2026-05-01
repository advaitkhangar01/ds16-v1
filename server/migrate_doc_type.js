require('dotenv').config();
const pool = require('./db');

async function migrate() {
  try {
    console.log('Adding document_type column to documents table...');
    await pool.query('ALTER TABLE documents ADD COLUMN IF NOT EXISTS document_type VARCHAR(100)');
    console.log('Migration successful.');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    process.exit();
  }
}

migrate();
