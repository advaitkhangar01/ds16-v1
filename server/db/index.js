// server/db/index.js
// PostgreSQL connection pool

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
    
    // Auto-Migration: Ensure schema is correct for user deletion
    const runMigrations = async () => {
      try {
        // 1. Fix Foreign Keys for users(id) to support deletion
        await pool.query(`
          DO $$ 
          DECLARE 
              r RECORD;
          BEGIN
              FOR r IN (
                  SELECT tc.table_name, tc.constraint_name, kcu.column_name
                  FROM information_schema.table_constraints AS tc 
                  JOIN information_schema.key_column_usage AS kcu
                    ON tc.constraint_name = kcu.constraint_name
                    AND tc.table_schema = kcu.table_schema
                  WHERE tc.constraint_type = 'FOREIGN KEY' 
                    AND kcu.referenced_table_name = 'users'
                    AND kcu.referenced_column_name = 'id'
              ) LOOP
                  EXECUTE 'ALTER TABLE ' || quote_ident(r.table_name) || ' DROP CONSTRAINT ' || quote_ident(r.constraint_name);
                  
                  -- Determine if it should be CASCADE or SET NULL
                  -- CASCADE for ownership/private data, SET NULL for metadata/tracking
                  IF r.column_name = 'user_id' OR r.table_name = 'attendance_attempts' OR r.table_name = 'payroll' OR r.table_name = 'employee_leave_summary' THEN
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
        
        // 3. Ensure leave_requests exists
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
        
        await pool.query('ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS remarks TEXT');
        await pool.query('ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL');
        
        await pool.query('CREATE INDEX IF NOT EXISTS idx_leaves_user ON leave_requests(user_id)');
        await pool.query('CREATE INDEX IF NOT EXISTS idx_leaves_date ON leave_requests(start_date, end_date)');
        
        console.log('✅ DB Schema migrations completed');
      } catch (mErr) {
        console.error('❌ Migration failed:', mErr.message);
      }
    };
    runMigrations();
  }
});

module.exports = pool;
