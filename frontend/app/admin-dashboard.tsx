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
  TextInput,
} from 'react-native';
import { WebView } from 'react-native-webview';
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
  { icon: 'people',          label: 'Senior Citizens',     desc: 'View & manage registrants'   },
  { icon: 'chatbubbles',     label: 'Senior Support Chat', desc: 'Real-time chat with seniors' },
  { icon: 'gift',            label: 'Benefits',            desc: 'Manage benefit distributions' },
  { icon: 'card',            label: 'ID Requests',         desc: 'Process digital ID requests'  },
  { icon: 'document-text',   label: 'Records',             desc: 'Access unified records'       },
];

const BARANGAYS = [
  'Aguho', 'Magtanggol', 'Martires Del 96', 'Poblacion', 'San Pedro',
  'San Roque', 'Santa Ana', 'Santo Rosario-Kanluran', 'Santo Rosario-Silangan', 'Tabacalera',
];

const BARANGAY_CENTERS: Record<string, [number, number]> = {
  Aguho: [14.5486, 121.0707],
  Magtanggol: [14.5455, 121.0718],
  'Martires Del 96': [14.5434, 121.0698],
  Poblacion: [14.5448, 121.0681],
  'San Pedro': [14.5481, 121.0668],
  'San Roque': [14.5418, 121.0718],
  'Santa Ana': [14.5428, 121.0663],
  'Santo Rosario-Kanluran': [14.5472, 121.0741],
  'Santo Rosario-Silangan': [14.5500, 121.0730],
  Tabacalera: [14.5503, 121.0688],
};

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

function parseBirthDate(dob?: string): Date | null {
  if (!dob) return null;
  const value = dob.trim();
  let year: number;
  let month: number;
  let day: number;

  const slashMatch = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const isoMatch = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (slashMatch) {
    month = Number(slashMatch[1]);
    day = Number(slashMatch[2]);
    year = Number(slashMatch[3]);
  } else if (isoMatch) {
    year = Number(isoMatch[1]);
    month = Number(isoMatch[2]);
    day = Number(isoMatch[3]);
  } else {
    return null;
  }

  const birthDate = new Date(year, month - 1, day);
  if (
    birthDate.getFullYear() !== year
    || birthDate.getMonth() !== month - 1
    || birthDate.getDate() !== day
  ) return null;

  return birthDate;
}

function getAge(dob?: string): number | null {
  const birthDate = parseBirthDate(dob);
  if (!birthDate) return null;
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const birthdayPassed = today.getMonth() > birthDate.getMonth()
    || (today.getMonth() === birthDate.getMonth() && today.getDate() >= birthDate.getDate());
  if (!birthdayPassed) age -= 1;
  return age >= 0 ? age : null;
}

function getSeniorCategory(dob?: string): string {
  const age = getAge(dob);
  if (age === null || age < 60) return 'Not eligible';
  if (age >= 100) return 'Centenarian';
  if (age >= 90) return 'Nonagenarian';
  if (age >= 80) return 'Octogenarian';
  return 'Senior Citizen';
}

function getAgeFilter(age: number | null): string {
  if (age === null || age < 60) return 'Unknown age';
  if (age >= 100) return '100+';
  return `${Math.floor(age / 10) * 10}-${Math.floor(age / 10) * 10 + 9}`;
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

function normalizeBarangay(address?: string): string | null {
  const value = String(address ?? '').toLowerCase().replace(/[.,]/g, ' ');
  return BARANGAYS.find((barangay) => {
    const normalized = barangay.toLowerCase();
    return value.includes(normalized) || value.includes(`brgy ${normalized}`);
  }) ?? null;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character] ?? character);
}

