require('dotenv').config({ path: './server/.env' });
const pool = require('./index');

async function migrate() {
  console.log('Running audit migration...');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Create expense_audits table
    await client.query(`
      CREATE TABLE IF NOT EXISTS expense_audits (
        id SERIAL PRIMARY KEY,
        category VARCHAR(50) NOT NULL,
        month INTEGER NOT NULL,
        year INTEGER NOT NULL,
        is_verified BOOLEAN DEFAULT TRUE,
        verified_by INTEGER REFERENCES users(id),
        verified_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(category, month, year)
      );
    `);

    await client.query('COMMIT');
    console.log('Migration completed successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', err);
  } finally {
    client.release();
    process.exit();
  }
}

migrate();
