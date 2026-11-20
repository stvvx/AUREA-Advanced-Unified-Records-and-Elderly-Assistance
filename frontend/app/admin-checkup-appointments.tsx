import React, { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { Text, TextInput } from '../components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { PhysicalIdButton, usePhysicalIdStyles } from '../components/PhysicalIdControls';
import { useAuth } from '../context/AuthContext';
import { appointmentStatus, appointmentTime, checkupRequest, type Appointment, type HealthCenter } from '../services/checkupApi';

const detailsLabels = {
  name: 'Pangalan', dateOfBirth: 'Petsa ng kapanganakan', sex: 'Kasarian', address: 'Address', contactNumber: 'Contact number',
  emergencyContact: 'Emergency contact', relationshipToEmergencyContact: 'Relasyon sa emergency contact',
  reasonForConsultation: 'Dahilan ng check-up', existingMedicalCondition: 'Kasalukuyang kondisyon',
  currentMedication: 'Mga gamot', allergies: 'Allergies', previousMedicalHistory: 'Medical history',
};

type Queue = { appointments: Appointment[]; centers: HealthCenter[]; hasMore: boolean };

export default function AdminCheckupAppointments() {
  const { user } = useAuth();
  return <CheckupQueue key={user?.id} token={user?.role?.toLowerCase() === 'med admin' ? user.token : undefined} />;
}

function CheckupQueue({ token }: { token?: string }) {
  const s = usePhysicalIdStyles();
  const router = useRouter();
  const [queue, setQueue] = useState<Queue | null>(null);
  const [page, setPage] = useState({ offset: 0 });
  const [selected, setSelected] = useState<Appointment | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [note, setNote] = useState('');

  useFocusEffect(useCallback(() => {
    if (!token) return;
    const controller = new AbortController();
    setBusy(true);
    setError('');
    setQueue(null);
    setSelected(null);
    checkupRequest<Queue>(token, `/staff?offset=${page.offset}`, 'GET', undefined, controller.signal)
      .then((result) => { if (!controller.signal.aborted) setQueue(result); })
      .catch((err) => { if (!controller.signal.aborted) setError(err instanceof TypeError ? 'Hindi makakonekta. Subukan ulit.' : err.message); })
      .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [token, page]));

  async function open(id: string) {
    if (!token || busy) return;
    setBusy(true);
    setError('');
    try {
      const { appointment } = await checkupRequest<{ appointment: Appointment }>(token, `/staff/${id}`);
      setSelected(appointment);
      setDate('');
      setTime('');
      setNote('');
    } catch (err) {
      setError(err instanceof TypeError ? 'Hindi makakonekta. Subukan ulit.' : (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function update(status: Appointment['status']) {
    if (!token || !selected || busy) return;
    setBusy(true);
    setError('');
    try {
      await checkupRequest(token, `/staff/${selected.id}`, 'PATCH', { status, date: date.trim(), time: time.trim(), note: note.trim() });
      setSelected(null);
      setPage({ offset: 0 });
    } catch (err) {
      setError(err instanceof TypeError ? 'Hindi makakonekta. I-refresh bago subukan ulit.' : (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const centerName = (centerId: string) => queue?.centers.find((center) => center.id === centerId)?.name;
  return (
    <SafeAreaView style={s.screen}>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <PhysicalIdButton label={selected ? 'Bumalik sa listahan' : 'Bumalik'} secondary disabled={busy}
          onPress={() => { if (selected) { setSelected(null); setError(''); } else router.back(); }} />
        <Text style={s.title}>Check-up Appointments</Text>
        {!token && <Text style={s.body}>Para sa medical admin ang appointment queue.</Text>}
        {busy && <ActivityIndicator color="#1F5C3E" />}
        {!!error && <Text style={s.error} accessibilityRole="alert">{error}</Text>}
        {token && !selected && <>
          <PhysicalIdButton label="I-refresh ang listahan" secondary disabled={busy} onPress={() => setPage({ offset: 0 })} />
          {queue?.appointments.length === 0 && <Text style={s.body}>Walang appointment sa page na ito.</Text>}
          {queue?.appointments.map((item) => (
            <View key={item.id} style={s.card}>
              <Text style={s.heading}>{item.name}</Text>
              <Text style={s.body}>{centerName(item.center_id)} · {appointmentStatus[item.status]}</Text>
              {item.scheduled_at && <Text style={s.body}>{appointmentTime(item.scheduled_at)}</Text>}
              <PhysicalIdButton label="I-review ang appointment" disabled={busy} onPress={() => void open(item.id)} />
            </View>
          ))}
          {queue && page.offset > 0 && <PhysicalIdButton label="Nakaraang page" secondary onPress={() => setPage({ offset: page.offset - 25 })} />}
          {queue?.hasMore && <PhysicalIdButton label="Susunod na page" secondary onPress={() => setPage({ offset: page.offset + 25 })} />}
        </>}
        {token && selected && <>
          <View style={s.card}>
            <Text style={s.heading}>{centerName(selected.center_id)}</Text>
            <Text style={s.body}>{appointmentStatus[selected.status]}</Text>
            {selected.scheduled_at && <Text style={s.body}>{appointmentTime(selected.scheduled_at)}</Text>}
            {Object.entries(detailsLabels).map(([key, label]) => selected.details?.[key]
              ? <Text key={key} style={s.body}>{label} · {selected.details[key]}</Text> : null)}
          </View>
          {(selected.status === 'Pending' || selected.status === 'Confirmed') && <View style={s.card}>
            <Text style={s.heading}>I-update ang appointment</Text>
            {selected.status === 'Pending' && <>
              <Text style={s.body}>Ilagay ang petsa at oras sa Philippine time.</Text>
              <TextInput style={s.input} placeholder="YYYY-MM-DD" accessibilityLabel="Petsa ng appointment"
                value={date} onChangeText={setDate} maxLength={10} editable={!busy} />
              <TextInput style={s.input} placeholder="HH:MM (24-hour format)" accessibilityLabel="Oras ng appointment"
                value={time} onChangeText={setTime} maxLength={5} editable={!busy} />
            </>}
            <TextInput style={s.input} placeholder="Note sa resident o dahilan ng cancellation" accessibilityLabel="Note sa resident"
              value={note} onChangeText={setNote} maxLength={500} editable={!busy} multiline />
            {selected.status === 'Pending'
              ? <PhysicalIdButton label="I-confirm ang schedule" disabled={busy || !date.trim() || !time.trim()} onPress={() => void update('Confirmed')} />
              : <PhysicalIdButton label="I-mark na tapos na" disabled={busy} onPress={() => void update('Completed')} />}
            <PhysicalIdButton label="I-cancel ang appointment" secondary disabled={busy || !note.trim()} onPress={() => void update('Cancelled')} />
          </View>}
        </>}
      </ScrollView>
    </SafeAreaView>
  );
}
