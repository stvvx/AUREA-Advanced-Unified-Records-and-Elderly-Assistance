import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  StatusBar,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import Toast from '../components/Toast';
import Constants from 'expo-constants';

function shadow(color: string, opacity: number, radius = 14, height = 6) {
  return Platform.select({
    ios: { shadowColor: color, shadowOpacity: opacity, shadowRadius: radius, shadowOffset: { width: 0, height } },
    android: { elevation: Math.round(radius * 0.6) },
    default: {},
  });
}

const C = {
  bg:          '#F6F8F2',
  card:        '#FFFFFF',
  ink:         '#132018',
  inkSoft:     '#3E5246',
  inkFaint:    '#71857A',
  primary:     '#1F5C3E',
  primaryDark: '#0F3323',
  primaryMid:  '#2E7A50',
  primarySoft: '#DCEFE3',
  gold:        '#C4892E',
  goldDark:    '#7E5417',
  goldSoft:    '#FBF0DA',
  white:       '#FFFFFF',
  line:        '#DCE7D8',
  danger:      '#B3432E',
  dangerSoft:  '#FDECEA',
};

const sp = (n: number) => n * 4;

const ROLE_META: Record<string, { label: string; color: string; icon: string }> = {
  'osca admin':  { label: 'OSCA Admin',  color: C.primaryDark, icon: 'people'        },
  'med admin':   { label: 'Med Admin',   color: '#1A5276',     icon: 'medkit'        },
  'super admin': { label: 'Super Admin', color: '#6D3B00',     icon: 'shield'        },
};

const OSCA_ACTIONS = [
  { icon: 'people',          label: 'Senior Citizens',  desc: 'View & manage registrants'   },
  { icon: 'document-text',   label: 'Records',          desc: 'Access unified records'       },
  { icon: 'card',            label: 'ID Requests',      desc: 'Process digital ID requests'  },
  { icon: 'gift',            label: 'Benefits',         desc: 'Manage benefit distributions' },
];

const MED_ACTIONS = [
  { icon: 'medkit',          label: 'Medical Records',  desc: 'View health records'          },
  { icon: 'calendar',        label: 'Appointments',     desc: 'Manage health appointments'   },
  { icon: 'flask',           label: 'Prescriptions',    desc: 'Track prescriptions'          },
  { icon: 'pulse',           label: 'Health Reports',   desc: 'Generate health summaries'    },
];

const SUPER_ACTIONS = [
  { icon: 'people-circle',   label: 'All Users',        desc: 'Manage all system users'      },
  { icon: 'swap-horizontal', label: 'Transactions',     desc: 'View all transactions'        },
  { icon: 'settings',        label: 'System Settings',  desc: 'Configure system parameters'  },
  { icon: 'bar-chart',       label: 'Reports',          desc: 'Full analytics & reports'     },
  { icon: 'shield-checkmark',label: 'Roles & Access',   desc: 'Manage roles & permissions'   },
  { icon: 'server',          label: 'Audit Logs',       desc: 'View system audit trail'      },
];

