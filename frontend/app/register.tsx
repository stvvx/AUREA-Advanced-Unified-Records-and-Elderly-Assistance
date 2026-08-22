import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  StatusBar,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  ActivityIndicator,
  Modal,
  FlatList,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useRouter } from 'expo-router';
import Toast from '../components/Toast';
import { registerUser } from '../lib/authApi';
import { useAuth } from '../context/AuthContext';

// ---------------------------------------------------------------------------
// Design tokens
// Bumped for readability: larger type scale, thicker borders, taller controls,
// higher-contrast ink so the form is comfortable for older / low-vision users.
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
  borderFocus: '#2E7D52',
  error: '#C62828',
  errorSoft: '#FDECEC',
  white: '#FFFFFF',
  track: '#DCEAE1',
};

const space = (n: number) => n * 4;

type Field = {
  label: string;
  key: string;
  placeholder: string;
  helper?: string;
  keyboardType?: 'default' | 'email-address' | 'numeric' | 'phone-pad';
  autoCapitalize?: 'none' | 'words' | 'sentences';
  secure?: boolean;
  required?: boolean;
};

const BARANGAYS = [
  'Aguho',
  'Magtanggol',
  'Martires Del 96',
  'Poblacion',
  'San Pedro',
  'San Roque',
  'Santa Ana',
  'Santo Rosario-Kanluran',
  'Santo Rosario-Silangan',
  'Tabacalera',
];

const PERSONAL_FIELDS: Field[] = [
  { label: 'First Name', key: 'firstName', placeholder: 'Juan', autoCapitalize: 'words', required: true },
  { label: 'Middle Name', key: 'middleName', placeholder: 'Santos', helper: 'Optional', autoCapitalize: 'words' },
  { label: 'Last Name', key: 'lastName', placeholder: 'Dela Cruz', autoCapitalize: 'words', required: true },
  { label: 'Contact Number', key: 'contact', placeholder: '09XXXXXXXXX', helper: 'Your mobile or a family member\u2019s number', keyboardType: 'phone-pad', required: true },
];

const ACCOUNT_FIELDS: Field[] = [
  { label: 'Email Address', key: 'email', placeholder: 'you@example.com', keyboardType: 'email-address', autoCapitalize: 'none', required: true },
  { label: 'Password', key: 'password', placeholder: 'At least 8 characters', helper: 'Use 8 or more characters', autoCapitalize: 'none', secure: true, required: true },
  { label: 'Confirm Password', key: 'confirmPassword', placeholder: 'Re-enter password', autoCapitalize: 'none', secure: true, required: true },
];

const STEPS = [
  { title: 'Personal Information', icon: 'person-outline', description: 'Tell us who you are' },
  { title: 'Home Address', icon: 'location-outline', description: 'Where you live in Pateros' },
  { title: 'Account Details', icon: 'lock-closed-outline', description: 'Set up your login' },
] as const;

