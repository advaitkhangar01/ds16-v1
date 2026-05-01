// server/db/check_3000.js
const axios = require('axios');
async function check() {
  try {
    const res = await axios.get('http://localhost:3000/health');
    console.log('Health:', res.data);
    process.exit(0);
  } catch (e) {
    console.log('Error:', e.message);
    process.exit(1);
  }
}
check();
