// server/routes/staff.js
// Staff analytical endpoints for Administrative dashboard & profiles

const router = require('express').Router();
const pool = require('../db');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { getISTDate } = require('../utils/date');
const { calculatePayrollForEmployee, calculateDayAttendanceStats, calculateHourlyRate } = require('../utils/payroll');

router.use(authenticate);
router.get('/', requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT 
        u.id, 
        u.name, 
        u.username, 
        u.role, 
        u.department, 
        u.phone, 
        u.base_salary, 
        u.hourly_rate, 
        u.created_at,
        (SELECT COUNT(*) FROM project_assignments pa WHERE pa.user_id = u.id) as active_projects_count,
        (SELECT LOWER(status) FROM attendance a WHERE a.user_id = u.id AND a.date = CURRENT_DATE LIMIT 1) as attendance_status_today,
        (SELECT check_in FROM attendance a WHERE a.user_id = u.id AND a.date = CURRENT_DATE LIMIT 1) as check_in_today
      FROM users u
      ORDER BY u.name ASC
    `);
    res.json({ staff: rows });
  } catch (err) {
    console.error('Staff GET error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/staff/:id - Get full employee analytical profile
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  
  const isSelf = req.user.id === parseInt(id);
  const isAdmin = req.user.role === 'admin';

  if (!isSelf && !isAdmin) {
    return res.status(403).json({ error: 'Access denied: You can only view your own profile.' });
  }
  try {
    // 1. Core Profile Details
    const { rows: userRows } = await pool.query(
      'SELECT id, name, username, role, department, phone, base_salary, hourly_rate, batch_id, created_at FROM users WHERE id = $1',
      [id]
    );
    if (userRows.length === 0) return res.status(404).json({ error: 'Employee not found' });
    const employee = userRows[0];

    // 2. Assigned Projects
    const { rows: projects } = await pool.query(`
      SELECT p.id, p.name, p.type, p.status, p.start_date, p.location
      FROM project_assignments pa
      JOIN projects p ON p.id = pa.project_id
      WHERE pa.user_id = $1
      ORDER BY p.created_at DESC
    `, [id]);

    // 3. Assigned Tasks
    const { rows: tasks } = await pool.query(`
      SELECT t.id, t.title, t.description, t.status, t.stage, t.project_id, p.name as project_name, t.created_at
      FROM tasks t
      JOIN projects p ON p.id = t.project_id
      WHERE t.assigned_to = $1
      ORDER BY t.created_at DESC
    `, [id]);

    // 4. Attendance History & Stats
    const { startDate, endDate } = req.query;

    let statsQuery = `
      SELECT 
        COUNT(*) FILTER (WHERE LOWER(status) = 'working' OR LOWER(status) = 'completed' OR LOWER(status) = 'present') as total_present,
        COUNT(*) FILTER (WHERE is_late = true) as total_late,
        AVG(hours_worked) FILTER (WHERE hours_worked > 0) as avg_hours
      FROM attendance
      WHERE user_id = $1
    `;
    const statsParams = [id];
    if (startDate) {
      statsParams.push(startDate);
      statsQuery += ` AND date >= $${statsParams.length}`;
    }
    if (endDate) {
      statsParams.push(endDate);
      statsQuery += ` AND date <= $${statsParams.length}`;
    }
    const { rows: attStats } = await pool.query(statsQuery, statsParams);

    // All-time stats (never filtered by date range)
    const { rows: allTimeStats } = await pool.query(
      `SELECT 
         COUNT(*) FILTER (WHERE LOWER(status) = 'working' OR LOWER(status) = 'completed' OR LOWER(status) = 'present') as all_time_checkins,
         COUNT(*) FILTER (WHERE is_late = true) as all_time_late
       FROM attendance
       WHERE user_id = $1`,
      [id]
    );

    // This-month check-in & late count (always current calendar month, IST)
    const todayISTForCheckins = getISTDate(); // YYYY-MM-DD
    const [cYearCI, cMonthCI] = todayISTForCheckins.split('-').map(Number);
    const daysInCurrentMonth = new Date(cYearCI, cMonthCI, 0).getDate();
    const thisMonthStart = `${cYearCI}-${String(cMonthCI).padStart(2, '0')}-01`;
    const thisMonthEnd   = `${cYearCI}-${String(cMonthCI).padStart(2, '0')}-${String(daysInCurrentMonth).padStart(2, '0')}`;

    const { rows: thisMonthStats } = await pool.query(
      `SELECT COUNT(*) as this_month_checkins
       FROM attendance
       WHERE user_id = $1
         AND date >= $2 AND date <= $3
         AND (LOWER(status) = 'working' OR LOWER(status) = 'completed' OR LOWER(status) = 'present')`,
      [id, thisMonthStart, thisMonthEnd]
    );

    // This-month late arrivals count
    const { rows: thisMonthLateStats } = await pool.query(
      `SELECT COUNT(*) as this_month_late
       FROM attendance
       WHERE user_id = $1
         AND date >= $2 AND date <= $3
         AND is_late = true`,
      [id, thisMonthStart, thisMonthEnd]
    );

    let attendance = [];
    if (startDate || endDate) {
      const todayStrVal = getISTDate();
      const [yearVal, monthVal] = todayStrVal.split('-').map(Number);
      const defaultStart = `${yearVal}-${String(monthVal).padStart(2, '0')}-01`;
      const defaultEnd   = todayStrVal;

      const startDateVal = startDate || defaultStart;
      const endDateVal   = endDate || defaultEnd;

      const { rows } = await pool.query(
        `WITH date_series AS (
           SELECT generate_series($2::date, $3::date, '1 day'::interval)::date AS date
         ),
         user_dates AS (
           SELECT $1::integer AS user_id, d.date
           FROM date_series d
         )
         SELECT 
           a.id,
           ud.user_id,
           ud.date,
           a.check_in,
           a.check_out,
           a.is_late,
           a.late_minutes,
           a.hours_worked,
           a.checkin_distance,
           a.checkin_zone,
           a.batch_id,
           CASE
             WHEN a.id IS NOT NULL THEN
               CASE 
                 WHEN LOWER(COALESCE(a.status, '')) = 'present' THEN 
                   CASE WHEN a.check_out IS NULL THEN 'working' ELSE 'completed' END
                 ELSE LOWER(COALESCE(a.status, 'working'))
               END
             WHEN lr.id IS NOT NULL THEN 'leave'
             WHEN EXTRACT(DOW FROM ud.date) = 0 THEN 'sunday'
             WHEN h.date IS NOT NULL THEN 'holiday'
             ELSE 'absent'
           END AS status
         FROM user_dates ud
         LEFT JOIN attendance a ON a.user_id = ud.user_id AND a.date = ud.date
         LEFT JOIN leave_requests lr ON lr.user_id = ud.user_id
           AND LOWER(lr.status) = 'approved'
           AND lr.type NOT IN ('advance', 'resignation')
           AND ud.date BETWEEN lr.start_date AND lr.end_date
         LEFT JOIN holidays h ON h.date = ud.date
         ORDER BY ud.date DESC`,
        [id, startDateVal, endDateVal]
      );
      attendance = rows;
    } else {
      // Historical Attendance Logs: Return the last 50 actual check-ins across all history
      const { rows } = await pool.query(
        `SELECT 
           a.id,
           a.user_id,
           a.date,
           a.check_in,
           a.check_out,
           a.is_late,
           a.late_minutes,
           a.hours_worked,
           a.checkin_distance,
           a.checkin_zone,
           a.batch_id,
           CASE 
             WHEN LOWER(COALESCE(a.status, '')) = 'present' THEN 
               CASE WHEN a.check_out IS NULL THEN 'working' ELSE 'completed' END
             ELSE LOWER(COALESCE(a.status, 'working'))
           END AS status
         FROM attendance a
         WHERE a.user_id = $1
         ORDER BY a.date DESC
         LIMIT 50`,
        [id]
      );
      attendance = rows;
    }

    // Fetch app settings and batches
    const settingsRes = await pool.query('SELECT key, value FROM app_settings');
    const settings = settingsRes.rows.reduce((acc, row) => { acc[row.key] = row.value; return acc; }, {});

    const { rows: allBatches } = await pool.query('SELECT * FROM attendance_batches');
    const batchMap = new Map(allBatches.map(b => [b.id, b]));

    const employeeBatch = employee.batch_id ? (batchMap.get(employee.batch_id) || {}) : {};
    const defaultBatchMinHours = parseFloat(employeeBatch.min_working_hours || settings.min_working_hours || 9.0);

    const baseSalary = parseFloat(employee.base_salary || 0);
    const hourlyRate = baseSalary > 0
      ? calculateHourlyRate(baseSalary, defaultBatchMinHours)
      : parseFloat(employee.hourly_rate || 0);

    const processedAttendance = attendance.map(att => {
      let effectiveBatch = null;
      if (att.batch_id) {
        effectiveBatch = batchMap.get(att.batch_id) || null;
      } else if (att.id) {
        // Historical record with NULL batch_id: do NOT assign employee's current batch or fabricate batch
        effectiveBatch = null;
      } else {
        // Day with no attendance record
        effectiveBatch = employeeBatch;
      }

      const officeStartTimeStr = effectiveBatch?.office_start_time
        ? effectiveBatch.office_start_time.substring(0, 5)
        : (settings.office_start_time || '10:00');
      const lateThresholdTimeStr = effectiveBatch?.late_threshold_time
        ? effectiveBatch.late_threshold_time.substring(0, 5)
        : (settings.late_threshold_time || null);
      const halfDayCutoffTimeStr = effectiveBatch?.half_day_cutoff_time
        ? effectiveBatch.half_day_cutoff_time.substring(0, 5)
        : (settings.half_day_cutoff_time || '13:00');
      const dayBatchMinHours = parseFloat(effectiveBatch?.min_working_hours || defaultBatchMinHours);

      return calculateDayAttendanceStats(att, {
        baseSalary,
        hourlyRate,
        batchMinHours: dayBatchMinHours,
        officeStartTimeStr,
        lateThresholdTimeStr,
        halfDayCutoffTimeStr,
        lateThresholdMins: parseInt(settings.late_threshold_mins || 15, 10),
      });
    });

    // 5. Leaves History
    const { rows: leaveStats } = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE status = 'approved') as approved_leaves,
        COUNT(*) FILTER (WHERE status = 'pending') as pending_leaves
      FROM leave_requests
      WHERE user_id = $1
    `, [id]);

    const { rows: leaves } = await pool.query(`
      SELECT id, start_date, end_date, type, amount, reason, status, remarks, created_at
      FROM leave_requests
      WHERE user_id = $1
      ORDER BY start_date DESC
    `, [id]);

    // 6. Payroll History
    const { rows: payroll } = await pool.query(`
      SELECT id, month, year, base_salary, bonus, incentives, deductions, net_paid, payment_date, status
      FROM payroll
      WHERE user_id = $1
      ORDER BY year DESC, month DESC
    `, [id]);

    // 7. Leave Balance Ledger History
    const { rows: leaveBalances } = await pool.query(`
      SELECT id, month, year, opening_balance, earned, leaves_taken, closing_balance, unpaid_leaves, created_at
      FROM employee_leave_balance
      WHERE user_id = $1
      ORDER BY year DESC, month DESC
    `, [id]);

    const todayStr = getISTDate();
    const [currentYear, currentMonth] = todayStr.split('-').map(Number);
    const currentMonthPayroll = await calculatePayrollForEmployee(id, currentMonth, currentYear, settings, pool);

    // All-time financial stats from payroll table & current month
    const { rows: payrollStats } = await pool.query(
      `SELECT 
         COALESCE(SUM(COALESCE(net_paid, base_salary, 0)), 0) as total_net_paid,
         COALESCE(SUM(COALESCE(deductions, 0)), 0) as total_deductions,
         COUNT(*) as payroll_count
       FROM payroll
       WHERE user_id = $1`,
      [id]
    );

    const paidPayrollEarnings = parseFloat(payrollStats[0]?.total_net_paid || 0);
    const paidPayrollDeductions = parseFloat(payrollStats[0]?.total_deductions || 0);
    const payrollCount = parseInt(payrollStats[0]?.payroll_count || 0, 10);
    const currentMonthSuggested = currentMonthPayroll ? parseFloat(currentMonthPayroll.suggested_salary || 0) : 0;
    const currentMonthDeductions = currentMonthPayroll ? parseFloat(currentMonthPayroll.deductions || 0) : 0;

    let allTimeEarnings = 0;
    let allTimeDeductions = 0;

    if (payrollCount > 0) {
      const currentMonthInPayroll = payroll.some(p => p.month === currentMonth && p.year === currentYear);
      allTimeEarnings = currentMonthInPayroll
        ? paidPayrollEarnings
        : (paidPayrollEarnings + currentMonthSuggested);
      allTimeDeductions = currentMonthInPayroll
        ? paidPayrollDeductions
        : (paidPayrollDeductions + currentMonthDeductions);
    } else {
      // Fallback: If payroll table has no closed records for this user, compute historical attendance earnings prior to current month
      const { rows: histAttRows } = await pool.query(
        `SELECT 
           COALESCE(SUM(
             CASE 
               WHEN LOWER(a.status) IN ('present', 'completed', 'working') THEN 
                 COALESCE(NULLIF(u.base_salary, 0) / 30, (a.hours_worked * u.hourly_rate), 0)
               WHEN LOWER(a.status) = 'half_day' THEN 
                 COALESCE((NULLIF(u.base_salary, 0) / 30) * 0.5, (a.hours_worked * u.hourly_rate), 0)
               ELSE 0 
             END
           ), 0) as hist_earnings,
           COALESCE(SUM(
             CASE 
               WHEN LOWER(a.status) = 'half_day' THEN 
                 COALESCE((NULLIF(u.base_salary, 0) / 30) * 0.5, 0)
               WHEN LOWER(a.status) = 'absent' THEN 
                 COALESCE(NULLIF(u.base_salary, 0) / 30, 0)
               ELSE 0 
             END
           ), 0) as hist_deductions
         FROM attendance a
         JOIN users u ON u.id = a.user_id
         WHERE a.user_id = $1
           AND a.date < DATE_TRUNC('month', CURRENT_DATE)`,
        [id]
      );

      const histEarnings = parseFloat(histAttRows[0]?.hist_earnings || 0);
      const histDeductions = parseFloat(histAttRows[0]?.hist_deductions || 0);

      allTimeEarnings = histEarnings + currentMonthSuggested;
      allTimeDeductions = histDeductions + currentMonthDeductions;
    }

    res.json({
      employee,
      projects,
      tasks,
      attendanceStats: {
        total_present: parseInt(attStats[0]?.total_present || 0),
        total_late: req.query.startDate || req.query.endDate ? parseInt(attStats[0]?.total_late || 0) : parseInt(thisMonthLateStats[0]?.this_month_late || 0),
        period_late: parseInt(attStats[0]?.total_late || 0),
        all_time_late: parseInt(allTimeStats[0]?.all_time_late || 0),
        avg_hours: parseFloat(attStats[0]?.avg_hours || 0).toFixed(1),
        all_time_checkins: parseInt(allTimeStats[0]?.all_time_checkins || 0),
        this_month_checkins: parseInt(thisMonthStats[0]?.this_month_checkins || 0),
        this_month_late: parseInt(thisMonthLateStats[0]?.this_month_late || 0)
      },
      financialStats: {
        total_earnings: Math.round(allTimeEarnings),
        total_deductions: Math.round(allTimeDeductions),
        this_month_earnings: Math.round(currentMonthSuggested),
        this_month_deductions: Math.round(currentMonthDeductions)
      },
      attendance: processedAttendance,
      leaveStats: {
        approved_leaves: parseInt(leaveStats[0]?.approved_leaves || 0),
        pending_leaves: parseInt(leaveStats[0]?.pending_leaves || 0)
      },
      leaves,
      leaveBalances,
      payroll,
      currentMonthPayroll
    });
  } catch (err) {
    console.error('Staff Details GET error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
