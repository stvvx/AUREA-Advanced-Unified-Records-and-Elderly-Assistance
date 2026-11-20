import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Text, TextInput } from '../components/AppText';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { useAuth } from '../context/AuthContext';

const C = {
  bg: '#F2F6F1',
  card: '#FFFFFF',
  ink: '#0F1F16',
  soft: '#41564A',
  faint: '#7A8E83',
  primary: '#1F5C3E',
  dark: '#174C35',
  line: '#E1EADF',
  softBg: '#DDF1E4',
  danger: '#B3432E',
  dangerBg: '#FDECEA',
  goldBg: '#FCF1DB',
  gold: '#7E5417',
};

const ROLES = ['user', 'senior citizen', 'osca admin', 'med admin', 'health center', 'super admin'];

function apiBase() {
  const env = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (env) return env;
  const hostUri = Constants.expoConfig?.hostUri || '';
  const host = hostUri.split(':')[0];
  return host ? `http://${host}:5000` : 'http://localhost:5000';
}

async function request(path: string, token: string, options: RequestInit = {}) {
  const response = await fetch(`${apiBase()}${path}`, {
    ...options,
    headers: { ...(options.headers || {}), Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || body.error || 'The request could not be completed.');
  return body;
}

function nameOf(person: any) {
  return [person.firstName, person.middleName, person.lastName].filter(Boolean).join(' ') || person.email || 'Unnamed user';
}

function formatDate(value: any) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

export default function AdminManagement() {
  const router = useRouter();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ section?: string }>();
  const [section, setSection] = useState(params.section || 'users');
  const [users, setUsers] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});
  const [issues, setIssues] = useState<any[]>([]);
  const [feedback, setFeedback] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [category, setCategory] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [roleFilter, setRoleFilter] = useState('all');
  const [roleTarget, setRoleTarget] = useState<any | null>(null);
  const [reportTarget, setReportTarget] = useState<any | null>(null);

  useEffect(() => {
    if (params.section && params.section !== section) setSection(params.section);
  }, [params.section, section]);

  const load = useCallback(async () => {
    if (!user?.token) return;
    setLoading(true);
    setError('');
    try {
      const results = await Promise.allSettled([
        request('/api/admin/users', user.token),
        request('/api/admin/transactions?category=all', user.token),
        request('/api/issues', user.token),
        request('/api/admin/feedback', user.token),
        request('/api/admin/audit-logs', user.token),
      ]);
      const [userResult, transactionResult, issueResult, feedbackResult, auditResult] = results;
      if (userResult.status === 'fulfilled') setUsers(userResult.value.users || []);
      if (transactionResult.status === 'fulfilled') {
        setTransactions(transactionResult.value.transactions || []);
        setStats(transactionResult.value.stats || {});
      }
      if (issueResult.status === 'fulfilled') setIssues(issueResult.value.issues || []);
      if (feedbackResult.status === 'fulfilled') setFeedback(feedbackResult.value.feedback || []);
      if (auditResult.status === 'fulfilled') setLogs(auditResult.value.logs || []);
      const firstFailure = results.find((result) => result.status === 'rejected');
      if (firstFailure?.status === 'rejected') {
        setError(firstFailure.reason instanceof Error ? firstFailure.reason.message : 'Some management data could not be loaded.');
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load management data.');
    } finally {
      setLoading(false);
    }
  }, [user?.token]);

  useEffect(() => { load(); }, [load]);

  const updateUser = async (target: any, changes: { status?: string; role?: string }) => {
    if (!user?.token) return;
    try {
      const result = await request(`/api/admin/users/${target.id}`, user.token, { method: 'PATCH', body: JSON.stringify(changes) });
      setUsers((current) => current.map((item) => item.id === target.id ? { ...item, ...result.user } : item));
      setSelected((current: any | null) => current?.id === target.id ? { ...current, ...result.user } : current);
      setRoleTarget(null);
    } catch (updateError) {
      Alert.alert('Could not update user', updateError instanceof Error ? updateError.message : 'Try again.');
    }
  };

  const deleteUser = (target: any) => {
    Alert.alert('Delete account', `Delete ${nameOf(target)} permanently?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          if (!user?.token) return;
          try {
            await request(`/api/admin/users/${target.id}`, user.token, { method: 'DELETE' });
            setUsers((current) => current.filter((item) => item.id !== target.id));
            setSelected(null);
          } catch (deleteError) {
            Alert.alert('Could not delete user', deleteError instanceof Error ? deleteError.message : 'Try again.');
          }
        },
      },
    ]);
  };

  const updateIssue = async (target: any, status: string) => {
    if (!user?.token || !target.id) return;
    try {
      await request(`/api/admin/issues/${target.id}`, user.token, { method: 'PATCH', body: JSON.stringify({ status }) });
      setIssues((current) => current.map((item) => item.id === target.id ? { ...item, status } : item));
    } catch (issueError) {
      Alert.alert('Could not update report', issueError instanceof Error ? issueError.message : 'Try again.');
    }
  };

  const filteredTransactions = useMemo(
    () => transactions.filter((item) => category === 'all' || item.category === category),
    [transactions, category],
  );
  const combinedReports = useMemo(
    () => [
      ...issues.map((item) => ({ ...item, kind: 'Issue', title: item.subject, body: item.description })),
      ...feedback.map((item) => ({ ...item, kind: 'Feedback', title: item.subject || item.title || (item.service_key === 'system' ? 'Overall system review' : 'Service feedback'), body: item.comments || item.message || item.description })),
    ],
    [issues, feedback],
  );
  const filteredUsers = useMemo(() => users.filter((item) => {
    const text = `${nameOf(item)} ${item.email || ''} ${item.address || ''}`.toLowerCase();
    return text.includes(query.toLowerCase())
      && (statusFilter === 'All' || (item.status || 'Active') === statusFilter);
  }), [users, query, statusFilter]);
  const roleUsers = useMemo(
    () => users.filter((item) => roleFilter === 'all' || String(item.role || 'user').toLowerCase() === roleFilter),
    [users, roleFilter],
  );
  const roleCount = (role: string) => users.filter((item) => String(item.role || 'user').toLowerCase() === role).length;
  const sectionMeta: Record<string, { eyebrow: string; title: string; subtitle: string; icon: string }> = {
    users: { eyebrow: 'SUPER ADMIN', title: 'All users', subtitle: 'Manage registered AUREA accounts', icon: 'people' },
    transactions: { eyebrow: 'SUPER ADMIN', title: 'Transactions', subtitle: 'Review benefits and cinema activity', icon: 'swap-horizontal' },
    issues: { eyebrow: 'SUPER ADMIN', title: 'Reports & feedback', subtitle: 'Review resident-submitted concerns', icon: 'flag' },
    roles: { eyebrow: 'SUPER ADMIN', title: 'Roles & access', subtitle: 'Manage permissions by account role', icon: 'shield-checkmark' },
    audit: { eyebrow: 'SUPER ADMIN', title: 'Audit logs', subtitle: 'Review administrative activity', icon: 'server' },
  };
  const meta = sectionMeta[section] || sectionMeta.users;

  if (loading) {
    return <View style={s.center}><ActivityIndicator color={C.primary} size="large" /></View>;
  }

  return (
    <View style={s.page}>
      <View style={s.topbar}>
        <Pressable onPress={() => router.back()} style={s.back}><Ionicons name="arrow-back" size={20} color="#FFF" /></Pressable>
        <View style={s.headerIcon}><Ionicons name={meta.icon as any} size={21} color="#F6D17A" /></View>
        <View style={{ flex: 1 }}><Text style={s.eyebrow}>{meta.eyebrow}</Text><Text style={s.title}>{meta.title}</Text><Text style={s.subtitle}>{meta.subtitle}</Text></View>
        <Pressable onPress={load} style={s.back}><Ionicons name="refresh" size={20} color="#FFF" /></Pressable>
      </View>
      {error ? <Text style={s.error}>{error}</Text> : null}
      {section === 'users' && (
        <ScrollView contentContainerStyle={s.content}>
          <View style={s.metrics}><Metric value={users.length} label="Registered users" /><Metric value={users.filter((item) => (item.status || 'Active') === 'Active').length} label="Active accounts" /><Metric value={users.filter((item) => (item.status || 'Active') !== 'Active').length} label="Disabled accounts" /></View>
          <View style={s.toolbar}><Ionicons name="search" size={18} color={C.faint} /><TextInput value={query} onChangeText={setQuery} placeholder="Search name, email, address..." placeholderTextColor={C.faint} style={s.search} /><Pressable onPress={() => { setQuery(''); setStatusFilter('All'); }}><Text style={s.clear}>Clear</Text></Pressable></View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>{['All', 'Active', 'Inactive', 'Suspended'].map((item) => <Pressable key={item} onPress={() => setStatusFilter(item)} style={[s.chip, statusFilter === item && s.chipActive]}><Text style={[s.chipText, statusFilter === item && s.chipTextActive]}>{item}</Text></Pressable>)}</ScrollView>
          <Text style={s.count}>Showing {filteredUsers.length} of {users.length} users</Text>
          <View style={s.table}>
            <View style={s.tableHead}><Text style={[s.cell, s.headCell]}>Name</Text><Text style={[s.cell, s.headCell]}>Email</Text><Text style={[s.cell, s.headCell]}>Status</Text><Text style={s.actionCell}>Action</Text></View>
            {filteredUsers.map((item) => (
              <Pressable key={item.id} onPress={() => setSelected(item)} style={s.tableRow}>
                <Text style={s.cell} numberOfLines={1}>{nameOf(item)}</Text>
                <Text style={s.cell} numberOfLines={1}>{item.email || '—'}</Text>
                <Text style={[s.cell, { color: item.status === 'Active' ? C.primary : C.danger }]}>{item.status || 'Active'}</Text>
                <Text style={s.actionCell}>View</Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      )}
      {section === 'transactions' && (
        <ScrollView contentContainerStyle={s.content}>
          <View style={s.metrics}><Metric value={stats.total ?? 0} label="Total" /><Metric value={stats.completed ?? 0} label="Completed" /><Metric value={stats.pending ?? 0} label="Pending" /></View>
          <View style={s.chips}>{['all', 'birthday', 'cinema'].map((item) => <Pressable key={item} onPress={() => setCategory(item)} style={[s.chip, category === item && s.chipActive]}><Text style={[s.chipText, category === item && s.chipTextActive]}>{item} ({item === 'all' ? stats.total ?? 0 : stats.byCategory?.[item] ?? 0})</Text></Pressable>)}</View>
          {filteredTransactions.map((item, index) => {
            const status = item.benefit_status || item.status || 'Unknown';
            const isPositive = ['confirmed', 'released', 'approved', 'completed'].includes(String(status).toLowerCase());
            return <View key={item.id || index} style={s.transactionCard}>
              <View style={s.transactionHeader}>
                <View style={s.transactionIcon}><Ionicons name={item.category === 'cinema' ? 'film-outline' : 'gift-outline'} size={18} color={C.primary} /></View>
                <View style={{ flex: 1 }}><Text style={s.cardTitle}>{item.category || 'Service'} transaction</Text><Text style={s.transactionType}>{item.benefit_type || 'Cinema reservation'}</Text></View>
                <Text style={[s.statusBadge, isPositive ? s.statusPositive : s.statusNeutral]}>{status}</Text>
              </View>
              <View style={s.transactionFooter}><Text style={s.cardText}>{formatDate(item.created_at)}</Text><Text style={s.reference}>Ref. {item.id || '—'}</Text></View>
            </View>;
          })}
        </ScrollView>
      )}
      {section === 'issues' && <ScrollView contentContainerStyle={s.content}>{combinedReports.length === 0 ? <Text style={s.empty}>No reports or feedback yet.</Text> : combinedReports.map((item, index) => <View key={item.id || index} style={s.detailCard}><Text style={s.cardTitle}>{item.kind}: {item.title}</Text>{item.rating ? <Text style={s.ratingText}>{'★'.repeat(Number(item.rating))}{'☆'.repeat(5 - Number(item.rating))} · {item.rating}/5</Text> : null}<Text style={s.cardText}>{item.body || 'No description provided.'}</Text><Text style={s.cardText}>{item.status || 'Submitted'} · {formatDate(item.created_at)}</Text><View style={s.reportActions}><Pressable onPress={() => setReportTarget(item)} style={s.outlineButton}><Text style={s.outlineButtonText}>View full details</Text></Pressable>{item.kind === 'Issue' && <View style={s.chips}>{['open', 'in_progress', 'resolved', 'closed'].map((status) => <Pressable key={status} onPress={() => updateIssue(item, status)} style={[s.chip, item.status === status && s.chipActive]}><Text style={[s.chipText, item.status === status && s.chipTextActive]}>{status}</Text></Pressable>)}</View>}</View></View>)}</ScrollView>}
      {section === 'roles' && (
        <ScrollView contentContainerStyle={s.content}>
          <Text style={s.count}>Users by role</Text>
          <View style={s.roleFilters}>
            <Pressable onPress={() => setRoleFilter('all')} style={[s.roleFilter, roleFilter === 'all' && s.roleFilterActive]}><Text style={[s.roleFilterText, roleFilter === 'all' && s.roleFilterTextActive]}>All users {users.length}</Text></Pressable>
            {ROLES.map((role) => <Pressable key={role} onPress={() => setRoleFilter(role)} style={[s.roleFilter, roleFilter === role && s.roleFilterActive]}><Text style={[s.roleFilterText, roleFilter === role && s.roleFilterTextActive]}>{role} {roleCount(role)}</Text></Pressable>)}
          </View>
          <Text style={[s.count, { marginTop: 12 }]}>Change a user role</Text>
          {roleUsers.map((item) => {
            const isCurrentAccount = String(item.id) === String(user?.id);
            return <View key={item.id} style={s.roleEditor}><View style={s.roleUserInfo}><Text style={s.editorName}>{nameOf(item)}</Text><Text style={s.currentRole}>{item.role || 'user'}</Text></View><Pressable onPress={() => setRoleTarget(item)} disabled={isCurrentAccount} style={[s.button, isCurrentAccount && s.disabledButton]}><Text style={[s.buttonText, isCurrentAccount && s.disabledButtonText]}>{isCurrentAccount ? 'Current account' : 'Change role'}</Text></Pressable></View>;
          })}
        </ScrollView>
      )}
      {section === 'audit' && <ScrollView contentContainerStyle={s.content}>{logs.length === 0 ? <Text style={s.empty}>No administrative actions recorded yet.</Text> : <><Text style={s.count}>{logs.length} administrative actions</Text>{logs.map((item, index) => <View key={item.id || index} style={s.detailCard}><Text style={s.cardTitle}>{item.action || 'Administrative action'}</Text><Text style={s.cardText}>{item.entity_type || 'System'} {item.entity_id || ''}</Text><Text style={s.cardText}>{item.details ? JSON.stringify(item.details) : 'No additional details.'}</Text><Text style={s.cardText}>{formatDate(item.created_at)}</Text></View>)}</>}</ScrollView>}
      <Modal visible={!!selected} transparent animationType="fade" onRequestClose={() => setSelected(null)}>
        <View style={s.modalBackdrop}><View style={s.modal}>
          <View style={s.modalHead}><Text style={s.title}>User details</Text><Pressable onPress={() => setSelected(null)}><Ionicons name="close" size={22} color={C.ink} /></Pressable></View>
          {selected && <><Text style={s.cardTitle}>{nameOf(selected)}</Text><Text style={s.cardText}>{selected.email || 'No email'}</Text><Text style={s.cardText}>{selected.contact || 'No contact'} · {selected.address || 'No address'}</Text><Text style={s.cardText}>Status: {selected.status || 'Active'}</Text><View style={s.modalActions}><Pressable onPress={() => updateUser(selected, { status: selected.status === 'Active' ? 'Inactive' : 'Active' })} style={s.button}><Text style={s.buttonText}>{selected.status === 'Active' ? 'Disable' : 'Enable'}</Text></Pressable><Pressable onPress={() => deleteUser(selected)} style={[s.button, s.deleteButton]}><Text style={s.deleteText}>Delete</Text></Pressable></View></>}
        </View></View>
      </Modal>
      <Modal visible={!!roleTarget} transparent animationType="fade" onRequestClose={() => setRoleTarget(null)}>
        <View style={s.modalBackdrop}><View style={s.modal}>
          <View style={s.modalHead}><Text style={s.modalTitle}>Change role</Text><Pressable onPress={() => setRoleTarget(null)}><Ionicons name="close" size={22} color={C.ink} /></Pressable></View>
          <Text style={s.cardText}>{roleTarget ? nameOf(roleTarget) : ''}</Text>
          <View style={s.roleModalOptions}>{ROLES.map((role) => <Pressable key={role} onPress={() => roleTarget && updateUser(roleTarget, { role })} style={[s.roleOption, roleTarget && String(roleTarget.role || 'user').toLowerCase() === role && s.roleOptionActive]}><Text style={[s.roleOptionText, roleTarget && String(roleTarget.role || 'user').toLowerCase() === role && s.roleOptionTextActive]}>{role}</Text></Pressable>)}</View>
        </View></View>
      </Modal>
      <Modal visible={!!reportTarget} transparent animationType="fade" onRequestClose={() => setReportTarget(null)}>
        <View style={s.modalBackdrop}><View style={s.modal}>
          <View style={s.modalHead}><Text style={s.modalTitle}>Report details</Text><Pressable onPress={() => setReportTarget(null)}><Ionicons name="close" size={22} color={C.ink} /></Pressable></View>
          {reportTarget && <><Text style={s.cardTitle}>{reportTarget.kind}: {reportTarget.title || 'Untitled report'}</Text>{reportTarget.rating ? <Text style={s.ratingText}>{'★'.repeat(Number(reportTarget.rating))}{'☆'.repeat(5 - Number(reportTarget.rating))} · {reportTarget.rating}/5</Text> : null}<Text style={s.cardText}>{reportTarget.body || 'No description provided.'}</Text><Text style={s.cardText}>Status: {reportTarget.status || 'Submitted'}</Text><Text style={s.cardText}>Submitted: {formatDate(reportTarget.created_at)}</Text></>}
        </View></View>
      </Modal>
    </View>
  );
}

function Metric({ value, label }: { value: number; label: string }) {
  return <View style={s.metric}><Text style={s.metricValue}>{value}</Text><Text style={s.metricLabel}>{label}</Text></View>;
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg },
  topbar: { flexDirection: 'row', alignItems: 'center', gap: 12, margin: 18, padding: 14, borderRadius: 20, backgroundColor: C.dark },
  back: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)' },
  headerIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(215,154,53,0.18)' },
  eyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, color: '#F6D17A' },
  title: { fontSize: 20, fontWeight: '700', color: '#FFF' },
  subtitle: { fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  content: { padding: 18, gap: 10 },
  count: { fontSize: 15, fontWeight: '700', color: C.ink, marginBottom: 4 },
  table: { backgroundColor: C.card, borderRadius: 16, overflow: 'hidden' },
  tableHead: { flexDirection: 'row', backgroundColor: C.dark, padding: 12 },
  tableRow: { flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: C.line },
  cell: { flex: 1, minWidth: 100, fontSize: 12, color: C.soft, marginRight: 8 },
  headCell: { color: '#FFF', fontWeight: '700' },
  actionCell: { width: 48, fontSize: 12, fontWeight: '700', color: C.primary },
  metrics: { flexDirection: 'row', gap: 10 },
  metric: { flex: 1, padding: 14, borderRadius: 14, backgroundColor: C.card },
  metricValue: { fontSize: 24, fontWeight: '700', color: C.dark },
  metricLabel: { fontSize: 11, color: C.soft, marginTop: 3 },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, paddingHorizontal: 14, borderRadius: 14, backgroundColor: C.card, borderWidth: 1, borderColor: C.line },
  search: { flex: 1, minWidth: 0, color: C.ink, fontSize: 13 },
  clear: { color: C.primary, fontWeight: '700', fontSize: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderRadius: 18, paddingHorizontal: 13, paddingVertical: 8, backgroundColor: C.card },
  chipActive: { backgroundColor: C.dark },
  chipText: { fontSize: 12, fontWeight: '600', color: C.soft },
  chipTextActive: { color: '#FFF' },
  detailCard: { padding: 15, borderRadius: 14, backgroundColor: C.card, gap: 4 },
  transactionCard: { padding: 16, borderRadius: 16, backgroundColor: C.card, gap: 14, borderWidth: 1, borderColor: C.line },
  transactionHeader: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  transactionIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: C.softBg },
  transactionType: { fontSize: 12, color: C.faint, marginTop: 3 },
  statusBadge: { borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6, fontSize: 11, fontWeight: '700', overflow: 'hidden' },
  statusPositive: { color: C.primary, backgroundColor: C.softBg },
  statusNeutral: { color: C.gold, backgroundColor: C.goldBg },
  transactionFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 11, borderTopWidth: 1, borderTopColor: C.line },
  reference: { fontSize: 11, color: C.faint, maxWidth: '60%' },
  reportActions: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  outlineButton: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: C.primary },
  outlineButtonText: { color: C.primary, fontSize: 12, fontWeight: '700' },
  cardTitle: { fontSize: 14, fontWeight: '700', color: C.ink },
  cardText: { fontSize: 12, lineHeight: 18, color: C.soft },
  ratingText: { fontSize: 13, fontWeight: '700', color: C.gold, letterSpacing: 1 },
  empty: { padding: 30, textAlign: 'center', color: C.soft },
  roleFilters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  roleFilter: { paddingHorizontal: 11, paddingVertical: 8, borderRadius: 12, backgroundColor: C.card, borderWidth: 1, borderColor: C.line },
  roleFilterActive: { backgroundColor: C.dark, borderColor: C.dark },
  roleFilterText: { fontSize: 11, color: C.soft, fontWeight: '600' },
  roleFilterTextActive: { color: '#FFF' },
  roleName: { fontSize: 13, color: C.soft },
  roleTotal: { fontSize: 16, fontWeight: '700', color: C.dark },
  roleEditor: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 13, backgroundColor: C.card, borderRadius: 12, gap: 9 },
  roleUserInfo: { flex: 1, gap: 3 },
  editorName: { fontSize: 13, fontWeight: '700', color: C.ink },
  currentRole: { fontSize: 11, color: C.faint },
  roleChip: { borderRadius: 14, paddingHorizontal: 10, paddingVertical: 7, marginRight: 6, backgroundColor: C.line },
  roleChipActive: { backgroundColor: C.dark },
  roleChipText: { fontSize: 11, color: C.soft },
  roleChipTextActive: { color: '#FFF' },
  error: { margin: 14, padding: 12, borderRadius: 10, backgroundColor: C.dangerBg, color: C.danger },
  modalBackdrop: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor: 'rgba(0,0,0,.4)' },
  modal: { width: '100%', maxWidth: 560, padding: 20, borderRadius: 20, backgroundColor: C.card, gap: 7 },
  modalHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: C.ink },
  roleModalOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  roleOption: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 11, backgroundColor: C.line },
  roleOptionActive: { backgroundColor: C.dark },
  roleOptionText: { fontSize: 12, fontWeight: '600', color: C.soft },
  roleOptionTextActive: { color: '#FFF' },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  button: { paddingHorizontal: 15, paddingVertical: 10, borderRadius: 11, backgroundColor: C.dark },
  buttonText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
  disabledButton: { backgroundColor: C.line },
  disabledButtonText: { color: C.faint },
  deleteButton: { backgroundColor: C.dangerBg },
  deleteText: { color: C.danger, fontSize: 12, fontWeight: '700' },
});
