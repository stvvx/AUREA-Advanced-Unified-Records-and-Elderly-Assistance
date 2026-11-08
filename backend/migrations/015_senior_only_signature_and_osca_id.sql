-- Apply after 014. Signature and OSCA ID become senior-only fields.
BEGIN;
LOCK TABLE public.users, public.seniors IN SHARE ROW EXCLUSIVE MODE;
ALTER TABLE public.seniors DISABLE TRIGGER aurea_seniors_to_users;

-- Refuse to discard data for accounts that have no linked senior profile.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.users u
    WHERE (nullif(to_jsonb(u)->>'digital_signature', '') IS NOT NULL
        OR nullif(to_jsonb(u)->>'osca_id_number', '') IS NOT NULL)
      AND NOT EXISTS (SELECT 1 FROM public.seniors s WHERE s.user_id = u.id)
  ) THEN
    RAISE EXCEPTION 'Some accounts have signatures or OSCA IDs but no senior profile. Reconcile these records before removing the columns.';
  END IF;
END;
$$;

UPDATE public.seniors s SET
  signature = coalesce(nullif(s.signature, ''), nullif(to_jsonb(u)->>'digital_signature', ''),
      nullif(to_jsonb(u)->>'signature', ''), nullif(to_jsonb(u)->>'signature_url', '')),
  osca_id_number = coalesce(nullif(s.osca_id_number, ''), nullif(to_jsonb(u)->>'osca_id_number', ''),
      'SA-' || lpad(u.id::text, greatest(4, length(u.id::text)), '0')),
  updated_at = now()
FROM public.users u WHERE u.id = s.user_id;

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
    email, avatar_url, gender, civil_status, spouse, children,
    birth_certificate, monthly_income, category, dob, osca_id_number, is_active)
  VALUES ((profile->>'id')::bigint, profile->>'last_name', profile->>'first_name',
    profile->>'middle_name', profile->>'contact', profile->>'address', profile->>'email',
    profile->>'avatar_url', profile->>'gender', profile->>'civil_status',
    coalesce(profile->>'spouse', profile->>'spouse_name'),
    coalesce(nullif(profile->'children', 'null'::jsonb), '[]'::jsonb),
    coalesce(profile->>'birth_certificate', profile->>'birthcert'),
    nullif(profile->>'monthly_income', '')::numeric,
    coalesce(nullif(profile->>'category', ''), 'Not Specified'), birth_date, 'SA-' || lpad(profile->>'id', greatest(4, length(profile->>'id')), '0'), TRUE)
  ON CONFLICT (user_id) DO UPDATE SET
    last_name = EXCLUDED.last_name, first_name = EXCLUDED.first_name,
    middle_name = EXCLUDED.middle_name, contact = EXCLUDED.contact,
    address = EXCLUDED.address, email = EXCLUDED.email, avatar_url = EXCLUDED.avatar_url,
    gender = EXCLUDED.gender, civil_status = EXCLUDED.civil_status,
    spouse = EXCLUDED.spouse, children = EXCLUDED.children,
    birth_certificate = EXCLUDED.birth_certificate, monthly_income = EXCLUDED.monthly_income,
    category = EXCLUDED.category, dob = EXCLUDED.dob,
    is_active = TRUE, updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.aurea_seniors_to_users()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  account public.users%ROWTYPE;
  patch JSONB;
  assignments TEXT;
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.id IS DISTINCT FROM OLD.id THEN
      RAISE EXCEPTION 'Senior record identifiers cannot be changed.';
    END IF;
  END IF;
  SELECT * INTO account FROM users WHERE id = NEW.user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Create the user account before its senior profile.'; END IF;
  IF lower(trim(coalesce(to_jsonb(account)->>'role', 'user'))) NOT IN ('user', 'senior', 'senior citizen') THEN
    RAISE EXCEPTION 'Staff and admin accounts cannot be assigned a senior profile.';
  END IF;
  IF NEW.dob > ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date - INTERVAL '60 years')::date THEN
    RAISE EXCEPTION 'Senior citizen profiles require an age of at least 60.';
  END IF;
  NEW.updated_at := now();
  patch := to_jsonb(NEW) - ARRAY['id','user_id','created_at','updated_at','is_active','signature','osca_id_number'];
  -- Preserve the existing account DOB format/type for old clients.
  patch := patch || jsonb_build_object('dob', CASE
    WHEN coalesce(to_jsonb(account)->>'dob', '') LIKE '%/%'
      THEN to_char(NEW.dob, 'MM/DD/YYYY') ELSE to_char(NEW.dob, 'YYYY-MM-DD') END);
  -- Only assign columns actually present in users; optional legacy aliases vary.
  SELECT string_agg(format('%I = (jsonb_populate_record(u, $1)).%I', a.attname, a.attname), ', ')
    INTO assignments FROM pg_attribute a
    WHERE a.attrelid = 'public.users'::regclass AND a.attnum > 0 AND NOT a.attisdropped
      AND a.attgenerated = '' AND patch ? a.attname;
  EXECUTE 'UPDATE public.users u SET ' || assignments || ' WHERE id = $2'
    USING patch, NEW.user_id;
  RETURN NEW;
END;
$$;


ALTER TABLE public.users DROP COLUMN IF EXISTS digital_signature;
ALTER TABLE public.users DROP COLUMN IF EXISTS osca_id_number;
ALTER TABLE public.seniors ENABLE TRIGGER aurea_seniors_to_users;
NOTIFY pgrst, 'reload schema';
COMMIT;
