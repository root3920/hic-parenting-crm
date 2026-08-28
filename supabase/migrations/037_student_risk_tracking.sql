CREATE TABLE IF NOT EXISTS student_risk_tracking (
  id uuid default gen_random_uuid() primary key,
  student_id uuid not null references pwu_students(id) on delete cascade,
  flagged_by text not null,
  status text not null check (status in ('at_risk', 'recovered', 'lost')),
  flagged_at timestamptz not null default now(),
  recovered_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

ALTER TABLE student_risk_tracking ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users only" ON student_risk_tracking
  FOR ALL USING (auth.role() = 'authenticated');

CREATE INDEX idx_student_risk_tracking_student ON student_risk_tracking(student_id);
CREATE INDEX idx_student_risk_tracking_status ON student_risk_tracking(status);
