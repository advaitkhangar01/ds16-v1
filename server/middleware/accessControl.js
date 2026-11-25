// server/middleware/accessControl.js
const pool = require('../db');

/**
 * Middleware to verify if the authenticated user has access to a specific project.
 * Admins, Design Heads, and Project Heads have global access to all projects.
 * Other roles (employees, civil engineers, etc.) have access if they are assigned
 * to the project, created it, or participate in the relevant task/resource.
 *
 * Expectations:
 * - authenticate middleware must run before this.
 * - projectId must be in req.params.id, req.params.projectId, req.query.project_id, or req.body.project_id.
 */
const checkProjectAccess = (options = {}) => async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Authentication required' });

    // Extract the primary ID from params (either 'id' or resource-specific name)
    const resourceId = req.params.id || req.params.task_id || req.params.document_id || req.params.invoice_id || req.params.stage_id;

    // Defensive check: Ensure resourceId is numeric if provided
    if (resourceId && isNaN(parseInt(resourceId, 10))) {
      return res.status(400).json({ error: 'Invalid ID format' });
    }

    let projectId = req.params.projectId || req.query?.project_id || req.body?.project_id;

    // If resourceId is provided in params, decide if it's a projectId or other resourceId
    if (resourceId) {
      if (options.idIsResource === 'document') {
        const { rows } = await pool.query('SELECT project_id FROM documents WHERE id = $1', [resourceId]);
        if (rows[0]) projectId = rows[0].project_id;
        else return res.status(404).json({ error: 'Document not found' });
      } else if (options.idIsResource === 'task') {
        // For tasks, check assignment and participation
        const { rows } = await pool.query(`
          SELECT project_id, assigned_to, 
                 EXISTS (SELECT 1 FROM task_participants WHERE task_id = tasks.id AND user_id = $2) as is_participant
          FROM tasks WHERE id = $1
        `, [resourceId, user.id]);

        if (rows[0]) {
          projectId = rows[0].project_id;
          // Global privileged roles skip further checks
          if (user.role === 'admin' || user.role === 'design_head' || user.role === 'project_head') return next();

          // If user is assignee or participant, they get access automatically
          if (rows[0].assigned_to === user.id || rows[0].is_participant) {
            return next();
          }

          // Otherwise check if employee is assigned to the project
          const { rows: projAssign } = await pool.query(
            'SELECT 1 FROM project_assignments WHERE project_id = $1 AND user_id = $2',
            [projectId, user.id]
          );
          if (projAssign.length === 0) {
            return res.status(403).json({ error: 'Access denied: you are not assigned to this task or its project' });
          }
          return next();
        } else {
          return res.status(404).json({ error: 'Task not found' });
        }
      } else if (options.idIsResource === 'invoice') {
        const { rows } = await pool.query('SELECT project_id FROM invoices WHERE id = $1', [resourceId]);
        if (rows[0]) projectId = rows[0].project_id;
        else return res.status(404).json({ error: 'Invoice not found' });
      } else if (options.idIsResource === 'payment-stage') {
        const { rows } = await pool.query('SELECT project_id FROM project_payment_stages WHERE id = $1', [resourceId]);
        if (rows[0]) projectId = rows[0].project_id;
        else return res.status(404).json({ error: 'Payment stage not found' });
      } else {
        projectId = resourceId;
      }
    }

    // Global roles skip checks (admin, design_head, project_head)
    if (user.role === 'admin' || user.role === 'design_head' || user.role === 'project_head') return next();

    if (!projectId) {
      if (options.required === false) return next();
      return res.status(400).json({ error: 'project_id is required for access verification' });
    }

    const pid = parseInt(projectId, 10);
    if (isNaN(pid)) {
      return res.status(400).json({ error: 'Invalid project_id format' });
    }

    // Verify that the project exists
    const { rows: projRows } = await pool.query('SELECT id, created_by FROM projects WHERE id = $1', [pid]);
    if (!projRows[0]) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Check project assignment for routes that require assignment or mutating actions
    if (options.requireAssignment || (options.requireAssignmentOnMutation && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method))) {
      if (projRows[0].created_by === user.id) return next();
      const { rows: assignRows } = await pool.query(
        'SELECT 1 FROM project_assignments WHERE project_id = $1 AND user_id = $2',
        [pid, user.id]
      );
      if (assignRows.length === 0) {
        return res.status(403).json({ error: 'Access denied: you are not assigned to this project' });
      }
    }

    return next();
  } catch (err) {
    console.error('Access control error:', err);
    res.status(500).json({ error: 'Internal server error during access verification' });
  }
};

module.exports = { checkProjectAccess };
