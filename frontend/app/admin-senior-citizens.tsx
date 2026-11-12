import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { API_BASE_URL } from '../services/loloApi';
import { useAuth } from '../context/AuthContext';
import { downloadSeniorTable, type ExportCell } from '../services/seniorTableExport';

type Senior = Record<string, unknown>;
const fields = [
  ['id', 'Record ID'], ['oscaIdNumber', 'OSCA ID'],
  ['lastName', 'Last name'], ['firstName', 'First name'], ['middleName', 'Middle name'],
  ['dob', 'Date of birth'], ['age', 'Age'], ['gender', 'Gender'],
  ['civilStatus', 'Civil status'], ['contact', 'Contact number'],
  ['email', 'Email'], ['address', 'Residential address'],
  ['spouse', 'Spouse'], ['children', 'Children'],
  ['monthlyIncome', 'Monthly income'], ['sourceOfIncome', 'Source of income'],
  ['occupation', 'Occupation'], ['category', 'Category'],
  ['avatarUrl', 'Photo / face enrollment'], ['birthCertificate', 'Birth certificate'],
  ['digitalSignature', 'Digital signature'], ['role', 'Role'], ['createdAt', 'Registered on'],
] as const;
const documents = new Set(['avatarUrl', 'birthCertificate', 'digitalSignature']);
type SortKey = typeof fields[number][0];

const barangays = [
  'Aguho', 'Magtanggol', 'Martires Del 96', 'Poblacion', 'San Pedro',
  'San Roque', 'Santa Ana', 'Santo Rosario-Kanluran', 'Santo Rosario-Silangan', 'Tabacalera',
];

const C = {
  bg: '#F2F5EF', surface: '#FFFFFF', ink: '#13201A', muted: '#5B6E62', line: '#E1E9DD',
  brand: '#1F5C3E', brandMid: '#2B7A50', brandDark: '#0F3323', brandSoft: '#E1F1E7',
  amber: '#A8620B', amberSoft: '#FCEFD6', gold: '#F2C879',
  blue: '#2F5597', blueSoft: '#E3ECFA',
  danger: '#B3432E', dangerSoft: '#FBE7E2', zebra: '#F8FAF6', hover: '#EEF5F0', selected: '#E8F3EC',
};

const avatarTones: readonly (readonly [string, string])[] = [
  ['#E1F1E7', '#1F5C3E'], ['#FCEFD6', '#A8620B'], ['#E3ECFA', '#2F5597'],
  ['#F3E6F5', '#7B3F8C'], ['#FBE7E2', '#B3432E'],
];

function initialsOf(record: Senior): string {
  const first = String(record.firstName ?? '').trim().charAt(0);
  const last = String(record.lastName ?? '').trim().charAt(0);
  return (first + last).toUpperCase() || '?';
}

function toneOf(record: Senior): readonly [string, string] {
  const seed = Number(record.id);
  const index = Number.isFinite(seed) ? Math.abs(seed) : initialsOf(record).charCodeAt(0);
  return avatarTones[index % avatarTones.length];
}

function Avatar({ record, size = 34 }: { record: Senior; size?: number }) {
  const [bg, fg] = toneOf(record);
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: fg, fontFamily: 'InterBody', fontSize: size * 0.38, fontWeight: '800' }}>{initialsOf(record)}</Text>
    </View>
  );
}

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

type StatTone = 'brand' | 'amber' | 'blue';
const statTones: Record<StatTone, { bg: string; fg: string }> = {
  brand: { bg: C.brandSoft, fg: C.brand },
  amber: { bg: C.amberSoft, fg: C.amber },
  blue: { bg: C.blueSoft, fg: C.blue },
};

function StatCard({ label, value, icon, tone = 'brand', progress, compact }: {
  label: string; value: string | number; icon: React.ComponentProps<typeof Ionicons>['name'];
  tone?: StatTone; progress?: number; compact?: boolean;
}) {
  const palette = statTones[tone];
  return (
    <View style={[s.stat, compact && s.statCompact]}>
      <View style={s.statTop}>
        <View style={[s.statIcon, { backgroundColor: palette.bg }]}>
          <Ionicons name={icon} size={18} color={palette.fg} />
        </View>
        <Text style={s.statLabel} numberOfLines={1}>{label}</Text>
      </View>
      <Text style={s.statValue}>{value}</Text>
      {progress !== undefined && (
        <View style={s.progressTrack} accessibilityLabel={`${label}: ${progress}%`}>
          <View style={[s.progressFill, { width: `${Math.max(0, Math.min(100, progress))}%`, backgroundColor: palette.fg }]} />
        </View>
      )}
    </View>
  );
}

function Pill({ text, tone }: { text: string; tone: 'good' | 'warn' | 'neutral' }) {
  const bg = tone === 'good' ? C.brandSoft : tone === 'warn' ? C.amberSoft : C.zebra;
  const fg = tone === 'good' ? C.brand : tone === 'warn' ? C.amber : C.muted;
  return (
    <View style={[s.pill, { backgroundColor: bg }]}>
      <View style={[s.pillDot, { backgroundColor: fg }]} />
      <Text style={[s.pillText, { color: fg }]}>{text}</Text>
    </View>
  );
}

