import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  ActivityIndicator,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Toast from '../components/Toast';
import { loginUser } from '../lib/authApi';
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
  primarySoft: '#E3F2E8',
  accent: '#4C9A6B',
  border: '#B9D4C5',
  error: '#C62828',
  white: '#FFFFFF',
};

const space = (n: number) => n * 4;

export default function LoginScreen() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ visible: boolean; message: string; type: 'success' | 'error' }>({
    visible: false, message: '', type: 'success',
  });

  const showToast = (message: string, type: 'success' | 'error') =>
    setToast({ visible: true, message, type });

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      showToast('Please fill in all fields.', 'error');
      return;
    }
    setLoading(true);
    try {
      const data = await loginUser({ email: email.trim(), password });
      showToast('Credentials verified! Please verify your face…', 'success');

      // Direct to facial verification before granting full session and dashboard access
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
    <SafeAreaView style={styles.safe} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.bg} />
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
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Back */}
          <TouchableOpacity
            style={styles.back}
            onPress={() => router.back()}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityLabel="Go back"
          >
            <Ionicons name="arrow-back" size={24} color={colors.primaryDeep} />
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>

          {/* Logo */}
          <View style={styles.logoWrap}>
            <Image
              source={require('../assets/images/pateros-logo.png')}
              style={styles.logo}
              resizeMode="contain"
              accessibilityLabel="Gobyernong Pateros logo"
            />
            <Text style={styles.eyebrow}>MUNICIPALITY OF PATEROS</Text>
            <Text style={styles.title}>Welcome Back</Text>
            <Text style={styles.subtitle}>Log in to your AUREA account</Text>
          </View>

          {/* Form card — matches the section-card treatment on the register screen */}
          <View style={styles.formCard}>
            <View style={styles.fieldBlock}>
              <Text style={styles.label}>Email Address</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor={colors.inkSoft}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
              />
            </View>

            <View style={styles.fieldBlock}>
              <Text style={styles.label}>Password</Text>
              <View style={styles.passwordWrap}>
                <TextInput
                  style={styles.passwordInput}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Enter your password"
                  placeholderTextColor={colors.inkSoft}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  returnKeyType="done"
                  onSubmitEditing={handleLogin}
                />
                <TouchableOpacity
                  onPress={() => setShowPassword((p) => !p)}
                  activeOpacity={0.7}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                >
                  <Ionicons
                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={24}
                    color={colors.primaryDeep}
                  />
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity
              style={styles.forgotWrap}
              activeOpacity={0.7}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
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
                <Text style={styles.submitText}>Log In</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>Don&apos;t have an account? </Text>
            <TouchableOpacity onPress={() => router.replace('/register')} activeOpacity={0.7}>
              <Text style={styles.footerLink}>Register</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: {
    flexGrow: 1,
    paddingHorizontal: space(5),
    paddingBottom: space(8),
    paddingTop: Math.max(space(2), 10),
  },
  back: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: space(4),
    gap: 6,
  },
  backText: {
    fontFamily: 'InterBody',
    fontSize: 16,
    color: colors.primaryDeep,
    fontWeight: '700',
  },
  logoWrap: {
    alignItems: 'center',
    marginTop: space(5),
    marginBottom: space(6),
  },
  logo: {
    width: 88,
    height: 88,
    marginBottom: space(3),
  },
  eyebrow: {
    fontFamily: 'InterBody',
    fontWeight: '700',
    fontSize: 11,
    letterSpacing: 1.4,
    color: colors.accent,
    marginBottom: space(2),
  },
  title: {
    fontFamily: 'FraunTitle',
    fontSize: 30,
    color: colors.ink,
    marginBottom: 6,
  },
  subtitle: {
    fontFamily: 'InterBody',
    fontSize: 15,
    color: colors.inkSoft,
  },

  formCard: {
    backgroundColor: colors.white,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: space(5),
    gap: space(5),
    ...Platform.select({
      ios: { shadowColor: '#0E1F16', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
      android: { elevation: 1 },
    }),
  },
  fieldBlock: { gap: 0 },
  label: {
    fontFamily: 'InterBody',
    fontWeight: '700',
    fontSize: 15,
    color: colors.ink,
    marginBottom: space(2),
  },
  input: {
    height: 58,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.white,
    paddingHorizontal: space(4),
    fontFamily: 'InterBody',
    fontSize: 17,
    color: colors.ink,
  },
  passwordWrap: {
    height: 58,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.white,
    paddingHorizontal: space(4),
    flexDirection: 'row',
    alignItems: 'center',
  },
  passwordInput: {
    flex: 1,
    fontFamily: 'InterBody',
    fontSize: 17,
    color: colors.ink,
  },
  forgotWrap: {
    alignSelf: 'flex-end',
    marginTop: -space(2),
  },
  forgotText: {
    fontFamily: 'InterBody',
    fontSize: 14,
    color: colors.primaryDeep,
    fontWeight: '700',
  },
  submitBtn: {
    height: 58,
    borderRadius: 16,
    backgroundColor: colors.primaryDeep,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.16, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
      android: { elevation: 3 },
    }),
  },
  submitText: {
    fontFamily: 'InterBody',
    fontWeight: '700',
    fontSize: 17,
    color: colors.white,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: space(6),
  },
  footerText: {
    fontFamily: 'InterBody',
    fontSize: 14.5,
    color: colors.inkSoft,
  },
  footerLink: {
    fontFamily: 'InterBody',
    fontSize: 14.5,
    fontWeight: '700',
    color: colors.primaryDeep,
  },
});