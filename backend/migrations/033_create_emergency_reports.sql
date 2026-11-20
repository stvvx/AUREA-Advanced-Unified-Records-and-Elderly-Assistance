CREATE TABLE public.emergency_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  request_key TEXT NOT NULL,
  details JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'Submitted' CHECK (status IN ('Submitted', 'Acknowledged', 'Closed')),
  review_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, request_key)
);

CREATE INDEX emergency_reports_resident_history
  ON public.emergency_reports (user_id, created_at DESC);

ALTER TABLE public.emergency_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.emergency_reports FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.emergency_reports TO service_role;
