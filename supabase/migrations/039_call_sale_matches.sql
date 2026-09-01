-- call_sale_matches: links calls to transactions (sales)
CREATE TABLE IF NOT EXISTS call_sale_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id UUID NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  matched_by TEXT NOT NULL CHECK (matched_by IN ('auto', 'manual')),
  linked_by TEXT,  -- closer name if manual, null if auto
  linked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(call_id, transaction_id)
);

CREATE INDEX idx_call_sale_matches_call_id ON call_sale_matches(call_id);
CREATE INDEX idx_call_sale_matches_transaction_id ON call_sale_matches(transaction_id);
