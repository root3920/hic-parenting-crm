-- 034: Make ig_message_id UNIQUE to enforce dedup at DB level
-- Replaces the non-unique partial index with a proper UNIQUE constraint.
-- Prevents race-condition duplicates from concurrent webhook retries.

DROP INDEX IF EXISTS idx_ig_msg_dedup;

CREATE UNIQUE INDEX idx_ig_msg_dedup ON instagram_messages(ig_message_id) WHERE ig_message_id IS NOT NULL;
