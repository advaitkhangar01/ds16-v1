const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticate, requireAdmin } = require('../middleware/auth');
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

// All accounting routes require authentication and admin privileges
router.use(authenticate);
router.use(requireAdmin);

/**
 * @section Expenses Management
 */

// Get all office expenses
router.get('/expenses', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM office_expenses ORDER BY date DESC, id DESC');
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
    // 1. Fetch all employees
    const empRes = await pool.query('SELECT id, name, department, base_salary FROM users WHERE role = \'employee\' ORDER BY name');
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

    // 4. Fetch detailed attendance for the month
    const attendanceRes = await pool.query(`
      SELECT user_id, check_in, check_out, date
      FROM attendance
      WHERE EXTRACT(MONTH FROM date) = $1 AND EXTRACT(YEAR FROM date) = $2
    `, [month, year]);
    const attendanceRecords = attendanceRes.rows;

    // 5. Calculate suggested salary for each employee
    const daysInMonth = new Date(year, month, 0).getDate();
    const officeStartTimeStr = settings.office_start_time || '09:30';
    const lateThresholdMins = parseInt(settings.late_threshold_mins || 15);
    const latePenaltyAmount = parseFloat(settings.late_penalty_amount || 0);
    const halfDayThresholdHours = parseFloat(settings.half_day_threshold_hours || 4);
    const halfDayPenaltyPercent = parseFloat(settings.half_day_penalty_percent || 50);

    const result = employees.map(emp => {
      const myRecords = attendanceRecords.filter(r => r.user_id === emp.id);
      const daysPresent = myRecords.length;
      const baseSalary = parseFloat(emp.base_salary) || 0;
      const dailyWage = daysInMonth > 0 ? baseSalary / daysInMonth : 0;

      let lateDeductions = 0;
      let halfDayDeductions = 0;
      let lateCount = 0;
      let halfDayCount = 0;

      myRecords.forEach(record => {
        if (!record.check_in) return;

        // Lateness check
        const checkIn = new Date(record.check_in);
        const [startH, startM] = officeStartTimeStr.split(':').map(Number);
        const officeStart = new Date(checkIn);
        officeStart.setHours(startH, startM, 0, 0);
        
        const diffMins = (checkIn - officeStart) / (1000 * 60);
        if (diffMins > lateThresholdMins) {
          lateCount++;
          lateDeductions += latePenaltyAmount;
        }

        // Half day check
        if (record.check_out) {
          const checkOut = new Date(record.check_out);
          const hoursWorked = (checkOut - checkIn) / (1000 * 60 * 60);
          if (hoursWorked < halfDayThresholdHours) {
            halfDayCount++;
            halfDayDeductions += (dailyWage * halfDayPenaltyPercent / 100);
          }
        }
      });

      // Total days credited = Present Days + Paid Holidays
      // (Ensuring we don't exceed days in month if someone worked on a holiday)
      const creditedDays = Math.min(daysInMonth, daysPresent + paidHolidayCount);
      const grossPay = dailyWage * creditedDays;
      const suggestedSalary = Math.round(grossPay - lateDeductions - halfDayDeductions);

      return {
        ...emp,
        days_present: daysPresent,
        paid_holidays: paidHolidayCount,
        total_days: daysInMonth,
        late_count: lateCount,
        half_day_count: halfDayCount,
        late_deductions: lateDeductions,
        half_day_deductions: halfDayDeductions,
        suggested_salary: suggestedSalary < 0 ? 0 : suggestedSalary
      };
    });

    res.json(result);
  } catch (err) {
    console.error('Payroll API Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Update employee base salary
router.put('/payroll/employees/:id', async (req, res) => {
  const { base_salary } = req.body;
  try {
    const { rows } = await pool.query(
      'UPDATE users SET base_salary = $1 WHERE id = $2 AND role = \'employee\' RETURNING id, name, base_salary',
      [base_salary, req.params.id]
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
  const { user_id, base_salary, bonus, deductions, net_paid, month, year, payment_date, status } = req.body;
  try {
    const { rows } = await pool.query(
      `INSERT INTO payroll (user_id, base_salary, bonus, deductions, net_paid, month, year, payment_date, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (user_id, month, year) 
       DO UPDATE SET 
         base_salary = EXCLUDED.base_salary,
         bonus = EXCLUDED.bonus,
         deductions = EXCLUDED.deductions,
         net_paid = EXCLUDED.net_paid,
         payment_date = EXCLUDED.payment_date,
         status = EXCLUDED.status
       RETURNING *`,
      [user_id, base_salary, bonus, deductions, net_paid, month, year, payment_date || new Date(), status || 'paid']
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

    // 4. Monthly breakdown (Last 6 months)
    // This is a bit more complex, let's just return totals for now and expand if needed.
    
    res.json({
      totalIncome,
      totalOfficeExpenses,
      totalPayroll,
      netProfit: totalIncome - (totalOfficeExpenses + totalPayroll)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
