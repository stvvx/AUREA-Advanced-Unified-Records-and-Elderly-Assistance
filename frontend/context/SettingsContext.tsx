import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Appearance, Platform, useColorScheme } from 'react-native';

type ThemePreference = 'system' | 'light' | 'dark';
type LanguagePreference = 'english' | 'filipino';
export const FONT_SCALES = { standard: 1, large: 1.15, extraLarge: 1.3 } as const;
export type FontSizePreference = keyof typeof FONT_SCALES;

type Preferences = { theme: ThemePreference; language: LanguagePreference; fontSize: FontSizePreference };
const DEFAULTS: Preferences = { theme: 'system', language: 'english', fontSize: 'standard' };

type SettingsContextValue = Preferences & {
  ready: boolean;
  colorScheme: 'light' | 'dark';
  applySettings: (preferences: Preferences) => Promise<void>;
  restoreDefaults: () => Promise<void>;
};

const STORAGE_KEY = '@aurea_settings';
const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [preferences, setPreferences] = useState(DEFAULTS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (!active || !stored) return;
        const parsed = JSON.parse(stored) as Partial<Preferences> | null;
        const theme = parsed?.theme === 'light' || parsed?.theme === 'dark' ? parsed.theme : DEFAULTS.theme;
        const language = parsed?.language === 'filipino' ? 'filipino' : DEFAULTS.language;
        const fontSize = parsed?.fontSize === 'large' || parsed?.fontSize === 'extraLarge'
          ? parsed.fontSize : DEFAULTS.fontSize;
        setPreferences({ theme, language, fontSize });
        if (Platform.OS !== 'web') Appearance.setColorScheme(theme === 'system' ? 'unspecified' : theme);
      })
      .catch(() => undefined)
      .finally(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, []);

  const applySettings = useCallback(async (next: Preferences) => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setPreferences(next);
    if (Platform.OS !== 'web') Appearance.setColorScheme(next.theme === 'system' ? 'unspecified' : next.theme);
  }, []);

  const restoreDefaults = useCallback(() => applySettings(DEFAULTS), [applySettings]);
  const value = useMemo<SettingsContextValue>(() => ({
    ...preferences,
    ready,
    colorScheme: Platform.OS === 'web' ? 'light'
      : preferences.theme === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : preferences.theme,
    applySettings,
    restoreDefaults,
  }), [preferences, ready, systemScheme, applySettings, restoreDefaults]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) throw new Error('useSettings must be used inside SettingsProvider');
  return context;
}

export function useAppFontScale() {
  const settings = useContext(SettingsContext);
  return FONT_SCALES[settings?.fontSize ?? 'standard'];
}

export type { LanguagePreference, ThemePreference };
