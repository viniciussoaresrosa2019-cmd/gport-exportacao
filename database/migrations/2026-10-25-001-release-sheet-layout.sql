ALTER TABLE processes
  ADD COLUMN IF NOT EXISTS release_seen_on DATE;

ALTER TABLE processes
  ADD COLUMN IF NOT EXISTS release_note VARCHAR(500);
