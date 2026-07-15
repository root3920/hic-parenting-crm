-- Add SPC buyers field to setter daily reports
ALTER TABLE setter_daily_reports ADD COLUMN IF NOT EXISTS spc_buyers INTEGER DEFAULT 0;
