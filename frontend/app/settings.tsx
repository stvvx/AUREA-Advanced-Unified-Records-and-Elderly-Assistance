import React, { useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Platform, ScrollView, StatusBar, StyleSheet, Text as PreviewText, TouchableOpacity, View } from 'react-native';
import { Text } from '../components/AppText';
import { FONT_SCALES, useSettings, type FontSizePreference, type LanguagePreference, type ThemePreference } from '../context/SettingsContext';

const C = {
  light: { bg: '#F6F8F2', card: '#FFFFFF', ink: '#132018', soft: '#3E5246', faint: '#71857A', primary: '#1F5C3E', line: '#DCE7D8' },
  dark: { bg: '#101713', card: '#19231D', ink: '#F2F6F1', soft: '#C0CEC3', faint: '#93A59A', primary: '#8BD3A6', line: '#33483A' },
};

const languageOptions: { value: LanguagePreference; label: string }[] = [
  { value: 'english', label: 'English' },
  { value: 'filipino', label: 'Filipino' },
];

const themeOptions: { value: ThemePreference; label: string; filipino: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: 'system', label: 'System', filipino: 'Sundin ang device', icon: 'phone-portrait-outline' },
  { value: 'light', label: 'Light', filipino: 'Maliwanag', icon: 'sunny-outline' },
  { value: 'dark', label: 'Dark', filipino: 'Madilim', icon: 'moon-outline' },
];

const fontOptions: { value: FontSizePreference; label: string; filipino: string }[] = [
  { value: 'standard', label: 'Standard', filipino: 'Karaniwan' },
  { value: 'large', label: 'Large', filipino: 'Malaki' },
  { value: 'extraLarge', label: 'Extra large', filipino: 'Mas malaki' },
];

