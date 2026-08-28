CREATE TABLE IF NOT EXISTS student_graduation_outreach (
  id uuid default gen_random_uuid() primary key,
  student_id uuid not null references pwu_students(id) on delete cascade,
  family_manifesto_sent boolean not null default false,
  testimonial_requested boolean not null default false,
  nurturing_conversation_had boolean not null default false,
  referred_to_grad_program boolean not null default false,
  continuation_opportunity_identified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  UNIQUE(student_id)
);

ALTER TABLE student_graduation_outreach ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users only" ON student_graduation_outreach
  FOR ALL USING (auth.role() = 'authenticated');

CREATE INDEX idx_student_graduation_outreach_student ON student_graduation_outreach(student_id);
