-- 029: Create setter_daily_queue table + migrate lead_status to new values
--
-- Old lead_status values → new mapping:
--   'hot_lead'          → 'call_proposed'   (hot leads are ones where a call was proposed)
--   'engaged'           → 'following_up'    (engaged contacts are being followed up)
--   'disqualified_lead' → NULL              (no equivalent in new system, reset)
--   'non_responsive'    → 'not_contacted'   (non-responsive treated as needing fresh contact)
--   NULL                → NULL              (stays unclassified)

-- ── 1) Create setter_daily_queue table ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS setter_daily_queue (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_email TEXT NOT NULL,
  setter_name TEXT NOT NULL,
  assigned_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'not_contacted'
    CHECK (status IN ('not_contacted', 'contacted', 'following_up', 'call_proposed', 'call_scheduled')),
  status_updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (contact_email, assigned_date)
);

CREATE INDEX idx_sdq_setter_name ON setter_daily_queue(setter_name);
CREATE INDEX idx_sdq_assigned_date ON setter_daily_queue(assigned_date);
CREATE INDEX idx_sdq_status ON setter_daily_queue(status);
CREATE INDEX idx_sdq_contact_email ON setter_daily_queue(contact_email);

-- ── 2) Migrate existing lead_status values ──────────────────────────────────

UPDATE value_ladder_contacts
SET lead_status = CASE lead_status
  WHEN 'hot_lead'          THEN 'call_proposed'
  WHEN 'engaged'           THEN 'following_up'
  WHEN 'disqualified_lead' THEN NULL
  WHEN 'non_responsive'    THEN 'not_contacted'
  ELSE lead_status
END
WHERE lead_status IS NOT NULL;

-- ── 3) Replace CHECK constraint with new values ─────────────────────────────

ALTER TABLE value_ladder_contacts
  DROP CONSTRAINT IF EXISTS value_ladder_contacts_lead_status_check;

ALTER TABLE value_ladder_contacts
  ADD CONSTRAINT value_ladder_contacts_lead_status_check
  CHECK (lead_status IS NULL OR lead_status IN ('not_contacted', 'contacted', 'following_up', 'call_proposed', 'call_scheduled'));
