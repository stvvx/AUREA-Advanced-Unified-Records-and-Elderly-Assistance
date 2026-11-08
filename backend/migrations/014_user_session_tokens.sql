-- Apply after 012. Sessions expire after seven days and rotate on login.
BEGIN;
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS token TEXT,
  ADD COLUMN IF NOT EXISTS ip_address TEXT,
  ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMPTZ;
-- Expire any previous placeholder tokens that were never issued as sessions.
UPDATE public.users SET token = NULL WHERE token_expires_at IS NULL AND token IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS users_session_token_unique
  ON public.users(token) WHERE token IS NOT NULL;
-- The app uses the backend service role. Session secrets must not be readable
-- or editable through anonymous/client-side Supabase table requests.
REVOKE SELECT, UPDATE ON public.users FROM anon, authenticated;
COMMIT;
