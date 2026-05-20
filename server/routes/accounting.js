const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticate, requireAdmin, requireAccounting } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure Multer for receipts
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '..', 'uploads', 'expenses');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'receipt-' + uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

// All accounting routes require authentication and admin or accounts privileges
router.use(authenticate);
router.use(requireAccounting);

/**
 * @section Expenses Management
 */

// Get all office expenses
router.get('/expenses', async (req, res) => {
  try {
    const query = `
      SELECT id, category, amount, date, description, receipt_url, 'office' as source FROM office_expenses
      UNION ALL
      SELECT id, 'Salaries' as category, (net_paid - incentives) as amount, payment_date as date, 'Monthly salary payment' as description, NULL as receipt_url, 'payroll' as source FROM payroll WHERE status = 'paid'
      UNION ALL
      SELECT id, 'Incentives' as category, incentives as amount, payment_date as date, 'Performance incentive' as description, NULL as receipt_url, 'payroll' as source FROM payroll WHERE status = 'paid' AND incentives > 0
      ORDER BY date DESC, id DESC
    `;
    const { rows } = await pool.query(query);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add new expense with receipt
router.post('/expenses', upload.single('receipt'), async (req, res) => {
  const { category, amount, date, description } = req.body;
  const receipt_url = req.file ? `/uploads/expenses/${req.file.filename}` : null;
  
  try {
    const { rows } = await pool.query(
      'INSERT INTO office_expenses (category, amount, date, description, receipt_url) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [category, amount, date || new Date(), description, receipt_url]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete expense
router.delete('/expenses/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM office_expenses WHERE id = $1', [req.params.id]);
    res.json({ message: 'Expense deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @section Expense Auditing
 */

// Get audit status for a month/year
router.get('/expenses/audits', async (req, res) => {
  const { month, year } = req.query;
  try {
    const { rows } = await pool.query(
      'SELECT category, is_verified FROM expense_audits WHERE month = $1 AND year = $2',
      [month, year]
    );
    // Return as a simple object { categoryName: is_verified }
    const audits = rows.reduce((acc, row) => {
      acc[row.category] = row.is_verified;
      return acc;
    }, {});
    res.json(audits);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update audit status
router.post('/expenses/audits', async (req, res) => {
  const { category, month, year, is_verified } = req.body;
  try {
    const { rows } = await pool.query(
      `INSERT INTO expense_audits (category, month, year, is_verified, verified_by)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (category, month, year) 
       DO UPDATE SET is_verified = EXCLUDED.is_verified, verified_at = NOW()
       RETURNING *`,
      [category, month, year, is_verified, req.user.id]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @section Payroll Management
 */

// Get employees with their base salaries and attendance for a specific month
router.get('/payroll/employees', async (req, res) => {
  const { month, year } = req.query;
  try {
    // 1. Fetch all employees and admins for payroll
    const empRes = await pool.query("SELECT id, name, department, role, base_salary, hourly_rate FROM users WHERE role IN ('employee', 'admin', 'accounts') ORDER BY name");
    const employees = empRes.rows;

    if (!month || !year) {
      return res.json(employees);
    }

    // 2. Fetch App Settings
    const settingsRes = await pool.query('SELECT * FROM app_settings');
    const settings = settingsRes.rows.reduce((acc, row) => {
      acc[row.key] = row.value;
      return acc;
    }, {});

    // 3. Fetch Holidays for the month
    const holidaysRes = await pool.query(`
      SELECT date, is_paid FROM holidays 
      WHERE EXTRACT(MONTH FROM date) = $1 AND EXTRACT(YEAR FROM date) = $2
    `, [month, year]);
    const holidays = holidaysRes.rows;
    const paidHolidayCount = holidays.filter(h => h.is_paid).length;

    // 4. Fetch Leave Summary
    const leaveRes = await pool.query(`
      SELECT user_id, unpaid_leaves 
      FROM employee_leave_summary 
      WHERE month = $1 AND year = $2
    `, [month, year]);
    const leaveSummaries = leaveRes.rows.reduce((acc, row) => {
      acc[row.user_id] = row.unpaid_leaves;
      return acc;
    }, {});

    // 5. Fetch detailed attendance for the month
    const attendanceRes = await pool.query(`
      SELECT user_id, check_in, check_out, date, LOWER(status) AS status, is_late, hours_worked
      FROM attendance
      WHERE EXTRACT(MONTH FROM date) = $1 AND EXTRACT(YEAR FROM date) = $2
    `, [month, year]);
    const attendanceRecords = attendanceRes.rows;

    // 6. Calculate suggested salary for each employee
    const daysInMonth = new Date(year, month, 0).getDate();
    const latePenaltyRuleCount = parseInt(settings.late_penalty_rule_count || 3);
    const latePenaltyRuleDays = parseFloat(settings.late_penalty_rule_days || 0.5);

    const result = employees.map(emp => {
      const myRecords = attendanceRecords.filter(r => r.user_id === emp.id);
      
      const fullDays = myRecords.filter(r => r.status === 'present').length;
      const halfDays = myRecords.filter(r => r.status === 'half_day').length;
      const lateCount = myRecords.filter(r => r.is_late).length;
      const unpaidLeaves = parseFloat(leaveSummaries[emp.id]) || 0;

      const hourlyRate = parseFloat(emp.hourly_rate) || 0;
      const totalHours = myRecords.reduce((sum, r) => sum + parseFloat(r.hours_worked || 0), 0);
      
      let suggestedSalary = 0;
      let calcMethod = 'daily';
      let effectiveDays = 0;
      let finalPayableDays = 0;
      let latePenaltyDays = 0;

      if (hourlyRate > 0) {
        suggestedSalary = Math.round(hourlyRate * totalHours);
        calcMethod = 'hourly';
        effectiveDays = totalHours; // For hourly, effective units are hours
        finalPayableDays = totalHours;
      } else {
        const baseSalary = parseFloat(emp.base_salary) || 0;
        const perDaySalary = daysInMonth > 0 ? baseSalary / daysInMonth : 0;
        latePenaltyDays = Math.floor(lateCount / latePenaltyRuleCount) * latePenaltyRuleDays;
        effectiveDays = emp.role === 'admin' ? daysInMonth : (fullDays + (halfDays * 0.5) + paidHolidayCount - unpaidLeaves);
        finalPayableDays = emp.role === 'admin' ? daysInMonth : Math.max(0, effectiveDays - latePenaltyDays);
        suggestedSalary = Math.round(perDaySalary * finalPayableDays);
      }

      return {
        ...emp,
        full_days: fullDays,
        half_days: halfDays,
        late_count: lateCount,
        unpaid_leaves: unpaidLeaves,
        paid_holidays: paidHolidayCount,
        effective_days: effectiveDays,
        late_penalty_days: latePenaltyDays,
        payable_days: finalPayableDays,
        total_days: daysInMonth,
        total_hours: totalHours,
        calculation_method: calcMethod,
        suggested_salary: suggestedSalary < 0 ? 0 : suggestedSalary
      };
    });

    res.json(result);
  } catch (err) {
    console.error('Payroll API Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Update employee base salary or hourly rate
router.put('/payroll/employees/:id', async (req, res) => {
  const { base_salary, hourly_rate } = req.body;
  try {
    const { rows } = await pool.query(
      "UPDATE users SET base_salary = COALESCE($1, base_salary), hourly_rate = COALESCE($2, hourly_rate) WHERE id = $3 AND role IN ('employee', 'admin', 'accounts') RETURNING id, name, base_salary, hourly_rate",
      [base_salary, hourly_rate, req.params.id]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get payroll history for a specific month/year
router.get('/payroll/history', async (req, res) => {
  const { month, year } = req.query;
  try {
    let query = 'SELECT p.*, u.name, u.department FROM payroll p JOIN users u ON p.user_id = u.id';
    const params = [];
    
    if (month && year) {
      query += ' WHERE p.month = $1 AND p.year = $2';
      params.push(month, year);
    }
    
    query += ' ORDER BY p.year DESC, p.month DESC, u.name ASC';
    
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Process payroll (add/update)
router.post('/payroll', async (req, res) => {
  const { user_id, base_salary, bonus, incentives, deductions, net_paid, month, year, payment_date, status } = req.body;
  try {
    const { rows } = await pool.query(
      `INSERT INTO payroll (user_id, base_salary, bonus, incentives, deductions, net_paid, month, year, payment_date, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (user_id, month, year) 
       DO UPDATE SET 
         base_salary = EXCLUDED.base_salary,
         bonus = EXCLUDED.bonus,
         incentives = EXCLUDED.incentives,
         deductions = EXCLUDED.deductions,
         net_paid = EXCLUDED.net_paid,
         payment_date = EXCLUDED.payment_date,
         status = EXCLUDED.status
       RETURNING *`,
      [user_id, base_salary, bonus || 0, incentives || 0, deductions || 0, net_paid, month, year, payment_date || new Date(), status || 'paid']
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @section P&L Reports
 */

router.get('/summary', async (req, res) => {
  try {
    // 1. Total Income from projects (sum of project_document_amounts)
    const incomeRes = await pool.query('SELECT COALESCE(SUM(amount), 0) as total_income FROM project_document_amounts');
    const totalIncome = parseFloat(incomeRes.rows[0].total_income);

    // 2. Total Office Expenses
    const expenseRes = await pool.query('SELECT COALESCE(SUM(amount), 0) as total_expenses FROM office_expenses');
    const totalOfficeExpenses = parseFloat(expenseRes.rows[0].total_expenses);

    // 3. Total Payroll
    const payrollRes = await pool.query('SELECT COALESCE(SUM(net_paid), 0) as total_payroll FROM payroll');
    const totalPayroll = parseFloat(payrollRes.rows[0].total_payroll);

    // 4. Total Incentives
    const incentivesRes = await pool.query('SELECT COALESCE(SUM(incentives), 0) as total_incentives FROM payroll');
    const totalIncentives = parseFloat(incentivesRes.rows[0].total_incentives);

    res.json({
      totalIncome,
      totalOfficeExpenses,
      totalPayroll,
      totalIncentives,
      netProfit: totalIncome - (totalOfficeExpenses + totalPayroll)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
