import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, space } from '../theme/tokens';

type Option = { value: string; label: string };

type Props = {
  value: string;
  onChange: (val: string) => void;
  options: Option[];
};

export default function SegmentedControl({ value, onChange, options }: Props) {
  return (
    <View style={styles.container}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <TouchableOpacity
            key={opt.value}
            style={[styles.segment, active && styles.active]}
            onPress={() => onChange(opt.value)}
            activeOpacity={0.8}
          >
            <Text style={[styles.label, active && styles.activeLabel]}>{opt.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: colors.border,
    borderRadius: 10,
    padding: 3,
    marginBottom: space(2),
  },
  segment: {
    flex: 1,
    paddingVertical: space(2),
    alignItems: 'center',
    borderRadius: 8,
  },
  active: {
    backgroundColor: colors.surface,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  label: {
    fontFamily: 'InterBody',
    fontSize: 12.5,
    color: colors.inkSoft,
  },
  activeLabel: {
    color: colors.ink,
    fontWeight: '600',
  },
});
