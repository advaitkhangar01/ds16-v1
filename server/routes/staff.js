// server/routes/staff.js
// Staff analytical endpoints for Administrative dashboard & profiles

const router = require('express').Router();
const pool = require('../db');
const { authenticate } = require('../middleware/auth');

// Access Control: Admin or Accounts role/department
function requireAdminOrAccounts(req, res, next) {
  const isAccounts = req.user.role === 'back_office' || req.user.role === 'accounts' || req.user.department?.toLowerCase() === 'accounts';
  if (req.user.role !== 'admin' && !isAccounts) {
    return res.status(403).json({ error: 'Access denied: Administrative privileges required' });
  }
  next();
}

router.use(authenticate);

// GET /api/staff - Get all staff with quick telemetry stats
router.get('/', requireAdminOrAccounts, async (req, res) => {
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
  const isAccounts = req.user.role === 'back_office' || req.user.role === 'accounts' || req.user.department?.toLowerCase() === 'accounts';
  const isAdmin = req.user.role === 'admin';

  if (!isSelf && !isAdmin && !isAccounts) {
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
    const { rows: attStats } = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE LOWER(status) = 'working' OR LOWER(status) = 'completed' OR LOWER(status) = 'present') as total_present,
        COUNT(*) FILTER (WHERE is_late = true) as total_late,
        AVG(hours_worked) FILTER (WHERE hours_worked > 0) as avg_hours
      FROM attendance
      WHERE user_id = $1
    `, [id]);

    const { rows: attendance } = await pool.query(`
      SELECT id, date, check_in, check_out, LOWER(status) AS status, is_late, late_minutes, hours_worked, checkin_distance, checkin_zone
      FROM attendance
      WHERE user_id = $1
      ORDER BY date DESC
      LIMIT 50
    `, [id]);

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

    res.json({
      employee,
      projects,
      tasks,
      attendanceStats: {
        total_present: parseInt(attStats[0]?.total_present || 0),
        total_late: parseInt(attStats[0]?.total_late || 0),
        avg_hours: parseFloat(attStats[0]?.avg_hours || 0).toFixed(1)
      },
      attendance: processedAttendance,
      leaveStats: {
        approved_leaves: parseInt(leaveStats[0]?.approved_leaves || 0),
        pending_leaves: parseInt(leaveStats[0]?.pending_leaves || 0)
      },
      leaves,
      payroll
    });
  } catch (err) {
    console.error('Staff Details GET error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
