import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TextInputProps,
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import Toast from '../components/Toast';
import { registerUser, scanSeniorId } from '../lib/authApi';
import * as ImagePicker from 'expo-image-picker';
import { File } from 'expo-file-system';
import { useAuth } from '../context/AuthContext';

// ---------------------------------------------------------------------------
// Design tokens
// Large type, thick borders, tall controls and high-contrast ink so the form
// stays comfortable for older and low-vision users. Matches the login screen.
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
  errorSoft: '#FDECEC',
  white: '#FFFFFF',
  track: '#DCEAE1',
};

const space = (n: number) => n * 4;
const isWeb = Platform.OS === 'web';

type Field = {
  label: string;
  key: string;
  icon: string;
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

const GENDERS = ['Male', 'Female'];
const CIVIL_STATUSES = ['Single', 'Married', 'Widowed', 'Separated', 'Divorced'];

const PERSONAL_FIELDS: Field[] = [
  { label: 'First name', key: 'firstName', icon: 'person-outline', placeholder: 'Juan', autoCapitalize: 'words', required: true },
  { label: 'Middle name', key: 'middleName', icon: 'person-outline', placeholder: 'Santos', autoCapitalize: 'words' },
  { label: 'Last name', key: 'lastName', icon: 'person-outline', placeholder: 'Dela Cruz', autoCapitalize: 'words', required: true },
];

const CONTACT_FIELD: Field = {
  label: 'Contact number', key: 'contact', icon: 'call-outline', placeholder: '09XXXXXXXXX',
  helper: 'Your mobile or a family member\u2019s number', keyboardType: 'phone-pad', required: true,
};

const ACCOUNT_FIELDS: Field[] = [
  { label: 'Email address', key: 'email', icon: 'mail-outline', placeholder: 'you@example.com', keyboardType: 'email-address', autoCapitalize: 'none', required: true },
  { label: 'Password', key: 'password', icon: 'lock-closed-outline', placeholder: 'At least 8 characters', autoCapitalize: 'none', secure: true, required: true },
  { label: 'Confirm password', key: 'confirmPassword', icon: 'lock-closed-outline', placeholder: 'Re-enter password', autoCapitalize: 'none', secure: true, required: true },
];

const STEPS = [
  { title: 'Personal information', short: 'Personal', icon: 'person-outline', description: 'Tell us who you are' },
  { title: 'Home address', short: 'Address', icon: 'location-outline', description: 'Where you live in Pateros' },
  { title: 'Account details', short: 'Account', icon: 'lock-closed-outline', description: 'Set up your login' },
] as const;

function toDobString(date: Date) {
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

function toDateInputValue(date: Date) {
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${mm}-${dd}`;
}

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const DOB_YEARS = Array.from(
  { length: new Date().getFullYear() - 1900 + 1 },
  (_, index) => new Date().getFullYear() - index,
);

function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
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

const webDateStyle = {
  height: 60,
  boxSizing: 'border-box',
  width: '100%',
  borderRadius: 16,
  border: `2px solid ${colors.border}`,
  backgroundColor: colors.bg,
  padding: '0 16px',
  fontFamily: 'InterBody, sans-serif',
  fontSize: 17,
  color: colors.ink,
} as any;

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------
function Label({ text, required, optional }: { text: string; required?: boolean; optional?: boolean }) {
  return (
    <Text style={styles.label}>
      {text}
      {required ? <Text style={styles.required}> *</Text> : null}
      {optional ? <Text style={styles.optional}>  (optional)</Text> : null}
    </Text>
  );
}

function TextField({
  label, required, optional, icon, error, helper, right, ...inputProps
}: TextInputProps & {
  label: string; required?: boolean; optional?: boolean; icon: string;
  error?: boolean; helper?: React.ReactNode; right?: React.ReactNode;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View>
      <Label text={label} required={required} optional={optional} />
      <View style={[styles.inputWrap, focused && styles.inputWrapFocused, error && styles.inputWrapError]}>
        <Ionicons
          name={icon as any}
          size={22}
          color={error ? colors.error : focused ? colors.primaryDeep : colors.inkSoft}
        />
        <TextInput
          {...inputProps}
          onFocus={(e) => { setFocused(true); inputProps.onFocus?.(e); }}
          onBlur={(e) => { setFocused(false); inputProps.onBlur?.(e); }}
          placeholderTextColor="#6F8478"
          style={styles.input}
        />
        {right}
      </View>
      {helper}
    </View>
  );
}

function SelectField({
  label, required, optional, icon, value, placeholder, error, onPress, trailing = 'chevron-down',
}: {
  label: string; required?: boolean; optional?: boolean; icon: string; value: string;
  placeholder: string; error?: boolean; onPress: () => void; trailing?: string;
}) {
  return (
    <View>
      <Label text={label} required={required} optional={optional} />
      <TouchableOpacity
        style={[styles.inputWrap, error && styles.inputWrapError]}
        onPress={onPress}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value || placeholder}`}
      >
        <Ionicons name={icon as any} size={22} color={error ? colors.error : colors.inkSoft} />
        <Text style={[styles.selectText, !value && styles.selectPlaceholder]} numberOfLines={1}>
          {value || placeholder}
        </Text>
        <Ionicons name={trailing as any} size={20} color={colors.inkSoft} />
      </TouchableOpacity>
    </View>
  );
}

