import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
  Linking,
  ActivityIndicator,
  Animated,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import BarongElder3D from '../components/assistant/BarongElder3D';
import { speechEngine } from '../lib/speechEngine';
import { useAuth } from '../context/AuthContext';

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL || 'http://localhost:5000';

// Curated Senior Voice Topics (Tap to hear Lolo Aurea speak immediately)
const VOICE_TOPICS = [
  {
    icon: 'card',
    title: 'Digital ID & QR Code',
    desc: 'Paliwanag at pagbukas ng inyong Senior ID',
    action: 'NAVIGATE_DIGITAL_ID',
    speechText: 'Opo, Nanay at Tatay! Heto po ang inyong AUREA Digital Senior ID na may QR Code. Maaari niyo po itong ipakita sa mga botika, grocery, at kainan para sa inyong 20% discount at VAT exemption alinsunod sa batas.',
  },
  {
    icon: 'gift',
    title: 'Birthday Cash Gift',
    desc: 'Pateros Birthday Payout & Schedule',
    action: 'NAVIGATE_BENEFITS',
    speechText: 'Sa ating Bayang Pateros, ang bawat rehistradong Senior Citizen ay may natatanggap na Birthday Cash Gift mula sa pamahalaang bayan. Dadalhin ko po kayo sa Benefit Application para sa detalye ng inyong payout.',
  },
  {
    icon: 'medkit',
    title: 'Libreng Gamot sa Health Center',
    desc: 'Maintenance para sa Hypertension at Diabetes',
    action: 'NAVIGATE_BENEFITS',
    speechText: 'Mayroon po tayong libreng maintenance medicines tulad ng pampababa ng presyon at diabetes sa Pateros Municipal Health Center. Magdala lamang po ng inyong OSCA ID at reseta ng doktor.',
  },
  {
    icon: 'scan',
    title: 'Face Verification',
    desc: 'Mabilis at ligtas na pag-scan ng mukha',
    action: 'NAVIGATE_FACE_VERIFICATION',
    speechText: 'Binubuksan po natin ang Face Verification. Tumingin lamang po kayo nang diretso sa camera upang ligtas na mapatunayan ang inyong pagkakakilanlan sa AUREA.',
  },
  {
    icon: 'shield-checkmark',
    title: '20% Discount & RA 9994',
    desc: 'Mga karapatan ng Senior Citizen sa Pilipinas',
    action: null,
    speechText: 'Sa ilalim ng Republic Act 9994, may karapatan po kayo sa 20 percent discount at exemption sa VAT sa mga gamot, pagkain sa restaurant, pamasahe sa jeep at bus, at 5 percent discount sa kuryente at tubig.',
  },
  {
    icon: 'call',
    title: 'Emergency Hotlines',
    desc: 'Pateros Rescue, Pulis, at OSCA',
    action: 'CALL_HOTLINE',
    speechText: 'Kung kailangan po ninyo ng agarang saklolo, heto po ang mga numero sa Pateros: Rescue (02) 8642-5159 o 911, PNP Pateros (02) 8642-2240, at OSCA Office sa Munisipyo.',
  },
  {
    icon: 'book',
    title: 'Kwentong Bayang Pateros',
    desc: 'Kasaysayan ng Balut, Inutak, at Bayan',
    action: null,
    speechText: 'Kay sarap gunitain ng ating bayang Pateros! Bantog ang ating bayan sa pinakamasarap na Balut at Inutak sa buong kapuluan, at sa kasipagan ng ating mga mag-iitik noong unang panahon sa ilog Pateros.',
  },
  {
    icon: 'heart',
    title: 'Payong Pangkalusugan',
    desc: 'Paalala sa gamot, tubig, at kalusugan',
    action: null,
    speechText: 'Huwag pong kakalimutang uminom ng sapat na tubig araw-araw, mag-ehersisyo ng banayad sa umaga, at inumin sa tamang oras ang inyong maintenance medicines. Mahalaga po ang inyong kalusugan!',
  },
];

