ALTER TABLE job_applications
ADD COLUMN IF NOT EXISTS linkedin_url TEXT,
ADD COLUMN IF NOT EXISTS resume_url TEXT,
ADD COLUMN IF NOT EXISTS tools_used TEXT[],
ADD COLUMN IF NOT EXISTS clients_managed_range TEXT,
ADD COLUMN IF NOT EXISTS prioritization_answer TEXT,
ADD COLUMN IF NOT EXISTS difficult_situation TEXT,
ADD COLUMN IF NOT EXISTS welcome_message TEXT,
ADD COLUMN IF NOT EXISTS missed_session_message TEXT,
ADD COLUMN IF NOT EXISTS client_not_working_response TEXT,
ADD COLUMN IF NOT EXISTS csm_responsibility TEXT,
ADD COLUMN IF NOT EXISTS re_engagement_steps TEXT,
ADD COLUMN IF NOT EXISTS culture_fit_why TEXT,
ADD COLUMN IF NOT EXISTS excites_most TEXT;
