import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  StatusBar,
  TouchableOpacity,
  ImageBackground,
  Image,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import Toast from '../../components/Toast';

/**
 * DashboardScreen — AUREA
 * eGovPH-style home layout on mobile: greeting -> search -> banner
 * carousel -> "Tungkol sa Pateros" infographic -> service categories ->
 * announcements -> "Paano Gamitin ang AUREA" infographic. On desktop
 * web, Services and Announcements sit side by side instead of
 * stacking in a narrow centered column — a capped single column just
 * moves the empty space to the page edges rather than removing it.
 * Marketing content (steps, register CTA) only shows to signed-out
 * visitors. The Pateros facts and app-usage infographics are in
 * Tagalog, with larger type and higher contrast, since the primary
 * audience is senior citizens.
 */

function shadow(color: string, opacity: number, radius = 14, height = 6) {
  return Platform.select({
    ios: { shadowColor: color, shadowOpacity: opacity, shadowRadius: radius, shadowOffset: { width: 0, height } },
    android: { elevation: Math.round(radius * 0.6) },
    default: {},
  });
}

const C = {
  bg:          '#F6F8F2',
  bgWeb:       '#EEF2EA',
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
  line:        '#E4EAE0',
  overlayBot:  'rgba(4,14,9,0.85)',
};

const sp = (n: number) => n * 4;

const HERO_URI =
  'https://d1qvryx77qeesd.cloudfront.net/2024/09/DOT-NCR-Pateros-Town-Plaza-02.jpg';

// Banner carousel — eGovPH style: rotating announcement/promo cards
const BANNERS = [
  {
    key: 'pateros',
    image: HERO_URI,
    tag: 'Municipality of Pateros',
    title: 'Advanced Unified Records\nand Elderly Assistance',
  },
  {
    key: 'osca',
    icon: 'call',
    tag: 'Need help?',
    title: 'Visit OSCA or ask a\nfamily member to assist you',
  },
];

// Available benefits — colored circular icon buttons. Category tiles
// (NGAs/LGUs/Travel/Health/Report) were removed: this grid is only
// the actual benefits a resident can apply for.
const BENEFIT_ITEMS = [
  { icon: 'medkit',    label: 'Medicine',      color: '#B3432E', bg: '#FBE3DD', benefit: 'request for medicine' },
  { icon: 'cash',      label: 'Financial Aid', color: '#0F766E', bg: '#DAF3EE', benefit: 'application for financial assistance' },
  { icon: 'card',      label: 'Physical ID',   color: '#1D4ED8', bg: '#DCE9FF', benefit: 'application for Physical ID' },
  { icon: 'film',      label: 'Movie Center',  color: '#7C3AED', bg: '#EBE0FE', benefit: 'appointment for movie center' },
  { icon: 'calendar',  label: 'Check-up',      color: '#0F766E', bg: '#DAF3EE', benefit: 'appointment for check-up' },
  { icon: 'warning',   label: 'Emergency',     color: '#B3432E', bg: '#FBE3DD', benefit: 'emergency alert' },
];

const STEPS = [
  { number: '1', title: 'Register',        text: 'Create your AUREA account with a family member or on your own.' },
  { number: '2', title: 'Add Your Details', text: 'Fill in your senior citizen information — it stays private and secure.' },
  { number: '3', title: 'Get Assistance',   text: 'Request services, track benefits, and reach the municipality anytime.' },
];

// "Tungkol sa Pateros" infographic — quick, senior-friendly facts
// about the municipality. Kept short (one idea per card) with a
// large icon so it reads well even at a glance.
const PATEROS_FACTS = [
  {
    icon: 'ribbon',
    color: C.gold,
    bg: C.goldSoft,
    title: 'Pinakamaliit na Bayan',
    text: 'Ang Pateros ang pinakamaliit na munisipalidad sa Metro Manila.',
  },
  {
    icon: 'restaurant',
    color: '#B3432E',
    bg: '#FBE3DD',
    title: 'Sentro ng Itik at Balut',
    text: 'Tanyag ang Pateros bilang "Itik Capital" — sikat sa balut at penoy.',
  },
  {
    icon: 'business',
    color: C.primary,
    bg: C.primarySoft,
    title: 'Munisipyo ng Pateros',
    text: 'Dito matatagpuan ang Munisipyo, simbahan, at OSCA para sa mga senior.',
  },
  {
    icon: 'people',
    color: '#1D4ED8',
    bg: '#DCE9FF',
    title: 'Malapit sa Puso',
    text: 'Ang AUREA ay ginawa para sa mga senior citizen ng Pateros — malapit, madali, at ligtas gamitin.',
  },
];

