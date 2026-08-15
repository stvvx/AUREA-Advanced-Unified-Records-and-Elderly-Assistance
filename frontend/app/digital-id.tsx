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
import { LinearGradient } from 'expo-linear-gradient';
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

function shadow(color: string, opacity: number, radius = 14, height = 6) {
  return Platform.select({
    ios: { shadowColor: color, shadowOpacity: opacity, shadowRadius: radius, shadowOffset: { width: 0, height } },
    android: { elevation: Math.round(radius * 0.6) },
    default: {},
  });
}

function formatDob(dob: string): string {
  if (!dob) return '—';
  // Handle MM/DD/YYYY
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
  return `${age} yrs old`;
}

export default function DigitalIdScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [profile, setProfile] = useState<{
    firstName: string;
    middleName: string;
    lastName: string;
    dob: string;
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
            {/* ── ID CARD ── */}
            <View style={[s.card, shadow(C.primaryDark, 0.22, 20, 8)]}>

              {/* Card header strip */}
              <LinearGradient
                colors={[C.primaryDark, C.primaryMid]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={s.cardHeader}
              >
                <Image
                  source={require('../assets/images/pateros-logo.png')}
                  style={s.headerLogo}
                  resizeMode="contain"
                />
                <View style={s.headerText}>
                  <Text style={s.headerEyebrow}>REPUBLIC OF THE PHILIPPINES</Text>
                  <Text style={s.headerTitle}>MUNICIPALITY OF PATEROS</Text>
                  <Text style={s.headerSub}>Office for Senior Citizens Affairs</Text>
                </View>
              </LinearGradient>

              {/* Gold accent bar */}
              <View style={s.goldBar} />

              {/* Card body */}
              <View style={s.cardBody}>

                {/* Avatar + name block */}
                <View style={s.topSection}>
                  <View style={s.avatarWrap}>
                    {profile?.avatarUrl ? (
                      <Image source={{ uri: profile.avatarUrl }} style={s.avatar} />
                    ) : (
                      <View style={s.avatarFallback}>
                        <Ionicons name="person" size={36} color={C.primaryDark} />
                      </View>
                    )}
                    <View style={s.avatarBadge}>
                      <Ionicons name="shield-checkmark" size={10} color={C.white} />
                    </View>
                  </View>

                  <View style={s.nameBlock}>
                    <Text style={s.idLabel}>SENIOR CITIZEN ID</Text>
                    <Text style={s.fullName} numberOfLines={2}>{fullName || '—'}</Text>
                    {profile?.dob ? (
                      <Text style={s.age}>{getAge(profile.dob)}</Text>
                    ) : null}
                    <View style={s.idNumberRow}>
                      <Text style={s.idNumberLabel}>ID No. </Text>
                      <Text style={s.idNumber}>
                        {profile?.id ? String(profile.id).padStart(8, '0') : '—'}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Divider */}
                <View style={s.divider} />

                {/* Info rows */}
                <View style={s.infoGrid}>
                  <InfoRow icon="calendar-outline" label="Date of Birth" value={formatDob(profile?.dob ?? '')} />
                  <InfoRow icon="call-outline" label="Contact" value={profile?.contact || '—'} />
                  <InfoRow icon="location-outline" label="Address" value={profile?.address || '—'} />
                </View>

                {/* Divider */}
                <View style={s.divider} />

                {/* QR Code */}
                <View style={s.qrSection}>
                  <Text style={s.qrLabel}>Scan to Verify</Text>
                  <View style={s.qrWrap}>
                    {qrData ? (
                      <QRCode
                        value={qrData}
                        size={130}
                        color={C.primaryDark}
                        backgroundColor={C.white}
                      />
                    ) : (
                      <View style={s.qrPlaceholder}>
                        <Ionicons name="qr-code-outline" size={40} color={C.inkFaint} />
                      </View>
                    )}
                  </View>
                  <Text style={s.qrSub}>Municipality of Pateros — OSCA</Text>
                </View>
              </View>

              {/* Card footer */}
              <LinearGradient
                colors={[C.primaryDark, C.primaryMid]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={s.cardFooter}
              >
                <Text style={s.footerTxt}>
                  This card is the property of the Municipality of Pateros.
                </Text>
              </LinearGradient>
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

function InfoRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={s.infoRow}>
      <View style={s.infoIconWrap}>
        <Ionicons name={icon as any} size={14} color={C.primaryDark} />
      </View>
      <View style={s.infoText}>
        <Text style={s.infoLabel}>{label}</Text>
        <Text style={s.infoValue} numberOfLines={2}>{value}</Text>
      </View>
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

  // Card
  card: {
    backgroundColor: C.card,
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: sp(4),
  },

  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: sp(4),
    paddingVertical: sp(4),
    gap: sp(3),
  },
  headerLogo: {
    width: 48, height: 48,
  },
  headerText: { flex: 1 },
  headerEyebrow: {
    fontFamily: 'InterBody',
    fontWeight: '700',
    fontSize: 8,
    letterSpacing: 1.2,
    color: 'rgba(255,255,255,0.7)',
    marginBottom: 2,
  },
  headerTitle: {
    fontFamily: 'FraunTitle',
    fontSize: 13,
    color: C.white,
    lineHeight: 17,
  },
  headerSub: {
    fontFamily: 'InterBody',
    fontSize: 9.5,
    color: 'rgba(255,255,255,0.75)',
    marginTop: 2,
  },

  goldBar: {
    height: 4,
    backgroundColor: C.gold,
  },

  cardBody: {
    padding: sp(5),
  },

  topSection: {
    flexDirection: 'row',
    gap: sp(4),
    marginBottom: sp(4),
  },
  avatarWrap: {
    width: 88, height: 88,
    borderRadius: 12,
    backgroundColor: C.primarySoft,
    alignItems: 'center', justifyContent: 'center',
    overflow: 'visible',
    borderWidth: 2,
    borderColor: C.line,
  },
  avatar: {
    width: 88, height: 88,
    borderRadius: 12,
  },
  avatarFallback: {
    width: 88, height: 88,
    borderRadius: 12,
    backgroundColor: C.primarySoft,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarBadge: {
    position: 'absolute',
    bottom: -6, right: -6,
    width: 20, height: 20,
    borderRadius: 10,
    backgroundColor: C.primaryDark,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: C.white,
  },

  nameBlock: { flex: 1, justifyContent: 'center' },
  idLabel: {
    fontFamily: 'InterBody',
    fontWeight: '700',
    fontSize: 9,
    letterSpacing: 1.4,
    color: C.gold,
    marginBottom: 4,
  },
  fullName: {
    fontFamily: 'FraunTitle',
    fontSize: 18,
    color: C.ink,
    lineHeight: 23,
    marginBottom: 3,
  },
  age: {
    fontFamily: 'InterBody',
    fontSize: 12,
    color: C.inkSoft,
    marginBottom: 6,
  },
  idNumberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.primarySoft,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  idNumberLabel: {
    fontFamily: 'InterBody',
    fontSize: 10,
    color: C.inkSoft,
  },
  idNumber: {
    fontFamily: 'InterBody',
    fontWeight: '700',
    fontSize: 11,
    color: C.primaryDark,
    letterSpacing: 1,
  },

  divider: {
    height: 1,
    backgroundColor: C.line,
    marginVertical: sp(3),
  },

  infoGrid: { gap: sp(3) },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: sp(3),
  },
  infoIconWrap: {
    width: 28, height: 28,
    borderRadius: 8,
    backgroundColor: C.primarySoft,
    alignItems: 'center', justifyContent: 'center',
    marginTop: 1,
  },
  infoText: { flex: 1 },
  infoLabel: {
    fontFamily: 'InterBody',
    fontSize: 10,
    color: C.inkFaint,
    marginBottom: 2,
    fontWeight: '600',
    letterSpacing: 0.4,
  },
  infoValue: {
    fontFamily: 'InterBody',
    fontSize: 13.5,
    color: C.ink,
    fontWeight: '600',
  },

  qrSection: {
    alignItems: 'center',
    gap: sp(2),
  },
  qrLabel: {
    fontFamily: 'InterBody',
    fontWeight: '700',
    fontSize: 11,
    letterSpacing: 1,
    color: C.inkFaint,
  },
  qrWrap: {
    padding: sp(3),
    backgroundColor: C.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.line,
  },
  qrPlaceholder: {
    width: 130, height: 130,
    alignItems: 'center', justifyContent: 'center',
  },
  qrSub: {
    fontFamily: 'InterBody',
    fontSize: 10,
    color: C.inkFaint,
  },

  cardFooter: {
    paddingVertical: sp(3),
    paddingHorizontal: sp(4),
    alignItems: 'center',
  },
  footerTxt: {
    fontFamily: 'InterBody',
    fontSize: 9,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    letterSpacing: 0.3,
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
