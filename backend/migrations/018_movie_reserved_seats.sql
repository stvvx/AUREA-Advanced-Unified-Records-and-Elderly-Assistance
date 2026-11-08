-- Persist seat labels per movie screening. Apply after migration 010.
BEGIN;
LOCK TABLE public.movie_reservations IN SHARE ROW EXCLUSIVE MODE;
CREATE TABLE IF NOT EXISTS public.movie_reservation_seats AS
  SELECT r.id AS reservation_id, r.screening_id, ''::text AS seat_label
  FROM public.movie_reservations r WHERE FALSE;
ALTER TABLE public.movie_reservation_seats ALTER COLUMN reservation_id SET NOT NULL;
ALTER TABLE public.movie_reservation_seats ALTER COLUMN screening_id SET NOT NULL;
ALTER TABLE public.movie_reservation_seats ALTER COLUMN seat_label SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS movie_seat_screening_unique
  ON public.movie_reservation_seats(screening_id, seat_label);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'movie_seat_reservation_fk' AND conrelid = 'public.movie_reservation_seats'::regclass) THEN
    ALTER TABLE public.movie_reservation_seats ADD CONSTRAINT movie_seat_reservation_fk
      FOREIGN KEY(reservation_id) REFERENCES public.movie_reservations(id) ON DELETE CASCADE;
    ALTER TABLE public.movie_reservation_seats ADD CONSTRAINT movie_seat_screening_fk
      FOREIGN KEY(screening_id) REFERENCES public.movie_screenings(id) ON DELETE CASCADE;
    ALTER TABLE public.movie_reservation_seats ADD CONSTRAINT movie_seat_label_check
      CHECK (seat_label ~ '^[A-G](10|[1-9])$');
  END IF;
END $$;
ALTER TABLE public.movie_reservation_seats ENABLE ROW LEVEL SECURITY;

-- Old bookings stored attendee counts only. Assign deterministic seats, never
-- pretend these were the user's original seat choices. Run once on initial setup.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.movie_reservation_seats) THEN
    INSERT INTO public.movie_reservation_seats(reservation_id, screening_id, seat_label)
    SELECT id, screening_id, chr(65 + ((seat_number - 1) / 10)::int) || (((seat_number - 1) % 10) + 1)::text
    FROM (
      SELECT r.id, r.screening_id,
        row_number() OVER (PARTITION BY r.screening_id ORDER BY r.created_at, r.id, attendee) AS seat_number
      FROM public.movie_reservations r
      CROSS JOIN LATERAL generate_series(1, r.attendee_count::int) attendee
      WHERE r.status IN ('Pending', 'Confirmed')
    ) numbered;
    -- The label check aborts instead of losing bookings if a screening exceeds 70 seats.
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.release_cancelled_movie_seats()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'Cancelled' THEN
    DELETE FROM movie_reservation_seats WHERE reservation_id = NEW.id;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS release_cancelled_movie_seats ON public.movie_reservations;
CREATE TRIGGER release_cancelled_movie_seats AFTER UPDATE OF status ON public.movie_reservations
  FOR EACH ROW EXECUTE FUNCTION public.release_cancelled_movie_seats();

CREATE OR REPLACE FUNCTION public.reserve_movie_screening_with_seats(
  p_screening_id UUID, p_user_id BIGINT, p_seat_labels TEXT[], p_confirmation_code TEXT
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE booked JSONB; booking_id UUID;
BEGIN
  IF cardinality(p_seat_labels) IS NULL OR cardinality(p_seat_labels) NOT BETWEEN 1 AND 5
    OR EXISTS (SELECT 1 FROM unnest(p_seat_labels) seat WHERE seat IS NULL OR seat !~ '^[A-G](10|[1-9])$')
    OR (SELECT count(DISTINCT seat) FROM unnest(p_seat_labels) seat) <> cardinality(p_seat_labels) THEN
    RAISE EXCEPTION 'Choose between one and five distinct seats.';
  END IF;
  PERFORM 1 FROM movie_screenings WHERE id = p_screening_id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM movie_reservation_seats WHERE screening_id = p_screening_id AND seat_label = ANY(p_seat_labels)) THEN
    RAISE EXCEPTION 'A selected seat has already been reserved. Refresh the seat map and choose another seat.';
  END IF;
  SELECT to_jsonb(result) INTO booked FROM public.reserve_movie_screening(
    p_screening_id := p_screening_id, p_user_id := p_user_id,
    p_attendee_count := cardinality(p_seat_labels), p_confirmation_code := p_confirmation_code
  ) result;
  booking_id := coalesce(booked->>'id', booked->>'reservation_id', booked#>>'{reservation,id}')::uuid;
  IF booking_id IS NULL THEN RAISE EXCEPTION 'Reservation did not return its reference.'; END IF;
  INSERT INTO movie_reservation_seats(reservation_id, screening_id, seat_label)
    SELECT booking_id, p_screening_id, seat FROM unnest(p_seat_labels) seat;
  RETURN booked || jsonb_build_object('seat_labels', p_seat_labels);
END $$;
REVOKE ALL ON FUNCTION public.reserve_movie_screening_with_seats(UUID,BIGINT,TEXT[],TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserve_movie_screening_with_seats(UUID,BIGINT,TEXT[],TEXT) TO service_role;
REVOKE ALL ON FUNCTION public.release_cancelled_movie_seats() FROM PUBLIC;
NOTIFY pgrst, 'reload schema';
COMMIT;
