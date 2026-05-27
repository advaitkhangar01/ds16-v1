const router = require('express').Router();
const pool = require('../db');
const { authenticate, requireAdmin, requireAccounting } = require('../middleware/auth');
const { checkProjectAccess } = require('../middleware/accessControl');

// GET /api/invoices - List all invoices
router.get('/', authenticate, async (req, res) => {
  if (req.user?.role === 'design_head') {
    return res.status(403).json({ error: 'Design Head is not permitted to view invoices' });
  }
  try {
    const { project_id, client_id, start_date, end_date, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const limitInt = parseInt(limit);

    // 1. Fetch actual invoices matching filters
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

    query += ` ORDER BY i.date DESC, i.created_at DESC`;
    
    const { rows: invoiceRows } = await pool.query(query, params);

    // 2. Fetch active payment stages matching filters
    let stagesQuery = `
      SELECT pps.*, p.name as project_name, c.name as client_name_full, c.id as client_id
      FROM project_payment_stages pps
      JOIN projects p ON p.id = pps.project_id
      LEFT JOIN clients c ON c.id = p.client_id
      WHERE pps.status = 'payment initiated'
    `;
    const stagesParams = [];
    let sIdx = 1;
    
    if (project_id) {
      stagesQuery += ` AND pps.project_id = $${sIdx++}`;
      stagesParams.push(project_id);
    }
    if (client_id) {
      stagesQuery += ` AND p.client_id = $${sIdx++}`;
      stagesParams.push(client_id);
    }
    if (start_date) {
      stagesQuery += ` AND pps.created_at >= $${sIdx++}`;
      stagesParams.push(start_date);
    }
    if (end_date) {
      stagesQuery += ` AND pps.created_at <= $${sIdx++}`;
      stagesParams.push(end_date);
    }

    if (req.user.role !== 'admin') {
      stagesQuery += ` AND EXISTS (SELECT 1 FROM project_assignments pa WHERE pa.project_id = pps.project_id AND pa.user_id = $${sIdx++})`;
      stagesParams.push(req.user.id);
    }

    stagesQuery += ` ORDER BY pps.created_at DESC`;
    const { rows: stageRows } = await pool.query(stagesQuery, stagesParams);

    const virtualInvoices = stageRows.map(stage => ({
      id: `stage-${stage.id}`,
      invoice_no: `${stage.document_type} (Stage)`,
      project_id: stage.project_id,
      client_id: stage.client_id,
      client_name: stage.client_name_full,
      client_name_full: stage.client_name_full,
      project_name: stage.project_name,
      amount: stage.amount,
      date: stage.created_at,
      status: 'draft',
      is_payment_stage: true,
      stage_status: stage.status
    }));

    // 3. Merge, sort, and slice
    const allInvoices = [...invoiceRows, ...virtualInvoices];
    allInvoices.sort((a, b) => new Date(b.date) - new Date(a.date));

    const paginatedInvoices = allInvoices.slice(offset, offset + limitInt);

    res.json({ invoices: paginatedInvoices, page: parseInt(page), limit: limitInt, totalCount: allInvoices.length });
  } catch (err) {
    console.error('Get invoices error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/invoices/latest/number
router.get('/latest/number', authenticate, requireAccounting, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT invoice_no 
      FROM invoices 
      WHERE invoice_no LIKE 'DS16\\\\%' OR invoice_no LIKE 'DS16-%'
      ORDER BY created_at DESC 
      LIMIT 1
    `);
    
    const today = new Date();
    const month = today.getMonth() + 1; // 1-12
    const fullYear = today.getFullYear();
    let startYear, endYear;
    if (month >= 4) {
      startYear = fullYear;
      endYear = fullYear + 1;
    } else {
      startYear = fullYear - 1;
      endYear = fullYear;
    }
    const fyStr = `${String(startYear).slice(-2)}-${String(endYear).slice(-2)}`; // e.g. "25-26"
    
    let nextNum = 1;
    
    if (rows.length > 0) {
      const lastNo = rows[0].invoice_no;
      let lastFY = '';
      let lastCount = 0;
      
      if (lastNo.includes('\\')) {
        const parts = lastNo.split('\\');
        if (parts.length === 3) {
          lastFY = parts[1];
          lastCount = parseInt(parts[2]);
        }
      } else if (lastNo.includes('-')) {
        const parts = lastNo.split('-');
        if (parts.length === 3) {
          lastFY = parts[1];
          lastCount = parseInt(parts[2]);
        }
      }
      
      if (lastCount > 0 && (lastFY === fyStr || lastFY === String(fullYear))) {
        nextNum = lastCount + 1;
      }
    }
    
    const paddedCount = String(nextNum).padStart(2, '0');
    res.json({ nextNo: `DS16\\${fyStr}\\${paddedCount}` });
  } catch (err) {
    console.error('Get latest invoice number error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/invoices/:id - Get specific invoice details
router.get('/:id', authenticate, checkProjectAccess({ idIsResource: 'invoice' }), async (req, res) => {
  if (req.user?.role === 'design_head') {
    return res.status(403).json({ error: 'Design Head is not permitted to view invoices' });
  }
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

// POST /api/invoices - Strictly CREATE a new invoice (no silent overwrites)
// Returns 409 Conflict if the invoice_no already exists
router.post('/', authenticate, requireAccounting, async (req, res) => {
  const client = await pool.connect();
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
      due_date,
      signature_data,
      payment_stage_id
    } = req.body;

    if (!invoice_no || !client_name || !amount || !items) {
      return res.status(400).json({ error: 'Missing required fields: invoice_no, client_name, amount, items' });
    }

    // Validate amount is a positive number
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ error: 'Amount must be a positive number' });
    }

    // Validate status if provided
    const validStatuses = ['draft', 'generated', 'sent', 'paid', 'cancelled'];
    const resolvedStatus = status || 'generated';
    if (!validStatuses.includes(resolvedStatus)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    }

    // Begin atomic transaction
    await client.query('BEGIN');

    // Strict INSERT — will throw a unique_violation (code 23505) if invoice_no already exists
    const query = `
      INSERT INTO invoices (
        invoice_no, project_id, client_id, client_name, amount, 
        date, items, tax_details, status, due_date, signature_data, payment_stage_id, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *;
    `;

    const { rows } = await client.query(query, [
      invoice_no, 
      project_id || null, 
      client_id || null, 
      client_name, 
      parsedAmount, 
      date || new Date(), 
      JSON.stringify(items), 
      JSON.stringify(tax_details || {}), 
      resolvedStatus,
      due_date || null,
      signature_data || null,
      payment_stage_id || null,
      req.user.id
    ]);

    // Automatically update the linked payment stage status to 'bill generated'
    if (payment_stage_id) {
      await client.query(
        `UPDATE project_payment_stages 
         SET status = 'bill generated', updated_at = NOW() 
         WHERE id = $1`,
         [payment_stage_id]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ invoice: rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    // PostgreSQL unique_violation error code
    if (err.code === '23505') {
      return res.status(409).json({ 
        error: 'Invoice number already exists', 
        code: 'DUPLICATE_INVOICE_NO',
        message: `An invoice with number "${req.body.invoice_no}" already exists. Please use a different invoice number.`
      });
    }
    console.error('Create invoice error:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// PATCH /api/invoices/:id/status - Update invoice status and/or signature only
router.patch('/:id/status', authenticate, requireAccounting, async (req, res) => {
  const client = await pool.connect();
  try {
    const { status, signature_data } = req.body;
    const { id } = req.params;

    const validStatuses = ['draft', 'generated', 'sent', 'paid', 'cancelled'];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    }

    // Build update fields dynamically
    const updates = [];
    const params = [];
    let idx = 1;

    if (status) {
      updates.push(`status = $${idx++}`);
      params.push(status);
    }
    if (signature_data !== undefined) {
      updates.push(`signature_data = $${idx++}`);
      params.push(signature_data);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    await client.query('BEGIN');

    params.push(id);
    const query = `UPDATE invoices SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`;
    const { rows } = await client.query(query, params);

    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const invoice = rows[0];

    // Automate payment stage status transitions based on new invoice status
    if (invoice.payment_stage_id) {
      if (status === 'cancelled') {
        // Only revert to 'payment initiated' if no other active invoices are linked
        const { rows: otherInvoices } = await client.query(
          'SELECT id FROM invoices WHERE payment_stage_id = $1 AND id != $2 AND status != \'cancelled\'',
          [invoice.payment_stage_id, invoice.id]
        );
        if (otherInvoices.length === 0) {
          await client.query(
            `UPDATE project_payment_stages 
             SET status = 'payment initiated', updated_at = NOW() 
             WHERE id = $1`,
            [invoice.payment_stage_id]
          );
        }
      } else if (status === 'paid') {
        await client.query(
          `UPDATE project_payment_stages 
           SET status = 'paid', updated_at = NOW() 
           WHERE id = $1`,
          [invoice.payment_stage_id]
        );
      }
    }

    await client.query('COMMIT');
    res.json({ invoice });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Update invoice status error:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// POST /api/invoices/:id/mark-paid — Atomic: records finance transaction + marks invoice paid
// Wrapped in a single DB transaction. If either step fails, both are rolled back.
router.post('/:id/mark-paid', authenticate, requireAccounting, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;

    // 1. Fetch invoice to get project/amount details
    const { rows: invoiceRows } = await client.query(
      'SELECT * FROM invoices WHERE id = $1',
      [id]
    );

    if (invoiceRows.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const invoice = invoiceRows[0];

    if (invoice.status === 'paid') {
      return res.status(400).json({ error: 'Invoice is already marked as paid' });
    }

    if (!invoice.project_id) {
      return res.status(400).json({ error: 'Invoice has no linked project. Cannot record income.' });
    }

    const amount = parseFloat(invoice.amount);
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invoice amount must be greater than 0' });
    }

    // Begin atomic transaction
    await client.query('BEGIN');

    // Step 1: Insert finance transaction (table: transactions, matches finances.js schema)
    await client.query(
      `INSERT INTO transactions 
        (type, category, amount, description, project_id, reference_id, date, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        'income',
        'project_receipt',
        amount,
        `Invoice ${invoice.invoice_no} - ${invoice.client_name}`,
        invoice.project_id,
        invoice.invoice_no,
        invoice.date,
        req.user.id
      ]
    );

    // Step 2: Mark invoice as paid
    const { rows: updatedRows } = await client.query(
      `UPDATE invoices SET status = 'paid' WHERE id = $1 RETURNING *`,
      [id]
    );

    // If the invoice is linked to a payment stage, mark the stage as 'paid'
    if (invoice.payment_stage_id) {
      await client.query(
        `UPDATE project_payment_stages 
         SET status = 'paid', updated_at = NOW() 
         WHERE id = $1`,
         [invoice.payment_stage_id]
      );
    }

    // Commit only if both steps succeeded
    await client.query('COMMIT');

    res.json({ 
      invoice: updatedRows[0],
      message: 'Invoice marked as paid and income recorded successfully'
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Mark paid atomic transaction error:', err);
    res.status(500).json({ error: 'Failed to process payment. All changes have been rolled back.' });
  } finally {
    client.release();
  }
});

// DELETE /api/invoices/:id
router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Fetch the invoice to see if it's linked to a payment stage
    const { rows: invoiceRows } = await client.query(
      'SELECT payment_stage_id FROM invoices WHERE id = $1',
      [req.params.id]
    );

    if (invoiceRows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const { payment_stage_id } = invoiceRows[0];

    // 2. Delete the invoice
    await client.query('DELETE FROM invoices WHERE id = $1', [req.params.id]);

    // 3. Revert payment stage status to 'payment initiated' if linked and no other active invoices exist
    if (payment_stage_id) {
      const { rows: otherInvoices } = await client.query(
        'SELECT id FROM invoices WHERE payment_stage_id = $1 AND id != $2 AND status != \'cancelled\'',
        [payment_stage_id, req.params.id]
      );
      if (otherInvoices.length === 0) {
        await client.query(
          `UPDATE project_payment_stages 
           SET status = 'payment initiated', updated_at = NOW() 
           WHERE id = $1`,
          [payment_stage_id]
        );
      }
    }

    await client.query('COMMIT');
    res.json({ message: 'Invoice deleted successfully' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Delete invoice error:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

module.exports = router;
