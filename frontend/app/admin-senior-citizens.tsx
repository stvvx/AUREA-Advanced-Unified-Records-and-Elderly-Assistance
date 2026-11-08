import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { WebView } from 'react-native-webview';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { API_BASE_URL } from '../services/loloApi';
import { useAuth } from '../context/AuthContext';

type Senior = Record<string, unknown>;
const columns = [
  ['id', 'Record ID', 100], ['oscaIdNumber', 'OSCA ID', 170],
  ['lastName', 'Last name', 170], ['firstName', 'First name', 170], ['middleName', 'Middle name', 170],
  ['dob', 'Date of birth', 150], ['age', 'Age', 80], ['gender', 'Gender', 120],
  ['civilStatus', 'Civil status', 140], ['contact', 'Contact number', 180],
  ['email', 'Email', 260], ['address', 'Residential address', 340],
  ['spouse', 'Spouse', 200], ['children', 'Children', 340],
  ['monthlyIncome', 'Monthly income', 160], ['sourceOfIncome', 'Source of income', 220],
  ['occupation', 'Occupation', 200], ['category', 'Category', 180],
  ['avatarUrl', 'Photo / face enrollment', 190], ['birthCertificate', 'Birth certificate', 180],
  ['digitalSignature', 'Digital signature', 180], ['role', 'Role', 140], ['createdAt', 'Registered on', 230],
] as const;
const tableWidth = columns.reduce((total, [, , width]) => total + width, 0);
const documents = new Set(['avatarUrl', 'birthCertificate', 'digitalSignature']);
type SortKey = typeof columns[number][0];

const barangays = [
  'Aguho', 'Magtanggol', 'Martires Del 96', 'Poblacion', 'San Pedro',
  'San Roque', 'Santa Ana', 'Santo Rosario-Kanluran', 'Santo Rosario-Silangan', 'Tabacalera',
];

const C = {
  bg: '#F2F5EF', surface: '#FFFFFF', ink: '#13201A', muted: '#5B6E62', line: '#E1E9DD',
  brand: '#1F5C3E', brandDark: '#0F3323', brandSoft: '#E1F1E7', amber: '#A8620B', amberSoft: '#FCEFD6',
  danger: '#B3432E', dangerSoft: '#FBE7E2', zebra: '#F8FAF6',
};

function barangayOf(record: Senior): string | null {
  const normalize = (value: unknown) => String(value ?? '').toLowerCase()
    .replace(/\bsta\.?\s+/g, 'santa ').replace(/\bsto\.?\s+/g, 'santo ')
    .replace(/[^a-z0-9]+/g, ' ').trim();
  const address = ` ${normalize(record.barangay || record.address)} `;
  return barangays.find(name => address.includes(` ${normalize(name)} `))
    ?? (typeof record.barangay === 'string' && record.barangay.trim() ? record.barangay.trim() : null);
}

function cellValue(record: Senior, key: SortKey): unknown {
  if (key === 'age') return ageOf(record.dob);
  return record[key];
}

function sortValue(record: Senior, key: SortKey): string | number | null {
  const value = cellValue(record, key);
  if (value === null || value === undefined || value === '') return null;
  if (documents.has(key)) return value ? 1 : 0;
  if (key === 'id' || key === 'age' || key === 'monthlyIncome') {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }
  if (key === 'dob' || key === 'createdAt') {
    const timestamp = Date.parse(key === 'dob' ? birthday(value) : String(value));
    return Number.isFinite(timestamp) ? timestamp : null;
  }
  if (key === 'children' && Array.isArray(value)) return value.map(child => String(child?.name ?? '')).join(', ');
  return String(value).trim();
}

function ageOf(value: unknown): number | null {
  const text = String(value ?? '');
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  const slash = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!iso && !slash) return null;
  const [year, month, day] = iso ? [Number(iso[1]), Number(iso[2]), Number(iso[3])]
    : [Number(slash![3]), Number(slash![1]), Number(slash![2])];
  const birth = new Date(year, month - 1, day);
  if (birth.getFullYear() !== year || birth.getMonth() !== month - 1 || birth.getDate() !== day) return null;
  const today = new Date();
  return today.getFullYear() - year - Number(today.getMonth() < month - 1
    || (today.getMonth() === month - 1 && today.getDate() < day));
}

