import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Alert,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

type Movie = {
  id: string;
  title: string;
  genre: string;
  duration: string;
  description: string;
  rating: string;
  color: string;
};

type Showtime = {
  id: string;
  time: string;
  fillRate: number; // 0 to 1, share of seats already taken (demo data)
};

const MOVIES: Movie[] = [
  {
    id: '1',
    title: 'A Journey Home',
    genre: 'Drama',
    duration: '1 hr 45 min',
    description:
      'A heartwarming story about family, memories, and the meaning of home.',
    rating: 'PG',
    color: '#496C80',
  },
  {
    id: '2',
    title: 'The Great Adventure',
    genre: 'Adventure',
    duration: '1 hr 50 min',
    description:
      'An exciting journey filled with friendship, discovery, and unforgettable moments.',
    rating: 'G',
    color: '#987044',
  },
  {
    id: '3',
    title: 'Ocean Wonders',
    genre: 'Documentary',
    duration: '1 hr 20 min',
    description:
      'Explore the beauty of marine life and discover the wonders beneath the sea.',
    rating: 'G',
    color: '#397D83',
  },
];

const SHOWTIMES: Showtime[] = [
  { id: '1', time: '9:00 AM', fillRate: 0.1 },
  { id: '2', time: '1:00 PM', fillRate: 0.4 },
  { id: '3', time: '4:00 PM', fillRate: 1 },
];

// Seat layout
const ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
const COLS = 10;
const AISLE_AFTER = 5; // aisle between seat 5 and 6
const TOTAL_SEATS = ROWS.length * COLS;
const MAX_SEATS = 5;

// Deterministic pseudo-random taken seats, so the same show always looks the same.
// Replace with data from your server when you have one.
function getTakenSeats(key: string, fillRate: number): Set<string> {
  const taken = new Set<string>();
  if (fillRate >= 1) {
    ROWS.forEach((r) => {
      for (let c = 1; c <= COLS; c++) taken.add(`${r}${c}`);
    });
    return taken;
  }

  let seed = 0;
  for (let i = 0; i < key.length; i++) {
    seed = (seed * 31 + key.charCodeAt(i)) % 2147483647;
  }
  const next = () => {
    seed = (seed * 48271) % 2147483647;
    return seed / 2147483647;
  };

  ROWS.forEach((r) => {
    for (let c = 1; c <= COLS; c++) {
      if (next() < fillRate) taken.add(`${r}${c}`);
    }
  });
  return taken;
}

function getUpcomingDates() {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() + index + 1);

    return {
      id: date.toISOString().split('T')[0],
      day: date.toLocaleDateString('en-US', { weekday: 'short' }),
      number: date.getDate(),
      month: date.toLocaleDateString('en-US', { month: 'short' }),
    };
  });
}

