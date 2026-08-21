-- 035: Add attachment support to instagram_messages
-- Adds message_type and attachment_url for non-text messages (images, audio, video, etc.)

ALTER TABLE instagram_messages
  ADD COLUMN IF NOT EXISTS message_type TEXT NOT NULL DEFAULT 'text'
    CHECK (message_type IN ('text', 'image', 'audio', 'video', 'file', 'other')),
  ADD COLUMN IF NOT EXISTS attachment_url TEXT;