function ChoiceChips({
  label, required, optional, options, value, onChange, error,
}: {
  label: string; required?: boolean; optional?: boolean; options: string[];
  value: string; onChange: (v: string) => void; error?: boolean;
}) {
  return (
    <View>
      <Label text={label} required={required} optional={optional} />
      <View style={styles.chipWrap}>
        {options.map((option) => {
          const active = option === value;
          return (
            <TouchableOpacity
              key={option}
              style={[styles.chip, active && styles.chipActive, error && !active && styles.chipError]}
              onPress={() => onChange(optional && active ? '' : option)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              {active && <Ionicons name="checkmark-circle" size={18} color={colors.primaryDeep} />}
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{option}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function SummaryRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={styles.summaryRow}>
      <Ionicons name={icon as any} size={18} color={colors.primaryDeep} style={{ marginTop: 2 }} />
      <View style={{ flex: 1 }}>
        <Text style={styles.summaryLabel}>{label}</Text>
        <Text style={styles.summaryValue}>{value || '—'}</Text>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------
export default function RegisterScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { login } = useAuth();
  const scrollRef = useRef<React.ElementRef<typeof ScrollView>>(null);

  const [idChoice, setIdChoice] = useState<'existing' | 'none' | null>(null);
  const [scanToken, setScanToken] = useState('');
  const [scannedIdNumber, setScannedIdNumber] = useState('');
  const [scannedAddress, setScannedAddress] = useState('');
  const [idPhoto, setIdPhoto] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<Record<string, string>>({});
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [dobOpen, setDobOpen] = useState(false);
  const [dobPart, setDobPart] = useState<'Year' | 'Month' | 'Day'>('Year');
  const [birthYearInput, setBirthYearInput] = useState('');
  const [dobDraft, setDobDraft] = useState(() => {
    const base = new Date();
    base.setFullYear(base.getFullYear() - 60);
    return base;
  });
  const [barangayOpen, setBarangayOpen] = useState(false);
  const [gender, setGender] = useState('');
  const [civilStatus, setCivilStatus] = useState('');
  const [address, setAddress] = useState({ barangay: '', houseNo: '', street: '', subdivision: '' });
  const [errorKeys, setErrorKeys] = useState<string[]>([]);
  const [toast, setToast] = useState<{ visible: boolean; message: string; type: 'success' | 'error' }>({
    visible: false, message: '', type: 'success',
  });

  const hasError = (key: string) => errorKeys.includes(key);
  const clearError = (key: string) => setErrorKeys((keys) => keys.filter((k) => k !== key));

  const openDobPicker = () => {
    const parsed = parseDobString(form.dob);
    const date = parsed ?? dobDraft;
    setDobDraft(date);
    setBirthYearInput(String(date.getFullYear()));
    setDobPart('Year');
    setDobOpen(true);
  };

  const validBirthYear = /^\d{4}$/.test(birthYearInput) && Number(birthYearInput) >= 1900 && Number(birthYearInput) <= new Date().getFullYear();
  const validBirthDate = validBirthYear && dobDraft.getTime() <= Date.now();
  const updateBirthDate = (year: number, month: number, day: number) => {
    setDobDraft(new Date(year, month, Math.min(day, daysInMonth(year, month + 1))));
  };
  const confirmDob = () => {
    if (!validBirthDate) return;
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

  const set = (key: string, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    clearError(key);
  };

  const setAddressField = (key: keyof typeof address, value: string) => {
    setAddress((a) => ({ ...a, [key]: value }));
    clearError(key);
  };

  const scrollTop = () => scrollRef.current?.scrollTo({ y: 0, animated: true });

  const checkStep = (index: number): { message: string | null; keys: string[] } => {
    const keys: string[] = [];
    let message: string | null = null;
    const fail = (key: string, msg: string) => {
      keys.push(key);
      if (!message) message = msg;
    };

    if (index === 0) {
      if (!form.firstName?.trim()) fail('firstName', 'Please enter your first name.');
      if (!form.lastName?.trim()) fail('lastName', 'Please enter your last name.');
      if (!form.dob?.trim()) fail('dob', 'Please select your date of birth.');
      if (!gender) fail('gender', 'Please select your gender.');
      if (!form.contact?.trim()) fail('contact', 'Please enter a contact number.');
    } else if (index === 1) {
      if (!address.barangay) fail('barangay', 'Please select your barangay.');
      if (!address.houseNo.trim()) fail('houseNo', 'Please enter your house number.');
      if (!address.street.trim()) fail('street', 'Please enter your street.');
    } else {
      if (!form.email?.trim()) fail('email', 'Please enter your email address.');
      if (!form.password || form.password.length < 8) fail('password', 'Password must be at least 8 characters.');
      if (form.password !== form.confirmPassword) fail('confirmPassword', 'Passwords do not match.');
    }
    return { message, keys };
  };

  const handleNext = () => {
    const { message, keys } = checkStep(step);
    if (message) {
      setErrorKeys(keys);
      showToast(message, 'error');
      return;
    }
    setErrorKeys([]);
    if (step < STEPS.length - 1) {
      setStep((s) => s + 1);
      scrollTop();
    } else {
      handleRegister();
    }
  };

  const leaveRegistration = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/login');
  };

  const handleBack = () => {
    if (step === 0) { setIdChoice(null); setScanToken(''); return; }
    setErrorKeys([]);
    setStep((s) => s - 1);
    scrollTop();
  };

  const goToStep = (index: number) => {
    setErrorKeys([]);
    setStep(index);
    scrollTop();
  };

  const handleRegister = async () => {
    const { message, keys } = checkStep(2);
    if (message) { setErrorKeys(keys); showToast(message, 'error'); return; }
    setLoading(true);
    try {
      const data = await registerUser({
        hasExistingSeniorId: idChoice === 'existing',
        seniorIdScanToken: idChoice === 'existing' ? scanToken : undefined,
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

      showToast('Account created! Please set up your Biometric Face ID…', 'success');
      setTimeout(() => {
        router.replace({
          pathname: '/face-verification',
          params: {
            userId: data.userId.toString(),
            userName: form.firstName.trim(),
            avatarUrl: '',
            role: 'user',
            isEnrollment: 'true',
          },
        } as any);
      }, 1200);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Registration failed. Please try again.';
      showToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  const scanIdPhoto = async (camera: boolean) => {
    if (scanning) return;
    try {
      let photoUri: string;
      let imageBase64: string;
      let mimeType: string;
      if (camera) {
        if (Platform.OS !== 'web') {
          const permission = await ImagePicker.requestCameraPermissionsAsync();
          if (!permission.granted) {
            showToast('Allow camera access in Settings to scan your ID, or use Upload ID photo.', 'error');
            return;
          }
        }
        const result = await ImagePicker.launchCameraAsync({
          mediaTypes: ['images'], quality: 0.8, base64: true,
        });
        if (result.canceled || !result.assets[0]) return;
        const asset = result.assets[0];
        photoUri = asset.uri;
        imageBase64 = asset.base64 || await new File(asset.uri).base64();
        mimeType = asset.mimeType || 'image/jpeg';
      } else {
        // Read the image inside the picker while it holds access to the selected photo.
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          allowsMultipleSelection: false,
          quality: 0.8,
          base64: true,
        });
        if (result.canceled || !result.assets[0]) return;
        const asset = result.assets[0];
        if (asset.fileSize && asset.fileSize > 8_000_000) {
          showToast('Please choose an ID photo smaller than 8 MB.', 'error');
          return;
        }
        photoUri = asset.uri;
        if (!asset.base64) {
          throw new Error('The selected photo could not be read. Please select it again or choose another photo.');
        }
        imageBase64 = asset.base64;
        mimeType = asset.mimeType || 'image/jpeg';
      }
      if (!imageBase64) throw new Error('Unable to read the photo. Please choose another image.');
      setIdPhoto(photoUri);
      setScanning(true);
      const { details, scanToken: token } = await scanSeniorId(imageBase64, mimeType);
      setForm(previous => ({ ...previous, firstName: details.firstName, middleName: details.middleName,
        lastName: details.lastName, dob: details.dob, contact: details.contact }));
      const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
      const barangay = BARANGAYS.find(name => normalize(name) === normalize(details.barangay)) || '';
      setAddress({ houseNo: details.houseNo, street: details.street, subdivision: details.subdivision, barangay });
      setGender(GENDERS.find(value => value.toLowerCase() === details.gender.toLowerCase()) || '');
      setCivilStatus(CIVIL_STATUSES.find(value => value.toLowerCase() === details.civilStatus.toLowerCase()) || '');
      setScannedIdNumber(details.idNumber);
      setScannedAddress(details.address);
      setScanToken(token);
      setStep(0);
      setErrorKeys([]);
      showToast('ID details copied. Review every field and complete the missing information.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not scan your ID. Please try again.', 'error');
    } finally { setScanning(false); }
  };

  const renderField = (field: Field) => {
    const isPassword = field.key === 'password';
    const isConfirm = field.key === 'confirmPassword';
    const secure = (isPassword && !showPassword) || (isConfirm && !showConfirm);
    const value = form[field.key] ?? '';

    let helper: React.ReactNode = field.helper ? <Text style={styles.helperText}>{field.helper}</Text> : null;

    if (isPassword) {
      const longEnough = value.length >= 8;
      helper = (
        <View style={styles.checkRow}>
          <Ionicons
            name={longEnough ? 'checkmark-circle' : 'ellipse-outline'}
            size={16}
            color={longEnough ? colors.primary : colors.inkSoft}
          />
          <Text style={[styles.helperText, { marginTop: 0 }, longEnough && styles.helperOk]}>
            Use 8 or more characters
          </Text>
        </View>
      );
    }

    if (isConfirm && value.length > 0) {
      const matches = value === (form.password ?? '');
      helper = (
        <View style={styles.checkRow}>
          <Ionicons
            name={matches ? 'checkmark-circle' : 'close-circle'}
            size={16}
            color={matches ? colors.primary : colors.error}
          />
          <Text style={[styles.helperText, { marginTop: 0 }, matches ? styles.helperOk : styles.helperBad]}>
            {matches ? 'Passwords match' : 'Passwords do not match yet'}
          </Text>
        </View>
      );
    }

    return (
      <TextField
        key={field.key}
        label={field.label}
        required={field.required}
        optional={!field.required && field.key === 'middleName'}
        icon={field.icon}
        error={hasError(field.key)}
        helper={helper}
        value={value}
        onChangeText={(v) => set(field.key, v)}
        placeholder={field.placeholder}
        keyboardType={field.keyboardType ?? 'default'}
        autoCapitalize={field.autoCapitalize ?? 'sentences'}
        autoCorrect={false}
        secureTextEntry={secure}
        autoComplete={isPassword || isConfirm ? 'new-password' : undefined}
        right={
          field.secure ? (
            <TouchableOpacity
              onPress={() => (isPassword ? setShowPassword((p) => !p) : setShowConfirm((p) => !p))}
              activeOpacity={0.7}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel={secure ? 'Show password' : 'Hide password'}
            >
              <Ionicons
                name={secure ? 'eye-outline' : 'eye-off-outline'}
                size={24}
                color={colors.primaryDeep}
              />
            </TouchableOpacity>
          ) : undefined
        }
      />
    );
  };

  const current = STEPS[step];
  const fullName = [form.firstName, form.middleName, form.lastName].map((p) => p?.trim()).filter(Boolean).join(' ');

  if (idChoice === null || (idChoice === 'existing' && !scanToken)) {
    return (
      <View style={[styles.safe, { paddingTop: insets.top }]}>
        <StatusBar barStyle="dark-content" />
        <Toast visible={toast.visible} message={toast.message} type={toast.type} onHide={() => setToast(t => ({ ...t, visible: false }))} />
        <ScrollView contentContainerStyle={styles.container}>
          <View style={styles.content}>
            <TouchableOpacity style={styles.entryBack} disabled={scanning} onPress={() => idChoice ? setIdChoice(null) : leaveRegistration()} accessibilityRole="button" accessibilityLabel="Go back">
              <Ionicons name="arrow-back" size={24} color={colors.primaryDeep} />
            </TouchableOpacity>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{idChoice === 'existing' ? 'Scan your senior citizen ID' : 'Do you have a senior citizen ID?'}</Text>
              <Text style={styles.sectionSubtitle}>{idChoice === 'existing'
                ? 'Take a clear photo of the front of your ID, or upload an existing photo. We will read the details and check whether this ID is already linked to an AUREA account.'
                : 'Choose an option before filling out your registration form.'}</Text>
              {idChoice === null ? <>
                <TouchableOpacity style={[styles.submitBtn, { marginTop: 20 }]} onPress={() => setIdChoice('existing')} accessibilityRole="button">
                  <Text style={styles.submitText}>I have a senior citizen ID</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.submitBtn, { marginTop: 12 }]} onPress={() => { setIdChoice('none'); setScanToken(''); setScannedIdNumber(''); setScannedAddress(''); setForm({}); setAddress({ barangay: '', houseNo: '', street: '', subdivision: '' }); setGender(''); setCivilStatus(''); setStep(0); setErrorKeys([]); }} accessibilityRole="button">
                  <Text style={styles.submitText}>I do not have an ID yet</Text>
                </TouchableOpacity>
              </> : <>
                {idPhoto && <Image source={{ uri: idPhoto }} style={{ width: '100%', height: 200, marginTop: 16 }} resizeMode="contain" accessibilityLabel="Selected senior citizen ID" />}
                {scanning && <View style={{ marginTop: 16 }}><ActivityIndicator color={colors.primary} /><Text style={styles.helperText}>Reading ID and checking existing records?</Text></View>}
                <TouchableOpacity style={[styles.submitBtn, { marginTop: 20, opacity: scanning ? 0.6 : 1 }]} disabled={scanning} onPress={() => scanIdPhoto(true)} accessibilityRole="button">
                  <Text style={styles.submitText}>Scan with camera</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.submitBtn, { marginTop: 12, opacity: scanning ? 0.6 : 1 }]} disabled={scanning} onPress={() => scanIdPhoto(false)} accessibilityRole="button">
                  <Text style={styles.submitText}>Upload ID photo</Text>
                </TouchableOpacity>
                <Text style={[styles.helperText, { marginTop: 16 }]}>Your photo is sent for text extraction. Reading a card does not confirm its official authenticity. You can review and correct the extracted details before submitting.</Text>
              </>}
            </View>
          </View>
        </ScrollView>
      </View>
    );
  }

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
        {/* Top bar: back + labelled step progress (stays visible on every step) */}
        <LinearGradient
          colors={[colors.primary, colors.primaryDarkest]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.topBar, { paddingTop: Math.max(insets.top, space(3)) + space(1) }]}
        >
          <View style={styles.topInner}>
            <View style={styles.topRow}>
              <TouchableOpacity
                style={styles.back}
                onPress={handleBack}
                activeOpacity={0.7}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityRole="button"
                accessibilityLabel="Go back"
              >
                <Ionicons name="arrow-back" size={22} color={colors.white} />
                <Text style={styles.backText}>Back</Text>
              </TouchableOpacity>
              <Text style={styles.stepCount}>Step {step + 1} of {STEPS.length}</Text>
            </View>

            <View style={styles.stepper}>
              {STEPS.map((s, i) => {
                const done = i < step;
                const active = i === step;
                return (
                  <View key={s.short} style={styles.stepItem}>
                    <View style={[styles.stepBar, (done || active) && styles.stepBarOn]} />
                    <View style={styles.stepNameRow}>
                      {done && <Ionicons name="checkmark-circle" size={14} color={colors.white} />}
                      <Text style={[styles.stepName, active && styles.stepNameActive]}>{s.short}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        </LinearGradient>

        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.content}>
            {/* Intro (first step only, so later steps get straight to the form) */}
            {step === 0 && (
              <View style={styles.header}>
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
                <Text style={styles.title}>Create your account</Text>
                <Text style={styles.subtitle}>Register as a senior citizen of Pateros</Text>
              </View>
            )}

            {idChoice === 'existing' && step === 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>ID details copied: {scannedIdNumber}</Text>
                <Text style={styles.sectionSubtitle}>Review your name and birthday, then check your address on the next step. Complete any missing fields.</Text>
                {!!scannedAddress && <Text style={styles.helperText}>Address read from ID: {scannedAddress}</Text>}
                <TouchableOpacity onPress={() => { setScanToken(''); setIdPhoto(null); }} accessibilityRole="button"><Text style={styles.loginBtnText}>Scan another photo</Text></TouchableOpacity>
              </View>
            )}
            {/* Current step card */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionIconWrap}>
                  <Ionicons name={current.icon as any} size={22} color={colors.primaryDeep} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sectionTitle}>{current.title}</Text>
                  <Text style={styles.sectionSubtitle}>{current.description}</Text>
                </View>
              </View>

              <View style={styles.fields}>
                {step === 0 && (
                  <>
                    {PERSONAL_FIELDS.map(renderField)}

                    {/* Date of birth */}
                    {isWeb ? (
                      <View>
                        <Label text="Date of birth" required />
                        <input
                          type="date"
                          value={form.dob ? toDateInputValue(parseDobString(form.dob) ?? dobDraft) : ''}
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
                          style={webDateStyle}
                        />
                      </View>
                    ) : (
                      <SelectField
                        label="Date of birth"
                        required
                        icon="calendar-outline"
                        trailing="chevron-down"
                        value={form.dob ?? ''}
                        placeholder="Select date of birth"
                        error={hasError('dob')}
                        onPress={openDobPicker}
                      />
                    )}

                    <ChoiceChips
                      label="Gender"
                      required
                      options={GENDERS}
                      value={gender}
                      error={hasError('gender')}
                      onChange={(v) => { setGender(v); clearError('gender'); }}
                    />

                    <ChoiceChips
                      label="Civil status"
                      optional
                      options={CIVIL_STATUSES}
                      value={civilStatus}
                      onChange={setCivilStatus}
                    />

                    {renderField(CONTACT_FIELD)}
                  </>
                )}

                {step === 1 && (
                  <>
                    <SelectField
                      label="Barangay"
                      required
                      icon="location-outline"
                      value={address.barangay}
                      placeholder="Select your barangay"
                      error={hasError('barangay')}
                      onPress={() => setBarangayOpen(true)}
                    />

                    <View style={styles.row}>
                      <View style={{ flex: 1 }}>
                        <TextField
                          label="House no."
                          required
                          icon="home-outline"
                          error={hasError('houseNo')}
                          value={address.houseNo}
                          onChangeText={(v) => setAddressField('houseNo', v)}
                          placeholder="123"
                        />
                      </View>
                      <View style={{ flex: 2 }}>
                        <TextField
                          label="Street"
                          required
                          icon="trail-sign-outline"
                          error={hasError('street')}
                          value={address.street}
                          onChangeText={(v) => setAddressField('street', v)}
                          placeholder="Rizal Street"
                          autoCapitalize="words"
                        />
                      </View>
                    </View>

                    <TextField
                      label="Subdivision"
                      optional
                      icon="business-outline"
                      value={address.subdivision}
                      onChangeText={(v) => setAddressField('subdivision', v)}
                      placeholder="e.g. Pateros Homes"
                      autoCapitalize="words"
                    />
                  </>
                )}

                {step === 2 && ACCOUNT_FIELDS.map(renderField)}
              </View>
            </View>

            {/* Review (last step) */}
            {step === 2 && (
              <>
                <View style={styles.summaryCard}>
                  <Text style={styles.summaryTitle}>Please check your details</Text>

                  <View style={styles.summaryGroup}>
                    <View style={styles.summaryGroupHead}>
                      <Text style={styles.summaryGroupTitle}>Personal</Text>
                      <TouchableOpacity onPress={() => goToStep(0)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Edit personal information">
                        <Text style={styles.editLink}>Edit</Text>
                      </TouchableOpacity>
                    </View>
                    <SummaryRow icon="person-outline" label="Name" value={fullName} />
                    <SummaryRow icon="calendar-outline" label="Date of birth" value={form.dob ?? ''} />
                    <SummaryRow icon="call-outline" label="Contact" value={form.contact?.trim() ?? ''} />
                  </View>

                  <View style={styles.summaryDivider} />

                  <View style={styles.summaryGroup}>
                    <View style={styles.summaryGroupHead}>
                      <Text style={styles.summaryGroupTitle}>Address</Text>
                      <TouchableOpacity onPress={() => goToStep(1)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Edit address">
                        <Text style={styles.editLink}>Edit</Text>
                      </TouchableOpacity>
                    </View>
                    <SummaryRow icon="location-outline" label="Home address" value={buildAddress()} />
                  </View>
                </View>

                <View style={styles.note}>
                  <View style={styles.noteIcon}>
                    <Ionicons name="scan-outline" size={20} color={colors.primaryDeep} />
                  </View>
                  <Text style={styles.noteText}>
                    After you create your account, you will set up Face ID. It helps keep your account safe.
                  </Text>
                </View>
              </>
            )}

            {/* Log in link on the first step only */}
            {step === 0 && (
              <View style={styles.footer}>
                <Text style={styles.footerText}>Already have an account?</Text>
                <TouchableOpacity
                  style={styles.loginBtn}
                  onPress={() => router.replace('/login')}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                >
                  <Text style={styles.loginBtnText}>Log in</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </ScrollView>

        {/* Sticky bottom action bar */}
        <View style={[styles.actionBar, { paddingBottom: Math.max(insets.bottom, space(4)) }]}>
          <View style={styles.actionInner}>
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
                    {step === STEPS.length - 1 ? 'Create account' : 'Continue'}
                  </Text>
                  <Ionicons
                    name={step === STEPS.length - 1 ? 'checkmark' : 'arrow-forward'}
                    size={20}
                    color={colors.white}
                  />
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* Date of birth picker */}
      <Modal visible={dobOpen} transparent animationType="fade" onRequestClose={() => setDobOpen(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setDobOpen(false)}>
          <Pressable style={[styles.modalSheet, { paddingHorizontal: space(5) }]} onPress={() => {}}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Select date of birth</Text>
            <Text style={styles.dobPreview}>
              {MONTHS[dobDraft.getMonth()]} {dobDraft.getDate()}, {dobDraft.getFullYear()}
            </Text>
            <View style={styles.dateTabs}>
              {(['Year', 'Month', 'Day'] as const).map(part => <TouchableOpacity key={part}
                accessibilityRole="button" accessibilityState={{ selected: dobPart === part }}
                onPress={() => setDobPart(part)} style={[styles.dateTab, dobPart === part && styles.dateTabActive]}>
                <Text style={styles.dateTabLabel}>{part}</Text>
                <Text style={styles.dateTabValue}>{part === 'Year' ? birthYearInput || 'YYYY' : part === 'Month' ? MONTHS[dobDraft.getMonth()] : dobDraft.getDate()}</Text>
              </TouchableOpacity>)}
            </View>
            {dobPart === 'Year' && <TextInput value={birthYearInput} keyboardType="number-pad" maxLength={4}
              accessibilityLabel="Birth year" placeholder="Enter birth year, e.g. 1944" style={styles.birthYearInput}
              onChangeText={value => {
                const digits = value.replace(/\D/g, '');
                setBirthYearInput(digits);
                const year = Number(digits);
                if (digits.length === 4 && year >= 1900 && year <= new Date().getFullYear()) {
                  updateBirthDate(year, dobDraft.getMonth(), dobDraft.getDate());
                }
              }} />}
            <ScrollView key={dobPart} style={styles.dateOptionsScroll} keyboardShouldPersistTaps="handled">
              <View style={styles.dateOptionsGrid}>
                {(dobPart === 'Year' ? DOB_YEARS.map(String) : dobPart === 'Month' ? MONTHS
                  : Array.from({ length: daysInMonth(dobDraft.getFullYear(), dobDraft.getMonth() + 1) }, (_, index) => String(index + 1)))
                  .map((item, index) => {
                    const selected = dobPart === 'Year' ? Number(item) === dobDraft.getFullYear()
                      : dobPart === 'Month' ? index === dobDraft.getMonth() : Number(item) === dobDraft.getDate();
                    return <TouchableOpacity key={item} accessibilityRole="button" accessibilityState={{ selected }}
                      accessibilityLabel={`${dobPart} ${item}`} style={[styles.dateGridOption, selected && styles.datePickerOptionSelected]}
                      onPress={() => {
                        if (dobPart === 'Year') {
                          updateBirthDate(Number(item), dobDraft.getMonth(), dobDraft.getDate());
                          setBirthYearInput(item);
                          setDobPart('Month');
                        } else if (dobPart === 'Month') {
                          updateBirthDate(dobDraft.getFullYear(), index, dobDraft.getDate());
                          setDobPart('Day');
                        } else updateBirthDate(dobDraft.getFullYear(), dobDraft.getMonth(), Number(item));
                      }}>
                      <Text style={[styles.datePickerOptionText, selected && styles.datePickerOptionTextSelected]}>{item}</Text>
                    </TouchableOpacity>;
                  })}
              </View>
            </ScrollView>
            {!validBirthDate && <Text accessibilityRole="alert" style={styles.dateError}>
              {validBirthYear ? 'Date of birth cannot be in the future.' : `Enter a year from 1900 to ${new Date().getFullYear()}.`}
            </Text>}

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalBtnSecondary}
                onPress={() => setDobOpen(false)}
                activeOpacity={0.8}
              >
                <Text style={styles.modalBtnSecondaryTxt}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtnPrimary, !validBirthDate && { opacity: 0.5 }]}
                disabled={!validBirthDate}
                onPress={confirmDob}
                activeOpacity={0.85}
              >
                <Text style={styles.modalBtnPrimaryTxt}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Barangay picker */}
      <Modal visible={barangayOpen} transparent animationType="fade" onRequestClose={() => setBarangayOpen(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setBarangayOpen(false)}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Select barangay</Text>
            <FlatList
              data={BARANGAYS}
              keyExtractor={(item) => item}
              renderItem={({ item }) => {
                const active = item === address.barangay;
                return (
                  <TouchableOpacity
                    style={[styles.modalItem, active && styles.modalItemActive]}
                    onPress={() => {
                      setAddressField('barangay', item);
                      setBarangayOpen(false);
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                  >
                    <Text style={[styles.modalItemText, active && styles.modalItemTextActive]}>{item}</Text>
                    {active && <Ionicons name="checkmark-circle" size={22} color={colors.primaryDeep} />}
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },

  // Top bar
  topBar: {
    paddingHorizontal: space(5),
    paddingBottom: space(4),
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  topInner: { width: '100%', maxWidth: 480, alignSelf: 'center' },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space(4),
  },
  back: {
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
  stepCount: {
    fontFamily: 'InterBody',
    fontWeight: '700',
    fontSize: 14,
    color: 'rgba(255,255,255,0.85)',
  },
  stepper: { flexDirection: 'row', gap: space(2) },
  stepItem: { flex: 1, gap: 8 },
  stepBar: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  stepBarOn: { backgroundColor: colors.white },
  stepNameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stepName: {
    fontFamily: 'InterBody',
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.65)',
  },
  stepNameActive: { color: colors.white, fontWeight: '700' },

  container: {
    flexGrow: 1,
    paddingHorizontal: space(5),
    paddingTop: space(5),
    paddingBottom: space(8),
  },
  content: { width: '100%', maxWidth: 480, alignSelf: 'center' },

  // Intro
  header: {
    alignItems: 'center',
    marginBottom: space(5),
  },
  logoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space(3),
    backgroundColor: colors.white,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingVertical: space(3),
    paddingHorizontal: space(5),
    marginBottom: space(4),
  },
  aureaLogo: { width: 104, height: 68 },
  logoDivider: { width: 1.5, height: 40, backgroundColor: colors.border },
  logo: { width: 68, height: 68 },
  title: {
    fontFamily: 'FraunTitle',
    fontSize: 30,
    color: colors.ink,
    marginBottom: 6,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: 'InterBody',
    fontSize: 16,
    color: colors.inkSoft,
    textAlign: 'center',
    lineHeight: 22,
  },

  // Step card
  section: {
    marginBottom: space(5),
    backgroundColor: colors.white,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: space(5),
    ...Platform.select({
      ios: { shadowColor: '#0E1F16', shadowOpacity: 0.07, shadowRadius: 14, shadowOffset: { width: 0, height: 6 } },
      android: { elevation: 2 },
    }),
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(3),
    marginBottom: space(5),
    paddingBottom: space(4),
    borderBottomWidth: 1,
    borderBottomColor: colors.track,
  },
  sectionIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 15,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontFamily: 'FraunTitle',
    fontSize: 20,
    color: colors.ink,
  },
  sectionSubtitle: {
    fontFamily: 'InterBody',
    fontSize: 14,
    color: colors.inkSoft,
    marginTop: 2,
  },

  // Fields
  fields: { gap: space(5) },
  label: {
    fontFamily: 'InterBody',
    fontWeight: '700',
    fontSize: 15,
    color: colors.ink,
    marginBottom: space(2),
  },
  required: { color: colors.error, fontWeight: '700' },
  optional: {
    fontFamily: 'InterBody',
    fontSize: 13,
    color: colors.inkSoft,
    fontWeight: '400',
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
    ...(isWeb ? ({ outlineStyle: 'none' } as any) : {}),
  },
  selectText: {
    flex: 1,
    fontFamily: 'InterBody',
    fontSize: 17,
    color: colors.ink,
  },
  selectPlaceholder: { color: '#6F8478' },
  helperText: {
    fontFamily: 'InterBody',
    fontSize: 13.5,
    color: colors.inkSoft,
    marginTop: 8,
  },
  helperOk: { color: colors.primaryDeep, fontWeight: '600' },
  helperBad: { color: colors.error, fontWeight: '600' },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  row: { flexDirection: 'row', gap: space(3) },

  // Choice chips
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2.5) },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 52,
    minWidth: 96,
    paddingHorizontal: space(4),
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.bg,
  },
  chipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  chipError: {
    borderColor: colors.error,
    backgroundColor: colors.errorSoft,
  },
  chipText: {
    fontFamily: 'InterBody',
    fontSize: 16.5,
    color: colors.ink,
    fontWeight: '500',
  },
  chipTextActive: { color: colors.primaryDeep, fontWeight: '700' },

  // Review
  summaryCard: {
    backgroundColor: colors.white,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: space(5),
    marginBottom: space(4),
  },
  summaryTitle: {
    fontFamily: 'FraunTitle',
    fontSize: 18,
    color: colors.ink,
    marginBottom: space(4),
  },
  summaryGroup: { gap: space(3) },
  summaryGroupHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  summaryGroupTitle: {
    fontFamily: 'InterBody',
    fontWeight: '700',
    fontSize: 14,
    color: colors.accent,
  },
  editLink: {
    fontFamily: 'InterBody',
    fontWeight: '700',
    fontSize: 15,
    color: colors.primaryDeep,
    textDecorationLine: 'underline',
  },
  summaryRow: { flexDirection: 'row', gap: space(3) },
  summaryLabel: { fontFamily: 'InterBody', fontSize: 13, color: colors.inkSoft },
  summaryValue: { fontFamily: 'InterBody', fontSize: 16, fontWeight: '600', color: colors.ink, marginTop: 1 },
  summaryDivider: { height: 1, backgroundColor: colors.track, marginVertical: space(4) },

  note: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(3),
    backgroundColor: colors.primarySoft,
    borderRadius: 18,
    padding: space(4),
    marginBottom: space(2),
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
    fontSize: 14.5,
    lineHeight: 21,
    color: colors.inkSoft,
  },

  // Footer
  footer: {
    alignItems: 'center',
    gap: space(3),
    marginTop: space(2),
  },
  footerText: {
    fontFamily: 'InterBody',
    fontSize: 15,
    color: colors.inkSoft,
  },
  loginBtn: {
    alignSelf: 'stretch',
    height: 56,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.primaryDeep,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
  },
  loginBtnText: {
    fontFamily: 'InterBody',
    fontSize: 17,
    fontWeight: '700',
    color: colors.primaryDeep,
  },

  // Sticky action bar keeps the primary button in the same place every step
  actionBar: {
    paddingHorizontal: space(5),
    paddingTop: space(3),
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  actionInner: { width: '100%', maxWidth: 480, alignSelf: 'center' },
  submitBtn: {
    height: 60,
    borderRadius: 18,
    backgroundColor: colors.primaryDeep,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
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

  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(14,31,22,0.5)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: space(3),
    paddingBottom: space(8),
    maxHeight: '75%',
    width: '100%',
    maxWidth: isWeb ? 480 : '100%',
    alignSelf: 'center',
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
    fontSize: 20,
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
    borderBottomColor: colors.track,
  },
  modalItemActive: { backgroundColor: colors.primarySoft },
  modalItemText: {
    fontFamily: 'InterBody',
    fontSize: 17,
    color: colors.ink,
  },
  modalItemTextActive: {
    color: colors.primaryDeep,
    fontWeight: '700',
  },

  dobPreview: {
    fontFamily: 'FraunTitle',
    fontSize: 24,
    color: colors.primaryDeep,
    textAlign: 'center',
    marginBottom: space(3),
  },
  entryBack: { width: 46, height: 46, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  dateTabs: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  dateTab: { flex: 1, paddingVertical: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 12, alignItems: 'center' },
  dateTabActive: { borderColor: colors.primaryDeep, backgroundColor: colors.primarySoft },
  dateTabLabel: { fontFamily: 'InterBody', fontSize: 13, color: colors.inkSoft },
  dateTabValue: { fontFamily: 'InterBody', fontSize: 19, fontWeight: '700', color: colors.primaryDeep, marginTop: 4 },
  birthYearInput: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14, fontSize: 18, color: colors.ink, marginBottom: 12 },
  dateOptionsScroll: { maxHeight: 240 },
  dateOptionsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 },
  dateGridOption: { width: '23%', minHeight: 48, borderRadius: 10, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  dateError: { color: '#B3432E', fontSize: 13, marginTop: 10 },
  datePickerOptionSelected: { backgroundColor: colors.primarySoft },
  datePickerOptionText: {
    fontFamily: 'InterBody',
    fontSize: 17,
    color: colors.inkSoft,
  },
  datePickerOptionTextSelected: {
    color: colors.primaryDeep,
    fontWeight: '700',
  },

  modalActions: {
    flexDirection: 'row',
    gap: space(3),
    marginTop: space(4),
  },
  modalBtnSecondary: {
    flex: 1,
    height: 54,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
  },
  modalBtnSecondaryTxt: {
    fontFamily: 'InterBody',
    fontSize: 16,
    fontWeight: '700',
    color: colors.inkSoft,
  },
  modalBtnPrimary: {
    flex: 1,
    height: 54,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryDeep,
  },
  modalBtnPrimaryTxt: {
    fontFamily: 'InterBody',
    fontSize: 16,
    fontWeight: '700',
    color: colors.white,
  },
});
