-- Migration 033: Timeline Schedule Refinements for 5 Standard Sections, Dual-Track Dates & Polishing Modes
-- Adds section_name to timeline_tasks and configuration columns to timeline_configurations

-- 1. Extend timeline_configurations with polishing mode, additional work toggles, and duration overrides
ALTER TABLE timeline_configurations
  ADD COLUMN IF NOT EXISTS polishing_mode VARCHAR(50) DEFAULT 'floor_wise',
  ADD COLUMN IF NOT EXISTS additional_work_config JSONB DEFAULT '{"elevation": false, "lift": true, "fire": false, "solar": false}'::jsonb,
  ADD COLUMN IF NOT EXISTS custom_durations JSONB DEFAULT '{}'::jsonb;

-- 2. Extend timeline_tasks with section_name (Site Preparation, RCC Work, Masonry Work, Polishing Work, Additional Work)
ALTER TABLE timeline_tasks
  ADD COLUMN IF NOT EXISTS section_name VARCHAR(100) DEFAULT 'RCC Work';

CREATE INDEX IF NOT EXISTS idx_timeline_tasks_section ON timeline_tasks(project_id, section_name);

COMMENT ON COLUMN timeline_configurations.polishing_mode IS 'Scheduling mode for polishing work: floor_wise (Mode A) or after_rcc (Mode B)';
COMMENT ON COLUMN timeline_configurations.additional_work_config IS 'Toggles and manual proposed dates for Elevation, Lift, Fire, Solar';
COMMENT ON COLUMN timeline_configurations.custom_durations IS 'Configured durations for Site Prep, Plinth, Masonry, Columns, Polishing';
COMMENT ON COLUMN timeline_tasks.section_name IS 'Primary construction section: Site Preparation, RCC Work, Masonry Work, Polishing Work, Additional Work';
