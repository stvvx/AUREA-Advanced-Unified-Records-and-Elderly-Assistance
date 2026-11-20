CREATE TABLE public.financial_assistance_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  request_type TEXT NOT NULL CHECK (request_type IN ('medical', 'burial')),
  status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Endorsed', 'Ready for pickup', 'Released', 'Returned')),
  applicant JSONB NOT NULL,
  attachments JSONB NOT NULL,
  review_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX financial_assistance_one_open_application
  ON public.financial_assistance_applications (user_id)
  WHERE status IN ('Pending', 'Endorsed', 'Ready for pickup');

ALTER TABLE public.financial_assistance_applications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.financial_assistance_applications FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.financial_assistance_applications TO service_role;
