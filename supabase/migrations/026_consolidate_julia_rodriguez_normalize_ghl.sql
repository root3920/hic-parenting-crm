-- ============================================================================
-- 026: Consolidate Julia Rodriguez duplicate + normalize "Go High Level" source
-- ============================================================================
--
-- Part A: Julia Rodriguez has two pwu_students records with the SAME email
--   (rodriguezjulia_12@yahoo.com). No transaction reassignment needed (email-based).
--
--   DUPE (empty):    7430bddd-3bce-43ad-8d27-54f01d4312bc  (created 2026-07-31, no sessions)
--   CANONICAL:       19ca2072-197a-428f-8f95-8827c44a8afe  (created 2026-08-03, 2 sessions)
--
-- Part B: Normalize transactions.source "Go High Level" → "GoHighLevel" across
--   the entire table (not just Julia's rows). The Sales page pie chart and any
--   code filtering source === 'GoHighLevel' silently excludes the space-separated
--   variant, undercounting GHL revenue.
-- ============================================================================

BEGIN;

-- ══════════════════════════════════════════════════════════════════════════════
-- Part A: Consolidate Julia Rodriguez
-- ══════════════════════════════════════════════════════════════════════════════

-- 1. Reassign any coaching_sessions from the dupe → canonical (likely none)
UPDATE coaching_sessions
SET student_id = '19ca2072-197a-428f-8f95-8827c44a8afe'
WHERE student_id = '7430bddd-3bce-43ad-8d27-54f01d4312bc';

-- 2. Reassign any student_notes from the dupe → canonical
UPDATE student_notes
SET student_id = '19ca2072-197a-428f-8f95-8827c44a8afe'
WHERE student_id = '7430bddd-3bce-43ad-8d27-54f01d4312bc';

-- 3. Reassign any onboarding_pipeline from the dupe → canonical
--    If canonical already has one, just delete the dupe's row instead.
DELETE FROM onboarding_pipeline
WHERE student_id = '7430bddd-3bce-43ad-8d27-54f01d4312bc';

-- 4. Delete any student_payment_plans for the dupe (defensive)
DELETE FROM student_payment_plans
WHERE student_id = '7430bddd-3bce-43ad-8d27-54f01d4312bc';

-- 5. Delete the duplicate pwu_students row
DELETE FROM pwu_students
WHERE id = '7430bddd-3bce-43ad-8d27-54f01d4312bc';

-- ══════════════════════════════════════════════════════════════════════════════
-- Part B: Normalize "Go High Level" → "GoHighLevel" in transactions.source
-- ══════════════════════════════════════════════════════════════════════════════

UPDATE transactions
SET source = 'GoHighLevel'
WHERE source = 'Go High Level';

COMMIT;
