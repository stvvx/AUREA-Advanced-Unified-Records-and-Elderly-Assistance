import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { downloadSeniorTable, type ExportCell } from '../services/seniorTableExport';
import { API_BASE_URL } from '../services/loloApi';

type ServiceRecord = {
  id: string; reference: string; userId: number; lastName: string; firstName: string; middleName: string;
  service: string; details: string; date: string | null; status: string; validation: string | null;
  serviceDate: string | null; amount: number | string | null; contact: string; address: string;
};
const columns = [
  ['lastName', 'Last name', 160], ['firstName', 'First name', 160], ['middleName', 'Middle name', 160],
  ['service', 'Service', 190], ['details', 'Service details', 250], ['date', 'Requested on', 160],
  ['status', 'Status', 165], ['validation', 'Validation', 165], ['serviceDate', 'Release / screening', 190],
  ['amount', 'Benefit amount', 165], ['contact', 'Contact', 170], ['address', 'Address', 300], ['reference', 'Reference', 300],
] as const;
type Column = typeof columns[number][0];
const nameColumns = columns.slice(0, 3);
const detailColumns = columns.slice(3);
const detailWidth = detailColumns.reduce((sum, [, , width]) => sum + width, 0);
const C = { bg: '#F2F5EF', card: '#FFFFFF', ink: '#13201A', muted: '#5B6E62', line: '#E1E9DD',
  primary: '#1F5C3E', primaryMid: '#2B7A50', dark: '#0F3323', soft: '#DDEFE4', gold: '#A8620B', goldSoft: '#FCEFD6', goldBright: '#F2C879',
  blue: '#2F5597', blueSoft: '#E3ECFA',
  danger: '#B3432E', dangerSoft: '#FBE7E2', alternate: '#F8FAF6', hover: '#EEF5F0', selected: '#E8F3EC' };

type IconName = React.ComponentProps<typeof Ionicons>['name'];
const serviceMeta: Record<string, { icon: IconName; bg: string; fg: string }> = {
  'Birthday Benefits': { icon: 'gift-outline', bg: C.goldSoft, fg: C.gold },
  'Movie Center': { icon: 'film-outline', bg: C.blueSoft, fg: C.blue },
};
const defaultServiceMeta = { icon: 'document-text-outline' as IconName, bg: C.soft, fg: C.primary };

const avatarTones: readonly (readonly [string, string])[] = [
  ['#E1F1E7', '#1F5C3E'], ['#FCEFD6', '#A8620B'], ['#E3ECFA', '#2F5597'],
  ['#F3E6F5', '#7B3F8C'], ['#FBE7E2', '#B3432E'],
];
function initialsOf(record: ServiceRecord): string {
  return ((record.firstName || '').trim().charAt(0) + (record.lastName || '').trim().charAt(0)).toUpperCase() || '?';
}
function toneOf(record: ServiceRecord): readonly [string, string] {
  const seed = Number(record.userId);
  const index = Number.isFinite(seed) ? Math.abs(seed) : initialsOf(record).charCodeAt(0);
  return avatarTones[index % avatarTones.length];
}
function Avatar({ record, size = 34 }: { record: ServiceRecord; size?: number }) {
  const [bg, fg] = toneOf(record);
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: fg, fontFamily: 'InterBody', fontSize: size * 0.38, fontWeight: '800' }}>{initialsOf(record)}</Text>
    </View>
  );
}

function textValue(record: ServiceRecord, key: Column): string {
  const value = record[key];
  if (value === null || value === undefined || value === '') return '\u2014';
  if (key === 'amount') {
    const amount = Number(value);
    return Number.isFinite(amount) ? new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 2 }).format(amount) : String(value);
  }
  if (key === 'date' || key === 'serviceDate') {
    const date = new Date(String(value).length === 10 ? `${value}T00:00:00` : value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString('en-US', { timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: 'numeric' });
  }
  return String(value);
}

function statusColors(value: string) {
  if (['Released', 'Approved', 'Eligible', 'Confirmed', 'Completed'].includes(value)) return { backgroundColor: C.soft, color: C.primary };
  if (['Cancelled', 'Rejected', 'Ineligible'].includes(value)) return { backgroundColor: C.dangerSoft, color: C.danger };
  return { backgroundColor: C.goldSoft, color: C.gold };
}

function StatusBadge({ value }: { value: string }) {
  const colors = statusColors(value);
  return (
    <View style={[s.badge, { backgroundColor: colors.backgroundColor }]}>
      <View style={[s.badgeDot, { backgroundColor: colors.color }]} />
      <Text style={[s.badgeText, { color: colors.color }]}>{value}</Text>
    </View>
  );
}

function ServiceTag({ value }: { value: string }) {
  const meta = serviceMeta[value] ?? defaultServiceMeta;
  return (
    <View style={[s.serviceTag, { backgroundColor: meta.bg }]}>
      <Ionicons name={meta.icon} size={14} color={meta.fg} />
      <Text style={[s.serviceTagText, { color: meta.fg }]}>{value}</Text>
    </View>
  );
}

