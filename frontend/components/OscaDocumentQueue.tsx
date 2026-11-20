import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Image, Linking, ScrollView, View } from 'react-native';
import { Text, TextInput } from './AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { PhysicalIdButton, usePhysicalIdStyles } from './PhysicalIdControls';
import { useAuth } from '../context/AuthContext';
import { oscaDocumentRequest, requestTypeLabel, type OscaDocumentApplication, type OscaDocumentService } from '../services/oscaDocumentApi';

const documentLabels: Record<string, string> = {
  government_id: 'Government-issued ID',
  residency: 'Barangay certification',
  affidavit: 'Affidavit of Loss',
  authorization: 'Signed authorization',
  representative_id: 'Immediate relative’s government-issued ID',
  portrait: 'ID photo',
  birth_certificate: 'Birth certificate',
  pmrf: 'Signed PhilHealth Member Registration Form',
  senior_id: 'Senior Citizen ID',
  pension_intake: 'Signed DSWD Social Pension intake form',
  indigency_certificate: 'Barangay Certificate of Indigency',
  transfer_residency: 'Barangay Certificate from the new barangay',
  indigency_clearance: 'Barangay Indigency Clearance',
  voter_proof: 'Voter’s ID or Certificate showing Pateros residency',
  medical_document: 'Prescription or medical abstract',
  death_certificate: 'Registered Death Certificate',
  deceased_id: 'Valid ID of the deceased',
};

type ApplicationDetail = OscaDocumentApplication & {
  applicant: Partial<Record<'firstName' | 'middleName' | 'lastName' | 'dob' | 'address' | 'contact' | 'representative' | 'signature' | 'oscaIdNumber', string | null>>
    & { indigency_declared?: boolean; destination?: string; beneficiary?: string };
  attachments: Record<string, { jpeg?: string; onFile?: string }>;
};

