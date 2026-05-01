require('dotenv').config({ override: true });
const pool = require('./index');

async function migrate() {
  try {
    console.log('🚀 Starting financial transactions migration...');
    
    // Transactions table for unified tracking
    await pool.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id SERIAL PRIMARY KEY,
        type VARCHAR(10) NOT NULL CHECK (type IN ('income', 'expense')),
        category VARCHAR(50) NOT NULL, -- e.g., 'project_receipt', 'vendor_payment', 'salary', 'office_expense'
        amount DECIMAL(12, 2) NOT NULL,
        date DATE DEFAULT CURRENT_DATE,
        description TEXT,
        project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
        vendor_id INTEGER REFERENCES vendors(id) ON DELETE SET NULL,
        employee_id INTEGER REFERENCES users(id) ON DELETE SET NULL, -- for salary
        reference_id VARCHAR(100), -- link to invoice_no, payment_stage_id, etc.
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
    
    console.log('✅ Transactions table created');

    // Create indexes for faster lookups
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_transactions_project ON transactions(project_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date)`);

    console.log('✅ Financial system migration complete');
  } catch (err) {
    console.error('❌ Migration failed:', err);
  } finally {
    await pool.end();
  }
}

migrate();
