// server/middleware/validate.js
// Safe, log-only request validation middleware using Zod
// Runs in observation mode by default; enforces only if ENFORCE_REQUEST_VALIDATION=true

const { z } = require('zod');

/**
 * Creates an Express validation middleware for req.body.
 * By default runs in log-only mode: reports validation issues without rejecting requests.
 * Set process.env.ENFORCE_REQUEST_VALIDATION = 'true' to reject with 400.
 */
function validateBody(schema, schemaName = 'RequestBody') {
  return (req, res, next) => {
    const enforce = process.env.ENFORCE_REQUEST_VALIDATION === 'true';
    const result = schema.safeParse(req.body);

    if (!result.success) {
      const rawErrors = result.error.issues || result.error.errors || [];
      const formattedErrors = rawErrors.map(err => ({
        path: (err.path || []).join('.'),
        message: err.message,
        code: err.code
      }));

      console.warn(`⚠️ [Validation Warning] [${req.method} ${req.originalUrl}] Schema '${schemaName}' mismatch:`, JSON.stringify(formattedErrors));

      if (enforce) {
        return res.status(400).json({
          error: 'Validation failed',
          details: formattedErrors
        });
      }
    }

    next();
  };
}

// Reusable Zod Schemas for DS16 Core Endpoints

// 1. Transaction creation schema (Finances & Accounting)
const transactionCreateSchema = z.object({
  type: z.enum(['income', 'expense']).optional().or(z.string()),
  category: z.string().min(1, 'Category is required'),
  amount: z.coerce.number({ invalid_type_error: 'Amount must be a number' }).positive('Amount must be positive'),
  date: z.string().optional(),
  description: z.string().optional().nullable(),
  project_id: z.coerce.number().optional().nullable(),
  vendor_id: z.coerce.number().optional().nullable(),
  employee_id: z.coerce.number().optional().nullable(),
  reference_id: z.string().optional().nullable()
}).passthrough(); // Allow extra fields without failing

// 2. Invoice creation schema
const invoiceCreateSchema = z.object({
  invoice_no: z.string().min(1, 'Invoice number is required').optional(),
  project_id: z.coerce.number().optional().nullable(),
  client_id: z.coerce.number().optional().nullable(),
  client_name: z.string().optional().nullable(),
  amount: z.coerce.number({ invalid_type_error: 'Amount must be a number' }).nonnegative('Amount must be non-negative'),
  date: z.string().optional(),
  due_date: z.string().optional().nullable(),
  items: z.any().optional(),
  tax_details: z.any().optional(),
  payment_stage_id: z.coerce.number().optional().nullable(),
  payment_stage_ids: z.array(z.coerce.number()).optional().nullable(),
  received_amount: z.coerce.number().optional().nullable()
}).passthrough();

// 3. Task creation schema
const taskCreateSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  project_id: z.coerce.number({ invalid_type_error: 'Project ID is required' }),
  assigned_to: z.coerce.number().optional().nullable(),
  priority: z.enum(['low', 'medium', 'high']).optional().or(z.string().optional()),
  start_date: z.string().optional().nullable(),
  due_date: z.string().optional().nullable(),
  description: z.string().optional().nullable()
}).passthrough();

module.exports = {
  validateBody,
  schemas: {
    transactionCreateSchema,
    invoiceCreateSchema,
    taskCreateSchema
  }
};
