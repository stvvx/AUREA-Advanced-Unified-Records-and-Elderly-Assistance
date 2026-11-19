-- Apply in the Supabase SQL editor before deploying the updated backend.
-- Delete and insert together: any insert failure rolls the deletion back.
CREATE OR REPLACE FUNCTION public.replace_announcement(
  p_title TEXT,
  p_body TEXT,
  p_image_url TEXT,
  p_published BOOLEAN,
  p_created_by BIGINT
)
RETURNS SETOF public.announcements
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  -- Serialize publishers across all backend workers.
  PERFORM pg_advisory_xact_lock(257025, 1);
  DELETE FROM public.announcements;
  RETURN QUERY
    INSERT INTO public.announcements (title, body, image_url, published, created_by)
    VALUES (p_title, p_body, p_image_url, p_published, p_created_by)
    RETURNING *;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_announcement(TEXT, TEXT, TEXT, BOOLEAN, BIGINT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_announcement(TEXT, TEXT, TEXT, BOOLEAN, BIGINT)
  TO service_role;

NOTIFY pgrst, 'reload schema';
