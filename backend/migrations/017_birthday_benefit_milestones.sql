-- Keep existing benefit_type categories; distinguish the 80/85 and 90/95 milestones.
BEGIN;
ALTER TABLE public.octogenarian_benefit_applications
  ADD COLUMN IF NOT EXISTS benefit_milestone SMALLINT
    CHECK (benefit_milestone IN (80, 85, 90, 95, 100));
-- Infer historical milestones from the DOB and application date, not today's age.
UPDATE public.octogenarian_benefit_applications a
SET benefit_milestone = CASE
  WHEN extract(year FROM age(coalesce(a.date_of_application, a.created_at::date), a.date_of_birth)) >= 100 THEN 100
  WHEN extract(year FROM age(coalesce(a.date_of_application, a.created_at::date), a.date_of_birth)) >= 95 THEN 95
  WHEN extract(year FROM age(coalesce(a.date_of_application, a.created_at::date), a.date_of_birth)) >= 90 THEN 90
  WHEN extract(year FROM age(coalesce(a.date_of_application, a.created_at::date), a.date_of_birth)) >= 85 THEN 85
  WHEN extract(year FROM age(coalesce(a.date_of_application, a.created_at::date), a.date_of_birth)) >= 80 THEN 80
  ELSE NULL END
WHERE benefit_milestone IS NULL;
NOTIFY pgrst, 'reload schema';
COMMIT;