function StateCard({ icon, tone = 'brand', loading, title, text, children }: {
  icon?: React.ComponentProps<typeof Ionicons>['name']; tone?: StatTone | 'danger';
  loading?: boolean; title?: string; text?: string; children?: React.ReactNode;
}) {
  const palette = tone === 'danger' ? { bg: C.dangerSoft, fg: C.danger } : statTones[tone];
  return (
    <View style={s.stateCard}>
      {loading ? <ActivityIndicator color={C.brand} size="large" /> : icon ? (
        <View style={[s.stateIcon, { backgroundColor: palette.bg }]}><Ionicons name={icon} size={30} color={palette.fg} /></View>
      ) : null}
      {!!title && <Text style={s.stateTitle}>{title}</Text>}
      {!!text && <Text style={s.stateText}>{text}</Text>}
      {children}
    </View>
  );
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <Pressable onPress={onRemove} accessibilityRole="button" accessibilityLabel={`Remove filter ${label}`} style={({ pressed }) => [s.chip, pressed && s.pressed]}>
      <Text style={s.chipText} numberOfLines={1}>{label}</Text>
      <Ionicons name="close" size={13} color={C.brand} />
    </Pressable>
  );
}

const nameColumns = fields.filter(([key]) => ['lastName', 'firstName', 'middleName'].includes(key));
const columnWidths: Record<SortKey, number> = {
  id: 110, oscaIdNumber: 170, lastName: 160, firstName: 160, middleName: 160,
  dob: 180, age: 85, gender: 120, civilStatus: 140, contact: 170, email: 260,
  address: 320, spouse: 200, children: 300, monthlyIncome: 170, sourceOfIncome: 190,
  occupation: 200, category: 190, avatarUrl: 185, birthCertificate: 180,
  digitalSignature: 170, role: 140, createdAt: 210,
};
const detailColumns = fields.filter(([key]) => !['lastName', 'firstName', 'middleName'].includes(key))
  .map(([key, label]) => [key, label, columnWidths[key]] as const);
const detailWidth = detailColumns.reduce((sum, [, , width]) => sum + width, 0);
const tableText = (record: Senior, key: SortKey) => display(cellValue(record, key));

const htmlCell: React.CSSProperties = { padding: '10px 16px', borderBottom: `1px solid ${C.line}`, textAlign: 'left', verticalAlign: 'middle', lineHeight: '21px', overflowWrap: 'anywhere' };

