// server/routes/settings.js
// Settings API — User management (admin) + password change (self)

const router = require('express').Router();
const bcrypt = require('bcryptjs');
const pool = require('../db');
const { authenticate, requireAdmin } = require('../middleware/auth');

// All settings routes require authentication
router.use(authenticate);

// ─── Admin: List all users ────────────────────────────────────────────────────
router.get('/users', requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, name, username, role, department, phone, created_at FROM users ORDER BY name ASC'
    );
    res.json({ users: rows });
  } catch (err) {
    console.error('Settings: fetch users error:', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// ─── Admin: Create user ──────────────────────────────────────────────────────
router.post('/users', requireAdmin, async (req, res) => {
  try {
    const { name, username, password, role, department, phone } = req.body;

    if (!name?.trim() || !username?.trim() || !password?.trim()) {
      return res.status(400).json({ error: 'Name, username and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const validRoles = ['admin', 'employee'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: 'Role must be admin or employee' });
    }

    // Check duplicate username
    const existing = await pool.query(
      'SELECT id FROM users WHERE username = $1',
      [username.toLowerCase().trim()]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Username already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const { rows } = await pool.query(
      `INSERT INTO users (name, username, password_hash, role, department, phone)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, name, username, role, department, phone, created_at`,
      [name.trim(), username.toLowerCase().trim(), passwordHash, role, department?.trim() || null, phone?.trim() || null]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Settings: create user error:', err);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// ─── Admin: Delete user ──────────────────────────────────────────────────────
router.delete('/users/:id', requireAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);

    // Prevent self-deletion
    if (userId === req.user.id) {
      return res.status(400).json({ error: 'You cannot delete your own account' });
    }

    const { rowCount } = await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    if (rowCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ message: 'User deleted successfully' });
  } catch (err) {
    console.error('Settings: delete user error:', err);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// ─── Admin: Reset user password ──────────────────────────────────────────────
router.patch('/users/:id/reset-password', requireAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    const { rowCount } = await pool.query(
      'UPDATE users SET password_hash = $1 WHERE id = $2',
      [passwordHash, userId]
    );
    if (rowCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ message: 'Password reset successfully' });
  } catch (err) {
    console.error('Settings: reset password error:', err);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// ─── Self: Change own password ───────────────────────────────────────────────
router.patch('/change-password', async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new password are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }

    // Verify current password
    const { rows } = await pool.query(
      'SELECT password_hash FROM users WHERE id = $1',
      [req.user.id]
    );
    if (!rows[0]) {
      return res.status(404).json({ error: 'User not found' });
    }

    const valid = await bcrypt.compare(currentPassword, rows[0].password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await pool.query(
      'UPDATE users SET password_hash = $1 WHERE id = $2',
      [passwordHash, req.user.id]
    );

    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    console.error('Settings: change password error:', err);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// ─── Admin: App Settings ─────────────────────────────────────────────────────

router.get('/app', requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM app_settings ORDER BY key ASC');
    const settings = rows.reduce((acc, row) => {
      acc[row.key] = row.value;
      return acc;
    }, {});
    res.json(settings);
  } catch (err) {
    console.error('Settings: fetch app settings error:', err);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

router.post('/app', requireAdmin, async (req, res) => {
  try {
    const settings = req.body; // { key: value, ... }
    for (const [key, value] of Object.entries(settings)) {
      await pool.query(
        'INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2, NOW()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()',
        [key, String(value)]
      );
    }
    res.json({ message: 'Settings updated successfully' });
  } catch (err) {
    console.error('Settings: update app settings error:', err);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// ─── Admin: Holidays ─────────────────────────────────────────────────────────

router.get('/holidays', requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM holidays ORDER BY date ASC');
    res.json(rows);
  } catch (err) {
    console.error('Settings: fetch holidays error:', err);
    res.status(500).json({ error: 'Failed to fetch holidays' });
  }
});

router.post('/holidays', requireAdmin, async (req, res) => {
  try {
    const { date, name, is_paid } = req.body;
    const { rows } = await pool.query(
      'INSERT INTO holidays (date, name, is_paid) VALUES ($1, $2, $3) RETURNING *',
      [date, name, is_paid !== false]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Settings: create holiday error:', err);
    res.status(500).json({ error: 'Failed to create holiday' });
  }
});

router.delete('/holidays/:id', requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM holidays WHERE id = $1', [req.params.id]);
    res.json({ message: 'Holiday deleted' });
  } catch (err) {
    console.error('Settings: delete holiday error:', err);
    res.status(500).json({ error: 'Failed to delete holiday' });
  }
});

module.exports = router;
