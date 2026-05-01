const router = require('express').Router();
const pool = require('../db');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { checkProjectAccess } = require('../middleware/accessControl');

// GET /api/invoices - List all invoices
router.get('/', authenticate, async (req, res) => {
  try {
    const { project_id, client_id, start_date, end_date, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const limitInt = parseInt(limit);

    let query = `
      SELECT i.*, p.name as project_name, c.name as client_name_full
      FROM invoices i
      LEFT JOIN projects p ON p.id = i.project_id
      LEFT JOIN clients c ON c.id = i.client_id
    `;
    const params = [];
    let idx = 1;

    const conditions = [];
    if (project_id) {
      conditions.push(`i.project_id = $${idx++}`);
      params.push(project_id);
    }
    if (client_id) {
      conditions.push(`i.client_id = $${idx++}`);
      params.push(client_id);
    }
    if (start_date) {
      conditions.push(`i.date >= $${idx++}`);
      params.push(start_date);
    }
    if (end_date) {
      conditions.push(`i.date <= $${idx++}`);
      params.push(end_date);
    }

    if (req.user.role !== 'admin') {
      // Employees only see invoices for projects they are assigned to
      query += ` JOIN project_assignments pa ON pa.project_id = i.project_id `;
      conditions.push(`pa.user_id = $${idx++}`);
      params.push(req.user.id);
    }

    if (conditions.length > 0) {
      query += ` WHERE ` + conditions.join(' AND ');
    }

    query += ` ORDER BY i.date DESC, i.created_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(limitInt, offset);
    
    const { rows } = await pool.query(query, params);
    res.json({ invoices: rows, page: parseInt(page), limit: limitInt });
  } catch (err) {
    console.error('Get invoices error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/invoices/:id - Get specific invoice details
router.get('/:id', authenticate, checkProjectAccess({ idIsResource: 'invoice' }), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT i.*, p.name as project_name, c.name as client_name_full
       FROM invoices i
       LEFT JOIN projects p ON p.id = i.project_id
       LEFT JOIN clients c ON c.id = i.client_id
       WHERE i.id = $1`,
      [req.params.id]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }
    
    res.json({ invoice: rows[0] });
  } catch (err) {
    console.error('Get invoice error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/invoices - Create or update an invoice (UPSERT)
router.post('/', authenticate, requireAdmin, async (req, res) => {
  try {
    const { 
      invoice_no, 
      project_id, 
      client_id, 
      client_name, 
      amount, 
      date, 
      items, 
      tax_details, 
      status,
      due_date 
    } = req.body;

    if (!invoice_no || !client_name || !amount || !items) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Use native SQL ON CONFLICT for true atomic UPSERT
    const query = `
      INSERT INTO invoices (
        invoice_no, project_id, client_id, client_name, amount, 
        date, items, tax_details, status, due_date, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (invoice_no) 
      DO UPDATE SET 
        project_id = EXCLUDED.project_id,
        client_id = EXCLUDED.client_id,
        client_name = EXCLUDED.client_name,
        amount = EXCLUDED.amount,
        date = EXCLUDED.date,
        items = EXCLUDED.items,
        tax_details = EXCLUDED.tax_details,
        status = EXCLUDED.status,
        due_date = EXCLUDED.due_date
      RETURNING *;
    `;

    const { rows } = await pool.query(query, [
      invoice_no, 
      project_id || null, 
      client_id || null, 
      client_name, 
      amount, 
      date || new Date(), 
      JSON.stringify(items), 
      JSON.stringify(tax_details), 
      status || 'generated', 
      due_date || null, 
      req.user.id
    ]);

    res.status(201).json({ invoice: rows[0] });
  } catch (err) {
    console.error('Create/Update invoice error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/invoices/:id
router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM invoices WHERE id = $1', [req.params.id]);
    res.json({ message: 'Invoice deleted' });
  } catch (err) {
    console.error('Delete invoice error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
