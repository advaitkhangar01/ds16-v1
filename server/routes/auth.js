// server/routes/auth.js
// POST /api/auth/login, POST /api/auth/logout, GET /api/auth/users

const router = require('express').Router();
const bcrypt = require('bcryptjs');
const pool = require('../db');
const { signToken, authenticate } = require('../middleware/auth');

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const { rows } = await pool.query(
      'SELECT * FROM users WHERE username = $1',
      [username.toLowerCase().trim()]
    );

    const user = rows[0];
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (user.is_active === false) {
      return res.status(403).json({ error: 'This account has been deactivated. Please contact administrator.' });
    }

    const token = signToken(user.id);
    const isProd = process.env.NODE_ENV === 'production';

    // Set HTTP-only cookie for secure media and file authorization
    res.cookie('ds16_token', token, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: '/',
    });

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        role: user.role,
        department: user.department,
        phone: user.phone,
        username: user.username,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/logout - Clear HTTP-only session cookie
router.post('/logout', (req, res) => {
  res.clearCookie('ds16_token', { path: '/' });
  res.json({ message: 'Logged out successfully' });
});

// GET /api/auth/users
router.get('/users', authenticate, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT id, name, username, role, department FROM users WHERE is_active IS NOT FALSE ORDER BY name ASC');
    res.json({ users: rows });
  } catch (err) {
    console.error('Fetch users error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
