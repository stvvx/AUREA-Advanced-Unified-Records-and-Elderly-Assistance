import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Appearance, useColorScheme } from 'react-native';

type ThemePreference = 'system' | 'light' | 'dark';
type LanguagePreference = 'english' | 'filipino';

type SettingsContextValue = {
  theme: ThemePreference;
  language: LanguagePreference;
  colorScheme: 'light' | 'dark';
  applySettings: (theme: ThemePreference, language: LanguagePreference) => void;
  restoreDefaults: () => void;
};

const STORAGE_KEY = '@aurea_settings';
const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [theme, setThemeState] = useState<ThemePreference>('system');
  const [language, setLanguageState] = useState<LanguagePreference>('english');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (!stored) return;
        const parsed = JSON.parse(stored) as Partial<{ theme: ThemePreference; language: LanguagePreference }>;
        const nextTheme = parsed.theme === 'system' || parsed.theme === 'light' || parsed.theme === 'dark' ? parsed.theme : 'system';
        const nextLanguage = parsed.language === 'english' || parsed.language === 'filipino' ? parsed.language : 'english';
        setThemeState(nextTheme);
        setLanguageState(nextLanguage);
        Appearance.setColorScheme(nextTheme === 'system' ? 'unspecified' : nextTheme);
      })
      .catch(() => undefined);
  }, []);

  const persist = (nextTheme: ThemePreference, nextLanguage: LanguagePreference) => {
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ theme: nextTheme, language: nextLanguage })).catch(() => undefined);
  };

  const applySettings = (nextTheme: ThemePreference, nextLanguage: LanguagePreference) => {
    setThemeState(nextTheme);
    setLanguageState(nextLanguage);
    Appearance.setColorScheme(nextTheme === 'system' ? 'unspecified' : nextTheme);
    persist(nextTheme, nextLanguage);
  };

  const restoreDefaults = () => {
    applySettings('system', 'english');
  };

  const value = useMemo(() => ({
    theme,
    language,
    colorScheme: theme === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : theme,
    applySettings,
    restoreDefaults,
  }), [theme, language, systemScheme]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) throw new Error('useSettings must be used inside SettingsProvider');
  return context;
}

export type { LanguagePreference, ThemePreference };
