// server/routes/documents.js
// Document upload and management

const router = require('express').Router();
const pool = require('../db');
const { authenticate } = require('../middleware/auth');
const { checkProjectAccess } = require('../middleware/accessControl');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Allowed file extensions
const ALLOWED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png', '.dwg', '.docx', '.doc', '.xlsx', '.xls'];

// Configure Multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const { project_id } = req.body;
    // Sanitize project_id to prevent path traversal
    const pid = parseInt(project_id);
    if (isNaN(pid)) {
      return cb(new Error('Invalid project_id'));
    }
    // Create project-specific directory if it doesn't exist
    const dir = path.join(__dirname, '..', 'uploads', 'projects', String(pid));
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    // timestamp_originalname.ext to avoid collisions
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return cb(new Error('File type not allowed'), false);
    }
    cb(null, true);
  }
});

// POST /api/documents/upload
router.post('/upload', authenticate, checkProjectAccess(), (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ error: `Upload error: ${err.message}` });
    } else if (err) {
      return res.status(400).json({ error: err.message });
    }
    next();
  });
}, async (req, res) => {
  const client = await pool.connect();
  try {
    const { project_id, remark, category = 'document', document_type } = req.body;
    const file = req.file;

    if (!project_id || !file) {
      console.error('Upload missing project_id or file:', { project_id, file: !!file });
      return res.status(400).json({ error: 'project_id and file are required' });
    }

    const pid = parseInt(project_id);
    if (isNaN(pid)) return res.status(400).json({ error: 'Invalid project_id' });

    await client.query('BEGIN');

    // 1. Insert into documents table
    const relativePath = path.join('uploads', 'projects', String(project_id), file.filename).replace(/\\/g, '/');
    const { rows: docRows } = await client.query(
      `INSERT INTO documents (project_id, uploaded_by, file_name, file_path, file_type, file_size, remark, category, document_type, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
       RETURNING *`,
      [project_id, req.user.id, file.originalname, relativePath, file.mimetype, file.size, remark || null, category, document_type || null]
    );

    const newDoc = docRows[0];

    // 2. If remark exists, insert into comments table
    if (remark && remark.trim()) {
      const typeLabel = category === 'photo' ? '📸 Site photograph' : '📎 File';
      await client.query(
        `INSERT INTO comments (project_id, user_id, message, created_at)
         VALUES ($1, $2, $3, NOW())`,
        [project_id, req.user.id, `${typeLabel}: **${file.originalname}**\n\n${remark.trim()}`]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ document: newDoc });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Upload document error:', err);
    res.status(500).json({ error: 'Server error during upload' });
  } finally {
    client.release();
  }
});

