const router = require('express').Router();
const pool = require('../db');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { LEAVE_STATUS, USER_ROLES } = require('../utils/constants');

// GET /api/leaves - Get leaves
// Admins see all, employees see their own
router.get('/', authenticate, async (req, res) => {
  try {
    let query = `
      SELECT l.*, u.name as user_name, u.department, r.name as reviewer_name
      FROM leave_requests l
      JOIN users u ON l.user_id = u.id
      LEFT JOIN users r ON l.reviewed_by = r.id
    `;
    const params = [];
    console.log('[Leaves] Fetching leaves for user:', req.user.id, 'Role:', req.user.role);

    if (req.user.role !== USER_ROLES.ADMIN) {
      query += ` WHERE l.user_id = $1`;
      params.push(req.user.id);
    }

    query += ` ORDER BY l.start_date DESC`;
    console.log('[Leaves] Final Query:', query);
    console.log('[Leaves] Params:', params);

    const { rows } = await pool.query(query, params);
    console.log('[Leaves] Found rows:', rows.length);
    res.json({ leaves: rows });
  } catch (err) {
    console.error('[Leaves Error] GET /:', err.message);
    console.error(err.stack);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

// POST /api/leaves - Apply for leave/requests
router.post('/', authenticate, async (req, res) => {
  try {
    const { start_date, end_date, type, reason, amount } = req.body;
    const userId = req.user.id;

    // I1: Validate that start_date is a real, parseable date
    if (!start_date || isNaN(new Date(start_date).getTime())) {
      return res.status(400).json({ error: 'A valid start_date is required (YYYY-MM-DD)' });
    }

    if (!type) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Set end_date same as start_date for single-day items if missing
    let finalEndDate = end_date || start_date;

    // I2: Ensure end_date is not before start_date
    if (new Date(finalEndDate) < new Date(start_date)) {
      return res.status(400).json({ error: 'End date cannot be before start date' });
    }

    let finalAmount = 0;

    // Enforce amount for advance requests
    if (type === 'advance') {
      finalAmount = parseFloat(amount || 0);
      if (isNaN(finalAmount) || finalAmount <= 0) {
        return res.status(400).json({ error: 'Valid amount is required for salary advance requests' });
      }
    }

    const { rows } = await pool.query(
      `INSERT INTO leave_requests (user_id, start_date, end_date, type, amount, reason, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [userId, start_date, finalEndDate, type, finalAmount, reason, LEAVE_STATUS.PENDING]
    );

    res.status(201).json({ message: 'Request submitted successfully', leave: rows[0] });
  } catch (err) {
    console.error('[Leaves Error] POST /:', err.message);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

// PATCH /api/leaves/:id - Approve/Reject leave
router.patch('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, remarks } = req.body;
    const adminId = req.user.id;

    if (![LEAVE_STATUS.APPROVED, LEAVE_STATUS.REJECTED].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const { rows } = await pool.query(
      `UPDATE leave_requests 
       SET status = $1, remarks = $2, reviewed_by = $3, updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [status, remarks, adminId, id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Leave request not found' });
    }

    res.json({ message: `Leave request ${status}`, leave: rows[0] });
  } catch (err) {
    console.error('[Leaves Error] PATCH /:id:', err.message);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
});

module.exports = router;
