import React, { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { API_BASE_URL } from '../services/loloApi';

type Application = {
  id: string; benefit_type?: string; validation_status?: string; benefit_status?: string;
  created_at?: string; date_validated?: string; date_released?: string; benefit_amount?: number;
  findings_concerns_recommendations?: string;
};
type Feedback = { rating: number; comments: string };
async function read(response: Response) {
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Could not load your application. Please try again.');
  return data;
}
export default function BirthdayBenefitTracker({ userId, renderForm }: {
  userId: number; renderForm: (submitted: (application: Application) => void) => React.ReactNode;
}) {
  const router = useRouter();
  const [application, setApplication] = useState<Application | null>(null);
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [feedbackReady, setFeedbackReady] = useState(false);
  const [rating, setRating] = useState(0);
  const [comments, setComments] = useState('');
  const [saving, setSaving] = useState(false);

  useFocusEffect(useCallback(() => {
    let active = true;
    let busy = false;
    let controller: AbortController | null = null;
    const load = async () => {
      if (busy) return;
      busy = true;
      controller = new AbortController();
      const timeout = setTimeout(() => controller?.abort(), 25000);
      try {
        const data = await read(await fetch(`${API_BASE_URL}/api/benefit-applications/user/${userId}`, { signal: controller.signal }));
        if (!active) return;
        const item = data.applications?.[0] || null;
        setApplication(item);
        setChecked(true);
        setError('');
        if (item?.benefit_status === 'Released') {
          const result = await read(await fetch(`${API_BASE_URL}/api/benefit-applications/${item.id}/feedback?user_id=${userId}`, { signal: controller.signal }));
          if (!active) return;
          setFeedback(result.feedback);
          setFeedbackReady(true);
        }
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Could not connect. Please try again.');
      } finally { clearTimeout(timeout); busy = false; }
    };
    void load();
    const timer = setInterval(() => { void load(); }, 15000);
    return () => { active = false; clearInterval(timer); controller?.abort(); };
  // Refresh is an explicit reload trigger for the focused screen.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, refresh]));

  const submitFeedback = async () => {
    if (!application || saving || !rating || !comments.trim()) return;
    setSaving(true);
    try {
      const data = await read(await fetch(`${API_BASE_URL}/api/benefit-applications/${application.id}/feedback`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, rating, comments: comments.trim() }),
      }));
      setFeedback(data.feedback);
      setError('');
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not save feedback.'); }
    finally { setSaving(false); }
  };

  if (checked && !application && !error) {
    return <>{renderForm((item) => { setApplication(item); setFeedbackReady(false); setRefresh(v => v + 1); })}</>;
  }
  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScrollView contentContainerStyle={s.content}>
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button"><Text style={s.link}>Back</Text></TouchableOpacity>
        <Text style={s.title}>Birthday Benefits</Text>
        <Text style={s.subtitle}>Application status tracking</Text>
        {error ? <View style={s.card}><Text style={s.error}>{error}</Text><TouchableOpacity onPress={() => setRefresh(v => v + 1)}><Text style={s.link}>Try again</Text></TouchableOpacity></View> : null}
        {!checked && !error ? <ActivityIndicator color="#1F5C3E" /> : null}
        {application && <>
          <View style={s.card}>
            <Text style={s.heading}>{application.benefit_type} application</Text>
            <Text selectable style={s.detail}>Reference: {application.id}</Text>
            <Text style={s.detail}>Submitted: {application.created_at?.slice(0, 10) || 'Submitted'}</Text>
            <Text style={s.label}>VALIDATION STATUS</Text><Text style={s.status}>{application.validation_status || 'Pending'}</Text>
            <Text style={s.label}>PROCESSING STATUS</Text><Text style={s.status}>{application.benefit_status || 'Pending'}</Text>
            {application.benefit_amount != null && <Text style={s.detail}>Benefit amount: ?{Number(application.benefit_amount).toLocaleString('en-PH')}</Text>}
            {application.date_released && <Text style={s.detail}>Date released: {application.date_released}</Text>}
            {application.findings_concerns_recommendations && <Text style={s.detail}>{application.findings_concerns_recommendations}</Text>}
            <TouchableOpacity onPress={() => setRefresh(v => v + 1)}><Text style={s.link}>Refresh status</Text></TouchableOpacity>
          </View>
          {application.benefit_status === 'Released' && <View style={s.card}>
            <Text style={s.heading}>{feedback ? 'Thank you for your feedback' : 'Feedback required'}</Text>
            <Text style={s.detail}>Service: Birthday Benefits</Text>
            {feedback ? <><Text style={s.status}>{feedback.rating} / 5</Text><Text style={s.detail}>{feedback.comments}</Text></> : !feedbackReady ? <Text style={s.detail}>Loading feedback status?</Text> : <>
              <Text style={s.detail}>Your benefit has been released. Please rate the service and share your experience.</Text>
              <View style={s.ratings}>{[1, 2, 3, 4, 5].map(value => <TouchableOpacity key={value} onPress={() => setRating(value)} accessibilityRole="button" accessibilityLabel={`Rate ${value} out of 5`} accessibilityState={{ selected: rating === value }} style={[s.rating, rating === value && s.selected]}><Text style={rating === value ? s.white : s.status}>{value}</Text></TouchableOpacity>)}</View>
              <TextInput style={s.input} multiline value={comments} onChangeText={setComments} maxLength={2000} placeholder="Tell us about your experience" accessibilityLabel="Required service feedback" />
              <TouchableOpacity style={[s.button, (!rating || !comments.trim() || saving) && { opacity: 0.5 }]} onPress={submitFeedback} disabled={!rating || !comments.trim() || saving}><Text style={s.white}>{saving ? 'Submitting?' : 'Submit feedback'}</Text></TouchableOpacity>
            </>}
          </View>}
        </>}
      </ScrollView>
    </SafeAreaView>
  );
}
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F6F8F2' }, content: { padding: 20, gap: 16, paddingBottom: 40 },
  title: { fontSize: 26, fontWeight: '700', color: '#132018' }, subtitle: { fontSize: 16, color: '#597265' },
  card: { padding: 20, backgroundColor: '#fff', borderRadius: 18, gap: 12 }, heading: { fontSize: 20, fontWeight: '700', color: '#132018' },
  detail: { fontSize: 16, lineHeight: 24, color: '#3E5246' }, label: { fontSize: 13, fontWeight: '700', color: '#597265', marginTop: 8 },
  status: { fontSize: 18, fontWeight: '600', color: '#1F5C3E' }, link: { fontSize: 16, fontWeight: '700', color: '#1F5C3E', paddingVertical: 10 },
  error: { color: '#B3432E', fontSize: 16 }, ratings: { flexDirection: 'row', gap: 10 }, rating: { padding: 12, borderRadius: 10, backgroundColor: '#E3EFE5' },
  selected: { backgroundColor: '#1F5C3E' }, white: { color: '#fff', fontSize: 16, fontWeight: '700' },
  input: { borderWidth: 1, borderColor: '#B9D4C2', borderRadius: 12, minHeight: 110, padding: 12, fontSize: 16, textAlignVertical: 'top' },
  button: { backgroundColor: '#1F5C3E', padding: 16, alignItems: 'center', borderRadius: 12 },
});
