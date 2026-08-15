import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, space } from '../theme/tokens';

type Props = {
  label: string;
  icon: string;
  onPress: () => void;
};

export default function QuickAction({ label, icon, onPress }: Props) {
  return (
    <TouchableOpacity style={styles.btn} onPress={onPress} activeOpacity={0.75}>
      <Ionicons name={icon as any} size={22} color={colors.primaryDeep} />
      <Text style={styles.label}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: '23%',
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingVertical: space(3),
    alignItems: 'center',
    gap: 6,
    marginBottom: space(2),
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  label: {
    fontFamily: 'InterBody',
    fontSize: 11,
    color: colors.ink,
    textAlign: 'center',
  },
});
