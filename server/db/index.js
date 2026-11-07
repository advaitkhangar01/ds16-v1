const dotenv = require('dotenv');
const dotenvPath = require('path').join(__dirname, '..', '.env');
if (process.env.NODE_ENV === 'test') {
  dotenv.config({ path: dotenvPath });
} else {
  dotenv.config({ path: dotenvPath, override: true });
}
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: process.env.DB_POOL_MAX ? parseInt(process.env.DB_POOL_MAX, 10) : 8,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 5000,
  ssl: (process.env.NODE_ENV === 'production' && !process.env.DATABASE_URL.includes('localhost') && !process.env.DATABASE_URL.includes('127.0.0.1')) 
    ? { rejectUnauthorized: false } 
    : false,
  options: "-c timezone=Asia/Kolkata",
});

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL error on idle client:', err);
});

// Note: Timezone is set at the connection level via pool options, and role-level fallback is wrapped in a safe catch.

// Test connection on startup (disabled in tests)
if (process.env.NODE_ENV !== 'test') {
  pool.query('SELECT NOW()', (err) => {
    if (err) {
      console.error('❌ DB connection failed:', err.message);
    } else {
      console.log('✅ Connected to PostgreSQL');
    }
  });
}

module.exports = pool;













