// server/db/seed.js
// Run: node db/seed.js
// This creates the DB, runs schema, and inserts seed data with real bcrypt hashes

require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const seedProjects = require('./seed_projects');

const users = [
  { name: 'Abhijit Goulkar', role: 'admin', department: 'Management', phone: '9766339141', username: 'abhijit', password: 'DS16_admin_secure' },
  { name: 'Chaitali Bawane', role: 'employee', department: 'Design Proposal', phone: '8956772054', username: 'chaitali', password: 'DS16_emp_001' },
  { name: 'Rahul Kumar Bhiogade', role: 'employee', department: 'Execution', phone: '8956772056', username: 'rahul', password: 'DS16_emp_002' },
  { name: 'Ashwini Baitule', role: 'employee', department: 'Design', phone: '8956772057', username: 'ashwini', password: 'DS16_emp_003' },
  { name: 'Sahil Vishwakarma', role: 'employee', department: 'Execution', phone: '8956772058', username: 'sahil', password: 'DS16_emp_004' },
];

const vendors = [
  { category: 'Carpenter', name: 'Rajesh Sawant' },
  { category: 'Carpenter', name: 'Mahesh Thakur' },
  { category: 'Carpenter', name: 'Vinod Patil' },
  { category: 'Electrician', name: 'Amit Sharma' },
  { category: 'Electrician', name: 'Suresh Yadav' },
  { category: 'Electrician', name: 'Kiran Desai' },
  { category: 'POP', name: 'Ganesh POP Works' },
  { category: 'POP', name: 'Sumit Plaster Works' },
  { category: 'Contractor', name: 'Shinde Constructions' },
  { category: 'Contractor', name: 'Patil Builders' },
  { category: 'Contractor', name: 'Nagpur Civil Works' },
];

async function seed() {
  const client = await pool.connect();
  try {
    console.log('Running schema...');
    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await client.query(schema);

    // Check if users already exist
    const { rows: existing } = await client.query('SELECT COUNT(*) FROM users');
    if (parseInt(existing[0].count) > 0) {
      console.log('Seed data already exists. Skipping...');
      console.log('To re-seed: TRUNCATE vendors, comments, project_assignments, project_stages, projects, attendance, users RESTART IDENTITY CASCADE;');
      return;
    }

    console.log('Seeding users...');
    for (const user of users) {
      const hash = await bcrypt.hash(user.password, 12);
      await client.query(
        `INSERT INTO users (name, role, department, phone, username, password_hash)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [user.name, user.role, user.department, user.phone, user.username, hash]
      );
      console.log(`  ✓ ${user.username} (${user.role})`);
    }

    console.log('Seeding vendors...');
    for (const vendor of vendors) {
      await client.query(
        `INSERT INTO vendors (category, name) VALUES ($1, $2)`,
        [vendor.category, vendor.name]
      );
    }
    console.log(`  ✓ ${vendors.length} vendors inserted`);
    
    console.log('Seeding projects...');
    await seedProjects();
    console.log('  ✓ Projects seeded successfully');

    console.log('\n✅ Seed complete!');
    console.log('Login credentials:');
    console.log('  Admin:    abhijit / DS16_admin_secure');
    console.log('  Employee: chaitali / DS16_emp_001');
    console.log('  Employee: rahul / DS16_emp_002');
    console.log('  Employee: rohit / DS16_emp_003');
  } catch (err) {
    console.error('Seed error:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
