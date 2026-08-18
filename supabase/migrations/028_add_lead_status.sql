-- Add lead_status column to value_ladder_contacts
-- Nullable text with CHECK constraint for valid statuses.
-- No default — existing/new contacts aren't force-classified.

ALTER TABLE value_ladder_contacts
  ADD COLUMN IF NOT EXISTS lead_status TEXT;

ALTER TABLE value_ladder_contacts
  ADD CONSTRAINT value_ladder_contacts_lead_status_check
  CHECK (lead_status IS NULL OR lead_status IN ('hot_lead', 'engaged', 'disqualified_lead', 'non_responsive'));

CREATE INDEX idx_vlc_lead_status ON value_ladder_contacts(lead_status);
