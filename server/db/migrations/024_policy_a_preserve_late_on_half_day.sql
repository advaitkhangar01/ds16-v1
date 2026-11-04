-- Migration 024: Drop constraint that blocked late marks on half_day
-- Policy A: An employee who arrives late is marked is_late=true and retains late_minutes
-- even if the shift ends as half_day.
-- Absent and leave must still never carry late markers.

DO $$
BEGIN
  -- 1. Drop the restrictive constraint that blocked late marks on half_day
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_attendance_half_day_absent_no_late') THEN
    ALTER TABLE attendance DROP CONSTRAINT chk_attendance_half_day_absent_no_late;
  END IF;

  -- 2. Add the refined constraint: only absent and leave must not have late marks
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_attendance_absent_leave_no_late') THEN
    ALTER TABLE attendance ADD CONSTRAINT chk_attendance_absent_leave_no_late
      CHECK (NOT (LOWER(COALESCE(status, '')) IN ('absent', 'leave') AND (is_late = TRUE OR late_minutes > 0))) NOT VALID;
    ALTER TABLE attendance VALIDATE CONSTRAINT chk_attendance_absent_leave_no_late;
  END IF;
END $$;
