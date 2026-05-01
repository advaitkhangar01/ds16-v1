// server/db/seed_live_data.js
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const pool = require('./index');

const LIVE_DATA = [
  // Design Proposal
  { name: 'Wadi Apartment Interior', client: 'Ameet Khandelwal', type: 'Flat Interior', status: 'Under Proposal' },
  { name: 'Katol Township', client: 'Naresh Arcade', type: 'Other', status: 'Under Proposal' },
  { name: 'Residential Apartments', client: 'Nilesh Mahajan', type: 'Apartment Residential', status: 'Under Proposal' },
  { name: 'Residential Apartments', client: 'Pankaj Thakre', type: 'Apartment Residential', status: 'Under Proposal' },
  { name: 'Katol Showroom', client: 'Krishnaji Pund', type: 'Commercial', status: 'Under Proposal' },
  { name: 'Asara Office Interior', client: 'Ravi Pechere', type: 'Commercial Interior', status: 'Under Proposal' },
  { name: 'Dr. Prashant Kalandhad', client: 'Dr. Prashant Kalandhad', type: 'Residential Interior', status: 'Under Proposal' },
  { name: 'Mahajan Residence', client: 'Nupur Shahstrabuddhe', type: 'Rendering', status: 'Under Proposal' },
  { name: 'Yogesh Punjabi', client: 'Satyendra Gupta', type: 'Rendering', status: 'Under Proposal' },
  { name: 'Jaitala TDR', client: 'Kishor Guddadhe', type: 'Apartment Residential', status: 'Under Proposal' },
  
  // Sanction
  { name: 'Gotmare Amenity Building', client: 'Shantanu Gotmare', type: 'Commercial', status: 'Under Sanctioning' },
  { name: 'Jaitala Layout', client: 'Raju Jagtab', type: 'Layout Development', status: 'Under Sanctioning' },
  { name: 'Futala Restaurant', client: 'Narendra Jichkar', type: 'Commercial', status: 'Under Sanctioning' },
  { name: 'Atul Bomanwar Yavatmal', client: 'Atul Bomanwar', type: 'Apartment Residential', status: 'Under Sanctioning' },
  { name: 'Ravi Pechere - Apartment', client: 'Ravi Pechere', type: 'Apartment Residential', status: 'Under Sanctioning' },
  { name: 'Milind Jichkar - Apartment', client: 'Milind Jichkar', type: 'Apartment Residential', status: 'Under Sanctioning' },
  
  // Execution
  { name: 'Raj Bhavan Type 2', client: 'Ramesh Yewale PWD', type: 'Residence', status: 'Under Execution' },
  { name: 'Bacchawar Apartments', client: 'Milind Bacchawar', type: 'Apartment Residential', status: 'Under Execution' },
  { name: 'Gadge Residence', client: 'Prashant Gadge', type: 'Residence', status: 'Under Execution' },
  { name: 'Dadlani Residence', client: 'Hiteshwari Dadlani', type: 'Residence', status: 'Under Execution' },
  { name: 'Wanadongri Layout', client: 'Rajesh Bodhale', type: 'Layout Development', status: 'Under Execution' },
  { name: 'Gotmare Farm House', client: 'Shantanu Gotmare', type: 'Construction', status: 'Under Execution' },
  { name: 'Ritesh Yenurkar', client: 'Ritesh Yenurkar', type: 'Flat Interior', status: 'Under Execution' },
  { name: 'Shantanu Gotmare - Shopping', client: 'Shantanu Gotmare', type: 'Shopping Complex', status: 'Under Execution' },
  { name: 'Sharad Dalvi', client: 'Sharad Dalvi', type: 'Residence', status: 'Under Execution' },
  { name: 'Arun Wankhede', client: 'Arun Wankhede', type: 'Residence', status: 'Under Execution' },
  { name: 'Jaiesh Deshmukh', client: 'Jaiesh Deshmukh', type: 'Apartment Residential', status: 'Under Execution' },
  { name: 'Manoj Surkar', client: 'Manoj Surkar', type: 'Residential Commercial', status: 'Under Execution' },
  
  // Completed
  { name: 'Ranala Rendering', client: 'Abhijit Asolkar', type: 'Rendering', status: 'Completed' },
  { name: 'Vijay Shrivastav Rendering', client: 'Abhijit Asolkar', type: 'Rendering', status: 'Completed' },
  { name: 'Kapil Adwani', client: 'Kapil Adwani', type: 'Other', status: 'Completed' },
  { name: 'Adv. Anuj Patil', client: 'Adv. Anuj Patil', type: 'Flat Interior', status: 'Completed' },
  { name: 'Chandrakant Yenurkar', client: 'Chandrakant Yenurkar', type: 'Interior', status: 'Completed' },
  { name: 'Sudesh Khutate', client: 'Sudesh Khutate', type: 'Flat Interior', status: 'Completed' },
  
  // Pending
  { name: 'Golden Farm', client: 'Saurabh Masurkar', type: 'Banquet Hall', status: 'Pending' },
  { name: 'Mithun Kate', client: 'Mithun Kate', type: 'Flat Interior', status: 'Pending' },
  { name: 'Abhishek Singh', client: 'Abhishek Singh', type: 'Residence', status: 'Pending' },
  { name: 'Antar Khirad', client: 'Antar Khirad', type: 'Apartment Residential', status: 'Pending' },
  { name: 'Ashwin Raut', client: 'Ashwin Raut', type: 'Banquet Hall', status: 'Pending' },
  { name: 'Atul Guddadhe - Conference', client: 'Atul Guddadhe', type: 'Conference Interior', status: 'Pending' },
  { name: 'Atul Guddadhe - Apartment', client: 'Atul Guddadhe', type: 'Apartment Residential', status: 'Pending' },
];

