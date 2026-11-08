import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  StatusBar,
  TouchableOpacity,
  Pressable,
  TextInput,
  Image,
  useWindowDimensions,
  Platform,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import Toast from '../../components/Toast';
import { BENEFIT_ITEMS } from '../../data/benefits';
import { fetchUnreadCount } from '../../services/chatApi';

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
  goldLight:   '#F2C879', // lighter gold for text over photos (better contrast)
  goldDark:    '#7E5417',
  goldSoft:    '#FBF0DA',
  white:       '#FFFFFF',
  line:        '#E4EAE0',
  lineSoft:    '#EEF3EB',
  danger:      '#B3432E',
  ai:          '#1E60FF',
  aiSoft:      '#EAF2FF',
  overlayBot:  'rgba(4,14,9,0.85)',
};

const sp = (n: number) => n * 4;

const HERO_IMAGE = require('../../assets/images/pateros_hero.jpg');
const PATEROS_LOGO = require('../../assets/images/pateros-logo.png');

const BANNERS = [
  {
    key: 'pateros',
    image: HERO_IMAGE,
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

const STEPS = [
  { number: '1', title: 'Register',         text: 'Create your AUREA account with a family member or on your own.' },
  { number: '2', title: 'Add your details', text: 'Fill in your senior citizen information — it stays private and secure.' },
  { number: '3', title: 'Get assistance',   text: 'Request services, track benefits, and reach the municipality anytime.' },
];

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

const HOW_TO_USE_STEPS = [
  {
    icon: 'log-in',
    title: 'Mag-log In',
    text: 'Pindutin ang "Log in" sa itaas, o magpatulong sa kapamilya kung kailangan.',
  },
  {
    icon: 'search',
    title: 'Hanapin ang Kailangan',
    text: 'Gamitin ang search bar o piliin sa "Available Benefits" ang serbisyong gusto mo, tulad ng Birthday Benefits o Physical ID.',
  },
  {
    icon: 'create',
    title: 'Punan ang Form',
    text: 'Isulat ang mga hinihinging impormasyon. Ligtas at pribado ang iyong mga detalye.',
  },
  {
    icon: 'checkmark-done',
    title: 'Ipadala at Subaybayan',
    text: 'Pindutin ang "Submit" pagkatapos, at makikita mo ang katayuan ng iyong aplikasyon dito sa app.',
  },
];

function SectionHeader({
  title, subtitle, actionLabel, onAction,
}: { title: string; subtitle?: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <View style={s.sectionHead}>
      <View style={{ flex: 1 }}>
        <Text style={s.sectionTitle}>{title}</Text>
        {subtitle ? <Text style={s.sectionSubtitle}>{subtitle}</Text> : null}
      </View>
      {actionLabel && onAction ? (
        <TouchableOpacity
          onPress={onAction}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          style={s.sectionAction}
        >
          <Text style={s.sectionActionText}>{actionLabel}</Text>
          <Ionicons name="chevron-forward" size={15} color={C.primary} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export default function DashboardScreen() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const { width } = useWindowDimensions();
  const small = width < 360;

  // Width-driven breakpoints — the same component renders on a phone
  // and in a browser tab (Expo web), so layout reacts to available
  // space rather than to Platform.OS. isWeb only gates things a
  // touch device can't do (pointer cursor).
  const isWeb = Platform.OS === 'web';
  const isTablet = width >= 700;
  const isDesktop = width >= 1024;
  const webPointer = isWeb ? ({ cursor: 'pointer' } as any) : null;

  const tileIcon = isTablet ? 28 : 26;
  const tileCircle = isTablet ? 58 : 52;

  // Horizontal page padding — must match the contentInner padding
  // below so the banner carousel can bleed to the screen edge.
  const pagePad = isDesktop ? sp(8) : small ? sp(4) : sp(5);

  // Banner size: height scales with width so the photo keeps its
  // proportions instead of being cropped by a fixed height.
  const bannerWidth = isDesktop ? 600 : isTablet ? Math.min(600, width - pagePad * 2) : width - pagePad * 2;
  const bannerHeight = Math.round(bannerWidth * 0.52);
  const bannerStep = bannerWidth + sp(3);

  // Percentage-based columns so every row lines up evenly.
  const gridColumns = isDesktop ? 6 : isTablet ? 4 : 3;
  const tileWidthPct = `${100 / gridColumns}%` as const;

  const infoColumns = isDesktop ? 4 : isTablet ? 2 : 1;
  const infoCardWidthPct = `${100 / infoColumns}%` as const;

  const howToColumns = isTablet ? 2 : 1;
  const howToWidthPct = `${100 / howToColumns}%` as const;

  const [toast, setToast] = React.useState({
    visible: false, message: '', type: 'success' as 'success' | 'error',
  });
  const [searchQuery, setSearchQuery] = React.useState('');
  const [searchFocused, setSearchFocused] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [bannerIndex, setBannerIndex] = React.useState(0);
  const [unreadChatCount, setUnreadChatCount] = React.useState(0);
  const displayedUnreadChatCount = user?.id ? unreadChatCount : 0;

  React.useEffect(() => {
    if (!user?.id) {
      return;
    }

    let active = true;

    const checkUnread = async () => {
      const count = await fetchUnreadCount(user.id, user.role || 'user');
      if (active) {
        setUnreadChatCount(count);
      }
    };

    void checkUnread();

    const interval = setInterval(checkUnread, 4000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [user?.id, user?.role]);

  const filteredBenefits = React.useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return [];
    }

    return BENEFIT_ITEMS.filter((item) => {
      const label = item.label.toLowerCase();
      const applicationText = item.applicationValue.toLowerCase();
      return label.includes(query) || applicationText.includes(query);
    });
  }, [searchQuery]);

  const openBenefit = (benefitId: string) => {
    if (benefitId === 'movie-center') {
      router.push('/movie-book');
      return;
    }

    router.push({ pathname: '/benefit-application', params: { benefitId } });
  };

  const showToast = (message: string, type: 'success' | 'error' = 'success') =>
    setToast({ visible: true, message, type });

  const handleSearchSubmit = () => {
    if (!user) {
      showToast('Please log in to search and apply for benefits.', 'error');
      router.push('/login');
      return;
    }

    const trimmedQuery = searchQuery.trim();

    if (!trimmedQuery) {
      router.push('/benefit-selection');
      return;
    }

    const normalizedQuery = trimmedQuery.toLowerCase();
    const exactMatch = BENEFIT_ITEMS.find((item) =>
      item.label.toLowerCase() === normalizedQuery || item.applicationValue.toLowerCase() === normalizedQuery,
    );

    if (exactMatch) {
      openBenefit(exactMatch.id);
      return;
    }

    router.push({ pathname: '/benefit-selection', params: { query: trimmedQuery } });
  };

  const handleLogout = async () => {
    setMenuOpen(false);
    await logout();
    showToast('You have been logged out.');
  };

  const handleNotifications = () => {
    setMenuOpen(false);
    showToast('No new notifications right now.');
  };

  const handleBannerScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(e.nativeEvent.contentOffset.x / bannerStep);
    setBannerIndex(Math.max(0, Math.min(BANNERS.length - 1, index)));
  };

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });

  const avatarSource = user?.avatarUrl || user?.profilePhoto || '';

  const announcements = (
    <View style={s.announceCard}>
      <View style={s.announceThumbWrap}>
        <Image source={PATEROS_LOGO} style={s.announceThumb} resizeMode="contain" />
      </View>
      <View style={{ flex: 1 }}>
        <View style={s.announceTag}>
          <Ionicons name="megaphone" size={11} color={C.goldDark} />
          <Text style={s.announceTagText}>Announcement</Text>
        </View>
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
      <StatusBar barStyle="dark-content" />
      <Toast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        onHide={() => setToast(t => ({ ...t, visible: false }))}
      />

      <ScrollView
        style={[s.scroll, isWeb && s.scrollWeb]}
        contentContainerStyle={[s.container, { paddingTop: sp(2) }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        onScrollBeginDrag={() => setMenuOpen(false)}
      >
        <View
          style={[
            s.contentInner,
            { paddingHorizontal: pagePad },
            isTablet && s.contentInnerTablet,
            isDesktop && s.contentInnerDesktop,
          ]}
        >
          {/* ── Header ── */}
          <View style={s.headerRow}>
            <View style={{ flex: 1 }}>
              <View style={s.brandRow}>
                <Image
                  source={require('../../assets/images/aurea-pateros-logo.png')}
                  style={s.brandLogo}
                  resizeMode="contain"
                  accessibilityLabel="AUREA Municipality of Pateros logo"
                />
                <Text style={s.brandText}>AUREA</Text>
              </View>
            </View>

            <View style={s.headerActionsWrap}>
              <View style={s.headerActions}>
                {user && (
                  <TouchableOpacity
                    style={[s.iconBtn, webPointer]}
                    onPress={() => {
                      setMenuOpen(false);
                      router.push('/chat');
                    }}
                    activeOpacity={0.8}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityRole="button"
                    accessibilityLabel="Open OSCA support chat"
                  >
                    <Ionicons name="chatbubbles-outline" size={22} color={C.primaryDark} />
                    {displayedUnreadChatCount > 0 && (
                      <View style={s.chatBadge}>
                        <Text style={s.chatBadgeText}>
                          {displayedUnreadChatCount > 9 ? '9+' : displayedUnreadChatCount}
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>
                )}

                {user && (
                  <TouchableOpacity
                    style={[s.iconBtn, webPointer]}
                    onPress={() => setMenuOpen((prev) => !prev)}
                    activeOpacity={0.8}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityRole="button"
                    accessibilityLabel="Open menu"
                  >
                    <Ionicons name={menuOpen ? 'close' : 'menu'} size={23} color={C.primaryDark} />
                  </TouchableOpacity>
                )}

                {user ? (
                  <TouchableOpacity
                    style={[s.avatarButton, webPointer]}
                    onPress={() => {
                      setMenuOpen(false);
                      router.push('/profile');
                    }}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel="Open profile"
                  >
                    {avatarSource ? (
                      <Image
                        key={avatarSource}
                        source={{ uri: avatarSource }}
                        style={s.avatarImg}
                      />
                    ) : (
                      <Ionicons name="person-circle" size={42} color={C.primaryDark} />
                    )}
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

              {user && menuOpen && (
                <View style={s.headerMenu}>
                  <TouchableOpacity
                    style={[s.headerMenuItem, webPointer]}
                    onPress={handleNotifications}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel="Open notifications"
                  >
                    <Ionicons name="notifications-outline" size={18} color={C.ink} />
                    <Text style={s.headerMenuText}>Notifications</Text>
                  </TouchableOpacity>
                  <View style={s.headerMenuDivider} />
                  <TouchableOpacity
                    style={[s.headerMenuItem, webPointer]}
                    onPress={() => {
                      setMenuOpen(false);
                      router.push('/settings');
                    }}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel="Open settings"
                  >
                    <Ionicons name="settings-outline" size={18} color={C.ink} />
                    <Text style={s.headerMenuText}>Settings</Text>
                  </TouchableOpacity>
                  <View style={s.headerMenuDivider} />
                  <TouchableOpacity
                    style={[s.headerMenuItem, webPointer]}
                    onPress={handleLogout}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel="Log out"
                  >
                    <Ionicons name="log-out-outline" size={18} color={C.danger} />
                    <Text style={[s.headerMenuText, s.headerMenuTextDanger]}>Log out</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>

          {user && menuOpen && (
            <Pressable
              style={s.menuBackdrop}
              onPress={() => setMenuOpen(false)}
              accessibilityRole="button"
              accessibilityLabel="Close menu"
            />
          )}

          {/* ── Greeting ── */}
          <View style={s.greetingBlock}>
            <Text style={s.greetingTitle}>
              {user ? `Mabuhay, ${user.firstName || 'there'}` : 'Welcome to AUREA'}
            </Text>
            <View style={s.greetingMeta}>
              <Ionicons name="location" size={14} color={C.primaryMid} />
              <Text style={s.greetingMetaText}>Municipality of Pateros</Text>
              <View style={s.metaDot} />
              <Text style={s.greetingMetaText}>{today}</Text>
            </View>
          </View>

          {/* ── Search ── */}
          <View style={s.searchWrap}>
            <View style={[s.searchBar, searchFocused && s.searchBarFocused]}>
              <Ionicons name="search" size={22} color={searchFocused ? C.primary : C.inkFaint} />
              <TextInput
                style={s.searchInput}
                value={searchQuery}
                onChangeText={setSearchQuery}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                placeholder="Search services, e.g. Physical ID"
                placeholderTextColor={C.inkFaint}
                returnKeyType="search"
                onSubmitEditing={handleSearchSubmit}
                accessibilityLabel="Search services"
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity
                  onPress={() => setSearchQuery('')}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  accessibilityRole="button"
                  accessibilityLabel="Clear search"
                >
                  <Ionicons name="close-circle" size={20} color={C.inkFaint} />
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[s.searchGoBtn, webPointer]}
                activeOpacity={0.85}
                onPress={handleSearchSubmit}
                accessibilityRole="button"
                accessibilityLabel="Run search"
              >
                <Ionicons name="arrow-forward" size={18} color={C.white} />
              </TouchableOpacity>
            </View>

            {user && filteredBenefits.length > 0 && (
              <View style={s.searchResults}>
                {filteredBenefits.slice(0, 4).map((item, i, arr) => (
                  <TouchableOpacity
                    key={item.id}
                    style={[s.searchResultItem, i === arr.length - 1 && { borderBottomWidth: 0 }, webPointer]}
                    onPress={() => {
                      setSearchQuery(item.label);
                      openBenefit(item.id);
                    }}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${item.label}`}
                  >
                    <View style={[s.searchResultIcon, { backgroundColor: item.bg }]}>
                      <Ionicons name={item.icon as any} size={17} color={item.color} />
                    </View>
                    <Text style={s.searchResultText}>{item.label}</Text>
                    <Ionicons name="chevron-forward" size={16} color={C.inkFaint} />
                  </TouchableOpacity>
                ))}
              </View>
            )}


          </View>

          {/* ── Welcome card (logged out) ── */}
          {!user && (
            <View style={s.welcomeCard}>
              <View style={{ flex: 1 }}>
                <Text style={s.welcomeTitle}>New to AUREA?</Text>
                <Text style={s.welcomeText}>
                  Create an account to apply for senior citizen benefits and track your requests.
                </Text>
              </View>
              <TouchableOpacity
                style={[s.welcomeBtn, webPointer]}
                onPress={() => router.push('/register')}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Create an account"
              >
                <Text style={s.welcomeBtnText}>Register</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ── Banner carousel ── */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={[s.bannerScroll, { paddingHorizontal: pagePad, alignItems: 'center' }]}
            style={[s.bannerScrollWrap, { marginHorizontal: -pagePad }]}
            snapToInterval={bannerStep}
            decelerationRate="fast"
            onMomentumScrollEnd={handleBannerScroll}
          >
            {BANNERS.map((b) => (
              <View key={b.key} style={[s.bannerCard, { width: bannerWidth, height: bannerHeight }]}>
                {b.image ? (
                  <>
                    <Image
                      source={b.image}
                      style={[StyleSheet.absoluteFill, s.bannerImg]}
                      resizeMode="cover"
                    />
                    <LinearGradient
                      colors={['rgba(4,14,9,0)', 'rgba(4,14,9,0.35)', C.overlayBot]}
                      locations={[0.2, 0.55, 1]}
                      style={StyleSheet.absoluteFill}
                    />
                  </>
                ) : (
                  <LinearGradient colors={[C.primaryMid, C.primaryDark]} style={StyleSheet.absoluteFill} />
                )}
                <View style={s.bannerContent}>
                  {b.icon && <Ionicons name={b.icon as any} size={20} color={C.goldLight} style={{ marginBottom: 6 }} />}
                  <Text style={s.bannerTag}>{b.tag}</Text>
                  <Text style={s.bannerTitle}>{b.title}</Text>
                </View>
              </View>
            ))}
          </ScrollView>
          <View style={s.dots}>
            {BANNERS.map((b, i) => (
              <View key={b.key} style={[s.dot, i === bannerIndex && s.dotActive]} />
            ))}
          </View>

          {/* ── Benefits + announcements ── */}
          <View style={[s.splitRow, isDesktop && s.splitRowDesktop]}>
            {user && (
              <View style={[s.splitMain, isDesktop && s.splitMainDesktop]}>
                <SectionHeader
                  title="Available Benefits"
                  actionLabel="See all"
                  onAction={() => router.push('/benefit-selection')}
                />

                {/* AI assistant spotlight */}
                <TouchableOpacity
                  style={[s.aiCard, webPointer]}
                  onPress={() => router.push('/assistant')}
                  activeOpacity={0.88}
                  accessibilityRole="button"
                  accessibilityLabel="Lolo Aurea AI Assistant"
                >
                  <LinearGradient
                    colors={[C.aiSoft, '#F8FAFF']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={s.aiCardGrad}
                  >
                    <View style={s.aiIconWrap}>
                      <MaterialCommunityIcons name="creation" size={28} color={C.white} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.aiTitle}>Lolo Aurea AI</Text>
                      <Text style={s.aiDesc}>Ask about benefits and services. Get help in simple words.</Text>
                    </View>
                    <View style={s.aiArrow}>
                      <Ionicons name="arrow-forward" size={18} color={C.white} />
                    </View>
                  </LinearGradient>
                </TouchableOpacity>

                <View style={s.serviceGrid}>
                  {BENEFIT_ITEMS.map((item) => (
                    <View key={item.label} style={{ width: tileWidthPct, padding: sp(1.5) }}>
                      <TouchableOpacity
                        style={[s.serviceItem, webPointer]}
                        onPress={() => openBenefit(item.id)}
                        activeOpacity={0.8}
                        accessibilityRole="button"
                        accessibilityLabel={item.label}
                      >
                        <View
                          style={[
                            s.serviceCircle,
                            { width: tileCircle, height: tileCircle, borderRadius: tileCircle / 2, backgroundColor: item.bg },
                          ]}
                        >
                          <Ionicons name={item.icon as any} size={tileIcon} color={item.color} />
                        </View>
                        <Text style={s.serviceLabel} numberOfLines={2}>{item.label}</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              </View>
            )}

            <View style={[s.splitSide, isDesktop && (user ? s.splitSideDesktop : s.splitSideDesktopFull)]}>
              <SectionHeader title="Announcements" />
              {announcements}
            </View>
          </View>

          {/* ── About Pateros ── */}
          <SectionHeader
            title="Tungkol sa Pateros"
            subtitle="Ilang bagay na dapat malaman tungkol sa ating bayan"
          />
          <View style={s.infoGrid}>
            {PATEROS_FACTS.map((fact) => (
              <View key={fact.title} style={{ width: infoCardWidthPct, padding: sp(1.5) }}>
                <View style={s.infoCard}>
                  <View style={[s.infoIconWrap, { backgroundColor: fact.bg }]}>
                    <Ionicons name={fact.icon as any} size={26} color={fact.color} />
                  </View>
                  <Text style={s.infoCardTitle}>{fact.title}</Text>
                  <Text style={s.infoCardText}>{fact.text}</Text>
                </View>
              </View>
            ))}
          </View>

          {/* ── How to use ── */}
          <SectionHeader title="Paano Gamitin ang AUREA" subtitle="Sundin ang 4 na madaling hakbang" />
          <View style={s.howToWrap}>
            {HOW_TO_USE_STEPS.map((st, i) => (
              <View key={st.title} style={{ width: howToWidthPct, padding: sp(1.5) }}>
                <View style={s.howToCard}>
                  <View style={s.howToIconWrap}>
                    <Ionicons name={st.icon as any} size={24} color={C.white} />
                    <View style={s.howToNumber}>
                      <Text style={s.howToNumberText}>{i + 1}</Text>
                    </View>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.howToTitle}>{st.title}</Text>
                    <Text style={s.howToText}>{st.text}</Text>
                  </View>
                </View>
              </View>
            ))}
          </View>

          {/* ── Logged out: How it works + CTA ── */}
          {!user && (
            <>
              <SectionHeader title="How It Works" />
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
  contentInner: { width: '100%', position: 'relative' },
  contentInnerTablet: {
    maxWidth: 860,
    alignSelf: 'center',
    width: '100%',
  },
  contentInnerDesktop: {
    maxWidth: 1160,
    paddingHorizontal: sp(8),
  },

  // Header
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: sp(3),
    zIndex: 40,
  },
  menuBackdrop: {
    ...StyleSheet.absoluteFill,
    zIndex: 25,
    backgroundColor: 'transparent',
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandLogo: { width: 64, height: 46 },
  brandText: {
    fontFamily: 'FraunTitle',
    fontSize: 30,
    color: C.primary,
    letterSpacing: -1,
  },
  headerActionsWrap: {
    position: 'relative',
    alignItems: 'flex-end',
    zIndex: 30,
  },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: sp(2) },
  iconBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: C.card,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: C.line,
  },
  avatarButton: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: C.primarySoft,
    borderWidth: 2, borderColor: C.white,
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
    ...shadow(C.ink, 0.1, 6, 2),
  },
  avatarImg: { width: 44, height: 44, borderRadius: 22 },
  chatBadge: {
    position: 'absolute',
    top: -3,
    right: -3,
    minWidth: 19,
    height: 19,
    borderRadius: 10,
    backgroundColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: C.card,
  },
  chatBadgeText: {
    fontFamily: 'InterBody',
    fontSize: 10.5,
    fontWeight: '700',
    color: C.white,
    lineHeight: 13,
  },
  loginPill: {
    backgroundColor: C.primary,
    borderRadius: 22,
    paddingVertical: 11,
    paddingHorizontal: 22,
  },
  loginPillText: { fontFamily: 'InterBody', fontWeight: '700', color: C.white, fontSize: 15 },
  headerMenu: {
    position: 'absolute',
    top: 54,
    right: 0,
    minWidth: 190,
    backgroundColor: C.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.line,
    overflow: 'hidden',
    zIndex: 60,
    elevation: 12,
    ...shadow(C.ink, 0.12, 14, 5),
  },
  headerMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  headerMenuDivider: { height: 1, backgroundColor: C.lineSoft },
  headerMenuText: {
    fontFamily: 'InterBody',
    fontSize: 15,
    fontWeight: '600',
    color: C.ink,
  },
  headerMenuTextDanger: { color: C.danger },

  // Greeting
  greetingBlock: { marginBottom: sp(4) },
  greetingTitle: {
    fontFamily: 'FraunTitle',
    fontSize: 26,
    lineHeight: 32,
    color: C.ink,
  },
  greetingMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  greetingMetaText: {
    fontFamily: 'InterBody',
    fontSize: 13.5,
    color: C.inkSoft,
  },
  metaDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: C.inkFaint },

  // Search
  searchWrap: { marginBottom: sp(5) },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: C.card,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: C.line,
    paddingLeft: 16,
    paddingRight: 8,
    paddingVertical: 8,
    ...shadow(C.ink, 0.05, 10, 3),
  },
  searchBarFocused: { borderColor: C.primaryMid },
  searchInput: {
    flex: 1,
    fontFamily: 'InterBody',
    fontSize: 16,
    color: C.ink,
    paddingVertical: 6,
  },
  searchGoBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.primary,
  },
  searchResults: {
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 18,
    marginTop: 8,
    overflow: 'hidden',
    ...shadow(C.ink, 0.06, 10, 3),
  },
  searchResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.lineSoft,
  },
  searchResultIcon: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center',
  },
  searchResultText: {
    flex: 1,
    fontFamily: 'InterBody',
    fontSize: 15,
    color: C.ink,
    fontWeight: '600',
  },
  // Welcome (logged out)
  welcomeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: sp(3),
    backgroundColor: C.goldSoft,
    borderRadius: 20,
    padding: sp(4),
    marginBottom: sp(5),
    borderWidth: 1,
    borderColor: '#EBD6A6',
  },
  welcomeTitle: { fontFamily: 'FraunTitle', fontSize: 18, color: C.goldDark },
  welcomeText: { fontFamily: 'InterBody', fontSize: 13.5, lineHeight: 19, color: C.inkSoft, marginTop: 3 },
  welcomeBtn: {
    backgroundColor: C.primaryDark,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 18,
  },
  welcomeBtnText: { fontFamily: 'InterBody', fontWeight: '700', fontSize: 15, color: C.white },

  // Banners
  bannerScrollWrap: { marginBottom: sp(3) },
  bannerScroll: { gap: sp(3) },
  bannerCard: {
    borderRadius: 24,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    backgroundColor: C.primaryDark, // placeholder while the image loads
    ...shadow(C.primaryDark, 0.2, 12, 4),
  },
  bannerImg: { width: '100%', height: '100%', borderRadius: 24 },
  bannerContent: { padding: sp(4) },
  bannerTag: { fontFamily: 'InterBody', fontWeight: '700', fontSize: 13, color: C.goldLight, marginBottom: 4 },
  bannerTitle: { fontFamily: 'FraunTitle', fontSize: 19, lineHeight: 24, color: C.white },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginBottom: sp(6),
  },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.line },
  dotActive: { width: 22, backgroundColor: C.primary },

  // Sections
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: sp(3),
    gap: sp(2),
  },
  sectionTitle: { fontFamily: 'FraunTitle', fontSize: 21, color: C.ink },
  sectionSubtitle: {
    fontFamily: 'InterBody', fontSize: 14, color: C.inkSoft, marginTop: 3,
  },
  sectionAction: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingBottom: 3 },
  sectionActionText: { fontFamily: 'InterBody', fontSize: 14, fontWeight: '700', color: C.primary },

  splitRow: { flexDirection: 'column' },
  splitRowDesktop: { flexDirection: 'row', alignItems: 'flex-start', gap: sp(6) },
  splitMain: { width: '100%' },
  splitMainDesktop: { flex: 2 },
  splitSide: { width: '100%' },
  splitSideDesktop: { flex: 1, minWidth: 280 },
  splitSideDesktopFull: { flex: 1 },

  // AI spotlight
  aiCard: {
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: '#CFE0FF',
    marginBottom: sp(3),
    ...shadow(C.ai, 0.12, 12, 4),
  },
  aiCardGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: sp(3),
    padding: sp(4),
  },
  aiIconWrap: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: C.ai,
    alignItems: 'center', justifyContent: 'center',
  },
  aiTitle: { fontFamily: 'InterBody', fontWeight: '800', fontSize: 17, color: '#0A2540' },
  aiDesc: { fontFamily: 'InterBody', fontSize: 13.5, lineHeight: 19, color: '#4A5F80', marginTop: 2 },
  aiArrow: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: C.ai,
    alignItems: 'center', justifyContent: 'center',
  },

  // Service grid
  serviceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -sp(1.5),
    marginBottom: sp(6),
  },
  serviceItem: {
    alignItems: 'center',
    justifyContent: 'flex-start',
    backgroundColor: C.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.line,
    paddingVertical: sp(3.5),
    paddingHorizontal: sp(1.5),
    minHeight: 118,
    ...shadow(C.ink, 0.04, 8, 2),
  },
  serviceCircle: {
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 10,
  },
  serviceLabel: {
    fontFamily: 'InterBody', fontWeight: '600', fontSize: 12.5, lineHeight: 16,
    color: C.ink, textAlign: 'center',
  },

  // Announcements
  announceCard: {
    flexDirection: 'row', gap: 14,
    backgroundColor: C.card, borderRadius: 20,
    padding: sp(3.5), marginBottom: sp(6),
    borderWidth: 1, borderColor: C.line,
    ...shadow(C.ink, 0.04, 8, 2),
  },
  announceThumbWrap: {
    width: 76, height: 76, borderRadius: 16,
    backgroundColor: C.lineSoft,
    alignItems: 'center', justifyContent: 'center',
  },
  announceThumb: { width: 60, height: 60 },
  announceTag: {
    alignSelf: 'flex-start',
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: C.goldSoft,
    borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 3,
    marginBottom: 6,
  },
  announceTagText: { fontFamily: 'InterBody', fontWeight: '700', fontSize: 11.5, color: C.goldDark },
  announceTitle: { fontFamily: 'InterBody', fontWeight: '700', fontSize: 15, color: C.ink, marginBottom: 4 },
  announceText: { fontFamily: 'InterBody', fontSize: 13.5, lineHeight: 19, color: C.inkSoft },

  // About Pateros
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -sp(1.5),
    marginBottom: sp(6),
  },
  infoCard: {
    flex: 1,
    backgroundColor: C.card,
    borderRadius: 20,
    padding: sp(4),
    borderWidth: 1,
    borderColor: C.line,
    minHeight: 150,
    ...shadow(C.ink, 0.04, 8, 2),
  },
  infoIconWrap: {
    width: 48, height: 48, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: sp(3),
  },
  infoCardTitle: {
    fontFamily: 'InterBody', fontWeight: '700', fontSize: 16,
    color: C.ink, marginBottom: 5, lineHeight: 21,
  },
  infoCardText: {
    fontFamily: 'InterBody', fontSize: 14.5, lineHeight: 21, color: C.inkSoft,
  },

  // How to use
  howToWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -sp(1.5),
    marginBottom: sp(6),
  },
  howToCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: sp(3.5),
    backgroundColor: C.primaryDark,
    borderRadius: 22,
    padding: sp(4),
    ...shadow(C.primaryDark, 0.22, 10, 4),
  },
  howToIconWrap: {
    width: 50, height: 50, borderRadius: 25,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center', justifyContent: 'center',
  },
  howToNumber: {
    position: 'absolute',
    top: -4, right: -4,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: C.goldLight,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: C.primaryDark,
  },
  howToNumberText: { fontFamily: 'InterBody', fontWeight: '800', fontSize: 11, color: C.primaryDark },
  howToTitle: {
    fontFamily: 'InterBody', fontWeight: '700', fontSize: 16.5,
    color: C.white, marginBottom: 5,
  },
  howToText: {
    fontFamily: 'InterBody', fontSize: 14.5, lineHeight: 21,
    color: 'rgba(255,255,255,0.88)',
  },

  // Logged-out steps + CTA
  stepsWrap: {
    backgroundColor: C.card, borderRadius: 24,
    padding: sp(5), marginBottom: sp(5),
    borderWidth: 1, borderColor: C.line,
    ...shadow(C.ink, 0.05, 8, 2),
  },
  stepsWrapDesktop: { flexDirection: 'row', gap: sp(5) },
  stepRow: { flexDirection: 'row' },
  stepRowDesktop: { flex: 1, flexDirection: 'column' },
  stepLeft: { alignItems: 'center', width: 40 },
  stepBadge: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: C.primaryDark,
    alignItems: 'center', justifyContent: 'center',
  },
  stepBadgeTxt: { fontFamily: 'InterBody', fontWeight: '700', fontSize: 15, color: C.white },
  stepConnector: { width: 2, flex: 1, minHeight: 28, backgroundColor: C.line, marginVertical: 4 },
  stepBody: { flex: 1, paddingLeft: sp(3), paddingBottom: sp(5) },
  stepTitle: { fontFamily: 'InterBody', fontWeight: '700', fontSize: 16, color: C.ink, marginBottom: 3 },
  stepText:  { fontFamily: 'InterBody', fontSize: 14, lineHeight: 21, color: C.inkSoft },

  cta: { borderRadius: 22, overflow: 'hidden', marginBottom: sp(6), ...shadow(C.primaryDark, 0.3, 10, 4) },
  ctaGrad: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: sp(4) + 2, gap: sp(3),
  },
  ctaTxt:   { fontFamily: 'InterBody', fontWeight: '700', fontSize: 17, color: C.white },
  ctaArrow: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: C.white,
    alignItems: 'center', justifyContent: 'center',
  },
});