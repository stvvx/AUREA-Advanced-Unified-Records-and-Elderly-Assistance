
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Alert,
  useWindowDimensions,
  ActivityIndicator,
} from 'react-native';
import { Text } from '../components/AppText';
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

const reservationStatusLabels: Record<string, string> = {
  Pending: 'Naghihintay ng confirmation',
  Confirmed: 'Confirmed na',
  Cancelled: 'Na-cancel na',
};

const reservationErrorMessages: Record<string, string> = {
  'User was not found.': 'Hindi makita ang account mo. Mag-log in ulit.',
  'You already have an active reservation. Cancel it before booking another screening.': 'May active reservation ka na. I-cancel muna iyon bago mag-book ng ibang screening.',
  'Select between one and five available seats.': 'Pumili ng isa hanggang limang bakanteng seat.',
  'Choose between one and five distinct seats.': 'Pumili ng isa hanggang limang magkakaibang seat.',
  'A selected seat has already been reserved. Refresh the seat map and choose another seat.': 'May nauna nang nag-reserve ng napili mong seat. I-refresh ang seat map at pumili ng iba.',
  'At least one attendee is required.': 'Pumili ng kahit isang seat.',
  'This screening is unavailable.': 'Hindi available ang screening na ito. Pumili ng iba.',
  'This screening date has already passed.': 'Tapos na ang screening na ito. Pumili ng ibang schedule.',
  'Reservation was not found.': 'Hindi makita ang reservation mo.',
  'This reservation is already cancelled.': 'Na-cancel na ang reservation na ito.',
  'You cannot update this reservation.': 'Hindi mo puwedeng baguhin ang reservation na ito.',
  'You may only cancel your own reservation.': 'Sarili mong reservation lang ang puwede mong i-cancel.',
};

function requestErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && !(error instanceof TypeError) ? error.message : fallback;
}

