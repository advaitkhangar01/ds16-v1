require('dotenv').config();
const pool = require('./db');
const seedProjects = require('./db/seed_projects');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

async function resetDB() {
  console.log('Starting Database and File Reset...');
  try {
    // 1. Clear Financial and Attendance Data only
    console.log('Clearing financial and attendance data...');
    await pool.query(`
      TRUNCATE TABLE 
        attendance,
        office_expenses,
        payroll,
        transactions,
        invoices,
        project_document_amounts
      RESTART IDENTITY CASCADE;
    `);
    console.log('Financial and attendance data cleared.');
    
    // 3. Ensure core users exist
    const users = [
      { name: 'Abhijit Gaulkar', role: 'admin', department: 'Management', phone: '9766339141', username: 'abhijit', password: 'DS16_admin_secure' },
      { name: 'Chaitali Bawane', role: 'employee', department: 'Design Proposal', phone: '8956772054', username: 'chaitali', password: 'DS16_emp_001' },
      { name: 'Rahul Kumar Bhiogade', role: 'employee', department: 'Execution', phone: '8956772056', username: 'rahul', password: 'DS16_emp_002' },
      { name: 'Ashwini Baitule', role: 'employee', department: 'Design', phone: '8956772057', username: 'ashwini', password: 'DS16_emp_003' },
      { name: 'Sahil Vishwakarma', role: 'employee', department: 'Execution', phone: '8956772058', username: 'sahil', password: 'DS16_emp_004' },
    ];

    for (const user of users) {
      const { rows } = await pool.query('SELECT id FROM users WHERE username = $1', [user.username]);
      if (rows.length === 0) {
        console.log(`Creating user: ${user.username}`);
        const hash = await bcrypt.hash(user.password, 12);
        await pool.query(
          `INSERT INTO users (name, role, department, phone, username, password_hash)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [user.name, user.role, user.department, user.phone, user.username, hash]
        );
      }
    }

    // 4. Seeding projects if empty
    const { rows: projectCount } = await pool.query('SELECT COUNT(*) FROM projects');
    if (parseInt(projectCount[0].count) === 0) {
      console.log('No projects found, seeding defaults...');
      await seedProjects();
    }

    
    // 3. Skip cleaning uploaded files to retain project data
    console.log('Skipping uploads folder cleanup to retain project documents.');

    console.log('Reset complete!');
  } catch (error) {
    console.error('Error during reset:', error.message);
    fs.writeFileSync('err.txt', error.stack || error.toString());
    process.exit(1);
  } finally {
    pool.end();
  }
}

resetDB();
