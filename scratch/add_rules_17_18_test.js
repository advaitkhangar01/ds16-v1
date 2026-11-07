const fs = require('fs');
const path = require('path');

const testPath = path.join(__dirname, '../server/tests/payrollMandatory.test.js');
let code = fs.readFileSync(testPath, 'utf8').replace(/\r\n/g, '\n');

const target = `    // Absent with is_late = true is REJECTED
    await expect(
      pool.query(
        \`INSERT INTO attendance (user_id, date, status, is_late, late_minutes)
         VALUES ($1, '2026-12-02', 'absent', false, 15)\`,
        [testUserId]
      )
    ).rejects.toThrow();
  });
});`;

const replacement = `    // Absent with is_late = true is REJECTED
    await expect(
      pool.query(
        \`INSERT INTO attendance (user_id, date, status, is_late, late_minutes)
         VALUES ($1, '2026-12-02', 'absent', false, 15)\`,
        [testUserId]
      )
    ).rejects.toThrow();
  });

  // Rule 17: Half-day leave request deducts strictly 0.5 days from balance (not 1.0 day)
  test('Rule 17: Half-day leave request deducts strictly 0.5 days in calculatePayrollForEmployee', async () => {
    const { rows: lrRows } = await pool.query(
      \`INSERT INTO leave_requests (user_id, start_date, end_date, type, status)
       VALUES ($1, '2026-05-15', '2026-05-15', 'half_day', 'approved')
       RETURNING id\`,
      [testUserId]
    );

    try {
      const res = await calculatePayrollForEmployee(testUserId, 5, 2026, defaultSettings, pool, '2026-05-31');
      expect(res.unpaid_leaves).toBe(0);
    } finally {
      await pool.query('DELETE FROM leave_requests WHERE id = $1', [lrRows[0].id]);
    }
  });

  // Rule 18: 31-Day month with 30 full days worked and 1 day absence pays 100% of Base Salary
  test('Rule 18: 31-day month (August) with 30 full days worked and 1 absence pays 100% of Base Salary', async () => {
    for (let day = 1; day <= 30; day++) {
      const d = new Date(2026, 7, day);
      const isSunday = (d.getDay() === 0);
      if (!isSunday) {
        const dateStr = \`2026-08-\${String(day).padStart(2, '0')}\`;
        await pool.query(
          \`INSERT INTO attendance (user_id, date, check_in, check_out, status, is_late, late_minutes, hours_worked, batch_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)\`,
          [testUserId, dateStr, \`\${dateStr}T10:00:00+05:30\`, \`\${dateStr}T18:30:00+05:30\`, 'completed', false, 0, 8.5, testBatchId]
        );
      }
    }
    const res = await calculatePayrollForEmployee(testUserId, 8, 2026, defaultSettings, pool, '2026-08-31');
    expect(res.suggested_salary).toBe(25000);
    expect(res.current_net_payable).toBe(25000);
  });
});`;

if (!code.includes(target)) {
  console.error('Target not found in payrollMandatory.test.js');
} else {
  code = code.replace(target, replacement);
  fs.writeFileSync(testPath, code, 'utf8');
  console.log('Successfully added Rules 17 and 18 to payrollMandatory.test.js');
}
