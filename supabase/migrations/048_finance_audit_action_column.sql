-- Migration: add action and changed_by columns to finance_commissions_audit
-- so it can store edits (not just deletes).
-- Run manually in Supabase SQL Editor.

-- 1. Add action column (default 'delete' for existing rows)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'finance_commissions_audit' AND column_name = 'action'
  ) THEN
    ALTER TABLE finance_commissions_audit
      ADD COLUMN action text NOT NULL DEFAULT 'delete';
  END IF;
END $$;

-- 2. Add changed_by as a nullable alias (existing rows use deleted_by)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'finance_commissions_audit' AND column_name = 'changed_by'
  ) THEN
    ALTER TABLE finance_commissions_audit
      ADD COLUMN changed_by uuid REFERENCES auth.users(id);
  END IF;
END $$;

-- 3. Backfill changed_by from deleted_by for existing rows
UPDATE finance_commissions_audit
SET changed_by = deleted_by
WHERE changed_by IS NULL AND deleted_by IS NOT NULL;

-- 4. Make deleted_by nullable (edit rows won't use it)
ALTER TABLE finance_commissions_audit
  ALTER COLUMN deleted_by DROP NOT NULL;

-- 5. Make deleted_at nullable (edit rows won't use it)
ALTER TABLE finance_commissions_audit
  ALTER COLUMN deleted_at DROP NOT NULL;
