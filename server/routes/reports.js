// server/routes/reports.js
// Isolated analytical routes for spreadsheet generation

const router = require('express').Router();
const pool = require('../db');
const { authenticate, requireAdmin } = require('../middleware/auth');

// 1. Attendance Analytical Report Endpoint
router.get('/attendance', authenticate, requireAdmin, async (req, res) => {
  try {
    const { user_id, start_date, end_date } = req.query;
    let query = `
      SELECT 
        a.id, a.user_id, a.date, a.check_in, a.check_out, LOWER(a.status) AS status, 
        a.is_late, a.late_minutes, a.hours_worked, a.checkin_distance, a.checkin_zone,
        u.name as employee_name, u.role, u.department
      FROM attendance a
      JOIN users u ON u.id = a.user_id
      WHERE 1=1
    `;
    const params = [];

    if (user_id) {
      params.push(user_id);
      query += ` AND a.user_id = $${params.length}`;
    }
    if (start_date) {
      params.push(start_date);
      query += ` AND a.date >= $${params.length}::date`;
    }
    if (end_date) {
      params.push(end_date);
      query += ` AND a.date <= $${params.length}::date`;
    }

    query += ' ORDER BY a.date DESC, u.name ASC';
    const { rows } = await pool.query(query, params);
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('Error fetching attendance reports:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// 2. Financial Ledger Report Endpoint
router.get('/finances', authenticate, requireAdmin, async (req, res) => {
  try {
    const { project_id, start_date, end_date, type, category } = req.query;
    let query = `
      SELECT 
        t.id, t.type, t.category, t.amount, t.date, t.description, t.reference_id, t.created_at,
        p.name as project_name, 
        v.name as vendor_name,
        u.name as employee_name,
        cu.name as creator_name
      FROM transactions t
      LEFT JOIN projects p ON p.id = t.project_id
      LEFT JOIN vendors v ON v.id = t.vendor_id
      LEFT JOIN users u ON u.id = t.employee_id
      LEFT JOIN users cu ON cu.id = t.created_by
      WHERE 1=1
    `;
    const params = [];

    if (project_id) {
      params.push(project_id);
      query += ` AND t.project_id = $${params.length}`;
    }
    if (start_date) {
      params.push(start_date);
      query += ` AND t.date >= $${params.length}::date`;
    }
    if (end_date) {
      params.push(end_date);
      query += ` AND t.date <= $${params.length}::date`;
    }
    if (type) {
      params.push(type);
      query += ` AND t.type = $${params.length}`;
    }
    if (category) {
      params.push(category);
      query += ` AND t.category = $${params.length}`;
    }

    query += ' ORDER BY t.date DESC, t.id DESC';
    const { rows } = await pool.query(query, params);
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('Error fetching financial reports:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// 3. Payroll Ledger Report Endpoint
router.get('/payroll', authenticate, requireAdmin, async (req, res) => {
  try {
    const { department, month, year } = req.query;
    let query = `
      SELECT 
        p.id, p.user_id, p.month, p.year, p.base_salary, p.bonus, p.incentives, p.deductions, p.net_paid, p.payment_date, p.status,
        u.name as employee_name, u.role, u.department
      FROM payroll p
      JOIN users u ON u.id = p.user_id
      WHERE 1=1
    `;
    const params = [];

    if (department) {
      params.push(department);
      query += ` AND u.department = $${params.length}`;
    }
    if (month) {
      params.push(parseInt(month));
      query += ` AND p.month = $${params.length}`;
    }
    if (year) {
      params.push(parseInt(year));
      query += ` AND p.year = $${params.length}`;
    }

    query += ' ORDER BY p.year DESC, p.month DESC, u.name ASC';
    const { rows } = await pool.query(query, params);
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('Error fetching payroll reports:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// 4. Invoices Telemetry Report Endpoint
router.get('/invoices', authenticate, requireAdmin, async (req, res) => {
  try {
    const { client_id, project_id, status, start_date, end_date } = req.query;
    let query = `
      SELECT 
        i.id, i.invoice_no, i.client_name, i.amount, i.date, i.status, i.due_date, i.created_at,
        i.tax_details,
        p.name as project_name,
        u.name as creator_name
      FROM invoices i
      LEFT JOIN projects p ON p.id = i.project_id
      LEFT JOIN users u ON u.id = i.created_by
      WHERE 1=1
    `;
    const params = [];

    if (client_id) {
      params.push(client_id);
      query += ` AND i.client_id = $${params.length}`;
    }
    if (project_id) {
      params.push(project_id);
      query += ` AND i.project_id = $${params.length}`;
    }
    if (status) {
      params.push(status);
      query += ` AND i.status = $${params.length}`;
    }
    if (start_date) {
      params.push(start_date);
      query += ` AND i.date >= $${params.length}::date`;
    }
    if (end_date) {
      params.push(end_date);
      query += ` AND i.date <= $${params.length}::date`;
    }

    query += ' ORDER BY i.date DESC, i.id DESC';
    const { rows } = await pool.query(query, params);
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('Error fetching invoice reports:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// 5. Projects & Stages Report Endpoint
router.get('/projects', authenticate, requireAdmin, async (req, res) => {
  try {
    const { status, type, start_date, end_date } = req.query;
    let query = `
      SELECT 
        p.id, p.name, p.client_name, p.type, p.location, p.area_sq_ft, p.structural_engineer, p.status, p.start_date, p.created_at,
        u.name as creator_name,
        (SELECT COUNT(*) FROM project_stages ps WHERE ps.project_id = p.id AND ps.status = 'completed') as completed_stages,
        (SELECT COUNT(*) FROM project_stages ps WHERE ps.project_id = p.id) as total_stages,
        (SELECT stage_name FROM project_stages ps WHERE ps.project_id = p.id AND ps.status = 'in_progress' ORDER BY ps.id ASC LIMIT 1) as active_stage
      FROM projects p
      LEFT JOIN users u ON u.id = p.created_by
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      params.push(status);
      query += ` AND p.status = $${params.length}`;
    }
    if (type) {
      params.push(type);
      query += ` AND p.type = $${params.length}`;
    }
    if (start_date) {
      params.push(start_date);
      query += ` AND p.start_date >= $${params.length}::date`;
    }
    if (end_date) {
      params.push(end_date);
      query += ` AND p.start_date <= $${params.length}::date`;
    }

    query += ' ORDER BY p.start_date DESC, p.id DESC';
    const { rows } = await pool.query(query, params);
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('Error fetching project reports:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
