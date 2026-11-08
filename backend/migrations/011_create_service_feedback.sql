-- Feedback belongs to a named service and a specific application/reservation.
CREATE TABLE IF NOT EXISTS public.service_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  service_key TEXT NOT NULL CHECK (length(trim(service_key)) > 0),
  service_record_id TEXT NOT NULL CHECK (length(trim(service_record_id)) > 0),
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comments TEXT NOT NULL CHECK (length(trim(comments)) BETWEEN 1 AND 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, service_key, service_record_id)
);
CREATE INDEX IF NOT EXISTS service_feedback_service_idx
  ON public.service_feedback (service_key, created_at DESC);
ALTER TABLE public.service_feedback ENABLE ROW LEVEL SECURITY;
-- Access through the backend service role only; no anonymous table policies.
