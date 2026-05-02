const pool = require('./index');

const projectsData = [
  { sr: 1, client: 'Milind Jichkar', type: 'Apartment Residential', location: 'Friends Colony', status: 'Under Sanctioning' },
  { sr: 2, client: 'Manoj Surkar', type: 'Residential Commercial', location: 'Wardha', eng: 'Str. Aaj Engineer, Aman Sir', status: 'Under Execution' },
  { sr: 3, client: 'Atul Guddadhe', type: 'Apartment Residential', location: 'Trimurti Nagar', status: 'Under Sanctioning' },
  { sr: 4, client: 'Atul Guddadhe', type: 'Conference Interior', location: 'Trimurti Nagar', status: 'Under Proposal' },
  { sr: 5, client: 'Jaiesh Deshmukh', type: 'Apartment Residential', location: 'Gopal Nagar', status: 'Under Proposal' },
  { sr: 6, client: 'Ashwin Raut', type: 'Banquet Hall', location: 'Zinga Bai Takli', status: 'Under Proposal' },
  { sr: '6a', client: 'Ashwin Raut', type: 'Apartment Residential', location: '', status: 'Under Proposal' },
  { sr: '6b', client: 'Chandrakant Yenurkar', type: 'Flat Interior', location: 'Nalco Society', status: 'Under Proposal' },
  { sr: 7, client: 'Arun Wankhede', type: 'Residence', location: 'Manish Nagar', eng: 'Str. Nitesh Jibkate', status: 'Under Execution' },
  { sr: '7a', client: 'Antar Khirad', type: 'Apartment Residential', location: '', status: 'Under Proposal' },
  { sr: 8, client: 'Sharad Dalvi', type: 'Residence', location: 'Jaitala', status: 'Under Execution' },
  { sr: 9, client: 'Ravi Pechare', type: 'Apartment Residential', location: 'Wardha', status: 'Under Proposal' },
  { sr: '9a', client: 'Abhishek Singh', type: 'Residence', location: 'Sonegoan', status: 'Under Proposal' },
  { sr: 10, client: 'Adv. Anuj Patil', type: 'Flat Interior', location: 'Sneha Nagar', status: 'Under Execution' },
  { sr: 11, client: 'Nilesh Mahajan', type: 'Temple', location: 'Wardha Selu', status: 'Under Proposal' },
  { sr: 12, client: 'Lokesh Jain', type: 'Hostel', location: 'Sadar', status: 'Under Proposal' },
  { sr: 13, client: 'Lokesh Jain', type: 'Terrace Floor Plan', location: 'Chhawani Sadar', status: 'Under Proposal' },
  { sr: 14, client: 'Shantanu Gotmare', type: 'Shopping Complex', location: 'Kalmeshwar', eng: 'Str. Patankar', status: 'Under Sanctioning' },
  { sr: 15, client: 'Nitin Rothe', type: 'Apartment Residential', location: 'Pratap Nagar', status: 'Under Proposal' },
  { sr: 16, client: 'Kapil Adwani', type: 'Other', location: 'Hinganghat', status: 'Under Proposal' },
  { sr: 17, client: 'Mithun Kate', type: 'Flat Interior', location: 'Besa road', status: 'Under Proposal' },
  { sr: 18, client: 'Ritesh Yenurkar', type: 'Flat Interior', location: 'Bokhara, Earth-cesa', status: 'Under Proposal' },
  { sr: 19, client: 'Sudesh Khutate', type: 'Flat Interior', location: 'Wadi', status: 'Under Proposal' },
];

const DEFAULT_STAGES = ['Proposal', 'Design', 'Submission', 'Working', 'Execution'];

async function seedProjects() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Check if projects already exist to avoid wiping real data
    const { rows: existing } = await client.query('SELECT COUNT(*) FROM projects');
    if (parseInt(existing[0].count) > 0) {
      console.log('Projects already exist. Skipping seed to prevent data loss.');
      await client.query('COMMIT');
      return;
    }

    console.log('No projects found, seeding defaults...');

    // We assume the admin user ID is the one creating it. We will fetch the first admin.
    const { rows: users } = await client.query("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
    const adminId = users.length > 0 ? users[0].id : 1;

    for (const p of projectsData) {
      // Map frontend expected format
      const name = `${p.client} - ${p.type}`;
      
      const { rows } = await client.query(
        `INSERT INTO projects (name, client_name, type, location, structural_engineer, status, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [name, p.client, p.type, p.location || null, p.eng || null, p.status, adminId]
      );
      
      const projectId = rows[0].id;
      
      // Auto-generate project stages
      for (const stage of DEFAULT_STAGES) {
        await client.query(
          `INSERT INTO project_stages (project_id, stage_name, status) VALUES ($1, $2, 'pending')`,
          [projectId, stage]
        );
      }
      
      // Restore complex seed logic for statuses
      if (p.status === 'Under Execution' || p.status === 'Under Sanctioning') {
         await client.query(`UPDATE project_stages SET status = 'completed' WHERE project_id = $1 AND stage_name IN ('Proposal', 'Design')`, [projectId]);
      }
      if (p.status === 'Under Execution') {
         await client.query(`UPDATE project_stages SET status = 'completed' WHERE project_id = $1 AND stage_name = 'Submission'`, [projectId]);
         await client.query(`UPDATE project_stages SET status = 'in_progress' WHERE project_id = $1 AND stage_name = 'Working'`, [projectId]);
      }
      if (p.status === 'Under Designing') {
         await client.query(`UPDATE project_stages SET status = 'completed' WHERE project_id = $1 AND stage_name = 'Proposal'`, [projectId]);
         await client.query(`UPDATE project_stages SET status = 'in_progress' WHERE project_id = $1 AND stage_name = 'Design'`, [projectId]);
      }
      if (p.status === 'Completed') {
         await client.query(`UPDATE project_stages SET status = 'completed' WHERE project_id = $1`, [projectId]);
      }
      if (p.status === 'Under Sanctioning') {
         await client.query(`UPDATE project_stages SET status = 'in_progress' WHERE project_id = $1 AND stage_name = 'Submission'`, [projectId]);
      }
    }
    await client.query('COMMIT');
    console.log(`Successfully seeded ${projectsData.length} projects!`);
    // No process.exit here, let the caller handle it if needed
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Seed projects failed:', err);
    throw err;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  seedProjects().then(() => {
    console.log('Seeding finished');
    process.exit(0);
  }).catch(err => {
    console.error('Seeding failed', err);
    process.exit(1);
  });
}

module.exports = seedProjects;
