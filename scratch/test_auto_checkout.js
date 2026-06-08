const pool = require('../server/db');
const { autoCheckoutPendingRecords } = require('../server/routes/attendance');
const { getISTDate } = require('../server/utils/date');

async function runTest() {
  console.log('--- Starting Auto-Checkout Verification Test ---');

  try {
    // 1. Get a valid user ID from the database
    const { rows: users } = await pool.query('SELECT id, name FROM users ORDER BY id LIMIT 1');
    if (users.length === 0) {
      console.error('❌ No users found in the database. Please seed the database first.');
      process.exit(1);
    }
    const testUser = users[0];
    console.log(`Using test user: ${testUser.name} (ID: ${testUser.id})`);

    // 2. Define a past test date (yesterday's date in IST)
    const yesterdayDate = new Date();
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const testDate = getISTDate(yesterdayDate);
    const checkInTime = new Date(`${testDate}T10:00:00+05:30`);

    console.log(`Setting up test attendance record for Date: ${testDate}, Check-In: ${checkInTime.toISOString()}`);

    // 3. Clean up any existing record for this user and date to avoid unique constraint violations
    await pool.query('DELETE FROM attendance WHERE user_id = $1 AND date = $2::date', [testUser.id, testDate]);

    // 4. Insert a record with check_in but NO check_out
    const { rows: inserted } = await pool.query(
      `INSERT INTO attendance (user_id, date, check_in, check_out, status, hours_worked)
       VALUES ($1, $2::date, $3, NULL, 'working', 0)
       RETURNING *`,
      [testUser.id, testDate, checkInTime.toISOString()]
    );

    console.log('Inserted test record:', {
      id: inserted[0].id,
      user_id: inserted[0].user_id,
      date: getISTDate(inserted[0].date),
      check_in: inserted[0].check_in,
      check_out: inserted[0].check_out,
      status: inserted[0].status,
      hours_worked: inserted[0].hours_worked
    });

    // 5. Trigger the auto-checkout cleanup function
    console.log('Triggering autoCheckoutPendingRecords()...');
    await autoCheckoutPendingRecords();

    // 6. Verify the record was updated correctly
    const { rows: updated } = await pool.query(
      'SELECT * FROM attendance WHERE id = $1',
      [inserted[0].id]
    );

    if (updated.length === 0) {
      throw new Error('Test record disappeared from database!');
    }

    const record = updated[0];
    console.log('Updated test record after cleanup:', {
      id: record.id,
      user_id: record.user_id,
      date: getISTDate(record.date),
      check_in: record.check_in,
      check_out: record.check_out,
      status: record.status,
      hours_worked: record.hours_worked
    });

    // Fetch settings to compute expected values
    const { rows: settingsRows } = await pool.query(
      "SELECT key, value FROM app_settings WHERE key IN ('office_start_time', 'min_working_hours')"
    );
    const settings = settingsRows.reduce((acc, r) => { acc[r.key] = r.value; return acc; }, {});
    const officeStartTime = settings.office_start_time || '10:00';
    const minWorkingHours = parseFloat(settings.min_working_hours || '4');

    const [startH, startM] = officeStartTime.split(':').map(Number);
    const startMinutes = startH * 60 + startM;
    const checkoutMinutes = startMinutes + Math.round(minWorkingHours * 60);
    const checkoutH = Math.floor(checkoutMinutes / 60) % 24;
    const checkoutM = checkoutMinutes % 60;
    
    const expectedCheckOutStr = `${testDate}T${String(checkoutH).padStart(2, '0')}:${String(checkoutM).padStart(2, '0')}:00+05:30`;
    const expectedCheckOutISO = new Date(expectedCheckOutStr).toISOString();

    let expectedHoursWorked = (new Date(expectedCheckOutISO).getTime() - checkInTime.getTime()) / (1000 * 60 * 60);
    if (isNaN(expectedHoursWorked) || expectedHoursWorked < 0) {
      expectedHoursWorked = 0;
    }
    expectedHoursWorked = parseFloat(expectedHoursWorked.toFixed(2));

    let expectedStatus = 'completed';
    if (expectedHoursWorked < minWorkingHours) {
      expectedStatus = 'half_day';
    }

    const actualCheckOut = new Date(record.check_out).toISOString();

    const assertions = [
      {
        name: 'Check-out timestamp updated to office_start_time + min_working_hours',
        passed: actualCheckOut === expectedCheckOutISO,
        expected: expectedCheckOutISO,
        actual: actualCheckOut
      },
      {
        name: `Status updated to ${expectedStatus}`,
        passed: record.status === expectedStatus,
        expected: expectedStatus,
        actual: record.status
      },
      {
        name: `hours_worked set to ${expectedHoursWorked}`,
        passed: parseFloat(record.hours_worked) === expectedHoursWorked,
        expected: expectedHoursWorked,
        actual: parseFloat(record.hours_worked)
      }
    ];

    let allPassed = true;
    console.log('\n--- Test Assertions ---');
    assertions.forEach(assertion => {
      if (assertion.passed) {
        console.log(`✅ [PASS] ${assertion.name}`);
      } else {
        console.log(`❌ [FAIL] ${assertion.name}`);
        console.log(`   Expected: ${assertion.expected}`);
        console.log(`   Actual:   ${assertion.actual}`);
        allPassed = false;
      }
    });

    // 7. Clean up the database by deleting the test record
    await pool.query('DELETE FROM attendance WHERE id = $1', [record.id]);
    console.log('\nDeleted test attendance record to keep database clean.');

    if (allPassed) {
      console.log('\n🎉 ALL TESTS PASSED SUCCESSFULLY! The auto-checkout system is 100% functional.');
      process.exit(0);
    } else {
      console.error('\n❌ SOME TESTS FAILED. Please review the output above.');
      process.exit(1);
    }

  } catch (err) {
    console.error('❌ Test execution error:', err);
    process.exit(1);
  }
}

runTest();