function birthday(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw) return 'Not provided';
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:T.*)?$/);
  const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!iso && !slash) return raw;
  const [year, month, day] = iso ? [Number(iso[1]), Number(iso[2]), Number(iso[3])]
    : [Number(slash![3]), Number(slash![1]), Number(slash![2])];
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return raw;
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function display(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (Array.isArray(value)) return value.length ? value.map(display).join('\n') : '—';
  if (typeof value === 'object') return Object.entries(value).map(([key, item]) => `${key}: ${display(item)}`).join(', ');
  return String(value);
}

function StatCard({ label, value, tone }: { label: string; value: string | number; tone?: 'brand' | 'amber' }) {
  return (
    <View style={s.stat}>
      <Text style={[s.statValue, tone === 'amber' && { color: C.amber }]}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

function Pill({ text, tone }: { text: string; tone: 'good' | 'warn' | 'neutral' }) {
  const bg = tone === 'good' ? C.brandSoft : tone === 'warn' ? C.amberSoft : C.zebra;
  const fg = tone === 'good' ? C.brand : tone === 'warn' ? C.amber : C.muted;
  return <View style={[s.pill, { backgroundColor: bg }]}><Text style={[s.pillText, { color: fg }]}>{text}</Text></View>;
}

export default function AdminSeniorCitizens() {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const compact = screenWidth < 600;
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const role = String(user?.role ?? '').trim().toLowerCase();
  const allowed = ['osca admin', 'super admin'].includes(role);
  const [records, setRecords] = useState<Senior[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [selectedBarangay, setSelectedBarangay] = useState('All barangays');
  const [barangayMenuOpen, setBarangayMenuOpen] = useState(false);
  const [preview, setPreview] = useState<{ uri: string; title: string; pdf: boolean } | null>(null);
  const [previewError, setPreviewError] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('lastName');
  const [ascending, setAscending] = useState(true);
  const chooseSort = (key: SortKey) => {
    if (key === sortKey) setAscending(current => !current);
    else { setSortKey(key); setAscending(true); }
  };
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/users`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Could not load senior citizens.');
      setRecords(data.users ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load senior citizens.');
    } finally {
      setLoading(false);
    }
  }, []);
  useFocusEffect(useCallback(() => { if (!authLoading && allowed) void load(); }, [authLoading, allowed, load]));
  const seniors = useMemo(() => records.filter((record) => {
    const age = ageOf(record.dob);
    return !['admin', 'osca admin', 'med admin', 'super admin'].includes(String(record.role ?? 'user').toLowerCase())
      && age !== null && age >= 60;
  }).sort((a, b) => {
    for (const key of ['lastName', 'firstName', 'middleName']) {
      const comparison = String(a[key] ?? '').trim().localeCompare(String(b[key] ?? '').trim(), 'en', { sensitivity: 'base' });
      if (comparison) return comparison;
    }
    return 0;
  }), [records]);
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return seniors.filter((record) => {
      const barangay = barangayOf(record);
      const matchesBarangay = selectedBarangay === 'All barangays'
        || (selectedBarangay === 'Unspecified barangay' ? !barangay : barangay === selectedBarangay);
      return matchesBarangay && (!term || columns.some(([key]) => !documents.has(key)
        && display(cellValue(record, key)).toLowerCase().includes(term)));
    }).sort((a, b) => {
        const left = sortValue(a, sortKey);
        const right = sortValue(b, sortKey);
        // Keep missing values at the bottom in either direction.
        if (left === null) return right === null ? 0 : 1;
        if (right === null) return -1;
        const comparison = typeof left === 'number' && typeof right === 'number' ? left - right
          : String(left).localeCompare(String(right), 'en', { sensitivity: 'base', numeric: true });
        return ascending ? comparison : -comparison;
      });
  }, [seniors, query, sortKey, ascending, selectedBarangay]);

  const stats = useMemo(() => ({
    enrolledFaces: seniors.filter(r => !!r.avatarUrl).length,
    signed: seniors.filter(r => typeof r.digitalSignature === 'string' && r.digitalSignature.trim()).length,
  }), [seniors]);
  const hasFilters = !!query.trim() || selectedBarangay !== 'All barangays';
  const clearFilters = () => { setQuery(''); setSelectedBarangay('All barangays'); setBarangayMenuOpen(false); };

  const openDocument = (value: unknown, title: string) => {
    const url = String(value ?? '');
    if (!/^https?:\/\//i.test(url) && !url.startsWith('data:image/') && !url.startsWith('/')) {
      setError('This document does not have a supported file link.');
      return;
    }
    setPreviewError('');
    setPreview({ uri: url.startsWith('/') ? `${API_BASE_URL}${url}` : url, title, pdf: /\.pdf(?:[?#]|$)/i.test(url) });
  };

  const renderCell = (record: Senior, key: SortKey, label: string) => {
    const value = cellValue(record, key);
    const empty = value === null || value === undefined || value === '';

    if (key === 'digitalSignature') {
      const enrolled = typeof value === 'string' && value.trim();
      return <Pill text={enrolled ? 'Enrolled' : 'Not enrolled'} tone={enrolled ? 'good' : 'warn'} />;
    }
    if (key === 'children' && Array.isArray(value) && value.length > 0) {
      return value.map((child, childIndex) => {
        const details: Record<string, unknown> = child && typeof child === 'object' ? child : { name: child };
        return (
          <View key={String(details.id ?? childIndex)} style={s.child}>
            <Text selectable style={[s.value, s.childName]}>{String(details.name || 'Name not provided')}</Text>
            <Text selectable style={s.subValue}>Birthday: {birthday(details.dob)}</Text>
          </View>
        );
      });
    }
    if (documents.has(key)) {
      if (!value) return <Pill text="Missing" tone="warn" />;
      return (
        <Pressable
          onPress={() => openDocument(value, `${key === 'avatarUrl' ? 'Photo' : label} — ${record.firstName ?? ''} ${record.lastName ?? ''}`)}
          accessibilityRole="button"
          accessibilityLabel={`View ${label} for ${record.firstName} ${record.lastName}`}
          style={({ pressed }) => [s.docButton, pressed && s.pressed]}
        >
          <Text style={s.docButtonText}>{key === 'avatarUrl' ? 'View photo' : 'View file'}</Text>
        </Pressable>
      );
    }
    if (key === 'lastName') {
      return <Text selectable style={[s.value, s.strong]}>{display(value)}</Text>;
    }
    if (key === 'age') {
      return empty ? <Text style={s.empty}>—</Text> : <Text selectable style={[s.value, s.strong]}>{String(value)}</Text>;
    }
    if (key === 'category' && !empty) return <Pill text={String(value)} tone="good" />;
    if (key === 'role' && !empty) return <Pill text={String(value)} tone="neutral" />;
    if (key === 'monthlyIncome' && !empty && Number.isFinite(Number(value))) {
      return <Text selectable style={s.value}>₱{Number(value).toLocaleString('en-PH')}</Text>;
    }
    if (key === 'createdAt' && !empty) {
      const t = Date.parse(String(value));
      if (Number.isFinite(t)) return <Text selectable style={s.value}>{new Date(t).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</Text>;
    }
    const text = key === 'dob' ? birthday(value) : display(value);
    return <Text selectable style={empty ? s.empty : s.value}>{text}</Text>;
  };

  return (
    <SafeAreaView style={s.page}>
      <ScrollView style={s.pageScroll} contentContainerStyle={s.pageContent} nestedScrollEnabled keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
      <View style={[s.header, compact && s.compactHeader]}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" style={({ pressed }) => [s.ghostButton, pressed && s.pressed]}>
          <Text style={s.ghostButtonText}>‹ Back</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[s.title, compact && s.compactTitle]}>Senior citizens</Text>
          {!compact && <Text style={s.subtitle}>OSCA registry · age 60 and above</Text>}
        </View>
        {allowed && (
          <Pressable onPress={() => void load()} disabled={loading} accessibilityRole="button" style={({ pressed }) => [s.primaryButton, (pressed || loading) && s.pressed]}>
            <Text style={s.primaryButtonText}>{loading ? 'Refreshing…' : 'Refresh'}</Text>
          </Pressable>
        )}
      </View>

      {authLoading ? (
        <View style={s.stateCard}><ActivityIndicator color={C.brand} /><Text style={s.stateText}>Restoring your session…</Text></View>
      ) : !user ? (
        <View style={s.stateCard}>
          <Text style={s.stateTitle}>Session expired</Text>
          <Text style={s.stateText}>Your session is unavailable or has expired. Please sign in again.</Text>
          <Pressable onPress={() => router.replace('/login')} accessibilityRole="button" style={({ pressed }) => [s.primaryButton, pressed && s.pressed]}>
            <Text style={s.primaryButtonText}>Sign in</Text>
          </Pressable>
        </View>
      ) : !allowed ? (
        <View style={s.stateCard}>
          <Text style={s.stateTitle}>Access restricted</Text>
          <Text style={s.stateText}>This account has the role “{user.role || 'user'}”. OSCA or super administrator access is required.</Text>
        </View>
      ) : <>
        <ScrollView horizontal={compact} style={s.statsScroll} contentContainerStyle={[s.statsRow, compact && s.compactStats]} showsHorizontalScrollIndicator={compact} nestedScrollEnabled>
          <StatCard label="Registered seniors" value={seniors.length} />
          <StatCard label="Matching filters" value={filtered.length} />
          <StatCard label="Photos enrolled" value={`${stats.enrolledFaces}/${seniors.length}`} />
          <StatCard label="Signatures enrolled" value={`${stats.signed}/${seniors.length}`} tone="amber" />
        </ScrollView>

        <View style={s.toolbar}>
          <View style={s.searchWrap}>
            <Text style={s.searchIcon}>⌕</Text>
            <TextInput style={s.search} value={query} onChangeText={setQuery} placeholder="Search name, OSCA ID, address, contact…" placeholderTextColor="#8A9A90" accessibilityLabel="Search senior citizens" autoCapitalize="none" autoCorrect={false} />
            {!!query && (
              <Pressable onPress={() => setQuery('')} accessibilityRole="button" accessibilityLabel="Clear search" style={s.clearButton}>
                <Text style={s.clearText}>✕</Text>
              </Pressable>
            )}
          </View>
          <View style={[s.barangayFilter, compact && s.barangayFilterMobile]}>
            <Pressable style={({ pressed }) => [s.barangaySelect, barangayMenuOpen && s.barangaySelectOpen, pressed && s.pressed]} onPress={() => setBarangayMenuOpen(open => !open)} accessibilityRole="button" accessibilityLabel={`Select barangay. ${selectedBarangay}`} accessibilityState={{ expanded: barangayMenuOpen }}>
              <View style={{ flex: 1 }}>
                <Text style={s.selectLabel}>Barangay</Text>
                <Text style={s.selectValue} numberOfLines={1}>{selectedBarangay}</Text>
              </View>
              <Text style={s.chevron}>{barangayMenuOpen ? '▴' : '▾'}</Text>
            </Pressable>
            {barangayMenuOpen && <ScrollView style={s.barangayMenu} nestedScrollEnabled keyboardShouldPersistTaps="handled">
              {['All barangays', ...barangays, 'Unspecified barangay'].map(name => {
                const active = selectedBarangay === name;
                return (
                  <Pressable key={name} style={({ pressed }) => [s.barangayOption, active && s.barangaySelected, pressed && s.pressed]} accessibilityRole="button" accessibilityState={{ selected: active }} onPress={() => { setSelectedBarangay(name); setBarangayMenuOpen(false); }}>
                    <Text style={[s.value, active && s.strong]}>{name}</Text>
                    {active && <Text style={s.check}>✓</Text>}
                  </Pressable>
                );
              })}
            </ScrollView>}
          </View>
        </View>

        <View style={s.metaRow}>
          <Text style={s.count}>Showing {filtered.length} of {seniors.length} · Scroll sideways for all details</Text>
          {hasFilters && (
            <Pressable onPress={clearFilters} accessibilityRole="button" style={({ pressed }) => [s.clearFilters, pressed && s.pressed]}>
              <Text style={s.clearFiltersText}>Clear filters</Text>
            </Pressable>
          )}
        </View>

        {!!error && <View style={s.errorBanner} accessibilityRole="alert"><Text style={s.errorText}>{error}</Text></View>}

        {loading ? <View style={s.stateCard}><ActivityIndicator color={C.brand} /><Text style={s.stateText}>Loading senior citizens…</Text></View>
          : filtered.length === 0 ? (
            <View style={s.stateCard}>
              <Text style={s.stateTitle}>{hasFilters ? 'No matches' : 'No senior citizens yet'}</Text>
              <Text style={s.stateText}>{hasFilters ? 'Try a different search or clear the filters.' : 'Registered seniors aged 60 and above will appear here.'}</Text>
              {hasFilters && <Pressable onPress={clearFilters} accessibilityRole="button" style={({ pressed }) => [s.primaryButton, pressed && s.pressed]}><Text style={s.primaryButtonText}>Clear filters</Text></Pressable>}
            </View>
          ) : (
          <ScrollView horizontal style={[s.table, compact && { flex: 0, height: Math.max(420, screenHeight * 0.72) }]} contentContainerStyle={s.tableContent} nestedScrollEnabled directionalLockEnabled showsHorizontalScrollIndicator keyboardShouldPersistTaps="handled">
            <View style={{ width: tableWidth, height: '100%' }}>
              <View style={[s.row, s.tableHeader]}>
                {columns.map(([key, label, width]) => {
                  const active = sortKey === key;
                  return (
                    <Pressable key={key} onPress={() => chooseSort(key)} accessibilityRole="button" accessibilityLabel={`Sort by ${label}, ${active && ascending ? 'descending' : 'ascending'}`} style={({ pressed }) => [s.cell, s.columnHeading, { width }, active && s.activeHeading, pressed && s.pressed]}>
                      <Text style={[s.heading, s.columnLabel]} numberOfLines={1}>{label}</Text>
                      <Text style={[s.heading, !active && s.inactiveArrow]}>{active ? ascending ? '↑' : '↓' : '↕'}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <ScrollView style={s.tableBody} nestedScrollEnabled directionalLockEnabled keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator>
                {filtered.map((record, index) => (
                  <View key={String(record.id ?? index)} style={[s.row, index % 2 === 1 && s.alternate]}>
                    {columns.map(([key, label, width]) => (
                      <View key={key} style={[s.cell, s.bodyCell, { width }]}>{renderCell(record, key, label)}</View>
                    ))}
                  </View>
                ))}
              </ScrollView>
            </View>
          </ScrollView>
        )}
      </>}
      </ScrollView>

      <Modal visible={preview !== null} animationType="slide" onRequestClose={() => setPreview(null)}>
        <SafeAreaView style={s.previewPage}>
          <View style={s.previewHeader}>
            <Text style={s.previewTitle} numberOfLines={2}>{preview?.title}</Text>
            <Pressable onPress={() => setPreview(null)} accessibilityRole="button" style={({ pressed }) => [s.primaryButton, pressed && s.pressed]}>
              <Text style={s.primaryButtonText}>Close</Text>
            </Pressable>
          </View>
          <View style={s.previewFrame}>
            {!!previewError ? <View style={s.errorBanner}><Text style={s.errorText}>{previewError}</Text></View> : preview && (
              preview.pdf ? Platform.OS === 'web' ? React.createElement('iframe', {
                src: preview.uri, title: preview.title, style: { width: '100%', flex: 1, border: 'none' },
              }) : <WebView
                source={{ uri: Platform.OS === 'android' ? `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(preview.uri)}` : preview.uri }}
                style={s.previewContent} startInLoadingState
                renderLoading={() => <ActivityIndicator color={C.brand} />}
                onError={() => setPreviewError('Could not load this document. Close the preview and try again.')}
                setSupportMultipleWindows={false}
              /> : <Image source={{ uri: preview.uri }} style={s.previewContent} resizeMode="contain" onError={() => setPreviewError('Could not load this image. Close the preview and try again.')} />
            )}
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const shadow = Platform.select({
  web: { boxShadow: '0 1px 2px rgba(19,32,26,0.06), 0 4px 12px rgba(19,32,26,0.05)' } as object,
  default: { shadowColor: '#13201A', shadowOpacity: 0.07, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
});

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: C.bg, paddingHorizontal: 20, paddingTop: 12 },
  pageScroll: { flex: 1 },
  pageContent: { flexGrow: 1, paddingBottom: 16 },
  compactHeader: { gap: 8, marginBottom: 12 },
  compactTitle: { fontSize: 20 },
  pressed: { opacity: 0.7 },

  header: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 18 },
  title: { fontSize: 26, fontWeight: '800', color: C.ink, letterSpacing: -0.4 },
  subtitle: { fontSize: 13, color: C.muted, marginTop: 2 },
  ghostButton: { paddingVertical: 9, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface },
  ghostButtonText: { color: C.brand, fontWeight: '700' },
  primaryButton: { paddingVertical: 10, paddingHorizontal: 18, borderRadius: 999, backgroundColor: C.brand, alignItems: 'center', alignSelf: 'flex-start' },
  primaryButtonText: { color: '#FFF', fontWeight: '700' },

  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 16 },
  statsScroll: { flexGrow: 0, flexShrink: 0 },
  compactStats: { flexWrap: 'nowrap', gap: 8 },
  stat: { flexGrow: 1, flexBasis: 140, backgroundColor: C.surface, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 16, borderWidth: 1, borderColor: C.line, ...shadow },
  statValue: { fontSize: 24, fontWeight: '800', color: C.brand, letterSpacing: -0.3 },
  statLabel: { fontSize: 12, color: C.muted, marginTop: 2 },

  toolbar: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'flex-start', zIndex: 10 },
  searchWrap: { flex: 1, minWidth: 260, flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderRadius: 12, paddingHorizontal: 12, height: 56, ...shadow },
  searchIcon: { fontSize: 22, color: C.muted, marginRight: 8 },
  search: { flex: 1, fontSize: 15, color: C.ink, paddingVertical: 12, ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null) },
  clearButton: { width: 28, height: 28, borderRadius: 14, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' },
  clearText: { color: C.muted, fontSize: 12, fontWeight: '700' },

  barangayFilter: { width: 260, maxWidth: '100%', zIndex: 20 },
  barangayFilterMobile: { width: '100%' },
  barangaySelect: { flexDirection: 'row', alignItems: 'center', height: 56, paddingHorizontal: 14, borderWidth: 1, borderColor: C.line, borderRadius: 12, backgroundColor: C.surface, ...shadow },
  barangaySelectOpen: { borderColor: C.brand },
  selectLabel: { fontSize: 11, color: C.muted },
  selectValue: { fontSize: 15, fontWeight: '600', color: C.ink },
  chevron: { color: C.brand, fontSize: 16, marginLeft: 8 },
  barangayMenu: { maxHeight: 240, flexGrow: 0, marginTop: 6, borderWidth: 1, borderColor: C.line, borderRadius: 12, backgroundColor: C.surface, ...shadow },
  barangayOption: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14 },
  barangaySelected: { backgroundColor: C.brandSoft },
  check: { color: C.brand, fontWeight: '800' },

  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginVertical: 14 },
  count: { color: C.muted, fontSize: 13 },
  clearFilters: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, backgroundColor: C.brandSoft },
  clearFiltersText: { color: C.brand, fontWeight: '700', fontSize: 13 },

  errorBanner: { backgroundColor: C.dangerSoft, borderRadius: 10, padding: 12, marginBottom: 14, borderLeftWidth: 4, borderLeftColor: C.danger },
  errorText: { color: C.danger, fontWeight: '600' },

  stateCard: { backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.line, padding: 28, alignItems: 'center', gap: 10, ...shadow },
  stateTitle: { fontSize: 18, fontWeight: '700', color: C.ink },
  stateText: { color: C.muted, textAlign: 'center', lineHeight: 21 },

  table: { flex: 1, minHeight: 420, borderWidth: 1, borderColor: C.line, borderRadius: 16, backgroundColor: C.surface, marginBottom: 12, overflow: 'hidden', ...shadow },
  tableContent: { width: tableWidth },
  tableBody: { flex: 1 },
  row: { width: tableWidth, flexDirection: 'row', flexWrap: 'nowrap', borderBottomWidth: 1, borderBottomColor: C.line },
  tableHeader: { backgroundColor: C.brandDark, borderBottomWidth: 0 },
  heading: { color: '#FFF', fontWeight: '700', fontSize: 13 },
  columnHeading: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRightColor: 'rgba(255,255,255,0.12)' },
  activeHeading: { backgroundColor: C.brand },
  columnLabel: { flex: 1 },
  inactiveArrow: { opacity: 0.45 },
  cell: { flexShrink: 0, paddingVertical: 14, paddingHorizontal: 14, justifyContent: 'center', borderRightWidth: 1, borderRightColor: C.line },
  bodyCell: { alignItems: 'flex-start' },
  alternate: { backgroundColor: C.zebra },

  value: { color: C.ink, lineHeight: 21, fontSize: 14 },
  subValue: { color: C.muted, lineHeight: 18, fontSize: 12 },
  strong: { fontWeight: '700' },
  empty: { color: '#A3B0A8' },
  child: { paddingVertical: 6 },
  childName: { fontWeight: '600' },


  pill: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999, alignSelf: 'flex-start' },
  pillText: { fontSize: 12, fontWeight: '700' },
  docButton: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: C.brand, backgroundColor: C.surface },
  docButtonText: { color: C.brand, fontWeight: '700', fontSize: 13 },

  previewPage: { flex: 1, padding: 20, backgroundColor: C.bg },
  previewHeader: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 },
  previewTitle: { flex: 1, fontSize: 18, fontWeight: '700', color: C.ink },
  previewFrame: { flex: 1, borderRadius: 16, overflow: 'hidden', backgroundColor: C.surface, borderWidth: 1, borderColor: C.line },
  previewContent: { flex: 1, width: '100%' },
});
