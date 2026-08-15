import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  StatusBar,
  TouchableOpacity,
  ImageBackground,
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
 * Redesigned for senior-citizen readability: larger type, higher-contrast
 * text, bigger tap targets, calmer motion, and clearer visual hierarchy —
 * while keeping the warm green/gold identity tied to Pateros.
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
  bgAlt:       '#EAF0E4',
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
  overlayTop:  'rgba(6,18,12,0.05)',
  overlayBot:  'rgba(4,14,9,0.92)',
};

const sp = (n: number) => n * 4;

const HERO_URI =
  'https://d1qvryx77qeesd.cloudfront.net/2024/09/DOT-NCR-Pateros-Town-Plaza-02.jpg';

const FEATURES = [
  { icon: 'document-text',    tone: 'primary', title: 'Unified Records',      text: 'Every senior citizen record kept safe, in one clear place.' },
  { icon: 'people',           tone: 'gold',    title: 'Easier Assistance',    text: 'Reach municipal services without the paperwork trip.'        },
  { icon: 'shield-checkmark', tone: 'primary', title: 'Secure by Design',     text: 'Your records are protected at every step, always.'           },
  { icon: 'phone-portrait',   tone: 'gold',    title: 'Built for Mobile',     text: 'Large text and simple taps — easy on any smartphone.'        },
];

const STEPS = [
  { number: '1', title: 'Register',        text: 'Create your AUREA account with a family member or on your own.' },
  { number: '2', title: 'Add Your Details', text: 'Fill in your senior citizen information — it stays private and secure.' },
  { number: '3', title: 'Get Assistance',   text: 'Request services, track benefits, and reach the municipality anytime.' },
];

