-- Add part2_of_call_id column to calls table
-- Links a "Part 2" call to its original call for continuation tracking.
-- Nullable FK: only populated when status = 'Part 2'.

ALTER TABLE calls
  ADD COLUMN IF NOT EXISTS part2_of_call_id uuid
    REFERENCES calls(id) ON DELETE SET NULL;

-- Index for quick reverse lookups ("which calls are Part 2 of call X?")
CREATE INDEX IF NOT EXISTS idx_calls_part2_of_call_id
  ON calls (part2_of_call_id)
  WHERE part2_of_call_id IS NOT NULL;
