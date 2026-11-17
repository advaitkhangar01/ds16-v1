-- server/db/migrations/down/029_timeline_methodology_enhancements_down.sql
-- Rollback for 029_timeline_methodology_enhancements.sql

DROP INDEX IF EXISTS idx_timeline_tasks_forecast;
DROP INDEX IF EXISTS idx_timeline_tasks_milestone;

ALTER TABLE timeline_tasks
  DROP COLUMN IF EXISTS metadata,
  DROP COLUMN IF EXISTS is_milestone,
  DROP COLUMN IF EXISTS forecast_finish_date,
  DROP COLUMN IF EXISTS forecast_start_date;
