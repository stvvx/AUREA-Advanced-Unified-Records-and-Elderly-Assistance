-- Replace the status-only index so historical bookings do not block new ones.
BEGIN;
DROP INDEX IF EXISTS public.movie_reservations_one_active_per_user;

CREATE OR REPLACE FUNCTION public.check_current_movie_reservation()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  today_manila date := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date;
  new_screening_date date;
BEGIN
  IF NEW.status NOT IN ('Pending', 'Confirmed') THEN
    RETURN NEW;
  END IF;
  -- Serialize concurrent bookings for the same user across screenings.
  PERFORM pg_advisory_xact_lock(hashtextextended('movie-reservation:' || NEW.user_id::text, 0));
  SELECT screening_date INTO new_screening_date
    FROM movie_screenings WHERE id = NEW.screening_id;
  IF new_screening_date < today_manila THEN
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1 FROM movie_reservations r
    LEFT JOIN movie_screenings s ON s.id = r.screening_id
    WHERE r.user_id = NEW.user_id
      AND r.id IS DISTINCT FROM NEW.id
      AND r.status IN ('Pending', 'Confirmed')
      AND (s.screening_date IS NULL OR s.screening_date >= today_manila)
  ) THEN
    RAISE EXCEPTION 'You already have an active reservation. Cancel it before booking another screening.'
      USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS check_current_movie_reservation ON public.movie_reservations;
CREATE TRIGGER check_current_movie_reservation
BEFORE INSERT OR UPDATE OF user_id, screening_id, status ON public.movie_reservations
FOR EACH ROW EXECUTE FUNCTION public.check_current_movie_reservation();
COMMIT;
