CREATE TABLE checklist_submissions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  checked_items JSONB NOT NULL,
  call_id UUID,
  submitted_at TIMESTAMPTZ DEFAULT now()
);