async function parseResponse(response: Response) {
  const data = await response.json().catch(() => ({}));

  if (!response.ok || data.success === false) {
    throw new Error(
      reservationErrorMessages[data.error || data.message] ||
      (response.status === 409 ? 'Nagbago ang availability o reservation status. I-check ulit bago mag-reserve.'
        : 'Hindi natuloy ang request. Subukan ulit.')
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
  const [reservedSeats, setReservedSeats] = useState<string[]>([]);
  const [loadingSeats, setLoadingSeats] = useState(false);
  const [seatError, setSeatError] = useState('');
  const [loadedSeatScreening, setLoadedSeatScreening] = useState<string>('');
  const [seatRefresh, setSeatRefresh] = useState(0);
  const selectedShowtimeId = selectedShowtime?.id;

  useEffect(() => {
    if (!selectedShowtimeId || !userId) return;
    const controller = new AbortController();
    let active = true;
    let busy = false;
    const load = async () => {
      if (busy) return;
      busy = true;
      const timeout = setTimeout(() => controller.abort(), 20000);
      try {
        const response = await fetch(`${API_BASE}/api/movie-center/screenings/${selectedShowtimeId}/seats?user_id=${userId}`, { signal: controller.signal });
        const data = await parseResponse(response);
        if (!active) return;
        const booked: string[] = data.reserved_seats || [];
        setReservedSeats(booked);
        setLoadedSeatScreening(String(selectedShowtimeId));
        setSelectedSeats(previous => previous.filter(seat => !booked.includes(seat)));
        setSeatError('');
      } catch {
        if (active) setSeatError('Hindi ma-load ang mga naka-reserve na seat. Subukan ulit bago pumili.');
      } finally { clearTimeout(timeout); busy = false; if (active) setLoadingSeats(false); }
    };
    const start = setTimeout(() => { setLoadingSeats(true); setReservedSeats([]); setSelectedSeats([]); void load(); }, 0);
    const poll = setInterval(() => { void load(); }, 10000);
    return () => { active = false; clearTimeout(start); clearInterval(poll); controller.abort(); };
  }, [selectedShowtimeId, userId, seatRefresh]);


  const [submittedReservationCode, setSubmittedReservationCode] = useState('');

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
      setReservationError('Hindi ma-check ang reservation mo. Subukan ulit.');
      setCheckingReservation(false);
      controller.abort();
    }, 25000);
    loadExistingReservation(controller.signal)
      .catch(() => {
        if (!controller.signal.aborted) setReservationError('Hindi ma-check ang reservation mo. Subukan ulit.');
      })
      .finally(() => {
        clearTimeout(timeout);
        if (!controller.signal.aborted) setCheckingReservation(false);
      });
    return () => { clearTimeout(timeout); controller.abort(); };
  }, [loadExistingReservation]));

  const refreshReservation = async () => {
    setCheckingReservation(true);
    try {
      await loadExistingReservation();
    } catch {
      setReservationError('Hindi ma-check ang reservation mo. Subukan ulit.');
    } finally {
      setCheckingReservation(false);
    }
  };

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
      Alert.alert('Hindi na-cancel ang reservation', requestErrorMessage(err, 'Hindi makakonekta. Subukan ulit.'));
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
          setError(requestErrorMessage(err, 'Hindi ma-load ang mga movie.'));
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
  const selectedMovieId = selectedMovie?.id;
  useEffect(() => {
    let mounted = true;

    const loadScreenings = async () => {
      if (!userId || !selectedMovieId) {
        setScreenings([]);
        setSelectedDate('');
        setSelectedShowtime(null);
        setSelectedSeats([]);
        setLoadingScreenings(false);
        return;
      }
      try {
        setLoadingScreenings(true);
        setSelectedShowtime(null);
        setSelectedDate('');
        setSelectedSeats([]);

        const response = await fetch(
          `${API_BASE}/api/movie-center/screenings?user_id=${encodeURIComponent(
            String(userId)
          )}&movie_id=${encodeURIComponent(String(selectedMovieId))}`
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
          setError(requestErrorMessage(err, 'Hindi ma-load ang mga screening.'));
        }
      } finally {
        if (mounted) setLoadingScreenings(false);
      }
    };

    const initial = setTimeout(() => { void loadScreenings(); }, 0);

    return () => {
      mounted = false;
      clearTimeout(initial);
    };
  }, [userId, selectedMovieId]);

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
    if (!selectedShowtime || loadedSeatScreening !== String(selectedShowtime.id) || loadingSeats || seatError || reservedSeats.includes(seatId)) return;

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
        'Limit sa reservation',
        `Hanggang ${maxSelectable} na manonood lang ang puwedeng piliin para sa screening na ito.`
      );
      return;
    }

    setSelectedSeats((previous) => [...previous, seatId]);
  };

  const handleReserve = async () => {
    if (reservationBusy.current || existingReservation || checkingReservation || reservationError || loadingSeats || seatError || loadedSeatScreening !== String(selectedShowtime?.id)) return;
    if (!userId) {
      Alert.alert('Kailangang mag-log in', 'Mag-log in ulit para makapag-reserve.');
      return;
    }

    if (!selectedMovie) {
      Alert.alert('Pumili ng movie', 'Pumili muna ng movie.');
      return;
    }

    if (!selectedShowtime) {
      Alert.alert('Pumili ng showtime', 'Piliin ang oras ng screening na gusto mo.');
      return;
    }

    if (selectedSeats.length === 0) {
      Alert.alert('Piliin ang seats', 'Pumili ng kahit isang seat.');
      return;
    }

    if (selectedSeats.length > Number(selectedShowtime.available_slots)) {
      Alert.alert(
        'Kulang ang available na slots',
        'Bawasan ang bilang ng manonood.'
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
            seat_labels: selectedSeats,
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
        'Na-submit na';

      setSubmittedReservationCode(String(code));
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
      // The successful booking stays visible even if this follow-up fails.
      await loadExistingReservation().catch(() => undefined);
    } catch (err: any) {
      setSeatRefresh(value => value + 1);
      setReservationError('I-check muna ang reservation mo bago sumubok ulit.');
      await loadExistingReservation().catch(() => undefined);
      Alert.alert(
        'Hindi na-submit ang reservation',
        requestErrorMessage(err, 'Hindi makakonekta. Subukan ulit.')
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
    !reserving && !loadingSeats && !seatError && loadedSeatScreening === String(selectedShowtime?.id) &&
    selectedSeats.length <= Number(selectedShowtime?.available_slots || 0);

  const renderSeat = (row: string, col: number) => {
    const id = `${row}${col}`;
    const isSelected = selectedSeats.includes(id);
    const isReserved = loadedSeatScreening === String(selectedShowtime?.id) && reservedSeats.includes(id);
    const seatsUnavailable = loadingSeats || !!seatError || loadedSeatScreening !== String(selectedShowtime?.id);

    return (
      <TouchableOpacity
        key={id}
        activeOpacity={0.7}
        onPress={() => handleSeatPress(id)}
        disabled={isReserved || seatsUnavailable}
        accessibilityState={{ disabled: isReserved || seatsUnavailable, selected: isSelected }}
        accessibilityRole="button"
        accessibilityLabel={`Seat ${id}, ${
          isReserved ? 'naka-reserve' : isSelected ? 'napili mo' : 'bakante'
        }`}
        style={[
          styles.seat,
          { width: seatSize, height: seatSize },
          isSelected && styles.seatSelected,
          isReserved && styles.seatReserved,
        ]}
      >
        {isReserved && <Ionicons name="close" size={12} color="#FFFFFF" />}
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
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()} accessibilityLabel="Bumalik">
            <Ionicons name="arrow-back" size={25} color="#252525" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Reservation ko sa Movie Center</Text>
        </View>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {checkingReservation ? <ActivityIndicator size="large" color="#7652A5" /> : reservationError && !existingReservation ? (
            <View style={styles.confirmationDetails}>
              <Text style={styles.confirmationValue}>{reservationError}</Text>
              <TouchableOpacity style={styles.doneButton} accessibilityRole="button" onPress={() => void refreshReservation()}>
                <Text style={styles.doneButtonText}>Subukan ulit</Text>
              </TouchableOpacity>
            </View>
          ) : existingReservation && (
            <View style={styles.confirmationDetails}>
              <Text style={styles.confirmationTitle} accessibilityLiveRegion="polite">
                {submittedReservationCode === String(existingReservation.confirmation_code || existingReservation.id)
                  ? 'Na-submit na ang reservation mo'
                  : 'Kasalukuyan mong reservation'}
              </Text>
              <Text style={styles.confirmationLabel}>Confirmation code</Text>
              <Text style={styles.confirmationCode}>{existingReservation.confirmation_code || existingReservation.id}</Text>
              <Text style={styles.confirmationLabel}>Movie</Text>
              <Text style={styles.confirmationValue}>{existingReservation.movie_title || 'Screening ng movie'}</Text>
              <Text style={styles.confirmationLabel}>Schedule</Text>
              <Text style={styles.confirmationValue}>{existingReservation.screening_date} {formatTime(existingReservation.screening_time || '')}</Text>
              <Text style={styles.confirmationLabel}>Bilang ng manonood</Text>
              <Text style={styles.confirmationValue}>{existingReservation.attendee_count}</Text>
              <Text style={styles.confirmationLabel}>Status</Text>
              <Text style={styles.confirmationValue}>{reservationStatusLabels[existingReservation.status] ?? existingReservation.status}</Text>
              {!!reservationError && <Text style={styles.confirmationValue} accessibilityRole="alert">{reservationError}</Text>}
              <TouchableOpacity style={styles.doneButton} accessibilityRole="button" disabled={cancelling} onPress={() => void refreshReservation()}>
                <Text style={styles.doneButtonText}>I-refresh ang status</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.doneButton, { backgroundColor: '#B3432E' }]} disabled={cancelling} onPress={handleCancelReservation} accessibilityRole="button">
                {cancelling ? <ActivityIndicator color="#fff" /> : <Text style={styles.doneButtonText}>I-cancel ang reservation</Text>}
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
            Mag-reserve para sa movie screening
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
            <Text style={styles.bannerTitle}>Tara, manood ng sine!</Text>
            <Text style={styles.bannerDescription}>
              Pumili ng movie, showtime, at seat para sa bawat manonood.
            </Text>
          </View>
          <Ionicons name="ticket-outline" size={54} color="#FFFFFF" />
        </View>

        {/* Movie Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Mga palabas ngayon</Text>
          <Text style={styles.sectionDescription}>
            Piliin ang movie na gusto mong panoorin.
          </Text>

          {loadingMovies ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#7652A5" />
              <Text style={styles.loadingText}>Nilo-load ang mga movie…</Text>
            </View>
          ) : movies.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="film-outline" size={34} color="#A99BC0" />
              <Text style={styles.emptyTitle}>Walang available na movie</Text>
              <Text style={styles.emptyDescription}>
                Wala pang movie na puwedeng i-reserve ngayon.
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
                      {movie.age_rating || 'Walang rating'}
                    </Text>
                    {!!movie.description && (
                      <Text style={styles.movieDescription}>
                        {movie.description}
                      </Text>
                    )}
                    <Text style={styles.rating}>
                      Rating: {movie.age_rating || 'Walang nakalagay'}
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
            <Text style={styles.sectionTitle}>Pumili ng petsa</Text>
            <Text style={styles.sectionDescription}>
              Piliin ang petsa ng screening na gusto mo.
            </Text>

            {loadingScreenings ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color="#7652A5" />
                <Text style={styles.loadingText}>
                  Nilo-load ang mga petsa ng screening…
                </Text>
              </View>
            ) : dates.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons
                  name="calendar-outline"
                  size={30}
                  color="#A99BC0"
                />
                <Text style={styles.emptyTitle}>Wala pang schedule</Text>
                <Text style={styles.emptyDescription}>
                  Wala pang screening schedule para sa movie na ito.
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
            <Text style={styles.sectionTitle}>Mga available na showtime</Text>
            <Text style={styles.sectionDescription}>
              Piliin ang oras ng screening na gusto mo.
            </Text>

            {showtimes.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons name="time-outline" size={30} color="#A99BC0" />
                <Text style={styles.emptyTitle}>Walang showtime sa petsang ito</Text>
                <Text style={styles.emptyDescription}>
                  Pumili ng ibang petsa ng screening.
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
                            ? 'Wala nang bakanteng slot'
                            : `${available} na bakanteng slot`}
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
                        {isFull ? 'PUNO NA' : 'MAY BAKANTE'}
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
          <Text style={styles.sectionTitle}>Pumili ng seats</Text>
          <Text style={styles.sectionDescription}>
            Pumili ng isang seat para sa bawat manonood. Hanggang {MAX_SEATS} manonood
            sa bawat reservation.
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

              {loadingSeats && <ActivityIndicator color="#7652A5" />}
              {!!seatError && <TouchableOpacity accessibilityRole="button" onPress={() => setSeatRefresh(value => value + 1)}><Text style={styles.footerNote}>{seatError} I-tap para subukan ulit.</Text></TouchableOpacity>}
              <View style={styles.legend}>
                <View style={styles.legendItem}>
                  <View style={[styles.legendSwatch, styles.seatReserved]} />
                  <Text style={styles.legendText}>Naka-reserve</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendSwatch, styles.seat]} />
                  <Text style={styles.legendText}>Bakante</Text>
                </View>
                <View style={styles.legendItem}>
                  <View
                    style={[
                      styles.legendSwatch,
                      styles.seat,
                      styles.seatSelected,
                    ]}
                  />
                  <Text style={styles.legendText}>Napili mo</Text>
                </View>
              </View>

              <View style={styles.selectedSeatsBar}>
                <Text style={styles.selectedSeatsLabel}>
                  {selectedSeats.length === 0
                    ? 'Wala pang napiling seat'
                    : `${selectedSeats.length} na seat ang napili mo`}
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
                Pumili muna ng showtime para makapili ng seats.
              </Text>
            </View>
          )}
        </View>

        {/* Detalye ng reservation */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Detalye ng reservation</Text>

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Movie</Text>
            <Text style={styles.summaryValue}>
              {selectedMovie?.title || 'Wala pang napili'}
            </Text>
          </View>

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Petsa</Text>
            <Text style={styles.summaryValue}>
              {selectedDateInfo
                ? `${selectedDateInfo.month} ${selectedDateInfo.number}`
                : 'Wala pang napili'}
            </Text>
          </View>

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Showtime</Text>
            <Text style={styles.summaryValue}>
              {selectedShowtime
                ? formatTime(selectedShowtime.screening_time)
                : 'Wala pang napili'}
            </Text>
          </View>

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Bilang ng manonood</Text>
            <Text style={styles.summaryValue}>
              {selectedSeats.length > 0
                ? `${selectedSeats.length} na manonood`
                : 'Wala pang napili'}
            </Text>
          </View>

          <View style={styles.noPaymentNotice}>
            <Ionicons
              name="information-circle-outline"
              size={20}
              color="#7652A5"
            />
            <Text style={styles.noPaymentText}>
              Libre ang reservation. Wala kang kailangang bayaran.
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
                  Mag-reserve na
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
          Dumating sa Movie Center bago ang oras ng screening mo.
        </Text>
      </ScrollView>

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
  seatReserved: { backgroundColor: '#929098', borderColor: '#929098' },
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
  confirmationTitle: {
    color: '#29252E',
    fontSize: 21,
    fontWeight: '800',
    textAlign: 'center',
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
