import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Image,
  Text,
  ScrollView,
  StyleSheet,
  StatusBar,
  Pressable,
  Platform,
  ActivityIndicator,
  TextInput,
  RefreshControl,
  useWindowDimensions,
  Animated,
  Easing,
  AccessibilityInfo,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import Toast from '../components/Toast';
import Constants from 'expo-constants';
import paterosBoundary from '../constants/pateros-boundary.json';
import { SENIOR_CATEGORIES } from '../data/seniorCategories';

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
  bg:          '#F2F6F1',
  card:        '#FFFFFF',
  ink:         '#0F1F16',
  inkSoft:     '#41564A',
  inkFaint:    '#7A8E83',
  primary:     '#1F5C3E',
  primaryDark: '#0C2E20',
  primaryMid:  '#2E7A50',
  primaryBright: '#5FC28A',
  primarySoft: '#DDF1E4',
  gold:        '#D79A35',
  goldDark:    '#7E5417',
  goldSoft:    '#FCF1DB',
  white:       '#FFFFFF',
  line:        '#E1EADF',
  lineSoft:    '#EDF3EA',
  danger:      '#B3432E',
  dangerSoft:  '#FDECEA',
};

const sp = (n: number) => n * 4;

const ROLE_META: Record<string, { label: string; color: string; icon: string }> = {
  'osca admin':  { label: 'OSCA Admin',  color: '#14503A', icon: 'people'  },
  'med admin':   { label: 'Med Admin',   color: '#164B6B', icon: 'medkit'  },
  'super admin': { label: 'Super Admin', color: '#5E3508', icon: 'shield'  },
};

const ROLE_BADGE: Record<string, { bg: string; fg: string }> = {
  'super admin': { bg: '#F3E3CC', fg: '#6D3B00' },
  'osca admin':  { bg: C.primarySoft, fg: C.primaryDark },
  'med admin':   { bg: '#DCEAF4', fg: '#1A5276' },
  admin:         { bg: C.primarySoft, fg: C.primaryDark },
  user:          { bg: '#EEF1EC', fg: C.inkSoft },
};

// Each quick action gets its own soft tint so the grid reads at a glance.
const TINTS = [
  { bg: '#DDF1E4', fg: '#1F5C3E' },
  { bg: '#FCF1DB', fg: '#8A5A12' },
  { bg: '#DCEBF6', fg: '#1A5276' },
  { bg: '#FBE4E0', fg: '#B3432E' },
  { bg: '#EAE4F7', fg: '#5B3FA0' },
  { bg: '#D9F1EF', fg: '#17706A' },
];

type Action = { icon: string; label: string; desc: string; route?: string };

