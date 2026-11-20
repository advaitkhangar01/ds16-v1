-- Migration 033 Down: Revert Timeline Schedule Refinements

DROP INDEX IF EXISTS idx_timeline_tasks_section;

ALTER TABLE timeline_tasks
  DROP COLUMN IF EXISTS section_name;

ALTER TABLE timeline_configurations
  DROP COLUMN IF EXISTS polishing_mode,
  DROP COLUMN IF EXISTS additional_work_config,
  DROP COLUMN IF EXISTS custom_durations;
