const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), override: true });
const pool = require('./index');

async function migrate() {
  try {
    console.log('🚀 Starting invoices table migration...');
    
    // Invoices table to store full invoice state
    await pool.query(`
      CREATE TABLE IF NOT EXISTS invoices (
        id SERIAL PRIMARY KEY,
        invoice_no VARCHAR(100) UNIQUE NOT NULL,
        project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
        client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
        client_name VARCHAR(255) NOT NULL,
        amount DECIMAL(15, 2) NOT NULL,
        date DATE DEFAULT CURRENT_DATE,
        items JSONB NOT NULL,
        tax_details JSONB,
        status VARCHAR(50) DEFAULT 'generated' CHECK (status IN ('draft', 'generated', 'sent', 'paid', 'cancelled')),
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
    
    console.log('✅ Invoices table created');

    // Create indexes for faster lookups
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_invoices_project ON invoices(project_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_invoices_date ON invoices(date)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_invoices_no ON invoices(invoice_no)`);

    console.log('✅ Invoices migration complete');
  } catch (err) {
    console.error('❌ Migration failed:', err);
  } finally {
    await pool.end();
  }
}

migrate();