export default function MovieBookScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();

  const dates = useMemo(() => getUpcomingDates(), []);

  const [selectedMovie, setSelectedMovie] = useState(MOVIES[0]);
  const [selectedDate, setSelectedDate] = useState(dates[0].id);
  const [selectedShowtime, setSelectedShowtime] = useState<Showtime | null>(null);
  const [selectedSeats, setSelectedSeats] = useState<string[]>([]);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [reservationCode, setReservationCode] = useState('');

  const selectedDateInfo = dates.find((date) => date.id === selectedDate);

  // Seat size adapts to screen width: screen padding (40) + card padding (32)
  // + row label (22) + aisle (22) + gaps between seats
  const seatSize = Math.min(
    34,
    Math.floor((width - 40 - 32 - 22 - 22 - COLS * 6) / COLS)
  );

  // Taken seats for every showtime on the chosen movie + date
  const takenByShowtime = useMemo(() => {
    const map: Record<string, Set<string>> = {};
    SHOWTIMES.forEach((s) => {
      map[s.id] = getTakenSeats(
        `${selectedMovie.id}-${selectedDate}-${s.id}`,
        s.fillRate
      );
    });
    return map;
  }, [selectedMovie.id, selectedDate]);

  const takenSeats = selectedShowtime
    ? takenByShowtime[selectedShowtime.id]
    : new Set<string>();

  const clearSeats = () => setSelectedSeats([]);

  const handleDateSelect = (dateId: string) => {
    setSelectedDate(dateId);
    setSelectedShowtime(null);
    clearSeats();
  };

  const handleMovieSelect = (movie: Movie) => {
    setSelectedMovie(movie);
    setSelectedShowtime(null);
    clearSeats();
  };

  const handleShowtimeSelect = (showtime: Showtime) => {
    if (selectedShowtime?.id !== showtime.id) clearSeats();
    setSelectedShowtime(showtime);
  };

  const handleSeatPress = (seatId: string) => {
    if (takenSeats.has(seatId)) return;

    if (selectedSeats.includes(seatId)) {
      setSelectedSeats((prev) => prev.filter((s) => s !== seatId));
      return;
    }

    if (selectedSeats.length >= MAX_SEATS) {
      Alert.alert(
        'Seat limit reached',
        `You can reserve up to ${MAX_SEATS} seats per reservation.`
      );
      return;
    }

    setSelectedSeats((prev) => [...prev, seatId]);
  };

  const sortedSeats = useMemo(
    () =>
      [...selectedSeats].sort((a, b) => {
        if (a[0] !== b[0]) return a[0].localeCompare(b[0]);
        return parseInt(a.slice(1), 10) - parseInt(b.slice(1), 10);
      }),
    [selectedSeats]
  );

  const handleReserve = () => {
    if (!selectedShowtime) {
      Alert.alert('Select a Showtime', 'Please choose your preferred screening time.');
      return;
    }

    if (selectedSeats.length === 0) {
      Alert.alert('Select your seats', 'Tap at least one seat on the seat map.');
      return;
    }

    const code = `AUR-${Date.now().toString().slice(-6)}`;
    setReservationCode(code);
    setShowConfirmation(true);
  };

  const canReserve = !!selectedShowtime && selectedSeats.length > 0;

  const renderSeat = (row: string, col: number) => {
    const id = `${row}${col}`;
    const isTaken = takenSeats.has(id);
    const isSelected = selectedSeats.includes(id);

    return (
      <TouchableOpacity
        key={id}
        disabled={isTaken}
        activeOpacity={0.7}
        onPress={() => handleSeatPress(id)}
        accessibilityRole="button"
        accessibilityLabel={`Seat ${id}, ${
          isTaken ? 'taken' : isSelected ? 'selected' : 'available'
        }`}
        style={[
          styles.seat,
          { width: seatSize, height: seatSize },
          isTaken && styles.seatTaken,
          isSelected && styles.seatSelected,
        ]}
      >
        {isSelected ? (
          <Text style={styles.seatSelectedText}>{col}</Text>
        ) : isTaken ? (
          <Ionicons name="close" size={Math.max(12, seatSize * 0.5)} color="#B9B4C0" />
        ) : null}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={25} color="#252525" />
        </TouchableOpacity>

        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>Movie Center</Text>
          <Text style={styles.headerSubtitle}>Reserve your movie screening</Text>
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
              Choose a movie, pick a showtime, and select your seats.
            </Text>
          </View>
          <Ionicons name="ticket-outline" size={54} color="#FFFFFF" />
        </View>

        {/* Movie Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Now Showing</Text>
          <Text style={styles.sectionDescription}>Select a movie you want to watch.</Text>

          {MOVIES.map((movie) => {
            const isSelected = selectedMovie.id === movie.id;

            return (
              <TouchableOpacity
                key={movie.id}
                style={[styles.movieCard, isSelected && styles.selectedMovieCard]}
                onPress={() => handleMovieSelect(movie)}
                activeOpacity={0.8}
              >
                <View style={[styles.moviePoster, { backgroundColor: movie.color }]}>
                  <Ionicons name="film" size={40} color="#FFFFFF" />
                  <Text style={styles.posterLabel}>MOVIE</Text>
                </View>

                <View style={styles.movieInfo}>
                  <Text style={styles.movieTitle}>{movie.title}</Text>
                  <Text style={styles.movieMeta}>
                    {movie.genre} · {movie.duration}
                  </Text>
                  <Text style={styles.movieDescription}>{movie.description}</Text>
                  <Text style={styles.rating}>Rated {movie.rating}</Text>
                </View>

                <Ionicons
                  name={isSelected ? 'radio-button-on' : 'radio-button-off'}
                  size={24}
                  color={isSelected ? '#7652A5' : '#A7A7A7'}
                />
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Date Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Select a Date</Text>
          <Text style={styles.sectionDescription}>Choose your preferred screening date.</Text>

          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.dateList}>
              {dates.map((date) => {
                const isSelected = selectedDate === date.id;

                return (
                  <TouchableOpacity
                    key={date.id}
                    style={[styles.dateCard, isSelected && styles.selectedDateCard]}
                    onPress={() => handleDateSelect(date.id)}
                  >
                    <Text style={[styles.dateDay, isSelected && styles.selectedDateText]}>
                      {date.day}
                    </Text>
                    <Text style={[styles.dateNumber, isSelected && styles.selectedDateText]}>
                      {date.number}
                    </Text>
                    <Text style={[styles.dateMonth, isSelected && styles.selectedDateText]}>
                      {date.month}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
        </View>

        {/* Showtime Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Available Showtimes</Text>
          <Text style={styles.sectionDescription}>Select your preferred screening time.</Text>

          {SHOWTIMES.map((showtime) => {
            const isSelected = selectedShowtime?.id === showtime.id;
            const available = TOTAL_SEATS - takenByShowtime[showtime.id].size;
            const isFull = available === 0;

            return (
              <TouchableOpacity
                key={showtime.id}
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
                    <Text style={styles.showtimeTime}>{showtime.time}</Text>
                    <Text style={styles.showtimeAvailability}>
                      {isFull ? 'No seats available' : `${available} seats available`}
                    </Text>
                  </View>
                </View>

                <View
                  style={[
                    styles.statusBadge,
                    isFull ? styles.fullBadge : styles.availableBadge,
                  ]}
                >
                  <Text style={[styles.statusText, isFull && styles.fullStatusText]}>
                    {isFull ? 'FULL' : 'AVAILABLE'}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Seat Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Choose Your Seats</Text>
          <Text style={styles.sectionDescription}>
            Tap seats to select them. Up to {MAX_SEATS} seats per reservation.
          </Text>

          {selectedShowtime ? (
            <View style={styles.seatCard}>
              {/* Screen */}
              <View style={styles.screenWrap}>
                <View style={styles.screenCurve} />
                <Text style={styles.screenLabel}>SCREEN</Text>
              </View>

              {/* Seat grid */}
              <View style={styles.seatGrid}>
                {ROWS.map((row) => (
                  <View key={row} style={styles.seatRow}>
                    <Text style={styles.rowLabel}>{row}</Text>

                    <View style={styles.seatsContainer}>
                      {Array.from({ length: COLS }, (_, i) => i + 1).map((col) => (
                        <React.Fragment key={`${row}${col}`}>
                          {renderSeat(row, col)}
                          {col === AISLE_AFTER && <View style={styles.aisle} />}
                        </React.Fragment>
                      ))}
                    </View>

                    <Text style={styles.rowLabel}>{row}</Text>
                  </View>
                ))}
              </View>

              {/* Legend */}
              <View style={styles.legend}>
                <View style={styles.legendItem}>
                  <View style={[styles.legendSwatch, styles.seat]} />
                  <Text style={styles.legendText}>Available</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendSwatch, styles.seat, styles.seatSelected]} />
                  <Text style={styles.legendText}>Selected</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendSwatch, styles.seat, styles.seatTaken]} />
                  <Text style={styles.legendText}>Taken</Text>
                </View>
              </View>

              {/* Selected seats chip row */}
              <View style={styles.selectedSeatsBar}>
                <Text style={styles.selectedSeatsLabel}>
                  {selectedSeats.length === 0
                    ? 'No seats selected'
                    : `${selectedSeats.length} seat${selectedSeats.length > 1 ? 's' : ''} selected`}
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
                        <Ionicons name="close" size={13} color="#7652A5" />
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            </View>
          ) : (
            <View style={styles.seatPlaceholder}>
              <Ionicons name="grid-outline" size={30} color="#A99BC0" />
              <Text style={styles.seatPlaceholderText}>
                Select a showtime to see available seats.
              </Text>
            </View>
          )}
        </View>

        {/* Reservation Summary */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Reservation Summary</Text>

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Movie</Text>
            <Text style={styles.summaryValue}>{selectedMovie.title}</Text>
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
            <Text style={styles.summaryValue}>{selectedShowtime?.time || 'Not selected'}</Text>
          </View>

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Seats</Text>
            <Text style={styles.summaryValue}>
              {sortedSeats.length > 0 ? sortedSeats.join(', ') : 'Not selected'}
            </Text>
          </View>

          <View style={styles.noPaymentNotice}>
            <Ionicons name="information-circle-outline" size={20} color="#7652A5" />
            <Text style={styles.noPaymentText}>
              This is a free reservation. No payment is required.
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.reserveButton, !canReserve && styles.disabledButton]}
            onPress={handleReserve}
          >
            <Text style={styles.reserveButtonText}>Reserve Seats</Text>
            <Ionicons name="arrow-forward" size={21} color="#FFFFFF" />
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

            <Text style={styles.confirmationTitle}>Reservation Submitted!</Text>

            <Text style={styles.confirmationDescription}>
              Your movie screening reservation has been prepared.
            </Text>

            <View style={styles.confirmationDetails}>
              <Text style={styles.confirmationLabel}>Reservation Code</Text>
              <Text style={styles.confirmationCode}>{reservationCode}</Text>

              <Text style={styles.confirmationLabel}>Movie</Text>
              <Text style={styles.confirmationValue}>{selectedMovie.title}</Text>

              <Text style={styles.confirmationLabel}>Schedule</Text>
              <Text style={styles.confirmationValue}>
                {selectedDateInfo?.month} {selectedDateInfo?.number} · {selectedShowtime?.time}
              </Text>

              <Text style={styles.confirmationLabel}>Seats</Text>
              <Text style={styles.confirmationValue}>{sortedSeats.join(', ')}</Text>
            </View>

            <Text style={styles.pendingNote}>
              Demo only: this confirmation is not yet saved to the server.
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
  bannerTitle: { color: '#FFFFFF', fontSize: 23, fontWeight: '800', marginBottom: 8 },
  bannerDescription: { color: '#F0EAF8', fontSize: 14, lineHeight: 21 },
  section: { marginBottom: 28 },
  sectionTitle: { fontSize: 21, fontWeight: '800', color: '#29252E' },
  sectionDescription: { fontSize: 14, color: '#77717E', marginTop: 5, marginBottom: 15 },

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
  selectedMovieCard: { borderColor: '#7652A5', backgroundColor: '#FCFAFF' },
  moviePoster: {
    width: 76,
    height: 105,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  posterLabel: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
    marginTop: 7,
    letterSpacing: 1,
  },
  movieInfo: { flex: 1, paddingHorizontal: 12 },
  movieTitle: { color: '#29252E', fontSize: 16, fontWeight: '800' },
  movieMeta: { color: '#7652A5', fontSize: 12, fontWeight: '700', marginTop: 5 },
  movieDescription: { color: '#77717E', fontSize: 12, lineHeight: 17, marginTop: 6 },
  rating: { color: '#55505B', fontSize: 11, fontWeight: '700', marginTop: 7 },

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
  selectedDateCard: { backgroundColor: '#7652A5', borderColor: '#7652A5' },
  dateDay: { color: '#77717E', fontSize: 12, fontWeight: '600' },
  dateNumber: { color: '#29252E', fontSize: 25, fontWeight: '800', marginVertical: 2 },
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
  selectedShowtimeCard: { borderColor: '#7652A5', backgroundColor: '#FCFAFF' },
  fullShowtimeCard: { opacity: 0.6 },
  showtimeLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  showtimeTime: { color: '#29252E', fontSize: 16, fontWeight: '800' },
  showtimeAvailability: { color: '#77717E', fontSize: 12, marginTop: 4 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8 },
  availableBadge: { backgroundColor: '#E4F4E9' },
  fullBadge: { backgroundColor: '#FCE8E8' },
  statusText: { color: '#287B48', fontSize: 10, fontWeight: '800' },
  fullStatusText: { color: '#B04444' },

  // Seat map
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
  seatsContainer: { flexDirection: 'row', alignItems: 'center', gap: 6 },
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
  seatTaken: { backgroundColor: '#ECE9F0', borderColor: '#ECE9F0' },
  seatSelected: { backgroundColor: '#7652A5', borderColor: '#7652A5' },
  seatSelectedText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
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

  // Summary
  summaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 19,
    marginBottom: 20,
  },
  summaryTitle: { color: '#29252E', fontSize: 19, fontWeight: '800', marginBottom: 18 },
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
  reserveButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  footerNote: {
    textAlign: 'center',
    color: '#88828E',
    fontSize: 12,
    lineHeight: 18,
    paddingHorizontal: 15,
  },

  // Confirmation
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
  confirmationCode: { color: '#7652A5', fontSize: 21, fontWeight: '800', marginTop: 4 },
  confirmationValue: { color: '#29252E', fontSize: 15, fontWeight: '700', marginTop: 3 },
  pendingNote: {
    color: '#9A6A30',
    backgroundColor: '#FFF3E2',
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
  doneButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
});