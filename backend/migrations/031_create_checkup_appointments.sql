CREATE TABLE public.checkup_appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  center_id TEXT NOT NULL CHECK (center_id IN ('sanchez', 'masikap', 'de-borja', 'flores', 'salonga')),
  details JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Confirmed', 'Completed', 'Cancelled')),
  scheduled_at TIMESTAMPTZ,
  review_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (status NOT IN ('Confirmed', 'Completed') OR scheduled_at IS NOT NULL)
);

CREATE UNIQUE INDEX checkup_one_open_appointment
  ON public.checkup_appointments (user_id)
  WHERE status IN ('Pending', 'Confirmed');

ALTER TABLE public.checkup_appointments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.checkup_appointments FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.checkup_appointments TO service_role;
