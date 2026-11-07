import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  StatusBar,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  RefreshControl,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useAuth } from '../context/AuthContext';

const C = {
  bg: '#F6F8F2',
  card: '#FFFFFF',
  ink: '#132018',
  muted: '#71857A',
  primary: '#1F5C3E',
  dark: '#0F3323',
  soft: '#DCEFE3',
  gold: '#C4892E',
  goldSoft: '#FBF0DA',
  line: '#DCE7D8',
  danger: '#B3432E',
  dangerSoft: '#FDECEA',
  inkSoft: '#3E5246',
};

function getBaseUrl() {
  const hostUri =
    Constants.expoConfig?.hostUri ||
    (Constants as any).manifest2?.extra?.expoClient?.hostUri ||
    '';

  const lanHost = hostUri.split(':')[0];
  const hasLan = /^\d{1,3}(\.\d{1,3}){3}$/.test(lanHost);
  const env = process.env.EXPO_PUBLIC_API_URL?.trim();

  if (env) {
    if (env.includes('localhost') || env.includes('127.0.0.1')) {
      if (hasLan) {
        return env.replace('localhost', lanHost).replace('127.0.0.1', lanHost);
      }
      if (Platform.OS === 'android') {
        return env
          .replace('localhost', '10.0.2.2')
          .replace('127.0.0.1', '10.0.2.2');
      }
    }
    return env;
  }

  if (hasLan) return `http://${lanHost}:5000`;
  if (Platform.OS === 'android') return 'http://10.0.2.2:5000';
  return 'http://localhost:5000';
}

const API = getBaseUrl();

type Movie = {
  id: string;
  title: string;
  description?: string;
  poster_url?: string;
  age_rating?: string;
  is_active?: boolean;
};

type Screening = {
  id: string;
  movie_id: string;
  movie_title?: string;
  screening_date: string;
  screening_time: string;
  capacity: number;
  available_slots?: number;
  remaining_slots?: number;
  is_active?: boolean;
};

type Reservation = {
  id: string;
  screening_id: string;
  user_id: number;
  attendee_count: number;
  status: string;
  confirmation_code: string;
  movie_title?: string;
  screening_date?: string;
  screening_time?: string;
  first_name?: string;
  last_name?: string;
  applicant_name?: string;
};

