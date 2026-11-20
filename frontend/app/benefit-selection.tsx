import React from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Platform,
} from 'react-native';
import { Text } from '../components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { BENEFITS } from '../data/benefits';
import { useAuth } from '../context/AuthContext';

function getAge(dob?: string): number | null {
  if (!dob) return null;
  const birthDate = new Date(dob);
  if (Number.isNaN(birthDate.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  if (
    today.getMonth() < birthDate.getMonth()
    || (today.getMonth() === birthDate.getMonth() && today.getDate() < birthDate.getDate())
  ) age -= 1;
  return age;
}

export default function BenefitSelectionScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ query?: string }>();
  const { user } = useAuth();
  const isSenior = getAge(user?.dob) !== null && (getAge(user?.dob) ?? 0) >= 60;

  const filteredBenefits = React.useMemo(() => {
    const query = typeof params.query === 'string' ? params.query.trim().toLowerCase() : '';
    if (!query) {
      return BENEFITS;
    }

    return BENEFITS.filter((item) => {
      const label = item.label.toLowerCase();
      const applicationText = item.applicationValue.toLowerCase();
      return label.includes(query) || applicationText.includes(query);
    });
  }, [params.query]);

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <StatusBar barStyle="light-content" />
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.container}
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity
          style={s.backButton}
          onPress={() => router.back()}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Bumalik"
        >
          <Ionicons name="arrow-back" size={18} color="#FFFFFF" />
        </TouchableOpacity>

        {!user ? (
          <View style={s.lockCard}>
            <Ionicons name="lock-closed-outline" size={24} color="#FFFFFF" style={{ marginBottom: 10 }} />
            <Text style={s.lockTitle}>Kailangang mag-log in</Text>
            <Text style={s.lockText}>Mag-log in muna para makita ang benefits at makapag-apply.</Text>
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
        ) : !isSenior ? (
          <View style={s.lockCard}>
            <Ionicons name="lock-closed-outline" size={24} color="#FFFFFF" style={{ marginBottom: 10 }} />
            <Text style={s.lockTitle}>Para sa senior citizens</Text>
            <Text style={s.lockText}>Para sa edad 60 pataas ang senior citizen services at benefits.</Text>
          </View>
        ) : (
          <View style={s.list}>
          {filteredBenefits.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={s.benefitItem}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={item.id === 'movie-center' ? 'Mag-book sa Movie Center' : `Mag-apply para sa ${item.label}`}
              
             onPress={() => {
  console.log('Selected benefit:', item.id);

  if (item.id === 'movie-center') {
    console.log('Opening Movie Center...');
    router.push('/movie-book');
  } else {
    router.push({
      pathname: '/benefit-application',
      params: { benefitId: item.id },
    });
  }
}}
            >
              <Text style={s.itemText}>{item.id === 'movie-center' ? 'Mag-book sa Movie Center' : `Mag-apply para sa ${item.label}`}</Text>
            </TouchableOpacity>
          ))}

          {filteredBenefits.length === 0 && (
            <View style={s.emptyState}>
              <Text style={s.emptyTitle}>Walang benefit na tugma sa hinahanap mo.</Text>
              <Text style={s.emptyText}>Subukan ang ibang keyword gaya ng Medicine o Check-up.</Text>
            </View>
          )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#000000',
  },
  scroll: {
    flex: 1,
    backgroundColor: '#000000',
  },
  container: {
    flexGrow: 1,
    paddingHorizontal: 18,
    paddingTop: Platform.OS === 'android' ? 12 : 8,
    paddingBottom: 40,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginBottom: 18,
  },
  list: {
    gap: 16,
    marginTop: 8,
  },
  benefitItem: {
    alignSelf: 'flex-start',
    width: '100%',
    paddingVertical: 4,
  },
  itemText: {
    color: '#F2F2F2',
    fontSize: 32,
    lineHeight: 40,
    fontFamily: 'InterBody',
    fontWeight: '500',
    letterSpacing: -0.6,
  },
  emptyState: {
    marginTop: 20,
    padding: 16,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  emptyTitle: {
    color: '#FFFFFF',
    fontFamily: 'InterBody',
    fontWeight: '700',
    fontSize: 16,
    marginBottom: 4,
  },
  emptyText: {
    color: '#D5D5D5',
    fontFamily: 'InterBody',
    fontSize: 14,
    lineHeight: 20,
  },
  lockCard: {
    marginTop: 16,
    padding: 20,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  lockTitle: {
    color: '#FFFFFF',
    fontFamily: 'InterBody',
    fontWeight: '700',
    fontSize: 20,
    marginBottom: 6,
  },
  lockText: {
    color: '#DFDFDF',
    fontFamily: 'InterBody',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 14,
  },
  lockButton: {
    backgroundColor: '#1F5C3E',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  lockButtonText: {
    color: '#FFFFFF',
    fontFamily: 'InterBody',
    fontWeight: '700',
    fontSize: 14,
  },
});
