// server/routes/responsibilities.js
// Responsibilities workflow API for My Profile -> Responsibilities sub-tab

const router = require('express').Router();
const pool = require('../db');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { createNotification } = require('../utils/notifier');

router.use(authenticate);

// Helper to record audit log within a transaction or standalone client
async function logAudit(client, { userId, action, entityId, oldValue, newValue, ipAddress }) {
  await client.query(
    `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_value, new_value, ip_address)
     VALUES ($1, $2, 'responsibility', $3, $4, $5, $6)`,
    [
      userId,
      action,
      String(entityId),
      oldValue ? JSON.stringify(oldValue) : null,
      newValue ? JSON.stringify(newValue) : null,
      ipAddress || null,
    ]
  );
}

/**
 * GET /api/responsibilities
 * Fetch responsibilities.
 * - Non-admin: can ONLY fetch their own responsibilities (user_id = req.user.id).
 * - Admin: can fetch for any target user_id (defaults to req.user.id if not specified).
 */
router.get('/', async (req, res) => {
  try {
    const isAdmin = req.user.role === 'admin';
    let targetUserId = req.user.id;

    if (req.query.userId) {
      const parsedId = parseInt(req.query.userId, 10);
      if (isNaN(parsedId)) {
        return res.status(400).json({ error: 'Invalid userId parameter' });
      }

      if (!isAdmin && parsedId !== req.user.id) {
        return res.status(403).json({ error: 'Access denied: You can only view your own responsibilities.' });
      }
      targetUserId = parsedId;
    }

    const { rows } = await pool.query(
      `SELECT 
         r.id,
         r.user_id,
         r.description,
         r.employee_acknowledged,
         r.employee_acknowledged_at,
         r.admin_verified,
         r.admin_verified_at,
         r.created_by,
         r.created_at,
         r.updated_at,
         u.name as employee_name,
         u.username as employee_username,
         cb.name as creator_name
       FROM responsibilities r
       JOIN users u ON u.id = r.user_id
       LEFT JOIN users cb ON cb.id = r.created_by
       WHERE r.user_id = $1
       ORDER BY 
         CASE 
           WHEN r.employee_acknowledged = FALSE AND r.admin_verified = FALSE THEN 1
           WHEN r.employee_acknowledged = TRUE AND r.admin_verified = FALSE THEN 2
           ELSE 3
         END ASC,
         r.created_at ASC,
         r.id ASC`,
      [targetUserId]
    );

    res.json({ responsibilities: rows });
  } catch (err) {
    console.error('GET /api/responsibilities error:', err);
    res.status(500).json({ error: 'Failed to fetch responsibilities' });
  }
});

/**
 * POST /api/responsibilities
 * Admin only: Create/assign a new responsibility.
 */
