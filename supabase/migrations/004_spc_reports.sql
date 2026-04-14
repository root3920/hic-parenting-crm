-- Migration: spc_reports
-- Daily report for the Client Success SPC team

CREATE TABLE IF NOT EXISTS spc_reports (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  date              date        NOT NULL,
  rep_name          text        NOT NULL,

  -- Community metrics
  c_active_members  int         NOT NULL DEFAULT 0,
  c_new_members     int         NOT NULL DEFAULT 0,
  c_at_risk         int         NOT NULL DEFAULT 0,
  c_churn           int         NOT NULL DEFAULT 0,
  c_reactivated     int         NOT NULL DEFAULT 0,
  c_notas           text,

  -- Content & Activity
  a_posts           int         NOT NULL DEFAULT 0,
  a_comments        int         NOT NULL DEFAULT 0,
  a_lives           int         NOT NULL DEFAULT 0,
  a_engagement      text        NOT NULL DEFAULT 'Medium',
  a_notas           text,

  -- Retention
  r_requests        int         NOT NULL DEFAULT 0,
  r_saved           int         NOT NULL DEFAULT 0,
  r_churn           int         NOT NULL DEFAULT 0,
  r_cancel_reasons  text[],
  r_notas           text,

  -- Daily closeout
  e_wins            text,
  e_risks           text,
  e_action1         text,
  e_action2         text,
  e_action3         text,
  e_performance     int         NOT NULL DEFAULT 5 CHECK (e_performance BETWEEN 1 AND 10),

  created_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE spc_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users only" ON spc_reports
  FOR ALL USING (auth.role() = 'authenticated');

CREATE INDEX idx_spc_reports_date ON spc_reports(date DESC);
CREATE INDEX idx_spc_reports_rep  ON spc_reports(rep_name);
