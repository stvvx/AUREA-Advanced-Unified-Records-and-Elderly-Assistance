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
  ['service', 'Service', 180], ['details', 'Service details', 250], ['date', 'Requested on', 160],
  ['status', 'Status', 165], ['validation', 'Validation', 165], ['serviceDate', 'Release / screening', 190],
  ['amount', 'Benefit amount', 165], ['contact', 'Contact', 170], ['address', 'Address', 300], ['reference', 'Reference', 300],
] as const;
type Column = typeof columns[number][0];
const nameColumns = columns.slice(0, 3);
const detailColumns = columns.slice(3);
const detailWidth = detailColumns.reduce((sum, [, , width]) => sum + width, 0);
const C = { bg: '#F2F5EF', card: '#FFFFFF', ink: '#13201A', muted: '#5B6E62', line: '#E1E9DD',
  primary: '#1F5C3E', dark: '#0F3323', soft: '#DDEFE4', gold: '#A8620B', goldSoft: '#FCEFD6',
  danger: '#B3432E', dangerSoft: '#FBE7E2', alternate: '#F8FAF6' };

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
  return <View style={[s.badge, { backgroundColor: colors.backgroundColor }]}><Text style={[s.badgeText, { color: colors.color }]}>{value}</Text></View>;
}

const htmlCell: React.CSSProperties = { padding: '8px 14px', borderBottom: `1px solid ${C.line}`, textAlign: 'left', verticalAlign: 'middle', lineHeight: '21px', overflowWrap: 'anywhere' };

