// server/routes/clients.js
// Advanced Client Management with nested entities (Contacts, Addresses, Banking)

const router = require('express').Router();
const pool = require('../db');
const { authenticate, requireAdmin } = require('../middleware/auth');

// GET /api/clients - Get all clients with their primary contact and project count
router.get('/', authenticate, async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const limitInt = parseInt(limit);

    const { rows } = await pool.query(`
      SELECT 
        c.*,
        cc.name as primary_contact_name,
        cc.phone as primary_contact_phone,
        cc.email as primary_contact_email,
        (SELECT COUNT(*) FROM projects p WHERE p.client_id = c.id) as project_count
      FROM clients c
      LEFT JOIN client_contacts cc ON cc.client_id = c.id AND cc.is_primary = TRUE
      ORDER BY c.name
      LIMIT $1 OFFSET $2
    `, [limitInt, offset]);
    res.json({ clients: rows, page: parseInt(page), limit: limitInt });
  } catch (err) {
    console.error('Clients GET error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/clients/:id - Get full client details
router.get('/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  try {
    const { rows: clientRows } = await pool.query('SELECT * FROM clients WHERE id = $1', [id]);
    if (clientRows.length === 0) return res.status(404).json({ error: 'Client not found' });

    const { rows: contacts } = await pool.query('SELECT * FROM client_contacts WHERE client_id = $1 ORDER BY is_primary DESC, id ASC', [id]);
    const { rows: addresses } = await pool.query('SELECT * FROM client_addresses WHERE client_id = $1 ORDER BY id ASC', [id]);
    const { rows: banking } = (req.user.role === 'admin' || req.user.role === 'back_office' || req.user.role === 'accounts') 
      ? await pool.query('SELECT * FROM client_banking WHERE client_id = $1 ORDER BY is_primary DESC, id ASC', [id])
      : { rows: [] };
      
    const { rows: projects } = await pool.query('SELECT id, name, status, type FROM projects WHERE client_id = $1', [id]);

    res.json({
      client: clientRows[0],
      contacts,
      addresses,
      banking,
      projects
    });
  } catch (err) {
    console.error('Client Detail GET error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/clients - Create a new client with nested data
router.post('/', authenticate, async (req, res) => {
  const { 
    name, company_name, gst_number, pan_number, notes,
    contacts = [], addresses = [], banking = []
  } = req.body;

  if (!name) return res.status(400).json({ error: 'Client name is required' });
  const primaryPhone = contacts[0]?.phone;
  if (!primaryPhone) return res.status(400).json({ error: 'Phone number is required' });

  // Sanitize empty strings to NULL to avoid duplicate key/unique constraint conflicts
  const companyNameDb = (typeof company_name === 'string' && company_name.trim() !== '') ? company_name.trim() : null;
  const gstNumberDb = (typeof gst_number === 'string' && gst_number.trim() !== '') ? gst_number.trim() : null;
  const panNumberDb = (typeof pan_number === 'string' && pan_number.trim() !== '') ? pan_number.trim() : null;
  const notesDb = (typeof notes === 'string' && notes.trim() !== '') ? notes.trim() : null;

  const client_db = await pool.connect();
  try {
    await client_db.query('BEGIN');

    // 1. Insert Client
    const { rows: clientRows } = await client_db.query(
      `INSERT INTO clients (name, company_name, gst_number, pan_number, notes, phone)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [name, companyNameDb, gstNumberDb, panNumberDb, notesDb, primaryPhone]
    );
    const clientId = clientRows[0].id;

    // 2. Insert Contacts
    for (const c of contacts) {
      await client_db.query(
        `INSERT INTO client_contacts (client_id, name, role, phone, email, is_primary)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [clientId, c.name, c.role, c.phone, c.email, !!c.is_primary]
      );
    }

    // 3. Insert Addresses
    for (const a of addresses) {
      await client_db.query(
        `INSERT INTO client_addresses (client_id, type, address, city, state, pincode)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [clientId, a.type, a.address, a.city, a.state, a.pincode]
      );
    }

    // 4. Insert Banking
    for (const b of banking) {
      // Only insert if banking details are actually filled out
      if (b.account_name?.trim() || b.account_number?.trim() || b.upi_id?.trim()) {
        await client_db.query(
          `INSERT INTO client_banking (client_id, account_name, account_number, ifsc, bank_name, branch, upi_id, is_primary)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [clientId, b.account_name, b.account_number, b.ifsc, b.bank_name, b.branch, b.upi_id, !!b.is_primary]
        );
      }
    }

    await client_db.query('COMMIT');
    res.status(201).json({ id: clientId, message: 'Client created successfully' });
  } catch (err) {
    await client_db.query('ROLLBACK');
    console.error('Clients POST error:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client_db.release();
  }
});

// PATCH /api/clients/:id - Update client and its nested structure
router.patch('/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  const { 
    name, company_name, gst_number, pan_number, notes,
    contacts, addresses, banking
  } = req.body;

  const hasAccountingAccess = req.user.role === 'admin' || req.user.role === 'accounts' || req.user.role === 'back_office' || req.user.department?.toLowerCase() === 'accounts';

  const client_db = await pool.connect();
  try {
    await client_db.query('BEGIN');

    // 1. Update Basic Info (convert empty strings to NULL to prevent UNIQUE constraint violation)
    const primaryPhone = contacts?.[0]?.phone;
    const companyNameDb = (company_name !== undefined) ? ((typeof company_name === 'string' && company_name.trim() !== '') ? company_name.trim() : null) : undefined;
    const gstNumberDb = (gst_number !== undefined) ? ((typeof gst_number === 'string' && gst_number.trim() !== '') ? gst_number.trim() : null) : undefined;
    const panNumberDb = (pan_number !== undefined) ? ((typeof pan_number === 'string' && pan_number.trim() !== '') ? pan_number.trim() : null) : undefined;
    const notesDb = (notes !== undefined) ? ((typeof notes === 'string' && notes.trim() !== '') ? notes.trim() : null) : undefined;

    // Dynamically build client update query to support clearing fields safely
    const updates = [];
    const values = [];
    let paramIdx = 1;

    if (name !== undefined) { updates.push(`name = $${paramIdx++}`); values.push(name); }
    if (companyNameDb !== undefined) { updates.push(`company_name = $${paramIdx++}`); values.push(companyNameDb); }
    if (gstNumberDb !== undefined) { updates.push(`gst_number = $${paramIdx++}`); values.push(gstNumberDb); }
    if (panNumberDb !== undefined) { updates.push(`pan_number = $${paramIdx++}`); values.push(panNumberDb); }
    if (notesDb !== undefined) { updates.push(`notes = $${paramIdx++}`); values.push(notesDb); }
    if (primaryPhone !== undefined) { updates.push(`phone = $${paramIdx++}`); values.push(primaryPhone); }

    if (updates.length > 0) {
      values.push(id);
      await client_db.query(
        `UPDATE clients SET ${updates.join(', ')} WHERE id = $${paramIdx}`,
        values
      );
    }

    // Sync denormalized name columns if client name was changed
    if (name) {
      await client_db.query(
        `UPDATE projects SET client_name = $1 WHERE client_id = $2`,
        [name, id]
      );
      await client_db.query(
        `UPDATE invoices SET client_name = $1 WHERE client_id = $2`,
        [name, id]
      );
    }

    // 2. Update Contacts (Simple strategy: Delete and Re-insert)
    if (contacts) {
      await client_db.query('DELETE FROM client_contacts WHERE client_id = $1', [id]);
      for (const c of contacts) {
        await client_db.query(
          `INSERT INTO client_contacts (client_id, name, role, phone, email, is_primary)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [id, c.name, c.role, c.phone, c.email, !!c.is_primary]
        );
      }
    }

    // 3. Update Addresses
    if (addresses) {
      await client_db.query('DELETE FROM client_addresses WHERE client_id = $1', [id]);
      for (const a of addresses) {
        await client_db.query(
          `INSERT INTO client_addresses (client_id, type, address, city, state, pincode)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [id, a.type, a.address, a.city, a.state, a.pincode]
        );
      }
    }

    // 4. Update Banking (Only if user is authorized, and the array has valid/new records)
    if (banking && hasAccountingAccess) {
      const hasValidBankingData = banking.some(b => b.account_name?.trim() || b.account_number?.trim() || b.upi_id?.trim());
      if (hasValidBankingData) {
        await client_db.query('DELETE FROM client_banking WHERE client_id = $1', [id]);
        for (const b of banking) {
          await client_db.query(
            `INSERT INTO client_banking (client_id, account_name, account_number, ifsc, bank_name, branch, upi_id, is_primary)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [id, b.account_name, b.account_number, b.ifsc, b.bank_name, b.branch, b.upi_id, !!b.is_primary]
          );
        }
      }
    }

    await client_db.query('COMMIT');
    res.json({ message: 'Client updated successfully' });
  } catch (err) {
    await client_db.query('ROLLBACK');
    console.error('Clients PATCH error:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client_db.release();
  }
});

// DELETE /api/clients/:id - Delete a client (Cascades to contacts, addresses, banking)
router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const { rowCount } = await pool.query('DELETE FROM clients WHERE id = $1', [id]);
    if (rowCount === 0) return res.status(404).json({ error: 'Client not found' });
    res.json({ message: 'Client deleted successfully' });
  } catch (err) {
    console.error('Clients DELETE error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
