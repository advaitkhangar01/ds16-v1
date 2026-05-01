require('dotenv').config();
const pool = require('./db');

async function apply() {
  try {
    console.log("Applying accounting schema...");
    
    // 1. Add base_salary to users if not exists
    await pool.query(`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='base_salary') THEN
          ALTER TABLE users ADD COLUMN base_salary DECIMAL(15, 2) DEFAULT 0;
        END IF;
      END $$;
    `);

    // 2. Create office_expenses table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS office_expenses (
        id SERIAL PRIMARY KEY,
        category VARCHAR(100) NOT NULL,
        amount DECIMAL(15, 2) NOT NULL,
        date DATE NOT NULL DEFAULT CURRENT_DATE,
        description TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // 3. Create payroll table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS payroll (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        base_salary DECIMAL(15, 2) NOT NULL DEFAULT 0,
        bonus DECIMAL(15, 2) NOT NULL DEFAULT 0,
        deductions DECIMAL(15, 2) NOT NULL DEFAULT 0,
        net_paid DECIMAL(15, 2) NOT NULL,
        month INTEGER NOT NULL,
        year INTEGER NOT NULL,
        payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
        status VARCHAR(20) DEFAULT 'paid' CHECK (status IN ('paid', 'pending')),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(user_id, month, year)
      );
    `);

    console.log("Accounting schema applied successfully.");
  } catch (err) {
    console.error("Error applying accounting schema:", err);
  } finally {
    pool.end();
  }
}

apply();
