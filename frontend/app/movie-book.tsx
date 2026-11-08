
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Alert,
  useWindowDimensions,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';

import { useAuth } from '../context/AuthContext';
import { API_BASE_URL } from '../services/loloApi';

type Movie = {
  id: string | number;
  title: string;
  description?: string;
  poster_url?: string;
  age_rating?: string;
  is_active?: boolean;
};

type Showtime = {
  id: string | number;
  movie_id: string | number;
  screening_date: string;
  screening_time: string;
  available_slots: number;
  capacity: number;
  is_active?: boolean;
};

type Reservation = {
  id: string | number;
  status: string;
  confirmation_code?: string;
  movie_title?: string;
  screening_date?: string;
  screening_time?: string;
  attendee_count?: number;
};

type DateOption = {
  id: string;
  day: string;
  number: number;
  month: string;
};

const ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
const COLS = 10;
const AISLE_AFTER = 5;
const MAX_SEATS = 5;

const API_BASE = API_BASE_URL.replace(/\/$/, '');

function formatDate(dateString: string): DateOption {
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(year, month - 1, day);

  return {
    id: dateString,
    day: date.toLocaleDateString('en-US', { weekday: 'short' }),
    number: date.getDate(),
    month: date.toLocaleDateString('en-US', { month: 'short' }),
  };
}

function formatTime(time: string): string {
  if (!time) return '';

  const [hours, minutes] = time.split(':');
  const date = new Date();
  date.setHours(Number(hours), Number(minutes), 0, 0);

  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function isCurrentReservation(reservation: Reservation, today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })): boolean {
  if (reservation.status !== 'Pending' && reservation.status !== 'Confirmed') return false;
  // Keep today's booking active until the screening date has ended.
  return !reservation.screening_date || reservation.screening_date.slice(0, 10) >= today;
}

async function parseResponse(response: Response) {
  const data = await response.json().catch(() => ({}));

  if (!response.ok || data.success === false) {
    throw new Error(
      data.error || data.message || `Request failed (${response.status})`
    );
  }

  return data;
}

