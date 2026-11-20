CREATE TABLE public.philhealth_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  request_type TEXT NOT NULL DEFAULT 'coverage' CHECK (request_type = 'coverage'),
  status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Endorsed', 'Returned')),
  applicant JSONB NOT NULL,
  attachments JSONB NOT NULL,
  review_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX philhealth_one_active_application
  ON public.philhealth_applications (user_id)
  WHERE status IN ('Pending', 'Endorsed');

ALTER TABLE public.philhealth_applications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.philhealth_applications FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.philhealth_applications TO service_role;
