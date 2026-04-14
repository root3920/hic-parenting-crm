CREATE TABLE IF NOT EXISTS spc_csm_reports (
    id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    date                        date        NOT NULL,
    rep_name                    text        NOT NULL,
    hours_worked                numeric     NOT NULL DEFAULT 0,

    -- Community metrics
    community_size              int         NOT NULL DEFAULT 0,
    new_members                 int         NOT NULL DEFAULT 0,
    members_welcomed            int         NOT NULL DEFAULT 0,
    members_introduced          int         NOT NULL DEFAULT 0,
    questions_answered          int         NOT NULL DEFAULT 0,
    wins_shared                 int         NOT NULL DEFAULT 0,

    -- Content & Activity
    published_post              boolean     NOT NULL DEFAULT false,
    post_type                   text,
    sent_class_reminder         boolean     NOT NULL DEFAULT false,

    -- Retention
    inactive_identified         int         NOT NULL DEFAULT 0,
    checkin_messages_sent       int         NOT NULL DEFAULT 0,
    parent_frustration          boolean     NOT NULL DEFAULT false,
    parent_frustration_notes    text,
    referral_mentioned          boolean     NOT NULL DEFAULT false,
    referrals_count             int         NOT NULL DEFAULT 0,

    -- End of day
    highs                       text,
    lows                        text,
    performance                 int         NOT NULL DEFAULT 5
                                CHECK (performance BETWEEN 1 AND 10),

    created_at                  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE spc_csm_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users only" ON spc_csm_reports
    FOR ALL USING (auth.role() = 'authenticated');

CREATE INDEX idx_spc_csm_reports_date ON spc_csm_reports(date DESC);
CREATE INDEX idx_spc_csm_reports_rep  ON spc_csm_reports(rep_name);
