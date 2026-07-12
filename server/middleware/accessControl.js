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

    // Global roles skip checks (admin, design_head, project_head)
    if (user.role === 'admin' || user.role === 'design_head' || user.role === 'project_head') return next();

    let projectId = req.params.projectId || req.query?.project_id || req.body?.project_id;
    
    // Extract the primary ID from params (either 'id' or resource-specific name)
    const resourceId = req.params.id || req.params.task_id || req.params.document_id || req.params.invoice_id || req.params.stage_id;
    
    // Defensive check: Ensure resourceId is numeric if provided
    if (resourceId && isNaN(parseInt(resourceId))) {
      return res.status(400).json({ error: 'Invalid ID format' });
    }

    // If resourceId is provided in params, decide if it's a projectId or other resourceId
    if (resourceId) {
      if (options.idIsResource === 'document') {
        const { rows } = await pool.query('SELECT project_id FROM documents WHERE id = $1', [resourceId]);
        if (rows[0]) projectId = rows[0].project_id;
      } else if (options.idIsResource === 'task') {
        // For tasks, we check if user is the assignee or a participant
        const { rows } = await pool.query(`
          SELECT project_id, assigned_to, 
                 EXISTS (SELECT 1 FROM task_participants WHERE task_id = tasks.id AND user_id = $2) as is_participant
          FROM tasks WHERE id = $1
        `, [resourceId, user.id]);

        if (rows[0]) {
          projectId = rows[0].project_id;
          // If user is assignee or participant, they get access automatically
          if (rows[0].assigned_to === user.id || rows[0].is_participant) {
            return next();
          }
        } else {
          return res.status(404).json({ error: 'Task not found' });
        }
      } else if (options.idIsResource === 'invoice') {
        const { rows } = await pool.query('SELECT project_id FROM invoices WHERE id = $1', [resourceId]);
        if (rows[0]) projectId = rows[0].project_id;
      } else if (options.idIsResource === 'payment-stage') {
        const { rows } = await pool.query('SELECT project_id FROM project_payment_stages WHERE id = $1', [resourceId]);
        if (rows[0]) projectId = rows[0].project_id;
      } else {
        projectId = resourceId;
      }
    }

    if (!projectId) {
      // If no project ID is found, and it's an admin, we're definitely okay.
      // (Admin check is already above, but this is for clarity)
      if (user.role === 'admin') return next();

      // If no project ID is found, and it's an employee, we only block if 
      // the route explicitly requires a project (which most do).
      if (options.required === false) return next();
      
      return res.status(400).json({ error: 'project_id is required for access verification' });
    }

    const pid = parseInt(projectId);
    if (isNaN(pid)) {
      // If it's not a number, maybe it's a general request that shouldn't have been checked
      if (user.role === 'admin') return next();
      return res.status(400).json({ error: 'Invalid project_id format' });
    }

    // Verify if employee is assigned to the project
    const { rows } = await pool.query(`
      SELECT 1 FROM project_assignments 
      WHERE project_id = $1 AND user_id = $2
      LIMIT 1
    `, [pid, user.id]);

    if (rows.length > 0) {
      return next();
    }

    // Accounts users have access to all projects in 'Sanction' or 'Under Sanctioning' status
    const isAccounts = user.role === 'back_office' || user.role === 'accounts';
    if (isAccounts) {
      const { rows: projRows } = await pool.query('SELECT status FROM projects WHERE id = $1', [pid]);
      if (projRows[0] && (projRows[0].status === 'Sanction' || projRows[0].status === 'Under Sanctioning')) {
        return next();
      }
    }

    return res.status(403).json({ error: 'Access denied. You are not assigned to this project.' });
  } catch (err) {
    console.error('Access control error:', err);
    res.status(500).json({ error: 'Internal server error during access verification' });
  }
};

module.exports = { checkProjectAccess };
