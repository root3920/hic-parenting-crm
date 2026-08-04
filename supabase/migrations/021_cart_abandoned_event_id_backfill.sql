-- Add hotmart_event_id for webhook retry deduplication
ALTER TABLE hotmart_cart_abandoned
  ADD COLUMN IF NOT EXISTS hotmart_event_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_cart_abandoned_event_id
  ON hotmart_cart_abandoned (hotmart_event_id)
  WHERE hotmart_event_id IS NOT NULL;

-- Backfill from existing PURCHASE_OUT_OF_SHOPPING_CART events in webhook logs
INSERT INTO hotmart_cart_abandoned (email, name, phone, product, offer_code, abandoned_at, hotmart_event_id, recovered)
SELECT
  payload->'body_parsed'->'data'->'buyer'->>'email',
  payload->'body_parsed'->'data'->'buyer'->>'name',
  payload->'body_parsed'->'data'->'buyer'->>'phone',
  payload->'body_parsed'->'data'->'product'->>'name',
  payload->'body_parsed'->'data'->'offer'->>'code',
  CASE
    WHEN (payload->'body_parsed'->>'creation_date') IS NOT NULL
    THEN to_timestamp((payload->'body_parsed'->>'creation_date')::bigint / 1000.0)
    ELSE processed_at
  END,
  payload->'body_parsed'->>'id',
  false
FROM hotmart_webhook_logs
WHERE event = 'PURCHASE_OUT_OF_SHOPPING_CART'
  AND status = 'received'
  AND payload->>'_raw_capture' = 'true'
  AND payload->'body_parsed'->'data'->'buyer'->>'email' IS NOT NULL
ON CONFLICT DO NOTHING;