// "Paano Gamitin ang AUREA" infographic — a simple, numbered guide in
// Tagalog with large type sizes so it's easy to read for senior
// citizens. Shown to everyone, not just signed-out visitors, since
// it doubles as an in-app quick reference.
const HOW_TO_USE_STEPS = [
  {
    icon: 'log-in',
    title: '1. Mag-log In',
    text: 'Pindutin ang "Log in" sa itaas, o magpatulong sa kapamilya kung kailangan.',
  },
  {
    icon: 'search',
    title: '2. Hanapin ang Kailangan',
    text: 'Gamitin ang search bar o piliin sa "Available Benefits" ang serbisyong gusto mo, tulad ng gamot o Physical ID.',
  },
  {
    icon: 'create',
    title: '3. Punan ang Form',
    text: 'Isulat ang mga hinihinging impormasyon. Ligtas at pribado ang iyong mga detalye.',
  },
  {
    icon: 'checkmark-done',
    title: '4. Ipadala at Subaybayan',
    text: 'Pindutin ang "Submit" pagkatapos, at makikita mo ang katayuan ng iyong aplikasyon dito sa app.',
  },
];

export default function DashboardScreen() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const small = width < 360;

  // Width-driven breakpoints — the same component renders on a phone
  // and in a browser tab (Expo web), so layout reacts to available
  // space rather than to Platform.OS. isWeb only gates things a
  // touch device can't do (pointer cursor).
  const isWeb = Platform.OS === 'web';
  const isTablet = width >= 700;
  const isDesktop = width >= 1024;
  const webPointer = isWeb ? ({ cursor: 'pointer' } as any) : null;

  const tileSize = isTablet ? 64 : 56;
  const tileIcon = isTablet ? 27 : 24;
  const bannerWidth = isDesktop ? 340 : isTablet ? 320 : Math.min(280, width - sp(9));

  // Percentage-based columns (not fixed pixel tiles) so every row
  // lines up evenly no matter the exact container width — this was
  // the alignment issue with fixed 76px tiles on narrower phones.
  const gridColumns = isDesktop ? 6 : isTablet ? 4 : 3;
  const tileWidthPct = `${100 / gridColumns}%` as const;

  // Infographic cards get 2 columns on phone/tablet and 4 on desktop
  // so the "Tungkol sa Pateros" and "Paano Gamitin" grids scale with
  // the same width-driven logic as the rest of the screen.
  const infoColumns = isDesktop ? 4 : isTablet ? 2 : 1;
  const infoCardWidthPct = `${100 / infoColumns}%` as const;

  const [toast, setToast] = React.useState({
    visible: false, message: '', type: 'success' as 'success' | 'error',
  });

  const showToast = (message: string, type: 'success' | 'error' = 'success') =>
    setToast({ visible: true, message, type });

  const handleLogout = async () => {
    await logout();
    showToast('You have been logged out.');
  };

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });

  const announcements = (
    <View style={s.announceCard}>
      <Image source={{ uri: HERO_URI }} style={s.announceThumb} />
      <View style={{ flex: 1 }}>
        <Text style={s.announceTitle}>OSCA office hours this week</Text>
        <Text style={s.announceText}>
          Visit the Pateros Office for Senior Citizens Affairs for in-person
          assistance, or ask a family member to help you register.
        </Text>
      </View>
    </View>
  );

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
        style={[s.scroll, isWeb && s.scrollWeb]}
        contentContainerStyle={[s.container, { paddingTop: Math.max(insets.top, sp(2)) }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Full width on phones. On tablet/desktop the column widens
            with the viewport (not a fixed narrow cap), and past 1024px
            Services + Announcements switch to a side-by-side layout
            so the extra width gets used instead of sitting empty. */}
        <View
          style={[
            s.contentInner,
            { paddingHorizontal: small ? sp(4) : sp(5) },
            isTablet && s.contentInnerTablet,
            isDesktop && s.contentInnerDesktop,
          ]}
        >
          {/* ── HEADER ─────────────────────────────────────────── */}
          <View style={s.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.brandText}>AUREA</Text>
              {user ? (
                <Text style={s.greeting}>Mabuhay, {user.firstName || 'there'} 👋</Text>
              ) : (
                <Text style={s.greeting}>Welcome to AUREA</Text>
              )}
            </View>

            <View style={s.headerActions}>
              {user && (
                <TouchableOpacity
                  style={[s.iconBtn, webPointer]}
                  activeOpacity={0.8}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel="Notifications"
                >
                  <Ionicons name="notifications-outline" size={22} color={C.primaryDark} />
                </TouchableOpacity>
              )}
              {user ? (
                <TouchableOpacity
                  style={[s.avatarButton, webPointer]}
                  onPress={() => router.push('/profile')}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel="Open profile"
                >
                  <Ionicons name="person-circle" size={38} color={C.primaryDark} />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[s.loginPill, webPointer]}
                  onPress={() => router.push('/login')}
                  accessibilityRole="button"
                  accessibilityLabel="Log in"
                >
                  <Text style={s.loginPillText}>Log in</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          <View style={s.locationBar}>
            <Ionicons name="location-outline" size={16} color={C.inkSoft} />
            <Text style={s.locationText}>MUNICIPALITY OF PATEROS</Text>
            <Text style={s.dateText}>{today}</Text>
          </View>

          {/* ── SEARCH ───────────────────────────────────────── */}
          <TouchableOpacity
            style={[s.searchBar, webPointer]}
            activeOpacity={0.9}
            onPress={() => router.push('/benefit-selection')}
            accessibilityRole="button"
            accessibilityLabel="Search services"
          >
            <Ionicons name="search" size={20} color={C.inkFaint} />
            <Text style={s.searchText}>Search services, e.g. Physical ID</Text>
          </TouchableOpacity>

          {/* ── BANNER CAROUSEL ──────────────────────────────── */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.bannerScroll}
            style={s.bannerScrollWrap}
          >
            {BANNERS.map((b) => (
              <View key={b.key} style={[s.bannerCard, { width: bannerWidth }]}>
                {b.image ? (
                  <ImageBackground source={{ uri: b.image }} style={StyleSheet.absoluteFillObject} imageStyle={s.bannerImg}>
                    <LinearGradient
                      colors={['transparent', C.overlayBot]}
                      locations={[0.35, 1]}
                      style={StyleSheet.absoluteFillObject}
                    />
                  </ImageBackground>
                ) : (
                  <LinearGradient colors={[C.primaryMid, C.primaryDark]} style={StyleSheet.absoluteFillObject} />
                )}
                <View style={s.bannerContent}>
                  {b.icon && <Ionicons name={b.icon as any} size={18} color={C.gold} style={{ marginBottom: 6 }} />}
                  <Text style={s.bannerTag}>{b.tag}</Text>
                  <Text style={s.bannerTitle}>{b.title}</Text>
                </View>
              </View>
            ))}
          </ScrollView>

          {/* ── SERVICES + ANNOUNCEMENTS ────────────────────────
              Stacked on phone/tablet. Side by side past 1024px so
              the wide viewport is doing something with the space
              instead of framing a narrow centered card. */}
          <View style={[s.splitRow, isDesktop && s.splitRowDesktop]}>
            <View style={[s.splitMain, isDesktop && s.splitMainDesktop]}>
              <View style={s.sectionHead}>
                <Text style={s.sectionTitle}>Available Benefits</Text>
              </View>
              <View style={s.serviceGrid}>
                {BENEFIT_ITEMS.map((item) => (
                  <View key={item.label} style={{ width: tileWidthPct }}>
                    <TouchableOpacity
                      style={[s.serviceItem, webPointer]}
                      onPress={() =>
                        router.push({ pathname: '/benefit-application', params: { benefit: item.benefit } })
                      }
                      activeOpacity={0.8}
                      accessibilityRole="button"
                      accessibilityLabel={item.label}
                    >
                      <View
                        style={[
                          s.serviceCircle,
                          { width: tileSize, height: tileSize, borderRadius: tileSize / 2, backgroundColor: item.bg },
                        ]}
                      >
                        <Ionicons name={item.icon as any} size={tileIcon} color={item.color} />
                      </View>
                      <Text style={s.serviceLabel} numberOfLines={1}>{item.label}</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            </View>

            <View style={[s.splitSide, isDesktop && s.splitSideDesktop]}>
              <View style={s.sectionHead}>
                <Text style={s.sectionTitle}>Announcements</Text>
              </View>
              {announcements}
            </View>
          </View>

          {/* ── TUNGKOL SA PATEROS (infographic) ────────────────
              Tagalog, senior-friendly facts about the municipality.
              Larger type + high-contrast icon chips instead of dense
              paragraphs, so each card reads as one clear idea. */}
          <View style={s.sectionHead}>
            <Text style={s.sectionTitle}>Tungkol sa Pateros</Text>
            <Text style={s.sectionSubtitle}>Ilang bagay na dapat malaman tungkol sa ating bayan</Text>
          </View>
          <View style={s.infoGrid}>
            {PATEROS_FACTS.map((fact) => (
              <View key={fact.title} style={{ width: infoCardWidthPct, padding: sp(1.5) }}>
                <View style={s.infoCard}>
                  <View style={[s.infoIconWrap, { backgroundColor: fact.bg }]}>
                    <Ionicons name={fact.icon as any} size={28} color={fact.color} />
                  </View>
                  <Text style={s.infoCardTitle}>{fact.title}</Text>
                  <Text style={s.infoCardText}>{fact.text}</Text>
                </View>
              </View>
            ))}
          </View>

          {/* ── PAANO GAMITIN ANG AUREA (infographic) ───────────
              Always visible (not just signed-out) so it also works
              as an in-app quick reference for senior citizens. Big
              numbered icon steps in Tagalog, plain short sentences. */}
          <View style={s.sectionHead}>
            <Text style={s.sectionTitle}>Paano Gamitin ang AUREA</Text>
            <Text style={s.sectionSubtitle}>Sundin ang 4 na madaling hakbang</Text>
          </View>
          <View style={[s.howToWrap, isDesktop && s.howToWrapDesktop]}>
            {HOW_TO_USE_STEPS.map((st) => (
              <View key={st.title} style={[s.howToCard, isDesktop && s.howToCardDesktop]}>
                <View style={s.howToIconWrap}>
                  <Ionicons name={st.icon as any} size={26} color={C.white} />
                </View>
                <Text style={s.howToTitle}>{st.title}</Text>
                <Text style={s.howToText}>{st.text}</Text>
              </View>
            ))}
          </View>

          {/* ── ONBOARDING (signed-out only) ────────────────────
              Kept full-width even on desktop — it's a call to
              action, not sidebar filler. */}
          {!user && (
            <>
              <View style={s.sectionHead}>
                <Text style={s.sectionTitle}>How It Works</Text>
              </View>
              <View style={[s.stepsWrap, isDesktop && s.stepsWrapDesktop]}>
                {STEPS.map((st, i) => (
                  <View key={st.number} style={[s.stepRow, isDesktop && s.stepRowDesktop]}>
                    <View style={s.stepLeft}>
                      <View style={s.stepBadge}>
                        <Text style={s.stepBadgeTxt}>{st.number}</Text>
                      </View>
                      {!isDesktop && i < STEPS.length - 1 && <View style={s.stepConnector} />}
                    </View>
                    <View style={s.stepBody}>
                      <Text style={s.stepTitle}>{st.title}</Text>
                      <Text style={s.stepText}>{st.text}</Text>
                    </View>
                  </View>
                ))}
              </View>

              <TouchableOpacity
                style={[s.cta, webPointer]}
                onPress={() => router.push('/register')}
                activeOpacity={0.88}
                accessibilityRole="button"
                accessibilityLabel="Register for AUREA"
              >
                <LinearGradient
                  colors={[C.primaryMid, C.primaryDark]}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={s.ctaGrad}
                >
                  <Text style={s.ctaTxt}>Register for AUREA</Text>
                  <View style={s.ctaArrow}>
                    <Ionicons name="arrow-forward" size={18} color={C.primaryDark} />
                  </View>
                </LinearGradient>
              </TouchableOpacity>
            </>
          )}

          {user && (
            <TouchableOpacity
              style={[s.logoutRow, webPointer]}
              onPress={handleLogout}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Log out"
            >
              <Ionicons name="log-out-outline" size={18} color={C.inkFaint} />
              <Text style={s.logoutText}>Log out</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:      { flex: 1, backgroundColor: C.bg },
  scroll:    { flex: 1 },
  scrollWeb: { backgroundColor: C.bgWeb },
  container: { paddingBottom: sp(10) },

  // Grows with the viewport instead of capping at a fixed narrow
  // width — a phone gets full width, a tablet/desktop browser gets
  // a wider column, so there's no permanent blank gutter either side.
  contentInner: { width: '100%' },
  contentInnerTablet: {
    maxWidth: 860,
    alignSelf: 'center',
    width: '100%',
  },
  contentInnerDesktop: {
    maxWidth: 1160,
    paddingHorizontal: sp(8),
  },

  /* Header */
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: sp(4),
  },
  brandText: {
    fontFamily: 'FraunTitle',
    fontSize: 30,
    color: C.primary,
    letterSpacing: -1,
  },
  greeting: {
    fontFamily: 'InterBody',
    fontSize: 15,
    fontWeight: '600',
    color: C.inkSoft,
    marginTop: 2,
  },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: sp(2) },
  iconBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: C.card,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: C.line,
  },
  avatarButton: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: C.primarySoft,
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  loginPill: {
    backgroundColor: C.primary,
    borderRadius: 18,
    paddingVertical: 9,
    paddingHorizontal: 18,
  },
  loginPillText: { fontFamily: 'InterBody', fontWeight: '700', color: C.white, fontSize: 14 },

  /* Location bar */
  locationBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: C.card,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: sp(3),
    borderWidth: 1,
    borderColor: C.line,
    gap: 8,
  },
  locationText: {
    flex: 1,
    fontFamily: 'InterBody',
    fontWeight: '700',
    fontSize: 11.5,
    letterSpacing: 0.3,
    color: C.inkSoft,
  },
  dateText: { fontFamily: 'InterBody', fontWeight: '500', fontSize: 11.5, color: C.inkFaint },

  /* Search */
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: C.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.line,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: sp(5),
    ...shadow(C.ink, 0.04, 8, 2),
  },
  searchText: { fontFamily: 'InterBody', fontSize: 14.5, color: C.inkFaint },

  /* Banner carousel */
  bannerScrollWrap: { marginBottom: sp(6) },
  bannerScroll: { gap: sp(3), paddingRight: sp(3) },
  bannerCard: {
    width: 280,
    height: 150,
    borderRadius: 20,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    ...shadow(C.primaryDark, 0.2, 12, 4),
  },
  bannerImg: { borderRadius: 20 },
  bannerContent: { padding: sp(4) },
  bannerTag: { fontFamily: 'InterBody', fontWeight: '700', fontSize: 11, color: C.gold, marginBottom: 4 },
  bannerTitle: { fontFamily: 'FraunTitle', fontSize: 17, lineHeight: 21, color: C.white },

  /* Sections */
  sectionHead:     { marginBottom: sp(3) },
  sectionTitle:    { fontFamily: 'FraunTitle', fontSize: 19, color: C.ink },
  sectionSubtitle: {
    fontFamily: 'InterBody', fontSize: 13.5, color: C.inkSoft, marginTop: 3,
  },

  /* Tungkol sa Pateros — infographic grid */
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -sp(1.5),
    marginBottom: sp(6),
  },
  infoCard: {
    backgroundColor: C.card,
    borderRadius: 18,
    padding: sp(4),
    borderWidth: 1,
    borderColor: C.line,
    minHeight: 158,
    ...shadow(C.ink, 0.04, 8, 2),
  },
  infoIconWrap: {
    width: 48, height: 48, borderRadius: 24,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: sp(3),
  },
  infoCardTitle: {
    fontFamily: 'InterBody', fontWeight: '700', fontSize: 15.5,
    color: C.ink, marginBottom: 5, lineHeight: 20,
  },
  infoCardText: {
    fontFamily: 'InterBody', fontSize: 14, lineHeight: 20, color: C.inkSoft,
  },

  /* Services / Announcements split — column on phone & tablet,
     side-by-side on desktop so width is actually used. */
  splitRow: { flexDirection: 'column' },
  splitRowDesktop: { flexDirection: 'row', alignItems: 'flex-start', gap: sp(6) },
  splitMain: { width: '100%' },
  splitMainDesktop: { flex: 2 },
  splitSide: { width: '100%' },
  splitSideDesktop: { flex: 1, minWidth: 280 },

  /* Benefit grid — percentage-wide columns (not fixed pixel tiles),
     so columns line up evenly across any container width instead of
     leaving an uneven gap on the last column. */
  serviceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: sp(5),
    marginBottom: sp(6),
  },
  serviceItem: { alignItems: 'center', paddingHorizontal: sp(1.5) },
  serviceCircle: {
    width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 8,
  },
  serviceLabel: {
    fontFamily: 'InterBody', fontWeight: '600', fontSize: 11,
    color: C.ink, textAlign: 'center',
  },

  /* Announcements */
  announceCard: {
    flexDirection: 'row', gap: 12,
    backgroundColor: C.card, borderRadius: 18,
    padding: sp(3), marginBottom: sp(6),
    borderWidth: 1, borderColor: C.line,
    ...shadow(C.ink, 0.04, 8, 2),
  },
  announceThumb: { width: 76, height: 76, borderRadius: 12, backgroundColor: C.line },
  announceTitle: { fontFamily: 'InterBody', fontWeight: '700', fontSize: 14, color: C.ink, marginBottom: 4 },
  announceText: { fontFamily: 'InterBody', fontSize: 12.5, lineHeight: 18, color: C.inkSoft },

  /* Paano Gamitin ang AUREA — how-to-use infographic. Deep green
     cards with a bold icon badge and larger type than the rest of
     the screen, since this is aimed at senior citizens reading it
     as a standalone reference. */
  howToWrap: {
    marginBottom: sp(6),
    gap: sp(3),
  },
  howToWrapDesktop: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  howToCard: {
    backgroundColor: C.primaryDark,
    borderRadius: 20,
    padding: sp(4),
    ...shadow(C.primaryDark, 0.25, 10, 4),
  },
  howToCardDesktop: {
    width: '48.5%',
  },
  howToIconWrap: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: sp(3),
  },
  howToTitle: {
    fontFamily: 'InterBody', fontWeight: '700', fontSize: 16.5,
    color: C.white, marginBottom: 6,
  },
  howToText: {
    fontFamily: 'InterBody', fontSize: 14.5, lineHeight: 21,
    color: 'rgba(255,255,255,0.88)',
  },

  /* Steps (onboarding) — a horizontal row of 3 on desktop instead of
     a single narrow vertical list, since there's width to spare. */
  stepsWrap: {
    backgroundColor: C.card, borderRadius: 22,
    padding: sp(5), marginBottom: sp(6),
    borderWidth: 1, borderColor: C.line,
    ...shadow(C.ink, 0.05, 8, 2),
  },
  stepsWrapDesktop: { flexDirection: 'row', gap: sp(5) },
  stepRow: { flexDirection: 'row' },
  stepRowDesktop: { flex: 1, flexDirection: 'column' },
  stepLeft: { alignItems: 'center', width: 40 },
  stepBadge: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: C.primaryDark,
    alignItems: 'center', justifyContent: 'center',
  },
  stepBadgeTxt: { fontFamily: 'InterBody', fontWeight: '700', fontSize: 14, color: C.white },
  stepConnector: { width: 2, flex: 1, minHeight: 28, backgroundColor: C.line, marginVertical: 4 },
  stepBody: { flex: 1, paddingLeft: sp(3), paddingBottom: sp(5) },
  stepTitle: { fontFamily: 'InterBody', fontWeight: '600', fontSize: 15, color: C.ink, marginBottom: 3 },
  stepText:  { fontFamily: 'InterBody', fontSize: 13, lineHeight: 20, color: C.inkSoft },

  /* CTA */
  cta: { borderRadius: 20, overflow: 'hidden', marginBottom: sp(6), ...shadow(C.primaryDark, 0.3, 10, 4) },
  ctaGrad: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: sp(4) + 2, gap: sp(3),
  },
  ctaTxt:   { fontFamily: 'InterBody', fontWeight: '700', fontSize: 16, color: C.white },
  ctaArrow: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: C.white,
    alignItems: 'center', justifyContent: 'center',
  },

  /* Logout */
  logoutRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: sp(3),
  },
  logoutText: { fontFamily: 'InterBody', fontWeight: '600', fontSize: 13, color: C.inkFaint },
});