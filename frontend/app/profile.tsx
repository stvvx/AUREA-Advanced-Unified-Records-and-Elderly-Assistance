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
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import QRCode from 'react-native-qrcode-svg';
import { WebView } from 'react-native-webview';
import { useAuth } from '../context/AuthContext';
import {
  getUser,
  updateUser,
  uploadAvatar,
  uploadBirthCertificate,
  deleteBirthCertificate,
  type ChildProfile,
} from '../lib/authApi';

const C = {
  bg: '#F4F6F0',
  card: '#FFFFFF',
  ink: '#14201A',
  inkSoft: '#4A5C50',
  inkFaint: '#8A9A8E',
  primary: '#2B6B4A',
  primaryDark: '#173C29',
  primaryMid: '#2E7A50',
  primarySoft: '#D8EDE1',
  gold: '#C4892E',
  goldDark: '#7E5417',
  goldSoft: '#F6EAD4',
  white: '#FFFFFF',
  line: '#D8E4D4',
  error: '#B42318',
};

const sp = (n: number) => n * 4;

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

const webPointer = Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {};
const webNoOutline = Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {};

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

export default function ProfileScreen() {
  const router = useRouter();
  const { user, updateProfile, logout } = useAuth();
  const [loading, setLoading] = useState(false);
  const [avatarUri, setAvatarUri] = useState<string | null>(user?.profilePhoto ?? user?.avatarUrl ?? null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [genderOpen, setGenderOpen] = useState(false);
  const [civilStatusOpen, setCivilStatusOpen] = useState(false);

  const [children, setChildren] = useState<ChildProfile[]>(user?.children ?? []);
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
    contact: user?.contact ?? '',
    address: user?.address ?? '',
    profilePhoto: user?.profilePhoto ?? user?.avatarUrl ?? null,
  });

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
      contact: user.contact ?? '',
      address: user.address ?? '',
      profilePhoto: user.profilePhoto ?? user.avatarUrl ?? null,
    };

    getUser(user.id)
      .then(({ user: profile }) => {
        const nextProfilePhoto = profile.profilePhoto ?? profile.avatarUrl ?? sessionFallback.profilePhoto ?? null;
        setForm({
          firstName: profile.firstName || sessionFallback.firstName,
          lastName: profile.lastName || sessionFallback.lastName,
          email: profile.email || sessionFallback.email,
          middleName: profile.middleName ?? sessionFallback.middleName,
          dob: profile.dob ?? sessionFallback.dob,
          gender: profile.gender ?? (user?.gender ?? ''),
          civilStatus: profile.civilStatus ?? (user?.civilStatus ?? ''),
          contact: profile.contact ?? sessionFallback.contact,
          address: profile.address ?? sessionFallback.address,
          profilePhoto: nextProfilePhoto,
        });
        setChildren(profile.children ?? user.children ?? []);
        setBirthcert(profile.birthcert ?? user.birthcert ?? null);
        if (nextProfilePhoto) setAvatarUri(nextProfilePhoto);
      })
      .catch((err) => {
        console.warn('[Profile] getUser failed:', err?.message);
        setForm(sessionFallback);
      });
  }, [user?.id, user?.firstName, user?.lastName, user?.email, user?.middleName, user?.dob, user?.gender, user?.civilStatus, user?.contact, user?.address, user?.birthcert]);

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
      'Delete Birth Certificate',
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

  const addChild = () => {
    setChildren((prev) => [...prev, { id: Date.now().toString(), name: '', dob: '' }]);
  };

  const updateChild = (id: string, key: 'name' | 'dob', value: string) => {
    setChildren((prev) => prev.map((c) => (c.id === id ? { ...c, [key]: value } : c)));
  };

  const removeChild = (id: string) => {
    setChildren((prev) => prev.filter((c) => c.id !== id));
  };

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
    setUploadingPhoto(true);
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
      setUploadingPhoto(false);
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
        contact: form.contact.trim(),
        address: form.address.trim(),
        children,
      });
      await updateProfile(updated);
      Alert.alert('Profile updated', 'Your changes have been saved.');
    } catch (error) {
      Alert.alert('Update failed', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handlePhotoPick = () => {
    handlePickAvatar();
  };

  const handleLogout = async () => {
    await logout();
    router.replace('/(tabs)');
  };

  if (!ready) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="dark-content" backgroundColor={C.bg} />
        <View style={styles.emptyState}>
          <Ionicons name="person-circle-outline" size={48} color={C.primaryDark} />
          <Text style={styles.emptyTitle}>Profile unavailable</Text>
          <Text style={styles.emptyText}>Please log in to manage your profile.</Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => router.push('/login')}>
            <Text style={styles.primaryBtnText}>Go to login</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const fullName = [form.firstName, form.middleName, form.lastName].filter(Boolean).join(' ') || 'Senior Citizen';

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity style={[styles.backBtn, webPointer]} onPress={() => router.back()} activeOpacity={0.8}>
              <Ionicons name="chevron-back" size={20} color={C.ink} />
            </TouchableOpacity>
            <View style={styles.headerTitleWrap}>
              <Text style={styles.title}>My Profile</Text>
              <Text style={styles.subtitle}>Manage your account information</Text>
            </View>
            <View style={styles.placeholder} />
          </View>

          {/* Body */}
          <View style={styles.bodyLayout}>
            {/* Left Column: Avatar Card + QR Card */}
            <View style={styles.leftCol}>
              <View style={[styles.profileCard, shadow(C.ink, 0.08, 16, 4)]}>
                <LinearGradient colors={[C.primaryMid, C.primaryDark]} style={styles.banner} />
                <TouchableOpacity
                  style={[styles.avatarWrap, webPointer]}
                  onPress={handlePickAvatar}
                  disabled={avatarUploading}
                  activeOpacity={0.85}
                >
                  {avatarUri ? (
                    <Image key={avatarUri} source={{ uri: avatarUri }} style={styles.avatarImage} />
                  ) : (
                    <Ionicons name="person" size={46} color={C.primary} />
                  )}
                  <View style={styles.avatarBadge}>
                    {avatarUploading ? (
                      <ActivityIndicator size="small" color={C.white} />
                    ) : (
                      <Ionicons name="camera" size={13} color={C.white} />
                    )}
                  </View>
                </TouchableOpacity>

                <Text style={styles.nameText}>{fullName}</Text>
                <View style={styles.emailRow}>
                  <Ionicons name="mail-outline" size={13} color={C.inkFaint} />
                  <Text style={styles.emailText}>{form.email || 'No email'}</Text>
                </View>

                <TouchableOpacity
                  style={[styles.changePhotoBtn, webPointer]}
                  onPress={handlePhotoPick}
                  disabled={uploadingPhoto}
                  activeOpacity={0.85}
                >
                  {uploadingPhoto ? (
                    <ActivityIndicator color={C.primaryDark} size="small" />
                  ) : (
                    <>
                      <Ionicons name="image-outline" size={15} color={C.primaryDark} />
                      <Text style={styles.changePhotoBtnText}>Choose from gallery</Text>
                    </>
                  )}
                </TouchableOpacity>

                <View style={styles.metaRow}>
                  <View style={styles.metaPill}>
                    <Text style={styles.metaLabel}>Member ID</Text>
                    <Text style={styles.metaVal}>#{user?.id ? String(user.id).padStart(5, '0') : '00000'}</Text>
                  </View>
                  <View style={styles.metaPill}>
                    <Text style={styles.metaLabel}>Status</Text>
                    <Text style={[styles.metaVal, { color: C.primary }]}>Active</Text>
                  </View>
                </View>
              </View>

              {/* Digital ID QR */}
              {user && (
                <View style={[styles.qrCard, shadow(C.ink, 0.08, 16, 4)]}>
                  <View style={styles.qrHeader}>
                    <Ionicons name="qr-code-outline" size={18} color={C.primaryDark} />
                    <Text style={styles.qrTitle}>Digital ID</Text>
                  </View>
                  <Text style={styles.qrDesc}>Present this code to verify your Senior Citizen status</Text>
                  <View style={styles.qrWrap}>
                    <QRCode
                      value={JSON.stringify({
                        id: user.id,
                        name: `${user.firstName} ${user.lastName}`,
                        dob: user.dob,
                        role: user.role,
                      })}
                      size={140}
                      color={C.ink}
                      backgroundColor={C.white}
                    />
                  </View>
                  <View style={styles.qrLabelRow}>
                    <Ionicons name="shield-checkmark" size={14} color={C.primary} />
                    <Text style={styles.qrLabel}>OSCA Verified</Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.viewIdBtn, webPointer]}
                    onPress={() => router.push('/digital-id')}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="card-outline" size={16} color={C.white} />
                    <Text style={styles.viewIdBtnTxt}>View Full ID Card</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* Right Column: Information Form */}
            <View style={styles.rightCol}>
              <View style={[styles.formCard, shadow(C.ink, 0.08, 16, 4)]}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Personal Information</Text>
                  <Text style={styles.sectionSubtitle}>Update your personal details below</Text>
                </View>

                <View style={styles.fieldRow}>
                  <View style={styles.fieldThird}>
                    <Text style={styles.label}>First Name *</Text>
                    <TextInput
                      style={styles.input}
                      value={form.firstName}
                      onChangeText={(value) => updateField('firstName', value)}
                      placeholder="First name"
                      placeholderTextColor={C.inkFaint}
                    />
                  </View>
                  <View style={styles.fieldThird}>
                    <Text style={styles.label}>Middle Name</Text>
                    <TextInput
                      style={styles.input}
                      value={form.middleName}
                      onChangeText={(value) => updateField('middleName', value)}
                      placeholder="Middle"
                      placeholderTextColor={C.inkFaint}
                    />
                  </View>
                  <View style={styles.fieldThird}>
                    <Text style={styles.label}>Last Name *</Text>
                    <TextInput
                      style={styles.input}
                      value={form.lastName}
                      onChangeText={(value) => updateField('lastName', value)}
                      placeholder="Last name"
                      placeholderTextColor={C.inkFaint}
                    />
                  </View>
                </View>

                <View style={styles.fieldRow}>
                  <View style={styles.fieldHalf}>
                    <Text style={styles.label}>OSCA ID Number</Text>
                    <TextInput
                      style={[styles.input, styles.readOnly]}
                      value={user?.oscaIdNumber || '—'}
                      editable={false}
                      placeholder="OSCA ID"
                      placeholderTextColor={C.inkFaint}
                    />
                  </View>

                  <View style={styles.fieldHalf}>
                    <Text style={styles.label}>Date of Birth</Text>
                    <View style={[styles.input, styles.readOnly]}>
                      <Ionicons name="calendar-outline" size={14} color={C.inkFaint} style={{ marginRight: 6 }} />
                      <Text style={styles.readOnlyText}>{form.dob || '—'}</Text>
                    </View>
                  </View>
                </View>

                <View style={styles.fieldRow}>
                  <View style={styles.fieldHalf}>
                    <Text style={styles.label}>Gender</Text>
                    <TouchableOpacity
                      style={[styles.input, styles.readOnly, webPointer, { justifyContent: 'space-between' }]}
                      onPress={() => setGenderOpen(true)}
                      activeOpacity={0.8}
                    >
                      <Text style={form.gender ? styles.readOnlyText : styles.placeholderText}>
                        {form.gender || 'Select gender'}
                      </Text>
                      <Ionicons name="chevron-down" size={14} color={C.inkFaint} />
                    </TouchableOpacity>
                  </View>

                  <View style={styles.fieldHalf}>
                    <Text style={styles.label}>Civil Status</Text>
                    <TouchableOpacity
                      style={[styles.input, styles.readOnly, webPointer, { justifyContent: 'space-between' }]}
                      onPress={() => setCivilStatusOpen(true)}
                      activeOpacity={0.8}
                    >
                      <Text style={form.civilStatus ? styles.readOnlyText : styles.placeholderText}>
                        {form.civilStatus || 'Select civil status'}
                      </Text>
                      <Ionicons name="chevron-down" size={14} color={C.inkFaint} />
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={styles.fieldRow}>
                  <View style={styles.fieldHalf}>
                    <Text style={styles.label}>Contact</Text>
                    <TextInput
                      style={styles.input}
                      value={form.contact}
                      onChangeText={(value) => updateField('contact', value)}
                      placeholder="09XXXXXXXXX"
                      keyboardType="phone-pad"
                      placeholderTextColor={C.inkFaint}
                    />
                  </View>
                </View>

                <View style={styles.divider} />

                <View style={styles.fieldRow}>
                  <View style={styles.fieldFull}>
                    <Text style={styles.label}>Email</Text>
                    <TextInput
                      style={styles.input}
                      value={form.email}
                      onChangeText={(value) => updateField('email', value)}
                      placeholder="you@example.com"
                      keyboardType="email-address"
                      autoCapitalize="none"
                      placeholderTextColor={C.inkFaint}
                    />
                  </View>
                </View>

                <Text style={styles.label}>Address</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={form.address}
                  onChangeText={(value) => updateField('address', value)}
                  placeholder="Barangay, Pateros"
                  multiline
                  placeholderTextColor={C.inkFaint}
                />

                {/* Birth Certificate Section */}
                <View style={styles.birthcertSection}>
                  <View style={styles.birthcertHeader}>
                    <View style={styles.sectionHeaderInline}>
                      <View style={styles.sectionIconWrap}>
                        <Ionicons name="document-text-outline" size={15} color={C.primaryDark} />
                      </View>
                      <View>
                        <Text style={styles.sectionTitle}>Birth Certificate</Text>
                        <Text style={styles.childrenHint}>PDF, PNG, or JPG</Text>
                      </View>
                    </View>
                    {!birthcert ? (
                      <TouchableOpacity
                        style={[styles.addChildBtn, webPointer]}
                        onPress={handleBirthCertificatePick}
                        disabled={birthcertUploading}
                        activeOpacity={0.85}
                      >
                        {birthcertUploading ? (
                          <ActivityIndicator color={C.white} size="small" />
                        ) : (
                          <Ionicons name="cloud-upload-outline" size={17} color={C.white} />
                        )}
                        <Text style={styles.addChildBtnText}>Upload</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>

                  {birthcert ? (
                    <View style={styles.birthcertCard}>
                      <TouchableOpacity
                        style={[styles.birthcertCardMain, webPointer]}
                        onPress={() => setViewerVisible(true)}
                        activeOpacity={0.8}
                      >
                        <View style={styles.birthcertBadge}>
                          <Ionicons name="checkmark-circle" size={20} color={C.primary} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.birthcertCardTitle}>Birth Certificate</Text>
                          <Text style={styles.birthcertCardSubtitle}>
                            {birthcert.toLowerCase().includes('.pdf') ? 'PDF Document • Tap to view in-app' : 'Image File • Tap to view in-app'}
                          </Text>
                        </View>
                        <View style={styles.birthcertViewPill}>
                          <Ionicons name="eye-outline" size={15} color={C.primary} />
                          <Text style={styles.birthcertViewPillText}>View</Text>
                        </View>
                      </TouchableOpacity>

                      <View style={styles.birthcertActionsRow}>
                        <TouchableOpacity
                          style={[styles.birthcertActionBtn, styles.birthcertReplaceBtn, webPointer]}
                          onPress={handleBirthCertificatePick}
                          disabled={birthcertUploading || birthcertDeleting}
                          activeOpacity={0.8}
                        >
                          {birthcertUploading ? (
                            <ActivityIndicator size="small" color={C.primaryDark} />
                          ) : (
                            <Ionicons name="swap-horizontal-outline" size={16} color={C.primaryDark} />
                          )}
                          <Text style={styles.birthcertReplaceBtnText}>Replace</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[styles.birthcertActionBtn, styles.birthcertDeleteBtn, webPointer]}
                          onPress={handleDeleteBirthCertificate}
                          disabled={birthcertUploading || birthcertDeleting}
                          activeOpacity={0.8}
                        >
                          {birthcertDeleting ? (
                            <ActivityIndicator size="small" color={C.error} />
                          ) : (
                            <Ionicons name="trash-outline" size={16} color={C.error} />
                          )}
                          <Text style={styles.birthcertDeleteBtnText}>Delete</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={[styles.birthcertStatus, styles.birthcertMissing, webPointer]}
                      onPress={handleBirthCertificatePick}
                      disabled={birthcertUploading}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="alert-circle-outline" size={18} color={C.goldDark} />
                      <Text style={[styles.birthcertStatusText, styles.birthcertMissingText]}>
                        Missing - upload your birth certificate
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>

                <View style={styles.divider} />

                {/* Children Section */}
                <View style={styles.childrenHeader}>
                  <View style={styles.sectionHeaderInline}>
                    <View style={styles.sectionIconWrap}>
                      <Ionicons name="people-outline" size={15} color={C.primaryDark} />
                    </View>
                    <View>
                      <Text style={styles.sectionTitle}>Children</Text>
                      <Text style={styles.childrenHint}>Add as many children as needed.</Text>
                    </View>
                  </View>
                  <TouchableOpacity style={[styles.addChildBtn, webPointer]} onPress={addChild} activeOpacity={0.85}>
                    <Ionicons name="add" size={18} color={C.white} />
                    <Text style={styles.addChildBtnText}>Add child</Text>
                  </TouchableOpacity>
                </View>

                {children.length === 0 ? (
                  <Text style={styles.noChildrenText}>No children added yet.</Text>
                ) : (
                  children.map((child, index) => (
                    <View key={child.id} style={styles.childRow}>
                      <View style={styles.childNumber}>
                        <Text style={styles.childNumberText}>{index + 1}</Text>
                      </View>
                      <View style={styles.childFields}>
                        <Text style={styles.label}>Child name</Text>
                        <TextInput
                          style={styles.input}
                          value={child.name}
                          onChangeText={(value) => updateChild(child.id, 'name', value)}
                          placeholder="Full name"
                          placeholderTextColor={C.inkFaint}
                        />
                        <Text style={styles.label}>Date of birth</Text>
                        <TextInput
                          style={styles.input}
                          value={child.dob}
                          onChangeText={(value) => updateChild(child.id, 'dob', value)}
                          placeholder="YYYY-MM-DD"
                          placeholderTextColor={C.inkFaint}
                        />
                      </View>
                      <TouchableOpacity
                        style={[styles.removeChildBtn, webPointer]}
                        onPress={() => removeChild(child.id)}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="trash-outline" size={16} color={C.error} />
                      </TouchableOpacity>
                    </View>
                  ))
                )}
              </View>

              {Platform.OS !== 'web' && (
                <View style={styles.actions}>
                  <TouchableOpacity style={[styles.secondaryBtn, webPointer]} onPress={handleLogout} activeOpacity={0.85}>
                    <Ionicons name="log-out-outline" size={18} color={C.primaryDark} />
                    <Text style={styles.secondaryBtnText}>Log out</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.primaryBtn, shadow(C.primaryDark, 0.24, 10, 4), webPointer]}
                    onPress={handleSave}
                    disabled={loading}
                    activeOpacity={0.9}
                  >
                    {loading ? (
                      <ActivityIndicator color={C.white} />
                    ) : (
                      <>
                        <Ionicons name="save-outline" size={18} color={C.white} />
                        <Text style={styles.primaryBtnText}>Save changes</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Gender Picker Modal */}
      <Modal visible={genderOpen} transparent animationType="fade" onRequestClose={() => setGenderOpen(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setGenderOpen(false)}>
          <View style={styles.modalSheet}>
            {Platform.OS !== 'web' && <View style={styles.modalHandle} />}
            <Text style={styles.modalTitle}>Select Gender</Text>
            {['Male', 'Female'].map((item) => (
              <TouchableOpacity
                key={item}
                style={[styles.modalItem, webPointer, item === form.gender && styles.modalItemActive]}
                onPress={() => { updateField('gender', item); setGenderOpen(false); }}
              >
                <Text style={[styles.modalItemText, item === form.gender && styles.modalItemTextActive]}>{item}</Text>
                {item === form.gender && <Ionicons name="checkmark-circle" size={22} color={C.primaryDark} />}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Civil Status Picker Modal */}
      <Modal visible={civilStatusOpen} transparent animationType="fade" onRequestClose={() => setCivilStatusOpen(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setCivilStatusOpen(false)}>
          <View style={styles.modalSheet}>
            {Platform.OS !== 'web' && <View style={styles.modalHandle} />}
            <Text style={styles.modalTitle}>Select Civil Status</Text>
            {['Single', 'Married', 'Widowed', 'Separated', 'Divorced'].map((item) => (
              <TouchableOpacity
                key={item}
                style={[styles.modalItem, webPointer, item === form.civilStatus && styles.modalItemActive]}
                onPress={() => { updateField('civilStatus', item); setCivilStatusOpen(false); }}
              >
                <Text style={[styles.modalItemText, item === form.civilStatus && styles.modalItemTextActive]}>{item}</Text>
                {item === form.civilStatus && <Ionicons name="checkmark-circle" size={22} color={C.primaryDark} />}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Birth Certificate In-App Viewer Modal */}
      <Modal
        visible={viewerVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setViewerVisible(false)}
      >
        <View style={styles.viewerModalOverlay}>
          <SafeAreaView style={styles.viewerModalSafe}>
            {/* Header */}
            <View style={styles.viewerModalHeader}>
              <TouchableOpacity
                style={[styles.viewerModalCloseBtn, webPointer]}
                onPress={() => setViewerVisible(false)}
                activeOpacity={0.8}
                accessibilityLabel="Close viewer"
              >
                <Ionicons name="close" size={22} color={C.white} />
              </TouchableOpacity>

              <View style={styles.viewerModalTitleWrap}>
                <Text style={styles.viewerModalTitle}>Birth Certificate</Text>
                <Text style={styles.viewerModalSubtitle}>
                  {birthcert?.toLowerCase().includes('.pdf') ? 'PDF Document' : 'Image Preview'}
                </Text>
              </View>

              <TouchableOpacity
                style={[styles.viewerModalDeleteHeaderBtn, webPointer]}
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

            {/* Viewer Content Area */}
            <View style={styles.viewerModalContent}>
              {birthcert ? (
                birthcert.toLowerCase().includes('.pdf') ? (
                  Platform.OS === 'web' ? (
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
                        <View style={styles.viewerLoadingWrap}>
                          <ActivityIndicator size="large" color={C.primarySoft} />
                          <Text style={styles.viewerLoadingText}>Loading PDF...</Text>
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

            {/* Footer Controls */}
            <View style={styles.viewerModalFooter}>
              <TouchableOpacity
                style={[styles.viewerFooterBtn, styles.viewerFooterReplace, webPointer]}
                onPress={handleBirthCertificatePick}
                disabled={birthcertUploading || birthcertDeleting}
                activeOpacity={0.85}
              >
                {birthcertUploading ? (
                  <ActivityIndicator size="small" color={C.primaryDark} />
                ) : (
                  <Ionicons name="swap-horizontal-outline" size={18} color={C.primaryDark} />
                )}
                <Text style={styles.viewerFooterReplaceText}>Replace</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.viewerFooterBtn, styles.viewerFooterDelete, webPointer]}
                onPress={handleDeleteBirthCertificate}
                disabled={birthcertUploading || birthcertDeleting}
                activeOpacity={0.85}
              >
                {birthcertDeleting ? (
                  <ActivityIndicator size="small" color="#FF8080" />
                ) : (
                  <Ionicons name="trash-outline" size={18} color="#FF8080" />
                )}
                <Text style={styles.viewerFooterDeleteText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  container: {
    flexGrow: 1,
    paddingHorizontal: sp(5),
    paddingTop: Math.max(sp(3), 10),
    paddingBottom: sp(10),
    width: '100%',
    maxWidth: Platform.OS === 'web' ? 1060 : 460,
    alignSelf: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: sp(5),
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: C.card,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: { shadowColor: C.ink, shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
      android: { elevation: 1 },
    }),
  },
  headerTitleWrap: { alignItems: 'center' },
  title: {
    fontFamily: 'FraunTitle',
    fontWeight: '600',
    fontSize: 22,
    color: C.ink,
  },
  subtitle: {
    fontFamily: 'InterBody',
    fontSize: 11.5,
    color: C.inkFaint,
    marginTop: 2,
  },
  placeholder: {
    width: 40,
  },

  bodyLayout: {
    flexDirection: Platform.OS === 'web' ? 'row' : 'column',
    alignItems: 'flex-start',
    gap: sp(5),
  },
  leftCol: {
    width: Platform.OS === 'web' ? 340 : '100%',
    gap: sp(5),
  },
  rightCol: {
    flex: 1,
    width: '100%',
    gap: sp(5),
  },

  profileCard: {
    backgroundColor: C.card,
    borderRadius: 24,
    alignItems: 'center',
    overflow: 'hidden',
    paddingBottom: sp(6),
    width: '100%',
  },
  banner: {
    width: '100%',
    height: 76,
  },
  avatarWrap: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: C.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginTop: -46,
    borderWidth: 4,
    borderColor: C.card,
  },
  avatarImage: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: C.primarySoft,
  },
  avatarBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: C.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: C.card,
  },
  nameText: {
    fontFamily: 'FraunTitle',
    fontSize: 21,
    color: C.ink,
    marginTop: sp(3),
  },
  emailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 4,
  },
  emailText: {
    fontFamily: 'InterBody',
    fontSize: 12.5,
    color: C.inkSoft,
  },
  changePhotoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: C.primarySoft,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    marginTop: sp(3),
  },
  changePhotoBtnText: {
    fontFamily: 'InterBody',
    fontSize: 12,
    fontWeight: '600',
    color: C.primaryDark,
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
    borderRadius: 12,
    paddingVertical: sp(2.5),
    alignItems: 'center',
  },
  metaLabel: {
    fontFamily: 'InterBody',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    color: C.inkFaint,
    textTransform: 'uppercase',
  },
  metaVal: {
    fontFamily: 'InterBody',
    fontSize: 13,
    fontWeight: '700',
    color: C.ink,
    marginTop: 2,
  },

  formCard: {
    backgroundColor: C.card,
    borderRadius: 24,
    padding: sp(5),
    width: '100%',
  },
  sectionHeader: {
    marginBottom: sp(5),
  },
  sectionHeaderInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: sp(2),
    flex: 1,
  },
  sectionIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: C.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontFamily: 'FraunTitle',
    fontSize: 17,
    color: C.ink,
  },
  sectionSubtitle: {
    fontFamily: 'InterBody',
    fontSize: 12,
    color: C.inkFaint,
    marginTop: 2,
  },

  fieldRow: {
    flexDirection: 'row',
    gap: sp(3),
    marginBottom: sp(3.5),
  },
  fieldFull: {
    flex: 1,
  },
  fieldHalf: {
    flex: 1,
  },
  fieldThird: {
    flex: 1,
  },
  label: {
    fontFamily: 'InterBody',
    fontSize: 12,
    fontWeight: '700',
    color: C.inkSoft,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  input: {
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: 'InterBody',
    fontSize: 14,
    color: C.ink,
    ...webNoOutline,
  },
  textArea: {
    minHeight: 76,
    textAlignVertical: 'top',
    paddingTop: 12,
    marginBottom: sp(3.5),
  },
  readOnly: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: hexToRgba(C.line, 0.45),
  },
  readOnlyText: {
    fontFamily: 'InterBody',
    fontSize: 14,
    color: C.ink,
  },
  placeholderText: {
    fontFamily: 'InterBody',
    fontSize: 14,
    color: C.inkFaint,
  },
  divider: {
    height: 1,
    backgroundColor: C.line,
    marginVertical: sp(4),
  },

  birthcertSection: {
    marginTop: sp(1),
  },
  birthcertHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: sp(2),
    marginBottom: sp(2),
  },
  birthcertStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  birthcertSubmitted: {
    backgroundColor: C.primarySoft,
  },
  birthcertMissing: {
    backgroundColor: C.goldSoft,
  },
  birthcertStatusText: {
    fontFamily: 'InterBody',
    fontSize: 12,
    fontWeight: '700',
    color: C.primaryDark,
  },
  birthcertMissingText: {
    color: C.goldDark,
  },
  birthcertCard: {
    backgroundColor: C.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.line,
    overflow: 'hidden',
  },
  birthcertCardMain: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: sp(3),
    gap: sp(2.5),
    backgroundColor: hexToRgba(C.primary, 0.05),
  },
  birthcertBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: C.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  birthcertCardTitle: {
    fontFamily: 'InterBody',
    fontSize: 13,
    fontWeight: '700',
    color: C.ink,
  },
  birthcertCardSubtitle: {
    fontFamily: 'InterBody',
    fontSize: 11,
    color: C.inkFaint,
    marginTop: 2,
  },
  birthcertViewPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: C.primarySoft,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
  },
  birthcertViewPillText: {
    fontFamily: 'InterBody',
    fontSize: 12,
    fontWeight: '700',
    color: C.primaryDark,
  },
  birthcertActionsRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: C.line,
    backgroundColor: C.card,
  },
  birthcertActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
  },
  birthcertReplaceBtn: {
    borderRightWidth: 1,
    borderRightColor: C.line,
  },
  birthcertReplaceBtnText: {
    fontFamily: 'InterBody',
    fontSize: 12,
    fontWeight: '600',
    color: C.primaryDark,
  },
  birthcertDeleteBtn: {},
  birthcertDeleteBtnText: {
    fontFamily: 'InterBody',
    fontSize: 12,
    fontWeight: '600',
    color: C.error,
  },

  childrenHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: sp(2),
    marginBottom: sp(3),
  },
  childrenHint: {
    fontFamily: 'InterBody',
    fontSize: 11,
    color: C.inkFaint,
    marginTop: 2,
  },
  addChildBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: C.primaryDark,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  addChildBtnText: {
    fontFamily: 'InterBody',
    fontWeight: '700',
    fontSize: 12,
    color: C.white,
  },
  noChildrenText: {
    fontFamily: 'InterBody',
    fontSize: 13,
    color: C.inkFaint,
    marginBottom: sp(2),
  },
  childRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: sp(2),
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 14,
    padding: sp(3),
    marginBottom: sp(2),
    backgroundColor: C.bg,
  },
  childNumber: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.primarySoft,
    marginTop: 2,
  },
  childNumberText: {
    fontFamily: 'InterBody',
    fontWeight: '700',
    fontSize: 12,
    color: C.primaryDark,
  },
  childFields: {
    flex: 1,
  },
  removeChildBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: '#FCE8E6',
  },

  actions: {
    flexDirection: 'row',
    gap: sp(3),
    marginTop: sp(4),
  },
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
  primaryBtnText: {
    fontFamily: 'InterBody',
    fontSize: 14,
    fontWeight: '700',
    color: C.white,
  },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  secondaryBtnText: {
    fontFamily: 'InterBody',
    fontSize: 14,
    fontWeight: '600',
    color: C.ink,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: C.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: sp(5),
    paddingBottom: Platform.OS === 'ios' ? sp(9) : sp(5),
    width: '100%',
    maxWidth: Platform.OS === 'web' ? 460 : '100%',
    alignSelf: 'center',
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.line,
    alignSelf: 'center',
    marginBottom: sp(3),
  },
  modalTitle: {
    fontFamily: 'FraunTitle',
    fontSize: 17,
    color: C.ink,
    marginBottom: sp(3),
  },
  modalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: sp(3),
    borderBottomWidth: 1,
    borderBottomColor: hexToRgba(C.line, 0.5),
  },
  modalItemActive: {
    backgroundColor: hexToRgba(C.primary, 0.05),
    borderRadius: 10,
    paddingHorizontal: sp(2),
  },
  modalItemText: {
    fontFamily: 'InterBody',
    fontSize: 15,
    color: C.ink,
  },
  modalItemTextActive: {
    fontWeight: '700',
    color: C.primaryDark,
  },

  viewerModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(10, 20, 16, 0.96)',
  },
  viewerModalSafe: {
    flex: 1,
  },
  viewerModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: sp(4),
    paddingVertical: sp(3),
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.12)',
  },
  viewerModalCloseBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerModalTitleWrap: {
    alignItems: 'center',
  },
  viewerModalTitle: {
    fontFamily: 'FraunTitle',
    fontSize: 17,
    fontWeight: '600',
    color: C.white,
  },
  viewerModalSubtitle: {
    fontFamily: 'InterBody',
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.65)',
    marginTop: 2,
  },
  viewerModalDeleteHeaderBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255, 80, 80, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerModalContent: {
    flex: 1,
    backgroundColor: '#0F1A14',
  },
  viewerWebView: {
    flex: 1,
    backgroundColor: '#0F1A14',
  },
  viewerLoadingWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#0F1A14',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  viewerLoadingText: {
    fontFamily: 'InterBody',
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.7)',
  },
  viewerImageScroll: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: sp(3),
  },
  viewerImage: {
    width: '100%',
    height: '100%',
    minHeight: 380,
  },
  viewerModalFooter: {
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
    paddingVertical: 12,
    borderRadius: 12,
  },
  viewerFooterReplace: {
    backgroundColor: C.primarySoft,
  },
  viewerFooterReplaceText: {
    fontFamily: 'InterBody',
    fontSize: 13,
    fontWeight: '700',
    color: C.primaryDark,
  },
  viewerFooterDelete: {
    backgroundColor: 'rgba(255, 80, 80, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255, 80, 80, 0.3)',
  },
  viewerFooterDeleteText: {
    fontFamily: 'InterBody',
    fontSize: 13,
    fontWeight: '700',
    color: '#FF8080',
  },

  qrCard: {
    backgroundColor: C.card,
    borderRadius: 24,
    padding: sp(5),
    alignItems: 'center',
    width: '100%',
  },
  qrHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  qrTitle: {
    fontFamily: 'FraunTitle',
    fontSize: 16,
    color: C.ink,
  },
  qrDesc: {
    fontFamily: 'InterBody',
    fontSize: 12,
    color: C.inkFaint,
    textAlign: 'center',
    marginBottom: sp(4),
    paddingHorizontal: sp(2),
  },
  qrWrap: {
    padding: 14,
    backgroundColor: C.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.line,
  },
  qrLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 10,
    marginBottom: 12,
  },
  qrLabel: {
    fontFamily: 'InterBody',
    fontWeight: '600',
    fontSize: 12,
    color: C.inkSoft,
  },
  viewIdBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: C.primaryDark,
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 20,
  },
  viewIdBtnTxt: {
    fontFamily: 'InterBody',
    fontWeight: '700',
    fontSize: 13,
    color: C.white,
  },

  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: sp(6),
  },
  emptyTitle: {
    fontFamily: 'FraunTitle',
    fontSize: 20,
    color: C.ink,
    marginTop: sp(3),
  },
  emptyText: {
    fontFamily: 'InterBody',
    fontSize: 13,
    color: C.inkFaint,
    marginTop: 6,
    marginBottom: sp(5),
    textAlign: 'center',
  },
});