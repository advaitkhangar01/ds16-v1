// server/routes/dashboard.js
const router = require('express').Router();
const pool = require('../db');
const { authenticate, requireAdmin, requireAccounting } = require('../middleware/auth');
const { getISTDate, getISTTime } = require('../utils/date');
const { autoCheckoutPendingRecords } = require('./attendance');

async function calculateSalaryStats(userId, month, year, todayStr, settings) {
  const { rows: userRows } = await pool.query('SELECT base_salary, hourly_rate FROM users WHERE id = $1', [userId]);
  const user = userRows[0];
  if (!user) return null;

  const baseSalary = parseFloat(user.base_salary || 0);
  const hourlyRate = parseFloat(user.hourly_rate || 0);
  const daysInMonth = new Date(year, month, 0).getDate();
  const dailyWage = daysInMonth > 0 ? baseSalary / daysInMonth : 0;

  // Fetch attendance for this month
  const { rows: monthAtt } = await pool.query(
    `SELECT check_in, check_out, date, LOWER(status) AS status, is_late, hours_worked FROM attendance 
     WHERE user_id = $1 AND EXTRACT(MONTH FROM date) = $2 AND EXTRACT(YEAR FROM date) = $3`,
    [userId, month, year]
  );

  let earnedMonth = 0;
  let deductionsMonth = 0;
  let todayEarned = 0;
  let todayDeductions = 0;
  let lateCount = 0;
  let halfDayCount = 0;

  const officeStartTimeStr = settings.office_start_time || '09:30';
  const lateThresholdMins = parseInt(settings.late_threshold_mins || 15);
  const latePenaltyAmount = parseFloat(settings.late_penalty_amount || 0);
  const halfDayThresholdHours = parseFloat(settings.half_day_threshold_hours || 4);
  const halfDayPenaltyPercent = parseFloat(settings.half_day_penalty_percent || 50);

  monthAtt.forEach(record => {
    const isToday = getISTDate(record.date) === todayStr;
    let dayEarned = 0;
    let dayDeductions = 0;
    const statusLower = (record.status || '').toLowerCase();
    const isHalfDayRecord = statusLower === 'half_day';

    if (hourlyRate > 0) {
      const hours = parseFloat(record.hours_worked || 0);
      dayEarned = hours * hourlyRate;
    } else {
      dayEarned = dailyWage;
      if (record.check_in) {
        const checkInTimeStr = getISTTime(record.check_in);
        const [ciH, ciM] = checkInTimeStr.split(':').map(Number);
        const [startH, startM] = officeStartTimeStr.split(':').map(Number);

        const diffMins = (ciH * 60 + ciM) - (startH * 60 + startM);
        // Skip late penalty if already penalised as half_day (avoid double-counting)
        if (!isHalfDayRecord && diffMins > lateThresholdMins) {
          dayDeductions += latePenaltyAmount;
          lateCount++;
        }

        if (record.check_out) {
          // Use stored hours_worked — set by server at checkout, avoids timestamp re-derivation
          const hoursWorked = parseFloat(record.hours_worked || 0);
          if (isHalfDayRecord || hoursWorked < halfDayThresholdHours) {
            dayDeductions += (dailyWage * halfDayPenaltyPercent / 100);
            halfDayCount++;
          }
        }
      } else {
        dayEarned = 0; // Not present
      }
    }

    earnedMonth += dayEarned;
    deductionsMonth += dayDeductions;

    if (isToday) {
      todayEarned = dayEarned;
      todayDeductions = dayDeductions;
    }
  });

  return {
    earned_this_month: Math.round(earnedMonth),
    deductions_this_month: Math.round(deductionsMonth),
    today_earned: Math.round(todayEarned),
    today_deductions: Math.round(todayDeductions),
    late_count: lateCount,
    half_day_count: halfDayCount
  };
}

// Helper: get IST date string removed in favor of shared util