function RecordsTable({ records, sort, ascending, onSort }: {
  records: ServiceRecord[]; sort: Column; ascending: boolean; onSort: (key: Column) => void;
}) {
  const { width, height } = useWindowDimensions();
  const compact = width < 700;
  const nameWidth = width < 1100 ? 120 : 160;
  const frozenWidth = compact ? 150 : nameWidth * 3;
  const tableHeight = Math.max(360, Math.min(820, height * 0.72));
  const [rowHeights, setRowHeights] = useState<Record<string, number>>({});
  const [selectedRow, setSelectedRow] = useState<string | null>(null);
  const measureRow = (id: string, textHeight: number) => {
    const measured = Math.max(88, Math.ceil(textHeight) + 32);
    setRowHeights(current => measured > (current[id] || 88) ? { ...current, [id]: measured } : current);
  };
  const header = (key: Column, label: string) => (
    <Pressable onPress={() => onSort(key)} accessibilityRole="button" accessibilityLabel={`Sort by ${label}, ${sort === key && ascending ? 'descending' : 'ascending'}`} style={s.headingButton}>
      <Text style={s.heading}>{label}</Text>
      <Ionicons name={sort === key ? ascending ? 'arrow-up' : 'arrow-down' : 'swap-vertical'} size={13} color={sort === key ? '#FFFFFF' : '#94B4A2'} />
    </Pressable>
  );
  const identity = (record: ServiceRecord) => (
    <View style={s.identity} onLayout={Platform.OS === 'web' ? undefined : event => measureRow(record.id, event.nativeEvent.layout.height)}>
      {nameColumns.map(([key, label]) => key === 'middleName' && !record[key] ? null : (
        <Pressable key={key} onPress={() => setSelectedRow(record.id)} onFocus={() => setSelectedRow(record.id)}
          accessibilityRole="button" accessibilityLabel={`${label}: ${textValue(record, key)}`} accessibilityState={{ selected: selectedRow === record.id }}
          style={s.compactNameCell}>
          <Text style={key === 'lastName' ? s.name : key === 'middleName' ? s.small : s.value}>{textValue(record, key)}</Text>
        </Pressable>
      ))}
    </View>
  );
  const cell = (record: ServiceRecord, key: Column) => (key === 'status' || key === 'validation') && record[key]
    ? <StatusBadge value={String(record[key])} />
    : <Text selectable style={key === 'lastName' ? s.name : s.value} onLayout={event => measureRow(record.id, event.nativeEvent.layout.height)}>{textValue(record, key)}</Text>;

  if (Platform.OS === 'web') {
    return (
      <div role="region" aria-label="Service history. Senior names stay fixed when scrolling horizontally." tabIndex={0}
        style={{ height: tableHeight, overflow: 'auto', border: `1px solid ${C.line}`, borderRadius: 18, background: C.card, isolation: 'isolate' }}>
        <table style={{ width: frozenWidth + detailWidth, tableLayout: 'fixed', borderCollapse: 'separate', borderSpacing: 0, fontFamily: 'InterBody, system-ui, sans-serif', fontSize: 13, color: C.ink }}>
          <caption style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clipPath: 'inset(50%)' }}>Senior citizen service history</caption>
          <colgroup>
            {compact ? <col style={{ width: frozenWidth }} /> : nameColumns.map(([key]) => <col key={key} style={{ width: nameWidth }} />)}
            {detailColumns.map(([key, , columnWidth]) => <col key={key} style={{ width: columnWidth }} />)}
          </colgroup>
          <thead><tr>
            {compact ? <th scope="col" style={{ ...htmlCell, position: 'sticky', left: 0, top: 0, zIndex: 4, background: C.dark, color: '#FFF', boxShadow: '3px 0 6px rgba(15,51,35,0.12)' }}>{header('lastName', 'Senior citizen')}</th>
              : nameColumns.map(([key, label], index) => <th key={key} scope="col" aria-sort={sort === key ? ascending ? 'ascending' : 'descending' : 'none'}
                style={{ ...htmlCell, position: 'sticky', top: 0, left: index * nameWidth, zIndex: 4, background: C.dark, boxShadow: index === 2 ? '3px 0 6px rgba(15,51,35,0.12)' : undefined }}>{header(key, label)}</th>)}
            {detailColumns.map(([key, label]) => <th key={key} scope="col" aria-sort={sort === key ? ascending ? 'ascending' : 'descending' : 'none'}
              style={{ ...htmlCell, position: 'sticky', top: 0, zIndex: 3, background: C.dark }}>{header(key, label)}</th>)}
          </tr></thead>
          <tbody>{records.map((record, index) => {
            const selected = selectedRow === record.id;
            const background = selected ? '#E8F3EC' : index % 2 ? C.alternate : C.card;
            const focusBorder = selected ? 'inset 0 2px 0 #2B7A50, inset 0 -2px 0 #2B7A50' : '';
            return <tr key={record.id}>
              {compact ? <td style={{ ...htmlCell, position: 'sticky', left: 0, zIndex: 2, background, boxShadow: [focusBorder, selected && 'inset 2px 0 0 #2B7A50', '3px 0 6px rgba(15,51,35,0.08)'].filter(Boolean).join(', ') }}>{identity(record)}</td>
                : nameColumns.map(([key, label], nameIndex) => <td key={key} title={textValue(record, key)} tabIndex={0}
                  aria-label={`${label}: ${textValue(record, key)}${selectedRow === record.id ? ', selected' : ''}`}
                  onClick={() => setSelectedRow(record.id)} onFocus={() => setSelectedRow(record.id)}
                  onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedRow(record.id); } }}
                  style={{ ...htmlCell, position: 'sticky', left: nameIndex * nameWidth, zIndex: 2,
                    background, cursor: 'pointer', fontWeight: key === 'lastName' ? 700 : 500,
                    boxShadow: [focusBorder, selected && nameIndex === 0 && 'inset 2px 0 0 #2B7A50', nameIndex === 2 && '3px 0 6px rgba(15,51,35,0.08)'].filter(Boolean).join(', ') }}>{textValue(record, key)}</td>)}
              {detailColumns.map(([key]) => <td key={key} title={textValue(record, key)} style={{ ...htmlCell, background, boxShadow: [focusBorder, selected && key === 'reference' && 'inset -2px 0 0 #2B7A50'].filter(Boolean).join(', ') }}>
                {(key === 'status' || key === 'validation') && record[key] ? <span style={{ display: 'inline-flex' }}><StatusBadge value={String(record[key])} /></span> : textValue(record, key)}
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
            {compact ? header('lastName', 'Senior citizen') : nameColumns.map(([key, label]) => <View key={key} style={{ width: nameWidth, paddingHorizontal: 14 }}>{header(key, label)}</View>)}
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

  return <SafeAreaView style={s.page} edges={['top']}>
    <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" contentContainerStyle={[s.content, compact && { padding: 16 }]}>
      <View style={s.header}>
        <Pressable style={s.backButton} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back"><Ionicons name="arrow-back" size={19} color={C.ink} /></Pressable>
        <View style={s.headerCopy}>
          <Text style={s.title}>Service records</Text>
          <Text style={s.subtitle}>Senior citizen benefits and movie reservation history</Text>
        </View>
        {allowed && <Pressable style={s.refreshButton} onPress={() => void load()} disabled={loading} accessibilityRole="button" accessibilityLabel="Refresh service records">
          {loading ? <ActivityIndicator size="small" color={C.primary} /> : <Ionicons name="refresh" size={19} color={C.primary} />}
        </Pressable>}
      </View>
      {authLoading ? <View style={s.stateCard}><ActivityIndicator color={C.primary} /></View> : !allowed ? <View style={s.stateCard}>
        <Ionicons name="lock-closed-outline" size={28} color={C.primary} />
        <Text style={s.stateTitle}>Administrator access required</Text>
        <Text style={s.message}>Sign in as an OSCA or super administrator to view service records.</Text>
      </View> : <>
        <View style={s.summary}>
          {Object.entries(counts).map(([label, count]) => <View key={label} style={s.summaryItem}>
            <Text style={s.summaryValue}>{count}</Text><Text style={s.summaryLabel}>{label === 'All services' ? 'Total records' : label === 'Movie Center' ? 'Movie reservations' : 'Birthday benefits'}</Text>
          </View>)}
          {!compact && <Ionicons name="documents-outline" size={30} color="#F2C879" style={{ marginLeft: 'auto' }} />}
        </View>
        <View style={s.searchWrap}>
          <Ionicons name="search-outline" size={19} color={C.muted} />
          <TextInput style={s.input} value={query} onChangeText={setQuery} placeholder="Search senior, service, status or reference" placeholderTextColor={C.muted} accessibilityLabel="Search service records" autoCapitalize="none" autoCorrect={false} />
          {!!query && <Pressable onPress={() => setQuery('')} accessibilityRole="button" accessibilityLabel="Clear search"><Ionicons name="close-circle" size={20} color={C.muted} /></Pressable>}
        </View>
        <View style={s.filters}>
          {Object.entries(counts).map(([item, count]) => <Pressable key={item} style={[s.filter, service === item && s.filterActive]} accessibilityRole="button" accessibilityState={{ selected: item === service }} onPress={() => setService(item)}>
            <Text style={[s.filterText, service === item && { color: '#FFF' }]}>{item}</Text>
            <View style={s.filterCount}><Text style={s.filterCountText}>{count}</Text></View>
          </Pressable>)}
        </View>
        <View style={s.sortRow}>
          <View style={s.sortFilter}>
            <Pressable style={s.sortSelect} onPress={() => setSortMenuOpen(open => !open)} accessibilityRole="button" accessibilityState={{ expanded: sortMenuOpen }}>
              <Ionicons name="swap-vertical" size={16} color={C.primary} />
              <Text style={s.sortText}>Sort by {columns.find(([key]) => key === sort)?.[1].toLowerCase()}</Text>
              <Ionicons name={sortMenuOpen ? 'chevron-up' : 'chevron-down'} size={14} color={C.muted} />
            </Pressable>
            {sortMenuOpen && <ScrollView style={s.sortMenu} nestedScrollEnabled>
              {columns.map(([key, label]) => <Pressable key={key} style={s.sortOption} onPress={() => { chooseSort(key); setSortMenuOpen(false); }} accessibilityRole="button">
                <Text style={s.sortText}>{label}</Text>
              </Pressable>)}
            </ScrollView>}
          </View>
          <Pressable style={s.sortDirection} onPress={() => setAscending(value => !value)} accessibilityRole="button" accessibilityLabel={ascending ? 'Sort descending' : 'Sort ascending'}>
            <Ionicons name={ascending ? 'arrow-up' : 'arrow-down'} size={16} color={C.primary} />
            <Text style={s.sortText}>{ascending ? 'Ascending' : 'Descending'}</Text>
          </Pressable>
          <View style={s.exportRow}>
            {(['pdf', 'xlsx'] as const).map(format => <Pressable key={format} onPress={() => { setSortMenuOpen(false); setExportChoice(format); }} disabled={loading || !!exporting || !records.length} accessibilityRole="button" accessibilityLabel={format === 'pdf' ? 'Download A4 PDF table' : 'Download Excel table'} style={({ pressed }) => [s.exportButton, format === 'xlsx' && s.exportSecondary, (pressed || loading || !!exporting || !records.length) && { opacity: 0.7 }]}>
              {exporting === format ? <ActivityIndicator size="small" color={format === 'pdf' ? '#FFF' : C.primary} /> : <Ionicons name={format === 'pdf' ? 'document-text-outline' : 'grid-outline'} size={17} color={format === 'pdf' ? '#FFF' : C.primary} />}
              <Text style={[s.exportText, format === 'xlsx' && { color: C.primary }]}>{exporting === format ? 'Preparing...' : format === 'pdf' ? 'Download PDF' : 'Download Excel'}</Text>
            </Pressable>)}
          </View>
        </View>
        {!!exportError && <View style={s.errorCard} accessibilityRole="alert"><Text style={s.errorText}>{exportError}</Text></View>}
        <View style={s.tableMeta}>
          <Text style={s.small}>Showing {filtered.length} of {records.length} records</Text>
          {hasFilters && <Pressable onPress={() => { setQuery(''); setService('All services'); }} accessibilityRole="button"><Text style={s.clearText}>Clear filters</Text></Pressable>}
          <View style={s.frozenNote}><Ionicons name="lock-closed-outline" size={13} color={C.primary} /><Text style={s.small}>Names stay fixed as you scroll sideways</Text></View>
        </View>
        {!!error && <View style={s.errorCard} accessibilityRole="alert"><Ionicons name="cloud-offline-outline" size={24} color={C.danger} /><Text style={s.errorText}>{error}</Text><Pressable onPress={() => void load()} accessibilityRole="button"><Text style={s.clearText}>Try again</Text></Pressable></View>}
        {loading ? <View style={s.stateCard}><ActivityIndicator color={C.primary} /><Text style={s.message}>Loading service records...</Text></View>
          : error ? null : !filtered.length ? <View style={s.stateCard}><Ionicons name="documents-outline" size={30} color={C.primary} /><Text style={s.stateTitle}>{hasFilters ? 'No matching records' : 'No service records yet'}</Text><Text style={s.message}>{hasFilters ? 'Try a different name, reference or service filter.' : 'Birthday benefits and movie reservations will appear here.'}</Text></View>
          : <RecordsTable records={filtered} sort={sort} ascending={ascending} onSort={chooseSort} />}
      </>}
    </ScrollView>
    <Modal visible={exportChoice !== null} transparent animationType="fade" onRequestClose={() => setExportChoice(null)}>
      <View style={s.modalBackdrop}>
        <View style={s.exportDialog} accessibilityViewIsModal>
          <View style={s.dialogHeader}>
            <Text style={s.stateTitle}>Download {exportChoice === 'pdf' ? 'PDF' : 'Excel'}</Text>
            <Pressable onPress={() => setExportChoice(null)} accessibilityRole="button" accessibilityLabel="Close download choices" style={s.backButton}>
              <Ionicons name="close" size={20} color={C.ink} />
            </Pressable>
          </View>
          <Text style={s.subtitle}>Choose the service table to download. Includes all records for your selection.</Text>
          {Object.entries(counts).map(([item, count]) => <Pressable key={item}
            onPress={() => { if (exportChoice) void exportTable(exportChoice, item); }}
            disabled={!count || !!exporting} accessibilityRole="button" accessibilityLabel={`Download ${item}, ${count} records`}
            style={({ pressed }) => [s.downloadChoice, (!count || pressed) && { opacity: 0.5 }]}>
            <Ionicons name={item === 'All services' ? 'documents-outline' : item === 'Birthday Benefits' ? 'gift-outline' : 'film-outline'} size={22} color={C.primary} />
            <Text style={s.choiceText}>{item}</Text>
            <Text style={s.small}>{count} records</Text>
            <Ionicons name="download-outline" size={18} color={C.primary} />
          </Pressable>)}
        </View>
      </View>
    </Modal>
  </SafeAreaView>;
}

const s = StyleSheet.create({
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(15,33,24,0.45)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  exportDialog: { width: '100%', maxWidth: 480, backgroundColor: C.card, borderRadius: 22, padding: 22, gap: 14 },
  dialogHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  downloadChoice: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 12, borderWidth: 1, borderColor: C.line, backgroundColor: C.alternate },
  choiceText: { flex: 1, fontFamily: 'InterBody', fontSize: 14, fontWeight: '700', color: C.ink },
  page: { flex: 1, backgroundColor: C.bg },
  content: { padding: 20, paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  headerCopy: { flex: 1 },
  title: { fontFamily: 'FraunTitle', fontSize: 26, color: C.ink },
  subtitle: { fontFamily: 'InterBody', fontSize: 12, lineHeight: 18, color: C.muted, marginTop: 3 },
  backButton: { width: 42, height: 42, borderRadius: 14, borderWidth: 1, borderColor: C.line, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' },
  refreshButton: { width: 42, height: 42, borderRadius: 14, backgroundColor: C.soft, alignItems: 'center', justifyContent: 'center' },
  summary: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 24, backgroundColor: C.dark, borderRadius: 22, padding: 20, marginBottom: 18 },
  summaryItem: { minWidth: 80 },
  summaryValue: { fontFamily: 'FraunTitle', fontSize: 30, color: C.card },
  summaryLabel: { fontFamily: 'InterBody', fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 3 },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 14, paddingHorizontal: 16, marginBottom: 14 },
  input: { flex: 1, minWidth: 0, paddingVertical: 15, fontFamily: 'InterBody', fontSize: 14, color: C.ink },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  filter: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 24, paddingVertical: 9, paddingHorizontal: 14 },
  filterActive: { backgroundColor: C.primary, borderColor: C.primary },
  filterText: { fontFamily: 'InterBody', fontSize: 13, color: C.ink },
  filterCount: { backgroundColor: C.bg, borderRadius: 14, paddingHorizontal: 7, paddingVertical: 2 },
  filterCountText: { fontFamily: 'InterBody', fontSize: 11, fontWeight: '700', color: C.primary },
  sortRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 8, zIndex: 5 },
  sortFilter: { width: 240, maxWidth: '100%' },
  sortSelect: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: C.line, borderRadius: 22, backgroundColor: C.card, paddingHorizontal: 14, paddingVertical: 10 },
  sortDirection: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 10 },
  sortText: { fontFamily: 'InterBody', fontSize: 12, color: C.dark, flexShrink: 1 },
  sortMenu: { position: 'absolute', top: 44, width: '100%', maxHeight: 240, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 12 },
  sortOption: { padding: 12 },
  exportRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginLeft: 'auto' },
  exportButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 40, paddingVertical: 9, paddingHorizontal: 14, borderRadius: 12, backgroundColor: C.primary, borderWidth: 1, borderColor: C.primary },
  exportSecondary: { backgroundColor: C.card },
  exportText: { fontFamily: 'InterBody', fontSize: 13, fontWeight: '700', color: '#FFF' },
  tableMeta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginBottom: 12 },
  frozenNote: { flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 'auto' },
  clearText: { fontFamily: 'InterBody', fontWeight: '700', color: C.primary, fontSize: 12 },
  headingButton: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 2 },
  heading: { flex: 1, color: '#FFF', fontFamily: 'InterBody', fontSize: 12, fontWeight: '700' },
  value: { color: C.ink, fontFamily: 'InterBody', fontSize: 13, lineHeight: 21 },
  name: { color: C.ink, fontFamily: 'InterBody', fontSize: 13, fontWeight: '700', lineHeight: 21 },
  small: { color: C.muted, fontFamily: 'InterBody', fontSize: 12, lineHeight: 18 },
  identity: { gap: 2 },
  nameCell: { borderWidth: 2, borderColor: 'transparent' },
  compactNameCell: { borderWidth: 2, borderColor: 'transparent', borderRadius: 5, paddingHorizontal: 4, paddingVertical: 2 },
  selectedRow: { borderTopColor: '#2B7A50', borderBottomColor: '#2B7A50', backgroundColor: '#E8F3EC' },
  badge: { alignSelf: 'flex-start', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  badgeText: { fontFamily: 'InterBody', fontSize: 11, fontWeight: '700' },
  stateCard: { backgroundColor: C.card, borderRadius: 18, borderWidth: 1, borderColor: C.line, padding: 32, alignItems: 'center', gap: 12 },
  stateTitle: { fontFamily: 'InterBody', fontSize: 17, fontWeight: '700', color: C.ink },
  message: { fontFamily: 'InterBody', color: C.muted, textAlign: 'center', lineHeight: 21 },
  errorCard: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12, backgroundColor: C.dangerSoft, borderRadius: 16, padding: 16, marginBottom: 16 },
  errorText: { flex: 1, color: C.danger, fontFamily: 'InterBody', lineHeight: 21 },
  nativeTable: { borderWidth: 1, borderColor: C.line, borderRadius: 18, overflow: 'hidden', backgroundColor: C.card },
  nativeTableRow: { flexDirection: 'row' },
  frozenPane: { borderRightWidth: 2, borderRightColor: '#BDD2C3', zIndex: 2 },
  nativeHeader: { flexDirection: 'row', alignItems: 'center', height: 60, backgroundColor: C.dark },
  nativeRow: { flexDirection: 'row', borderTopWidth: 2, borderTopColor: 'transparent', borderBottomWidth: 2, borderBottomColor: C.line },
  nativeCell: { flexShrink: 0, paddingHorizontal: 16, paddingVertical: 16, justifyContent: 'center' },
});
