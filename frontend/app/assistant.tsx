/**
 * frontend/app/assistant.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Lolo Pat — 3D AI Senior Citizen Voice & Visual Companion for Pateros.
 *
 * Features:
 *   - Interactive 3D Barong Tagalog Senior Character (WebGL / Native)
 *   - Synchronized Multi-Viseme Lip-Sync & Acoustic Waveform Visualizer
 *   - Voice Input (STT via native recording / web recognition) & Text Chat Dock
 *   - Senior Citizen Accessible Typography & High-Contrast Touch Targets (>=56dp)
 *   - Quick-Access Pateros Benefit Topics & Municipal Services Guidance
 *   - Integration with Long-Term Memory System (/memories)
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
import BarongElder3D from '../components/assistant/BarongElder3D';
import AudioVisualizer from '../components/assistant/AudioVisualizer';
import { speechEngine } from '../lib/speechEngine';
import { useAuth } from '../context/AuthContext';
import { Emotion } from '../types/lolo';

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL || 'http://localhost:5000';

interface SpeechTopic {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  desc: string;
  action: string | null;
  speechText: string;
  emotion?: Emotion;
}

// Curated Senior Voice Topics (Tap to hear Lolo Pat speak immediately)
const VOICE_TOPICS: SpeechTopic[] = [
  {
    icon: 'card',
    title: 'Digital ID & QR Code',
    desc: 'Paliwanag at pagbukas ng inyong Senior ID',
    action: 'NAVIGATE_DIGITAL_ID',
    speechText: 'Opo, Nanay at Tatay! Heto po ang inyong AUREA Digital Senior ID na may QR Code. Maaari niyo po itong ipakita sa mga botika, grocery, at kainan para sa inyong 20% discount at VAT exemption alinsunod sa batas.',
    emotion: 'happy',
  },
  {
    icon: 'gift',
    title: 'Mga Benepisyo sa Pateros',
    desc: 'Lokal na ayuda, kaarawan cash gift, at allowance',
    action: 'NAVIGATE_BENEFITS',
    speechText: 'Sa ating Bayang Pateros, ang bawat rehistradong Senior Citizen ay may natatanggap na Birthday Cash Gift mula sa pamahalaang bayan. Dadalhin ko po kayo sa Benefit Application para sa detalye ng inyong payout.',
    emotion: 'excited',
  },
  {
    icon: 'megaphone',
    title: 'Mga Anunsyo ng Munisipyo',
    desc: 'Iskedyul ng payout, libreng bakuna, at aktibidad',
    action: 'NAVIGATE_ANNOUNCEMENTS',
    speechText: 'Palagi pong mag-antabay sa ating mga anunsyo para sa petsa ng payout ng social pension, libreng bakuna laban sa flu at pulmonya, at mga aktibidad ng OSCA Pateros.',
    emotion: 'neutral',
  },
  {
    icon: 'calendar',
    title: 'Aking Iskedyul at Appointments',
    desc: 'Iskedyul ng gamot, checkup, at claim ng ayuda',
    action: 'NAVIGATE_SCHEDULE',
    speechText: 'Maaari ninyo pong suriin ang inyong nakatakdang appointments sa duktor at mga araw ng payout upang hindi po kayo mahuli sa inyong mga transaksyon.',
    emotion: 'thinking',
  },
  {
    icon: 'shield-checkmark',
    title: '20% Discount & RA 9994',
    desc: 'Mga karapatan ng Senior Citizen sa Pilipinas',
    action: null,
    speechText: 'Sa ilalim ng Republic Act 9994, may karapatan po kayo sa 20 percent discount at exemption sa VAT sa mga gamot, pagkain sa restaurant, pamasahe sa jeep at bus, at 5 percent discount sa kuryente at tubig.',
    emotion: 'happy',
  },
  {
    icon: 'call',
    title: 'Emergency Hotlines',
    desc: 'Pateros Rescue, Pulis, at OSCA',
    action: 'CALL_HOTLINE',
    speechText: 'Kung kailangan po ninyo ng agarang saklolo, heto po ang mga numero sa Pateros: Rescue (02) 8642-5159 o 911, PNP Pateros (02) 8642-2240, at OSCA Office sa Munisipyo.',
    emotion: 'neutral',
  },
  {
    icon: 'heart',
    title: 'Payong Pangkalusugan',
    desc: 'Paalala sa gamot, tubig, at kalusugan',
    action: null,
    speechText: 'Huwag pong kakalimutang uminom ng sapat na tubig araw-araw, mag-ehersisyo ng banayad sa umaga, at inumin sa tamang oras ang inyong maintenance medicines. Mahalaga po ang inyong kalusugan!',
    emotion: 'happy',
  },
];

export default function AssistantScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const isWebDesktop = Platform.OS === 'web' && width > 768;
  const scrollViewRef = useRef<ScrollView>(null);

  // Assistant State
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentEmotion, setCurrentEmotion] = useState<Emotion>('happy');
  const [inputText, setInputText] = useState('');
  const [currentSpeech, setCurrentSpeech] = useState(
    'Magandang araw po! Ako si Lolo Pat. Pindutin lamang po ang mikropono o pumili ng paksa sa ibaba upang aking ipaliwanag nang pasalita.'
  );
  const [activeTopicIndex, setActiveTopicIndex] = useState<number | null>(null);

  // Initial greeting
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
    }! Ako po si Lolo Pat, ang inyong 3D AI companion sa AUREA. Nandito po ako upang ipaliwanag nang pasalita ang inyong mga serbisyo sa Pateros. Pindutin lamang po ang mikropono o ang alinmang paksa sa ibaba.`;

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
  const handleSelectTopic = async (topic: SpeechTopic, index: number) => {
    speechEngine.stop();
    setIsSpeaking(false);
    setActiveTopicIndex(index);
    setIsLoading(true);
    setCurrentEmotion(topic.emotion || 'happy');
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
        if (data.emotion) {
          setCurrentEmotion(data.emotion as Emotion);
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
    } catch {
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

  // Custom User Query (Voice STT or Typed Text)
  const handleSendCustomQuery = async (queryText: string) => {
    const textToSend = queryText.trim();
    if (!textToSend) return;

    setInputText('');
    speechEngine.stop();
    setIsSpeaking(false);
    setIsLoading(true);
    setCurrentEmotion('thinking');
    setCurrentSpeech('Pinakikinggan at pinag-aaralan ni Lolo Pat ang inyong tanong...');

    try {
      const res = await fetch(`${API_BASE_URL}/api/assistant/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: textToSend,
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

      if (res.ok) {
        const data = await res.json();
        const responseText = data.text || 'Opo, naintindihan ko po kayo.';
        if (data.emotion) {
          setCurrentEmotion(data.emotion as Emotion);
        } else {
          setCurrentEmotion('happy');
        }

        setCurrentSpeech(responseText);
        speechEngine.speak(
          responseText,
          () => setIsSpeaking(true),
          () => setIsSpeaking(false)
        );

        if (data.action) {
          handleSystemAction(data.action);
        }
      } else {
        const fallbackText = 'Salamat po sa inyong tanong. Maaari po kayong sumangguni sa tanggapan ng OSCA Pateros para sa karagdagang tulong.';
        setCurrentSpeech(fallbackText);
        speechEngine.speak(
          fallbackText,
          () => setIsSpeaking(true),
          () => setIsSpeaking(false)
        );
      }
    } catch {
      const fallbackText = 'Pasensya na po, medyo mahina ang signal. Subukan po nating muli o pumili ng paksa sa ibaba.';
      setCurrentSpeech(fallbackText);
      speechEngine.speak(
        fallbackText,
        () => setIsSpeaking(true),
        () => setIsSpeaking(false)
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Toggle Microphone Recording (STT)
  const handleToggleListening = async () => {
    if (isListening) {
      setIsListening(false);
      await speechEngine.stopListening();
    } else {
      speechEngine.stop();
      setIsSpeaking(false);
      setIsListening(true);
      setCurrentEmotion('thinking');

      await speechEngine.startListening(
        (transcribedText, isFinal) => {
          if (isFinal && transcribedText) {
            setIsListening(false);
            handleSendCustomQuery(transcribedText);
          }
        },
        (error) => {
          console.warn('[Assistant] STT Error:', error);
          setIsListening(false);
        },
        () => {
          setIsListening(false);
        }
      );
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
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* ── HEADER ─────────────────────────────────────────── */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.headerBtn}
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

          {/* Memories Quick Button */}
          <TouchableOpacity
            style={styles.memoriesBtn}
            onPress={() => {
              speechEngine.stop();
              router.push('/memories' as any);
            }}
            accessibilityLabel="Tingnan ang mga Alaala ni Lolo"
          >
            <Ionicons name="book-outline" size={20} color="#C4892E" />
            <Text style={styles.memoriesBtnText}>Alaala</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          ref={scrollViewRef}
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
              {/* 3D Senior Citizen Avatar wearing Barong Tagalog */}
              <BarongElder3D
                isSpeaking={isSpeaking}
                emotion={currentEmotion}
                height={isWebDesktop ? 380 : 290}
                onTapAvatar={handleReplayVoice}
              />

              {/* Premium Audio Waveform & Ripple Visualizer */}
              <AudioVisualizer
                isActive={isSpeaking}
                isListening={isListening}
                mode="combined"
                barCount={7}
                height={34}
              />
            </LinearGradient>

            {/* ── LIVE SPOKEN SUBTITLE CARD ─────────────────────── */}
            <View style={styles.speechCard}>
              <View style={styles.speechHeader}>
                <View style={styles.speechHeaderLeft}>
                  <Ionicons
                    name={isSpeaking ? 'volume-high' : isListening ? 'mic' : 'chatbubble-ellipses'}
                    size={20}
                    color="#C4892E"
                  />
                  <Text style={styles.speechHeaderTitle}>
                    {isListening ? 'Naririnig ni Lolo:' : 'Sinasabi ni Lolo Pat:'}
                  </Text>
                </View>

                <View style={styles.speechActionBtns}>
                  {isSpeaking ? (
                    <TouchableOpacity
                      onPress={handleStopVoice}
                      style={styles.stopBtn}
                      accessibilityLabel="Itigil ang boses"
                    >
                      <Ionicons name="stop-circle" size={18} color="#DC2626" />
                      <Text style={styles.stopBtnText}>Itigil</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      onPress={handleReplayVoice}
                      style={styles.replayBtn}
                      accessibilityLabel="Pakinggan muli"
                    >
                      <Ionicons name="refresh" size={18} color="#1F5C3E" />
                      <Text style={styles.replayBtnText}>Pakinggan muli</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {isLoading ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator size="small" color="#1F5C3E" />
                  <Text style={styles.loadingText}>Nag-iisip at naghahanda ng boses si Lolo Pat...</Text>
                </View>
              ) : (
                <Text style={styles.speechBodyText}>{currentSpeech}</Text>
              )}
            </View>

            {/* ── SENIOR VOICE / TOPICS SECTION ─────────────────── */}
            <View style={styles.topicsSection}>
              <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionIconPill}>
                  <Ionicons name="sparkles" size={16} color="#C4892E" />
                </View>
                <Text style={styles.sectionTitle}>Mga Karaniwang Tanong sa Serbisyo</Text>
              </View>
              <Text style={styles.sectionSubtitle}>
                Pindutin ang alinmang kard upang ipaliwanag ito ni Lolo Pat nang buong linaw:
              </Text>

              <View style={styles.topicGrid}>
                {VOICE_TOPICS.map((topic, idx) => {
                  const isActive = activeTopicIndex === idx && isSpeaking;
                  return (
                    <TouchableOpacity
                      key={idx}
                      style={[
                        styles.topicCard,
                        isWebDesktop && styles.topicCardDesktop,
                        isActive && styles.topicCardActive,
                      ]}
                      onPress={() => handleSelectTopic(topic, idx)}
                      activeOpacity={0.85}
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
                          size={24}
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
                          size={16}
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

        {/* ── INTERACTIVE VOICE & TEXT INPUT DOCK ────────────── */}
        <View style={styles.inputDock}>
          <TouchableOpacity
            style={[
              styles.micButton,
              isListening && styles.micButtonActive,
            ]}
            onPress={handleToggleListening}
            accessibilityLabel={isListening ? 'Tapusin ang pagsasalita' : 'Magsalita kay Lolo Pat'}
          >
            <Ionicons
              name={isListening ? 'radio' : 'mic'}
              size={26}
              color="#FFFFFF"
            />
          </TouchableOpacity>

          <TextInput
            style={styles.textInputField}
            placeholder={isListening ? 'Nakikinig po si Lolo sa inyo...' : 'Magtanong o mag-type kay Lolo Pat...'}
            placeholderTextColor="#8C9E94"
            value={inputText}
            onChangeText={setInputText}
            onSubmitEditing={() => handleSendCustomQuery(inputText)}
            returnKeyType="send"
          />

          <TouchableOpacity
            style={[
              styles.sendButton,
              !inputText.trim() && styles.sendButtonDisabled,
            ]}
            onPress={() => handleSendCustomQuery(inputText)}
            disabled={!inputText.trim() || isLoading}
            accessibilityLabel="Ipadala ang tanong"
          >
            <Ionicons name="send" size={18} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
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
  stageGradient: {
    width: '100%',
    borderRadius: 28,
    paddingTop: 8,
    paddingBottom: 14,
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
  speechCard: {
    marginTop: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E2EEE5',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8 },
      android: { elevation: 2 },
      web: { boxShadow: '0 4px 20px rgba(0,0,0,0.04)' },
    }),
  },
  speechHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  speechHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  speechHeaderTitle: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#1F5C3E',
    letterSpacing: 0.2,
  },
  speechActionBtns: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },
  stopBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#DC2626',
  },
  replayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#EEF6F0',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },
  replayBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#1F5C3E',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
  },
  loadingText: {
    fontSize: 15,
    color: '#55695E',
    fontStyle: 'italic',
  },
  speechBodyText: {
    fontSize: 16.5,
    lineHeight: 25,
    fontWeight: '600',
    color: '#132018',
  },
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
      ios: { shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 6 },
      android: { elevation: 1 },
      web: { boxShadow: '0 2px 10px rgba(0,0,0,0.03)' },
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
      ios: { shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 10 },
      android: { elevation: 8 },
      web: { boxShadow: '0 -4px 20px rgba(0,0,0,0.06)' },
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
      ios: { shadowColor: '#1F5C3E', shadowOpacity: 0.3, shadowRadius: 6 },
      android: { elevation: 4 },
      web: { boxShadow: '0 4px 14px rgba(31,92,62,0.3)' },
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
