ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS osca_id_number VARCHAR(100);