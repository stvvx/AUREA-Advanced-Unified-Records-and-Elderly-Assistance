CREATE TABLE public.osca_transfer_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  request_type TEXT NOT NULL DEFAULT 'transfer' CHECK (request_type = 'transfer'),
  status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Ready for pickup', 'Released', 'Returned')),
  applicant JSONB NOT NULL,
  attachments JSONB NOT NULL,
  review_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX osca_transfer_one_active_application
  ON public.osca_transfer_applications (user_id)
  WHERE status IN ('Pending', 'Ready for pickup', 'Released');

ALTER TABLE public.osca_transfer_applications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.osca_transfer_applications FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.osca_transfer_applications TO service_role;
