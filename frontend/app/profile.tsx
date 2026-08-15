import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
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
  primarySoft: '#D8EDE1',
  gold: '#C4892E',
  goldSoft: '#F6EAD4',
  white: '#FFFFFF',
  line: '#D8E4D4',
  error: '#B42318',
};

const sp = (n: number) => n * 4;

export default function ProfileScreen() {
  const router = useRouter();
  const { user, updateProfile, logout } = useAuth();
  const [loading, setLoading] = useState(false);
  const [avatarUri, setAvatarUri] = useState<string | null>(user?.profilePhoto ?? user?.avatarUrl ?? null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [form, setForm] = useState({
    firstName: user?.firstName ?? '',
    lastName: user?.lastName ?? '',
    email: user?.email ?? '',
    middleName: user?.middleName ?? '',
    dob: user?.dob ?? '',
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

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
              <Ionicons name="arrow-back" size={20} color={C.primaryDark} />
            </TouchableOpacity>
            <Text style={styles.title}>Profile</Text>
            <View style={styles.placeholder} />
          </View>

          <View style={styles.profileCard}>
            <TouchableOpacity style={styles.avatarWrap} onPress={handlePickAvatar} activeOpacity={0.8}>
              {avatarUploading ? (
                <ActivityIndicator color={C.primaryDark} />
              ) : avatarUri ? (
                <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
              ) : (
                <Ionicons name="person" size={28} color={C.primaryDark} />
              )}
              <View style={styles.avatarBadge}>
                <Ionicons name="camera" size={12} color={C.white} />
              </View>
            </TouchableOpacity>
            <Text style={styles.nameText}>{`${form.firstName || 'User'} ${form.lastName || ''}`.trim()}</Text>
            <Text style={styles.emailText}>{form.email || 'No email linked'}</Text>

            {/* QR Code */}
            {user?.id ? (
              <View style={styles.qrSection}>
                <View style={styles.qrWrap}>
                  <QRCode
                    value={JSON.stringify({
                      id: user.id,
                      name: [form.firstName, form.middleName, form.lastName].filter(Boolean).join(' '),
                      dob: form.dob,
                      contact: form.contact,
                      address: form.address,
                      municipality: 'Pateros',
                    })}
                    size={110}
                    color={C.primaryDark}
                    backgroundColor={C.white}
                  />
                </View>
                <Text style={styles.qrLabel}>Scan to Verify Identity</Text>
                <TouchableOpacity
                  style={styles.viewIdBtn}
                  onPress={() => router.push('/digital-id')}
                  activeOpacity={0.85}
                >
                  <Ionicons name="id-card-outline" size={15} color={C.white} />
                  <Text style={styles.viewIdBtnTxt}>View Digital ID</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Personal Details</Text>

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

              <View style={styles.fieldHalf} />
            </View>

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

          <View style={styles.actions}>
            <TouchableOpacity style={styles.secondaryBtn} onPress={handleLogout}>
              <Ionicons name="log-out-outline" size={18} color={C.primaryDark} />
              <Text style={styles.secondaryBtnText}>Log out</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.primaryBtn} onPress={handleSave} disabled={loading}>
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
        </ScrollView>
      </KeyboardAvoidingView>
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
  },
  title: {
    fontFamily: 'InterBody',
    fontWeight: '600',
    fontSize: 22,
    color: C.ink,
  },
  placeholder: {
    width: 40,
  },
  profileCard: {
    backgroundColor: C.card,
    borderRadius: 22,
    padding: sp(5),
    alignItems: 'center',
    marginBottom: sp(5),
  },
  avatarButton: {
    position: 'relative',
    marginBottom: sp(2),
  },
  avatarWrap: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: C.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: C.primarySoft,
  },
  avatarBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: C.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: C.card,
  },
  nameText: {
    fontFamily: 'FraunTitle',
    fontSize: 20,
    color: C.ink,
  },
  emailText: {
    fontFamily: 'InterBody',
    fontSize: 13,
    color: C.inkSoft,
    marginTop: 4,
  },
  section: {
    backgroundColor: C.card,
    borderRadius: 22,
    padding: sp(5),
    marginBottom: sp(5),
  },
  sectionTitle: {
    fontFamily: 'InterBody',
    fontWeight: '600',
    fontSize: 16,
    color: C.ink,
    marginBottom: sp(3),
  },
  fieldRow: {
    flexDirection: 'row',
    gap: sp(2),
    marginBottom: sp(2),
  },
  fieldHalf: {
    flex: 1,
  },
  label: {
    fontFamily: 'InterBody',
    fontWeight: '500',
    fontSize: 12.5,
    color: C.inkSoft,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.bg,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: 'InterBody',
    fontSize: 14,
    color: C.ink,
    marginBottom: sp(2),
  },
  textArea: {
    minHeight: 90,
    textAlignVertical: 'top',
  },
  readOnly: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.primarySoft,
    borderColor: C.line,
  },
  readOnlyText: {
    fontFamily: 'InterBody',
    fontSize: 14,
    color: C.inkSoft,
  },
  actions: {
    flexDirection: 'row',
    gap: sp(2),
  },
  secondaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: C.goldSoft,
    borderRadius: 12,
    paddingVertical: 14,
  },
  secondaryBtnText: {
    fontFamily: 'InterBody',
    fontWeight: '600',
    fontSize: 14,
    color: C.primaryDark,
  },
  primaryBtn: {
    flex: 1.2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: C.primaryDark,
    borderRadius: 12,
    paddingVertical: 14,
  },
  primaryBtnText: {
    fontFamily: 'InterBody',
    fontWeight: '600',
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
  qrSection: {
    alignItems: 'center',
    marginTop: sp(4),
  },
  qrWrap: {
    padding: 12,
    backgroundColor: C.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.line,
  },
  qrLabel: {
    fontFamily: 'InterBody',
    fontSize: 12,
    color: C.inkFaint,
    marginTop: 8,
    marginBottom: 10,
  },
  viewIdBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: C.primaryDark,
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 18,
  },
  viewIdBtnTxt: {
    fontFamily: 'InterBody',
    fontWeight: '600',
    fontSize: 13,
    color: C.white,
  },
});
