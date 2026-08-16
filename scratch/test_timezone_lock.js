// Test how timezone affects checkPeriodLock middleware logic
function simulatePeriodLockCheck(dateStr, timezoneOffsetMinutes) {
  // We simulate system timezone by shifting the Date object
  // In node, new Date(dateStr) parses as UTC midnight if YYYY-MM-DD
  const parsedUtc = new Date(dateStr);
  
  // To simulate a server in a timezone with timezoneOffsetMinutes:
  // e.g. EST is UTC-5 hours (-300 minutes)
  // The local time components are based on UTC time minus offset
  const localTimeMs = parsedUtc.getTime() - (timezoneOffsetMinutes * 60 * 1000);
  const localDate = new Date(localTimeMs);
  
  // In the real environment, d.getMonth() and d.getFullYear() return local components
  // so we simulate that here by using the localDate's UTC components since we offsetted it
  const month = localDate.getUTCMonth() + 1;
  const year = localDate.getUTCFullYear();
  
  return {
    inputDate: dateStr,
    parsedUtc: parsedUtc.toISOString(),
    inferredMonth: month,
    inferredYear: year,
    mismatch: month !== parseInt(dateStr.split('-')[1])
  };
}

console.log('--- Timezone Parse Simulation (Server in EST / UTC-5) ---');
for (let day = 1; day <= 3; day++) {
  const dateStr = `2026-06-0${day}`;
  const result = simulatePeriodLockCheck(dateStr, 300); // 300 mins offset = UTC-5
  console.log(`Input: ${result.inputDate} => Inferred Month: ${result.inferredMonth}, Year: ${result.inferredYear} (Mismatch: ${result.mismatch})`);
}

console.log('\n--- Timezone Parse Simulation (Server in UTC) ---');
for (let day = 1; day <= 3; day++) {
  const dateStr = `2026-06-0${day}`;
  const result = simulatePeriodLockCheck(dateStr, 0); // 0 mins offset = UTC
  console.log(`Input: ${result.inputDate} => Inferred Month: ${result.inferredMonth}, Year: ${result.inferredYear} (Mismatch: ${result.mismatch})`);
}

console.log('\n--- Timezone Parse Simulation (Server in IST / UTC+5.5) ---');
for (let day = 1; day <= 3; day++) {
  const dateStr = `2026-06-0${day}`;
  const result = simulatePeriodLockCheck(dateStr, -330); // -330 mins offset = UTC+5.5
  console.log(`Input: ${result.inputDate} => Inferred Month: ${result.inferredMonth}, Year: ${result.inferredYear} (Mismatch: ${result.mismatch})`);
}
