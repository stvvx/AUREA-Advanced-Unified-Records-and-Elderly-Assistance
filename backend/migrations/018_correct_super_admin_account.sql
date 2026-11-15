-- Ensure the requested email belongs to exactly one super administrator.
-- Delete the existing account first so this also repairs databases without a
-- unique email constraint and removes any non-admin duplicate.
BEGIN;

DELETE FROM public.users
WHERE lower(trim(email)) = 'telfamini@gmail.com';

INSERT INTO public.users (
  first_name, last_name, dob, contact, address, email, password_hash, role, created_at
)
VALUES (
  'Telfa', 'Mini', '1990-01-01', '0000000000', 'Pateros',
  'telfamini@gmail.com',
  'scrypt:32768:8:1$uVmELmfBoaCHXchR$c2dda62dcf9f3b8bdc0bc76ad27f254bc987b0505e6e79ad3b1e994d0a75cb1e724a71d02a62ec0693a03917a54bc13f1463e59f76eff0da7a2fa08fb1129c8d',
  'super admin',
  now()
);

COMMIT;
