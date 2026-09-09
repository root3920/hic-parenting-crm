-- 040: Setter follow-up tracking (replaces Google Sheet)
--
-- setter_followup_contacts — manual contacts tracked by setters
-- setter_followup_events  — unlimited follow-up history per contact

-- ============================================================
-- Table 1: setter_followup_contacts
-- ============================================================
CREATE TABLE setter_followup_contacts (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  full_name    TEXT NOT NULL,
  email        TEXT,
  phone        TEXT,
  setter_name  TEXT NOT NULL,
  reason       TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'active'
                 CHECK (status IN ('active', 'responded', 'closed')),
  added_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sfc_setter_name ON setter_followup_contacts (setter_name);
CREATE INDEX idx_sfc_status      ON setter_followup_contacts (status);

-- ============================================================
-- Table 2: setter_followup_events
-- ============================================================
CREATE TABLE setter_followup_events (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id    UUID NOT NULL REFERENCES setter_followup_contacts (id) ON DELETE CASCADE,
  followup_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes         TEXT,
  created_by    TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sfe_contact_id ON setter_followup_events (contact_id);
