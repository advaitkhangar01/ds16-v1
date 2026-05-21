const router = require('express').Router();
const pool = require('../db');
const { authenticate, requireAdmin, requireAccounting } = require('../middleware/auth');
const { checkProjectAccess } = require('../middleware/accessControl');
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

// GET /api/finances/transactions
router.get('/transactions', authenticate, async (req, res) => {
  try {
    const { type, project_id, start_date, end_date, category } = req.query;
    let query = `
      SELECT t.*, p.name as project_name, v.name as vendor_name, u.name as employee_name, creator.name as creator_name
      FROM transactions t
      LEFT JOIN projects p ON p.id = t.project_id
      LEFT JOIN vendors v ON v.id = t.vendor_id
      LEFT JOIN users u ON u.id = t.employee_id
      LEFT JOIN users creator ON creator.id = t.created_by
      WHERE 1=1
    `;
    const params = [];
    let idx = 1;

    if (category) {
      query += ` AND t.category = $${idx++}`;
      params.push(category);
    }
    if (type) {
      query += ` AND t.type = $${idx++}`;
      params.push(type);
    }
    if (project_id) {
      return checkProjectAccess()(req, res, async () => {
        let projectQuery = `
          SELECT t.*, p.name as project_name, v.name as vendor_name, u.name as employee_name, creator.name as creator_name
          FROM transactions t
          LEFT JOIN projects p ON p.id = t.project_id
          LEFT JOIN vendors v ON v.id = t.vendor_id
          LEFT JOIN users u ON u.id = t.employee_id
          LEFT JOIN users creator ON creator.id = t.created_by
          WHERE t.project_id = $1
        `;
        const projectParams = [project_id];
        let pIdx = 2;

        if (category) {
          projectQuery += ` AND t.category = $${pIdx++}`;
          projectParams.push(category);
        }
        if (type) {
          projectQuery += ` AND t.type = $${pIdx++}`;
          projectParams.push(type);
        }
        if (start_date) {
          projectQuery += ` AND t.date >= $${pIdx++}`;
          projectParams.push(start_date);
        }
        if (end_date) {
          projectQuery += ` AND t.date <= $${pIdx++}`;
          projectParams.push(end_date);
        }

        const { rows: dbTransactions } = await pool.query(projectQuery, projectParams);

        // Fetch virtual income transactions from paid payment stages
        let virtualTransactions = [];
        if (!type || type === 'income') {
          let stageQuery = `
            SELECT 
              pps.id, 
              'income' as type, 
              COALESCE(pps.document_type, 'Milestone') as category, 
              pps.amount, 
              COALESCE(pps.updated_at, pps.created_at) as date, 
              ('Paid Milestone: ' || COALESCE(pps.document_type, 'General')) as description, 
              pps.project_id, 
              NULL as vendor_id, 
              NULL as employee_id, 
              NULL as reference_id, 
              NULL as receipt_url, 
              pps.initiated_by as created_by, 
              pps.created_at, 
              'payment_stage' as source,
              p.name as project_name,
              NULL as vendor_name,
              NULL as employee_name,
              u.name as creator_name
            FROM project_payment_stages pps
            JOIN projects p ON p.id = pps.project_id
            LEFT JOIN users u ON u.id = pps.initiated_by
            WHERE pps.project_id = $1 AND pps.status = 'paid'
          `;
          const stageParams = [project_id];
          let sIdx = 2;

          if (start_date) {
            stageQuery += ` AND COALESCE(pps.updated_at, pps.created_at) >= $${sIdx++}`;
            stageParams.push(start_date);
          }
          if (end_date) {
            stageQuery += ` AND COALESCE(pps.updated_at, pps.created_at) <= $${sIdx++}`;
            stageParams.push(end_date);
          }

          const { rows: stageRows } = await pool.query(stageQuery, stageParams);
          virtualTransactions = stageRows;
        }

        const allTransactions = [...dbTransactions, ...virtualTransactions].sort((a, b) => new Date(b.date) - new Date(a.date));
        res.json({ transactions: allTransactions });
      });
    }

    if (req.user.role !== 'admin') {
      // Employees only see transactions for projects they are assigned to
      query += `
        JOIN project_assignments pa ON pa.project_id = t.project_id
        WHERE pa.user_id = $${idx++}
      `;
      params.push(req.user.id);
    }

    query += ` ORDER BY t.date DESC, t.created_at DESC`;
    
    const { rows: transactions } = await pool.query(query, params);

    // If type is expense (or not specified), include payroll records as virtual transactions
    if (!type || type === 'expense') {
      let payrollQuery = `
        SELECT 
          id, 
          'expense' as type, 
          'Salaries' as category, 
          net_paid as amount, 
          payment_date as date, 
          'Monthly salary payment' as description, 
          NULL as project_id, 
          NULL as vendor_id, 
          user_id as employee_id, 
          NULL as reference_id, 
          NULL as receipt_url, 
          NULL as created_by, 
          created_at, 
          'payroll' as source
        FROM payroll 
        WHERE status = 'paid'
      `;
      const payrollParams = [];
      let pyIdx = 1;

      if (start_date) {
        payrollQuery += ` AND payment_date >= $${pyIdx++}`;
        payrollParams.push(start_date);
      }
      if (end_date) {
        payrollQuery += ` AND payment_date <= $${pyIdx++}`;
        payrollParams.push(end_date);
      }

      const { rows: payrollRows } = await pool.query(payrollQuery, payrollParams);
      
      // Merge and sort
      // Note: Include all transactions (including manually-added salary entries) plus payroll records.
      // Payroll records from the payroll table are merged alongside any manually-entered salary transactions.
      const allTransactions = [...transactions, ...payrollRows].sort((a, b) => new Date(b.date) - new Date(a.date));
      return res.json({ transactions: allTransactions });
    }

    res.json({ transactions });
  } catch (err) {
    console.error('Get transactions error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/finances/transactions
router.post('/transactions', authenticate, upload.single('receipt'), checkProjectAccess(), async (req, res) => {
  try {
    console.log('New Transaction:', req.body);
    if (req.file) console.log('Attached Receipt:', req.file.filename);
    
    const { type, category, amount, date, description, project_id, vendor_id, employee_id, reference_id } = req.body;
    const receipt_url = req.file ? `/uploads/expenses/${req.file.filename}` : null;
    
    if (!type || !category || !amount) {
      return res.status(400).json({ error: 'Type, category and amount are required' });
    }

    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount)) {
      return res.status(400).json({ error: 'Invalid amount value' });
    }

    const pid = project_id ? parseInt(project_id) : null;
    const vid = vendor_id ? parseInt(vendor_id) : null;
    const eid = employee_id ? parseInt(employee_id) : null;

    const { rows } = await pool.query(
      `INSERT INTO transactions (type, category, amount, date, description, project_id, vendor_id, employee_id, reference_id, receipt_url, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [type, category, numericAmount, date || new Date(), description, pid, vid, eid, reference_id || null, receipt_url, req.user.id]
    );

    res.status(201).json({ transaction: rows[0] });
  } catch (err) {
    console.error('Create transaction error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/finances/summary
router.get('/summary', authenticate, async (req, res) => {
  const executeSummary = async (projectId) => {
    try {
      const { start_date, end_date } = req.query;
      
      // 1. Income from document amounts (Total Potential)
      let incomeQuery = `SELECT COALESCE(SUM(amount), 0) as total_value FROM project_document_amounts WHERE 1=1`;
      const incomeParams = [];
      if (projectId) {
        incomeQuery += ` AND project_id = $1`;
        incomeParams.push(projectId);
      }
      const incomeRes = await pool.query(incomeQuery, incomeParams);
      const totalValue = parseFloat(incomeRes.rows[0].total_value);

      // 2. Billed/Received/Pending from payment stages
      let stagesQuery = `
        SELECT 
          COALESCE(SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END), 0) as received,
          COALESCE(SUM(CASE WHEN status IN ('bill generated', 'bill delivered') THEN amount ELSE 0 END), 0) as pending
        FROM project_payment_stages
        WHERE status != 'cancelled'
      `;
      const stagesParams = [];
      let sIdx = 1;
      if (projectId) {
        stagesQuery += ` AND project_id = $${sIdx++}`;
        stagesParams.push(projectId);
      }
      if (start_date) {
        stagesQuery += ` AND created_at >= $${sIdx++}`;
        stagesParams.push(start_date);
      }
      if (end_date) {
        stagesQuery += ` AND created_at <= $${sIdx++}`;
        stagesParams.push(end_date);
      }
      const stagesRes = await pool.query(stagesQuery, stagesParams);
      const stageReceived = parseFloat(stagesRes.rows[0].received);
      const pending = parseFloat(stagesRes.rows[0].pending);
      const billed = stageReceived + pending;

      // 2b. Manual income transactions — add to received so summary matches transaction timeline
      let manualIncome = 0;
      if (projectId) {
        const manualParams = [projectId];
        let mIdx = 2;
        let manualQ = `SELECT COALESCE(SUM(amount), 0) as mi FROM transactions WHERE type = 'income' AND project_id = $1`;
        if (start_date) { manualQ += ` AND date >= $${mIdx++}`; manualParams.push(start_date); }
        if (end_date)   { manualQ += ` AND date <= $${mIdx++}`; manualParams.push(end_date); }
        const manualRes = await pool.query(manualQ, manualParams);
        manualIncome = parseFloat(manualRes.rows[0].mi) || 0;
      }
      const received = stageReceived + manualIncome;

      // 3. Expenses from transactions (excluding vendor payments)
      let expenseQuery = `
        SELECT COALESCE(SUM(amount), 0) as total_expense 
        FROM transactions 
        WHERE type = 'expense' AND category NOT IN ('vendor_payment', 'salary', 'incentive')
      `;
      const expParams = [];
      let eIdx = 1;
      if (projectId) {
        expenseQuery += ` AND project_id = $${eIdx++}`;
        expParams.push(projectId);
      }
      if (start_date) {
        expenseQuery += ` AND date >= $${eIdx++}`;
        expParams.push(start_date);
      }
      if (end_date) {
        expenseQuery += ` AND date <= $${eIdx++}`;
        expParams.push(end_date);
      }
      const expRes = await pool.query(expenseQuery, expParams);
      const transactionExpense = parseFloat(expRes.rows[0].total_expense);

      // 4. Payroll Expenses (Automatically included in global summary)
      let totalPayroll = 0;
      let totalIncentives = 0;

      if (!projectId) {
        let payrollQuery = `SELECT COALESCE(SUM(net_paid), 0) as total_payroll, COALESCE(SUM(incentives), 0) as total_incentives FROM payroll WHERE status = 'paid'`;
        const payrollParams = [];
        let pIdx = 1;
        if (start_date) {
          payrollQuery += ` AND payment_date >= $${pIdx++}`;
          payrollParams.push(start_date);
        }
        if (end_date) {
          payrollQuery += ` AND payment_date <= $${pIdx++}`;
          payrollParams.push(end_date);
        }
        const payrollRes = await pool.query(payrollQuery, payrollParams);
        totalPayroll = parseFloat(payrollRes.rows[0].total_payroll);
        totalIncentives = parseFloat(payrollRes.rows[0].total_incentives);
      }

      const totalExpense = transactionExpense + totalPayroll;
      const unbilled = totalValue - billed;

      res.json({
        total_income: totalValue,
        billed_income: billed,
        received_income: received,
        pending_income: pending,
        unbilled_income: unbilled > 0 ? unbilled : 0,
        total_expense: totalExpense,
        total_payroll: totalPayroll,
        total_incentives: totalIncentives,
        net_profit: totalValue - totalExpense
      });
    } catch (err) {
      console.error('Execute summary error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  };

  const { project_id } = req.query;
  if (project_id) {
    return checkProjectAccess()(req, res, () => executeSummary(project_id));
  }
  
  const isAccounting = req.user.role === 'admin' || req.user.role === 'accounts' || req.user.department?.toLowerCase() === 'accounts';
  if (!isAccounting) {
    return res.status(403).json({ error: 'Admin or Accounting access required for global summary' });
  }

  executeSummary();
});

// GET /api/finances/charts
router.get('/charts', authenticate, async (req, res) => {
  const { project_id } = req.query;
  if (project_id) {
    return checkProjectAccess()(req, res, () => executeCharts(project_id));
  }

  const isAccounting = req.user.role === 'admin' || req.user.role === 'accounts' || req.user.department?.toLowerCase() === 'accounts';
  if (!isAccounting) {
    return res.status(403).json({ error: 'Admin or Accounting access required for global charts' });
  }

  executeCharts();

  async function executeCharts(projectId) {
    try {
      const { start_date, end_date } = req.query;
      
      // 1. Monthly trend
      let trendQuery = `
        WITH combined_data AS (
          SELECT date, type, category, amount, project_id FROM transactions
          UNION ALL
          SELECT payment_date as date, 'expense' as type, 'Salaries' as category, net_paid as amount, NULL as project_id FROM payroll WHERE status = 'paid'
        )
        SELECT 
          TO_CHAR(date, 'Mon YYYY') as month_year,
          SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) as income,
          SUM(CASE WHEN type = 'expense' AND category NOT IN ('vendor_payment', 'salary', 'incentive') THEN amount ELSE 0 END) as expense,
          MIN(date) as sort_date
        FROM combined_data
        WHERE 1=1
      `;
      const trendParams = [];
      let tIdx = 1;

      if (projectId) {
        trendQuery += ` AND project_id = $${tIdx++}`;
        trendParams.push(projectId);
      }
      if (start_date) {
        trendQuery += ` AND date >= $${tIdx++}`;
        trendParams.push(start_date);
      }
      if (end_date) {
        trendQuery += ` AND date <= $${tIdx++}`;
        trendParams.push(end_date);
      }
      
      // If no date filters, default to last 6 months for trend
      if (!start_date && !end_date) {
        trendQuery += ` AND date >= CURRENT_DATE - INTERVAL '6 months'`;
      }

      trendQuery += ` GROUP BY month_year ORDER BY sort_date ASC`;
      
      const trendRes = await pool.query(trendQuery, trendParams);

      // 2. Category breakdown (Expenses only)
      let catQuery = `
        WITH combined_expenses AS (
          SELECT category, amount, date, project_id FROM transactions WHERE type = 'expense' AND category NOT IN ('vendor_payment', 'salary', 'incentive')
          UNION ALL
          SELECT 'Salaries' as category, net_paid as amount, payment_date as date, NULL as project_id FROM payroll WHERE status = 'paid'
        )
        SELECT 
          category as name,
          SUM(amount) as value
        FROM combined_expenses
        WHERE 1=1
      `;
      const catParams = [];
      let cIdx = 1;

      if (projectId) {
        catQuery += ` AND project_id = $${cIdx++}`;
        catParams.push(projectId);
      }
      if (start_date) {
        catQuery += ` AND date >= $${cIdx++}`;
        catParams.push(start_date);
      }
      if (end_date) {
        catQuery += ` AND date <= $${cIdx++}`;
        catParams.push(end_date);
      }

      // If no date filters, default to same range as trend (last 6 months)
      if (!start_date && !end_date) {
        catQuery += ` AND date >= CURRENT_DATE - INTERVAL '6 months'`;
      }

      catQuery += ` GROUP BY category ORDER BY value DESC`;
      
      const catRes = await pool.query(catQuery, catParams);

      res.json({
        trend: trendRes.rows,
        categories: catRes.rows
      });
    } catch (err) {
      console.error('Get finance charts error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
});

// DELETE /api/finances/transactions/:id
router.delete('/transactions/:id', authenticate, requireAccounting, async (req, res) => {
  try {
    await pool.query('DELETE FROM transactions WHERE id = $1', [req.params.id]);
    res.json({ message: 'Transaction deleted' });
  } catch (err) {
    console.error('Delete transaction error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
