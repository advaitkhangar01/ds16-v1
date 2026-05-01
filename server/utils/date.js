// server/utils/date.js

function getISTDate() {
  const now = new Date();
  // Using Intl format to get YYYY-MM-DD in Asia/Kolkata
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(now);
}

module.exports = { getISTDate };
