require('dotenv').config();
const pool = require('./db');

async function improveLinking() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    console.log('1. Ensuring all projects have a valid client_id...');
    // If any projects still have null client_id, we try to match them by client_name one last time
    await client.query(`
      UPDATE projects p
      SET client_id = c.id
      FROM clients c
      WHERE p.client_id IS NULL AND LOWER(p.client_name) = LOWER(c.name)
    `);

    console.log('2. Setting client_id to NOT NULL...');
    // We only do this if there are no orphans. If there are, we might need a "General" client.
    const { rows: orphans } = await client.query('SELECT id, name FROM projects WHERE client_id IS NULL');
    if (orphans.length > 0) {
      console.warn(`Found ${orphans.length} orphan projects. Creating 'Default Client' for them.`);
      const { rows: defClient } = await client.query("INSERT INTO clients (name) VALUES ('Legacy/Default Client') RETURNING id");
      await client.query('UPDATE projects SET client_id = $1 WHERE client_id IS NULL', [defClient[0].id]);
    }

    await client.query('ALTER TABLE projects ALTER COLUMN client_id SET NOT NULL');

    console.log('3. Adding index for faster client-project lookups...');
    await client.query('CREATE INDEX IF NOT EXISTS idx_projects_client_id ON projects(client_id)');

    await client.query('COMMIT');
    console.log('✅ Database linking improved successfully.');
    process.exit(0);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', err);
    process.exit(1);
  } finally {
    client.release();
  }
}

improveLinking();
