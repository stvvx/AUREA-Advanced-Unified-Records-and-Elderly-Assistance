import React, { useEffect, useRef } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from './AppText';
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

const CONFIG = {
  success: { bg: '#1B5E3F', icon: 'checkmark-circle' as const },
  error: { bg: '#B71C1C', icon: 'alert-circle' as const },
};

export default function Toast({ visible, message, type = 'success', duration = 6000, onHide }: Props) {
  const insets = useSafeAreaInsets();
  const hideCallback = useRef(onHide);

  useEffect(() => {
    hideCallback.current = onHide;
  }, [onHide]);

  useEffect(() => {
    if (!visible || duration <= 0) return;
    const timer = setTimeout(() => hideCallback.current?.(), duration);
    return () => clearTimeout(timer);
  }, [visible, message, duration]);

  const { bg, icon } = CONFIG[type];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onHide} statusBarTranslucent>
      <View style={[styles.overlay, {
        paddingTop: insets.top + 24,
        paddingBottom: insets.bottom + 24,
        paddingLeft: insets.left + 24,
        paddingRight: insets.right + 24,
      }]}>
        <View style={styles.alert} accessibilityViewIsModal>
          <ScrollView contentContainerStyle={styles.content} bounces={false}>
            <Ionicons name={icon} size={56} color={bg} accessible={false} />
            <Text style={styles.message} accessibilityRole="alert" accessibilityLiveRegion="assertive">{message}</Text>
          </ScrollView>
          <Pressable onPress={onHide} accessibilityRole="button" accessibilityLabel="OK, dismiss message"
            style={({ pressed }) => [styles.button, { backgroundColor: bg }, pressed && styles.pressed]}>
            <Text style={styles.buttonText}>OK</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.4)' },
  alert: { width: '100%', maxWidth: 560, maxHeight: '100%', flexShrink: 1, backgroundColor: '#FFFFFF', borderRadius: 24, padding: 24, gap: 24 },
  content: { alignItems: 'center', gap: 20 },
  message: { fontFamily: 'InterBody', fontSize: 24, lineHeight: 34, fontWeight: '700', color: '#13201A', textAlign: 'center', width: '100%' },
  button: { minHeight: 60, borderRadius: 14, alignItems: 'center', justifyContent: 'center', padding: 14 },
  buttonText: { fontFamily: 'InterBody', fontSize: 22, lineHeight: 30, fontWeight: '700', color: '#FFFFFF' },
  pressed: { opacity: 0.8 },
});
