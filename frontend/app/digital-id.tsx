import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  StatusBar,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';
import { useAuth } from '../context/AuthContext';
import { getUser } from '../lib/authApi';

const C = {
  bg: '#F6F8F2',
  card: '#FFFFFF',
  ink: '#132018',
  inkSoft: '#3E5246',
  inkFaint: '#71857A',
  primary: '#1F5C3E',
  primaryDark: '#0F3323',
  primaryMid: '#2E7A50',
  primarySoft: '#DCEFE3',
  gold: '#C4892E',
  goldDark: '#7E5417',
  goldSoft: '#FBF0DA',
  white: '#FFFFFF',
  line: '#DCE7D8',
};

const sp = (n: number) => n * 4;

// Standard ID/credit-card ratio (85.60 x 53.98mm)
const CARD_RATIO = 85.6 / 53.98;

function shadow(color: string, opacity: number, radius = 14, height = 6) {
  return Platform.select({
    ios: { shadowColor: color, shadowOpacity: opacity, shadowRadius: radius, shadowOffset: { width: 0, height } },
    android: { elevation: Math.round(radius * 0.6) },
    default: {},
  });
}

function formatDob(dob: string): string {
  if (!dob) return '—';
  const match = dob.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (match) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[parseInt(match[1], 10) - 1];
    return `${month} ${match[2]}, ${match[3]}`;
  }
  return dob;
}

function getAge(dob: string): string {
  if (!dob) return '';
  const match = dob.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return '';
  const birth = new Date(parseInt(match[3]), parseInt(match[1]) - 1, parseInt(match[2]));
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return `${age}`;
}

function formatIdNo(id?: number): string {
  if (!id) return '—';
  const padded = String(id).padStart(8, '0');
  return `${padded.slice(0, 4)}-${padded.slice(4)}`;
}

