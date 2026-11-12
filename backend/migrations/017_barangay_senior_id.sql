-- Apply after 016. Preserve numeric portions while correcting barangay prefixes.
BEGIN;
CREATE OR REPLACE FUNCTION public.aurea_barangay_prefix(address TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN normalized LIKE '% aguho %' THEN 'AG'
    WHEN normalized LIKE '% magtanggol %' THEN 'MG'
    WHEN normalized LIKE '% martires del 96 %' THEN 'MD96'
    WHEN normalized LIKE '% martires del 1996 %' THEN 'MD96'
    WHEN normalized LIKE '% martirez del 96 %' THEN 'MD96'
    WHEN normalized LIKE '% poblacion %' THEN 'PB'
    WHEN normalized LIKE '% san pedro %' THEN 'SP'
    WHEN normalized LIKE '% san roque %' THEN 'SR'
    WHEN normalized LIKE '% santa ana %' THEN 'SA'
    WHEN normalized LIKE '% sta ana %' THEN 'SA'
    WHEN normalized LIKE '% st anne %' THEN 'SA'
    WHEN normalized LIKE '% santa anna %' THEN 'SA'
    WHEN normalized LIKE '% santo rosario kanluran %' THEN 'SRK'
    WHEN normalized LIKE '% sto rosario kanluran %' THEN 'SRK'
    WHEN normalized LIKE '% santo rosario silangan %' THEN 'SRS'
    WHEN normalized LIKE '% sto rosario silangan %' THEN 'SRS'
    WHEN normalized LIKE '% tabacalera %' THEN 'TB'
    ELSE NULL END
  FROM (SELECT ' ' || trim(regexp_replace(lower(coalesce(substring(address from '(?i)(?:^|[[:space:],])(?:brgy[.]?|barangay|bgy[.]?)[[:space:]]+([^,]+)'), address, '')), '[^a-z0-9]+', ' ', 'g')) || ' ' AS normalized) n;
$$;
CREATE OR REPLACE FUNCTION public.aurea_set_barangay_senior_id()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  prefix TEXT := aurea_barangay_prefix(NEW.address);
  serial TEXT;
BEGIN
  IF prefix IS NOT NULL THEN
    serial := substring(NEW.osca_id_number from '^[A-Za-z0-9]+-([0-9]+)$');
    NEW.osca_id_number := prefix || '-' || coalesce(serial, lpad(NEW.user_id::text, greatest(4, length(NEW.user_id::text)), '0'));
  ELSIF TG_OP = 'INSERT' THEN
    NEW.osca_id_number := NULL;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER aurea_00_barangay_senior_id
BEFORE INSERT OR UPDATE ON public.seniors
FOR EACH ROW EXECUTE FUNCTION public.aurea_set_barangay_senior_id();
UPDATE public.seniors SET osca_id_number = osca_id_number
WHERE public.aurea_barangay_prefix(address) IS NOT NULL;
NOTIFY pgrst, 'reload schema';
COMMIT;
