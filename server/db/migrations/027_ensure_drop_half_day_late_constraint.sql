-- Migration 027: Unconditionally drop legacy chk_attendance_half_day_absent_no_late
-- Policy A: An employee who arrives late is marked is_late=true and retains late_minutes
-- even if the shift ends as half_day (hours_worked < minimum batch hours).
-- Only absent and leave records must never carry late markers.

DO $$
BEGIN
  -- 1. Unconditionally drop the legacy constraint that crashed checkout on half_day
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_attendance_half_day_absent_no_late') THEN
    ALTER TABLE attendance DROP CONSTRAINT chk_attendance_half_day_absent_no_late;
  END IF;

  -- 2. Clean up any absent/leave rows that might violate the refined constraint
  UPDATE attendance
  SET is_late = FALSE, late_minutes = 0
  WHERE LOWER(COALESCE(status, '')) IN ('absent', 'leave')
    AND (is_late = TRUE OR late_minutes > 0);

  -- 3. Ensure the refined constraint exists and is validated
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_attendance_absent_leave_no_late') THEN
    ALTER TABLE attendance ADD CONSTRAINT chk_attendance_absent_leave_no_late
      CHECK (NOT (LOWER(COALESCE(status, '')) IN ('absent', 'leave') AND (is_late = TRUE OR late_minutes > 0))) NOT VALID;
    ALTER TABLE attendance VALIDATE CONSTRAINT chk_attendance_absent_leave_no_late;
  END IF;
END $$;
