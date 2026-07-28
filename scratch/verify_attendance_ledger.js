const pool = require('../server/db');

async function testQueries() {
  try {
    const today = new Date().toISOString().split('T')[0];
    console.log('Testing /api/staff/:id query with date range:', '2026-07-01', 'to', today);

    const staffRes = await pool.query(
      `WITH date_series AS (
         SELECT generate_series($2::date, $3::date, '1 day'::interval)::date AS date
       ),
       user_dates AS (
         SELECT $1::integer AS user_id, d.date
         FROM date_series d
       )
       SELECT 
         a.id,
         ud.user_id,
         ud.date,
         a.check_in,
         a.check_out,
         a.is_late,
         a.late_minutes,
         a.hours_worked,
         a.checkin_distance,
         a.checkin_zone,
         CASE
           WHEN a.check_in IS NOT NULL THEN
             CASE 
               WHEN LOWER(a.status) = 'present' THEN 
                 CASE WHEN a.check_out IS NULL THEN 'working' ELSE 'completed' END
               ELSE LOWER(a.status)
             END
           WHEN lr.id IS NOT NULL THEN 'leave'
           WHEN EXTRACT(DOW FROM ud.date) = 0 THEN 'sunday'
           WHEN h.date IS NOT NULL THEN 'holiday'
           ELSE 'absent'
         END AS status
       FROM user_dates ud
       LEFT JOIN attendance a ON a.user_id = ud.user_id AND a.date = ud.date
       LEFT JOIN leave_requests lr ON lr.user_id = ud.user_id
         AND LOWER(lr.status) = 'approved'
         AND lr.type NOT IN ('advance', 'resignation')
         AND ud.date BETWEEN lr.start_date AND lr.end_date
       LEFT JOIN holidays h ON h.date = ud.date
       ORDER BY ud.date DESC`,
      [1, '2026-07-01', today]
    );

    console.log('--- STAFF DETAIL ATTENDANCE RESULTS (First 10 rows) ---');
    console.log(staffRes.rows.slice(0, 10));

    console.log('\nVerification complete! staff query ran successfully without syntax errors.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Verification failed:', err);
    process.exit(1);
  }
}

testQueries();
