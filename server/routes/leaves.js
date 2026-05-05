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

    if (req.user.role !== USER_ROLES.ADMIN) {
      query += ` WHERE l.user_id = $1`;
      params.push(req.user.id);
    }

    query += ` ORDER BY l.start_date DESC`;

    const { rows } = await pool.query(query, params);
    res.json({ leaves: rows });
  } catch (err) {
    console.error('Error fetching leaves:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/leaves - Apply for leave
router.post('/', authenticate, async (req, res) => {
  try {
    const { start_date, end_date, type, reason } = req.body;
    const userId = req.user.id;

    if (!start_date || !end_date || !type) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const { rows } = await pool.query(
      `INSERT INTO leave_requests (user_id, start_date, end_date, type, reason, status)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [userId, start_date, end_date, type, reason, LEAVE_STATUS.PENDING]
    );

    res.status(201).json({ message: 'Leave request submitted', leave: rows[0] });
  } catch (err) {
    console.error('Error applying for leave:', err);
    res.status(500).json({ error: 'Server error' });
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
    console.error('Error updating leave status:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
