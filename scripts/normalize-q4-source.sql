-- Normalize q4_source values in survey_responses
-- Maps free-text answers to the new dropdown options:
-- Facebook, Instagram, Webinar Class, YouTube, Email, Spotify, A Friend, Google Search, Linktree, Other
--
-- Run once in Supabase SQL Editor. Safe to re-run (idempotent).
-- Preview first with the SELECT at the bottom before committing.

BEGIN;

-- Facebook
UPDATE survey_responses SET q4_source = 'Facebook'
WHERE q4_source IS NOT NULL
  AND q4_source NOT IN ('Facebook','Instagram','Webinar Class','YouTube','Email','Spotify','A Friend','Google Search','Linktree','Other')
  AND lower(q4_source) ~ '(facebook|fb|face book)';

-- Instagram
UPDATE survey_responses SET q4_source = 'Instagram'
WHERE q4_source IS NOT NULL
  AND q4_source NOT IN ('Facebook','Instagram','Webinar Class','YouTube','Email','Spotify','A Friend','Google Search','Linktree','Other')
  AND lower(q4_source) ~ '(instagram|ig|insta)';

-- YouTube
UPDATE survey_responses SET q4_source = 'YouTube'
WHERE q4_source IS NOT NULL
  AND q4_source NOT IN ('Facebook','Instagram','Webinar Class','YouTube','Email','Spotify','A Friend','Google Search','Linktree','Other')
  AND lower(q4_source) ~ '(youtube|you tube|yt)';

-- Email
UPDATE survey_responses SET q4_source = 'Email'
WHERE q4_source IS NOT NULL
  AND q4_source NOT IN ('Facebook','Instagram','Webinar Class','YouTube','Email','Spotify','A Friend','Google Search','Linktree','Other')
  AND lower(q4_source) ~ '(email|e-mail|correo|mail)';

-- Spotify
UPDATE survey_responses SET q4_source = 'Spotify'
WHERE q4_source IS NOT NULL
  AND q4_source NOT IN ('Facebook','Instagram','Webinar Class','YouTube','Email','Spotify','A Friend','Google Search','Linktree','Other')
  AND lower(q4_source) ~ '(spotify|podcast)';

-- A Friend
UPDATE survey_responses SET q4_source = 'A Friend'
WHERE q4_source IS NOT NULL
  AND q4_source NOT IN ('Facebook','Instagram','Webinar Class','YouTube','Email','Spotify','A Friend','Google Search','Linktree','Other')
  AND lower(q4_source) ~ '(friend|amig[oa]|referr|someone|conocid|recomend)';

-- Google Search
UPDATE survey_responses SET q4_source = 'Google Search'
WHERE q4_source IS NOT NULL
  AND q4_source NOT IN ('Facebook','Instagram','Webinar Class','YouTube','Email','Spotify','A Friend','Google Search','Linktree','Other')
  AND lower(q4_source) ~ '(google|search|busq)';

-- Linktree
UPDATE survey_responses SET q4_source = 'Linktree'
WHERE q4_source IS NOT NULL
  AND q4_source NOT IN ('Facebook','Instagram','Webinar Class','YouTube','Email','Spotify','A Friend','Google Search','Linktree','Other')
  AND lower(q4_source) ~ '(linktree|link tree)';

-- Webinar Class
UPDATE survey_responses SET q4_source = 'Webinar Class'
WHERE q4_source IS NOT NULL
  AND q4_source NOT IN ('Facebook','Instagram','Webinar Class','YouTube','Email','Spotify','A Friend','Google Search','Linktree','Other')
  AND lower(q4_source) ~ '(webinar|class|clase|workshop|masterclass|taller)';

-- Everything else → Other
UPDATE survey_responses SET q4_source = 'Other'
WHERE q4_source IS NOT NULL
  AND q4_source NOT IN ('Facebook','Instagram','Webinar Class','YouTube','Email','Spotify','A Friend','Google Search','Linktree','Other');

COMMIT;

-- Verify results
SELECT q4_source, count(*) as total
FROM survey_responses
WHERE q4_source IS NOT NULL
GROUP BY q4_source
ORDER BY total DESC;
