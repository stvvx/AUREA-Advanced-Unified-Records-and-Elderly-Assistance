import React, { useEffect, useState, useRef } from 'react';
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
  Share,
  Modal,
  PanResponder,
  Alert,
  useWindowDimensions,
} from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';
import Svg, {
  Path,
  Circle,
  Polygon,
} from 'react-native-svg';
import { useAuth } from '../context/AuthContext';
import { getUser, saveSignature } from '../lib/authApi';

// Color palette
const C = {
  bg: '#F3F5F0',
  cardBg: '#FFFFFF',
  ink: '#111827',
  inkSoft: '#374151',
  inkFaint: '#6B7280',
  oscaGreen: '#145A32',
  oscaGreenDark: '#0D3820',
  oscaGreenLight: '#27AE60',
  oscaGold: '#E67E22',
  stampBlue: '#1A5276',
  stampRed: '#A93226',
  line: '#E5E7EB',
  white: '#FFFFFF',
  goldSoft: '#FEF9E7',
  goldBorder: '#F9E79F',
};

// Card Aspect Ratio matching standard ID-1 card (85.60 x 53.98mm ~ 1.586)
const CARD_RATIO = 85.6 / 53.98;

type Point = { x: number; y: number };
type Stroke = {
  points: Point[];
  color: string;
  width: number;
};

function strokeToSvgPath(points: Point[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) {
    return `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)} L ${(points[0].x + 0.5).toFixed(1)} ${(points[0].y + 0.5).toFixed(1)}`;
  }
  if (points.length === 2) {
    return `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)} L ${points[1].x.toFixed(1)} ${points[1].y.toFixed(1)}`;
  }

  let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 1; i < points.length - 1; i++) {
    const xc = ((points[i].x + points[i + 1].x) / 2).toFixed(1);
    const yc = ((points[i].y + points[i + 1].y) / 2).toFixed(1);
    d += ` Q ${points[i].x.toFixed(1)} ${points[i].y.toFixed(1)}, ${xc} ${yc}`;
  }
  const last = points[points.length - 1];
  d += ` L ${last.x.toFixed(1)} ${last.y.toFixed(1)}`;
  return d;
}

function shadow(color: string, opacity: number, radius = 16, height = 8) {
  return Platform.select({
    ios: {
      shadowColor: color,
      shadowOpacity: opacity,
      shadowRadius: radius,
      shadowOffset: { width: 0, height },
    },
    android: { elevation: Math.round(radius * 0.5) },
    default: {},
  });
}

function formatDobLong(dob: string): string {
  if (!dob) return 'June 8, 1960';
  // Try MM/DD/YYYY
  const slashMatch = dob.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];
    const m = parseInt(slashMatch[1], 10) - 1;
    const d = parseInt(slashMatch[2], 10);
    const y = slashMatch[3];
    return `${months[m] || 'June'} ${d}, ${y}`;
  }
  // Try YYYY-MM-DD
  const dashMatch = dob.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (dashMatch) {
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];
    const m = parseInt(dashMatch[2], 10) - 1;
    const d = parseInt(dashMatch[3], 10);
    const y = dashMatch[1];
    return `${months[m] || 'June'} ${d}, ${y}`;
  }
  return dob;
}

