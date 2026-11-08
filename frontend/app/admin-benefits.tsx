import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { API_BASE_URL } from '../services/loloApi';
import { useAuth } from '../context/AuthContext';
import { exportBirthdayBenefitsFormPdf, openBirthdayBenefitsFormPreview } from '../services/birthdayBenefitsPdf';

const C = {
  bg: '#F6F8F2',
  card: '#FFFFFF',
  ink: '#132018',
  inkSoft: '#3E5246',
  inkFaint: '#71857A',
  primary: '#1F5C3E',
  primaryDark: '#0F3323',
  primarySoft: '#DCEFE3',
  gold: '#C4892E',
  goldSoft: '#FBF0DA',
  line: '#DCE7D8',
  danger: '#B3432E',
};

type Application = {
  id: string;
  user_id: number;
  ncsc_registration_reference_number?: string;
  benefit_type: 'Octogenarian' | 'Nonagenarian' | 'Centenarian';
  date_of_birth: string;
  osca_id_number?: string;
  contact_number?: string;
  email_address?: string;
  residential_address?: string;
  permanent_address_philippines?: string;
  spouse_name?: string;
  spouse_citizenship?: string;
  representative_name?: string;
  representative_relationship?: string;
  citizenship?: string;
  is_dual_citizen?: boolean;
  dual_citizenship_details?: string;
  applicant_signature?: string;
  applicant_signature_date?: string;
  validation_status: string;
  benefit_status: string;
  benefit_amount?: number | null;
  date_released?: string | null;
  findings_concerns_recommendations?: string | null;
  validated_by?: number | null;
  validated_by_name?: string | null;
  date_validated?: string | null;
  birth_certificate_submitted?: boolean;
  valid_id_submitted?: boolean;
  id_picture_submitted?: boolean;
  full_body_picture_submitted?: boolean;
  endorsed_list_submitted?: boolean;
  full_body_picture_url?: string | null;
  endorsed_list_url?: string | null;
  valid_id_url?: string | null;
  id_picture_url?: string | null;
  birth_certificate_url?: string | null;
  created_at: string;
  applicant?: {
    firstName: string;
    middleName: string;
    lastName: string;
    email: string;
    contact: string;
    gender?: string;
    civilStatus?: string;
    address?: string;
    children?: Array<{ id?: string; name: string; dob?: string }>;
    avatarUrl?: string;
    oscaIdNumber?: string;
  };
};

const VALIDATION_STATUSES = ['Pending', 'Eligible', 'Ineligible', 'Rejected'];
const BENEFIT_STATUSES = ['Pending', 'For Processing', 'Approved', 'Released', 'Cancelled'];

function statusColor(status: string) {
  if (status === 'Approved' || status === 'Eligible' || status === 'Released') return '#2E7A50';
  if (status === 'Rejected' || status === 'Ineligible' || status === 'Cancelled') return C.danger;
  if (status === 'Under Review' || status === 'For Processing') return C.gold;
  return C.inkFaint;
}



async function fetchApplications(signal: AbortSignal): Promise<Application[]> {
  const response = await fetch(`${API_BASE_URL}/api/benefit-applications/admin`, { signal });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || 'Could not load benefit applications.');
  return data.applications ?? [];
}

