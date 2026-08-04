-- Backfill hotmart_cart_abandoned from existing PURCHASE_OUT_OF_SHOPPING_CART
-- events already captured in hotmart_webhook_logs.
--
-- Two log formats exist:
--   1. Raw captures (status='received'): body is at payload->'body_parsed'
--   2. Processed logs (status='processed'/'success'): body IS the payload directly

-- From raw capture logs
INSERT INTO hotmart_cart_abandoned (email, name, phone, product, offer_code, abandoned_at, recovered)
SELECT DISTINCT ON (
  payload->'body_parsed'->'data'->'buyer'->>'email',
  CASE
    WHEN (payload->'body_parsed'->>'creation_date') IS NOT NULL
    THEN to_timestamp((payload->'body_parsed'->>'creation_date')::bigint / 1000.0)
    ELSE processed_at
  END
)
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
  false
FROM hotmart_webhook_logs
WHERE event = 'PURCHASE_OUT_OF_SHOPPING_CART'
  AND payload->>'_raw_capture' = 'true'
  AND payload->'body_parsed'->'data'->'buyer'->>'email' IS NOT NULL
ORDER BY
  payload->'body_parsed'->'data'->'buyer'->>'email',
  CASE
    WHEN (payload->'body_parsed'->>'creation_date') IS NOT NULL
    THEN to_timestamp((payload->'body_parsed'->>'creation_date')::bigint / 1000.0)
    ELSE processed_at
  END,
  processed_at DESC;

-- From processed/success logs (body stored directly in payload)
INSERT INTO hotmart_cart_abandoned (email, name, phone, product, offer_code, abandoned_at, recovered)
SELECT DISTINCT ON (
  payload->'data'->'buyer'->>'email',
  CASE
    WHEN (payload->>'creation_date') IS NOT NULL
    THEN to_timestamp((payload->>'creation_date')::bigint / 1000.0)
    ELSE processed_at
  END
)
  payload->'data'->'buyer'->>'email',
  payload->'data'->'buyer'->>'name',
  payload->'data'->'buyer'->>'phone',
  payload->'data'->'product'->>'name',
  payload->'data'->'offer'->>'code',
  CASE
    WHEN (payload->>'creation_date') IS NOT NULL
    THEN to_timestamp((payload->>'creation_date')::bigint / 1000.0)
    ELSE processed_at
  END,
  false
FROM hotmart_webhook_logs
WHERE event = 'PURCHASE_OUT_OF_SHOPPING_CART'
  AND (payload->>'_raw_capture') IS DISTINCT FROM 'true'
  AND payload->'data'->'buyer'->>'email' IS NOT NULL
  -- Skip if already backfilled from raw capture above
  AND NOT EXISTS (
    SELECT 1 FROM hotmart_cart_abandoned ca
    WHERE ca.email = payload->'data'->'buyer'->>'email'
      AND ca.abandoned_at = CASE
        WHEN (payload->>'creation_date') IS NOT NULL
        THEN to_timestamp((payload->>'creation_date')::bigint / 1000.0)
        ELSE processed_at
      END
  )
ORDER BY
  payload->'data'->'buyer'->>'email',
  CASE
    WHEN (payload->>'creation_date') IS NOT NULL
    THEN to_timestamp((payload->>'creation_date')::bigint / 1000.0)
    ELSE processed_at
  END,
  processed_at DESC;
