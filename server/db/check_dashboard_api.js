// server/db/check_dashboard_api.js
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const pool = require('./index');
const jwt = require('jsonwebtoken');

async function check() {
  try {
    const { rows: users } = await pool.query("SELECT * FROM users WHERE username = 'abhijit' LIMIT 1");
    const user = users[0];
    if (!user) {
      console.log('User abhijit not found');
      process.exit(1);
    }

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET || 'ds16_fallback_secret_change_in_production');
    console.log('Generated token for abhijit');

    const axios = require('axios');
    try {
      const res = await axios.get('http://localhost:3001/api/dashboard/admin', {
        headers: { Authorization: `Bearer ${token}` }
      });
      console.log('Dashboard Data Summary:');
      console.log(`Total Projects: ${res.data.total_projects}`);
      console.log('Kanban Column Counts:');
      Object.keys(res.data.kanban).forEach(col => {
        console.log(`  ${col}: ${res.data.kanban[col].length}`);
      });
    } catch (e) {
      console.error('API Error:', e.response?.data || e.message);
    }

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

check();