export default function AssistantScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const isWebDesktop = Platform.OS === 'web' && width > 768;

  // Assistant State
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentSpeech, setCurrentSpeech] = useState(
    'Magandang araw po! Ako si Lolo Pat. Pindutin lamang po ang alinmang paksa sa ibaba upang aking ipaliwanag nang pasalita.'
  );
  const [activeTopicIndex, setActiveTopicIndex] = useState<number | null>(null);

  // Soundwave Animation Values
  const [waveAnim1] = useState(new Animated.Value(0.3));
  const [waveAnim2] = useState(new Animated.Value(0.6));
  const [waveAnim3] = useState(new Animated.Value(0.9));
  const [waveAnim4] = useState(new Animated.Value(0.4));
  const [waveAnim5] = useState(new Animated.Value(0.8));

  // Animate soundwaves while Lolo is speaking
  useEffect(() => {
    if (isSpeaking) {
      const animateWave = (anim: Animated.Value, duration: number) => {
        return Animated.loop(
          Animated.sequence([
            Animated.timing(anim, {
              toValue: 1.0,
              duration,
              useNativeDriver: false,
            }),
            Animated.timing(anim, {
              toValue: 0.2,
              duration,
              useNativeDriver: false,
            }),
          ])
        );
      };

      const w1 = animateWave(waveAnim1, 320);
      const w2 = animateWave(waveAnim2, 420);
      const w3 = animateWave(waveAnim3, 280);
      const w4 = animateWave(waveAnim4, 480);
      const w5 = animateWave(waveAnim5, 360);

      w1.start();
      w2.start();
      w3.start();
      w4.start();
      w5.start();

      return () => {
        w1.stop();
        w2.stop();
        w3.stop();
        w4.stop();
        w5.stop();
      };
    } else {
      waveAnim1.setValue(0.3);
      waveAnim2.setValue(0.4);
      waveAnim3.setValue(0.5);
      waveAnim4.setValue(0.3);
      waveAnim5.setValue(0.4);
    }
  }, [isSpeaking]);

  // Redirect non-logged in users & Greet user upon opening screen
  useEffect(() => {
    if (!user) {
      router.replace('/login');
      return;
    }

    const fullName = user?.firstName
      ? `${user.firstName} ${user.lastName || ''}`.trim()
      : '';

    const greetingText = `Magandang araw po${
      fullName ? `, ${fullName}` : ''
    }! Ako po si Lolo Pat, ang inyong 3D AI companion sa AUREA. Nandito po ako upang ipaliwanag nang pasalita ang inyong mga serbisyo sa Pateros. Pindutin lamang po ang alinmang paksa sa ibaba.`;

    setCurrentSpeech(greetingText);

    const timer = setTimeout(() => {
      speechEngine.speak(
        greetingText,
        () => setIsSpeaking(true),
        () => setIsSpeaking(false)
      );
    }, 600);

    return () => {
      clearTimeout(timer);
      speechEngine.stop();
    };
  }, [user]);

  // System Action Handler
  const handleSystemAction = (action?: string | null) => {
    if (!action) return;

    setTimeout(() => {
      switch (action) {
        case 'NAVIGATE_DIGITAL_ID':
          router.push('/digital-id' as any);
          break;
        case 'NAVIGATE_BENEFITS':
          router.push('/benefit-application' as any);
          break;
        case 'NAVIGATE_FACE_VERIFICATION':
          router.push('/face-verification' as any);
          break;
        case 'NAVIGATE_PROFILE':
          router.push('/profile' as any);
          break;
        case 'CALL_HOTLINE':
          if (Platform.OS === 'web') {
            window.open('tel:0286425159');
          } else {
            Linking.openURL('tel:0286425159');
          }
          break;
        default:
          break;
      }
    }, 2800);
  };

  // Play Topic Speech using AI Model with fallback
  const handleSelectTopic = async (topic: (typeof VOICE_TOPICS)[0], index: number) => {
    speechEngine.stop();
    setIsSpeaking(false);
    setActiveTopicIndex(index);
    setIsLoading(true);
    setCurrentSpeech('Nag-iisip si Lolo Pat...');

    try {
      const res = await fetch(`${API_BASE_URL}/api/assistant/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: topic.speechText,
          user_profile: user
            ? {
                first_name: user.firstName,
                last_name: user.lastName,
                barangay: (user as any).barangay || 'Pateros',
                senior_id: (user as any).seniorId || (user as any).id,
              }
            : null,
        }),
      });

      let speechToPlay = topic.speechText;
      let actionFromAI = topic.action;

      if (res.ok) {
        const data = await res.json();
        if (data.text) {
          speechToPlay = data.text;
          actionFromAI = data.action || topic.action;
        }
      }

      setCurrentSpeech(speechToPlay);
      speechEngine.speak(
        speechToPlay,
        () => setIsSpeaking(true),
        () => setIsSpeaking(false)
      );

      if (actionFromAI) {
        handleSystemAction(actionFromAI);
      }
    } catch (err) {
      setCurrentSpeech(topic.speechText);
      speechEngine.speak(
        topic.speechText,
        () => setIsSpeaking(true),
        () => setIsSpeaking(false)
      );
      if (topic.action) {
        handleSystemAction(topic.action);
      }
    } finally {
      setIsLoading(false);
    }
  };


  // Replay Voice
  const handleReplayVoice = () => {
    if (currentSpeech) {
      speechEngine.speak(
        currentSpeech,
        () => setIsSpeaking(true),
        () => setIsSpeaking(false)
      );
    }
  };

  // Stop Voice
  const handleStopVoice = () => {
    speechEngine.stop();
    setIsSpeaking(false);
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      {/* ── HEADER ─────────────────────────────────────────── */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => {
            speechEngine.stop();
            router.back();
          }}
          accessibilityLabel="Bumalik sa Dashboard"
        >
          <Ionicons name="arrow-back" size={24} color="#1F5C3E" />
        </TouchableOpacity>

        <View style={styles.headerTitles}>
          <View style={styles.headerTitleRow}>
            <Text style={styles.headerTitle}>Lolo Pat</Text>
            <View style={styles.barongTag}>
              <Text style={styles.barongTagText}>🇵🇭 3D BARONG COMPANION</Text>
            </View>
          </View>
          <Text style={styles.headerSubtitle}>
            Pasalitang Gabay para sa Senior Citizen ng Pateros
          </Text>
        </View>

        {/* Audio Stop / Replay Quick Button */}
        <TouchableOpacity
          style={[styles.audioCtrlBtn, isSpeaking ? styles.audioCtrlActive : styles.audioCtrlInactive]}
          onPress={isSpeaking ? handleStopVoice : handleReplayVoice}
          accessibilityLabel={isSpeaking ? 'Itigil ang boses' : 'Ulitin ang sinabi'}
        >
          <Ionicons
            name={isSpeaking ? 'volume-high' : 'refresh'}
            size={20}
            color={isSpeaking ? '#FFFFFF' : '#1F5C3E'}
          />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollBody}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.mainLayout, isWebDesktop && styles.mainLayoutDesktop]}>
          {/* ── 3D MODEL STAGE ───────────────────────────────── */}
          <LinearGradient
            colors={['#EBF5ED', '#FDF8EF', '#E2EEE5']}
            style={styles.stageGradient}
          >
            {/* Status Pill */}
            <View style={styles.statusPill}>
              {isSpeaking ? (
                <>
                  <View style={[styles.statusDot, { backgroundColor: '#C4892E' }]} />
                  <Text style={styles.statusText}>Nagsasalita si Lolo Pat...</Text>
                </>
              ) : (
                <>
                  <View style={[styles.statusDot, { backgroundColor: '#22C55E' }]} />
                  <Text style={styles.statusText}>Pindutin ang paksa upang magsalita si Lolo</Text>
                </>
              )}
            </View>

            {/* 3D Senior Citizen Avatar wearing Barong Tagalog */}
            <BarongElder3D
              isSpeaking={isSpeaking}
              height={isWebDesktop ? 400 : 300}
            />

            {/* Animated Sound Wave Visualizer */}
            <View style={styles.soundWaveRow}>
              <Animated.View style={[styles.waveBar, { transform: [{ scaleY: waveAnim1 }] }]} />
              <Animated.View style={[styles.waveBar, { transform: [{ scaleY: waveAnim2 }] }]} />
              <Animated.View style={[styles.waveBar, { transform: [{ scaleY: waveAnim3 }] }]} />
              <Animated.View style={[styles.waveBar, { transform: [{ scaleY: waveAnim4 }] }]} />
              <Animated.View style={[styles.waveBar, { transform: [{ scaleY: waveAnim5 }] }]} />
            </View>
          </LinearGradient>

          {/* ── LIVE SPOKEN SUBTITLE CARD ─────────────────────── */}
          <View style={styles.speechCard}>
            <View style={styles.speechHeader}>
              <View style={styles.speechHeaderLeft}>
                <Ionicons name="volume-high" size={18} color="#C4892E" />
                <Text style={styles.speechHeaderTitle}>Sinasabi ni Lolo Pat:</Text>
              </View>

              <View style={styles.speechActionBtns}>
                {isSpeaking ? (
                  <TouchableOpacity
                    onPress={handleStopVoice}
                    style={styles.stopBtn}
                    accessibilityLabel="Itigil ang boses"
                  >
                    <Ionicons name="stop-circle" size={16} color="#DC2626" />
                    <Text style={styles.stopBtnText}>Itigil</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    onPress={handleReplayVoice}
                    style={styles.replayBtn}
                    accessibilityLabel="Ulitin ang boses"
                  >
                    <Ionicons name="refresh-circle" size={16} color="#1F5C3E" />
                    <Text style={styles.replayBtnText}>Ulitin</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            <View style={styles.speechContentWrap}>
              <Text style={styles.speechText}>{currentSpeech}</Text>
            </View>
          </View>

          {/* ── SPOKEN TOPICS (ONE-TOUCH TO HEAR LOLO SPEAK) ─── */}
          <View style={styles.topicsSection}>
            <View style={styles.topicsHeaderRow}>
              <Ionicons name="sparkles" size={16} color="#C4892E" />
              <Text style={styles.topicsHeading}>
                PUMILI NG PAKSA (IPAPALIWANAG NI LOLO NANG PASALITA):
              </Text>
            </View>

            <View style={styles.topicsGrid}>
              {VOICE_TOPICS.map((topic, idx) => {
                const isActive = activeTopicIndex === idx;
                return (
                  <TouchableOpacity
                    key={idx}
                    style={[
                      styles.topicCard,
                      isWebDesktop && styles.topicCardDesktop,
                      isActive && styles.topicCardActive,
                    ]}
                    onPress={() => handleSelectTopic(topic, idx)}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel={`Pakinggan ang paliwanag sa ${topic.title}`}
                  >
                    <View
                      style={[
                        styles.topicIconCircle,
                        isActive && { backgroundColor: '#1F5C3E' },
                      ]}
                    >
                      <Ionicons
                        name={topic.icon as any}
                        size={22}
                        color={isActive ? '#FFFFFF' : '#1F5C3E'}
                      />
                    </View>

                    <View style={styles.topicTextCol}>
                      <Text
                        style={[
                          styles.topicTitle,
                          isActive && { color: '#1F5C3E', fontWeight: '800' },
                        ]}
                      >
                        {topic.title}
                      </Text>
                      <Text style={styles.topicDesc}>{topic.desc}</Text>
                    </View>

                    <View
                      style={[
                        styles.speakerMiniIcon,
                        isActive && { backgroundColor: '#C4892E' },
                      ]}
                    >
                      <Ionicons
                        name="volume-high"
                        size={15}
                        color={isActive ? '#FFFFFF' : '#C4892E'}
                      />
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F6F8F2',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E4EAE0',
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#EEF4EF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  headerTitles: {
    flex: 1,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#132018',
    letterSpacing: 0.2,
  },
  barongTag: {
    backgroundColor: '#FDF7EB',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E8D5B5',
  },
  barongTagText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#7E5417',
    letterSpacing: 0.5,
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#71857A',
    fontWeight: '500',
    marginTop: 1,
  },
  audioCtrlBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  audioCtrlActive: {
    backgroundColor: '#1F5C3E',
  },
  audioCtrlInactive: {
    backgroundColor: '#EEF4EF',
  },
  scrollBody: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  mainLayout: {
    width: '100%',
    paddingHorizontal: 16,
    paddingTop: 12,
    alignSelf: 'center',
  },
  mainLayoutDesktop: {
    maxWidth: 960,
  },
  stageGradient: {
    width: '100%',
    borderRadius: 28,
    paddingTop: 12,
    paddingBottom: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#DCEFE3',
    position: 'relative',
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#1F5C3E', shadowOpacity: 0.1, shadowRadius: 12 },
      android: { elevation: 3 },
      web: { boxShadow: '0 8px 30px rgba(31, 92, 62, 0.08)' },
    }),
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#DCEFE3',
    marginBottom: 4,
    ...Platform.select({
      web: { boxShadow: '0 4px 12px rgba(0,0,0,0.06)' },
      default: {},
    }),
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  statusText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#132018',
  },
  soundWaveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 24,
    marginTop: 8,
  },
  waveBar: {
    width: 4,
    height: 22,
    backgroundColor: '#C4892E',
    borderRadius: 2,
  },
  speechCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 18,
    marginTop: 16,
    borderWidth: 1.5,
    borderColor: '#C4892E',
    ...Platform.select({
      ios: { shadowColor: '#C4892E', shadowOpacity: 0.15, shadowRadius: 10 },
      android: { elevation: 3 },
      web: { boxShadow: '0 6px 20px rgba(196, 137, 46, 0.12)' },
    }),
  },
  speechHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F5ECE0',
  },
  speechHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  speechHeaderTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#7E5417',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  speechActionBtns: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  replayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EEF4EF',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  replayBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1F5C3E',
  },
  stopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEE2E2',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  stopBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#DC2626',
  },
  speechContentWrap: {
    minHeight: 60,
  },
  speechText: {
    fontSize: 17.5,
    lineHeight: 27,
    fontWeight: '600',
    color: '#132018',
  },
  topicsSection: {
    marginTop: 20,
  },
  topicsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  topicsHeading: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#71857A',
    letterSpacing: 0.6,
  },
  topicsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  topicCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    width: '100%',
    borderWidth: 1.5,
    borderColor: '#E4EAE0',
    gap: 12,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4 },
      android: { elevation: 1 },
      web: { boxShadow: '0 2px 8px rgba(0,0,0,0.04)', cursor: 'pointer' },
    }),
  },
  topicCardDesktop: {
    width: '48.8%',
  },
  topicCardActive: {
    borderColor: '#1F5C3E',
    backgroundColor: '#F7FBF8',
  },
  topicIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#EEF4EF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topicTextCol: {
    flex: 1,
  },
  topicTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#132018',
    marginBottom: 2,
  },
  topicDesc: {
    fontSize: 12.5,
    color: '#71857A',
  },
  speakerMiniIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FDF7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
