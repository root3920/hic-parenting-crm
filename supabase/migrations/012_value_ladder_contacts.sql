-- Value Ladder Pipeline: manual overrides and setter activity tracking
CREATE TABLE IF NOT EXISTS value_ladder_contacts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  buyer_email TEXT NOT NULL UNIQUE,
  buyer_name TEXT,
  current_stage INTEGER NOT NULL DEFAULT 1 CHECK (current_stage BETWEEN 1 AND 5),
  manual_override BOOLEAN DEFAULT false,
  setter_assigned TEXT,
  last_contacted_at TIMESTAMPTZ,
  product_proposed TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_vlc_buyer_email ON value_ladder_contacts(buyer_email);
CREATE INDEX idx_vlc_current_stage ON value_ladder_contacts(current_stage);
CREATE INDEX idx_vlc_setter_assigned ON value_ladder_contacts(setter_assigned);
