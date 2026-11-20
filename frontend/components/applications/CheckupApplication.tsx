import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text, TextInput } from '../AppText';
import { useAuth } from '../../context/AuthContext';
import { getUser } from '../../lib/authApi';
import ApplicationLayout, { calculateAgeFromDob, FIELD_STYLE, s, type ApplicationToast } from './ApplicationLayout';
import { useFocusEffect } from 'expo-router';
import {
  appointmentStatus,
  appointmentTime,
  checkupRequest,
  type Appointment,
  type HealthCenter,
} from '../../services/checkupApi';

export default function CheckupApplication() {
  const { user } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<ApplicationToast>({ visible: false, message: '', type: 'error' });
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
  const [checkup, setCheckup] = useState<{ appointment: Appointment | null; centers: HealthCenter[] } | null>(null);
  const [centerId, setCenterId] = useState('');
  const [checkupError, setCheckupError] = useState('');
  const [refreshCheckup, setRefreshCheckup] = useState(0);
  const token = user?.token;

  useFocusEffect(
    useCallback(() => {
      if (!token) return;
      const controller = new AbortController();
      setCheckupError('');
      checkupRequest<{ appointment: Appointment | null; centers: HealthCenter[] }>(
        token,
        '',
        'GET',
        undefined,
        controller.signal,
      )
        .then((result) => {
          if (!controller.signal.aborted) setCheckup(result);
        })
        .catch((error) => {
          if (!controller.signal.aborted)
            setCheckupError(error instanceof TypeError ? 'Hindi makakonekta. Subukan ulit.' : error.message);
        });
      return () => controller.abort();
      // A refresh also reloads the focused screen.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token, refreshCheckup]),
  );

  const appointment = checkup?.appointment;
  const activeAppointment = appointment?.status === 'Pending' || appointment?.status === 'Confirmed';
  const updateCheckUpField = (key: keyof typeof checkUpForm, value: string) => {
    setCheckUpForm((prev) => ({ ...prev, [key]: value }));
  };

  useEffect(() => {
    if (!user) return;
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
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [user]);

  const handleSubmit = async () => {
    if (!checkUpForm.name.trim()) {
      setToast({ visible: true, message: 'Pakilagay ang pangalan.', type: 'error' });
      return;
    }
    if (!checkUpForm.age.trim()) {
      setToast({ visible: true, message: 'Pakilagay ang edad.', type: 'error' });
      return;
    }
    if (!checkUpForm.sex.trim()) {
      setToast({ visible: true, message: 'Pakilagay ang kasarian.', type: 'error' });
      return;
    }
    if (!checkUpForm.address.trim()) {
      setToast({ visible: true, message: 'Pakilagay ang address.', type: 'error' });
      return;
    }
    if (!checkUpForm.contactNumber.trim()) {
      setToast({ visible: true, message: 'Pakilagay ang contact number.', type: 'error' });
      return;
    }
    if (!checkUpForm.emergencyContact.trim()) {
      setToast({ visible: true, message: 'Pakilagay ang emergency contact.', type: 'error' });
      return;
    }
    if (!checkUpForm.relationshipToEmergencyContact.trim()) {
      setToast({ visible: true, message: 'Pakilagay kung ano ang relasyon mo sa emergency contact.', type: 'error' });
      return;
    }
    if (!checkUpForm.reasonForConsultation.trim()) {
      setToast({ visible: true, message: 'Pakilagay kung bakit ka magpapa-check-up.', type: 'error' });
      return;
    }
    if (!token || !checkup || activeAppointment || submitting) return;
    if (!centerId) {
      setToast({ visible: true, message: 'Piliin ang health center para sa barangay mo.', type: 'error' });
      return;
    }
    setSubmitting(true);
    try {
      const result = await checkupRequest<{ appointment: Appointment }>(token, '', 'POST', {
        ...checkUpForm,
        centerId,
      });
      setCheckup({ ...checkup, appointment: result.appointment });
      setCheckUpForm((current) => ({
        ...current,
        emergencyContact: '',
        relationshipToEmergencyContact: '',
        existingMedicalCondition: '',
        currentMedication: '',
        allergies: '',
        previousMedicalHistory: '',
        reasonForConsultation: '',
      }));
      setToast({
        visible: true,
        message: 'Na-submit na ang check-up request mo. Hintayin ang confirmed schedule.',
        type: 'success',
      });
    } catch (error) {
      setRefreshCheckup((value) => value + 1);
      setToast({
        visible: true,
        message:
          error instanceof TypeError
            ? 'Hindi makakonekta. I-check ang status bago subukan ulit.'
            : error instanceof Error
              ? error.message
              : 'Hindi ma-submit ang check-up request.',
        type: 'error',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ApplicationLayout
      key={appointment?.id ?? 'form'}
      label="Check-up"
      toast={toast}
      hideToast={() => setToast((prev) => ({ ...prev, visible: false }))}
    >
      <View style={styles.centerCard}>
        <Text style={styles.centerTitle} accessibilityLiveRegion="polite">
          {appointment ? appointmentStatus[appointment.status] : 'Request para sa check-up'}
        </Text>
        {appointment && <Text selectable style={styles.centerAddress}>Reference number · {appointment.id}</Text>}
        {appointment && (
          <Text style={styles.centerName}>
            {checkup?.centers.find((center) => center.id === appointment.center_id)?.name}
          </Text>
        )}
        {appointment?.scheduled_at && (
          <Text style={styles.centerAddress}>{appointmentTime(appointment.scheduled_at)}</Text>
        )}
        {!!appointment?.review_note && <Text style={styles.centerAddress}>{appointment.review_note}</Text>}
        <Text style={styles.centerAddress}>
          Hintayin ang confirmed na petsa at oras bago pumunta. Kung first visit mo, magdala ng long brown envelope.
        </Text>
        {!token && <Text style={styles.centerAddress}>Mag-log in ulit para makapag-request.</Text>}
        {!!checkupError && (
          <Text accessibilityRole="alert" style={styles.centerAddress}>
            {checkupError}
          </Text>
        )}
        {token && (
          <TouchableOpacity
            accessibilityRole="button"
            style={styles.recheckButton}
            onPress={() => setRefreshCheckup((value) => value + 1)}
          >
            <Text style={styles.recheckText}>I-refresh ang status</Text>
          </TouchableOpacity>
        )}
      </View>

      {!activeAppointment && checkup && (
        <>
          <Text style={s.formCaption}>Personal na impormasyon</Text>
          <View style={s.fieldRow}>
            <Text style={s.label}>Pangalan</Text>
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
              <Text style={s.label}>Edad</Text>
              <TextInput
                style={FIELD_STYLE}
                value={checkUpForm.age}
                editable={false}
                placeholder="65"
                placeholderTextColor="#71857A"
              />
            </View>
            <View style={s.doubleCol}>
              <Text style={s.label}>Kasarian</Text>
              <TextInput
                style={FIELD_STYLE}
                value={checkUpForm.sex}
                onChangeText={(value) => updateCheckUpField('sex', value)}
                placeholder="Lalaki / Babae"
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
              multiline
              textAlignVertical="top"
              placeholder="Numero ng bahay, kalye, barangay, Pateros"
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
            <Text style={s.label}>Relasyon sa emergency contact</Text>
            <TextInput
              style={FIELD_STYLE}
              value={checkUpForm.relationshipToEmergencyContact}
              onChangeText={(value) => updateCheckUpField('relationshipToEmergencyContact', value)}
              placeholder="Anak / Asawa"
              placeholderTextColor="#71857A"
            />
          </View>

          <Text style={s.formCaption}>Impormasyong medikal</Text>
          <View style={s.fieldRow}>
            <Text style={s.label}>Kasalukuyang kondisyon o sakit</Text>
            <TextInput
              style={FIELD_STYLE}
              value={checkUpForm.existingMedicalCondition}
              onChangeText={(value) => updateCheckUpField('existingMedicalCondition', value)}
              placeholder="Hypertension, diabetes, etc."
              placeholderTextColor="#71857A"
            />
          </View>

          <View style={s.fieldRow}>
            <Text style={s.label}>Mga gamot na iniinom ngayon</Text>
            <TextInput
              style={FIELD_STYLE}
              value={checkUpForm.currentMedication}
              onChangeText={(value) => updateCheckUpField('currentMedication', value)}
              placeholder="Ilista ang mga gamot na iniinom mo"
              placeholderTextColor="#71857A"
            />
          </View>

          <View style={s.fieldRow}>
            <Text style={s.label}>Allergies</Text>
            <TextInput
              style={FIELD_STYLE}
              value={checkUpForm.allergies}
              onChangeText={(value) => updateCheckUpField('allergies', value)}
              placeholder="Pagkain, gamot, o iba pa"
              placeholderTextColor="#71857A"
            />
          </View>

          <View style={s.fieldRow}>
            <Text style={s.label}>Mga dating sakit at treatment</Text>
            <TextInput
              style={[FIELD_STYLE, s.textArea]}
              value={checkUpForm.previousMedicalHistory}
              onChangeText={(value) => updateCheckUpField('previousMedicalHistory', value)}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              placeholder="Isama ang operasyon, pagkaka-confine, o malubhang sakit"
              placeholderTextColor="#71857A"
            />
          </View>

          <View style={s.fieldRow}>
            <Text style={s.label}>Dahilan ng check-up o consultation</Text>
            <TextInput
              style={[FIELD_STYLE, s.textArea]}
              value={checkUpForm.reasonForConsultation}
              onChangeText={(value) => updateCheckUpField('reasonForConsultation', value)}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              placeholder="Ilagay kung bakit ka magpapa-check-up"
              placeholderTextColor="#71857A"
            />
          </View>

          <View style={styles.centerCard}>
            <Text style={styles.centerTitle}>Piliin ang health center para sa barangay mo</Text>
            {checkup?.centers.map((center) => (
              <TouchableOpacity
                key={center.id}
                accessibilityRole="radio"
                accessibilityState={{ checked: centerId === center.id }}
                onPress={() => setCenterId(center.id)}
                style={styles.centerCard}
              >
                <Text style={styles.centerName}>
                  {centerId === center.id ? 'Napili: ' : ''}
                  {center.name}
                </Text>
                <Text style={styles.centerAddress}>{center.area}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}
      {checkup && !activeAppointment && token && (
        <TouchableOpacity
          style={[s.submitButton, submitting && s.submitButtonDisabled]}
          onPress={handleSubmit}
          activeOpacity={0.9}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Text style={s.submitText}>I-submit ang application</Text>
          )}
        </TouchableOpacity>
      )}
    </ApplicationLayout>
  );
}

const styles = StyleSheet.create({
  centerCard: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#DCE7D8',
    borderRadius: 16,
    padding: 14,
    backgroundColor: '#F8FCF9',
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
});
