-- Keep the role constraint aligned with the roles exposed by Super Admin.
-- This fixes role updates such as "senior citizen" being rejected by older
-- Supabase schemas that only allowed the original role set.
ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE public.users
  ADD CONSTRAINT users_role_check
  CHECK (role IN (
    'user',
    'senior',
    'senior citizen',
    'osca staff',
    'osca admin',
    'med admin',
    'health center',
    'super admin'
  ));
