import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text, TextInput } from '../AppText';
import { useAuth } from '../../context/AuthContext';
import { getUser } from '../../lib/authApi';
import ApplicationLayout, { calculateAgeFromDob, FIELD_STYLE, s, type ApplicationToast } from './ApplicationLayout';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { formatSeniorId } from '../../lib/seniorId';
import { submitOctogenarianBenefitApplication } from '../../services/benefitApi';
import { exportBirthdayBenefitsFormPdf } from '../../services/birthdayBenefitsPdf';

type BenefitAttachment = {
  uri: string;
  base64: string;
  mimeType: string;
};

function classifySeniorBenefit(dob?: string): 'Octogenarian' | 'Nonagenarian' | 'Centenarian' | null {
  const age = Number(calculateAgeFromDob(dob));
  if (!Number.isFinite(age) || age < 80) return null;
  if (age >= 100) return 'Centenarian';
  if (age >= 90) return 'Nonagenarian';
  return 'Octogenarian';
}

function AttachmentStatus({
  label,
  attached,
}: {
  label: string;
  attached: boolean;
}) {
  return (
    <View
      style={[
        styles.attachmentStatusRow,
        attached ? styles.attachmentStatusRowAttached : styles.attachmentStatusRowMissing,
      ]}
    >
      <Ionicons
        name={attached ? 'checkmark-circle' : 'alert-circle-outline'}
        size={19}
        color={attached ? '#1F5C3E' : '#9A5B13'}
      />
      <Text style={[styles.attachmentStatusText, !attached && styles.attachmentStatusTextMissing]}>
        {label}: {attached ? 'Naka-attach na' : 'Kailangan'}
      </Text>
    </View>
  );
}

