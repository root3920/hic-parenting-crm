-- Migration 045: Add 'paused' status, 'mid_ticket' plan, and payment tracking columns
-- Must be run manually in Supabase SQL Editor before the sync script.

-- ── 1. Drop and recreate CHECK constraints dynamically ──────────────────────

DO $$
DECLARE
  _con RECORD;
BEGIN
  -- Drop all CHECK constraints on spc_members.status
  FOR _con IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    JOIN pg_attribute att ON att.attrelid = rel.oid
       AND att.attnum = ANY(con.conkey)
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'spc_members'
      AND att.attname = 'status'
      AND con.contype = 'c'
  LOOP
    EXECUTE format('ALTER TABLE public.spc_members DROP CONSTRAINT %I', _con.conname);
    RAISE NOTICE 'Dropped status constraint: %', _con.conname;
  END LOOP;

  -- Drop all CHECK constraints on spc_members.plan
  FOR _con IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    JOIN pg_attribute att ON att.attrelid = rel.oid
       AND att.attnum = ANY(con.conkey)
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'spc_members'
      AND att.attname = 'plan'
      AND con.contype = 'c'
  LOOP
    EXECUTE format('ALTER TABLE public.spc_members DROP CONSTRAINT %I', _con.conname);
    RAISE NOTICE 'Dropped plan constraint: %', _con.conname;
  END LOOP;
END $$;

-- ── 2. Recreate with expanded values ────────────────────────────────────────

ALTER TABLE public.spc_members
  ADD CONSTRAINT spc_members_status_check
  CHECK (status IN ('active', 'trial', 'cancelled', 'expired', 'paused'));

ALTER TABLE public.spc_members
  ADD CONSTRAINT spc_members_plan_check
  CHECK (plan IN ('monthly', 'annual', 'mid_ticket'));

-- ── 3. Payment issue tracking columns ───────────────────────────────────────

ALTER TABLE public.spc_members
  ADD COLUMN IF NOT EXISTS payment_issue boolean DEFAULT false;

ALTER TABLE public.spc_members
  ADD COLUMN IF NOT EXISTS months_unpaid integer DEFAULT 0;
