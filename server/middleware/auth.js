// server/middleware/auth.js
// JWT authentication and role-based access middleware

const jwt = require('jsonwebtoken');
const pool = require('../db');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('JWT_SECRET must be set in production environment');
}
const ACTUAL_SECRET = JWT_SECRET || 'ds16_fallback_secret_change_in_production';

/**
 * Attach user to req.user from Bearer token
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }
    const token = authHeader.slice(7);
    const decoded = jwt.verify(token, ACTUAL_SECRET);

    const { rows } = await pool.query(
      'SELECT id, name, role, department, phone, username FROM users WHERE id = $1',
      [decoded.userId]
    );
    if (!rows[0]) return res.status(401).json({ error: 'User not found' });

    req.user = rows[0];
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
};

/**
 * Require admin role
 */
const requireAdmin = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

/**
 * Require admin or accounts department
 */
const requireAccounting = (req, res, next) => {
  if (req.user?.role === 'admin' || req.user?.role === 'accounts' || req.user?.department?.toLowerCase() === 'accounts') {
    return next();
  }
  return res.status(403).json({ error: 'Accounting or Admin access required' });
};

/**
 * Generate signed JWT
 */
const signToken = (userId) => {
  return jwt.sign({ userId }, ACTUAL_SECRET, { expiresIn: '7d' });
};

module.exports = { authenticate, requireAdmin, requireAccounting, signToken };
