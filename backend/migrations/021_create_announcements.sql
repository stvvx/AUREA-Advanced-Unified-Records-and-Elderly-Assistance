CREATE TABLE IF NOT EXISTS public.announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 160),
  body TEXT NOT NULL CHECK (length(trim(body)) BETWEEN 1 AND 5000),
  image_url TEXT,
  published BOOLEAN NOT NULL DEFAULT true,
  created_by BIGINT REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS announcements_published_idx
  ON public.announcements (published, created_at DESC);

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
