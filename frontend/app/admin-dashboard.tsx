import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  StatusBar,
  Pressable,
  Platform,
  ActivityIndicator,
  TextInput,
  RefreshControl,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import Toast from '../components/Toast';
import Constants from 'expo-constants';

// ---------------------------------------------------------------------------
// Design tokens
// ---------------------------------------------------------------------------
function shadow(color: string, opacity: number, radius = 14, height = 6) {
  return Platform.select({
    ios: { shadowColor: color, shadowOpacity: opacity, shadowRadius: radius, shadowOffset: { width: 0, height } },
    android: { elevation: Math.round(radius * 0.6) },
    default: {},
  });
}

const C = {
  bg:          '#F4F7F0',
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
  lineSoft:    '#EBF1E8',
  danger:      '#B3432E',
  dangerSoft:  '#FDECEA',
};

const sp = (n: number) => n * 4;

const ROLE_META: Record<string, { label: string; color: string; icon: string }> = {
  'osca admin':  { label: 'OSCA Admin',  color: C.primaryDark, icon: 'people'  },
  'med admin':   { label: 'Med Admin',   color: '#1A5276',     icon: 'medkit'  },
  'super admin': { label: 'Super Admin', color: '#6D3B00',     icon: 'shield'  },
};

const ROLE_BADGE: Record<string, { bg: string; fg: string }> = {
  'super admin': { bg: '#F3E3CC', fg: '#6D3B00' },
  'osca admin':  { bg: C.primarySoft, fg: C.primaryDark },
  'med admin':   { bg: '#DCEAF4', fg: '#1A5276' },
  admin:         { bg: C.primarySoft, fg: C.primaryDark },
  user:          { bg: '#EEF1EC', fg: C.inkSoft },
};

type Action = { icon: string; label: string; desc: string; route?: string };

const OSCA_ACTIONS: Action[] = [
  { icon: 'people',        label: 'Senior Citizens',     desc: 'View and manage registrants' },
  { icon: 'chatbubbles',   label: 'Senior Support Chat', desc: 'Chat with seniors in real time', route: '/chat' },
  { icon: 'gift',          label: 'Benefits',            desc: 'Manage benefit distributions',   route: '/admin-benefits' },
  { icon: 'card',          label: 'ID Requests',         desc: 'Process digital ID requests' },
  { icon: 'document-text', label: 'Records',             desc: 'Open unified records' },
  { icon: 'film',          label: 'Movie Center',        desc: 'Movies, screenings, reservations', route: '/admin-movie-center' },
];

const MED_ACTIONS: Action[] = [
  { icon: 'medkit',   label: 'Medical Records', desc: 'View health records' },
  { icon: 'calendar', label: 'Appointments',    desc: 'Manage health appointments' },
  { icon: 'flask',    label: 'Prescriptions',   desc: 'Track prescriptions' },
  { icon: 'pulse',    label: 'Health Reports',  desc: 'Generate health summaries' },
];

const SUPER_ACTIONS: Action[] = [
  { icon: 'people-circle',    label: 'All Users',       desc: 'Manage all system users' },
  { icon: 'swap-horizontal',  label: 'Transactions',    desc: 'View all transactions' },
  { icon: 'settings',         label: 'System Settings', desc: 'Configure system parameters' },
  { icon: 'bar-chart',        label: 'Reports',         desc: 'Full analytics and reports' },
  { icon: 'shield-checkmark', label: 'Roles & Access',  desc: 'Manage roles and permissions' },
  { icon: 'server',           label: 'Audit Logs',      desc: 'View the system audit trail' },
];

function getActions(role: string) {
  if (role === 'super admin') return SUPER_ACTIONS;
  if (role === 'med admin')   return MED_ACTIONS;
  return OSCA_ACTIONS;
}

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

const HEAT_GRADIENT = ['#172554', '#3730A3', '#7C3AED', '#22D3EE', '#84CC16', '#FDE047', '#EF4444'];

