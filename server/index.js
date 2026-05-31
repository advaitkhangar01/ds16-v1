// server/index.js
// Main Express entry point — DS16 backend server

require('dotenv').config({ path: require('path').join(__dirname, '.env'), override: true });
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');

const authRoutes = require('./routes/auth');
const attendanceRoutes = require('./routes/attendance');
const projectsRoutes = require('./routes/projects');
const dashboardRoutes = require('./routes/dashboard');
const vendorRoutes = require('./routes/vendors');
const clientRoutes = require('./routes/clients');
const documentsRoutes = require('./routes/documents');
const { router: tasksRoutes, cleanupOldTasks } = require('./routes/tasks');
const settingsRoutes = require('./routes/settings');
const financeRoutes = require('./routes/finances');
const accountingRoutes = require('./routes/accounting');
const invoiceRoutes = require('./routes/invoices');
const monthlyCloseRoutes = require('./routes/monthlyClose');

const leaveRoutes = require('./routes/leaves');
const reportsRoutes = require('./routes/reports');
const staffRoutes = require('./routes/staff');

const app = express();

// Security headers
app.use(helmet());

// CORS — in development allow all origins; in production use whitelist
const isDev = process.env.NODE_ENV !== 'production';
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (curl, Postman, same-server)
      if (!origin) return callback(null, true);
      // In development: allow everything
      if (isDev) return callback(null, true);
      // In production: check whitelist
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(null, false); // proper CORS rejection (not a 500)
    },
    credentials: true,
  })
);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging (combined in prod, dev in dev)
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString(), service: 'DS16 API' });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/projects', projectsRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/vendors', vendorRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/documents', documentsRoutes);
app.use('/api/tasks', tasksRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/finances', financeRoutes);
app.use('/api/accounting', accountingRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/monthly-close', monthlyCloseRoutes);

app.use('/api/leaves', leaveRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/staff', staffRoutes);

// 404 handler for API routes
app.all(/\/api\/.*/, (req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.originalUrl} not found` });
});

// Serve frontend in production (or if built locally)
const clientDistPath = path.join(__dirname, '../client/dist');
const uploadsPath = path.join(__dirname, 'uploads');
const projectsUploadsPath = path.join(uploadsPath, 'projects');

// Ensure upload directories exist
const fs = require('fs');
if (!fs.existsSync(uploadsPath)) fs.mkdirSync(uploadsPath, { recursive: true });
if (!fs.existsSync(projectsUploadsPath)) fs.mkdirSync(projectsUploadsPath, { recursive: true });

app.use('/uploads', express.static(uploadsPath));
app.use(express.static(clientDistPath));

// Catch-all route to serve React app for non-API requests
app.get(/(.*)/, (req, res) => {
  res.sendFile(path.join(clientDistPath, 'index.html'));
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 DS16 API running on port ${PORT} (${process.env.NODE_ENV || 'development'})`);
});

// Background Tasks - Only run on the first instance in cluster mode
const isPrimaryInstance = process.env.NODE_APP_INSTANCE === undefined || process.env.NODE_APP_INSTANCE === '0';

if (cleanupOldTasks && isPrimaryInstance) {
  setInterval(cleanupOldTasks, 24 * 60 * 60 * 1000);
  setTimeout(cleanupOldTasks, 5000);
}

const autoCheckout = attendanceRoutes.autoCheckoutPendingRecords;
if (autoCheckout && isPrimaryInstance) {
  // Run auto-checkout cleanup every hour
  setInterval(autoCheckout, 1 * 60 * 60 * 1000);
  // Also run 5 seconds after startup for immediate cleanup of past days
  setTimeout(autoCheckout, 5000);
}

module.exports = app;
