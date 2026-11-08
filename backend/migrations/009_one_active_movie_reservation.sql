-- Enforce one active booking across screenings, including concurrent requests.
-- Existing duplicate active bookings must be reviewed before applying this index.
CREATE UNIQUE INDEX IF NOT EXISTS movie_reservations_one_active_per_user
ON public.movie_reservations (user_id)
WHERE status IN ('Pending', 'Confirmed');
