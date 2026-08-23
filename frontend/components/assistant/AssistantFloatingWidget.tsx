import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Animated,
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
          accessibilityLabel="Kausapin si Lolo Aurea (AI Assistant)"
        >
          {/* Avatar Icon with Barong / Senior indicator */}
          <View style={styles.iconContainer}>
            <Text style={styles.avatarEmoji}>👴🏼</Text>
            <View style={styles.onlineDot} />
          </View>

          <View style={styles.textContainer}>
            <Text style={styles.badgeTitle}>Lolo Aurea</Text>
            <Text style={styles.badgeSubtitle}>3D Voice Assistant</Text>
          </View>


          <View style={styles.micCircle}>
            <Ionicons name="mic" size={16} color="#FFFFFF" />
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
    backgroundColor: '#1F5C3E', // AUREA signature dark green
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 32,
    borderWidth: 1.5,
    borderColor: '#C4892E', // Gold accent
    ...Platform.select({
      ios: {
        shadowColor: '#0F3323',
        shadowOpacity: 0.35,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 4 },
      },
      android: {
        elevation: 8,
      },
      web: {
        boxShadow: '0 8px 24px rgba(31, 92, 62, 0.35)',
        cursor: 'pointer',
      },
    }),
  },
  iconContainer: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FDF7EB',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    borderWidth: 1,
    borderColor: '#E8D5B5',
    position: 'relative',
  },
  avatarEmoji: {
    fontSize: 22,
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
    borderColor: '#1F5C3E',
  },
  textContainer: {
    marginRight: 12,
  },
  badgeTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  badgeSubtitle: {
    fontSize: 10,
    fontWeight: '600',
    color: '#FBF0DA',
  },
  micCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#C4892E',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
