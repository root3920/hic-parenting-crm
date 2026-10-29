-- Migration: finance_commissions_audit table + unique partial index on payment_id
-- Run manually after verifying no duplicate payment_id values exist.

-- 1. Create audit table for deleted commissions
CREATE TABLE IF NOT EXISTS finance_commissions_audit (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  commission_id uuid NOT NULL,
  row_data jsonb NOT NULL,
  deleted_by uuid NOT NULL REFERENCES auth.users(id),
  deleted_at timestamptz NOT NULL DEFAULT now()
);

-- Allow service role full access (no RLS needed — only server writes here)
ALTER TABLE finance_commissions_audit ENABLE ROW LEVEL SECURITY;

-- 2. Add buyer_email column to finance_commissions if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'finance_commissions' AND column_name = 'buyer_email'
  ) THEN
    ALTER TABLE finance_commissions ADD COLUMN buyer_email text;
  END IF;
END $$;

-- 3. Add payment_id column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'finance_commissions' AND column_name = 'payment_id'
  ) THEN
    ALTER TABLE finance_commissions ADD COLUMN payment_id text;
  END IF;
END $$;

-- 4. Unique partial index on payment_id (only when NOT NULL).
--    IMPORTANT: Before running this, check for duplicate payment_id values:
--
--    SELECT payment_id, count(*)
--    FROM finance_commissions
--    WHERE payment_id IS NOT NULL
--    GROUP BY payment_id
--    HAVING count(*) > 1;
--
--    If duplicates are found, resolve them before creating the index.

-- Uncomment the line below after confirming no duplicates:
-- CREATE UNIQUE INDEX IF NOT EXISTS idx_finance_commissions_payment_id_unique
--   ON finance_commissions (payment_id)
--   WHERE payment_id IS NOT NULL;
