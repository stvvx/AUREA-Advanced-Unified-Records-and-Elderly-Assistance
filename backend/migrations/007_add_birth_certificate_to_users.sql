-- Ensure birth_certificate column exists on users table
ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS birth_certificate TEXT;
