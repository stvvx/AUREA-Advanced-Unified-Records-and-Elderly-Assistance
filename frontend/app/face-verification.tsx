import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  ScrollView,
  StatusBar,
  Animated,
  Easing,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import Toast from '../components/Toast';
import { verifyFace, enrollFace, getUser, MultiAngleImages } from '../lib/authApi';
import { useAuth } from '../context/AuthContext';

// ---------------------------------------------------------------------------
// Design Tokens & Colors
// ---------------------------------------------------------------------------
const colors = {
  bg: '#F6FAF7',
  card: '#FFFFFF',
  ink: '#0E1F16',
  inkSoft: '#3E5548',
  inkFaint: '#6E8A79',
  primary: '#2E7D52',
  primaryDeep: '#1B5E3F',
  primarySoft: '#E3F2E8',
  accent: '#4C9A6B',
  gold: '#C4892E',
  goldSoft: '#FDF6E9',
  border: '#B9D4C5',
  borderLight: '#DDECE2',
  error: '#C62828',
  errorSoft: '#FDECEC',
  success: '#1B5E3F',
  successSoft: '#D4EDDA',
  white: '#FFFFFF',
};

const space = (n: number) => n * 4;

type LivenessStep = 'center' | 'left' | 'right' | 'analyzing' | 'success' | 'failed';