const SENIOR_FILTERS = ['All', '60-69', '70-79', '80-89', '90-99', '100+', 'Face Enrolled', 'Face Not Enrolled'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
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

function getInitials(first?: string, last?: string) {
  const value = `${(first ?? '').trim()[0] ?? ''}${(last ?? '').trim()[0] ?? ''}`.toUpperCase();
  return value || '?';
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function fullName(person: any) {
  return [person.firstName, person.middleName, person.lastName].filter(Boolean).join(' ') || 'Unnamed user';
}

function normalizeBarangay(address?: string): string | null {
  const value = String(address ?? '').toLowerCase().replace(/[.,]/g, ' ');
  return BARANGAYS.find((barangay) => {
    const normalized = barangay.toLowerCase();
    return value.includes(normalized) || value.includes(`brgy ${normalized}`);
  }) ?? null;
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
// Map
// ---------------------------------------------------------------------------
function buildBarangayMapHtml(counts: Record<string, number>): string {
  const heatPoints = BARANGAYS
    .filter((barangay) => counts[barangay] > 0)
    .map((barangay) => {
      const [latitude, longitude] = BARANGAY_CENTERS[barangay];
      return `[${latitude},${longitude},${counts[barangay]}]`;
    })
    .join(',');
  const maxCount = Math.max(...BARANGAYS.map((barangay) => counts[barangay] || 0), 1);

  const css = 'html,body,#map{height:100%;margin:0}#map{background:#dfeadf}.leaflet-tile{filter:grayscale(100%) brightness(.85)}.map-status{position:absolute;z-index:1000;top:12px;left:12px;right:12px;padding:10px;background:#fff;border-radius:8px;font:13px sans-serif;color:#132018;pointer-events:none}';
  const gradient = `{0.05:'#172554',0.2:'#3730A3',0.38:'#7C3AED',0.55:'#22D3EE',0.7:'#84CC16',0.84:'#FDE047',1:'#EF4444'}`;

  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"><style>${css}</style></head><body><div id="map"></div><script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script><script src="https://unpkg.com/leaflet.heat@0.2.0/dist/leaflet-heat.js"></script><script>const map=L.map('map',{zoomControl:false}).setView([14.5465,121.0702],15);L.control.zoom({position:'bottomright'}).addTo(map);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'&copy; OpenStreetMap contributors',maxZoom:19}).addTo(map);const heatPoints=[${heatPoints}];if(heatPoints.length&&L.heatLayer){L.heatLayer(heatPoints,{radius:45,blur:30,minOpacity:0.3,maxZoom:15,max:${maxCount},gradient:${gradient}}).addTo(map);}else{const status=document.createElement('div');status.className='map-status';status.textContent=heatPoints.length?'Heatmap could not load. Check your connection and refresh.':'No senior citizen addresses mapped yet.';document.body.appendChild(status);}map.whenReady(function(){map.invalidateSize();});</script></body></html>`;
}

function BarangayMap({ html }: { html: string }) {
  if (Platform.OS === 'web') {
    return React.createElement('iframe', {
      title: 'Pateros senior citizen barangay heatmap',
      srcDoc: html,
      style: { border: 'none', width: '100%', height: '280px' },
    });
  }

  return (
    <WebView
      originWhitelist={['*']}
      source={{ html }}
      style={s.map}
      javaScriptEnabled
      domStorageEnabled
      scrollEnabled={false}
    />
  );
}

// ---------------------------------------------------------------------------
// Small building blocks
// ---------------------------------------------------------------------------
function SectionHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <View style={s.sectionHead}>
      <View style={{ flex: 1 }}>
        <Text style={s.sectionTitle}>{title}</Text>
        {subtitle ? <Text style={s.sectionSub}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

function EmptyState({ icon, title, hint }: { icon: string; title: string; hint?: string }) {
  return (
    <View style={s.empty}>
      <View style={s.emptyIcon}>
        <Ionicons name={icon as any} size={24} color={C.primary} />
      </View>
      <Text style={s.emptyTitle}>{title}</Text>
      {hint ? <Text style={s.emptyHint}>{hint}</Text> : null}
    </View>
  );
}

function Avatar({ initials, tone = 'green' }: { initials: string; tone?: 'green' | 'gold' }) {
  return (
    <View style={[s.avatar, tone === 'gold' && { backgroundColor: C.goldSoft }]}>
      <Text style={[s.avatarTxt, tone === 'gold' && { color: C.goldDark }]}>{initials}</Text>
    </View>
  );
}

function Chip({ icon, label, tone }: { icon?: string; label: string; tone: 'green' | 'gold' | 'neutral' | 'danger' }) {
  const palette = {
    green:   { bg: C.primarySoft, fg: C.primaryDark },
    gold:    { bg: C.goldSoft,    fg: C.goldDark },
    neutral: { bg: C.lineSoft,    fg: C.inkSoft },
    danger:  { bg: C.dangerSoft,  fg: C.danger },
  }[tone];
  return (
    <View style={[s.chip, { backgroundColor: palette.bg }]}>
      {icon ? <Ionicons name={icon as any} size={11} color={palette.fg} /> : null}
      <Text style={[s.chipTxt, { color: palette.fg }]}>{label}</Text>
    </View>
  );
}

function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <View>
      {Array.from({ length: rows }).map((_, i) => (
        <View key={i} style={[s.listRow, i < rows - 1 && s.listRowBorder]}>
          <View style={[s.avatar, { backgroundColor: C.lineSoft }]} />
          <View style={{ flex: 1, gap: 8 }}>
            <View style={[s.skelLine, { width: '55%' }]} />
            <View style={[s.skelLine, { width: '80%', height: 10 }]} />
          </View>
        </View>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------
export default function AdminDashboard() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const role = (user?.role ?? 'osca admin').toLowerCase();
  const meta = ROLE_META[role] ?? ROLE_META['osca admin'];
  const actions = getActions(role);
  const isSuperAdmin = role === 'super admin';
  const canViewSeniorMap = isSuperAdmin || role === 'osca admin';

  const [users, setUsers]               = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loadingTx, setLoadingTx]       = useState(false);
  const [refreshing, setRefreshing]     = useState(false);
  const [activeTab, setActiveTab]       = useState<'users' | 'transactions' | 'seniors'>('users');
  const [seniorSearch, setSeniorSearch] = useState('');
  const [seniorFilter, setSeniorFilter] = useState('All');
  const [showAllBarangays, setShowAllBarangays] = useState(false);

  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' as 'success' | 'error' });
  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') =>
    setToast({ visible: true, message, type }), []);

  const handleLogout = async () => {
    await logout();
    showToast('Logged out successfully.');
    setTimeout(() => router.replace('/login'), 1200);
  };

  const handleAction = (action: Action) => {
    if (action.route) router.push(action.route as any);
    else showToast(`${action.label} is coming soon.`);
  };

  const loadUsers = useCallback(async () => {
    try {
      setUsers(await fetchUsers());
    } catch {
      showToast('Could not load users. Pull down to try again.', 'error');
    }
  }, [showToast]);

  useEffect(() => {
    if (!canViewSeniorMap) return;
    setLoadingUsers(true);
    loadUsers().finally(() => setLoadingUsers(false));
  }, [canViewSeniorMap, loadUsers]);

  useEffect(() => {
    if (!isSuperAdmin || activeTab !== 'transactions') return;
    setLoadingTx(true);
    fetchTransactions()
      .then(setTransactions)
      .catch(() => showToast('Could not load transactions.', 'error'))
      .finally(() => setLoadingTx(false));
  }, [isSuperAdmin, activeTab, showToast]);

  const onRefresh = async () => {
    if (!canViewSeniorMap) return;
    setRefreshing(true);
    await loadUsers();
    setRefreshing(false);
  };

  // ── Derived data ──
  const seniors = useMemo(() => users.filter((candidate) => {
    const candidateRole = String(candidate.role ?? 'user').toLowerCase();
    const age = getAge(candidate.dob);
    return !['admin', 'osca admin', 'med admin', 'super admin'].includes(candidateRole)
      && age !== null
      && age >= 60;
  }), [users]);

  const barangayCounts = useMemo(() => {
    const counts = BARANGAYS.reduce<Record<string, number>>((result, barangay) => {
      result[barangay] = 0;
      return result;
    }, {});
    seniors.forEach((senior) => {
      const barangay = normalizeBarangay(senior.address);
      if (barangay) counts[barangay] += 1;
    });
    return counts;
  }, [seniors]);

  const mappedSeniorCount = Object.values(barangayCounts).reduce((total, count) => total + count, 0);
  const unmappedSeniorCount = seniors.length - mappedSeniorCount;
  const enrolledCount = seniors.filter((senior) => senior.avatarUrl).length;
  const barangayMapHtml = useMemo(() => buildBarangayMapHtml(barangayCounts), [barangayCounts]);

  const rankedBarangays = useMemo(
    () => [...BARANGAYS].sort((a, b) => barangayCounts[b] - barangayCounts[a]),
    [barangayCounts],
  );
  const visibleBarangays = showAllBarangays ? rankedBarangays : rankedBarangays.slice(0, 4);
  const maxBarangayCount = Math.max(...BARANGAYS.map((b) => barangayCounts[b]), 1);

  const filteredSeniors = useMemo(() => seniors.filter((senior) => {
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
  }), [seniors, seniorSearch, seniorFilter]);

  const TABS: { key: 'users' | 'transactions' | 'seniors'; label: string; icon: string }[] = [
    { key: 'users',        label: 'Users',        icon: 'people' },
    { key: 'transactions', label: 'Transactions', icon: 'swap-horizontal' },
    { key: 'seniors',      label: 'Seniors',      icon: 'person' },
  ];

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <StatusBar barStyle="dark-content" />
      <Toast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        onHide={() => setToast((t) => ({ ...t, visible: false }))}
      />

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.container}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          canViewSeniorMap
            ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} colors={[C.primary]} />
            : undefined
        }
      >
        {/* ── HEADER ── */}
        <View style={s.header}>
          <View style={s.brand}>
            <LinearGradient colors={[C.primaryMid, C.primaryDark]} style={s.logoGrad}>
              <Ionicons name="shield-checkmark" size={22} color={C.white} />
            </LinearGradient>
            <View>
              <Text style={s.h1}>AUREA</Text>
              <Text style={s.brandSub}>Municipality of Pateros</Text>
            </View>
          </View>
          <View style={s.headerActions}>
            <Pressable
              style={({ pressed }) => [s.iconBtn, pressed && s.pressed]}
              onPress={() => router.push('/chat')}
              accessibilityRole="button"
              accessibilityLabel="Open live chat"
            >
              <Ionicons name="chatbubbles-outline" size={19} color={C.primaryDark} />
            </Pressable>
            <Pressable
              style={({ pressed }) => [s.iconBtn, pressed && s.pressed]}
              onPress={handleLogout}
              accessibilityRole="button"
              accessibilityLabel="Log out"
            >
              <Ionicons name="log-out-outline" size={19} color={C.primaryDark} />
            </Pressable>
          </View>
        </View>

        {/* ── WELCOME BANNER ── */}
        <LinearGradient
          colors={[meta.color, C.primaryDark]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={s.banner}
        >
          <View style={s.bannerTop}>
            <View style={s.bannerLeft}>
              <View style={s.rolePill}>
                <Ionicons name={meta.icon as any} size={12} color={C.white} />
                <Text style={s.rolePillTxt}>{meta.label}</Text>
              </View>
              <Text style={s.bannerGreeting}>{getGreeting()},</Text>
              <Text style={s.bannerName} numberOfLines={1}>
                {user?.firstName} {user?.lastName}
              </Text>
              <Text style={s.bannerEmail} numberOfLines={1}>{user?.email}</Text>
            </View>
            <View style={s.bannerAvatar}>
              <Text style={s.bannerAvatarTxt}>{getInitials(user?.firstName, user?.lastName)}</Text>
            </View>
          </View>

          {canViewSeniorMap && (
            <View style={s.bannerStats}>
              <View style={s.bannerStat}>
                <Text style={s.bannerStatValue}>{loadingUsers ? '–' : seniors.length}</Text>
                <Text style={s.bannerStatLabel}>Senior citizens</Text>
              </View>
              <View style={s.bannerStatDivider} />
              <View style={s.bannerStat}>
                <Text style={s.bannerStatValue}>{loadingUsers ? '–' : enrolledCount}</Text>
                <Text style={s.bannerStatLabel}>Face enrolled</Text>
              </View>
              <View style={s.bannerStatDivider} />
              <View style={s.bannerStat}>
                <Text style={s.bannerStatValue}>{loadingUsers ? '–' : unmappedSeniorCount}</Text>
                <Text style={s.bannerStatLabel}>Need address review</Text>
              </View>
            </View>
          )}
        </LinearGradient>

        {/* ── QUICK ACTIONS ── */}
        <SectionHeader title="Quick actions" />
        <View style={s.grid}>
          {actions.map((a) => {
            const ready = !!a.route;
            return (
              <Pressable
                key={a.label}
                style={({ pressed }) => [s.actionCard, !ready && s.actionCardMuted, pressed && s.pressed]}
                onPress={() => handleAction(a)}
                accessibilityRole="button"
                accessibilityLabel={`${a.label}. ${a.desc}${ready ? '' : '. Coming soon'}`}
              >
                <View style={s.actionTop}>
                  <View style={[s.actionIconWrap, !ready && { backgroundColor: C.lineSoft }]}>
                    <Ionicons name={a.icon as any} size={21} color={ready ? C.primaryDark : C.inkFaint} />
                  </View>
                  {ready
                    ? <Ionicons name="arrow-forward" size={16} color={C.primary} />
                    : <Chip label="Soon" tone="neutral" />}
                </View>
                <Text style={s.actionLabel}>{a.label}</Text>
                <Text style={s.actionDesc}>{a.desc}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* ── SENIOR MAP ── */}
        {canViewSeniorMap && (
          <View style={s.mapSection}>
            <SectionHeader
              title="Where seniors live"
              subtitle="Heat intensity shows registered seniors aged 60+ by barangay. Exact counts are listed below."
            />
            <View style={s.mapCard}>
              <View style={s.mapFrame}>
                {loadingUsers ? (
                  <View style={s.mapLoading}>
                    <ActivityIndicator color={C.primaryDark} />
                    <Text style={s.mapLoadingTxt}>Loading map…</Text>
                  </View>
                ) : (
                  <BarangayMap html={barangayMapHtml} />
                )}
              </View>

              <View style={s.mapLegend}>
                <LinearGradient
                  colors={HEAT_GRADIENT as any}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={s.mapLegendGradient}
                />
                <View style={s.mapLegendLabels}>
                  <Text style={s.mapLegendLabel}>Fewer seniors</Text>
                  <Text style={s.mapLegendLabel}>More seniors</Text>
                </View>
              </View>

              {/* Ranked barangay bars */}
              <View style={s.rankList}>
                {visibleBarangays.map((barangay) => {
                  const count = barangayCounts[barangay];
                  const pct = count === 0 ? 0 : Math.max(6, (count / maxBarangayCount) * 100);
                  return (
                    <View key={barangay} style={s.rankRow}>
                      <Text style={s.rankName} numberOfLines={1}>{barangay}</Text>
                      <View style={s.rankTrack}>
                        <View style={[s.rankFill, { width: `${pct}%` }]} />
                      </View>
                      <Text style={s.rankCount}>{count}</Text>
                    </View>
                  );
                })}
                <Pressable
                  onPress={() => setShowAllBarangays((v) => !v)}
                  style={({ pressed }) => [s.rankToggle, pressed && s.pressed]}
                  accessibilityRole="button"
                >
                  <Text style={s.rankToggleTxt}>
                    {showAllBarangays ? 'Show top 4' : `Show all ${BARANGAYS.length} barangays`}
                  </Text>
                  <Ionicons name={showAllBarangays ? 'chevron-up' : 'chevron-down'} size={14} color={C.primary} />
                </Pressable>
              </View>

              <Text style={s.mapAttribution}>
                {mappedSeniorCount} of {seniors.length} mapped · Approximate barangay centers · © OpenStreetMap contributors
              </Text>
            </View>
          </View>
        )}

        {/* ── SUPER ADMIN: MANAGEMENT ── */}
        {isSuperAdmin && (
          <>
            <SectionHeader title="System overview" />

            {/* Segmented control */}
            <View style={s.segment} accessibilityRole="tablist">
              {TABS.map((tab) => {
                const active = activeTab === tab.key;
                return (
                  <Pressable
                    key={tab.key}
                    style={[s.segmentItem, active && s.segmentItemActive]}
                    onPress={() => setActiveTab(tab.key)}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: active }}
                  >
                    <Ionicons name={tab.icon as any} size={15} color={active ? C.white : C.inkSoft} />
                    <Text style={[s.segmentTxt, active && s.segmentTxtActive]}>{tab.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Users */}
            {activeTab === 'users' && (
              <View style={s.listCard}>
                <View style={s.listHeader}>
                  <Text style={s.listHeaderTxt}>{users.length} registered users</Text>
                </View>
                {loadingUsers ? (
                  <ListSkeleton />
                ) : users.length === 0 ? (
                  <EmptyState icon="people-outline" title="No users yet" hint="Registered users will show up here." />
                ) : (
                  users.map((u, i) => {
                    const badge = ROLE_BADGE[String(u.role ?? 'user').toLowerCase()] ?? ROLE_BADGE.user;
                    return (
                      <View key={u.id ?? i} style={[s.listRow, i < users.length - 1 && s.listRowBorder]}>
                        <Avatar initials={getInitials(u.firstName, u.lastName)} />
                        <View style={{ flex: 1 }}>
                          <Text style={s.listName} numberOfLines={1}>{u.firstName} {u.lastName}</Text>
                          <Text style={s.listSub} numberOfLines={1}>{u.email}</Text>
                          <Text style={s.listMeta} numberOfLines={1}>
                            {u.contact || 'No contact'}  ·  Age {getAge(u.dob) ?? 'unknown'}
                          </Text>
                          <Text style={s.listMeta} numberOfLines={1}>{u.address || 'No address saved'}</Text>
                        </View>
                        <View style={[s.roleBadge, { backgroundColor: badge.bg }]}>
                          <Text style={[s.roleBadgeTxt, { color: badge.fg }]}>{u.role ?? 'user'}</Text>
                        </View>
                      </View>
                    );
                  })
                )}
              </View>
            )}

            {/* Transactions */}
            {activeTab === 'transactions' && (
              <View style={s.listCard}>
                <View style={s.listHeader}>
                  <Text style={s.listHeaderTxt}>{transactions.length} transactions</Text>
                </View>
                {loadingTx ? (
                  <ListSkeleton />
                ) : transactions.length === 0 ? (
                  <EmptyState icon="swap-horizontal-outline" title="No transactions yet" hint="Activity will appear here once it happens." />
                ) : (
                  transactions.map((tx, i) => {
                    const status = String(tx.status ?? '').toLowerCase();
                    const tone = ['success', 'completed', 'approved', 'paid'].includes(status)
                      ? 'green'
                      : ['failed', 'rejected', 'declined', 'cancelled'].includes(status)
                        ? 'danger'
                        : 'gold';
                    return (
                      <View key={tx.id ?? i} style={[s.listRow, i < transactions.length - 1 && s.listRowBorder]}>
                        <View style={[s.avatar, { backgroundColor: C.goldSoft }]}>
                          <Ionicons name="swap-horizontal" size={18} color={C.goldDark} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={s.listName} numberOfLines={1}>{tx.type ?? 'Transaction'}</Text>
                          <Text style={s.listSub} numberOfLines={1}>{tx.createdAt ?? tx.created_at ?? ''}</Text>
                        </View>
                        <Chip label={tx.status ?? 'Unknown'} tone={tone as any} />
                      </View>
                    );
                  })
                )}
              </View>
            )}

            {/* Seniors */}
            {activeTab === 'seniors' && (
              <View style={s.listCard}>
                <View style={s.seniorHeader}>
                  <Text style={s.listHeaderTxt}>
                    Showing {filteredSeniors.length} of {seniors.length} senior citizens
                  </Text>
                  <View style={s.searchWrap}>
                    <Ionicons name="search" size={16} color={C.inkFaint} />
                    <TextInput
                      value={seniorSearch}
                      onChangeText={setSeniorSearch}
                      placeholder="Search name, email, or address"
                      placeholderTextColor={C.inkFaint}
                      style={s.searchInput}
                      autoCapitalize="none"
                      autoCorrect={false}
                      returnKeyType="search"
                    />
                    {seniorSearch.length > 0 && (
                      <Pressable onPress={() => setSeniorSearch('')} hitSlop={10} accessibilityLabel="Clear search">
                        <Ionicons name="close-circle" size={18} color={C.inkFaint} />
                      </Pressable>
                    )}
                  </View>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterRow}>
                    {SENIOR_FILTERS.map((filter) => {
                      const active = seniorFilter === filter;
                      return (
                        <Pressable
                          key={filter}
                          style={[s.filterChip, active && s.filterChipActive]}
                          onPress={() => setSeniorFilter(filter)}
                          accessibilityRole="button"
                          accessibilityState={{ selected: active }}
                        >
                          <Text style={[s.filterChipTxt, active && s.filterChipTxtActive]}>{filter}</Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>

                {loadingUsers ? (
                  <ListSkeleton />
                ) : filteredSeniors.length === 0 ? (
                  <EmptyState
                    icon="search-outline"
                    title="No matches"
                    hint="Try a different name or clear the filter."
                  />
                ) : (
                  filteredSeniors.map((senior, i) => {
                    const enrolled = !!senior.avatarUrl;
                    return (
                      <View key={senior.id ?? i} style={[s.seniorRow, i < filteredSeniors.length - 1 && s.listRowBorder]}>
                        <Avatar initials={getInitials(senior.firstName, senior.lastName)} tone="gold" />
                        <View style={{ flex: 1 }}>
                          <Text style={s.listName} numberOfLines={1}>{fullName(senior)}</Text>
                          <Text style={s.listSub} numberOfLines={1}>
                            {senior.email}{senior.contact ? `  ·  ${senior.contact}` : ''}
                          </Text>
                          <Text style={s.listMeta} numberOfLines={2}>
                            {senior.address || 'No address saved'}
                            {senior.civilStatus ? `  ·  ${senior.civilStatus}` : ''}
                          </Text>
                          <View style={s.chipRow}>
                            <Chip label={`Age ${getAge(senior.dob) ?? '?'}`} tone="neutral" />
                            <Chip label={getSeniorCategory(senior.dob)} tone="gold" />
                            <Chip
                              icon={enrolled ? 'checkmark-circle' : 'alert-circle'}
                              label={enrolled ? 'Face enrolled' : 'Not enrolled'}
                              tone={enrolled ? 'green' : 'danger'}
                            />
                          </View>
                        </View>
                      </View>
                    );
                  })
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

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: C.bg },
  scroll: { flex: 1 },
  container: { paddingHorizontal: sp(5), paddingTop: sp(2), paddingBottom: sp(10) },
  pressed: { opacity: 0.7, transform: [{ scale: 0.98 }] },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: sp(1), marginBottom: sp(5),
  },
  brand:    { flexDirection: 'row', alignItems: 'center', flex: 1 },
  logoGrad: {
    width: 44, height: 44, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
    ...shadow(C.primaryDark, 0.25, 8, 3),
  },
  h1:       { fontFamily: 'FraunTitle', fontSize: 24, color: C.ink, lineHeight: 28 },
  brandSub: { fontFamily: 'InterBody', fontSize: 12, color: C.inkFaint, marginTop: 1 },
  headerActions: { flexDirection: 'row', gap: 8 },
  iconBtn: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: C.card, borderWidth: 1, borderColor: C.line,
    alignItems: 'center', justifyContent: 'center',
  },

  // Banner
  banner: {
    borderRadius: 26, padding: sp(5),
    marginBottom: sp(7),
    ...shadow(C.primaryDark, 0.3, 14, 6),
  },
  bannerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bannerLeft: { flex: 1, paddingRight: sp(3) },
  rolePill: {
    alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: 20,
    paddingVertical: 4, paddingHorizontal: 10, marginBottom: sp(3),
  },
  rolePillTxt: { fontFamily: 'InterBody', fontWeight: '600', fontSize: 11.5, color: C.white },
  bannerGreeting: { fontFamily: 'InterBody', fontSize: 13, color: 'rgba(255,255,255,0.72)' },
  bannerName:  { fontFamily: 'FraunTitle', fontSize: 24, color: C.white, lineHeight: 30, marginTop: 2 },
  bannerEmail: { fontFamily: 'InterBody', fontSize: 12.5, color: 'rgba(255,255,255,0.62)', marginTop: 4 },
  bannerAvatar: {
    width: 62, height: 62, borderRadius: 31,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center', justifyContent: 'center',
  },
  bannerAvatarTxt: { fontFamily: 'FraunTitle', fontSize: 22, color: C.white },
  bannerStats: {
    flexDirection: 'row', alignItems: 'center',
    marginTop: sp(5), paddingTop: sp(4),
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.18)',
  },
  bannerStat: { flex: 1 },
  bannerStatDivider: { width: 1, height: 32, backgroundColor: 'rgba(255,255,255,0.18)', marginHorizontal: sp(3) },
  bannerStatValue: { fontFamily: 'FraunTitle', fontSize: 24, color: C.white, lineHeight: 28 },
  bannerStatLabel: { fontFamily: 'InterBody', fontSize: 11, color: 'rgba(255,255,255,0.68)', marginTop: 2 },

  // Section header
  sectionHead:  { flexDirection: 'row', alignItems: 'flex-end', marginBottom: sp(4) },
  sectionTitle: { fontFamily: 'FraunTitle', fontSize: 21, color: C.ink },
  sectionSub:   { fontFamily: 'InterBody', fontSize: 12.5, lineHeight: 18, color: C.inkSoft, marginTop: 4 },

  // Actions
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: sp(3), marginBottom: sp(8) },
  actionCard: {
    backgroundColor: C.card, borderRadius: 20,
    padding: sp(4), width: '47.8%',
    borderWidth: 1, borderColor: C.line,
    ...shadow(C.ink, 0.05, 8, 2),
  },
  actionCardMuted: { backgroundColor: '#FBFCFA' },
  actionTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: sp(3) },
  actionIconWrap: {
    width: 42, height: 42, borderRadius: 13,
    backgroundColor: C.primarySoft,
    alignItems: 'center', justifyContent: 'center',
  },
  actionLabel: { fontFamily: 'InterBody', fontWeight: '700', fontSize: 14.5, color: C.ink, marginBottom: 3 },
  actionDesc:  { fontFamily: 'InterBody', fontSize: 12.5, lineHeight: 18, color: C.inkSoft },

  // Map
  mapSection: { marginBottom: sp(2) },
  mapCard: {
    backgroundColor: C.card, borderRadius: 24,
    borderWidth: 1, borderColor: C.line,
    overflow: 'hidden', marginBottom: sp(8),
    ...shadow(C.ink, 0.05, 8, 2),
  },
  mapFrame: { height: 280, backgroundColor: '#E3ECE1' },
  map: { height: 280, width: '100%' },
  mapLoading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  mapLoadingTxt: { fontFamily: 'InterBody', fontSize: 12.5, color: C.inkSoft },
  mapLegend: {
    paddingHorizontal: sp(4), paddingTop: sp(3), paddingBottom: sp(3),
    borderBottomWidth: 1, borderBottomColor: C.line,
  },
  mapLegendGradient: { height: 8, borderRadius: 4, width: '100%' },
  mapLegendLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  mapLegendLabel: { fontFamily: 'InterBody', fontSize: 11, color: C.inkSoft },

  rankList: { paddingHorizontal: sp(4), paddingTop: sp(3), paddingBottom: sp(1), gap: sp(3) },
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: sp(3) },
  rankName: { fontFamily: 'InterBody', fontWeight: '600', fontSize: 12.5, color: C.ink, width: 112 },
  rankTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: C.lineSoft, overflow: 'hidden' },
  rankFill: { height: 8, borderRadius: 4, backgroundColor: C.primaryMid },
  rankCount: { fontFamily: 'InterBody', fontWeight: '700', fontSize: 12.5, color: C.primaryDark, width: 24, textAlign: 'right' },
  rankToggle: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    paddingVertical: sp(2),
  },
  rankToggleTxt: { fontFamily: 'InterBody', fontWeight: '600', fontSize: 12.5, color: C.primary },
  mapAttribution: {
    fontFamily: 'InterBody', fontSize: 10.5, color: C.inkFaint,
    paddingHorizontal: sp(4), paddingBottom: sp(3), paddingTop: sp(1),
  },

  // Segmented control
  segment: {
    flexDirection: 'row', backgroundColor: C.lineSoft,
    borderRadius: 14, padding: 4, marginBottom: sp(3),
  },
  segmentItem: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: sp(2.5), borderRadius: 11,
  },
  segmentItemActive: { backgroundColor: C.primaryDark, ...shadow(C.primaryDark, 0.25, 6, 2) },
  segmentTxt: { fontFamily: 'InterBody', fontWeight: '600', fontSize: 13.5, color: C.inkSoft },
  segmentTxtActive: { color: C.white },

  // Lists
  listCard: {
    backgroundColor: C.card, borderRadius: 22,
    borderWidth: 1, borderColor: C.line,
    marginBottom: sp(7),
    ...shadow(C.ink, 0.05, 8, 2),
    overflow: 'hidden',
  },
  listHeader: { paddingHorizontal: sp(4), paddingVertical: sp(3), borderBottomWidth: 1, borderBottomColor: C.line },
  listHeaderTxt: { fontFamily: 'InterBody', fontWeight: '600', fontSize: 12.5, color: C.inkSoft },
  seniorHeader: { padding: sp(4), borderBottomWidth: 1, borderBottomColor: C.line, gap: sp(3) },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderColor: C.line, borderRadius: 12,
    paddingHorizontal: 12, backgroundColor: C.bg,
  },
  searchInput: {
    flex: 1, paddingVertical: Platform.OS === 'ios' ? 11 : 8,
    fontFamily: 'InterBody', fontSize: 13.5, color: C.ink,
  },
  filterRow: { gap: 8, paddingRight: 4 },
  filterChip: {
    borderWidth: 1, borderColor: C.line, borderRadius: 16,
    paddingHorizontal: 12, paddingVertical: 7, backgroundColor: C.white,
  },
  filterChipActive: { backgroundColor: C.primaryDark, borderColor: C.primaryDark },
  filterChipTxt: { fontFamily: 'InterBody', fontWeight: '600', fontSize: 12, color: C.inkSoft },
  filterChipTxtActive: { color: C.white },

  listRow:   { flexDirection: 'row', alignItems: 'center', gap: sp(3), padding: sp(4) },
  seniorRow: { flexDirection: 'row', alignItems: 'flex-start', gap: sp(3), padding: sp(4) },
  listRowBorder: { borderBottomWidth: 1, borderBottomColor: C.lineSoft },

  avatar: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: C.primarySoft,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarTxt: { fontFamily: 'InterBody', fontWeight: '700', fontSize: 14, color: C.primaryDark },
  listName: { fontFamily: 'InterBody', fontWeight: '700', fontSize: 14.5, color: C.ink },
  listSub:  { fontFamily: 'InterBody', fontSize: 12.5, color: C.inkSoft, marginTop: 2 },
  listMeta: { fontFamily: 'InterBody', fontSize: 12, lineHeight: 17, color: C.inkFaint, marginTop: 3 },
  roleBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  roleBadgeTxt: { fontFamily: 'InterBody', fontWeight: '700', fontSize: 11 },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: sp(2.5) },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4,
  },
  chipTxt: { fontFamily: 'InterBody', fontWeight: '600', fontSize: 11 },

  skelLine: { height: 12, borderRadius: 6, backgroundColor: C.lineSoft },

  // Empty state
  empty: { alignItems: 'center', paddingVertical: sp(8), paddingHorizontal: sp(6) },
  emptyIcon: {
    width: 52, height: 52, borderRadius: 26, backgroundColor: C.primarySoft,
    alignItems: 'center', justifyContent: 'center', marginBottom: sp(3),
  },
  emptyTitle: { fontFamily: 'InterBody', fontWeight: '700', fontSize: 15, color: C.ink },
  emptyHint:  { fontFamily: 'InterBody', fontSize: 13, color: C.inkSoft, textAlign: 'center', marginTop: 4 },

  // Footer
  footer:    { alignItems: 'center', paddingBottom: sp(2) },
  footerLine:{ width: 40, height: 3, borderRadius: 2, backgroundColor: C.gold, marginBottom: sp(3) },
  footerSub: { fontFamily: 'InterBody', fontSize: 11.5, color: C.inkFaint },
});