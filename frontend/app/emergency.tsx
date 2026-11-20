import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Text, TextInput } from '../components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { PhysicalIdButton, usePhysicalIdStyles } from '../components/PhysicalIdControls';
import { useSettings } from '../context/SettingsContext';
import { useAuth } from '../context/AuthContext';
import { emergencyReportTime, emergencyRequest, emergencyStatus, type EmergencyReport } from '../services/emergencyApi';

type Reports = { reports: EmergencyReport[]; categories: Record<string, string> };

export default function EmergencyScreen() {
  const { user } = useAuth();
  return <EmergencyForm key={user?.id} token={user?.token} savedContact={user?.contact ?? ''} />;
}

function EmergencyForm({ token, savedContact }: { token?: string; savedContact: string }) {
  const s = usePhysicalIdStyles();
  const { colorScheme } = useSettings();
  const router = useRouter();
  const [data, setData] = useState<Reports | null>(null);
  const [refresh, setRefresh] = useState({ requested: false });
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [callError, setCallError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [submitted, setSubmitted] = useState<EmergencyReport | null>(null);
  const [category, setCategory] = useState('');
  const [location, setLocation] = useState('');
  const [contact, setContact] = useState(savedContact);
  const [description, setDescription] = useState('');
  const requestKey = useRef<string | null>(null);
  const inFlight = useRef(false);

  useFocusEffect(
    useCallback(() => {
      if (!token) return;
      const controller = new AbortController();
      setLoading(true);
      if (refresh.requested) setError('');
      emergencyRequest<Reports>(token, '', 'GET', undefined, controller.signal)
        .then((result) => {
          if (!controller.signal.aborted) setData(result);
        })
        .catch((err) => {
          if (!controller.signal.aborted) setError(err.message);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
      return () => controller.abort();
    }, [token, refresh]),
  );

  async function callEmergency() {
    setCallError('');
    try {
      await Linking.openURL('tel:911');
    } catch {
      setCallError('Buksan ang Phone app at i-dial ang 911.');
    }
  }

  async function submit() {
    if (
      !token ||
      !data ||
      loading ||
      !category ||
      !location.trim() ||
      !contact.trim() ||
      !description.trim() ||
      inFlight.current
    )
      return;
    inFlight.current = true;
    const key =
      requestKey.current ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2).padEnd(12, '0')}`;
    requestKey.current = key;
    setSubmitting(true);
    setError('');
    try {
      const result = await emergencyRequest<{ report: EmergencyReport }>(token, '', 'POST', {
        requestKey: key,
        category,
        location,
        contact,
        description,
      });
      setSubmitted(result.report);
      setData({
        ...data,
        reports: [result.report, ...data.reports.filter((item) => item.id !== result.report.id)].slice(0, 10),
      });
      setShowForm(false);
      setCategory('');
      setLocation('');
      setDescription('');
      requestKey.current = null;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Hindi ma-save ang report.');
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  const canSubmit = !!(category && location.trim() && contact.trim() && description.trim());
  return (
    <SafeAreaView style={s.screen}>
      <ScrollView
        key={submitted?.id ?? 'emergency'}
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
      >
        <PhysicalIdButton label="Bumalik" onPress={() => router.back()} secondary />
        <Text style={s.title}>Emergency</Text>
        <View style={[s.card, colorScheme === 'dark' ? styles.callCardDark : styles.callCard]}>
          <Text style={s.heading}>Kailangan ng agarang tulong?</Text>
          <Text style={s.body}>
            Tumawag muna sa 911. Para sa follow-up ng OSCA ang report sa app. Ang status nito ay tungkol sa review ng
            report.
          </Text>
          <TouchableOpacity style={styles.callButton} accessibilityRole="button" onPress={() => void callEmergency()}>
            <Ionicons name="call" size={21} color="#FFF" />
            <Text style={s.buttonText}>Tumawag sa 911</Text>
          </TouchableOpacity>
          {!!callError && (
            <Text style={s.error} accessibilityRole="alert">
              {callError}
            </Text>
          )}
        </View>
        {!token ? (
          <View style={s.card}>
            <Text style={s.body}>Mag-log in kung gusto mong mag-save at mag-track ng report sa OSCA.</Text>
            <PhysicalIdButton label="Mag-log in" onPress={() => router.push('/login')} secondary />
          </View>
        ) : (
          <>
            {submitted && (
              <Text accessibilityRole="alert" style={s.heading}>
                Na-save na ang report mo. Nasa listahan sa ibaba ang reference at status.
              </Text>
            )}
            {!!error && (
              <Text accessibilityRole="alert" style={s.error}>
                {error}
              </Text>
            )}
            {loading && <ActivityIndicator color="#B3432E" />}
            {showForm && data ? (
              <View style={s.card}>
                <Text style={s.heading}>Bagong emergency report</Text>
                <Text style={s.body}>Uri ng emergency</Text>
                {Object.entries(data.categories).map(([key, label]) => (
                  <TouchableOpacity
                    key={key}
                    style={s.choice}
                    disabled={submitting}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: category === key }}
                    onPress={() => setCategory(key)}
                  >
                    <Text style={s.body}>
                      {category === key ? '◉' : '○'} {label}
                    </Text>
                  </TouchableOpacity>
                ))}
                <TextInput
                  style={s.input}
                  value={location}
                  onChangeText={setLocation}
                  editable={!submitting}
                  maxLength={400}
                  multiline
                  accessibilityLabel="Eksaktong lokasyon"
                  placeholder="Eksaktong lokasyon at landmark"
                />
                <TextInput
                  style={s.input}
                  value={contact}
                  onChangeText={setContact}
                  editable={!submitting}
                  maxLength={60}
                  accessibilityLabel="Contact number"
                  placeholder="Contact number"
                  keyboardType="phone-pad"
                />
                <TextInput
                  style={s.input}
                  value={description}
                  onChangeText={setDescription}
                  editable={!submitting}
                  maxLength={1500}
                  multiline
                  accessibilityLabel="Detalye ng nangyari"
                  placeholder="Ano ang nangyari at ilan ang apektado?"
                />
                <PhysicalIdButton
                  label={submitting ? 'Sine-save ang report…' : 'I-submit ang report sa OSCA'}
                  disabled={!canSubmit || loading || submitting}
                  onPress={() => void submit()}
                />
              </View>
            ) : (
              data && (
                <PhysicalIdButton
                  label="Mag-fill out ng report"
                  onPress={() => {
                    setSubmitted(null);
                    setShowForm(true);
                  }}
                />
              )
            )}
            <PhysicalIdButton
              label="I-refresh ang status"
              disabled={loading || submitting}
              secondary
              onPress={() => setRefresh({ requested: true })}
            />
            {data && (
              <>
                <Text style={s.heading}>Mga recent na report</Text>
                {!data.reports.length && <Text style={s.body}>Wala pang report.</Text>}
                {data.reports.map((report) => (
                  <View key={report.id} style={s.card}>
                    <Text style={s.heading}>{data.categories[report.category] ?? 'Emergency report'}</Text>
                    <Text style={s.body}>{emergencyStatus[report.status]}</Text>
                    <Text style={s.body}>{emergencyReportTime(report.created_at)}</Text>
                    <Text selectable style={s.body}>
                      Reference · {report.id}
                    </Text>
                    {!!report.review_note && <Text style={s.body}>{report.review_note}</Text>}
                  </View>
                ))}
              </>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  callCardDark: { backgroundColor: '#382521', borderColor: '#693F36' },
  callCard: { backgroundColor: '#FFF3EF', borderColor: '#F2C7BC' },
  callButton: {
    backgroundColor: '#A43723',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    minHeight: 52,
    borderRadius: 14,
  },
});
