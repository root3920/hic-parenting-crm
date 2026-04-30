-- Add trials_expiring_soon_contacted column to spc_performance_reports
ALTER TABLE spc_performance_reports
  ADD COLUMN IF NOT EXISTS trials_expiring_soon_contacted INTEGER DEFAULT 0;
