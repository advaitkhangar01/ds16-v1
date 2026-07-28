// server/scripts/recalculate-attendance.js
const pool = require('../db');
const { getISTDate, getISTTime } = require('../utils/date');
const { ATTENDANCE_STATUS } = require('../utils/constants');

function timeToMinutes(timeStr) {
  if (!timeStr) return 0;
  const parts = timeStr.split(':');
  const hours = parseInt(parts[0], 10) || 0;
  const minutes = parseInt(parts[1], 10) || 0;
  return hours * 60 + minutes;
}

async function getSettings(keys) {
  try {
    const { rows } = await pool.query(
      'SELECT key, value FROM app_settings WHERE key = ANY($1)',
      [keys]
    );
    return rows.reduce((acc, r) => { acc[r.key] = r.value; return acc; }, {});
  } catch (err) {
    return {};
  }
}

async function run() {
  const fromDate = process.argv[2] || getISTDate();
  const toDate = process.argv[3] || fromDate;
  console.log(`Recalculating attendance status from: ${fromDate} to: ${toDate}`);

  // Fetch all attendance records in date range
  const { rows: records } = await pool.query(
    `SELECT a.id, a.user_id, a.check_in, a.check_out, a.status, a.is_late, a.late_minutes, a.date,
            u.name, u.batch_id,
            b.office_start_time AS batch_start,
            b.late_threshold_time AS batch_late,
            b.half_day_cutoff_time AS batch_cutoff,
            b.min_working_hours AS batch_min_hours
     FROM attendance a
     JOIN users u ON a.user_id = u.id
     LEFT JOIN attendance_batches b ON u.batch_id = b.id
     WHERE a.date >= $1::date AND a.date <= $2::date
     ORDER BY a.date ASC, u.name ASC`,
    [fromDate, toDate]
  );

  if (records.length === 0) {
    console.log('No attendance records found for this date range.');
    process.exit(0);
  }

  const settings = await getSettings([
    'office_start_time',
    'late_threshold_time',
    'half_day_cutoff_time',
    'min_working_hours',
    'half_day_threshold_hours'
  ]);

  for (const r of records) {
    if (!r.check_in) continue;

    let officeStartTime = settings.office_start_time || '10:00';
    let lateThresholdTime = settings.late_threshold_time;
    let halfDayCutoff = settings.half_day_cutoff_time || '13:00';
    let minWorkingHours = parseFloat(settings.min_working_hours || '4');
    let halfDayThreshold = parseFloat(settings.half_day_threshold_hours || settings.min_working_hours || '4');

    if (r.batch_start) {
      officeStartTime = r.batch_start.substring(0, 5);
      lateThresholdTime = r.batch_late.substring(0, 5);
      halfDayCutoff = r.batch_cutoff.substring(0, 5);
      minWorkingHours = parseFloat(r.batch_min_hours);
    } else {
      if (!lateThresholdTime) {
        // Fallback to start + 15 mins
        const [startH, startM] = officeStartTime.split(':').map(Number);
        const mins = 15;
        const totalMins = startH * 60 + startM + mins;
        const h = Math.floor(totalMins / 60) % 24;
        const m = totalMins % 60;
        lateThresholdTime = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      }
    }

    const checkInTimeStr = getISTTime(r.check_in);
    const checkInMins = timeToMinutes(checkInTimeStr);
    const startMins = timeToMinutes(officeStartTime);
    const lateMinsThreshold = timeToMinutes(lateThresholdTime);
    const halfDayMinsCutoff = timeToMinutes(halfDayCutoff);

    let status = ATTENDANCE_STATUS.WORKING;
    let isLate = false;
    let lateMins = 0;

    if (checkInMins > halfDayMinsCutoff) {
      status = ATTENDANCE_STATUS.HALF_DAY;
      isLate = true;
    } else if (checkInMins > lateMinsThreshold) {
      isLate = true;
    }

    if (checkInMins > startMins) {
      lateMins = checkInMins - startMins;
    }

    // If checked out, evaluate working hours
    let hoursWorked = 0;
    if (r.check_out) {
      hoursWorked = (new Date(r.check_out) - new Date(r.check_in)) / (1000 * 60 * 60);
      if (isNaN(hoursWorked) || hoursWorked < 0) hoursWorked = 0;
      hoursWorked = parseFloat(hoursWorked.toFixed(2));

      if (hoursWorked < halfDayThreshold) {
        status = ATTENDANCE_STATUS.HALF_DAY;
      } else if (status === ATTENDANCE_STATUS.WORKING || status === 'present') {
        status = ATTENDANCE_STATUS.COMPLETED;
      }
    }

    const formattedDate = new Date(r.date).toISOString().split('T')[0];
    console.log(`[${formattedDate}] User: ${r.name} (${r.user_id})`);
    console.log(`  Check-In: ${checkInTimeStr} (mins: ${checkInMins})`);
    console.log(`  Check-Out: ${r.check_out ? getISTTime(r.check_out) : 'N/A'}`);
    console.log(`  Hours worked: ${hoursWorked} (min needed: ${minWorkingHours})`);
    console.log(`  Old status: ${r.status}, Old late: ${r.is_late} (${r.late_minutes}m)`);
    console.log(`  New status: ${status}, New late: ${isLate} (${lateMins}m)`);

    await pool.query(
      `UPDATE attendance SET
         status = $1,
         is_late = $2,
         late_minutes = $3,
         hours_worked = $4
       WHERE id = $5`,
      [status, isLate, lateMins, hoursWorked, r.id]
    );
  }

  console.log('Recalculation complete!');
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