async function apiRequest(path: string, options: RequestInit = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    };

    if (options.body) headers['Content-Type'] = 'application/json';

    const response = await fetch(`${API}${path}`, {
      ...options,
      signal: controller.signal,
      headers,
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        data.message || data.error || `Request failed (${response.status})`,
      );
    }

    return data;
  } catch (error: any) {
    if (error.name === 'AbortError') {
      throw new Error(`Request timed out: ${path}`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function getArray(data: any, key: string): any[] {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.[key])) return data[key];
  return [];
}

function formatTime(value?: string) {
  if (!value) return 'Time not set';
  return value.slice(0, 5);
}

function showMessage(title: string, message: string) {
  if (Platform.OS === 'web') {
    window.alert(`${title}\n\n${message}`);
  } else {
    Alert.alert(title, message);
  }
}

function formatDateForBackend(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDateForDisplay(date: string) {
  if (!date) return 'Select screening date';

  const parsed = new Date(
    /^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T00:00:00` : date,
  );
  if (Number.isNaN(parsed.getTime())) return date.slice(0, 10);

  return parsed.toLocaleDateString('en-PH', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function convertTimeTo24Hour(
  hour: string,
  minute: string,
  period: 'AM' | 'PM',
) {
  let hours = Number(hour);

  if (period === 'PM' && hours !== 12) hours += 12;
  if (period === 'AM' && hours === 12) hours = 0;

  return `${String(hours).padStart(2, '0')}:${minute}`;
}

function formatTimeForDisplay(time: string) {
  if (!time) return 'Select screening time';

  const [hours, minutes] = time.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 || 12;

  return `${String(hour12).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${period}`;
}

export default function AdminMovieCenter() {
  const router = useRouter();
  const { user } = useAuth();

  const userId = user?.id;
  const role = String(user?.role ?? '').toLowerCase();

  const isFullAdmin = ['osca admin', 'super admin'].includes(role);
  const canManageScreenings = isFullAdmin || role === 'osca staff';
  const canManageReservations = canManageScreenings;
  const isReadOnly = ['med admin', 'health center'].includes(role);

  const [movies, setMovies] = useState<Movie[]>([]);
  const [screenings, setScreenings] = useState<Screening[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [activeSection, setActiveSection] = useState<
    'movies' | 'screenings' | 'reservations'
  >('movies');

  // Movie form
  const [movieTitle, setMovieTitle] = useState('');
  const [movieDescription, setMovieDescription] = useState('');
  const [posterUrl, setPosterUrl] = useState('');
  const [ageRating, setAgeRating] = useState('General');

  // Screening form
  const [selectedMovie, setSelectedMovie] = useState('');
  const [screeningDate, setScreeningDate] = useState('');
  const [screeningTime, setScreeningTime] = useState('');
  const [capacity, setCapacity] = useState('20');

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [datePickerValue, setDatePickerValue] = useState(new Date());
  const [timeHour, setTimeHour] = useState('09');
  const [timeMinute, setTimeMinute] = useState('00');
  const [timePeriod, setTimePeriod] = useState<'AM' | 'PM'>('AM');

  const loadData = useCallback(async (showLoader = true) => {
    console.log('[Movie Center] API base:', API);

    if (!userId) {
      setLoading(false);
      return;
    }

    if (showLoader) setLoading(true);

    const query = `user_id=${encodeURIComponent(String(userId))}`;

    try {
      const [movieData, screeningData, reservationData] = await Promise.all([
        apiRequest(`/api/movie-center/movies?${query}`),
        apiRequest(`/api/movie-center/screenings?${query}`),
        apiRequest(`/api/movie-center/reservations?${query}`),
      ]);

      setMovies(getArray(movieData, 'movies'));
      setScreenings(getArray(screeningData, 'screenings'));
      setReservations(getArray(reservationData, 'reservations'));
    } catch (error: any) {
      console.error('[Movie Center] Loading failed:', error);
      showMessage('Unable to load Movie Center', error.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const refresh = () => {
    setRefreshing(true);
    loadData(false);
  };

  const saveMovie = async () => {
    if (!movieTitle.trim()) {
      showMessage('Required field', 'Please enter the movie title.');
      return;
    }

    setSaving(true);

    try {
      await apiRequest('/api/movie-center/movies', {
        method: 'POST',
        body: JSON.stringify({
          user_id: userId,
          title: movieTitle.trim(),
          description: movieDescription.trim(),
          poster_url: posterUrl.trim(),
          age_rating: ageRating.trim() || 'General',
          is_active: true,
        }),
      });

      setMovieTitle('');
      setMovieDescription('');
      setPosterUrl('');
      setAgeRating('General');

      showMessage('Success', 'Movie added successfully.');
      await loadData(false);
    } catch (error: any) {
      showMessage('Could not add movie', error.message);
    } finally {
      setSaving(false);
    }
  };

  const archiveMovie = (movie: Movie) => {
    if (Platform.OS === 'web') {
      const confirmed = window.confirm(
        `Are you sure you want to archive "${movie.title}"?`,
      );
      if (!confirmed) return;

      (async () => {
        try {
          await apiRequest(`/api/movie-center/movies/${movie.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ user_id: userId, is_active: false }),
          });
          await loadData(false);
        } catch (error: any) {
          showMessage('Could not archive movie', error.message);
        }
      })();
      return;
    }

    Alert.alert(
      'Archive movie',
      `Are you sure you want to archive "${movie.title}"?`,
      [
        { text: 'Keep movie', style: 'cancel' },
        {
          text: 'Archive',
          style: 'destructive',
          onPress: async () => {
            try {
              await apiRequest(`/api/movie-center/movies/${movie.id}`, {
                method: 'PATCH',
                body: JSON.stringify({ user_id: userId, is_active: false }),
              });
              await loadData(false);
            } catch (error: any) {
              showMessage('Could not archive movie', error.message);
            }
          },
        },
      ],
    );
  };

  const openTimePicker = () => {
    if (screeningTime) {
      const [hours, minutes] = screeningTime.split(':').map(Number);
      setTimeHour(String(hours % 12 || 12).padStart(2, '0'));
      setTimeMinute(String(minutes).padStart(2, '0'));
      setTimePeriod(hours >= 12 ? 'PM' : 'AM');
    }
    setShowTimePicker((previous) => !previous);
  };

  const confirmTime = () => {
    setScreeningTime(
      convertTimeTo24Hour(timeHour, timeMinute, timePeriod),
    );
    setShowTimePicker(false);
  };

  const saveScreening = async () => {
    if (!userId) {
      showMessage('Error', 'User session is not ready.');
      return;
    }

    if (!selectedMovie || !screeningDate || !screeningTime) {
      showMessage(
        'Incomplete information',
        'Please select a movie, date, and time.',
      );
      return;
    }

    const dateMatch = screeningDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!dateMatch) {
      showMessage('Invalid date', 'Please select a valid screening date.');
      return;
    }

    const [, year, month, day] = dateMatch;
    const parsedDate = new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
    );

    if (
      parsedDate.getFullYear() !== Number(year) ||
      parsedDate.getMonth() !== Number(month) - 1 ||
      parsedDate.getDate() !== Number(day)
    ) {
      showMessage('Invalid date', 'Please select a valid screening date.');
      return;
    }

    if (!/^\d{2}:\d{2}$/.test(screeningTime)) {
      showMessage('Invalid time', 'Please select a valid screening time.');
      return;
    }

    const parsedCapacity = Number(capacity);
    if (!Number.isInteger(parsedCapacity) || parsedCapacity < 1) {
      showMessage('Invalid capacity', 'Capacity must be at least 1.');
      return;
    }

    setSaving(true);

    try {
      const response = await apiRequest('/api/movie-center/screenings', {
        method: 'POST',
        body: JSON.stringify({
          user_id: userId,
          movie_id: selectedMovie,
          screening_date: screeningDate,
          screening_time: screeningTime,
          capacity: parsedCapacity,
        }),
      });

      console.log('[Screening] Created:', response);

      setScreeningDate('');
      setScreeningTime('');
      setCapacity('20');
      setDatePickerValue(new Date());
      setTimeHour('09');
      setTimeMinute('00');
      setTimePeriod('AM');

      showMessage('Success', 'Screening created successfully.');
      await loadData(false);
    } catch (error: any) {
      console.error('[Screening] Error:', error);
      showMessage('Could not create screening', error.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleScreening = async (screening: Screening) => {
    try {
      await apiRequest(`/api/movie-center/screenings/${screening.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          user_id: userId,
          is_active: !screening.is_active,
        }),
      });
      await loadData(false);
    } catch (error: any) {
      showMessage('Could not update screening', error.message);
    }
  };

  const updateReservation = (reservation: Reservation, status: string) => {
    const performUpdate = async () => {
      try {
        await apiRequest(
          `/api/movie-center/reservations/${reservation.id}`,
          {
            method: 'PATCH',
            body: JSON.stringify({ user_id: userId, status }),
          },
        );
        await loadData(false);
      } catch (error: any) {
        showMessage('Could not update reservation', error.message);
      }
    };

    if (Platform.OS === 'web') {
      if (
        window.confirm(
          `Change reservation ${reservation.confirmation_code} to ${status.toLowerCase()}?`,
        )
      ) {
        performUpdate();
      }
      return;
    }

    Alert.alert(
      'Update reservation',
      `Change reservation ${reservation.confirmation_code} to ${status.toLowerCase()}?`,
      [
        { text: 'Back', style: 'cancel' },
        { text: 'Confirm', onPress: performUpdate },
      ],
    );
  };

  const sections = [
    ...(isFullAdmin
      ? [{ key: 'movies' as const, label: 'Movies', icon: 'film-outline' }]
      : []),
    ...(canManageScreenings || isReadOnly
      ? [{ key: 'screenings' as const, label: 'Screenings', icon: 'calendar-outline' }]
      : []),
    ...(canManageReservations || isReadOnly
      ? [{ key: 'reservations' as const, label: 'Reservations', icon: 'ticket-outline' }]
      : []),
  ];

  useEffect(() => {
    if (
      sections.length &&
      !sections.some((section) => section.key === activeSection)
    ) {
      setActiveSection(sections[0].key);
    }
  }, [role, activeSection]);

  const activeMovies = movies.filter((movie) => movie.is_active !== false);

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />

      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Ionicons name="arrow-back" size={22} color={C.dark} />
          </TouchableOpacity>

          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>AUREA ADMINISTRATION</Text>
            <Text style={styles.title}>Movie Center</Text>
            <Text style={styles.subtitle}>
              Movies, screenings and reservations
            </Text>
          </View>
        </View>

        <LinearGradient colors={[C.primary, C.dark]} style={styles.banner}>
          <Ionicons name="film" size={30} color="#FFFFFF" />
          <View style={{ flex: 1 }}>
            <Text style={styles.bannerTitle}>Community Movie Center</Text>
            <Text style={styles.bannerText}>
              Manage movie schedules and monitor senior citizen reservations.
            </Text>
          </View>
        </LinearGradient>

        <View style={styles.stats}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{activeMovies.length}</Text>
            <Text style={styles.statLabel}>Active movies</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>
              {screenings.filter((item) => item.is_active !== false).length}
            </Text>
            <Text style={styles.statLabel}>Screenings</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>
              {reservations.filter((item) => item.status !== 'Cancelled').length}
            </Text>
            <Text style={styles.statLabel}>Reservations</Text>
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Management</Text>
          <Text style={styles.sectionCaption}>
            {isReadOnly ? 'Read-only access' : 'Manage Movie Center services'}
          </Text>
        </View>

        <View style={styles.tabs}>
          {sections.map((section) => (
            <TouchableOpacity
              key={section.key}
              style={[
                styles.tab,
                activeSection === section.key && styles.tabActive,
              ]}
              onPress={() => setActiveSection(section.key)}
            >
              <Ionicons
                name={section.icon as any}
                size={17}
                color={activeSection === section.key ? '#FFFFFF' : C.dark}
              />
              <Text
                style={[
                  styles.tabText,
                  activeSection === section.key && styles.tabTextActive,
                ]}
              >
                {section.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {loading ? (
          <ActivityIndicator
            size="large"
            color={C.primary}
            style={{ marginVertical: 50 }}
          />
        ) : (
          <>
            {/* MOVIES */}
            {activeSection === 'movies' && isFullAdmin && (
              <>
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Add a movie</Text>

                  <Text style={styles.label}>Movie title *</Text>
                  <TextInput
                    value={movieTitle}
                    onChangeText={setMovieTitle}
                    placeholder="Enter movie title"
                    placeholderTextColor={C.muted}
                    style={styles.input}
                  />

                  <Text style={styles.label}>Description</Text>
                  <TextInput
                    value={movieDescription}
                    onChangeText={setMovieDescription}
                    placeholder="Movie description"
                    placeholderTextColor={C.muted}
                    style={[styles.input, styles.multiline]}
                    multiline
                  />

                  <Text style={styles.label}>Poster image URL</Text>
                  <TextInput
                    value={posterUrl}
                    onChangeText={setPosterUrl}
                    placeholder="https://..."
                    placeholderTextColor={C.muted}
                    style={styles.input}
                    autoCapitalize="none"
                  />

                  <Text style={styles.label}>Age rating</Text>
                  <View style={styles.choiceRow}>
                    {['General', 'PG', 'R-13', 'R-16', 'R-18'].map((rating) => (
                      <TouchableOpacity
                        key={rating}
                        style={[
                          styles.choice,
                          ageRating === rating && styles.choiceActive,
                        ]}
                        onPress={() => setAgeRating(rating)}
                      >
                        <Text
                          style={[
                            styles.choiceText,
                            ageRating === rating && styles.choiceTextActive,
                          ]}
                        >
                          {rating}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <TouchableOpacity
                    style={styles.primaryButton}
                    onPress={saveMovie}
                    disabled={saving}
                  >
                    {saving ? (
                      <ActivityIndicator color="#FFFFFF" />
                    ) : (
                      <>
                        <Ionicons
                          name="add-circle-outline"
                          size={19}
                          color="#FFFFFF"
                        />
                        <Text style={styles.primaryButtonText}>Add movie</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>

                <Text style={styles.listHeading}>Movie library</Text>

                {movies.length === 0 ? (
                  <Text style={styles.empty}>No movies added yet.</Text>
                ) : (
                  movies.map((movie) => (
                    <View key={movie.id} style={styles.itemCard}>
                      <View style={styles.itemIcon}>
                        <Ionicons
                          name="film-outline"
                          size={24}
                          color={C.primary}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.itemTitle}>{movie.title}</Text>
                        <Text style={styles.itemSub}>
                          {movie.age_rating || 'General'} ·{' '}
                          {movie.is_active === false ? 'Archived' : 'Active'}
                        </Text>
                        {!!movie.description && (
                          <Text
                            style={styles.itemDescription}
                            numberOfLines={2}
                          >
                            {movie.description}
                          </Text>
                        )}
                      </View>
                      {movie.is_active !== false && (
                        <TouchableOpacity
                          style={styles.iconButton}
                          onPress={() => archiveMovie(movie)}
                        >
                          <Ionicons
                            name="archive-outline"
                            size={20}
                            color={C.danger}
                          />
                        </TouchableOpacity>
                      )}
                    </View>
                  ))
                )}
              </>
            )}

            {/* SCREENINGS */}
            {activeSection === 'screenings' && (
              <>
                {canManageScreenings && (
                  <View style={styles.card}>
                    <Text style={styles.cardTitle}>Create a screening</Text>

                    <Text style={styles.label}>Select movie *</Text>
                    {activeMovies.length === 0 ? (
                      <Text style={styles.empty}>
                        Add an active movie first.
                      </Text>
                    ) : (
                      <View style={styles.movieChoices}>
                        {activeMovies.map((movie) => (
                          <TouchableOpacity
                            key={movie.id}
                            style={[
                              styles.movieChoice,
                              selectedMovie === movie.id &&
                                styles.movieChoiceActive,
                            ]}
                            onPress={() => setSelectedMovie(movie.id)}
                          >
                            <Ionicons
                              name={
                                selectedMovie === movie.id
                                  ? 'radio-button-on'
                                  : 'radio-button-off'
                              }
                              size={18}
                              color={
                                selectedMovie === movie.id
                                  ? C.primary
                                  : C.muted
                              }
                            />
                            <Text style={styles.movieChoiceText}>
                              {movie.title}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}

                    {/* DATE PICKER */}
                    <Text style={styles.label}>Screening date *</Text>
                    {Platform.OS === 'web' ? (
                      <TextInput
                        value={screeningDate}
                        onChangeText={setScreeningDate}
                        placeholder="YYYY-MM-DD"
                        placeholderTextColor={C.muted}
                        style={styles.input}
                        keyboardType="numbers-and-punctuation"
                      />
                    ) : (
                      <TouchableOpacity
                        style={styles.pickerInput}
                        onPress={() => setShowDatePicker(true)}
                        activeOpacity={0.7}
                      >
                        <Text
                          style={{
                            color: screeningDate ? C.ink : C.muted,
                            fontSize: 14,
                          }}
                        >
                          {screeningDate
                            ? formatDateForDisplay(screeningDate)
                            : 'Select screening date'}
                        </Text>
                        <Ionicons
                          name="calendar-outline"
                          size={20}
                          color={C.primary}
                        />
                      </TouchableOpacity>
                    )}

                    {Platform.OS !== 'web' && showDatePicker && (
                      <DateTimePicker
                        value={datePickerValue}
                        mode="date"
                        display={
                          Platform.OS === 'ios' ? 'spinner' : 'default'
                        }
                        minimumDate={new Date()}
                        onChange={(event, selectedDate) => {
                          if (Platform.OS !== 'ios') {
                            setShowDatePicker(false);
                          }
                          if (event.type === 'dismissed') return;
                          if (selectedDate) {
                            setDatePickerValue(selectedDate);
                            setScreeningDate(
                              formatDateForBackend(selectedDate),
                            );
                          }
                        }}
                      />
                    )}

                    {Platform.OS === 'ios' && showDatePicker && (
                      <TouchableOpacity
                        style={styles.pickerDoneButton}
                        onPress={() => setShowDatePicker(false)}
                      >
                        <Text style={styles.pickerDoneText}>Done</Text>
                      </TouchableOpacity>
                    )}

                    {/* TIME PICKER */}
                    <Text style={styles.label}>Screening time *</Text>
                    <TouchableOpacity
                      style={styles.pickerInput}
                      onPress={() =>
                        setShowTimePicker((previous) => !previous)
                      }
                      activeOpacity={0.7}
                    >
                      <Text
                        style={{
                          color: screeningTime ? C.ink : C.muted,
                          fontSize: 14,
                        }}
                      >
                        {screeningTime
                          ? formatTimeForDisplay(screeningTime)
                          : 'Select screening time'}
                      </Text>
                      <Ionicons
                        name="time-outline"
                        size={20}
                        color={C.primary}
                      />
                    </TouchableOpacity>

                    {showTimePicker && (
                      <View style={styles.timePickerContainer}>
                        <Text style={styles.timePickerTitle}>
                          Choose screening time
                        </Text>

                        <View style={styles.timePickerColumns}>
                          <View style={styles.timeColumn}>
                            <Text style={styles.timeColumnLabel}>HOUR</Text>
                            <ScrollView
                              style={styles.timeScroll}
                              nestedScrollEnabled
                              showsVerticalScrollIndicator
                            >
                              {Array.from({ length: 12 }, (_, i) =>
                                String(i + 1).padStart(2, '0'),
                              ).map((hour) => (
                                <TouchableOpacity
                                  key={hour}
                                  style={[
                                    styles.timeOption,
                                    timeHour === hour &&
                                      styles.timeOptionActive,
                                  ]}
                                  onPress={() => setTimeHour(hour)}
                                >
                                  <Text
                                    style={[
                                      styles.timeOptionText,
                                      timeHour === hour &&
                                        styles.timeOptionTextActive,
                                    ]}
                                  >
                                    {hour}
                                  </Text>
                                </TouchableOpacity>
                              ))}
                            </ScrollView>
                          </View>

                          <View style={styles.timeColumn}>
                            <Text style={styles.timeColumnLabel}>MINUTE</Text>
                            <ScrollView
                              style={styles.timeScroll}
                              nestedScrollEnabled
                              showsVerticalScrollIndicator
                            >
                              {Array.from({ length: 60 }, (_, i) =>
                                String(i).padStart(2, '0'),
                              ).map((minute) => (
                                <TouchableOpacity
                                  key={minute}
                                  style={[
                                    styles.timeOption,
                                    timeMinute === minute &&
                                      styles.timeOptionActive,
                                  ]}
                                  onPress={() => setTimeMinute(minute)}
                                >
                                  <Text
                                    style={[
                                      styles.timeOptionText,
                                      timeMinute === minute &&
                                        styles.timeOptionTextActive,
                                    ]}
                                  >
                                    {minute}
                                  </Text>
                                </TouchableOpacity>
                              ))}
                            </ScrollView>
                          </View>

                          <View style={styles.timeColumn}>
                            <Text style={styles.timeColumnLabel}>PERIOD</Text>
                            {(['AM', 'PM'] as const).map((period) => (
                              <TouchableOpacity
                                key={period}
                                style={[
                                  styles.timeOption,
                                  timePeriod === period &&
                                    styles.timeOptionActive,
                                ]}
                                onPress={() => setTimePeriod(period)}
                              >
                                <Text
                                  style={[
                                    styles.timeOptionText,
                                    timePeriod === period &&
                                      styles.timeOptionTextActive,
                                  ]}
                                >
                                  {period}
                                </Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        </View>

                        <Text style={styles.selectedTimePreview}>
                          Selected: {timeHour}:{timeMinute} {timePeriod}
                        </Text>

                        <View style={styles.timePickerActions}>
                          <TouchableOpacity
                            style={styles.timeCancelButton}
                            onPress={() => setShowTimePicker(false)}
                          >
                            <Text style={styles.timeCancelText}>Cancel</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={styles.timeConfirmButton}
                            onPress={confirmTime}
                          >
                            <Text style={styles.timeConfirmText}>
                              Confirm time
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    )}

                    <Text style={styles.label}>Seat capacity *</Text>
                    <TextInput
                      value={capacity}
                      onChangeText={setCapacity}
                      placeholder="20"
                      placeholderTextColor={C.muted}
                      style={styles.input}
                      keyboardType="number-pad"
                    />

                    <TouchableOpacity
                      style={[
                        styles.primaryButton,
                        (saving || activeMovies.length === 0) &&
                          styles.primaryButtonDisabled,
                      ]}
                      onPress={saveScreening}
                      disabled={saving || activeMovies.length === 0}
                    >
                      {saving ? (
                        <ActivityIndicator color="#FFFFFF" />
                      ) : (
                        <>
                          <Ionicons
                            name="calendar-outline"
                            size={19}
                            color="#FFFFFF"
                          />
                          <Text style={styles.primaryButtonText}>
                            Create screening
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                )}

                <Text style={styles.listHeading}>Screening schedules</Text>

                {screenings.length === 0 ? (
                  <Text style={styles.empty}>No screenings available.</Text>
                ) : (
                  screenings.map((screening) => {
                    const remaining =
                      screening.available_slots ??
                      screening.remaining_slots;

                    return (
                      <View key={screening.id} style={styles.itemCard}>
                        <View style={styles.itemIcon}>
                          <Ionicons
                            name="calendar"
                            size={23}
                            color={C.primary}
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.itemTitle}>
                            {screening.movie_title ||
                              movies.find(
                                (movie) => movie.id === screening.movie_id,
                              )?.title ||
                              'Movie screening'}
                          </Text>
                          <Text style={styles.itemSub}>
                            {formatDateForDisplay(screening.screening_date)} ·{' '}
                            {formatTime(screening.screening_time)}
                          </Text>
                          <Text style={styles.itemDescription}>
                            Capacity: {screening.capacity}
                            {remaining !== undefined
                              ? ` · Remaining: ${remaining}`
                              : ''}
                          </Text>
                          <Text
                            style={[
                              styles.statusText,
                              screening.is_active === false && {
                                color: C.danger,
                              },
                            ]}
                          >
                            {screening.is_active === false
                              ? 'Inactive'
                              : 'Active'}
                          </Text>
                        </View>

                        {canManageScreenings && (
                          <TouchableOpacity
                            style={styles.iconButton}
                            onPress={() => toggleScreening(screening)}
                          >
                            <Ionicons
                              name={
                                screening.is_active === false
                                  ? 'play-circle-outline'
                                  : 'pause-circle-outline'
                              }
                              size={23}
                              color={C.primary}
                            />
                          </TouchableOpacity>
                        )}
                      </View>
                    );
                  })
                )}
              </>
            )}

            {/* RESERVATIONS */}
            {activeSection === 'reservations' && (
              <>
                <Text style={styles.listHeading}>Reservation records</Text>

                {reservations.length === 0 ? (
                  <Text style={styles.empty}>No reservations found.</Text>
                ) : (
                  reservations.map((reservation) => (
                    <View key={reservation.id} style={styles.itemCard}>
                      <View style={styles.itemIcon}>
                        <Ionicons
                          name="ticket-outline"
                          size={23}
                          color={C.primary}
                        />
                      </View>

                      <View style={{ flex: 1 }}>
                        <Text style={styles.itemTitle}>
                          {reservation.movie_title || 'Movie reservation'}
                        </Text>
                        <Text style={styles.itemSub}>
                          {reservation.applicant_name ||
                            [
                              reservation.first_name,
                              reservation.last_name,
                            ]
                              .filter(Boolean)
                              .join(' ') ||
                            `User #${reservation.user_id}`}
                        </Text>
                        <Text style={styles.itemDescription}>
                          {reservation.screening_date || 'Date not available'}
                          {reservation.screening_time
                            ? ` · ${formatTime(reservation.screening_time)}`
                            : ''}
                        </Text>
                        <Text style={styles.itemDescription}>
                          Attendees: {reservation.attendee_count}
                        </Text>
                        <Text style={styles.code}>
                          Code: {reservation.confirmation_code}
                        </Text>
                        <Text
                          style={[
                            styles.statusText,
                            reservation.status === 'Cancelled' && {
                              color: C.danger,
                            },
                          ]}
                        >
                          {reservation.status}
                        </Text>

                        {canManageReservations &&
                          reservation.status !== 'Cancelled' && (
                            <View style={styles.reservationActions}>
                              {reservation.status === 'Pending' && (
                                <TouchableOpacity
                                  style={styles.smallPrimary}
                                  onPress={() =>
                                    updateReservation(reservation, 'Confirmed')
                                  }
                                >
                                  <Text style={styles.smallPrimaryText}>
                                    Confirm
                                  </Text>
                                </TouchableOpacity>
                              )}
                              <TouchableOpacity
                                style={styles.smallDanger}
                                onPress={() =>
                                  updateReservation(reservation, 'Cancelled')
                                }
                              >
                                <Text style={styles.smallDangerText}>
                                  Cancel
                                </Text>
                              </TouchableOpacity>
                            </View>
                          )}
                      </View>
                    </View>
                  ))
                )}
              </>
            )}
          </>
        )}

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            AUREA · Municipality of Pateros
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  container: { padding: 20, paddingBottom: 50 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    marginBottom: 22,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: C.gold,
  },
  title: { fontSize: 25, fontWeight: '800', color: C.ink },
  subtitle: { fontSize: 12, color: C.muted, marginTop: 2 },

  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 15,
    padding: 20,
    borderRadius: 18,
    marginBottom: 18,
  },
  bannerTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '800' },
  bannerText: {
    color: '#E4F1E8',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },

  stats: { flexDirection: 'row', gap: 9, marginBottom: 25 },
  statCard: {
    flex: 1,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 14,
    padding: 13,
  },
  statValue: { fontSize: 23, fontWeight: '800', color: C.primary },
  statLabel: { fontSize: 10, color: C.muted, marginTop: 3 },

  sectionHeader: { marginBottom: 12 },
  sectionTitle: { fontSize: 20, fontWeight: '800', color: C.ink },
  sectionCaption: { fontSize: 12, color: C.muted, marginTop: 3 },

  tabs: { flexDirection: 'row', gap: 7, marginBottom: 17 },
  tab: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 11,
    backgroundColor: C.card,
  },
  tabActive: { backgroundColor: C.dark, borderColor: C.dark },
  tabText: { fontSize: 11, fontWeight: '700', color: C.dark },
  tabTextActive: { color: '#FFFFFF' },

  card: {
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 17,
    padding: 17,
    marginBottom: 20,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: C.ink,
    marginBottom: 15,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: C.inkSoft,
    marginBottom: 7,
    marginTop: 12,
  },
  input: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: C.ink,
    backgroundColor: C.bg,
    fontSize: 14,
  },
  multiline: { minHeight: 85, textAlignVertical: 'top' },

  choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  choice: {
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 9,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  choiceActive: { backgroundColor: C.primary, borderColor: C.primary },
  choiceText: { fontSize: 12, color: C.inkSoft, fontWeight: '600' },
  choiceTextActive: { color: '#FFFFFF' },

  primaryButton: {
    backgroundColor: C.primary,
    borderRadius: 11,
    minHeight: 48,
    marginTop: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryButtonDisabled: { opacity: 0.55 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },

  movieChoices: { gap: 8 },
  movieChoice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 10,
    padding: 12,
  },
  movieChoiceActive: {
    borderColor: C.primary,
    backgroundColor: C.soft,
  },
  movieChoiceText: { color: C.ink, fontSize: 13, fontWeight: '600' },

  pickerInput: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: C.bg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pickerDoneButton: {
    alignSelf: 'flex-end',
    backgroundColor: C.primary,
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 8,
    marginTop: 8,
  },
  pickerDoneText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  timePickerContainer: {
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 12,
    padding: 14,
    marginTop: 10,
  },
  timePickerTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: C.ink,
    marginBottom: 14,
  },
  timePickerColumns: {
    flexDirection: 'row',
    gap: 10,
  },
  timeColumn: { flex: 1 },
  timeColumnLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: C.muted,
    textAlign: 'center',
    marginBottom: 8,
  },
  timeScroll: {
    height: 145,
    backgroundColor: C.card,
    borderRadius: 9,
  },
  timeOption: {
    paddingVertical: 11,
    alignItems: 'center',
    borderRadius: 7,
    marginHorizontal: 3,
  },
  timeOptionActive: { backgroundColor: C.primary },
  timeOptionText: {
    fontSize: 14,
    fontWeight: '600',
    color: C.ink,
  },
  timeOptionTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  selectedTimePreview: {
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '800',
    color: C.primary,
    marginTop: 14,
  },
  timePickerActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 15,
  },
  timeCancelButton: {
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: C.line,
  },
  timeCancelText: {
    color: C.ink,
    fontSize: 12,
    fontWeight: '700',
  },
  timeConfirmButton: {
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: C.primary,
  },
  timeConfirmText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },

  listHeading: {
    fontSize: 16,
    fontWeight: '800',
    color: C.ink,
    marginBottom: 11,
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  itemIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: C.soft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemTitle: { fontSize: 14, fontWeight: '800', color: C.ink },
  itemSub: { fontSize: 12, color: C.muted, marginTop: 4 },
  itemDescription: {
    fontSize: 11,
    color: C.inkSoft,
    marginTop: 5,
    lineHeight: 16,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '800',
    color: C.primary,
    marginTop: 6,
  },
  code: {
    fontSize: 11,
    color: C.gold,
    fontWeight: '700',
    marginTop: 6,
  },
  iconButton: { padding: 7 },
  reservationActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  smallPrimary: {
    backgroundColor: C.primary,
    borderRadius: 8,
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  smallPrimaryText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  smallDanger: {
    backgroundColor: C.dangerSoft,
    borderRadius: 8,
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  smallDangerText: { color: C.danger, fontSize: 11, fontWeight: '800' },

  empty: {
    textAlign: 'center',
    color: C.muted,
    padding: 25,
    fontSize: 13,
  },
  footer: { alignItems: 'center', marginTop: 25 },
  footerText: { color: C.muted, fontSize: 11 },
});