async function updateApplication(id: string, payload: Record<string, unknown>) {
  const response = await fetch(`${API_BASE_URL}/api/benefit-applications/admin/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || 'Could not update application.');
  return data.application as Application;
}

export default function AdminBenefitsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [applications, setApplications] = useState<Application[]>([]);
  const [filter, setFilter] = useState('All');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const loadRequest = useRef<AbortController | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [findings, setFindings] = useState<Record<string, string>>({});
  const [amounts, setAmounts] = useState<Record<string, string>>({});

  const filteredApplications = useMemo(() => {
    if (filter === 'All') return applications;
    return applications.filter((application) => application.validation_status === filter);
  }, [applications, filter]);

  const loadApplications = useCallback(() => {
    loadRequest.current?.abort();
    const controller = new AbortController();
    loadRequest.current = controller;
    setLoading(true);
    setLoadError(null);
    const timeout = setTimeout(() => controller.abort(), 30000);
    fetchApplications(controller.signal)
      .then((items) => {
        if (!controller.signal.aborted) setApplications(items);
      })
      .catch(() => {
        if (loadRequest.current === controller) {
          setLoadError('Could not connect to the service. Please try again.');
        }
      })
      .finally(() => {
        clearTimeout(timeout);
        if (loadRequest.current === controller) {
          loadRequest.current = null;
          setLoading(false);
        }
      });
  }, []);

  useFocusEffect(useCallback(() => {
    loadApplications();
    return () => {
      const controller = loadRequest.current;
      loadRequest.current = null;
      controller?.abort();
    };
  }, [loadApplications]));

  const changeStatus = async (application: Application, key: 'validation_status' | 'benefit_status', value: string) => {
    const amountText = amounts[application.id] ?? (
      application.benefit_amount == null ? '' : String(application.benefit_amount)
    );
    if (
      key === 'benefit_status' &&
      (value === 'Approved' || value === 'Released') &&
      (!amountText.trim() || Number(amountText) <= 0)
    ) {
      Alert.alert('Benefit amount required', 'Enter the approved benefit amount before setting this status.');
      return;
    }
    setUpdatingId(application.id);
    try {
      const updated = await updateApplication(application.id, {
        [key]: value,
        ...(key === 'benefit_status' ? { benefit_amount: Number(amountText) } : {}),
        ...(key === 'validation_status' && value !== 'Pending' && user?.id
          ? { validated_by: user.id }
          : {}),
      });
      setApplications((current) => current.map((item) => item.id === application.id ? { ...item, ...updated } : item));
    } catch (error) {
      Alert.alert('Update failed', error instanceof Error ? error.message : 'Could not update application.');
    } finally {
      setUpdatingId(null);
    }
  };

  const saveFindings = async (application: Application) => {
    setUpdatingId(application.id);
    try {
      const updated = await updateApplication(application.id, {
        findings_concerns_recommendations: findings[application.id] ?? application.findings_concerns_recommendations ?? '',
      });
      setApplications((current) => current.map((item) => item.id === application.id ? { ...item, ...updated } : item));
    } catch (error) {
      Alert.alert('Update failed', error instanceof Error ? error.message : 'Could not save validation findings.');
    } finally {
      setUpdatingId(null);
    }
  };

  const exportApplication = async (application: Application) => {
    try {
      await exportBirthdayBenefitsFormPdf(application);
    } catch (error) {
      Alert.alert('Export failed', error instanceof Error ? error.message : 'Could not export this application.');
    }
  };

  const previewApplicationInTab = async (application: Application) => {
    try {
      await openBirthdayBenefitsFormPreview(application);
    } catch (error) {
      Alert.alert('Preview failed', error instanceof Error ? error.message : 'Could not open form preview.');
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <StatusBar barStyle="dark-content" />
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()} accessibilityLabel="Go back">
            <Ionicons name="arrow-back" size={19} color={C.ink} />
          </TouchableOpacity>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>OSCA ADMIN</Text>
            <Text style={styles.title}>Benefit Validation</Text>
            <Text style={styles.subtitle}>Validate Birthday Benefits eligibility and requirements</Text>
          </View>
          <TouchableOpacity style={styles.refreshButton} onPress={loadApplications} accessibilityLabel="Refresh applications">
            <Ionicons name="refresh" size={18} color={C.primaryDark} />
          </TouchableOpacity>
        </View>

        <View style={styles.summaryCard}>
          <View>
            <Text style={styles.summaryLabel}>VALIDATION QUEUE</Text>
            <Text style={styles.summaryValue}>{applications.length}</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View>
            <Text style={styles.summaryLabel}>WAITING FOR DECISION</Text>
            <Text style={styles.summaryValue}>{applications.filter((item) => item.validation_status === 'Pending').length}</Text>
          </View>
          <Ionicons name="gift-outline" size={34} color={C.gold} style={styles.summaryIcon} />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          {['All', ...VALIDATION_STATUSES].map((item) => (
            <TouchableOpacity key={item} style={[styles.filter, filter === item && styles.filterActive]} onPress={() => setFilter(item)}>
              <Text style={[styles.filterText, filter === item && styles.filterTextActive]}>{item}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {loadError && (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>{loadError}</Text>
            <TouchableOpacity onPress={loadApplications} accessibilityRole="button">
              <Text style={styles.emptyTitle}>Try again</Text>
            </TouchableOpacity>
          </View>
        )}

        {loading ? <ActivityIndicator color={C.primary} style={styles.loader} /> : loadError ? null : filteredApplications.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="gift-outline" size={34} color={C.inkFaint} />
            <Text style={styles.emptyTitle}>No applications to validate</Text>
            <Text style={styles.emptyText}>Birthday Benefits submissions will appear here for eligibility review.</Text>
          </View>
        ) : filteredApplications.map((application) => {
          const name = [application.applicant?.firstName, application.applicant?.middleName, application.applicant?.lastName].filter(Boolean).join(' ') || `User #${application.user_id}`;
          return (
            <View key={application.id} style={styles.applicationCard}>
              <View style={styles.applicationHeader}>
                <View style={styles.avatar}>
                  <Ionicons name="person" size={19} color={C.primaryDark} />
                </View>
                <View style={styles.applicantCopy}>
                  <Text style={styles.applicantName}>{name}</Text>
                  <Text style={styles.applicantMeta}>{application.osca_id_number || `User ID: ${application.user_id}`}</Text>
                </View>
                <View style={[styles.categoryBadge, { backgroundColor: C.primarySoft }]}>
                  <Text style={styles.categoryText}>{application.benefit_type}</Text>
                </View>
              </View>

              <View style={styles.detailGrid}>
                <Detail label="Date of birth" value={application.date_of_birth} />
                <Detail label="Age category" value={application.benefit_type} />
                <Detail label="Contact" value={application.contact_number || application.applicant?.contact || '—'} />
                <Detail label="Address" value={application.permanent_address_philippines || '—'} />
                <Detail label="Validated by" value={application.validated_by_name || 'Pending review'} />
                <Detail label="Date validated" value={application.date_validated || 'Pending review'} />
                <Detail label="Benefit amount" value={application.benefit_amount == null ? 'Not set' : `₱${Number(application.benefit_amount).toFixed(2)}`} />
                <Detail label="Date released" value={application.date_released || 'Not released'} />
              </View>

              <View style={styles.requirementsSection}>
                <Text style={styles.statusLabel}>DOCUMENTARY REQUIREMENTS</Text>
                <Requirement label="Birth certificate" submitted={application.birth_certificate_submitted} />
                <Requirement label="Valid ID" submitted={application.valid_id_submitted} />
                <Requirement label="2x2 ID picture" submitted={application.id_picture_submitted} />
                <Requirement label="Full-body picture" submitted={application.full_body_picture_submitted} />
                <Requirement label="Endorsed list" submitted={application.endorsed_list_submitted} />
                <View style={styles.documentLinks}>
                  {application.birth_certificate_url && <DocumentLink label="Open birth certificate" url={application.birth_certificate_url} />}
                  {application.valid_id_url && <DocumentLink label="Open valid ID" url={application.valid_id_url} />}
                  {application.id_picture_url && <DocumentLink label="Open account 2x2 picture" url={application.id_picture_url} />}
                  {application.full_body_picture_url && <DocumentLink label="Open full-body picture" url={application.full_body_picture_url} />}
                  {application.endorsed_list_url && <DocumentLink label="Open endorsement document" url={application.endorsed_list_url} />}
                </View>
              </View>

              <View style={styles.statusSection}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                  <TouchableOpacity style={styles.exportButton} onPress={() => exportApplication(application)} disabled={updatingId === application.id}>
                    <Ionicons name="print-outline" size={16} color={C.primaryDark} />
                    <Text style={styles.exportButtonText}>Print / Export PDF</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.exportButton, { backgroundColor: '#E7EDE8' }]} onPress={() => previewApplicationInTab(application)} disabled={updatingId === application.id}>
                    <Ionicons name="open-outline" size={16} color={C.inkSoft} />
                    <Text style={[styles.exportButtonText, { color: C.inkSoft }]}>Open Form in Tab</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.statusLabel}>VALIDATION DECISION</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statusOptions}>
                  {VALIDATION_STATUSES.map((status) => (
                    <TouchableOpacity key={status} style={[styles.statusOption, application.validation_status === status && { borderColor: statusColor(status), backgroundColor: `${statusColor(status)}18` }]} onPress={() => changeStatus(application, 'validation_status', status)} disabled={updatingId === application.id}>
                      <Text style={[styles.statusOptionText, { color: statusColor(status) }]}>{status}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                <Text style={styles.statusLabel}>PROCESSING STATUS</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statusOptions}>
                  {BENEFIT_STATUSES.map((status) => (
                    <TouchableOpacity key={status} style={[styles.statusOption, application.benefit_status === status && { borderColor: statusColor(status), backgroundColor: `${statusColor(status)}18` }]} onPress={() => changeStatus(application, 'benefit_status', status)} disabled={updatingId === application.id}>
                      <Text style={[styles.statusOptionText, { color: statusColor(status) }]}>{status}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                <Text style={styles.statusLabel}>APPROVED BENEFIT AMOUNT</Text>
                <TextInput
                  style={styles.amountInput}
                  value={amounts[application.id] ?? (application.benefit_amount == null ? '' : String(application.benefit_amount))}
                  onChangeText={(value) => setAmounts((current) => ({ ...current, [application.id]: value.replace(/[^0-9.]/g, '') }))}
                  placeholder="Enter amount, e.g. 1000"
                  placeholderTextColor={C.inkFaint}
                  keyboardType="decimal-pad"
                />
                <Text style={styles.statusLabel}>FINDINGS / CONCERNS / RECOMMENDATIONS</Text>
                <TextInput
                  style={styles.findingsInput}
                  value={findings[application.id] ?? application.findings_concerns_recommendations ?? ''}
                  onChangeText={(value) => setFindings((current) => ({ ...current, [application.id]: value }))}
                  placeholder="Record the validation result or concerns"
                  placeholderTextColor={C.inkFaint}
                  multiline
                  textAlignVertical="top"
                />
                <TouchableOpacity style={styles.saveFindingsButton} onPress={() => saveFindings(application)} disabled={updatingId === application.id}>
                  <Ionicons name="save-outline" size={15} color={C.primaryDark} />
                  <Text style={styles.saveFindingsText}>Save validation notes</Text>
                </TouchableOpacity>
              </View>
              {updatingId === application.id && <ActivityIndicator color={C.primary} style={styles.cardLoader} />}
            </View>
          );
        })}

        <Text style={styles.footer}>AUREA · Municipality of Pateros · {user?.firstName || 'Admin'}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return <View style={styles.detail}><Text style={styles.detailLabel}>{label}</Text><Text style={styles.detailValue} numberOfLines={2}>{value}</Text></View>;
}

