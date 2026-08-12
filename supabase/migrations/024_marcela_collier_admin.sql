-- Fix Marcela Collier's profile: grant admin access and populate both
-- setter_name and closer_name so she appears in both team report dropdowns.
-- Also unify historical closer_daily_reports from "Marcela HIC Parenting"
-- to "Marcela Collier" to keep data consistent with her canonical name.

-- 1. Update her profile (role is already 'admin' per Settings page)
UPDATE profiles
SET setter_name = 'Marcela Collier',
    closer_name = 'Marcela Collier'
WHERE id = 'af33ea41-a1a5-4a9a-8692-21c45a5bd90c';

-- 2. Rename historical closer reports so her data isn't split across two names
UPDATE closer_daily_reports
SET closer_name = 'Marcela Collier'
WHERE closer_name = 'Marcela HIC Parenting';