function toDobString(date: Date) {
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

function parseDobString(value?: string): Date | null {
  if (!value) return null;

  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;

  const month = Number(match[1]);
  const day = Number(match[2]);
  const year = Number(match[3]);

  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year
    || date.getMonth() !== month - 1
    || date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

export default function RegisterScreen() {
  const router = useRouter();
  const { login } = useAuth();
  const scrollRef = useRef<ScrollView>(null);

  const [step, setStep] = useState(0);
  const [form, setForm] = useState<Record<string, string>>({});
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [dobOpen, setDobOpen] = useState(false);
  const [dobDraft, setDobDraft] = useState(() => {
    const base = new Date();
    base.setFullYear(base.getFullYear() - 60);
    return base;
  });
  const [barangayOpen, setBarangayOpen] = useState(false);
  const [gender, setGender] = useState('');
  const [genderOpen, setGenderOpen] = useState(false);
  const [civilStatus, setCivilStatus] = useState('');
  const [civilStatusOpen, setCivilStatusOpen] = useState(false);
  const [address, setAddress] = useState({ barangay: '', houseNo: '', street: '', subdivision: '' });
  const [toast, setToast] = useState<{ visible: boolean; message: string; type: 'success' | 'error' }>({
    visible: false, message: '', type: 'success',
  });

  const openDobPicker = () => {
    const parsed = parseDobString(form.dob);
    setDobDraft(parsed ?? dobDraft);
    setDobOpen(true);
  };

  const confirmDob = () => {
    set('dob', toDobString(dobDraft));
    setDobOpen(false);
  };

  const buildAddress = () => {
    const parts = [
      address.houseNo.trim(),
      address.street.trim(),
      address.subdivision.trim(),
      address.barangay ? `Brgy. ${address.barangay}` : '',
      'Pateros',
    ].filter(Boolean);
    return parts.join(', ');
  };

  const showToast = (message: string, type: 'success' | 'error') =>
    setToast({ visible: true, message, type });

  const set = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const scrollTop = () => scrollRef.current?.scrollTo({ y: 0, animated: true });

  // Validation is split per step so seniors get a focused, specific message
  // instead of a single wall of requirements at the very end.
  const validateStep = (index: number): string | null => {
    if (index === 0) {
      if (!form.firstName?.trim()) return 'Please enter your first name.';
      if (!form.lastName?.trim()) return 'Please enter your last name.';
      if (!form.dob?.trim()) return 'Please select your date of birth.';
      if (!gender) return 'Please select your gender.';
      if (!form.contact?.trim()) return 'Please enter a contact number.';
      return null;
    }
    if (index === 1) {
      if (!address.barangay) return 'Please select your barangay.';
      if (!address.houseNo.trim()) return 'Please enter your house number.';
      if (!address.street.trim()) return 'Please enter your street.';
      return null;
    }
    if (!form.email?.trim()) return 'Please enter your email address.';
    if (!form.password || form.password.length < 8) return 'Password must be at least 8 characters.';
    if (form.password !== form.confirmPassword) return 'Passwords do not match.';
    return null;
  };

  const handleNext = () => {
    const err = validateStep(step);
    if (err) { showToast(err, 'error'); return; }
    if (step < STEPS.length - 1) {
      setStep((s) => s + 1);
      scrollTop();
    } else {
      handleRegister();
    }
  };

  const handleBack = () => {
    if (step === 0) { router.back(); return; }
    setStep((s) => s - 1);
    scrollTop();
  };

  const handleRegister = async () => {
    const err = validateStep(2);
    if (err) { showToast(err, 'error'); return; }
    setLoading(true);
    try {
      const data = await registerUser({
        firstName: form.firstName.trim(),
        middleName: form.middleName?.trim() ?? '',
        lastName: form.lastName.trim(),
        dob: form.dob.trim(),
        gender,
        civilStatus,
        contact: form.contact.trim(),
        address: buildAddress(),
        email: form.email.trim().toLowerCase(),
        password: form.password,
      });
      await login({
        id: data.userId,
        firstName: form.firstName.trim(),
        middleName: form.middleName?.trim() ?? '',
        lastName: form.lastName.trim(),
        dob: form.dob.trim(),
        gender,
        civilStatus,
        contact: form.contact.trim(),
        address: buildAddress(),
        email: form.email.trim().toLowerCase(),
      });
      showToast('Account created! Welcome to AUREA.', 'success');
      setTimeout(() => router.replace('/(tabs)'), 1800);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Registration failed. Please try again.';
      showToast(message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const renderField = (field: Field) => {
    const isPassword = field.key === 'password';
    const isConfirm = field.key === 'confirmPassword';
    const secure = (isPassword && !showPassword) || (isConfirm && !showConfirm);

    if (field.secure) {
      return (
        <View key={field.key} style={styles.fieldBlock}>
          <Text style={styles.label}>
            {field.label} {field.required && <Text style={styles.required}>*</Text>}
          </Text>
          <View style={styles.passwordWrap}>
            <TextInput
              style={styles.passwordInput}
              value={form[field.key] ?? ''}
              onChangeText={(v) => set(field.key, v)}
              placeholder={field.placeholder}
              placeholderTextColor={colors.inkSoft}
              secureTextEntry={secure}
              autoCapitalize="none"
            />
            <TouchableOpacity
              onPress={() => isPassword ? setShowPassword((p) => !p) : setShowConfirm((p) => !p)}
              activeOpacity={0.7}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityLabel={secure ? 'Show password' : 'Hide password'}
            >
              <Ionicons
                name={secure ? 'eye-outline' : 'eye-off-outline'}
                size={24}
                color={colors.primaryDeep}
              />
            </TouchableOpacity>
          </View>
          {field.helper && <Text style={styles.helperText}>{field.helper}</Text>}
        </View>
      );
    }

    return (
      <View key={field.key} style={styles.fieldBlock}>
        <Text style={styles.label}>
          {field.label} {field.required && <Text style={styles.required}>*</Text>}
        </Text>
        <TextInput
          style={styles.input}
          value={form[field.key] ?? ''}
          onChangeText={(v) => set(field.key, v)}
          placeholder={field.placeholder}
          placeholderTextColor={colors.inkSoft}
          keyboardType={field.keyboardType ?? 'default'}
          autoCapitalize={field.autoCapitalize ?? 'sentences'}
          autoCorrect={false}
        />
        {field.helper && <Text style={styles.helperText}>{field.helper}</Text>}
      </View>
    );
  };

  const current = STEPS[step];

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
        {dobOpen && Platform.OS === 'android' && (
          <DateTimePicker
            value={dobDraft}
            mode="date"
            display="calendar"
            maximumDate={new Date()}
            onChange={(event, selectedDate) => {
              if (event.type === 'dismissed') {
                setDobOpen(false);
                return;
              }

              if (selectedDate) {
                setDobDraft(selectedDate);
                set('dob', toDobString(selectedDate));
              }

              setDobOpen(false);
            }}
          />
        )}

        {/* Top bar: back + step progress (stays visible on every step) */}
        <View style={styles.topBar}>
          <TouchableOpacity
            style={styles.back}
            onPress={handleBack}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityLabel="Go back"
          >
            <Ionicons name="arrow-back" size={24} color={colors.primaryDeep} />
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>

          <View style={styles.progressWrap}>
            <Text style={styles.progressLabel}>Step {step + 1} of {STEPS.length}</Text>
            <View style={styles.progressTrack}>
              {STEPS.map((_, i) => (
                <View
                  key={i}
                  style={[
                    styles.progressSegment,
                    i <= step && styles.progressSegmentDone,
                  ]}
                />
              ))}
            </View>
          </View>
        </View>

        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <Image
              source={require('../assets/images/pateros-logo.png')}
              style={styles.logo}
              resizeMode="contain"
              accessibilityLabel="Gobyernong Pateros logo"
            />
            <Text style={styles.eyebrow}>MUNICIPALITY OF PATEROS</Text>
            <Text style={styles.title}>Create Your Account</Text>
            <Text style={styles.subtitle}>Register as a senior citizen of Pateros</Text>
          </View>

          {/* Current step card */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionIconWrap}>
                <Ionicons name={current.icon as any} size={20} color={colors.primaryDeep} />
              </View>
              <View>
                <Text style={styles.sectionTitle}>{current.title}</Text>
                <Text style={styles.sectionSubtitle}>{current.description}</Text>
              </View>
            </View>

            <View style={styles.fields}>
              {step === 0 && (
                <>
                  {PERSONAL_FIELDS.map(renderField)}

                  {/* Date of Birth — calendar picker */}
                  <View style={styles.fieldBlock}>
                    <Text style={styles.label}>Date of Birth <Text style={styles.required}>*</Text></Text>
                    
                    {Platform.OS === 'web' ? (
                      <>
                        <input
                          type="date"
                          value={form.dob ? parseDobString(form.dob)?.toISOString().split('T')[0] : ''}
                          onChange={(e) => {
                            const value = e.target.value;
                            if (value) {
                              const [yyyy, mm, dd] = value.split('-');
                              const date = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
                              setDobDraft(date);
                              set('dob', toDobString(date));
                            }
                          }}
                          max={new Date().toISOString().split('T')[0]}
                          style={styles.input}
                        />
                      </>
                    ) : (
                      <TouchableOpacity
                        style={styles.dropdown}
                        onPress={openDobPicker}
                        activeOpacity={0.8}
                      >
                        <Text style={form.dob ? styles.dropdownValue : styles.dropdownPlaceholder}>
                          {form.dob || 'Select date of birth'}
                        </Text>
                        <Ionicons name="calendar-outline" size={20} color={colors.inkSoft} />
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* Gender picker */}
                  <View style={styles.fieldBlock}>
                    <Text style={styles.label}>Gender <Text style={styles.required}>*</Text></Text>
                    <TouchableOpacity
                      style={styles.dropdown}
                      onPress={() => setGenderOpen(true)}
                      activeOpacity={0.8}
                    >
                      <Text style={gender ? styles.dropdownValue : styles.dropdownPlaceholder}>
                        {gender || 'Select gender'}
                      </Text>
                      <Ionicons name="chevron-down" size={20} color={colors.inkSoft} />
                    </TouchableOpacity>
                  </View>

                  {/* Civil Status picker */}
                  <View style={styles.fieldBlock}>
                    <Text style={styles.label}>Civil Status <Text style={styles.optional}>(optional)</Text></Text>
                    <TouchableOpacity
                      style={styles.dropdown}
                      onPress={() => setCivilStatusOpen(true)}
                      activeOpacity={0.8}
                    >
                      <Text style={civilStatus ? styles.dropdownValue : styles.dropdownPlaceholder}>
                        {civilStatus || 'Select civil status'}
                      </Text>
                      <Ionicons name="chevron-down" size={20} color={colors.inkSoft} />
                    </TouchableOpacity>
                  </View>
                </>
              )}

              {step === 1 && (
                <>
                  <View style={styles.fieldBlock}>
                    <Text style={styles.label}>Barangay <Text style={styles.required}>*</Text></Text>
                    <TouchableOpacity
                      style={styles.dropdown}
                      onPress={() => setBarangayOpen(true)}
                      activeOpacity={0.8}
                    >
                      <Text style={address.barangay ? styles.dropdownValue : styles.dropdownPlaceholder}>
                        {address.barangay || 'Select your barangay'}
                      </Text>
                      <Ionicons name="chevron-down" size={20} color={colors.inkSoft} />
                    </TouchableOpacity>
                  </View>

                  <View style={styles.row}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.label}>House No. <Text style={styles.required}>*</Text></Text>
                      <TextInput
                        style={styles.input}
                        value={address.houseNo}
                        onChangeText={(v) => setAddress((a) => ({ ...a, houseNo: v }))}
                        placeholder="123"
                        placeholderTextColor={colors.inkSoft}
                        keyboardType="default"
                      />
                    </View>
                    <View style={{ flex: 2 }}>
                      <Text style={styles.label}>Street <Text style={styles.required}>*</Text></Text>
                      <TextInput
                        style={styles.input}
                        value={address.street}
                        onChangeText={(v) => setAddress((a) => ({ ...a, street: v }))}
                        placeholder="Rizal Street"
                        placeholderTextColor={colors.inkSoft}
                        autoCapitalize="words"
                      />
                    </View>
                  </View>

                  <View style={styles.fieldBlock}>
                    <Text style={styles.label}>Subdivision <Text style={styles.optional}>(optional)</Text></Text>
                    <TextInput
                      style={styles.input}
                      value={address.subdivision}
                      onChangeText={(v) => setAddress((a) => ({ ...a, subdivision: v }))}
                      placeholder="e.g. Pateros Homes"
                      placeholderTextColor={colors.inkSoft}
                      autoCapitalize="words"
                    />
                  </View>
                </>
              )}

              {step === 2 && ACCOUNT_FIELDS.map(renderField)}
            </View>
          </View>

          {/* Footer link only shown on first step to reduce clutter later */}
          {step === 0 && (
            <View style={styles.footer}>
              <Text style={styles.footerText}>Already have an account? </Text>
              <TouchableOpacity onPress={() => router.replace('/login')} activeOpacity={0.7}>
                <Text style={styles.footerLink}>Log in</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>

        {/* Sticky bottom action bar */}
        <View style={styles.actionBar}>
          <TouchableOpacity
            style={[styles.submitBtn, loading && { opacity: 0.7 }]}
            onPress={handleNext}
            activeOpacity={0.85}
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel={step === STEPS.length - 1 ? 'Create account' : 'Continue'}
          >
            {loading ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <>
                <Text style={styles.submitText}>
                  {step === STEPS.length - 1 ? 'Create Account' : 'Continue'}
                </Text>
                {step < STEPS.length - 1 && (
                  <Ionicons name="arrow-forward" size={20} color={colors.white} style={{ marginLeft: 8 }} />
                )}
              </>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

        {/* Date of Birth Picker Modal (iOS only) */}
        {Platform.OS === 'ios' && (
          <Modal visible={dobOpen} transparent animationType="fade" onRequestClose={() => setDobOpen(false)}>
            <Pressable style={styles.modalOverlay} onPress={() => setDobOpen(false)}>
              <Pressable style={[styles.modalSheet, { paddingHorizontal: space(5) }]} onPress={() => {}}>
                <View style={styles.modalHandle} />
                <Text style={styles.modalTitle}>Select Date of Birth</Text>

                <DateTimePicker
                  value={dobDraft}
                  mode="date"
                  display="spinner"
                  maximumDate={new Date()}
                  onChange={(_, selectedDate) => {
                    if (selectedDate) {
                      setDobDraft(selectedDate);
                    }
                  }}
                />

                <View style={styles.modalActions}>
                  <TouchableOpacity
                    style={styles.modalBtnSecondary}
                    onPress={() => setDobOpen(false)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.modalBtnSecondaryTxt}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.modalBtnPrimary}
                    onPress={confirmDob}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.modalBtnPrimaryTxt}>Confirm</Text>
                  </TouchableOpacity>
                </View>
              </Pressable>
            </Pressable>
          </Modal>
        )}

      {/* Gender Picker Modal */}
      <Modal visible={genderOpen} transparent animationType="fade" onRequestClose={() => setGenderOpen(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setGenderOpen(false)}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Select Gender</Text>
            {['Male', 'Female'].map((item) => (
              <TouchableOpacity
                key={item}
                style={[styles.modalItem, item === gender && styles.modalItemActive]}
                onPress={() => { setGender(item); setGenderOpen(false); }}
              >
                <Text style={[styles.modalItemText, item === gender && styles.modalItemTextActive]}>{item}</Text>
                {item === gender && <Ionicons name="checkmark-circle" size={22} color={colors.primaryDeep} />}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Civil Status Picker Modal */}
      <Modal visible={civilStatusOpen} transparent animationType="fade" onRequestClose={() => setCivilStatusOpen(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setCivilStatusOpen(false)}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Select Civil Status</Text>
            {['Single', 'Married', 'Widowed', 'Separated', 'Divorced'].map((item) => (
              <TouchableOpacity
                key={item}
                style={[styles.modalItem, item === civilStatus && styles.modalItemActive]}
                onPress={() => { setCivilStatus(item); setCivilStatusOpen(false); }}
              >
                <Text style={[styles.modalItemText, item === civilStatus && styles.modalItemTextActive]}>{item}</Text>
                {item === civilStatus && <Ionicons name="checkmark-circle" size={22} color={colors.primaryDeep} />}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Barangay Picker Modal */}
      <Modal visible={barangayOpen} transparent animationType="fade" onRequestClose={() => setBarangayOpen(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setBarangayOpen(false)}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Select Barangay</Text>
            <FlatList
              data={BARANGAYS}
              keyExtractor={(item) => item}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.modalItem,
                    item === address.barangay && styles.modalItemActive,
                  ]}
                  onPress={() => {
                    setAddress((a) => ({ ...a, barangay: item }));
                    setBarangayOpen(false);
                  }}
                >
                  <Text style={[
                    styles.modalItemText,
                    item === address.barangay && styles.modalItemTextActive,
                  ]}>{item}</Text>
                  {item === address.barangay && (
                    <Ionicons name="checkmark-circle" size={22} color={colors.primaryDeep} />
                  )}
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },

  // Top bar with back button + progress indicator
  topBar: {
    paddingHorizontal: space(5),
    paddingTop: space(3),
    paddingBottom: space(2),
    backgroundColor: colors.bg,
  },
  back: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: space(3),
    alignSelf: 'flex-start',
  },
  backText: {
    fontFamily: 'InterBody',
    fontSize: 16,
    color: colors.primaryDeep,
    fontWeight: '700',
  },
  progressWrap: { gap: 6 },
  progressLabel: {
    fontFamily: 'InterBody',
    fontWeight: '700',
    fontSize: 13,
    color: colors.accent,
    letterSpacing: 0.4,
  },
  progressTrack: {
    flexDirection: 'row',
    gap: 6,
  },
  progressSegment: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.track,
  },
  progressSegmentDone: {
    backgroundColor: colors.primary,
  },

  container: {
    flexGrow: 1,
    paddingHorizontal: space(5),
    paddingTop: Math.max(space(3), 10),
    paddingBottom: space(10),
  },

  header: {
    alignItems: 'center',
    marginTop: space(2),
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
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: 'InterBody',
    fontSize: 15,
    color: colors.inkSoft,
    textAlign: 'center',
    lineHeight: 21,
  },

  section: {
    marginBottom: space(5),
    backgroundColor: colors.white,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: space(5),
    ...Platform.select({
      ios: { shadowColor: '#0E1F16', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
      android: { elevation: 1 },
    }),
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(3),
    marginBottom: space(5),
    paddingBottom: space(4),
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sectionIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontFamily: 'InterBody',
    fontWeight: '700',
    fontSize: 17,
    color: colors.ink,
  },
  sectionSubtitle: {
    fontFamily: 'InterBody',
    fontSize: 13,
    color: colors.inkSoft,
    marginTop: 2,
  },

  fields: { gap: space(5) },
  fieldBlock: { gap: 0 },
  label: {
    fontFamily: 'InterBody',
    fontWeight: '700',
    fontSize: 15,
    color: colors.ink,
    marginBottom: space(2),
  },
  helperText: {
    fontFamily: 'InterBody',
    fontSize: 12.5,
    color: colors.inkSoft,
    marginTop: 6,
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

  row: {
    flexDirection: 'row',
    gap: space(3),
  },
  dropdown: {
    height: 58,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.white,
    paddingHorizontal: space(4),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dropdownValue: {
    fontFamily: 'InterBody',
    fontSize: 17,
    color: colors.ink,
  },
  dropdownPlaceholder: {
    fontFamily: 'InterBody',
    fontSize: 17,
    color: colors.inkSoft,
  },
  required: {
    color: colors.error,
    fontWeight: '700',
  },
  optional: {
    fontFamily: 'InterBody',
    fontSize: 13,
    color: colors.inkSoft,
    fontWeight: '400',
  },

  // Sticky action bar keeps the primary button in the same place every step
  actionBar: {
    paddingHorizontal: space(5),
    paddingTop: space(3),
    paddingBottom: Platform.OS === 'ios' ? space(6) : space(4),
    backgroundColor: colors.bg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  submitBtn: {
    height: 58,
    borderRadius: 16,
    backgroundColor: colors.primaryDeep,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
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

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(14,31,22,0.5)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: space(3),
    paddingBottom: space(8),
    maxHeight: '70%',
  },
  modalHandle: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: space(4),
  },
  modalTitle: {
    fontFamily: 'FraunTitle',
    fontSize: 19,
    color: colors.ink,
    textAlign: 'center',
    marginBottom: space(3),
    paddingHorizontal: space(5),
  },
  modalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 18,
    paddingHorizontal: space(6),
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalItemActive: {
    backgroundColor: colors.primarySoft,
  },
  modalItemText: {
    fontFamily: 'InterBody',
    fontSize: 16.5,
    color: colors.ink,
  },
  modalItemTextActive: {
    color: colors.primaryDeep,
    fontWeight: '700',
  },

  modalActions: {
    flexDirection: 'row',
    gap: space(3),
    marginTop: space(3),
  },
  modalBtnSecondary: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
  },
  modalBtnSecondaryTxt: {
    fontFamily: 'InterBody',
    fontSize: 15,
    fontWeight: '700',
    color: colors.inkSoft,
  },
  modalBtnPrimary: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryDeep,
  },
  modalBtnPrimaryTxt: {
    fontFamily: 'InterBody',
    fontSize: 15,
    fontWeight: '700',
    color: colors.white,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: space(2),
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