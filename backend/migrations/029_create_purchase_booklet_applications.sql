CREATE TABLE public.purchase_booklet_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  request_type TEXT NOT NULL CHECK (request_type IN ('new', 'lost', 'worn')),
  status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Ready for pickup', 'Released', 'Returned')),
  applicant JSONB NOT NULL,
  attachments JSONB NOT NULL,
  review_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX purchase_booklet_one_open_application
  ON public.purchase_booklet_applications (user_id)
  WHERE status IN ('Pending', 'Ready for pickup');

ALTER TABLE public.purchase_booklet_applications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.purchase_booklet_applications FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.purchase_booklet_applications TO service_role;
