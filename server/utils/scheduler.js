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
 * Checks if the previous month is already closed.
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
 * If the current day is the 1st of the month (or later) and the previous month is NOT closed yet,
 * it executes the close transaction automatically.
 */
async function checkAndAutoCloseMonth() {
  const now = new Date();
  
  // We determine the target month to close (the previous month)
  const { month, year } = getPreviousMonthAndYear(now);

  console.log(`[Scheduler] Running check for month close of ${month}/${year}. Current time: ${now.toLocaleString()}`);

  try {
    const closed = await isMonthClosed(month, year);
    if (closed) {
      console.log(`[Scheduler] Month ${month}/${year} is already closed. No action needed.`);
      return;
    }

    // Self-healing check: trigger close if it's the 1st of the month or later
    // If it's the 1st (or later) and not yet closed, we trigger the close.
    // This handles the server being restarted or started after 12:00 AM on the 1st.
    const isFirstOfMonthOrLater = now.getDate() >= 1;
    
    if (isFirstOfMonthOrLater) {
      console.log(`[Scheduler] Previous month ${month}/${year} is NOT closed. Starting automated close...`);
      const result = await executeMonthCloseInternal(month, year, null, 'Automated monthly close');
      console.log(`[Scheduler] Automated close executed successfully for ${month}/${year}!`, result);
    }
  } catch (err) {
    console.error(`[Scheduler] Automated month close for ${month}/${year} failed:`, err.message);
  }
}

/**
 * Starts the monthly close background scheduler.
 */
function startMonthlyCloseScheduler() {
  console.log('[Scheduler] Initializing Monthly Close Scheduler...');
  
  // 1. Run check immediately on startup (with a small 10s delay to let DB connect first)
  setTimeout(() => {
    checkAndAutoCloseMonth();
  }, 10000);

  // 2. Set interval to check periodically (every 1 hour)
  setInterval(() => {
    checkAndAutoCloseMonth();
  }, 60 * 60 * 1000); 
}

module.exports = {
  startMonthlyCloseScheduler,
  checkAndAutoCloseMonth
};
