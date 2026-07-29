-- Hotmart Club engagement tracking

CREATE TABLE IF NOT EXISTS hotmart_club_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  name TEXT,
  status TEXT,
  engagement TEXT,
  role TEXT,
  type TEXT,
  access_count INTEGER DEFAULT 0,
  last_access_date TIMESTAMPTZ,
  first_access_date TIMESTAMPTZ,
  purchase_date TIMESTAMPTZ,
  progress_completed INTEGER DEFAULT 0,
  progress_percentage INTEGER DEFAULT 0,
  progress_total INTEGER DEFAULT 0,
  synced_at TIMESTAMPTZ DEFAULT now()
);