function StateCard({ icon, tone, loading, title, text, children }: {
  icon?: IconName; tone?: 'danger'; loading?: boolean; title?: string; text?: string; children?: React.ReactNode;
}) {
  return (
    <View style={s.stateCard}>
      {loading ? <ActivityIndicator color={C.primary} size="large" /> : icon ? (
        <View style={[s.stateIcon, { backgroundColor: tone === 'danger' ? C.dangerSoft : C.soft }]}>
          <Ionicons name={icon} size={30} color={tone === 'danger' ? C.danger : C.primary} />
        </View>
      ) : null}
      {!!title && <Text style={s.stateTitle}>{title}</Text>}
      {!!text && <Text style={s.message}>{text}</Text>}
      {children}
    </View>
  );
}

const htmlCell: React.CSSProperties = { padding: '10px 16px', borderBottom: `1px solid ${C.line}`, textAlign: 'left', verticalAlign: 'middle', lineHeight: '21px', overflowWrap: 'anywhere' };

function RecordsTable({ records, sort, ascending, onSort }: {
  records: ServiceRecord[]; sort: Column; ascending: boolean; onSort: (key: Column) => void;
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
  const header = (key: Column, label: string) => (
    <Pressable onPress={() => onSort(key)} accessibilityRole="button" accessibilityLabel={`Sort by ${label}, ${sort === key && ascending ? 'descending' : 'ascending'}`} style={s.headingButton}>
      <Text style={[s.heading, sort === key && s.headingActive]} numberOfLines={1}>{label}</Text>
      <Ionicons name={sort === key ? ascending ? 'arrow-up' : 'arrow-down' : 'swap-vertical'} size={13} color={sort === key ? C.goldBright : '#7FA38E'} />
    </Pressable>
  );
  const identity = (record: ServiceRecord) => (
    <View style={s.identityRow} onLayout={Platform.OS === 'web' ? undefined : event => measureRow(record.id, event.nativeEvent.layout.height)}>
      <Avatar record={record} size={36} />
      <View style={s.identity}>
        {nameColumns.map(([key, label]) => key === 'middleName' && !record[key] ? null : (
          <Pressable key={key} onPress={() => setSelectedRow(record.id)} onFocus={() => setSelectedRow(record.id)}
            accessibilityRole="button" accessibilityLabel={`${label}: ${textValue(record, key)}`} accessibilityState={{ selected: selectedRow === record.id }}
            style={s.compactNameCell}>
            <Text style={key === 'lastName' ? s.name : key === 'middleName' ? s.small : s.value}>{textValue(record, key)}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
  const nativeContent = (record: ServiceRecord, key: Column) => {
    if ((key === 'status' || key === 'validation') && record[key]) return <StatusBadge value={String(record[key])} />;
    if (key === 'service' && record.service) return <ServiceTag value={record.service} />;
    if (key === 'amount') return <Text selectable style={[s.value, s.amount]}>{textValue(record, key)}</Text>;
    if (key === 'reference') return <Text selectable style={s.reference}>{textValue(record, key)}</Text>;
    return <Text selectable style={key === 'lastName' ? s.name : s.value}>{textValue(record, key)}</Text>;
  };
  const cell = (record: ServiceRecord, key: Column) => (
    <View onLayout={event => measureRow(record.id, event.nativeEvent.layout.height)}>{nativeContent(record, key)}</View>
  );

  if (Platform.OS === 'web') {
    return (
      <div role="region" aria-label="Service history. Senior names stay fixed when scrolling horizontally." tabIndex={0}
        style={{ height: tableHeight, overflow: 'auto', border: `1px solid ${C.line}`, borderRadius: 20, background: C.card, isolation: 'isolate', boxShadow: '0 1px 2px rgba(19,32,26,0.06), 0 8px 24px rgba(19,32,26,0.06)' }}>
        <table style={{ width: frozenWidth + detailWidth, tableLayout: 'fixed', borderCollapse: 'separate', borderSpacing: 0, fontFamily: 'InterBody, system-ui, sans-serif', fontSize: 13, color: C.ink }}>
          <caption style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clipPath: 'inset(50%)' }}>Senior citizen service history</caption>
          <colgroup>
            {compact ? <col style={{ width: frozenWidth }} /> : nameColumns.map(([key]) => <col key={key} style={{ width: nameWidth }} />)}
            {detailColumns.map(([key, , columnWidth]) => <col key={key} style={{ width: columnWidth }} />)}
          </colgroup>
          <thead><tr>
            {compact ? <th scope="col" style={{ ...htmlCell, borderBottom: 'none', position: 'sticky', left: 0, top: 0, zIndex: 4, background: C.dark, color: '#FFF', boxShadow: '3px 0 6px rgba(15,51,35,0.12)' }}>{header('lastName', 'Senior citizen')}</th>
              : nameColumns.map(([key, label], index) => <th key={key} scope="col" aria-sort={sort === key ? ascending ? 'ascending' : 'descending' : 'none'}
                style={{ ...htmlCell, borderBottom: 'none', position: 'sticky', top: 0, left: index * nameWidth, zIndex: 4, background: C.dark, boxShadow: index === 2 ? '3px 0 6px rgba(15,51,35,0.12)' : undefined }}>{header(key, label)}</th>)}
            {detailColumns.map(([key, label]) => <th key={key} scope="col" aria-sort={sort === key ? ascending ? 'ascending' : 'descending' : 'none'}
              style={{ ...htmlCell, borderBottom: 'none', position: 'sticky', top: 0, zIndex: 3, background: C.dark }}>{header(key, label)}</th>)}
          </tr></thead>
          <tbody>{records.map((record, index) => {
            const selected = selectedRow === record.id;
            const hovered = hoveredRow === record.id;
            const background = selected ? C.selected : hovered ? C.hover : index % 2 ? C.alternate : C.card;
            const focusBorder = selected ? `inset 0 2px 0 ${C.primaryMid}, inset 0 -2px 0 ${C.primaryMid}` : '';
            const [avatarBg, avatarFg] = toneOf(record);
            const meta = serviceMeta[record.service] ?? defaultServiceMeta;
            return <tr key={record.id} onMouseEnter={() => setHoveredRow(record.id)} onMouseLeave={() => setHoveredRow(current => current === record.id ? null : current)}>
              {compact ? <td style={{ ...htmlCell, position: 'sticky', left: 0, zIndex: 2, background, boxShadow: [focusBorder, selected && `inset 2px 0 0 ${C.primaryMid}`, '3px 0 6px rgba(15,51,35,0.08)'].filter(Boolean).join(', ') }}>{identity(record)}</td>
                : nameColumns.map(([key, label], nameIndex) => <td key={key} title={textValue(record, key)} tabIndex={0}
                  aria-label={`${label}: ${textValue(record, key)}${selectedRow === record.id ? ', selected' : ''}`}
                  onClick={() => setSelectedRow(record.id)} onFocus={() => setSelectedRow(record.id)}
                  onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedRow(record.id); } }}
                  style={{ ...htmlCell, position: 'sticky', left: nameIndex * nameWidth, zIndex: 2,
                    background, cursor: 'pointer', fontWeight: key === 'lastName' ? 700 : 500, transition: 'background 120ms ease',
                    boxShadow: [focusBorder, selected && nameIndex === 0 && `inset 3px 0 0 ${C.primaryMid}`, nameIndex === 2 && '3px 0 6px rgba(15,51,35,0.08)'].filter(Boolean).join(', ') }}>
                  {key === 'lastName' && showAvatar ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ width: 30, height: 30, flexShrink: 0, borderRadius: 15, background: avatarBg, color: avatarFg, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800 }}>{initialsOf(record)}</span>
                      <span>{textValue(record, key)}</span>
                    </div>
                  ) : textValue(record, key)}
                </td>)}
              {detailColumns.map(([key]) => <td key={key} title={textValue(record, key)} style={{ ...htmlCell, background, transition: 'background 120ms ease', boxShadow: [focusBorder, selected && key === 'reference' && `inset -2px 0 0 ${C.primaryMid}`].filter(Boolean).join(', ') }}>
                {(key === 'status' || key === 'validation') && record[key] ? <span style={{ display: 'inline-flex' }}><StatusBadge value={String(record[key])} /></span>
                  : key === 'service' && record.service ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 999, background: meta.bg, color: meta.fg, fontSize: 12, fontWeight: 700 }}>{record.service}</span>
                  : key === 'amount' ? <strong style={{ fontWeight: 700 }}>{textValue(record, key)}</strong>
                  : key === 'reference' ? <span style={{ color: C.muted, fontSize: 12, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{textValue(record, key)}</span>
                  : textValue(record, key)}
              </td>)}
            </tr>;
          })}</tbody>
        </table>
      </div>
    );
  }
  // A single vertical scroller keeps the frozen and moving cells aligned on native.
  return <View style={[s.nativeTable, { height: tableHeight }]}>
    <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled">
      <View style={s.nativeTableRow}>
        <View style={[s.frozenPane, { width: frozenWidth }]}>
          <View style={[s.nativeHeader, { width: frozenWidth }]}>
            {compact ? <View style={{ width: frozenWidth, paddingHorizontal: 14 }}>{header('lastName', 'Senior citizen')}</View> : nameColumns.map(([key, label]) => <View key={key} style={{ width: nameWidth, paddingHorizontal: 14 }}>{header(key, label)}</View>)}
          </View>
          {records.map((record, index) => <View key={record.id} style={[s.nativeRow, { height: rowHeights[record.id] || 104, backgroundColor: index % 2 ? C.alternate : C.card }, selectedRow === record.id && s.selectedRow]}>
            {compact ? <View style={s.nativeCell}>{identity(record)}</View> : nameColumns.map(([key, label]) => <Pressable key={key}
              onPress={() => setSelectedRow(record.id)} accessibilityRole="button" accessibilityLabel={`${label}: ${textValue(record, key)}`}
              accessibilityState={{ selected: selectedRow === record.id }}
              style={[s.nativeCell, s.nameCell, { width: nameWidth }]}>{cell(record, key)}</Pressable>)}
          </View>)}
        </View>
        <ScrollView horizontal nestedScrollEnabled style={{ flex: 1 }} contentContainerStyle={{ width: detailWidth }} keyboardShouldPersistTaps="handled">
          <View style={{ width: detailWidth }}>
            <View style={s.nativeHeader}>{detailColumns.map(([key, label, columnWidth]) => <View key={key} style={{ width: columnWidth, paddingHorizontal: 16 }}>{header(key, label)}</View>)}</View>
            {records.map((record, index) => <View key={record.id} style={[s.nativeRow, { height: rowHeights[record.id] || 104, backgroundColor: index % 2 ? C.alternate : C.card }, selectedRow === record.id && s.selectedRow]}>
              {detailColumns.map(([key, , columnWidth]) => <View key={key} style={[s.nativeCell, { width: columnWidth }]}>{cell(record, key)}</View>)}
            </View>)}
          </View>
        </ScrollView>
      </View>
    </ScrollView>
  </View>;
}

