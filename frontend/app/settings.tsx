import React, { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSettings, type LanguagePreference, type ThemePreference } from '../context/SettingsContext';

const C = {
  light: { bg: '#F6F8F2', card: '#FFFFFF', ink: '#132018', soft: '#3E5246', faint: '#71857A', primary: '#1F5C3E', line: '#DCE7D8' },
  dark: { bg: '#101713', card: '#19231D', ink: '#F2F6F1', soft: '#C0CEC3', faint: '#93A59A', primary: '#8BD3A6', line: '#33483A' },
};

const themeOptions: { value: ThemePreference; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: 'system', label: 'System', icon: 'phone-portrait-outline' },
  { value: 'light', label: 'Light', icon: 'sunny-outline' },
  { value: 'dark', label: 'Dark', icon: 'moon-outline' },
];

const languageOptions: { value: LanguagePreference; label: string }[] = [
  { value: 'english', label: 'English' },
  { value: 'filipino', label: 'Filipino' },
];

export default function SettingsScreen() {
  const router = useRouter();
  const { theme, language, colorScheme, applySettings, restoreDefaults } = useSettings();
  const [draftTheme, setDraftTheme] = useState(theme);
  const [draftLanguage, setDraftLanguage] = useState(language);
  const colors = C[colorScheme];

  const handleApply = () => applySettings(draftTheme, draftLanguage);
  const handleRestoreDefaults = () => {
    restoreDefaults();
    setDraftTheme('system');
    setDraftLanguage('english');
  };

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: colors.bg }]}>
      <StatusBar barStyle={colorScheme === 'dark' ? 'light-content' : 'dark-content'} />
      <ScrollView contentContainerStyle={s.container}>
        <View style={s.header}>
          <TouchableOpacity style={[s.back, { borderColor: colors.line }]} onPress={() => router.back()} accessibilityLabel="Go back">
            <Ionicons name="arrow-back" size={21} color={colors.ink} />
          </TouchableOpacity>
          <View>
            <Text style={[s.eyebrow, { color: colors.primary }]}>AUREA</Text>
            <Text style={[s.title, { color: colors.ink }]}>Settings</Text>
          </View>
        </View>

        <Text style={[s.sectionLabel, { color: colors.faint }]}>APPEARANCE</Text>
        <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
          <Text style={[s.cardTitle, { color: colors.ink }]}>Theme</Text>
          <Text style={[s.cardDescription, { color: colors.soft }]}>Choose how AUREA looks on this device.</Text>
          <View style={s.optionRow}>
            {themeOptions.map((option) => {
              const selected = draftTheme === option.value;
              return (
                <TouchableOpacity
                  key={option.value}
                  style={[s.option, { borderColor: selected ? colors.primary : colors.line, backgroundColor: selected ? `${colors.primary}22` : colors.card }]}
                  onPress={() => setDraftTheme(option.value)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                >
                  <Ionicons name={option.icon} size={20} color={selected ? colors.primary : colors.soft} />
                  <Text style={[s.optionText, { color: selected ? colors.primary : colors.soft }]}>{option.label}</Text>
                  {selected && <Ionicons name="checkmark-circle" size={17} color={colors.primary} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <Text style={[s.sectionLabel, { color: colors.faint }]}>LANGUAGE</Text>
        <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
          <Text style={[s.cardTitle, { color: colors.ink }]}>App language</Text>
          <Text style={[s.cardDescription, { color: colors.soft }]}>Select your preferred language.</Text>
          <View style={s.optionRow}>
            {languageOptions.map((option) => {
              const selected = draftLanguage === option.value;
              return (
                <TouchableOpacity
                  key={option.value}
                  style={[s.option, { borderColor: selected ? colors.primary : colors.line, backgroundColor: selected ? `${colors.primary}22` : colors.card }]}
                  onPress={() => setDraftLanguage(option.value)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                >
                  <Text style={[s.optionText, { color: selected ? colors.primary : colors.soft }]}>{option.label}</Text>
                  {selected && <Ionicons name="checkmark-circle" size={17} color={colors.primary} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={s.actions}>
          <TouchableOpacity style={[s.applyButton, { backgroundColor: colors.primary }]} onPress={handleApply} activeOpacity={0.85}>
            <Ionicons name="checkmark-circle-outline" size={19} color={colorScheme === 'dark' ? '#101713' : '#FFFFFF'} />
            <Text style={[s.applyButtonText, { color: colorScheme === 'dark' ? '#101713' : '#FFFFFF' }]}>Apply</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.restoreButton, { borderColor: colors.line }]} onPress={handleRestoreDefaults} activeOpacity={0.85}>
            <Ionicons name="refresh-outline" size={18} color={colors.soft} />
            <Text style={[s.restoreButtonText, { color: colors.soft }]}>Restore to default</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1 },
  container: { padding: 20, paddingBottom: 48 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 34 },
  back: { width: 42, height: 42, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  eyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 1.5 },
  title: { fontSize: 28, fontWeight: '700', marginTop: 2 },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1.2, marginBottom: 10, marginTop: 8 },
  card: { borderWidth: 1, borderRadius: 16, padding: 16, marginBottom: 24 },
  cardTitle: { fontSize: 18, fontWeight: '700' },
  cardDescription: { fontSize: 13, marginTop: 5, marginBottom: 16 },
  optionRow: { gap: 9 },
  option: { minHeight: 48, borderWidth: 1, borderRadius: 11, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 9 },
  optionText: { flex: 1, fontSize: 15, fontWeight: '600' },
  actions: { gap: 10, marginTop: 4 },
  applyButton: { minHeight: 50, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  applyButtonText: { fontSize: 16, fontWeight: '700' },
  restoreButton: { minHeight: 48, borderWidth: 1, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  restoreButtonText: { fontSize: 15, fontWeight: '600' },
});