function SeniorTable({ records, sort, ascending, onSort, renderCell }: {
  records: Senior[]; sort: SortKey; ascending: boolean; onSort: (key: SortKey) => void;
  renderCell: (record: Senior, key: SortKey, label: string) => React.ReactNode;
}) {
  const { width, height } = useWindowDimensions();
  const compact = width < 700;
  const nameWidth = width < 1100 ? 120 : 160;
  const showAvatar = nameWidth >= 160;
  const frozenWidth = compact ? 190 : nameWidth * 3;
  const tableHeight = Math.max(360, Math.min(820, height * 0.72));
  const [rowHeights, setRowHeights] = useState<Record<string, number>>({});
  const [selectedRow, setSelectedRow] = useState<string | null>(null);
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  const measureRow = (id: string, textHeight: number) => {
    const measured = Math.max(88, Math.ceil(textHeight) + 32);
    setRowHeights(current => measured > (current[id] || 88) ? { ...current, [id]: measured } : current);
  };
  const header = (key: SortKey, label: string) => (
    <Pressable onPress={() => onSort(key)} accessibilityRole="button" accessibilityLabel={`Sort by ${label}, ${sort === key && ascending ? 'descending' : 'ascending'}`} style={t.headingButton}>
      <Text style={[t.heading, sort === key && t.headingActive]} numberOfLines={1}>{label}</Text>
      <Ionicons name={sort === key ? ascending ? 'arrow-up' : 'arrow-down' : 'swap-vertical'} size={13} color={sort === key ? C.gold : '#7FA38E'} />
    </Pressable>
  );
  const identity = (record: Senior) => (
    <View style={t.identityRow} onLayout={Platform.OS === 'web' ? undefined : event => measureRow(String(record.id), event.nativeEvent.layout.height)}>
      <Avatar record={record} size={36} />
      <View style={t.identity}>
        {nameColumns.map(([key, label]) => key === 'middleName' && !record[key] ? null : (
          <Pressable key={key} onPress={() => setSelectedRow(String(record.id))} onFocus={() => setSelectedRow(String(record.id))}
            accessibilityRole="button" accessibilityLabel={`${label}: ${tableText(record, key)}`} accessibilityState={{ selected: selectedRow === String(record.id) }}
            style={t.compactNameCell}>
            <Text style={key === 'lastName' ? t.name : key === 'middleName' ? t.small : t.value}>{tableText(record, key)}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
  const cell = (record: Senior, key: SortKey) => (
    <View onLayout={Platform.OS === 'web' ? undefined : event => measureRow(String(record.id), event.nativeEvent.layout.height)}>
      {renderCell(record, key, fields.find(([field]) => field === key)?.[1] || key)}
    </View>
  );

  if (Platform.OS === 'web') {
    return (
      <div role="region" aria-label="Senior citizen registry. Names stay fixed when scrolling horizontally." tabIndex={0}
        style={{ height: tableHeight, overflow: 'auto', border: `1px solid ${C.line}`, borderRadius: 20, background: C.surface, isolation: 'isolate', boxShadow: '0 1px 2px rgba(19,32,26,0.06), 0 8px 24px rgba(19,32,26,0.06)' }}>
        <table style={{ width: frozenWidth + detailWidth, tableLayout: 'fixed', borderCollapse: 'separate', borderSpacing: 0, fontFamily: 'InterBody, system-ui, sans-serif', fontSize: 13, color: C.ink }}>
          <caption style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clipPath: 'inset(50%)' }}>Senior citizen registry</caption>
          <colgroup>
            {compact ? <col style={{ width: frozenWidth }} /> : nameColumns.map(([key]) => <col key={key} style={{ width: nameWidth }} />)}
            {detailColumns.map(([key, , columnWidth]) => <col key={key} style={{ width: columnWidth }} />)}
          </colgroup>
          <thead><tr>
            {compact ? <th scope="col" style={{ ...htmlCell, position: 'sticky', left: 0, top: 0, zIndex: 4, background: C.brandDark, color: '#FFF', borderBottom: 'none', boxShadow: '3px 0 6px rgba(15,51,35,0.12)' }}>{header('lastName', 'Senior citizen')}</th>
              : nameColumns.map(([key, label], index) => <th key={key} scope="col" aria-sort={sort === key ? ascending ? 'ascending' : 'descending' : 'none'}
                style={{ ...htmlCell, borderBottom: 'none', position: 'sticky', top: 0, left: index * nameWidth, zIndex: 4, background: C.brandDark, boxShadow: index === 2 ? '3px 0 6px rgba(15,51,35,0.12)' : undefined }}>{header(key, label)}</th>)}
            {detailColumns.map(([key, label]) => <th key={key} scope="col" aria-sort={sort === key ? ascending ? 'ascending' : 'descending' : 'none'}
              style={{ ...htmlCell, borderBottom: 'none', position: 'sticky', top: 0, zIndex: 3, background: C.brandDark }}>{header(key, label)}</th>)}
          </tr></thead>
          <tbody>{records.map((record, index) => {
            const id = String(record.id);
            const selected = selectedRow === id;
            const hovered = hoveredRow === id;
            const background = selected ? C.selected : hovered ? C.hover : index % 2 ? C.zebra : C.surface;
            const focusBorder = selected ? `inset 0 2px 0 ${C.brandMid}, inset 0 -2px 0 ${C.brandMid}` : '';
            const [avatarBg, avatarFg] = toneOf(record);
            return <tr key={id} onMouseEnter={() => setHoveredRow(id)} onMouseLeave={() => setHoveredRow(current => current === id ? null : current)}>
              {compact ? <td style={{ ...htmlCell, position: 'sticky', left: 0, zIndex: 2, background, boxShadow: [focusBorder, selected && `inset 2px 0 0 ${C.brandMid}`, '3px 0 6px rgba(15,51,35,0.08)'].filter(Boolean).join(', ') }}>{identity(record)}</td>
                : nameColumns.map(([key, label], nameIndex) => <td key={key} title={documents.has(key) ? undefined : tableText(record, key)} tabIndex={0}
                  aria-label={`${label}: ${tableText(record, key)}${selectedRow === id ? ', selected' : ''}`}
                  onClick={() => setSelectedRow(id)} onFocus={() => setSelectedRow(id)}
                  onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedRow(id); } }}
                  style={{ ...htmlCell, position: 'sticky', left: nameIndex * nameWidth, zIndex: 2,
                    background, cursor: 'pointer', fontWeight: key === 'lastName' ? 700 : 500, transition: 'background 120ms ease',
                    boxShadow: [focusBorder, selected && nameIndex === 0 && `inset 3px 0 0 ${C.brandMid}`, nameIndex === 2 && '3px 0 6px rgba(15,51,35,0.08)'].filter(Boolean).join(', ') }}>
                  {key === 'lastName' && showAvatar ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ width: 30, height: 30, flexShrink: 0, borderRadius: 15, background: avatarBg, color: avatarFg, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800 }}>{initialsOf(record)}</span>
                      <span>{tableText(record, key)}</span>
                    </div>
                  ) : tableText(record, key)}
                </td>)}
              {detailColumns.map(([key]) => <td key={key} title={documents.has(key) ? undefined : tableText(record, key)} style={{ ...htmlCell, background, transition: 'background 120ms ease', boxShadow: [focusBorder, selected && key === 'createdAt' && `inset -2px 0 0 ${C.brandMid}`].filter(Boolean).join(', ') }}>
                <div style={{ maxHeight: 44, overflowY: 'auto' }}>
                  {renderCell(record, key, fields.find(([field]) => field === key)?.[1] || key)}
                </div>
              </td>)}
            </tr>;
          })}</tbody>
        </table>
      </div>
    );
  }
  // A single vertical scroller keeps the frozen and moving cells aligned on native.
  return <View style={[t.nativeTable, { height: tableHeight }]}>
    <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled">
      <View style={t.nativeTableRow}>
        <View style={[t.frozenPane, { width: frozenWidth }]}>
          <View style={[t.nativeHeader, { width: frozenWidth }]}>
            {compact ? <View style={{ width: frozenWidth, paddingHorizontal: 14 }}>{header('lastName', 'Senior citizen')}</View> : nameColumns.map(([key, label]) => <View key={key} style={{ width: nameWidth, paddingHorizontal: 14 }}>{header(key, label)}</View>)}
          </View>
          {records.map((record, index) => <View key={String(record.id)} style={[t.nativeRow, { height: rowHeights[String(record.id)] || 104, backgroundColor: index % 2 ? C.zebra : C.surface }, selectedRow === String(record.id) && t.selectedRow]}>
            {compact ? <View style={t.nativeCell}>{identity(record)}</View> : nameColumns.map(([key, label]) => <Pressable key={key}
              onPress={() => setSelectedRow(String(record.id))} accessibilityRole="button" accessibilityLabel={`${label}: ${tableText(record, key)}`}
              accessibilityState={{ selected: selectedRow === String(record.id) }}
              style={[t.nativeCell, t.nameCell, { width: nameWidth }]}>{cell(record, key)}</Pressable>)}
          </View>)}
        </View>
        <ScrollView horizontal nestedScrollEnabled style={{ flex: 1 }} contentContainerStyle={{ width: detailWidth }} keyboardShouldPersistTaps="handled">
          <View style={{ width: detailWidth }}>
            <View style={t.nativeHeader}>{detailColumns.map(([key, label, columnWidth]) => <View key={key} style={{ width: columnWidth, paddingHorizontal: 16 }}>{header(key, label)}</View>)}</View>
            {records.map((record, index) => <View key={String(record.id)} style={[t.nativeRow, { height: rowHeights[String(record.id)] || 104, backgroundColor: index % 2 ? C.zebra : C.surface }, selectedRow === String(record.id) && t.selectedRow]}>
              {detailColumns.map(([key, , columnWidth]) => <View key={key} style={[t.nativeCell, { width: columnWidth }]}>{cell(record, key)}</View>)}
            </View>)}
          </View>
        </ScrollView>
      </View>
    </ScrollView>
  </View>;
}

