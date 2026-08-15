import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, space } from '../theme/tokens';

type Props = {
  onLogin?: () => void;
  onRegister?: () => void;
};

export default function AppHeader({ onLogin, onRegister }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.wrapper, { paddingTop: insets.top + space(2) }]}>
      {/* Branding */}
      <View style={styles.brand}>
        <Text style={styles.eyebrow}>MUNICIPALITY OF PATEROS</Text>
        <Text style={styles.title}>AUREA</Text>
        <Text style={styles.subtitle}>Senior Citizen Services</Text>
      </View>

      {/* Auth buttons */}
      <View style={styles.actions}>
        <TouchableOpacity style={styles.loginBtn} onPress={onLogin} activeOpacity={0.8}>
          <Text style={styles.loginText}>Log in</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.registerBtn} onPress={onRegister} activeOpacity={0.8}>
          <Text style={styles.registerText}>Register</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: space(5),
    paddingBottom: space(4),
    backgroundColor: colors.bg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.04,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 2 },
      },
      android: {
        elevation: 3,
      },
    }),
  },
  brand: {
    flex: 1,
    paddingRight: space(3),
  },
  eyebrow: {
    fontFamily: 'InterBody',
    fontWeight: '700',
    fontSize: 9,
    letterSpacing: 1.4,
    color: colors.goldDeep,
    marginBottom: 2,
  },
  title: {
    fontFamily: 'FraunTitle',
    fontSize: 26,
    color: colors.ink,
    lineHeight: 30,
  },
  subtitle: {
    fontFamily: 'InterBody',
    fontSize: 11.5,
    color: colors.inkSoft,
    marginTop: 1,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(2),
    paddingTop: space(1),
  },
  loginBtn: {
    paddingVertical: space(2),
    paddingHorizontal: space(4),
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: colors.primaryDeep,
  },
  loginText: {
    fontFamily: 'InterBody',
    fontSize: 13,
    fontWeight: '600',
    color: colors.primaryDeep,
  },
  registerBtn: {
    paddingVertical: space(2),
    paddingHorizontal: space(4),
    borderRadius: 8,
    backgroundColor: colors.primaryDeep,
  },
  registerText: {
    fontFamily: 'InterBody',
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
