import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  StatusBar,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../context/AuthContext';
import Toast from '../components/Toast';
import { getBenefitById } from '../data/benefits';
import { getUser } from '../lib/authApi';
import { submitOctogenarianBenefitApplication } from '../services/benefitApi';

type HealthCenter = {
  id: string;
  name: string;
  address: string;
  lat: number;
  lon: number;
  keywords: string[];
};

type LocatedCenter = {
  name: string;
  address: string;
  distanceKm: number | null;
  source: 'gps' | 'keyword' | 'fallback';
};

type BenefitAttachment = {
  uri: string;
  base64: string;
  mimeType: string;
};

const HEALTH_CENTERS: HealthCenter[] = [
  {
    id: 'pateros-main',
    name: 'Pateros Municipal Health Center',
    address: 'B. Morcilla Street, Poblacion, Pateros',
    lat: 14.5456,
    lon: 121.0689,
    keywords: ['poblacion', 'morcilla', 'martires', 'sta. ana'],
  },
  {
    id: 'aguho',
    name: 'Aguho Barangay Health Center',
    address: 'Aguho, Pateros',
    lat: 14.545,
    lon: 121.076,
    keywords: ['aguho'],
  },
  {
    id: 'san-pedro',
    name: 'San Pedro Barangay Health Center',
    address: 'San Pedro, Pateros',
    lat: 14.5388,
    lon: 121.0705,
    keywords: ['san pedro'],
  },
  {
    id: 'santa-ana',
    name: 'Santa Ana Barangay Health Center',
    address: 'Sta. Ana, Pateros',
    lat: 14.5468,
    lon: 121.0744,
    keywords: ['sta ana', 'santa ana'],
  },
];

function calculateAgeFromDob(dob?: string): string {
  if (!dob) return '';

  const normalizedDob = dob.trim();
  const match = normalizedDob.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const slashMatch = normalizedDob.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match && !slashMatch) return '';

  const year = Number(match?.[1] ?? slashMatch?.[3]);
  const month = Number(match?.[2] ?? slashMatch?.[1]);
  const day = Number(match?.[3] ?? slashMatch?.[2]);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return '';
  }

  const today = new Date();
  if (date > today) return '';
  let age = today.getFullYear() - date.getFullYear();
  const monthDiff = today.getMonth() - date.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < date.getDate())) {
    age -= 1;
  }

  return String(Math.max(age, 0));
}

function formatDigitalIdNumber(id?: number): string {
  if (!id) return 'SA-1947';
  return `SA-${String(id).padStart(4, '0')}`;
}

