require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), override: true });
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  ssl: (process.env.NODE_ENV === 'production' && !process.env.DATABASE_URL.includes('localhost') && !process.env.DATABASE_URL.includes('127.0.0.1')) 
    ? { rejectUnauthorized: false } 
    : false,
});

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL error on idle client:', err);
});

// Test connection on startup
pool.query('SELECT NOW()', (err) => {
  if (err) {
    console.error('❌ DB connection failed:', err.message);
  } else {
    console.log('✅ Connected to PostgreSQL');
    
    // Auto-Migration: Ensure schema is correct for user deletion and missing columns
    const runMigrations = async () => {
      try {
        // 1. Fix Foreign Keys for users(id) to support deletion
        // Using PostgreSQL compatible query (no referenced_table_name)
        await pool.query(`
          DO $$ 
          DECLARE 
              r RECORD;
          BEGIN
              FOR r IN (
                  SELECT 
                      tc.table_name, 
                      tc.constraint_name, 
                      kcu.column_name
                  FROM 
                      information_schema.table_constraints AS tc 
                      JOIN information_schema.key_column_usage AS kcu
                        ON tc.constraint_name = kcu.constraint_name
                        AND tc.table_schema = kcu.table_schema
                      JOIN information_schema.constraint_column_usage AS ccu
                        ON ccu.constraint_name = tc.constraint_name
                        AND ccu.table_schema = tc.table_schema
                  WHERE tc.constraint_type = 'FOREIGN KEY' 
                    AND ccu.table_name = 'users'
                    AND ccu.column_name = 'id'
              ) LOOP
                  EXECUTE 'ALTER TABLE ' || quote_ident(r.table_name) || ' DROP CONSTRAINT ' || quote_ident(r.constraint_name);
                  
                  -- Determine if it should be CASCADE or SET NULL
                  IF r.column_name = 'user_id' OR r.table_name = 'attendance' OR r.table_name = 'payroll' OR r.table_name = 'leave_requests' THEN
                      EXECUTE 'ALTER TABLE ' || quote_ident(r.table_name) || ' ADD CONSTRAINT ' || quote_ident(r.constraint_name) || 
                              ' FOREIGN KEY (' || quote_ident(r.column_name) || ') REFERENCES users(id) ON DELETE CASCADE';
                  ELSE
                      EXECUTE 'ALTER TABLE ' || quote_ident(r.table_name) || ' ADD CONSTRAINT ' || quote_ident(r.constraint_name) || 
                              ' FOREIGN KEY (' || quote_ident(r.column_name) || ') REFERENCES users(id) ON DELETE SET NULL';
                  END IF;
              END LOOP;
          END $$;
        `);

        // 2. Fix attendance status default value
        await pool.query("ALTER TABLE attendance ALTER COLUMN status SET DEFAULT 'working'");
        
        // 3. Ensure invoices table has due_date and signature_data columns
        await pool.query("ALTER TABLE invoices ADD COLUMN IF NOT EXISTS due_date DATE");
        await pool.query("ALTER TABLE invoices ADD COLUMN IF NOT EXISTS signature_data TEXT");
        
        // 4. Ensure project_payment_stages is correct
        await pool.query(`
          CREATE TABLE IF NOT EXISTS project_payment_stages (
            id SERIAL PRIMARY KEY,
            project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            name VARCHAR(255),
            amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
            status VARCHAR(50) DEFAULT 'bill generated',
            created_at TIMESTAMPTZ DEFAULT NOW(),
            document_type VARCHAR(100),
            initiated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
            updated_at TIMESTAMPTZ DEFAULT NOW()
          )
        `);

        // Make name nullable safely
        await pool.query(`
          DO $$
          BEGIN
              IF EXISTS (
                  SELECT 1 FROM information_schema.columns 
                  WHERE table_name = 'project_payment_stages' AND column_name = 'name'
              ) THEN
                  ALTER TABLE project_payment_stages ALTER COLUMN name DROP NOT NULL;
              END IF;
          END $$;
        `);
        
        // Add missing columns to project_payment_stages if they don't exist
        await pool.query("ALTER TABLE project_payment_stages ADD COLUMN IF NOT EXISTS document_type VARCHAR(100)");
        await pool.query("ALTER TABLE project_payment_stages ADD COLUMN IF NOT EXISTS initiated_by INTEGER REFERENCES users(id) ON DELETE SET NULL");
        await pool.query("ALTER TABLE project_payment_stages ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()");


        // 5. Ensure project_document_amounts exists
        await pool.query(`
          CREATE TABLE IF NOT EXISTS project_document_amounts (
            id SERIAL PRIMARY KEY,
            project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            document_type VARCHAR(100) NOT NULL,
            amount DECIMAL(15, 2),
            created_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(project_id, document_type)
          )
        `);

        // 6. Ensure documents table exists
        await pool.query(`
          CREATE TABLE IF NOT EXISTS documents (
            id SERIAL PRIMARY KEY,
            project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
            file_name VARCHAR(255) NOT NULL,
            file_path TEXT NOT NULL,
            file_type VARCHAR(100),
            file_size INTEGER,
            remark TEXT,
            category VARCHAR(50) DEFAULT 'document',
            document_type VARCHAR(100),
            created_at TIMESTAMPTZ DEFAULT NOW()
          )
        `);

        // 6b. Add new document metadata columns (non-destructive — nullable)
        await pool.query("ALTER TABLE documents ADD COLUMN IF NOT EXISTS original_name VARCHAR(500)");
        await pool.query("ALTER TABLE documents ADD COLUMN IF NOT EXISTS stored_name  VARCHAR(500)");
        await pool.query("ALTER TABLE documents ADD COLUMN IF NOT EXISTS extension    VARCHAR(20)");

        // 6c. Performance index for document lookups by project + type
        await pool.query(`
          CREATE INDEX IF NOT EXISTS idx_documents_project_type
            ON documents(project_id, document_type)
        `);

        // 7. Ensure comments table exists
        await pool.query(`
          CREATE TABLE IF NOT EXISTS comments (
            id SERIAL PRIMARY KEY,
            project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
            message TEXT NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW()
          )
        `);

        // 8. Ensure leave_requests exists
        await pool.query(`
          CREATE TABLE IF NOT EXISTS leave_requests (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            start_date DATE NOT NULL,
            end_date DATE NOT NULL,
            type VARCHAR(50) NOT NULL,
            reason TEXT,
            status VARCHAR(20) DEFAULT 'pending',
            remarks TEXT,
            reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
          )
        `);
        
        await pool.query('CREATE INDEX IF NOT EXISTS idx_leaves_user ON leave_requests(user_id)');
        await pool.query('CREATE INDEX IF NOT EXISTS idx_leaves_date ON leave_requests(start_date, end_date)');
        
        // 9. Ensure payroll table has incentives column
        await pool.query("ALTER TABLE payroll ADD COLUMN IF NOT EXISTS incentives DECIMAL(15, 2) DEFAULT 0");

        // 10. Hourly Salary & Attendance Hours
        await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS hourly_rate DECIMAL(15, 2) DEFAULT 0");
        await pool.query("ALTER TABLE attendance ADD COLUMN IF NOT EXISTS hours_worked DECIMAL(10, 2) DEFAULT 0");

        console.log('✅ DB Schema migrations completed');
      } catch (mErr) {
        console.error('❌ Migration failed:', mErr.message);
      }
    };
    runMigrations();
  }
});

module.exports = pool;
