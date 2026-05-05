-- scripts/fix_schema.sql
-- Run this on VPS: sudo -u postgres psql -d ds16 -f scripts/fix_schema.sql

-- 1. Documents Table
CREATE TABLE IF NOT EXISTS documents (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  uploaded_by INTEGER REFERENCES users(id),
  file_name VARCHAR(255) NOT NULL,
  file_path TEXT NOT NULL,
  file_type VARCHAR(100),
  file_size INTEGER,
  remark TEXT,
  category VARCHAR(50) DEFAULT 'document',
  document_type VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Project Payment Stages (Financial Tracking)
CREATE TABLE IF NOT EXISTS project_payment_stages (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  document_type VARCHAR(100),
  amount DECIMAL(15, 2) DEFAULT 0,
  initiated_by INTEGER REFERENCES users(id),
  status VARCHAR(50) DEFAULT 'bill generated',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Project Document Amounts (Potential/Contract Value)
CREATE TABLE IF NOT EXISTS project_document_amounts (
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  document_type VARCHAR(100) NOT NULL,
  amount DECIMAL(15, 2) DEFAULT 0,
  PRIMARY KEY (project_id, document_type)
);

-- 4. Comments Table (Threaded discussion)
CREATE TABLE IF NOT EXISTS comments (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  parent_id INTEGER REFERENCES comments(id) ON DELETE CASCADE,
  assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
  is_task BOOLEAN DEFAULT FALSE,
  task_status VARCHAR(20) DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Expense Audits
CREATE TABLE IF NOT EXISTS expense_audits (
  category VARCHAR(100) NOT NULL,
  month INTEGER NOT NULL,
  year INTEGER NOT NULL,
  is_verified BOOLEAN DEFAULT FALSE,
  verified_by INTEGER REFERENCES users(id),
  verified_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (category, month, year)
);

-- 6. Holidays
CREATE TABLE IF NOT EXISTS holidays (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  is_paid BOOLEAN DEFAULT TRUE
);

-- 7. Employee Leave Summary (Monthly)
CREATE TABLE IF NOT EXISTS employee_leave_summary (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month INTEGER NOT NULL,
  year INTEGER NOT NULL,
  unpaid_leaves DECIMAL(5, 2) DEFAULT 0,
  UNIQUE(user_id, month, year)
);

-- 8. Add missing indexes
CREATE INDEX IF NOT EXISTS idx_documents_project ON documents(project_id);
CREATE INDEX IF NOT EXISTS idx_payment_stages_project ON project_payment_stages(project_id);
CREATE INDEX IF NOT EXISTS idx_comments_project ON comments(project_id);
