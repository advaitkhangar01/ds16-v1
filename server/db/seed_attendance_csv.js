const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const pool = require('./index');

async function seedAttendance() {
  const csvPath = path.join(__dirname, '..', '..', 'attendance_full.csv');
  if (!fs.existsSync(csvPath)) {
    console.error('CSV file not found at:', csvPath);
    process.exit(1);
  }

  const content = fs.readFileSync(csvPath, 'utf8');
  const lines = content.split('\n');
  const headers = lines[0].split(',');
  const data = lines.slice(1).filter(line => line.trim() !== '');

  console.log(`Found ${data.length} records in CSV.`);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Get valid user IDs
    const { rows: users } = await client.query('SELECT id FROM users');
    const validUserIds = new Set(users.map(u => u.id));

    let inserted = 0;
    let skipped = 0;

    for (const line of data) {
      // Simple CSV parse (handling potential commas in text if any, though here it looks simple)
      const parts = line.split(',');
      if (parts.length < 7) continue;

      const [id, user_id, check_in, check_out, lat, lng, date] = parts;

      if (!validUserIds.has(parseInt(user_id))) {
        console.warn(`Skipping record for missing user_id: ${user_id}`);
        skipped++;
        continue;
      }

      await client.query(
        `INSERT INTO attendance (user_id, check_in, check_out, lat, lng, date)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (user_id, date) DO UPDATE 
         SET check_in = EXCLUDED.check_in, 
             check_out = EXCLUDED.check_out, 
             lat = EXCLUDED.lat, 
             lng = EXCLUDED.lng`,
        [
          parseInt(user_id),
          check_in || null,
          check_out || null,
          lat ? parseFloat(lat) : null,
          lng ? parseFloat(lng) : null,
          date
        ]
      );
      inserted++;
    }

    await client.query('COMMIT');
    console.log(`✅ Success! Inserted/Updated ${inserted} records. Skipped ${skipped} invalid records.`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Seeding failed:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

seedAttendance();