export default function AdminRecords() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const compact = width < 700;
  const { user, loading: authLoading } = useAuth();
  const allowed = ['osca admin', 'super admin'].includes(String(user?.role ?? '').trim().toLowerCase());
  const [records, setRecords] = useState<ServiceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [service, setService] = useState('All services');
  const [sort, setSort] = useState<Column>('date');
  const [ascending, setAscending] = useState(false);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [exportChoice, setExportChoice] = useState<'pdf' | 'xlsx' | null>(null);
  const [exporting, setExporting] = useState<'pdf' | 'xlsx' | null>(null);
  const [exportError, setExportError] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/service-records`, { headers: { Authorization: `Bearer ${user?.token ?? ''}` } });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Could not load records.');
      setRecords(data.records ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load records.');
    } finally {
      setLoading(false);
    }
  }, [user?.token]);
  useFocusEffect(useCallback(() => { if (!authLoading && allowed) void load(); }, [authLoading, allowed, load]));
  const sortedRecords = useMemo(() => [...records].sort((a, b) => {
      const left = a[sort];
      const right = b[sort];
      if (left === null || left === undefined || left === '') return right === null || right === undefined || right === '' ? 0 : 1;
      if (right === null || right === undefined || right === '') return -1;
      const comparison = sort === 'amount' ? Number(left) - Number(right)
        : String(left).localeCompare(String(right), 'en', { sensitivity: 'base', numeric: true });
      return ascending ? comparison : -comparison;
    }), [records, sort, ascending]);
  const filtered = useMemo(() => sortedRecords.filter(record => (service === 'All services' || record.service === service)
    && (!query.trim() || columns.some(([key]) => textValue(record, key).toLowerCase().includes(query.trim().toLowerCase())))),
    [sortedRecords, service, query]);
  const chooseSort = (key: Column) => {
    if (sort === key) setAscending(value => !value);
    else { setSort(key); setAscending(true); }
  };
  const exportTable = async (format: 'pdf' | 'xlsx', selectedService: string) => {
    if (exporting || loading) return;
    const selectedRecords = sortedRecords.filter(record => selectedService === 'All services' || record.service === selectedService);
    if (!selectedRecords.length) return;
    setExportChoice(null);
    setExportError('');
    if (!user?.token) { setExportError('Please sign in again before exporting.'); return; }
    setExporting(format);
    try {
      const rows = selectedRecords.map(record => columns.map(([key]): ExportCell => {
        const text = textValue(record, key);
        const value = record[key];
        if (key === 'amount' && value !== null && value !== '' && Number.isFinite(Number(value))) {
          return { text, value: Number(value), kind: 'currency' };
        }
        if ((key === 'date' || key === 'serviceDate') && value) {
          return { text, value: String(value), kind: 'date' };
        }
        return { text };
      }));
      await downloadSeniorTable({ columns: columns.map(([key, label]) => ({ key, label })), rows, service: selectedService }, format, user.token, 'service-records');
    } catch (cause) {
      setExportError(cause instanceof Error ? cause.message : 'Could not export service records.');
    } finally {
      setExporting(null);
    }
  };
  const counts = useMemo(() => ({
    'All services': records.length,
    'Birthday Benefits': records.filter(record => record.service === 'Birthday Benefits').length,
    'Movie Center': records.filter(record => record.service === 'Movie Center').length,
  }), [records]);
  const hasFilters = !!query.trim() || service !== 'All services';
  const exportBusy = loading || !!exporting || !records.length;
  const sortLabel = columns.find(([key]) => key === sort)?.[1];

  const summaryCards: { label: string; value: number; icon: IconName; bg: string; fg: string }[] = [
    { label: 'Total records', value: counts['All services'], icon: 'documents-outline', bg: C.soft, fg: C.primary },
    { label: 'Birthday benefits', value: counts['Birthday Benefits'], icon: 'gift-outline', bg: C.goldSoft, fg: C.gold },
    { label: 'Movie reservations', value: counts['Movie Center'], icon: 'film-outline', bg: C.blueSoft, fg: C.blue },
  ];

  return <SafeAreaView style={s.page} edges={['top']}>
    <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" contentContainerStyle={[s.content, compact && { padding: 16 }]}>
      <View style={[s.hero, compact && s.heroCompact]}>
        <Pressable style={({ pressed }) => [s.heroButton, pressed && s.pressed]} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back"><Ionicons name="arrow-back" size={19} color="#FFF" /></Pressable>
        {!compact && <View style={s.heroBadge}><Ionicons name="documents" size={22} color={C.goldBright} /></View>}
        <View style={s.headerCopy}>
          {!compact && <Text style={s.eyebrow}>OSCA · Admin</Text>}
          <Text style={[s.title, compact && { fontSize: 20 }]}>Service records</Text>
          <Text style={s.subtitle} numberOfLines={compact ? 2 : 1}>Senior citizen benefits and movie reservation history</Text>
        </View>
        {allowed && <Pressable style={({ pressed }) => [s.heroButton, (pressed || loading) && s.pressed]} onPress={() => void load()} disabled={loading} accessibilityRole="button" accessibilityLabel="Refresh service records">
          {loading ? <ActivityIndicator size="small" color="#FFF" /> : <Ionicons name="refresh" size={19} color="#FFF" />}
        </Pressable>}
      </View>
      {authLoading ? <StateCard loading /> : !allowed ? (
        <StateCard icon="lock-closed-outline" tone="danger" title="Administrator access required" text="Sign in as an OSCA or super administrator to view service records." />
      ) : <>
        <ScrollView horizontal={compact} showsHorizontalScrollIndicator={false} style={s.summaryScroll} contentContainerStyle={[s.summary, compact && { flexWrap: 'nowrap' }]} nestedScrollEnabled>
          {summaryCards.map(card => <View key={card.label} style={[s.summaryItem, compact && { flexBasis: 170, flexGrow: 0, width: 170 }]}>
            <View style={s.summaryTop}>
              <View style={[s.summaryIcon, { backgroundColor: card.bg }]}><Ionicons name={card.icon} size={18} color={card.fg} /></View>
              <Text style={s.summaryLabel} numberOfLines={1}>{card.label}</Text>
            </View>
            <Text style={s.summaryValue}>{card.value}</Text>
          </View>)}
        </ScrollView>

        <View style={[s.searchWrap, searchFocused && s.searchWrapFocused]}>
          <Ionicons name="search" size={19} color={searchFocused ? C.primary : C.muted} />
          <TextInput style={s.input} value={query} onChangeText={setQuery} onFocus={() => setSearchFocused(true)} onBlur={() => setSearchFocused(false)}
            placeholder="Search senior, service, status or reference" placeholderTextColor="#8A9A90" accessibilityLabel="Search service records" autoCapitalize="none" autoCorrect={false} />
          {!!query && <Pressable onPress={() => setQuery('')} accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={8}><Ionicons name="close-circle" size={20} color="#9FB0A5" /></Pressable>}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filtersScroll} contentContainerStyle={s.filters}>
          {Object.entries(counts).map(([item, count]) => {
            const active = service === item;
            const meta = serviceMeta[item];
            return <Pressable key={item} style={({ pressed }) => [s.filter, active && s.filterActive, pressed && s.pressed]} accessibilityRole="button" accessibilityState={{ selected: active }} onPress={() => setService(item)}>
              <Ionicons name={meta?.icon ?? 'apps-outline'} size={16} color={active ? '#FFF' : C.primary} />
              <Text style={[s.filterText, active && { color: '#FFF' }]}>{item}</Text>
              <View style={[s.filterCount, active && { backgroundColor: 'rgba(255,255,255,0.2)' }]}><Text style={[s.filterCountText, active && { color: '#FFF' }]}>{count}</Text></View>
            </Pressable>;
          })}
        </ScrollView>

        <View style={s.sortRow}>
          <View style={s.sortFilter}>
            <Pressable style={({ pressed }) => [s.sortSelect, sortMenuOpen && s.sortSelectOpen, pressed && s.pressed]} onPress={() => setSortMenuOpen(open => !open)} accessibilityRole="button" accessibilityState={{ expanded: sortMenuOpen }} accessibilityLabel="Choose sort field">
              <Ionicons name="swap-vertical" size={16} color={C.primary} />
              <Text style={s.sortText} numberOfLines={1}>Sort by {sortLabel?.toLowerCase()}</Text>
              <Ionicons name={sortMenuOpen ? 'chevron-up' : 'chevron-down'} size={14} color={C.muted} />
            </Pressable>
            {sortMenuOpen && <ScrollView style={s.sortMenu} nestedScrollEnabled>
              {columns.map(([key, label]) => <Pressable key={key} style={({ pressed }) => [s.sortOption, sort === key && s.sortOptionActive, pressed && s.pressed]} onPress={() => { chooseSort(key); setSortMenuOpen(false); }} accessibilityRole="button">
                <Text style={[s.optionText, sort === key && { fontWeight: '700' }]}>{label}</Text>
                {sort === key && <Ionicons name="checkmark" size={17} color={C.primary} />}
              </Pressable>)}
            </ScrollView>}
          </View>
          <Pressable style={({ pressed }) => [s.sortDirection, pressed && s.pressed]} onPress={() => setAscending(value => !value)} accessibilityRole="button" accessibilityLabel={ascending ? 'Sort descending' : 'Sort ascending'}>
            <Ionicons name={ascending ? 'arrow-up' : 'arrow-down'} size={16} color={C.primary} />
            <Text style={s.sortText}>{ascending ? 'Ascending' : 'Descending'}</Text>
          </Pressable>
          <View style={s.exportRow}>
            {(['pdf', 'xlsx'] as const).map(format => <Pressable key={format} onPress={() => { setSortMenuOpen(false); setExportChoice(format); }} disabled={exportBusy} accessibilityRole="button" accessibilityLabel={format === 'pdf' ? 'Download A4 PDF table' : 'Download Excel table'} style={({ pressed }) => [s.exportButton, format === 'xlsx' && s.exportSecondary, (pressed || exportBusy) && s.pressed]}>
              {exporting === format ? <ActivityIndicator size="small" color={format === 'pdf' ? '#FFF' : C.primary} /> : <Ionicons name={format === 'pdf' ? 'document-text-outline' : 'grid-outline'} size={17} color={format === 'pdf' ? '#FFF' : C.primary} />}
              <Text style={[s.exportText, format === 'xlsx' && { color: C.primary }]}>{exporting === format ? 'Preparing...' : format === 'pdf' ? 'Download PDF' : 'Download Excel'}</Text>
            </Pressable>)}
          </View>
        </View>

        {!!exportError && <View style={s.errorCard} accessibilityRole="alert"><Ionicons name="alert-circle" size={20} color={C.danger} /><Text style={s.errorText}>{exportError}</Text></View>}

        <View style={s.tableMeta}>
          <Text style={s.small}>Showing <Text style={s.metaStrong}>{filtered.length}</Text> of {records.length} records</Text>
          {service !== 'All services' && <Pressable onPress={() => setService('All services')} accessibilityRole="button" accessibilityLabel={`Remove filter ${service}`} style={({ pressed }) => [s.chip, pressed && s.pressed]}>
            <Text style={s.chipText}>{service}</Text><Ionicons name="close" size={13} color={C.primary} />
          </Pressable>}
          {!!query.trim() && <Pressable onPress={() => setQuery('')} accessibilityRole="button" accessibilityLabel="Remove search filter" style={({ pressed }) => [s.chip, pressed && s.pressed]}>
            <Text style={s.chipText} numberOfLines={1}>“{query.trim()}”</Text><Ionicons name="close" size={13} color={C.primary} />
          </Pressable>}
          {hasFilters && <Pressable onPress={() => { setQuery(''); setService('All services'); }} accessibilityRole="button"><Text style={s.clearText}>Clear filters</Text></Pressable>}
          {!compact && <View style={s.frozenNote}><Ionicons name="lock-closed-outline" size={13} color={C.primary} /><Text style={s.small}>Names stay fixed as you scroll sideways</Text></View>}
        </View>

        {!!error && <View style={s.errorCard} accessibilityRole="alert"><Ionicons name="cloud-offline-outline" size={24} color={C.danger} /><Text style={s.errorText}>{error}</Text><Pressable onPress={() => void load()} accessibilityRole="button" style={s.retryButton}><Text style={s.retryText}>Try again</Text></Pressable></View>}
        {loading ? <StateCard loading text="Loading service records..." />
          : error ? null : !filtered.length ? (
            <StateCard icon={hasFilters ? 'search' : 'documents-outline'} title={hasFilters ? 'No matching records' : 'No service records yet'}
              text={hasFilters ? 'Try a different name, reference or service filter.' : 'Birthday benefits and movie reservations will appear here.'}>
              {hasFilters && <Pressable onPress={() => { setQuery(''); setService('All services'); }} accessibilityRole="button" style={({ pressed }) => [s.primaryButton, pressed && s.pressed]}><Text style={s.primaryButtonText}>Clear filters</Text></Pressable>}
            </StateCard>
          ) : <RecordsTable records={filtered} sort={sort} ascending={ascending} onSort={chooseSort} />}
      </>}
    </ScrollView>
    <Modal visible={exportChoice !== null} transparent animationType="fade" onRequestClose={() => setExportChoice(null)}>
      <View style={s.modalBackdrop}>
        <View style={s.exportDialog} accessibilityViewIsModal>
          <View style={s.dialogHeader}>
            <View style={s.dialogTitleWrap}>
              <View style={s.dialogIcon}><Ionicons name={exportChoice === 'pdf' ? 'document-text-outline' : 'grid-outline'} size={20} color={C.primary} /></View>
              <Text style={s.stateTitle}>Download {exportChoice === 'pdf' ? 'PDF' : 'Excel'}</Text>
            </View>
            <Pressable onPress={() => setExportChoice(null)} accessibilityRole="button" accessibilityLabel="Close download choices" style={s.closeButton}>
              <Ionicons name="close" size={20} color={C.ink} />
            </Pressable>
          </View>
          <Text style={s.subtitleDark}>Choose the service table to download. Includes all records for your selection.</Text>
          {Object.entries(counts).map(([item, count]) => {
            const meta = serviceMeta[item] ?? { icon: 'documents-outline' as IconName, bg: C.soft, fg: C.primary };
            return <Pressable key={item}
              onPress={() => { if (exportChoice) void exportTable(exportChoice, item); }}
              disabled={!count || !!exporting} accessibilityRole="button" accessibilityLabel={`Download ${item}, ${count} records`}
              style={({ pressed }) => [s.downloadChoice, (!count || pressed) && { opacity: 0.5 }]}>
              <View style={[s.choiceIcon, { backgroundColor: meta.bg }]}><Ionicons name={meta.icon} size={20} color={meta.fg} /></View>
              <View style={{ flex: 1 }}>
                <Text style={s.choiceText}>{item}</Text>
                <Text style={s.small}>{count} records</Text>
              </View>
              <Ionicons name="download-outline" size={19} color={C.primary} />
            </Pressable>;
          })}
        </View>
      </View>
    </Modal>
  </SafeAreaView>;
}

const shadow = Platform.select({
  web: { boxShadow: '0 1px 2px rgba(19,32,26,0.06), 0 6px 18px rgba(19,32,26,0.06)' } as object,
  default: { shadowColor: '#13201A', shadowOpacity: 0.07, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
});

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: C.bg },
  content: { padding: 20, paddingBottom: 40, width: '100%', maxWidth: 1480, alignSelf: 'center' },
  pressed: { opacity: 0.7 },

  hero: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16, padding: 18, borderRadius: 24, backgroundColor: C.dark, overflow: 'hidden' },
  heroCompact: { gap: 10, padding: 14, borderRadius: 20, marginBottom: 12 },
  heroButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)' },
  heroBadge: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: 'rgba(242,200,121,0.14)' },
  headerCopy: { flex: 1 },
  eyebrow: { fontFamily: 'InterBody', fontSize: 11, fontWeight: '700', letterSpacing: 1.2, color: C.goldBright, textTransform: 'uppercase', marginBottom: 2 },
  title: { fontFamily: 'FraunTitle', fontSize: 28, color: '#FFF', letterSpacing: -0.4 },
  subtitle: { fontFamily: 'InterBody', fontSize: 13, lineHeight: 18, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  subtitleDark: { fontFamily: 'InterBody', fontSize: 13, lineHeight: 19, color: C.muted },
  primaryButton: { paddingVertical: 11, paddingHorizontal: 22, borderRadius: 999, backgroundColor: C.primary, alignItems: 'center', alignSelf: 'center', marginTop: 6 },
  primaryButtonText: { color: '#FFF', fontWeight: '700' },

  summaryScroll: { flexGrow: 0, flexShrink: 0 },
  summary: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 16 },
  summaryItem: { flexGrow: 1, flexBasis: 200, gap: 10, padding: 16, backgroundColor: C.card, borderRadius: 18, borderWidth: 1, borderColor: C.line, ...shadow },
  summaryTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  summaryIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  summaryValue: { fontFamily: 'FraunTitle', fontSize: 30, color: C.ink, letterSpacing: -0.3 },
  summaryLabel: { flex: 1, fontFamily: 'InterBody', fontSize: 12, fontWeight: '600', color: C.muted },

  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.card, borderWidth: 1.5, borderColor: C.line, borderRadius: 14, paddingHorizontal: 16, marginBottom: 12, ...shadow },
  searchWrapFocused: { borderColor: C.primaryMid },
  input: { flex: 1, minWidth: 0, paddingVertical: 15, fontFamily: 'InterBody', fontSize: 14, color: C.ink, ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null) },

  filtersScroll: { flexGrow: 0, marginBottom: 10 },
  filters: { flexDirection: 'row', gap: 8 },
  filter: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.card, borderWidth: 1.5, borderColor: C.line, borderRadius: 999, paddingVertical: 9, paddingHorizontal: 14 },
  filterActive: { backgroundColor: C.primary, borderColor: C.primary },
  filterText: { fontFamily: 'InterBody', fontSize: 13, fontWeight: '600', color: C.ink },
  filterCount: { backgroundColor: C.soft, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2 },
  filterCountText: { fontFamily: 'InterBody', fontSize: 11, fontWeight: '800', color: C.primary },

  sortRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 8, zIndex: 5 },
  sortFilter: { width: 240, maxWidth: '100%', zIndex: 6 },
  sortSelect: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1.5, borderColor: C.line, borderRadius: 999, backgroundColor: C.card, paddingHorizontal: 14, paddingVertical: 10 },
  sortSelectOpen: { borderColor: C.primaryMid },
  sortDirection: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, backgroundColor: C.soft },
  sortText: { flex: 1, fontFamily: 'InterBody', fontSize: 12, fontWeight: '600', color: C.dark, flexShrink: 1 },
  sortMenu: { position: 'absolute', top: 48, width: '100%', maxHeight: 260, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 14, ...shadow },
  sortOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 16 },
  sortOptionActive: { backgroundColor: C.soft },
  optionText: { fontFamily: 'InterBody', fontSize: 13, color: C.ink },

  exportRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginLeft: 'auto' },
  exportButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 42, paddingVertical: 9, paddingHorizontal: 16, borderRadius: 999, backgroundColor: C.primary, borderWidth: 1.5, borderColor: C.primary },
  exportSecondary: { backgroundColor: C.card },
  exportText: { fontFamily: 'InterBody', fontSize: 13, fontWeight: '700', color: '#FFF' },

  tableMeta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginTop: 8, marginBottom: 12 },
  metaStrong: { color: C.ink, fontWeight: '700' },
  frozenNote: { flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 'auto' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: 220, paddingVertical: 5, paddingLeft: 10, paddingRight: 8, borderRadius: 999, backgroundColor: C.soft, borderWidth: 1, borderColor: '#C8E3D2' },
  chipText: { fontFamily: 'InterBody', color: C.primary, fontWeight: '600', fontSize: 12, flexShrink: 1 },
  clearText: { fontFamily: 'InterBody', fontWeight: '700', color: C.primary, fontSize: 12, textDecorationLine: 'underline' },

  headingButton: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 2 },
  heading: { flex: 1, color: 'rgba(255,255,255,0.88)', fontFamily: 'InterBody', fontSize: 11, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  headingActive: { color: '#FFF' },
  value: { color: C.ink, fontFamily: 'InterBody', fontSize: 13, lineHeight: 21 },
  amount: { fontWeight: '700' },
  reference: { color: C.muted, fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'ui-monospace, SFMono-Regular, Menlo, monospace' }), fontSize: 12, lineHeight: 18 },
  name: { color: C.ink, fontFamily: 'InterBody', fontSize: 13, fontWeight: '700', lineHeight: 21 },
  small: { color: C.muted, fontFamily: 'InterBody', fontSize: 12, lineHeight: 18 },
  identityRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  identity: { flex: 1, gap: 2 },
  nameCell: { borderWidth: 2, borderColor: 'transparent' },
  compactNameCell: { borderWidth: 2, borderColor: 'transparent', borderRadius: 5, paddingHorizontal: 4, paddingVertical: 2 },
  selectedRow: { borderTopColor: C.primaryMid, borderBottomColor: C.primaryMid, backgroundColor: C.selected },

  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  badgeDot: { width: 6, height: 6, borderRadius: 3 },
  badgeText: { fontFamily: 'InterBody', fontSize: 11, fontWeight: '700' },
  serviceTag: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  serviceTagText: { fontFamily: 'InterBody', fontSize: 12, fontWeight: '700' },

  stateCard: { backgroundColor: C.card, borderRadius: 20, borderWidth: 1, borderColor: C.line, paddingVertical: 36, paddingHorizontal: 28, alignItems: 'center', gap: 10, ...shadow },
  stateIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  stateTitle: { fontFamily: 'FraunTitle', fontSize: 20, fontWeight: '700', color: C.ink },
  message: { fontFamily: 'InterBody', color: C.muted, textAlign: 'center', lineHeight: 21, maxWidth: 420 },
  errorCard: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12, backgroundColor: C.dangerSoft, borderRadius: 14, padding: 14, marginBottom: 14, borderLeftWidth: 4, borderLeftColor: C.danger },
  errorText: { flex: 1, color: C.danger, fontFamily: 'InterBody', fontWeight: '600', lineHeight: 21 },
  retryButton: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: 999, backgroundColor: C.card },
  retryText: { fontFamily: 'InterBody', fontWeight: '700', fontSize: 12, color: C.danger },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(15,33,24,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  exportDialog: { width: '100%', maxWidth: 480, backgroundColor: C.card, borderRadius: 24, padding: 22, gap: 14, ...shadow },
  dialogHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  dialogTitleWrap: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  dialogIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: C.soft, alignItems: 'center', justifyContent: 'center' },
  closeButton: { width: 38, height: 38, borderRadius: 12, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' },
  downloadChoice: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: 16, borderWidth: 1.5, borderColor: C.line, backgroundColor: C.alternate },
  choiceIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  choiceText: { fontFamily: 'InterBody', fontSize: 14, fontWeight: '700', color: C.ink },

  nativeTable: { borderWidth: 1, borderColor: C.line, borderRadius: 20, overflow: 'hidden', backgroundColor: C.card },
  nativeTableRow: { flexDirection: 'row' },
  frozenPane: { borderRightWidth: 2, borderRightColor: '#BDD2C3', zIndex: 2 },
  nativeHeader: { flexDirection: 'row', alignItems: 'center', height: 56, backgroundColor: C.dark },
  nativeRow: { flexDirection: 'row', borderTopWidth: 2, borderTopColor: 'transparent', borderBottomWidth: 2, borderBottomColor: C.line },
  nativeCell: { flexShrink: 0, paddingHorizontal: 16, paddingVertical: 16, justifyContent: 'center' },
});
