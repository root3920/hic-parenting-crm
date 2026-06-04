CREATE TABLE coaching_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID REFERENCES pwu_students(id) ON DELETE CASCADE,
  session_date TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER DEFAULT 60,
  session_type TEXT DEFAULT 'individual', -- 'individual' | 'group'
  status TEXT DEFAULT 'scheduled', -- 'scheduled' | 'completed' | 'cancelled' | 'no_show'
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_coaching_sessions_student ON coaching_sessions(student_id);
CREATE INDEX idx_coaching_sessions_date ON coaching_sessions(session_date);
