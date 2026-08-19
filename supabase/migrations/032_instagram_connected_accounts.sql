-- 032: Instagram connected accounts (OAuth tokens) + profile pic on conversations
--
-- Stores access tokens from Meta's OAuth flow.
-- Token is stored server-side only — never exposed in client responses.

CREATE TABLE IF NOT EXISTS instagram_connected_accounts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ig_user_id TEXT NOT NULL UNIQUE,
  ig_username TEXT NOT NULL,
  ig_profile_pic_url TEXT,
  ig_name TEXT,
  access_token TEXT NOT NULL,
  token_type TEXT DEFAULT 'short_lived',
  connected_by UUID,
  connected_at TIMESTAMPTZ DEFAULT now()
);

-- Add profile pic column to conversations for display
ALTER TABLE instagram_conversations
  ADD COLUMN IF NOT EXISTS ig_profile_pic_url TEXT;
