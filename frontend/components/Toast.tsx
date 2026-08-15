import React, { useEffect, useRef } from 'react';
import { Animated, Text, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type ToastType = 'success' | 'error';

type Props = {
  visible: boolean;
  message: string;
  type?: ToastType;
  duration?: number;
  onHide?: () => void;
};

const CONFIG: Record<ToastType, { bg: string; icon: string; color: string }> = {
  success: { bg: '#1B5E3F', icon: 'checkmark-circle', color: '#FFFFFF' },
  error:   { bg: '#C62828', icon: 'alert-circle',      color: '#FFFFFF' },
};

export default function Toast({
  visible,
  message,
  type = 'success',
  duration = 3000,
  onHide,
}: Props) {
  const insets = useSafeAreaInsets();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-20)).current;

  useEffect(() => {
    if (!visible) return;

    Animated.parallel([
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, speed: 20 }),
      Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
    ]).start();

    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(translateY, { toValue: -20, duration: 200, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start(() => onHide?.());
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onHide, opacity, translateY, visible]);

  if (!visible) return null;

  const { bg, icon, color } = CONFIG[type];

  return (
    <Animated.View
      style={[
        styles.toast,
        { backgroundColor: bg, top: insets.top + 12, opacity, transform: [{ translateY }] },
      ]}
    >
      <Ionicons name={icon as any} size={20} color={color} />
      <Text style={[styles.message, { color }]}>{message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 999,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
      android: { elevation: 8 },
    }),
  },
  message: {
    flex: 1,
    fontFamily: 'InterBody',
    fontSize: 14,
    fontWeight: '600',
  },
});
