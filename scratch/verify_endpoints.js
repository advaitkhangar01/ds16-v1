const pool = require('../server/db');
const { getISTDate } = require('../server/utils/date');
const { ATTENDANCE_STATUS, LEAVE_STATUS } = require('../server/utils/constants');

async function verify() {
  try {
    const today = getISTDate();
    console.log(`Verifying /today endpoint query for date: ${today}`);

    const todayRes = await pool.query(
      `SELECT
         u.id as user_id, u.name, u.role, u.department,
         a.check_in, a.check_out, a.lat, a.lng, a.date, a.is_late, a.late_minutes, a.hours_worked,
         a.checkin_zone, a.checkin_distance, a.checkin_accuracy,
         a.is_boundary_checkin, a.checkin_verified,
         a.checkout_zone, a.checkout_distance, a.checkout_outside_zone,
         CASE
           WHEN lr.id IS NOT NULL THEN LOWER($2)
           ELSE LOWER(COALESCE(a.status, $3))
         END AS status
       FROM users u
       LEFT JOIN attendance a ON a.user_id = u.id AND a.date = $1::date
       LEFT JOIN leave_requests lr ON lr.user_id = u.id
         AND LOWER(lr.status) = LOWER($4)
         AND $1::date BETWEEN lr.start_date AND lr.end_date
       ORDER BY a.check_in ASC NULLS LAST, u.name ASC`,
      [today, ATTENDANCE_STATUS.LEAVE, ATTENDANCE_STATUS.ABSENT, LEAVE_STATUS.APPROVED]
    );

    console.log(`- Today rows count: ${todayRes.rows.length}`);
    console.log('- Today rows sample:');
    console.log(todayRes.rows.map(r => ({ user_id: r.user_id, name: r.name, status: r.status, check_in: r.check_in })));

    console.log('\nVerifying /all (History) endpoint query with INNER JOIN:');
    const allRes = await pool.query(
      `SELECT
         u.id as user_id, u.name, u.role, u.department,
         a.check_in, a.check_out, a.lat, a.lng, a.date, a.is_late, a.late_minutes, a.hours_worked,
         a.checkin_zone, a.checkin_distance, a.checkin_accuracy,
         a.is_boundary_checkin, a.checkin_verified,
         a.checkout_zone, a.checkout_distance, a.checkout_outside_zone,
         CASE
           WHEN lr.id IS NOT NULL THEN LOWER($3)
           ELSE LOWER(COALESCE(a.status, $4))
         END AS status
       FROM users u
       JOIN attendance a ON a.user_id = u.id
       LEFT JOIN leave_requests lr ON lr.user_id = u.id
         AND LOWER(lr.status) = LOWER($5)
         AND a.date BETWEEN lr.start_date AND lr.end_date
       ORDER BY a.date DESC, a.check_in ASC NULLS LAST, u.name
       LIMIT $1 OFFSET $2`,
      [50, 0, ATTENDANCE_STATUS.LEAVE, ATTENDANCE_STATUS.ABSENT, LEAVE_STATUS.APPROVED]
    );

    console.log(`- History rows count: ${allRes.rows.length}`);
    console.log('- History rows:');
    console.log(allRes.rows.map(r => ({ user_id: r.user_id, name: r.name, date: r.date, status: r.status })));

    process.exit(0);
  } catch (err) {
    console.error('Verification query failed:', err);
    process.exit(1);
  }
}

verify();
