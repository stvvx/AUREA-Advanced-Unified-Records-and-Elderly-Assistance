-- Run AFTER migration 012. Test changes are always rolled back.
BEGIN;
DO $$
DECLARE
  account public.users%ROWTYPE;
  senior public.seniors%ROWTYPE;
  expected_name TEXT;
  original_password JSONB;
BEGIN
  ASSERT public.aurea_parse_senior_dob('10/16/1944') = DATE '1944-10-16', 'Slash DOB parsing failed';
  ASSERT public.aurea_parse_senior_dob('1944-10-16') = DATE '1944-10-16', 'ISO DOB parsing failed';
  ASSERT public.aurea_parse_senior_dob('02/30/1944') IS NULL, 'Invalid dates must be rejected';

  SELECT s.* INTO senior FROM public.seniors s WHERE s.is_active ORDER BY s.user_id LIMIT 1;
  IF NOT FOUND THEN
    RAISE NOTICE 'No eligible senior exists; sync checks skipped. Review the eligibility report below.';
    RETURN;
  END IF;
  SELECT * INTO account FROM public.users WHERE id = senior.user_id;
  original_password := to_jsonb(account)->'password_hash';
  expected_name := coalesce(account.first_name, '') || ' SYNC CHECK';
  UPDATE public.users SET first_name = expected_name WHERE id = senior.user_id;
  ASSERT (SELECT first_name FROM public.seniors WHERE id = senior.id) = expected_name,
    'Account-to-senior synchronization failed';
  UPDATE public.seniors SET contact = 'SYNC-CHECK-ONLY' WHERE id = senior.id;
  ASSERT (SELECT contact FROM public.users WHERE id = senior.user_id) = 'SYNC-CHECK-ONLY',
    'Senior-to-account synchronization failed';
  ASSERT (SELECT to_jsonb(u)->'password_hash' FROM public.users u WHERE id = senior.user_id)
    IS NOT DISTINCT FROM original_password, 'Synchronization changed the password hash';
  RAISE NOTICE 'PASS: DOB validation, bidirectional profile updates and password preservation.';
END;
$$;
ROLLBACK;

-- Identify resident accounts that were not eligible for backfill.
SELECT u.id, u.first_name, u.last_name, u.dob,
  CASE WHEN public.aurea_parse_senior_dob(to_jsonb(u)->>'dob') IS NULL
       THEN 'Missing/invalid date of birth' ELSE 'Younger than 60' END AS reason
FROM public.users u
WHERE lower(trim(coalesce(to_jsonb(u)->>'role', 'user'))) IN ('user', 'senior', 'senior citizen')
  AND NOT EXISTS (SELECT 1 FROM public.seniors s WHERE s.user_id = u.id AND s.is_active);
