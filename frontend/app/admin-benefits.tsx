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
  bg: '#F3F6EF',
  card: '#FFFFFF',
  ink: '#132018',
  inkSoft: '#3E5246',
  inkFaint: '#71857A',
  primary: '#1F5C3E',
  primaryDark: '#0F3323',
  primarySoft: '#DCEFE3',
  gold: '#C4892E',
  goldSoft: '#FBF0DA',
  line: '#E0E9DC',
  danger: '#B3432E',
  dangerSoft: '#FBE7E2',
  good: '#2E7A50',
  goodSoft: '#E1F2E7',
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
    children?: { id?: string; name: string; dob?: string }[];
    avatarUrl?: string;
    oscaIdNumber?: string;
  };
};

const VALIDATION_STATUSES = ['Pending', 'Eligible', 'Ineligible', 'Rejected'];
const BENEFIT_STATUSES = ['Pending', 'For Processing', 'Approved', 'Released', 'Cancelled'];

function statusColor(status: string) {
  if (status === 'Approved' || status === 'Eligible' || status === 'Released') return C.good;
  if (status === 'Rejected' || status === 'Ineligible' || status === 'Cancelled') return C.danger;
  if (status === 'Under Review' || status === 'For Processing') return C.gold;
  return C.inkFaint;
}

