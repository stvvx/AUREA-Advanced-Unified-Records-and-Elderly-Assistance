import React, { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text, TextInput } from './AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { API_BASE_URL } from '../services/loloApi';

type Application = {
  id: string; benefit_milestone?: number; benefit_type?: string; validation_status?: string; benefit_status?: string;
  created_at?: string; date_validated?: string; date_released?: string; benefit_amount?: number;
  findings_concerns_recommendations?: string;
};
type Feedback = { rating: number; comments: string };
const statusLabels: Record<string, string> = {
  Pending: 'Naghihintay ng review',
  'Under Review': 'Nire-review na',
  Eligible: 'Qualified',
  Ineligible: 'Hindi qualified',
  'For Processing': 'Para sa processing',
  Approved: 'Na-approve na',
  Rejected: 'Hindi na-approve',
  Released: 'Na-release na',
  Cancelled: 'Na-cancel na',
};

function statusLabel(status = 'Pending') {
  return statusLabels[status] ?? status;
}

async function read(response: Response) {
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) {
    throw new Error((response.status < 500 && data?.error) || 'Hindi ma-load ang application mo. Subukan ulit.');
  }
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
  const [eligibility, setEligibility] = useState<{ can_apply: boolean; message: string } | null>(null);
  const [submittedId, setSubmittedId] = useState<string | null>(null);

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
        setEligibility(data.eligibility || null);
        setChecked(true);
        setError('');
        setFeedback(data.feedback || null);
        setFeedbackReady(true);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Hindi makakonekta. Subukan ulit.');
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
      setEligibility(null);
      setRefresh(value => value + 1);
      setError('');
    } catch (err) { setError(err instanceof Error ? err.message : 'Hindi na-save ang feedback mo.'); }
    finally { setSaving(false); }
  };

  if (checked && !error && (!application || (eligibility?.can_apply && feedback))) {
    return <>{renderForm((item) => {
      setSubmittedId(item.id);
      setApplication(item);
      setEligibility(null);
      setFeedback(null);
      setFeedbackReady(false);
      setRefresh(v => v + 1);
    })}</>;
  }
  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScrollView contentContainerStyle={s.content}>
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button"><Text style={s.link}>Bumalik</Text></TouchableOpacity>
        <Text style={s.title}>Birthday Benefits</Text>
        <Text style={s.subtitle} accessibilityLiveRegion="polite">
          {submittedId !== null && application?.id === submittedId ? 'Na-submit na ang application mo' : 'Status ng application mo'}
        </Text>
        {error ? <View style={s.card}><Text style={s.error}>{error}</Text><TouchableOpacity onPress={() => setRefresh(v => v + 1)}><Text style={s.link}>Subukan ulit</Text></TouchableOpacity></View> : null}
        {!checked && !error ? <ActivityIndicator color="#1F5C3E" /> : null}
        {application && <>
          {feedback && eligibility && <View style={s.card}><Text style={s.detail}>{eligibility.message}</Text></View>}
          <View style={s.card}>
            <Text style={s.heading}>Application para sa {application.benefit_type}{application.benefit_milestone ? ` (edad ${application.benefit_milestone})` : ''}</Text>
            <Text selectable style={s.detail}>Reference: {application.id}</Text>
            <Text style={s.detail}>{application.created_at ? `Na-submit noong ${application.created_at.slice(0, 10)}` : 'Na-submit na'}</Text>
            <Text style={s.label}>STATUS NG VERIFICATION</Text><Text style={s.status}>{statusLabel(application.validation_status)}</Text>
            <Text style={s.label}>STATUS NG APPLICATION</Text><Text style={s.status}>{statusLabel(application.benefit_status)}</Text>
            {application.benefit_amount != null && <Text style={s.detail}>Halaga ng benefit: ₱{Number(application.benefit_amount).toLocaleString('en-PH')}</Text>}
            {application.date_released && <Text style={s.detail}>Na-release noong {application.date_released}</Text>}
            {application.findings_concerns_recommendations && <Text style={s.detail}>{application.findings_concerns_recommendations}</Text>}
            <TouchableOpacity onPress={() => setRefresh(v => v + 1)}><Text style={s.link}>I-refresh ang status</Text></TouchableOpacity>
          </View>
          {application.benefit_status === 'Released' && <View style={s.card}>
            <Text style={s.heading}>{feedback ? 'Salamat sa feedback mo' : 'Kailangan ang feedback'}</Text>
            <Text style={s.detail}>Serbisyo: Birthday Benefits</Text>
            {feedback ? <><Text style={s.status}>{feedback.rating} / 5</Text><Text style={s.detail}>{feedback.comments}</Text></> : !feedbackReady ? <Text style={s.detail}>Nilo-load ang feedback status…</Text> : <>
              <Text style={s.detail}>Na-release na ang benefit mo. I-rate ang serbisyo at ikuwento ang experience mo.</Text>
              <View style={s.ratings}>{[1, 2, 3, 4, 5].map(value => <TouchableOpacity key={value} onPress={() => setRating(value)} accessibilityRole="button" accessibilityLabel={`I-rate ng ${value} sa 5`} accessibilityState={{ selected: rating === value }} style={[s.rating, rating === value && s.selected]}><Text style={rating === value ? s.white : s.status}>{value}</Text></TouchableOpacity>)}</View>
              <TextInput style={s.input} multiline value={comments} onChangeText={setComments} maxLength={2000} placeholder="Ikuwento ang experience mo" accessibilityLabel="Kailangang feedback tungkol sa serbisyo" />
              <TouchableOpacity style={[s.button, (!rating || !comments.trim() || saving) && { opacity: 0.5 }]} onPress={submitFeedback} disabled={!rating || !comments.trim() || saving}><Text style={s.white}>{saving ? 'Sine-submit na…' : 'I-submit ang feedback'}</Text></TouchableOpacity>
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
