-- server/db/migrations/029_timeline_methodology_enhancements.sql
-- DS16: Construction Methodology & Dynamic Gantt Scheduling Enhancements
-- Additive, backwards-compatible columns for baseline vs forecast separation and milestone tracking

ALTER TABLE timeline_tasks 
  ADD COLUMN IF NOT EXISTS forecast_start_date DATE,
  ADD COLUMN IF NOT EXISTS forecast_finish_date DATE,
  ADD COLUMN IF NOT EXISTS is_milestone BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- Populate default forecast dates from planned dates for existing records
UPDATE timeline_tasks 
SET forecast_start_date = planned_start_date,
    forecast_finish_date = planned_finish_date
WHERE forecast_start_date IS NULL;

-- Index for milestone lookups and forecast date filtering
CREATE INDEX IF NOT EXISTS idx_timeline_tasks_milestone ON timeline_tasks(project_id, is_milestone) WHERE is_milestone = TRUE;
CREATE INDEX IF NOT EXISTS idx_timeline_tasks_forecast ON timeline_tasks(forecast_start_date, forecast_finish_date);
