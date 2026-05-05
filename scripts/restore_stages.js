// scripts/restore_stages.js
require('dotenv').config({ path: './server/.env' });
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const DEFAULT_STAGES = ['Proposal', 'Design', 'Submission', 'Working', 'Execution'];

async function restore() {
  const client = await pool.connect();
  try {
    console.log('🔍 Checking for projects without stages...');
    
    // Find projects with 0 stages
    const { rows: projects } = await client.query(`
      SELECT p.id, p.name 
      FROM projects p
      LEFT JOIN project_stages ps ON ps.project_id = p.id
      GROUP BY p.id
      HAVING COUNT(ps.id) = 0
    `);

    if (projects.length === 0) {
      console.log('✅ No projects found missing stages.');
      return;
    }

    console.log(`Found ${projects.length} projects missing stages. Restoring...`);

    await client.query('BEGIN');

    for (const project of projects) {
      console.log(`  - Restoring stages for: ${project.name} (ID: ${project.id})`);
      for (const stage of DEFAULT_STAGES) {
        await client.query(
          `INSERT INTO project_stages (project_id, stage_name, status) VALUES ($1, $2, 'pending')`,
          [project.id, stage]
        );
      }
    }

    await client.query('COMMIT');
    console.log('🎉 Restoration complete!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Restoration failed:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

restore();
