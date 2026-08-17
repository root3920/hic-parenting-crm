-- ============================================================================
-- 025: Consolidate Sumaiya Olatunde duplicate pwu_students records
-- ============================================================================
-- Three records exist for the same person due to Kajabi email typos:
--   CANONICAL: 0047924e-... email sumaiya@h2counseling.com   → fix to sumaiya@h2dcounseling.com
--   DUPE 1:    3eb1ecab-... email sumaiya@h2dcounsing.com    (typo: missing "el")
--   DUPE 2:    0bfebb3e-... email sumaiya@h2dcounseling.com  (correct email, but sparse record)
--
-- Strategy:
-- 1. Update canonical record's email to the correct one
-- 2. Reassign all child rows (coaching_sessions, student_notes) from dupes → canonical
-- 3. Fix buyer_email on transactions for the typo emails
-- 4. Delete duplicate onboarding_pipeline row (canonical has step 6, dupe has step 5)
-- 5. Delete duplicate pwu_students rows
-- ============================================================================

BEGIN;

-- IDs for clarity
-- canonical: 0047924e-0c2e-4496-94ae-c0f82818efa6
-- dupe1:     3eb1ecab-7554-4ffa-9c44-97b3d03773f8
-- dupe2:     0bfebb3e-5c1a-443e-833a-272280121eb4

-- ── 1. Fix canonical student email ──────────────────────────────────────────
UPDATE pwu_students
SET email = 'sumaiya@h2dcounseling.com'
WHERE id = '0047924e-0c2e-4496-94ae-c0f82818efa6';

-- ── 2. Reassign coaching_sessions from both dupes → canonical ───────────────
UPDATE coaching_sessions
SET student_id = '0047924e-0c2e-4496-94ae-c0f82818efa6'
WHERE student_id IN (
  '3eb1ecab-7554-4ffa-9c44-97b3d03773f8',
  '0bfebb3e-5c1a-443e-833a-272280121eb4'
);

-- ── 3. Reassign student_notes from both dupes → canonical ───────────────────
UPDATE student_notes
SET student_id = '0047924e-0c2e-4496-94ae-c0f82818efa6'
WHERE student_id IN (
  '3eb1ecab-7554-4ffa-9c44-97b3d03773f8',
  '0bfebb3e-5c1a-443e-833a-272280121eb4'
);

-- ── 4. Fix buyer_email on transactions for all typo variants ────────────────
UPDATE transactions
SET buyer_email = 'sumaiya@h2dcounseling.com'
WHERE buyer_email IN ('sumaiya@h2counseling.com', 'sumaiya@h2dcounsing.com');

-- ── 5. Delete duplicate onboarding_pipeline rows ────────────────────────────
--       Canonical (0047924e) has current_step=6, dupe1 (3eb1ecab) has step=5.
--       Keep canonical, delete dupe.
DELETE FROM onboarding_pipeline
WHERE student_id IN (
  '3eb1ecab-7554-4ffa-9c44-97b3d03773f8',
  '0bfebb3e-5c1a-443e-833a-272280121eb4'
);

-- ── 6. Delete student_payment_plans for dupes (if any exist) ────────────────
--       Only canonical (0047924e) has a payment plan; this is defensive.
DELETE FROM student_payment_plans
WHERE student_id IN (
  '3eb1ecab-7554-4ffa-9c44-97b3d03773f8',
  '0bfebb3e-5c1a-443e-833a-272280121eb4'
);

-- ── 7. Delete the two duplicate pwu_students rows ───────────────────────────
DELETE FROM pwu_students
WHERE id IN (
  '3eb1ecab-7554-4ffa-9c44-97b3d03773f8',
  '0bfebb3e-5c1a-443e-833a-272280121eb4'
);

COMMIT;
