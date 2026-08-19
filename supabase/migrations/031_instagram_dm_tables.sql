-- 031: Instagram DM qualification assistant — data model
--
-- Three tables: conversations, messages, and a human-review queue for
-- AI-generated draft responses.

-- ── 1) instagram_conversations ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS instagram_conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ig_user_id TEXT NOT NULL UNIQUE,
  ig_username TEXT NOT NULL,
  name TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'qualified', 'disqualified', 'needs_review', 'handed_to_advisor')),
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_ig_conv_status ON instagram_conversations(status);
CREATE INDEX idx_ig_conv_last_msg ON instagram_conversations(last_message_at DESC);

-- ── 2) instagram_messages ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS instagram_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES instagram_conversations(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  message_text TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ig_message_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_ig_msg_conv ON instagram_messages(conversation_id, sent_at);
CREATE INDEX idx_ig_msg_dedup ON instagram_messages(ig_message_id) WHERE ig_message_id IS NOT NULL;

-- ── 3) instagram_review_queue ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS instagram_review_queue (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES instagram_conversations(id) ON DELETE CASCADE,
  trigger_message_id UUID NOT NULL REFERENCES instagram_messages(id) ON DELETE CASCADE,
  draft_response TEXT NOT NULL,
  ai_assessment TEXT NOT NULL
    CHECK (ai_assessment IN ('qualified', 'disqualified', 'gathering_info', 'not_seeking_help')),
  ai_reasoning TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'edited_and_approved', 'rejected')),
  final_response TEXT,
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_ig_review_status ON instagram_review_queue(status);
CREATE INDEX idx_ig_review_conv ON instagram_review_queue(conversation_id);
