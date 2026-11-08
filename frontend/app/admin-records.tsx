import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { API_BASE_URL } from '../services/loloApi';

type ServiceRecord = {
  id: string; reference: string; userId: number; lastName: string; firstName: string; middleName: string;
  service: string; details: string; date: string | null; status: string; validation: string | null;
  serviceDate: string | null; amount: number | string | null; contact: string; address: string;
};
const columns = [
  ['lastName', 'Last name', 160], ['firstName', 'First name', 160], ['middleName', 'Middle name', 160],
  ['service', 'Service', 180], ['details', 'Service details', 250], ['date', 'Requested on', 180],
  ['status', 'Status', 150], ['validation', 'Validation', 150], ['serviceDate', 'Release / screening date', 200],
  ['amount', 'Benefit amount', 160], ['contact', 'Contact', 180], ['address', 'Address', 300], ['reference', 'Reference', 300],
] as const;
type Column = typeof columns[number][0];
const tableWidth = columns.reduce((sum, [, , width]) => sum + width, 0);
function textValue(record: ServiceRecord, key: Column): string {
  const value = record[key];
  if (value === null || value === undefined || value === '') return '—';
  if (key === 'amount') return `₱${Number(value).toLocaleString('en-PH')}`;
  if (key === 'date' || key === 'serviceDate') {
    const date = new Date(String(value).length === 10 ? `${value}T00:00:00` : value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }
  return String(value);
}

export default function AdminRecords() {
  const router = useRouter();
  const { height } = useWindowDimensions();
  const { user, loading: authLoading } = useAuth();
  const allowed = ['osca admin', 'super admin'].includes(String(user?.role ?? '').trim().toLowerCase());
  const [records, setRecords] = useState<ServiceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [service, setService] = useState('All services');
  const [menuOpen, setMenuOpen] = useState(false);
  const [sort, setSort] = useState<Column>('date');
  const [ascending, setAscending] = useState(false);
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/service-records`, { headers: { Authorization: `Bearer ${user?.token ?? ''}` } });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Could not load records.');
      setRecords(data.records ?? []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load records.'); }
    finally { setLoading(false); }
  }, [user]);
  useFocusEffect(useCallback(() => { if (!authLoading && allowed) void load(); }, [authLoading, allowed, load]));
  const filtered = useMemo(() => records.filter(record => (service === 'All services' || record.service === service)
    && (!query.trim() || columns.some(([key]) => textValue(record, key).toLowerCase().includes(query.trim().toLowerCase()))))
    .sort((a, b) => {
      const left = a[sort]; const right = b[sort];
      if (left === null || left === '') return right === null || right === '' ? 0 : 1;
      if (right === null || right === '') return -1;
      const comparison = sort === 'amount' ? Number(left) - Number(right)
        : String(left).localeCompare(String(right), 'en', { sensitivity: 'base', numeric: true });
      return ascending ? comparison : -comparison;
    }), [records, service, query, sort, ascending]);

  return <SafeAreaView style={s.page}>
    <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
      <View style={s.header}>
        <Pressable onPress={() => router.back()} accessibilityRole="button"><Text style={s.action}>‹ Back</Text></Pressable>
        <Text style={s.title}>Records</Text>
        {allowed && <Pressable onPress={() => void load()} disabled={loading} accessibilityRole="button"><Text style={s.action}>Refresh</Text></Pressable>}
      </View>
      {authLoading ? <ActivityIndicator color="#1F5C3E" /> : !allowed ? <Text style={s.message}>Sign in as an OSCA or super administrator to view service records.</Text> : <>
        <Text style={s.subtitle}>Senior citizen service history · Birthday benefits and movie reservations</Text>
        <TextInput style={s.input} value={query} onChangeText={setQuery} placeholder="Search senior, service, status or reference…" accessibilityLabel="Search service records" autoCapitalize="none" />
        <Pressable style={s.select} onPress={() => setMenuOpen(open => !open)} accessibilityRole="button" accessibilityState={{ expanded: menuOpen }}>
          <Text style={s.value}>{service}</Text><Text>{menuOpen ? '▲' : '▼'}</Text>
        </Pressable>
        {menuOpen && <View style={s.menu}>{['All services', 'Birthday Benefits', 'Movie Center'].map(item =>
          <Pressable key={item} style={s.option} accessibilityRole="button" accessibilityState={{ selected: item === service }} onPress={() => { setService(item); setMenuOpen(false); }}><Text style={s.value}>{item}{item === service ? ' ✓' : ''}</Text></Pressable>)}</View>}
        <Text style={s.subtitle}>Showing {filtered.length} of {records.length} service records. Swipe sideways for details.</Text>
        {!!error && <Text style={s.error} accessibilityRole="alert">{error}</Text>}
        {loading ? <ActivityIndicator color="#1F5C3E" /> : error ? <Pressable onPress={() => void load()}><Text style={s.action}>Try again</Text></Pressable>
          : !filtered.length ? <Text style={s.message}>No service records match your filters.</Text> :
          <ScrollView horizontal nestedScrollEnabled style={[s.table, { height: Math.max(420, height * 0.72) }]} contentContainerStyle={{ width: tableWidth }}>
            <View style={{ width: tableWidth, height: '100%' }}>
              <View style={[s.row, s.tableHeader]}>{columns.map(([key, label, width]) => <Pressable key={key} style={[s.cell, s.headingCell, { width }]} accessibilityRole="button" accessibilityLabel={`Sort by ${label}`} onPress={() => { if (sort === key) setAscending(value => !value); else { setSort(key); setAscending(true); } }}>
                <Text style={s.heading}>{label}</Text><Text style={s.arrow}>{sort === key ? ascending ? '↑' : '↓' : '↕'}</Text>
              </Pressable>)}</View>
              <ScrollView style={{ flex: 1 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">{filtered.map((record, index) => <View key={record.id} style={[s.row, index % 2 === 1 && s.alternate]}>
                {columns.map(([key, , width]) => <View key={key} style={[s.cell, { width }]}><Text selectable style={s.value}>{textValue(record, key)}</Text></View>)}
              </View>)}</ScrollView>
            </View>
          </ScrollView>}
      </>}
    </ScrollView>
  </SafeAreaView>;
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F2F5EF' }, content: { padding: 20, paddingBottom: 32 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 12 },
  title: { flex: 1, fontSize: 26, fontWeight: '700', color: '#13201A' }, action: { color: '#1F5C3E', fontWeight: '700', paddingVertical: 10 },
  subtitle: { color: '#5B6E62', marginVertical: 12, lineHeight: 20 },
  input: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E1E9DD', borderRadius: 12, padding: 14, fontSize: 15, marginBottom: 12 },
  select: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E1E9DD', borderRadius: 12, padding: 14, flexDirection: 'row', justifyContent: 'space-between' },
  menu: { backgroundColor: '#FFF', borderRadius: 12, marginTop: 4 }, option: { padding: 14 },
  message: { paddingVertical: 24, color: '#5B6E62' }, error: { color: '#B3432E', marginBottom: 12 },
  table: { borderWidth: 1, borderColor: '#E1E9DD', borderRadius: 14, overflow: 'hidden', backgroundColor: '#FFF' },
  row: { width: tableWidth, flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#E1E9DD' },
  cell: { flexShrink: 0, padding: 14, justifyContent: 'center', borderRightWidth: 1, borderRightColor: '#E1E9DD', minHeight: 62 },
  tableHeader: { backgroundColor: '#0F3323' }, headingCell: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  heading: { flex: 1, color: '#FFF', fontWeight: '700' }, arrow: { color: '#FFF' },
  value: { color: '#13201A', lineHeight: 21 }, alternate: { backgroundColor: '#F8FAF6' },
});
