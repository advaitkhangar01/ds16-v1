const router = require('express').Router();
const pool = require('../db');
const { authenticate, requireAdmin } = require('../middleware/auth');

// GET /api/reports/project-pnl
// Returns a summary of profit and loss for all projects or a specific project
router.get('/project-pnl', authenticate, requireAdmin, async (req, res) => {
  try {
    const { project_id } = req.query;
    
    let query = `
      SELECT 
        p.id,
        p.name,
        p.client_name,
        p.status,
        COALESCE(income.total, 0) as total_income,
        COALESCE(expense.total, 0) as total_expense,
        (COALESCE(income.total, 0) - COALESCE(expense.total, 0)) as net_profit
      FROM projects p
      LEFT JOIN (
        SELECT project_id, SUM(amount) as total 
        FROM project_document_amounts 
        GROUP BY project_id
      ) income ON income.project_id = p.id
      LEFT JOIN (
        SELECT project_id, SUM(amount) as total 
        FROM transactions 
        WHERE type = 'expense' AND category != 'vendor_payment'
        GROUP BY project_id
      ) expense ON expense.project_id = p.id
      WHERE 1=1
    `;
    
    const params = [];
    if (project_id) {
      query += ` AND p.id = $1`;
      params.push(project_id);
    }
    
    query += ` ORDER BY net_profit DESC`;
    
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error('Project P&L report error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