// GET /api/dashboard/admin
router.get('/admin', authenticate, requireAccounting, async (req, res) => {
  try {
    await autoCheckoutPendingRecords();
    const today = getISTDate();

    // 1. Attendance summary (include everyone, separating leaves from absences)
    const { rows: attendanceRows } = await pool.query(
      `SELECT
         COUNT(*) AS total_users,
         COUNT(*) FILTER (WHERE a.check_in IS NOT NULL AND a.check_out IS NULL AND a.date = $1::date) AS checked_in,
         COUNT(*) FILTER (WHERE a.check_out IS NOT NULL AND a.date = $1::date) AS checked_out,
         COUNT(*) FILTER (
           WHERE a.check_in IS NULL 
             AND NOT EXISTS (
               SELECT 1 FROM leave_requests lr 
               WHERE lr.user_id = u.id 
                 AND LOWER(lr.status) = 'approved' 
                 AND lr.type NOT IN ('advance', 'resignation')
                 AND $1::date BETWEEN lr.start_date AND lr.end_date
             )
         ) AS absent,
         COUNT(*) FILTER (
           WHERE a.check_in IS NULL 
             AND EXISTS (
               SELECT 1 FROM leave_requests lr 
               WHERE lr.user_id = u.id 
                 AND LOWER(lr.status) = 'approved' 
                 AND lr.type NOT IN ('advance', 'resignation')
                 AND $1::date BETWEEN lr.start_date AND lr.end_date
             )
         ) AS on_leave
       FROM users u
       LEFT JOIN attendance a ON a.user_id = u.id AND a.date = $1::date`,
      [today]
    );
    const attendance = attendanceRows[0];
    const userId = req.user.id;
    // Derive month/year from IST date string (not new Date() which is UTC on VPS)
    // e.g. today = '2026-06-01' → year = 2026, month = 6
    const [year, month] = today.split('-').map(Number);

    // 2. Today's tasks (grouped by project)
    const { rows: taskRows } = await pool.query(
      `SELECT 
         t.id, t.title, t.status, t.created_at,
         p.id as project_id, p.name as project_name,
         u.name as assigned_to_name, u.username as assigned_to_username,
         au.name as assigned_by_name
       FROM tasks t
       JOIN projects p ON p.id = t.project_id
       JOIN users u ON u.id = t.assigned_to
       JOIN users au ON au.id = t.created_by
       WHERE t.assigned_to IS NOT NULL
         AND DATE(t.created_at AT TIME ZONE 'Asia/Kolkata') = $1::date
         AND t.status != 'passed'
         AND (t.start_date IS NULL OR t.start_date <= CURRENT_DATE)
       ORDER BY p.name, t.created_at DESC`,
      [today]
    );

    // Group tasks by project
    const tasksByProject = {};
    taskRows.forEach((t) => {
      if (!tasksByProject[t.project_id]) {
        tasksByProject[t.project_id] = { project_id: t.project_id, project_name: t.project_name, tasks: [] };
      }
      tasksByProject[t.project_id].tasks.push(t);
    });

    // 3. Kanban - projects grouped by status and stages
    const { rows: projectRows } = await pool.query(
      `SELECT p.id, p.name, p.client_name, p.type, p.status,
         COALESCE((SELECT json_agg(ps.* ORDER BY ps.id) FROM project_stages ps WHERE ps.project_id = p.id), '[]'::json) as stages
       FROM projects p
       ORDER BY p.created_at DESC 
       LIMIT 100`
    );
    console.log(`[DEBUG] Dashboard API: Found ${projectRows.length} projects`);

    const kanban = { pending: [], design_proposal: [], sanction: [], execution: [], completed: [] };
    projectRows.forEach((p) => {
      const stages = p.stages || [];
      // Find the first stage that isn't completed
      const activeStage = stages.find(s => s.status !== 'completed');
      
      let col = 'pending';
      if (!activeStage) {
        // If all stages are completed
        col = 'completed';
      } else if (activeStage.status === 'pending') {
        // If the current stage is pending, show in Pending column
        col = 'pending';
      } else {
        // Current stage is in_progress
        const name = activeStage.stage_name;
        if (name === 'Proposal' || name === 'Design') {
          col = 'design_proposal';
        } else if (name === 'Submission') {
          col = 'sanction';
        } else if (name === 'Working' || name === 'Execution') {
          col = 'execution';
        }
      }
      
      if (kanban[col]) {
        kanban[col].push(p);
      }
    });

    // 4. Project type summary counts
    const { rows: typeCountsRows } = await pool.query(
      `SELECT 
         COUNT(*) FILTER (WHERE type IN ('Construction', 'Apartment Residential', 'Residence', 'Temple', 'Hostel', 'Shopping Complex', 'Commercial', 'Industrial', 'Layout Development')) as construction,
         COUNT(*) FILTER (WHERE type IN ('Interior', 'Residential Interior', 'Commercial Interior', 'Flat Interior', 'Banquet Hall')) as interior,
         COUNT(*) FILTER (WHERE type IN ('Liasoning')) as liaisoning,
         COUNT(*) FILTER (WHERE type IN ('Rendering', 'Terrace Floor Plan')) as rendering
       FROM projects`
    );
    const type_counts = {
      construction: parseInt(typeCountsRows[0].construction || 0),
      interior: parseInt(typeCountsRows[0].interior || 0),
      liaisoning: parseInt(typeCountsRows[0].liaisoning || 0),
      rendering: parseInt(typeCountsRows[0].rendering || 0),
    };

    // 5. Financial Summary — scoped to current open accounting period
    // Determine the current period boundary: from 1st of current month to today
    // After a monthly close, only the current month's data is shown on the dashboard
    // (Pending amounts span all-time since outstanding invoices carry forward)
    const currentPeriodStart = `${year}-${String(month).padStart(2, '0')}-01`;
    const currentPeriodEnd   = today; // IST today (yyyy-mm-dd)

    // 5a. Total Project Value (Potential) - Only for active stages: Design Proposal, Sanction, Execution
    // This is pipeline-based (all-time active projects), not period-scoped
    const { rows: incomeRows } = await pool.query(`
      WITH active_stages AS (
        SELECT DISTINCT ON (project_id) project_id, stage_name, status
        FROM project_stages
        WHERE status != 'completed'
        ORDER BY project_id, id ASC
      ),
      project_categories AS (
        SELECT p.id as project_id,
          CASE 
            WHEN a.project_id IS NULL THEN 'completed'
            WHEN a.status = 'pending' THEN 'pending'
            WHEN a.stage_name IN ('Proposal', 'Design') THEN 'design_proposal'
            WHEN a.stage_name = 'Submission' THEN 'sanction'
            WHEN a.stage_name IN ('Working', 'Execution') THEN 'execution'
            ELSE 'pending'
          END as stage_category
        FROM projects p
        LEFT JOIN active_stages a ON p.id = a.project_id
      )
      SELECT COALESCE(SUM(pda.amount), 0) as total_value 
      FROM project_document_amounts pda
      JOIN project_categories pc ON pda.project_id = pc.project_id
      WHERE pc.stage_category IN ('design_proposal', 'sanction', 'execution')
    `);
    const totalValue = parseFloat(incomeRows[0].total_value);

    // 5b. Billed/Received — scoped to the current month's invoices
    //   billed            = total invoices raised this month (non-cancelled)
    //   received          = payments collected this month
    //   all_time_received = cumulative received across ALL months (for current_amount calc)
    //   pending           = ALL outstanding unpaid invoice balances (ALL-TIME — carries forward)
    const { rows: invoiceRows } = await pool.query(`
      SELECT
        COALESCE(SUM(CASE WHEN date >= $1 AND date <= $2 THEN amount ELSE 0 END), 0)          AS billed,
        COALESCE(SUM(CASE WHEN date >= $1 AND date <= $2 THEN received_amount ELSE 0 END), 0)  AS received,
        COALESCE(SUM(received_amount), 0)                                                       AS all_time_received,
        COALESCE(SUM(CASE WHEN LOWER(status) != 'paid' THEN GREATEST(amount - received_amount, 0) ELSE 0 END), 0) AS pending
      FROM invoices
      WHERE LOWER(status) != 'cancelled'
    `, [currentPeriodStart, currentPeriodEnd]);
    const billed          = parseFloat(invoiceRows[0].billed);
    const received        = parseFloat(invoiceRows[0].received);
    const allTimeReceived = parseFloat(invoiceRows[0].all_time_received);
    const pending         = parseFloat(invoiceRows[0].pending);

    // 5c. Expenses — scoped to current period (current month only)
    const { rows: expRows } = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) as total_expense 
       FROM transactions 
       WHERE type = 'expense' AND date >= $1 AND date <= $2
         AND LOWER(category) NOT IN ('vendor_payment', 'salary', 'incentive', 'salaries', 'incentives')`,
      [currentPeriodStart, currentPeriodEnd]
    );
    const transactionExpense = parseFloat(expRows[0].total_expense);

    const { rows: payrollRows } = await pool.query(
      `SELECT COALESCE(SUM(net_paid), 0) as total_payroll 
       FROM payroll 
       WHERE status = 'paid' AND month = $1 AND year = $2`,
      [month, year]
    );
    const totalPayroll = parseFloat(payrollRows[0].total_payroll);

    const totalExpense = transactionExpense + totalPayroll;

    // 6. Admin's own salary stats
    const settingsRes = await pool.query('SELECT key, value FROM app_settings');
    const settings = settingsRes.rows.reduce((acc, row) => { acc[row.key] = row.value; return acc; }, {});
    const salaryStats = await calculateSalaryStats(userId, month, year, today, settings);

    // 7. All projects count
    const { rows: countRows } = await pool.query('SELECT COUNT(*) as count FROM projects');

    res.json({
      attendance: {
        total: parseInt(attendance.total_users),
        checked_in: parseInt(attendance.checked_in),
        checked_out: parseInt(attendance.checked_out),
        absent: parseInt(attendance.absent),
        on_leave: parseInt(attendance.on_leave || 0),
      },
      todays_tasks: Object.values(tasksByProject),
      kanban,
      type_counts,
      finances: {
        total_amount:    totalValue,
        billed_amount:   billed,
        received_amount: received,
        pending_amount:  pending,
        expense_amount:  totalExpense,
        current_amount:  Math.max(0, totalValue - allTimeReceived)  // remaining uncollected from active pipeline
      },
      salary_stats: salaryStats,
      total_projects: parseInt(countRows[0].count),
    });
  } catch (err) {
    console.error('Admin dashboard error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/dashboard/admin/finances/breakdown
router.get('/admin/finances/breakdown', authenticate, requireAccounting, async (req, res) => {
  try {
    const { type } = req.query;
    let items = [];

    const today = getISTDate();
    const [year, month] = today.split('-').map(Number);
    const currentPeriodStart = `${year}-${String(month).padStart(2, '0')}-01`;
    const currentPeriodEnd   = today;

    if (type === 'total') {
      const { rows } = await pool.query(`
        WITH active_stages AS (
          SELECT DISTINCT ON (project_id) project_id, stage_name, status
          FROM project_stages
          WHERE status != 'completed'
          ORDER BY project_id, id ASC
        ),
        project_categories AS (
          SELECT p.id as project_id,
            CASE 
              WHEN a.project_id IS NULL THEN 'completed'
              WHEN a.status = 'pending' THEN 'pending'
              WHEN a.stage_name IN ('Proposal', 'Design') THEN 'design_proposal'
              WHEN a.stage_name = 'Submission' THEN 'sanction'
              WHEN a.stage_name IN ('Working', 'Execution') THEN 'execution'
              ELSE 'pending'
            END as stage_category
          FROM projects p
          LEFT JOIN active_stages a ON p.id = a.project_id
        )
        SELECT p.id, p.name, SUM(pda.amount) as amount
        FROM projects p
        JOIN project_document_amounts pda ON p.id = pda.project_id
        JOIN project_categories pc ON p.id = pc.project_id
        WHERE pc.stage_category IN ('design_proposal', 'sanction', 'execution')
        GROUP BY p.id, p.name
        ORDER BY amount DESC
      `);
      items = rows;
    } else if (type === 'current') {
      const { rows: manualRes } = await pool.query(
        "SELECT COALESCE(SUM(amount), 0) as mi FROM transactions WHERE type = 'income'"
      );
      const manualIncome = parseFloat(manualRes[0].mi) || 0;

      const { rows } = await pool.query(
        manualIncome > 0
          ? `
            WITH active_stages AS (
              SELECT DISTINCT ON (project_id) project_id, stage_name, status
              FROM project_stages
              WHERE status != 'completed'
              ORDER BY project_id, id ASC
            ),
            project_categories AS (
              SELECT p.id as project_id,
                CASE 
                  WHEN a.project_id IS NULL THEN 'completed'
                  WHEN a.status = 'pending' THEN 'pending'
                  WHEN a.stage_name IN ('Proposal', 'Design') THEN 'design_proposal'
                  WHEN a.stage_name = 'Submission' THEN 'sanction'
                  WHEN a.stage_name IN ('Working', 'Execution') THEN 'execution'
                  ELSE 'pending'
                END as stage_category
              FROM projects p
              LEFT JOIN active_stages a ON p.id = a.project_id
            ),
            project_totals AS (
              SELECT project_id, SUM(amount) as total_val
              FROM project_document_amounts
              GROUP BY project_id
            ),
            project_received AS (
              SELECT project_id, SUM(amount) as rec_val
              FROM transactions
              WHERE type = 'income'
              GROUP BY project_id
            )
            SELECT p.id, p.name, 
              (COALESCE(pt.total_val, 0) - COALESCE(pr.rec_val, 0)) as amount
            FROM projects p
            JOIN project_categories pc ON p.id = pc.project_id
            LEFT JOIN project_totals pt ON p.id = pt.project_id
            LEFT JOIN project_received pr ON p.id = pr.project_id
            WHERE pc.stage_category IN ('design_proposal', 'sanction', 'execution')
              AND (COALESCE(pt.total_val, 0) - COALESCE(pr.rec_val, 0)) > 0
            GROUP BY p.id, p.name, pt.total_val, pr.rec_val
            ORDER BY amount DESC
          `
          : `
            WITH active_stages AS (
              SELECT DISTINCT ON (project_id) project_id, stage_name, status
              FROM project_stages
              WHERE status != 'completed'
              ORDER BY project_id, id ASC
            ),
            project_categories AS (
              SELECT p.id as project_id,
                CASE 
                  WHEN a.project_id IS NULL THEN 'completed'
                  WHEN a.status = 'pending' THEN 'pending'
                  WHEN a.stage_name IN ('Proposal', 'Design') THEN 'design_proposal'
                  WHEN a.stage_name = 'Submission' THEN 'sanction'
                  WHEN a.stage_name IN ('Working', 'Execution') THEN 'execution'
                  ELSE 'pending'
                END as stage_category
              FROM projects p
              LEFT JOIN active_stages a ON p.id = a.project_id
            ),
            project_totals AS (
              SELECT project_id, SUM(amount) as total_val
              FROM project_document_amounts
              GROUP BY project_id
            ),
            project_received AS (
              SELECT project_id, SUM(amount) as rec_val
              FROM project_payment_stages
              WHERE LOWER(status) = 'paid' AND LOWER(status) != 'cancelled'
              GROUP BY project_id
            )
            SELECT p.id, p.name, 
              (COALESCE(pt.total_val, 0) - COALESCE(pr.rec_val, 0)) as amount
            FROM projects p
            JOIN project_categories pc ON p.id = pc.project_id
            LEFT JOIN project_totals pt ON p.id = pt.project_id
            LEFT JOIN project_received pr ON p.id = pr.project_id
            WHERE pc.stage_category IN ('design_proposal', 'sanction', 'execution')
              AND (COALESCE(pt.total_val, 0) - COALESCE(pr.rec_val, 0)) > 0
            GROUP BY p.id, p.name, pt.total_val, pr.rec_val
            ORDER BY amount DESC
          `
      );
      items = rows;
    } else if (type === 'billed') {
      // Billed = non-cancelled invoices in the current period, grouped by project
      const { rows } = await pool.query(`
        SELECT p.id, p.name, SUM(i.amount) as amount
        FROM invoices i
        JOIN projects p ON p.id = i.project_id
        WHERE LOWER(i.status) != 'cancelled'
          AND i.project_id IS NOT NULL
          AND i.date >= $1 AND i.date <= $2
        GROUP BY p.id, p.name
        HAVING SUM(i.amount) > 0
        ORDER BY amount DESC
      `, [currentPeriodStart, currentPeriodEnd]);
      items = rows;
    } else if (type === 'received') {
      // Received = payments collected in the current period, grouped by project
      const { rows } = await pool.query(`
        SELECT p.id, p.name, SUM(i.received_amount) as amount
        FROM invoices i
        JOIN projects p ON p.id = i.project_id
        WHERE LOWER(i.status) != 'cancelled'
          AND i.project_id IS NOT NULL
          AND i.date >= $1 AND i.date <= $2
        GROUP BY p.id, p.name
        HAVING SUM(i.received_amount) > 0
        ORDER BY amount DESC
      `, [currentPeriodStart, currentPeriodEnd]);
      items = rows;
    } else if (type === 'pending') {
      // Pending = outstanding balance per project (invoice amount - received), for unpaid invoices
      const { rows } = await pool.query(`
        SELECT p.id, p.name,
          SUM(GREATEST(i.amount - i.received_amount, 0)) as amount
        FROM invoices i
        JOIN projects p ON p.id = i.project_id
        WHERE LOWER(i.status) NOT IN ('cancelled', 'paid')
          AND i.project_id IS NOT NULL
        GROUP BY p.id, p.name
        HAVING SUM(GREATEST(i.amount - i.received_amount, 0)) > 0
        ORDER BY amount DESC
      `);
      items = rows;
    } else if (type === 'expenses') {
      // Expenses = transactions and payroll scoped to the current month/period
      const { rows } = await pool.query(`
        SELECT * FROM (
          SELECT t.id, t.description, t.category, t.amount, t.date, p.name as project_name
          FROM transactions t
          LEFT JOIN projects p ON p.id = t.project_id
          WHERE t.type = 'expense' AND LOWER(t.category) NOT IN ('vendor_payment', 'salary', 'incentive', 'salaries', 'incentives')
            AND t.date >= $1 AND t.date <= $2
          
          UNION ALL
          
          SELECT 
            id, 
            'Monthly salary payment' as description, 
            'Salaries' as category, 
            (net_paid - incentives) as amount, 
            payment_date as date, 
            NULL as project_name
          FROM payroll 
          WHERE status = 'paid'
            AND month = $3 AND year = $4
          
          UNION ALL
          
          SELECT 
            id, 
            'Performance incentive' as description, 
            'Incentives' as category, 
            incentives as amount, 
            payment_date as date, 
            NULL as project_name
          FROM payroll 
          WHERE status = 'paid' AND incentives > 0
            AND month = $3 AND year = $4
        ) combined_expenses
        ORDER BY date DESC
      `, [currentPeriodStart, currentPeriodEnd, month, year]);
      items = rows;
    }

    res.json({ items: items.map(i => ({ ...i, amount: parseFloat(i.amount || 0) })) });
  } catch (err) {
    console.error('Financial breakdown error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});


// GET /api/dashboard/employee
router.get('/employee', authenticate, async (req, res) => {
  try {
    await autoCheckoutPendingRecords();
    const todayStr = getISTDate();
    // Extract month/year directly from IST date string to avoid UTC midnight parse issue
    const [year, month] = todayStr.split('-').map(Number);
    const userId = req.user.id;

    // 1. Today's attendance (self)
    const { rows: attRows } = await pool.query(
      `SELECT id, user_id, check_in, check_out, lat, lng, date, LOWER(status) AS status, is_late, late_minutes, 
              checkin_accuracy, checkin_distance, checkin_zone, is_boundary_checkin, checkin_verified, 
              checkout_lat, checkout_lng, checkout_accuracy, checkout_distance, checkout_zone, checkout_outside_zone, hours_worked 
       FROM attendance WHERE user_id = $1 AND date = $2::date`,
      [userId, todayStr]
    );

    // 1b. Team attendance summary (for stats, separating leaves from absences)
    const { rows: teamStatsRows } = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE a.check_in IS NOT NULL AND a.check_out IS NULL AND a.date = $1::date) AS present,
         COUNT(*) FILTER (WHERE a.check_out IS NOT NULL AND a.date = $1::date) AS checked_out,
         COUNT(*) FILTER (
           WHERE a.check_in IS NULL 
             AND NOT EXISTS (
               SELECT 1 FROM leave_requests lr 
               WHERE lr.user_id = u.id 
                 AND LOWER(lr.status) = 'approved' 
                 AND lr.type NOT IN ('advance', 'resignation')
                 AND $1::date BETWEEN lr.start_date AND lr.end_date
             )
         ) AS absent,
         COUNT(*) FILTER (
           WHERE a.check_in IS NULL 
             AND EXISTS (
               SELECT 1 FROM leave_requests lr 
               WHERE lr.user_id = u.id 
                 AND LOWER(lr.status) = 'approved' 
                 AND lr.type NOT IN ('advance', 'resignation')
                 AND $1::date BETWEEN lr.start_date AND lr.end_date
             )
         ) AS on_leave
       FROM users u
       LEFT JOIN attendance a ON a.user_id = u.id AND a.date = $1::date`,
      [todayStr]
    );
    const teamStats = teamStatsRows[0];

    // 2. My assigned tasks
    const { rows: taskRows } = await pool.query(
      `SELECT 
         t.id, t.title, t.status, t.created_at,
         p.id as project_id, p.name as project_name,
         au.name as assigned_by_name
       FROM tasks t
       JOIN projects p ON p.id = t.project_id
       JOIN users au ON au.id = t.created_by
       WHERE t.assigned_to = $1 AND t.status != 'passed'
         AND (t.start_date IS NULL OR t.start_date <= CURRENT_DATE)
       ORDER BY t.created_at DESC`,
      [userId]
    );

    // 3. My projects (assigned or commented)
    const { rows: projRows } = await pool.query(
      `SELECT p.id, p.name, p.client_name, p.type, p.location,
         COALESCE((SELECT json_agg(ps.* ORDER BY ps.id) FROM project_stages ps WHERE ps.project_id = p.id), '[]') as stages
       FROM projects p
       WHERE 
         EXISTS (SELECT 1 FROM project_assignments pa WHERE pa.project_id = p.id AND pa.user_id = $1)
         OR EXISTS (SELECT 1 FROM comments c WHERE c.project_id = p.id AND c.assigned_to = $1)
       ORDER BY p.id DESC`,
      [userId]
    );

    // 4. Project Kanban (Filtered for employee)
    const { rows: projectRows } = await pool.query(
      `SELECT p.id, p.name, p.client_name, p.type, p.status,
         COALESCE(json_agg(ps.* ORDER BY ps.id) FILTER (WHERE ps.id IS NOT NULL), '[]') as stages
       FROM projects p
       JOIN project_assignments pa ON pa.project_id = p.id
       LEFT JOIN project_stages ps ON ps.project_id = p.id
       WHERE pa.user_id = $1
       GROUP BY p.id
       ORDER BY p.created_at DESC 
       LIMIT 100`,
      [userId]
    );
    const kanban = { pending: [], design_proposal: [], sanction: [], execution: [], completed: [] };
    projectRows.forEach((p) => {
      const stages = p.stages || [];
      const activeStage = stages.find(s => s.status !== 'completed');
      let col = 'pending';
      if (!activeStage) col = 'completed';
      else if (activeStage.status === 'pending') col = 'pending';
      else {
        const name = activeStage.stage_name;
        if (name === 'Proposal' || name === 'Design') col = 'design_proposal';
        else if (name === 'Submission') col = 'sanction';
        else if (name === 'Working' || name === 'Execution') col = 'execution';
      }
      if (kanban[col]) kanban[col].push(p);
    });

    // 5. Salary stats
    const settingsRes = await pool.query('SELECT key, value FROM app_settings');
    const settings = settingsRes.rows.reduce((acc, row) => { acc[row.key] = row.value; return acc; }, {});
    const salaryStats = await calculateSalaryStats(userId, month, year, todayStr, settings);

    res.json({
      attendance: attRows[0] || {},
      team_stats: {
        present:     parseInt(teamStats.present),
        checked_out: parseInt(teamStats.checked_out),
        absent:      parseInt(teamStats.absent),
        on_leave:    parseInt(teamStats.on_leave || 0)
      },
      tasks: taskRows,
      projects: projRows,
      kanban,
      salary_stats: salaryStats
    });
  } catch (err) {
    console.error('Employee dashboard error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
