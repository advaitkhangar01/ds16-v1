-- Migration 036: Project Stakeholders Schema Definition & Core Constraint Integrity
-- Idempotent, safe, backward-compatible DDL

-- 1. Ensure project_stakeholders table exists
CREATE TABLE IF NOT EXISTS project_stakeholders (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  role VARCHAR(100),
  phone VARCHAR(50),
  email VARCHAR(200),
  is_primary BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_project_stakeholders_proj ON project_stakeholders(project_id);

-- 2. Add UNIQUE constraint to project_stages(project_id, stage_name)
DO $$
BEGIN
  -- Deduplicate first if any duplicate stages exist
  DELETE FROM project_stages a USING project_stages b
  WHERE a.id > b.id AND a.project_id = b.project_id AND a.stage_name = b.stage_name;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'uq_project_stages_project_stage'
  ) THEN
    ALTER TABLE project_stages ADD CONSTRAINT uq_project_stages_project_stage UNIQUE (project_id, stage_name);
  END IF;
END $$;

-- 3. Add UNIQUE partial index for active timeline tasks per project activity_key
CREATE UNIQUE INDEX IF NOT EXISTS uq_idx_timeline_tasks_active_activity 
ON timeline_tasks (project_id, activity_key) 
WHERE is_archived = FALSE AND activity_key IS NOT NULL;

-- 4. Add UNIQUE constraint to project_feasibility_snapshots(project_id, version_number)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'uq_feasibility_snapshots_proj_version'
  ) THEN
    ALTER TABLE project_feasibility_snapshots 
    ADD CONSTRAINT uq_feasibility_snapshots_proj_version UNIQUE (project_id, version_number);
  END IF;
END $$;

-- 5. Add UNIQUE constraint to construction_templates(name)
DO $$
BEGIN
  DELETE FROM construction_templates a USING construction_templates b
  WHERE a.id > b.id AND a.name = b.name;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'uq_construction_templates_name'
  ) THEN
    ALTER TABLE construction_templates ADD CONSTRAINT uq_construction_templates_name UNIQUE (name);
  END IF;
END $$;

-- 6. Add UNIQUE constraint to timeline_activity_catalogue(category, activity_name)
DO $$
BEGIN
  DELETE FROM timeline_activity_catalogue a USING timeline_activity_catalogue b
  WHERE a.id > b.id AND a.category = b.category AND a.activity_name = b.activity_name;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'uq_timeline_catalogue_category_activity'
  ) THEN
    ALTER TABLE timeline_activity_catalogue 
    ADD CONSTRAINT uq_timeline_catalogue_category_activity UNIQUE (category, activity_name);
  END IF;
END $$;
