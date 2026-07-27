const pool = require('../server/db');

async function testQueries() {
  try {
    const today = new Date().toISOString().split('T')[0];
    console.log('Testing /api/attendance/today query with date:', today);

    const todayRes = await pool.query(
      `SELECT
         u.id as user_id, u.name, u.role, u.department,
         a.check_in, a.check_out, a.lat, a.lng, a.date, a.is_late, a.late_minutes, a.hours_worked,
         a.checkin_zone, a.checkin_distance, a.checkin_accuracy,
         a.is_boundary_checkin, a.checkin_verified,
         a.checkout_zone, a.checkout_distance, a.checkout_outside_zone,
         CASE
           WHEN a.check_in IS NOT NULL THEN
             CASE 
               WHEN LOWER(a.status) = 'present' THEN 
                 CASE WHEN a.check_out IS NULL THEN 'working' ELSE 'completed' END
               ELSE LOWER(a.status)
             END
           WHEN lr.id IS NOT NULL THEN 'leave'
           WHEN EXTRACT(DOW FROM $1::date) = 0 THEN 'sunday'
           WHEN h.date IS NOT NULL THEN 'holiday'
           ELSE LOWER(COALESCE(a.status, 'absent'))
         END AS status
       FROM users u
       LEFT JOIN attendance a ON a.user_id = u.id AND a.date = $1::date
       LEFT JOIN leave_requests lr ON lr.user_id = u.id
         AND LOWER(lr.status) = 'approved'
         AND lr.type NOT IN ('advance', 'resignation')
         AND $1::date BETWEEN lr.start_date AND lr.end_date
       LEFT JOIN holidays h ON h.date = $1::date
       ORDER BY a.check_in ASC NULLS LAST, u.name ASC LIMIT 5`,
      [today]
    );

    console.log('--- TODAY RESULTS (First 5 users) ---');
    console.log(todayRes.rows);

    console.log('\nTesting /api/attendance/all query for range 2026-07-01 to 2026-07-15');
    const allRes = await pool.query(
      `WITH date_series AS (
         SELECT generate_series($1::date, $2::date, '1 day'::interval)::date AS date
       ),
       target_users AS (
         SELECT id, name, role, department 
         FROM users 
         LIMIT 3 -- Check first 3 users to avoid overly large printout
       ),
       user_dates AS (
         SELECT u.id AS user_id, u.name AS employee_name, u.role, u.department, d.date
         FROM target_users u
         CROSS JOIN date_series d
       )
       SELECT 
         ud.user_id,
         ud.employee_name as name,
         ud.employee_name,
         ud.role,
         ud.department,
         ud.date,
         a.id,
         a.check_in,
         a.check_out,
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
       ORDER BY ud.date DESC, ud.employee_name ASC
       LIMIT 15`,
      ['2026-07-01', '2026-07-15']
    );

    console.log('--- ALL LEDGER RESULTS (First 15 rows) ---');
    console.log(allRes.rows);

    console.log('\nVerification complete! Both queries ran successfully without syntax errors.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Verification failed:', err);
    process.exit(1);
  }
}

testQueries();