function statusIcon(status: string): keyof typeof Ionicons.glyphMap {
  if (status === 'Approved' || status === 'Eligible' || status === 'Released') return 'checkmark-circle';
  if (status === 'Rejected' || status === 'Ineligible' || status === 'Cancelled') return 'close-circle';
  if (status === 'Under Review' || status === 'For Processing') return 'time';
  return 'ellipse-outline';
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

function requirementList(a: Application) {
  return [
    { label: 'Birth certificate', submitted: a.birth_certificate_submitted },
    { label: 'Valid ID', submitted: a.valid_id_submitted },
    { label: '2x2 ID picture', submitted: a.id_picture_submitted },
    { label: 'Full-body picture', submitted: a.full_body_picture_submitted },
    { label: 'Endorsed list', submitted: a.endorsed_list_submitted },
  ];
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
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const counts = useMemo(() => {
    const result: Record<string, number> = { All: applications.length };
    VALIDATION_STATUSES.forEach((status) => {
      result[status] = applications.filter((item) => item.validation_status === status).length;
    });
    return result;
  }, [applications]);

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

  const toggle = (id: string) => setExpanded((current) => ({ ...current, [id]: !current[id] }));

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <StatusBar barStyle="dark-content" />
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()} accessibilityLabel="Go back">
            <Ionicons name="arrow-back" size={19} color={C.ink} />
          </TouchableOpacity>
          <View style={styles.headerCopy}>
            <Text style={styles.title}>Benefit validation</Text>
            <Text style={styles.subtitle}>Review Birthday Benefits eligibility and requirements</Text>
          </View>
          <TouchableOpacity style={styles.refreshButton} onPress={loadApplications} disabled={loading} accessibilityLabel="Refresh applications">
            {loading ? <ActivityIndicator size="small" color={C.primaryDark} /> : <Ionicons name="refresh" size={18} color={C.primaryDark} />}
          </TouchableOpacity>
        </View>

        <View style={styles.summaryCard}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>{counts.All}</Text>
            <Text style={styles.summaryLabel}>In queue</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryValue, { color: '#F2C879' }]}>{counts.Pending}</Text>
            <Text style={styles.summaryLabel}>Need a decision</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>{counts.Eligible}</Text>
            <Text style={styles.summaryLabel}>Eligible</Text>
          </View>
          <Ionicons name="gift-outline" size={30} color="rgba(242,200,121,0.9)" style={styles.summaryIcon} />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          {['All', ...VALIDATION_STATUSES].map((item) => {
            const active = filter === item;
            return (
              <TouchableOpacity key={item} style={[styles.filter, active && styles.filterActive]} onPress={() => setFilter(item)} accessibilityRole="button" accessibilityState={{ selected: active }}>
                <Text style={[styles.filterText, active && styles.filterTextActive]}>{item}</Text>
                <View style={[styles.filterCount, active && styles.filterCountActive]}>
                  <Text style={[styles.filterCountText, active && { color: C.primaryDark }]}>{counts[item] ?? 0}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {loadError && (
          <View style={styles.errorCard}>
            <Ionicons name="cloud-offline-outline" size={26} color={C.danger} />
            <Text style={styles.errorText}>{loadError}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={loadApplications} accessibilityRole="button">
              <Text style={styles.retryText}>Try again</Text>
            </TouchableOpacity>
          </View>
        )}

        {loading ? <ActivityIndicator color={C.primary} style={styles.loader} /> : loadError ? null : filteredApplications.length === 0 ? (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIcon}><Ionicons name="gift-outline" size={28} color={C.primary} /></View>
            <Text style={styles.emptyTitle}>{filter === 'All' ? 'No applications to validate' : `No ${filter.toLowerCase()} applications`}</Text>
            <Text style={styles.emptyText}>
              {filter === 'All' ? 'Birthday Benefits submissions will appear here for eligibility review.' : 'Choose another filter to see the rest of the queue.'}
            </Text>
          </View>
        ) : filteredApplications.map((application) => {
          const name = [application.applicant?.firstName, application.applicant?.middleName, application.applicant?.lastName].filter(Boolean).join(' ') || `User #${application.user_id}`;
          const initials = name.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
          const requirements = requirementList(application);
          const submittedCount = requirements.filter((item) => item.submitted).length;
          const complete = submittedCount === requirements.length;
          const isOpen = !!expanded[application.id];
          const busy = updatingId === application.id;
          const accent = statusColor(application.validation_status);
          const hasDocs = application.birth_certificate_url || application.valid_id_url || application.id_picture_url || application.full_body_picture_url || application.endorsed_list_url;

          return (
            <View key={application.id} style={[styles.applicationCard, { borderLeftColor: accent }]}>
              <TouchableOpacity style={styles.applicationHeader} onPress={() => toggle(application.id)} accessibilityRole="button" accessibilityState={{ expanded: isOpen }} accessibilityLabel={`${name}, ${application.validation_status}. ${isOpen ? 'Collapse' : 'Expand'} details`}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{initials || '?'}</Text>
                </View>
                <View style={styles.applicantCopy}>
                  <Text style={styles.applicantName} numberOfLines={1}>{name}</Text>
                  <Text style={styles.applicantMeta} numberOfLines={1}>{application.osca_id_number || `User ID: ${application.user_id}`}</Text>
                </View>
                <View style={styles.headerRight}>
                  <View style={[styles.statusPill, { backgroundColor: `${accent}1A` }]}>
                    <Ionicons name={statusIcon(application.validation_status)} size={12} color={accent} />
                    <Text style={[styles.statusPillText, { color: accent }]}>{application.validation_status}</Text>
                  </View>
                  <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color={C.inkFaint} />
                </View>
              </TouchableOpacity>

              <View style={styles.chipRow}>
                <View style={styles.categoryBadge}><Text style={styles.categoryText}>{application.benefit_type}</Text></View>
                <View style={[styles.categoryBadge, { backgroundColor: complete ? C.goodSoft : C.goldSoft }]}>
                  <Text style={[styles.categoryText, { color: complete ? C.good : '#8A5A12' }]}>{submittedCount}/{requirements.length} requirements</Text>
                </View>
                <View style={[styles.categoryBadge, { backgroundColor: '#EEF2EB' }]}>
                  <Text style={[styles.categoryText, { color: C.inkSoft }]}>{application.benefit_status}</Text>
                </View>
              </View>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${(submittedCount / requirements.length) * 100}%`, backgroundColor: complete ? C.good : C.gold }]} />
              </View>

              {isOpen && (
                <>
                  <View style={styles.detailGrid}>
                    <Detail label="Date of birth" value={application.date_of_birth} />
                    <Detail label="Contact" value={application.contact_number || application.applicant?.contact || '—'} />
                    <Detail label="Address" value={application.permanent_address_philippines || '—'} wide />
                    <Detail label="Validated by" value={application.validated_by_name || 'Pending review'} />
                    <Detail label="Date validated" value={application.date_validated || 'Pending review'} />
                    <Detail label="Benefit amount" value={application.benefit_amount == null ? 'Not set' : `₱${Number(application.benefit_amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`} />
                    <Detail label="Date released" value={application.date_released || 'Not released'} />
                  </View>

                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Documentary requirements</Text>
                    {requirements.map((item) => <Requirement key={item.label} label={item.label} submitted={item.submitted} />)}
                    {hasDocs ? (
                      <View style={styles.documentLinks}>
                        {application.birth_certificate_url && <DocumentLink label="Birth certificate" url={application.birth_certificate_url} />}
                        {application.valid_id_url && <DocumentLink label="Valid ID" url={application.valid_id_url} />}
                        {application.id_picture_url && <DocumentLink label="Account 2x2 picture" url={application.id_picture_url} />}
                        {application.full_body_picture_url && <DocumentLink label="Full-body picture" url={application.full_body_picture_url} />}
                        {application.endorsed_list_url && <DocumentLink label="Endorsement document" url={application.endorsed_list_url} />}
                      </View>
                    ) : null}
                  </View>

                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Validation decision</Text>
                    <View style={styles.statusOptions}>
                      {VALIDATION_STATUSES.map((status) => {
                        const active = application.validation_status === status;
                        const color = statusColor(status);
                        return (
                          <TouchableOpacity key={status} style={[styles.statusOption, active && { borderColor: color, backgroundColor: `${color}18` }]} onPress={() => changeStatus(application, 'validation_status', status)} disabled={busy} accessibilityRole="button" accessibilityState={{ selected: active }}>
                            <Ionicons name={statusIcon(status)} size={14} color={color} />
                            <Text style={[styles.statusOptionText, { color }]}>{status}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    <Text style={[styles.sectionTitle, styles.sectionGap]}>Processing status</Text>
                    <View style={styles.statusOptions}>
                      {BENEFIT_STATUSES.map((status) => {
                        const active = application.benefit_status === status;
                        const color = statusColor(status);
                        return (
                          <TouchableOpacity key={status} style={[styles.statusOption, active && { borderColor: color, backgroundColor: `${color}18` }]} onPress={() => changeStatus(application, 'benefit_status', status)} disabled={busy} accessibilityRole="button" accessibilityState={{ selected: active }}>
                            <Ionicons name={statusIcon(status)} size={14} color={color} />
                            <Text style={[styles.statusOptionText, { color }]}>{status}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    <Text style={[styles.sectionTitle, styles.sectionGap]}>Approved benefit amount</Text>
                    <View style={styles.amountWrap}>
                      <Text style={styles.currency}>₱</Text>
                      <TextInput
                        style={styles.amountInput}
                        value={amounts[application.id] ?? (application.benefit_amount == null ? '' : String(application.benefit_amount))}
                        onChangeText={(value) => setAmounts((current) => ({ ...current, [application.id]: value.replace(/[^0-9.]/g, '') }))}
                        placeholder="e.g. 1000"
                        placeholderTextColor={C.inkFaint}
                        keyboardType="decimal-pad"
                      />
                    </View>
                    <Text style={styles.hint}>Required before setting Approved or Released.</Text>

                    <Text style={[styles.sectionTitle, styles.sectionGap]}>Findings, concerns, recommendations</Text>
                    <TextInput
                      style={styles.findingsInput}
                      value={findings[application.id] ?? application.findings_concerns_recommendations ?? ''}
                      onChangeText={(value) => setFindings((current) => ({ ...current, [application.id]: value }))}
                      placeholder="Record the validation result or concerns"
                      placeholderTextColor={C.inkFaint}
                      multiline
                      textAlignVertical="top"
                    />
                    <TouchableOpacity style={styles.saveFindingsButton} onPress={() => saveFindings(application)} disabled={busy} accessibilityRole="button">
                      <Ionicons name="save-outline" size={16} color="#FFF" />
                      <Text style={styles.saveFindingsText}>Save validation notes</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.actionsRow}>
                    <TouchableOpacity style={styles.exportButton} onPress={() => exportApplication(application)} disabled={busy}>
                      <Ionicons name="print-outline" size={16} color={C.primaryDark} />
                      <Text style={styles.exportButtonText}>Print / export PDF</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.exportButton, styles.exportButtonAlt]} onPress={() => previewApplicationInTab(application)} disabled={busy}>
                      <Ionicons name="open-outline" size={16} color={C.inkSoft} />
                      <Text style={[styles.exportButtonText, { color: C.inkSoft }]}>Open form in tab</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}

              {busy && (
                <View style={styles.busyOverlay} pointerEvents="auto">
                  <ActivityIndicator color={C.primary} />
                  <Text style={styles.busyText}>Saving…</Text>
                </View>
              )}
            </View>
          );
        })}

        <Text style={styles.footer}>AUREA · Municipality of Pateros · {user?.firstName || 'Admin'}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Detail({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <View style={[styles.detail, wide && { width: '100%' }]}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue} numberOfLines={3}>{value}</Text>
    </View>
  );
}

function Requirement({ label, submitted }: { label: string; submitted?: boolean }) {
  return (
    <View style={styles.requirementRow}>
      <Ionicons name={submitted ? 'checkmark-circle' : 'close-circle-outline'} size={18} color={submitted ? C.good : C.danger} />
      <Text style={[styles.requirementText, !submitted && styles.requirementMissing]}>{label}</Text>
      <View style={[styles.reqBadge, { backgroundColor: submitted ? C.goodSoft : C.dangerSoft }]}>
        <Text style={[styles.requirementState, { color: submitted ? C.good : C.danger }]}>{submitted ? 'Submitted' : 'Missing'}</Text>
      </View>
    </View>
  );
}

function DocumentLink({ label, url }: { label: string; url: string }) {
  return (
    <TouchableOpacity style={styles.documentLink} onPress={() => Linking.openURL(url)} accessibilityRole="link" accessibilityLabel={`Open ${label}`}>
      <Ionicons name="document-text-outline" size={15} color={C.primaryDark} />
      <Text style={styles.documentLinkText}>{label}</Text>
    </TouchableOpacity>
  );
}

const cardShadow = Platform.select({
  web: { boxShadow: '0 1px 2px rgba(19,32,26,0.06), 0 6px 16px rgba(19,32,26,0.05)' } as object,
  default: { shadowColor: '#13201A', shadowOpacity: 0.07, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  container: { padding: 20, paddingBottom: 44, maxWidth: Platform.OS === 'web' ? undefined : 760, width: '100%', alignSelf: 'center' },

  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  backButton: { width: 42, height: 42, borderRadius: 14, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.line },
  refreshButton: { width: 42, height: 42, borderRadius: 14, backgroundColor: C.primarySoft, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1 },
  title: { fontFamily: 'FraunTitle', fontSize: 26, color: C.ink },
  subtitle: { fontFamily: 'InterBody', fontSize: 12, lineHeight: 17, color: C.inkSoft, marginTop: 2 },

  summaryCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.primaryDark, borderRadius: 22, paddingVertical: 20, paddingHorizontal: 20, marginBottom: 18, ...cardShadow },
  summaryItem: { minWidth: 70 },
  summaryLabel: { fontFamily: 'InterBody', fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  summaryValue: { fontFamily: 'FraunTitle', fontSize: 30, color: C.card },
  summaryDivider: { width: 1, height: 42, backgroundColor: 'rgba(255,255,255,0.2)', marginHorizontal: 16 },
  summaryIcon: { marginLeft: 'auto' },

  filters: { gap: 8, paddingBottom: 14 },
  filter: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: C.line, borderRadius: 20, paddingLeft: 14, paddingRight: 8, paddingVertical: 7, backgroundColor: C.card },
  filterActive: { backgroundColor: C.primary, borderColor: C.primary },
  filterText: { fontFamily: 'InterBody', fontSize: 13, color: C.inkSoft },
  filterTextActive: { color: C.card, fontWeight: '700' },
  filterCount: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' },
  filterCountActive: { backgroundColor: C.primarySoft },
  filterCountText: { fontFamily: 'InterBody', fontSize: 11, fontWeight: '700', color: C.inkSoft },

  loader: { padding: 30 },
  errorCard: { alignItems: 'center', gap: 8, backgroundColor: C.dangerSoft, borderRadius: 18, padding: 22, marginBottom: 14 },
  errorText: { fontFamily: 'InterBody', fontSize: 13, color: C.danger, textAlign: 'center' },
  retryButton: { marginTop: 4, backgroundColor: C.danger, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 9 },
  retryText: { fontFamily: 'InterBody', fontWeight: '700', color: '#FFF', fontSize: 13 },
  emptyCard: { alignItems: 'center', backgroundColor: C.card, borderRadius: 20, padding: 34, borderWidth: 1, borderColor: C.line },
  emptyIcon: { width: 58, height: 58, borderRadius: 29, backgroundColor: C.primarySoft, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontFamily: 'InterBody', fontWeight: '700', fontSize: 16, color: C.ink, marginTop: 12 },
  emptyText: { fontFamily: 'InterBody', fontSize: 13, lineHeight: 19, color: C.inkFaint, textAlign: 'center', marginTop: 5 },

  applicationCard: { backgroundColor: C.card, borderRadius: 20, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: C.line, borderLeftWidth: 5, overflow: 'hidden', ...cardShadow },
  applicationHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.primarySoft, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: 'InterBody', fontWeight: '800', fontSize: 14, color: C.primaryDark },
  applicantCopy: { flex: 1 },
  applicantName: { fontFamily: 'InterBody', fontWeight: '700', fontSize: 16, color: C.ink },
  applicantMeta: { fontFamily: 'InterBody', fontSize: 12, color: C.inkFaint, marginTop: 2 },
  headerRight: { alignItems: 'flex-end', gap: 6 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
  statusPillText: { fontFamily: 'InterBody', fontSize: 11, fontWeight: '700' },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  categoryBadge: { borderRadius: 8, paddingHorizontal: 9, paddingVertical: 5, backgroundColor: C.primarySoft },
  categoryText: { fontFamily: 'InterBody', fontWeight: '700', fontSize: 11, color: C.primaryDark },
  progressTrack: { height: 5, borderRadius: 3, backgroundColor: '#EEF2EB', marginTop: 12, overflow: 'hidden' },
  progressFill: { height: 5, borderRadius: 3 },

  detailGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, backgroundColor: '#F8FAF6', borderRadius: 14, padding: 14, marginTop: 16 },
  detail: { width: '47%' },
  detailLabel: { fontFamily: 'InterBody', fontSize: 11, color: C.inkFaint },
  detailValue: { fontFamily: 'InterBody', fontSize: 13, fontWeight: '600', color: C.ink, marginTop: 3 },

  section: { borderTopWidth: 1, borderTopColor: C.line, marginTop: 16, paddingTop: 14 },
  sectionTitle: { fontFamily: 'InterBody', fontSize: 13, fontWeight: '700', color: C.ink, marginBottom: 8 },
  sectionGap: { marginTop: 16 },

  requirementRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  requirementText: { flex: 1, fontFamily: 'InterBody', fontSize: 13, color: C.inkSoft },
  requirementMissing: { color: C.danger },
  reqBadge: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  requirementState: { fontFamily: 'InterBody', fontSize: 11, fontWeight: '700' },
  documentLinks: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  documentLink: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 10, borderWidth: 1, borderColor: C.primary, backgroundColor: C.card, paddingHorizontal: 11, paddingVertical: 8 },
  documentLinkText: { fontFamily: 'InterBody', fontSize: 12, fontWeight: '700', color: C.primaryDark },

  statusOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statusOption: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1.5, borderColor: C.line, borderRadius: 12, paddingHorizontal: 11, paddingVertical: 9, backgroundColor: C.bg },
  statusOptionText: { fontFamily: 'InterBody', fontSize: 12, fontWeight: '700' },

  amountWrap: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: C.line, borderRadius: 12, backgroundColor: C.bg, paddingHorizontal: 12 },
  currency: { fontFamily: 'InterBody', fontSize: 16, fontWeight: '700', color: C.inkSoft, marginRight: 6 },
  amountInput: { flex: 1, paddingVertical: 11, fontFamily: 'InterBody', fontSize: 15, color: C.ink, ...Platform.select({ web: { outlineStyle: 'none' } as any }) },
  hint: { fontFamily: 'InterBody', fontSize: 11, color: C.inkFaint, marginTop: 5 },
  findingsInput: { minHeight: 92, borderWidth: 1, borderColor: C.line, borderRadius: 12, backgroundColor: C.bg, padding: 12, fontFamily: 'InterBody', fontSize: 13, lineHeight: 19, color: C.ink, ...Platform.select({ web: { outlineStyle: 'none' } as any }) },
  saveFindingsButton: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 12, backgroundColor: C.primary, paddingHorizontal: 14, paddingVertical: 10, marginTop: 10 },
  saveFindingsText: { fontFamily: 'InterBody', fontSize: 12, fontWeight: '700', color: '#FFF' },

  actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, borderTopWidth: 1, borderTopColor: C.line, marginTop: 16, paddingTop: 14 },
  exportButton: { flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 12, backgroundColor: C.primarySoft, paddingHorizontal: 12, paddingVertical: 9 },
  exportButtonAlt: { backgroundColor: '#E7EDE8' },
  exportButtonText: { fontFamily: 'InterBody', fontSize: 12, fontWeight: '700', color: C.primaryDark },

  busyOverlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(255,255,255,0.78)', alignItems: 'center', justifyContent: 'center', gap: 6 },
  busyText: { fontFamily: 'InterBody', fontSize: 12, fontWeight: '600', color: C.inkSoft },

  footer: { textAlign: 'center', fontFamily: 'InterBody', fontSize: 11, color: C.inkFaint, marginTop: 18 },
});
