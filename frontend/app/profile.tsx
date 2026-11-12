import { formatSeniorId } from '../lib/seniorId';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TouchableOpacity,
  View,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { WebView } from 'react-native-webview';
import { useAuth } from '../context/AuthContext';
import { SENIOR_CATEGORIES } from '../data/seniorCategories';
import {
  getUser,
  updateUser,
  uploadAvatar,
  uploadBirthCertificate,
  deleteBirthCertificate,
  type ChildProfile,
} from '../lib/authApi';

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------
function getAge(dob?: string): number | null {
  if (!dob) return null;
  const value = dob.trim();
  const slashMatch = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const isoMatch = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  const year = Number(slashMatch?.[3] ?? isoMatch?.[1]);
  const month = Number(slashMatch?.[1] ?? isoMatch?.[2]);
  const day = Number(slashMatch?.[2] ?? isoMatch?.[3]);
  if (!year || !month || !day) return null;
  const birthDate = new Date(year, month - 1, day);
  if (
    birthDate.getFullYear() !== year
    || birthDate.getMonth() !== month - 1
    || birthDate.getDate() !== day
  ) return null;
  const today = new Date();
  let age = today.getFullYear() - year;
  if (
    today.getMonth() + 1 < month
    || (today.getMonth() + 1 === month && today.getDate() < day)
  ) age -= 1;
  return age >= 0 ? age : null;
}

function toDobString(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${month}/${day}/${date.getFullYear()}`;
}

function parseDobString(value?: string): Date | null {
  if (!value) return null;
  const trimmed = value.trim();
  const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  const year = Number(slashMatch?.[3] ?? isoMatch?.[1]);
  const month = Number(slashMatch?.[1] ?? isoMatch?.[2]);
  const day = Number(slashMatch?.[2] ?? isoMatch?.[3]);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
    ? date
    : null;
}

// ---------------------------------------------------------------------------
// Design tokens
// ---------------------------------------------------------------------------
const C = {
  bg: '#F4F7F0',
  card: '#FFFFFF',
  ink: '#14201A',
  inkSoft: '#4A5C50',
  inkFaint: '#7C8D80',
  primary: '#2B6B4A',
  primaryDark: '#173C29',
  primaryMid: '#2E7A50',
  primarySoft: '#D8EDE1',
  gold: '#C4892E',
  goldDark: '#7E5417',
  goldSoft: '#F6EAD4',
  white: '#FFFFFF',
  line: '#D8E4D4',
  lineSoft: '#EBF1E8',
  error: '#B42318',
  errorSoft: '#FCE8E6',
};

const sp = (n: number) => n * 4;
const isWeb = Platform.OS === 'web';

function hexToRgba(hex: string, alpha: number) {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function shadow(color: string, opacity: number, radius = 14, height = 6) {
  return Platform.select({
    ios: { shadowColor: color, shadowOpacity: opacity, shadowRadius: radius, shadowOffset: { width: 0, height } },
    android: { elevation: Math.round(radius * 0.6) },
    web: { boxShadow: `0px ${height}px ${radius}px ${hexToRgba(color, opacity)}` } as any,
    default: {},
  });
}

const webPointer = isWeb ? ({ cursor: 'pointer' } as any) : {};
const webNoOutline = isWeb ? ({ outlineStyle: 'none' } as any) : {};

const webDateStyle = {
  backgroundColor: C.white,
  border: `1px solid ${C.line}`,
  borderRadius: 14,
  padding: '12px 14px',
  fontFamily: 'InterBody, sans-serif',
  fontSize: 14,
  color: C.ink,
  width: '100%',
  boxSizing: 'border-box',
} as any;

// ---------------------------------------------------------------------------
// File helper
// ---------------------------------------------------------------------------
async function readFileAsBase64(uri: string): Promise<string> {
  if (Platform.OS === 'web') {
    const res = await fetch(uri);
    const blob = await res.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        const b64 = result.includes(',') ? result.split(',')[1] : result;
        resolve(b64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  // Native Android/iOS: read directly via legacy FileSystem with proper content:// permissions
  try {
    return await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
  } catch (fsErr) {
    console.warn('[Profile] FileSystem.readAsStringAsync failed, attempting blob fallback:', fsErr);
    const res = await fetch(uri);
    const blob = await res.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        const b64 = result.includes(',') ? result.split(',')[1] : result;
        resolve(b64);
      };
      reader.onerror = () => reject(fsErr);
      reader.readAsDataURL(blob);
    });
  }
}

// ---------------------------------------------------------------------------
// UI building blocks
// ---------------------------------------------------------------------------
function Section({
  icon, title, subtitle, right, children,
}: {
  icon: string; title: string; subtitle?: string; right?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <View style={[styles.section, shadow(C.ink, 0.06, 14, 3)]}>
      <View style={styles.sectionHead}>
        <View style={styles.sectionIcon}>
          <Ionicons name={icon as any} size={17} color={C.primaryDark} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.sectionTitle}>{title}</Text>
          {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
        </View>
        {right}
      </View>
      {children}
    </View>
  );
}

function FieldLabel({ label, required }: { label: string; required?: boolean }) {
  return (
    <Text style={styles.label}>
      {label}
      {required ? <Text style={{ color: C.error }}> *</Text> : null}
    </Text>
  );
}

function TextField({
  label, required, style, ...inputProps
}: TextInputProps & { label: string; required?: boolean }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.field}>
      <FieldLabel label={label} required={required} />
      <TextInput
        {...inputProps}
        onFocus={(e) => { setFocused(true); inputProps.onFocus?.(e); }}
        onBlur={(e) => { setFocused(false); inputProps.onBlur?.(e); }}
        placeholderTextColor={C.inkFaint}
        style={[styles.input, focused && styles.inputFocused, style]}
      />
    </View>
  );
}

function SelectField({
  label, value, placeholder, onPress,
}: { label: string; value: string; placeholder: string; onPress: () => void }) {
  return (
    <View style={styles.field}>
      <FieldLabel label={label} />
      <TouchableOpacity
        style={[styles.input, styles.selectInput, webPointer]}
        onPress={onPress}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value || placeholder}`}
      >
        <Text style={value ? styles.valueText : styles.placeholderText}>{value || placeholder}</Text>
        <Ionicons name="chevron-down" size={16} color={C.inkFaint} />
      </TouchableOpacity>
    </View>
  );
}

function ReadOnlyField({ label, value, icon }: { label: string; value: string; icon?: string }) {
  return (
    <View style={styles.field}>
      <FieldLabel label={label} />
      <View style={[styles.input, styles.readOnly]}>
        {icon ? <Ionicons name={icon as any} size={15} color={C.inkFaint} /> : null}
        <Text style={[styles.valueText, { flex: 1 }]} numberOfLines={1}>{value || '—'}</Text>
        <Ionicons name="lock-closed" size={13} color={C.inkFaint} />
      </View>
    </View>
  );
}

