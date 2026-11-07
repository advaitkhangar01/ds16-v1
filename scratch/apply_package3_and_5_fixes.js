const fs = require('fs');
const path = require('path');

// 1. server/routes/attendance.js
let attPath = path.join(__dirname, '../server/routes/attendance.js');
let attCode = fs.readFileSync(attPath, 'utf8');

// Normalize to LF for editing
attCode = attCode.replace(/\r\n/g, '\n');

// A. Checkout update
const checkoutTarget = `    const { rows } = await pool.query(
      \`UPDATE attendance SET
         check_out = $1, status = $2,
         checkout_lat = $3, checkout_lng = $4, checkout_accuracy = $5,
         checkout_distance = $6, checkout_zone = $7, checkout_outside_zone = $8,
         hours_worked = $9
       WHERE user_id = $10 AND date = $11::date
       RETURNING *\`,
      [
        nowIso, newStatus,
        lat || null, lng || null, (parseFloat(accuracy) || null),
        checkoutDistance, checkoutZone, checkoutOutsideZone,
        hoursWorked, userId, today
      ]
    );`;

const checkoutReplacement = `    // ── Overtime calculation strictly past 19:00 IST and >= minWorkingHours ───
    let overtimeHours = 0;
    if (hoursWorked >= minWorkingHours && newStatus !== ATTENDANCE_STATUS.HALF_DAY) {
      const ci = checkIn;
      const co = now;
      const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' });
      const checkOutDateStr = formatter.format(co);
      const cutoff = new Date(\`\${checkOutDateStr}T19:00:00+05:30\`);
      const extraHoursBeyondShift = Math.floor(Math.max(0, hoursWorked - minWorkingHours));
      if (co > cutoff && extraHoursBeyondShift >= 1) {
        const startForOt = ci > cutoff ? ci : cutoff;
        const otMs = co.getTime() - startForOt.getTime();
        const completedHoursPast7PM = Math.floor(Math.max(0, otMs / (1000 * 60 * 60)));
        overtimeHours = Math.min(extraHoursBeyondShift, completedHoursPast7PM);
      }
    }

    const { rows } = await pool.query(
      \`UPDATE attendance SET
         check_out = $1, status = $2,
         checkout_lat = $3, checkout_lng = $4, checkout_accuracy = $5,
         checkout_distance = $6, checkout_zone = $7, checkout_outside_zone = $8,
         hours_worked = $9, overtime_hours = $10
       WHERE user_id = $11 AND date = $12::date
       RETURNING *\`,
      [
        nowIso, newStatus,
        lat || null, lng || null, (parseFloat(accuracy) || null),
        checkoutDistance, checkoutZone, checkoutOutsideZone,
        hoursWorked, overtimeHours, userId, today
      ]
    );`;

if (!attCode.includes(checkoutTarget)) {
  console.error('Checkout target not found in attendance.js');
} else {
  attCode = attCode.replace(checkoutTarget, checkoutReplacement);
  console.log('Successfully patched checkout in attendance.js');
}

// B. Manual update in attendance.js
const manualTarget = `    let hours_worked = 0;
    if (check_in && check_out) {
      // C4: guard against negative hours when check_out < check_in
      hours_worked = Math.max(0, (new Date(check_out) - new Date(check_in)) / (1000 * 60 * 60));
    }

    let row;
    if (existing.length > 0) {
      const { rows } = await pool.query(
        \`UPDATE attendance SET
           check_in = $1, check_out = $2, status = $3,
           is_late = $4, late_minutes = $5, hours_worked = $6
         WHERE id = $7
         RETURNING *\`,
        [check_in, check_out, statusLower, finalIsLate, finalLateMinutes, hours_worked, existing[0].id]
      );
      row = rows[0];
    } else {
      const { rows } = await pool.query(
        \`INSERT INTO attendance (user_id, date, check_in, check_out, status, is_late, late_minutes, hours_worked)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *\`,
        [user_id, date, check_in, check_out, statusLower, finalIsLate, finalLateMinutes, hours_worked]
      );
      row = rows[0];
    }`;