router.post('/', requireAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const { userId, description } = req.body;

    if (!userId || isNaN(parseInt(userId, 10))) {
      return res.status(400).json({ error: 'Valid employee ID is required' });
    }

    if (!description || typeof description !== 'string' || description.trim().length === 0) {
      return res.status(400).json({ error: 'Responsibility description is required' });
    }

    const trimmedDescription = description.trim();
    const targetUserId = parseInt(userId, 10);

    // Verify employee exists
    const { rows: userRows } = await client.query(
      'SELECT id, name, is_active FROM users WHERE id = $1',
      [targetUserId]
    );

    if (userRows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    if (userRows[0].is_active === false) {
      return res.status(400).json({ error: 'Cannot assign responsibility to a deactivated user' });
    }

    await client.query('BEGIN');

    const { rows: insertRows } = await client.query(
      `INSERT INTO responsibilities (user_id, description, created_by)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [targetUserId, trimmedDescription, req.user.id]
    );

    const newResp = insertRows[0];

    // Audit log
    await logAudit(client, {
      userId: req.user.id,
      action: 'RESPONSIBILITY_CREATED',
      entityId: newResp.id,
      oldValue: null,
      newValue: {
        id: newResp.id,
        user_id: targetUserId,
        description: trimmedDescription,
      },
      ipAddress: req.ip || req.headers['x-forwarded-for'],
    });

    await client.query('COMMIT');

    // In-app notification to employee
    createNotification({
      recipientIds: [targetUserId],
      senderId: req.user.id,
      section: 'responsibilities',
      title: 'New Responsibility Assigned',
      message: `Admin assigned you a new responsibility: "${trimmedDescription.slice(0, 80)}${trimmedDescription.length > 80 ? '...' : ''}"`,
      entityType: 'responsibility',
      entityId: newResp.id,
      actionUrl: `/employee/profile?tab=responsibilities`,
    }).catch(() => {});

    res.status(201).json({ responsibility: newResp });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('POST /api/responsibilities error:', err);
    res.status(500).json({ error: 'Failed to create responsibility' });
  } finally {
    client.release();
  }
});

/**
 * PATCH /api/responsibilities/:id/acknowledge
 * Employee only: Confirm completion of a responsibility.
 * - Transitions state from Pending -> Awaiting Admin Verification
 */
router.patch('/:id/acknowledge', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    return res.status(400).json({ error: 'Invalid responsibility ID' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Concurrency lock
    const { rows } = await client.query(
      `SELECT r.*, u.name as employee_name
       FROM responsibilities r
       JOIN users u ON u.id = r.user_id
       WHERE r.id = $1 FOR UPDATE`,
      [id]
    );

    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Responsibility not found' });
    }

    const resp = rows[0];

    // Ownership check: only the assigned employee can acknowledge
    if (resp.user_id !== req.user.id) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Access denied: You can only acknowledge your own responsibilities.' });
    }

    // State check: cannot acknowledge if already acknowledged
    if (resp.employee_acknowledged) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'This responsibility has already been acknowledged.' });
    }

    // Cannot acknowledge if somehow already verified
    if (resp.admin_verified) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'This responsibility has already been verified and completed.' });
    }

    const { rows: updatedRows } = await client.query(
      `UPDATE responsibilities
       SET employee_acknowledged = TRUE,
           employee_acknowledged_at = NOW(),
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    const updatedResp = updatedRows[0];

    // Audit log
    await logAudit(client, {
      userId: req.user.id,
      action: 'RESPONSIBILITY_ACKNOWLEDGED',
      entityId: id,
      oldValue: {
        employee_acknowledged: false,
        admin_verified: false,
      },
      newValue: {
        employee_acknowledged: true,
        employee_acknowledged_at: updatedResp.employee_acknowledged_at,
        admin_verified: false,
      },
      ipAddress: req.ip || req.headers['x-forwarded-for'],
    });

    await client.query('COMMIT');

    // In-app notification to all Admins
    pool.query(`SELECT id FROM users WHERE role = 'admin' AND is_active IS NOT FALSE`)
      .then(({ rows: adminRows }) => {
        const adminIds = adminRows.map(a => a.id);
        if (adminIds.length > 0) {
          createNotification({
            recipientIds: adminIds,
            senderId: req.user.id,
            section: 'responsibilities',
            title: 'Responsibility Submitted for Verification',
            message: `${resp.employee_name} has marked a responsibility as completed and is awaiting Admin verification.`,
            entityType: 'responsibility',
            entityId: id,
            actionUrl: `/admin/staff/${resp.user_id}?tab=responsibilities`,
          }).catch(() => {});
        }
      })
      .catch(() => {});

    res.json({ responsibility: updatedResp });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('PATCH /api/responsibilities/:id/acknowledge error:', err);
    res.status(500).json({ error: 'Failed to acknowledge responsibility' });
  } finally {
    client.release();
  }
});

/**
 * PATCH /api/responsibilities/:id/verify
 * Admin only: Formally verify and complete an acknowledged responsibility.
 * - Transitions state from Awaiting Admin Verification -> Completed
 */
router.patch('/:id/verify', requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    return res.status(400).json({ error: 'Invalid responsibility ID' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT * FROM responsibilities WHERE id = $1 FOR UPDATE`,
      [id]
    );

    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Responsibility not found' });
    }

    const resp = rows[0];

    // Must be acknowledged first
    if (!resp.employee_acknowledged) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Cannot verify: Employee has not acknowledged completion yet.' });
    }

    if (resp.admin_verified) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'This responsibility is already verified and completed.' });
    }

    const { rows: updatedRows } = await client.query(
      `UPDATE responsibilities
       SET admin_verified = TRUE,
           admin_verified_at = NOW(),
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    const updatedResp = updatedRows[0];

    // Audit log
    await logAudit(client, {
      userId: req.user.id,
      action: 'RESPONSIBILITY_VERIFIED',
      entityId: id,
      oldValue: {
        employee_acknowledged: true,
        admin_verified: false,
      },
      newValue: {
        employee_acknowledged: true,
        admin_verified: true,
        admin_verified_at: updatedResp.admin_verified_at,
      },
      ipAddress: req.ip || req.headers['x-forwarded-for'],
    });

    await client.query('COMMIT');

    // Notify the employee
    createNotification({
      recipientIds: [resp.user_id],
      senderId: req.user.id,
      section: 'responsibilities',
      title: 'Responsibility Verified & Completed',
      message: `Admin has verified your responsibility: "${resp.description.slice(0, 80)}${resp.description.length > 80 ? '...' : ''}"`,
      entityType: 'responsibility',
      entityId: id,
      actionUrl: `/employee/profile?tab=responsibilities`,
    }).catch(() => {});

    res.json({ responsibility: updatedResp });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('PATCH /api/responsibilities/:id/verify error:', err);
    res.status(500).json({ error: 'Failed to verify responsibility' });
  } finally {
    client.release();
  }
});

