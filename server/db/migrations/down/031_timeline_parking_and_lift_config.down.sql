-- Migration 031 Down: Rollback Configurable Basements, Upper Parking & Lift Support

ALTER TABLE timeline_configurations
  DROP COLUMN IF EXISTS basement_count,
  DROP COLUMN IF EXISTS upper_parking_count,
  DROP COLUMN IF EXISTS has_stilt_parking,
  DROP COLUMN IF EXISTS has_lift;
