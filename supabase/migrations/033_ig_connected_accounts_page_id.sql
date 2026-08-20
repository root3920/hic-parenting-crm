-- 033: Add Facebook Page ID to instagram_connected_accounts
-- The /conversations endpoint requires the Page ID (not the IG Business Account ID)
-- with platform=instagram to fetch Instagram DM conversations.

ALTER TABLE instagram_connected_accounts
  ADD COLUMN IF NOT EXISTS fb_page_id TEXT;