const DEFAULT_STAGES = ['Proposal', 'Design', 'Submission', 'Working', 'Execution'];

async function seed() {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');

    console.log('🧹 Clearing old projects, stages, and clients...');
    await db.query('TRUNCATE project_stages, projects, clients CASCADE');

    const { rows: admins } = await db.query("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
    const adminId = admins[0]?.id || 1;

    console.log('👤 Seeding Clients...');
    const uniqueClients = [...new Set(LIVE_DATA.map(d => d.client))];
    const clientMap = {};

    for (const name of uniqueClients) {
      const { rows } = await db.query(
        'INSERT INTO clients (name, company_name) VALUES ($1, $2) RETURNING id',
        [name, name.includes('Arcade') || name.includes('PWD') ? name : null]
      );
      clientMap[name] = rows[0].id;
      
      // Also add a primary contact for each client to make it look realistic
      await db.query(
        'INSERT INTO client_contacts (client_id, name, is_primary) VALUES ($1, $2, TRUE)',
        [rows[0].id, name]
      );
    }
    console.log(`✅ Seeded ${uniqueClients.length} unique clients.`);

    console.log('🏗️ Seeding Projects...');
    for (const p of LIVE_DATA) {
      const { rows } = await db.query(
        `INSERT INTO projects (name, client_id, client_name, type, status, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [p.name, clientMap[p.client], p.client, p.type, p.status, adminId]
      );
      const projectId = rows[0].id;

      // Seed stages
      for (const stageName of DEFAULT_STAGES) {
        let stageStatus = 'pending';
        
        // Auto-progress stages based on project status
        if (p.status === 'Completed') {
          stageStatus = 'completed';
        } else if (p.status === 'Under Execution') {
          if (['Proposal', 'Design', 'Submission', 'Working'].includes(stageName)) stageStatus = 'completed';
          if (stageName === 'Execution') stageStatus = 'in_progress';
        } else if (p.status === 'Under Sanctioning') {
          if (['Proposal', 'Design'].includes(stageName)) stageStatus = 'completed';
          if (stageName === 'Submission') stageStatus = 'in_progress';
        } else if (p.status === 'Under Proposal' || p.status === 'Under Designing') {
          if (stageName === 'Proposal') stageStatus = 'in_progress';
        }

        await db.query(
          'INSERT INTO project_stages (project_id, stage_name, status) VALUES ($1, $2, $3)',
          [projectId, stageName, stageStatus]
        );
      }
    }
    console.log(`✅ Seeded ${LIVE_DATA.length} projects with stages.`);

    await db.query('COMMIT');
    console.log('\n🌟 DATABASE SYNC COMPLETE! 🌟');
  } catch (err) {
    await db.query('ROLLBACK');
    console.error('❌ Sync failed:', err);
  } finally {
    db.release();
    pool.end();
  }
}

seed();
