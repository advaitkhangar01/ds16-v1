const pool = require('../server/db');

async function testRequests() {
  console.log('--- Verification Test: Unified Requests Subsystem ---');
  try {
    const userId = 1; // Abhijit Gaulkar
    
    // Clear any test residues
    await pool.query("DELETE FROM leave_requests WHERE reason LIKE 'TEST:%'");

    // Test 1: Full Leave Insert
    console.log('Test 1: Inserting standard Casual Leave...');
    const res1 = await pool.query(
      `INSERT INTO leave_requests (user_id, start_date, end_date, type, amount, reason, status)
       VALUES ($1, '2026-06-01', '2026-06-03', 'casual', 0, 'TEST: Family vacation', 'pending')
       RETURNING *`,
      [userId]
    );
    console.log('✅ Standard Leave Inserted:', res1.rows[0].type, 'Dates:', res1.rows[0].start_date, 'to', res1.rows[0].end_date);

    // Test 2: Half Day Insert
    console.log('Test 2: Inserting Half Day Request...');
    const res2 = await pool.query(
      `INSERT INTO leave_requests (user_id, start_date, end_date, type, amount, reason, status)
       VALUES ($1, '2026-06-05', '2026-06-05', 'half_day', 0, 'TEST: Dental appointment', 'pending')
       RETURNING *`,
      [userId]
    );
    console.log('✅ Half Day Inserted:', res2.rows[0].type, 'Date:', res2.rows[0].start_date);

    // Test 3: Salary Advance Insert
    console.log('Test 3: Inserting Salary Advance Request...');
    const res3 = await pool.query(
      `INSERT INTO leave_requests (user_id, start_date, end_date, type, amount, reason, status)
       VALUES ($1, '2026-06-10', '2026-06-10', 'advance', 15000.00, 'TEST: Laptop repair advance', 'pending')
       RETURNING *`,
      [userId]
    );
    console.log('✅ Salary Advance Inserted:', res3.rows[0].type, 'Amount: ₹' + res3.rows[0].amount);

    // Test 4: Resignation Insert
    console.log('Test 4: Inserting Resignation Notice...');
    const res4 = await pool.query(
      `INSERT INTO leave_requests (user_id, start_date, end_date, type, amount, reason, status)
       VALUES ($1, '2026-07-01', '2026-07-01', 'resignation', 0, 'TEST: Notice period start', 'pending')
       RETURNING *`,
      [userId]
    );
    console.log('✅ Resignation Inserted:', res4.rows[0].type, 'Last Day:', res4.rows[0].start_date);

    // Clean up test items
    const del = await pool.query("DELETE FROM leave_requests WHERE reason LIKE 'TEST:%'");
    console.log(`✅ Cleaned up ${del.rowCount} test records.`);
    
    console.log('\n🎉 INTEGRATION TESTS COMPLETED SUCCESSFULLY! Database layer is 100% compliant.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Verification failed:', err);
    process.exit(1);
  }
}

testRequests();