function Requirement({ label, submitted }: { label: string; submitted?: boolean }) {
  return (
    <View style={styles.requirementRow}>
      <Ionicons name={submitted ? 'checkmark-circle' : 'close-circle-outline'} size={17} color={submitted ? '#2E7A50' : C.danger} />
      <Text style={[styles.requirementText, !submitted && styles.requirementMissing]}>{label}</Text>
      <Text style={[styles.requirementState, { color: submitted ? '#2E7A50' : C.danger }]}>{submitted ? 'Submitted' : 'Missing'}</Text>
    </View>
  );
}

function DocumentLink({ label, url }: { label: string; url: string }) {
  return (
    <TouchableOpacity style={styles.documentLink} onPress={() => Linking.openURL(url)}>
      <Ionicons name="open-outline" size={15} color={C.primaryDark} />
      <Text style={styles.documentLinkText}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  container: { padding: 20, paddingBottom: 44 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  backButton: { width: 40, height: 40, borderRadius: 12, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' },
  refreshButton: { width: 40, height: 40, borderRadius: 12, backgroundColor: C.primarySoft, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1 },
  eyebrow: { fontFamily: 'InterBody', fontSize: 10, fontWeight: '700', letterSpacing: 1.2, color: C.gold },
  title: { fontFamily: 'FraunTitle', fontSize: 25, color: C.ink, marginTop: 2 },
  subtitle: { fontFamily: 'InterBody', fontSize: 12, lineHeight: 17, color: C.inkSoft, marginTop: 2 },
  summaryCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.primaryDark, borderRadius: 20, padding: 20, marginBottom: 18 },
  summaryLabel: { fontFamily: 'InterBody', fontSize: 10, fontWeight: '700', letterSpacing: 1, color: 'rgba(255,255,255,0.65)' },
  summaryValue: { fontFamily: 'FraunTitle', fontSize: 28, color: C.card, marginTop: 2 },
  summaryDivider: { width: 1, height: 40, backgroundColor: 'rgba(255,255,255,0.22)', marginHorizontal: 22 },
  summaryIcon: { marginLeft: 'auto' },
  filters: { gap: 8, paddingBottom: 14 },
  filter: { borderWidth: 1, borderColor: C.line, borderRadius: 18, paddingHorizontal: 13, paddingVertical: 8, backgroundColor: C.card },
  filterActive: { backgroundColor: C.primary, borderColor: C.primary },
  filterText: { fontFamily: 'InterBody', fontSize: 12, color: C.inkSoft },
  filterTextActive: { color: C.card, fontWeight: '700' },
  loader: { padding: 30 },
  emptyCard: { alignItems: 'center', backgroundColor: C.card, borderRadius: 20, padding: 32, borderWidth: 1, borderColor: C.line },
  emptyTitle: { fontFamily: 'InterBody', fontWeight: '700', fontSize: 16, color: C.ink, marginTop: 10 },
  emptyText: { fontFamily: 'InterBody', fontSize: 13, color: C.inkFaint, textAlign: 'center', marginTop: 5 },
  applicationCard: { backgroundColor: C.card, borderRadius: 20, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: C.line },
  applicationHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.primarySoft, alignItems: 'center', justifyContent: 'center' },
  applicantCopy: { flex: 1 },
  applicantName: { fontFamily: 'InterBody', fontWeight: '700', fontSize: 15, color: C.ink },
  applicantMeta: { fontFamily: 'InterBody', fontSize: 11, color: C.inkFaint, marginTop: 2 },
  categoryBadge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 6 },
  categoryText: { fontFamily: 'InterBody', fontWeight: '700', fontSize: 10, color: C.primaryDark },
  detailGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, borderTopWidth: 1, borderTopColor: C.line, marginTop: 14, paddingTop: 13 },
  detail: { width: '47%' },
  detailLabel: { fontFamily: 'InterBody', fontSize: 10, fontWeight: '700', color: C.inkFaint, textTransform: 'uppercase' },
  detailValue: { fontFamily: 'InterBody', fontSize: 12, color: C.inkSoft, marginTop: 3 },
  statusSection: { borderTopWidth: 1, borderTopColor: C.line, marginTop: 14, paddingTop: 13 },
  exportButton: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 10, backgroundColor: C.primarySoft, paddingHorizontal: 11, paddingVertical: 8, marginBottom: 8 },
  exportButtonText: { fontFamily: 'InterBody', fontSize: 11, fontWeight: '700', color: C.primaryDark },
  requirementsSection: { borderTopWidth: 1, borderTopColor: C.line, marginTop: 14, paddingTop: 5 },
  requirementRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5 },
  requirementText: { flex: 1, fontFamily: 'InterBody', fontSize: 12, color: C.inkSoft },
  requirementMissing: { color: C.danger },
  requirementState: { fontFamily: 'InterBody', fontSize: 11, fontWeight: '700' },
  documentLinks: { gap: 8, marginTop: 8 },
  documentLink: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', borderRadius: 9, backgroundColor: C.primarySoft, paddingHorizontal: 9, paddingVertical: 7 },
  documentLinkText: { fontFamily: 'InterBody', fontSize: 11, fontWeight: '700', color: C.primaryDark },
  statusLabel: { fontFamily: 'InterBody', fontSize: 10, fontWeight: '700', letterSpacing: 0.8, color: C.inkFaint, marginTop: 8, marginBottom: 7 },
  statusOptions: { gap: 7 },
  statusOption: { borderWidth: 1, borderColor: C.line, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 7, backgroundColor: C.bg },
  statusOptionText: { fontFamily: 'InterBody', fontSize: 11, fontWeight: '700' },
  amountInput: { borderWidth: 1, borderColor: C.line, borderRadius: 12, backgroundColor: C.bg, padding: 10, fontFamily: 'InterBody', fontSize: 13, color: C.ink, ...Platform.select({ web: { outlineStyle: 'none' } as any }) },
  findingsInput: { minHeight: 72, borderWidth: 1, borderColor: C.line, borderRadius: 12, backgroundColor: C.bg, padding: 10, fontFamily: 'InterBody', fontSize: 12, color: C.ink, ...Platform.select({ web: { outlineStyle: 'none' } as any }) },
  saveFindingsButton: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 10, backgroundColor: C.primarySoft, paddingHorizontal: 10, paddingVertical: 8, marginTop: 8 },
  saveFindingsText: { fontFamily: 'InterBody', fontSize: 11, fontWeight: '700', color: C.primaryDark },
  cardLoader: { marginTop: 8 },
  footer: { textAlign: 'center', fontFamily: 'InterBody', fontSize: 11, color: C.inkFaint, marginTop: 18 },
});
