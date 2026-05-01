// server/routes/attendance.js
const router = require('express').Router();
const pool = require('../db');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { getISTDate } = require('../utils/date');

// Helper: get IST date string removed in favor of shared util

// POST /api/attendance/checkin
router.post('/checkin', authenticate, async (req, res) => {
  try {
    const { lat, lng } = req.body;
    const userId = req.user.id;
    const today = getISTDate();
    console.log(`[CheckIn] User ${userId} checking in for ${today}`);

    // Check for existing record today
    const { rows: existing } = await pool.query(
      'SELECT id, check_in FROM attendance WHERE user_id = $1 AND date = $2::date',
      [userId, today]
    );

    if (existing.length > 0 && existing[0].check_in) {
      console.log(`[CheckIn] User ${userId} already checked in according to DB check`);
      return res.status(400).json({ error: 'Already checked in today' });
    }

    const now = new Date().toISOString();

    let row;
    if (existing.length > 0) {
      // Row exists but no check_in (edge case), update it
      const { rows } = await pool.query(
        `UPDATE attendance SET check_in = $1, lat = $2, lng = $3
         WHERE user_id = $4 AND date = $5::date
         RETURNING *`,
        [now, lat || null, lng || null, userId, today]
      );
      row = rows[0];
    } else {
      const { rows } = await pool.query(
        `INSERT INTO attendance (user_id, check_in, lat, lng, date)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [userId, now, lat || null, lng || null, today]
      );
      row = rows[0];
    }

    res.json({ message: 'Checked in successfully', attendance: row });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ error: 'Already checked in today' });
    }
    console.error('Check-in error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/attendance/checkout
router.post('/checkout', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const today = getISTDate();

    const { rows: existing } = await pool.query(
      'SELECT id, check_in, check_out FROM attendance WHERE user_id = $1 AND date = $2::date',
      [userId, today]
    );

    if (!existing.length || !existing[0].check_in) {
      return res.status(400).json({ error: 'Please check in first' });
    }

    if (existing[0].check_out) {
      return res.status(400).json({ error: 'Already checked out today' });
    }

    const now = new Date().toISOString();
    const { rows } = await pool.query(
      `UPDATE attendance SET check_out = $1
       WHERE user_id = $2 AND date = $3::date
       RETURNING *`,
      [now, userId, today]
    );

    res.json({ message: 'Checked out successfully', attendance: rows[0] });
  } catch (err) {
    console.error('Check-out error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/attendance/today
// Returns all users (Admin + Employees) and their attendance status for today
router.get('/today', authenticate, async (req, res) => {
  try {
    const today = getISTDate();

    const { rows } = await pool.query(
      `SELECT 
         u.id as user_id, u.name, u.role, u.department,
         a.check_in, a.check_out, a.lat, a.lng, a.date,
         CASE
           WHEN a.id IS NULL THEN 'absent'
           WHEN a.check_out IS NOT NULL THEN 'completed'
           WHEN a.check_in IS NOT NULL THEN 'working'
           ELSE 'absent'
         END AS status
       FROM users u
       LEFT JOIN attendance a ON a.user_id = u.id AND a.date = $1::date
       ORDER BY a.check_in ASC NULLS LAST, u.name ASC`,
      [today]
    );

    // Mask GPS coordinates for non-admins
    const sanitizedRows = rows.map(r => {
      if (req.user.role === 'admin' || r.user_id === req.user.id) return r;
      const { lat, lng, ...rest } = r;
      return { ...rest, lat: null, lng: null };
    });

    // Also find the current user's specific record for the dashboard card
    const myRecord = rows.find(r => r.user_id === req.user.id) || {};

    console.log(`[Today] User ${req.user.id} requested team attendance for ${today}.`);
    res.json({ 
      attendance: sanitizedRows, 
      my_attendance: myRecord,
      date: today 
    });
  } catch (err) {
    console.error('Today attendance error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/attendance/all
router.get('/all', authenticate, async (req, res) => {
  try {
    const { page = 1, limit = 50, from, to } = req.query;
    const offset = (page - 1) * limit;

    let dateFilter = '';
    const params = [parseInt(limit), offset];
    if (from && to) {
      params.push(from, to);
      dateFilter = `AND a.date BETWEEN $${params.length - 1} AND $${params.length}`;
    }

    const { rows } = await pool.query(
      `SELECT 
         u.id as user_id, u.name, u.role, u.department,
         a.check_in, a.check_out, a.lat, a.lng, a.date,
         CASE
           WHEN a.id IS NULL THEN 'absent'
           WHEN a.check_out IS NOT NULL THEN 'completed'
           WHEN a.check_in IS NOT NULL THEN 'working'
           ELSE 'absent'
         END AS status
       FROM users u
       LEFT JOIN attendance a ON a.user_id = u.id
       WHERE 1=1 ${dateFilter}
       ORDER BY a.date DESC, a.check_in ASC NULLS LAST, u.name
       LIMIT $1 OFFSET $2`,
      params
    );

    // Mask GPS coordinates for non-admins
    const sanitizedRows = rows.map(r => {
      if (req.user.role === 'admin' || r.user_id === req.user.id) return r;
      const { lat, lng, ...rest } = r;
      return { ...rest, lat: null, lng: null };
    });

    res.json({ attendance: sanitizedRows, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    console.error('All attendance error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
