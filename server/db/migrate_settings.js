require('dotenv').config({ path: './server/.env', override: true });
const pool = require('./index');

async function migrate() {
  try {
    console.log('🚀 Starting settings and holidays migration...');
    
    // 1. App Settings table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key VARCHAR(100) PRIMARY KEY,
        value TEXT NOT NULL,
        description TEXT,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
    
    // 2. Default settings
    const defaultSettings = [
      ['office_start_time', '09:30', 'Standard office start time (HH:mm)'],
      ['late_threshold_mins', '15', 'Buffer time in minutes before lateness is penalized'],
      ['late_penalty_amount', '50', 'Fixed amount deducted for late arrival'],
      ['half_day_threshold_hours', '4', 'Minimum hours required for a full day'],
      ['half_day_penalty_percent', '50', 'Percentage of daily wage deducted for half day'],
      ['leave_penalty_type', 'daily_wage', 'Penalty for unplanned leave (daily_wage or fixed)'],
      ['leave_penalty_fixed', '0', 'Fixed amount for leave penalty if type is fixed']
    ];

    for (const [key, val, desc] of defaultSettings) {
      await pool.query(
        `INSERT INTO app_settings (key, value, description) VALUES ($1, $2, $3) ON CONFLICT (key) DO NOTHING`,
        [key, val, desc]
      );
    }
    
    // 3. Holidays table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS holidays (
        id SERIAL PRIMARY KEY,
        date DATE UNIQUE NOT NULL,
        name VARCHAR(200) NOT NULL,
        is_paid BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    console.log('✅ Settings and Holidays migration complete');
  } catch (err) {
    console.error('❌ Migration failed:', err);
  } finally {
    await pool.end();
  }
}

migrate();
