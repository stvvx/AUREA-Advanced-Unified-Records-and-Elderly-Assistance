-- Income source is stored only on seniors. Apply after migration 015.
BEGIN;
ALTER TABLE public.seniors
  ADD COLUMN IF NOT EXISTS source_of_income TEXT,
  ADD COLUMN IF NOT EXISTS occupation TEXT;
ALTER TABLE public.seniors DROP CONSTRAINT IF EXISTS seniors_income_source_check;
ALTER TABLE public.seniors ADD CONSTRAINT seniors_income_source_check CHECK (
  CASE
    WHEN source_of_income IS NULL THEN occupation IS NULL
    WHEN source_of_income IN ('Pension', 'Allowance') THEN occupation IS NULL
    WHEN source_of_income = 'Working' THEN occupation IS NOT NULL
      AND length(trim(occupation)) BETWEEN 1 AND 200
    ELSE FALSE
  END
);

NOTIFY pgrst, 'reload schema';
COMMIT;
