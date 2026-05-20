const pool = require('../server/db');
const bcrypt = require('../server/node_modules/bcryptjs');

async function seedUsers() {
  try {
    console.log('Inserting/updating VPS aligned users...');

    // Generate standard password hashes
    const defaultHash = await bcrypt.hash('password123', 10);

    const users = [
      { id: 1, name: 'Abhijit Gaulkar', role: 'admin', department: 'Management', phone: '9766339141', username: 'abhijit', hash: defaultHash },
      { id: 2, name: 'Chaitali Bawane', role: 'employee', department: 'Design Proposal', phone: '8956772054', username: 'chaitali', hash: defaultHash },
      { id: 3, name: 'Rahul Kumar Bhiogade', role: 'employee', department: 'Execution', phone: '8956772056', username: 'rahul', hash: defaultHash },
      { id: 5, name: 'Ashwini', role: 'employee', department: 'Design Proposal', phone: '8956772057', username: 'ashwini', hash: defaultHash },
      { id: 6, name: 'Sahil', role: 'employee', department: 'Execution', phone: '8956772058', username: 'sahil', hash: defaultHash }
    ];

    for (const u of users) {
      await pool.query(
        `INSERT INTO users (id, name, role, department, phone, username, password_hash)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           role = EXCLUDED.role,
           department = EXCLUDED.department,
           phone = EXCLUDED.phone,
           username = EXCLUDED.username`,
        [u.id, u.name, u.role, u.department, u.phone, u.username, u.hash]
      );
      console.log(`- Seeded user: ${u.name} (ID: ${u.id})`);
    }

    // Reset SERIAL sequence
    await pool.query("SELECT setval('users_id_seq', (SELECT MAX(id) FROM users))");
    console.log('✅ Sequence users_id_seq synchronized.');
    process.exit(0);
  } catch (err) {
    console.error('Error seeding users:', err);
    process.exit(1);
  }
}

seedUsers();