function buildBarangayMapHtml(seniors: any[]): string {
  const counts = BARANGAYS.reduce<Record<string, number>>((result, barangay) => {
    result[barangay] = 0;
    return result;
  }, {});
  seniors.forEach((senior) => {
    const barangay = normalizeBarangay(senior.address);
    if (barangay) counts[barangay] += 1;
  });

  const heatPoints = BARANGAYS
    .filter((barangay) => counts[barangay] > 0)
    .map((barangay) => {
      const [latitude, longitude] = BARANGAY_CENTERS[barangay];
      return `[${latitude},${longitude},${counts[barangay]}]`;
    })
    .join(',');
  const maxCount = Math.max(...BARANGAYS.map((barangay) => counts[barangay]), 1);
  const barangayScript = BARANGAYS.map((barangay) => {
    const [latitude, longitude] = BARANGAY_CENTERS[barangay];
    const count = counts[barangay];
    const radius = count > 0 ? Math.min(24, 8 + count * 1.5) : 6;
    const fillColor = count === 0 ? '#71857A' : '#B3432E';
    return `L.circleMarker([${latitude},${longitude}],{radius:${radius},color:'#FFFFFF',fillColor:'${fillColor}',fillOpacity:0,opacity:0,weight:0}).addTo(map).bindPopup('<strong>${escapeHtml(barangay)}</strong><br>${count} eligible senior citizen${count === 1 ? '' : 's'}');`;
  }).join('');

  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"><style>html,body,#map{height:100%;margin:0}#map{background:#dfeadf}.leaflet-tile{filter:grayscale(100%) brightness(.82)}</style></head><body><div id="map"></div><script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script><script src="https://unpkg.com/leaflet.heat/dist/leaflet-heat.js"></script><script>const map=L.map('map',{zoomControl:true}).setView([14.5465,121.0702],15);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'&copy; OpenStreetMap contributors',maxZoom:19}).addTo(map);const heatPoints=[${heatPoints}];if(heatPoints.length&&L.heatLayer){L.heatLayer(heatPoints,{radius:70,blur:48,maxZoom:17,max:${maxCount},gradient:{0.05:'#172554',0.2:'#3730A3',0.38:'#7C3AED',0.55:'#22D3EE',0.7:'#84CC16',0.84:'#FDE047',1:'#EF4444'}}).addTo(map);}${barangayScript}</script></body></html>`;
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
  const canViewSeniorMap = isSuperAdmin || role === 'osca admin';

  const [users, setUsers]               = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loadingTx, setLoadingTx]       = useState(false);
  const [activeTab, setActiveTab]       = useState<'users' | 'transactions' | 'seniors'>('users');
  const [seniorSearch, setSeniorSearch] = useState('');
  const [seniorFilter, setSeniorFilter] = useState('All');

  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' as 'success' | 'error' });
  const showToast = (message: string, type: 'success' | 'error' = 'success') =>
    setToast({ visible: true, message, type });

  const handleLogout = async () => {
    await logout();
    showToast('Logged out successfully.');
    setTimeout(() => router.replace('/login'), 1200);
  };

  useEffect(() => {
    if (!canViewSeniorMap) return;
    setLoadingUsers(true);
    fetchUsers()
      .then(setUsers)
      .catch(() => showToast('Could not load users.', 'error'))
      .finally(() => setLoadingUsers(false));
  }, [canViewSeniorMap]);

  useEffect(() => {
    if (!isSuperAdmin || activeTab !== 'transactions') return;
    setLoadingTx(true);
    fetchTransactions()
      .then(setTransactions)
      .catch(() => showToast('Could not load transactions.', 'error'))
      .finally(() => setLoadingTx(false));
  }, [isSuperAdmin, activeTab]);

  const seniors = users.filter((candidate) => {
    const candidateRole = String(candidate.role ?? 'user').toLowerCase();
    const age = getAge(candidate.dob);
    return !['admin', 'osca admin', 'med admin', 'super admin'].includes(candidateRole)
      && age !== null
      && age >= 60;
  });
  const barangayCounts = BARANGAYS.reduce<Record<string, number>>((counts, barangay) => {
    counts[barangay] = 0;
    return counts;
  }, {});
  seniors.forEach((senior) => {
    const barangay = normalizeBarangay(senior.address);
    if (barangay) barangayCounts[barangay] += 1;
  });
  const mappedSeniorCount = Object.values(barangayCounts).reduce((total, count) => total + count, 0);
  const unmappedSeniorCount = seniors.length - mappedSeniorCount;
  const barangayMapHtml = buildBarangayMapHtml(seniors);
  const filteredSeniors = seniors.filter((senior) => {
    const age = getAge(senior.dob);
    const category = getSeniorCategory(senior.dob);
    const faceStatus = senior.avatarUrl ? 'Face Enrolled' : 'Face Not Enrolled';
    const query = seniorSearch.trim().toLowerCase();
    const matchesQuery = !query || [
      senior.firstName, senior.middleName, senior.lastName, senior.email,
      senior.contact, senior.address, senior.civilStatus,
    ].some((value) => String(value ?? '').toLowerCase().includes(query));
    const ageFilter = getAgeFilter(age);
    return matchesQuery && (seniorFilter === 'All' || ageFilter === seniorFilter || category === seniorFilter || faceStatus === seniorFilter);
  });

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
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TouchableOpacity style={s.chatBtn} onPress={() => router.push('/chat')} activeOpacity={0.8}>
              <Ionicons name="chatbubbles-outline" size={17} color={C.primaryDark} />
              <Text style={s.logoutTxt}>Live Chat</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.logoutBtn} onPress={handleLogout} activeOpacity={0.8}>
              <Ionicons name="log-out-outline" size={17} color={C.primaryDark} />
              <Text style={s.logoutTxt}>Log out</Text>
            </TouchableOpacity>
          </View>
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
                if (a.label === 'Benefits') router.push('/admin-benefits');
                if (a.label === 'Senior Support Chat') router.push('/chat');
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

        {canViewSeniorMap && (
          <View style={s.mapSection}>
            <View style={s.sectionHead}>
              <Text style={s.sectionEye}>SENIOR CITIZEN DISTRIBUTION</Text>
              <Text style={s.sectionTitle}>Pateros barangay heatmap</Text>
              <Text style={s.mapDescription}>Counts are based on registered users aged 60+ and their saved address.</Text>
            </View>
            <View style={s.mapCard}>
              <View style={s.mapLegend}>
                <Text style={s.mapLegendTitle}>Senior citizens per barangay</Text>
                <LinearGradient
                  colors={['#172554', '#3730A3', '#7C3AED', '#22D3EE', '#84CC16', '#FDE047', '#EF4444']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={s.mapLegendGradient}
                />
                <View style={s.mapLegendLabels}>
                  <Text style={s.mapLegendLabel}>Low</Text>
                  <Text style={s.mapLegendLabel}>Moderate</Text>
                  <Text style={s.mapLegendLabel}>High</Text>
                </View>
              </View>
              {loadingUsers ? (
                <ActivityIndicator color={C.primaryDark} style={{ height: 260 }} />
              ) : (
                <WebView
                  originWhitelist={['*']}
                  source={{ html: barangayMapHtml }}
                  style={s.map}
                  javaScriptEnabled
                  domStorageEnabled
                  scrollEnabled={false}
                />
              )}
              <View style={s.mapSummary}>
                <View>
                  <Text style={s.mapSummaryValue}>{seniors.length}</Text>
                  <Text style={s.mapSummaryLabel}>eligible seniors</Text>
                </View>
                <View>
                  <Text style={s.mapSummaryValue}>{mappedSeniorCount}</Text>
                  <Text style={s.mapSummaryLabel}>mapped by barangay</Text>
                </View>
                <View>
                  <Text style={s.mapSummaryValue}>{unmappedSeniorCount}</Text>
                  <Text style={s.mapSummaryLabel}>address needs review</Text>
                </View>
              </View>
              <Text style={s.mapAttribution}>Map data © OpenStreetMap contributors · Approximate barangay centers</Text>
            </View>
          </View>
        )}

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
              <TouchableOpacity
                style={[s.tab, activeTab === 'seniors' && s.tabActive]}
                onPress={() => setActiveTab('seniors')}
                activeOpacity={0.8}
              >
                <Ionicons name="person" size={15} color={activeTab === 'seniors' ? C.white : C.primaryDark} />
                <Text style={[s.tabTxt, activeTab === 'seniors' && s.tabTxtActive]}>Seniors</Text>
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
                        <Text style={s.listSub}>{u.email} · {u.contact || 'No contact'}</Text>
                        <Text style={s.userDetail}>DOB: {u.dob || 'Not set'} · Age: {getAge(u.dob) ?? 'Unknown'}</Text>
                        <Text style={s.userDetail}>{u.address || 'No address'} · {u.civilStatus || 'Civil status not set'}</Text>
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

            {/* Senior citizens list */}
            {activeTab === 'seniors' && (
              <View style={s.listCard}>
                <View style={s.seniorHeader}>
                  <Text style={s.seniorCount}>{filteredSeniors.length} of {seniors.length} senior citizens</Text>
                  <TextInput
                    value={seniorSearch}
                    onChangeText={setSeniorSearch}
                    placeholder="Search name, email, address..."
                    placeholderTextColor={C.inkFaint}
                    style={s.searchInput}
                    autoCapitalize="none"
                  />
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterRow}>
                    {['All', '60-69', '70-79', '80-89', '90-99', '100+', 'Face Enrolled', 'Face Not Enrolled'].map((filter) => (
                      <TouchableOpacity
                        key={filter}
                        style={[s.filterChip, seniorFilter === filter && s.filterChipActive]}
                        onPress={() => setSeniorFilter(filter)}
                        activeOpacity={0.8}
                      >
                        <Text style={[s.filterChipTxt, seniorFilter === filter && s.filterChipTxtActive]}>{filter}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
                {loadingUsers ? (
                  <ActivityIndicator color={C.primaryDark} style={{ padding: sp(5) }} />
                ) : filteredSeniors.length === 0 ? (
                  <Text style={s.emptyTxt}>No senior citizens match this filter.</Text>
                ) : (
                  filteredSeniors.map((senior, i) => (
                    <View key={senior.id ?? i} style={[s.seniorRow, i < filteredSeniors.length - 1 && s.listRowBorder]}>
                      <View style={s.listAvatar}>
                        <Ionicons name="person" size={18} color={C.primaryDark} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.listName}>{senior.firstName} {senior.middleName} {senior.lastName}</Text>
                        <Text style={s.listSub}>{senior.email} · {senior.contact || 'No contact'}</Text>
                        <Text style={s.seniorDetail}>{senior.address || 'No address'} · {senior.civilStatus || 'Civil status not set'}</Text>
                        <Text style={s.seniorDetail}>DOB: {senior.dob || 'Not set'} · Age: {getAge(senior.dob) ?? 'Unknown'} · {senior.avatarUrl ? 'Face enrolled' : 'Face not enrolled'}</Text>
                      </View>
                      <View style={s.seniorBadges}>
                        <Text style={s.categoryBadge}>{getSeniorCategory(senior.dob)}</Text>
                        <Text style={s.roleBadgeTxt}>{senior.role ?? 'user'}</Text>
                      </View>
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
  chatBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: C.primarySoft, borderRadius: 10,
    paddingVertical: 8, paddingHorizontal: 12,
    borderWidth: 1, borderColor: '#C2DFCB',
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

  mapSection: { marginBottom: sp(2) },
  mapDescription: { fontFamily: 'InterBody', fontSize: 12.5, color: C.inkSoft, marginTop: 5 },
  mapCard: {
    backgroundColor: C.card, borderRadius: 20,
    borderWidth: 1, borderColor: C.line,
    overflow: 'hidden', marginBottom: sp(7),
    ...shadow(C.ink, 0.05, 8, 2),
  },
  mapLegend: {
    paddingHorizontal: sp(4), paddingTop: sp(3), paddingBottom: sp(2),
    borderBottomWidth: 1, borderBottomColor: C.line,
  },
  mapLegendTitle: {
    fontFamily: 'InterBody', fontWeight: '700', fontSize: 12, color: C.ink,
    marginBottom: 7,
  },
  mapLegendGradient: { height: 12, borderRadius: 4, width: '100%' },
  mapLegendLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  mapLegendLabel: { fontFamily: 'InterBody', fontSize: 10.5, color: C.inkSoft },
  map: { height: 280, width: '100%' },
  mapSummary: {
    flexDirection: 'row', justifyContent: 'space-between', gap: sp(2),
    padding: sp(4), borderBottomWidth: 1, borderBottomColor: C.line,
  },
  mapSummaryValue: { fontFamily: 'FraunTitle', fontSize: 20, color: C.primaryDark },
  mapSummaryLabel: { fontFamily: 'InterBody', fontSize: 10.5, color: C.inkFaint, marginTop: 2 },
  mapAttribution: { fontFamily: 'InterBody', fontSize: 10, color: C.inkFaint, padding: sp(3) },

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
  seniorHeader: { padding: sp(4), borderBottomWidth: 1, borderBottomColor: C.line, gap: sp(3) },
  seniorCount: { fontFamily: 'InterBody', fontWeight: '700', fontSize: 13, color: C.inkSoft },
  searchInput: {
    borderWidth: 1, borderColor: C.line, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 9,
    fontFamily: 'InterBody', fontSize: 13, color: C.ink,
    backgroundColor: C.bg,
  },
  filterRow: { gap: 8, paddingRight: 4 },
  filterChip: { borderWidth: 1, borderColor: C.line, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: C.white },
  filterChipActive: { backgroundColor: C.primaryDark, borderColor: C.primaryDark },
  filterChipTxt: { fontFamily: 'InterBody', fontWeight: '600', fontSize: 11, color: C.inkSoft },
  filterChipTxtActive: { color: C.white },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: sp(3), padding: sp(4) },
  seniorRow: { flexDirection: 'row', alignItems: 'flex-start', gap: sp(3), padding: sp(4) },
  listRowBorder: { borderBottomWidth: 1, borderBottomColor: C.line },
  listAvatar: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: C.primarySoft,
    alignItems: 'center', justifyContent: 'center',
  },
  listName: { fontFamily: 'InterBody', fontWeight: '600', fontSize: 14, color: C.ink },
  listSub:  { fontFamily: 'InterBody', fontSize: 12, color: C.inkFaint, marginTop: 2 },
  userDetail: { fontFamily: 'InterBody', fontSize: 11.5, color: C.inkSoft, marginTop: 3 },
  roleBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  roleBadgeTxt: { fontFamily: 'InterBody', fontWeight: '700', fontSize: 11, color: C.primaryDark },
  seniorDetail: { fontFamily: 'InterBody', fontSize: 11.5, color: C.inkSoft, marginTop: 3 },
  seniorBadges: { alignItems: 'flex-end', gap: 6, maxWidth: 110 },
  categoryBadge: { fontFamily: 'InterBody', fontWeight: '700', fontSize: 10, color: C.goldDark, backgroundColor: C.goldSoft, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 4, textAlign: 'right' },
  txStatus: { fontFamily: 'InterBody', fontWeight: '600', fontSize: 12, color: C.goldDark },
  emptyTxt: { fontFamily: 'InterBody', fontSize: 14, color: C.inkFaint, textAlign: 'center', padding: sp(6) },

  footer:    { alignItems: 'center', paddingBottom: sp(2) },
  footerLine:{ width: 40, height: 3, borderRadius: 2, backgroundColor: C.gold, marginBottom: sp(3) },
  footerSub: { fontFamily: 'InterBody', fontSize: 11.5, color: C.inkFaint },
});
