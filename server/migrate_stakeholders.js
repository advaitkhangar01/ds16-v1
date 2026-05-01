require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: (process.env.NODE_ENV === 'production' && !process.env.DATABASE_URL.includes('localhost') && !process.env.DATABASE_URL.includes('127.0.0.1')) 
    ? { rejectUnauthorized: false } 
    : false,
});

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    console.log('1. Creating project_stakeholders table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS project_stakeholders (
        id SERIAL PRIMARY KEY,
        project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        role VARCHAR(100),
        phone VARCHAR(50),
        email VARCHAR(255),
        is_primary BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log('2. Fetching existing clients with their contacts and projects...');
    // We get all clients, their contacts and their projects.
    const { rows: clientContacts } = await client.query('SELECT * FROM client_contacts');
    const { rows: projects } = await client.query('SELECT id, client_id FROM projects');

    console.log(`Found ${clientContacts.length} contacts and ${projects.length} projects.`);

    let insertedCount = 0;

    // For each contact, insert them into ALL projects that belong to their client.
    for (const contact of clientContacts) {
      const clientProjects = projects.filter(p => p.client_id === contact.client_id);
      
      for (const project of clientProjects) {
        // Check if this exact stakeholder already exists in the project
        const { rows: existing } = await client.query(
          'SELECT id FROM project_stakeholders WHERE project_id = $1 AND name = $2 AND (phone = $3 OR email = $4)',
          [project.id, contact.name, contact.phone, contact.email]
        );

        if (existing.length === 0) {
          await client.query(
            `INSERT INTO project_stakeholders (project_id, name, role, phone, email, is_primary)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [project.id, contact.name, contact.role, contact.phone, contact.email, contact.is_primary]
          );
          insertedCount++;
        }
      }
    }

    console.log(`3. Migration complete. Inserted ${insertedCount} stakeholders into projects.`);
    
    await client.query('COMMIT');
    console.log('✅ Successfully committed transaction.');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', error);
  } finally {
    client.release();
    pool.end();
  }
}

migrate();