export default function OscaDocumentQueue({ service, title }: { service: OscaDocumentService; title: string }) {
  const s = usePhysicalIdStyles();
  const router = useRouter();
  const { user } = useAuth();
  const token = user?.token;
  const isPhilHealth = service === 'philhealth';
  const isSocialPension = service === 'social-pension';
  const isTransfer = service === 'osca-transfer';
  const isFinancialAssistance = service === 'financial-assistance';
  const [applications, setApplications] = useState<OscaDocumentApplication[]>([]);
  const [selected, setSelected] = useState<ApplicationDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [page, setPage] = useState({ offset: 0 });
  const [hasMore, setHasMore] = useState(false);

  useFocusEffect(useCallback(() => {
    if (!token) return;
    let active = true;
    setLoading(true);
    setLoaded(false);
    setError('');
    setSelected(null);
    oscaDocumentRequest<{ applications: OscaDocumentApplication[]; hasMore: boolean }>(token, service, `/admin?offset=${page.offset}`)
      .then((result) => {
        if (!active) return;
        setApplications(result.applications);
        setHasMore(result.hasMore);
        setLoaded(true);
      })
      .catch((err) => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token, service, page]));

  async function open(id: string) {
    if (!token || loading) return;
    setLoading(true);
    setError('');
    try {
      const { application } = await oscaDocumentRequest<{ application: ApplicationDetail }>(token, service, `/admin/${id}`);
      setSelected(application);
      setNote(isSocialPension || isFinancialAssistance ? '' : application.review_note ?? '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load this request.');
    } finally {
      setLoading(false);
    }
  }

  async function update(status: OscaDocumentApplication['status']) {
    if (!token || !selected || loading) return;
    setLoading(true);
    setError('');
    try {
      await oscaDocumentRequest(token, service, `/admin/${selected.id}`, 'PATCH', { status, note: note.trim() });
      setSelected(null);
      setPage({ offset: 0 });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update this request.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={s.screen}>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <PhysicalIdButton label={selected ? 'Back to requests' : 'Back'} secondary
          onPress={() => { if (selected) { setSelected(null); setError(''); } else router.back(); }} disabled={loading} />
        <Text style={s.title}>{title}</Text>
        {loading && <ActivityIndicator color="#1F5C3E" />}
        {!!error && <Text style={s.error} accessibilityRole="alert">{error}</Text>}
        {!selected ? <>
          <PhysicalIdButton label="Refresh requests" secondary disabled={loading || !token} onPress={() => setPage({ offset: 0 })} />
          {loaded && !applications.length && <Text style={s.body}>There are no open requests on this page.</Text>}
          {loaded && applications.map((application) => (
            <View key={application.id} style={s.card}>
              <Text style={s.heading}>{[application.first_name, application.last_name].filter(Boolean).join(' ') || 'Senior citizen'}</Text>
              <Text style={s.body}>{requestTypeLabel(service, application.request_type)} · {application.status}</Text>
              <PhysicalIdButton label="Review request" onPress={() => void open(application.id)} disabled={loading} />
            </View>
          ))}
          {loaded && page.offset > 0 && <PhysicalIdButton label="Previous page" secondary onPress={() => setPage({ offset: page.offset - 50 })} />}
          {loaded && hasMore && <PhysicalIdButton label="Next page" secondary onPress={() => setPage({ offset: page.offset + 50 })} />}
        </> : <>
          <View style={s.card}>
            <Text style={s.heading}>{[selected.applicant.firstName, selected.applicant.middleName, selected.applicant.lastName].filter(Boolean).join(' ')}</Text>
            <Text style={s.body}>{requestTypeLabel(service, selected.request_type)} · {selected.status}</Text>
            {(isSocialPension || isFinancialAssistance) && selected.review_note && <Text style={s.body}>{selected.review_note}</Text>}
            {(['oscaIdNumber', 'dob', 'address', 'contact', 'representative'] as const).map((key) => selected.applicant[key]
              ? <Text style={s.body} key={key}>{selected.applicant[key]}</Text> : null)}
            {selected.applicant.signature && <Text style={s.body}>Digital ID signature on file</Text>}
            {selected.applicant.indigency_declared && <Text style={s.body}>Applicant declared indigency. Verify eligibility before endorsement.</Text>}
            {selected.applicant.destination && <Text style={s.body}>New address · {selected.applicant.destination}</Text>}
            {selected.applicant.beneficiary && <Text style={s.body}>Deceased senior · {selected.applicant.beneficiary}</Text>}
            {isFinancialAssistance && <Text style={s.body}>Record MSWDO referral, confirmed claim instructions, and release after each step is completed by the responsible office.</Text>}
            {isTransfer && <Text style={s.body}>Confirm the Senior Citizen ID has been surrendered and the Pateros membership has been cancelled before recording release.</Text>}
          </View>
          {Object.entries(selected.attachments).map(([key, attachment]) => (
            <View style={s.card} key={key}>
              <Text style={s.heading}>{documentLabels[key] ?? key}</Text>
              {key === 'senior_id' && attachment.onFile ? <Text style={s.body}>OSCA ID on file · {attachment.onFile}</Text> : attachment.jpeg
                ? <Image accessibilityLabel={documentLabels[key]} style={s.document} resizeMode="contain" source={{ uri: `data:image/jpeg;base64,${attachment.jpeg}` }} />
                : attachment.onFile?.startsWith('data:image/')
                  ? <Image accessibilityLabel={documentLabels[key]} style={s.document} resizeMode="contain" source={{ uri: attachment.onFile }} />
                  : /^https?:\/\//i.test(attachment.onFile ?? '') && <PhysicalIdButton label="Open saved file" secondary onPress={() => {
                    Linking.openURL(attachment.onFile!).catch(() => setError('Could not open the saved file.'));
                  }} />}
            </View>
          ))}
          <View style={s.card}>
            <Text style={s.heading}>Review decision</Text>
            <TextInput style={s.input} value={note} onChangeText={setNote} maxLength={500} multiline editable={!loading}
              accessibilityLabel="Note to applicant" placeholder={isPhilHealth || isSocialPension ? 'Next steps or corrections needed' : 'Pickup details or corrections needed'} />
            {isFinancialAssistance
              ? selected.status === 'Pending'
                ? <PhysicalIdButton label="Record referral to MSWDO" onPress={() => void update('Endorsed')} disabled={loading || !note.trim()} />
                : selected.status === 'Endorsed'
                  ? <PhysicalIdButton label="Record confirmed release schedule" onPress={() => void update('Ready for pickup')} disabled={loading || !note.trim()} />
                  : <PhysicalIdButton label="Record release by Mayor’s Office" onPress={() => void update('Released')} disabled={loading} />
              : isSocialPension
              ? selected.status === 'Pending'
                ? <PhysicalIdButton label="Record endorsement to DSWD-NCR" onPress={() => void update('Endorsed')} disabled={loading || !note.trim()} />
                : <PhysicalIdButton label="Record confirmed DSWD approval" onPress={() => void update('Approved')} disabled={loading || !note.trim()} />
              : isPhilHealth
              ? <PhysicalIdButton label="Mark endorsed to PhilHealth" onPress={() => void update('Endorsed')} disabled={loading || !note.trim()} />
              : selected.status === 'Pending'
              ? <PhysicalIdButton label="Mark ready for pickup" onPress={() => void update('Ready for pickup')} disabled={loading || !note.trim()} />
              : <PhysicalIdButton label={isTransfer ? 'Record cancellation and certificate release' : 'Mark released'}
                onPress={() => void update('Released')} disabled={loading} />}
            <PhysicalIdButton label="Return for corrections" secondary onPress={() => void update('Returned')} disabled={loading || !note.trim()} />
          </View>
        </>}
      </ScrollView>
    </SafeAreaView>
  );
}
