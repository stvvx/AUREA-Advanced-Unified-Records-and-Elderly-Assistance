BEGIN;

ALTER TABLE public.octogenarian_benefit_applications
  ADD COLUMN IF NOT EXISTS endorsed_list_submitted BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS endorsed_list_url TEXT;

ALTER TABLE public.octogenarian_benefit_applications
  ALTER COLUMN endorsed_list_submitted DROP NOT NULL,
  ALTER COLUMN endorsed_list_submitted SET DEFAULT FALSE,
  ALTER COLUMN endorsed_list_url DROP NOT NULL;

COMMIT;
