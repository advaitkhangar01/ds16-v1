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
  }
});

module.exports = pool;
