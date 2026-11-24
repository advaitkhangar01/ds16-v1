-- server/db/migrations/down/034_timeline_activity_identity_and_reconciliation.down.sql
DROP INDEX IF EXISTS idx_timeline_tasks_activity_key;
DROP INDEX IF EXISTS idx_timeline_tasks_floor_order;

ALTER TABLE timeline_tasks
  DROP COLUMN IF EXISTS activity_key,
  DROP COLUMN IF EXISTS floor_order;

ALTER TABLE timeline_configurations
  DROP COLUMN IF EXISTS masonry_lag_days;