const manualReplacement = `    let hours_worked = 0;
    let overtime_hours = 0;
    if (check_in && check_out) {
      // C4: guard against negative hours when check_out < check_in
      hours_worked = Math.max(0, (new Date(check_out) - new Date(check_in)) / (1000 * 60 * 60));
      const minWorkingHours = 9.0;
      if (hours_worked >= minWorkingHours && statusLower !== 'half_day' && statusLower !== 'absent') {
        const ci = new Date(check_in);
        const co = new Date(check_out);
        const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' });
        const checkOutDateStr = formatter.format(co);
        const cutoff = new Date(\`\${checkOutDateStr}T19:00:00+05:30\`);
        const extraHoursBeyondShift = Math.floor(Math.max(0, hours_worked - minWorkingHours));
        if (co > cutoff && extraHoursBeyondShift >= 1) {
          const startForOt = ci > cutoff ? ci : cutoff;
          const otMs = co.getTime() - startForOt.getTime();
          const completedHoursPast7PM = Math.floor(Math.max(0, otMs / (1000 * 60 * 60)));
          overtime_hours = Math.min(extraHoursBeyondShift, completedHoursPast7PM);
        }
      }
    }

    let row;
    if (existing.length > 0) {
      const { rows } = await pool.query(
        \`UPDATE attendance SET
           check_in = $1, check_out = $2, status = $3,
           is_late = $4, late_minutes = $5, hours_worked = $6, overtime_hours = $7
         WHERE id = $8
         RETURNING *\`,
        [check_in, check_out, statusLower, finalIsLate, finalLateMinutes, hours_worked, overtime_hours, existing[0].id]
      );
      row = rows[0];
    } else {
      const { rows } = await pool.query(
        \`INSERT INTO attendance (user_id, date, check_in, check_out, status, is_late, late_minutes, hours_worked, overtime_hours)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *\`,
        [user_id, date, check_in, check_out, statusLower, finalIsLate, finalLateMinutes, hours_worked, overtime_hours]
      );
      row = rows[0];
    }`;

if (!attCode.includes(manualTarget)) {
  console.error('Manual target not found in attendance.js');
} else {
  attCode = attCode.replace(manualTarget, manualReplacement);
  console.log('Successfully patched manual mark in attendance.js');
}

fs.writeFileSync(attPath, attCode, 'utf8');

// 2. server/utils/attendanceRecalculator.js
let recalcPath = path.join(__dirname, '../server/utils/attendanceRecalculator.js');
let recalcCode = fs.readFileSync(recalcPath, 'utf8').replace(/\r\n/g, '\n');

const recalcTarget = `    if (status === ATTENDANCE_STATUS.ABSENT) {
      isLate = false;
      lateMins = 0;
    }

    await db.query(
      \`UPDATE attendance SET
         status = $1,
         is_late = $2,
         late_minutes = $3,
         hours_worked = $4
       WHERE id = $5\`,
      [status, isLate, lateMins, hoursWorked, r.id]
    );`;

const recalcReplacement = `    if (status === ATTENDANCE_STATUS.ABSENT) {
      isLate = false;
      lateMins = 0;
    }

    let overtimeHours = 0;
    if (r.check_out && hoursWorked >= recMinHours && status !== ATTENDANCE_STATUS.HALF_DAY && status !== ATTENDANCE_STATUS.ABSENT) {
      const ci = new Date(r.check_in);
      const co = new Date(r.check_out);
      const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' });
      const checkOutDateStr = formatter.format(co);
      const cutoff = new Date(\`\${checkOutDateStr}T19:00:00+05:30\`);
      const extraHoursBeyondShift = Math.floor(Math.max(0, hoursWorked - recMinHours));
      if (co > cutoff && extraHoursBeyondShift >= 1) {
        const startForOt = ci > cutoff ? ci : cutoff;
        const otMs = co.getTime() - startForOt.getTime();
        const completedHoursPast7PM = Math.floor(Math.max(0, otMs / (1000 * 60 * 60)));
        overtimeHours = Math.min(extraHoursBeyondShift, completedHoursPast7PM);
      }
    }

    await db.query(
      \`UPDATE attendance SET
         status = $1,
         is_late = $2,
         late_minutes = $3,
         hours_worked = $4,
         overtime_hours = $5
       WHERE id = $6\`,
      [status, isLate, lateMins, hoursWorked, overtimeHours, r.id]
    );`;

if (!recalcCode.includes(recalcTarget)) {
  console.error('Recalculator target not found in attendanceRecalculator.js');
} else {
  recalcCode = recalcCode.replace(recalcTarget, recalcReplacement);
  console.log('Successfully patched attendanceRecalculator.js');
}

