require('dotenv').config({ path: '.env' });
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false
});

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    console.log('🚀 Starting Clients Module Upgrade (V2)...');

    // 1. Update clients table
    console.log('Updating clients table structure...');
    await client.query(`
      ALTER TABLE clients 
      ADD COLUMN IF NOT EXISTS company_name TEXT,
      ADD COLUMN IF NOT EXISTS gst_number TEXT,
      ADD COLUMN IF NOT EXISTS pan_number TEXT,
      ADD COLUMN IF NOT EXISTS notes TEXT;
    `);

    // 2. Create client_contacts table
    console.log('Creating client_contacts table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS client_contacts (
        id SERIAL PRIMARY KEY,
        client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        role TEXT, -- manager / poc / assistant / receptionist
        phone TEXT,
        email TEXT,
        is_primary BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // 3. Create client_addresses table
    console.log('Creating client_addresses table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS client_addresses (
        id SERIAL PRIMARY KEY,
        client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
        type TEXT, -- office / billing / site
        address TEXT,
        city TEXT,
        state TEXT,
        pincode TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // 4. Create client_banking table
    console.log('Creating client_banking table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS client_banking (
        id SERIAL PRIMARY KEY,
        client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
        account_name TEXT,
        account_number TEXT,
        ifsc TEXT,
        bank_name TEXT,
        branch TEXT,
        upi_id TEXT,
        is_primary BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // 5. Update projects table
    console.log('Linking projects to clients...');
    await client.query(`
      ALTER TABLE projects 
      ADD COLUMN IF NOT EXISTS client_id INTEGER REFERENCES clients(id);
    `);

    // 6. Data Migration for existing clients
    console.log('Migrating existing client data to contacts and addresses...');
    
    // Get existing clients
    const { rows: existingClients } = await client.query('SELECT * FROM clients');
    for (const c of existingClients) {
      // Check if contact already exists to avoid duplicates if re-run
      const { rows: contacts } = await client.query('SELECT id FROM client_contacts WHERE client_id = $1', [c.id]);
      if (contacts.length === 0) {
        await client.query(
          'INSERT INTO client_contacts (client_id, name, phone, email, is_primary) VALUES ($1, $2, $3, $4, $5)',
          [c.id, c.name, c.phone, c.email, true]
        );
      }

      const { rows: addresses } = await client.query('SELECT id FROM client_addresses WHERE client_id = $1', [c.id]);
      if (addresses.length === 0 && c.address) {
        await client.query(
          'INSERT INTO client_addresses (client_id, type, address) VALUES ($1, $2, $3)',
          [c.id, 'office', c.address]
        );
      }

      // Try to link existing projects
      await client.query(
        'UPDATE projects SET client_id = $1 WHERE client_name = $2 AND client_id IS NULL',
        [c.id, c.name]
      );
    }

    await client.query('COMMIT');
    console.log('✅ Migration complete!');
    process.exit(0);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
