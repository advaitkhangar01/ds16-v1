const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const pool = require('../db');

async function migrate() {
  try {
    await pool.query('ALTER TABLE invoices ADD COLUMN IF NOT EXISTS due_date DATE');
    console.log('✅ Added due_date column to invoices');
  } catch (err) {
    console.error('❌ Migration failed:', err);
  } finally {
    process.exit();
  }
}

migrate();
