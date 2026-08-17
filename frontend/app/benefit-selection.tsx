import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

const BENEFITS = [
  'request for medicine',
  'application for financial assistance',
  'application for Physical ID',
  'appointment for movie center',
  'appointment for check-up',
  'emergency alert',
];

export default function BenefitSelectionScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor="#000000" />
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
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={18} color="#FFFFFF" />
        </TouchableOpacity>

        <View style={s.list}>
          {BENEFITS.map((item) => (
            <TouchableOpacity
              key={item}
              style={s.benefitItem}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={item}
              onPress={() => router.push({ pathname: '/benefit-application', params: { benefit: item } })}
            >
              <Text style={s.itemText}>{item}</Text>
            </TouchableOpacity>
          ))}
        </View>
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
});
