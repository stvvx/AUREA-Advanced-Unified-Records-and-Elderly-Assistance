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
import QRCode from 'react-native-qrcode-svg';
import { useAuth } from '../context/AuthContext';
import { getUser, updateUser, uploadAvatar } from '../lib/authApi';

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
    // react-native-web doesn't read shadow*/elevation, so give it a real boxShadow
    web: { boxShadow: `0px ${height}px ${radius}px ${hexToRgba(color, opacity)}` } as any,
    default: {},
  });
}

// Small helper so buttons/links show a pointer cursor on web without affecting native
const webPointer = Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {};
// Kills the browser's default blue focus ring on text inputs so our own border styling shows
const webNoOutline = Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {};

export default function ProfileScreen() {
  const router = useRouter();
  const { user, updateProfile, logout } = useAuth();
  const [loading, setLoading] = useState(false);
  const [avatarUri, setAvatarUri] = useState<string | null>(user?.profilePhoto ?? user?.avatarUrl ?? null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [genderOpen, setGenderOpen] = useState(false);
  const [form, setForm] = useState({
    firstName: user?.firstName ?? '',
    lastName: user?.lastName ?? '',
    email: user?.email ?? '',
    middleName: user?.middleName ?? '',
    dob: user?.dob ?? '',
    gender: user?.gender ?? '',
    contact: user?.contact ?? '',
    address: user?.address ?? '',
    profilePhoto: user?.profilePhoto ?? user?.avatarUrl ?? null,
  });

  const ready = useMemo(() => !!user, [user]);

  // Fetch full profile from DB on mount and fall back to the saved session if needed.
  useEffect(() => {
    if (!user?.id) return;

    const sessionFallback = {
      firstName: user.firstName ?? '',
      lastName: user.lastName ?? '',
      email: user.email ?? '',
      middleName: user.middleName ?? '',
      dob: user.dob ?? '',
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
          contact: profile.contact ?? sessionFallback.contact,
          address: profile.address ?? sessionFallback.address,
          profilePhoto: nextProfilePhoto,
        });
        if (nextProfilePhoto) setAvatarUri(nextProfilePhoto);
      })
      .catch((err) => {
        console.warn('[Profile] getUser failed:', err?.message);
        setForm(sessionFallback);
      });
  }, [user?.id, user?.firstName, user?.lastName, user?.email, user?.middleName, user?.dob, user?.contact, user?.address]);

  const handlePickAvatar = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Please allow access to your photo library.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
      base64: true,
    });

    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    if (!asset.base64) {
      Alert.alert('Error', 'Could not read image data.');
      return;
    }

    if (!user?.id) return;
    setAvatarUploading(true);
    try {
      const mimeType = asset.mimeType ?? 'image/jpeg';
      const { avatarUrl } = await uploadAvatar(user.id, asset.base64, mimeType);
      const nextAvatar = avatarUrl || asset.uri;
      setAvatarUri(nextAvatar);
      setForm((prev) => ({ ...prev, profilePhoto: nextAvatar }));
      await updateProfile({ avatarUrl: nextAvatar, profilePhoto: nextAvatar });
    } catch (err) {
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

    setLoading(true);
    try {
      const { user: updated } = await updateUser(user.id, {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim().toLowerCase(),
        middleName: form.middleName.trim(),
        dob: form.dob.trim(),
        gender: form.gender.trim(),
        contact: form.contact.trim(),
        address: form.address.trim(),
      });
      await updateProfile(updated); // sync AsyncStorage session
      Alert.alert('Profile updated', 'Your changes have been saved.');
    } catch (error) {
      Alert.alert('Update failed', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handlePhotoPick = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Please allow access to your photos to upload a profile photo.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (result.canceled || !result.assets?.[0]?.uri) return;

    setUploadingPhoto(true);
    try {
      const photoUri = result.assets[0].uri;
      setForm((prev) => ({ ...prev, profilePhoto: photoUri }));
      setAvatarUri(photoUri);
      if (user) {
        await updateProfile({ profilePhoto: photoUri, avatarUrl: photoUri });
      }
      Alert.alert('Profile photo updated', 'Your new photo is ready to use.');
    } catch (error) {
      Alert.alert('Upload failed', error instanceof Error ? error.message : 'Could not save the profile photo.');
    } finally {
      setUploadingPhoto(false);
    }
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

  const fullName = `${form.firstName || 'User'} ${form.lastName || ''}`.trim();

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <TouchableOpacity style={[styles.backBtn, webPointer]} onPress={() => router.back()}>
              <Ionicons name="arrow-back" size={20} color={C.primaryDark} />
            </TouchableOpacity>
            <View style={styles.headerTitleWrap}>
              <Text style={styles.title}>My Profile</Text>
              <Text style={styles.subtitle}>Manage your personal information</Text>
            </View>
            <View style={styles.placeholder} />
          </View>

          <View style={styles.bodyLayout}>
            {/* ── Left: profile summary + QR (sidebar on web, top card on mobile) ── */}
            <View style={styles.leftCol}>
              <View style={[styles.profileCard, shadow(C.primaryDark, 0.12, 20, 8)]}>
                <LinearGradient
                  colors={[C.primaryDark, C.primaryMid]}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                  style={styles.banner}
                />

                <TouchableOpacity style={[styles.avatarWrap, webPointer]} onPress={handlePickAvatar} activeOpacity={0.85}>
                  {avatarUploading ? (
                    <ActivityIndicator color={C.primaryDark} />
                  ) : avatarUri ? (
                    <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
                  ) : (
                    <Ionicons name="person" size={32} color={C.primaryDark} />
                  )}
                  <View style={styles.avatarBadge}>
                    <Ionicons name="camera" size={12} color={C.white} />
                  </View>
                </TouchableOpacity>

                <Text style={styles.nameText}>{fullName}</Text>
                <View style={styles.emailRow}>
                  <Ionicons name="mail-outline" size={12} color={C.inkFaint} />
                  <Text style={styles.emailText}>{form.email || 'No email linked'}</Text>
                </View>

                {/* QR Code */}
                {user?.id ? (
                  <View style={styles.qrSection}>
                    <View style={styles.qrDivider} />
                    <View style={[styles.qrWrap, shadow(C.primaryDark, 0.08, 10, 3)]}>
                      <QRCode
                        value={JSON.stringify({
                          id: user.id,
                          name: [form.firstName, form.middleName, form.lastName].filter(Boolean).join(' '),
                          dob: form.dob,
                          gender: form.gender,
                          contact: form.contact,
                          address: form.address,
                          municipality: 'Pateros',
                        })}
                        size={104}
                        color={C.primaryDark}
                        backgroundColor={C.white}
                      />
                    </View>
                    <View style={styles.qrLabelRow}>
                      <Ionicons name="shield-checkmark" size={12} color={C.primary} />
                      <Text style={styles.qrLabel}>Scan to verify identity</Text>
                    </View>
                    <TouchableOpacity
                      style={[styles.viewIdBtn, webPointer]}
                      onPress={() => router.push('/digital-id')}
                      activeOpacity={0.85}
                    >
                      <Ionicons name="id-card-outline" size={15} color={C.white} />
                      <Text style={styles.viewIdBtnTxt}>View Digital ID</Text>
                      <Ionicons name="chevron-forward" size={14} color="rgba(255,255,255,0.7)" />
                    </TouchableOpacity>
                  </View>
                ) : null}
              </View>

              {/* Actions live under the sidebar card on web; below the form on mobile */}
              {Platform.OS === 'web' && (
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

            {/* ── Right: editable details form ── */}
            <View style={styles.rightCol}>
              <View style={[styles.section, shadow(C.primaryDark, 0.06, 14, 4)]}>
                <View style={styles.sectionHeader}>
                  <View style={styles.sectionIconWrap}>
                    <Ionicons name="person-outline" size={15} color={C.primaryDark} />
                  </View>
                  <Text style={styles.sectionTitle}>Personal Details</Text>
                </View>

                <View style={styles.fieldRow}>
                  <View style={styles.fieldHalf}>
                    <Text style={styles.label}>First Name</Text>
                    <TextInput
                      style={styles.input}
                      value={form.firstName}
                      onChangeText={(value) => updateField('firstName', value)}
                      placeholder="Juan"
                      placeholderTextColor={C.inkFaint}
                    />
                  </View>

                  <View style={styles.fieldHalf}>
                    <Text style={styles.label}>Last Name</Text>
                    <TextInput
                      style={styles.input}
                      value={form.lastName}
                      onChangeText={(value) => updateField('lastName', value)}
                      placeholder="Dela Cruz"
                      placeholderTextColor={C.inkFaint}
                    />
                  </View>
                </View>

                <View style={styles.fieldRow}>
                  <View style={styles.fieldHalf}>
                    <Text style={styles.label}>Middle Name</Text>
                    <TextInput
                      style={styles.input}
                      value={form.middleName}
                      onChangeText={(value) => updateField('middleName', value)}
                      placeholder="Optional"
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
                  <View style={styles.fieldHalf}>
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
                  <View style={styles.fieldHalf} />
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

      {/* Gender Picker Modal — bottom sheet on mobile, centered dialog on web */}
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

  // Two-column on web (sidebar + form), single stacked column on mobile
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

  // Profile summary card
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

  section: {
    backgroundColor: C.card,
    borderRadius: 22,
    padding: sp(5),
    width: '100%',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: sp(2),
    marginBottom: sp(4),
  },
  sectionIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: C.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontFamily: 'InterBody',
    fontWeight: '700',
    fontSize: 15.5,
    color: C.ink,
  },
  fieldRow: {
    flexDirection: 'row',
    gap: sp(3),
    marginBottom: sp(1),
  },
  fieldHalf: {
    flex: 1,
  },
  label: {
    fontFamily: 'InterBody',
    fontWeight: '600',
    fontSize: 11.5,
    letterSpacing: 0.2,
    color: C.inkSoft,
    marginBottom: 7,
  },
  input: {
    borderWidth: 1.2,
    borderColor: C.line,
    backgroundColor: C.bg,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: 'InterBody',
    fontSize: 14,
    color: C.ink,
    marginBottom: sp(3),
    ...webNoOutline,
  },
  textArea: {
    minHeight: 90,
    textAlignVertical: 'top',
  },
  readOnly: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.primarySoft,
    borderColor: 'transparent',
  },
  readOnlyText: {
    fontFamily: 'InterBody',
    fontSize: 14,
    color: C.inkSoft,
    fontWeight: '600',
  },
  placeholderText: {
    color: C.inkFaint,
    fontFamily: 'InterBody',
    fontSize: 14,
  },
  divider: {
    height: 1,
    backgroundColor: C.line,
    marginBottom: sp(3),
  },

  actions: {
    flexDirection: 'row',
    gap: sp(3),
  },
  secondaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: C.goldSoft,
    borderRadius: 14,
    paddingVertical: 15,
    borderWidth: 1,
    borderColor: '#EEDDB8',
  },
  secondaryBtnText: {
    fontFamily: 'InterBody',
    fontWeight: '700',
    fontSize: 14,
    color: C.primaryDark,
  },
  primaryBtn: {
    flex: 1.3,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: C.primaryDark,
    borderRadius: 14,
    paddingVertical: 15,
  },
  primaryBtnText: {
    fontFamily: 'InterBody',
    fontWeight: '700',
    fontSize: 14,
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
    fontSize: 14,
    color: C.inkSoft,
    marginTop: 6,
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(14,31,22,0.5)',
    justifyContent: Platform.OS === 'web' ? 'center' : 'flex-end',
    alignItems: Platform.OS === 'web' ? 'center' : 'stretch',
    padding: Platform.OS === 'web' ? sp(4) : 0,
  },
  modalSheet: {
    backgroundColor: C.card,
    borderRadius: Platform.OS === 'web' ? 20 : 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: sp(3),
    paddingBottom: Platform.OS === 'web' ? sp(3) : sp(8),
    width: '100%',
    maxWidth: Platform.OS === 'web' ? 360 : undefined,
    ...shadow(C.primaryDark, 0.25, 24, 10),
  },
  modalHandle: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: C.line,
    alignSelf: 'center',
    marginBottom: sp(4),
  },
  modalTitle: {
    fontFamily: 'InterBody',
    fontWeight: '600',
    fontSize: 16,
    color: C.ink,
    textAlign: 'center',
    marginBottom: sp(2),
    paddingHorizontal: sp(5),
  },
  modalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: sp(6),
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  modalItemActive: { backgroundColor: C.primarySoft },
  modalItemText: { fontFamily: 'InterBody', fontSize: 16, color: C.ink },
  modalItemTextActive: { color: C.primaryDark, fontWeight: '700' },
  qrSection: {
    alignItems: 'center',
    marginTop: sp(2),
    width: '100%',
  },
  qrDivider: {
    height: 1,
    width: '100%',
    backgroundColor: C.line,
    marginBottom: sp(4),
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
});