function formatIssueDate(createdAt?: string): string {
  if (!createdAt) return '07-31-2026';
  try {
    const d = new Date(createdAt);
    if (isNaN(d.getTime())) return '07-31-2026';
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${mm}-${dd}-${yyyy}`;
  } catch {
    return '07-31-2026';
  }
}

function formatIdNumber(id?: number): string {
  if (!id) return 'SA-1947';
  return `SA-${String(id).padStart(4, '0')}`;
}

export default function DigitalIdScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [activeSide, setActiveSide] = useState<'front' | 'back'>('front');
  const [copiedToast, setCopiedToast] = useState(false);
  const [sigModalVisible, setSigModalVisible] = useState(false);
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
    signature: string | null;
    id: number;
    createdAt?: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    getUser(user.id)
      .then(({ user: p }) => {
        setProfile({
          firstName: p.firstName,
          middleName: p.middleName ?? '',
          lastName: p.lastName,
          dob: p.dob ?? '',
          gender: p.gender ?? 'Female',
          civilStatus: p.civilStatus ?? 'Married',
          contact: p.contact ?? '',
          address: p.address ?? 'Pateros, Metro Manila',
          avatarUrl: p.avatarUrl ?? p.profilePhoto ?? null,
          signature: p.signature ?? p.digitalSignature ?? null,
          id: p.id,
          createdAt: p.createdAt,
        });
      })
      .catch(() => {
        if (user) {
          setProfile({
            firstName: user.firstName,
            middleName: user.middleName ?? '',
            lastName: user.lastName,
            dob: user.dob ?? '',
            gender: user.gender ?? 'Female',
            civilStatus: user.civilStatus ?? 'Married',
            contact: user.contact ?? '',
            address: user.address ?? 'Pateros, Metro Manila',
            avatarUrl: user.avatarUrl ?? user.profilePhoto ?? null,
            signature: (user as any).signature ?? (user as any).digitalSignature ?? null,
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
          <Ionicons name="id-card-outline" size={54} color={C.oscaGreen} />
          <Text style={s.emptyTitle}>Senior Citizen ID</Text>
          <Text style={s.emptyText}>Please sign in to view your official digital OSCA ID card.</Text>
          <TouchableOpacity style={s.loginBtn} onPress={() => router.push('/login')}>
            <Text style={s.loginBtnTxt}>Go to Sign In</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Format Display Name in full uppercase (e.g. ANGELITA G. BANATAO)
  const formattedMiddle = profile?.middleName
    ? `${profile.middleName.trim().charAt(0).toUpperCase()}.`
    : '';
  const fullNameUpper = profile
    ? [profile.firstName, formattedMiddle, profile.lastName].filter(Boolean).join(' ').toUpperCase()
    : 'ANGELITA G. BANATAO';

  // Format Address (2 readable lines)
  const rawAddress = profile?.address || '8-B Panday Paltok St. Sta. Ana, Pateros, Metro Manila';
  const addressParts = rawAddress.split(',').map((p) => p.trim());
  const addrLine1 = addressParts.length > 1 ? addressParts.slice(0, -1).join(', ') : rawAddress;
  const addrLine2 = addressParts.length > 1 ? addressParts[addressParts.length - 1] : 'Pateros, Metro Manila';

  const dobDisplay = formatDobLong(profile?.dob || '');
  const genderDisplay = profile?.gender ? profile.gender.charAt(0).toUpperCase() + profile.gender.slice(1) : 'Female';
  const idNumberDisplay = formatIdNumber(profile?.id);
  const issueDateDisplay = formatIssueDate(profile?.createdAt);

  const qrPayload = JSON.stringify({
    idNumber: idNumberDisplay,
    name: fullNameUpper,
    dob: dobDisplay,
    gender: genderDisplay,
    municipality: 'Pateros, Metro Manila',
    office: 'Office of the Senior Citizens Affairs (OSCA)',
    republicAct: 'RA 9994',
    dateIssued: issueDateDisplay,
    status: 'VALID',
  });

  const handleShare = async () => {
    try {
      await Share.share({
        message: `Pateros Senior Citizen ID\nName: ${fullNameUpper}\nID No: ${idNumberDisplay}\nIssued by OSCA Pateros, Metro Manila.`,
      });
    } catch {
      // Ignored
    }
  };

  const handleSignatureSaved = (newSig: string) => {
    setProfile((prev) => (prev ? { ...prev, signature: newSig } : prev));
  };

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />

      {/* Top App Bar */}
      <View style={s.topBar}>
        <TouchableOpacity
          style={s.backBtn}
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="arrow-back" size={22} color={C.ink} />
        </TouchableOpacity>
        <View style={s.topBarCenter}>
          <Text style={s.topBarTitle}>Senior Citizen ID</Text>
          <Text style={s.topBarSubtitle}>Municipality of Pateros</Text>
        </View>
        <TouchableOpacity style={s.shareBtn} onPress={handleShare}>
          <Ionicons name="share-outline" size={20} color={C.ink} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={s.container}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View style={s.centered}>
            <ActivityIndicator size="large" color={C.oscaGreen} />
            <Text style={s.loadingTxt}>Loading your Senior Citizen ID…</Text>
          </View>
        ) : (
          <>
            {/* View Switcher: Front vs Back */}
            <View style={s.tabContainer}>
              <TouchableOpacity
                style={[s.tabButton, activeSide === 'front' && s.tabButtonActive]}
                onPress={() => setActiveSide('front')}
                activeOpacity={0.8}
              >
                <Ionicons
                  name="card-outline"
                  size={16}
                  color={activeSide === 'front' ? C.white : C.inkSoft}
                />
                <Text
                  style={[
                    s.tabButtonText,
                    activeSide === 'front' && s.tabButtonTextActive,
                  ]}
                >
                  Front ID Card
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[s.tabButton, activeSide === 'back' && s.tabButtonActive]}
                onPress={() => setActiveSide('back')}
                activeOpacity={0.8}
              >
                <Ionicons
                  name="qr-code-outline"
                  size={16}
                  color={activeSide === 'back' ? C.white : C.inkSoft}
                />
                <Text
                  style={[
                    s.tabButtonText,
                    activeSide === 'back' && s.tabButtonTextActive,
                  ]}
                >
                  Back (RA 9257)
                </Text>
              </TouchableOpacity>
            </View>

            {/* ══════════════════════════════════════════════════════════════════════
                CARD VIEW CONTAINER
            ══════════════════════════════════════════════════════════════════════ */}
            <View style={[s.cardOuterShadow, shadow(C.ink, 0.25, 20, 10)]}>
              {activeSide === 'front' ? (
                /* ─── FRONT ID CARD (Exact Replica of Pateros OSCA ID) ─── */
                <View style={s.idCard}>
                  {/* Decorative Background Geometric Watermarks */}
                  <View style={s.bgWatermarkTopRight} pointerEvents="none">
                    <Svg width="120" height="90" viewBox="0 0 120 90">
                      <Polygon points="50,0 120,0 120,70" fill="#2E7D32" opacity={0.85} />
                      <Polygon points="80,0 120,0 120,40" fill="#1B5E20" opacity={0.9} />
                      <Polygon points="100,20 120,40 120,80" fill="#F9A825" opacity={0.85} />
                      <Polygon points="60,0 120,60 120,75" fill="#E65100" opacity={0.35} />
                    </Svg>
                  </View>

                  <View style={s.bgWatermarkBottomLeft} pointerEvents="none">
                    <Svg width="100" height="90" viewBox="0 0 100 90">
                      <Polygon points="0,30 0,90 80,90" fill="#2E7D32" opacity={0.85} />
                      <Polygon points="0,55 0,90 45,90" fill="#1B5E20" opacity={0.9} />
                      <Circle cx="0" cy="90" r="65" stroke="#4CAF50" strokeWidth="2.5" fill="none" opacity={0.4} />
                      <Circle cx="0" cy="90" r="45" stroke="#81C784" strokeWidth="2" fill="none" opacity={0.4} />
                    </Svg>
                  </View>

                  <View style={s.bgWatermarkBottomRight} pointerEvents="none">
                    <Svg width="110" height="85" viewBox="0 0 110 85">
                      <Polygon points="40,85 110,85 110,15" fill="#F57F17" opacity={0.85} />
                      <Polygon points="65,85 110,85 110,40" fill="#F9A825" opacity={0.9} />
                      <Polygon points="85,85 110,85 110,60" fill="#FFE082" opacity={0.8} />
                    </Svg>
                  </View>

                  {/* ── CARD HEADER ROW ── */}
                  <View style={s.cardHeaderRow}>
                    {/* Left: Pateros Seal */}
                    <View style={s.sealWrapper}>
                      <Image
                        source={require('../assets/images/image copy 2.png')}
                        style={s.paterosSeal}
                        resizeMode="contain"
                      />
                    </View>

                    {/* Center: Official Government Titles */}
                    <View style={s.headerCenterTitles}>
                      <Text style={s.govTitleCountry}>Republic of the Philippines</Text>
                      <Text style={s.govTitleMun}>Municipality of Pateros</Text>
                      <Text style={s.govTitleOsca}>
                        OFFICE OF THE SENIOR CITIZENS AFFAIRS
                      </Text>
                    </View>

                    {/* Right: OSCA Postage Stamp Badge */}
                    <View style={s.stampWrapper}>
                      <View style={s.stampBannerTop}>
                        <Text style={s.stampBannerTopTxt}>PATEROS</Text>
                      </View>

                      <View style={s.stampBodyRow}>
                        <View style={s.stampRedStrip}>
                          <Text style={s.stampVerticalTxt}>S</Text>
                          <Text style={s.stampVerticalTxt}>E</Text>
                          <Text style={s.stampVerticalTxt}>N</Text>
                          <Text style={s.stampVerticalTxt}>I</Text>
                          <Text style={s.stampVerticalTxt}>O</Text>
                          <Text style={s.stampVerticalTxt}>R</Text>
                        </View>

                        <View style={s.stampCenterArt}>
                          <Svg width="26" height="28" viewBox="0 0 40 42">
                            <Circle cx="14" cy="18" r="9" fill="#FADBD8" stroke="#333" strokeWidth="1" />
                            <Circle cx="12" cy="17" r="3.5" stroke="#222" strokeWidth="1" fill="none" />
                            <Circle cx="17" cy="17" r="3.5" stroke="#222" strokeWidth="1" fill="none" />
                            <Path d="M14 17 L15 17" stroke="#222" strokeWidth="1" />
                            <Path d="M8 12 Q14 7 20 12" stroke="#555" strokeWidth="1.5" fill="none" />
                            <Path d="M12 22 Q14 24 16 22" stroke="#333" strokeWidth="1" fill="none" />

                            <Circle cx="26" cy="18" r="9" fill="#FADBD8" stroke="#333" strokeWidth="1" />
                            <Circle cx="23" cy="17" r="3.5" stroke="#222" strokeWidth="1" fill="none" />
                            <Circle cx="29" cy="17" r="3.5" stroke="#222" strokeWidth="1" fill="none" />
                            <Path d="M25 17 L27 17" stroke="#222" strokeWidth="1" />
                            <Circle cx="26" cy="8" r="3.5" fill="#666" />
                            <Path d="M23 22 Q26 24 29 22" stroke="#333" strokeWidth="1" fill="none" />

                            <Path d="M6 38 C6 28 22 28 22 38" fill="#5D6D7E" />
                            <Path d="M18 38 C18 28 34 28 34 38" fill="#99A3A4" />
                          </Svg>
                        </View>

                        <View style={s.stampRedStrip}>
                          <Text style={s.stampVerticalTxt}>C</Text>
                          <Text style={s.stampVerticalTxt}>I</Text>
                          <Text style={s.stampVerticalTxt}>T</Text>
                          <Text style={s.stampVerticalTxt}>I</Text>
                          <Text style={s.stampVerticalTxt}>Z</Text>
                          <Text style={s.stampVerticalTxt}>E</Text>
                          <Text style={s.stampVerticalTxt}>N</Text>
                        </View>
                      </View>
                    </View>
                  </View>

                  {/* ── CARD MIDDLE: 2x2 Photo + Senior Citizen Details + Front QR Code ── */}
                  <View style={s.cardMiddleRow}>
                    {/* Left 2x2 Photo Frame */}
                    <View style={s.photoBorderBox}>
                      {profile?.avatarUrl ? (
                        <Image
                          source={{ uri: profile.avatarUrl }}
                          style={s.photoImage}
                          resizeMode="cover"
                        />
                      ) : (
                        <View style={s.photoFallback}>
                          <MaterialCommunityIcons
                            name="account"
                            size={42}
                            color="#8A9BA8"
                          />
                        </View>
                      )}
                    </View>

                    {/* Center Details Text Fields */}
                    <View style={s.detailsColumn}>
                      <Text
                        style={s.detailFullName}
                        numberOfLines={1}
                        ellipsizeMode="tail"
                      >
                        {fullNameUpper}
                      </Text>

                      <Text
                        style={s.detailAddressLine}
                        numberOfLines={1}
                        ellipsizeMode="tail"
                      >
                        {addrLine1}
                      </Text>
                      {addrLine2 ? (
                        <Text
                          style={s.detailAddressLine}
                          numberOfLines={1}
                          ellipsizeMode="tail"
                        >
                          {addrLine2}
                        </Text>
                      ) : null}

                      <Text style={s.detailMetaLine}>
                        Date of Birth: <Text style={s.detailMetaVal}>{dobDisplay}</Text>
                      </Text>
                      <Text style={s.detailMetaLine}>
                        {genderDisplay}
                      </Text>
                    </View>

                    {/* Right: Front Scannable QR Code */}
                    <View style={s.frontQrCol}>
                      <View style={s.frontQrBox}>
                        <QRCode
                          value={qrPayload}
                          size={44}
                          color={C.oscaGreenDark}
                          backgroundColor="#FFFFFF"
                        />
                      </View>
                      <View style={s.frontQrBadge}>
                        <Ionicons name="shield-checkmark" size={7} color="#FFFFFF" />
                        <Text style={s.frontQrBadgeTxt}>QR SECURE</Text>
                      </View>
                    </View>
                  </View>

                  {/* ── CARD LOWER ROW: ID No. + Date Issued & Signature Area ── */}
                  <View style={s.cardBottomMetaRow}>
                    {/* Left Lower: ID Number and Date Issued */}
                    <View style={s.idNumberCol}>
                      <Text style={s.idNumberText}>
                        NO. <Text style={s.idNumberBold}>{idNumberDisplay}</Text>
                      </Text>
                      <Text style={s.dateIssuedText}>
                        Date Issued: <Text style={s.dateIssuedVal}>{issueDateDisplay}</Text>
                      </Text>
                    </View>

                    {/* Right Lower: Interactive Signature over Line */}
                    <TouchableOpacity
                      style={s.signatureCol}
                      onPress={() => setSigModalVisible(true)}
                      activeOpacity={0.7}
                    >
                      <View style={s.signatureSvgWrap}>
                        <SignatureDisplay signature={profile?.signature} />
                      </View>

                      {/* Signature line & label */}
                      <View style={s.signatureUnderline} />
                      <View style={s.signatureLabelRow}>
                        <Text style={s.signatureLabel}>SIGNATURE/THUMBMARK</Text>
                        <Ionicons name="pencil" size={7} color={C.inkFaint} />
                      </View>
                    </TouchableOpacity>
                  </View>

                  {/* ── BOTTOM BANNER / NON-TRANSFERABLE STRIP ── */}
                  <View style={s.disclaimerStrip}>
                    <Text style={s.disclaimerText}>
                      THIS CARD IS NON-TRANSFERABLE AND VALID ANYWHERE IN THE PHILIPPINES.
                    </Text>
                  </View>
                </View>
              ) : (
                /* ─── BACK OF CARD: Exact Replica of Pateros OSCA ID Back ─── */
                <View style={[s.idCard, s.idCardBack]}>
                  {/* Subtle Center Seal Watermark */}
                  <View style={s.bgWatermarkBackSeal} pointerEvents="none">
                    <Image
                      source={require('../assets/images/image copy 2.png')}
                      style={s.paterosBackSealWatermark}
                      resizeMode="contain"
                    />
                  </View>

                  {/* Top Header: Benefits and Privileges Under RA 9257 */}
                  <View style={s.backHeaderContainer}>
                    <Text style={s.backTitleRA}>
                      BENEFITS AND PRIVILEGES UNDER REPUBLIC ACT NO. 9257
                    </Text>
                  </View>

                  {/* Bulleted Benefits List */}
                  <View style={s.backBenefitsList}>
                    <Text style={s.backBulletItem}>
                      *Free medical and dental, diagnosis and laboratory services in all government facilities.
                    </Text>
                    <Text style={s.backBulletItem}>
                      *20% discount in purchase of branded/unbranded generic medicines
                    </Text>
                    <Text style={s.backBulletItem}>
                      *20% discount in hotels, restaurants, recreation centers, etc.
                    </Text>
                    <Text style={s.backBulletItem}>
                      *20% discount in theaters, cinema houses and concert halls, etc.
                    </Text>
                    <Text style={s.backBulletItem}>
                      *20% discount on medical and dental services, diagnostic and laboratory fees in private facilities.
                    </Text>
                    <Text style={s.backBulletItem}>
                      *20% discount in fare for domestic air, sea travel and public land transportation.
                    </Text>
                  </View>

                  {/* Center Legal Warning & Exclusivity Notice */}
                  <View style={s.backNoticeContainer}>
                    <Text style={s.backNoticeTextBold}>
                      Only for the exclusive use of Senior Citizens;
                    </Text>
                    <Text style={s.backNoticeText}>
                      abuse of privileges is punishable by law
                    </Text>
                    <Text style={s.backNoticeTextBold}>
                      Persons and Corporations violating RA 9257 shall be penalized
                    </Text>
                  </View>

                  {/* Bottom Signatories & Signatures */}
                  <View style={s.backSignatoriesRow}>
                    {/* Left: OSCA Chairman */}
                    <View style={s.signatoryBlock}>
                      <View style={s.signatoryImageWrap}>
                        <Image
                          source={require('../assets/images/image copy.png')}
                          style={s.oscaChairmanSignatureImg}
                          resizeMode="contain"
                        />
                      </View>
                      <Text style={s.signatoryName}>NORA R. MACINAS</Text>
                      <Text style={s.signatoryRole}>OSCA-CHAIRMAN</Text>
                    </View>

                    {/* Right: Municipal Mayor */}
                    <View style={s.signatoryBlockRight}>
                      <View style={s.signatoryImageWrapRight}>
                        <Image
                          source={require('../assets/images/image.png')}
                          style={s.mayorSignatureImg}
                          resizeMode="contain"
                        />
                      </View>
                      <Text style={s.signatoryName}>GERALD S. GERMAN</Text>
                      <Text style={s.signatoryRole}>MAYOR</Text>
                    </View>
                  </View>
                </View>
              )}
            </View>

            {/* Flip / Action Floating Pill Buttons */}
            <View style={s.actionRow}>
              <TouchableOpacity
                style={s.actionPill}
                onPress={() => setActiveSide(activeSide === 'front' ? 'back' : 'front')}
                activeOpacity={0.8}
              >
                <Ionicons name="sync-outline" size={17} color={C.oscaGreen} />
                <Text style={s.actionPillText}>
                  {activeSide === 'front' ? 'Flip to Back (Benefits & RA 9257)' : 'Flip to Front (Official Card)'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={s.actionPill}
                onPress={() => setSigModalVisible(true)}
                activeOpacity={0.8}
              >
                <Ionicons name="create-outline" size={16} color={C.oscaGreen} />
                <Text style={s.actionPillText}>
                  {profile?.signature ? 'Update Signature' : 'Sign Digital ID'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Copy ID & Share Quick Bar */}
            <View style={[s.actionRow, { marginTop: -6 }]}>
              <TouchableOpacity
                style={s.actionPillSecondary}
                onPress={() => {
                  setCopiedToast(true);
                  setTimeout(() => setCopiedToast(false), 2500);
                }}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={copiedToast ? 'checkmark-circle' : 'copy-outline'}
                  size={15}
                  color={copiedToast ? C.oscaGreenLight : C.inkSoft}
                />
                <Text style={s.actionPillSecondaryText}>
                  {copiedToast ? 'ID Number Copied!' : `Copy ${idNumberDisplay}`}
                </Text>
              </TouchableOpacity>
            </View>

            {/* ══════════════════════════════════════════════════════════════════════
                DIGITAL QR VERIFICATION EXPANDED CARD
            ══════════════════════════════════════════════════════════════════════ */}
            <View style={s.qrVerificationCard}>
              <View style={s.qrVerificationHeader}>
                <View style={s.qrVerificationTitleRow}>
                  <Ionicons name="shield-checkmark" size={18} color={C.oscaGreen} />
                  <Text style={s.qrVerificationTitle}>Official Digital Verification</Text>
                </View>
                <View style={s.validBadge}>
                  <Text style={s.validBadgeText}>ACTIVE / VALID</Text>
                </View>
              </View>

              <View style={s.qrCardBody}>
                <View style={s.qrWrapper}>
                  <QRCode
                    value={qrPayload}
                    size={84}
                    color={C.oscaGreenDark}
                    backgroundColor="#FFFFFF"
                  />
                </View>

                <View style={s.qrDetailsCol}>
                  <Text style={s.qrDetailsIdLabel}>CARDHOLDER</Text>
                  <Text style={s.qrDetailsName} numberOfLines={1}>{fullNameUpper}</Text>

                  <Text style={[s.qrDetailsIdLabel, { marginTop: 6 }]}>OFFICIAL ID NO.</Text>
                  <Text style={s.qrDetailsIdVal}>{idNumberDisplay}</Text>

                  <Text style={s.qrScanNote}>
                    Scan using any OSCA QR scanner or merchant terminal to verify authenticity.
                  </Text>
                </View>
              </View>
            </View>

            {/* ══════════════════════════════════════════════════════════════════════
                BENEFITS & PRIVILEGES SUMMARY (R.A. 9257 / R.A. 9994)
            ══════════════════════════════════════════════════════════════════════ */}
            <View style={s.infoSection}>
              <View style={s.sectionHeader}>
                <MaterialCommunityIcons
                  name="shield-star-outline"
                  size={20}
                  color={C.oscaGreen}
                />
                <Text style={s.sectionTitle}>Senior Privileges & Benefits</Text>
              </View>

              <View style={s.benefitCard}>
                <View style={s.benefitIconBox}>
                  <Ionicons name="cart-outline" size={18} color={C.oscaGreen} />
                </View>
                <View style={s.benefitContent}>
                  <Text style={s.benefitHeading}>20% Discount & 12% VAT Exemption</Text>
                  <Text style={s.benefitDesc}>
                    Applicable to medicines, medical supplies, doctor consultations, dining, transportation, hotels, and recreational centers.
                  </Text>
                </View>
              </View>

              <View style={s.benefitCard}>
                <View style={s.benefitIconBox}>
                  <Ionicons name="medical-outline" size={18} color={C.oscaGreen} />
                </View>
                <View style={s.benefitContent}>
                  <Text style={s.benefitHeading}>Free Health & Diagnostic Services</Text>
                  <Text style={s.benefitDesc}>
                    Free medical and dental consultations in government hospitals and Pateros health centers.
                  </Text>
                </View>
              </View>

              <View style={s.benefitCard}>
                <View style={s.benefitIconBox}>
                  <Ionicons name="walk-outline" size={18} color={C.oscaGreen} />
                </View>
                <View style={s.benefitContent}>
                  <Text style={s.benefitHeading}>Express Lane Priority</Text>
                  <Text style={s.benefitDesc}>
                    Dedicated lanes in all commercial, banking, and government transactions across the Philippines.
                  </Text>
                </View>
              </View>
            </View>

            {/* Official Municipal Advisory Card */}
            <View style={s.advisoryCard}>
              <Ionicons name="information-circle" size={20} color={C.oscaGold} />
              <View style={s.advisoryContent}>
                <Text style={s.advisoryTitle}>Republic Act No. 9257 & 9994 Compliance</Text>
                <Text style={s.advisoryText}>
                  This digital ID is issued pursuant to RA 9257 / RA 9994 (Expanded Senior Citizens Act). Presenting this card entitles the bearer to all statutory discounts and privileges in all establishments nationwide.
                </Text>
              </View>
            </View>
          </>
        )}
      </ScrollView>

      {/* ══════════════════════════════════════════════════════════════════════
          DIGITAL SIGNATURE FINGER DRAWING MODAL
      ══════════════════════════════════════════════════════════════════════ */}
      {user?.id && (
        <DigitalSignatureModal
          visible={sigModalVisible}
          onClose={() => setSigModalVisible(false)}
          userId={user.id}
          onSaved={handleSignatureSaved}
          currentSignature={profile?.signature}
        />
      )}
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Signature Display Component for the Card
// ─────────────────────────────────────────────────────────────────────────────
function SignatureDisplay({ signature }: { signature?: string | null }) {
  if (!signature) {
    // Default placeholder flourish
    return (
      <View style={s.sigContainer}>
        <Svg width="105" height="22" viewBox="0 0 120 30">
          <Path
            d="M 5 22 Q 15 4, 25 18 T 42 12 Q 55 24, 70 8 T 92 16 Q 105 10, 115 18"
            fill="none"
            stroke="#0F2B48"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <Path
            d="M 12 16 Q 28 8, 38 24"
            fill="none"
            stroke="#0F2B48"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
          <Path
            d="M 85 18 Q 98 4, 108 20"
            fill="none"
            stroke="#0F2B48"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </Svg>
      </View>
    );
  }

  // Check if signature is JSON with vectorized strokes
  try {
    const parsed = JSON.parse(signature);
    if (parsed && Array.isArray(parsed.strokes)) {
      const w = parsed.width || 320;
      const h = parsed.height || 140;
      return (
        <View style={s.sigContainer}>
          <Svg width="105" height="22" viewBox={`0 0 ${w} ${h}`}>
            {parsed.strokes.map((st: { d: string; color: string; width: number }, idx: number) => (
              <Path
                key={idx}
                d={st.d}
                stroke={st.color || '#0F2B48'}
                strokeWidth={st.width || 2.4}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
          </Svg>
        </View>
      );
    }
  } catch {
    // Not JSON, check if image data URL
    if (signature.startsWith('http') || signature.startsWith('data:image')) {
      return (
        <View style={s.sigContainer}>
          <Image
            source={{ uri: signature }}
            style={{ width: 105, height: 22 }}
            resizeMode="contain"
          />
        </View>
      );
    }
  }

  // Fallback flourish
  return (
    <View style={s.sigContainer}>
      <Svg width="105" height="22" viewBox="0 0 120 30">
        <Path
          d="M 5 22 Q 15 4, 25 18 T 42 12 Q 55 24, 70 8 T 92 16 Q 105 10, 115 18"
          fill="none"
          stroke="#0F2B48"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </Svg>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Interactive Finger Drawing Signature Modal
// ─────────────────────────────────────────────────────────────────────────────
const CANVAS_WIDTH = 320;
const CANVAS_HEIGHT = 160;

function DigitalSignatureModal({
  visible,
  onClose,
  userId,
  onSaved,
  currentSignature,
}: {
  visible: boolean;
  onClose: () => void;
  userId: number;
  onSaved: (sig: string) => void;
  currentSignature?: string | null;
}) {
  const { width: winWidth, height: winHeight } = useWindowDimensions();
  const isLandscape = winWidth > winHeight;

  // Auto-switch mobile to landscape when signature modal opens, restore to portrait on close
  useEffect(() => {
    if (Platform.OS !== 'web') {
      if (visible) {
        ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => {});
      } else {
        ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
      }
    }
    return () => {
      if (Platform.OS !== 'web') {
        ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
      }
    };
  }, [visible]);

  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [currentStroke, setCurrentStroke] = useState<Point[]>([]);
  const [selectedColor, setSelectedColor] = useState('#0F2B48');
  const [selectedWidth, setSelectedWidth] = useState(2.8);
  const [saving, setSaving] = useState(false);

  const currentStrokeRef = useRef<Point[]>([]);
  const strokeColorRef = useRef(selectedColor);
  const strokeWidthRef = useRef(selectedWidth);

  strokeColorRef.current = selectedColor;
  strokeWidthRef.current = selectedWidth;

  // Dynamic large canvas dimensions for finger signing
  const canvasWidth = isLandscape
    ? Math.min(Math.max(480, winWidth - 40), 860)
    : Math.min(Math.max(300, winWidth - 36), 460);

  const canvasHeight = isLandscape
    ? Math.min(Math.max(170, winHeight - 100), 300)
    : 220;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        const { locationX, locationY } = evt.nativeEvent;
        currentStrokeRef.current = [{ x: locationX, y: locationY }];
        setCurrentStroke([...currentStrokeRef.current]);
      },
      onPanResponderMove: (evt) => {
        const { locationX, locationY } = evt.nativeEvent;
        const pts = currentStrokeRef.current;
        const last = pts[pts.length - 1];
        if (!last || Math.hypot(locationX - last.x, locationY - last.y) > 1.5) {
          pts.push({ x: locationX, y: locationY });
          setCurrentStroke([...pts]);
        }
      },
      onPanResponderRelease: () => {
        if (currentStrokeRef.current.length > 0) {
          const newStroke: Stroke = {
            points: [...currentStrokeRef.current],
            color: strokeColorRef.current,
            width: strokeWidthRef.current,
          };
          setStrokes((prev) => [...prev, newStroke]);
          currentStrokeRef.current = [];
          setCurrentStroke([]);
        }
      },
    })
  ).current;

  const handleClear = () => {
    setStrokes([]);
    setCurrentStroke([]);
    currentStrokeRef.current = [];
  };

  const handleUndo = () => {
    setStrokes((prev) => prev.slice(0, -1));
  };

  const handleSave = async () => {
    if (strokes.length === 0) {
      Alert.alert('No Signature', 'Please draw your signature using your finger before saving.');
      return;
    }

    setSaving(true);
    try {
      const signaturePayload = JSON.stringify({
        width: canvasWidth,
        height: canvasHeight,
        strokes: strokes.map((s) => ({
          d: strokeToSvgPath(s.points),
          color: s.color,
          width: s.width,
        })),
        savedAt: new Date().toISOString(),
      });

      const res = await saveSignature(userId, signaturePayload);
      if (res.success) {
        onSaved(signaturePayload);
        Alert.alert('Success', 'Your digital signature has been saved to your ID.');
        onClose();
      } else {
        Alert.alert('Save Issue', res.message || 'Could not save signature. Please try again.');
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to save digital signature to the server.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      supportedOrientations={['landscape', 'landscape-left', 'landscape-right', 'portrait']}
    >
      <View style={s.modalOverlay}>
        <View style={[s.modalContainer, isLandscape && s.modalContainerLandscape]}>
          {/* Top Integrated Control Header */}
          <View style={s.modalHeaderRowLandscape}>
            {/* Left: Title Badge */}
            <View style={s.modalHeaderLeft}>
              <Ionicons name="finger-print" size={20} color={C.oscaGreen} />
              <View>
                <Text style={s.modalTitle}>Signature Pad (Landscape)</Text>
                <Text style={s.modalSubtitle}>Sign with your finger on the large area below</Text>
              </View>
            </View>

            {/* Center: Color & Pen Pickers */}
            <View style={s.landscapeCenterControls}>
              <View style={s.colorPickers}>
                {[
                  { color: '#0F2B48', label: 'Navy' },
                  { color: '#111827', label: 'Black' },
                  { color: '#145A32', label: 'Green' },
                  { color: '#003366', label: 'Blue' },
                ].map((c) => (
                  <TouchableOpacity
                    key={c.color}
                    style={[
                      s.colorDot,
                      { backgroundColor: c.color },
                      selectedColor === c.color && s.colorDotActive,
                    ]}
                    onPress={() => setSelectedColor(c.color)}
                  />
                ))}
              </View>

              <View style={s.widthPickers}>
                {[
                  { width: 1.8, label: 'Fine' },
                  { width: 2.8, label: 'Med' },
                  { width: 3.8, label: 'Bold' },
                ].map((w) => (
                  <TouchableOpacity
                    key={w.width}
                    style={[
                      s.widthOption,
                      selectedWidth === w.width && s.widthOptionActive,
                    ]}
                    onPress={() => setSelectedWidth(w.width)}
                  >
                    <Text
                      style={[
                        s.widthOptionText,
                        selectedWidth === w.width && s.widthOptionTextActive,
                      ]}
                    >
                      {w.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Right: Tools & Action Buttons */}
            <View style={s.landscapeRightActions}>
              <TouchableOpacity
                style={s.landscapeToolBtn}
                onPress={handleUndo}
                disabled={strokes.length === 0 || saving}
              >
                <Ionicons name="arrow-undo" size={15} color={strokes.length === 0 ? C.inkFaint : C.ink} />
                <Text style={[s.landscapeToolText, strokes.length === 0 && { color: C.inkFaint }]}>
                  Undo
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={s.landscapeToolBtn}
                onPress={handleClear}
                disabled={strokes.length === 0 || saving}
              >
                <Ionicons name="trash-outline" size={15} color={strokes.length === 0 ? C.inkFaint : '#D32F2F'} />
                <Text style={[s.landscapeToolText, strokes.length === 0 ? { color: C.inkFaint } : { color: '#D32F2F' }]}>
                  Clear
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={s.landscapeCancelBtn}
                onPress={onClose}
                disabled={saving}
              >
                <Text style={s.landscapeCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[s.landscapeSaveBtn, saving && { opacity: 0.7 }]}
                onPress={handleSave}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="checkmark" size={16} color="#FFFFFF" />
                    <Text style={s.landscapeSaveText}>Save</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* Touch Drawing Canvas - Maximized Space for Fingers */}
          <View style={s.canvasWrapper}>
            <View
              style={[
                s.canvasContainer,
                { width: canvasWidth, height: canvasHeight },
              ]}
              {...panResponder.panHandlers}
            >
              <Svg width={canvasWidth} height={canvasHeight}>
                {/* Completed Strokes */}
                {strokes.map((st, i) => (
                  <Path
                    key={i}
                    d={strokeToSvgPath(st.points)}
                    stroke={st.color}
                    strokeWidth={st.width}
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ))}

                {/* Current Active Stroke */}
                {currentStroke.length > 0 && (
                  <Path
                    d={strokeToSvgPath(currentStroke)}
                    stroke={selectedColor}
                    strokeWidth={selectedWidth}
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}
              </Svg>

              {/* Baseline Signature Guideline */}
              <View style={s.canvasBaseline} pointerEvents="none" />
              <Text style={s.canvasHint} pointerEvents="none">
                Sign above the line using your finger (Landscape mode)
              </Text>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: C.bg,
  },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: C.bg,
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
  },
  topBarCenter: {
    alignItems: 'center',
  },
  topBarTitle: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 17,
    color: C.ink,
  },
  topBarSubtitle: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 11,
    color: C.inkFaint,
    marginTop: -2,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: C.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: C.line,
  },
  shareBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: C.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: C.line,
  },

  container: {
    paddingHorizontal: 16,
    paddingBottom: 40,
    paddingTop: 8,
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
  },

  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
    gap: 12,
  },
  loadingTxt: {
    fontFamily: 'Poppins_500Medium',
    fontSize: 14,
    color: C.inkSoft,
    marginTop: 8,
  },
  emptyTitle: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 20,
    color: C.ink,
  },
  emptyText: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 14,
    color: C.inkSoft,
    textAlign: 'center',
    maxWidth: 280,
  },
  loginBtn: {
    backgroundColor: C.oscaGreen,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 28,
    marginTop: 8,
  },
  loginBtnTxt: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 14,
    color: C.white,
  },

  /* ── Tab Switcher ── */
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#E6ECE5',
    borderRadius: 12,
    padding: 3,
    marginBottom: 16,
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 10,
  },
  tabButtonActive: {
    backgroundColor: C.oscaGreen,
  },
  tabButtonText: {
    fontFamily: 'Poppins_500Medium',
    fontSize: 12.5,
    color: C.inkSoft,
  },
  tabButtonTextActive: {
    color: C.white,
    fontFamily: 'Poppins_600SemiBold',
  },

  /* ══════════════════════════════════════════════════════════════════════
     ID CARD REPLICA STYLES
  ══════════════════════════════════════════════════════════════════════ */
  cardOuterShadow: {
    width: '100%',
    borderRadius: 14,
    backgroundColor: C.white,
    marginBottom: 16,
  },

  idCard: {
    width: '100%',
    aspectRatio: CARD_RATIO,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    paddingTop: 8,
    paddingHorizontal: 10,
    paddingBottom: 0,
    position: 'relative',
    justifyContent: 'space-between',
  },
  idCardBack: {
    paddingBottom: 0,
    backgroundColor: '#FAFCF8',
  },

  /* Background Watermarks */
  bgWatermarkTopRight: {
    position: 'absolute',
    top: 0,
    right: 0,
  },
  bgWatermarkBottomLeft: {
    position: 'absolute',
    bottom: 0,
    left: 0,
  },
  bgWatermarkBottomRight: {
    position: 'absolute',
    bottom: 0,
    right: 0,
  },
  bgWatermarkBack: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },

  /* ── Header Row ── */
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 2,
    marginBottom: 3,
  },

  sealWrapper: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paterosSeal: {
    width: 36,
    height: 36,
  },

  headerCenterTitles: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  govTitleCountry: {
    fontFamily: 'serif',
    fontSize: 11,
    color: '#1A202C',
    fontWeight: '700',
    lineHeight: 13,
    textAlign: 'center',
  },
  govTitleMun: {
    fontFamily: 'serif',
    fontSize: 10.5,
    color: '#2D3748',
    lineHeight: 12,
    textAlign: 'center',
  },
  govTitleOsca: {
    fontFamily: 'Poppins_700Bold',
    fontSize: 9.5,
    color: '#0F172A',
    letterSpacing: 0.15,
    marginTop: 1,
    textAlign: 'center',
  },

  /* Stamp Badge on Top Right */
  stampWrapper: {
    width: 38,
    borderWidth: 1,
    borderColor: '#991B1B',
    borderRadius: 2,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    zIndex: 3,
  },
  stampBannerTop: {
    backgroundColor: '#1E3A8A',
    paddingVertical: 1,
    alignItems: 'center',
  },
  stampBannerTopTxt: {
    color: '#FFFFFF',
    fontSize: 5,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  stampBodyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFF5F5',
  },
  stampRedStrip: {
    backgroundColor: '#B91C1C',
    paddingHorizontal: 1.5,
    paddingVertical: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stampVerticalTxt: {
    color: '#FFFFFF',
    fontSize: 4,
    fontWeight: '900',
    lineHeight: 4.5,
  },
  stampCenterArt: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    paddingVertical: 1,
  },

  /* ── Middle: Photo + Info + Front QR ── */
  cardMiddleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 2,
    marginTop: 1,
    gap: 8,
  },

  photoBorderBox: {
    width: 66,
    height: 78,
    borderWidth: 1.5,
    borderColor: '#0F172A',
    borderRadius: 2,
    backgroundColor: '#F1F5F9',
    overflow: 'hidden',
  },
  photoImage: {
    width: '100%',
    height: '100%',
  },
  photoFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E2E8F0',
  },

  detailsColumn: {
    flex: 1,
    justifyContent: 'center',
    paddingTop: 1,
    minWidth: 0,
  },
  detailFullName: {
    fontFamily: 'Poppins_700Bold',
    fontSize: 13.5,
    color: '#0F172A',
    lineHeight: 16,
    marginBottom: 2,
    letterSpacing: 0.1,
  },
  detailAddressLine: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 9.8,
    color: '#1E293B',
    lineHeight: 12.5,
  },
  detailMetaLine: {
    fontFamily: 'Poppins_500Medium',
    fontSize: 9.2,
    color: '#1E293B',
    lineHeight: 12,
    marginTop: 1,
  },
  detailMetaVal: {
    fontFamily: 'Poppins_700Bold',
    color: '#0F172A',
  },

  /* Front QR Code column */
  frontQrCol: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingLeft: 2,
  },
  frontQrBox: {
    padding: 3,
    backgroundColor: '#FFFFFF',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  frontQrBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: '#1E6F3D',
    borderRadius: 999,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  frontQrBadgeTxt: {
    fontFamily: 'Poppins_700Bold',
    fontSize: 5.5,
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },

  /* ── Bottom Metadata Row ── */
  cardBottomMetaRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    zIndex: 2,
    paddingHorizontal: 2,
    marginTop: 1,
    marginBottom: 3,
  },

  idNumberCol: {
    justifyContent: 'flex-end',
  },
  idNumberText: {
    fontFamily: 'Poppins_700Bold',
    fontSize: 11,
    color: '#145A32',
  },
  idNumberBold: {
    fontFamily: 'Poppins_700Bold',
    fontSize: 12,
    color: '#0F172A',
  },
  dateIssuedText: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 8.5,
    color: '#145A32',
    lineHeight: 11,
  },
  dateIssuedVal: {
    fontFamily: 'Poppins_700Bold',
    color: '#0F172A',
  },

  signatureCol: {
    alignItems: 'center',
    width: 110,
  },
  signatureSvgWrap: {
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: -2,
  },
  signatureUnderline: {
    width: '100%',
    height: 1.2,
    backgroundColor: '#0F172A',
  },
  signatureLabel: {
    fontFamily: 'Poppins_700Bold',
    fontSize: 6.8,
    color: '#0F172A',
    letterSpacing: 0.3,
    marginTop: 1,
  },

  /* ── Bottom Non-Transferable Green Strip ── */
  disclaimerStrip: {
    backgroundColor: '#1E6F3D',
    marginHorizontal: -10,
    paddingVertical: 3.5,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 4,
  },
  disclaimerText: {
    fontFamily: 'Poppins_700Bold',
    fontSize: 6.8,
    color: '#FFFFFF',
    letterSpacing: 0.4,
    textAlign: 'center',
  },

  /* ══════════════════════════════════════════════════════════════════════
     BACK OF CARD STYLES (RA 9257 Replica)
  ══════════════════════════════════════════════════════════════════════ */
  bgWatermarkBackSeal: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.07,
  },
  paterosBackSealWatermark: {
    width: 140,
    height: 140,
  },

  backHeaderContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 1,
    paddingBottom: 2,
    zIndex: 2,
  },
  backTitleRA: {
    fontFamily: 'Poppins_700Bold',
    fontSize: 9.2,
    color: '#0F172A',
    letterSpacing: 0.1,
    textAlign: 'center',
  },

  backBenefitsList: {
    paddingHorizontal: 2,
    gap: 1.5,
    zIndex: 2,
  },
  backBulletItem: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 7.8,
    color: '#0F172A',
    lineHeight: 10,
  },

  backNoticeContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 2,
    zIndex: 2,
  },
  backNoticeTextBold: {
    fontFamily: 'Poppins_700Bold',
    fontSize: 7.6,
    color: '#0F172A',
    textAlign: 'center',
    lineHeight: 9.8,
  },
  backNoticeText: {
    fontFamily: 'Poppins_500Medium',
    fontSize: 7.3,
    color: '#0F172A',
    textAlign: 'center',
    lineHeight: 9.5,
  },

  backSignatoriesRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
    paddingBottom: 5,
    zIndex: 2,
  },
  signatoryBlock: {
    alignItems: 'center',
    width: 115,
  },
  signatoryBlockRight: {
    alignItems: 'center',
    width: 105,
  },
  signatoryImageWrap: {
    height: 24,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginBottom: 1,
  },
  oscaChairmanSignatureImg: {
    width: 92,
    height: 24,
  },
  signatoryImageWrapRight: {
    height: 28,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginBottom: -2,
  },
  mayorSignatureImg: {
    width: 65,
    height: 32,
  },
  signatoryName: {
    fontFamily: 'Poppins_700Bold',
    fontSize: 8.2,
    color: '#0F172A',
    textAlign: 'center',
    lineHeight: 10,
  },
  signatoryRole: {
    fontFamily: 'Poppins_700Bold',
    fontSize: 7,
    color: '#0F172A',
    textAlign: 'center',
    lineHeight: 9,
  },

  /* ── Action Buttons ── */
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  actionPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: C.white,
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.line,
  },
  actionPillText: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 12,
    color: C.inkSoft,
  },

  /* ── Digital QR Verification Card ── */
  qrVerificationCard: {
    backgroundColor: C.white,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: C.line,
  },
  qrVerificationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  qrVerificationTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  qrVerificationTitle: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 13.5,
    color: C.ink,
  },
  validBadge: {
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  validBadgeText: {
    fontFamily: 'Poppins_700Bold',
    fontSize: 9,
    color: C.oscaGreen,
    letterSpacing: 0.4,
  },
  qrCardBody: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  qrWrapper: {
    padding: 6,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    ...shadow(C.ink, 0.08, 8, 3),
  },
  qrDetailsCol: {
    flex: 1,
  },
  qrDetailsIdLabel: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 8.5,
    color: C.inkFaint,
    letterSpacing: 0.4,
  },
  qrDetailsName: {
    fontFamily: 'Poppins_700Bold',
    fontSize: 12.5,
    color: C.ink,
    lineHeight: 16,
  },
  qrDetailsIdVal: {
    fontFamily: 'Poppins_700Bold',
    fontSize: 12,
    color: C.oscaGreen,
  },
  qrScanNote: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 9.5,
    color: C.inkSoft,
    lineHeight: 13.5,
    marginTop: 6,
  },

  /* ── Senior Privileges Section ── */
  infoSection: {
    backgroundColor: C.white,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: C.line,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  sectionTitle: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 14.5,
    color: C.ink,
  },

  benefitCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 12,
  },
  benefitIconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#E8F5E9',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  benefitContent: {
    flex: 1,
  },
  benefitHeading: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 12.5,
    color: C.ink,
    marginBottom: 2,
  },
  benefitDesc: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 11,
    color: C.inkSoft,
    lineHeight: 16,
  },

  /* ── Advisory Card ── */
  advisoryCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: C.goldSoft,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: C.goldBorder,
  },
  advisoryContent: {
    flex: 1,
  },
  advisoryTitle: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 12.5,
    color: '#9A6300',
    marginBottom: 2,
  },
  advisoryText: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 11,
    color: '#7D5100',
    lineHeight: 16,
  },

  /* ── Signature On Card & Actions ── */
  sigContainer: {
    width: 105,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signatureLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 1,
  },
  actionPillSecondary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#EAEFE9',
    paddingVertical: 9,
    borderRadius: 10,
  },
  actionPillSecondaryText: {
    fontFamily: 'Poppins_500Medium',
    fontSize: 11.5,
    color: C.inkSoft,
  },

  /* ── Signature Modal Styles ── */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 8,
  },
  modalContainer: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 14,
    ...shadow('#000000', 0.25, 24, 8),
  },
  modalContainerLandscape: {
    maxWidth: 920,
    width: '98%',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },

  /* Landscape Integrated Header Row */
  modalHeaderRowLandscape: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    gap: 8,
  },
  modalHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalTitle: {
    fontFamily: 'Poppins_700Bold',
    fontSize: 13.5,
    color: C.ink,
  },
  modalSubtitle: {
    fontFamily: 'Poppins_400Regular',
    fontSize: 9.5,
    color: C.inkFaint,
  },

  landscapeCenterControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  colorPickers: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  colorDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorDotActive: {
    borderColor: C.oscaGold,
    transform: [{ scale: 1.15 }],
  },
  widthPickers: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    padding: 2,
  },
  widthOption: {
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
  },
  widthOptionActive: {
    backgroundColor: '#FFFFFF',
    ...shadow('#000', 0.08, 4, 1),
  },
  widthOptionText: {
    fontFamily: 'Poppins_500Medium',
    fontSize: 9.5,
    color: C.inkFaint,
  },
  widthOptionTextActive: {
    fontFamily: 'Poppins_600SemiBold',
    color: C.ink,
  },

  landscapeRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  landscapeToolBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
  },
  landscapeToolText: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 11,
    color: C.ink,
  },
  landscapeCancelBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 9,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  landscapeCancelText: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 11.5,
    color: C.inkSoft,
  },
  landscapeSaveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 9,
    backgroundColor: C.oscaGreen,
    ...shadow(C.oscaGreenDark, 0.25, 6, 2),
  },
  landscapeSaveText: {
    fontFamily: 'Poppins_600SemiBold',
    fontSize: 11.5,
    color: '#FFFFFF',
  },

  /* Drawing Canvas */
  canvasWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  canvasContainer: {
    backgroundColor: '#FAFDF9',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    overflow: 'hidden',
    position: 'relative',
  },
  canvasBaseline: {
    position: 'absolute',
    left: 24,
    right: 24,
    bottom: 34,
    height: 1,
    borderBottomWidth: 1.2,
    borderBottomColor: '#94A3B8',
    borderStyle: 'dashed',
  },
  canvasHint: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 8,
    textAlign: 'center',
    fontFamily: 'Poppins_400Regular',
    fontSize: 9.5,
    color: '#94A3B8',
  },
});