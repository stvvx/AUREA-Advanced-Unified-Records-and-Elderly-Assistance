import React from 'react';
import { Platform, ScrollView, StatusBar, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from '../AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import Toast from '../Toast';

export function calculateAgeFromDob(dob?: string): string {
  if (!dob) return '';

  const normalizedDob = dob.trim();
  const match = normalizedDob.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const slashMatch = normalizedDob.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match && !slashMatch) return '';

  const year = Number(match?.[1] ?? slashMatch?.[3]);
  const month = Number(match?.[2] ?? slashMatch?.[1]);
  const day = Number(match?.[3] ?? slashMatch?.[2]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
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

export const FIELD_STYLE = {
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

export type ApplicationToast = { visible: boolean; message: string; type: 'success' | 'error' };

export default function ApplicationLayout({
  label,
  toast,
  hideToast,
  children,
}: {
  label: string;
  toast: ApplicationToast;
  hideToast: () => void;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { user } = useAuth();
  const isSenior = Number(calculateAgeFromDob(user?.dob)) >= 60;
  if (!user || !isSenior) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#F6F8F2' }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Text style={{ fontSize: 22, fontWeight: '700', color: '#132018', textAlign: 'center', marginBottom: 8 }}>
            Para sa senior citizens
          </Text>
          <Text style={{ fontSize: 15, color: '#3E5246', textAlign: 'center', marginBottom: 20 }}>
            Para sa edad 60 pataas ang senior citizen services.
          </Text>
          <TouchableOpacity
            style={{ backgroundColor: '#1F5C3E', borderRadius: 10, paddingHorizontal: 20, paddingVertical: 12 }}
            onPress={() => router.back()}
          >
            <Text style={{ fontSize: 15, fontWeight: '700', color: '#FFFFFF' }}>Bumalik</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <StatusBar barStyle="dark-content" />
      <Toast visible={toast.visible} message={toast.message} type={toast.type} onHide={hideToast} />

      <ScrollView style={s.scroll} contentContainerStyle={s.container} showsVerticalScrollIndicator={false}>
        <View style={s.headerRow}>
          <TouchableOpacity
            style={s.backButton}
            onPress={() => router.back()}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Bumalik"
          >
            <Ionicons name="arrow-back" size={18} color="#132018" />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Mag-apply para sa benefit</Text>
        </View>

        {!user ? (
          <View style={s.lockCard}>
            <Ionicons name="lock-closed-outline" size={24} color="#1F5C3E" style={{ marginBottom: 10 }} />
            <Text style={s.lockTitle}>Kailangang mag-log in</Text>
            <Text style={s.lockText}>Mag-log in muna bago mag-apply para sa benefit.</Text>
            <TouchableOpacity
              style={s.lockButton}
              onPress={() => router.replace('/login')}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Mag-log in"
            >
              <Text style={s.lockButtonText}>Mag-log in</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={s.card}>
            <Text style={s.label}>Napiling benefit</Text>
            <View style={s.selectedPill}>
              <Ionicons name="gift-outline" size={16} color="#1F5C3E" />
              <Text style={s.selectedText}>{label}</Text>
            </View>

            {children}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

export const s = StyleSheet.create({
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
  textArea: {
    minHeight: 110,
    paddingTop: 12,
  },
  textAreaCompact: {
    minHeight: 76,
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
