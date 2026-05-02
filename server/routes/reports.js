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

// GET /api/reports/audit
// Returns audit status for a specific project
router.get('/audit', authenticate, async (req, res) => {
  try {
    const { project_id } = req.query;
    if (!project_id) return res.status(400).json({ error: 'project_id is required' });

    // For now, check if there are any unverified expenses for this project
    // Or just return a default if no specific audit logic is yet defined
    const { rows } = await pool.query(
      `SELECT COUNT(*) as unverified_count 
       FROM transactions 
       WHERE project_id = $1 AND type = 'expense' AND category != 'vendor_payment'`,
      [project_id]
    );

    // Mock logic: verified if there are no expenses or if they are "old" (just for UI placeholder)
    const is_verified = parseInt(rows[0].unverified_count) === 0;

    res.json({ is_verified, last_audit: new Date() });
  } catch (err) {
    console.error('Project audit status error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;