function classifySeniorBenefit(dob?: string): 'Octogenarian' | 'Nonagenarian' | 'Centenarian' | null {
  const age = Number(calculateAgeFromDob(dob));
  if (!Number.isFinite(age) || age < 80) return null;
  if (age >= 100) return 'Centenarian';
  if (age >= 90) return 'Nonagenarian';
  return 'Octogenarian';
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const earthRadiusKm = 6371;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadiusKm * c;
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

async function geocodeAddress(address: string): Promise<{ lat: number; lon: number } | null> {
  const query = `${address}, Pateros, Metro Manila, Philippines`;
  const endpoint = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`;

  try {
    const response = await fetch(endpoint, {
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) return null;

    const data = (await response.json()) as Array<{ lat: string; lon: string }>;
    if (!Array.isArray(data) || data.length === 0) return null;

    const first = data[0];
    const lat = Number(first.lat);
    const lon = Number(first.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

    return { lat, lon };
  } catch {
    return null;
  }
}

function locateByKeyword(address: string): LocatedCenter | null {
  const normalizedAddress = normalizeText(address);
  if (!normalizedAddress) return null;

  const matched = HEALTH_CENTERS.find((center) =>
    center.keywords.some((keyword) => normalizedAddress.includes(normalizeText(keyword))),
  );

  if (!matched) return null;

  return {
    name: matched.name,
    address: matched.address,
    distanceKm: null,
    source: 'keyword',
  };
}

function AttachmentStatus({ label, attached, optional = false }: { label: string; attached: boolean; optional?: boolean }) {
  return (
    <View style={[s.attachmentStatusRow, attached ? s.attachmentStatusRowAttached : s.attachmentStatusRowMissing]}>
      <Ionicons
        name={attached ? 'checkmark-circle' : 'alert-circle-outline'}
        size={19}
        color={attached ? '#1F5C3E' : '#9A5B13'}
      />
      <Text style={[s.attachmentStatusText, !attached && s.attachmentStatusTextMissing]}>
        {label}: {attached ? 'Attached' : optional ? 'Optional' : 'Required'}
      </Text>
    </View>
  );
}

const FIELD_STYLE = {
  borderWidth: 1,
  borderColor: '#D9E4D7',
  borderRadius: 16,
  backgroundColor: '#FFFFFF',
  paddingHorizontal: 14,
  paddingVertical: 12,
  fontSize: 15,
  fontFamily: 'InterBody',
  color: '#132018',
};

export default function BenefitApplicationScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ benefit?: string; benefitId?: string }>();
  const { user } = useAuth();
  const benefitId = typeof params.benefitId === 'string' ? params.benefitId : undefined;

  const selectedBenefit = useMemo(() => {
    const benefitById = getBenefitById(benefitId);
    const value = benefitById?.applicationValue ?? (typeof params.benefit === 'string' ? params.benefit : 'benefit request');
    return value.replace(/\s+/g, ' ').trim();
  }, [benefitId, params.benefit]);

  const isCheckUp = benefitId === 'check-up';
  const isFinancialAid = benefitId === 'financial-aid';

  const [form, setForm] = useState({
    applicantName: user ? `${user.firstName} ${user.lastName}`.trim() : '',
    contactNumber: user?.contact ?? '',
    amount: '',
    notes: '',
  });
  const [checkUpForm, setCheckUpForm] = useState({
    name: user ? `${user.firstName} ${user.lastName}`.trim() : '',
    age: calculateAgeFromDob(user?.dob),
    sex: user?.gender ?? '',
    address: user?.address ?? '',
    contactNumber: user?.contact ?? '',
    emergencyContact: '',
    relationshipToEmergencyContact: '',
    existingMedicalCondition: '',
    currentMedication: '',
    allergies: '',
    previousMedicalHistory: '',
    reasonForConsultation: '',
  });
  const [financialAidForm, setFinancialAidForm] = useState({
    benefitType: classifySeniorBenefit(user?.dob),
    oscaIdNumber: formatDigitalIdNumber(user?.id),
    lastName: user?.lastName ?? '',
    givenName: user?.firstName ?? '',
    middleName: user?.middleName ?? '',
    dateOfBirth: user?.dob ?? '',
    residentialAddress: '',
    permanentAddressPhilippines: user?.address ?? '',
    sex: user?.gender ?? '',
    civilStatus: user?.civilStatus ?? '',
    citizenship: 'Filipino',
    isDualCitizen: false,
    dualCitizenshipDetails: '',
    spouseName: '',
    spouseCitizenship: '',
    representativeName: '',
    representativeRelationship: '',
    contactNumber: user?.contact ?? '',
    emailAddress: user?.email ?? '',
    applicantSignature: '',
  });
  const [profileChildren, setProfileChildren] = useState(user?.children ?? []);
  const [fullBodyPicture, setFullBodyPicture] = useState<BenefitAttachment | null>(null);
  const [endorsedListFile, setEndorsedListFile] = useState<BenefitAttachment | null>(null);
  const [nearestCenter, setNearestCenter] = useState<LocatedCenter | null>(null);
  const [locatingCenter, setLocatingCenter] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' as 'success' | 'error' });

  const updateField = (key: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const updateCheckUpField = (key: keyof typeof checkUpForm, value: string) => {
    setCheckUpForm((prev) => ({ ...prev, [key]: value }));
  };

  const updateFinancialAidField = <Key extends keyof typeof financialAidForm>(key: Key, value: (typeof financialAidForm)[Key]) => {
    setFinancialAidForm((prev) => ({ ...prev, [key]: value }));
  };

  const chooseBenefitAttachment = async (kind: 'fullBody' | 'endorsedList', source: 'camera' | 'library') => {
    const permission = source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setToast({ visible: true, message: `Please allow ${source === 'camera' ? 'camera' : 'photo library'} access to attach this document.`, type: 'error' });
      return;
    }
          <AttachmentStatus label="Endorsed list document" attached={endorsedListSubmitted} optional />
    const result = source === 'camera'
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8, base64: true })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8, base64: true });
    const asset = result.canceled ? null : result.assets?.[0];
    if (!asset?.base64) return;

    const attachment = {
      uri: asset.uri,
      base64: asset.base64,
      mimeType: asset.mimeType ?? 'image/jpeg',
    };
    if (kind === 'fullBody') {
      setFullBodyPicture(attachment);
    } else {
      setEndorsedListFile(attachment);
    }
  };

  const locateNearestCenter = async (addressInput: string) => {
    const trimmedAddress = addressInput.trim();
    if (!trimmedAddress) {
      setNearestCenter(null);
      return;
    }

    try {
      const coordinates = await geocodeAddress(trimmedAddress);

      if (coordinates) {
        let bestCenter: HealthCenter | null = null;
        let bestDistance = Number.POSITIVE_INFINITY;

        for (const center of HEALTH_CENTERS) {
          const distance = haversineKm(coordinates.lat, coordinates.lon, center.lat, center.lon);
          if (distance < bestDistance) {
            bestDistance = distance;
            bestCenter = center;
          }
        }

        if (bestCenter) {
          setNearestCenter({
            name: bestCenter.name,
            address: bestCenter.address,
            distanceKm: Number(bestDistance.toFixed(2)),
            source: 'gps',
          });
          return;
        }
      }

      const keywordMatch = locateByKeyword(trimmedAddress);
      if (keywordMatch) {
        setNearestCenter(keywordMatch);
        return;
      }

      const fallbackCenter = HEALTH_CENTERS[0];
      setNearestCenter({
        name: fallbackCenter.name,
        address: fallbackCenter.address,
        distanceKm: null,
        source: 'fallback',
      });
    } finally {
      setLocatingCenter(false);
    }
  };

  useEffect(() => {
    if ((!isCheckUp && !isFinancialAid) || !user?.id) return;

    let active = true;

    getUser(user.id)
      .then(({ user: profile }) => {
        if (!active) return;

        setCheckUpForm((prev) => ({
          ...prev,
          name: `${profile.firstName ?? ''} ${profile.lastName ?? ''}`.replace(/\s+/g, ' ').trim(),
          age: calculateAgeFromDob(profile.dob || user.dob),
          sex: profile.gender ?? user.gender ?? '',
          address: profile.address ?? user.address ?? '',
          contactNumber: profile.contact ?? user.contact ?? '',
        }));
        setFinancialAidForm((prev) => ({
          ...prev,
          lastName: profile.lastName ?? user.lastName,
          givenName: profile.firstName ?? user.firstName,
          middleName: profile.middleName ?? user.middleName ?? '',
          oscaIdNumber: formatDigitalIdNumber(user.id),
          dateOfBirth: profile.dob ?? user.dob ?? '',
          permanentAddressPhilippines: profile.address ?? user.address ?? '',
          sex: profile.gender ?? user.gender ?? '',
          civilStatus: profile.civilStatus ?? user.civilStatus ?? '',
          contactNumber: profile.contact ?? user.contact ?? '',
          emailAddress: profile.email ?? user.email,
        }));
        setProfileChildren(profile.children ?? user.children ?? []);
        setFinancialAidForm((prev) => ({
          ...prev,
          benefitType: classifySeniorBenefit(profile.dob ?? user.dob),
        }));
      })
      .catch(() => {
        // Keep session data fallback if API profile fetch is unavailable.
      });

    return () => {
      active = false;
    };
  }, [isCheckUp, isFinancialAid, user?.id, user?.address, user?.contact, user?.dob, user?.gender]);

  useEffect(() => {
    if (!isCheckUp) return;
    if (!checkUpForm.address.trim()) return;

    locateNearestCenter(checkUpForm.address);
  }, [isCheckUp]);

  const displayedAge = calculateAgeFromDob(financialAidForm.dateOfBirth);
  const displayedBenefitType = classifySeniorBenefit(financialAidForm.dateOfBirth);
  const oscaIdNumber = formatDigitalIdNumber(user?.id);
  const fullBodyPictureSubmitted = Boolean(fullBodyPicture);
  const endorsedListSubmitted = Boolean(endorsedListFile);

  const handleSubmit = async () => {
    if (isFinancialAid) {
      const detectedBenefitType = displayedBenefitType;
      if (!detectedBenefitType) {
        setToast({ visible: true, message: 'The applicant must be at least 80 years old to apply for this benefit.', type: 'error' });
        return;
      }

      const requiredFields: Array<[string, string]> = [
        ['given name', financialAidForm.givenName],
        ['last name', financialAidForm.lastName],
        ['date of birth', financialAidForm.dateOfBirth],
        ['permanent Philippine address', financialAidForm.permanentAddressPhilippines],
        ['contact number', financialAidForm.contactNumber],
        ['email address', financialAidForm.emailAddress],
      ];
      const missingField = requiredFields.find(([, value]) => !value.trim());
      if (missingField) {
        setToast({ visible: true, message: `Please enter the ${missingField[0]}.`, type: 'error' });
        return;
      }

      if (financialAidForm.isDualCitizen && !financialAidForm.dualCitizenshipDetails.trim()) {
        setToast({ visible: true, message: 'Please provide your dual citizenship details.', type: 'error' });
        return;
      }

      if (!fullBodyPicture) {
        setToast({ visible: true, message: 'Please attach or capture the full-body picture.', type: 'error' });
        return;
      }
      setSubmitting(true);
      try {
        await submitOctogenarianBenefitApplication({
          user_id: user!.id,
          osca_id_number: oscaIdNumber,
          date_of_birth: financialAidForm.dateOfBirth.trim(),
          benefit_type: detectedBenefitType,
          residential_address: financialAidForm.residentialAddress.trim(),
          permanent_address_philippines: financialAidForm.permanentAddressPhilippines.trim(),
          spouse_name: financialAidForm.spouseName.trim(),
          spouse_citizenship: financialAidForm.spouseCitizenship.trim(),
          representative_name: financialAidForm.representativeName.trim(),
          representative_relationship: financialAidForm.representativeRelationship.trim(),
          contact_number: financialAidForm.contactNumber.trim(),
          email_address: financialAidForm.emailAddress.trim(),
          citizenship: financialAidForm.citizenship.trim(),
          is_dual_citizen: financialAidForm.isDualCitizen,
          dual_citizenship_details: financialAidForm.dualCitizenshipDetails.trim(),
          full_body_picture_submitted: fullBodyPictureSubmitted,
          endorsed_list_submitted: endorsedListSubmitted,
          full_body_picture_base64: fullBodyPicture.base64,
          full_body_picture_mime_type: fullBodyPicture.mimeType,
          endorsed_list_base64: endorsedListFile?.base64,
          endorsed_list_mime_type: endorsedListFile?.mimeType,
          applicant_signature: financialAidForm.applicantSignature.trim(),
          applicant_signature_date: new Date().toISOString().slice(0, 10),
        });
        setToast({ visible: true, message: 'Birthday Benefits application submitted successfully.', type: 'success' });
        setTimeout(() => router.back(), 1200);
      } catch (error) {
        setToast({ visible: true, message: error instanceof Error ? error.message : 'Unable to submit your application right now.', type: 'error' });
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (isCheckUp) {
      if (!checkUpForm.name.trim()) {
        setToast({ visible: true, message: 'Please enter the name.', type: 'error' });
        return;
      }
      if (!checkUpForm.age.trim()) {
        setToast({ visible: true, message: 'Please enter the age.', type: 'error' });
        return;
      }
      if (!checkUpForm.sex.trim()) {
        setToast({ visible: true, message: 'Please enter sex (gender).', type: 'error' });
        return;
      }
      if (!checkUpForm.address.trim()) {
        setToast({ visible: true, message: 'Please enter the address.', type: 'error' });
        return;
      }
      if (!checkUpForm.contactNumber.trim()) {
        setToast({ visible: true, message: 'Please enter a contact number.', type: 'error' });
        return;
      }
      if (!checkUpForm.emergencyContact.trim()) {
        setToast({ visible: true, message: 'Please enter an emergency contact.', type: 'error' });
        return;
      }
      if (!checkUpForm.relationshipToEmergencyContact.trim()) {
        setToast({ visible: true, message: 'Please enter relationship to emergency contact.', type: 'error' });
        return;
      }
      if (!checkUpForm.reasonForConsultation.trim()) {
        setToast({ visible: true, message: 'Please provide the reason for consultation/check-up.', type: 'error' });
        return;
      }
    }

    if (!form.applicantName.trim()) {
      setToast({ visible: true, message: 'Please enter the applicant name.', type: 'error' });
      return;
    }
    if (!form.contactNumber.trim()) {
      setToast({ visible: true, message: 'Please enter a contact number.', type: 'error' });
      return;
    }

    setSubmitting(true);

    try {
      const existingRaw = await AsyncStorage.getItem('@aurea_benefit_applications');
      const existing = existingRaw ? JSON.parse(existingRaw) : [];

      let application: Record<string, unknown>;

      if (isCheckUp) {
        if (!nearestCenter && checkUpForm.address.trim()) {
          await locateNearestCenter(checkUpForm.address);
        }

        application = {
          id: Date.now(),
          benefit: selectedBenefit,
          benefitId,
          type: 'check-up',
          checkUpDetails: {
            name: checkUpForm.name.trim(),
            age: checkUpForm.age.trim(),
            sex: checkUpForm.sex.trim(),
            address: checkUpForm.address.trim(),
            contactNumber: checkUpForm.contactNumber.trim(),
            emergencyContact: checkUpForm.emergencyContact.trim(),
            relationshipToEmergencyContact: checkUpForm.relationshipToEmergencyContact.trim(),
            existingMedicalCondition: checkUpForm.existingMedicalCondition.trim(),
            currentMedication: checkUpForm.currentMedication.trim(),
            allergies: checkUpForm.allergies.trim(),
            previousMedicalHistory: checkUpForm.previousMedicalHistory.trim(),
            reasonForConsultation: checkUpForm.reasonForConsultation.trim(),
          },
          nearestHealthCenter: nearestCenter,
          createdAt: new Date().toISOString(),
        };
      } else {
        application = {
          id: Date.now(),
          benefit: selectedBenefit,
          benefitId,
          applicantName: form.applicantName.trim(),
          contactNumber: form.contactNumber.trim(),
          amount: form.amount.trim(),
          notes: form.notes.trim(),
          createdAt: new Date().toISOString(),
        };
      }

      await AsyncStorage.setItem('@aurea_benefit_applications', JSON.stringify([...existing, application]));

      setToast({
        visible: true,
        message: isCheckUp ? 'Check-up appointment submitted successfully.' : 'Benefit application submitted successfully.',
        type: 'success',
      });
      setTimeout(() => router.back(), 1200);
    } catch (error) {
      setToast({
        visible: true,
        message: error instanceof Error ? error.message : 'Unable to submit your application right now.',
        type: 'error',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor="#F6F8F2" />
      <Toast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        onHide={() => setToast((prev) => ({ ...prev, visible: false }))}
      />

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.container}
        showsVerticalScrollIndicator={false}
      >
        <View style={s.headerRow}>
          <TouchableOpacity
            style={s.backButton}
            onPress={() => router.back()}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="arrow-back" size={18} color="#132018" />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Apply for benefit</Text>
        </View>

        {!user ? (
          <View style={s.lockCard}>
            <Ionicons name="lock-closed-outline" size={24} color="#1F5C3E" style={{ marginBottom: 10 }} />
            <Text style={s.lockTitle}>Login required</Text>
            <Text style={s.lockText}>Please log in first before applying for any benefit.</Text>
            <TouchableOpacity
              style={s.lockButton}
              onPress={() => router.replace('/login')}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Go to login"
            >
              <Text style={s.lockButtonText}>Go to Login</Text>
            </TouchableOpacity>
          </View>
        ) : (
        <View style={s.card}>
          <Text style={s.label}>Selected benefit</Text>
          <View style={s.selectedPill}>
            <Ionicons name="gift-outline" size={16} color="#1F5C3E" />
            <Text style={s.selectedText}>{selectedBenefit}</Text>
          </View>

          {isCheckUp ? (
            <>
              <Text style={s.formCaption}>Personal Information</Text>
              <View style={s.fieldRow}>
                <Text style={s.label}>Name</Text>
                <TextInput
                  style={FIELD_STYLE}
                  value={checkUpForm.name}
                  onChangeText={(value) => updateCheckUpField('name', value)}
                  placeholder="Juan Dela Cruz"
                  placeholderTextColor="#71857A"
                />
              </View>

              <View style={s.doubleRow}>
                <View style={s.doubleCol}>
                  <Text style={s.label}>Age</Text>
                  <TextInput
                    style={FIELD_STYLE}
                    value={checkUpForm.age}
                    onChangeText={(value) => updateCheckUpField('age', value.replace(/[^0-9]/g, ''))}
                    keyboardType="numeric"
                    placeholder="65"
                    placeholderTextColor="#71857A"
                  />
                </View>
                <View style={s.doubleCol}>
                  <Text style={s.label}>Sex (Gender)</Text>
                  <TextInput
                    style={FIELD_STYLE}
                    value={checkUpForm.sex}
                    onChangeText={(value) => updateCheckUpField('sex', value)}
                    placeholder="Male / Female"
                    placeholderTextColor="#71857A"
                  />
                </View>
              </View>

              <View style={s.fieldRow}>
                <Text style={s.label}>Address</Text>
                <TextInput
                  style={[FIELD_STYLE, s.textAreaCompact]}
                  value={checkUpForm.address}
                  onChangeText={(value) => updateCheckUpField('address', value)}
                  onEndEditing={() => locateNearestCenter(checkUpForm.address)}
                  multiline
                  textAlignVertical="top"
                  placeholder="House #, Street, Barangay, Pateros"
                  placeholderTextColor="#71857A"
                />
              </View>

              <View style={s.doubleRow}>
                <View style={s.doubleCol}>
                  <Text style={s.label}>Contact Number</Text>
                  <TextInput
                    style={FIELD_STYLE}
                    value={checkUpForm.contactNumber}
                    onChangeText={(value) => updateCheckUpField('contactNumber', value)}
                    keyboardType="phone-pad"
                    placeholder="09XXXXXXXXX"
                    placeholderTextColor="#71857A"
                  />
                </View>
                <View style={s.doubleCol}>
                  <Text style={s.label}>Emergency Contact</Text>
                  <TextInput
                    style={FIELD_STYLE}
                    value={checkUpForm.emergencyContact}
                    onChangeText={(value) => updateCheckUpField('emergencyContact', value)}
                    placeholder="0917XXXXXXX"
                    keyboardType="phone-pad"
                    placeholderTextColor="#71857A"
                  />
                </View>
              </View>

              <View style={s.fieldRow}>
                <Text style={s.label}>Relationship to Emergency Contact</Text>
                <TextInput
                  style={FIELD_STYLE}
                  value={checkUpForm.relationshipToEmergencyContact}
                  onChangeText={(value) => updateCheckUpField('relationshipToEmergencyContact', value)}
                  placeholder="Son / Daughter / Spouse"
                  placeholderTextColor="#71857A"
                />
              </View>

              <Text style={s.formCaption}>Medical Information</Text>
              <View style={s.fieldRow}>
                <Text style={s.label}>Existing Medical Condition</Text>
                <TextInput
                  style={FIELD_STYLE}
                  value={checkUpForm.existingMedicalCondition}
                  onChangeText={(value) => updateCheckUpField('existingMedicalCondition', value)}
                  placeholder="Hypertension, diabetes, etc."
                  placeholderTextColor="#71857A"
                />
              </View>

              <View style={s.fieldRow}>
                <Text style={s.label}>Current Medication</Text>
                <TextInput
                  style={FIELD_STYLE}
                  value={checkUpForm.currentMedication}
                  onChangeText={(value) => updateCheckUpField('currentMedication', value)}
                  placeholder="List your current medication"
                  placeholderTextColor="#71857A"
                />
              </View>

              <View style={s.fieldRow}>
                <Text style={s.label}>Allergies</Text>
                <TextInput
                  style={FIELD_STYLE}
                  value={checkUpForm.allergies}
                  onChangeText={(value) => updateCheckUpField('allergies', value)}
                  placeholder="Food, medicine, or others"
                  placeholderTextColor="#71857A"
                />
              </View>

              <View style={s.fieldRow}>
                <Text style={s.label}>Previous Medical History</Text>
                <TextInput
                  style={[FIELD_STYLE, s.textArea]}
                  value={checkUpForm.previousMedicalHistory}
                  onChangeText={(value) => updateCheckUpField('previousMedicalHistory', value)}
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                  placeholder="Include surgeries, confinement, or major illnesses"
                  placeholderTextColor="#71857A"
                />
              </View>

              <View style={s.fieldRow}>
                <Text style={s.label}>Reason for Consultation / Check-up</Text>
                <TextInput
                  style={[FIELD_STYLE, s.textArea]}
                  value={checkUpForm.reasonForConsultation}
                  onChangeText={(value) => updateCheckUpField('reasonForConsultation', value)}
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                  placeholder="Describe the reason for your check-up"
                  placeholderTextColor="#71857A"
                />
              </View>

              <View style={s.centerCard}>
                <View style={s.centerHeader}>
                  <Text style={s.centerTitle}>Nearest Health Center</Text>
                  <TouchableOpacity
                    style={s.recheckButton}
                    onPress={() => locateNearestCenter(checkUpForm.address)}
                    disabled={locatingCenter}
                    activeOpacity={0.85}
                  >
                    {locatingCenter ? (
                      <ActivityIndicator color="#1F5C3E" size="small" />
                    ) : (
                      <Text style={s.recheckText}>Recheck</Text>
                    )}
                  </TouchableOpacity>
                </View>

                {nearestCenter ? (
                  <>
                    <Text style={s.centerName}>{nearestCenter.name}</Text>
                    <Text style={s.centerAddress}>{nearestCenter.address}</Text>
                    <Text style={s.centerMeta}>
                      {nearestCenter.distanceKm !== null
                        ? `Approx. ${nearestCenter.distanceKm} km away`
                        : 'Located using nearest address match'}
                    </Text>
                  </>
                ) : (
                  <Text style={s.centerAddress}>Enter your address to locate the nearest health center.</Text>
                )}
              </View>
            </>
          ) : isFinancialAid ? (
            <>
              <Text style={s.formCaption}>Birthday Benefits Application</Text>
              <Text style={s.helperText}>Complete the applicant sections below. N/A may be entered where a field does not apply.</Text>

              <Text style={s.formCaption}>A. Personal Information</Text>
              <View style={s.doubleRow}>
                <View style={s.doubleCol}>
                  <Text style={s.label}>OSCA ID number (from Digital ID)</Text>
                  <TextInput
                    style={[FIELD_STYLE, s.readOnlyField]}
                    value={oscaIdNumber}
                    editable={false}
                    placeholder="Digital ID number unavailable"
                    placeholderTextColor="#9A5B13"
                  />
                  {!financialAidForm.oscaIdNumber && (
                    <Text style={s.fieldHint}>Open Digital ID to verify the assigned OSCA number.</Text>
                  )}
                </View>
              </View>

              <View style={s.doubleRow}>
                <View style={s.doubleCol}>
                  <Text style={s.label}>Last name *</Text>
                  <TextInput style={FIELD_STYLE} value={financialAidForm.lastName} onChangeText={(value) => updateFinancialAidField('lastName', value)} placeholder="Dela Cruz" placeholderTextColor="#71857A" />
                </View>
                <View style={s.doubleCol}>
                  <Text style={s.label}>Given name *</Text>
                  <TextInput style={FIELD_STYLE} value={financialAidForm.givenName} onChangeText={(value) => updateFinancialAidField('givenName', value)} placeholder="Juan" placeholderTextColor="#71857A" />
                </View>
              </View>

              <View style={s.doubleRow}>
                <View style={s.doubleCol}>
                  <Text style={s.label}>Middle name</Text>
                  <TextInput style={FIELD_STYLE} value={financialAidForm.middleName} onChangeText={(value) => updateFinancialAidField('middleName', value)} placeholder="Optional" placeholderTextColor="#71857A" />
                </View>
                <View style={s.doubleCol}>
                  <Text style={s.label}>Date of birth *</Text>
                  <TextInput
                    style={FIELD_STYLE}
                    value={financialAidForm.dateOfBirth}
                    onChangeText={(value) => {
                      updateFinancialAidField('dateOfBirth', value);
                      updateFinancialAidField('benefitType', classifySeniorBenefit(value));
                    }}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor="#71857A"
                  />
                </View>
              </View>

              <Text style={s.label}>Benefit category based on age</Text>
              <View style={[s.detectedBenefitCard, !displayedBenefitType && s.detectedBenefitCardIneligible]}>
                <Ionicons
                  name={displayedBenefitType ? 'checkmark-circle-outline' : 'alert-circle-outline'}
                  size={20}
                  color={displayedBenefitType ? '#1F5C3E' : '#9A5B13'}
                />
                <Text style={[s.detectedBenefitText, !displayedBenefitType && s.detectedBenefitTextIneligible]}>
                  {displayedBenefitType
                    ? `${displayedBenefitType} benefit - applicant is age ${displayedAge}.`
                    : displayedAge
                      ? `No qualifying benefit - applicant is age ${displayedAge}. Minimum age is 80.`
                      : 'Enter a valid date of birth to determine the benefit category.'}
                </Text>
              </View>

              <View style={s.fieldRow}>
                <Text style={s.label}>Residential address abroad</Text>
                <TextInput style={[FIELD_STYLE, s.textAreaCompact]} value={financialAidForm.residentialAddress} onChangeText={(value) => updateFinancialAidField('residentialAddress', value)} multiline textAlignVertical="top" placeholder="House number, street, city, province, zip code" placeholderTextColor="#71857A" />
              </View>
              <View style={s.fieldRow}>
                <Text style={s.label}>Permanent address in the Philippines *</Text>
                <TextInput style={[FIELD_STYLE, s.textAreaCompact]} value={financialAidForm.permanentAddressPhilippines} onChangeText={(value) => updateFinancialAidField('permanentAddressPhilippines', value)} multiline textAlignVertical="top" placeholder="House number, street, barangay, city, province, zip code" placeholderTextColor="#71857A" />
              </View>

              <View style={s.doubleRow}>
                <View style={s.doubleCol}>
                  <Text style={s.label}>Sex</Text>
                  <TextInput style={FIELD_STYLE} value={financialAidForm.sex} onChangeText={(value) => updateFinancialAidField('sex', value)} placeholder="Male / Female" placeholderTextColor="#71857A" />
                </View>
                <View style={s.doubleCol}>
                  <Text style={s.label}>Civil status</Text>
                  <TextInput style={FIELD_STYLE} value={financialAidForm.civilStatus} onChangeText={(value) => updateFinancialAidField('civilStatus', value)} placeholder="Single / Married" placeholderTextColor="#71857A" />
                </View>
              </View>

              <View style={s.fieldRow}>
                <Text style={s.label}>Citizenship</Text>
                <TextInput style={FIELD_STYLE} value={financialAidForm.citizenship} onChangeText={(value) => updateFinancialAidField('citizenship', value)} placeholder="Filipino" placeholderTextColor="#71857A" />
              </View>
              <TouchableOpacity style={s.checkboxRow} onPress={() => updateFinancialAidField('isDualCitizen', !financialAidForm.isDualCitizen)} activeOpacity={0.8}>
                <Ionicons name={financialAidForm.isDualCitizen ? 'checkbox' : 'square-outline'} size={22} color="#1F5C3E" />
                <Text style={s.checkboxText}>Dual citizen</Text>
              </TouchableOpacity>
              {financialAidForm.isDualCitizen && (
                <View style={s.fieldRow}>
                  <Text style={s.label}>Dual citizenship details</Text>
                  <TextInput style={FIELD_STYLE} value={financialAidForm.dualCitizenshipDetails} onChangeText={(value) => updateFinancialAidField('dualCitizenshipDetails', value)} placeholder="Indicate details" placeholderTextColor="#71857A" />
                </View>
              )}

              <Text style={s.formCaption}>Documentary Requirements</Text>
              <Text style={s.helperText}>A full-body picture is required. An endorsement document may be attached if available.</Text>
              <View style={s.attachmentActions}>
                <TouchableOpacity style={s.attachmentButton} onPress={() => chooseBenefitAttachment('fullBody', 'camera')} activeOpacity={0.85}>
                  <Ionicons name="camera-outline" size={18} color="#1F5C3E" />
                  <Text style={s.attachmentButtonText}>Capture full-body</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.attachmentButton} onPress={() => chooseBenefitAttachment('fullBody', 'library')} activeOpacity={0.85}>
                  <Ionicons name="image-outline" size={18} color="#1F5C3E" />
                  <Text style={s.attachmentButtonText}>Attach picture</Text>
                </TouchableOpacity>
              </View>
              <AttachmentStatus label="Full-body picture" attached={fullBodyPictureSubmitted} />
              <View style={s.attachmentActions}>
                <TouchableOpacity style={s.attachmentButton} onPress={() => chooseBenefitAttachment('endorsedList', 'camera')} activeOpacity={0.85}>
                  <Ionicons name="camera-outline" size={18} color="#1F5C3E" />
                  <Text style={s.attachmentButtonText}>Capture endorsement</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.attachmentButton} onPress={() => chooseBenefitAttachment('endorsedList', 'library')} activeOpacity={0.85}>
                  <Ionicons name="document-attach-outline" size={18} color="#1F5C3E" />
                  <Text style={s.attachmentButtonText}>Attach endorsement</Text>
                </TouchableOpacity>
              </View>
              <AttachmentStatus label="Endorsed list document" attached={endorsedListSubmitted} />

              <Text style={s.formCaption}>B. Family Information</Text>
              <View style={s.doubleRow}>
                <View style={s.doubleCol}>
                  <Text style={s.label}>Name of spouse</Text>
                  <TextInput style={FIELD_STYLE} value={financialAidForm.spouseName} onChangeText={(value) => updateFinancialAidField('spouseName', value)} placeholder="Full name" placeholderTextColor="#71857A" />
                </View>
                <View style={s.doubleCol}>
                  <Text style={s.label}>Spouse citizenship</Text>
                  <TextInput style={FIELD_STYLE} value={financialAidForm.spouseCitizenship} onChangeText={(value) => updateFinancialAidField('spouseCitizenship', value)} placeholder="Optional" placeholderTextColor="#71857A" />
                </View>
              </View>

              <Text style={s.formCaption}>B.3 Name of Children</Text>
              {profileChildren.length > 0 ? (
                <View style={s.childrenList}>
                  {profileChildren.map((child, index) => (
                    <View key={child.id || `${child.name}-${index}`} style={s.childDisplayRow}>
                      <View style={s.childDisplayNumber}>
                        <Text style={s.childDisplayNumberText}>{index + 1}</Text>
                      </View>
                      <View style={s.childDisplayInfo}>
                        <Text style={s.childDisplayName}>{child.name || 'Unnamed child'}</Text>
                        {child.dob ? <Text style={s.childDisplayDob}>Date of birth: {child.dob}</Text> : null}
                      </View>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={s.noChildrenBenefitText}>No children recorded in the profile.</Text>
              )}

              <Text style={s.formCaption}>Authorized representative</Text>
              <View style={s.doubleRow}>
                <View style={s.doubleCol}>
                  <Text style={s.label}>Representative name</Text>
                  <TextInput style={FIELD_STYLE} value={financialAidForm.representativeName} onChangeText={(value) => updateFinancialAidField('representativeName', value)} placeholder="Full name" placeholderTextColor="#71857A" />
                </View>
                <View style={s.doubleCol}>
                  <Text style={s.label}>Relationship</Text>
                  <TextInput style={FIELD_STYLE} value={financialAidForm.representativeRelationship} onChangeText={(value) => updateFinancialAidField('representativeRelationship', value)} placeholder="Son / Daughter" placeholderTextColor="#71857A" />
                </View>
              </View>

              <Text style={s.formCaption}>C. Contact Information</Text>
              <View style={s.doubleRow}>
                <View style={s.doubleCol}>
                  <Text style={s.label}>Contact number *</Text>
                  <TextInput style={FIELD_STYLE} value={financialAidForm.contactNumber} onChangeText={(value) => updateFinancialAidField('contactNumber', value)} keyboardType="phone-pad" placeholder="09XXXXXXXXX" placeholderTextColor="#71857A" />
                </View>
                <View style={s.doubleCol}>
                  <Text style={s.label}>Email address *</Text>
                  <TextInput style={FIELD_STYLE} value={financialAidForm.emailAddress} onChangeText={(value) => updateFinancialAidField('emailAddress', value)} keyboardType="email-address" autoCapitalize="none" placeholder="name@email.com" placeholderTextColor="#71857A" />
                </View>
              </View>

              <Text style={s.formCaption}>D. Applicant Confirmation</Text>
              <Text style={s.helperText}>I certify that the information provided is true and correct.</Text>
              <View style={s.fieldRow}>
                <Text style={s.label}>Name and signature / thumbmark of applicant</Text>
                <TextInput style={FIELD_STYLE} value={financialAidForm.applicantSignature} onChangeText={(value) => updateFinancialAidField('applicantSignature', value)} placeholder="Type your full name as confirmation" placeholderTextColor="#71857A" />
              </View>
            </>
          ) : (
            <>

              <View style={s.fieldRow}>
                <Text style={s.label}>Applicant name</Text>
                <TextInput
                  style={FIELD_STYLE}
                  value={form.applicantName}
                  onChangeText={(value) => updateField('applicantName', value)}
                  placeholder="Juan Dela Cruz"
                  placeholderTextColor="#71857A"
                />
              </View>

              <View style={s.fieldRow}>
                <Text style={s.label}>Contact number</Text>
                <TextInput
                  style={FIELD_STYLE}
                  value={form.contactNumber}
                  onChangeText={(value) => updateField('contactNumber', value)}
                  keyboardType="phone-pad"
                  placeholder="09XXXXXXXXX"
                  placeholderTextColor="#71857A"
                />
              </View>

              <View style={s.fieldRow}>
                <Text style={s.label}>Amount needed (optional)</Text>
                <TextInput
                  style={FIELD_STYLE}
                  value={form.amount}
                  onChangeText={(value) => updateField('amount', value)}
                  keyboardType="numeric"
                  placeholder="5000"
                  placeholderTextColor="#71857A"
                />
              </View>

              <View style={s.fieldRow}>
                <Text style={s.label}>Additional details</Text>
                <TextInput
                  style={[FIELD_STYLE, s.textArea]}
                  value={form.notes}
                  onChangeText={(value) => updateField('notes', value)}
                  multiline
                  numberOfLines={5}
                  textAlignVertical="top"
                  placeholder="Tell us more about your request..."
                  placeholderTextColor="#71857A"
                />
              </View>
            </>
          )}

          <TouchableOpacity
            style={[
              s.submitButton,
              (submitting || (isFinancialAid && !displayedBenefitType)) && s.submitButtonDisabled,
            ]}
            onPress={handleSubmit}
            activeOpacity={0.9}
            disabled={submitting || (isFinancialAid && !displayedBenefitType)}
          >
            {submitting ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={s.submitText}>Submit application</Text>
            )}
          </TouchableOpacity>
        </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#F6F8F2',
  },
  scroll: {
    flex: 1,
    backgroundColor: '#F6F8F2',
  },
  container: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? 12 : 8,
    paddingBottom: 32,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 18,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EAF0E4',
  },
  headerTitle: {
    fontFamily: 'FraunTitle',
    fontSize: 24,
    color: '#132018',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#DCE7D8',
    padding: 20,
    ...Platform.select({
      ios: {
        shadowColor: '#132018',
        shadowOpacity: 0.08,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 4 },
      },
      android: { elevation: 4 },
    }),
  },
  lockCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#DCE7D8',
    padding: 20,
  },
  lockTitle: {
    fontFamily: 'InterBody',
    fontWeight: '700',
    fontSize: 20,
    color: '#132018',
    marginBottom: 6,
  },
  lockText: {
    fontFamily: 'InterBody',
    fontSize: 14,
    lineHeight: 20,
    color: '#3E5246',
    marginBottom: 14,
  },
  lockButton: {
    backgroundColor: '#1F5C3E',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  lockButtonText: {
    color: '#FFFFFF',
    fontFamily: 'InterBody',
    fontWeight: '700',
    fontSize: 14,
  },
  label: {
    fontFamily: 'InterBody',
    fontWeight: '700',
    fontSize: 13,
    letterSpacing: 0.3,
    color: '#3E5246',
    marginBottom: 8,
  },
  selectedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#E3F2E8',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 18,
  },
  selectedText: {
    color: '#1F5C3E',
    fontFamily: 'InterBody',
    fontWeight: '700',
    fontSize: 14,
    flexShrink: 1,
  },
  fieldRow: {
    marginBottom: 16,
  },
  doubleRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  doubleCol: {
    flex: 1,
  },
  formCaption: {
    fontFamily: 'InterBody',
    fontWeight: '700',
    fontSize: 15,
    color: '#1F5C3E',
    marginBottom: 10,
    marginTop: 4,
  },
  helperText: {
    fontFamily: 'InterBody',
    fontSize: 13,
    lineHeight: 19,
    color: '#597265',
    marginBottom: 14,
  },
  readOnlyField: {
    backgroundColor: '#F1F5EF',
    color: '#597265',
  },
  fieldHint: {
    fontFamily: 'InterBody',
    fontSize: 11,
    lineHeight: 15,
    color: '#9A5B13',
    marginTop: -8,
    marginBottom: 8,
  },
  detectedBenefitCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#B9D4C2',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#F1F8F2',
    marginBottom: 16,
  },
  detectedBenefitCardIneligible: {
    borderColor: '#E6C58E',
    backgroundColor: '#FFF8EC',
  },
  detectedBenefitText: {
    fontFamily: 'InterBody',
    fontWeight: '700',
    fontSize: 13,
    color: '#1F5C3E',
    flex: 1,
  },
  detectedBenefitTextIneligible: {
    color: '#9A5B13',
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  checkboxText: {
    fontFamily: 'InterBody',
    fontSize: 14,
    color: '#132018',
  },
  attachmentActions: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    marginBottom: 4,
  },
  attachmentButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#B9D4C2',
    borderRadius: 10,
    backgroundColor: '#F1F8F2',
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  attachmentButtonText: {
    fontFamily: 'InterBody',
    fontWeight: '700',
    fontSize: 12,
    color: '#1F5C3E',
  },
  attachmentStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
    marginBottom: 8,
  },
  attachmentStatusRowAttached: {
    backgroundColor: '#E3F2E8',
  },
  attachmentStatusRowMissing: {
    backgroundColor: '#FFF8EC',
  },
  attachmentStatusText: {
    fontFamily: 'InterBody',
    fontWeight: '700',
    fontSize: 12,
    color: '#1F5C3E',
  },
  attachmentStatusTextMissing: {
    color: '#9A5B13',
  },
  childrenList: {
    borderWidth: 1,
    borderColor: '#DCE7D8',
    borderRadius: 14,
    padding: 10,
    backgroundColor: '#F8FCF9',
    marginBottom: 16,
  },
  childDisplayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E5EEE3',
  },
  childDisplayNumber: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E3F2E8',
  },
  childDisplayNumberText: {
    fontFamily: 'InterBody',
    fontWeight: '700',
    fontSize: 12,
    color: '#1F5C3E',
  },
  childDisplayInfo: {
    flex: 1,
  },
  childDisplayName: {
    fontFamily: 'InterBody',
    fontWeight: '700',
    fontSize: 14,
    color: '#132018',
  },
  childDisplayDob: {
    fontFamily: 'InterBody',
    fontSize: 12,
    color: '#597265',
    marginTop: 2,
  },
  noChildrenBenefitText: {
    fontFamily: 'InterBody',
    fontSize: 13,
    color: '#71857A',
    marginBottom: 16,
  },
  textArea: {
    minHeight: 110,
    paddingTop: 12,
  },
  textAreaCompact: {
    minHeight: 76,
    paddingTop: 12,
  },
  centerCard: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#DCE7D8',
    borderRadius: 16,
    padding: 14,
    backgroundColor: '#F8FCF9',
  },
  centerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  centerTitle: {
    fontFamily: 'InterBody',
    fontWeight: '700',
    fontSize: 13,
    color: '#1F5C3E',
  },
  recheckButton: {
    borderWidth: 1,
    borderColor: '#B9D4C2',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#FFFFFF',
    minWidth: 70,
    alignItems: 'center',
  },
  recheckText: {
    fontFamily: 'InterBody',
    fontWeight: '700',
    fontSize: 12,
    color: '#1F5C3E',
  },
  centerName: {
    fontFamily: 'InterBody',
    fontWeight: '700',
    fontSize: 14,
    color: '#132018',
    marginBottom: 3,
  },
  centerAddress: {
    fontFamily: 'InterBody',
    fontSize: 13,
    lineHeight: 19,
    color: '#3E5246',
  },
  centerMeta: {
    fontFamily: 'InterBody',
    fontSize: 12,
    color: '#597265',
    marginTop: 5,
  },
  submitButton: {
    marginTop: 8,
    backgroundColor: '#1F5C3E',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitText: {
    color: '#FFFFFF',
    fontFamily: 'InterBody',
    fontWeight: '700',
    fontSize: 16,
  },
});
