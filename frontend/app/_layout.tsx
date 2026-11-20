import { LogBox } from 'react-native';
import { Stack } from 'expo-router';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import {
  useFonts,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from '@expo-google-fonts/poppins';

import { AuthProvider } from '../context/AuthContext';
import { SettingsProvider, useSettings } from '../context/SettingsContext';
import { DARK_SURFACES } from '../lib/appTheme';

// Suppress non-fatal development warnings from blocking the UI
LogBox.ignoreLogs([
  'Cannot connect to Expo CLI',
  '[expo-image-picker]',
]);

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    InterBody: Poppins_400Regular,
    FraunTitle: Poppins_600SemiBold,
    'Poppins_400Regular': Poppins_400Regular,
    'Poppins_500Medium': Poppins_500Medium,
    'Poppins_600SemiBold': Poppins_600SemiBold,
    'Poppins_700Bold': Poppins_700Bold,
  });

  if (!fontsLoaded) {
    return null;
  }

  return (
    <SettingsProvider>
      <AuthProvider>
        <AppNavigator />
      </AuthProvider>
    </SettingsProvider>
  );
}

const appDarkTheme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: DARK_SURFACES.bg, card: DARK_SURFACES.card, text: DARK_SURFACES.ink,
    border: DARK_SURFACES.line, primary: DARK_SURFACES.accent },
};

function AppNavigator() {
  const { colorScheme } = useSettings();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? appDarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="assistant" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="face-verification" options={{ headerShown: false }} />
        <Stack.Screen name="register" options={{ headerShown: false }} />
        <Stack.Screen name="profile" options={{ headerShown: false }} />
        <Stack.Screen name="chat" options={{ headerShown: false }} />
        <Stack.Screen name="forum" options={{ headerShown: false }} />
        <Stack.Screen name="digital-id" options={{ headerShown: false }} />
        <Stack.Screen name="benefit-selection" options={{ headerShown: false }} />
        <Stack.Screen name="benefit-application" options={{ headerShown: false }} />
        <Stack.Screen name="emergency" options={{ headerShown: false }} />
        <Stack.Screen name="osca-emergency" options={{ headerShown: false }} />
        <Stack.Screen name="admin-physical-id" options={{ headerShown: false }} />
        <Stack.Screen name="osca-physical-id" options={{ headerShown: false }} />
        <Stack.Screen name="osca-philhealth" options={{ headerShown: false }} />
        <Stack.Screen name="osca-social-pension" options={{ headerShown: false }} />
        <Stack.Screen name="osca-financial-assistance" options={{ headerShown: false }} />
        <Stack.Screen name="osca-purchase-booklet" options={{ headerShown: false }} />
        <Stack.Screen name="osca-transfer" options={{ headerShown: false }} />
        <Stack.Screen name="osca-birthday-benefits" options={{ headerShown: false }} />
        <Stack.Screen name="osca-movie-center" options={{ headerShown: false }} />
        <Stack.Screen name="admin-checkup-appointments" options={{ headerShown: false }} />
        <Stack.Screen name="movie-book" options={{ headerShown: false }} />
        <Stack.Screen name="admin-dashboard" options={{ headerShown: false }} />
        <Stack.Screen name="admin-management" options={{ headerShown: false }} />
        <Stack.Screen name="admin-senior-citizens" options={{ headerShown: false }} />
        <Stack.Screen name="admin-records" options={{ headerShown: false }} />
        <Stack.Screen name="admin-benefits" options={{ headerShown: false }} />
        <Stack.Screen name="admin-movie-center" options={{ headerShown: false }} />
        <Stack.Screen name="settings" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      </Stack>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
    </ThemeProvider>
  );
}