export default function DashboardScreen() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const small = width < 360;
  const compact = width < 390;

  const [toast, setToast] = React.useState({
    visible: false, message: '', type: 'success' as 'success' | 'error',
  });

  const showToast = (message: string, type: 'success' | 'error' = 'success') =>
    setToast({ visible: true, message, type });

  const handleLogout = async () => {
    await logout();
    showToast('You have been logged out.');
  };

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
        contentContainerStyle={[
          s.container,
          {
            paddingHorizontal: small ? sp(4) : sp(5),
            paddingTop: Math.max(insets.top, sp(2)),
          },
        ]}
        showsVerticalScrollIndicator={false}
      >

        {/* ── HEADER ─────────────────────────────────────────── */}
        <View style={[s.header, compact && s.headerCompact]}>
          <View style={s.brand}>
            <LinearGradient colors={[C.primaryMid, C.primaryDark]} style={s.logoGrad}>
              <Ionicons name="shield-checkmark" size={24} color={C.white} />
            </LinearGradient>
            <View>
              <Text style={s.eyebrow}>MUNICIPALITY OF PATEROS</Text>
              <Text style={s.h1}>AUREA</Text>
            </View>
          </View>

          <View style={[s.headerActions, compact && s.headerActionsCompact]}>
            {user ? (
              <>
                <TouchableOpacity
                  style={s.avatarChip}
                  onPress={() => router.push('/profile')}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel="Open profile"
                >
                  <Ionicons name="person-circle" size={20} color={C.primaryDark} />
                  <Text style={s.avatarName} numberOfLines={1}>{user.firstName}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={s.logoutBtn}
                  onPress={handleLogout}
                  activeOpacity={0.8}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  accessibilityRole="button"
                  accessibilityLabel="Log out"
                >
                  <Ionicons name="log-out-outline" size={17} color={C.primaryDark} />
                  <Text style={s.logoutTxt}>Log out</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity
                  style={s.loginBtn}
                  onPress={() => router.push('/login')}
                  activeOpacity={0.75}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  accessibilityRole="button"
                >
                  <Text style={s.loginTxt}>Log in</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={s.registerBtn}
                  onPress={() => router.push('/register')}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                >
                  <Text style={s.registerTxt}>Register</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>

        {/* ── WELCOME BANNER (logged in only) ────────────────── */}
        {user && (
          <LinearGradient
            colors={[C.primaryDark, C.primaryMid]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={s.welcomeBanner}
          >
            <View style={{ flex: 1 }}>
              <Text style={s.welcomeLabel}>Welcome back</Text>
              <Text style={s.welcomeName}>{user.firstName} {user.lastName}</Text>
              <Text style={s.welcomeSub} numberOfLines={1}>{user.email}</Text>
            </View>
            <View style={s.welcomeActions}>
              <TouchableOpacity
                style={s.idBtn}
                onPress={() => router.push('/digital-id')}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="View Digital ID"
              >
                <Ionicons name="id-card-outline" size={18} color={C.primaryDark} />
                <Text style={s.idBtnTxt}>Digital ID</Text>
              </TouchableOpacity>
              <View style={s.welcomeIcon}>
                <Ionicons name="person" size={30} color={C.primaryDark} />
              </View>
            </View>
          </LinearGradient>
        )}

        {/* ── HERO ───────────────────────────────────────────── */}
        <View style={s.heroWrap}>
          <ImageBackground
            source={{ uri: HERO_URI }}
            style={s.hero}
            imageStyle={s.heroImg}
            resizeMode="cover"
          >
            <LinearGradient
              colors={[C.overlayTop, 'transparent', C.overlayBot]}
              locations={[0, 0.4, 1]}
              style={StyleSheet.absoluteFillObject}
            />
            <View style={s.heroContent}>
              <View style={s.heroPill}>
                <Ionicons name="location" size={13} color={C.primaryDark} />
                <Text style={s.heroPillTxt}>Pateros, Metro Manila</Text>
              </View>
              <Text style={[s.heroTitle, small && s.heroTitleSm]}>
                Advanced Unified Records{'\n'}and Elderly Assistance
              </Text>
              <Text style={s.heroSub}>
                Senior citizen services made easier to reach — and easier to trust.
              </Text>
            </View>
          </ImageBackground>

          <View style={s.seal}>
            <LinearGradient colors={[C.goldSoft, C.white]} style={s.sealGrad}>
              <Ionicons name="heart" size={24} color={C.gold} />
            </LinearGradient>
          </View>
        </View>

        {/* ── ABOUT CARD ─────────────────────────────────────── */}
        <View style={s.aboutCard}>
          <View style={s.aboutAccent}>
            <LinearGradient colors={[C.primaryMid, C.primaryDark]} style={s.aboutAccentGrad}>
              <Ionicons name="leaf" size={22} color={C.white} />
            </LinearGradient>
          </View>
          <View style={s.aboutRight}>
            <Text style={s.aboutEye}>THE MUNICIPALITY</Text>
            <Text style={s.aboutTitle}>About Pateros</Text>
            <Text style={s.aboutText}>
              The smallest municipality in Metro Manila by land area — but home
              to a close-knit community with a rich local history.
            </Text>
            <Text style={s.aboutText}>
              AUREA gives senior citizens one simple, digital place to reach
              the assistance they're entitled to.
            </Text>
          </View>
        </View>

        {/* ── WHAT IS AUREA ──────────────────────────────────── */}
        <LinearGradient
          colors={[C.primaryDark, C.primaryMid]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={s.aureaCard}
        >
          <View style={s.aureaIconWrap}>
            <Ionicons name="star" size={24} color={C.gold} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.aureaTitle}>What AUREA Stands For</Text>
            <Text style={s.aureaText}>
              <Text style={s.aureaBold}>Advanced Unified Records and Elderly Assistance. </Text>
              A single platform making senior citizen services more accessible,
              organized, and dignified.
            </Text>
          </View>
        </LinearGradient>

        {/* ── FEATURES GRID ──────────────────────────────────── */}
        <View style={s.sectionHead}>
          <Text style={s.sectionEye}>BUILT FOR</Text>
          <Text style={s.sectionTitle}>Senior Citizens</Text>
        </View>

        <View style={s.featGrid}>
          {FEATURES.map((f) => (
            <View key={f.title} style={s.featCard}>
              <View style={[
                s.featIconWrap,
                { backgroundColor: f.tone === 'gold' ? C.goldSoft : C.primarySoft },
              ]}>
                <Ionicons
                  name={f.icon as any}
                  size={22}
                  color={f.tone === 'gold' ? C.goldDark : C.primaryDark}
                />
              </View>
              <Text style={s.featTitle}>{f.title}</Text>
              <Text style={s.featText}>{f.text}</Text>
            </View>
          ))}
        </View>

        {/* ── HOW IT WORKS ───────────────────────────────────── */}
        {!user && (
          <>
            <View style={s.sectionHead}>
              <Text style={s.sectionEye}>GETTING STARTED</Text>
              <Text style={s.sectionTitle}>How It Works</Text>
            </View>

            <View style={s.stepsWrap}>
              {STEPS.map((st, i) => (
                <View key={st.number} style={s.stepRow}>
                  <View style={s.stepLeft}>
                    <View style={s.stepBadge}>
                      <Text style={s.stepBadgeTxt}>{st.number}</Text>
                    </View>
                    {i < STEPS.length - 1 && <View style={s.stepConnector} />}
                  </View>
                  <View style={s.stepBody}>
                    <Text style={s.stepTitle}>{st.title}</Text>
                    <Text style={s.stepText}>{st.text}</Text>
                  </View>
                </View>
              ))}
            </View>
          </>
        )}

        {/* ── HELP / ASSURANCE STRIP ──────────────────────────── */}
        <View style={s.helpCard}>
          <View style={s.helpIconWrap}>
            <Ionicons name="call" size={20} color={C.primaryDark} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.helpTitle}>Need help using AUREA?</Text>
            <Text style={s.helpText}>
              Visit the Pateros Office for Senior Citizens Affairs (OSCA), or ask
              a family member to help you register.
            </Text>
          </View>
        </View>

        {/* ── CTA ────────────────────────────────────────────── */}
        {!user && (
          <TouchableOpacity
            style={s.cta}
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
        )}

        {/* ── FOOTER ─────────────────────────────────────────── */}
        <View style={s.footer}>
          <View style={s.footerLine} />
          <View style={s.footerLogoRow}>
            <LinearGradient colors={[C.primaryMid, C.primaryDark]} style={s.footerLogo}>
              <Ionicons name="shield-checkmark" size={15} color={C.white} />
            </LinearGradient>
            <Text style={s.footerTitle}>AUREA</Text>
          </View>
          <Text style={s.footerSub}>Advanced Unified Records and Elderly Assistance</Text>
          <Text style={s.footerLoc}>Municipality of Pateros</Text>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:      { flex: 1, backgroundColor: C.bg },
  scroll:    { flex: 1 },
  container: { paddingBottom: sp(10) },

  /* Header */
  header: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: sp(1), marginBottom: sp(5),
  },
  headerCompact: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: sp(3),
  },
  brand:    { flexDirection: 'row', alignItems: 'center', flex: 1 },
  logoGrad: {
    width: 48, height: 48, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
    ...shadow(C.primaryDark, 0.25, 8, 3),
  },
  eyebrow: {
    fontFamily: 'InterBody',
    fontWeight: '700',
    fontSize: 10, letterSpacing: 1.3, color: C.goldDark, marginBottom: 2,
  },
  h1: { fontFamily: 'FraunTitle', fontSize: 26, color: C.ink, lineHeight: 30 },

  headerActions: { flexDirection: 'row', alignItems: 'center', gap: sp(2), marginLeft: sp(2) },
  headerActionsCompact: { justifyContent: 'flex-end', marginLeft: 0 },

  avatarChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: C.primarySoft, borderRadius: 20,
    paddingVertical: 6, paddingHorizontal: 11,
  },
  avatarName: { fontFamily: 'InterBody', fontWeight: '600', fontSize: 13, color: C.primaryDark, maxWidth: 76 },

  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderWidth: 1.5, borderColor: C.primaryDark, borderRadius: 10,
    paddingVertical: 8, paddingHorizontal: 12,
  },
  logoutTxt: { fontFamily: 'InterBody', fontWeight: '600', fontSize: 13, color: C.primaryDark },

  loginBtn: {
    borderWidth: 1.5, borderColor: C.primaryDark, borderRadius: 10,
    paddingVertical: 9, paddingHorizontal: 14,
  },
  loginTxt: { fontFamily: 'InterBody', fontWeight: '600', fontSize: 14, color: C.primaryDark },

  registerBtn: {
    backgroundColor: C.primaryDark, borderRadius: 10,
    paddingVertical: 9, paddingHorizontal: 14,
    ...shadow(C.primaryDark, 0.3, 8, 3),
  },
  registerTxt: { fontFamily: 'InterBody', fontWeight: '700', fontSize: 14, color: C.white },

  /* Welcome banner */
  welcomeBanner: {
    borderRadius: 22, padding: sp(5),
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: sp(5),
    ...shadow(C.primaryDark, 0.3, 12, 4),
  },
  welcomeLabel: { fontFamily: 'InterBody', fontSize: 12, color: 'rgba(255,255,255,0.75)', marginBottom: 3 },
  welcomeName:  { fontFamily: 'FraunTitle', fontSize: 21, color: C.white, lineHeight: 26 },
  welcomeSub:   { fontFamily: 'InterBody', fontSize: 12.5, color: 'rgba(255,255,255,0.7)', marginTop: 4 },
  welcomeActions: {
    alignItems: 'center',
    gap: sp(2),
  },
  idBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: C.white,
    borderRadius: 10,
    paddingVertical: 7,
    paddingHorizontal: 11,
    ...shadow(C.primaryDark, 0.2, 6, 2),
  },
  idBtnTxt: { fontFamily: 'InterBody', fontWeight: '700', fontSize: 12, color: C.primaryDark },
  welcomeIcon:  {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center', justifyContent: 'center',
  },

  /* Hero */
  heroWrap:  { marginBottom: sp(10), position: 'relative' },
  hero: {
    minHeight: 320, borderRadius: 26, overflow: 'hidden',
    justifyContent: 'flex-end',
    ...shadow(C.primaryDark, 0.22, 16, 6),
  },
  heroImg:     { borderRadius: 26 },
  heroContent: { padding: sp(5), paddingBottom: sp(7) },
  heroPill: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start',
    backgroundColor: C.white, borderRadius: 20,
    paddingHorizontal: 11, paddingVertical: 5, marginBottom: sp(3), gap: 5,
  },
  heroPillTxt:  { fontFamily: 'InterBody', fontWeight: '700', fontSize: 11, color: C.primaryDark },
  heroTitle:    { fontFamily: 'FraunTitle', fontSize: 26, lineHeight: 33, color: C.white, marginBottom: sp(2) },
  heroTitleSm:  { fontSize: 22, lineHeight: 28 },
  heroSub:      { fontFamily: 'InterBody', fontSize: 14, lineHeight: 22, color: 'rgba(255,255,255,0.9)' },

  seal: { position: 'absolute', right: sp(5), bottom: -sp(6) },
  sealGrad: {
    width: 60, height: 60, borderRadius: 30,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: C.goldSoft,
    ...shadow(C.gold, 0.25, 10, 3),
  },

  /* About */
  aboutCard: {
    backgroundColor: C.card, borderRadius: 22,
    padding: sp(5), marginBottom: sp(6),
    flexDirection: 'row', alignItems: 'flex-start', gap: sp(3),
    ...shadow(C.ink, 0.06, 10, 2),
  },
  aboutAccent: { paddingTop: 2 },
  aboutAccentGrad: {
    width: 44, height: 44, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center',
    ...shadow(C.primaryDark, 0.2, 6, 2),
  },
  aboutRight: { flex: 1 },
  aboutEye:   { fontFamily: 'InterBody', fontWeight: '700', fontSize: 10, letterSpacing: 1.2, color: C.goldDark, marginBottom: 4 },
  aboutTitle: { fontFamily: 'FraunTitle', fontSize: 19, color: C.ink, marginBottom: sp(2) },
  aboutText:  { fontFamily: 'InterBody', fontSize: 14, lineHeight: 22, color: C.inkSoft, marginBottom: sp(2) },

  /* AUREA card */
  aureaCard: {
    borderRadius: 22, padding: sp(5),
    flexDirection: 'row', alignItems: 'flex-start', gap: sp(3),
    marginBottom: sp(6),
    ...shadow(C.primaryDark, 0.28, 12, 4),
  },
  aureaIconWrap: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  aureaTitle: { fontFamily: 'FraunTitle', fontSize: 16.5, color: C.white, marginBottom: 6 },
  aureaText:  { fontFamily: 'InterBody', fontSize: 13.5, lineHeight: 21, color: 'rgba(255,255,255,0.86)' },
  aureaBold:  { fontFamily: 'InterBody', fontWeight: '700', color: C.white },

  /* Features grid */
  sectionHead:  { marginBottom: sp(4) },
  sectionEye:   { fontFamily: 'InterBody', fontWeight: '700', fontSize: 10, letterSpacing: 1.2, color: C.goldDark, marginBottom: 4 },
  sectionTitle: { fontFamily: 'FraunTitle', fontSize: 21, color: C.ink },

  featGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    gap: sp(3), marginBottom: sp(6),
  },
  featCard: {
    backgroundColor: C.card, borderRadius: 20,
    padding: sp(4),
    width: '47.5%',
    borderWidth: 1, borderColor: C.line,
    ...shadow(C.ink, 0.05, 8, 2),
  },
  featIconWrap: {
    width: 44, height: 44, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center', marginBottom: sp(3),
  },
  featTitle: { fontFamily: 'InterBody', fontWeight: '700', fontSize: 14.5, color: C.ink, marginBottom: 5 },
  featText:  { fontFamily: 'InterBody', fontSize: 12.5, lineHeight: 19, color: C.inkSoft },

  /* Steps */
  stepsWrap: {
    backgroundColor: C.card, borderRadius: 22,
    padding: sp(5), marginBottom: sp(6),
    borderWidth: 1, borderColor: C.line,
    ...shadow(C.ink, 0.05, 8, 2),
  },
  stepRow: { flexDirection: 'row' },
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

  /* Help strip */
  helpCard: {
    flexDirection: 'row', alignItems: 'center', gap: sp(3),
    backgroundColor: C.goldSoft, borderRadius: 18,
    padding: sp(4), marginBottom: sp(6),
    borderWidth: 1, borderColor: '#EEDDB8',
  },
  helpIconWrap: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: C.white,
    alignItems: 'center', justifyContent: 'center',
  },
  helpTitle: { fontFamily: 'InterBody', fontWeight: '600', fontSize: 13.5, color: C.ink, marginBottom: 2 },
  helpText:  { fontFamily: 'InterBody', fontSize: 12.5, lineHeight: 19, color: C.inkSoft },

  /* CTA */
  cta: { borderRadius: 20, overflow: 'hidden', marginBottom: sp(7), ...shadow(C.primaryDark, 0.3, 10, 4) },
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

  /* Footer */
  footer:       { alignItems: 'center', paddingBottom: sp(2) },
  footerLine:   { width: 40, height: 3, borderRadius: 2, backgroundColor: C.gold, marginBottom: sp(4) },
  footerLogoRow:{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 5 },
  footerLogo:   { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  footerTitle:  { fontFamily: 'FraunTitle', fontSize: 18, color: C.ink },
  footerSub:    { fontFamily: 'InterBody', fontSize: 11.5, color: C.inkFaint, textAlign: 'center' },
  footerLoc:    { fontFamily: 'InterBody', fontWeight: '600', fontSize: 11.5, color: C.goldDark, marginTop: 4 },
});