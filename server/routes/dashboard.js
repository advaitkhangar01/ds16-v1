// server/routes/dashboard.js
const router = require('express').Router();
const pool = require('../db');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { getISTDate } = require('../utils/date');

// Helper: get IST date string removed in favor of shared util

// GET /api/dashboard/admin
router.get('/admin', authenticate, requireAdmin, async (req, res) => {
  try {
    const today = getISTDate();

    // 1. Attendance summary (include everyone)
    const { rows: attendanceRows } = await pool.query(
      `SELECT
         COUNT(*) AS total_users,
         COUNT(*) FILTER (WHERE a.check_in IS NOT NULL AND a.check_out IS NULL AND a.date = $1::date) AS checked_in,
         COUNT(*) FILTER (WHERE a.check_out IS NOT NULL AND a.date = $1::date) AS checked_out,
         COUNT(*) FILTER (WHERE a.id IS NULL OR a.date != $1::date) AS absent
       FROM users u
       LEFT JOIN attendance a ON a.user_id = u.id AND a.date = $1::date`,
      [today]
    );
    const attendance = attendanceRows[0];

    // ... (rest of the query logic remains same, but we reuse variables below)
    
// ... (skipping some unchanged lines for brevity in replacement, but I must provide full target content)
// Wait, I should replace exactly what I target.

    // 2. Today's tasks (comments with assigned_to, grouped by project)
    const { rows: taskRows } = await pool.query(
      `SELECT 
         c.id, c.message, c.task_status, c.created_at,
         p.id as project_id, p.name as project_name,
         u.name as assigned_to_name, u.username as assigned_to_username,
         au.name as assigned_by_name
       FROM comments c
       JOIN projects p ON p.id = c.project_id
       JOIN users u ON u.id = c.assigned_to
       JOIN users au ON au.id = c.user_id
       WHERE c.assigned_to IS NOT NULL
         AND DATE(c.created_at AT TIME ZONE 'Asia/Kolkata') = $1::date
       ORDER BY p.name, c.created_at DESC`,
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
         COALESCE(json_agg(ps.* ORDER BY ps.id) FILTER (WHERE ps.id IS NOT NULL), '[]') as stages
       FROM projects p
       LEFT JOIN project_stages ps ON ps.project_id = p.id
       GROUP BY p.id
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

    // 5. All projects count
    const { rows: countRows } = await pool.query('SELECT COUNT(*) FROM projects');

    res.json({
      attendance: {
        total: parseInt(attendance.total_users),
        checked_in: parseInt(attendance.checked_in),
        checked_out: parseInt(attendance.checked_out),
        absent: parseInt(attendance.absent),
      },
      todays_tasks: Object.values(tasksByProject),
      kanban,
      type_counts,
      total_projects: parseInt(countRows[0].count),
    });
  } catch (err) {
    console.error('Admin dashboard error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/dashboard/employee
router.get('/employee', authenticate, async (req, res) => {
  try {
    const todayStr = getISTDate();
    const today = new Date(todayStr);
    const userId = req.user.id;
    const month = today.getMonth() + 1;
    const year = today.getFullYear();

    // 1. Today's attendance (self)
    const { rows: attRows } = await pool.query(
      'SELECT * FROM attendance WHERE user_id = $1 AND date = $2::date',
      [userId, todayStr]
    );

    // 1b. Team attendance summary (for stats)
    const { rows: teamStatsRows } = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE a.check_in IS NOT NULL AND a.date = $1::date) AS present,
         COUNT(*) FILTER (WHERE a.id IS NULL OR a.date != $1::date) AS absent
       FROM users u
       LEFT JOIN attendance a ON a.user_id = u.id AND a.date = $1::date`,
      [todayStr]
    );
    const teamStats = teamStatsRows[0];

    // 2. My assigned tasks
    const { rows: taskRows } = await pool.query(
      `SELECT 
         c.id, c.message, c.task_status, c.created_at,
         p.id as project_id, p.name as project_name,
         au.name as assigned_by_name
       FROM comments c
       JOIN projects p ON p.id = c.project_id
       JOIN users au ON au.id = c.user_id
       WHERE c.assigned_to = $1
       ORDER BY c.created_at DESC`,
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

    // 4. Project Kanban (Same as admin)
    const { rows: projectRows } = await pool.query(
      `SELECT p.id, p.name, p.client_name, p.type, p.status,
         COALESCE(json_agg(ps.* ORDER BY ps.id) FILTER (WHERE ps.id IS NOT NULL), '[]') as stages
       FROM projects p
       LEFT JOIN project_stages ps ON ps.project_id = p.id
       GROUP BY p.id
       ORDER BY p.created_at DESC 
       LIMIT 100`
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

    // 5. Salary stats for current month
    // Fetch settings
    const settingsRes = await pool.query('SELECT key, value FROM app_settings');
    const settings = settingsRes.rows.reduce((acc, row) => { acc[row.key] = row.value; return acc; }, {});
    
    // Fetch employee data
    const { rows: userRows } = await pool.query('SELECT base_salary FROM users WHERE id = $1', [userId]);
    const baseSalary = parseFloat(userRows[0]?.base_salary || 0);
    const daysInMonth = new Date(year, month, 0).getDate();
    const dailyWage = daysInMonth > 0 ? baseSalary / daysInMonth : 0;

    // Fetch attendance for this month
    const { rows: monthAtt } = await pool.query(
      `SELECT check_in, check_out, date FROM attendance 
       WHERE user_id = $1 AND EXTRACT(MONTH FROM date) = $2 AND EXTRACT(YEAR FROM date) = $3`,
      [userId, month, year]
    );

    let earnedMonth = 0;
    let deductionsMonth = 0;
    let todayEarned = 0;
    let todayDeductions = 0;

    const officeStartTimeStr = settings.office_start_time || '09:30';
    const lateThresholdMins = parseInt(settings.late_threshold_mins || 15);
    const latePenaltyAmount = parseFloat(settings.late_penalty_amount || 0);
    const halfDayThresholdHours = parseFloat(settings.half_day_threshold_hours || 4);
    const halfDayPenaltyPercent = parseFloat(settings.half_day_penalty_percent || 50);

    monthAtt.forEach(record => {
      const isToday = record.date.toISOString().split('T')[0] === todayStr;
      let dayEarned = dailyWage;
      let dayDeductions = 0;

      if (record.check_in) {
        const checkIn = new Date(record.check_in);
        const [startH, startM] = officeStartTimeStr.split(':').map(Number);
        const officeStart = new Date(checkIn);
        officeStart.setHours(startH, startM, 0, 0);
        
        const diffMins = (checkIn - officeStart) / (1000 * 60);
        if (diffMins > lateThresholdMins) {
          dayDeductions += latePenaltyAmount;
        }

        if (record.check_out) {
          const checkOut = new Date(record.check_out);
          const hoursWorked = (checkOut - checkIn) / (1000 * 60 * 60);
          if (hoursWorked < halfDayThresholdHours) {
            dayDeductions += (dailyWage * halfDayPenaltyPercent / 100);
          }
        }
      } else {
        dayEarned = 0; // Not present
      }

      earnedMonth += dayEarned;
      deductionsMonth += dayDeductions;

      if (isToday) {
        todayEarned = dayEarned;
        todayDeductions = dayDeductions;
      }
    });

    res.json({
      attendance: attRows[0] || {},
      team_stats: {
        present: parseInt(teamStats.present),
        absent: parseInt(teamStats.absent)
      },
      tasks: taskRows,
      projects: projRows,
      kanban,
      salary_stats: {
        earned_month: Math.round(earnedMonth),
        deductions_month: Math.round(deductionsMonth),
        today_earned: Math.round(todayEarned),
        today_deductions: Math.round(todayDeductions)
      }
    });
  } catch (err) {
    console.error('Employee dashboard error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
