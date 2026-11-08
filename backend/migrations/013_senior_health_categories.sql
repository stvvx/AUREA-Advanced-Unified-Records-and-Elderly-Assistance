-- Apply after 012. Category describes health/mobility, not age or benefit eligibility.
BEGIN;
CREATE OR REPLACE FUNCTION public.aurea_sync_user_senior(profile JSONB)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  birth_date DATE := aurea_parse_senior_dob(profile->>'dob');
  today_manila DATE := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date;
  senior_age INT;
BEGIN
  senior_age := extract(year FROM age(today_manila, birth_date));
  IF lower(trim(coalesce(profile->>'role', 'user'))) NOT IN ('user', 'senior', 'senior citizen')
     OR birth_date IS NULL OR senior_age < 60 THEN
    -- Retain historical profile information when a role/DOB changes.
    UPDATE seniors SET is_active = FALSE, updated_at = now()
      WHERE user_id = (profile->>'id')::bigint;
    RETURN;
  END IF;
  INSERT INTO seniors (user_id, last_name, first_name, middle_name, contact, address,
    email, avatar_url, gender, civil_status, spouse, signature, children,
    birth_certificate, monthly_income, category, dob, osca_id_number, is_active)
  VALUES ((profile->>'id')::bigint, profile->>'last_name', profile->>'first_name',
    profile->>'middle_name', profile->>'contact', profile->>'address', profile->>'email',
    profile->>'avatar_url', profile->>'gender', profile->>'civil_status',
    coalesce(profile->>'spouse', profile->>'spouse_name'),
    coalesce(nullif(profile->>'digital_signature', ''), nullif(profile->>'signature', ''),
             nullif(profile->>'signature_url', ''), profile->>'digital_signature_url'),
    coalesce(nullif(profile->'children', 'null'::jsonb), '[]'::jsonb),
    coalesce(profile->>'birth_certificate', profile->>'birthcert'),
    nullif(profile->>'monthly_income', '')::numeric,
    coalesce(nullif(profile->>'category', ''), 'Not Specified'), birth_date, profile->>'osca_id_number', TRUE)
  ON CONFLICT (user_id) DO UPDATE SET
    last_name = EXCLUDED.last_name, first_name = EXCLUDED.first_name,
    middle_name = EXCLUDED.middle_name, contact = EXCLUDED.contact,
    address = EXCLUDED.address, email = EXCLUDED.email, avatar_url = EXCLUDED.avatar_url,
    gender = EXCLUDED.gender, civil_status = EXCLUDED.civil_status,
    spouse = EXCLUDED.spouse, signature = EXCLUDED.signature, children = EXCLUDED.children,
    birth_certificate = EXCLUDED.birth_certificate, monthly_income = EXCLUDED.monthly_income,
    category = EXCLUDED.category, dob = EXCLUDED.dob, osca_id_number = EXCLUDED.osca_id_number,
    is_active = TRUE, updated_at = now();
END;
$$;


-- Remove only the previous automatically generated age labels.
UPDATE public.users SET category = 'Not Specified'
WHERE category IS NULL OR trim(category) = ''
   OR category IN ('Senior Citizen', 'Octogenarian', 'Nonagenarian', 'Centenarian');
ALTER TABLE public.seniors DISABLE TRIGGER aurea_seniors_to_users;
UPDATE public.seniors SET category = 'Not Specified', updated_at = now()
WHERE category IS NULL OR trim(category) = ''
   OR category IN ('Senior Citizen', 'Octogenarian', 'Nonagenarian', 'Centenarian');
ALTER TABLE public.seniors ENABLE TRIGGER aurea_seniors_to_users;
COMMIT;
