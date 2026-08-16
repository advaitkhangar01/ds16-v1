function getKolkataMonthAndYear(dateInput) {
  if (!dateInput) return null;
  
  let d;
  // Match exact YYYY-MM-DD format (no time part)
  if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
    const parts = dateInput.split('-');
    return {
      month: parseInt(parts[1], 10),
      year: parseInt(parts[0], 10),
      method: 'string-split-exact'
    };
  } else {
    d = new Date(dateInput);
  }
  
  if (isNaN(d.getTime())) return null;
  
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: 'numeric'
  });
  
  const parts = formatter.formatToParts(d);
  let month = null;
  let year = null;
  for (const part of parts) {
    if (part.type === 'month') month = parseInt(part.value, 10);
    if (part.type === 'year') year = parseInt(part.value, 10);
  }
  
  return {
    month,
    year,
    method: 'intl-formatter'
  };
}

const testCases = [
  '2026-06-01', // Exact YYYY-MM-DD
  '2026-05-31T23:59:00.000Z', // UTC with time (should map to June 1 in IST)
  '2026-06-01T00:00:00.000Z', // UTC with time
  new Date('2026-06-01T18:30:00.000Z'), // Date object
];

console.log('--- Timezone-Safe Month & Year Extraction in Asia/Kolkata ---');
for (const tc of testCases) {
  const result = getKolkataMonthAndYear(tc);
  console.log(`Input: ${tc} => Inferred Month: ${result.month}, Year: ${result.year} (Method: ${result.method})`);
}
