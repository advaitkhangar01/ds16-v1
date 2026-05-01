// server/db/seed_vendors_list.js
process.env.NODE_ENV = 'development';
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const pool = require('./index');

const VENDORS_DATA = [
  { name: 'Kitchen Lifestyle', category: 'Kitchen', phone: '8408047874' },
  { name: 'Kamlesh Anjana Infra', category: 'Infrastructure', phone: '9987008320' },
  { name: 'Aaj Engineer', category: 'Engineer', phone: '7030427828' },
  { name: 'Satish', category: 'Other', phone: '7249666936' },
  { name: 'Pathankar', category: 'Other', phone: '9130003640' },
  { name: 'Rahul', category: 'Plumbing Consultant', phone: '9970083027' },
  { name: 'Ashwin', category: 'Str. Consultancy', phone: '8007233703' },
  { name: 'Nitesh Jibkate', category: 'Str. Consultancy', phone: '9766214494' },
  { name: 'Vijay Kalambe', category: 'Str. Consultancy', phone: '9970066936' },
  { name: 'Aman', category: 'Str. Consultancy', phone: '9011084413' },
  { name: 'Krishna Sharma', category: 'Str. Consultancy', phone: '8446767689' },
  { name: 'Vasant Bhause', category: 'Str. Consultancy', phone: '9970066939' },
  { name: 'Ashish Shiwarkar', category: 'Carpenter', phone: '9823779651' },
  { name: 'Mukesh', category: 'AC Installation', phone: '9309909227' },
  { name: 'Abhijeet Realtors Inv', category: 'Realtors', phone: '8624907384' },
  { name: 'Soil Test', category: 'Testing', phone: '8390005813' },
  { name: 'Adwait Air Care', category: 'AC Installation', phone: '9823977356' },
  { name: 'Anuj Patil', category: 'Contractor', phone: '9823799281' },
  { name: 'Ajju Bhai Mistri', category: 'Contractor', phone: '7447295512' },
  { name: 'Akash Borkar', category: 'Gas Agency', phone: '7977349651' },
  { name: 'Anuj Patil', category: 'Gas Agency', phone: '9326386554' },
  { name: 'Yenurkar', category: 'Electrician', phone: '7499293436' },
  { name: 'Ankit Yenurkar', category: 'Deco Painter', phone: '9421696365' },
  { name: 'Ankush Misare', category: 'Abhijit Realtors', phone: '9881498525' },
  { name: 'Aparna', category: 'Contractor', phone: '9561768753' },
  { name: 'Birju', category: 'Carpenter', phone: '9422110406' },
  { name: 'Ashok Mistri', category: 'Electrical Supplier', phone: '9373165927' },
  { name: 'Chandrakant Upadhyay', category: 'Electrical Supplier', phone: '9595585963' },
  { name: 'Chawla', category: 'Civil Contractor', phone: '7720936465' },
  { name: 'Kapil Maheshgauri', category: 'Civil Contractor', phone: '9970443644' },
  { name: 'Nitin Thakre', category: 'Civil Contractor', phone: '9270467174' },
  { name: 'Maniram Barai', category: 'Civil Contractor', phone: '9881131575' },
  { name: 'Shantanu Gotmare', category: 'Electrician', phone: '9588694711' },
  { name: 'Imran (Sharad Dalvi)', category: 'AC Ducting', phone: '9371839227' },
];

async function seed() {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    
    console.log(`🚀 Importing ${VENDORS_DATA.length} vendors...`);
    
    for (const v of VENDORS_DATA) {
      await db.query(
        `INSERT INTO vendors (name, category, phone) 
         VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING`, // Avoid duplicates if re-running
        [v.name, v.category, v.phone]
      );
    }

    await db.query('COMMIT');
    console.log('✅ Vendor import successful!');
  } catch (err) {
    await db.query('ROLLBACK');
    console.error('❌ Vendor import failed:', err);
  } finally {
    db.release();
    pool.end();
  }
}

seed();
