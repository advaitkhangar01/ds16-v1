-- server/db/migrations/034_timeline_activity_identity_and_reconciliation.sql
-- DS16: Stable Activity Identifiers, Floor Hierarchy & Safe Reconciliation

-- 1. Extend timeline_tasks with stable activity_key, floor_order and standard section naming
ALTER TABLE timeline_tasks
  ADD COLUMN IF NOT EXISTS activity_key VARCHAR(100),
  ADD COLUMN IF NOT EXISTS floor_order INTEGER DEFAULT 0;

-- Update legacy 'Polishing Work' section name to 'Finishing Work'
UPDATE timeline_tasks
SET section_name = 'Finishing Work'
WHERE section_name = 'Polishing Work';

-- Update default for section_name
ALTER TABLE timeline_tasks
  ALTER COLUMN section_name SET DEFAULT 'RCC Work';

-- Partial index for active task lookup by stable activity key per project
CREATE INDEX IF NOT EXISTS idx_timeline_tasks_activity_key 
  ON timeline_tasks(project_id, activity_key) 
  WHERE is_archived = FALSE;

CREATE INDEX IF NOT EXISTS idx_timeline_tasks_floor_order
  ON timeline_tasks(project_id, floor_order);

-- 2. Extend timeline_configurations with configurable masonry floor-to-floor lag
ALTER TABLE timeline_configurations
  ADD COLUMN IF NOT EXISTS masonry_lag_days INTEGER DEFAULT 1;

COMMENT ON COLUMN timeline_tasks.activity_key IS 'Deterministic stable activity identifier, e.g. RCC:PLINTH:SLAB, MASONRY:FLOOR_1:BRICKWORK';
COMMENT ON COLUMN timeline_tasks.floor_order IS 'Structural vertical sequence index (-N for basements, 0 for ground/plinth, 1..N for upper floors, 99 for terrace/tank)';
COMMENT ON COLUMN timeline_configurations.masonry_lag_days IS 'Configurable floor-to-floor lag in calendar days between successive brickwork starts';