export default function AdminSeniorCitizens() {
  const { width: screenWidth } = useWindowDimensions();
  const compact = screenWidth < 600;
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const role = String(user?.role ?? '').trim().toLowerCase();
  const allowed = ['osca admin', 'super admin'].includes(role);
  const [records, setRecords] = useState<Senior[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [selectedBarangay, setSelectedBarangay] = useState('All barangays');
  const [barangayMenuOpen, setBarangayMenuOpen] = useState(false);
  const [preview, setPreview] = useState<{ uri: string; title: string; pdf: boolean } | null>(null);
  const [previewError, setPreviewError] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('lastName');
  const [ascending, setAscending] = useState(true);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [exporting, setExporting] = useState<'pdf' | 'xlsx' | null>(null);
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
      return matchesBarangay && (!term || fields.some(([key]) => !documents.has(key)
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
  const percent = (count: number) => seniors.length ? Math.round((count / seniors.length) * 100) : 0;
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

  const exportTable = async (format: 'pdf' | 'xlsx') => {
    if (exporting || !filtered.length) return;
    if (!user?.token) { setError('Please sign in again before exporting.'); return; }
    setExporting(format);
    setError('');
    const ordered = [...nameColumns, ...fields.filter(([key]) => !['lastName', 'firstName', 'middleName'].includes(key))];
    const rows = filtered.map(record => ordered.map(([key]): ExportCell => {
      const value = cellValue(record, key);
      if (key === 'digitalSignature') return { text: typeof value === 'string' && value.trim() ? 'Enrolled' : 'Not enrolled' };
      if (documents.has(key)) {
        let hyperlink: string | undefined;
        if (typeof value === 'string') {
          if (/^https?:\/\//i.test(value)) hyperlink = value;
          else if (value.startsWith('/')) hyperlink = `${API_BASE_URL}${value}`;
        }
        return { text: value ? key === 'avatarUrl' ? 'View photo' : 'View file' : 'Missing', hyperlink };
      }
      if (key === 'children' && Array.isArray(value)) return { text: value.length ? value.map(child => {
        const details = child && typeof child === 'object' ? child : { name: child };
        return `${details.name || 'Name not provided'}\nBirthday: ${birthday(details.dob)}`;
      }).join('\n\n') : '-' };
      if (key === 'monthlyIncome' && value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value))) {
        return { text: `PHP ${Number(value).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`, value: Number(value), kind: 'currency' };
      }
      if (key === 'dob' && value) {
        const raw = String(value);
        const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        const iso = slash ? `${slash[3]}-${slash[1].padStart(2, '0')}-${slash[2].padStart(2, '0')}` : raw.slice(0, 10);
        return { text: birthday(value), value: iso, kind: 'date' };
      }
      if (key === 'createdAt' && value && Number.isFinite(Date.parse(String(value)))) {
        return { text: new Date(String(value)).toLocaleString('en-US', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' }), value: String(value), kind: 'datetime' };
      }
      if ((key === 'id' || key === 'age') && value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value))) return { text: String(value), value: Number(value) };
      return { text: display(value) };
    }));
    try {
      await downloadSeniorTable({ columns: ordered.map(([key, label]) => ({ key, label })), rows }, format, user.token);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not export the table.');
    } finally { setExporting(null); }
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
          <Ionicons name={key === 'avatarUrl' ? 'image-outline' : 'document-text-outline'} size={15} color={C.brand} />
          <Text style={s.docButtonText}>{key === 'avatarUrl' ? 'View photo' : 'View file'}</Text>
        </Pressable>
      );
    }
    if (key === 'lastName') {
      return <Text selectable style={[s.value, s.strong]}>{display(value)}</Text>;
    }
    if (key === 'age') {
      return empty ? <Text style={s.empty}>—</Text> : <View style={s.agePill}><Text selectable style={s.agePillText}>{String(value)}</Text></View>;
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

  const sortLabel = fields.find(([key]) => key === sortKey)?.[1];
  const exportBusy = loading || !!exporting || !filtered.length;

  return (
    <SafeAreaView style={s.page}>
      <ScrollView style={s.pageScroll} contentContainerStyle={s.pageContent} nestedScrollEnabled keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
      <View style={[s.hero, compact && s.heroCompact]}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back" style={({ pressed }) => [s.heroButton, pressed && s.pressed]}>
          <Ionicons name="arrow-back" size={19} color="#FFF" />
        </Pressable>
        {!compact && <View style={s.heroBadge}><Ionicons name="people" size={22} color={C.gold} /></View>}
        <View style={{ flex: 1 }}>
          {!compact && <Text style={s.eyebrow}>OSCA · Admin</Text>}
          <Text style={[s.title, compact && s.compactTitle]}>Senior citizens</Text>
          {!compact && <Text style={s.subtitle}>OSCA registry · age 60 and above</Text>}
        </View>
        {allowed && (
          <Pressable onPress={() => void load()} disabled={loading} accessibilityRole="button" accessibilityLabel="Refresh senior citizens" style={({ pressed }) => [s.heroButton, (pressed || loading) && s.pressed]}>
            {loading ? <ActivityIndicator color="#FFF" /> : <Ionicons name="refresh" size={19} color="#FFF" />}
          </Pressable>
        )}
      </View>

      {authLoading ? (
        <StateCard loading text="Restoring your session…" />
      ) : !user ? (
        <StateCard icon="time-outline" tone="amber" title="Session expired" text="Your session is unavailable or has expired. Please sign in again.">
          <Pressable onPress={() => router.replace('/login')} accessibilityRole="button" style={({ pressed }) => [s.primaryButton, pressed && s.pressed]}>
            <Text style={s.primaryButtonText}>Sign in</Text>
          </Pressable>
        </StateCard>
      ) : !allowed ? (
        <StateCard icon="lock-closed-outline" tone="danger" title="Access restricted" text={`This account has the role “${user.role || 'user'}”. OSCA or super administrator access is required.`} />
      ) : <>
        <ScrollView horizontal={compact} style={s.statsScroll} contentContainerStyle={[s.statsRow, compact && s.compactStats]} showsHorizontalScrollIndicator={false} nestedScrollEnabled>
          <StatCard compact={compact} icon="people" label="Registered seniors" value={seniors.length} />
          <StatCard compact={compact} icon="funnel" tone="blue" label="Matching filters" value={filtered.length} />
          <StatCard compact={compact} icon="camera" label="Photos enrolled" value={`${stats.enrolledFaces}/${seniors.length}`} progress={percent(stats.enrolledFaces)} />
          <StatCard compact={compact} icon="create" tone="amber" label="Signatures enrolled" value={`${stats.signed}/${seniors.length}`} progress={percent(stats.signed)} />
        </ScrollView>

        <View style={s.toolbar}>
          <View style={[s.searchWrap, searchFocused && s.searchWrapFocused]}>
            <Ionicons name="search" size={19} color={searchFocused ? C.brand : C.muted} style={{ marginRight: 10 }} />
            <TextInput style={s.search} value={query} onChangeText={setQuery} onFocus={() => setSearchFocused(true)} onBlur={() => setSearchFocused(false)}
              placeholder="Search name, OSCA ID, address, contact…" placeholderTextColor="#8A9A90" accessibilityLabel="Search senior citizens" autoCapitalize="none" autoCorrect={false} />
            {!!query && (
              <Pressable onPress={() => setQuery('')} accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={8}>
                <Ionicons name="close-circle" size={20} color="#9FB0A5" />
              </Pressable>
            )}
          </View>
          <View style={[s.barangayFilter, compact && s.barangayFilterMobile]}>
            <Pressable style={({ pressed }) => [s.barangaySelect, barangayMenuOpen && s.barangaySelectOpen, pressed && s.pressed]} onPress={() => { setBarangayMenuOpen(open => !open); setSortMenuOpen(false); }} accessibilityRole="button" accessibilityLabel={`Select barangay. ${selectedBarangay}`} accessibilityState={{ expanded: barangayMenuOpen }}>
              <View style={s.selectIcon}><Ionicons name="location-outline" size={17} color={C.brand} /></View>
              <View style={{ flex: 1 }}>
                <Text style={s.selectLabel}>BARANGAY</Text>
                <Text style={s.selectValue} numberOfLines={1}>{selectedBarangay}</Text>
              </View>
              <Ionicons name={barangayMenuOpen ? 'chevron-up' : 'chevron-down'} size={16} color={C.brand} />
            </Pressable>
            {barangayMenuOpen && <ScrollView style={s.barangayMenu} nestedScrollEnabled keyboardShouldPersistTaps="handled">
              {['All barangays', ...barangays, 'Unspecified barangay'].map(name => {
                const active = selectedBarangay === name;
                return (
                  <Pressable key={name} style={({ pressed }) => [s.barangayOption, active && s.barangaySelected, pressed && s.pressed]} accessibilityRole="button" accessibilityState={{ selected: active }} onPress={() => { setSelectedBarangay(name); setBarangayMenuOpen(false); }}>
                    <Text style={[s.value, active && s.strong]}>{name}</Text>
                    {active && <Ionicons name="checkmark" size={17} color={C.brand} />}
                  </Pressable>
                );
              })}
            </ScrollView>}
          </View>
        </View>

        <View style={s.sortRow}>
          <View style={s.sortFilter}>
            <Pressable style={({ pressed }) => [s.sortSelect, sortMenuOpen && s.barangaySelectOpen, pressed && s.pressed]} onPress={() => { setSortMenuOpen(open => !open); setBarangayMenuOpen(false); }} accessibilityRole="button" accessibilityState={{ expanded: sortMenuOpen }} accessibilityLabel="Choose sort field">
              <Ionicons name="swap-vertical" size={16} color={C.brand} />
              <Text style={s.sortText} numberOfLines={1}>Sort by {sortLabel?.toLowerCase()}</Text>
              <Ionicons name={sortMenuOpen ? 'chevron-up' : 'chevron-down'} size={14} color={C.muted} />
            </Pressable>
            {sortMenuOpen && <ScrollView style={s.barangayMenu} nestedScrollEnabled keyboardShouldPersistTaps="handled">
              {fields.map(([key, label]) => <Pressable key={key} style={({ pressed }) => [s.barangayOption, sortKey === key && s.barangaySelected, pressed && s.pressed]} onPress={() => { chooseSort(key); setSortMenuOpen(false); }} accessibilityRole="button">
                <Text style={[s.value, sortKey === key && s.strong]}>{label}</Text>
                {sortKey === key && <Ionicons name="checkmark" size={17} color={C.brand} />}
              </Pressable>)}
            </ScrollView>}
          </View>
          <Pressable style={({ pressed }) => [s.sortDirection, pressed && s.pressed]} onPress={() => setAscending(current => !current)} accessibilityRole="button" accessibilityLabel={ascending ? 'Sort descending' : 'Sort ascending'}>
            <Ionicons name={ascending ? 'arrow-up' : 'arrow-down'} size={16} color={C.brand} />
            <Text style={s.sortText}>{ascending ? 'Ascending' : 'Descending'}</Text>
          </Pressable>
          <View style={s.exportRow}>
            <Pressable onPress={() => void exportTable('pdf')} disabled={exportBusy} accessibilityRole="button" accessibilityLabel="Download A4 PDF table" style={({ pressed }) => [s.exportButton, (pressed || exportBusy) && s.pressed]}>
              {exporting === 'pdf' ? <ActivityIndicator size="small" color="#FFF" /> : <Ionicons name="document-text-outline" size={17} color="#FFF" />}
              <Text style={s.exportButtonText}>{exporting === 'pdf' ? 'Preparing PDF...' : 'Download PDF'}</Text>
            </Pressable>
            <Pressable onPress={() => void exportTable('xlsx')} disabled={exportBusy} accessibilityRole="button" accessibilityLabel="Download Excel table" style={({ pressed }) => [s.exportButton, s.exportButtonSecondary, (pressed || exportBusy) && s.pressed]}>
              {exporting === 'xlsx' ? <ActivityIndicator size="small" color={C.brand} /> : <Ionicons name="grid-outline" size={17} color={C.brand} />}
              <Text style={[s.exportButtonText, { color: C.brand }]}>{exporting === 'xlsx' ? 'Preparing Excel...' : 'Download Excel'}</Text>
            </Pressable>
          </View>
        </View>

        <View style={s.metaRow}>
          <View style={s.metaLeft}>
            <Text style={s.count}>Showing <Text style={s.countStrong}>{filtered.length}</Text> of {seniors.length}</Text>
            {!!query.trim() && <FilterChip label={`“${query.trim()}”`} onRemove={() => setQuery('')} />}
            {selectedBarangay !== 'All barangays' && <FilterChip label={selectedBarangay} onRemove={() => setSelectedBarangay('All barangays')} />}
          </View>
          {hasFilters && (
            <Pressable onPress={clearFilters} accessibilityRole="button" style={({ pressed }) => [s.clearFilters, pressed && s.pressed]}>
              <Text style={s.clearFiltersText}>Clear filters</Text>
            </Pressable>
          )}
        </View>

        {!!error && (
          <View style={s.errorBanner} accessibilityRole="alert">
            <Ionicons name="alert-circle" size={19} color={C.danger} />
            <Text style={s.errorText}>{error}</Text>
          </View>
        )}

        {loading ? <StateCard loading text="Loading senior citizens…" />
          : filtered.length === 0 ? (
            <StateCard icon={hasFilters ? 'search' : 'people-outline'} title={hasFilters ? 'No matches' : 'No senior citizens yet'}
              text={hasFilters ? 'Try a different search or clear the filters.' : 'Registered seniors aged 60 and above will appear here.'}>
              {hasFilters && <Pressable onPress={clearFilters} accessibilityRole="button" style={({ pressed }) => [s.primaryButton, pressed && s.pressed]}><Text style={s.primaryButtonText}>Clear filters</Text></Pressable>}
            </StateCard>
          ) : (
          <SeniorTable records={filtered} sort={sortKey} ascending={ascending} onSort={chooseSort} renderCell={renderCell} />
        )}
      </>}
      </ScrollView>

      <Modal visible={preview !== null} animationType="slide" onRequestClose={() => setPreview(null)}>
        <SafeAreaView style={s.previewPage}>
          <View style={s.previewHeader}>
            <Text style={s.previewTitle} numberOfLines={2}>{preview?.title}</Text>
            <Pressable onPress={() => setPreview(null)} accessibilityRole="button" accessibilityLabel="Close preview" style={({ pressed }) => [s.heroButton, pressed && s.pressed]}>
              <Ionicons name="close" size={20} color="#FFF" />
            </Pressable>
          </View>
          <View style={s.previewFrame}>
            {!!previewError ? <View style={[s.errorBanner, { margin: 16 }]}><Ionicons name="alert-circle" size={19} color={C.danger} /><Text style={s.errorText}>{previewError}</Text></View> : preview && (
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
  web: { boxShadow: '0 1px 2px rgba(19,32,26,0.06), 0 6px 18px rgba(19,32,26,0.06)' } as object,
  default: { shadowColor: '#13201A', shadowOpacity: 0.07, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
});

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: C.bg, paddingHorizontal: 20, paddingTop: 12 },
  pageScroll: { flex: 1 },
  pageContent: { flexGrow: 1, paddingBottom: 24, width: '100%', maxWidth: 1480, alignSelf: 'center' },
  pressed: { opacity: 0.7 },

  hero: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16, padding: 18, borderRadius: 24, backgroundColor: C.brandDark, overflow: 'hidden' },
  heroCompact: { gap: 10, padding: 14, borderRadius: 20, marginBottom: 12 },
  heroButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)' },
  heroBadge: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: 'rgba(242,200,121,0.14)' },
  eyebrow: { fontFamily: 'InterBody', fontSize: 11, fontWeight: '700', letterSpacing: 1.2, color: C.gold, textTransform: 'uppercase', marginBottom: 2 },
  title: { fontFamily: 'FraunTitle', fontSize: 28, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.4 },
  compactTitle: { fontSize: 20 },
  subtitle: { fontFamily: 'InterBody', fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  primaryButton: { paddingVertical: 11, paddingHorizontal: 22, borderRadius: 999, backgroundColor: C.brand, alignItems: 'center', alignSelf: 'center', marginTop: 6 },
  primaryButtonText: { color: '#FFF', fontWeight: '700' },

  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 16 },
  statsScroll: { flexGrow: 0, flexShrink: 0 },
  compactStats: { flexWrap: 'nowrap' },
  stat: { flexGrow: 1, flexBasis: 200, gap: 10, padding: 16, backgroundColor: C.surface, borderRadius: 18, borderWidth: 1, borderColor: C.line, ...shadow },
  statCompact: { flexGrow: 0, flexBasis: 180, width: 180 },
  statTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  statIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  statValue: { fontFamily: 'FraunTitle', fontSize: 30, color: C.ink, letterSpacing: -0.3 },
  statLabel: { flex: 1, fontFamily: 'InterBody', fontSize: 12, fontWeight: '600', color: C.muted },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: C.line, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3 },

  toolbar: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'flex-start', zIndex: 10 },
  searchWrap: { flex: 1, minWidth: 260, flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, borderWidth: 1.5, borderColor: C.line, borderRadius: 14, paddingHorizontal: 14, height: 56, ...shadow },
  searchWrapFocused: { borderColor: C.brandMid },
  search: { flex: 1, fontSize: 15, color: C.ink, paddingVertical: 12, ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null) },

  barangayFilter: { width: 260, maxWidth: '100%', zIndex: 20 },
  barangayFilterMobile: { width: '100%' },
  barangaySelect: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 56, paddingHorizontal: 12, borderWidth: 1.5, borderColor: C.line, borderRadius: 14, backgroundColor: C.surface, ...shadow },
  barangaySelectOpen: { borderColor: C.brandMid },
  selectIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: C.brandSoft, alignItems: 'center', justifyContent: 'center' },
  selectLabel: { fontFamily: 'InterBody', fontSize: 10, fontWeight: '700', letterSpacing: 0.8, color: C.muted },
  selectValue: { fontSize: 15, fontWeight: '600', color: C.ink },
  barangayMenu: { position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 30, maxHeight: 260, flexGrow: 0, marginTop: 6, borderWidth: 1, borderColor: C.line, borderRadius: 14, backgroundColor: C.surface, ...shadow },
  barangayOption: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16 },
  barangaySelected: { backgroundColor: C.brandSoft },

  sortRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 12, zIndex: 5 },
  sortFilter: { width: 240, maxWidth: '100%', zIndex: 20 },
  sortSelect: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1.5, borderColor: C.line, borderRadius: 999, backgroundColor: C.surface, paddingHorizontal: 14, paddingVertical: 10 },
  sortDirection: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, backgroundColor: C.brandSoft },
  sortText: { flex: 1, fontFamily: 'InterBody', fontSize: 12, fontWeight: '600', color: C.brandDark, flexShrink: 1 },

  exportRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginLeft: 'auto' },
  exportButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 42, paddingVertical: 9, paddingHorizontal: 16, borderRadius: 999, backgroundColor: C.brand, borderWidth: 1.5, borderColor: C.brand },
  exportButtonSecondary: { backgroundColor: C.surface },
  exportButtonText: { fontFamily: 'InterBody', fontSize: 13, fontWeight: '700', color: '#FFF' },

  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginTop: 14, marginBottom: 10 },
  metaLeft: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, flexShrink: 1 },
  count: { color: C.muted, fontSize: 13 },
  countStrong: { color: C.ink, fontWeight: '700' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: 220, paddingVertical: 5, paddingLeft: 10, paddingRight: 8, borderRadius: 999, backgroundColor: C.brandSoft, borderWidth: 1, borderColor: '#C8E3D2' },
  chipText: { color: C.brand, fontWeight: '600', fontSize: 12, flexShrink: 1 },
  clearFilters: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999 },
  clearFiltersText: { color: C.brand, fontWeight: '700', fontSize: 13, textDecorationLine: 'underline' },

  errorBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.dangerSoft, borderRadius: 12, padding: 12, marginBottom: 14, borderLeftWidth: 4, borderLeftColor: C.danger },
  errorText: { flex: 1, color: C.danger, fontWeight: '600' },

  stateCard: { backgroundColor: C.surface, borderRadius: 20, borderWidth: 1, borderColor: C.line, paddingVertical: 36, paddingHorizontal: 28, alignItems: 'center', gap: 10, ...shadow },
  stateIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  stateTitle: { fontFamily: 'FraunTitle', fontSize: 20, fontWeight: '700', color: C.ink },
  stateText: { color: C.muted, textAlign: 'center', lineHeight: 21, maxWidth: 420 },

  value: { color: C.ink, lineHeight: 21, fontSize: 14 },
  subValue: { color: C.muted, lineHeight: 18, fontSize: 12 },
  strong: { fontWeight: '700' },
  empty: { color: '#A3B0A8' },
  child: { paddingVertical: 6 },
  childName: { fontWeight: '600' },

  agePill: { minWidth: 36, paddingVertical: 3, paddingHorizontal: 10, borderRadius: 999, backgroundColor: C.zebra, borderWidth: 1, borderColor: C.line, alignSelf: 'flex-start', alignItems: 'center' },
  agePillText: { color: C.ink, fontWeight: '700', fontSize: 13 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999, alignSelf: 'flex-start' },
  pillDot: { width: 6, height: 6, borderRadius: 3 },
  pillText: { fontSize: 12, fontWeight: '700' },
  docButton: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1.5, borderColor: C.brand, backgroundColor: C.surface },
  docButtonText: { color: C.brand, fontWeight: '700', fontSize: 13 },

  previewPage: { flex: 1, backgroundColor: C.brandDark },
  previewHeader: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 14 },
  previewTitle: { flex: 1, fontFamily: 'FraunTitle', fontSize: 18, fontWeight: '700', color: '#FFF' },
  previewFrame: { flex: 1, borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden', backgroundColor: C.surface },
  previewContent: { flex: 1, width: '100%' },
});

