-- 030: Add portal escalation metrics to setter_daily_reports
--
-- portal_escalated: count of contacts whose setter_daily_queue status moved
--   from 'not_contacted' to any progression status on a given date
-- portal_calls_scheduled: count of contacts whose status became 'call_scheduled'
--   on a given date
--
-- Both nullable (auto-calculated on form load, but manually overridable).

ALTER TABLE setter_daily_reports
  ADD COLUMN IF NOT EXISTS portal_escalated INTEGER,
  ADD COLUMN IF NOT EXISTS portal_calls_scheduled INTEGER;
