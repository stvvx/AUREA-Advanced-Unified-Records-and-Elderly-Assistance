import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, TouchableOpacity, View } from 'react-native';
import { Text, TextInput } from './AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../context/AuthContext';
import {
  oscaDocumentRequest,
  requestTypeLabel,
  type OscaDocumentApplication as Application,
  type OscaDocumentRequirements,
  type PhysicalIdType,
} from '../services/oscaDocumentApi';
import type { OscaApplicationOptions } from './applications/osca/types';
import { PhysicalIdButton, usePhysicalIdStyles } from './PhysicalIdControls';

type Checklist = { requirements: OscaDocumentRequirements; application: Application | null };
const cardTypes: PhysicalIdType[] = ['new', 'lost', 'worn'];
const statusLabels = {
  Pending: 'Na-submit na para i-review ng OSCA',
  'Ready for pickup': 'Puwede nang kunin',
  Released: 'Na-release na',
  Returned: 'Ibinalik para sa corrections',
  Endorsed: 'Na-endorse na',
  Approved: 'Na-approve na',
} satisfies Record<Application['status'], string>;

export default function OscaDocumentApplication({ options }: { options: OscaApplicationOptions }) {
  const s = usePhysicalIdStyles();
  const { service, destinationDocument, form } = options;
  const router = useRouter();
  const { user } = useAuth();
  const token = user?.token;
  const [requestType, setRequestType] = useState<Application['request_type']>(options.requestTypes?.[0] ?? 'new');
  const [beneficiaryDraft, setBeneficiaryDraft] = useState<string | null>(null);
  const [represented, setRepresented] = useState(false);
  const [representative, setRepresentative] = useState('');
  const [destinationDraft, setDestinationDraft] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<Record<string, string>>({});
  const [confirmed, setConfirmed] = useState(false);
  const [checklist, setChecklist] = useState<Checklist | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [startNew, setStartNew] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!token) return;
      let active = true;
      setLoading(true);
      setError('');
      oscaDocumentRequest<Checklist>(token, service, `?requestType=${requestType}&represented=${represented}`)
        .then((result) => {
          if (active) setChecklist(result);
        })
        .catch((err) => {
          if (active) {
            setChecklist(null);
            setError(err.message);
          }
        })
        .finally(() => {
          if (active) setLoading(false);
        });
      return () => {
        active = false;
      };
      // Use a new callback to reload while this screen stays focused.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token, service, requestType, represented, refresh]),
  );

  const requirements = checklist?.requirements;
  const application = checklist?.application;
  const tracking =
    application &&
    (application.status === 'Pending' ||
      application.status === 'Ready for pickup' ||
      (application.status === 'Endorsed' && options.endorser) ||
      application.status === 'Approved' ||
      (application.status === 'Released' && !startNew));
  const destination = destinationDraft ?? requirements?.previousDestination ?? '';
  const needsBeneficiary = options.beneficiaryFor === requestType;
  const beneficiary = beneficiaryDraft ?? requirements?.previousBeneficiary ?? '';
  const requestTypes = options.requestTypes ?? (options.allowsReplacement ? cardTypes : []);
  const documents = (requirements?.documents ?? []).map((document) => {
    const destinationChanged = document.key === destinationDocument && destination.trim() !== requirements?.previousDestination;
    const beneficiaryChanged = needsBeneficiary && ['death_certificate', 'deceased_id'].includes(document.key)
      && beneficiary.trim() !== requirements?.previousBeneficiary;
    return destinationChanged || beneficiaryChanged ? { ...document, previouslyAttached: false } : document;
  });
  const canSubmit =
    requirements &&
    !requirements.eligibilityMessage &&
    !requirements.missingProfile.length &&
    !requirements.needsSignature &&
    documents.every(({ key, onFile, previouslyAttached }) => onFile || previouslyAttached || attachments[key]) &&
    (!represented || representative.trim()) &&
    (!destinationDocument || destination.trim()) &&
    (!needsBeneficiary || beneficiary.trim()) &&
    confirmed;

  async function attach(key: string) {
    try {
      setError('');
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], base64: true, quality: 0.65 });
      if (result.canceled) return;
      const photo = result.assets[0]?.base64;
      if (!photo?.startsWith('/9j/') || photo.length > 1_398_100) {
        setError('Pumili ng JPEG photo na mas mababa sa 1 MB at malinaw ang lahat ng nakasulat.');
        return;
      }
      setAttachments((current) => ({ ...current, [key]: photo }));
    } catch {
      setError('Hindi mabuksan ang photo library. Subukan ulit.');
    }
  }

  async function submit() {
    if (!token || !canSubmit || loading || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const { application: saved } = await oscaDocumentRequest<{ application: Application }>(
        token,
        service,
        '',
        'POST',
        {
          requestType,
          representative: represented ? representative.trim() : '',
          confirmed,
          ...(destinationDocument ? { destination: destination.trim() } : {}),
          ...(needsBeneficiary ? { beneficiary: beneficiary.trim() } : {}),
          attachments: Object.fromEntries(
            documents.filter(({ onFile }) => !onFile).map(({ key }) => [key, attachments[key]]),
          ),
        },
      );
      setChecklist({ requirements, application: saved });
      setAttachments({});
      setConfirmed(false);
      setBeneficiaryDraft(null);
      setStartNew(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Hindi na-submit ang application mo.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={s.screen}>
      <ScrollView key={application?.id ?? 'form'} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <PhysicalIdButton label="Bumalik" onPress={() => router.back()} secondary />
        <Text style={s.title}>{options.title}</Text>
        {!token && <Text style={s.body}>Mag-sign in muna para makapag-apply.</Text>}
        {loading && <ActivityIndicator color="#1F5C3E" />}
        {!!error && (
          <Text accessibilityRole="alert" style={s.error}>
            {error}
          </Text>
        )}
        {token && !loading && !checklist && (
          <PhysicalIdButton label="Subukan ulit" onPress={() => setRefresh(refresh + 1)} />
        )}
        {application && (
          <View style={s.card}>
            <Text style={s.heading} accessibilityLiveRegion="polite">
              {application.status === 'Endorsed' && options.endorser
                ? `Na-endorse na sa ${options.endorser}`
                : statusLabels[application.status]}
            </Text>
            <Text style={s.body}>
              {requestTypeLabel(service, application.request_type)} ·{' '}
              {new Date(application.created_at).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila' })}
            </Text>
            <Text selectable style={s.body}>Reference number · {application.id}</Text>
            {!!application.review_note && <Text style={s.body}>{application.review_note}</Text>}
            {tracking && (
              <PhysicalIdButton label="I-refresh ang status" onPress={() => setRefresh(refresh + 1)} secondary />
            )}
            {application.status === 'Released' && !startNew && options.allowsReplacement && (
              <PhysicalIdButton
                label="Mag-request ng replacement"
                onPress={() => {
                  setRequestType('lost');
                  setStartNew(true);
                }}
              />
            )}
            {application.status === 'Released' && !startNew && options.allowsNewAfterRelease && (
              <PhysicalIdButton label="Mag-apply ulit" onPress={() => setStartNew(true)} />
            )}
          </View>
        )}
        {requirements && !tracking && (
          <>
            <View style={s.card}>
              <Text style={s.heading}>{options.heading}</Text>
              {options.intro && <Text style={s.body}>{options.intro}</Text>}
              {destinationDocument && (
                <TextInput
                  style={s.input}
                  accessibilityLabel="Kumpletong bagong address"
                  placeholder="Bahay, kalye, barangay, lungsod o munisipalidad"
                  value={destination}
                  onChangeText={(value) => {
                    setDestinationDraft(value);
                    setConfirmed(false);
                    setAttachments((current) => {
                      const next = { ...current };
                      delete next[destinationDocument];
                      return next;
                    });
                  }}
                  maxLength={400}
                  multiline
                  editable={!submitting}
                />
              )}
              {requestTypes.map((key) => (
                  <TouchableOpacity
                    key={key}
                    style={s.choice}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: key === requestType }}
                    disabled={submitting}
                    onPress={() => {
                      setRequestType(key);
                      setConfirmed(false);
                    }}
                  >
                    <Text style={s.body}>
                      {key === requestType ? '◉' : '○'} {requestTypeLabel(service, key)}
                    </Text>
                  </TouchableOpacity>
                ))}
              {needsBeneficiary && (
                <TextInput style={s.input} accessibilityLabel="Buong pangalan ng yumaong senior citizen"
                  placeholder="Buong pangalan ng yumaong senior citizen" maxLength={160} editable={!submitting}
                  value={beneficiary} onChangeText={(value) => {
                    setBeneficiaryDraft(value);
                    setConfirmed(false);
                    setAttachments(({ death_certificate: _death, deceased_id: _id, ...remaining }) => remaining);
                  }} />
              )}
              {options.allowsRepresentative !== false && (
                <TouchableOpacity
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: represented }}
                  disabled={submitting}
                  style={s.choice}
                  onPress={() => {
                    setRepresented(!represented);
                    setConfirmed(false);
                  }}
                >
                  <Text style={s.body}>
                    {represented ? '☑' : '☐'} May immediate family member akong pinapayagang mag-apply para sa akin
                  </Text>
                </TouchableOpacity>
              )}
              {represented && (
                <TextInput
                  style={s.input}
                  accessibilityLabel="Buong pangalan ng immediate family member"
                  placeholder="Buong pangalan ng immediate family member"
                  value={representative}
                  onChangeText={setRepresentative}
                  maxLength={160}
                  editable={!submitting}
                />
              )}
            </View>
            {!loading && (
              <>
                {!!requirements.eligibilityMessage && <Text style={s.error}>{requirements.eligibilityMessage}</Text>}
                <View style={s.card}>
                  <Text style={s.heading}>Mga kailangang isumite</Text>
                  {!!requirements.missingProfile.length && (
                    <>
                      <Text style={s.body}>
                        Kulang na detalye sa profile · {requirements.missingProfile.join(', ')}
                      </Text>
                      <PhysicalIdButton
                        label="Kumpletuhin ang profile"
                        onPress={() => router.push('/profile')}
                        secondary
                      />
                    </>
                  )}
                  {options.requirementsHelp && <Text style={s.body}>{options.requirementsHelp}</Text>}
                  {form && (
                    <PhysicalIdButton
                      label={form.label}
                      secondary
                      onPress={() => {
                        Linking.openURL(form.url).catch(() => setError(form.error));
                      }}
                    />
                  )}
                  {options.showsSignature &&
                    (requirements.needsSignature ? (
                      <PhysicalIdButton
                        label="Lagyan ng pirma ang Digital ID"
                        onPress={() => router.push('/digital-id')}
                        secondary
                      />
                    ) : (
                      <Text style={s.body}>Pirma · Naka-save na</Text>
                    ))}
                  {documents.map(({ key, label, onFile, previouslyAttached }) =>
                    onFile ? (
                      <Text style={s.body} key={key}>
                        {label} · Naka-save na
                      </Text>
                    ) : (
                      <View key={key} style={{ gap: 6 }}>
                        {(attachments[key] || previouslyAttached) && (
                          <Text style={s.body}>{label} · Naka-attach na</Text>
                        )}
                        <PhysicalIdButton
                          label={
                            attachments[key] || previouslyAttached
                              ? `Palitan ang photo ng ${label}`
                              : `Mag-attach ng photo ng ${label}`
                          }
                          onPress={() => void attach(key)}
                          disabled={submitting}
                          secondary
                        />
                      </View>
                    ),
                  )}
                  {requestType === 'new' && options.newRequestHelp && (
                    <Text style={s.body}>{options.newRequestHelp}</Text>
                  )}
                </View>
                <View style={s.card}>
                  <Text style={s.heading}>{options.verificationHeading ?? 'Para sa verification ng OSCA'}</Text>
                  <Text style={s.body}>
                    {requestType === 'new' && options.firstRequestVerification
                      ? options.firstRequestVerification
                      : options.verification}
                  </Text>
                  {options.verificationByType?.[requestType] && <Text style={s.body}>{options.verificationByType[requestType]}</Text>}
                  {requestType === 'worn' && options.wornItem && <Text style={s.body}>{options.wornItem}</Text>}
                  {options.representativeReminder && represented && (
                    <Text style={s.body}>
                      Dalhin ng authorized family member ang authorization letter at original at photocopy ng sarili
                      niyang Philippine government-issued ID.
                    </Text>
                  )}
                  <TouchableOpacity
                    style={s.choice}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: confirmed }}
                    disabled={submitting}
                    onPress={() => setConfirmed(!confirmed)}
                  >
                    <Text style={s.body}>
                      {confirmed ? '☑' : '☐'} {options.confirmation}
                    </Text>
                  </TouchableOpacity>
                </View>
                <PhysicalIdButton
                  label={submitting ? 'Sine-submit na…' : 'I-submit sa OSCA'}
                  disabled={!canSubmit || submitting}
                  onPress={() => void submit()}
                />
              </>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
