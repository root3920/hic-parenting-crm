-- Reference table for pre-registered PWU cohort numbers
CREATE TABLE IF NOT EXISTS pwu_cohorts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cohort_number TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Seed with all existing distinct cohort values from pwu_students
INSERT INTO pwu_cohorts (cohort_number)
SELECT DISTINCT cohort FROM pwu_students
WHERE cohort IS NOT NULL
ON CONFLICT (cohort_number) DO NOTHING;
