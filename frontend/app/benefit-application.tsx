import React, { useMemo, useState } from 'react';
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
import { useLocalSearchParams, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../context/AuthContext';
import Toast from '../components/Toast';

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
  const params = useLocalSearchParams<{ benefit?: string }>();
  const { user } = useAuth();

  const selectedBenefit = useMemo(() => {
    const value = typeof params.benefit === 'string' ? params.benefit : 'benefit request';
    return value.replace(/\s+/g, ' ').trim();
  }, [params.benefit]);

  const [form, setForm] = useState({
    applicantName: user ? `${user.firstName} ${user.lastName}`.trim() : '',
    contactNumber: user?.contact ?? '',
    amount: '',
    notes: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' as 'success' | 'error' });

  const updateField = (key: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async () => {
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

      const application = {
        id: Date.now(),
        benefit: selectedBenefit,
        applicantName: form.applicantName.trim(),
        contactNumber: form.contactNumber.trim(),
        amount: form.amount.trim(),
        notes: form.notes.trim(),
        createdAt: new Date().toISOString(),
      };

      await AsyncStorage.setItem('@aurea_benefit_applications', JSON.stringify([...existing, application]));

      setToast({ visible: true, message: 'Benefit application submitted successfully.', type: 'success' });
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

        <View style={s.card}>
          <Text style={s.label}>Selected benefit</Text>
          <View style={s.selectedPill}>
            <Ionicons name="gift-outline" size={16} color="#1F5C3E" />
            <Text style={s.selectedText}>{selectedBenefit}</Text>
          </View>

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

          <TouchableOpacity
            style={[s.submitButton, submitting && s.submitButtonDisabled]}
            onPress={handleSubmit}
            activeOpacity={0.9}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={s.submitText}>Submit application</Text>
            )}
          </TouchableOpacity>
        </View>
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
  textArea: {
    minHeight: 110,
    paddingTop: 12,
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
