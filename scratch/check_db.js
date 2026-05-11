const pool = require('../server/db');
async function check() {
  try {
    const res = await pool.query("SELECT trigger_name, event_manipulation, event_object_table FROM information_schema.triggers");
    console.log(res.rows);
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}
check();
