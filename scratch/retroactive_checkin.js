const pool = require('../server/db');

async function retroactiveCheckin() {
  try {
    console.log('Inserting retroactive check-in for Abhijit on May 5, 2026...');

    const userId = 1; // Abhijit Gaulkar
    const date = '2026-05-05';
    const checkIn = '2026-05-05T09:30:00+05:30';
    const checkOut = '2026-05-05T18:00:00+05:30';
    const status = 'completed';
    const isLate = false;
    const lateMinutes = 0;
    const hoursWorked = 8.5;

    const { rows } = await pool.query(
      `INSERT INTO attendance (user_id, date, check_in, check_out, status, is_late, late_minutes, hours_worked)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (user_id, date) DO UPDATE SET
         check_in = EXCLUDED.check_in,
         check_out = EXCLUDED.check_out,
         status = EXCLUDED.status,
         is_late = EXCLUDED.is_late,
         late_minutes = EXCLUDED.late_minutes,
         hours_worked = EXCLUDED.hours_worked
       RETURNING *`,
      [userId, date, checkIn, checkOut, status, isLate, lateMinutes, hoursWorked]
    );

    console.log('Successfully inserted/updated record:', rows[0]);
    process.exit(0);
  } catch (err) {
    console.error('Error inserting check-in:', err);
    process.exit(1);
  }
}

retroactiveCheckin();
