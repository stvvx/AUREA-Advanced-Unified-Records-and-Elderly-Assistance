/**
 * frontend/components/assistant/AudioVisualizer.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Premium Audio Waveform & Acoustic Ripple Visualizer for LOLO PAT.
 * Supports:
 *   - Real-time amplitude-driven harmonic waveform bars
 *   - Concentric expanding acoustic pulse ripples
 *   - Speaking / Listening / Idle state badges with Pateros Emerald & Gold theme
 *   - Senior citizen optimized high-contrast clarity
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { speechEngine } from '../../lib/speechEngine';

export type VisualizerMode = 'bars' | 'ripple' | 'combined';

interface AudioVisualizerProps {
  isActive: boolean;
  isListening?: boolean;
  mode?: VisualizerMode;
  barCount?: number;
  height?: number;
  label?: string;
  style?: any;
}

export default function AudioVisualizer({
  isActive = false,
  isListening = false,
  mode = 'combined',
  barCount = 7,
  height = 56,
  label,
  style,
}: AudioVisualizerProps) {
  // Waveform Bar Animations
  const barAnims = useRef<Animated.Value[]>(
    Array.from({ length: barCount }, () => new Animated.Value(0.2))
  ).current;

  // Concentric Ripple Animations
  const rippleAnim1 = useRef(new Animated.Value(1)).current;
  const rippleOpacity1 = useRef(new Animated.Value(0.6)).current;
  const rippleAnim2 = useRef(new Animated.Value(1)).current;
  const rippleOpacity2 = useRef(new Animated.Value(0.4)).current;

  // Amplitude subscription from speech engine
  useEffect(() => {
    const unsubscribe = speechEngine.registerVisemeListener((amp) => {
      if (!isActive && !isListening) return;

      const normalizedAmp = Math.max(0.15, Math.min(1.0, amp));
      barAnims.forEach((bar, idx) => {
        // Create harmonic bell-curve distribution across bars
        const distanceToCenter = Math.abs(idx - Math.floor(barCount / 2));
        const falloff = Math.max(0.4, 1.0 - distanceToCenter * 0.18);
        const targetHeight = normalizedAmp * falloff + (Math.random() * 0.2 - 0.1);

        Animated.timing(bar, {
          toValue: Math.max(0.15, Math.min(1.0, targetHeight)),
          duration: 60,
          useNativeDriver: false,
        }).start();
      });
    });

    return () => unsubscribe();
  }, [isActive, isListening, barCount]);

  // Continuous fallback harmonic animation loop when active
  useEffect(() => {
    if (isActive || isListening) {
      // Harmonic wave loops with staggered durations
      const loops = barAnims.map((anim, idx) => {
        const duration = 240 + (idx % 3) * 90;
        return Animated.loop(
          Animated.sequence([
            Animated.timing(anim, {
              toValue: 0.3 + ((idx * 7) % 6) * 0.12,
              duration,
              useNativeDriver: false,
            }),
            Animated.timing(anim, {
              toValue: 0.85 - ((idx * 3) % 4) * 0.1,
              duration: duration * 1.1,
              useNativeDriver: false,
            }),
            Animated.timing(anim, {
              toValue: 0.25,
              duration: duration * 0.9,
              useNativeDriver: false,
            }),
          ])
        );
      });

      loops.forEach((loop) => loop.start());

      // Concentric Ripple Pulse Loops
      const r1 = Animated.loop(
        Animated.parallel([
          Animated.timing(rippleAnim1, {
            toValue: 1.6,
            duration: 1400,
            useNativeDriver: true,
          }),
          Animated.sequence([
            Animated.timing(rippleOpacity1, { toValue: 0.5, duration: 200, useNativeDriver: true }),
            Animated.timing(rippleOpacity1, { toValue: 0, duration: 1200, useNativeDriver: true }),
          ]),
        ])
      );

      const r2 = Animated.loop(
        Animated.sequence([
          Animated.delay(600),
          Animated.parallel([
            Animated.timing(rippleAnim2, {
              toValue: 1.8,
              duration: 1400,
              useNativeDriver: true,
            }),
            Animated.sequence([
              Animated.timing(rippleOpacity2, { toValue: 0.4, duration: 200, useNativeDriver: true }),
              Animated.timing(rippleOpacity2, { toValue: 0, duration: 1200, useNativeDriver: true }),
            ]),
          ]),
        ])
      );

      r1.start();
      r2.start();

      return () => {
        loops.forEach((loop) => loop.stop());
        r1.stop();
        r2.stop();
      };
    } else {
      barAnims.forEach((anim) => {
        Animated.timing(anim, {
          toValue: 0.18,
          duration: 200,
          useNativeDriver: false,
        }).start();
      });
      rippleAnim1.setValue(1);
      rippleOpacity1.setValue(0);
      rippleAnim2.setValue(1);
      rippleOpacity2.setValue(0);
    }
  }, [isActive, isListening]);

  // Primary color palette
  const activeColor = isListening ? '#2563EB' : '#C4892E'; // Blue for listening, Gold for Lolo speaking
  const bgBadgeColor = isListening ? 'rgba(37,99,235,0.1)' : 'rgba(196,137,46,0.12)';
  const textColor = isListening ? '#1D4ED8' : '#92400E';

  const defaultLabel = isListening
    ? '🎙️ Nakikinig si Lolo Pat...'
    : isActive
    ? '🔊 Nagsasalita si Lolo Pat...'
    : '💤 Tahimik / Nakatayo si Lolo';

  return (
    <View style={[styles.container, style]}>
      {/* Background Acoustic Ripples (if mode includes ripple) */}
      {(mode === 'ripple' || mode === 'combined') && (isActive || isListening) && (
        <View style={styles.rippleContainer} pointerEvents="none">
          <Animated.View
            style={[
              styles.rippleRing,
              {
                borderColor: activeColor,
                transform: [{ scale: rippleAnim1 }],
                opacity: rippleOpacity1,
              },
            ]}
          />
          <Animated.View
            style={[
              styles.rippleRing,
              {
                borderColor: activeColor,
                transform: [{ scale: rippleAnim2 }],
                opacity: rippleOpacity2,
              },
            ]}
          />
        </View>
      )}

      {/* Waveform Bars */}
      {(mode === 'bars' || mode === 'combined') && (
        <View style={[styles.barsRow, { height }]}>
          {barAnims.map((anim, idx) => (
            <Animated.View
              key={idx}
              style={[
                styles.barTrack,
                {
                  height: '100%',
                },
              ]}
            >
              <Animated.View
                style={[
                  styles.barFill,
                  {
                    backgroundColor: isListening ? '#3B82F6' : '#E8A838',
                    transform: [{ scaleY: anim }],
                  },
                ]}
              />
            </Animated.View>
          ))}
        </View>
      )}

      {/* Visual State Label Badge */}
      <View style={[styles.statusBadge, { backgroundColor: bgBadgeColor }]}>
        <View
          style={[
            styles.statusDot,
            { backgroundColor: isActive || isListening ? activeColor : '#9CA3AF' },
          ]}
        />
        <Text style={[styles.statusLabel, { color: textColor }]}>
          {label || defaultLabel}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    position: 'relative',
  },
  rippleContainer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rippleRing: {
    position: 'absolute',
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 2,
  },
  barsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 16,
  },
  barTrack: {
    width: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  barFill: {
    width: '100%',
    height: '100%',
    borderRadius: 4,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    marginTop: 8,
    gap: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusLabel: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});
