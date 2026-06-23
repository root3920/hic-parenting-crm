-- Add success metrics columns to ht_csm_reports
ALTER TABLE ht_csm_reports
ADD COLUMN IF NOT EXISTS client_retention_rate NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS completion_rate NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS engagement_score NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS upsell_renewal_rate NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS avg_resolution_time_hours NUMERIC DEFAULT 0;
