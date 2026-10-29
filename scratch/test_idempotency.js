const pool = require('../server/db');
const { recalculateAttendanceForUser } = require('../server/utils/attendanceRecalculator');

async function testIdempotencyWithData() {
  console.log('Testing Attendance Recalculator Idempotency with test records...');

  // Create a batch
  const { rows: bRows } = await pool.query(
    `INSERT INTO attendance_batches (name, office_start_time, late_threshold_time, half_day_cutoff_time, min_working_hours)
     VALUES ($1, '10:00:00', '10:15:00', '13:00:00', 9.0)
     RETURNING id`,
    [`Idempotency Batch ${Date.now()}`]
  );
  const batchId = bRows[0].id;

  // Create a user
  const { rows: uRows } = await pool.query(
    `INSERT INTO users (name, username, password_hash, role, base_salary, batch_id)
     VALUES ($1, $2, 'hash123', 'employee', 30000.00, $3)
     RETURNING id`,
    [`Idem User ${Date.now()}`, `idem_${Date.now()}`, batchId]
  );
  const userId = uRows[0].id;

  // Insert 3 records:
  // 1. On time full day
  // 2. Late full day
  // 3. Short day (half-day)
  await pool.query(
    `INSERT INTO attendance (user_id, date, check_in, check_out, status, is_late, late_minutes, hours_worked, batch_id)
     VALUES 
       ($1, '2026-10-01', '2026-10-01T10:00:00+05:30', '2026-10-01T19:00:00+05:30', 'working', false, 0, 9.0, $2),
       ($1, '2026-10-02', '2026-10-02T10:25:00+05:30', '2026-10-02T19:25:00+05:30', 'working', false, 0, 9.0, $2),
       ($1, '2026-10-03', '2026-10-03T10:25:00+05:30', '2026-10-03T15:25:00+05:30', 'working', false, 0, 5.0, $2)`,
    [userId, batchId]
  );

  // First recalculation
  const res1 = await recalculateAttendanceForUser(userId, { dbClient: pool });
  console.log('Run 1 count:', res1.recalculatedCount);

  const { rows: snap1 } = await pool.query(
    'SELECT id, date, status, is_late, late_minutes, hours_worked FROM attendance WHERE user_id = $1 ORDER BY date ASC',
    [userId]
  );

  // Second recalculation
  const res2 = await recalculateAttendanceForUser(userId, { dbClient: pool });
  console.log('Run 2 count:', res2.recalculatedCount);

  const { rows: snap2 } = await pool.query(
    'SELECT id, date, status, is_late, late_minutes, hours_worked FROM attendance WHERE user_id = $1 ORDER BY date ASC',
    [userId]
  );

  let diffCount = 0;
  for (let i = 0; i < snap1.length; i++) {
    const r1 = snap1[i];
    const r2 = snap2[i];
    if (
      r1.status !== r2.status ||
      r1.is_late !== r2.is_late ||
      r1.late_minutes !== r2.late_minutes ||
      r1.hours_worked !== r2.hours_worked
    ) {
      console.error(`Mismatch on row date ${r1.date}:`, { run1: r1, run2: r2 });
      diffCount++;
    }
  }

  // Cleanup test user and batch
  await pool.query('DELETE FROM attendance WHERE user_id = $1', [userId]);
  await pool.query('DELETE FROM users WHERE id = $1', [userId]);
  await pool.query('DELETE FROM attendance_batches WHERE id = $1', [batchId]);

  if (diffCount === 0) {
    console.log(`✅ Idempotency Verified with active data! All ${snap1.length} records are 100% identical between Run 1 and Run 2.`);
    console.log('Snapshots verified:', snap1);
  } else {
    console.error(`❌ Idempotency Failed with active data!`);
    process.exit(1);
  }
}

testIdempotencyWithData().then(() => {
  setTimeout(() => process.exit(0), 500);
}).catch(err => {
  console.error(err);
  process.exit(1);
});