// GET /api/documents?project_id=X
router.get('/', authenticate, checkProjectAccess(), async (req, res) => {
  try {
    const { project_id, category, grouped } = req.query;
    if (!project_id) return res.status(400).json({ error: 'project_id is required' });

    const pid = parseInt(project_id);
    if (isNaN(pid)) return res.status(400).json({ error: 'Invalid project_id' });

    let query = `
      SELECT d.*, u.name as uploaded_by_name
      FROM documents d
      JOIN users u ON u.id = d.uploaded_by
      WHERE d.project_id = $1`;
    const params = [pid];

    if (category) {
      query += ` AND d.category = $2`;
      params.push(category);
    }

    query += ` ORDER BY d.created_at DESC`;
    const { rows } = await pool.query(query, params);

    if (grouped === 'true') {
      const groupedDocs = rows.reduce((acc, doc) => {
        const type = doc.document_type || 'Others';
        if (!acc[type]) acc[type] = [];
        acc[type].push({
          id: doc.id,
          name: doc.file_name,
          url: doc.file_path,
          type: doc.file_type,
          size: doc.file_size,
          uploaded_by: doc.uploaded_by_name,
          created_at: doc.created_at,
          remark: doc.remark
        });
        return acc;
      }, {});

      // Fetch amounts from project_document_amounts
      const amountsQuery = await pool.query('SELECT document_type, amount FROM project_document_amounts WHERE project_id = $1', [pid]);
      const amountsMap = amountsQuery.rows.reduce((acc, row) => {
        acc[row.document_type] = row.amount;
        return acc;
      }, {});

      // Fallback/Override: Fetch amounts from project_payment_stages (these are the 'official' billed amounts)
      const stagesQuery = await pool.query('SELECT document_type, amount FROM project_payment_stages WHERE project_id = $1', [pid]);
      stagesQuery.rows.forEach(row => {
        // If it's in payment stages, we prioritize this amount as it's what's shown in accounts
        if (row.amount !== null && row.amount !== undefined) {
          amountsMap[row.document_type] = row.amount;
        }
      });

      return res.json({ documents: groupedDocs, amounts: amountsMap });
    }

    res.json({ documents: rows });
  } catch (err) {
    console.error('GET /api/documents error details:', err);
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

// GET /api/documents/payment-stages?project_id=X
router.get('/payment-stages', authenticate, checkProjectAccess(), async (req, res) => {
  try {
    const { project_id } = req.query;
    if (!project_id) return res.status(400).json({ error: 'project_id is required' });

    const { rows } = await pool.query(
      'SELECT * FROM project_payment_stages WHERE project_id = $1 ORDER BY created_at DESC',
      [project_id]
    );
    res.json({ paymentStages: rows });
  } catch (err) {
    console.error('Get payment stages error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/documents/payment-stages
router.post('/payment-stages', authenticate, checkProjectAccess(), async (req, res) => {
  try {
    const { project_id, document_type, amount } = req.body;
    if (!project_id || !document_type) {
      return res.status(400).json({ error: 'project_id and document_type are required' });
    }

    const pid = parseInt(project_id);
    if (isNaN(pid)) return res.status(400).json({ error: 'Invalid project_id' });

    // Check if already exists (prevent duplicates from multiple clicks)
    const existing = await pool.query(
      'SELECT id FROM project_payment_stages WHERE project_id = $1 AND document_type = $2',
      [pid, document_type]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Payment stage already initiated for this tag' });
    }

    const { rows } = await pool.query(
      `INSERT INTO project_payment_stages (project_id, document_type, amount, initiated_by, status)
       VALUES ($1, $2, $3, $4, 'bill generated')
       RETURNING *`,
      [pid, document_type, parseFloat(amount) || 0, req.user.id]
    );
    res.status(201).json({ paymentStage: rows[0] });
  } catch (err) {
    console.error('Create payment stage error:', err);
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

// PATCH /api/documents/payment-stages/:id
router.patch('/payment-stages/:id', authenticate, checkProjectAccess({ idIsResource: 'payment-stage' }), async (req, res) => {
  try {
    const { status, amount } = req.body;
    const updates = [];
    const values = [];
    let idx = 1;

    if (status) {
      updates.push(`status = $${idx++}`);
      values.push(status);
    }
    if (amount !== undefined) {
      updates.push(`amount = $${idx++}`);
      values.push(amount);
    }
    
    if (updates.length === 0) return res.status(400).json({ error: 'No updates provided' });

    values.push(req.params.id);
    updates.push(`updated_at = NOW()`);

    const { rows } = await pool.query(
      `UPDATE project_payment_stages SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );

    if (!rows.length) return res.status(404).json({ error: 'Payment stage not found' });
    res.json({ paymentStage: rows[0] });
  } catch (err) {
    console.error('Update payment stage error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/documents/payment-stages/:id
router.delete('/payment-stages/:id', authenticate, checkProjectAccess({ idIsResource: 'payment-stage' }), async (req, res) => {
  try {
    await pool.query('DELETE FROM project_payment_stages WHERE id = $1', [req.params.id]);
    res.json({ message: 'Payment stage removed' });
  } catch (err) {
    console.error('Delete payment stage error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/documents/payment-stages/remove
// Helper for unchecking in DocumentsTab
router.delete('/payment-stages/remove/tag', authenticate, checkProjectAccess(), async (req, res) => {
  try {
    const { project_id, document_type } = req.body;
    const pid = parseInt(project_id);
    
    await pool.query(
      'DELETE FROM project_payment_stages WHERE project_id = $1 AND document_type = $2 AND status = \'bill generated\'',
      [pid, document_type]
    );
    res.json({ message: 'Payment stage removed' });
  } catch (err) {
    console.error('Remove payment stage by tag error:', err);
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

// POST /api/documents/amounts
router.post('/amounts', authenticate, checkProjectAccess(), async (req, res) => {
  const client = await pool.connect();
  try {
    const { project_id, document_type, amount } = req.body;
    if (!project_id || !document_type) return res.status(400).json({ error: 'project_id and document_type are required' });

    const pid = parseInt(project_id);
    if (isNaN(pid)) return res.status(400).json({ error: 'Invalid project_id' });

    await client.query('BEGIN');

    // 1. Update project_document_amounts
    const query = `
      INSERT INTO project_document_amounts (project_id, document_type, amount)
      VALUES ($1, $2, $3)
      ON CONFLICT (project_id, document_type) 
      DO UPDATE SET amount = EXCLUDED.amount
      RETURNING *;
    `;
    const { rows } = await client.query(query, [pid, document_type, amount || null]);

    // 2. Also update project_payment_stages IF it exists and is not 'paid'
    // This ensures that changing the amount in Documents tab reflects in Accounts tab
    const numericAmount = parseFloat(amount);
    if (!isNaN(numericAmount)) {
      await client.query(`
        UPDATE project_payment_stages 
        SET amount = $1, updated_at = NOW()
        WHERE project_id = $2 AND document_type = $3 AND status != 'paid'
      `, [numericAmount, project_id, document_type]);
    }

    await client.query('COMMIT');
    res.json({ amount: rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Save amount error:', err);
    res.status(500).json({ error: 'Server error saving amount' });
  } finally {
    client.release();
  }
});

// GET /api/documents/:id/download
router.get('/:id/download', authenticate, checkProjectAccess({ idIsResource: 'document' }), async (req, res) => {
  try {
    const { id } = req.params;

    const { rows } = await pool.query('SELECT file_path, file_name FROM documents WHERE id = $1', [id]);
    
    if (!rows.length) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const doc = rows[0];
    const absolutePath = path.join(__dirname, '..', doc.file_path);

    res.download(absolutePath, doc.file_name, (err) => {
      if (err) {
        console.error('Download error:', err);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Error downloading file' });
        }
      }
    });

  } catch (err) {
    console.error('Get document download error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/documents/:id
router.delete('/:id', authenticate, checkProjectAccess({ idIsResource: 'document' }), async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;

    // 1. Get file path
    const { rows } = await client.query('SELECT file_path FROM documents WHERE id = $1', [id]);
    if (!rows.length) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const filePath = rows[0].file_path;
    const absolutePath = path.join(__dirname, '..', filePath);

    await client.query('BEGIN');

    // 2. Delete from database
    await client.query('DELETE FROM documents WHERE id = $1', [id]);

    // 3. Delete from filesystem (if it exists)
    try {
      if (fs.existsSync(absolutePath)) {
        fs.unlinkSync(absolutePath);
      }
    } catch (fsErr) {
      console.error('File deletion error:', fsErr);
      // We continue even if file deletion fails, to keep database clean
    }

    await client.query('COMMIT');
    res.json({ message: 'Document deleted successfully' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Delete document error:', err);
    res.status(500).json({ error: 'Server error during deletion' });
  } finally {
    client.release();
  }
});

module.exports = router;