const OSCA_ACTIONS: Action[] = [
  { icon: 'people',        label: 'Senior Citizens',     desc: 'View all senior citizen details', route: '/admin-senior-citizens' },
  { icon: 'chatbubbles',   label: 'Senior Support Chat', desc: 'Chat with seniors in real time', route: '/chat' },
  { icon: 'gift',          label: 'Birthday Benefits',   desc: 'Manage benefit distributions',   route: '/admin-benefits' },
  { icon: 'card',          label: 'ID Requests',         desc: 'Process digital ID requests' },
  { icon: 'document-text', label: 'Records',             desc: 'View services availed by seniors', route: '/admin-records' },
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

// Approximate barangay locations from the Location section of each PhilAtlas profile.
// https://www.philatlas.com/luzon/ncr/pateros.html links to all ten profiles.
const BARANGAY_CENTERS: Record<string, [number, number]> = {
  Aguho: [14.5421, 121.0643],
  Magtanggol: [14.5483, 121.0696],
  'Martires Del 96': [14.5397, 121.0663],
  Poblacion: [14.5450, 121.0667],
  'San Pedro': [14.5470, 121.0665],
  'San Roque': [14.5401, 121.0691],
  'Santa Ana': [14.5466, 121.0717],
  'Santo Rosario-Kanluran': [14.5516, 121.0683],
  'Santo Rosario-Silangan': [14.5501, 121.0723],
  Tabacalera: [14.5493, 121.0677],
};

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

function getTodayLabel() {
  return new Date().toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric' });
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
      if (!__DEV__) return 'https://aurea-backend-1-7z1p.onrender.com';
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
function buildBarangayMapHtml(counts: Record<string, number>, heatmap = false): string {
  const markers = BARANGAYS.map((name) => ({
    name,
    coordinates: BARANGAY_CENTERS[name],
    count: counts[name] || 0,
  }));
  const css = `
    html,body,#map{height:100%;margin:0}
    #map{background:#dfeadf}
    .leaflet-tile{filter:grayscale(100%) brightness(1.05)}
    .barangay-marker{background:transparent;border:0}
    .barangay-count{display:flex;align-items:center;justify-content:center;width:32px;height:32px;border:3px solid #fff;border-radius:50%;background:#1F5C3E;color:#fff;font:bold 15px sans-serif;box-shadow:0 2px 8px #13201a40}
    .barangay-count.empty{background:#64756b}
    .barangay-name{position:absolute;top:40px;left:19px;transform:translateX(-50%);white-space:nowrap;padding:3px 6px;border-radius:5px;background:#fffffff2;color:#13201a;font:600 11px sans-serif;box-shadow:0 1px 4px #13201a20}
  `;

  return `<!doctype html>
<html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<style>${css}</style></head><body><div id="map" aria-label="Registered seniors by barangay"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
${heatmap ? '<script src="https://unpkg.com/leaflet.heat@0.2.0/dist/leaflet-heat.js"></script>' : ''}
<script>
  const map = L.map('map', {zoomControl:false, maxBoundsViscosity:1});
  L.control.zoom({position:'bottomright'}).addTo(map);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution:'&copy; OpenStreetMap contributors', maxZoom:19, noWrap:true
  }).addTo(map);
  // OpenStreetMap administrative boundary, relation 131653 (ODbL).
  const boundary = ${JSON.stringify(paterosBoundary)};
  const rings = boundary.coordinates.map(function(ring) {
    return ring.map(function(point) { return [point[1], point[0]]; });
  });
  const outline = L.polygon(rings, {
    color:'#1F5C3E', weight:2, fill:false, interactive:false
  }).addTo(map);
  // An opaque polygon with Pateros cut out hides all surrounding map tiles.
  L.polygon([
    [[-90,-360],[-90,360],[90,360],[90,-360]],
    rings[0]
  ], {
    stroke:false, fillColor:'#F2F5EF', fillOpacity:1,
    fillRule:'evenodd', interactive:false
  }).addTo(map);
  const bounds = outline.getBounds();
  map.setMaxBounds(bounds);
  const barangays = ${JSON.stringify(markers)};
  const heatmap = ${heatmap};
  if (heatmap) {
    map.createPane('categoryHeat');
    map.getPane('categoryHeat').style.zIndex = '350';
    const points = barangays.filter(function(item) { return item.count > 0; });
    if (L.heatLayer) {
      L.heatLayer(points.map(function(item) {
        return [item.coordinates[0], item.coordinates[1], item.count];
      }), {
        pane:'categoryHeat', radius:40, blur:28, minOpacity:0.35,
        maxZoom:16, max:Math.max(1, ...barangays.map(function(item) { return item.count; })),
        gradient:{0.2:'#2563eb',0.4:'#06b6d4',0.6:'#84cc16',0.8:'#facc15',1:'#ef4444'}
      }).addTo(map);
    } else {
      const status = document.createElement('div');
      status.textContent = 'Heatmap could not load. Please refresh.';
      status.style.cssText = 'position:absolute;z-index:1000;top:12px;left:12px;background:white;padding:12px;font:14px sans-serif';
      document.body.appendChild(status);
    }
  }
  barangays.forEach(function(barangay) {
    if (heatmap) {
      L.circleMarker(barangay.coordinates, {radius:3,color:'#1F5C3E',fillOpacity:1})
        .bindTooltip(barangay.name + ': ' + barangay.count, {direction:'top'}).addTo(map);
      return;
    }
    const label = barangay.name + ': ' + barangay.count + ' registered seniors';
    const icon = L.divIcon({
      className:'barangay-marker',
      html:'<span class="barangay-count' + (barangay.count === 0 ? ' empty' : '') + '">' + barangay.count + '</span><span class="barangay-name">' + barangay.name + '</span>',
      iconSize:[38,38], iconAnchor:[19,19]
    });
    L.marker(barangay.coordinates, {icon:icon, title:label, alt:label}).addTo(map);
  });
  map.fitBounds(bounds, {
    padding:[24,24], maxZoom:16
  });
  map.setMinZoom(map.getZoom());
  map.whenReady(function() { map.invalidateSize(); });
</script></body></html>`;
}

function BarangayMap({ html, title = 'Pateros senior citizen counts by barangay' }: { html: string; title?: string }) {
  if (Platform.OS === 'web') {
    return React.createElement('iframe', {
      title,
      srcDoc: html,
      style: { border: 'none', width: '100%', height: '400px' },
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
// Senior citizen cartoon (pure Views, so no extra dependency is needed)
// ---------------------------------------------------------------------------
type CartoonKind = 'grandpa' | 'grandma';

function pickKind(person: any, index = 0): CartoonKind {
  const sex = String(person?.sex ?? person?.gender ?? '').trim().toLowerCase();
  if (sex.startsWith('f')) return 'grandma';
  if (sex.startsWith('m')) return 'grandpa';
  const seed = String(person?.id ?? person?.email ?? index);
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return Math.abs(h) % 2 === 0 ? 'grandpa' : 'grandma';
}

function SeniorCartoon({ kind, size = 96 }: { kind: CartoonKind; size?: number }) {
  const grandma = kind === 'grandma';
  const H = size * 0.54;               // head diameter
  const HL = (size - H) / 2;           // head left
  const HT = size * 0.18;              // head top
  const stroke = Math.max(1.5, size * 0.022);

  const hair = '#ECEEF3';
  const skin = '#F6D0A9';
  const skinShade = '#E7B38A';
  const ink = '#2A2320';
  const sweater = grandma ? '#E8907F' : '#2E7A50';
  const trim = grandma ? '#C96B5B' : '#1B4E36';
  const frames = grandma ? '#C4892E' : '#41564A';

  return (
    <View
      style={{ width: size, height: size }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {/* Grandma: hair behind head + bun */}
      {grandma && (
        <>
          <View
            style={{
              position: 'absolute', backgroundColor: hair,
              width: H * 1.16, height: H * 1.16, borderRadius: H * 0.58,
              left: (size - H * 1.16) / 2, top: HT - H * 0.1,
            }}
          />
          <View
            style={{
              position: 'absolute', backgroundColor: hair,
              width: H * 0.42, height: H * 0.42, borderRadius: H * 0.21,
              left: (size - H * 0.42) / 2, top: HT - H * 0.3,
            }}
          />
        </>
      )}

      {/* Grandpa: side tufts */}
      {!grandma && [-0.1, 0.84].map((x) => (
        <View
          key={x}
          style={{
            position: 'absolute', backgroundColor: hair,
            width: H * 0.3, height: H * 0.34, borderRadius: H * 0.17,
            left: HL + H * x, top: HT + H * 0.26,
          }}
        />
      ))}

      {/* Body */}
      <View
        style={{
          position: 'absolute', backgroundColor: sweater,
          left: size * 0.1, width: size * 0.8, height: size * 0.36, bottom: 0,
          borderTopLeftRadius: size * 0.4, borderTopRightRadius: size * 0.4,
          alignItems: 'center', justifyContent: 'flex-start', paddingTop: size * 0.13,
        }}
      >
        <View style={{ width: stroke, height: size * 0.18, backgroundColor: trim }} />
        <View
          style={{
            position: 'absolute', top: size * 0.17, left: size * 0.4 + stroke * 2,
            width: size * 0.04, height: size * 0.04, borderRadius: size * 0.02, backgroundColor: trim,
          }}
        />
        <View
          style={{
            position: 'absolute', top: size * 0.25, left: size * 0.4 + stroke * 2,
            width: size * 0.04, height: size * 0.04, borderRadius: size * 0.02, backgroundColor: trim,
          }}
        />
      </View>

      {/* Ears */}
      {[-0.07, 0.91].map((x) => (
        <View
          key={x}
          style={{
            position: 'absolute', backgroundColor: skinShade,
            width: H * 0.17, height: H * 0.2, borderRadius: H * 0.1,
            left: HL + H * x, top: HT + H * 0.44,
          }}
        />
      ))}

      {/* Head */}
      <View
        style={{
          position: 'absolute', left: HL, top: HT, width: H, height: H,
          borderRadius: H / 2, backgroundColor: skin, overflow: 'hidden',
        }}
      >
        {/* Grandma fringe / Grandpa shine */}
        {grandma ? (
          <View
            style={{
              position: 'absolute', top: 0, left: 0, width: H, height: H * 0.3,
              backgroundColor: hair, borderBottomLeftRadius: H * 0.5, borderBottomRightRadius: H * 0.5,
            }}
          />
        ) : (
          <View
            style={{
              position: 'absolute', top: H * 0.07, left: H * 0.2, width: H * 0.2, height: H * 0.08,
              borderRadius: H * 0.05, backgroundColor: 'rgba(255,255,255,0.45)',
            }}
          />
        )}

        {/* Eyebrows (grandpa only, bushy) */}
        {!grandma && [0.14, 0.58].map((x) => (
          <View
            key={x}
            style={{
              position: 'absolute', backgroundColor: hair,
              left: H * x, top: H * 0.22, width: H * 0.28, height: H * 0.07, borderRadius: H * 0.04,
            }}
          />
        ))}

        {/* Glasses */}
        {[0.13, 0.57].map((x) => (
          <View
            key={x}
            style={{
              position: 'absolute', left: H * x, top: H * 0.3, width: H * 0.3, height: H * 0.3,
              borderRadius: H * 0.15, borderWidth: stroke, borderColor: frames,
              backgroundColor: 'rgba(255,255,255,0.55)',
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            <View style={{ width: H * 0.09, height: H * 0.09, borderRadius: H * 0.045, backgroundColor: ink }} />
          </View>
        ))}
        <View style={{ position: 'absolute', left: H * 0.43, top: H * 0.42, width: H * 0.14, height: stroke, backgroundColor: frames }} />

        {/* Cheeks */}
        {[0.06, 0.8].map((x) => (
          <View
            key={x}
            style={{
              position: 'absolute', left: H * x, top: H * 0.62, width: H * 0.15, height: H * 0.15,
              borderRadius: H * 0.075, backgroundColor: 'rgba(240,120,120,0.35)',
            }}
          />
        ))}

        {/* Nose */}
        <View
          style={{
            position: 'absolute', left: H * 0.45, top: H * 0.52, width: H * 0.1, height: H * 0.1,
            borderRadius: H * 0.05, backgroundColor: skinShade,
          }}
        />

        {/* Moustache (grandpa) */}
        {!grandma && (
          <View
            style={{
              position: 'absolute', left: H * 0.27, top: H * 0.62, width: H * 0.46, height: H * 0.13,
              borderRadius: H * 0.07, backgroundColor: hair,
            }}
          />
        )}

        {/* Smile */}
        <View
          style={{
            position: 'absolute', left: H * 0.36, top: grandma ? H * 0.7 : H * 0.76,
            width: H * 0.28, height: H * 0.13,
            borderBottomWidth: stroke * 1.3, borderColor: ink,
            borderBottomLeftRadius: H * 0.14, borderBottomRightRadius: H * 0.14,
          }}
        />
      </View>
    </View>
  );
}

// The pair bobs gently and grandma waves hello. Both stop when the device has
// "reduce motion" turned on, and the footer pair is always still.
function CartoonPair({ size = 84, animated = false }: { size?: number; animated?: boolean }) {
  const [bob] = useState(() => new Animated.Value(0));
  const [wave] = useState(() => new Animated.Value(0));
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => {});
  }, []);

  useEffect(() => {
    if (!animated || reduceMotion) return;
    const native = Platform.OS !== 'web';
    const step = (value: Animated.Value, toValue: number, duration: number) =>
      Animated.timing(value, { toValue, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: native });

    const bobLoop = Animated.loop(Animated.sequence([step(bob, 1, 1800), step(bob, 0, 1800)]));
    const waveLoop = Animated.loop(Animated.sequence([
      step(wave, 1, 380), step(wave, 0, 380),
      step(wave, 1, 380), step(wave, 0, 380),
      Animated.delay(2200),
    ]));
    bobLoop.start();
    waveLoop.start();
    return () => { bobLoop.stop(); waveLoop.stop(); };
  }, [animated, reduceMotion, bob, wave]);

  const translateY = bob.interpolate({ inputRange: [0, 1], outputRange: [0, -size * 0.05] });
  const angle = wave.interpolate({ inputRange: [0, 1], outputRange: ['-6deg', '26deg'] });
  const armH = size * 0.3;

  return (
    <Animated.View style={{ flexDirection: 'row', alignItems: 'flex-end', transform: [{ translateY }] }}>
      <SeniorCartoon kind="grandpa" size={size} />
      <View style={{ marginLeft: -size * 0.2 }}>
        <SeniorCartoon kind="grandma" size={size} />
      </View>

      {/* Grandma's waving arm */}
      <Animated.View
        style={{
          position: 'absolute', left: size * 1.6, top: size * 0.44, width: size * 0.14, height: armH,
          alignItems: 'center',
          transform: [{ translateY: armH / 2 }, { rotate: angle }, { translateY: -armH / 2 }],
        }}
      >
        <View
          style={{
            position: 'absolute', top: size * 0.05, width: size * 0.12, height: armH - size * 0.05,
            borderRadius: size * 0.06, backgroundColor: '#E8907F',
          }}
        />
        <View style={{ width: size * 0.15, height: size * 0.15, borderRadius: size * 0.075, backgroundColor: '#F6D0A9' }} />
      </Animated.View>

      <View
        style={{
          position: 'absolute', top: -size * 0.04, left: size * 0.82,
          width: size * 0.3, height: size * 0.3, borderRadius: size * 0.15,
          backgroundColor: C.white, alignItems: 'center', justifyContent: 'center',
        }}
      >
        <Ionicons name="heart" size={size * 0.17} color="#E0566B" />
      </View>
    </Animated.View>
  );
}

function SeniorAvatar({ person, index, size = 48 }: { person: any; index: number; size?: number }) {
  const kind = pickKind(person, index);
  return (
    <View
      style={{
        width: size, height: size, borderRadius: size / 2, overflow: 'hidden',
        backgroundColor: kind === 'grandma' ? '#FBE4E0' : C.primarySoft,
        alignItems: 'center', justifyContent: 'flex-end',
      }}
    >
      <View style={{ marginBottom: -size * 0.06 }}>
        <SeniorCartoon kind={kind} size={size * 1.05} />
      </View>
    </View>
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

function EmptyState({
  icon, title, hint, cartoon,
}: { icon: string; title: string; hint?: string; cartoon?: CartoonKind }) {
  return (
    <View style={s.empty}>
      {cartoon ? (
        <View style={s.emptyCartoon}>
          <SeniorCartoon kind={cartoon} size={92} />
        </View>
      ) : (
        <View style={s.emptyIcon}>
          <Ionicons name={icon as any} size={24} color={C.primary} />
        </View>
      )}
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
  const [heatCategory, setHeatCategory] = useState(SENIOR_CATEGORIES[0]);
  const mainScroll = useRef<React.ElementRef<typeof ScrollView>>(null);
  const categoryScroll = useRef<React.ElementRef<typeof ScrollView>>(null);
  const categoryScrollOffset = useRef(0);
  const scrollCategories = (direction: number) => {
    categoryScroll.current?.scrollTo({ x: Math.max(0, categoryScrollOffset.current + direction * 240), animated: true });
  };
  const { width } = useWindowDimensions();
  const actionWidth = width >= 1000 ? '16.666666%' : width >= 600 ? '33.333333%' : '50%';
  const router = useRouter();
  const { user, logout } = useAuth();
  const role = (user?.role ?? 'osca admin').toLowerCase();
  const meta = ROLE_META[role] ?? ROLE_META['osca admin'];
  const actions = getActions(role);
  const isSuperAdmin = role === 'super admin';
  const canViewSeniorMap = isSuperAdmin || role === 'osca admin';
  const appVersion = Constants.expoConfig?.version;

  const [users, setUsers]               = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingTx, setLoadingTx]       = useState(false);
  const [refreshing, setRefreshing]     = useState(false);
  const [lastSynced, setLastSynced]     = useState<Date | null>(null);
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
      setLastSynced(new Date());
    } catch {
      showToast('Could not load users. Pull down to try again.', 'error');
    }
  }, [showToast]);

  useEffect(() => {
    if (!canViewSeniorMap) return;
    let cancelled = false;
    fetchUsers()
      .then(records => {
        if (cancelled) return;
        setUsers(records);
        setLastSynced(new Date());
      })
      .catch(() => {
        if (!cancelled) showToast('Could not load users. Pull down to try again.', 'error');
      })
      .finally(() => {
        if (!cancelled) setLoadingUsers(false);
      });
    return () => { cancelled = true; };
  }, [canViewSeniorMap, showToast]);

  useEffect(() => {
    if (!isSuperAdmin || activeTab !== 'transactions') return;
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
  const enrolledPct = seniors.length ? Math.round((enrolledCount / seniors.length) * 100) : 0;
  const barangayMapHtml = useMemo(() => buildBarangayMapHtml(barangayCounts), [barangayCounts]);
  const categoryCounts = useMemo(() => {
    const counts = Object.fromEntries(BARANGAYS.map(name => [name, 0]));
    seniors.forEach(senior => {
      const category = String(senior.category || '').trim() || 'Not Specified';
      const barangay = normalizeBarangay(senior.address);
      if (barangay && category === heatCategory) counts[barangay] += 1;
    });
    return counts;
  }, [seniors, heatCategory]);
  const categoryMapHtml = useMemo(() => buildBarangayMapHtml(categoryCounts, true), [categoryCounts]);
  const categoryMappedCount = Object.values(categoryCounts).reduce((sum, count) => sum + count, 0);

  // Total seniors per category, shown as a count on each category chip.
  const categoryTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    seniors.forEach((senior) => {
      const category = String(senior.category || '').trim() || 'Not Specified';
      totals[category] = (totals[category] ?? 0) + 1;
    });
    return totals;
  }, [seniors]);

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

  const stats = [
    { value: seniors.length,       label: 'Senior citizens',     icon: 'people' },
    { value: enrolledCount,        label: 'Face enrolled',       icon: 'scan' },
    { value: unmappedSeniorCount,  label: 'Need address review', icon: 'location' },
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
        ref={mainScroll}
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
            <LinearGradient colors={[C.primaryBright, C.primaryMid]} style={s.logoGrad}>
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
        <View style={s.bannerWrap}>
          <LinearGradient
            colors={[meta.color, C.primaryDark]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={s.banner}
          >
            <View style={s.blobA} />
            <View style={s.blobB} />

            <View style={s.bannerTop}>
              <View style={s.bannerLeft}>
                <View style={s.rolePill}>
                  <Ionicons name={meta.icon as any} size={12} color={C.white} />
                  <Text style={s.rolePillTxt}>{meta.label}</Text>
                </View>
                <Text style={s.bannerGreeting}>{getGreeting()},</Text>
                <Text style={s.bannerName} numberOfLines={2}>
                  {user?.firstName} {user?.lastName}
                </Text>
                <Text style={s.bannerEmail} numberOfLines={1}>{user?.email}</Text>
                <Text style={s.bannerDate} numberOfLines={1}>{getTodayLabel()}</Text>
              </View>
              <View style={s.bannerArt}>
                <CartoonPair size={78} animated />
              </View>
            </View>

            {canViewSeniorMap && (
              <>
                <View style={s.bannerStats}>
                  {stats.map((stat) => (
                    <View key={stat.label} style={s.bannerStat}>
                      <Ionicons name={stat.icon as any} size={14} color={C.primaryBright} />
                      <Text style={s.bannerStatValue}>{loadingUsers ? '–' : stat.value}</Text>
                      <Text style={s.bannerStatLabel} numberOfLines={2}>{stat.label}</Text>
                    </View>
                  ))}
                </View>

                <View style={s.progressWrap}>
                  <View style={s.progressHead}>
                    <Text style={s.progressLabel}>Face enrollment</Text>
                    <Text style={s.progressPct}>{loadingUsers ? '–' : `${enrolledPct}%`}</Text>
                  </View>
                  <View style={s.progressTrack}>
                    <LinearGradient
                      colors={[C.primaryBright, '#BFEAD0']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={[s.progressFill, { width: `${loadingUsers ? 0 : enrolledPct}%` }]}
                    />
                  </View>
                </View>
              </>
            )}
          </LinearGradient>
        </View>

        {/* ── QUICK ACTIONS ── */}
        <SectionHeader title="Quick actions" />
        <View style={s.grid}>
          {actions.map((a, index) => {
            const ready = !!a.route;
            const tint = TINTS[index % TINTS.length];
            return (
              <Pressable
                key={a.label}
                style={({ pressed }) => [s.actionCard, { width: actionWidth }, !ready && s.actionCardMuted, pressed && s.pressed]}
                onPress={() => handleAction(a)}
                accessibilityRole="button"
                accessibilityLabel={`${a.label}. ${a.desc}${ready ? '' : '. Coming soon'}`}
              >
                <View style={[s.actionIconWrap, { backgroundColor: ready ? tint.bg : C.lineSoft }]}>
                  <Ionicons name={a.icon as any} size={30} color={ready ? tint.fg : C.inkFaint} />
                  {!ready && <View style={s.actionSoon}><Text style={s.actionSoonText}>Soon</Text></View>}
                </View>
                <Text style={s.actionLabel}>{a.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* ── SENIOR MAPS ── */}
        {canViewSeniorMap && (
          <View style={[s.mapsLayout, width >= 1000 && s.mapsLayoutWide]}>
          <View style={s.mapSection}>
            <SectionHeader
              title="Where seniors live"
              subtitle="Numbers on the map show registered seniors aged 60+ in each barangay."
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
                {!loadingUsers && (
                  <View style={s.mapBadge} pointerEvents="none">
                    <Ionicons name="location" size={12} color={C.primary} />
                    <Text style={s.mapBadgeTxt}>{mappedSeniorCount} of {seniors.length} mapped</Text>
                  </View>
                )}
              </View>

              {/* Ranked barangay bars */}
              <View style={s.rankList}>
                {visibleBarangays.map((barangay) => {
                  const count = barangayCounts[barangay];
                  const pct = count === 0 ? 0 : Math.max(6, (count / maxBarangayCount) * 100);
                  const share = mappedSeniorCount ? Math.round((count / mappedSeniorCount) * 100) : 0;
                  return (
                    <View key={barangay} style={s.rankRow}>
                      <Text style={s.rankName} numberOfLines={1}>{barangay}</Text>
                      <View style={s.rankTrack}>
                        <LinearGradient
                          colors={[C.primaryMid, C.primaryBright]}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 0 }}
                          style={[s.rankFill, { width: `${pct}%` }]}
                        />
                      </View>
                      <Text style={s.rankCount}>{count}</Text>
                      <Text style={s.rankShare}>{share}%</Text>
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
                Approximate barangay centers · © OpenStreetMap contributors
              </Text>
            </View>
          </View>
          <View style={s.mapSection}>
            <SectionHeader title="Senior categories" subtitle="Select a health or mobility category to see its distribution by barangay." />
            <View style={s.mapCard}>
              <View style={s.categoryNavigation}>
              <Pressable onPress={() => scrollCategories(-1)} accessibilityRole="button" accessibilityLabel="Scroll categories left" style={s.categoryArrow}>
                <Ionicons name="chevron-back" size={20} color={C.primaryDark} />
              </Pressable>
              <ScrollView ref={categoryScroll} horizontal showsHorizontalScrollIndicator={false} style={s.categoryScroll}
                onScroll={event => { categoryScrollOffset.current = event.nativeEvent.contentOffset.x; }} scrollEventThrottle={16}
                contentContainerStyle={s.categoryFilters}>
                {SENIOR_CATEGORIES.map(category => {
                  const active = heatCategory === category;
                  return (
                    <Pressable key={category} onPress={() => setHeatCategory(category)} accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      style={[s.categoryFilter, active && s.categoryFilterActive]}>
                      <Text style={[s.categoryFilterText, active && s.categoryFilterTextActive]}>{category}</Text>
                      <View style={[s.categoryCount, active && s.categoryCountActive]}>
                        <Text style={[s.categoryCountText, active && s.categoryCountTextActive]}>
                          {categoryTotals[category] ?? 0}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </ScrollView>
              <Pressable onPress={() => scrollCategories(1)} accessibilityRole="button" accessibilityLabel="Scroll categories right" style={s.categoryArrow}>
                <Ionicons name="chevron-forward" size={20} color={C.primaryDark} />
              </Pressable>
              </View>
              <View style={s.mapFrame}>
                {loadingUsers ? <View style={s.mapLoading}><ActivityIndicator color={C.primaryDark} /></View>
                  : <BarangayMap html={categoryMapHtml} title={`${heatCategory} senior distribution in Pateros`} />}
                {!loadingUsers && (
                  <View style={s.mapBadge} pointerEvents="none">
                    <Ionicons name="flame" size={12} color={C.danger} />
                    <Text style={s.mapBadgeTxt}>{categoryMappedCount} mapped</Text>
                  </View>
                )}
              </View>
              <View style={s.categoryLegend}>
                <Text style={s.categorySummary}>{heatCategory} · {categoryMappedCount} seniors mapped</Text>
                {!loadingUsers && categoryMappedCount === 0 && <Text style={s.sectionSub}>No seniors in this category have a recognized barangay address.</Text>}
                <LinearGradient colors={['#2563eb', '#06b6d4', '#84cc16', '#facc15', '#ef4444']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.categoryGradient} />
                <View style={s.categoryLegendLabels}><Text style={s.sectionSub}>Fewer seniors</Text><Text style={s.sectionSub}>More seniors</Text></View>
                <Text style={s.sectionSub}>Counts grouped at approximate barangay locations. Tap a point to view its count.</Text>
              </View>
            </View>
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
                    onPress={() => {
                      if (tab.key === 'seniors') {
                        router.push('/admin-senior-citizens' as any);
                        return;
                      }
                      if (tab.key === 'transactions' && activeTab !== 'transactions') setLoadingTx(true);
                      setActiveTab(tab.key);
                    }}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: active }}
                  >
                    <Ionicons name={tab.icon as any} size={15} color={active ? C.primaryDark : C.inkFaint} />
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
                  <EmptyState icon="people-outline" title="No users yet" hint="Registered users will show up here." cartoon="grandma" />
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
                  <EmptyState icon="swap-horizontal-outline" title="No transactions yet" hint="Activity will appear here once it happens." cartoon="grandpa" />
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
                    cartoon="grandpa"
                  />
                ) : (
                  filteredSeniors.map((senior, i) => {
                    const enrolled = !!senior.avatarUrl;
                    return (
                      <View key={senior.id ?? i} style={[s.seniorRow, i < filteredSeniors.length - 1 && s.listRowBorder]}>
                        <SeniorAvatar person={senior} index={i} size={50} />
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
          <View style={[s.footerColumns, width >= 900 && s.footerColumnsWide]}>
            <View style={s.footerColumn}>
              <Image source={require('../assets/images/pateros-logo.png')} style={s.footerLogo} resizeMode="contain" accessibilityLabel="Municipality of Pateros logo" />
              <Text style={s.footerBrand}>Municipality of Pateros</Text>
              <Text style={s.footerOffice}>Office of Senior Citizens Affairs</Text>
            </View>
            <View style={s.footerColumn}>
              <Image source={require('../assets/images/aurea-pateros-logo.png')} style={s.footerAureaLogo} resizeMode="contain" accessibilityLabel="AUREA logo" />
              <Text style={s.footerBrand}>About AUREA</Text>
              <Text style={s.footerMessage}>Advanced Unified Records and Elderly Assistance</Text>
              <Text style={s.footerMessage}>Serving every senior of Pateros with care, dignity, and purpose.</Text>
            </View>
            <View style={s.footerColumn}>
              <Image source={require('../assets/images/bagong_pilipinas_logo.png')} style={s.footerLogo} resizeMode="contain" accessibilityLabel="Bagong Pilipinas logo" />
              <Text style={s.footerBrand}>Bagong Pilipinas</Text>
              {canViewSeniorMap && <Text style={s.footerMessage}>{lastSynced
                ? `Data synced ${lastSynced.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}`
                : 'Waiting for first sync'}</Text>}
            </View>
          </View>
          <Text style={s.footerCopy}>? {new Date().getFullYear()} AUREA ? Municipality of Pateros{appVersion ? ` ? v${appVersion}` : ''}</Text>
          <View style={s.footerActions}>
            <Pressable onPress={() => router.push('/chat' as any)} accessibilityRole="button" style={({ pressed }) => [s.footerAction, pressed && s.pressed]}>
              <Ionicons name="chatbubbles-outline" size={16} color="#FFFFFF" /><Text style={s.footerActionTxt}>Live chat</Text>
            </Pressable>
            {canViewSeniorMap && <Pressable onPress={onRefresh} disabled={refreshing} accessibilityRole="button" style={({ pressed }) => [s.footerAction, pressed && s.pressed]}>
              {refreshing ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Ionicons name="refresh-outline" size={16} color="#FFFFFF" />}<Text style={s.footerActionTxt}>Refresh</Text>
            </Pressable>}
            <Pressable onPress={() => mainScroll.current?.scrollTo({ y: 0, animated: true })} accessibilityRole="button" style={({ pressed }) => [s.footerAction, pressed && s.pressed]}>
              <Ionicons name="arrow-up-outline" size={16} color="#FFFFFF" /><Text style={s.footerActionTxt}>Back to top</Text>
            </Pressable>
          </View>
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
  pressed: { opacity: 0.75, transform: [{ scale: 0.98 }] },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: sp(1), marginBottom: sp(5),
  },
  brand:    { flexDirection: 'row', alignItems: 'center', flex: 1 },
  logoGrad: {
    width: 46, height: 46, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
    ...shadow(C.primaryMid, 0.3, 10, 4),
  },
  h1:       { fontFamily: 'FraunTitle', fontSize: 25, color: C.ink, lineHeight: 29 },
  brandSub: { fontFamily: 'InterBody', fontSize: 12, color: C.inkFaint, marginTop: 1 },
  headerActions: { flexDirection: 'row', gap: 10 },
  iconBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: C.card,
    alignItems: 'center', justifyContent: 'center',
    ...shadow(C.ink, 0.08, 10, 3),
  },

  // Banner
  bannerWrap: {
    marginBottom: sp(7), borderRadius: 30,
    ...shadow(C.primaryDark, 0.32, 18, 8),
  },
  banner: { borderRadius: 30, padding: sp(5), overflow: 'hidden' },
  blobA: {
    position: 'absolute', width: 220, height: 220, borderRadius: 110,
    backgroundColor: 'rgba(95,194,138,0.16)', top: -90, right: -70,
  },
  blobB: {
    position: 'absolute', width: 150, height: 150, borderRadius: 75,
    backgroundColor: 'rgba(215,154,53,0.14)', bottom: -60, left: -40,
  },
  bannerTop: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  bannerLeft: { flex: 1, paddingRight: sp(2), paddingBottom: sp(1) },
  bannerArt: { paddingTop: sp(3) },
  rolePill: {
    alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: 20,
    paddingVertical: 5, paddingHorizontal: 11, marginBottom: sp(4),
  },
  rolePillTxt: { fontFamily: 'InterBody', fontWeight: '600', fontSize: 11.5, color: C.white },
  bannerGreeting: { fontFamily: 'InterBody', fontSize: 13.5, color: 'rgba(255,255,255,0.72)' },
  bannerName:  { fontFamily: 'FraunTitle', fontSize: 25, color: C.white, lineHeight: 30, marginTop: 2 },
  bannerEmail: { fontFamily: 'InterBody', fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 4 },
  bannerDate:  { fontFamily: 'InterBody', fontWeight: '600', fontSize: 12, color: C.primaryBright, marginTop: 6 },
  bannerStats: { flexDirection: 'row', gap: sp(2), marginTop: sp(5) },
  bannerStat: {
    flex: 1, borderRadius: 18, padding: sp(3),
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
  },
  bannerStatValue: { fontFamily: 'FraunTitle', fontSize: 26, color: C.white, lineHeight: 31, marginTop: 4 },
  bannerStatLabel: { fontFamily: 'InterBody', fontSize: 10.5, lineHeight: 14, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  progressWrap: { marginTop: sp(4) },
  progressHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  progressLabel: { fontFamily: 'InterBody', fontWeight: '600', fontSize: 11.5, color: 'rgba(255,255,255,0.75)' },
  progressPct: { fontFamily: 'InterBody', fontWeight: '700', fontSize: 11.5, color: C.white },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.14)', overflow: 'hidden' },
  progressFill: { height: 8, borderRadius: 4 },

  // Section header
  sectionHead:  { flexDirection: 'row', alignItems: 'flex-end', marginBottom: sp(4) },
  sectionTitle: { fontFamily: 'FraunTitle', fontSize: 22, color: C.ink },
  sectionSub:   { fontFamily: 'InterBody', fontSize: 12.5, lineHeight: 18, color: C.inkSoft, marginTop: 4 },

  // Actions
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingVertical: sp(5), paddingHorizontal: sp(2), rowGap: sp(5), backgroundColor: C.card, borderRadius: 24, marginBottom: sp(8), ...shadow(C.ink, 0.07, 12, 4) },
  actionCard: {
    alignItems: 'center', justifyContent: 'flex-start',
    paddingHorizontal: sp(2), paddingVertical: sp(2), borderRadius: 16, gap: 12,
  },
  actionCardMuted: { opacity: 0.65 },
  actionIconWrap: {
    width: 68, height: 68, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
  },
  actionSoon: { position: 'absolute', bottom: -5, backgroundColor: C.lineSoft, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  actionSoonText: { fontFamily: 'InterBody', fontWeight: '600', fontSize: 10, color: C.inkSoft },
  actionLabel: { fontFamily: 'InterBody', fontWeight: '600', fontSize: 13, lineHeight: 18, color: C.ink, textAlign: 'center', maxWidth: 140 },

  // Map
  categoryNavigation: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8 },
  categoryScroll: { flex: 1, minWidth: 0 },
  categoryArrow: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.lineSoft, alignItems: 'center', justifyContent: 'center' },
  categoryFilters: { padding: 16, gap: 8 },
  categoryFilter: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingLeft: 14, paddingRight: 8, paddingVertical: 8, borderRadius: 20, backgroundColor: C.lineSoft,
  },
  categoryFilterActive: { backgroundColor: C.primaryDark },
  categoryFilterText: { fontFamily: 'InterBody', fontSize: 12, color: C.ink },
  categoryFilterTextActive: { color: '#FFFFFF' },
  categoryCount: {
    minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6,
    backgroundColor: C.white, alignItems: 'center', justifyContent: 'center',
  },
  categoryCountActive: { backgroundColor: 'rgba(255,255,255,0.2)' },
  categoryCountText: { fontFamily: 'InterBody', fontWeight: '700', fontSize: 11, color: C.primaryDark },
  categoryCountTextActive: { color: C.white },
  categoryLegend: { padding: 16 },
  categorySummary: { fontFamily: 'InterBody', fontSize: 13, fontWeight: '600', color: C.ink },
  categoryGradient: { height: 8, borderRadius: 4, marginTop: 12 },
  categoryLegendLabels: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  mapsLayout: { gap: 20, marginBottom: sp(2) },
  mapsLayoutWide: { flexDirection: 'row', alignItems: 'flex-start' },
  mapSection: { flex: 1, minWidth: 0 },
  mapCard: {
    backgroundColor: C.card, borderRadius: 28,
    overflow: 'hidden', marginBottom: sp(8),
    ...shadow(C.ink, 0.07, 12, 4),
  },
  mapFrame: { height: 400, backgroundColor: '#E3ECE1' },
  map: { height: 400, width: '100%' },
  mapLoading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  mapLoadingTxt: { fontFamily: 'InterBody', fontSize: 12.5, color: C.inkSoft },
  mapBadge: {
    position: 'absolute', top: 12, left: 12,
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: C.white, borderRadius: 14,
    paddingHorizontal: 10, paddingVertical: 6,
    ...shadow(C.ink, 0.15, 6, 2),
  },
  mapBadgeTxt: { fontFamily: 'InterBody', fontWeight: '600', fontSize: 11.5, color: C.primaryDark },
  rankList: { paddingHorizontal: sp(4), paddingTop: sp(4), paddingBottom: sp(1), gap: sp(3) },
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: sp(2.5) },
  rankName: { fontFamily: 'InterBody', fontWeight: '600', fontSize: 12.5, color: C.ink, width: 108 },
  rankTrack: { flex: 1, height: 10, borderRadius: 5, backgroundColor: C.lineSoft, overflow: 'hidden' },
  rankFill: { height: 10, borderRadius: 5 },
  rankCount: { fontFamily: 'InterBody', fontWeight: '700', fontSize: 12.5, color: C.primaryDark, width: 22, textAlign: 'right' },
  rankShare: { fontFamily: 'InterBody', fontSize: 11, color: C.inkFaint, width: 32, textAlign: 'right' },
  rankToggle: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    paddingVertical: sp(2),
  },
  rankToggleTxt: { fontFamily: 'InterBody', fontWeight: '600', fontSize: 12.5, color: C.primary },
  mapAttribution: {
    fontFamily: 'InterBody', fontSize: 10.5, color: C.inkFaint,
    paddingHorizontal: sp(4), paddingBottom: sp(4), paddingTop: sp(1),
  },

  // Segmented control
  segment: {
    flexDirection: 'row', backgroundColor: '#E4ECE1',
    borderRadius: 18, padding: 4, marginBottom: sp(3),
  },
  segmentItem: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: sp(2.5), borderRadius: 14,
  },
  segmentItemActive: { backgroundColor: C.white, ...shadow(C.ink, 0.12, 6, 2) },
  segmentTxt: { fontFamily: 'InterBody', fontWeight: '600', fontSize: 13, color: C.inkFaint },
  segmentTxtActive: { color: C.primaryDark },

  // Lists
  listCard: {
    backgroundColor: C.card, borderRadius: 26,
    marginBottom: sp(7),
    ...shadow(C.ink, 0.07, 12, 4),
    overflow: 'hidden',
  },
  listHeader: { paddingHorizontal: sp(4), paddingVertical: sp(3.5), borderBottomWidth: 1, borderBottomColor: C.lineSoft },
  listHeaderTxt: { fontFamily: 'InterBody', fontWeight: '600', fontSize: 12.5, color: C.inkSoft },
  seniorHeader: { padding: sp(4), borderBottomWidth: 1, borderBottomColor: C.lineSoft, gap: sp(3) },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: 16,
    paddingHorizontal: 14, backgroundColor: C.bg,
  },
  searchInput: {
    flex: 1, paddingVertical: Platform.OS === 'ios' ? 12 : 9,
    fontFamily: 'InterBody', fontSize: 13.5, color: C.ink,
  },
  filterRow: { gap: 8, paddingRight: 4 },
  filterChip: {
    borderRadius: 18,
    paddingHorizontal: 14, paddingVertical: 8, backgroundColor: C.lineSoft,
  },
  filterChipActive: { backgroundColor: C.primaryDark },
  filterChipTxt: { fontFamily: 'InterBody', fontWeight: '600', fontSize: 12, color: C.inkSoft },
  filterChipTxtActive: { color: C.white },

  listRow:   { flexDirection: 'row', alignItems: 'center', gap: sp(3), padding: sp(4) },
  seniorRow: { flexDirection: 'row', alignItems: 'flex-start', gap: sp(3), padding: sp(4) },
  listRowBorder: { borderBottomWidth: 1, borderBottomColor: C.lineSoft },

  avatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: C.primarySoft,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarTxt: { fontFamily: 'InterBody', fontWeight: '700', fontSize: 14, color: C.primaryDark },
  listName: { fontFamily: 'InterBody', fontWeight: '700', fontSize: 14.5, color: C.ink },
  listSub:  { fontFamily: 'InterBody', fontSize: 12.5, color: C.inkSoft, marginTop: 2 },
  listMeta: { fontFamily: 'InterBody', fontSize: 12, lineHeight: 17, color: C.inkFaint, marginTop: 3 },
  roleBadge: { borderRadius: 10, paddingHorizontal: 9, paddingVertical: 4 },
  roleBadgeTxt: { fontFamily: 'InterBody', fontWeight: '700', fontSize: 11 },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: sp(2.5) },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: 10, paddingHorizontal: 9, paddingVertical: 4,
  },
  chipTxt: { fontFamily: 'InterBody', fontWeight: '600', fontSize: 11 },

  skelLine: { height: 12, borderRadius: 6, backgroundColor: C.lineSoft },

  // Empty state
  empty: { alignItems: 'center', paddingVertical: sp(8), paddingHorizontal: sp(6) },
  emptyIcon: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: C.primarySoft,
    alignItems: 'center', justifyContent: 'center', marginBottom: sp(3),
  },
  emptyCartoon: {
    width: 104, height: 104, borderRadius: 52, backgroundColor: C.primarySoft,
    alignItems: 'center', justifyContent: 'flex-end', overflow: 'hidden', marginBottom: sp(3),
  },
  emptyTitle: { fontFamily: 'InterBody', fontWeight: '700', fontSize: 15, color: C.ink },
  emptyHint:  { fontFamily: 'InterBody', fontSize: 13, color: C.inkSoft, textAlign: 'center', marginTop: 4 },

  // Footer
  footer: { marginTop: sp(4), marginHorizontal: -sp(5), marginBottom: -sp(10), backgroundColor: '#FAFBFA', borderTopWidth: 2, borderTopColor: C.primaryDark },
  footerColumns: { paddingHorizontal: sp(6), paddingVertical: sp(7), gap: sp(6) },
  footerColumnsWide: { flexDirection: 'row', alignItems: 'flex-start' },
  footerColumn: { flex: 1, alignItems: 'center', gap: 10 },
  footerLogo: { width: 100, height: 100 },
  footerAureaLogo: { width: 160, height: 100 },
  footerBrand: { fontFamily: 'InterBody', fontSize: 14, fontWeight: '700', color: C.primaryDark, textAlign: 'center' },
  footerOffice: { fontFamily: 'InterBody', fontSize: 12, color: C.inkSoft, textAlign: 'center', lineHeight: 20 },
  footerMessage: { fontFamily: 'InterBody', fontSize: 12, lineHeight: 20, color: C.inkSoft, textAlign: 'center', maxWidth: 380 },
  footerActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 20, backgroundColor: C.primaryDark, paddingHorizontal: 20, paddingVertical: 16 },
  footerAction: { flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 36, paddingHorizontal: 8 },
  footerActionTxt: { fontFamily: 'InterBody', fontWeight: '600', fontSize: 12, color: '#FFFFFF' },
  footerCopy: { fontFamily: 'InterBody', fontSize: 11, color: C.inkSoft, textAlign: 'center', paddingHorizontal: 20, paddingBottom: 20 },
});
