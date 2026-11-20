import React, { useState } from 'react';
import { ActivityIndicator, TouchableOpacity, View } from 'react-native';
import { Text, TextInput } from '../AppText';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../../context/AuthContext';
import ApplicationLayout, { FIELD_STYLE, s, type ApplicationToast } from './ApplicationLayout';

export default function GeneralBenefitApplication({
  benefitId,
  selectedBenefit,
  label,
}: {
  benefitId?: string;
  selectedBenefit: string;
  label: string;
}) {
  const { user } = useAuth();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [savedRequestId, setSavedRequestId] = useState<number | null>(null);
  const [toast, setToast] = useState<ApplicationToast>({ visible: false, message: '', type: 'error' });
  const [form, setForm] = useState({
    applicantName: user ? `${user.firstName} ${user.lastName}`.trim() : '',
    contactNumber: user?.contact ?? '',
    amount: '',
    notes: '',
  });
  const updateField = (key: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async () => {
    if (!form.applicantName.trim()) {
      setToast({ visible: true, message: 'Pakilagay ang pangalan ng applicant.', type: 'error' });
      return;
    }
    if (!form.contactNumber.trim()) {
      setToast({ visible: true, message: 'Pakilagay ang contact number.', type: 'error' });
      return;
    }

    setSubmitting(true);

    try {
      const existingRaw = await AsyncStorage.getItem('@aurea_benefit_applications');
      const existing = existingRaw ? JSON.parse(existingRaw) : [];

      const application = {
        id: Date.now(),
        benefit: selectedBenefit,
        benefitId,
        applicantName: form.applicantName.trim(),
        contactNumber: form.contactNumber.trim(),
        amount: form.amount.trim(),
        notes: form.notes.trim(),
        createdAt: new Date().toISOString(),
      };

      await AsyncStorage.setItem('@aurea_benefit_applications', JSON.stringify([...existing, application]));

      setSavedRequestId(application.id);
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

  if (savedRequestId !== null) {
    return (
      <ApplicationLayout key="saved-request" label={label} toast={toast} hideToast={() => setToast((prev) => ({ ...prev, visible: false }))}>
        <Text style={s.formCaption} accessibilityRole="alert">Naka-save na ang request mo sa device na ito.</Text>
        <Text selectable style={s.label}>Local reference · {savedRequestId}</Text>
        <TouchableOpacity style={s.submitButton} accessibilityRole="button" onPress={() => router.back()}>
          <Text style={s.submitText}>Tapos na</Text>
        </TouchableOpacity>
      </ApplicationLayout>
    );
  }

  return (
    <ApplicationLayout label={label} toast={toast} hideToast={() => setToast((prev) => ({ ...prev, visible: false }))}>
      <>
        <View style={s.fieldRow}>
          <Text style={s.label}>Pangalan ng applicant</Text>
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
          <Text style={s.label}>Halagang kailangan (optional)</Text>
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
          <Text style={s.label}>Iba pang detalye</Text>
          <TextInput
            style={[FIELD_STYLE, s.textArea]}
            value={form.notes}
            onChangeText={(value) => updateField('notes', value)}
            multiline
            numberOfLines={5}
            textAlignVertical="top"
            placeholder="Magbigay ng dagdag na detalye tungkol sa request mo…"
            placeholderTextColor="#71857A"
          />
        </View>
      </>
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
    </ApplicationLayout>
  );
}
