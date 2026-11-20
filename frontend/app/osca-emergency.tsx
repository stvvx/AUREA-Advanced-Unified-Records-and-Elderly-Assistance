import React, { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { Text, TextInput } from '../components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { PhysicalIdButton, usePhysicalIdStyles } from '../components/PhysicalIdControls';
import { useAuth } from '../context/AuthContext';
import { emergencyReportTime, emergencyRequest, emergencyStatus, type EmergencyReport } from '../services/emergencyApi';

type Detail = EmergencyReport & {
  details: { reporter: string; category: string; location: string; contact: string; description: string };
};
type Queue = { reports: EmergencyReport[]; hasMore: boolean; categories: Record<string, string> };

export default function OscaEmergencyScreen() {
  const { user } = useAuth();
  return (
    <EmergencyQueue key={user?.id} token={user?.role?.trim().toLowerCase() === 'osca admin' ? user.token : undefined} />
  );
}

function EmergencyQueue({ token }: { token?: string }) {
  const s = usePhysicalIdStyles();
  const router = useRouter();
  const [queue, setQueue] = useState<Queue | null>(null);
  const [page, setPage] = useState({ offset: 0 });
  const [selected, setSelected] = useState<Detail | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useFocusEffect(
    useCallback(() => {
      if (!token) return;
      const controller = new AbortController();
      setBusy(true);
      setError('');
      setSelected(null);
      emergencyRequest<Queue>(token, `/staff?offset=${page.offset}`, 'GET', undefined, controller.signal)
        .then((result) => {
          if (!controller.signal.aborted) setQueue(result);
        })
        .catch((err) => {
          if (!controller.signal.aborted) setError(err.message);
        })
        .finally(() => {
          if (!controller.signal.aborted) setBusy(false);
        });
      return () => controller.abort();
    }, [token, page]),
  );

  async function open(id: string) {
    if (!token || busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await emergencyRequest<{ report: Detail }>(token, `/staff/${id}`);
      setSelected(result.report);
      setNote('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Hindi mabuksan ang report.');
    } finally {
      setBusy(false);
    }
  }

  async function update(status: 'Acknowledged' | 'Closed') {
    if (!token || !selected || busy) return;
    setBusy(true);
    setError('');
    try {
      await emergencyRequest(token, `/staff/${selected.id}`, 'PATCH', { status, note });
      setSelected(null);
      setPage({ offset: 0 });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Hindi ma-update ang report.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={s.screen}>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <PhysicalIdButton
          label={selected ? 'Bumalik sa listahan' : 'Bumalik'}
          secondary
          disabled={busy}
          onPress={() => {
            if (selected) {
              setSelected(null);
              setError('');
            } else router.back();
          }}
        />
        <Text style={s.title}>Emergency reports</Text>
        {!token && <Text style={s.body}>Para sa OSCA admin ang report queue.</Text>}
        {busy && <ActivityIndicator color="#B3432E" />}
        {!!error && (
          <Text style={s.error} accessibilityRole="alert">
            {error}
          </Text>
        )}
        {token && !selected && (
          <>
            <PhysicalIdButton
              label="I-refresh ang listahan"
              secondary
              disabled={busy}
              onPress={() => setPage({ offset: 0 })}
            />
            {queue?.reports.length === 0 && <Text style={s.body}>Walang open na report sa page na ito.</Text>}
            {queue?.reports.map((report) => (
              <View key={report.id} style={s.card}>
                <Text style={s.heading}>{queue.categories[report.category] ?? 'Emergency report'}</Text>
                {!!report.reporter && <Text style={s.body}>{report.reporter}</Text>}
                <Text style={s.body}>{emergencyStatus[report.status]}</Text>
                <Text style={s.body}>{emergencyReportTime(report.created_at)}</Text>
                <PhysicalIdButton label="Basahin ang report" disabled={busy} onPress={() => void open(report.id)} />
              </View>
            ))}
            {page.offset > 0 && (
              <PhysicalIdButton
                label="Nakaraang page"
                secondary
                disabled={busy}
                onPress={() => setPage({ offset: page.offset - 25 })}
              />
            )}
            {queue?.hasMore && (
              <PhysicalIdButton
                label="Susunod na page"
                secondary
                disabled={busy}
                onPress={() => setPage({ offset: page.offset + 25 })}
              />
            )}
          </>
        )}
        {token && selected && (
          <View style={s.card}>
            <Text style={s.heading}>{queue?.categories[selected.details.category] ?? 'Emergency report'}</Text>
            <Text style={s.body}>{emergencyStatus[selected.status]}</Text>
            <Text selectable style={s.body}>
              Reference · {selected.id}
            </Text>
            <Text style={s.body}>{emergencyReportTime(selected.created_at)}</Text>
            <Text style={s.body}>Nag-report · {selected.details.reporter}</Text>
            <Text selectable style={s.body}>
              Lokasyon · {selected.details.location}
            </Text>
            <Text selectable style={s.body}>
              Contact · {selected.details.contact}
            </Text>
            <Text style={s.body}>{selected.details.description}</Text>
            {!!selected.review_note && <Text style={s.body}>Huling note · {selected.review_note}</Text>}
            {selected.status !== 'Closed' && (
              <>
                <TextInput
                  style={s.input}
                  value={note}
                  onChangeText={setNote}
                  maxLength={500}
                  multiline
                  editable={!busy}
                  placeholder="Follow-up note para sa resident"
                  accessibilityLabel="Follow-up note para sa resident"
                />
                {selected.status === 'Submitted' ? (
                  <PhysicalIdButton
                    label="Markahan na nabasa na"
                    disabled={busy}
                    onPress={() => void update('Acknowledged')}
                  />
                ) : (
                  <PhysicalIdButton
                    label="Isara ang report"
                    disabled={busy || !note.trim()}
                    onPress={() => void update('Closed')}
                  />
                )}
              </>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
