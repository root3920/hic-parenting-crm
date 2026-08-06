-- Backfill: process the 3 SUBSCRIPTION_CANCELLATION events already in
-- hotmart_webhook_logs (through Aug 6 2026) that were logged as "processed"
-- but never actually updated spc_members or inserted spc_cancellations.
--
-- Step 1: Update spc_members status to 'cancelled' for each subscriber email.
-- Step 2: Insert spc_cancellations rows with the correct paid_cancel/trial_cancel flags.

-- Step 1: Cancel the members
UPDATE public.spc_members m
SET status = 'cancelled'
FROM (
  SELECT DISTINCT ON (lower(sub_email))
    lower(sub_email) AS sub_email,
    cancelled_at
  FROM (
    SELECT
      COALESCE(
        payload->'body_parsed'->'data'->'subscriber'->>'email',
        payload->'data'->'subscriber'->>'email'
      ) AS sub_email,
      COALESCE(
        to_timestamp(
          (COALESCE(
            payload->'body_parsed'->'data'->>'cancellation_date',
            payload->'data'->>'cancellation_date'
          ))::bigint / 1000.0
        ),
        processed_at
      ) AS cancelled_at,
      processed_at
    FROM public.hotmart_webhook_logs
    WHERE event = 'SUBSCRIPTION_CANCELLATION'
      AND status IN ('processed', 'received')
  ) raw
  WHERE sub_email IS NOT NULL
  ORDER BY lower(sub_email), processed_at DESC
) ev
WHERE lower(m.email) = ev.sub_email
  AND m.status != 'cancelled';

-- Step 2: Insert cancellation records (skip if already exists for this email+date)
INSERT INTO public.spc_cancellations (
  name,
  email,
  cancelled_at,
  paid_cancel,
  trial_cancel,
  provider,
  cancel_type
)
SELECT
  COALESCE(sub_name, 'Unknown'),
  lower(sub_email),
  cancelled_at,
  -- paid_cancel: true if the member was active/expired with amount > 0
  (prior_status != 'trial' AND COALESCE(prior_amount, 0) > 0),
  -- trial_cancel: true if the member was on trial
  (prior_status = 'trial'),
  'Hotmart',
  'requested'
FROM (
  SELECT DISTINCT ON (lower(sub_email))
    COALESCE(
      payload->'body_parsed'->'data'->'subscriber'->>'email',
      payload->'data'->'subscriber'->>'email'
    ) AS sub_email,
    COALESCE(
      payload->'body_parsed'->'data'->'subscriber'->>'name',
      payload->'data'->'subscriber'->>'name'
    ) AS sub_name,
    COALESCE(
      to_timestamp(
        (COALESCE(
          payload->'body_parsed'->'data'->>'cancellation_date',
          payload->'data'->>'cancellation_date'
        ))::bigint / 1000.0
      ),
      processed_at
    ) AS cancelled_at,
    processed_at
  FROM public.hotmart_webhook_logs
  WHERE event = 'SUBSCRIPTION_CANCELLATION'
    AND status IN ('processed', 'received')
  ORDER BY lower(sub_email), processed_at DESC
) ev
-- Join spc_members to get the status at cancellation time (now already 'cancelled'
-- from Step 1, but we can infer: amount=0 → was trial, amount>0 → was paid)
LEFT JOIN public.spc_members m ON lower(m.email) = lower(ev.sub_email)
CROSS JOIN LATERAL (
  SELECT
    CASE WHEN COALESCE(m.amount, 0) = 0 THEN 'trial' ELSE 'active' END AS prior_status,
    m.amount AS prior_amount
) inferred
WHERE ev.sub_email IS NOT NULL
  -- Dedupe: don't insert if a cancellation already exists for this email
  AND NOT EXISTS (
    SELECT 1 FROM public.spc_cancellations c
    WHERE lower(c.email) = lower(ev.sub_email)
      AND c.provider = 'Hotmart'
      AND c.cancel_type = 'requested'
  );
