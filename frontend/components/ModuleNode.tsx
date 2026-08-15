import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, space } from '../theme/tokens';
import type { Module } from '../data/modules';

type Props = {
  module: Module;
  isLast: boolean;
  legacy: boolean;
  onPress: () => void;
};

export default function ModuleNode({ module, isLast, legacy, onPress }: Props) {
  const active = module.status === 'active';
  const accent = legacy ? colors.goldDeep : colors.primaryDeep;

  return (
    <View style={styles.row}>
      {/* Thread line + dot */}
      <View style={styles.track}>
        <View style={[styles.dot, { backgroundColor: active ? accent : colors.border, borderColor: accent }]} />
        {!isLast && <View style={[styles.line, { backgroundColor: colors.border }]} />}
      </View>

      {/* Card */}
      <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.8}>
        <View style={styles.cardHeader}>
          <Ionicons name={module.icon as any} size={18} color={accent} />
          {!active && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>Coming soon</Text>
            </View>
          )}
        </View>
        <Text style={styles.title}>{module.title}</Text>
        <Text style={styles.desc}>{module.description}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    marginBottom: space(4),
  },
  track: {
    alignItems: 'center',
    width: 24,
    marginRight: space(3),
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    marginTop: space(3),
  },
  line: {
    width: 2,
    flex: 1,
    marginTop: 4,
  },
  card: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: space(4),
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: space(2),
  },
  badge: {
    backgroundColor: colors.goldSoft,
    borderRadius: 6,
    paddingHorizontal: space(2),
    paddingVertical: 2,
  },
  badgeText: {
    fontFamily: 'InterBody',
    fontSize: 10,
    color: colors.goldDeep,
    fontWeight: '600',
  },
  title: {
    fontFamily: 'FraunTitle',
    fontSize: 15,
    color: colors.ink,
    marginBottom: 4,
  },
  desc: {
    fontFamily: 'InterBody',
    fontSize: 12.5,
    color: colors.inkSoft,
  },
});
