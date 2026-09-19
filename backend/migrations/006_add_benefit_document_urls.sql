ALTER TABLE public.octogenarian_benefit_applications
    ADD COLUMN IF NOT EXISTS full_body_picture_url TEXT,
    ADD COLUMN IF NOT EXISTS endorsed_list_url TEXT;