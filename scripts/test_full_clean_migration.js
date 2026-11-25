// scripts/test_full_clean_migration.js
const pool = require('../server/db');
const fs = require('fs');
const path = require('path');

async function testFullCleanMigration() {
  const client = await pool.connect();
  try {
    console.log('Testing full clean install (schema.sql + all migrations) in clean_test_mig schema...');
    await client.query('DROP SCHEMA IF EXISTS clean_test_mig CASCADE');
    await client.query('CREATE SCHEMA clean_test_mig');
    await client.query('SET search_path TO clean_test_mig');

    // 1. Run schema.sql
    const schemaSql = fs.readFileSync(path.join(__dirname, '..', 'server', 'db', 'schema.sql'), 'utf8')
      .replace(/CREATE EXTENSION IF NOT EXISTS "uuid-ossp";/i, '');
    await client.query(schemaSql);
    console.log('✅ schema.sql executed cleanly');

    // 2. Run migrations
    const migrationsDir = path.join(__dirname, '..', 'server', 'db', 'migrations');
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    for (const file of files) {
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf8');
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`  ✅ Migration ${file} applied`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`  ❌ Migration ${file} FAILED:`, err.message);
        throw err;
      }
    }

    console.log('🎉 Full clean install & migration PASSED!');
  } catch (err) {
    console.error('Clean install test aborted due to error.');
  } finally {
    try {
      await client.query('DROP SCHEMA IF EXISTS clean_test_mig CASCADE');
    } catch (_) {}
    client.release();
    pool.end();
  }
}

testFullCleanMigration();
