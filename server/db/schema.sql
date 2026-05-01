-- DS16 Database Schema
-- Run this first: psql -U postgres -d ds16 -f schema.sql

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'employee')),
  department VARCHAR(100),
  phone VARCHAR(20),
  username VARCHAR(50) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Attendance table (one check-in per user per date)
CREATE TABLE IF NOT EXISTS attendance (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  check_in TIMESTAMPTZ,
  check_out TIMESTAMPTZ,
  lat DECIMAL(10, 8),
  lng DECIMAL(11, 8),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  UNIQUE(user_id, date)
);

-- Projects table
CREATE TABLE IF NOT EXISTS projects (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  client_name VARCHAR(200) NOT NULL,
  type VARCHAR(100) NOT NULL,
  location VARCHAR(300),
  area_sq_ft VARCHAR(100),
  structural_engineer VARCHAR(200),
  status VARCHAR(50) DEFAULT 'Under Proposal',
  start_date DATE,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Project stages
CREATE TABLE IF NOT EXISTS project_stages (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  stage_name VARCHAR(100) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Project employee assignments
CREATE TABLE IF NOT EXISTS project_assignments (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(project_id, user_id)
);

-- Comments / Tasks (unified system)
CREATE TABLE IF NOT EXISTS comments (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  message TEXT NOT NULL,
  parent_id INTEGER REFERENCES comments(id) ON DELETE CASCADE,
  assigned_to INTEGER REFERENCES users(id),   -- parsed from @mention
  task_due_text VARCHAR(200),                  -- e.g. "by 22 March"
  task_status VARCHAR(30) DEFAULT 'pending' CHECK (task_status IN ('pending', 'in_progress', 'completed')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Vendors table
CREATE TABLE IF NOT EXISTS vendors (
  id SERIAL PRIMARY KEY,
  category VARCHAR(100) NOT NULL,
  name VARCHAR(100) NOT NULL
);

-- Documents table
CREATE TABLE IF NOT EXISTS documents (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  uploaded_by INTEGER NOT NULL REFERENCES users(id),
  file_name VARCHAR(255) NOT NULL,
  file_path VARCHAR(500) NOT NULL,
  file_type VARCHAR(100),
  file_size INTEGER,
  remark TEXT,
  category VARCHAR(50) NOT NULL DEFAULT 'document',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_attendance_user_date ON attendance(user_id, date);
CREATE INDEX IF NOT EXISTS idx_comments_project ON comments(project_id);
CREATE INDEX IF NOT EXISTS idx_comments_assigned_to ON comments(assigned_to);
CREATE INDEX IF NOT EXISTS idx_project_stages_project ON project_stages(project_id);
CREATE INDEX IF NOT EXISTS idx_documents_project ON documents(project_id);

-- Document amounts
CREATE TABLE IF NOT EXISTS project_document_amounts (
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  document_type VARCHAR(100) NOT NULL,
  amount DECIMAL(15, 2),
  PRIMARY KEY(project_id, document_type)
);
