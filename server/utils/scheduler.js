const pool = require('../db');
const monthlyCloseRoutes = require('../routes/monthlyClose');
const { executeMonthCloseInternal } = monthlyCloseRoutes;

/**
 * Calculates the previous month and year relative to a given date.
 */
function getPreviousMonthAndYear(date) {
  let prevMonth = date.getMonth(); // 0-indexed month of the date (0 = Jan, 1 = Feb, ..., 11 = Dec)
  let prevYear = date.getFullYear();
  if (prevMonth === 0) { // If current month is January (0), previous month is December (12) of the previous year
    prevMonth = 12;
    prevYear -= 1;
  }
  return { month: prevMonth, year: prevYear };
}

/**
 * Checks if a given month/year is already closed.
 */
async function isMonthClosed(month, year) {
  try {
    const { rows } = await pool.query(
      'SELECT id FROM monthly_closing_log WHERE month = $1 AND year = $2',
      [month, year]
    );
    return rows.length > 0;
  } catch (err) {
    console.error(`[Scheduler] Error checking closed status for ${month}/${year}:`, err.message);
    return false;
  }
}

/**
 * Core function to run the monthly close check and execution.
 * Triggered by the interval every minute.
 * Only fires the close at EXACTLY midnight (00:00) on the 1st of the month (IST).
 */
async function checkAndAutoCloseMonth() {
  const now = new Date();

  // Get timezone offset from env, default to 5.5 (Indian Standard Time, UTC+05:30)
  const tzOffsetHours = parseFloat(process.env.TIMEZONE_OFFSET_HOURS || '5.5');
  const localTime = new Date(now.getTime() + (tzOffsetHours * 60 * 60 * 1000));
  
  const localDay    = localTime.getUTCDate();
  const localHour   = localTime.getUTCHours();
  const localMinute = localTime.getUTCMinutes();
  const localMonth  = localTime.getUTCMonth(); // 0-indexed (0 = Jan, 1 = Feb, ..., 5 = June)
  const localYear   = localTime.getUTCFullYear();

  // We determine the target month to close (the previous month relative to local date)
  let prevMonth = localMonth; // If localMonth is 5 (June), prevMonth is 5 (May, 1-indexed)
  let prevYear = localYear;
  if (prevMonth === 0) { // If current local month is January (0), previous month is December (12) of previous year
    prevMonth = 12;
    prevYear -= 1;
  }

  // Only trigger close if it is exactly the 1st of the month at midnight (00:00)
  const isExactMidnightOnFirst = localDay === 1 && localHour === 0 && localMinute === 0;
  if (!isExactMidnightOnFirst) {
    return; // Silent — runs every minute, no need to log every check
  }

  console.log(`[Scheduler] MIDNIGHT TRIGGER: Attempting auto-close for ${prevMonth}/${prevYear}. Local time (UTC+${tzOffsetHours}): Day=${localDay}, Hour=${localHour}, Min=${localMinute}`);

  try {
    const closed = await isMonthClosed(prevMonth, prevYear);
    if (closed) {
      console.log(`[Scheduler] Month ${prevMonth}/${prevYear} is already closed. No action needed.`);
      return;
    }

    console.log(`[Scheduler] Month ${prevMonth}/${prevYear} is NOT closed. Starting automated close...`);
    const result = await executeMonthCloseInternal(prevMonth, prevYear, null, 'Automated monthly close');
    console.log(`[Scheduler] Automated close executed successfully for ${prevMonth}/${prevYear}!`, result);
  } catch (err) {
    console.error(`[Scheduler] Automated month close for ${prevMonth}/${prevYear} failed:`, err.message);
  }
}

/**
 * Self-healing startup check: runs once after server boot.
 * Only triggers auto-close if the server restarted within the first 7 days
 * of a new month and the previous month is still not closed.
 * This recovers from overnight downtime WITHOUT closing on every restart.
 */
async function startupSelfHealingCheck() {
  const now = new Date();
  const tzOffsetHours = parseFloat(process.env.TIMEZONE_OFFSET_HOURS || '5.5');
  const localTime = new Date(now.getTime() + (tzOffsetHours * 60 * 60 * 1000));

  const localDay   = localTime.getUTCDate();
  const localMonth = localTime.getUTCMonth(); // 0-indexed
  const localYear  = localTime.getUTCFullYear();

  // Only self-heal within the first 7 days of the month (grace window for missed midnight close)
  if (localDay > 7) {
    console.log(`[Scheduler] Startup self-heal: Day ${localDay} is outside grace window (1-7). Skipping.`);
    return;
  }

  // Determine previous month to close (1-indexed)
  let prevMonth = localMonth; // localMonth is 0-indexed, so this is the correct 1-indexed previous month
  let prevYear  = localYear;
  if (prevMonth === 0) {
    prevMonth = 12;
    prevYear -= 1;
  }

  console.log(`[Scheduler] Startup self-heal: Checking if ${prevMonth}/${prevYear} needs closing (day ${localDay} of new month)...`);
  try {
    const closed = await isMonthClosed(prevMonth, prevYear);
    if (closed) {
      console.log(`[Scheduler] Startup self-heal: ${prevMonth}/${prevYear} already closed. OK.`);
      return;
    }
    console.log(`[Scheduler] Startup self-heal: ${prevMonth}/${prevYear} NOT closed! Running recovery close...`);
    const result = await executeMonthCloseInternal(prevMonth, prevYear, null, 'Automated monthly close (startup recovery)');
    console.log(`[Scheduler] Startup self-heal: Recovery close completed for ${prevMonth}/${prevYear}!`, result);
  } catch (err) {
    console.error(`[Scheduler] Startup self-heal: Recovery close for ${prevMonth}/${prevYear} failed:`, err.message);
  }
}

/**
 * Starts the monthly close background scheduler.
 */
function startMonthlyCloseScheduler() {
  console.log('[Scheduler] Initializing Monthly Close Scheduler...');
  
  // 1. Run self-healing startup check after 10s (only fires if within grace window on 1st-7th)
  setTimeout(() => {
    startupSelfHealingCheck();
  }, 10000);

  // 2. Check every minute — only acts at midnight on 1st of month (IST)
  setInterval(() => {
    checkAndAutoCloseMonth();
  }, 60 * 1000);
}

module.exports = {
  startMonthlyCloseScheduler,
  checkAndAutoCloseMonth,
  startupSelfHealingCheck
};