export default function MovieBookScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { width } = useWindowDimensions();

  const userId = user?.id;

  const [movies, setMovies] = useState<Movie[]>([]);
  const [screenings, setScreenings] = useState<Showtime[]>([]);

  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedShowtime, setSelectedShowtime] = useState<Showtime | null>(
    null
  );
  const [selectedSeats, setSelectedSeats] = useState<string[]>([]);

  const [showConfirmation, setShowConfirmation] = useState(false);
  const [reservationCode, setReservationCode] = useState('');

  const [loadingMovies, setLoadingMovies] = useState(true);
  const [loadingScreenings, setLoadingScreenings] = useState(false);
  const [reserving, setReserving] = useState(false);
  const [error, setError] = useState('');

  const [existingReservation, setExistingReservation] = useState<Reservation | null>(null);
  const [checkingReservation, setCheckingReservation] = useState(true);
  const [reservationError, setReservationError] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const reservationBusy = useRef(false);

  const loadExistingReservation = useCallback(async (signal?: AbortSignal) => {
    if (!userId) return;
    const response = await fetch(`${API_BASE}/api/movie-center/reservations?user_id=${userId}`, { signal });
    const data = await parseResponse(response);
    if (signal?.aborted) return;
    const active = (data.reservations || []).find((item: Reservation) => isCurrentReservation(item));
    setExistingReservation(active || null);
    setReservationError('');
  }, [userId]);

  useFocusEffect(useCallback(() => {
    const controller = new AbortController();
    setCheckingReservation(true);
    const timeout = setTimeout(() => {
      setReservationError('Could not check your reservation. Please try again.');
      setCheckingReservation(false);
      controller.abort();
    }, 25000);
    loadExistingReservation(controller.signal)
      .catch(() => {
        if (!controller.signal.aborted) setReservationError('Could not check your reservation. Please try again.');
      })
      .finally(() => {
        clearTimeout(timeout);
        if (!controller.signal.aborted) setCheckingReservation(false);
      });
    return () => { clearTimeout(timeout); controller.abort(); };
  }, [loadExistingReservation]));

  const handleCancelReservation = async () => {
    if (!existingReservation || reservationBusy.current) return;
    reservationBusy.current = true;
    setCancelling(true);
    try {
      const response = await fetch(`${API_BASE}/api/movie-center/reservations/${existingReservation.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, status: 'Cancelled' }),
      });
      await parseResponse(response);
      clearSeats();
      setSelectedShowtime(null);
      setSelectedMovie(null);
      // Recheck in case older data contains another active reservation.
      await loadExistingReservation();
    } catch (err) {
      Alert.alert('Cancellation failed', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      reservationBusy.current = false;
      setCancelling(false);
    }
  };

  const clearSeats = () => setSelectedSeats([]);

  // Load movies created by the admin.
  useEffect(() => {
    if (!userId) return;

    let mounted = true;

    const loadMovies = async () => {
      try {
        setLoadingMovies(true);
        setError('');

        const response = await fetch(
          `${API_BASE}/api/movie-center/movies?user_id=${encodeURIComponent(
            String(userId)
          )}`
        );

        const data = await parseResponse(response);

        if (!mounted) return;

        const fetchedMovies: Movie[] = data.movies || [];

        setMovies(fetchedMovies);
        setSelectedMovie((current) => {
          if (current && fetchedMovies.some((m) => m.id === current.id)) {
            return current;
          }
          return fetchedMovies[0] || null;
        });
      } catch (err: any) {
        if (mounted) {
          setError(err.message || 'Unable to load movies.');
        }
      } finally {
        if (mounted) setLoadingMovies(false);
      }
    };

    loadMovies();

    return () => {
      mounted = false;
    };
  }, [userId]);

  // Load screenings for the selected movie.
  useEffect(() => {
    if (!userId || !selectedMovie) {
      setScreenings([]);
      setSelectedDate('');
      setSelectedShowtime(null);
      clearSeats();
      return;
    }

    let mounted = true;

    const loadScreenings = async () => {
      try {
        setLoadingScreenings(true);
        setSelectedShowtime(null);
        setSelectedDate('');
        clearSeats();

        const response = await fetch(
          `${API_BASE}/api/movie-center/screenings?user_id=${encodeURIComponent(
            String(userId)
          )}&movie_id=${encodeURIComponent(String(selectedMovie.id))}`
        );

        const data = await parseResponse(response);

        if (!mounted) return;

        const fetchedScreenings: Showtime[] = data.screenings || [];

        setScreenings(fetchedScreenings);

        const firstDate = fetchedScreenings
          .map((screening) => screening.screening_date?.slice(0, 10))
          .filter(Boolean)
          .sort()[0];

        setSelectedDate(firstDate || '');
      } catch (err: any) {
        if (mounted) {
          setScreenings([]);
          setError(err.message || 'Unable to load screenings.');
        }
      } finally {
        if (mounted) setLoadingScreenings(false);
      }
    };

    loadScreenings();

    return () => {
      mounted = false;
    };
  }, [userId, selectedMovie?.id]);

  // Dates are based on actual admin-created screenings.
  const dates = useMemo(() => {
    const uniqueDates = [
      ...new Set(
        screenings
          .map((screening) => screening.screening_date?.slice(0, 10))
          .filter(Boolean)
      ),
    ];

    return uniqueDates.sort().map(formatDate);
  }, [screenings]);

  const selectedDateInfo = dates.find((date) => date.id === selectedDate);

  // Showtimes are filtered using the selected date.
  const showtimes = useMemo(() => {
    return screenings.filter(
      (screening) =>
        screening.screening_date?.slice(0, 10) === selectedDate
    );
  }, [screenings, selectedDate]);

  const seatSize = Math.min(
    34,
    Math.floor((width - 40 - 32 - 22 - 22 - COLS * 6) / COLS)
  );

  const sortedSeats = useMemo(
    () =>
      [...selectedSeats].sort((a, b) => {
        if (a[0] !== b[0]) return a[0].localeCompare(b[0]);
        return Number(a.slice(1)) - Number(b.slice(1));
      }),
    [selectedSeats]
  );

  const handleMovieSelect = (movie: Movie) => {
    if (selectedMovie?.id === movie.id) return;

    setSelectedMovie(movie);
    setSelectedShowtime(null);
    setSelectedDate('');
    clearSeats();
    setError('');
  };

  const handleDateSelect = (dateId: string) => {
    setSelectedDate(dateId);
    setSelectedShowtime(null);
    clearSeats();
  };

  const handleShowtimeSelect = (showtime: Showtime) => {
    if (Number(showtime.available_slots) <= 0) return;

    if (selectedShowtime?.id !== showtime.id) {
      clearSeats();
    }

    setSelectedShowtime(showtime);
  };

  // The backend stores attendee_count, not actual seat numbers.
  // Seat labels are used only to let the user choose the attendee count.
  const handleSeatPress = (seatId: string) => {
    if (!selectedShowtime) return;

    const availableSlots = Number(selectedShowtime.available_slots) || 0;
    const maxSelectable = Math.min(MAX_SEATS, availableSlots);

    if (selectedSeats.includes(seatId)) {
      setSelectedSeats((previous) =>
        previous.filter((seat) => seat !== seatId)
      );
      return;
    }

    if (selectedSeats.length >= maxSelectable) {
      Alert.alert(
        'Reservation limit',
        `You can select up to ${maxSelectable} attendee(s) for this screening.`
      );
      return;
    }

    setSelectedSeats((previous) => [...previous, seatId]);
  };

  const handleReserve = async () => {
    if (reservationBusy.current || existingReservation || checkingReservation || reservationError) return;
    if (!userId) {
      Alert.alert('Login required', 'Please log in again to make a reservation.');
      return;
    }

    if (!selectedMovie) {
      Alert.alert('Select a movie', 'Please select a movie first.');
      return;
    }

    if (!selectedShowtime) {
      Alert.alert('Select a showtime', 'Please choose your preferred screening time.');
      return;
    }

    if (selectedSeats.length === 0) {
      Alert.alert('Select attendees', 'Please select at least one attendee.');
      return;
    }

    if (selectedSeats.length > Number(selectedShowtime.available_slots)) {
      Alert.alert(
        'Not enough available slots',
        'Please select fewer attendees.'
      );
      return;
    }

    reservationBusy.current = true;
    try {
      setReserving(true);

      const response = await fetch(
        `${API_BASE}/api/movie-center/reservations`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            user_id: userId,
            screening_id: selectedShowtime.id,
            attendee_count: selectedSeats.length,
          }),
        }
      );

      const data = await parseResponse(response);
      const reservation = Array.isArray(data.reservation) ? data.reservation[0] : data.reservation;

      const code =
        reservation?.confirmation_code ||
        reservation?.reservation?.confirmation_code ||
        reservation?.id ||
        reservation?.reservation_id ||
        'Submitted';

      setReservationCode(String(code));
      const saved = reservation?.reservation || (Array.isArray(reservation) ? reservation[0] : reservation);
      setExistingReservation({
        ...saved,
        id: saved?.id || saved?.reservation_id || code,
        status: saved?.status || 'Pending',
        confirmation_code: String(code),
        movie_title: selectedMovie.title,
        screening_date: selectedShowtime.screening_date,
        screening_time: selectedShowtime.screening_time,
        attendee_count: selectedSeats.length,
      });
      setShowConfirmation(false);
      // The successful booking stays visible even if this follow-up fails.
      await loadExistingReservation().catch(() => undefined);
    } catch (err: any) {
      setReservationError('Please check your reservation before trying again.');
      await loadExistingReservation().catch(() => undefined);
      Alert.alert(
        'Reservation failed',
        err.message || 'Something went wrong. Please try again.'
      );
    } finally {
      reservationBusy.current = false;
      setReserving(false);
    }
  };

  const canReserve =
    !!selectedMovie &&
    !!selectedShowtime &&
    selectedSeats.length > 0 &&
    !reserving &&
    selectedSeats.length <= Number(selectedShowtime?.available_slots || 0);

  const renderSeat = (row: string, col: number) => {
    const id = `${row}${col}`;
    const isSelected = selectedSeats.includes(id);

    return (
      <TouchableOpacity
        key={id}
        activeOpacity={0.7}
        onPress={() => handleSeatPress(id)}
        accessibilityRole="button"
        accessibilityLabel={`Attendee ${id}, ${
          isSelected ? 'selected' : 'not selected'
        }`}
        style={[
          styles.seat,
          { width: seatSize, height: seatSize },
          isSelected && styles.seatSelected,
        ]}
      >
        {isSelected && (
          <Text style={styles.seatSelectedText}>{col}</Text>
        )}
      </TouchableOpacity>
    );
  };

  if (checkingReservation || reservationError || existingReservation) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()} accessibilityLabel="Go back">
            <Ionicons name="arrow-back" size={25} color="#252525" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>My Movie Reservation</Text>
        </View>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {checkingReservation ? <ActivityIndicator size="large" color="#7652A5" /> : reservationError ? (
            <View style={styles.confirmationDetails}>
              <Text style={styles.confirmationValue}>{reservationError}</Text>
              <TouchableOpacity style={styles.doneButton} onPress={async () => {
                setCheckingReservation(true);
                try { await loadExistingReservation(); }
                catch { setReservationError('Could not check your reservation. Please try again.'); }
                finally { setCheckingReservation(false); }
              }}><Text style={styles.doneButtonText}>Try again</Text></TouchableOpacity>
            </View>
          ) : existingReservation && (
            <View style={styles.confirmationDetails}>
              <Text style={styles.confirmationTitle}>Your existing reservation</Text>
              <Text style={styles.confirmationLabel}>Confirmation code</Text>
              <Text style={styles.confirmationCode}>{existingReservation.confirmation_code || existingReservation.id}</Text>
              <Text style={styles.confirmationLabel}>Movie</Text>
              <Text style={styles.confirmationValue}>{existingReservation.movie_title || 'Movie screening'}</Text>
              <Text style={styles.confirmationLabel}>Schedule</Text>
              <Text style={styles.confirmationValue}>{existingReservation.screening_date} {formatTime(existingReservation.screening_time || '')}</Text>
              <Text style={styles.confirmationLabel}>Attendees</Text>
              <Text style={styles.confirmationValue}>{existingReservation.attendee_count}</Text>
              <Text style={styles.confirmationLabel}>Status</Text>
              <Text style={styles.confirmationValue}>{existingReservation.status}</Text>
              <TouchableOpacity style={[styles.doneButton, { backgroundColor: '#B3432E' }]} disabled={cancelling} onPress={handleCancelReservation} accessibilityRole="button">
                {cancelling ? <ActivityIndicator color="#fff" /> : <Text style={styles.doneButtonText}>Cancel reservation</Text>}
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={25} color="#252525" />
        </TouchableOpacity>

        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>Movie Center</Text>
          <Text style={styles.headerSubtitle}>
            Reserve your movie screening
          </Text>
        </View>

        <View style={styles.headerIcon}>
          <Ionicons name="film-outline" size={25} color="#7652A5" />
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Welcome Banner */}
        <View style={styles.banner}>
          <View style={styles.bannerTextContainer}>
            <Text style={styles.bannerTitle}>Enjoy a movie day!</Text>
            <Text style={styles.bannerDescription}>
              Choose a movie, pick a showtime, and select your attendees.
            </Text>
          </View>
          <Ionicons name="ticket-outline" size={54} color="#FFFFFF" />
        </View>

        {/* Movie Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Now Showing</Text>
          <Text style={styles.sectionDescription}>
            Select a movie you want to watch.
          </Text>

          {loadingMovies ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#7652A5" />
              <Text style={styles.loadingText}>Loading movies...</Text>
            </View>
          ) : movies.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="film-outline" size={34} color="#A99BC0" />
              <Text style={styles.emptyTitle}>No movies available</Text>
              <Text style={styles.emptyDescription}>
                There are currently no active movies available for reservation.
              </Text>
            </View>
          ) : (
            movies.map((movie, index) => {
              const isSelected = selectedMovie?.id === movie.id;
              const posterColors = ['#496C80', '#987044', '#397D83'];
              const posterColor = posterColors[index % posterColors.length];

              return (
                <TouchableOpacity
                  key={String(movie.id)}
                  style={[
                    styles.movieCard,
                    isSelected && styles.selectedMovieCard,
                  ]}
                  onPress={() => handleMovieSelect(movie)}
                  activeOpacity={0.8}
                >
                  <View
                    style={[
                      styles.moviePoster,
                      { backgroundColor: posterColor },
                    ]}
                  >
                    {movie.poster_url ? (
                      <View style={styles.posterFallback}>
                        <Ionicons name="film" size={40} color="#FFFFFF" />
                        <Text style={styles.posterLabel}>MOVIE</Text>
                      </View>
                    ) : (
                      <>
                        <Ionicons name="film" size={40} color="#FFFFFF" />
                        <Text style={styles.posterLabel}>MOVIE</Text>
                      </>
                    )}
                  </View>

                  <View style={styles.movieInfo}>
                    <Text style={styles.movieTitle}>{movie.title}</Text>
                    <Text style={styles.movieMeta}>
                      {movie.age_rating || 'Not rated'}
                    </Text>
                    {!!movie.description && (
                      <Text style={styles.movieDescription}>
                        {movie.description}
                      </Text>
                    )}
                    <Text style={styles.rating}>
                      Rated {movie.age_rating || 'Not specified'}
                    </Text>
                  </View>

                  <Ionicons
                    name={
                      isSelected ? 'radio-button-on' : 'radio-button-off'
                    }
                    size={24}
                    color={isSelected ? '#7652A5' : '#A7A7A7'}
                  />
                </TouchableOpacity>
              );
            })
          )}
        </View>

        {/* Error */}
        {!!error && (
          <View style={styles.errorCard}>
            <Ionicons name="alert-circle-outline" size={20} color="#B04444" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Date Selection */}
        {!!selectedMovie && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Select a Date</Text>
            <Text style={styles.sectionDescription}>
              Choose your preferred screening date.
            </Text>

            {loadingScreenings ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color="#7652A5" />
                <Text style={styles.loadingText}>
                  Loading screening dates...
                </Text>
              </View>
            ) : dates.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons
                  name="calendar-outline"
                  size={30}
                  color="#A99BC0"
                />
                <Text style={styles.emptyTitle}>No screenings scheduled</Text>
                <Text style={styles.emptyDescription}>
                  There are no available screening schedules for this movie yet.
                </Text>
              </View>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
              >
                <View style={styles.dateList}>
                  {dates.map((date) => {
                    const isSelected = selectedDate === date.id;

                    return (
                      <TouchableOpacity
                        key={date.id}
                        style={[
                          styles.dateCard,
                          isSelected && styles.selectedDateCard,
                        ]}
                        onPress={() => handleDateSelect(date.id)}
                      >
                        <Text
                          style={[
                            styles.dateDay,
                            isSelected && styles.selectedDateText,
                          ]}
                        >
                          {date.day}
                        </Text>
                        <Text
                          style={[
                            styles.dateNumber,
                            isSelected && styles.selectedDateText,
                          ]}
                        >
                          {date.number}
                        </Text>
                        <Text
                          style={[
                            styles.dateMonth,
                            isSelected && styles.selectedDateText,
                          ]}
                        >
                          {date.month}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>
            )}
          </View>
        )}

        {/* Showtime Selection */}
        {!!selectedMovie && !loadingScreenings && dates.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Available Showtimes</Text>
            <Text style={styles.sectionDescription}>
              Select your preferred screening time.
            </Text>

            {showtimes.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons name="time-outline" size={30} color="#A99BC0" />
                <Text style={styles.emptyTitle}>No showtimes for this date</Text>
                <Text style={styles.emptyDescription}>
                  Please select another screening date.
                </Text>
              </View>
            ) : (
              showtimes.map((showtime) => {
                const isSelected = selectedShowtime?.id === showtime.id;
                const available = Math.max(
                  0,
                  Number(showtime.available_slots) || 0
                );
                const isFull = available <= 0;

                return (
                  <TouchableOpacity
                    key={String(showtime.id)}
                    disabled={isFull}
                    style={[
                      styles.showtimeCard,
                      isSelected && styles.selectedShowtimeCard,
                      isFull && styles.fullShowtimeCard,
                    ]}
                    onPress={() => handleShowtimeSelect(showtime)}
                  >
                    <View style={styles.showtimeLeft}>
                      <Ionicons
                        name="time-outline"
                        size={25}
                        color={isFull ? '#999999' : '#7652A5'}
                      />
                      <View>
                        <Text style={styles.showtimeTime}>
                          {formatTime(showtime.screening_time)}
                        </Text>
                        <Text style={styles.showtimeAvailability}>
                          {isFull
                            ? 'No slots available'
                            : `${available} slots available`}
                        </Text>
                      </View>
                    </View>

                    <View
                      style={[
                        styles.statusBadge,
                        isFull
                          ? styles.fullBadge
                          : styles.availableBadge,
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusText,
                          isFull && styles.fullStatusText,
                        ]}
                      >
                        {isFull ? 'FULL' : 'AVAILABLE'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        )}

        {/* Attendee Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Select Attendees</Text>
          <Text style={styles.sectionDescription}>
            Select one marker for each attendee. Up to {MAX_SEATS} attendees
            per reservation.
          </Text>

          {selectedShowtime ? (
            <View style={styles.seatCard}>
              <View style={styles.screenWrap}>
                <View style={styles.screenCurve} />
                <Text style={styles.screenLabel}>SCREEN</Text>
              </View>

              <View style={styles.seatGrid}>
                {ROWS.map((row) => (
                  <View key={row} style={styles.seatRow}>
                    <Text style={styles.rowLabel}>{row}</Text>

                    <View style={styles.seatsContainer}>
                      {Array.from(
                        { length: COLS },
                        (_, index) => index + 1
                      ).map((col) => (
                        <React.Fragment key={`${row}${col}`}>
                          {renderSeat(row, col)}
                          {col === AISLE_AFTER && (
                            <View style={styles.aisle} />
                          )}
                        </React.Fragment>
                      ))}
                    </View>

                    <Text style={styles.rowLabel}>{row}</Text>
                  </View>
                ))}
              </View>

              <View style={styles.legend}>
                <View style={styles.legendItem}>
                  <View style={[styles.legendSwatch, styles.seat]} />
                  <Text style={styles.legendText}>Not selected</Text>
                </View>
                <View style={styles.legendItem}>
                  <View
                    style={[
                      styles.legendSwatch,
                      styles.seat,
                      styles.seatSelected,
                    ]}
                  />
                  <Text style={styles.legendText}>Selected</Text>
                </View>
              </View>

              <View style={styles.selectedSeatsBar}>
                <Text style={styles.selectedSeatsLabel}>
                  {selectedSeats.length === 0
                    ? 'No attendees selected'
                    : `${selectedSeats.length} attendee${
                        selectedSeats.length > 1 ? 's' : ''
                      } selected`}
                </Text>

                {sortedSeats.length > 0 && (
                  <View style={styles.chipRow}>
                    {sortedSeats.map((seat) => (
                      <TouchableOpacity
                        key={seat}
                        style={styles.chip}
                        onPress={() => handleSeatPress(seat)}
                      >
                        <Text style={styles.chipText}>{seat}</Text>
                        <Ionicons
                          name="close"
                          size={13}
                          color="#7652A5"
                        />
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            </View>
          ) : (
            <View style={styles.seatPlaceholder}>
              <Ionicons
                name="grid-outline"
                size={30}
                color="#A99BC0"
              />
              <Text style={styles.seatPlaceholderText}>
                Select a showtime to choose your attendees.
              </Text>
            </View>
          )}
        </View>

        {/* Reservation Summary */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Reservation Summary</Text>

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Movie</Text>
            <Text style={styles.summaryValue}>
              {selectedMovie?.title || 'Not selected'}
            </Text>
          </View>

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Date</Text>
            <Text style={styles.summaryValue}>
              {selectedDateInfo
                ? `${selectedDateInfo.month} ${selectedDateInfo.number}`
                : 'Not selected'}
            </Text>
          </View>

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Showtime</Text>
            <Text style={styles.summaryValue}>
              {selectedShowtime
                ? formatTime(selectedShowtime.screening_time)
                : 'Not selected'}
            </Text>
          </View>

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Attendees</Text>
            <Text style={styles.summaryValue}>
              {selectedSeats.length > 0
                ? `${selectedSeats.length} attendee(s)`
                : 'Not selected'}
            </Text>
          </View>

          <View style={styles.noPaymentNotice}>
            <Ionicons
              name="information-circle-outline"
              size={20}
              color="#7652A5"
            />
            <Text style={styles.noPaymentText}>
              This is a free reservation. No payment is required.
            </Text>
          </View>

          <TouchableOpacity
            style={[
              styles.reserveButton,
              !canReserve && styles.disabledButton,
            ]}
            onPress={handleReserve}
            disabled={!canReserve}
          >
            {reserving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Text style={styles.reserveButtonText}>
                  Reserve Now
                </Text>
                <Ionicons
                  name="arrow-forward"
                  size={21}
                  color="#FFFFFF"
                />
              </>
            )}
          </TouchableOpacity>
        </View>

        <Text style={styles.footerNote}>
          Please arrive at the Movie Center before your scheduled screening.
        </Text>
      </ScrollView>

      {/* Confirmation Modal */}
      {showConfirmation && (
        <View style={styles.modalOverlay}>
          <View style={styles.confirmationCard}>
            <View style={styles.successIcon}>
              <Ionicons name="checkmark" size={42} color="#FFFFFF" />
            </View>

            <Text style={styles.confirmationTitle}>
              Reservation Submitted!
            </Text>

            <Text style={styles.confirmationDescription}>
              Your movie screening reservation has been successfully submitted.
            </Text>

            <View style={styles.confirmationDetails}>
              <Text style={styles.confirmationLabel}>
                Confirmation Code
              </Text>
              <Text style={styles.confirmationCode}>
                {reservationCode}
              </Text>

              <Text style={styles.confirmationLabel}>Movie</Text>
              <Text style={styles.confirmationValue}>
                {selectedMovie?.title || '—'}
              </Text>

              <Text style={styles.confirmationLabel}>Schedule</Text>
              <Text style={styles.confirmationValue}>
                {selectedDateInfo
                  ? `${selectedDateInfo.month} ${selectedDateInfo.number}`
                  : '—'}{' '}
                ·{' '}
                {selectedShowtime
                  ? formatTime(selectedShowtime.screening_time)
                  : '—'}
              </Text>

              <Text style={styles.confirmationLabel}>Attendees</Text>
              <Text style={styles.confirmationValue}>
                {selectedSeats.length}
              </Text>
            </View>

            <Text style={styles.pendingNote}>
              Your reservation has been recorded in the system. Please check
              your reservation status for updates.
            </Text>

            <TouchableOpacity
              style={styles.doneButton}
              onPress={() => {
                setShowConfirmation(false);
                setSelectedShowtime(null);
                clearSeats();
              }}
            >
              <Text style={styles.doneButtonText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F7F3' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#F1EDF7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: { flex: 1, marginLeft: 13 },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#29252E' },
  headerSubtitle: { fontSize: 13, color: '#77717E', marginTop: 2 },
  headerIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#F1EDF7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: { padding: 20, paddingBottom: 40 },
  banner: {
    backgroundColor: '#7652A5',
    borderRadius: 20,
    padding: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 28,
  },
  bannerTextContainer: { flex: 1, paddingRight: 10 },
  bannerTitle: {
    color: '#FFFFFF',
    fontSize: 23,
    fontWeight: '800',
    marginBottom: 8,
  },
  bannerDescription: {
    color: '#F0EAF8',
    fontSize: 14,
    lineHeight: 21,
  },
  section: { marginBottom: 28 },
  sectionTitle: { fontSize: 21, fontWeight: '800', color: '#29252E' },
  sectionDescription: {
    fontSize: 14,
    color: '#77717E',
    marginTop: 5,
    marginBottom: 15,
  },
  loadingContainer: {
    padding: 25,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  loadingText: { color: '#77717E', fontSize: 13 },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 17,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E9E5ED',
  },
  emptyTitle: {
    color: '#29252E',
    fontSize: 15,
    fontWeight: '800',
    marginTop: 10,
  },
  emptyDescription: {
    color: '#77717E',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
    marginTop: 5,
  },
  errorCard: {
    backgroundColor: '#FCE8E8',
    borderRadius: 12,
    padding: 13,
    marginBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  errorText: { color: '#9E3939', fontSize: 13, flex: 1 },
  movieCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 17,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  selectedMovieCard: {
    borderColor: '#7652A5',
    backgroundColor: '#FCFAFF',
  },
  moviePoster: {
    width: 76,
    height: 105,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  posterFallback: { alignItems: 'center', justifyContent: 'center' },
  posterLabel: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
    marginTop: 7,
    letterSpacing: 1,
  },
  movieInfo: { flex: 1, paddingHorizontal: 12 },
  movieTitle: { color: '#29252E', fontSize: 16, fontWeight: '800' },
  movieMeta: {
    color: '#7652A5',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 5,
  },
  movieDescription: {
    color: '#77717E',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 6,
  },
  rating: {
    color: '#55505B',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 7,
  },
  dateList: { flexDirection: 'row', gap: 10 },
  dateCard: {
    width: 66,
    height: 88,
    borderRadius: 15,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E9E5ED',
  },
  selectedDateCard: {
    backgroundColor: '#7652A5',
    borderColor: '#7652A5',
  },
  dateDay: { color: '#77717E', fontSize: 12, fontWeight: '600' },
  dateNumber: {
    color: '#29252E',
    fontSize: 25,
    fontWeight: '800',
    marginVertical: 2,
  },
  dateMonth: { color: '#77717E', fontSize: 11 },
  selectedDateText: { color: '#FFFFFF' },
  showtimeCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 15,
    padding: 16,
    marginBottom: 11,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  selectedShowtimeCard: {
    borderColor: '#7652A5',
    backgroundColor: '#FCFAFF',
  },
  fullShowtimeCard: { opacity: 0.6 },
  showtimeLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  showtimeTime: { color: '#29252E', fontSize: 16, fontWeight: '800' },
  showtimeAvailability: {
    color: '#77717E',
    fontSize: 12,
    marginTop: 4,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
  },
  availableBadge: { backgroundColor: '#E4F4E9' },
  fullBadge: { backgroundColor: '#FCE8E8' },
  statusText: { color: '#287B48', fontSize: 10, fontWeight: '800' },
  fullStatusText: { color: '#B04444' },
  seatCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingVertical: 20,
    paddingHorizontal: 16,
  },
  screenWrap: { alignItems: 'center', marginBottom: 26 },
  screenCurve: {
    width: '80%',
    height: 28,
    borderTopLeftRadius: 120,
    borderTopRightRadius: 120,
    borderTopWidth: 5,
    borderTopColor: '#7652A5',
    backgroundColor: '#F1EDF7',
  },
  screenLabel: {
    color: '#9B93A6',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 3,
    marginTop: 6,
  },
  seatGrid: { gap: 8, alignItems: 'center' },
  seatRow: { flexDirection: 'row', alignItems: 'center' },
  rowLabel: {
    width: 22,
    textAlign: 'center',
    color: '#9B93A6',
    fontSize: 12,
    fontWeight: '700',
  },
  seatsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  aisle: { width: 16 },
  seat: {
    borderRadius: 8,
    borderTopLeftRadius: 11,
    borderTopRightRadius: 11,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#C9BDDC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  seatSelected: { backgroundColor: '#7652A5', borderColor: '#7652A5' },
  seatSelectedText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 20,
    marginTop: 22,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#F0EDF2',
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  legendSwatch: { width: 20, height: 20, borderRadius: 6 },
  legendText: { color: '#77717E', fontSize: 12 },
  selectedSeatsBar: { marginTop: 16 },
  selectedSeatsLabel: {
    color: '#29252E',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginTop: 10,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#F1EDF7',
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  chipText: { color: '#594875', fontSize: 13, fontWeight: '700' },
  seatPlaceholder: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingVertical: 34,
    paddingHorizontal: 20,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#E9E5ED',
    borderStyle: 'dashed',
  },
  seatPlaceholderText: {
    color: '#77717E',
    fontSize: 14,
    marginTop: 10,
    textAlign: 'center',
  },
  summaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 19,
    marginBottom: 20,
  },
  summaryTitle: {
    color: '#29252E',
    fontSize: 19,
    fontWeight: '800',
    marginBottom: 18,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F0EDF2',
  },
  summaryLabel: { color: '#77717E', fontSize: 14 },
  summaryValue: {
    color: '#29252E',
    fontSize: 14,
    fontWeight: '700',
    flexShrink: 1,
    textAlign: 'right',
    marginLeft: 12,
  },
  noPaymentNotice: {
    backgroundColor: '#F1EDF7',
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginTop: 18,
    marginBottom: 18,
  },
  noPaymentText: { color: '#594875', fontSize: 12, flex: 1, lineHeight: 18 },
  reserveButton: {
    backgroundColor: '#7652A5',
    borderRadius: 14,
    padding: 17,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  disabledButton: { opacity: 0.55 },
  reserveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  footerNote: {
    textAlign: 'center',
    color: '#88828E',
    fontSize: 12,
    lineHeight: 18,
    paddingHorizontal: 15,
  },
  modalOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 22,
    zIndex: 10,
  },
  confirmationCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 23,
    alignItems: 'center',
  },
  successIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#389B68',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  confirmationTitle: {
    color: '#29252E',
    fontSize: 21,
    fontWeight: '800',
    textAlign: 'center',
  },
  confirmationDescription: {
    color: '#77717E',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 19,
  },
  confirmationDetails: {
    width: '100%',
    backgroundColor: '#F8F7F3',
    borderRadius: 14,
    padding: 15,
    marginTop: 20,
  },
  confirmationLabel: { color: '#77717E', fontSize: 12, marginTop: 9 },
  confirmationCode: {
    color: '#7652A5',
    fontSize: 21,
    fontWeight: '800',
    marginTop: 4,
  },
  confirmationValue: {
    color: '#29252E',
    fontSize: 15,
    fontWeight: '700',
    marginTop: 3,
  },
  pendingNote: {
    color: '#287B48',
    backgroundColor: '#E4F4E9',
    padding: 10,
    borderRadius: 9,
    fontSize: 11,
    textAlign: 'center',
    marginTop: 15,
    lineHeight: 16,
  },
  doneButton: {
    width: '100%',
    backgroundColor: '#7652A5',
    padding: 16,
    borderRadius: 13,
    alignItems: 'center',
    marginTop: 18,
  },
  doneButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
});
