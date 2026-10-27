-- Migration 046: Add 'escalated' status for SPC members promoted to High Ticket (PWU 1:1).
-- Escalated members keep SPC access but don't count as active/trial/expired/cancelled.
-- Must be run manually in Supabase SQL Editor.

-- ── 1. Expand status CHECK to include 'escalated' ──────────────────────────

DO $$
DECLARE
  _con RECORD;
BEGIN
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
END $$;

ALTER TABLE public.spc_members
  ADD CONSTRAINT spc_members_status_check
  CHECK (status IN ('active', 'trial', 'cancelled', 'expired', 'paused', 'escalated'));

-- ── 2. Add escalation tracking columns ──────────────────────────────────────

ALTER TABLE public.spc_members
  ADD COLUMN IF NOT EXISTS escalated_at date,
  ADD COLUMN IF NOT EXISTS escalated_program text,
  ADD COLUMN IF NOT EXISTS escalated_contract_value numeric,
  ADD COLUMN IF NOT EXISTS escalated_installments integer,
  ADD COLUMN IF NOT EXISTS escalated_first_payment numeric,
  ADD COLUMN IF NOT EXISTS escalated_notes text,
  ADD COLUMN IF NOT EXISTS status_before_escalation text;

-- ── 3. Seed initial escalated members ───────────────────────────────────────
-- Save current status before overwriting.

-- 3a) Moreen Rubin (currently cancelled)
UPDATE public.spc_members
SET status_before_escalation = status,
    status = 'escalated',
    escalated_at = '2026-10-09',
    escalated_program = 'PWU 1:1 - 6 meses',
    escalated_contract_value = 5400,
    escalated_installments = 3,
    escalated_first_payment = 1800,
    escalated_notes = 'Canceló el SPC el 26-oct y disputó el cobro del SPC del 22-oct (reembolsado). Sigue activa en PWU.'
WHERE lower(email) = 'drrubinpsychology@gmail.com';

-- 3b) Shailaja Thaker (currently cancelled)
UPDATE public.spc_members
SET status_before_escalation = status,
    status = 'escalated',
    escalated_at = '2026-10-23',
    escalated_program = 'PWU 1:1 - 6 meses',
    escalated_contract_value = 5400,
    escalated_installments = 3,
    escalated_first_payment = 1800,
    escalated_notes = 'Canceló el SPC el 23-oct al pasar a PWU.'
WHERE lower(email) = 'cony982@hotmail.com';

-- 3c) Allison Bower (currently trial)
UPDATE public.spc_members
SET status_before_escalation = status,
    status = 'escalated',
    escalated_at = '2026-10-20',
    escalated_program = 'PWU 1:1 - 6 meses',
    escalated_contract_value = 5500,
    escalated_installments = 5,
    escalated_first_payment = 1100,
    escalated_notes = 'Sigue en trial del SPC; el periodo termina alrededor del 1-nov.'
WHERE lower(email) = 'al-iruth@hotmail.com';

-- ── 4. Reclassify cancellations for escalated members ───────────────────────
-- Moreen: cancelled_at around 2026-10-26
UPDATE public.spc_cancellations
SET cancel_type = 'escalated',
    paid_cancel = false,
    trial_cancel = false
WHERE lower(email) = 'drrubinpsychology@gmail.com'
  AND cancelled_at::date >= '2026-10-25'
  AND cancelled_at::date <= '2026-10-27';

-- Shailaja: cancelled_at around 2026-10-23
UPDATE public.spc_cancellations
SET cancel_type = 'escalated',
    paid_cancel = false,
    trial_cancel = false
WHERE lower(email) = 'cony982@hotmail.com'
  AND cancelled_at::date >= '2026-10-22'
  AND cancelled_at::date <= '2026-10-24';

-- ── 5. Verify (run after migration to check) ───────────────────────────────
-- SELECT email, status, status_before_escalation, escalated_at, escalated_program,
--        escalated_contract_value, escalated_installments, escalated_first_payment
-- FROM public.spc_members WHERE status = 'escalated';
--
-- SELECT email, cancel_type, paid_cancel, trial_cancel
-- FROM public.spc_cancellations
-- WHERE lower(email) IN ('drrubinpsychology@gmail.com', 'cony982@hotmail.com');
--
-- NOTE: There is no CHECK constraint on spc_cancellations.cancel_type (confirmed).
-- The 'escalated' value is safe to use.
--
-- NOTE: Cannot verify PWU first-payment dates against transactions table because
-- PWU 1:1 payments may not be tracked in the same transactions table (which filters
-- by 'Secure Parent' offer titles). Use the provided dates as-is.
