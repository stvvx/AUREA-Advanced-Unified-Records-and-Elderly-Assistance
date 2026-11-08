import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  type TextInputInstance,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  ActivityIndicator,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import Toast from '../components/Toast';
import { isAdministrativeRole, loginUser, requiresFaceVerification } from '../lib/authApi';
import { useAuth } from '../context/AuthContext';

// ---------------------------------------------------------------------------
// Design tokens — kept in sync with the register screen: larger type scale,
// thicker borders, taller controls, higher-contrast ink for readability.
// ---------------------------------------------------------------------------
const colors = {
  bg: '#F6FAF7',
  ink: '#0E1F16',
  inkSoft: '#3E5548',
  primary: '#2E7D52',
  primaryDeep: '#1B5E3F',
  primaryDarkest: '#0F3323',
  primarySoft: '#E3F2E8',
  accent: '#4C9A6B',
  border: '#B9D4C5',
  error: '#C62828',
  errorSoft: '#FDECEA',
  white: '#FFFFFF',
};

const space = (n: number) => n * 4;

type FieldProps = {
  label: string;
  icon: string;
  error?: boolean;
  right?: React.ReactNode;
  inputRef?: React.RefObject<TextInputInstance | null>;
} & React.ComponentProps<typeof TextInput>;

function Field({ label, icon, error, right, inputRef, ...inputProps }: FieldProps) {
  const [focused, setFocused] = useState(false);
  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <View
        style={[
          styles.inputWrap,
          focused && styles.inputWrapFocused,
          error && styles.inputWrapError,
        ]}
      >
        <Ionicons
          name={icon as any}
          size={22}
          color={error ? colors.error : focused ? colors.primaryDeep : colors.inkSoft}
        />
        <TextInput
          ref={inputRef}
          {...inputProps}
          onFocus={(e) => { setFocused(true); inputProps.onFocus?.(e); }}
          onBlur={(e) => { setFocused(false); inputProps.onBlur?.(e); }}
          placeholderTextColor="#6F8478"
          style={styles.input}
        />
        {right}
      </View>
      {error ? (
        <View style={styles.errorRow}>
          <Ionicons name="alert-circle" size={15} color={colors.error} />
          <Text style={styles.errorText}>
            {label === 'Email address' ? 'Enter your email address.' : 'Enter your password.'}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

export default function LoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { login } = useAuth();
  const passwordRef = useRef<TextInputInstance>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [toast, setToast] = useState<{ visible: boolean; message: string; type: 'success' | 'error' }>({
    visible: false, message: '', type: 'success',
  });

  const showToast = (message: string, type: 'success' | 'error') =>
    setToast({ visible: true, message, type });

  const emailMissing = submitted && !email.trim();
  const passwordMissing = submitted && !password.trim();

  const handleLogin = async () => {
    setSubmitted(true);
    if (!email.trim() || !password.trim()) {
      showToast('Please fill in all fields.', 'error');
      return;
    }
    setLoading(true);
    try {
      const data = await loginUser({ email: email.trim(), password });
      const needsFaceVerification =
        data.user.requiresFaceVerification ?? requiresFaceVerification(data.user.role);

      if (!needsFaceVerification) {
        await login(data.user);
        showToast('Login successful!', 'success');
        setTimeout(() => {
          router.replace(isAdministrativeRole(data.user.role) ? '/admin-dashboard' : '/(tabs)');
        }, 500);
        return;
      }

      showToast('Credentials verified! Please verify your face…', 'success');

      setTimeout(() => {
        router.replace({
          pathname: '/face-verification',
          params: {
            userId: data.user.id.toString(),
            userName: data.user.firstName,
            avatarUrl: data.user.avatarUrl || data.user.profilePhoto || '',
            role: data.user.role ?? 'user',
          },
        } as any);
      }, 900);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid email or password.';
      showToast(message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.safe}>
      <StatusBar barStyle="light-content" />
      <Toast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        onHide={() => setToast((t) => ({ ...t, visible: false }))}
      />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Hero ── */}
          <LinearGradient
            colors={[colors.primary, colors.primaryDarkest]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.hero, { paddingTop: Math.max(insets.top, space(3)) + space(2) }]}
          >
            <View style={styles.heroCircleA} pointerEvents="none" />
            <View style={styles.heroCircleB} pointerEvents="none" />

            <TouchableOpacity
              style={styles.back}
              onPress={() => router.back()}
              activeOpacity={0.7}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <Ionicons name="arrow-back" size={22} color={colors.white} />
              <Text style={styles.backText}>Back</Text>
            </TouchableOpacity>

            <View style={styles.logoCard}>
              <Image
                source={require('../assets/images/aurea-pateros-logo.png')}
                style={styles.aureaLogo}
                resizeMode="contain"
                accessibilityLabel="AUREA Municipality of Pateros logo"
              />
              <View style={styles.logoDivider} />
              <Image
                source={require('../assets/images/image copy 2.png')}
                style={styles.logo}
                resizeMode="contain"
                accessibilityLabel="Gobyernong Pateros logo"
              />
            </View>

            <Text style={styles.title}>Welcome back</Text>
            <Text style={styles.subtitle}>Log in to your AUREA account</Text>
          </LinearGradient>

          {/* ── Form ── */}
          <View style={styles.sheet}>
            <View style={styles.formCard}>
              <Field
                label="Email address"
                icon="mail-outline"
                error={emailMissing}
                value={email}
                onChangeText={setEmail}
                placeholder="you@gmail.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                textContentType="emailAddress"
                returnKeyType="next"
                onSubmitEditing={() => passwordRef.current?.focus()}
                blurOnSubmit={false}
              />

              <Field
                label="Password"
                icon="lock-closed-outline"
                error={passwordMissing}
                inputRef={passwordRef}
                value={password}
                onChangeText={setPassword}
                placeholder="Enter your password"
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoComplete="password"
                textContentType="password"
                returnKeyType="done"
                onSubmitEditing={handleLogin}
                right={
                  <TouchableOpacity
                    onPress={() => setShowPassword((p) => !p)}
                    activeOpacity={0.7}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    accessibilityRole="button"
                    accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                  >
                    <Ionicons
                      name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                      size={24}
                      color={colors.primaryDeep}
                    />
                  </TouchableOpacity>
                }
              />

              <TouchableOpacity
                style={styles.forgotWrap}
                activeOpacity={0.7}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                onPress={() => showToast("Password reset isn't available yet.", 'error')}
                accessibilityRole="button"
              >
                <Text style={styles.forgotText}>Forgot password?</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.submitBtn, loading && { opacity: 0.7 }]}
                onPress={handleLogin}
                activeOpacity={0.85}
                disabled={loading}
                accessibilityRole="button"
                accessibilityLabel="Log in"
              >
                {loading ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <>
                    <Text style={styles.submitText}>Log in</Text>
                    <Ionicons name="arrow-forward" size={20} color={colors.white} />
                  </>
                )}
              </TouchableOpacity>
            </View>

            {/* Face verification note */}
            <View style={styles.note}>
              <View style={styles.noteIcon}>
                <Ionicons name="scan-outline" size={20} color={colors.primaryDeep} />
              </View>
              <Text style={styles.noteText}>
                For your security, some accounts will be asked to verify their face after entering a password.
              </Text>
            </View>

            {/* Register */}
            <View style={styles.footer}>
              <Text style={styles.footerText}>New to AUREA?</Text>
              <TouchableOpacity
                style={styles.registerBtn}
                onPress={() => router.replace('/register')}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Create an account"
              >
                <Text style={styles.registerText}>Create an account</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { flexGrow: 1, paddingBottom: space(8) },

  // Hero
  hero: {
    paddingHorizontal: space(5),
    paddingBottom: space(14),
    borderBottomLeftRadius: 36,
    borderBottomRightRadius: 36,
    alignItems: 'center',
    overflow: 'hidden',
  },
  heroCircleA: {
    position: 'absolute',
    top: -60,
    right: -50,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  heroCircleB: {
    position: 'absolute',
    bottom: -40,
    left: -60,
    width: 170,
    height: 170,
    borderRadius: 85,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  back: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderRadius: 22,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  backText: {
    fontFamily: 'InterBody',
    fontSize: 16,
    color: colors.white,
    fontWeight: '700',
  },
  logoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space(3),
    backgroundColor: colors.white,
    borderRadius: 24,
    paddingVertical: space(3),
    paddingHorizontal: space(5),
    marginTop: space(5),
    marginBottom: space(5),
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 14, shadowOffset: { width: 0, height: 6 } },
      android: { elevation: 4 },
    }),
  },
  aureaLogo: { width: 112, height: 72 },
  logoDivider: { width: 1.5, height: 44, backgroundColor: colors.border },
  logo: { width: 72, height: 72 },
  title: {
    fontFamily: 'FraunTitle',
    fontSize: 32,
    color: colors.white,
    marginBottom: 6,
  },
  subtitle: {
    fontFamily: 'InterBody',
    fontSize: 16,
    color: 'rgba(255,255,255,0.82)',
  },

  // Sheet (overlaps hero)
  sheet: {
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    paddingHorizontal: space(5),
    marginTop: -space(9),
  },
  formCard: {
    backgroundColor: colors.white,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: space(5),
    gap: space(5),
    ...Platform.select({
      ios: { shadowColor: '#0E1F16', shadowOpacity: 0.1, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } },
      android: { elevation: 3 },
    }),
  },

  // Fields
  label: {
    fontFamily: 'InterBody',
    fontWeight: '700',
    fontSize: 15,
    color: colors.ink,
    marginBottom: space(2),
  },
  inputWrap: {
    height: 60,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    paddingHorizontal: space(4),
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(3),
  },
  inputWrapFocused: {
    borderColor: colors.primary,
    backgroundColor: colors.white,
  },
  inputWrapError: {
    borderColor: colors.error,
    backgroundColor: colors.errorSoft,
  },
  input: {
    flex: 1,
    height: '100%',
    fontFamily: 'InterBody',
    fontSize: 17,
    color: colors.ink,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}),
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  errorText: {
    fontFamily: 'InterBody',
    fontSize: 14,
    fontWeight: '600',
    color: colors.error,
  },

  forgotWrap: {
    alignSelf: 'flex-end',
    marginTop: -space(2),
    paddingVertical: 2,
  },
  forgotText: {
    fontFamily: 'InterBody',
    fontSize: 15,
    color: colors.primaryDeep,
    fontWeight: '700',
  },
  submitBtn: {
    height: 60,
    borderRadius: 18,
    backgroundColor: colors.primaryDeep,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: { shadowColor: colors.primaryDeep, shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } },
      android: { elevation: 4 },
    }),
  },
  submitText: {
    fontFamily: 'InterBody',
    fontWeight: '700',
    fontSize: 18,
    color: colors.white,
  },

  // Note
  note: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(3),
    backgroundColor: colors.primarySoft,
    borderRadius: 18,
    padding: space(4),
    marginTop: space(5),
  },
  noteIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noteText: {
    flex: 1,
    fontFamily: 'InterBody',
    fontSize: 14,
    lineHeight: 20,
    color: colors.inkSoft,
  },

  // Footer
  footer: {
    alignItems: 'center',
    gap: space(3),
    marginTop: space(6),
  },
  footerText: {
    fontFamily: 'InterBody',
    fontSize: 15,
    color: colors.inkSoft,
  },
  registerBtn: {
    alignSelf: 'stretch',
    height: 56,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.primaryDeep,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
  },
  registerText: {
    fontFamily: 'InterBody',
    fontSize: 17,
    fontWeight: '700',
    color: colors.primaryDeep,
  },
});