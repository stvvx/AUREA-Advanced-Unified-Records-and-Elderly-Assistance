import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Animated,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, usePathname } from 'expo-router';
import { useAuth } from '../../context/AuthContext';

export default function AssistantFloatingWidget() {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();
  const [pulseAnim] = useState(new Animated.Value(1));

  // Only logged-in users can access the AI Companion
  if (!user) {
    return null;
  }

  // Hide widget if already on the assistant page
  if (pathname === '/assistant' || pathname === '/(tabs)/assistant') {
    return null;
  }

  const handleOpen = () => {
    router.push('/assistant' as any);
  };

  return (
    <View style={styles.anchor} pointerEvents="box-none">
      <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
        <TouchableOpacity
          style={styles.floatingButton}
          onPress={handleOpen}
          activeOpacity={0.85}
          accessibilityLabel="Kausapin si Lolo Pat (AUREA Senior AI Assistant)"
        >
          {/* Avatar Icon with Lolo Pat / eGov AI indicator */}
          <View style={styles.iconContainer}>
            <Image
              source={require('../../assets/images/lolo_aurea_mascot.jpg')}
              style={styles.avatarImg}
              resizeMode="cover"
            />
            <View style={styles.onlineDot} />
          </View>

          <View style={styles.textContainer}>
            <View style={styles.titleRow}>
              <Text style={styles.badgeTitle}>Lolo Pat</Text>
              <View style={styles.aiPill}>
                <Text style={styles.aiPillText}>AI</Text>
              </View>
            </View>
            <Text style={styles.badgeSubtitle}>Senior AI Assistant</Text>
          </View>

          <View style={styles.micCircle}>
            <Ionicons name="sparkles" size={15} color="#FFFFFF" />
          </View>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  anchor: {
    position: 'absolute',
    bottom: Platform.OS === 'web' ? 28 : 88,
    right: 20,
    zIndex: 9999,
  },
  floatingButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0A2540',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 32,
    borderWidth: 1.5,
    borderColor: '#1E60FF',
    ...Platform.select({
      ios: {
        shadowColor: '#0A2540',
        shadowOpacity: 0.35,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 4 },
      },
      android: {
        elevation: 8,
      },
      web: {
        boxShadow: '0 8px 24px rgba(10, 37, 64, 0.35)',
        cursor: 'pointer',
      },
    }),
  },
  iconContainer: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#E8F1FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    borderWidth: 1.5,
    borderColor: '#1E60FF',
    position: 'relative',
    overflow: 'hidden',
  },
  avatarImg: {
    width: '100%',
    height: '100%',
  },
  onlineDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#22C55E',
    borderWidth: 1.5,
    borderColor: '#0A2540',
  },
  textContainer: {
    marginRight: 12,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  badgeTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  aiPill: {
    backgroundColor: '#1E60FF',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 6,
  },
  aiPillText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  badgeSubtitle: {
    fontSize: 10,
    fontWeight: '600',
    color: '#A0C4FF',
  },
  micCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#1E60FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
