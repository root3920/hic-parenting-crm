-- ============================================================================
-- 027: Expand value_ladder_contacts to support 6 pipeline stages
-- ============================================================================
-- Old: current_stage CHECK (1-5)
-- New: current_stage CHECK (1-6) to add stage 6 = Graduate Plans
-- ============================================================================

-- Drop the old constraint and add the new one
ALTER TABLE value_ladder_contacts
  DROP CONSTRAINT IF EXISTS value_ladder_contacts_current_stage_check;

ALTER TABLE value_ladder_contacts
  ADD CONSTRAINT value_ladder_contacts_current_stage_check
  CHECK (current_stage BETWEEN 1 AND 6);
