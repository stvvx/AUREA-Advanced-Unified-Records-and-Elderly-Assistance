import React from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';
import { Text } from './AppText';
import { useSettings } from '../context/SettingsContext';
import { DARK_SURFACES } from '../lib/appTheme';

export function PhysicalIdButton({ label, onPress, secondary, disabled }: {
  label: string; onPress: () => void; secondary?: boolean; disabled?: boolean;
}) {
  const styles = usePhysicalIdStyles();
  return (
    <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled}
      onPress={onPress} style={[styles.button, secondary && styles.secondary, disabled && styles.disabled]}>
      <Text style={[styles.buttonText, secondary && styles.secondaryText]}>{label}</Text>
    </TouchableOpacity>
  );
}

const physicalIdStyles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F4F7EE' },
  content: { width: '100%', maxWidth: 680, alignSelf: 'center', padding: 22, paddingBottom: 48, gap: 16 },
  title: { fontFamily: 'FraunTitle', fontSize: 32, color: '#132018' },
  card: { borderRadius: 20, backgroundColor: '#FFFFFF', padding: 16, gap: 12, borderWidth: 1, borderColor: '#D9E4D7' },
  heading: { fontFamily: 'InterBody', fontWeight: '700', fontSize: 19, color: '#132018' },
  body: { fontFamily: 'InterBody', fontSize: 15, lineHeight: 22, color: '#35473B' },
  error: { fontFamily: 'InterBody', fontSize: 15, color: '#9C3729' },
  choice: { minHeight: 44, justifyContent: 'center' },
  input: { backgroundColor: '#F4F7EE', borderWidth: 1, borderColor: '#D9E4D7', borderRadius: 12, padding: 12, color: '#132018', fontFamily: 'InterBody' },
  button: { backgroundColor: '#1F5C3E', borderRadius: 14, padding: 13, minHeight: 44, justifyContent: 'center' },
  buttonText: { color: '#FFFFFF', fontFamily: 'InterBody', fontWeight: '700', fontSize: 15 },
  secondary: { backgroundColor: '#E6F0E5' },
  secondaryText: { color: '#1F5C3E' },
  disabled: { opacity: 0.45 },
  document: { width: '100%', height: 260, backgroundColor: '#F4F7EE' },
});

const darkStyles = StyleSheet.create({
  ...physicalIdStyles,
  screen: { ...physicalIdStyles.screen, backgroundColor: DARK_SURFACES.bg },
  card: { ...physicalIdStyles.card, backgroundColor: DARK_SURFACES.card, borderColor: DARK_SURFACES.line },
  title: { ...physicalIdStyles.title, color: DARK_SURFACES.ink },
  heading: { ...physicalIdStyles.heading, color: DARK_SURFACES.ink },
  body: { ...physicalIdStyles.body, color: DARK_SURFACES.inkSoft },
  error: { ...physicalIdStyles.error, color: '#FFAB9C' },
  input: { ...physicalIdStyles.input, backgroundColor: DARK_SURFACES.bg, borderColor: DARK_SURFACES.line, color: DARK_SURFACES.ink },
  secondary: { backgroundColor: DARK_SURFACES.primarySoft },
  secondaryText: { color: DARK_SURFACES.accent },
  document: { ...physicalIdStyles.document, backgroundColor: DARK_SURFACES.bg },
});

export function usePhysicalIdStyles() {
  const { colorScheme } = useSettings();
  return colorScheme === 'dark' ? darkStyles : physicalIdStyles;
}
