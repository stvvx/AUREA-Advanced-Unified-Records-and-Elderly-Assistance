CREATE TABLE public.social_pension_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  request_type TEXT NOT NULL DEFAULT 'social-pension' CHECK (request_type = 'social-pension'),
  status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Endorsed', 'Approved', 'Returned')),
  applicant JSONB NOT NULL,
  attachments JSONB NOT NULL,
  review_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX social_pension_one_active_application
  ON public.social_pension_applications (user_id)
  WHERE status IN ('Pending', 'Endorsed', 'Approved');

ALTER TABLE public.social_pension_applications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.social_pension_applications FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.social_pension_applications TO service_role;
