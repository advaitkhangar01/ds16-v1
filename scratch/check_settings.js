const pool = require('../server/db');

async function checkAppSettings() {
  try {
    const { rows } = await pool.query("SELECT * FROM information_schema.tables WHERE table_name = 'app_settings'");
    console.log('Table exists:', rows.length > 0);
    if (rows.length > 0) {
      const { rows: settings } = await pool.query("SELECT * FROM app_settings");
      console.log('Settings:', settings);
    }
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

checkAppSettings();