/**
 * PATCH /api/responsibilities/:id/reset-verification
 * Admin only: Reverse admin verification.
 * - Transitions state from Completed -> Awaiting Admin Verification
 * - Preserves employee acknowledgement.
 */
router.patch('/:id/reset-verification', requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    return res.status(400).json({ error: 'Invalid responsibility ID' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT * FROM responsibilities WHERE id = $1 FOR UPDATE`,
      [id]
    );

    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Responsibility not found' });
    }

    const resp = rows[0];

    if (!resp.admin_verified) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Responsibility is not currently verified.' });
    }

    const { rows: updatedRows } = await client.query(
      `UPDATE responsibilities
       SET admin_verified = FALSE,
           admin_verified_at = NULL,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    const updatedResp = updatedRows[0];

    // Audit log
    await logAudit(client, {
      userId: req.user.id,
      action: 'RESPONSIBILITY_VERIFICATION_REVERSED',
      entityId: id,
      oldValue: {
        employee_acknowledged: true,
        admin_verified: true,
      },
      newValue: {
        employee_acknowledged: true,
        admin_verified: false,
      },
      ipAddress: req.ip || req.headers['x-forwarded-for'],
    });

    await client.query('COMMIT');

    res.json({ responsibility: updatedResp });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('PATCH /api/responsibilities/:id/reset-verification error:', err);
    res.status(500).json({ error: 'Failed to reverse verification' });
  } finally {
    client.release();
  }
});

/**
 * PATCH /api/responsibilities/:id/reset-acknowledgement
 * Admin only: Reset employee acknowledgement.
 * - Transitions state from Awaiting Verification or Completed -> Pending
 * - Clears employee_acknowledged and admin_verified.
 */
router.patch('/:id/reset-acknowledgement', requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    return res.status(400).json({ error: 'Invalid responsibility ID' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT * FROM responsibilities WHERE id = $1 FOR UPDATE`,
      [id]
    );

    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Responsibility not found' });
    }

    const resp = rows[0];

    if (!resp.employee_acknowledged) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Responsibility is already in Pending state.' });
    }

    const { rows: updatedRows } = await client.query(
      `UPDATE responsibilities
       SET employee_acknowledged = FALSE,
           employee_acknowledged_at = NULL,
           admin_verified = FALSE,
           admin_verified_at = NULL,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    const updatedResp = updatedRows[0];

    // Audit log
    await logAudit(client, {
      userId: req.user.id,
      action: 'RESPONSIBILITY_ACKNOWLEDGEMENT_RESET',
      entityId: id,
      oldValue: {
        employee_acknowledged: resp.employee_acknowledged,
        admin_verified: resp.admin_verified,
      },
      newValue: {
        employee_acknowledged: false,
        admin_verified: false,
      },
      ipAddress: req.ip || req.headers['x-forwarded-for'],
    });

    await client.query('COMMIT');

    // Notify employee that their acknowledgement was reset
    createNotification({
      recipientIds: [resp.user_id],
      senderId: req.user.id,
      section: 'responsibilities',
      title: 'Responsibility Reset to Pending',
      message: `Admin has reset the completion status for your responsibility: "${resp.description.slice(0, 80)}${resp.description.length > 80 ? '...' : ''}"`,
      entityType: 'responsibility',
      entityId: id,
      actionUrl: `/employee/profile?tab=responsibilities`,
    }).catch(() => {});

    res.json({ responsibility: updatedResp });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('PATCH /api/responsibilities/:id/reset-acknowledgement error:', err);
    res.status(500).json({ error: 'Failed to reset acknowledgement' });
  } finally {
    client.release();
  }
});

/**
 * DELETE /api/responsibilities/:id
 * Admin only: Delete a responsibility.
 */
router.delete('/:id', requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    return res.status(400).json({ error: 'Invalid responsibility ID' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT * FROM responsibilities WHERE id = $1 FOR UPDATE`,
      [id]
    );

    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Responsibility not found' });
    }

    const resp = rows[0];

    await client.query('DELETE FROM responsibilities WHERE id = $1', [id]);

    await logAudit(client, {
      userId: req.user.id,
      action: 'RESPONSIBILITY_DELETED',
      entityId: id,
      oldValue: resp,
      newValue: null,
      ipAddress: req.ip || req.headers['x-forwarded-for'],
    });

    await client.query('COMMIT');

    res.json({ message: 'Responsibility deleted successfully' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('DELETE /api/responsibilities/:id error:', err);
    res.status(500).json({ error: 'Failed to delete responsibility' });
  } finally {
    client.release();
  }
});

module.exports = router;
