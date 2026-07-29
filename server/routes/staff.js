// server/routes/staff.js
// Staff analytical endpoints for Administrative dashboard & profiles

const router = require('express').Router();
const pool = require('../db');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { getISTDate } = require('../utils/date');
const { calculatePayrollForEmployee } = require('../utils/payroll');

router.use(authenticate);

// GET /api/staff - Get all staff with quick telemetry stats
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
      'SELECT id, name, username, role, department, phone, base_salary, hourly_rate, created_at FROM users WHERE id = $1',
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

    // All-time check-in count (never filtered by date range)
    const { rows: allTimeStats } = await pool.query(
      `SELECT COUNT(*) as all_time_checkins
       FROM attendance
       WHERE user_id = $1
         AND (LOWER(status) = 'working' OR LOWER(status) = 'completed' OR LOWER(status) = 'present')`,
      [id]
    );

    // This-month check-in count (always current calendar month, IST)
    const todayISTForCheckins = getISTDate(); // YYYY-MM-DD
    const [cYearCI, cMonthCI] = todayISTForCheckins.split('-').map(Number);
    const thisMonthStart = `${cYearCI}-${String(cMonthCI).padStart(2, '0')}-01`;
    const thisMonthEnd   = todayISTForCheckins;
    const { rows: thisMonthStats } = await pool.query(
      `SELECT COUNT(*) as this_month_checkins
       FROM attendance
       WHERE user_id = $1
         AND date >= $2 AND date <= $3
         AND (LOWER(status) = 'working' OR LOWER(status) = 'completed' OR LOWER(status) = 'present')`,
      [id, thisMonthStart, thisMonthEnd]
    );

    // This-month late arrivals count (always current calendar month, IST)
    const { rows: thisMonthLateStats } = await pool.query(
      `SELECT COUNT(*) as this_month_late
       FROM attendance
       WHERE user_id = $1
         AND date >= $2 AND date <= $3
         AND is_late = true`,
      [id, thisMonthStart, thisMonthEnd]
    );

    const todayStrVal = getISTDate();
    const [yearVal, monthVal] = todayStrVal.split('-').map(Number);
    const defaultStart = `${yearVal}-${String(monthVal).padStart(2, '0')}-01`;
    const defaultEnd   = todayStrVal;

    const startDateVal = startDate || defaultStart;
    const endDateVal   = endDate || defaultEnd;

    const { rows: attendance } = await pool.query(
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

    // Fetch app settings to calculate penalty deductions
    const settingsRes = await pool.query('SELECT key, value FROM app_settings');
    const settings = settingsRes.rows.reduce((acc, row) => { acc[row.key] = row.value; return acc; }, {});

    const baseSalary = parseFloat(employee.base_salary || 0);
    const hourlyRate = parseFloat(employee.hourly_rate || 0);
    const latePenaltyAmount = parseFloat(settings.late_penalty_amount || 0);
    const halfDayPenaltyPercent = parseFloat(settings.half_day_penalty_percent || 50);

    const processedAttendance = attendance.map(att => {
      let deduction = 0;
      let earnings = 0;
      let overtimeHours = 0;
      let regularHours = parseFloat(att.hours_worked || 0);

      if (att.check_in && att.check_out) {
        const ci = new Date(att.check_in);
        const co = new Date(att.check_out);
        
        // Get date string of check-out in IST (YYYY-MM-DD)
        const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' });
        const dateStr = formatter.format(co);
        
        // Cutoff threshold is 7:00 PM (19:00) IST on the date of check-out
        const cutoff = new Date(`${dateStr}T19:00:00+05:30`);
        
        if (co > cutoff) {
          const startForOt = ci > cutoff ? ci : cutoff;
          const otMs = co - startForOt;
          overtimeHours = otMs / (1000 * 60 * 60);
          regularHours = Math.max(0, regularHours - overtimeHours);
        }
      }

      const recordDate = new Date(att.date);
      const recordMonth = recordDate.getMonth() + 1;
      const recordYear = recordDate.getFullYear();
      const daysInMonth = new Date(recordYear, recordMonth, 0).getDate();
      const dailyWage = daysInMonth > 0 ? baseSalary / daysInMonth : 0;

      if (hourlyRate > 0) {
        // Hourly rate employees only earn from regular hours (excluding overtime)
        earnings = regularHours * hourlyRate;
        deduction = 0;
      } else {
        const statusLower = (att.status || '').toLowerCase();
        if (statusLower === 'absent') {
          earnings = 0;
          deduction = dailyWage;
        } else if (statusLower === 'half_day') {
          earnings = dailyWage;
          deduction = dailyWage * (halfDayPenaltyPercent / 100);
        } else if (statusLower === 'leave' || statusLower === 'sunday' || statusLower === 'holiday') {
          earnings = dailyWage;
          deduction = 0;
        } else {
          earnings = dailyWage;
          if (att.is_late) {
            deduction = latePenaltyAmount;
          }
        }
      }

      return {
        ...att,
        regular_hours: Math.round(regularHours * 100) / 100,
        overtime_hours: Math.round(overtimeHours * 100) / 100,
        earnings: Math.round(earnings * 100) / 100,
        deduction: Math.round(deduction * 100) / 100
      };
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

    res.json({
      employee,
      projects,
      tasks,
      attendanceStats: {
        total_present: parseInt(attStats[0]?.total_present || 0),
        total_late: parseInt(attStats[0]?.total_late || 0),
        avg_hours: parseFloat(attStats[0]?.avg_hours || 0).toFixed(1),
        all_time_checkins: parseInt(allTimeStats[0]?.all_time_checkins || 0),
        this_month_checkins: parseInt(thisMonthStats[0]?.this_month_checkins || 0),
        this_month_late: parseInt(thisMonthLateStats[0]?.this_month_late || 0)
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
