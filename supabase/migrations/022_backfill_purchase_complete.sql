-- Backfill spc_members from PURCHASE_COMPLETE events already logged in
-- hotmart_webhook_logs (Jul 29 – Aug 6 2026). These events were logged as
-- "processed" but never created spc_members rows because the handler only
-- matched PURCHASE_APPROVED.
--
-- Uses email as the dedupe key: INSERT … ON CONFLICT (email) DO UPDATE so
-- existing rows are refreshed rather than duplicated.

INSERT INTO public.spc_members (
  email,
  name,
  phone,
  plan,
  amount,
  status,
  provider,
  joined_at,
  trial_days,
  trial_end_date,
  next_payment_date
)
SELECT DISTINCT ON (lower(buyer_email))
  lower(buyer_email)                                       AS email,
  COALESCE(buyer_name, 'Unknown')                          AS name,
  buyer_phone                                              AS phone,
  'monthly'                                                AS plan,
  COALESCE(price_value, 0)                                 AS amount,
  CASE WHEN COALESCE(price_value, 0) = 0
       THEN 'trial' ELSE 'active' END                      AS status,
  'Hotmart'                                                AS provider,
  joined_at                                                AS joined_at,
  CASE WHEN COALESCE(price_value, 0) = 0
       THEN 30 ELSE NULL END                               AS trial_days,
  CASE WHEN COALESCE(price_value, 0) = 0
       THEN (joined_at + INTERVAL '30 days')::date
       ELSE NULL END                                       AS trial_end_date,
  CASE WHEN COALESCE(price_value, 0) = 0
       THEN (joined_at + INTERVAL '30 days')::date
       ELSE (joined_at + INTERVAL '30 days')::date END     AS next_payment_date
FROM (
  SELECT
    -- Extract buyer fields from raw-capture payloads
    lower(
      COALESCE(
        payload->'body_parsed'->'data'->'buyer'->>'email',
        payload->'data'->'buyer'->>'email'
      )
    ) AS buyer_email,
    COALESCE(
      payload->'body_parsed'->'data'->'buyer'->>'name',
      payload->'data'->'buyer'->>'name'
    ) AS buyer_name,
    COALESCE(
      payload->'body_parsed'->'data'->'buyer'->>'checkout_phone',
      payload->'data'->'buyer'->>'checkout_phone'
    ) AS buyer_phone,
    (COALESCE(
      payload->'body_parsed'->'data'->'purchase'->'price'->>'value',
      payload->'data'->'purchase'->'price'->>'value',
      '0'
    ))::numeric AS price_value,
    -- Use approved_date (ms timestamp) if present, else creation_date, else processed_at
    COALESCE(
      to_timestamp(
        (COALESCE(
          payload->'body_parsed'->'data'->'purchase'->>'approved_date',
          payload->'data'->'purchase'->>'approved_date'
        ))::bigint / 1000.0
      ),
      to_timestamp(
        (COALESCE(
          payload->'body_parsed'->>'creation_date',
          payload->>'creation_date'
        ))::bigint / 1000.0
      ),
      processed_at
    ) AS joined_at,
    processed_at
  FROM public.hotmart_webhook_logs
  WHERE event = 'PURCHASE_COMPLETE'
    AND status IN ('processed', 'received')
    AND processed_at >= '2026-07-29'
) sub
WHERE buyer_email IS NOT NULL
ORDER BY lower(buyer_email), processed_at ASC   -- keep earliest per email
ON CONFLICT (email) DO UPDATE SET
  -- Only update fields that are still at their defaults / missing
  name   = CASE WHEN public.spc_members.name = 'Unknown'
                 THEN EXCLUDED.name ELSE public.spc_members.name END,
  phone  = COALESCE(public.spc_members.phone, EXCLUDED.phone);