fs.writeFileSync(recalcPath, recalcCode, 'utf8');

// 3. server/routes/accounting.js
let accPath = path.join(__dirname, '../server/routes/accounting.js');
let accCode = fs.readFileSync(accPath, 'utf8').replace(/\r\n/g, '\n');

// A. PUT /payroll/employees/:id update
const accPutTarget = `          await pool.query(
            \`UPDATE payroll 
             SET base_salary = $1, incentives = $2, deductions = $3, net_paid = $4
             WHERE user_id = $5 AND month = $6 AND year = $7\`,
            [finalBaseSalary, finalIncentives, finalDeductions, finalNetPaid, req.params.id, month, year]
          );`;

const accPutReplacement = `          const finalOvertime = parseFloat(payrollData.overtime_earnings || 0);
          const finalOvertimeHours = parseFloat(payrollData.total_overtime_hours || 0);
          await pool.query(
            \`UPDATE payroll 
             SET base_salary = $1, incentives = $2, deductions = $3, net_paid = $4, overtime_pay = $5, overtime_hours = $6
             WHERE user_id = $7 AND month = $8 AND year = $9\`,
            [finalBaseSalary, finalIncentives, finalDeductions, finalNetPaid, finalOvertime, finalOvertimeHours, req.params.id, month, year]
          );`;

if (!accCode.includes(accPutTarget)) {
  console.error('PUT target not found in accounting.js');
} else {
  accCode = accCode.replace(accPutTarget, accPutReplacement);
  console.log('Successfully patched PUT /payroll in accounting.js');
}

// B. POST /payroll upsert
const accPostTarget = `  const { user_id, base_salary, bonus, incentives, deductions, net_paid, month, year, payment_date, status, is_manual_override } = req.body;
  const isOverride = is_manual_override !== undefined ? Boolean(is_manual_override) : true;
  try {
    const { rows } = await pool.query(
      \`INSERT INTO payroll (user_id, base_salary, bonus, incentives, deductions, net_paid, month, year, payment_date, status, is_manual_override)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (user_id, month, year) 
       DO UPDATE SET 
         base_salary = EXCLUDED.base_salary,
         bonus = EXCLUDED.bonus,
         incentives = EXCLUDED.incentives,
         deductions = EXCLUDED.deductions,
         net_paid = EXCLUDED.net_paid,
         payment_date = EXCLUDED.payment_date,
         status = EXCLUDED.status,
         is_manual_override = EXCLUDED.is_manual_override
       RETURNING *\`,
      [user_id, base_salary, bonus || 0, incentives || 0, deductions || 0, net_paid, month, year, payment_date || new Date(), status || 'paid', isOverride]
    );`;

const accPostReplacement = `  const { user_id, base_salary, bonus, incentives, deductions, net_paid, overtime_pay, overtime_hours, month, year, payment_date, status, is_manual_override } = req.body;
  const isOverride = is_manual_override !== undefined ? Boolean(is_manual_override) : true;
  try {
    const { rows } = await pool.query(
      \`INSERT INTO payroll (user_id, base_salary, bonus, incentives, deductions, net_paid, overtime_pay, overtime_hours, month, year, payment_date, status, is_manual_override)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT (user_id, month, year) 
       DO UPDATE SET 
         base_salary = EXCLUDED.base_salary,
         bonus = EXCLUDED.bonus,
         incentives = EXCLUDED.incentives,
         deductions = EXCLUDED.deductions,
         net_paid = EXCLUDED.net_paid,
         overtime_pay = EXCLUDED.overtime_pay,
         overtime_hours = EXCLUDED.overtime_hours,
         payment_date = EXCLUDED.payment_date,
         status = EXCLUDED.status,
         is_manual_override = EXCLUDED.is_manual_override
       RETURNING *\`,
      [user_id, base_salary, bonus || 0, incentives || 0, deductions || 0, net_paid, overtime_pay || 0, overtime_hours || 0, month, year, payment_date || new Date(), status || 'paid', isOverride]
    );`;

if (!accCode.includes(accPostTarget)) {
  console.error('POST target not found in accounting.js');
} else {
  accCode = accCode.replace(accPostTarget, accPostReplacement);
  console.log('Successfully patched POST /payroll in accounting.js');
}

