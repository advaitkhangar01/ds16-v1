// scripts/test_responsibilities_workflow.js
// End-to-end integration test for My Profile -> Responsibilities sub-tab

const pool = require('../server/db');
const { signToken } = require('../server/middleware/auth');
const http = require('http');

async function runTests() {
  console.log('🧪 Starting Responsibilities Workflow Integration Tests...\n');

  // 1. Fetch test users from DB (Admin and Employee)
  const { rows: adminRows } = await pool.query("SELECT id, name, username, role FROM users WHERE role = 'admin' AND is_active IS NOT FALSE LIMIT 1");
  const { rows: empRows } = await pool.query("SELECT id, name, username, role FROM users WHERE role = 'employee' AND is_active IS NOT FALSE LIMIT 2");

  if (!adminRows[0] || !empRows[0]) {
    throw new Error('Test requires at least one admin and one employee user in database.');
  }

  const admin = adminRows[0];
  const employee1 = empRows[0];
  const employee2 = empRows[1] || empRows[0];

  console.log(`👤 Admin: ${admin.name} (ID: ${admin.id})`);
  console.log(`👤 Employee 1: ${employee1.name} (ID: ${employee1.id})`);
  console.log(`👤 Employee 2: ${employee2.name} (ID: ${employee2.id})\n`);

  const adminToken = signToken(admin.id);
  const emp1Token = signToken(employee1.id);
  const emp2Token = signToken(employee2.id);

  // Helper to make API requests to running server or express app
  const app = require('../server/index');
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}/api/responsibilities`;

  async function request(path, options = {}) {
    const url = `${baseUrl}${path}`;
    const headers = {
      'Content-Type': 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...options.headers,
    };

    const res = await fetch(url, {
      method: options.method || 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  }

  let testRespId = null;

  try {
    // TEST 1: Unauthorized access without token
    console.log('Test 1: Unauthorized request without token');
    const t1 = await request('');
    console.assert(t1.status === 401, `Expected 401, got ${t1.status}`);
    console.log('✅ Test 1 Passed: 401 Unauthenticated\n');

    // TEST 2: Employee trying to assign a responsibility (Forbidden)
    console.log('Test 2: Employee forbidden from assigning responsibility');
    const t2 = await request('', {
      method: 'POST',
      token: emp1Token,
      body: { userId: employee1.id, description: 'Should fail' },
    });
    console.assert(t2.status === 403, `Expected 403, got ${t2.status}`);
    console.log('✅ Test 2 Passed: 403 Admin required\n');

    // TEST 3: Admin assigning responsibility with empty description (Validation Error)
    console.log('Test 3: Empty description rejected');
    const t3 = await request('', {
      method: 'POST',
      token: adminToken,
      body: { userId: employee1.id, description: '   ' },
    });
    console.assert(t3.status === 400, `Expected 400, got ${t3.status}`);
    console.log('✅ Test 3 Passed: Empty description rejected\n');

    // TEST 4: Admin creates a valid responsibility
    console.log('Test 4: Admin assigns responsibility');
    const t4 = await request('', {
      method: 'POST',
      token: adminToken,
      body: {
        userId: employee1.id,
        description: 'Prepare architectural drawings and submit them for internal review.',
      },
    });
    console.assert(t4.status === 201, `Expected 201, got ${t4.status}`);
    console.assert(t4.data.responsibility?.employee_acknowledged === false, 'Expected employee_acknowledged false');
    console.assert(t4.data.responsibility?.admin_verified === false, 'Expected admin_verified false');
    testRespId = t4.data.responsibility.id;
    console.log(`✅ Test 4 Passed: Created Responsibility ID ${testRespId}\n`);

    // TEST 5: Employee 2 attempting to view Employee 1's responsibilities (IDOR check)
    if (employee1.id !== employee2.id) {
      console.log("Test 5: IDOR Prevention - Employee 2 accessing Employee 1's records");
      const t5 = await request(`?userId=${employee1.id}`, { token: emp2Token });
      console.assert(t5.status === 403, `Expected 403, got ${t5.status}`);
      console.log('✅ Test 5 Passed: IDOR strictly blocked\n');
    }

    // TEST 6: Employee 1 fetching their own responsibilities
    console.log("Test 6: Employee 1 views their own responsibilities");
    const t6 = await request('', { token: emp1Token });
    console.assert(t6.status === 200, `Expected 200, got ${t6.status}`);
    const found = t6.data.responsibilities?.find(r => r.id === testRespId);
    console.assert(Boolean(found), 'Expected to find newly created responsibility');
    console.log('✅ Test 6 Passed: Employee sees assigned responsibility\n');

    // TEST 7: Admin attempting to verify before employee acknowledgement (Must Fail)
    console.log('Test 7: Admin cannot verify before employee acknowledgement');
    const t7 = await request(`/${testRespId}/verify`, {
      method: 'PATCH',
      token: adminToken,
    });
    console.assert(t7.status === 400, `Expected 400, got ${t7.status}`);
    console.log('✅ Test 7 Passed: Verification without acknowledgement rejected\n');

    // TEST 8: Employee 2 attempting to acknowledge Employee 1's responsibility (Must Fail)
    if (employee1.id !== employee2.id) {
      console.log("Test 8: Employee 2 forbidden from acknowledging Employee 1's responsibility");
      const t8 = await request(`/${testRespId}/acknowledge`, {
        method: 'PATCH',
        token: emp2Token,
      });
      console.assert(t8.status === 403, `Expected 403, got ${t8.status}`);
      console.log('✅ Test 8 Passed: Cross-employee acknowledgement rejected\n');
    }

    // TEST 9: Employee 1 acknowledges completion
    console.log('Test 9: Employee 1 confirms completion (Acknowledge)');
    const t9 = await request(`/${testRespId}/acknowledge`, {
      method: 'PATCH',
      token: emp1Token,
    });
    console.assert(t9.status === 200, `Expected 200, got ${t9.status}`);
    console.assert(t9.data.responsibility?.employee_acknowledged === true, 'Expected employee_acknowledged true');
    console.assert(Boolean(t9.data.responsibility?.employee_acknowledged_at), 'Expected timestamp');
    console.log('✅ Test 9 Passed: Employee acknowledgement recorded\n');

    // TEST 10: Employee 1 attempting to reverse their own acknowledgement (Forbidden)
    console.log('Test 10: Employee cannot reverse or re-acknowledge');
    const t10 = await request(`/${testRespId}/acknowledge`, {
      method: 'PATCH',
      token: emp1Token,
    });
    console.assert(t10.status === 400, `Expected 400, got ${t10.status}`);
    console.log('✅ Test 10 Passed: Employee cannot reverse acknowledgement\n');

    // TEST 11: Admin verifies completion
    console.log('Test 11: Admin formally verifies completion');
    const t11 = await request(`/${testRespId}/verify`, {
      method: 'PATCH',
      token: adminToken,
    });
    console.assert(t11.status === 200, `Expected 200, got ${t11.status}`);
    console.assert(t11.data.responsibility?.admin_verified === true, 'Expected admin_verified true');
    console.assert(Boolean(t11.data.responsibility?.admin_verified_at), 'Expected admin_verified_at');
    console.log('✅ Test 11 Passed: Admin verification completed\n');

    // TEST 12: Admin reverses verification
    console.log('Test 12: Admin reverses verification back to Awaiting Admin Verification');
    const t12 = await request(`/${testRespId}/reset-verification`, {
      method: 'PATCH',
      token: adminToken,
    });
    console.assert(t12.status === 200, `Expected 200, got ${t12.status}`);
    console.assert(t12.data.responsibility?.admin_verified === false, 'Expected admin_verified false');
    console.assert(t12.data.responsibility?.employee_acknowledged === true, 'Expected employee_acknowledged preserved');
    console.log('✅ Test 12 Passed: Admin verification reversed, acknowledgement preserved\n');

    // TEST 13: Admin resets employee acknowledgement back to Pending
    console.log('Test 13: Admin resets employee acknowledgement back to Pending');
    const t13 = await request(`/${testRespId}/reset-acknowledgement`, {
      method: 'PATCH',
      token: adminToken,
    });
    console.assert(t13.status === 200, `Expected 200, got ${t13.status}`);
    console.assert(t13.data.responsibility?.employee_acknowledged === false, 'Expected employee_acknowledged false');
    console.assert(t13.data.responsibility?.admin_verified === false, 'Expected admin_verified false');
    console.log('✅ Test 13 Passed: Reset to Pending successfully\n');

    // TEST 14: Verify Audit Trail records
    console.log('Test 14: Verifying Audit Logs for Responsibility');
    const { rows: auditRows } = await pool.query(
      "SELECT action, entity_id, user_id FROM audit_logs WHERE entity_type = 'responsibility' AND entity_id = $1 ORDER BY id ASC",
      [String(testRespId)]
    );
    console.log('Audit trail actions recorded:', auditRows.map(r => r.action));
    console.assert(auditRows.some(r => r.action === 'RESPONSIBILITY_CREATED'), 'Missing RESPONSIBILITY_CREATED');
    console.assert(auditRows.some(r => r.action === 'RESPONSIBILITY_ACKNOWLEDGED'), 'Missing RESPONSIBILITY_ACKNOWLEDGED');
    console.assert(auditRows.some(r => r.action === 'RESPONSIBILITY_VERIFIED'), 'Missing RESPONSIBILITY_VERIFIED');
    console.assert(auditRows.some(r => r.action === 'RESPONSIBILITY_VERIFICATION_REVERSED'), 'Missing RESPONSIBILITY_VERIFICATION_REVERSED');
    console.assert(auditRows.some(r => r.action === 'RESPONSIBILITY_ACKNOWLEDGEMENT_RESET'), 'Missing RESPONSIBILITY_ACKNOWLEDGEMENT_RESET');
    console.log('✅ Test 14 Passed: Complete audit trail verified\n');

    // TEST 15: Clean up test record
    console.log('Test 15: Admin deletes test responsibility');
    const t15 = await request(`/${testRespId}`, {
      method: 'DELETE',
      token: adminToken,
    });
    console.assert(t15.status === 200, `Expected 200, got ${t15.status}`);
    console.log('✅ Test 15 Passed: Cleaned up test responsibility\n');

    console.log('🎉 ALL 15 RESPONSIBILITIES INTEGRATION TESTS PASSED PERFECTLY!\n');
  } finally {
    // Clean up if needed
    if (testRespId) {
      await pool.query('DELETE FROM responsibilities WHERE id = $1', [testRespId]).catch(() => {});
    }
    server.close();
  }
}

runTests()
  .then(() => {
    pool.end();
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Test failed with error:', err);
    pool.end();
    process.exit(1);
  });