const t = StyleSheet.create({
  headingButton: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 2 },
  heading: { flex: 1, color: 'rgba(255,255,255,0.88)', fontFamily: 'InterBody', fontSize: 11, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  headingActive: { color: '#FFFFFF' },
  name: { color: C.ink, fontFamily: 'InterBody', fontSize: 13, fontWeight: '700', lineHeight: 21 },
  value: { color: C.ink, fontFamily: 'InterBody', fontSize: 13, lineHeight: 21 },
  small: { color: C.muted, fontFamily: 'InterBody', fontSize: 12, lineHeight: 18 },
  identityRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  identity: { flex: 1, gap: 2 },
  nameCell: { borderWidth: 2, borderColor: 'transparent' },
  compactNameCell: { borderWidth: 2, borderColor: 'transparent', borderRadius: 5, paddingHorizontal: 4, paddingVertical: 2 },
  selectedRow: { borderTopColor: C.brandMid, borderBottomColor: C.brandMid, backgroundColor: C.selected },
  nativeTable: { borderWidth: 1, borderColor: C.line, borderRadius: 20, overflow: 'hidden', backgroundColor: C.surface },
  nativeTableRow: { flexDirection: 'row' },
  frozenPane: { borderRightWidth: 2, borderRightColor: '#BDD2C3', zIndex: 2 },
  nativeHeader: { flexDirection: 'row', alignItems: 'center', height: 56, backgroundColor: C.brandDark },
  nativeRow: { flexDirection: 'row', borderTopWidth: 2, borderTopColor: 'transparent', borderBottomWidth: 2, borderBottomColor: C.line },
  nativeCell: { flexShrink: 0, paddingHorizontal: 16, paddingVertical: 16, justifyContent: 'center' },
});
