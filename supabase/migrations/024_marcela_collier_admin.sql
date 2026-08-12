-- Grant Marcela Collier full admin access while keeping her visible
-- in both Setting Team and Closing Team reports/dropdowns.
-- Her closer_name and setter_name fields ensure she appears in report
-- form dropdowns even though her role is no longer 'setter' or 'closer'.

UPDATE profiles
SET role        = 'admin',
    closer_name = 'Marcela Collier',
    setter_name = 'Marcela Collier'
WHERE full_name ILIKE '%marcela%collier%'
   OR full_name ILIKE '%marcela%hic%';