export default function SettingsScreen() {
  const router = useRouter();
  const { theme, language, fontSize, ready, colorScheme, applySettings, restoreDefaults } = useSettings();
  const savingRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean }>();
  const locked = !ready || saving;
  const colors = C[colorScheme];
  const filipino = language === 'filipino';
  const words = (english: string, taglish: string) => filipino ? taglish : english;

  async function save(update: Partial<Parameters<typeof applySettings>[0]> | null) {
    if (!ready || savingRef.current) return;
    const next = { theme, language, fontSize, ...update };
    savingRef.current = true;
    setSaving(true);
    setMessage(undefined);
    try {
      if (update) await applySettings(next);
      else await restoreDefaults();
      setMessage({ text: !update ? 'Default settings restored.' : next.language === 'filipino' ? 'Na-save na ang settings.' : 'Settings saved.' });
    } catch {
      setMessage({ text: words('Could not save settings. Try again.', 'Hindi na-save ang settings. Subukan ulit.'), error: true });
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: colors.bg }]}>
      <StatusBar barStyle={colorScheme === 'dark' ? 'light-content' : 'dark-content'} />
      <ScrollView contentContainerStyle={s.container}>
        <View style={s.header}>
          <TouchableOpacity style={[s.back, { borderColor: colors.line }]} onPress={() => router.back()} accessibilityLabel={words('Go back', 'Bumalik')}>
            <Ionicons name="arrow-back" size={21} color={colors.ink} />
          </TouchableOpacity>
          <View>
            <Text style={[s.eyebrow, { color: colors.primary }]}>AUREA</Text>
            <Text style={[s.title, { color: colors.ink }]}>{words('Settings', 'Mga Setting')}</Text>
          </View>
        </View>

        {Platform.OS !== 'web' && <>
          <Text style={[s.sectionLabel, { color: colors.faint }]}>{words('APPEARANCE', 'HITSURA')}</Text>
          <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
            <Text style={[s.cardTitle, { color: colors.ink }]}>Theme</Text>
            <View style={[s.optionRow, { marginTop: 12 }]} accessibilityRole="radiogroup" accessibilityLabel="Theme">
              {themeOptions.map((option) => {
                const selected = theme === option.value;
                return (
                  <TouchableOpacity key={option.value}
                    style={[s.option, { borderColor: selected ? colors.primary : colors.line, backgroundColor: selected ? `${colors.primary}22` : colors.card }]}
                    onPress={() => { if (!selected) void save({ theme: option.value }); }}
                    disabled={locked} accessibilityRole="radio" accessibilityState={{ checked: selected, disabled: locked }}>
                    <Ionicons name={option.icon} size={20} color={selected ? colors.primary : colors.soft} />
                    <Text style={[s.optionText, { color: selected ? colors.primary : colors.soft }]}>{words(option.label, option.filipino)}</Text>
                    {selected && <Ionicons name="checkmark-circle" size={17} color={colors.primary} />}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

        </>}

        <Text style={[s.sectionLabel, { color: colors.faint }]}>ACCESSIBILITY</Text>
        <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
          <Text style={[s.cardTitle, { color: colors.ink }]}>{words('Font size', 'Laki ng text')}</Text>
          <Text style={[s.cardDescription, { color: colors.soft }]}>{words('Adjust the text size for labels, messages, and form fields.', 'Baguhin ang laki ng text sa mga label, message, at form.')}</Text>
          <View style={s.optionRow} accessibilityRole="radiogroup" accessibilityLabel={words('Font size', 'Laki ng text')}>
            {fontOptions.map((option) => {
              const selected = fontSize === option.value;
              return (
                <TouchableOpacity key={option.value}
                  style={[s.option, { borderColor: selected ? colors.primary : colors.line, backgroundColor: selected ? `${colors.primary}22` : colors.card }]}
                  onPress={() => { if (!selected) void save({ fontSize: option.value }); }}
                  disabled={locked} accessibilityRole="radio" accessibilityState={{ checked: selected, disabled: locked }}>
                  <Text style={[s.optionText, { color: selected ? colors.primary : colors.soft }]}>{words(option.label, option.filipino)}</Text>
                  {selected && <Ionicons name="checkmark-circle" size={17} color={colors.primary} />}
                </TouchableOpacity>
              );
            })}
          </View>
          <View style={[s.preview, { borderColor: colors.line }]}>
            <Text style={[s.cardDescription, { color: colors.soft, marginBottom: 6 }]}>Preview</Text>
            <PreviewText style={{ color: colors.ink, fontSize: Math.round(16 * FONT_SCALES[fontSize]) }}>
              Mabuhay! Ganito kalaki ang text sa AUREA.
            </PreviewText>
          </View>
        </View>

        <Text style={[s.sectionLabel, { color: colors.faint }]}>{words('LANGUAGE', 'WIKA')}</Text>
        <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
          <Text style={[s.cardTitle, { color: colors.ink }]}>{words('Settings language', 'Wika sa Settings')}</Text>
          <Text style={[s.cardDescription, { color: colors.soft }]}>{words('Choose the language used on this screen.', 'Piliin ang wikang gagamitin sa screen na ito.')}</Text>
          <View style={s.optionRow}>
            {languageOptions.map((option) => {
              const selected = language === option.value;
              return (
                <TouchableOpacity
                  key={option.value}
                  style={[s.option, { borderColor: selected ? colors.primary : colors.line, backgroundColor: selected ? `${colors.primary}22` : colors.card }]}
                  onPress={() => { if (!selected) void save({ language: option.value }); }}
                  disabled={locked}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected, disabled: locked }}
                >
                  <Text style={[s.optionText, { color: selected ? colors.primary : colors.soft }]}>{option.label}</Text>
                  {selected && <Ionicons name="checkmark-circle" size={17} color={colors.primary} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={s.actions}>
          {!!message && <Text accessibilityRole="alert" style={{ color: message.error && colorScheme === 'light' ? '#9C3729' : colors.ink }}>{message.text}</Text>}
          <TouchableOpacity style={[s.restoreButton, { borderColor: colors.line }, locked && s.disabled]}
            disabled={locked} accessibilityRole="button" onPress={() => void save(null)} activeOpacity={0.85}>
            <Ionicons name="refresh-outline" size={18} color={colors.soft} />
            <Text style={[s.restoreButtonText, { color: colors.soft }]}>{words('Restore to default', 'Ibalik sa default')}</Text>
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
  preview: { borderTopWidth: 1, marginTop: 16, paddingTop: 10 },
  disabled: { opacity: 0.55 },
  actions: { gap: 10, marginTop: 4 },
  restoreButton: { minHeight: 48, borderWidth: 1, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  restoreButtonText: { fontSize: 15, fontWeight: '600' },
});
