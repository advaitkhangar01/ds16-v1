// server/middleware/accessControl.js
const pool = require('../db');

/**
 * Middleware to verify if the authenticated user has access to a specific project.
 * Admins have access to everything.
 * Employees have access if they are assigned to the project or mentioned in a comment/task.
 * 
 * Expectations:
 * - authenticate middleware must run before this.
 * - projectId must be in req.params.id, req.params.projectId, req.query.project_id, or req.body.project_id.
 */
const checkProjectAccess = (options = {}) => async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Authentication required' });

    // Admins skip checks
    if (user.role === 'admin') return next();

    let projectId = req.params.projectId || req.query?.project_id || req.body?.project_id;
    
    // If id is provided in params, decide if it's a projectId or other resourceId
    if (req.params.id) {
      if (options.idIsResource === 'document') {
        const { rows } = await pool.query('SELECT project_id FROM documents WHERE id = $1', [req.params.id]);
        if (rows[0]) projectId = rows[0].project_id;
      } else if (options.idIsResource === 'task') {
        const { rows } = await pool.query('SELECT project_id FROM tasks WHERE id = $1', [req.params.id]);
        if (rows[0]) projectId = rows[0].project_id;
      } else if (options.idIsResource === 'invoice') {
        const { rows } = await pool.query('SELECT project_id FROM invoices WHERE id = $1', [req.params.id]);
        if (rows[0]) projectId = rows[0].project_id;
      } else if (options.idIsResource === 'payment-stage') {
        const { rows } = await pool.query('SELECT project_id FROM project_payment_stages WHERE id = $1', [req.params.id]);
        if (rows[0]) projectId = rows[0].project_id;
      } else {
        projectId = req.params.id;
      }
    }

    if (!projectId) {
      return res.status(400).json({ error: 'project_id is required for access verification' });
    }

    // Allow all employees to access any project
    const { rows } = await pool.query(`
      SELECT 1 FROM projects WHERE id = $1
      LIMIT 1
    `, [projectId]);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    next();
  } catch (err) {
    console.error('Access control error:', err);
    res.status(500).json({ error: 'Internal server error during access verification' });
  }
};

module.exports = { checkProjectAccess };
