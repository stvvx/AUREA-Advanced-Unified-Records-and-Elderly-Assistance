UPDATE public.users
SET role = 'osca admin'
WHERE role = 'osca staff';

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE public.users
  ADD CONSTRAINT users_role_check
  CHECK (role IN (
    'user',
    'senior',
    'senior citizen',
    'osca admin',
    'med admin',
    'health center',
    'super admin'
  ));
