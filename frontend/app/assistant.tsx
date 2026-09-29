/**
 * frontend/app/assistant.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Lolo Aurea — 3D AI Senior Citizen Voice & Visual Companion for Pateros.
 *
 * Features:
 *   - Interactive 3D Barong Tagalog Senior Character
 *   - Synchronized Lip-Sync
 *   - Voice Input / Text Chat
 *   - Senior Citizen Accessible UI
 *   - Quick-Access Pateros Benefit Topics
 *   - Long-Term Memory System
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
  Linking,
  ActivityIndicator,
  TextInput,
  useWindowDimensions,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';

import BlenderElder3D from '../components/assistant/BlenderElder3D';
import { speechEngine } from '../lib/speechEngine';
import { useAuth } from '../context/AuthContext';
import { Emotion } from '../types/lolo';
import { sendLoloMessage } from '../services/loloApi';

interface SpeechTopic {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  desc: string;
  action: string | null;
  speechText: string;
  emotion?: Emotion;
}

// ─────────────────────────────────────────────────────────────────────────────
// VOICE TOPICS
// ─────────────────────────────────────────────────────────────────────────────

const VOICE_TOPICS: SpeechTopic[] = [
  {
    icon: 'card',
    title: 'Digital ID & QR Code',
    desc: 'Paliwanag at pagbukas ng inyong Senior ID',
    action: 'NAVIGATE_DIGITAL_ID',
    speechText:
      'Opo, Nanay at Tatay! Heto po ang inyong AUREA Digital Senior ID na may QR Code. Maaari niyo po itong ipakita sa mga botika, grocery, at kainan para sa inyong 20% discount at VAT exemption alinsunod sa batas.',
    emotion: 'happy',
  },
  {
    icon: 'gift',
    title: 'Mga Benepisyo sa Pateros',
    desc: 'Lokal na ayuda, kaarawan cash gift, at allowance',
    action: 'NAVIGATE_BENEFITS',
    speechText:
      'Sa ating Bayang Pateros, ang bawat rehistradong Senior Citizen ay may natatanggap na Birthday Cash Gift mula sa pamahalaang bayan. Dadalhin ko po kayo sa Benefit Application para sa detalye ng inyong payout.',
    emotion: 'excited',
  },
  {
    icon: 'megaphone',
    title: 'Mga Anunsyo ng Munisipyo',
    desc: 'Iskedyul ng payout, libreng bakuna, at aktibidad',
    action: 'NAVIGATE_ANNOUNCEMENTS',
    speechText:
      'Palagi pong mag-antabay sa ating mga anunsyo para sa petsa ng payout ng social pension, libreng bakuna laban sa flu at pulmonya, at mga aktibidad ng OSCA Pateros.',
    emotion: 'neutral',
  },
  {
    icon: 'calendar',
    title: 'Aking Iskedyul at Appointments',
    desc: 'Iskedyul ng gamot, checkup, at claim ng ayuda',
    action: 'NAVIGATE_SCHEDULE',
    speechText:
      'Maaari ninyo pong suriin ang inyong nakatakdang appointments sa duktor at mga araw ng payout upang hindi po kayo mahuli sa inyong mga transaksyon.',
    emotion: 'thinking',
  },
  {
    icon: 'shield-checkmark',
    title: '20% Discount & RA 9994',
    desc: 'Mga karapatan ng Senior Citizen sa Pilipinas',
    action: null,
    speechText:
      'Sa ilalim ng Republic Act 9994, may karapatan po kayo sa 20 percent discount at exemption sa VAT sa mga gamot, pagkain sa restaurant, pamasahe sa jeep at bus, at 5 percent discount sa kuryente at tubig.',
    emotion: 'happy',
  },
  {
    icon: 'call',
    title: 'Emergency Hotlines',
    desc: 'Pateros Rescue, Pulis, at OSCA',
    action: 'CALL_HOTLINE',
    speechText:
      'Kung kailangan po ninyo ng agarang saklolo, heto po ang mga numero sa Pateros: Rescue (02) 8642-5159 o 911, PNP Pateros (02) 8642-2240, at OSCA Office sa Munisipyo.',
    emotion: 'neutral',
  },
  {
    icon: 'heart',
    title: 'Payong Pangkalusugan',
    desc: 'Paalala sa gamot, tubig, at kalusugan',
    action: null,
    speechText:
      'Huwag pong kakalimutang uminom ng sapat na tubig araw-araw, mag-ehersisyo ng banayad sa umaga, at inumin sa tamang oras ang inyong maintenance medicines. Mahalaga po ang inyong kalusugan!',
    emotion: 'happy',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// SCREEN
// ─────────────────────────────────────────────────────────────────────────────

export default function AssistantScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { width } = useWindowDimensions();

  const isWebDesktop =
    Platform.OS === 'web' && width > 768;

  const scrollViewRef = useRef<ScrollView>(null);

    // Hands-free mode
  const handsFreeRef = useRef(true);   // false when the user mutes the mic
  const busyRef = useRef(false);       // true while waiting for an AI answer
  const [handsFree, setHandsFree] = useState(true);

  const resumeListening = () => {
    if (!handsFreeRef.current || busyRef.current) return;

    // small gap so the mic doesn't catch the tail of Lolo's voice
    setTimeout(() => {
      if (!handsFreeRef.current || busyRef.current) return;

      setIsListening(true);

      speechEngine.startHandsFree(
        (text) => {
          setIsListening(false);
          handleSendCustomQuery(text);
        },
        (err) => {
          console.warn('[Assistant] hands-free error:', err);
          setIsListening(false);
        }
      );
    }, 500);
  };

  // Speak, and start listening again when finished
  const speakAndResume = (text: string) => {
    speechEngine.speak(
      text,
      () => {
        setIsSpeaking(true);
        setIsListening(false);
      },
      () => {
        setIsSpeaking(false);
        resumeListening();
      }
    );
  };

  // ───────────────────────────────────────────────────────────────────────────
  // STATE
  // ───────────────────────────────────────────────────────────────────────────

  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const [currentEmotion, setCurrentEmotion] =
    useState<Emotion>('happy');

  const [inputText, setInputText] = useState('');

  const [currentSpeech, setCurrentSpeech] = useState(
    'Magandang araw po! Ako si Lolo Aurea. Pindutin lamang po ang mikropono o magtanong sa akin.'
  );

  const [activeTopicIndex, setActiveTopicIndex] =
    useState<number | null>(null);

  // ───────────────────────────────────────────────────────────────────────────
  // INITIAL GREETING
  // ───────────────────────────────────────────────────────────────────────────

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
    }! Ako po si Lolo Aurea, ang inyong 3D AI companion sa AUREA. Nandito po ako upang ipaliwanag ang mga serbisyo sa Pateros. Magsalita lamang po kayo, nakikinig po ako.`;

    setCurrentSpeech(greetingText);

    const timer = setTimeout(() => {
      speakAndResume(greetingText);
    }, 600);

    return () => {
      clearTimeout(timer);
      handsFreeRef.current = false;
      speechEngine.stopHandsFree();
      speechEngine.stop();
    };
  }, [user]);
  // ───────────────────────────────────────────────────────────────────────────
  // SYSTEM ACTIONS
  // ───────────────────────────────────────────────────────────────────────────

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

  // ───────────────────────────────────────────────────────────────────────────
  // SELECT TOPIC
  // ───────────────────────────────────────────────────────────────────────────
  const handleSelectTopic = async (
    topic: SpeechTopic,
    index: number
  ) => {
    busyRef.current = true;
    speechEngine.stopHandsFree();
    speechEngine.stop();

    setIsListening(false);
    setIsSpeaking(false);
    setActiveTopicIndex(index);
    setIsLoading(true);
    setCurrentEmotion(topic.emotion || 'happy');

    setCurrentSpeech(
      'Sandali lang po, inihahanda ni Lolo Aurea ang sagot...'
    );

    // filler: plain speak, no resume
    speechEngine.speak(
      'Sandali lang po, inihahanda ko ang sagot.',
      () => setIsSpeaking(true),
      () => setIsSpeaking(false)
    );

    try {
      const data = await sendLoloMessage({
        userId: Number((user as any)?.id || 0),
        message: topic.speechText,
        language: 'fil',
        userProfile: user
          ? {
              firstName: user.firstName,
              lastName: user.lastName,
              barangay: (user as any).barangay || 'Pateros',
            }
          : undefined,
      });

      speechEngine.stop();

      const speechToPlay = data.message || topic.speechText;
      const actionFromAI = data.action || topic.action;

      if (data.emotion) setCurrentEmotion(data.emotion);

      setCurrentSpeech(speechToPlay);
      busyRef.current = false;
      speakAndResume(speechToPlay);

      if (actionFromAI) handleSystemAction(actionFromAI);
    } catch {
      speechEngine.stop();
      setCurrentSpeech(topic.speechText);
      busyRef.current = false;
      speakAndResume(topic.speechText);

      if (topic.action) handleSystemAction(topic.action);
    } finally {
      busyRef.current = false;
      setIsLoading(false);
    }
  };
  // ───────────────────────────────────────────────────────────────────────────
  // CUSTOM QUERY
  // ───────────────────────────────────────────────────────────────────────────

   const handleSendCustomQuery = async (queryText: string) => {
    const textToSend = queryText.trim();
    if (!textToSend) return;

    busyRef.current = true;
    speechEngine.stopHandsFree();
    speechEngine.stop();

    setInputText('');
    setIsListening(false);
    setIsSpeaking(false);
    setIsLoading(true);
    setCurrentEmotion('thinking');

    setCurrentSpeech(
      'Sandali lang po, iniisip ni Lolo Aurea ang inyong tanong...'
    );

    // filler: plain speak, no resume
    speechEngine.speak(
      'Sandali lang po, iniisip ko ang inyong tanong.',
      () => setIsSpeaking(true),
      () => setIsSpeaking(false)
    );

    try {
      const data = await sendLoloMessage({
        userId: Number((user as any)?.id || 0),
        message: textToSend,
        language: 'fil',
        userProfile: user
          ? {
              firstName: user.firstName,
              lastName: user.lastName,
              barangay: (user as any).barangay || 'Pateros',
            }
          : undefined,
      });

      speechEngine.stop();

      if (data.success) {
        const responseText =
          data.message || 'Opo, naintindihan ko po kayo.';

        setCurrentEmotion(data.emotion ? data.emotion : 'happy');
        setCurrentSpeech(responseText);

        busyRef.current = false;
        speakAndResume(responseText);

        if (data.action) handleSystemAction(data.action);
      } else {
        throw new Error(data.error || 'LOLO response failed');
      }
    } catch {
      speechEngine.stop();

      const fallbackText =
        'Pasensya na po, medyo mahina ang signal. Subukan po nating muli o magtanong ulit.';

      setCurrentSpeech(fallbackText);
      busyRef.current = false;
      speakAndResume(fallbackText);
    } finally {
      busyRef.current = false;
      setIsLoading(false);
    }
  };
  // ───────────────────────────────────────────────────────────────────────────
  // MICROPHONE
  // ───────────────────────────────────────────────────────────────────────────

    const handleToggleListening = () => {
    if (handsFreeRef.current) {
      // mute
      handsFreeRef.current = false;
      setHandsFree(false);
      setIsListening(false);
      speechEngine.stopHandsFree();
    } else {
      // unmute
      handsFreeRef.current = true;
      setHandsFree(true);
      resumeListening();
    }
  };
  // ───────────────────────────────────────────────────────────────────────────
  // REPLAY
  // ───────────────────────────────────────────────────────────────────────────

  const handleReplayVoice = () => {
    if (!currentSpeech) return;

    speechEngine.speak(
      currentSpeech,
      () => setIsSpeaking(true),
      () => setIsSpeaking(false)
    );
  };

  // ───────────────────────────────────────────────────────────────────────────
  // STOP
  // ───────────────────────────────────────────────────────────────────────────

  const handleStopVoice = () => {
    speechEngine.stop();
    setIsSpeaking(false);
  };

  // ───────────────────────────────────────────────────────────────────────────
  // UI
  // ───────────────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView
      style={styles.safeArea}
      edges={['top', 'left', 'right']}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={
          Platform.OS === 'ios'
            ? 'padding'
            : undefined
        }
      >

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* HEADER                                                              */}
        {/* ═══════════════════════════════════════════════════════════════════ */}

        <View style={styles.header}>

                    <TouchableOpacity
            style={[
              styles.micButton,
              !handsFree && styles.micButtonActive, // red = muted
            ]}
            onPress={handleToggleListening}
            accessibilityLabel={
              handsFree
                ? 'I-mute ang mikropono'
                : 'I-unmute ang mikropono'
            }
          >
            <Ionicons
              name={handsFree ? 'mic' : 'mic-off'}
              size={26}
              color="#FFFFFF"
            />
          </TouchableOpacity>

          <View style={styles.headerTitles}>

            <View style={styles.headerTitleRow}>

              <Text style={styles.headerTitle}>
                Lolo Aurea
              </Text>

              <View style={styles.barongTag}>
                <Text style={styles.barongTagText}>
                  🇵🇭 3D BARONG COMPANION
                </Text>
              </View>

            </View>

            <Text style={styles.headerSubtitle}>
              Pasalitang Gabay para sa Senior Citizen ng Pateros
            </Text>

          </View>

          <TouchableOpacity
            style={styles.memoriesBtn}
            onPress={() => {
              speechEngine.stop();
              router.push('/memories' as any);
            }}
            accessibilityLabel="Tingnan ang mga Alaala ni Lolo"
          >
            <Ionicons
              name="book-outline"
              size={20}
              color="#C4892E"
            />

            <Text style={styles.memoriesBtnText}>
              Alaala
            </Text>
          </TouchableOpacity>

        </View>

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* BODY                                                                */}
        {/* ═══════════════════════════════════════════════════════════════════ */}

        <ScrollView
          ref={scrollViewRef}
          style={styles.scrollBody}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >

          <View
            style={[
              styles.mainLayout,
              isWebDesktop &&
                styles.mainLayoutDesktop,
            ]}
          >

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* CLEAN 3D TALKING HEAD STAGE                                    */}
            {/* ═══════════════════════════════════════════════════════════════ */}

            <View style={styles.avatarStage}>

              <LinearGradient
                colors={[
                  '#F1F7F1',
                  '#FAF8F1',
                  '#EAF3EC',
                ]}
                style={styles.avatarBackground}
              >

                <View style={styles.avatarGlow} />

                <View style={styles.avatarContainer}>

                  <BlenderElder3D
                    isSpeaking={isSpeaking}
                    height={
                      isWebDesktop
                        ? 470
                        : 430
                    }
                  />

                </View>

                {/* Small voice status only */}
                {isSpeaking && (
                  <View style={styles.speakingPill}>
                    <View
                      style={
                        styles.speakingDot
                      }
                    />

                    <Ionicons
                      name="volume-high"
                      size={16}
                      color="#1F5C3E"
                    />

                    <Text
                      style={
                        styles.speakingPillText
                      }
                    >
                      Lolo Aurea is speaking...
                    </Text>
                  </View>
                )}

                {isListening && (
                  <View
                    style={[
                      styles.speakingPill,
                      styles.listeningPill,
                    ]}
                  >
                    <View
                      style={[
                        styles.speakingDot,
                        styles.listeningDot,
                      ]}
                    />

                    <Ionicons
                      name="mic"
                      size={16}
                      color="#1F5C3E"
                    />

                    <Text
                      style={
                        styles.speakingPillText
                      }
                    >
                      Nakikinig si Lolo Aurea...
                    </Text>
                  </View>
                )}

              </LinearGradient>

            </View>

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* SMALL CURRENT RESPONSE                                        */}
            {/* ═══════════════════════════════════════════════════════════════ */}

            {isLoading && (
              <View style={styles.loadingIndicatorCard}>

                <ActivityIndicator
                  size="small"
                  color="#1F5C3E"
                />

                <Text style={styles.loadingText}>
                  Iniisip ni Lolo Aurea ang sagot...
                </Text>

              </View>
            )}

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* TOPICS                                                           */}
            {/* ═══════════════════════════════════════════════════════════════ */}

            <View style={styles.topicsSection}>

              <View
                style={styles.sectionHeaderRow}
              >

                <View
                  style={styles.sectionIconPill}
                >
                  <Ionicons
                    name="sparkles"
                    size={16}
                    color="#C4892E"
                  />
                </View>

                <Text style={styles.sectionTitle}>
                  Mga Karaniwang Tanong sa Serbisyo
                </Text>

              </View>

              <Text
                style={styles.sectionSubtitle}
              >
                Pindutin ang alinmang kard upang ipaliwanag ito ni Lolo Aurea.
              </Text>

              <View style={styles.topicGrid}>

                {VOICE_TOPICS.map(
                  (topic, idx) => {
                    const isActive =
                      activeTopicIndex === idx &&
                      isSpeaking;

                    return (
                      <TouchableOpacity
                        key={idx}
                        style={[
                          styles.topicCard,

                          isWebDesktop &&
                            styles.topicCardDesktop,

                          isActive &&
                            styles.topicCardActive,
                        ]}
                        onPress={() =>
                          handleSelectTopic(
                            topic,
                            idx
                          )
                        }
                        activeOpacity={0.85}
                        accessibilityRole="button"
                        accessibilityLabel={`Pakinggan ang paliwanag sa ${topic.title}`}
                      >

                        <View
                          style={[
                            styles.topicIconCircle,

                            isActive && {
                              backgroundColor:
                                '#1F5C3E',
                            },
                          ]}
                        >

                          <Ionicons
                            name={
                              topic.icon as any
                            }
                            size={24}
                            color={
                              isActive
                                ? '#FFFFFF'
                                : '#1F5C3E'
                            }
                          />

                        </View>

                        <View
                          style={
                            styles.topicTextCol
                          }
                        >

                          <Text
                            style={[
                              styles.topicTitle,

                              isActive && {
                                color:
                                  '#1F5C3E',
                                fontWeight:
                                  '800',
                              },
                            ]}
                          >
                            {topic.title}
                          </Text>

                          <Text
                            style={
                              styles.topicDesc
                            }
                          >
                            {topic.desc}
                          </Text>

                        </View>

                        <View
                          style={[
                            styles.speakerMiniIcon,

                            isActive && {
                              backgroundColor:
                                '#C4892E',
                            },
                          ]}
                        >

                          <Ionicons
                            name="volume-high"
                            size={16}
                            color={
                              isActive
                                ? '#FFFFFF'
                                : '#C4892E'
                            }
                          />

                        </View>

                      </TouchableOpacity>
                    );
                  }
                )}

              </View>

            </View>

          </View>

        </ScrollView>

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* INPUT DOCK                                                          */}
        {/* ═══════════════════════════════════════════════════════════════════ */}

        <View style={styles.inputDock}>

          <TouchableOpacity
            style={[
              styles.micButton,

              isListening &&
                styles.micButtonActive,
            ]}
            onPress={handleToggleListening}
            accessibilityLabel={
              isListening
                ? 'Tapusin ang pagsasalita'
                : 'Magsalita kay Lolo Aurea'
            }
          >

            <Ionicons
              name={
                isListening
                  ? 'radio'
                  : 'mic'
              }
              size={26}
              color="#FFFFFF"
            />

          </TouchableOpacity>

          <TextInput
            style={styles.textInputField}
                        placeholder={
              !handsFree
                ? 'Naka-mute ang mikropono. Mag-type dito...'
                : 'Nakikinig po ako, o mag-type dito...'
            }
            placeholderTextColor="#8C9E94"
            value={inputText}
            onChangeText={setInputText}
            onSubmitEditing={() =>
              handleSendCustomQuery(
                inputText
              )
            }
            returnKeyType="send"
          />

          <TouchableOpacity
            style={[
              styles.sendButton,

              !inputText.trim() &&
                styles.sendButtonDisabled,
            ]}
            onPress={() =>
              handleSendCustomQuery(
                inputText
              )
            }
            disabled={
              !inputText.trim() ||
              isLoading
            }
            accessibilityLabel="Ipadala ang tanong"
          >

            <Ionicons
              name="send"
              size={18}
              color="#FFFFFF"
            />

          </TouchableOpacity>

        </View>

      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({

  safeArea: {
    flex: 1,
    backgroundColor: '#F6F8F2',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // HEADER
  // ─────────────────────────────────────────────────────────────────────────

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E4EAE0',
    gap: 12,
  },

  headerBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#EEF4EF',
    alignItems: 'center',
    justifyContent: 'center',
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
    fontSize: 20,
    fontWeight: '800',
    color: '#132018',
    letterSpacing: 0.2,
  },

  barongTag: {
    backgroundColor: '#FDF7EB',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E8D5B5',
  },

  barongTagText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#7E5417',
    letterSpacing: 0.5,
  },

  headerSubtitle: {
    fontSize: 12.5,
    color: '#5B7064',
    fontWeight: '500',
    marginTop: 2,
  },

  memoriesBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FCF8ED',
    borderWidth: 1,
    borderColor: '#E8D5B5',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
  },

  memoriesBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#92400E',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // SCROLL
  // ─────────────────────────────────────────────────────────────────────────

  scrollBody: {
    flex: 1,
  },

  scrollContent: {
    paddingBottom: 24,
  },

  mainLayout: {
    width: '100%',
    paddingHorizontal: 16,
    paddingTop: 14,
    alignSelf: 'center',
  },

  mainLayoutDesktop: {
    maxWidth: 980,
  },

  // ─────────────────────────────────────────────────────────────────────────
  // NEW CLEAN AVATAR AREA
  // ─────────────────────────────────────────────────────────────────────────

  avatarStage: {
    width: '100%',
    height: 450,
    borderRadius: 30,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: '#DCEFE3',

    ...Platform.select({
      ios: {
        shadowColor: '#1F5C3E',
        shadowOpacity: 0.10,
        shadowRadius: 14,
        shadowOffset: {
          width: 0,
          height: 6,
        },
      },

      android: {
        elevation: 4,
      },

      web: {
        boxShadow:
          '0 8px 30px rgba(31, 92, 62, 0.08)',
      },
    }),
  },

  avatarBackground: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'flex-end',
    position: 'relative',
  },

  avatarGlow: {
    position: 'absolute',
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor:
      'rgba(255,255,255,0.58)',
    top: 65,
  },

  avatarContainer: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'flex-end',
    zIndex: 2,
  },

  // ─────────────────────────────────────────────────────────────────────────
  // SPEAKING STATUS
  // ─────────────────────────────────────────────────────────────────────────

  speakingPill: {
    position: 'absolute',
    bottom: 16,
    alignSelf: 'center',

    flexDirection: 'row',
    alignItems: 'center',

    backgroundColor:
      'rgba(255,255,255,0.92)',

    paddingHorizontal: 14,
    paddingVertical: 8,

    borderRadius: 22,

    borderWidth: 1,
    borderColor: '#DDE9DF',

    gap: 7,

    zIndex: 10,

    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.08,
        shadowRadius: 6,
      },

      android: {
        elevation: 3,
      },

      web: {
        boxShadow:
          '0 3px 12px rgba(0,0,0,0.08)',
      },
    }),
  },

  listeningPill: {
    backgroundColor:
      'rgba(239,248,241,0.96)',
    borderColor: '#BBDCC5',
  },

  speakingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#1F5C3E',
  },

  listeningDot: {
    backgroundColor: '#C4892E',
  },

  speakingPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1F5C3E',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // LOADING
  // ─────────────────────────────────────────────────────────────────────────

  loadingIndicatorCard: {
    marginTop: 12,

    flexDirection: 'row',
    alignItems: 'center',

    justifyContent: 'center',

    gap: 9,

    backgroundColor: '#FFFFFF',

    borderRadius: 18,

    paddingVertical: 12,
    paddingHorizontal: 16,

    borderWidth: 1,
    borderColor: '#E2EEE5',
  },

  loadingText: {
    fontSize: 14,
    color: '#55695E',
    fontStyle: 'italic',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // TOPICS
  // ─────────────────────────────────────────────────────────────────────────

  topicsSection: {
    marginTop: 20,
  },

  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },

  sectionIconPill: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FDF7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },

  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#132018',
  },

  sectionSubtitle: {
    fontSize: 13.5,
    color: '#5B7064',
    marginBottom: 12,
    lineHeight: 19,
  },

  topicGrid: {
    gap: 10,
  },

  topicCard: {
    flexDirection: 'row',
    alignItems: 'center',

    backgroundColor: '#FFFFFF',

    borderRadius: 18,

    padding: 16,

    borderWidth: 1,
    borderColor: '#E4EAE0',

    gap: 14,

    minHeight: 68,

    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.03,
        shadowRadius: 6,
      },

      android: {
        elevation: 1,
      },

      web: {
        boxShadow:
          '0 2px 10px rgba(0,0,0,0.03)',
      },
    }),
  },

  topicCardDesktop: {
    padding: 18,
  },

  topicCardActive: {
    borderColor: '#1F5C3E',
    backgroundColor: '#F3FAF5',
    borderWidth: 1.5,
  },

  topicIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#EEF6F0',
    alignItems: 'center',
    justifyContent: 'center',
  },

  topicTextCol: {
    flex: 1,
  },

  topicTitle: {
    fontSize: 15.5,
    fontWeight: '700',
    color: '#132018',
    marginBottom: 3,
  },

  topicDesc: {
    fontSize: 13,
    color: '#5B7064',
    lineHeight: 18,
  },

  speakerMiniIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#FDF7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ─────────────────────────────────────────────────────────────────────────
  // INPUT
  // ─────────────────────────────────────────────────────────────────────────

  inputDock: {
    flexDirection: 'row',
    alignItems: 'center',

    backgroundColor: '#FFFFFF',

    paddingHorizontal: 16,
    paddingVertical: 12,

    borderTopWidth: 1,
    borderTopColor: '#E4EAE0',

    gap: 10,

    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.08,
        shadowRadius: 10,
      },

      android: {
        elevation: 8,
      },

      web: {
        boxShadow:
          '0 -4px 20px rgba(0,0,0,0.06)',
      },
    }),
  },

  micButton: {
    width: 52,
    height: 52,
    borderRadius: 26,

    backgroundColor: '#1F5C3E',

    alignItems: 'center',
    justifyContent: 'center',

    ...Platform.select({
      ios: {
        shadowColor: '#1F5C3E',
        shadowOpacity: 0.3,
        shadowRadius: 6,
      },

      android: {
        elevation: 4,
      },

      web: {
        boxShadow:
          '0 4px 14px rgba(31,92,62,0.3)',
      },
    }),
  },

  micButtonActive: {
    backgroundColor: '#DC2626',
  },

  textInputField: {
    flex: 1,

    height: 48,

    backgroundColor: '#F3F6F1',

    borderRadius: 24,

    paddingHorizontal: 18,

    fontSize: 15,

    color: '#132018',

    borderWidth: 1,
    borderColor: '#E2E8DE',
  },

  sendButton: {
    width: 46,
    height: 46,
    borderRadius: 23,

    backgroundColor: '#C4892E',

    alignItems: 'center',
    justifyContent: 'center',
  },

  sendButtonDisabled: {
    backgroundColor: '#D6DDD8',
  },

});