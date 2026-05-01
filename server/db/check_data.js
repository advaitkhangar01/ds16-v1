// server/db/check_data.js
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const pool = require('./index');

async function check() {
  try {
    const { rows: projects } = await pool.query('SELECT id, name, status, client_id FROM projects');
    console.log(`Total Projects: ${projects.length}`);
    console.table(projects.slice(0, 10));

    const { rows: stages } = await pool.query('SELECT project_id, stage_name, status FROM project_stages LIMIT 20');
    console.log('\nSample Stages:');
    console.table(stages);

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

check();