function PickerModal({
  visible, title, options, value, onSelect, onClose,
}: {
  visible: boolean; title: string; options: string[]; value: string;
  onSelect: (v: string) => void; onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={onClose}>
        <View style={styles.modalSheet}>
          {!isWeb && <View style={styles.modalHandle} />}
          <Text style={styles.modalTitle}>{title}</Text>
          <ScrollView style={{ maxHeight: 360 }} keyboardShouldPersistTaps="handled">
          {options.map((item) => {
            const active = item === value;
            return (
              <TouchableOpacity
                key={item}
                style={[styles.modalItem, webPointer, active && styles.modalItemActive]}
                onPress={() => { onSelect(item); onClose(); }}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.modalItemText, active && styles.modalItemTextActive]}>{item}</Text>
                {active && <Ionicons name="checkmark-circle" size={22} color={C.primaryDark} />}
              </TouchableOpacity>
            );
          })}
          </ScrollView>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------
const snapshotOf = (f: Record<string, any>, kids: ChildProfile[]) =>
  JSON.stringify([f.firstName, f.middleName, f.lastName, f.email, f.dob, f.gender, f.civilStatus, f.category, f.spouse, f.monthlyIncome, f.sourceOfIncome, f.occupation, f.contact, f.address, kids]);

export default function ProfileScreen() {
  const router = useRouter();
  const { user, updateProfile, logout } = useAuth();
  const [loading, setLoading] = useState(false);
  const [profileOscaId, setProfileOscaId] = useState<{ userId: number; value: string } | null>(null);
  const oscaIdNumber = formatSeniorId({ ...user, oscaIdNumber: (profileOscaId?.userId === user?.id ? profileOscaId?.value : '') || user?.oscaIdNumber });
  const [avatarUri, setAvatarUri] = useState<string | null>(user?.profilePhoto ?? user?.avatarUrl ?? null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [genderOpen, setGenderOpen] = useState(false);
  const [civilStatusOpen, setCivilStatusOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [incomeSourceOpen, setIncomeSourceOpen] = useState(false);

  const [children, setChildren] = useState<ChildProfile[]>(user?.children ?? []);
  const [childDobPickerId, setChildDobPickerId] = useState<string | null>(null);
  const [childDobDraft, setChildDobDraft] = useState(new Date());
  const [birthcert, setBirthcert] = useState<string | null>(user?.birthcert ?? null);
  const [birthcertUploading, setBirthcertUploading] = useState(false);
  const [birthcertDeleting, setBirthcertDeleting] = useState(false);
  const [viewerVisible, setViewerVisible] = useState(false);

  const [form, setForm] = useState({
    firstName: user?.firstName ?? '',
    lastName: user?.lastName ?? '',
    email: user?.email ?? '',
    middleName: user?.middleName ?? '',
    dob: user?.dob ?? '',
    gender: user?.gender ?? '',
    civilStatus: user?.civilStatus ?? '',
    spouse: user?.spouse ?? '',
    sourceOfIncome: user?.sourceOfIncome ?? '',
    occupation: user?.occupation ?? '',
    monthlyIncome: user?.monthlyIncome == null ? '' : String(user.monthlyIncome),
    category: SENIOR_CATEGORIES.includes(user?.category || '') ? user!.category! : 'Not Specified',
    contact: user?.contact ?? '',
    address: user?.address ?? '',
    profilePhoto: user?.profilePhoto ?? user?.avatarUrl ?? null,
  });

  const [baseline, setBaseline] = useState(() => snapshotOf(form, children));
  const dirty = snapshotOf(form, children) !== baseline;

  const ready = useMemo(() => !!user, [user]);

  useEffect(() => {
    if (!user?.id) return;

    const sessionFallback = {
      firstName: user.firstName ?? '',
      lastName: user.lastName ?? '',
      email: user.email ?? '',
      middleName: user.middleName ?? '',
      dob: user.dob ?? '',
      gender: user.gender ?? '',
      civilStatus: user.civilStatus ?? '',
      spouse: user.spouse ?? '',
      sourceOfIncome: user.sourceOfIncome ?? '',
      occupation: user.occupation ?? '',
      monthlyIncome: user.monthlyIncome == null ? '' : String(user.monthlyIncome),
      category: SENIOR_CATEGORIES.includes(user.category || '') ? user.category! : 'Not Specified',
      contact: user.contact ?? '',
      address: user.address ?? '',
      profilePhoto: user.profilePhoto ?? user.avatarUrl ?? null,
    };

    getUser(user.id)
      .then(({ user: profile }) => {
        setProfileOscaId({ userId: user.id, value: profile.oscaIdNumber?.trim() || '' });
        const nextProfilePhoto = profile.profilePhoto ?? profile.avatarUrl ?? sessionFallback.profilePhoto ?? null;
        const nextForm = {
          firstName: profile.firstName || sessionFallback.firstName,
          lastName: profile.lastName || sessionFallback.lastName,
          email: profile.email || sessionFallback.email,
          middleName: profile.middleName ?? sessionFallback.middleName,
          dob: profile.dob ?? sessionFallback.dob,
          gender: profile.gender ?? (user?.gender ?? ''),
          civilStatus: profile.civilStatus ?? (user?.civilStatus ?? ''),
          spouse: profile.spouse ?? sessionFallback.spouse,
          sourceOfIncome: profile.sourceOfIncome ?? '',
          occupation: profile.occupation ?? '',
          monthlyIncome: profile.monthlyIncome == null ? '' : String(profile.monthlyIncome),
          category: SENIOR_CATEGORIES.includes(profile.category || '') ? profile.category! : sessionFallback.category,
          contact: profile.contact ?? sessionFallback.contact,
          address: profile.address ?? sessionFallback.address,
          profilePhoto: nextProfilePhoto,
        };
        const nextChildren = profile.children ?? user.children ?? [];
        setForm(nextForm);
        setChildren(nextChildren);
        setBaseline(snapshotOf(nextForm, nextChildren));
        setBirthcert(profile.birthcert ?? user.birthcert ?? null);
        if (nextProfilePhoto) setAvatarUri(nextProfilePhoto);
      })
      .catch((err) => {
        console.warn('[Profile] getUser failed:', err?.message);
        setForm(sessionFallback);
        setBaseline(snapshotOf(sessionFallback, children));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.firstName, user?.lastName, user?.email, user?.middleName, user?.dob, user?.gender, user?.civilStatus, user?.category, user?.spouse, user?.monthlyIncome, user?.sourceOfIncome, user?.occupation, user?.contact, user?.address, user?.birthcert]);

  // ── Birth certificate ──
  const handleBirthCertificatePick = async () => {
    if (!user?.id) return;

    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/png', 'image/jpeg'],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    let mimeType = asset.mimeType?.toLowerCase() ?? '';
    if (!mimeType || mimeType === 'application/octet-stream') {
      const lowerName = asset.name?.toLowerCase() ?? '';
      if (lowerName.endsWith('.pdf')) mimeType = 'application/pdf';
      else if (lowerName.endsWith('.png')) mimeType = 'image/png';
      else if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) mimeType = 'image/jpeg';
    }
    if (!['application/pdf', 'image/png', 'image/jpeg', 'image/jpg'].includes(mimeType)) {
      Alert.alert('Invalid file', 'Please choose a PDF, PNG, or JPG birth certificate.');
      return;
    }

    setBirthcertUploading(true);
    try {
      const base64File = await readFileAsBase64(asset.uri);
      const response = await uploadBirthCertificate(user.id, base64File, mimeType, asset.name);
      const freshUrl = response.birthcert
        ? `${response.birthcert}${response.birthcert.includes('?') ? '&' : '?'}t=${Date.now()}`
        : response.birthcert;
      setBirthcert(freshUrl);
      await updateProfile({ birthcert: freshUrl });
      Alert.alert('Success', birthcert ? 'Birth certificate replaced successfully.' : 'Birth certificate uploaded successfully.');
    } catch (error) {
      Alert.alert('Upload failed', error instanceof Error ? error.message : 'Could not upload the birth certificate.');
    } finally {
      setBirthcertUploading(false);
    }
  };

  const handleDeleteBirthCertificate = () => {
    if (!user?.id || !birthcert) return;

    Alert.alert(
      'Delete birth certificate',
      'Are you sure you want to remove your birth certificate from your profile?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setBirthcertDeleting(true);
            try {
              await deleteBirthCertificate(user.id);
              await updateProfile({ birthcert: null });
              setBirthcert(null);
              setViewerVisible(false);
              Alert.alert('Deleted', 'Your birth certificate has been removed.');
            } catch (error) {
              Alert.alert('Delete failed', error instanceof Error ? error.message : 'Could not delete birth certificate.');
            } finally {
              setBirthcertDeleting(false);
            }
          },
        },
      ]
    );
  };

  // ── Children ──
  const addChild = () => {
    setChildren((prev) => [...prev, { id: Date.now().toString(), name: '', dob: '' }]);
  };

  const updateChild = (id: string, key: 'name' | 'dob', value: string) => {
    setChildren((prev) => prev.map((c) => (c.id === id ? { ...c, [key]: value } : c)));
  };

  const removeChild = (id: string) => {
    setChildren((prev) => prev.filter((c) => c.id !== id));
  };

  const openChildDobPicker = (child: ChildProfile) => {
    setChildDobDraft(parseDobString(child.dob) ?? new Date());
    setChildDobPickerId(child.id);
  };

  const setChildDob = (date: Date) => {
    if (childDobPickerId) updateChild(childDobPickerId, 'dob', toDobString(date));
  };

  // ── Avatar ──
  const handlePickAvatar = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Please allow access to your photo library.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
      base64: true,
    });

    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    if (!user?.id) return;

    // Instantly show selected photo locally so user sees feedback right away
    setAvatarUri(asset.uri);
    setAvatarUploading(true);
    try {
      let b64 = asset.base64;
      if (!b64 && asset.uri) {
        b64 = await readFileAsBase64(asset.uri);
      }
      if (!b64) {
        setAvatarUri(user?.profilePhoto ?? user?.avatarUrl ?? null);
        Alert.alert('Error', 'Could not read image data.');
        return;
      }

      const mimeType = asset.mimeType ?? 'image/jpeg';
      const { avatarUrl } = await uploadAvatar(user.id, b64, mimeType);
      const cacheBusted = avatarUrl
        ? `${avatarUrl}${avatarUrl.includes('?') ? '&' : '?'}t=${Date.now()}`
        : asset.uri;
      setAvatarUri(cacheBusted);
      setForm((prev) => ({ ...prev, profilePhoto: cacheBusted }));
      await updateProfile({ avatarUrl: cacheBusted, profilePhoto: cacheBusted });
      Alert.alert('Profile photo updated', 'Your new profile photo has been saved.');
    } catch (err) {
      setAvatarUri(user?.profilePhoto ?? user?.avatarUrl ?? null);
      Alert.alert('Upload failed', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setAvatarUploading(false);
    }
  };

  const updateField = (key: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    if (!user) {
      Alert.alert('Profile', 'You need to log in to update your profile.');
      return;
    }

    if (!form.firstName.trim() || !form.lastName.trim() || !form.email.trim()) {
      Alert.alert('Profile', 'First name, last name, and email are required.');
      return;
    }

    if (form.sourceOfIncome === 'Working' && !form.occupation.trim()) {
      Alert.alert('Work details required', 'Please specify your work.');
      return;
    }
    const income = form.monthlyIncome.trim();
    if (income && (!/^\d+(?:\.\d{1,2})?$/.test(income) || Number(income) > 9999999999.99)) {
      Alert.alert('Monthly income', 'Enter a non-negative amount with up to two decimal places.');
      return;
    }

    setLoading(true);
    try {
      const { user: updated } = await updateUser(user.id, {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim().toLowerCase(),
        middleName: form.middleName.trim(),
        dob: form.dob.trim(),
        gender: form.gender.trim(),
        civilStatus: form.civilStatus.trim(),
        category: form.category,
        spouse: form.spouse.trim(),
        monthlyIncome: income || null,
        sourceOfIncome: (form.sourceOfIncome || null) as 'Pension' | 'Allowance' | 'Working' | null,
        occupation: form.sourceOfIncome === 'Working' ? form.occupation.trim() : null,
        contact: form.contact.trim(),
        address: form.address.trim(),
        children,
      });
      await updateProfile(updated);
      setBaseline(snapshotOf(form, children));
      Alert.alert('Profile updated', 'Your changes have been saved.');
    } catch (error) {
      Alert.alert('Update failed', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    router.replace('/(tabs)');
  };

  if (!ready || !user) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.emptyState}>
          <View style={styles.emptyIcon}>
            <Ionicons name="person-outline" size={30} color={C.primaryDark} />
          </View>
          <Text style={styles.emptyTitle}>Log in to see your profile</Text>
          <Text style={styles.emptyText}>Your details, Digital ID, and documents are saved to your account.</Text>
          <TouchableOpacity style={[styles.primaryBtn, { flex: 0, paddingHorizontal: 28 }]} onPress={() => router.push('/login')}>
            <Text style={styles.primaryBtnText}>Go to login</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Derived ──
  const fullName = [form.firstName, form.middleName, form.lastName].filter(Boolean).join(' ') || 'Senior Citizen';
  const initials = `${form.firstName?.[0] ?? ''}${form.lastName?.[0] ?? ''}`.toUpperCase() || '?';
  const profileAge = getAge(user?.dob);
  const canHaveSeniorQr = profileAge !== null && profileAge >= 60;
  const birthcertIsPdf = !!birthcert && birthcert.toLowerCase().includes('.pdf');

  const completion = [
    { done: !!form.firstName.trim(), hint: 'Add your first name' },
    { done: !!form.lastName.trim(), hint: 'Add your last name' },
    { done: !!form.email.trim(), hint: 'Add your email' },
    { done: !!form.dob, hint: 'Add your date of birth' },
    { done: !!form.gender, hint: 'Choose your gender' },
    { done: !!form.civilStatus, hint: 'Choose your civil status' },
    { done: !!form.contact.trim(), hint: 'Add a contact number' },
    { done: !!form.address.trim(), hint: 'Add your address' },
    { done: !!birthcert, hint: 'Upload your birth certificate' },
  ];
  const completeCount = completion.filter((c) => c.done).length;
  const completePct = Math.round((completeCount / completion.length) * 100);
  const nextHint = completion.find((c) => !c.done)?.hint;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={styles.container}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity
              style={[styles.backBtn, webPointer]}
              onPress={() => router.back()}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <Ionicons name="chevron-back" size={20} color={C.ink} />
            </TouchableOpacity>
            <View style={styles.headerTitleWrap}>
              <Text style={styles.title}>My profile</Text>
              <Text style={styles.subtitle}>Your details and documents</Text>
            </View>
            <View style={styles.placeholder} />
          </View>

          <View style={styles.bodyLayout}>
            {/* ───────── Left column ───────── */}
            <View style={styles.leftCol}>
              <View style={[styles.profileCard, shadow(C.ink, 0.08, 16, 4)]}>
                <LinearGradient
                  colors={[C.primaryMid, C.primaryDark]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.banner}
                />
                <View style={styles.avatarOuter}>
                  <TouchableOpacity
                    style={[styles.avatarWrap, webPointer]}
                    onPress={handlePickAvatar}
                    disabled={avatarUploading}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel="Change profile photo"
                  >
                    {avatarUri ? (
                      <Image key={avatarUri} source={{ uri: avatarUri }} style={styles.avatarImage} />
                    ) : (
                      <Text style={styles.avatarInitials}>{initials}</Text>
                    )}
                    {avatarUploading && (
                      <View style={styles.avatarOverlay}>
                        <ActivityIndicator color={C.white} />
                      </View>
                    )}
                  </TouchableOpacity>
                  <View style={styles.avatarBadge} pointerEvents="none">
                    <Ionicons name="camera" size={13} color={C.white} />
                  </View>
                </View>

                <Text style={styles.nameText} numberOfLines={2}>{fullName}</Text>
                <Text style={styles.emailText} numberOfLines={1}>{form.email || 'No email saved'}</Text>

                <View style={styles.metaRow}>
                  <View style={styles.metaPill}>
                    <Text style={styles.metaLabel}>Member ID</Text>
                    <Text style={styles.metaVal}>#{user?.id ? String(user.id).padStart(5, '0') : '00000'}</Text>
                  </View>
                  <View style={styles.metaPill}>
                    <Text style={styles.metaLabel}>Status</Text>
                    <View style={styles.statusRow}>
                      <View style={styles.statusDot} />
                      <Text style={[styles.metaVal, { color: C.primary, marginTop: 0 }]}>Active</Text>
                    </View>
                  </View>
                </View>

                {/* Completion */}
                <View style={styles.completion}>
                  <View style={styles.completionTop}>
                    <Text style={styles.completionTitle}>Profile completion</Text>
                    <Text style={styles.completionPct}>{completePct}%</Text>
                  </View>
                  <View style={styles.completionTrack}>
                    <View style={[styles.completionFill, { width: `${completePct}%` }]} />
                  </View>
                  <Text style={styles.completionHint}>
                    {nextHint ? `Next: ${nextHint}.` : 'Everything is filled in.'}
                  </Text>
                </View>
              </View>

              {/* Digital ID */}
              {canHaveSeniorQr ? (
                <View style={[styles.qrCard, shadow(C.ink, 0.08, 16, 4)]}>
                  <View style={styles.qrHeader}>
                    <Ionicons name="card-outline" size={18} color={C.primaryDark} />
                    <Text style={styles.qrTitle}>Digital ID</Text>
                  </View>
                  <Text style={styles.qrDesc}>View your Senior Citizen ID card and QR code.</Text>
                  <TouchableOpacity
                    style={[styles.viewIdBtn, webPointer]}
                    onPress={() => router.push('/digital-id')}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="card-outline" size={16} color={C.white} />
                    <Text style={styles.viewIdBtnTxt}>View full ID card</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={[styles.qrCard, shadow(C.ink, 0.08, 16, 4)]}>
                  <View style={styles.lockedIcon}>
                    <Ionicons name="lock-closed-outline" size={20} color={C.inkSoft} />
                  </View>
                  <Text style={styles.qrTitle}>Digital ID not available</Text>
                  <Text style={[styles.qrDesc, { marginTop: 4, marginBottom: 0 }]}>
                    The Senior Citizen Digital ID is for users aged 60 and above.
                  </Text>
                </View>
              )}
            </View>

            {/* ───────── Right column ───────── */}
            <View style={styles.rightCol}>
              {/* Name */}
              <Section icon="person-outline" title="Name">
                <View style={styles.fieldRow}>
                  <TextField
                    label="First name"
                    required
                    value={form.firstName}
                    onChangeText={(v) => updateField('firstName', v)}
                    placeholder="First name"
                    autoCapitalize="words"
                  />
                  <TextField
                    label="Last name"
                    required
                    value={form.lastName}
                    onChangeText={(v) => updateField('lastName', v)}
                    placeholder="Last name"
                    autoCapitalize="words"
                  />
                </View>
                <View style={styles.fieldRow}>
                  <TextField
                    label="Middle name"
                    value={form.middleName}
                    onChangeText={(v) => updateField('middleName', v)}
                    placeholder="Middle name"
                    autoCapitalize="words"
                  />
                </View>
              </Section>

              {/* Identity (read only) */}
              <Section icon="id-card-outline" title="Identity" subtitle="These details can't be edited here.">
                <View style={styles.fieldRow}>
                  <ReadOnlyField label="OSCA ID number" value={oscaIdNumber} />
                  <ReadOnlyField label="Date of birth" value={form.dob} icon="calendar-outline" />
                </View>
              </Section>

              {/* Personal + contact */}
              <Section icon="create-outline" title="Personal and contact details">
                <SelectField
                  label="Senior citizen category"
                  value={form.category}
                  placeholder="Select health or mobility category"
                  onPress={() => setCategoryOpen(true)}
                />
                <Text style={styles.qrDesc}>Select the primary condition that best describes your current health or mobility.</Text>
                <View style={styles.fieldRow}>
                  <SelectField
                    label="Gender"
                    value={form.gender}
                    placeholder="Select gender"
                    onPress={() => setGenderOpen(true)}
                  />
                  <SelectField
                    label="Civil status"
                    value={form.civilStatus}
                    placeholder="Select status"
                    onPress={() => setCivilStatusOpen(true)}
                  />
                </View>
                <SelectField
                  label="Source of income"
                  value={form.sourceOfIncome}
                  placeholder="Select source of income"
                  onPress={() => setIncomeSourceOpen(true)}
                />
                {form.sourceOfIncome === 'Working' && <TextField
                  label="Type of work"
                  required
                  value={form.occupation}
                  onChangeText={(value) => updateField('occupation', value)}
                  placeholder="e.g. Vendor, farmer, driver"
                  maxLength={200}
                  autoCapitalize="sentences"
                />}
                <View style={styles.fieldRow}>
                  <TextField
                    label="Spouse name"
                    value={form.spouse}
                    onChangeText={(value) => updateField('spouse', value)}
                    placeholder="Full name (if applicable)"
                    autoCapitalize="words"
                  />
                  <TextField
                    label="Monthly income (PHP)"
                    value={form.monthlyIncome}
                    onChangeText={(value) => updateField('monthlyIncome', value)}
                    placeholder="0.00"
                    keyboardType="decimal-pad"
                  />
                </View>
                <View style={styles.fieldRow}>
                  <TextField
                    label="Contact number"
                    value={form.contact}
                    onChangeText={(v) => updateField('contact', v)}
                    placeholder="09XXXXXXXXX"
                    keyboardType="phone-pad"
                  />
                  <TextField
                    label="Email"
                    required
                    value={form.email}
                    onChangeText={(v) => updateField('email', v)}
                    placeholder="you@example.com"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>
                <TextField
                  label="Address"
                  value={form.address}
                  onChangeText={(v) => updateField('address', v)}
                  placeholder="House no., street, barangay, Pateros"
                  multiline
                  style={styles.textArea}
                />
              </Section>

              {/* Birth certificate */}
              <Section
                icon="document-text-outline"
                title="Birth certificate"
                subtitle="PDF, PNG, or JPG"
                right={
                  !birthcert ? (
                    <TouchableOpacity
                      style={[styles.smallBtn, webPointer]}
                      onPress={handleBirthCertificatePick}
                      disabled={birthcertUploading}
                      activeOpacity={0.85}
                    >
                      {birthcertUploading ? (
                        <ActivityIndicator color={C.white} size="small" />
                      ) : (
                        <Ionicons name="cloud-upload-outline" size={16} color={C.white} />
                      )}
                      <Text style={styles.smallBtnText}>Upload</Text>
                    </TouchableOpacity>
                  ) : null
                }
              >
                {birthcert ? (
                  <View style={styles.docCard}>
                    <TouchableOpacity
                      style={[styles.docMain, webPointer]}
                      onPress={() => setViewerVisible(true)}
                      activeOpacity={0.8}
                      accessibilityRole="button"
                      accessibilityLabel="View birth certificate"
                    >
                      <View style={styles.docIcon}>
                        <Ionicons name={birthcertIsPdf ? 'document-text' : 'image'} size={20} color={C.primary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.docTitle}>Birth certificate on file</Text>
                        <Text style={styles.docSub}>{birthcertIsPdf ? 'PDF document' : 'Image file'} · Tap to preview</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={C.inkFaint} />
                    </TouchableOpacity>

                    <View style={styles.docActions}>
                      <TouchableOpacity
                        style={[styles.docActionBtn, styles.docActionDivider, webPointer]}
                        onPress={handleBirthCertificatePick}
                        disabled={birthcertUploading || birthcertDeleting}
                        activeOpacity={0.8}
                      >
                        {birthcertUploading ? (
                          <ActivityIndicator size="small" color={C.primaryDark} />
                        ) : (
                          <Ionicons name="swap-horizontal-outline" size={16} color={C.primaryDark} />
                        )}
                        <Text style={[styles.docActionText, { color: C.primaryDark }]}>Replace</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.docActionBtn, webPointer]}
                        onPress={handleDeleteBirthCertificate}
                        disabled={birthcertUploading || birthcertDeleting}
                        activeOpacity={0.8}
                      >
                        {birthcertDeleting ? (
                          <ActivityIndicator size="small" color={C.error} />
                        ) : (
                          <Ionicons name="trash-outline" size={16} color={C.error} />
                        )}
                        <Text style={[styles.docActionText, { color: C.error }]}>Delete</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={[styles.docMissing, webPointer]}
                    onPress={handleBirthCertificatePick}
                    disabled={birthcertUploading}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="alert-circle-outline" size={20} color={C.goldDark} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.docMissingTitle}>No birth certificate yet</Text>
                      <Text style={styles.docMissingSub}>Tap here to upload one from your device.</Text>
                    </View>
                  </TouchableOpacity>
                )}
              </Section>

              {/* Children */}
              <Section
                icon="people-outline"
                title="Children"
                subtitle={children.length ? `${children.length} added` : 'Add as many as you need.'}
                right={
                  <TouchableOpacity style={[styles.smallBtn, webPointer]} onPress={addChild} activeOpacity={0.85}>
                    <Ionicons name="add" size={17} color={C.white} />
                    <Text style={styles.smallBtnText}>Add child</Text>
                  </TouchableOpacity>
                }
              >
                {children.length === 0 ? (
                  <TouchableOpacity style={[styles.childEmpty, webPointer]} onPress={addChild} activeOpacity={0.8}>
                    <Ionicons name="happy-outline" size={22} color={C.inkFaint} />
                    <Text style={styles.childEmptyText}>No children added yet. Tap to add one.</Text>
                  </TouchableOpacity>
                ) : (
                  children.map((child) => (
                    <View key={child.id} style={styles.childRow}>
                      <View style={styles.childIcon}>
                        <Ionicons name="person-outline" size={16} color={C.primaryDark} />
                      </View>
                      <View style={styles.childFields}>
                        <TextField
                          label="Child's name"
                          value={child.name}
                          onChangeText={(v) => updateChild(child.id, 'name', v)}
                          placeholder="Full name"
                          autoCapitalize="words"
                        />
                        <View style={styles.field}>
                          <FieldLabel label="Date of birth" />
                          {isWeb ? (
                            <input
                              type="date"
                              value={parseDobString(child.dob)?.toISOString().split('T')[0] ?? ''}
                              onChange={(event) => {
                                const value = event.target.value;
                                if (value) {
                                  const [year, month, day] = value.split('-').map(Number);
                                  updateChild(child.id, 'dob', toDobString(new Date(year, month - 1, day)));
                                }
                              }}
                              max={new Date().toISOString().split('T')[0]}
                              style={webDateStyle}
                            />
                          ) : (
                            <TouchableOpacity
                              style={[styles.input, styles.selectInput]}
                              onPress={() => openChildDobPicker(child)}
                              activeOpacity={0.8}
                            >
                              <Text style={child.dob ? styles.valueText : styles.placeholderText}>
                                {child.dob || 'Select date of birth'}
                              </Text>
                              <Ionicons name="calendar-outline" size={16} color={C.inkFaint} />
                            </TouchableOpacity>
                          )}
                        </View>

                        {Platform.OS === 'android' && childDobPickerId === child.id && (
                          <DateTimePicker
                            value={childDobDraft}
                            mode="date"
                            display="calendar"
                            maximumDate={new Date()}
                            onValueChange={(_, selectedDate) => {
                              if (selectedDate) setChildDob(selectedDate);
                              setChildDobPickerId(null);
                            }}
                            onDismiss={() => setChildDobPickerId(null)}
                          />
                        )}
                        {Platform.OS === 'ios' && childDobPickerId === child.id && (
                          <Modal
                            visible
                            transparent
                            animationType="fade"
                            onRequestClose={() => setChildDobPickerId(null)}
                          >
                            <TouchableOpacity
                              style={styles.modalOverlay}
                              activeOpacity={1}
                              onPress={() => setChildDobPickerId(null)}
                            >
                              <View style={styles.modalSheet}>
                                <View style={styles.modalHandle} />
                                <Text style={styles.modalTitle}>Child&apos;s date of birth</Text>
                                <DateTimePicker
                                  value={childDobDraft}
                                  mode="date"
                                  display="spinner"
                                  maximumDate={new Date()}
                                  onValueChange={(_, selectedDate) => {
                                    if (selectedDate) {
                                      setChildDobDraft(selectedDate);
                                      setChildDob(selectedDate);
                                    }
                                  }}
                                />
                                <TouchableOpacity
                                  style={styles.primaryBtn}
                                  onPress={() => setChildDobPickerId(null)}
                                >
                                  <Text style={styles.primaryBtnText}>Done</Text>
                                </TouchableOpacity>
                              </View>
                            </TouchableOpacity>
                          </Modal>
                        )}
                      </View>
                      <TouchableOpacity
                        style={[styles.removeChildBtn, webPointer]}
                        onPress={() => removeChild(child.id)}
                        activeOpacity={0.8}
                        accessibilityRole="button"
                        accessibilityLabel="Remove child"
                      >
                        <Ionicons name="trash-outline" size={16} color={C.error} />
                      </TouchableOpacity>
                    </View>
                  ))
                )}
              </Section>

              {!isWeb && (
                <TouchableOpacity style={styles.logoutRow} onPress={handleLogout} activeOpacity={0.8}>
                  <Ionicons name="log-out-outline" size={18} color={C.error} />
                  <Text style={styles.logoutText}>Log out</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </ScrollView>

        {/* Sticky save bar */}
        <View style={styles.saveBar}>
          <View style={styles.saveBarInner}>
            <View style={styles.saveBarStatus}>
              <View style={[styles.saveDot, { backgroundColor: dirty ? C.gold : C.primaryMid }]} />
              <Text style={styles.saveBarText}>{dirty ? 'You have unsaved changes' : 'All changes saved'}</Text>
            </View>
            <TouchableOpacity
              style={[styles.saveBtn, (!dirty || loading) && styles.saveBtnDisabled, webPointer]}
              onPress={handleSave}
              disabled={!dirty || loading}
              activeOpacity={0.9}
              accessibilityRole="button"
              accessibilityState={{ disabled: !dirty || loading }}
            >
              {loading ? (
                <ActivityIndicator color={C.white} />
              ) : (
                <>
                  <Ionicons name="save-outline" size={17} color={C.white} />
                  <Text style={styles.primaryBtnText}>Save changes</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>

      <PickerModal
        visible={genderOpen}
        title="Select gender"
        options={['Male', 'Female']}
        value={form.gender}
        onSelect={(v) => updateField('gender', v)}
        onClose={() => setGenderOpen(false)}
      />
      <PickerModal
        visible={civilStatusOpen}
        title="Select civil status"
        options={['Single', 'Married', 'Widowed', 'Separated', 'Divorced']}
        value={form.civilStatus}
        onSelect={(v) => updateField('civilStatus', v)}
        onClose={() => setCivilStatusOpen(false)}
      />

      <PickerModal
        visible={categoryOpen}
        title="Senior citizen category"
        options={SENIOR_CATEGORIES}
        value={form.category}
        onSelect={(value) => updateField('category', value)}
        onClose={() => setCategoryOpen(false)}
      />

      <PickerModal
        visible={incomeSourceOpen}
        title="Source of income"
        options={['Pension', 'Allowance', 'Working']}
        value={form.sourceOfIncome}
        onSelect={(value) => {
          setForm(previous => ({ ...previous, sourceOfIncome: value, occupation: value === 'Working' ? previous.occupation : '' }));
        }}
        onClose={() => setIncomeSourceOpen(false)}
      />

      {/* Birth certificate viewer */}
      <Modal
        visible={viewerVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setViewerVisible(false)}
      >
        <View style={styles.viewerOverlay}>
          <SafeAreaView style={{ flex: 1 }}>
            <View style={styles.viewerHeader}>
              <TouchableOpacity
                style={[styles.viewerIconBtn, webPointer]}
                onPress={() => setViewerVisible(false)}
                activeOpacity={0.8}
                accessibilityLabel="Close viewer"
              >
                <Ionicons name="close" size={22} color={C.white} />
              </TouchableOpacity>

              <View style={{ alignItems: 'center' }}>
                <Text style={styles.viewerTitle}>Birth certificate</Text>
                <Text style={styles.viewerSubtitle}>{birthcertIsPdf ? 'PDF document' : 'Image preview'}</Text>
              </View>

              <TouchableOpacity
                style={[styles.viewerIconBtn, styles.viewerIconBtnDanger, webPointer]}
                onPress={handleDeleteBirthCertificate}
                disabled={birthcertDeleting}
                activeOpacity={0.8}
                accessibilityLabel="Delete birth certificate"
              >
                {birthcertDeleting ? (
                  <ActivityIndicator size="small" color="#FF8080" />
                ) : (
                  <Ionicons name="trash-outline" size={20} color="#FF8080" />
                )}
              </TouchableOpacity>
            </View>

            <View style={styles.viewerContent}>
              {birthcert ? (
                birthcertIsPdf ? (
                  isWeb ? (
                    // @ts-ignore
                    <iframe
                      key={birthcert}
                      src={birthcert}
                      style={{ width: '100%', height: '100%', border: 'none', borderRadius: 12 }}
                      title="Birth Certificate PDF"
                    />
                  ) : (
                    <WebView
                      key={birthcert}
                      source={{
                        uri:
                          Platform.OS === 'android'
                            ? `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(birthcert)}`
                            : birthcert,
                      }}
                      style={styles.viewerWebView}
                      startInLoadingState
                      renderLoading={() => (
                        <View style={styles.viewerLoading}>
                          <ActivityIndicator size="large" color={C.primarySoft} />
                          <Text style={styles.viewerLoadingText}>Loading PDF…</Text>
                        </View>
                      )}
                    />
                  )
                ) : (
                  <ScrollView
                    contentContainerStyle={styles.viewerImageScroll}
                    maximumZoomScale={4}
                    minimumZoomScale={1}
                    showsHorizontalScrollIndicator={false}
                    showsVerticalScrollIndicator={false}
                    bounces={false}
                  >
                    <Image
                      key={birthcert}
                      source={{ uri: birthcert }}
                      style={styles.viewerImage}
                      resizeMode="contain"
                    />
                  </ScrollView>
                )
              ) : null}
            </View>

            <View style={styles.viewerFooter}>
              <TouchableOpacity
                style={[styles.viewerFooterBtn, { backgroundColor: C.primarySoft }, webPointer]}
                onPress={handleBirthCertificatePick}
                disabled={birthcertUploading || birthcertDeleting}
                activeOpacity={0.85}
              >
                {birthcertUploading ? (
                  <ActivityIndicator size="small" color={C.primaryDark} />
                ) : (
                  <Ionicons name="swap-horizontal-outline" size={18} color={C.primaryDark} />
                )}
                <Text style={[styles.viewerFooterText, { color: C.primaryDark }]}>Replace</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.viewerFooterBtn, styles.viewerFooterDanger, webPointer]}
                onPress={handleDeleteBirthCertificate}
                disabled={birthcertUploading || birthcertDeleting}
                activeOpacity={0.85}
              >
                {birthcertDeleting ? (
                  <ActivityIndicator size="small" color="#FF8080" />
                ) : (
                  <Ionicons name="trash-outline" size={18} color="#FF8080" />
                )}
                <Text style={[styles.viewerFooterText, { color: '#FF8080' }]}>Delete</Text>
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  container: {
    flexGrow: 1,
    paddingHorizontal: sp(5),
    paddingTop: Math.max(sp(3), 10),
    paddingBottom: sp(8),
    width: '100%',
    maxWidth: isWeb ? 1060 : 460,
    alignSelf: 'center',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: sp(5),
  },
  backBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleWrap: { alignItems: 'center' },
  title: { fontFamily: 'FraunTitle', fontWeight: '600', fontSize: 22, color: C.ink },
  subtitle: { fontFamily: 'InterBody', fontSize: 12, color: C.inkFaint, marginTop: 2 },
  placeholder: { width: 42 },

  // Layout
  bodyLayout: {
    flexDirection: isWeb ? 'row' : 'column',
    alignItems: 'flex-start',
    gap: sp(5),
  },
  leftCol: { width: isWeb ? 340 : '100%', gap: sp(5) },
  rightCol: { flex: 1, width: '100%', gap: sp(4) },

  // Profile card
  profileCard: {
    backgroundColor: C.card,
    borderRadius: 28,
    alignItems: 'center',
    overflow: 'hidden',
    paddingBottom: sp(5),
    width: '100%',
  },
  banner: { width: '100%', height: 96 },
  avatarWrap: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: C.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 4,
    borderColor: C.card,
  },
  avatarImage: { width: 104, height: 104, borderRadius: 52, backgroundColor: C.primarySoft },
  avatarInitials: { fontFamily: 'FraunTitle', fontSize: 34, color: C.primaryDark },
  avatarOverlay: {
    position: 'absolute', top: 0, right: 0, bottom: 0, left: 0,
    backgroundColor: 'rgba(15, 51, 35, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarOuter: { width: 104, height: 104, marginTop: -52 },
  avatarBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: C.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: C.card,
  },
  nameText: {
    fontFamily: 'FraunTitle',
    fontSize: 22,
    lineHeight: 28,
    color: C.ink,
    marginTop: sp(3),
    paddingHorizontal: sp(4),
    textAlign: 'center',
  },
  emailText: {
    fontFamily: 'InterBody',
    fontSize: 13,
    color: C.inkSoft,
    marginTop: 4,
    paddingHorizontal: sp(4),
  },
  metaRow: {
    flexDirection: 'row',
    gap: sp(3),
    marginTop: sp(4),
    paddingHorizontal: sp(4),
    width: '100%',
  },
  metaPill: {
    flex: 1,
    backgroundColor: C.bg,
    borderRadius: 14,
    paddingVertical: sp(3),
    alignItems: 'center',
  },
  metaLabel: { fontFamily: 'InterBody', fontSize: 11.5, color: C.inkFaint },
  metaVal: { fontFamily: 'InterBody', fontSize: 14, fontWeight: '700', color: C.ink, marginTop: 3 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.primaryMid },

  completion: {
    width: '100%',
    paddingHorizontal: sp(4),
    marginTop: sp(4),
  },
  completionTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  completionTitle: { fontFamily: 'InterBody', fontWeight: '600', fontSize: 12.5, color: C.inkSoft },
  completionPct: { fontFamily: 'FraunTitle', fontSize: 16, color: C.primaryDark },
  completionTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: C.lineSoft,
    overflow: 'hidden',
    marginTop: 8,
  },
  completionFill: { height: 8, borderRadius: 4, backgroundColor: C.primaryMid },
  completionHint: { fontFamily: 'InterBody', fontSize: 12, color: C.inkFaint, marginTop: 8 },

  // Digital ID
  qrCard: {
    backgroundColor: C.card,
    borderRadius: 28,
    padding: sp(5),
    alignItems: 'center',
    width: '100%',
  },
  qrHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  qrTitle: { fontFamily: 'FraunTitle', fontSize: 17, color: C.ink },
  qrDesc: {
    fontFamily: 'InterBody',
    fontSize: 12.5,
    lineHeight: 18,
    color: C.inkSoft,
    textAlign: 'center',
    marginBottom: sp(4),
    paddingHorizontal: sp(2),
  },
  viewIdBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: C.primaryDark,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignSelf: 'stretch',
  },
  viewIdBtnTxt: { fontFamily: 'InterBody', fontWeight: '700', fontSize: 13.5, color: C.white },
  lockedIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: C.lineSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: sp(2),
  },

  // Sections
  section: {
    backgroundColor: C.card,
    borderRadius: 24,
    padding: sp(5),
    width: '100%',
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: sp(3),
    marginBottom: sp(4),
  },
  sectionIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: C.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: { fontFamily: 'FraunTitle', fontSize: 17, color: C.ink },
  sectionSubtitle: { fontFamily: 'InterBody', fontSize: 12, color: C.inkFaint, marginTop: 2 },

  // Fields
  fieldRow: { flexDirection: 'row', flexWrap: 'wrap', gap: sp(3) },
  field: { flex: 1, minWidth: 150, marginBottom: sp(3.5) },
  label: {
    fontFamily: 'InterBody',
    fontSize: 12.5,
    fontWeight: '600',
    color: C.inkSoft,
    marginBottom: 6,
  },
  input: {
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: 'InterBody',
    fontSize: 14.5,
    color: C.ink,
    ...webNoOutline,
  },
  inputFocused: {
    borderColor: C.primaryMid,
    borderWidth: 1.5,
    backgroundColor: '#FBFDFA',
  },
  selectInput: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  readOnly: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: C.bg,
    borderColor: C.lineSoft,
  },
  textArea: { minHeight: 84, textAlignVertical: 'top', paddingTop: 12 },
  valueText: { fontFamily: 'InterBody', fontSize: 14.5, color: C.ink },
  placeholderText: { fontFamily: 'InterBody', fontSize: 14.5, color: C.inkFaint },

  // Buttons
  smallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: C.primaryDark,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  smallBtnText: { fontFamily: 'InterBody', fontWeight: '700', fontSize: 12.5, color: C.white },
  primaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: C.primaryDark,
    borderRadius: 14,
    paddingVertical: 14,
  },
  primaryBtnText: { fontFamily: 'InterBody', fontSize: 14, fontWeight: '700', color: C.white },

  // Birth certificate
  docCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.line,
    overflow: 'hidden',
  },
  docMain: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: sp(3.5),
    gap: sp(3),
    backgroundColor: hexToRgba(C.primary, 0.05),
  },
  docIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: C.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  docTitle: { fontFamily: 'InterBody', fontSize: 14, fontWeight: '700', color: C.ink },
  docSub: { fontFamily: 'InterBody', fontSize: 12, color: C.inkSoft, marginTop: 2 },
  docActions: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: C.line },
  docActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
  },
  docActionDivider: { borderRightWidth: 1, borderRightColor: C.line },
  docActionText: { fontFamily: 'InterBody', fontSize: 13, fontWeight: '600' },
  docMissing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: sp(3),
    backgroundColor: C.goldSoft,
    borderRadius: 16,
    padding: sp(3.5),
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: hexToRgba(C.gold, 0.6),
  },
  docMissingTitle: { fontFamily: 'InterBody', fontSize: 13.5, fontWeight: '700', color: C.goldDark },
  docMissingSub: { fontFamily: 'InterBody', fontSize: 12, color: C.goldDark, marginTop: 2 },

  // Children
  childEmpty: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: sp(6),
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: C.line,
  },
  childEmptyText: { fontFamily: 'InterBody', fontSize: 13, color: C.inkSoft },
  childRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: sp(2.5),
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 18,
    padding: sp(3),
    paddingBottom: 0,
    marginBottom: sp(3),
    backgroundColor: C.bg,
  },
  childIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.primarySoft,
    marginTop: 2,
  },
  childFields: { flex: 1 },
  removeChildBtn: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: C.errorSoft,
  },

  logoutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: sp(3.5),
    borderRadius: 16,
    borderWidth: 1,
    borderColor: hexToRgba(C.error, 0.25),
    backgroundColor: C.card,
  },
  logoutText: { fontFamily: 'InterBody', fontSize: 14, fontWeight: '600', color: C.error },

  // Save bar
  saveBar: {
    backgroundColor: C.card,
    borderTopWidth: 1,
    borderTopColor: C.line,
    paddingHorizontal: sp(5),
    paddingVertical: sp(3),
  },
  saveBarInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: sp(3),
    width: '100%',
    maxWidth: isWeb ? 1060 : 460,
    alignSelf: 'center',
  },
  saveBarStatus: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  saveDot: { width: 8, height: 8, borderRadius: 4 },
  saveBarText: { fontFamily: 'InterBody', fontSize: 12.5, fontWeight: '600', color: C.inkSoft, flexShrink: 1 },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: C.primaryDark,
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 20,
    minWidth: 150,
  },
  saveBtnDisabled: { opacity: 0.45 },

  // Pickers
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: C.card,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: sp(5),
    paddingBottom: Platform.OS === 'ios' ? sp(9) : sp(5),
    width: '100%',
    maxWidth: isWeb ? 460 : '100%',
    alignSelf: 'center',
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.line,
    alignSelf: 'center',
    marginBottom: sp(3),
  },
  modalTitle: { fontFamily: 'FraunTitle', fontSize: 18, color: C.ink, marginBottom: sp(3) },
  modalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: sp(3.5),
    paddingHorizontal: sp(2),
    borderRadius: 12,
  },
  modalItemActive: { backgroundColor: C.primarySoft },
  modalItemText: { fontFamily: 'InterBody', fontSize: 15.5, color: C.ink },
  modalItemTextActive: { fontWeight: '700', color: C.primaryDark },

  // Viewer
  viewerOverlay: { flex: 1, backgroundColor: 'rgba(10, 20, 16, 0.96)' },
  viewerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: sp(4),
    paddingVertical: sp(3),
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.12)',
  },
  viewerIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerIconBtnDanger: { backgroundColor: 'rgba(255, 80, 80, 0.15)' },
  viewerTitle: { fontFamily: 'FraunTitle', fontSize: 17, fontWeight: '600', color: C.white },
  viewerSubtitle: { fontFamily: 'InterBody', fontSize: 11.5, color: 'rgba(255, 255, 255, 0.65)', marginTop: 2 },
  viewerContent: { flex: 1, backgroundColor: '#0F1A14' },
  viewerWebView: { flex: 1, backgroundColor: '#0F1A14' },
  viewerLoading: {
    position: 'absolute', top: 0, right: 0, bottom: 0, left: 0,
    backgroundColor: '#0F1A14',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  viewerLoadingText: { fontFamily: 'InterBody', fontSize: 13, color: 'rgba(255, 255, 255, 0.7)' },
  viewerImageScroll: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: sp(3) },
  viewerImage: { width: '100%', height: '100%', minHeight: 380 },
  viewerFooter: {
    flexDirection: 'row',
    gap: sp(3),
    paddingHorizontal: sp(4),
    paddingVertical: sp(3.5),
    backgroundColor: 'rgba(15, 26, 20, 0.95)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  viewerFooterBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: 14,
  },
  viewerFooterDanger: {
    backgroundColor: 'rgba(255, 80, 80, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255, 80, 80, 0.3)',
  },
  viewerFooterText: { fontFamily: 'InterBody', fontSize: 13.5, fontWeight: '700' },

  // Logged-out state
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: sp(6) },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: C.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: { fontFamily: 'FraunTitle', fontSize: 20, color: C.ink, marginTop: sp(4) },
  emptyText: {
    fontFamily: 'InterBody',
    fontSize: 13.5,
    lineHeight: 20,
    color: C.inkSoft,
    marginTop: 6,
    marginBottom: sp(5),
    textAlign: 'center',
    maxWidth: 300,
  },
});