export default function DigitalIdScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [profile, setProfile] = useState<{
    firstName: string;
    middleName: string;
    lastName: string;
    dob: string;
    gender: string;
    civilStatus: string;
    contact: string;
    address: string;
    avatarUrl: string | null;
    id: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) { setLoading(false); return; }
    getUser(user.id)
      .then(({ user: p }) => {
        setProfile({
          firstName: p.firstName,
          middleName: p.middleName ?? '',
          lastName: p.lastName,
          dob: p.dob ?? '',
          gender: p.gender ?? '',
          civilStatus: p.civilStatus ?? '',
          contact: p.contact ?? '',
          address: p.address ?? '',
          avatarUrl: p.avatarUrl ?? p.profilePhoto ?? null,
          id: p.id,
        });
      })
      .catch(() => {
        if (user) {
          setProfile({
            firstName: user.firstName,
            middleName: user.middleName ?? '',
            lastName: user.lastName,
            dob: user.dob ?? '',
            gender: user.gender ?? '',
            civilStatus: user.civilStatus ?? '',
            contact: user.contact ?? '',
            address: user.address ?? '',
            avatarUrl: user.avatarUrl ?? user.profilePhoto ?? null,
            id: user.id,
          });
        }
      })
      .finally(() => setLoading(false));
  }, [user?.id]);

  if (!user) {
    return (
      <SafeAreaView style={s.safe} edges={['top']}>
        <StatusBar barStyle="dark-content" backgroundColor={C.bg} />
        <View style={s.centered}>
          <Ionicons name="id-card-outline" size={48} color={C.primaryDark} />
          <Text style={s.emptyTitle}>Not logged in</Text>
          <Text style={s.emptyText}>Please log in to view your digital ID.</Text>
          <TouchableOpacity style={s.loginBtn} onPress={() => router.push('/login')}>
            <Text style={s.loginBtnTxt}>Go to Login</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const fullName = profile
    ? [profile.firstName, profile.middleName, profile.lastName].filter(Boolean).join(' ')
    : '';

  const qrData = profile
    ? JSON.stringify({
        id: profile.id,
        name: fullName,
        dob: profile.dob,
        gender: profile.gender,
        civilStatus: profile.civilStatus,
        contact: profile.contact,
        address: profile.address,
        municipality: 'Pateros',
      })
    : '';

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />

      {/* Header */}
      <View style={s.topBar}>
        <TouchableOpacity
          style={s.backBtn}
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="arrow-back" size={22} color={C.primaryDark} />
        </TouchableOpacity>
        <Text style={s.topBarTitle}>Digital ID</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView
        contentContainerStyle={s.container}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View style={s.centered}>
            <ActivityIndicator size="large" color={C.primaryDark} />
            <Text style={s.loadingTxt}>Loading your ID…</Text>
          </View>
        ) : (
          <>
            {/* ── ID CARD — fixed ATM/credit-card ratio ── */}
            <View style={[s.card, shadow(C.primaryDark, 0.22, 18, 8)]}>

              <View style={s.bgBlobTop} pointerEvents="none" />
              <View style={s.bgBlobBottom} pointerEvents="none" />

              {/* Header strip */}
              <View style={s.headerRow}>
                <Image
                  source={require('../assets/images/pateros-logo.png')}
                  style={s.headerSeal}
                  resizeMode="contain"
                />
                <View style={s.headerTitles}>
                  <Text style={s.headerEyebrow} numberOfLines={1}>REPUBLIKA NG PILIPINAS</Text>
                  <Text style={s.headerMain} numberOfLines={1}>MUNISIPYO NG PATEROS</Text>
                  <Text style={s.headerSub} numberOfLines={1}>Senior Citizen Digital ID</Text>
                </View>
                <View style={s.headerBadge}>
                  <Ionicons name="finger-print" size={14} color={C.primaryDark} />
                </View>
              </View>

              <View style={s.goldBar} />

              {/* Main body: photo+details (left) | QR (right) */}
              <View style={s.bodyRow}>

                {profile?.avatarUrl ? (
                  <Image source={{ uri: profile.avatarUrl }} style={s.avatar} />
                ) : (
                  <View style={[s.avatar, s.avatarFallback]}>
                    <Ionicons name="person" size={26} color={C.primaryDark} />
                  </View>
                )}

                <View style={s.detailsCol}>
                  <Text style={s.fullName} numberOfLines={1} ellipsizeMode="tail">
                    {fullName || '—'}
                  </Text>
                  <Text style={s.idNo} numberOfLines={1}>
                    ID No. {formatIdNo(profile?.id)}
                  </Text>

                  <View style={s.detailLine}>
                    <DetailChip icon="calendar-outline" text={formatDob(profile?.dob ?? '')} />
                    <DetailChip icon="hourglass-outline" text={profile?.dob ? `${getAge(profile.dob)} yrs` : '—'} />
                    <DetailChip icon="male-female-outline" text={profile?.gender || '—'} />
                    <DetailChip icon="heart-outline" text={profile?.civilStatus || '—'} />
                  </View>

                  <View style={s.detailLine}>
                    <Ionicons name="call-outline" size={9} color={C.inkFaint} />
                    <Text style={s.detailText} numberOfLines={1} ellipsizeMode="tail">
                      {profile?.contact || '—'}
                    </Text>
                  </View>

                  <View style={s.detailLine}>
                    <Ionicons name="location-outline" size={9} color={C.inkFaint} />
                    <Text style={s.detailText} numberOfLines={1} ellipsizeMode="tail">
                      {profile?.address || '—'}
                    </Text>
                  </View>
                </View>

                <View style={s.qrCol}>
                  <View style={s.qrWrap}>
                    {qrData ? (
                      <QRCode
                        value={qrData}
                        size={58}
                        color={C.primaryDark}
                        backgroundColor={C.white}
                      />
                    ) : (
                      <View style={s.qrPlaceholder}>
                        <Ionicons name="qr-code-outline" size={22} color={C.inkFaint} />
                      </View>
                    )}
                  </View>
                  <View style={s.verifiedBadge}>
                    <Ionicons name="shield-checkmark" size={9} color={C.white} />
                    <Text style={s.verifiedBadgeTxt}>VERIFIED</Text>
                  </View>
                </View>
              </View>

              {/* Footer strip */}
              <View style={s.cardFooter}>
                <Text style={s.footerTxt} numberOfLines={1}>
                  Property of the Municipality of Pateros — OSCA
                </Text>
              </View>
            </View>

            {/* Note */}
            <View style={s.noteCard}>
              <Ionicons name="information-circle-outline" size={18} color={C.goldDark} />
              <Text style={s.noteTxt}>
                Present this ID to avail senior citizen benefits and services at the Pateros OSCA.
              </Text>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function DetailChip({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={s.chip}>
      <Ionicons name={icon as any} size={9} color={C.inkFaint} />
      <Text style={s.chipTxt} numberOfLines={1}>{text}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: sp(4),
    paddingVertical: sp(3),
    backgroundColor: C.bg,
    width: '100%',
    maxWidth: 460,
    alignSelf: 'center',
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: C.card,
    alignItems: 'center', justifyContent: 'center',
    ...Platform.select({
      ios: { shadowColor: C.ink, shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
      android: { elevation: 1 },
    }),
  },
  topBarTitle: {
    fontFamily: 'FraunTitle',
    fontSize: 20,
    color: C.ink,
  },

  container: {
    paddingHorizontal: sp(4),
    paddingBottom: sp(10),
    paddingTop: sp(2),
    width: '100%',
    maxWidth: 460,
    alignSelf: 'center',
  },

  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: sp(20),
    gap: sp(3),
  },
  loadingTxt: {
    fontFamily: 'InterBody',
    fontSize: 14,
    color: C.inkSoft,
    marginTop: sp(2),
  },
  emptyTitle: {
    fontFamily: 'FraunTitle',
    fontSize: 20,
    color: C.ink,
  },
  emptyText: {
    fontFamily: 'InterBody',
    fontSize: 14,
    color: C.inkSoft,
    textAlign: 'center',
  },
  loginBtn: {
    backgroundColor: C.primaryDark,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 28,
    marginTop: sp(2),
  },
  loginBtnTxt: {
    fontFamily: 'InterBody',
    fontWeight: '700',
    fontSize: 14,
    color: C.white,
  },

  // Card — fixed landscape ratio like a physical ID/ATM card
  card: {
    width: '100%',
    aspectRatio: CARD_RATIO,
    backgroundColor: C.primarySoft,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: sp(4),
    borderWidth: 1,
    borderColor: C.line,
    padding: sp(2.5),
  },
  bgBlobTop: {
    position: 'absolute',
    top: -50, right: -50,
    width: 130, height: 130,
    borderRadius: 999,
    backgroundColor: 'rgba(196,137,46,0.10)',
  },
  bgBlobBottom: {
    position: 'absolute',
    bottom: -60, left: -40,
    width: 150, height: 150,
    borderRadius: 999,
    backgroundColor: 'rgba(31,92,62,0.08)',
  },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerSeal: {
    width: 22, height: 22,
  },
  headerTitles: { flex: 1 },
  headerEyebrow: {
    fontFamily: 'InterBody',
    fontWeight: '700',
    fontSize: 7.5,
    color: C.primaryDark,
    letterSpacing: 0.3,
  },
  headerMain: {
    fontFamily: 'FraunTitle',
    fontSize: 12,
    color: C.ink,
    lineHeight: 14,
  },
  headerSub: {
    fontFamily: 'InterBody',
    fontSize: 7.5,
    color: C.inkSoft,
  },
  headerBadge: {
    width: 22, height: 22,
    borderRadius: 11,
    backgroundColor: C.goldSoft,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#EEDDB8',
  },

  goldBar: {
    height: 2,
    backgroundColor: C.gold,
    borderRadius: 1,
    marginVertical: 6,
  },

  bodyRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: C.white,
    borderRadius: 10,
    padding: 8,
  },

  avatar: {
    width: 54, height: 54,
    borderRadius: 8,
    backgroundColor: C.primarySoft,
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: C.line,
  },

  detailsCol: {
    flex: 1,
    justifyContent: 'flex-start',
    gap: 3,
    minWidth: 0,
  },
  fullName: {
    fontFamily: 'FraunTitle',
    fontSize: 13.5,
    color: C.ink,
  },
  idNo: {
    fontFamily: 'InterBody',
    fontWeight: '700',
    fontSize: 8.5,
    color: C.primaryDark,
    letterSpacing: 0.4,
    marginBottom: 2,
  },

  detailLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexWrap: 'wrap',
  },
  detailText: {
    fontFamily: 'InterBody',
    fontSize: 9,
    color: C.inkSoft,
    flexShrink: 1,
  },

  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: C.primarySoft,
    borderRadius: 5,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  chipTxt: {
    fontFamily: 'InterBody',
    fontWeight: '600',
    fontSize: 8,
    color: C.inkSoft,
  },

  qrCol: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingLeft: 8,
    borderLeftWidth: 1,
    borderLeftColor: C.line,
    alignSelf: 'stretch',
  },
  qrWrap: {
    padding: 4,
    backgroundColor: C.white,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: C.line,
  },
  qrPlaceholder: {
    width: 58, height: 58,
    alignItems: 'center', justifyContent: 'center',
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: C.primaryDark,
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  verifiedBadgeTxt: {
    fontFamily: 'InterBody',
    fontWeight: '700',
    fontSize: 7,
    color: C.white,
    letterSpacing: 0.4,
  },

  cardFooter: {
    alignItems: 'center',
    marginTop: 6,
  },
  footerTxt: {
    fontFamily: 'InterBody',
    fontSize: 7,
    color: C.inkFaint,
    textAlign: 'center',
    letterSpacing: 0.2,
  },

  // Note
  noteCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: sp(2),
    backgroundColor: C.goldSoft,
    borderRadius: 14,
    padding: sp(4),
    borderWidth: 1,
    borderColor: '#EEDDB8',
  },
  noteTxt: {
    flex: 1,
    fontFamily: 'InterBody',
    fontSize: 12.5,
    color: C.goldDark,
    lineHeight: 19,
  },
});