import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, space } from '../theme/tokens';

type Props = {
  label: string;
  value: string;
  icon: string;
};

export default function StatCard({ label, value, icon }: Props) {
  return (
    <View style={styles.card}>
      <Ionicons name={icon as any} size={18} color={colors.primaryDeep} />
      <Text style={styles.value}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: space(4),
    marginRight: space(3),
    minWidth: 100,
    alignItems: 'center',
    gap: 4,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  value: {
    fontFamily: 'FraunTitle',
    fontSize: 22,
    color: colors.ink,
    fontWeight: '700',
  },
  label: {
    fontFamily: 'InterBody',
    fontSize: 11,
    color: colors.inkSoft,
  },
});
