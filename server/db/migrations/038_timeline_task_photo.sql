-- Migration 038: Extend timeline_tasks with activity site execution photo evidence
-- Supports dedicated 1-photo per activity upload with metadata

ALTER TABLE timeline_tasks
  ADD COLUMN IF NOT EXISTS photo_path VARCHAR(500),
  ADD COLUMN IF NOT EXISTS photo_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS photo_size INTEGER,
  ADD COLUMN IF NOT EXISTS photo_mime VARCHAR(100),
  ADD COLUMN IF NOT EXISTS photo_uploaded_at TIMESTAMPTZ;

-- Index to quickly query tasks with site photos within projects
CREATE INDEX IF NOT EXISTS idx_timeline_tasks_photo 
  ON timeline_tasks(project_id) 
  WHERE photo_path IS NOT NULL;

COMMENT ON COLUMN timeline_tasks.photo_path IS 'Relative storage path for the single activity site execution photo';
COMMENT ON COLUMN timeline_tasks.photo_name IS 'Original filename of the uploaded site photo';
COMMENT ON COLUMN timeline_tasks.photo_size IS 'Byte size of the uploaded site photo (max 5 MB)';
COMMENT ON COLUMN timeline_tasks.photo_mime IS 'MIME type of the uploaded site photo';
COMMENT ON COLUMN timeline_tasks.photo_uploaded_at IS 'Timestamp when the site photo was uploaded or replaced';
