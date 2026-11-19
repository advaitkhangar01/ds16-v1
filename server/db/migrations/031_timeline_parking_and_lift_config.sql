-- Migration 031: Timeline Configurable Basements, Upper Parking & Lift Support
-- Adds dedicated configuration columns to timeline_configurations

ALTER TABLE timeline_configurations
  ADD COLUMN IF NOT EXISTS basement_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS upper_parking_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS has_stilt_parking BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS has_lift BOOLEAN DEFAULT TRUE;

COMMENT ON COLUMN timeline_configurations.basement_count IS 'Number of basement levels below ground (0 = none, 1 = B1, 2 = B1+B2, etc.)';
COMMENT ON COLUMN timeline_configurations.upper_parking_count IS 'Number of upper-floor/podium parking levels (0 = none, 1 = P1, 2 = P1+P2, etc.)';
COMMENT ON COLUMN timeline_configurations.has_stilt_parking IS 'Whether ground floor includes stilt parking';
COMMENT ON COLUMN timeline_configurations.has_lift IS 'Whether building includes elevator / lift installation and commissioning';
