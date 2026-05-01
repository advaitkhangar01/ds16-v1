const router = require('express').Router();
const pool = require('../db');
const { authenticate, requireAdmin } = require('../middleware/auth');
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
        query += ` AND t.project_id = $${idx++}`;
        params.push(project_id);
        query += ` ORDER BY t.date DESC, t.created_at DESC`;
        const { rows } = await pool.query(query, params);
        res.json({ transactions: rows });
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
    
    const { rows } = await pool.query(query, params);
    res.json({ transactions: rows });
  } catch (err) {
    console.error('Get transactions error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/finances/transactions
router.post('/transactions', authenticate, checkProjectAccess(), upload.single('receipt'), async (req, res) => {
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

    const { rows } = await pool.query(
      `INSERT INTO transactions (type, category, amount, date, description, project_id, vendor_id, employee_id, reference_id, receipt_url, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [type, category, numericAmount, date || new Date(), description, project_id || null, vendor_id || null, employee_id || null, reference_id || null, receipt_url, req.user.id]
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
    let query = `
      SELECT 
        COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) as total_income,
        COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) as total_expense
      FROM transactions
      WHERE 1=1
    `;
    const params = [];
    let idx = 1;

    if (projectId) {
      query += ` AND project_id = $${idx++}`;
      params.push(projectId);
    }
    const { start_date, end_date, category } = req.query;
    if (category) {
      query += ` AND category = $${idx++}`;
      params.push(category);
    }
    if (start_date) {
      query += ` AND date >= $${idx++}`;
      params.push(start_date);
    }
    if (end_date) {
      query += ` AND date <= $${idx++}`;
      params.push(end_date);
    }

    const { rows } = await pool.query(query, params);
    res.json(rows[0]);
  };

  const { project_id } = req.query;
  if (project_id) {
    return checkProjectAccess()(req, res, () => executeSummary(project_id));
  }
  
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required for global summary' });
  }

  executeSummary();
});

// GET /api/finances/charts
router.get('/charts', authenticate, async (req, res) => {
  const { project_id } = req.query;
  if (project_id) {
    return checkProjectAccess()(req, res, () => executeCharts(project_id));
  }

  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required for global charts' });
  }

  executeCharts();

  async function executeCharts(projectId) {
    try {
      // 1. Monthly trend (Last 6 months)
      let trendQuery = `
        SELECT 
          TO_CHAR(date, 'Mon YYYY') as month_year,
          SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) as income,
          SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) as expense,
          MIN(date) as sort_date
        FROM transactions
        WHERE date >= CURRENT_DATE - INTERVAL '6 months'
      `;
      const trendParams = [];
      if (projectId) {
        trendQuery += ` AND project_id = $1`;
        trendParams.push(projectId);
      }
      trendQuery += ` GROUP BY month_year ORDER BY sort_date ASC`;
      
      const trendRes = await pool.query(trendQuery, trendParams);

      // 2. Category breakdown (Expenses only)
      let catQuery = `
        SELECT 
          category as name,
          SUM(amount) as value
        FROM transactions
        WHERE type = 'expense'
      `;
      const catParams = [];
      if (projectId) {
        catQuery += ` AND project_id = $1`;
        catParams.push(projectId);
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
router.delete('/transactions/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM transactions WHERE id = $1', [req.params.id]);
    res.json({ message: 'Transaction deleted' });
  } catch (err) {
    console.error('Delete transaction error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