function getActions(role: string) {
  if (role === 'super admin') return SUPER_ACTIONS;
  if (role === 'med admin')   return MED_ACTIONS;
  return OSCA_ACTIONS;
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------
function getBaseUrl() {
  const hostUri =
    Constants.expoConfig?.hostUri ||
    (Constants as any).manifest2?.extra?.expoClient?.hostUri || '';
  const lanHost = hostUri.split(':')[0];
  const hasLan = /^\d{1,3}(\.\d{1,3}){3}$/.test(lanHost);
  const env = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (env) {
    if (env.includes('localhost') || env.includes('127.0.0.1')) {
      if (hasLan) return env.replace('localhost', lanHost).replace('127.0.0.1', lanHost);
      if (Platform.OS === 'android') return env.replace('localhost', '10.0.2.2').replace('127.0.0.1', '10.0.2.2');
    }
    return env;
  }
  if (hasLan) return `http://${lanHost}:5000`;
  if (Platform.OS === 'android') return 'http://10.0.2.2:5000';
  return 'http://localhost:5000';
}

const API = getBaseUrl();

async function fetchUsers(): Promise<any[]> {
  const res = await fetch(`${API}/api/admin/users`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message || 'Failed to fetch users.');
  return data.users ?? [];
}

async function fetchTransactions(): Promise<any[]> {
  const res = await fetch(`${API}/api/admin/transactions`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message || 'Failed to fetch transactions.');
  return data.transactions ?? [];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function AdminDashboard() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const insets = useSafeAreaInsets();
  const role = (user?.role ?? 'osca admin').toLowerCase();
  const meta = ROLE_META[role] ?? ROLE_META['osca admin'];
  const actions = getActions(role);
  const isSuperAdmin = role === 'super admin';

  const [users, setUsers]               = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loadingTx, setLoadingTx]       = useState(false);
  const [activeTab, setActiveTab]       = useState<'users' | 'transactions'>('users');

  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' as 'success' | 'error' });
  const showToast = (message: string, type: 'success' | 'error' = 'success') =>
    setToast({ visible: true, message, type });

  const handleLogout = async () => {
    await logout();
    showToast('Logged out successfully.');
    setTimeout(() => router.replace('/login'), 1200);
  };

  useEffect(() => {
    if (!isSuperAdmin) return;
    setLoadingUsers(true);
    fetchUsers()
      .then(setUsers)
      .catch(() => showToast('Could not load users.', 'error'))
      .finally(() => setLoadingUsers(false));
  }, [isSuperAdmin]);

  useEffect(() => {
    if (!isSuperAdmin || activeTab !== 'transactions') return;
    setLoadingTx(true);
    fetchTransactions()
      .then(setTransactions)
      .catch(() => showToast('Could not load transactions.', 'error'))
      .finally(() => setLoadingTx(false));
  }, [isSuperAdmin, activeTab]);

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />
      <Toast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        onHide={() => setToast(t => ({ ...t, visible: false }))}
      />

      <ScrollView
        style={s.scroll}
        contentContainerStyle={[s.container, { paddingTop: Math.max(insets.top, sp(2)) }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── HEADER ── */}
        <View style={s.header}>
          <View style={s.brand}>
            <LinearGradient colors={[C.primaryMid, C.primaryDark]} style={s.logoGrad}>
              <Ionicons name="shield-checkmark" size={24} color={C.white} />
            </LinearGradient>
            <View>
              <Text style={s.eyebrow}>MUNICIPALITY OF PATEROS</Text>
              <Text style={s.h1}>AUREA</Text>
            </View>
          </View>
          <TouchableOpacity style={s.logoutBtn} onPress={handleLogout} activeOpacity={0.8}>
            <Ionicons name="log-out-outline" size={17} color={C.primaryDark} />
            <Text style={s.logoutTxt}>Log out</Text>
          </TouchableOpacity>
        </View>

        {/* ── WELCOME BANNER ── */}
        <LinearGradient
          colors={[meta.color, C.primaryDark]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={s.banner}
        >
          <View style={s.bannerLeft}>
            <Text style={s.bannerLabel}>{meta.label}</Text>
            <Text style={s.bannerName}>{user?.firstName} {user?.lastName}</Text>
            <Text style={s.bannerEmail} numberOfLines={1}>{user?.email}</Text>
          </View>
          <View style={s.bannerIcon}>
            <Ionicons name={meta.icon as any} size={32} color="rgba(255,255,255,0.9)" />
          </View>
        </LinearGradient>

        {/* ── QUICK ACTIONS ── */}
        <View style={s.sectionHead}>
          <Text style={s.sectionEye}>QUICK ACTIONS</Text>
          <Text style={s.sectionTitle}>Dashboard</Text>
        </View>

        <View style={s.grid}>
          {actions.map((a) => (
            <TouchableOpacity
              key={a.label}
              style={s.actionCard}
              activeOpacity={0.8}
              onPress={() => {
                if (a.label === 'Benefits') router.push('/benefit-selection');
              }}
            >
              <View style={s.actionIconWrap}>
                <Ionicons name={a.icon as any} size={22} color={C.primaryDark} />
              </View>
              <Text style={s.actionLabel}>{a.label}</Text>
              <Text style={s.actionDesc}>{a.desc}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── SUPER ADMIN: USERS & TRANSACTIONS ── */}
        {isSuperAdmin && (
          <>
            <View style={s.sectionHead}>
              <Text style={s.sectionEye}>MANAGEMENT</Text>
              <Text style={s.sectionTitle}>System Overview</Text>
            </View>

            {/* Tab switcher */}
            <View style={s.tabs}>
              <TouchableOpacity
                style={[s.tab, activeTab === 'users' && s.tabActive]}
                onPress={() => setActiveTab('users')}
                activeOpacity={0.8}
              >
                <Ionicons name="people" size={15} color={activeTab === 'users' ? C.white : C.primaryDark} />
                <Text style={[s.tabTxt, activeTab === 'users' && s.tabTxtActive]}>Users</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.tab, activeTab === 'transactions' && s.tabActive]}
                onPress={() => setActiveTab('transactions')}
                activeOpacity={0.8}
              >
                <Ionicons name="swap-horizontal" size={15} color={activeTab === 'transactions' ? C.white : C.primaryDark} />
                <Text style={[s.tabTxt, activeTab === 'transactions' && s.tabTxtActive]}>Transactions</Text>
              </TouchableOpacity>
            </View>

            {/* Users list */}
            {activeTab === 'users' && (
              <View style={s.listCard}>
                {loadingUsers ? (
                  <ActivityIndicator color={C.primaryDark} style={{ padding: sp(5) }} />
                ) : users.length === 0 ? (
                  <Text style={s.emptyTxt}>No users found.</Text>
                ) : (
                  users.map((u, i) => (
                    <View key={u.id ?? i} style={[s.listRow, i < users.length - 1 && s.listRowBorder]}>
                      <View style={s.listAvatar}>
                        <Ionicons name="person" size={18} color={C.primaryDark} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.listName}>{u.firstName} {u.lastName}</Text>
                        <Text style={s.listSub}>{u.email}</Text>
                      </View>
                      <View style={[s.roleBadge, { backgroundColor: ROLE_META[u.role]?.color ? C.primarySoft : C.goldSoft }]}>
                        <Text style={s.roleBadgeTxt}>{u.role ?? 'user'}</Text>
                      </View>
                    </View>
                  ))
                )}
              </View>
            )}

            {/* Transactions list */}
            {activeTab === 'transactions' && (
              <View style={s.listCard}>
                {loadingTx ? (
                  <ActivityIndicator color={C.primaryDark} style={{ padding: sp(5) }} />
                ) : transactions.length === 0 ? (
                  <Text style={s.emptyTxt}>No transactions found.</Text>
                ) : (
                  transactions.map((tx, i) => (
                    <View key={tx.id ?? i} style={[s.listRow, i < transactions.length - 1 && s.listRowBorder]}>
                      <View style={s.listAvatar}>
                        <Ionicons name="swap-horizontal" size={18} color={C.goldDark} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.listName}>{tx.type ?? 'Transaction'}</Text>
                        <Text style={s.listSub}>{tx.createdAt ?? tx.created_at ?? ''}</Text>
                      </View>
                      <Text style={s.txStatus}>{tx.status ?? '—'}</Text>
                    </View>
                  ))
                )}
              </View>
            )}
          </>
        )}

        {/* ── FOOTER ── */}
        <View style={s.footer}>
          <View style={s.footerLine} />
          <Text style={s.footerSub}>AUREA · Municipality of Pateros</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: C.bg },
  scroll: { flex: 1 },
  container: { paddingHorizontal: sp(5), paddingBottom: sp(10) },

  header: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: sp(1), marginBottom: sp(5),
  },
  brand:    { flexDirection: 'row', alignItems: 'center', flex: 1 },
  logoGrad: {
    width: 48, height: 48, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
    ...shadow(C.primaryDark, 0.25, 8, 3),
  },
  eyebrow: { fontFamily: 'InterBody', fontWeight: '700', fontSize: 10, letterSpacing: 1.3, color: C.goldDark, marginBottom: 2 },
  h1:      { fontFamily: 'FraunTitle', fontSize: 26, color: C.ink, lineHeight: 30 },
  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderWidth: 1.5, borderColor: C.primaryDark, borderRadius: 10,
    paddingVertical: 8, paddingHorizontal: 12,
  },
  logoutTxt: { fontFamily: 'InterBody', fontWeight: '600', fontSize: 13, color: C.primaryDark },

  banner: {
    borderRadius: 22, padding: sp(5),
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: sp(6),
    ...shadow(C.primaryDark, 0.3, 12, 4),
  },
  bannerLeft:  { flex: 1 },
  bannerLabel: { fontFamily: 'InterBody', fontWeight: '700', fontSize: 10, letterSpacing: 1.2, color: 'rgba(255,255,255,0.7)', marginBottom: 4 },
  bannerName:  { fontFamily: 'FraunTitle', fontSize: 21, color: C.white, lineHeight: 26 },
  bannerEmail: { fontFamily: 'InterBody', fontSize: 12.5, color: 'rgba(255,255,255,0.65)', marginTop: 4 },
  bannerIcon:  {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },

  sectionHead:  { marginBottom: sp(4) },
  sectionEye:   { fontFamily: 'InterBody', fontWeight: '700', fontSize: 10, letterSpacing: 1.2, color: C.goldDark, marginBottom: 4 },
  sectionTitle: { fontFamily: 'FraunTitle', fontSize: 21, color: C.ink },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: sp(3), marginBottom: sp(7) },
  actionCard: {
    backgroundColor: C.card, borderRadius: 20,
    padding: sp(4), width: '47.5%',
    borderWidth: 1, borderColor: C.line,
    ...shadow(C.ink, 0.05, 8, 2),
  },
  actionIconWrap: {
    width: 44, height: 44, borderRadius: 13,
    backgroundColor: C.primarySoft,
    alignItems: 'center', justifyContent: 'center', marginBottom: sp(3),
  },
  actionLabel: { fontFamily: 'InterBody', fontWeight: '700', fontSize: 14.5, color: C.ink, marginBottom: 4 },
  actionDesc:  { fontFamily: 'InterBody', fontSize: 12.5, lineHeight: 19, color: C.inkSoft },

  tabs: {
    flexDirection: 'row', gap: sp(2),
    marginBottom: sp(3),
  },
  tab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: sp(3), borderRadius: 12,
    borderWidth: 1.5, borderColor: C.primaryDark,
  },
  tabActive:    { backgroundColor: C.primaryDark, borderColor: C.primaryDark },
  tabTxt:       { fontFamily: 'InterBody', fontWeight: '600', fontSize: 14, color: C.primaryDark },
  tabTxtActive: { color: C.white },

  listCard: {
    backgroundColor: C.card, borderRadius: 20,
    borderWidth: 1, borderColor: C.line,
    marginBottom: sp(7),
    ...shadow(C.ink, 0.05, 8, 2),
    overflow: 'hidden',
  },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: sp(3), padding: sp(4) },
  listRowBorder: { borderBottomWidth: 1, borderBottomColor: C.line },
  listAvatar: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: C.primarySoft,
    alignItems: 'center', justifyContent: 'center',
  },
  listName: { fontFamily: 'InterBody', fontWeight: '600', fontSize: 14, color: C.ink },
  listSub:  { fontFamily: 'InterBody', fontSize: 12, color: C.inkFaint, marginTop: 2 },
  roleBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  roleBadgeTxt: { fontFamily: 'InterBody', fontWeight: '700', fontSize: 11, color: C.primaryDark },
  txStatus: { fontFamily: 'InterBody', fontWeight: '600', fontSize: 12, color: C.goldDark },
  emptyTxt: { fontFamily: 'InterBody', fontSize: 14, color: C.inkFaint, textAlign: 'center', padding: sp(6) },

  footer:    { alignItems: 'center', paddingBottom: sp(2) },
  footerLine:{ width: 40, height: 3, borderRadius: 2, backgroundColor: C.gold, marginBottom: sp(3) },
  footerSub: { fontFamily: 'InterBody', fontSize: 11.5, color: C.inkFaint },
});