fs.writeFileSync(accPath, accCode, 'utf8');

// 4. server/routes/reports.js
let repPath = path.join(__dirname, '../server/routes/reports.js');
let repCode = fs.readFileSync(repPath, 'utf8').replace(/\r\n/g, '\n');

const repTarget = `    query += ' ORDER BY p.year DESC, p.month DESC, u.name ASC';
    const { rows } = await pool.query(query, params);

    if (rows.length === 0 && month && year) {
      const settingsRes = await pool.query('SELECT key, value FROM app_settings');
      const settings = settingsRes.rows.reduce((acc, row) => { acc[row.key] = row.value; return acc; }, {});
      const { rows: emps } = await pool.query(
        \`SELECT id, name, department, role, base_salary FROM users 
         WHERE role IN ('employee', 'admin', 'back_office', 'accounts', 'design_head', 'design', 'liasoning', 'civil_engineer', 'project_head')
           AND is_active IS NOT FALSE
           \${department ? 'AND department = $1' : ''}
         ORDER BY name\`,
        department ? [department] : []
      );
      const liveRows = await Promise.all(emps.map(async emp => {
        const pData = await calculatePayrollForEmployee(emp.id, parseInt(month), parseInt(year), settings, pool);
        const net = pData ? (pData.current_net_payable !== undefined ? pData.current_net_payable : pData.suggested_salary) : emp.base_salary;
        const deductions = pData ? (pData.total_deductions !== undefined ? pData.total_deductions : pData.deductions) : 0;
        return {
          id: \`live-\${emp.id}\`,
          user_id: emp.id,
          month: parseInt(month),
          year: parseInt(year),
          base_salary: emp.base_salary,
          bonus: 0,
          incentives: 0,
          deductions: deductions,
          net_paid: net,
          payment_date: null,
          status: 'pending',
          employee_name: emp.name,
          role: emp.role,
          department: emp.department
        };
      }));
      return res.json({ success: true, data: liveRows });
    }

    res.json({ success: true, data: rows });`;

const repReplacement = `    query += ' ORDER BY p.year DESC, p.month DESC, u.name ASC';
    const { rows } = await pool.query(query, params);

    if (month && year) {
      // In a specific month view, ensure all active staff are included (both disbursed and pending)
      const settingsRes = await pool.query('SELECT key, value FROM app_settings');
      const settings = settingsRes.rows.reduce((acc, row) => { acc[row.key] = row.value; return acc; }, {});
      const { rows: emps } = await pool.query(
        \`SELECT id, name, department, role, base_salary FROM users 
         WHERE role IN ('employee', 'admin', 'back_office', 'accounts', 'design_head', 'design', 'liasoning', 'civil_engineer', 'project_head')
           AND is_active IS NOT FALSE
           \${department ? 'AND department = $1' : ''}
         ORDER BY name\`,
        department ? [department] : []
      );

      const paidUserMap = new Map(rows.map(r => [r.user_id, r]));
      const fullRoster = await Promise.all(emps.map(async emp => {
        if (paidUserMap.has(emp.id)) {
          return paidUserMap.get(emp.id);
        }
        const pData = await calculatePayrollForEmployee(emp.id, parseInt(month), parseInt(year), settings, pool);
        const net = pData ? (pData.current_net_payable !== undefined ? pData.current_net_payable : pData.suggested_salary) : emp.base_salary;
        const deductions = pData ? (pData.total_deductions !== undefined ? pData.total_deductions : pData.deductions) : 0;
        return {
          id: \`live-\${emp.id}\`,
          user_id: emp.id,
          month: parseInt(month),
          year: parseInt(year),
          base_salary: emp.base_salary,
          bonus: 0,
          incentives: 0,
          deductions: deductions,
          net_paid: net,
          payment_date: null,
          status: 'pending',
          employee_name: emp.name,
          role: emp.role,
          department: emp.department
        };
      }));

      return res.json({ success: true, data: fullRoster });
    }

    res.json({ success: true, data: rows });`;

if (!repCode.includes(repTarget)) {
  console.error('Reports target not found in reports.js');
} else {
  repCode = repCode.replace(repTarget, repReplacement);
  console.log('Successfully patched reports.js to include full staff roster');
}

fs.writeFileSync(repPath, repCode, 'utf8');

console.log('All backend route patches applied successfully!');
