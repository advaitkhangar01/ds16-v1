// server/db/seed.js
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const pool = require('./index');

async function seed() {
  const seedSqlPath = path.join(__dirname, 'seed.sql');
  let sql = fs.readFileSync(seedSqlPath, 'utf8');

  console.log('🚀 Starting database seed...');

  try {
    // Generate hashes for default users
    const adminHash = await bcrypt.hash('admin123', 12);
    const emp1Hash = await bcrypt.hash('chaitali123', 12);
    const emp2Hash = await bcrypt.hash('rahul123', 12);
    const emp3Hash = await bcrypt.hash('rohit123', 12);

    // Replace placeholders in SQL
    sql = sql.replace('PLACEHOLDER_ADMIN', adminHash);
    sql = sql.replace('PLACEHOLDER_EMP1', emp1Hash);
    sql = sql.replace('PLACEHOLDER_EMP2', emp2Hash);
    sql = sql.replace('PLACEHOLDER_EMP3', emp3Hash);

    // Execute the SQL
    await pool.query(sql);

    // Add default app settings if they don't exist
    const settings = [
      ['office_start_time', '09:30', 'Standard office start time'],
      ['late_threshold_mins', '15', 'Minutes after start time to mark as late'],
      ['half_day_threshold_hours', '4', 'Minimum hours for a full day'],
      ['late_penalty_amount', '100', 'Flat deduction for late arrival'],
      ['half_day_penalty_percent', '50', 'Percentage deduction for half day'],
      ['late_penalty_rule_count', '3', 'Number of lates that trigger a deduction'],
      ['late_penalty_rule_days', '0.15', 'Number of days deducted per penalty trigger']
    ];

    for (const [key, val, desc] of settings) {
      await pool.query(
        'INSERT INTO app_settings (key, value, description) VALUES ($1, $2, $3) ON CONFLICT (key) DO NOTHING',
        [key, val, desc]
      );
    }

    console.log('✅ Seeding completed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Seeding failed:', err);
    process.exit(1);
  }
}

seed();
