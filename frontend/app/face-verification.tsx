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
  Alert,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import Toast from '../components/Toast';
import { verifyFace, enrollFace, getUser } from '../lib/authApi';
import { useAuth } from '../context/AuthContext';

// ---------------------------------------------------------------------------
// Design Tokens
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

type VerifyState = 'permission' | 'aligning' | 'scanning' | 'success' | 'failed';

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
  const [verifyState, setVerifyState] = useState<VerifyState>('aligning');
  const [statusMessage, setStatusMessage] = useState<string>('Please look directly into the camera...');
  const [confidenceScore, setConfidenceScore] = useState<number | null>(null);
  const [retryCountdown, setRetryCountdown] = useState<number | null>(null);
  const [fallbackImage, setFallbackImage] = useState<string | null>(null);

  const [toast, setToast] = useState<{ visible: boolean; message: string; type: 'success' | 'error' }>({
    visible: false,
    message: '',
    type: 'success',
  });

  // Animations
  const scanAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const ringRotateAnim = useRef(new Animated.Value(0)).current;

  // Auto-verification trigger guard
  const isVerifyingRef = useRef(false);
  const autoScanTimerRef = useRef<any>(null);
  const countdownTimerRef = useRef<any>(null);

  // Animations setup
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
          duration: 1600,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(scanAnim, {
          toValue: 0,
          duration: 1600,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Subtle rotation on outer tracker
    Animated.loop(
      Animated.timing(ringRotateAnim, {
        toValue: 1,
        duration: 8000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();
  }, [pulseAnim, scanAnim, ringRotateAnim]);

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

  // Request camera permissions on load
  useEffect(() => {
    if (!permission?.granted) {
      requestPermission();
    }
  }, [permission, requestPermission]);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ visible: true, message, type });
  };

  // Perform Face Capture & Biometric Check
  const performAutoVerification = useCallback(async () => {
    if (isVerifyingRef.current) return;
    if (!userId) {
      showToast('User session error. Please log in again.', 'error');
      return;
    }

    isVerifyingRef.current = true;
    setVerifyState('scanning');
    setStatusMessage('Hold still… Verifying your identity…');

    try {
      let base64Photo = '';

      if (cameraRef.current) {
        const photo = await cameraRef.current.takePictureAsync({
          quality: 0.85,
          base64: true,
          skipProcessing: false,
        });
        if (photo?.base64) {
          base64Photo = photo.base64;
          setFallbackImage(photo.uri);
        }
      }

      if (!base64Photo) {
        throw new Error('Camera could not capture frame. Please ensure camera is open.');
      }

      if (!hasRegisteredFace) {
        // First-Time Biometric Enrollment Mode
        const enrollRes = await enrollFace({
          userId,
          image: base64Photo,
          mimeType: 'image/jpeg',
        });

        if (enrollRes.success) {
          try {
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } catch {}

          setVerifyState('success');
          setStatusMessage('Face ID Enrolled & Verified! Welcome to AUREA.');

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
          }, 1400);
        } else {
          throw new Error(enrollRes.message || 'Face enrollment failed.');
        }
      } else {
        // Standard Biometric Verification Mode
        const verifyRes = await verifyFace({
          userId,
          image: base64Photo,
          mimeType: 'image/jpeg',
        });

        if (verifyRes.verified) {
          try {
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } catch {}

          setVerifyState('success');
          setConfidenceScore(verifyRes.confidence ?? 96);
          setStatusMessage(verifyRes.message || 'Identity verified! Welcome back.');

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
          }, 1400);
        } else {
          try {
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          } catch {}

          setVerifyState('failed');
          setConfidenceScore(verifyRes.confidence ?? 0);
          setStatusMessage(
            verifyRes.message || 'Face not recognized. Please face the screen directly.'
          );
          startAutoRetryCountdown();
        }
      }
    } catch (err: any) {
      try {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } catch {}

      setVerifyState('failed');
      const msg = err?.message || 'Verification error. Retrying...';
      setStatusMessage(msg);
      startAutoRetryCountdown();
    } finally {
      isVerifyingRef.current = false;
    }
  }, [userId, hasRegisteredFace, userName, userRole, initialAvatar, login, router]);

  // Countdown timer for automatic retry if face was obscured / not matching
  const startAutoRetryCountdown = () => {
    let count = 3;
    setRetryCountdown(count);
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);

    countdownTimerRef.current = setInterval(() => {
      count -= 1;
      if (count <= 0) {
        if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
        setRetryCountdown(null);
        setVerifyState('aligning');
        setStatusMessage('Positioning face... Look directly at the screen.');
        // Schedule next automatic attempt
        autoScanTimerRef.current = setTimeout(() => {
          performAutoVerification();
        }, 1200);
      } else {
        setRetryCountdown(count);
      }
    }, 1000);
  };

  // When camera initializes, trigger automatic scan after a short stabilization delay
  const handleCameraReady = () => {
    setCameraReady(true);
    setVerifyState('aligning');
    setStatusMessage('Position your face inside the circle…');

    // Give senior citizen 1.8 seconds to position their face naturally, then auto-verify
    if (autoScanTimerRef.current) clearTimeout(autoScanTimerRef.current);
    autoScanTimerRef.current = setTimeout(() => {
      performAutoVerification();
    }, 1800);
  };

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      if (autoScanTimerRef.current) clearTimeout(autoScanTimerRef.current);
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    };
  }, []);

  // Manual fallback via photo picker (if camera fails or on unsupported platform)
  const handleManualUpload = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
        base64: true,
      });

      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      const b64 = asset.base64;
      if (!b64) return;

      setFallbackImage(asset.uri);
      setVerifyState('scanning');
      setStatusMessage('Verifying uploaded photo...');

      const verifyRes = await verifyFace({
        userId,
        image: b64,
        mimeType: asset.mimeType || 'image/jpeg',
      });

      if (verifyRes.verified) {
        setVerifyState('success');
        setStatusMessage('Identity Verified!');
        const finalUser = verifyRes.user || {
          id: userId,
          firstName: userName,
          lastName: '',
          email: '',
          avatarUrl: initialAvatar || null,
          role: userRole,
        };
        await login(finalUser as any);
        const dest = ((finalUser as any).role || userRole).includes('admin') ? '/admin-dashboard' : '/(tabs)';
        setTimeout(() => router.replace(dest as any), 1200);
      } else {
        setVerifyState('failed');
        setStatusMessage(verifyRes.message || 'Face did not match.');
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to verify photo', 'error');
    }
  };

  const translateY = scanAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-110, 110],
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
            <Text style={styles.badgeText}>AUTOMATIC FACE VERIFICATION</Text>
          </View>
        </View>

        {/* Title */}
        <View style={styles.titleSection}>
          <Text style={styles.eyebrow}>MUNICIPALITY OF PATEROS • AUREA</Text>
          <Text style={styles.title}>
            {hasRegisteredFace ? 'Automatic Face ID' : 'Biometric Face Setup'}
          </Text>
          <Text style={styles.subtitle}>
            {hasRegisteredFace
              ? `Magandang araw, ${userName}! Tumingin lamang sa camera para awtomatikong mag-verify.`
              : `Hello, ${userName}! Look into the camera to automatically enroll your Face ID.`}
          </Text>
        </View>

        {/* GCash-style Biometric Oval Frame */}
        <View style={styles.viewfinderCard}>
          {/* Permission Not Granted State */}
          {!permission?.granted ? (
            <View style={styles.permissionWrap}>
              <Ionicons name="videocam-outline" size={64} color={colors.primaryDeep} />
              <Text style={styles.permissionTitle}>Camera Access Required</Text>
              <Text style={styles.permissionDesc}>
                To automatically verify your identity like GCash, please allow camera permission.
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
            /* Live Camera Oval Container */
            <View style={styles.frameContainer}>
              <Animated.View
                style={[
                  styles.ovalGuide,
                  { transform: [{ scale: verifyState === 'scanning' ? pulseAnim : 1 }] },
                  verifyState === 'aligning' && styles.ovalAligning,
                  verifyState === 'scanning' && styles.ovalScanning,
                  verifyState === 'success' && styles.ovalSuccess,
                  verifyState === 'failed' && styles.ovalFailed,
                ]}
              >
                {/* Live Native Camera Feed */}
                {Platform.OS !== 'web' ? (
                  <CameraView
                    ref={cameraRef}
                    style={StyleSheet.absoluteFillObject}
                    facing="front"
                    onCameraReady={handleCameraReady}
                  />
                ) : (
                  /* Web Fallback Preview */
                  fallbackImage ? (
                    <Image source={{ uri: fallbackImage }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
                  ) : (
                    <View style={styles.webPlaceholder}>
                      <Ionicons name="person" size={80} color={colors.border} />
                      <Text style={styles.webPlaceholderText}>Web Camera View</Text>
                    </View>
                  )
                )}

                {/* Laser Scanning Beam while analyzing */}
                {verifyState === 'scanning' && (
                  <Animated.View
                    style={[
                      styles.scanBeam,
                      { transform: [{ translateY }] },
                    ]}
                  />
                )}

                {/* Success Overlay */}
                {verifyState === 'success' && (
                  <View style={styles.overlaySuccess}>
                    <Ionicons name="checkmark-circle" size={64} color={colors.white} />
                    <Text style={styles.overlaySuccessTitle}>VERIFIED</Text>
                    <Text style={styles.overlaySuccessSub}>Logging in…</Text>
                  </View>
                )}
              </Animated.View>

              {/* High-Tech Biometric Brackets */}
              <View style={[styles.corner, styles.cornerTL, verifyState === 'success' && styles.cornerSuccess, verifyState === 'failed' && styles.cornerFailed]} />
              <View style={[styles.corner, styles.cornerTR, verifyState === 'success' && styles.cornerSuccess, verifyState === 'failed' && styles.cornerFailed]} />
              <View style={[styles.corner, styles.cornerBL, verifyState === 'success' && styles.cornerSuccess, verifyState === 'failed' && styles.cornerFailed]} />
              <View style={[styles.corner, styles.cornerBR, verifyState === 'success' && styles.cornerSuccess, verifyState === 'failed' && styles.cornerFailed]} />
            </View>
          )}

          {/* Automatic Live Status Indicator */}
          <View style={styles.statusBox}>
            <View
              style={[
                styles.statusDot,
                verifyState === 'aligning' && styles.statusDotAligning,
                verifyState === 'scanning' && styles.statusDotScanning,
                verifyState === 'success' && styles.statusDotSuccess,
                verifyState === 'failed' && styles.statusDotFailed,
              ]}
            />
            <Text style={styles.statusLabelText}>
              {verifyState === 'aligning'
                ? 'Aligning face… Hold still'
                : verifyState === 'scanning'
                ? 'Analyzing biometrics…'
                : verifyState === 'success'
                ? 'Verification Complete!'
                : retryCountdown !== null
                ? `Auto-retrying in ${retryCountdown}s…`
                : 'Face not recognized'}
            </Text>
          </View>
        </View>

        {/* Live Feedback Card */}
        <View
          style={[
            styles.feedbackCard,
            verifyState === 'success' && styles.feedbackSuccess,
            verifyState === 'failed' && styles.feedbackFailed,
            verifyState === 'scanning' && styles.feedbackScanning,
          ]}
        >
          {verifyState === 'scanning' ? (
            <ActivityIndicator size="small" color={colors.primaryDeep} />
          ) : (
            <Ionicons
              name={
                verifyState === 'success'
                  ? 'checkmark-circle'
                  : verifyState === 'failed'
                  ? 'alert-circle'
                  : 'eye-outline'
              }
              size={26}
              color={
                verifyState === 'success'
                  ? colors.success
                  : verifyState === 'failed'
                  ? colors.error
                  : colors.primaryDeep
              }
            />
          )}

          <View style={{ flex: 1 }}>
            <Text
              style={[
                styles.feedbackTitle,
                verifyState === 'success' && { color: colors.success },
                verifyState === 'failed' && { color: colors.error },
              ]}
            >
              {verifyState === 'success'
                ? 'Identity Confirmed'
                : verifyState === 'failed'
                ? 'Verification Issue'
                : 'Automatic Camera Scan'}
            </Text>
            <Text style={styles.feedbackBody}>{statusMessage}</Text>

            {confidenceScore !== null && verifyState !== 'scanning' && (
              <Text style={styles.confidenceText}>
                Biometric Confidence: <Text style={{ fontWeight: '700' }}>{confidenceScore}%</Text>
              </Text>
            )}
          </View>
        </View>

        {/* Quick Re-scan Button (If failed or senior wants to trigger immediately) */}
        {verifyState === 'failed' && (
          <TouchableOpacity
            style={styles.retryBtn}
            onPress={() => {
              if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
              setRetryCountdown(null);
              performAutoVerification();
            }}
            activeOpacity={0.85}
          >
            <Ionicons name="refresh" size={20} color={colors.white} />
            <Text style={styles.retryBtnText}>Scan Again Now</Text>
          </TouchableOpacity>
        )}

        {/* Senior Assistance & Tips */}
        <View style={styles.tipsCard}>
          <Text style={styles.tipsTitle}>Senior Citizen Friendly Tips:</Text>
          <View style={styles.tipRow}>
            <Ionicons name="phone-portrait-outline" size={18} color={colors.gold} />
            <Text style={styles.tipText}>Hawakan ang telepono nang pantay sa iyong mukha.</Text>
          </View>
          <View style={styles.tipRow}>
            <Ionicons name="sunny-outline" size={18} color={colors.gold} />
            <Text style={styles.tipText}>Tiyaking may sapat na liwanag at walang takip ang mukha.</Text>
          </View>
        </View>

        {/* Fallback Option */}
        <TouchableOpacity
          style={styles.fallbackLink}
          onPress={handleManualUpload}
          activeOpacity={0.7}
        >
          <Text style={styles.fallbackText}>Camera not working? Select photo from gallery</Text>
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
    fontSize: 11,
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
    fontSize: 15,
    color: colors.inkSoft,
    lineHeight: 22,
  },
  viewfinderCard: {
    backgroundColor: colors.card,
    borderRadius: 28,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingVertical: space(6),
    paddingHorizontal: space(4),
    alignItems: 'center',
    gap: space(4),
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
    width: 260,
    height: 310,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  ovalGuide: {
    width: 230,
    height: 290,
    borderRadius: 115,
    borderWidth: 4,
    borderColor: colors.primary,
    backgroundColor: '#000000',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  ovalAligning: {
    borderColor: colors.accent,
  },
  ovalScanning: {
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
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },
  overlaySuccess: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(27, 94, 63, 0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  overlaySuccessTitle: {
    fontFamily: 'InterBody',
    fontSize: 20,
    fontWeight: '800',
    color: colors.white,
    letterSpacing: 2,
  },
  overlaySuccessSub: {
    fontFamily: 'InterBody',
    fontSize: 14,
    color: colors.white,
    opacity: 0.9,
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
  statusDotAligning: {
    backgroundColor: colors.gold,
  },
  statusDotScanning: {
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
    fontSize: 14,
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
  confidenceText: {
    fontFamily: 'InterBody',
    fontSize: 13,
    color: colors.inkSoft,
    marginTop: 4,
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
    alignItems: 'center',
    gap: space(2),
  },
  tipText: {
    fontFamily: 'InterBody',
    fontSize: 13.5,
    color: colors.inkSoft,
    flex: 1,
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
  },
});