export default function BirthdayBenefitApplication({
  onBirthdaySubmitted,
}: {
  onBirthdaySubmitted?: (application: any) => void;
}) {
  const { user } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<ApplicationToast>({ visible: false, message: '', type: 'error' });
  const [financialAidForm, setFinancialAidForm] = useState({
    benefitType: classifySeniorBenefit(user?.dob),
    oscaIdNumber: formatSeniorId(user),
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
    spouseName: user?.spouse ?? '',
    spouseCitizenship: '',
    representativeName: '',
    representativeRelationship: '',
    contactNumber: user?.contact ?? '',
    emailAddress: user?.email ?? '',
    applicantSignature: '',
  });
  const [digitalSignature, setDigitalSignature] = useState<string | null>(null);
  const [profileChildren, setProfileChildren] = useState(user?.children ?? []);
  const [fullBodyPicture, setFullBodyPicture] = useState<BenefitAttachment | null>(null);
  const updateFinancialAidField = <Key extends keyof typeof financialAidForm>(
    key: Key,
    value: (typeof financialAidForm)[Key],
  ) => {
    setFinancialAidForm((prev) => ({ ...prev, [key]: value }));
  };

  const chooseFullBodyPhoto = async (source: 'camera' | 'library') => {
    const permission =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setToast({
        visible: true,
        message: `Payagan ang access sa ${source === 'camera' ? 'camera' : 'photo library'} para ma-attach ang dokumento.`,
        type: 'error',
      });
      return;
    }
    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8, base64: true })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8, base64: true });
    const asset = result.canceled ? null : result.assets?.[0];
    if (!asset?.base64) return;

    setFullBodyPicture({
      uri: asset.uri,
      base64: asset.base64,
      mimeType: asset.mimeType ?? 'image/jpeg',
    });
  };

  useEffect(() => {
    if (!user?.id) return;

    let active = true;

    getUser(user.id)
      .then(({ user: profile }) => {
        if (!active) return;

        setFinancialAidForm((prev) => ({
          ...prev,
          lastName: profile.lastName ?? user.lastName,
          givenName: profile.firstName ?? user.firstName,
          middleName: profile.middleName ?? user.middleName ?? '',
          oscaIdNumber: formatSeniorId(user),
          dateOfBirth: profile.dob ?? user.dob ?? '',
          permanentAddressPhilippines: profile.address ?? user.address ?? '',
          sex: profile.gender ?? user.gender ?? '',
          civilStatus: profile.civilStatus ?? user.civilStatus ?? '',
          spouseName: profile.spouse ?? '',
          contactNumber: profile.contact ?? user.contact ?? '',
          emailAddress: profile.email ?? user.email,
        }));
        setProfileChildren(profile.children ?? user.children ?? []);
        setDigitalSignature(profile.digitalSignature || profile.signature || null);
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
  }, [user]);

  const displayedAge = calculateAgeFromDob(financialAidForm.dateOfBirth);
  const displayedBenefitType = classifySeniorBenefit(financialAidForm.dateOfBirth);
  const oscaIdNumber = formatSeniorId(user);
  const fullBodyPictureSubmitted = Boolean(fullBodyPicture);

  const handleExportAnnexAPdf = async () => {
    try {
      await exportBirthdayBenefitsFormPdf({
        user_id: user?.id,
        osca_id_number: oscaIdNumber,
        benefit_type: displayedBenefitType || 'Octogenarian',
        date_of_birth: financialAidForm.dateOfBirth,
        residential_address: financialAidForm.residentialAddress,
        permanent_address_philippines: financialAidForm.permanentAddressPhilippines,
        spouse_name: financialAidForm.spouseName,
        spouse_citizenship: financialAidForm.spouseCitizenship,
        representative_name: financialAidForm.representativeName,
        representative_relationship: financialAidForm.representativeRelationship,
        contact_number: financialAidForm.contactNumber,
        email_address: financialAidForm.emailAddress,
        citizenship: financialAidForm.citizenship,
        is_dual_citizen: financialAidForm.isDualCitizen,
        dual_citizenship_details: financialAidForm.dualCitizenshipDetails,
        birth_certificate_submitted: Boolean(user?.birthcert),
        valid_id_submitted: Boolean(user?.id),
        id_picture_submitted: Boolean(user?.avatarUrl),
        full_body_picture_submitted: fullBodyPictureSubmitted,
        applicant_signature: financialAidForm.applicantSignature,
        applicant_signature_date: new Date().toISOString().slice(0, 10),
        applicant: {
          firstName: financialAidForm.givenName,
          middleName: financialAidForm.middleName,
          lastName: financialAidForm.lastName,
          contact: financialAidForm.contactNumber,
          email: financialAidForm.emailAddress,
          gender: financialAidForm.sex,
          civilStatus: financialAidForm.civilStatus,
          address: financialAidForm.permanentAddressPhilippines,
          children: profileChildren,
          avatarUrl: user?.avatarUrl ?? undefined,
          digitalSignature,
          oscaIdNumber,
        },
      });
    } catch (err) {
      setToast({
        visible: true,
        message: err instanceof Error ? err.message : 'Hindi ma-download ang Annex A PDF.',
        type: 'error',
      });
    }
  };

  const handleSubmit = async () => {
    const detectedBenefitType = displayedBenefitType;
    if (!detectedBenefitType) {
      setToast({
        visible: true,
        message: 'Kailangang edad 80 pataas ang applicant para sa benefit na ito.',
        type: 'error',
      });
      return;
    }

    const requiredFields: [string, string][] = [
      ['unang pangalan', financialAidForm.givenName],
      ['apelyido', financialAidForm.lastName],
      ['petsa ng kapanganakan', financialAidForm.dateOfBirth],
      ['permanenteng address sa Pilipinas', financialAidForm.permanentAddressPhilippines],
      ['contact number', financialAidForm.contactNumber],
      ['email address', financialAidForm.emailAddress],
    ];
    const missingField = requiredFields.find(([, value]) => !value.trim());
    if (missingField) {
      setToast({ visible: true, message: `Pakilagay ang ${missingField[0]}.`, type: 'error' });
      return;
    }

    if (financialAidForm.isDualCitizen && !financialAidForm.dualCitizenshipDetails.trim()) {
      setToast({ visible: true, message: 'Pakilagay ang detalye ng dual citizenship mo.', type: 'error' });
      return;
    }

    if (!fullBodyPicture) {
      setToast({ visible: true, message: 'Kumuha o mag-attach ng full-body photo.', type: 'error' });
      return;
    }
    setSubmitting(true);
    try {
      const result = await submitOctogenarianBenefitApplication({
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
        full_body_picture_base64: fullBodyPicture.base64,
        full_body_picture_mime_type: fullBodyPicture.mimeType,
        applicant_signature: financialAidForm.applicantSignature.trim(),
        applicant_signature_date: new Date().toISOString().slice(0, 10),
      });
      setToast({
        visible: true,
        message: 'Na-submit na ang application mo para sa Birthday Benefits.',
        type: 'success',
      });
      onBirthdaySubmitted?.(result.application);
    } catch (error) {
      setToast({
        visible: true,
        message: error instanceof Error ? error.message : 'Hindi ma-submit ngayon ang application mo. Subukan ulit.',
        type: 'error',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ApplicationLayout
      label="Birthday Benefits"
      toast={toast}
      hideToast={() => setToast((prev) => ({ ...prev, visible: false }))}
    >
      <>
        <Text style={s.formCaption}>Mag-apply para sa Birthday Benefits</Text>
        <Text style={styles.helperText}>
          Sagutan ang mga bahagi sa ibaba. Ilagay ang N/A kung hindi ito applicable sa iyo.
        </Text>

        <Text style={s.formCaption}>A. Personal na impormasyon</Text>
        <View style={s.doubleRow}>
          <View style={s.doubleCol}>
            <Text style={s.label}>OSCA ID number mula sa Digital ID</Text>
            <TextInput
              style={[FIELD_STYLE, styles.readOnlyField]}
              value={oscaIdNumber}
              editable={false}
              placeholder="Wala pang Digital ID number"
              placeholderTextColor="#9A5B13"
            />
            {!financialAidForm.oscaIdNumber && (
              <Text style={styles.fieldHint}>Buksan ang Digital ID para ma-check ang OSCA number mo.</Text>
            )}
          </View>
        </View>

        <View style={s.doubleRow}>
          <View style={s.doubleCol}>
            <Text style={s.label}>Apelyido *</Text>
            <TextInput
              style={FIELD_STYLE}
              value={financialAidForm.lastName}
              onChangeText={(value) => updateFinancialAidField('lastName', value)}
              placeholder="Dela Cruz"
              placeholderTextColor="#71857A"
            />
          </View>
          <View style={s.doubleCol}>
            <Text style={s.label}>Unang pangalan *</Text>
            <TextInput
              style={FIELD_STYLE}
              value={financialAidForm.givenName}
              onChangeText={(value) => updateFinancialAidField('givenName', value)}
              placeholder="Juan"
              placeholderTextColor="#71857A"
            />
          </View>
        </View>

        <View style={s.doubleRow}>
          <View style={s.doubleCol}>
            <Text style={s.label}>Gitnang pangalan</Text>
            <TextInput
              style={FIELD_STYLE}
              value={financialAidForm.middleName}
              onChangeText={(value) => updateFinancialAidField('middleName', value)}
              placeholder="Optional"
              placeholderTextColor="#71857A"
            />
          </View>
          <View style={s.doubleCol}>
            <Text style={s.label}>Petsa ng kapanganakan *</Text>
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

        <Text style={s.label}>Benefit category ayon sa edad</Text>
        <View style={[styles.detectedBenefitCard, !displayedBenefitType && styles.detectedBenefitCardIneligible]}>
          <Ionicons
            name={displayedBenefitType ? 'checkmark-circle-outline' : 'alert-circle-outline'}
            size={20}
            color={displayedBenefitType ? '#1F5C3E' : '#9A5B13'}
          />
          <Text style={[styles.detectedBenefitText, !displayedBenefitType && styles.detectedBenefitTextIneligible]}>
            {displayedBenefitType
              ? `${displayedBenefitType} ang benefit para sa edad na ${displayedAge}.`
              : displayedAge
                ? `Edad ${displayedAge} ang applicant. Kailangan ng edad 80 pataas para sa benefit na ito.`
                : 'Ilagay ang tamang petsa ng kapanganakan para malaman ang benefit category.'}
          </Text>
        </View>

        <View style={s.fieldRow}>
          <Text style={s.label}>Address sa ibang bansa</Text>
          <TextInput
            style={[FIELD_STYLE, s.textAreaCompact]}
            value={financialAidForm.residentialAddress}
            onChangeText={(value) => updateFinancialAidField('residentialAddress', value)}
            multiline
            textAlignVertical="top"
            placeholder="Numero ng bahay, kalye, lungsod, probinsya, ZIP code"
            placeholderTextColor="#71857A"
          />
        </View>
        <View style={s.fieldRow}>
          <Text style={s.label}>Permanenteng address sa Pilipinas *</Text>
          <TextInput
            style={[FIELD_STYLE, s.textAreaCompact]}
            value={financialAidForm.permanentAddressPhilippines}
            onChangeText={(value) => updateFinancialAidField('permanentAddressPhilippines', value)}
            multiline
            textAlignVertical="top"
            placeholder="Numero ng bahay, kalye, barangay, lungsod, probinsya, ZIP code"
            placeholderTextColor="#71857A"
          />
        </View>

        <View style={s.doubleRow}>
          <View style={s.doubleCol}>
            <Text style={s.label}>Kasarian</Text>
            <TextInput
              style={FIELD_STYLE}
              value={financialAidForm.sex}
              onChangeText={(value) => updateFinancialAidField('sex', value)}
              placeholder="Lalaki / Babae"
              placeholderTextColor="#71857A"
            />
          </View>
          <View style={s.doubleCol}>
            <Text style={s.label}>Civil status</Text>
            <TextInput
              style={FIELD_STYLE}
              value={financialAidForm.civilStatus}
              onChangeText={(value) => updateFinancialAidField('civilStatus', value)}
              placeholder="Single / Married"
              placeholderTextColor="#71857A"
            />
          </View>
        </View>

        <View style={s.fieldRow}>
          <Text style={s.label}>Pagkamamamayan</Text>
          <TextInput
            style={FIELD_STYLE}
            value={financialAidForm.citizenship}
            onChangeText={(value) => updateFinancialAidField('citizenship', value)}
            placeholder="Filipino"
            placeholderTextColor="#71857A"
          />
        </View>
        <TouchableOpacity
          style={styles.checkboxRow}
          onPress={() => updateFinancialAidField('isDualCitizen', !financialAidForm.isDualCitizen)}
          activeOpacity={0.8}
        >
          <Ionicons name={financialAidForm.isDualCitizen ? 'checkbox' : 'square-outline'} size={22} color="#1F5C3E" />
          <Text style={styles.checkboxText}>May dual citizenship</Text>
        </TouchableOpacity>
        {financialAidForm.isDualCitizen && (
          <View style={s.fieldRow}>
            <Text style={s.label}>Detalye ng dual citizenship</Text>
            <TextInput
              style={FIELD_STYLE}
              value={financialAidForm.dualCitizenshipDetails}
              onChangeText={(value) => updateFinancialAidField('dualCitizenshipDetails', value)}
              placeholder="Ilagay ang detalye"
              placeholderTextColor="#71857A"
            />
          </View>
        )}

        <Text style={s.formCaption}>Mga kailangang dokumento</Text>
        <Text style={styles.helperText}>Kailangan ang full-body photo.</Text>
        <View style={styles.attachmentActions}>
          <TouchableOpacity
            style={styles.attachmentButton}
            onPress={() => chooseFullBodyPhoto('camera')}
            activeOpacity={0.85}
          >
            <Ionicons name="camera-outline" size={18} color="#1F5C3E" />
            <Text style={styles.attachmentButtonText}>Kumuha ng full-body photo</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.attachmentButton}
            onPress={() => chooseFullBodyPhoto('library')}
            activeOpacity={0.85}
          >
            <Ionicons name="image-outline" size={18} color="#1F5C3E" />
            <Text style={styles.attachmentButtonText}>I-attach ang litrato</Text>
          </TouchableOpacity>
        </View>
        <AttachmentStatus label="Full-body picture" attached={fullBodyPictureSubmitted} />

        <Text style={s.formCaption}>B. Impormasyon ng pamilya</Text>
        <View style={s.doubleRow}>
          <View style={s.doubleCol}>
            <Text style={s.label}>Pangalan ng asawa</Text>
            <TextInput
              style={FIELD_STYLE}
              value={financialAidForm.spouseName}
              onChangeText={(value) => updateFinancialAidField('spouseName', value)}
              placeholder="Buong pangalan"
              placeholderTextColor="#71857A"
            />
          </View>
          <View style={s.doubleCol}>
            <Text style={s.label}>Pagkamamamayan ng asawa</Text>
            <TextInput
              style={FIELD_STYLE}
              value={financialAidForm.spouseCitizenship}
              onChangeText={(value) => updateFinancialAidField('spouseCitizenship', value)}
              placeholder="Optional"
              placeholderTextColor="#71857A"
            />
          </View>
        </View>

        <Text style={s.formCaption}>B.3 Mga pangalan ng anak</Text>
        {profileChildren.length > 0 ? (
          <View style={styles.childrenList}>
            {profileChildren.map((child, index) => (
              <View key={child.id || `${child.name}-${index}`} style={styles.childDisplayRow}>
                <View style={styles.childDisplayNumber}>
                  <Text style={styles.childDisplayNumberText}>{index + 1}</Text>
                </View>
                <View style={styles.childDisplayInfo}>
                  <Text style={styles.childDisplayName}>{child.name || 'Walang nakalagay na pangalan'}</Text>
                  {child.dob ? <Text style={styles.childDisplayDob}>Petsa ng kapanganakan: {child.dob}</Text> : null}
                </View>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.noChildrenBenefitText}>Walang nakalistang anak sa profile.</Text>
        )}

        <Text style={s.formCaption}>Awtorisadong representative</Text>
        <View style={s.doubleRow}>
          <View style={s.doubleCol}>
            <Text style={s.label}>Pangalan ng representative</Text>
            <TextInput
              style={FIELD_STYLE}
              value={financialAidForm.representativeName}
              onChangeText={(value) => updateFinancialAidField('representativeName', value)}
              placeholder="Buong pangalan"
              placeholderTextColor="#71857A"
            />
          </View>
          <View style={s.doubleCol}>
            <Text style={s.label}>Relasyon sa applicant</Text>
            <TextInput
              style={FIELD_STYLE}
              value={financialAidForm.representativeRelationship}
              onChangeText={(value) => updateFinancialAidField('representativeRelationship', value)}
              placeholder="Anak"
              placeholderTextColor="#71857A"
            />
          </View>
        </View>

        <Text style={s.formCaption}>C. Detalye ng contact</Text>
        <View style={s.doubleRow}>
          <View style={s.doubleCol}>
            <Text style={s.label}>Contact number *</Text>
            <TextInput
              style={FIELD_STYLE}
              value={financialAidForm.contactNumber}
              onChangeText={(value) => updateFinancialAidField('contactNumber', value)}
              keyboardType="phone-pad"
              placeholder="09XXXXXXXXX"
              placeholderTextColor="#71857A"
            />
          </View>
          <View style={s.doubleCol}>
            <Text style={s.label}>Email address *</Text>
            <TextInput
              style={FIELD_STYLE}
              value={financialAidForm.emailAddress}
              onChangeText={(value) => updateFinancialAidField('emailAddress', value)}
              keyboardType="email-address"
              autoCapitalize="none"
              placeholder="name@email.com"
              placeholderTextColor="#71857A"
            />
          </View>
        </View>

        <Text style={s.formCaption}>D. Kumpirmasyon ng applicant</Text>
        <Text style={styles.helperText}>Kinukumpirma kong totoo at tama ang impormasyong inilagay ko.</Text>
        <View style={s.fieldRow}>
          <Text style={s.label}>Pangalan at pirma o thumbmark ng applicant</Text>
          <TextInput
            style={FIELD_STYLE}
            value={financialAidForm.applicantSignature}
            onChangeText={(value) => updateFinancialAidField('applicantSignature', value)}
            placeholder="I-type ang buong pangalan mo bilang kumpirmasyon"
            placeholderTextColor="#71857A"
          />
        </View>
      </>
      <TouchableOpacity
        style={[s.submitButton, (submitting || !displayedBenefitType) && s.submitButtonDisabled]}
        onPress={handleSubmit}
        activeOpacity={0.9}
        disabled={submitting || !displayedBenefitType}
      >
        {submitting ? (
          <ActivityIndicator color="#FFFFFF" size="small" />
        ) : (
          <Text style={s.submitText}>I-submit ang application</Text>
        )}
      </TouchableOpacity>
      <TouchableOpacity style={styles.exportPdfButton} onPress={handleExportAnnexAPdf} activeOpacity={0.85}>
        <Ionicons name="document-text-outline" size={18} color="#1F5C3E" />
        <Text style={styles.exportPdfButtonText}>I-download o i-print ang Annex &quot;A&quot; Form (PDF)</Text>
      </TouchableOpacity>
    </ApplicationLayout>
  );
}

const styles = StyleSheet.create({
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
  exportPdfButton: {
    marginTop: 10,
    backgroundColor: '#DCEFE3',
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#B7DEC7',
  },
  exportPdfButtonText: {
    fontFamily: 'InterBody',
    fontSize: 14,
    fontWeight: '700',
    color: '#0F3323',
  },
});
