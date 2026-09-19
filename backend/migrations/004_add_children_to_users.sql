ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS children JSONB NOT NULL DEFAULT '[]'::jsonb;