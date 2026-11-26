-- Migration 037: Create Responsibilities Table and Audit Constraints
-- Supports My Profile -> Responsibilities Sub-Tab

CREATE TABLE IF NOT EXISTS responsibilities (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    employee_acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
    employee_acknowledged_at TIMESTAMPTZ,
    admin_verified BOOLEAN NOT NULL DEFAULT FALSE,
    admin_verified_at TIMESTAMPTZ,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_admin_verified_requires_ack CHECK (NOT admin_verified OR employee_acknowledged),
    CONSTRAINT chk_description_not_empty CHECK (LENGTH(TRIM(description)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_responsibilities_user_id ON responsibilities(user_id);
CREATE INDEX IF NOT EXISTS idx_responsibilities_status ON responsibilities(employee_acknowledged, admin_verified);
CREATE INDEX IF NOT EXISTS idx_responsibilities_created_at ON responsibilities(created_at);
CREATE INDEX IF NOT EXISTS idx_responsibilities_user_status ON responsibilities(user_id, employee_acknowledged, admin_verified);