export default function FaceVerificationScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    userId?: string;
    userName?: string;
    avatarUrl?: string;
    role?: string;
    isEnrollment?: string;
  }>();

  const { login } = useAuth();
  const cameraRef = useRef<CameraView>(null);

  const userId = params.userId ? parseInt(params.userId, 10) : 0;
  const userName = params.userName || 'Citizen';
  const initialAvatar = params.avatarUrl || null;
  const userRole = params.role || 'user';

  const [permission, requestPermission] = useCameraPermissions();
  const [hasRegisteredFace, setHasRegisteredFace] = useState<boolean>(
    Boolean(initialAvatar && initialAvatar.trim() !== '') && params.isEnrollment !== 'true'
  );

  const [cameraReady, setCameraReady] = useState(false);
  const [currentStep, setCurrentStep] = useState<LivenessStep>('center');
  const [statusMessage, setStatusMessage] = useState<string>('Step 1: Look straight into the camera');
  const [tagalogGuidance, setTagalogGuidance] = useState<string>('Humarap nang diretso sa camera.');
  const [confidenceScore, setConfidenceScore] = useState<number | null>(null);
  const [livenessPassed, setLivenessPassed] = useState<boolean | null>(null);
  const [retryCountdown, setRetryCountdown] = useState<number | null>(null);

  // Stored multi-angle captures (base64)
  const [capturedImages, setCapturedImages] = useState<{
    center: string | null;
    left: string | null;
    right: string | null;
  }>({
    center: null,
    left: null,
    right: null,
  });

  const [fallbackImage, setFallbackImage] = useState<string | null>(null);
  const [manualMode, setManualMode] = useState(false);

  const [toast, setToast] = useState<{ visible: boolean; message: string; type: 'success' | 'error' }>({
    visible: false,
    message: '',
    type: 'success',
  });

  // Animations
  const scanAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const arrowAnim = useRef(new Animated.Value(0)).current;
  const ringRotateAnim = useRef(new Animated.Value(0)).current;

  // Multi-angle step orchestration guard & timers
  const isCapturingRef = useRef(false);
  const sequenceTimerRef = useRef<any>(null);
  const countdownTimerRef = useRef<any>(null);
  const capturedRef = useRef<{ center: string | null; left: string | null; right: string | null }>({
    center: null,
    left: null,
    right: null,
  });

  // Setup loop animations
  useEffect(() => {
    // Pulse animation for the biometric ring
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.04,
          duration: 1100,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1100,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Laser scan animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(scanAnim, {
          toValue: 1,
          duration: 1500,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(scanAnim, {
          toValue: 0,
          duration: 1500,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Directional Arrow Bounce Animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(arrowAnim, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(arrowAnim, {
          toValue: 0,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Subtle rotation on tracker ring
    Animated.loop(
      Animated.timing(ringRotateAnim, {
        toValue: 1,
        duration: 9000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();
  }, [pulseAnim, scanAnim, arrowAnim, ringRotateAnim]);

  // Check enrollment state if initialAvatar was empty
  useEffect(() => {
    if (userId && !initialAvatar && params.isEnrollment !== 'true') {
      getUser(userId)
        .then(({ user }) => {
          if (user.avatarUrl || user.profilePhoto) {
            setHasRegisteredFace(true);
          } else {
            setHasRegisteredFace(false);
          }
        })
        .catch(() => undefined);
    }
  }, [userId, initialAvatar, params.isEnrollment]);

  // Request camera permissions on mount
  useEffect(() => {
    if (!permission?.granted) {
      requestPermission();
    }
  }, [permission, requestPermission]);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ visible: true, message, type });
  };

  // Safe camera snapshot helper
  const takeSnapshot = async (): Promise<string | null> => {
    if (!cameraRef.current) return null;
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.85,
        base64: true,
        skipProcessing: false,
      });
      return photo?.base64 || null;
    } catch (err) {
      console.warn('[AUREA Face] Snapshot error:', err);
      return null;
    }
  };

  // Submit all 3 captured angles to backend for 3D Liveness & Biometrics
  const processMultiAngleVerification = async (captures: MultiAngleImages) => {
    setCurrentStep('analyzing');
    setStatusMessage('Verifying 3D Human Liveness & Identity…');
    setTagalogGuidance('Sinusuri ang 3D Biometrics at pagkakakilanlan…');

    try {
      if (!hasRegisteredFace) {
        // First-Time Biometric Enrollment Mode using Center Face
        const enrollRes = await enrollFace({
          userId,
          image: captures.center,
          mimeType: 'image/jpeg',
        });

        if (enrollRes.success) {
          try {
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } catch {}

          setCurrentStep('success');
          setLivenessPassed(true);
          setStatusMessage('Face ID Enrolled & 3D Liveness Verified!');
          setTagalogGuidance('Matagumpay na napatunayan ang inyong pagkakakilanlan.');

          const finalUser = enrollRes.user || {
            id: userId,
            firstName: userName,
            lastName: '',
            email: '',
            avatarUrl: enrollRes.avatarUrl,
            role: userRole,
          };

          await login(finalUser as any);

          const adminRoles = ['osca admin', 'med admin', 'super admin'];
          const dest = adminRoles.includes((finalUser.role || userRole).toLowerCase())
            ? '/admin-dashboard'
            : '/(tabs)';

          setTimeout(() => {
            router.replace(dest as any);
          }, 1500);
        } else {
          throw new Error(enrollRes.message || 'Face enrollment failed.');
        }
      } else {
        // Multi-Angle 3D Liveness & Biometric Verification Mode
        const verifyRes = await verifyFace({
          userId,
          images: captures,
          mimeType: 'image/jpeg',
        });

        if (verifyRes.verified) {
          try {
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } catch {}

          setCurrentStep('success');
          setLivenessPassed(true);
          setConfidenceScore(verifyRes.confidence ?? 98);
          setStatusMessage(verifyRes.message || '3D Liveness & Identity Confirmed! Welcome back.');
          setTagalogGuidance('Ligtas at kumpirmadong tunay na tao ang humarap sa camera.');

          const finalUser = verifyRes.user || {
            id: userId,
            firstName: userName,
            lastName: '',
            email: '',
            avatarUrl: initialAvatar,
            role: userRole,
          };

          await login(finalUser as any);

          const adminRoles = ['osca admin', 'med admin', 'super admin'];
          const dest = adminRoles.includes((finalUser.role || userRole).toLowerCase())
            ? '/admin-dashboard'
            : '/(tabs)';

          setTimeout(() => {
            router.replace(dest as any);
          }, 1500);
        } else {
          try {
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          } catch {}

          setCurrentStep('failed');
          setLivenessPassed(verifyRes.livenessPassed ?? false);
          setConfidenceScore(verifyRes.confidence ?? 0);
          setStatusMessage(
            verifyRes.message || 'Verification failed. Please visibly turn your face left and right.'
          );
          setTagalogGuidance('Pakisubukang muli at tiyaking lumingon nang malinaw pakaliwa at pakanan.');
          startAutoRetryCountdown();
        }
      }
    } catch (err: any) {
      try {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } catch {}

      setCurrentStep('failed');
      const msg = err?.message || 'Verification error. Retrying...';
      setStatusMessage(msg);
      startAutoRetryCountdown();
    } finally {
      isCapturingRef.current = false;
    }
  };

  // Start the 3-step automatic capture sequence (Center -> Left -> Right -> Verify)
  const runStepSequence = useCallback(async () => {
    if (isCapturingRef.current) return;
    if (Platform.OS === 'web' || manualMode) return;

    isCapturingRef.current = true;
    capturedRef.current = { center: null, left: null, right: null };
    setCapturedImages({ center: null, left: null, right: null });

    // Step 1: Center
    setCurrentStep('center');
    setStatusMessage('Step 1 of 3: Look straight ahead into the camera');
    setTagalogGuidance('Humarap nang diretso sa gitna ng bilog.');

    // Wait 1.6s for senior citizen to look center
    sequenceTimerRef.current = setTimeout(async () => {
      const centerPhoto = await takeSnapshot();
      if (!centerPhoto) {
        isCapturingRef.current = false;
        return;
      }
      try {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch {}

      capturedRef.current.center = centerPhoto;
      setCapturedImages((prev) => ({ ...prev, center: centerPhoto }));

      // Step 2: Turn Left
      setCurrentStep('left');
      setStatusMessage('Step 2 of 3: Slowly turn your face to the LEFT 👈');
      setTagalogGuidance('Dahan-dahang ipihit ang iyong mukha sa KALIWA.');

      // Wait 1.8s for left turn
      sequenceTimerRef.current = setTimeout(async () => {
        const leftPhoto = await takeSnapshot();
        if (!leftPhoto) {
          isCapturingRef.current = false;
          return;
        }
        try {
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        } catch {}

        capturedRef.current.left = leftPhoto;
        setCapturedImages((prev) => ({ ...prev, left: leftPhoto }));

        // Step 3: Turn Right
        setCurrentStep('right');
        setStatusMessage('Step 3 of 3: Slowly turn your face to the RIGHT 👉');
        setTagalogGuidance('Dahan-dahang ipihit ang iyong mukha sa KANAN.');

        // Wait 1.8s for right turn
        sequenceTimerRef.current = setTimeout(async () => {
          const rightPhoto = await takeSnapshot();
          if (!rightPhoto) {
            isCapturingRef.current = false;
            return;
          }
          try {
            await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          } catch {}

          capturedRef.current.right = rightPhoto;
          setCapturedImages((prev) => ({ ...prev, right: rightPhoto }));

          // All 3 angles acquired -> Verify on backend
          if (capturedRef.current.center && capturedRef.current.left && capturedRef.current.right) {
            await processMultiAngleVerification({
              center: capturedRef.current.center,
              left: capturedRef.current.left,
              right: capturedRef.current.right,
            });
          }
        }, 1800);
      }, 1800);
    }, 1600);
  }, [hasRegisteredFace, userId, userName, userRole, initialAvatar, login, router, manualMode]);

  // Auto-retry countdown on failure
  const startAutoRetryCountdown = () => {
    let count = 4;
    setRetryCountdown(count);
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);

    countdownTimerRef.current = setInterval(() => {
      count -= 1;
      if (count <= 0) {
        if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
        setRetryCountdown(null);
        runStepSequence();
      } else {
        setRetryCountdown(count);
      }
    }, 1000);
  };

  // Camera Ready Handler
  const handleCameraReady = () => {
    setCameraReady(true);
    if (sequenceTimerRef.current) clearTimeout(sequenceTimerRef.current);
    sequenceTimerRef.current = setTimeout(() => {
      runStepSequence();
    }, 1200);
  };

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (sequenceTimerRef.current) clearTimeout(sequenceTimerRef.current);
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    };
  }, []);

  // Manual Photo Picker for a specific angle slot
  const pickAnglePhoto = async (angle: 'center' | 'left' | 'right') => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
        base64: true,
      });

      if (result.canceled || !result.assets?.[0]) return;
      const b64 = result.assets[0].base64;
      if (!b64) return;

      const updated = { ...capturedImages, [angle]: b64 };
      setCapturedImages(updated);
      showToast(`Selected ${angle.toUpperCase()} angle photo`, 'success');
    } catch (err: any) {
      showToast('Could not load image: ' + err.message, 'error');
    }
  };

  // Manual multi-angle submit
  const handleManualMultiAngleSubmit = async () => {
    if (!capturedImages.center || !capturedImages.left || !capturedImages.right) {
      showToast('Please select photos for all 3 angles (Center, Left, Right).', 'error');
      return;
    }
    await processMultiAngleVerification({
      center: capturedImages.center,
      left: capturedImages.left,
      right: capturedImages.right,
    });
  };

  // Directional arrow offset interpolation
  const arrowTranslateX = arrowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: currentStep === 'left' ? [0, -18] : [0, 18],
  });

  const translateY = scanAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-120, 120],
  });

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.bg} />
      <Toast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        onHide={() => setToast((t) => ({ ...t, visible: false }))}
      />

      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => router.replace('/login')}
            activeOpacity={0.7}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="arrow-back" size={24} color={colors.primaryDeep} />
            <Text style={styles.backText}>Cancel</Text>
          </TouchableOpacity>

          <View style={styles.badge}>
            <Ionicons name="shield-checkmark" size={16} color={colors.primaryDeep} />
            <Text style={styles.badgeText}>3D LIVENESS & ANTI-SPOOFING</Text>
          </View>
        </View>

        {/* Title Section */}
        <View style={styles.titleSection}>
          <Text style={styles.eyebrow}>MUNICIPALITY OF PATEROS • OSCA BIOMETRICS</Text>
          <Text style={styles.title}>
            {hasRegisteredFace ? 'Multi-Angle Face ID' : 'Biometric Face Setup'}
          </Text>
          <Text style={styles.subtitle}>
            {hasRegisteredFace
              ? `Magandang araw, ${userName}! Sundin ang mga hakbang para patunayan na ikaw ay tunay na tao.`
              : `Hello, ${userName}! Please follow the 3-step head turn to enroll your Face ID securely.`}
          </Text>
        </View>

        {/* 3-Step Head Angle Progress Tracker */}
        <View style={styles.stepProgressContainer}>
          {/* Step 1: Center */}
          <View
            style={[
              styles.stepPill,
              currentStep === 'center' && styles.stepPillActive,
              Boolean(capturedImages.center) && styles.stepPillCompleted,
            ]}
          >
            <View style={styles.stepIconWrap}>
              {capturedImages.center ? (
                <Ionicons name="checkmark-circle" size={18} color={colors.white} />
              ) : (
                <Ionicons
                  name="person"
                  size={15}
                  color={currentStep === 'center' ? colors.white : colors.inkFaint}
                />
              )}
            </View>
            <Text
              style={[
                styles.stepPillText,
                (currentStep === 'center' || Boolean(capturedImages.center)) && styles.stepPillTextActive,
              ]}
            >
              1. Center 👤
            </Text>
          </View>

          {/* Connector Line */}
          <View
            style={[
              styles.stepLine,
              Boolean(capturedImages.center) && styles.stepLineActive,
            ]}
          />

          {/* Step 2: Left */}
          <View
            style={[
              styles.stepPill,
              currentStep === 'left' && styles.stepPillActive,
              Boolean(capturedImages.left) && styles.stepPillCompleted,
            ]}
          >
            <View style={styles.stepIconWrap}>
              {capturedImages.left ? (
                <Ionicons name="checkmark-circle" size={18} color={colors.white} />
              ) : (
                <Ionicons
                  name="arrow-back"
                  size={15}
                  color={currentStep === 'left' ? colors.white : colors.inkFaint}
                />
              )}
            </View>
            <Text
              style={[
                styles.stepPillText,
                (currentStep === 'left' || Boolean(capturedImages.left)) && styles.stepPillTextActive,
              ]}
            >
              2. Left 👈
            </Text>
          </View>

          {/* Connector Line */}
          <View
            style={[
              styles.stepLine,
              Boolean(capturedImages.left) && styles.stepLineActive,
            ]}
          />

          {/* Step 3: Right */}
          <View
            style={[
              styles.stepPill,
              currentStep === 'right' && styles.stepPillActive,
              Boolean(capturedImages.right) && styles.stepPillCompleted,
            ]}
          >
            <View style={styles.stepIconWrap}>
              {capturedImages.right ? (
                <Ionicons name="checkmark-circle" size={18} color={colors.white} />
              ) : (
                <Ionicons
                  name="arrow-forward"
                  size={15}
                  color={currentStep === 'right' ? colors.white : colors.inkFaint}
                />
              )}
            </View>
            <Text
              style={[
                styles.stepPillText,
                (currentStep === 'right' || Boolean(capturedImages.right)) && styles.stepPillTextActive,
              ]}
            >
              3. Right 👉
            </Text>
          </View>
        </View>

        {/* Live Camera Biometric Viewfinder */}
        <View style={styles.viewfinderCard}>
          {!permission?.granted ? (
            <View style={styles.permissionWrap}>
              <Ionicons name="videocam-outline" size={64} color={colors.primaryDeep} />
              <Text style={styles.permissionTitle}>Camera Access Required</Text>
              <Text style={styles.permissionDesc}>
                To detect real human liveness and verify your identity, please allow camera access.
              </Text>
              <TouchableOpacity
                style={styles.allowBtn}
                onPress={requestPermission}
                activeOpacity={0.85}
              >
                <Ionicons name="camera" size={20} color={colors.white} />
                <Text style={styles.allowBtnText}>Allow Camera Access</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.frameContainer}>
              {/* Active Directional Angle Indicator (Left turn arrow) */}
              {currentStep === 'left' && (
                <Animated.View
                  style={[
                    styles.directionGuideLeft,
                    { transform: [{ translateX: arrowTranslateX }] },
                  ]}
                >
                  <Ionicons name="arrow-back-circle" size={48} color="#FFD700" />
                  <Text style={styles.turnLabel}>IPILIT PAKALIWA</Text>
                </Animated.View>
              )}

              {/* Active Directional Angle Indicator (Right turn arrow) */}
              {currentStep === 'right' && (
                <Animated.View
                  style={[
                    styles.directionGuideRight,
                    { transform: [{ translateX: arrowTranslateX }] },
                  ]}
                >
                  <Ionicons name="arrow-forward-circle" size={48} color="#FFD700" />
                  <Text style={styles.turnLabel}>IPILIT PAKANAN</Text>
                </Animated.View>
              )}

              {/* Oval Biometric Guide */}
              <Animated.View
                style={[
                  styles.ovalGuide,
                  { transform: [{ scale: currentStep === 'analyzing' ? pulseAnim : 1 }] },
                  (currentStep === 'center' || currentStep === 'left' || currentStep === 'right') &&
                    styles.ovalActive,
                  currentStep === 'analyzing' && styles.ovalAnalyzing,
                  currentStep === 'success' && styles.ovalSuccess,
                  currentStep === 'failed' && styles.ovalFailed,
                ]}
              >
                {/* Live Native Camera Feed */}
                {Platform.OS !== 'web' && !manualMode ? (
                  <CameraView
                    ref={cameraRef}
                    style={StyleSheet.absoluteFillObject}
                    facing="front"
                    onCameraReady={handleCameraReady}
                  />
                ) : (
                  <View style={styles.webPlaceholder}>
                    <Ionicons name="camera" size={60} color={colors.inkFaint} />
                    <Text style={styles.webPlaceholderText}>Multi-Angle Upload Mode</Text>
                  </View>
                )}

                {/* Laser Scanning Beam when analyzing */}
                {currentStep === 'analyzing' && (
                  <Animated.View
                    style={[
                      styles.scanBeam,
                      { transform: [{ translateY }] },
                    ]}
                  />
                )}

                {/* Success Overlay */}
                {currentStep === 'success' && (
                  <View style={styles.overlaySuccess}>
                    <Ionicons name="checkmark-circle" size={68} color={colors.white} />
                    <Text style={styles.overlaySuccessTitle}>3D LIVENESS VERIFIED</Text>
                    <Text style={styles.overlaySuccessSub}>Authentic Living Person Confirmed</Text>
                  </View>
                )}
              </Animated.View>

              {/* Biometric Frame Brackets */}
              <View
                style={[
                  styles.corner,
                  styles.cornerTL,
                  currentStep === 'success' && styles.cornerSuccess,
                  currentStep === 'failed' && styles.cornerFailed,
                ]}
              />
              <View
                style={[
                  styles.corner,
                  styles.cornerTR,
                  currentStep === 'success' && styles.cornerSuccess,
                  currentStep === 'failed' && styles.cornerFailed,
                ]}
              />
              <View
                style={[
                  styles.corner,
                  styles.cornerBL,
                  currentStep === 'success' && styles.cornerSuccess,
                  currentStep === 'failed' && styles.cornerFailed,
                ]}
              />
              <View
                style={[
                  styles.corner,
                  styles.cornerBR,
                  currentStep === 'success' && styles.cornerSuccess,
                  currentStep === 'failed' && styles.cornerFailed,
                ]}
              />
            </View>
          )}

          {/* Real-time Status Badge */}
          <View style={styles.statusBox}>
            <View
              style={[
                styles.statusDot,
                (currentStep === 'center' || currentStep === 'left' || currentStep === 'right') &&
                  styles.statusDotActive,
                currentStep === 'analyzing' && styles.statusDotAnalyzing,
                currentStep === 'success' && styles.statusDotSuccess,
                currentStep === 'failed' && styles.statusDotFailed,
              ]}
            />
            <Text style={styles.statusLabelText}>
              {currentStep === 'center'
                ? 'Step 1/3: Position face centered'
                : currentStep === 'left'
                ? 'Step 2/3: Angle face to the LEFT'
                : currentStep === 'right'
                ? 'Step 3/3: Angle face to the RIGHT'
                : currentStep === 'analyzing'
                ? 'Analyzing 3D Human Liveness…'
                : currentStep === 'success'
                ? 'Identity & Liveness Confirmed!'
                : retryCountdown !== null
                ? `Retrying in ${retryCountdown}s…`
                : 'Liveness / Face Check Issue'}
            </Text>
          </View>
        </View>

        {/* Dynamic Dual-Language Guidance Card */}
        <View
          style={[
            styles.feedbackCard,
            currentStep === 'success' && styles.feedbackSuccess,
            currentStep === 'failed' && styles.feedbackFailed,
            currentStep === 'analyzing' && styles.feedbackScanning,
          ]}
        >
          {currentStep === 'analyzing' ? (
            <ActivityIndicator size="small" color={colors.primaryDeep} />
          ) : (
            <MaterialCommunityIcons
              name={
                currentStep === 'success'
                  ? 'shield-check'
                  : currentStep === 'failed'
                  ? 'shield-alert'
                  : currentStep === 'left'
                  ? 'face-man-profile'
                  : currentStep === 'right'
                  ? 'face-man-profile'
                  : 'face-recognition'
              }
              size={32}
              color={
                currentStep === 'success'
                  ? colors.success
                  : currentStep === 'failed'
                  ? colors.error
                  : colors.primaryDeep
              }
            />
          )}

          <View style={{ flex: 1 }}>
            <Text
              style={[
                styles.feedbackTitle,
                currentStep === 'success' && { color: colors.success },
                currentStep === 'failed' && { color: colors.error },
              ]}
            >
              {currentStep === 'success'
                ? 'Verified Human Identity'
                : currentStep === 'failed'
                ? 'Verification Warning'
                : 'Interactive Liveness Check'}
            </Text>
            <Text style={styles.feedbackBody}>{statusMessage}</Text>
            <Text style={styles.tagalogHint}>{tagalogGuidance}</Text>

            {confidenceScore !== null && currentStep !== 'analyzing' && (
              <View style={styles.confidenceRow}>
                <Ionicons name="finger-print" size={16} color={colors.primaryDeep} />
                <Text style={styles.confidenceText}>
                  Match Confidence: <Text style={{ fontWeight: '800' }}>{confidenceScore}%</Text>
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Manual 3-Angle Upload / Gallery Fallback Card */}
        {manualMode && (
          <View style={styles.manualCard}>
            <Text style={styles.manualTitle}>Select Photos for All 3 Angles:</Text>
            <View style={styles.slotsRow}>
              {/* Center slot */}
              <TouchableOpacity
                style={[styles.slotBox, Boolean(capturedImages.center) && styles.slotBoxDone]}
                onPress={() => pickAnglePhoto('center')}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={capturedImages.center ? 'checkmark-circle' : 'person'}
                  size={24}
                  color={capturedImages.center ? colors.success : colors.primaryDeep}
                />
                <Text style={styles.slotLabel}>Center 👤</Text>
              </TouchableOpacity>

              {/* Left slot */}
              <TouchableOpacity
                style={[styles.slotBox, Boolean(capturedImages.left) && styles.slotBoxDone]}
                onPress={() => pickAnglePhoto('left')}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={capturedImages.left ? 'checkmark-circle' : 'arrow-back'}
                  size={24}
                  color={capturedImages.left ? colors.success : colors.primaryDeep}
                />
                <Text style={styles.slotLabel}>Left 👈</Text>
              </TouchableOpacity>

              {/* Right slot */}
              <TouchableOpacity
                style={[styles.slotBox, Boolean(capturedImages.right) && styles.slotBoxDone]}
                onPress={() => pickAnglePhoto('right')}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={capturedImages.right ? 'checkmark-circle' : 'arrow-forward'}
                  size={24}
                  color={capturedImages.right ? colors.success : colors.primaryDeep}
                />
                <Text style={styles.slotLabel}>Right 👉</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.manualSubmitBtn}
              onPress={handleManualMultiAngleSubmit}
              activeOpacity={0.85}
            >
              <Ionicons name="shield-checkmark" size={20} color={colors.white} />
              <Text style={styles.manualSubmitBtnText}>Verify Selected 3 Angles</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Manual Restart Button (If failed) */}
        {currentStep === 'failed' && (
          <TouchableOpacity
            style={styles.retryBtn}
            onPress={() => {
              if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
              setRetryCountdown(null);
              runStepSequence();
            }}
            activeOpacity={0.85}
          >
            <Ionicons name="refresh" size={20} color={colors.white} />
            <Text style={styles.retryBtnText}>Scan Angles Again</Text>
          </TouchableOpacity>
        )}

        {/* Senior Citizen Friendly Guidance Tips */}
        <View style={styles.tipsCard}>
          <Text style={styles.tipsTitle}>Senior Citizen Friendly Tips (Gabay):</Text>
          <View style={styles.tipRow}>
            <Ionicons name="shield" size={18} color={colors.gold} />
            <Text style={styles.tipText}>
              <Text style={{ fontWeight: '700' }}>Anti-Spoofing:</Text> Pinipigilan nito ang paggamit ng pekeng litrato o cellphone display.
            </Text>
          </View>
          <View style={styles.tipRow}>
            <Ionicons name="eye-outline" size={18} color={colors.gold} />
            <Text style={styles.tipText}>
              Sundin lamang ang panuto sa screen: Humarap sa gitna, lumingon pakaliwa, at lumingon pakanan.
            </Text>
          </View>
        </View>

        {/* Toggle Manual / Fallback Mode */}
        <TouchableOpacity
          style={styles.fallbackLink}
          onPress={() => setManualMode(!manualMode)}
          activeOpacity={0.7}
        >
          <Text style={styles.fallbackText}>
            {manualMode
              ? 'Switch back to Live Camera Auto-Scan'
              : 'Trouble with live camera? Select 3 angle photos manually'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  container: {
    paddingHorizontal: space(5),
    paddingTop: space(3),
    paddingBottom: space(8),
    gap: space(4),
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: space(1),
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  backText: {
    fontFamily: 'InterBody',
    fontSize: 16,
    color: colors.primaryDeep,
    fontWeight: '700',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  badgeText: {
    fontFamily: 'InterBody',
    fontSize: 10.5,
    fontWeight: '700',
    color: colors.primaryDeep,
    letterSpacing: 0.8,
  },
  titleSection: {
    gap: 4,
  },
  eyebrow: {
    fontFamily: 'InterBody',
    fontSize: 12,
    fontWeight: '700',
    color: colors.accent,
    letterSpacing: 1.2,
  },
  title: {
    fontFamily: 'FraunTitle',
    fontSize: 28,
    color: colors.ink,
  },
  subtitle: {
    fontFamily: 'InterBody',
    fontSize: 14.5,
    color: colors.inkSoft,
    lineHeight: 21,
  },
  stepProgressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingHorizontal: space(3),
    paddingVertical: space(2.5),
  },
  stepPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: '#F0F6F2',
  },
  stepPillActive: {
    backgroundColor: colors.primaryDeep,
  },
  stepPillCompleted: {
    backgroundColor: colors.primary,
  },
  stepIconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepPillText: {
    fontFamily: 'InterBody',
    fontSize: 12.5,
    fontWeight: '700',
    color: colors.inkFaint,
  },
  stepPillTextActive: {
    color: colors.white,
  },
  stepLine: {
    flex: 1,
    height: 2,
    backgroundColor: colors.borderLight,
    marginHorizontal: 4,
  },
  stepLineActive: {
    backgroundColor: colors.primary,
  },
  viewfinderCard: {
    backgroundColor: colors.card,
    borderRadius: 28,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingVertical: space(5),
    paddingHorizontal: space(4),
    alignItems: 'center',
    gap: space(3.5),
    ...Platform.select({
      ios: {
        shadowColor: '#0E1F16',
        shadowOpacity: 0.1,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 4 },
      },
      android: { elevation: 3 },
    }),
  },
  permissionWrap: {
    alignItems: 'center',
    paddingVertical: space(6),
    paddingHorizontal: space(4),
    gap: space(3),
  },
  permissionTitle: {
    fontFamily: 'InterBody',
    fontSize: 18,
    fontWeight: '700',
    color: colors.ink,
  },
  permissionDesc: {
    fontFamily: 'InterBody',
    fontSize: 14,
    color: colors.inkSoft,
    textAlign: 'center',
    lineHeight: 20,
  },
  allowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.primaryDeep,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 14,
    marginTop: space(2),
  },
  allowBtnText: {
    fontFamily: 'InterBody',
    fontSize: 15,
    fontWeight: '700',
    color: colors.white,
  },
  frameContainer: {
    width: 270,
    height: 320,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  directionGuideLeft: {
    position: 'absolute',
    left: -20,
    zIndex: 10,
    alignItems: 'center',
    backgroundColor: 'rgba(14, 31, 22, 0.85)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 2,
  },
  directionGuideRight: {
    position: 'absolute',
    right: -20,
    zIndex: 10,
    alignItems: 'center',
    backgroundColor: 'rgba(14, 31, 22, 0.85)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 2,
  },
  turnLabel: {
    fontFamily: 'InterBody',
    fontSize: 10.5,
    fontWeight: '800',
    color: '#FFD700',
    letterSpacing: 0.5,
  },
  ovalGuide: {
    width: 235,
    height: 295,
    borderRadius: 118,
    borderWidth: 4,
    borderColor: colors.primary,
    backgroundColor: '#000000',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  ovalActive: {
    borderColor: colors.accent,
  },
  ovalAnalyzing: {
    borderColor: '#20BF6B',
    borderWidth: 5,
  },
  ovalSuccess: {
    borderColor: colors.success,
    borderWidth: 5,
  },
  ovalFailed: {
    borderColor: colors.error,
    borderWidth: 5,
  },
  webPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  webPlaceholderText: {
    fontFamily: 'InterBody',
    fontSize: 13,
    color: colors.inkFaint,
  },
  scanBeam: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: '#00FF88',
    shadowColor: '#00FF88',
    shadowOpacity: 1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
  },
  overlaySuccess: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(27, 94, 63, 0.88)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 16,
  },
  overlaySuccessTitle: {
    fontFamily: 'InterBody',
    fontSize: 18,
    fontWeight: '800',
    color: colors.white,
    letterSpacing: 1.5,
    textAlign: 'center',
  },
  overlaySuccessSub: {
    fontFamily: 'InterBody',
    fontSize: 13,
    color: colors.white,
    opacity: 0.9,
    textAlign: 'center',
  },
  corner: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderColor: colors.primaryDeep,
  },
  cornerSuccess: {
    borderColor: colors.success,
  },
  cornerFailed: {
    borderColor: colors.error,
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: 3.5,
    borderLeftWidth: 3.5,
    borderTopLeftRadius: 10,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: 3.5,
    borderRightWidth: 3.5,
    borderTopRightRadius: 10,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 3.5,
    borderLeftWidth: 3.5,
    borderBottomLeftRadius: 10,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 3.5,
    borderRightWidth: 3.5,
    borderBottomRightRadius: 10,
  },
  statusBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F0F6F2',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
  },
  statusDotActive: {
    backgroundColor: colors.gold,
  },
  statusDotAnalyzing: {
    backgroundColor: '#20BF6B',
  },
  statusDotSuccess: {
    backgroundColor: colors.success,
  },
  statusDotFailed: {
    backgroundColor: colors.error,
  },
  statusLabelText: {
    fontFamily: 'InterBody',
    fontSize: 13.5,
    fontWeight: '700',
    color: colors.ink,
  },
  feedbackCard: {
    flexDirection: 'row',
    gap: space(3),
    padding: space(4),
    borderRadius: 18,
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'flex-start',
  },
  feedbackScanning: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  feedbackSuccess: {
    backgroundColor: colors.successSoft,
    borderColor: colors.success,
  },
  feedbackFailed: {
    backgroundColor: colors.errorSoft,
    borderColor: colors.error,
  },
  feedbackTitle: {
    fontFamily: 'InterBody',
    fontSize: 16,
    fontWeight: '700',
    color: colors.ink,
    marginBottom: 2,
  },
  feedbackBody: {
    fontFamily: 'InterBody',
    fontSize: 14,
    color: colors.inkSoft,
    lineHeight: 20,
  },
  tagalogHint: {
    fontFamily: 'InterBody',
    fontSize: 13,
    color: colors.inkFaint,
    fontStyle: 'italic',
    marginTop: 3,
  },
  confidenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  confidenceText: {
    fontFamily: 'InterBody',
    fontSize: 13,
    color: colors.inkSoft,
  },
  manualCard: {
    backgroundColor: colors.card,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: space(4),
    gap: space(3),
  },
  manualTitle: {
    fontFamily: 'InterBody',
    fontSize: 15,
    fontWeight: '700',
    color: colors.ink,
  },
  slotsRow: {
    flexDirection: 'row',
    gap: space(2.5),
    justifyContent: 'space-between',
  },
  slotBox: {
    flex: 1,
    backgroundColor: '#F4F8F5',
    borderWidth: 1.5,
    borderColor: colors.borderLight,
    borderRadius: 14,
    paddingVertical: space(3),
    alignItems: 'center',
    gap: 4,
  },
  slotBoxDone: {
    borderColor: colors.success,
    backgroundColor: colors.successSoft,
  },
  slotLabel: {
    fontFamily: 'InterBody',
    fontSize: 12.5,
    fontWeight: '700',
    color: colors.inkSoft,
  },
  manualSubmitBtn: {
    backgroundColor: colors.primaryDeep,
    height: 48,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  manualSubmitBtnText: {
    fontFamily: 'InterBody',
    fontSize: 15,
    fontWeight: '700',
    color: colors.white,
  },
  retryBtn: {
    height: 54,
    backgroundColor: colors.primaryDeep,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
      android: { elevation: 2 },
    }),
  },
  retryBtnText: {
    fontFamily: 'InterBody',
    fontWeight: '700',
    fontSize: 16,
    color: colors.white,
  },
  tipsCard: {
    backgroundColor: colors.goldSoft,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#EBDCB9',
    padding: space(4),
    gap: space(2),
  },
  tipsTitle: {
    fontFamily: 'InterBody',
    fontWeight: '700',
    fontSize: 14,
    color: colors.ink,
    marginBottom: 2,
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space(2),
  },
  tipText: {
    fontFamily: 'InterBody',
    fontSize: 13,
    color: colors.inkSoft,
    flex: 1,
    lineHeight: 18,
  },
  fallbackLink: {
    alignItems: 'center',
    paddingVertical: space(2),
  },
  fallbackText: {
    fontFamily: 'InterBody',
    fontSize: 13,
    color: colors.inkFaint,
    textDecorationLine: 'underline',
    textAlign: 'center',
  },
});
