CREATE TABLE IF NOT EXISTS spc_member_notes (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id     text        NOT NULL,
    note          text        NOT NULL,
    created_by    text        NOT NULL,
    created_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE spc_member_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users only" ON spc_member_notes
    FOR ALL USING (auth.role() = 'authenticated');
CREATE INDEX idx_spc_member_notes_member ON spc_member_notes(member_id);
