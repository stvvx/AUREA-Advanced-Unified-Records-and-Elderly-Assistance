/**
 * frontend/components/assistant/BarongElder3D.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Lolo Pat — Pixar-Quality 3D-Shaded Clay Grandfather Avatar
 *
 * Uses advanced SVG sphere shading (multi-layer radial gradients + specular
 * highlights) to create genuine 3D depth — no CDN, no packages, works offline.
 *
 * Animation engine:
 *   - setInterval at 30fps drives mouth & blink state (reliable on Android)
 *   - Animated API drives eyelid opacity/scale (hardware-accelerated)
 *   - speechEngine.registerVisemeListener drives real-time lip-sync
 *   - setTimeout-based blink scheduler (2.5s–5s intervals, double-blink)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  Animated,
  Easing,
  TouchableOpacity,
  Platform,
} from 'react-native';
import Svg, {
  Defs,
  LinearGradient,
  RadialGradient,
  Stop,
  Path,
  Circle,
  Ellipse,
  G,
} from 'react-native-svg';
import { speechEngine } from '../../lib/speechEngine';
import { Emotion } from '../../types/lolo';

interface BarongElder3DProps {
  isSpeaking?: boolean;
  isListening?: boolean;
  emotion?: Emotion;
  onTapAvatar?: () => void;
  style?: any;
  height?: number;
  modelUrl?: string;
  videoUrl?: string;
  idleVideoUrl?: string;
}

export default function BarongElder3D({
  isSpeaking = false,
  isListening = false,
  emotion = 'neutral',
  onTapAvatar,
  style,
  height = 320,
}: BarongElder3DProps) {

  // ── Animation state (plain numbers, updated by setInterval) ─────────────────
  const [mouthOpen, setMouthOpen]   = useState(0);   // 0 (closed) → 1 (wide)
  const [blinkAmt,  setBlinkAmt]    = useState(0);   // 0 (open)   → 1 (shut)

  // Smooth targets — mutated in listeners, read in interval
  const mouthTargetRef  = useRef(0);
  const mouthCurrentRef = useRef(0);
  const blinkTargetRef  = useRef(0);
  const blinkCurrentRef = useRef(0);
  const isSpeakingRef   = useRef(isSpeaking);
  const clockRef        = useRef(0);

  // Animated values for tap + aura (hardware-accelerated, no re-render needed)
  const auraPulse  = useRef(new Animated.Value(1)).current;
  const tapBounce  = useRef(new Animated.Value(1)).current;

  useEffect(() => { isSpeakingRef.current = isSpeaking; }, [isSpeaking]);

  // ── 1. AURA GLOW WHILE SPEAKING ─────────────────────────────────────────────
  useEffect(() => {
    if (isSpeaking) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(auraPulse, { toValue: 1.06, duration: 380, useNativeDriver: true }),
          Animated.timing(auraPulse, { toValue: 0.97, duration: 380, useNativeDriver: true }),
        ])
      );
      loop.start();
      return () => { loop.stop(); auraPulse.setValue(1); };
    }
    auraPulse.setValue(1);
  }, [isSpeaking, auraPulse]);

  // ── 2. BLINK SCHEDULER — setTimeout based, reliable on all platforms ─────────
  useEffect(() => {
    let active = true;
    let tid: ReturnType<typeof setTimeout>;

    const blink = (onDone: () => void) => {
      blinkTargetRef.current = 1;
      tid = setTimeout(() => {
        blinkTargetRef.current = 0;
        onDone();
      }, 110);
    };

    const schedule = () => {
      if (!active) return;
      const delay = emotion === 'sleepy'
        ? 1600 + Math.random() * 1200
        : 2600 + Math.random() * 2600;

      tid = setTimeout(() => {
        if (!active) return;
        blink(() => {
          // 22% chance of double-blink
          if (Math.random() < 0.22) {
            tid = setTimeout(() => {
              blink(() => schedule());
            }, 110);
          } else {
            schedule();
          }
        });
      }, delay);
    };

    schedule();
    return () => { active = false; clearTimeout(tid); };
  }, [emotion]);

  // ── 3. SPEECH VISEME → MOUTH TARGET ─────────────────────────────────────────
  useEffect(() => {
    const unsub = speechEngine.registerVisemeListener((amplitude, phoneme) => {
      const p = (phoneme || 'A').toUpperCase();
      if (p === 'M' || p === 'B' || p === 'P') {
        mouthTargetRef.current = 0.04;
      } else {
        mouthTargetRef.current = Math.max(0.15, Math.min(1.0, amplitude * 1.4));
      }
    });
    return () => unsub();
  }, []);

  // Reset mouth when speaking stops
  useEffect(() => {
    if (!isSpeaking) mouthTargetRef.current = 0;
  }, [isSpeaking]);

  // ── 4. MAIN ANIMATION LOOP — setInterval at 30 FPS ──────────────────────────
  useEffect(() => {
    const INTERVAL_MS = 33; // ~30 fps
    const id = setInterval(() => {
      clockRef.current += INTERVAL_MS / 1000;

      // Desired mouth: add syllable wave when speaking
      let desiredMouth = mouthTargetRef.current;
      if (isSpeakingRef.current) {
        const wave = (Math.sin(clockRef.current * 9.5) + 1) / 2;
        desiredMouth = Math.max(0.15, desiredMouth * 0.68 + wave * 0.48);
      }

      // Smooth lerp (30fps equivalent of 60fps 0.32 factor)
      mouthCurrentRef.current += (desiredMouth - mouthCurrentRef.current) * 0.28;
      blinkCurrentRef.current += (blinkTargetRef.current - blinkCurrentRef.current) * 0.38;

      // Only call setState when value changes meaningfully (avoid jank)
      setMouthOpen(prev => {
        const next = Math.round(mouthCurrentRef.current * 1000) / 1000;
        return Math.abs(next - prev) > 0.005 ? next : prev;
      });
      setBlinkAmt(prev => {
        const next = Math.round(blinkCurrentRef.current * 1000) / 1000;
        return Math.abs(next - prev) > 0.005 ? next : prev;
      });
    }, INTERVAL_MS);

    return () => clearInterval(id);
  }, []);

  // ── TAP HANDLER ──────────────────────────────────────────────────────────────
  const handleTap = useCallback(() => {
    Animated.sequence([
      Animated.timing(tapBounce, { toValue: 1.06, duration: 80, useNativeDriver: true }),
      Animated.spring(tapBounce, { toValue: 1.0, friction: 4, tension: 50, useNativeDriver: true }),
    ]).start();
    // Quick wink
    blinkTargetRef.current = 1;
    setTimeout(() => { blinkTargetRef.current = 0; }, 100);
    onTapAvatar?.();
  }, [tapBounce, onTapAvatar]);

  // ── GEOMETRY CALCULATIONS ────────────────────────────────────────────────────
  const cx       = 160;
  const mouthCY  = 217;
  const mouthW   = 8 + mouthOpen * 40;
  const mouthH   = mouthOpen * 17;

  // Eyelid: top slides down (eyelid closes eye from above)
  // Eye centers are at cy=150. Eyelid top is ~130, closes to 165.
  const lidTopY  = 130 + blinkAmt * 35;   // slides down over the eye
  const lidAlpha = Math.min(1, blinkAmt * 1.6);

  // Emotion eyebrow offsets
  let lBrowDY = 0, rBrowDY = 0, lBrowRot = 0, rBrowRot = 0;
  switch (emotion) {
    case 'happy':    case 'excited':   lBrowDY = -7; rBrowDY = -7; break;
    case 'thinking': lBrowDY = -10; rBrowDY = 2; lBrowRot = -6; break;
    case 'sad':      lBrowDY = 5;  rBrowDY = 5; lBrowRot = 7; rBrowRot = -7; break;
    case 'surprised':lBrowDY = -14; rBrowDY = -14; break;
    case 'sleepy':   lBrowDY = 6;  rBrowDY = 6; break;
  }

  return (
    <View style={[styles.container, { height }, style]}>
      {/* Aura glow ring */}
      <Animated.View style={[
        styles.glowAura,
        {
          transform: [{ scale: auraPulse }],
          borderColor: isSpeaking ? '#C4892E' : '#1F5C3E',
          backgroundColor: isSpeaking ? 'rgba(196,137,46,0.10)' : 'rgba(31,92,62,0.05)',
        },
      ]} />

      <TouchableOpacity activeOpacity={0.94} onPress={handleTap} style={styles.touch} accessibilityLabel="Lolo Pat Avatar">
        <Animated.View style={[styles.avatarRig, { transform: [{ scale: tapBounce }] }]}>
          <Svg width={320} height={320} viewBox="0 0 320 320">
            <Defs>
              {/* 3D Skin — off-centre radial for sphere depth illusion */}
              <RadialGradient id="sk" cx="40%" cy="30%" r="60%">
                <Stop offset="0%"   stopColor="#FFE5D0" />
                <Stop offset="40%"  stopColor="#F5C0A0" />
                <Stop offset="75%"  stopColor="#E89878" />
                <Stop offset="100%" stopColor="#C87050" />
              </RadialGradient>
              <RadialGradient id="skSpec" cx="34%" cy="24%" r="22%">
                <Stop offset="0%"   stopColor="rgba(255,255,245,0.68)" />
                <Stop offset="100%" stopColor="rgba(255,255,245,0)" />
              </RadialGradient>
              <RadialGradient id="skRim" cx="88%" cy="82%" r="38%">
                <Stop offset="0%"   stopColor="rgba(185,100,65,0.42)" />
                <Stop offset="100%" stopColor="rgba(185,100,65,0)" />
              </RadialGradient>

              {/* Ear */}
              <RadialGradient id="ear" cx="38%" cy="35%" r="55%">
                <Stop offset="0%"   stopColor="#FFCFB4" />
                <Stop offset="65%"  stopColor="#E8A882" />
                <Stop offset="100%" stopColor="#C87850" />
              </RadialGradient>

              {/* Hair — grey silver */}
              <RadialGradient id="hair" cx="38%" cy="26%" r="54%">
                <Stop offset="0%"   stopColor="#FFFFFF" />
                <Stop offset="55%"  stopColor="#ECECEC" />
                <Stop offset="100%" stopColor="#C8C8C8" />
              </RadialGradient>
              <RadialGradient id="hairSpec" cx="33%" cy="22%" r="20%">
                <Stop offset="0%"   stopColor="rgba(255,255,255,0.95)" />
                <Stop offset="100%" stopColor="rgba(255,255,255,0)" />
              </RadialGradient>

              {/* Nose */}
              <RadialGradient id="nose" cx="38%" cy="30%" r="52%">
                <Stop offset="0%"   stopColor="#FFC8A4" />
                <Stop offset="60%"  stopColor="#E89874" />
                <Stop offset="100%" stopColor="#C87050" />
              </RadialGradient>
              <RadialGradient id="noseSpec" cx="32%" cy="26%" r="22%">
                <Stop offset="0%"   stopColor="rgba(255,255,255,0.60)" />
                <Stop offset="100%" stopColor="rgba(255,255,255,0)" />
              </RadialGradient>

              {/* Sweater — teal/green */}
              <LinearGradient id="sw" x1="30%" y1="0%" x2="70%" y2="100%">
                <Stop offset="0%"   stopColor="#5E9E90" />
                <Stop offset="45%"  stopColor="#4A8878" />
                <Stop offset="100%" stopColor="#326658" />
              </LinearGradient>
              <RadialGradient id="swSpec" cx="42%" cy="18%" r="35%">
                <Stop offset="0%"   stopColor="rgba(180,240,220,0.30)" />
                <Stop offset="100%" stopColor="rgba(180,240,220,0)" />
              </RadialGradient>

              {/* Collar — khaki */}
              <LinearGradient id="col" x1="0%" y1="0%" x2="0%" y2="100%">
                <Stop offset="0%"   stopColor="#AFA060" />
                <Stop offset="100%" stopColor="#887840" />
              </LinearGradient>

              {/* Eye sclera */}
              <RadialGradient id="scl" cx="38%" cy="32%" r="52%">
                <Stop offset="0%"   stopColor="#FFFFFF" />
                <Stop offset="80%"  stopColor="#EEE8E0" />
                <Stop offset="100%" stopColor="#D8D0C4" />
              </RadialGradient>

              {/* Iris — warm blue/grey */}
              <RadialGradient id="iris" cx="40%" cy="35%" r="55%">
                <Stop offset="0%"   stopColor="#6890B8" />
                <Stop offset="55%"  stopColor="#305888" />
                <Stop offset="100%" stopColor="#182848" />
              </RadialGradient>

              {/* Cheek blush */}
              <RadialGradient id="blush" cx="50%" cy="50%" r="50%">
                <Stop offset="0%"   stopColor="rgba(235,110,90,0.36)" />
                <Stop offset="100%" stopColor="rgba(235,110,90,0)" />
              </RadialGradient>

              {/* Oral cavity */}
              <RadialGradient id="oral" cx="50%" cy="8%" r="72%">
                <Stop offset="0%"   stopColor="#380A12" />
                <Stop offset="58%"  stopColor="#240508" />
                <Stop offset="100%" stopColor="#180204" />
              </RadialGradient>

              {/* Tongue */}
              <RadialGradient id="tong" cx="40%" cy="30%" r="55%">
                <Stop offset="0%"   stopColor="#F08898" />
                <Stop offset="100%" stopColor="#CC5065" />
              </RadialGradient>

              {/* Lens glass tint */}
              <RadialGradient id="lens" cx="35%" cy="30%" r="52%">
                <Stop offset="0%"   stopColor="rgba(160,200,255,0.18)" />
                <Stop offset="100%" stopColor="rgba(160,200,255,0.03)" />
              </RadialGradient>
            </Defs>

            {/* ═══════════════════════════════════════════════
                BODY — Teal shirt with khaki collar
            ═══════════════════════════════════════════════ */}
            <G id="body">
              {/* Ground shadow */}
              <Ellipse cx="160" cy="312" rx="92" ry="10" fill="rgba(0,0,0,0.12)" />
              {/* Shirt */}
              <Path d="M 50 320 C 50 248, 88 226, 160 226 C 232 226, 270 248, 270 320 Z" fill="url(#sw)" />
              <Path d="M 50 320 C 50 248, 88 226, 160 226 C 232 226, 270 248, 270 320 Z" fill="url(#swSpec)" />
              {/* Collar left */}
              <Path d="M 122 226 C 110 222, 124 198, 148 204 L 156 226 Z" fill="url(#col)" stroke="#706030" strokeWidth="1.5" />
              {/* Collar right */}
              <Path d="M 198 226 C 210 222, 196 198, 172 204 L 164 226 Z" fill="url(#col)" stroke="#706030" strokeWidth="1.5" />
              {/* Neck */}
              <Path d="M 138 222 C 138 200, 182 200, 182 222 L 184 230 L 136 230 Z" fill="url(#sk)" />
              <Path d="M 138 222 C 138 200, 182 200, 182 222 L 184 230 L 136 230 Z" fill="url(#skSpec)" />
            </G>

            {/* ═══════════════════════════════════════════════
                HEAD
            ═══════════════════════════════════════════════ */}
            <G id="head">
              {/* Head drop shadow */}
              <Ellipse cx="162" cy="226" rx="84" ry="11" fill="rgba(0,0,0,0.13)" />

              {/* ── Ears ── */}
              <Ellipse cx="70"  cy="160" rx="19" ry="26" fill="url(#ear)" />
              <Path d="M 63 152 Q 59 161 65 170" stroke="#D07858" strokeWidth="2.5" fill="none" strokeLinecap="round" />
              <Ellipse cx="250" cy="160" rx="19" ry="26" fill="url(#ear)" />
              <Path d="M 257 152 Q 261 161 255 170" stroke="#D07858" strokeWidth="2.5" fill="none" strokeLinecap="round" />

              {/* ── Face ── */}
              <Ellipse cx="160" cy="142" rx="92" ry="98" fill="url(#sk)" />
              <Ellipse cx="160" cy="142" rx="92" ry="98" fill="url(#skSpec)" />
              <Ellipse cx="160" cy="142" rx="92" ry="98" fill="url(#skRim)" />

              {/* Forehead wrinkles */}
              <Path d="M 126 88 Q 160 82 194 88" stroke="#D88060" strokeWidth="2.2" fill="none" strokeLinecap="round" />
              <Path d="M 130 98 Q 160 93 190 98" stroke="#D88060" strokeWidth="1.8" fill="none" strokeLinecap="round" />

              {/* Cheek blush */}
              <Ellipse cx="96"  cy="176" rx="30" ry="22" fill="url(#blush)" />
              <Ellipse cx="224" cy="176" rx="30" ry="22" fill="url(#blush)" />

              {/* ── Grey Hair (3D sphere clusters) ── */}
              {[
                [130, 60, 38], [160, 52, 42], [190, 60, 36],
                [106, 76, 30], [214, 76, 30],
              ].map(([hx, hy, hr], i) => (
                <G key={i}>
                  <Circle cx={hx} cy={hy} r={hr} fill="url(#hair)" />
                  <Circle cx={hx} cy={hy} r={hr} fill="url(#hairSpec)" />
                </G>
              ))}
              {[
                [80, 110, 24], [76, 136, 20],
                [240, 110, 24], [244, 136, 20],
              ].map(([hx, hy, hr], i) => (
                <G key={`s${i}`}>
                  <Circle cx={hx} cy={hy} r={hr} fill="url(#hair)" />
                  <Circle cx={hx} cy={hy} r={hr} fill="url(#hairSpec)" />
                </G>
              ))}
              <G><Circle cx={160} cy={56} r={28} fill="url(#hair)" /><Circle cx={160} cy={56} r={28} fill="url(#hairSpec)" /></G>

              {/* ── Eyes (sclera + iris + pupil + catchlights) ── */}
              {/* LEFT */}
              <Circle cx="116" cy="150" r="24" fill="url(#scl)" />
              <Circle cx="116" cy="150" r="14" fill="url(#iris)" />
              <Circle cx="116" cy="150" r="8"  fill="#0C0806" />
              <Circle cx="121" cy="144" r="4"  fill="#FFFFFF" />
              <Circle cx="111" cy="156" r="1.8" fill="rgba(255,255,255,0.55)" />

              {/* RIGHT */}
              <Circle cx="204" cy="150" r="24" fill="url(#scl)" />
              <Circle cx="204" cy="150" r="14" fill="url(#iris)" />
              <Circle cx="204" cy="150" r="8"  fill="#0C0806" />
              <Circle cx="209" cy="144" r="4"  fill="#FFFFFF" />
              <Circle cx="199" cy="156" r="1.8" fill="rgba(255,255,255,0.55)" />

              {/* ── EYELIDS (animated — slide down to close eyes) ── */}
              {blinkAmt > 0.02 && (
                <G opacity={lidAlpha}>
                  {/* Left eyelid arc */}
                  <Path
                    d={`M 92 136 Q 116 ${lidTopY} 140 136 Q 116 ${lidTopY + 8} 92 136 Z`}
                    fill="url(#sk)"
                    stroke="#C07850"
                    strokeWidth="1.8"
                  />
                  {/* Right eyelid arc */}
                  <Path
                    d={`M 180 136 Q 204 ${lidTopY} 228 136 Q 204 ${lidTopY + 8} 180 136 Z`}
                    fill="url(#sk)"
                    stroke="#C07850"
                    strokeWidth="1.8"
                  />
                </G>
              )}

              {/* ── Round Glasses ── */}
              {/* Glass tint fills */}
              <Circle cx="116" cy="150" r="30" fill="url(#lens)" />
              <Circle cx="204" cy="150" r="30" fill="url(#lens)" />
              {/* Dark frames */}
              <Circle cx="116" cy="150" r="30" fill="none" stroke="#1A1A1A" strokeWidth="5.5" />
              <Circle cx="204" cy="150" r="30" fill="none" stroke="#1A1A1A" strokeWidth="5.5" />
              {/* Metallic rim highlight */}
              <Path d="M 91 131 Q 103 123 118 127" stroke="#686868" strokeWidth="2" fill="none" strokeLinecap="round" />
              <Path d="M 179 131 Q 191 123 206 127" stroke="#686868" strokeWidth="2" fill="none" strokeLinecap="round" />
              {/* Bridge */}
              <Path d="M 146 148 Q 160 143 174 148" fill="none" stroke="#1A1A1A" strokeWidth="4.5" />
              {/* Temples */}
              <Path d="M 86 150 L 70 154"  stroke="#1A1A1A" strokeWidth="4" strokeLinecap="round" />
              <Path d="M 234 150 L 250 154" stroke="#1A1A1A" strokeWidth="4" strokeLinecap="round" />

              {/* ── Eyebrows (grey, emotion-morphed) ── */}
              <G transform={`translate(116, ${118 + lBrowDY}) rotate(${lBrowRot}, 0, 0)`}>
                <Path d="M -30 0 Q 0 -11 30 0 Q 0 -5 -30 0 Z" fill="url(#hair)" stroke="#B8B8B4" strokeWidth="1.5" />
              </G>
              <G transform={`translate(204, ${118 + rBrowDY}) rotate(${rBrowRot}, 0, 0)`}>
                <Path d="M -30 0 Q 0 -11 30 0 Q 0 -5 -30 0 Z" fill="url(#hair)" stroke="#B8B8B4" strokeWidth="1.5" />
              </G>

              {/* ── Nose (3D bulb + nostrils) ── */}
              <Circle cx="160" cy="184" r="17" fill="url(#nose)" />
              <Circle cx="160" cy="184" r="17" fill="url(#noseSpec)" />
              <Ellipse cx="149" cy="194" rx="7.5" ry="5.5" fill="#A86040" />
              <Ellipse cx="171" cy="194" rx="7.5" ry="5.5" fill="#A86040" />
              <Ellipse cx="149" cy="194" rx="4"   ry="3"   fill="#804028" />
              <Ellipse cx="171" cy="194" rx="4"   ry="3"   fill="#804028" />

              {/* ── Mustache (white puff clusters) ── */}
              <G id="mustache">
                <Ellipse cx="138" cy="210" rx="21" ry="13" fill="url(#hair)" />
                <Ellipse cx="138" cy="210" rx="21" ry="13" fill="url(#hairSpec)" />
                <Ellipse cx="182" cy="210" rx="21" ry="13" fill="url(#hair)" />
                <Ellipse cx="182" cy="210" rx="21" ry="13" fill="url(#hairSpec)" />
                <Ellipse cx="160" cy="208" rx="10" ry="8"  fill="url(#hair)" />
              </G>

              {/* ── MOUTH — resting smile when silent ── */}
              {mouthOpen <= 0.06 && (
                <G id="smile">
                  <Path d="M 132 220 Q 160 232 188 220" fill="none" stroke="#8C4030" strokeWidth="4" strokeLinecap="round" />
                  <Path d="M 143 226 Q 160 230 177 226" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" opacity={0.65} />
                </G>
              )}

              {/* ── MOUTH — synchronized to speech ── */}
              {mouthOpen > 0.06 && (
                <G id="talkMouth" opacity={Math.min(1.0, mouthOpen * 1.6)}>
                  {/* Oral cavity depth */}
                  <Path
                    d={`
                      M ${cx - mouthW} ${mouthCY}
                      Q ${cx} ${mouthCY - 4}
                      ${cx + mouthW} ${mouthCY}
                      Q ${cx} ${mouthCY + mouthH + 5}
                      ${cx - mouthW} ${mouthCY} Z
                    `}
                    fill="url(#oral)"
                  />

                  {/* Upper teeth */}
                  <Path
                    d={`M ${cx - mouthW + 5} ${mouthCY} Q ${cx} ${mouthCY - 4} ${cx + mouthW - 5} ${mouthCY} L ${cx + mouthW - 9} ${mouthCY + 5} Q ${cx} ${mouthCY + 1} ${cx - mouthW + 9} ${mouthCY + 5} Z`}
                    fill="#F4F0E8"
                    stroke="#E0DCD4"
                    strokeWidth="0.5"
                  />

                  {/* Lower teeth (when mouth opens more) */}
                  {mouthOpen > 0.35 && (
                    <Path
                      d={`M ${cx - mouthW + 9} ${mouthCY + mouthH - 2} Q ${cx} ${mouthCY + mouthH + 3} ${cx + mouthW - 9} ${mouthCY + mouthH - 2} L ${cx + mouthW - 13} ${mouthCY + mouthH - 6} Q ${cx} ${mouthCY + mouthH} ${cx - mouthW + 13} ${mouthCY + mouthH - 6} Z`}
                      fill="#EEECE4"
                      stroke="#DEDAD2"
                      strokeWidth="0.5"
                    />
                  )}

                  {/* Tongue */}
                  {mouthOpen > 0.28 && (
                    <Ellipse
                      cx={cx}
                      cy={mouthCY + mouthH * 0.35}
                      rx={mouthW * 0.52}
                      ry={mouthH * 0.44}
                      fill="url(#tong)"
                    />
                  )}

                  {/* Lip outlines */}
                  <Path
                    d={`M ${cx - mouthW - 4} ${mouthCY} Q ${cx} ${mouthCY - 6} ${cx + mouthW + 4} ${mouthCY}`}
                    fill="none" stroke="#8C4030" strokeWidth="3.5" strokeLinecap="round"
                  />
                  <Path
                    d={`M ${cx - mouthW} ${mouthCY} Q ${cx} ${mouthCY + mouthH + 9} ${cx + mouthW} ${mouthCY}`}
                    fill="none" stroke="#8C4030" strokeWidth="3.5" strokeLinecap="round"
                  />

                  {/* Corner dimples */}
                  <Circle cx={cx - mouthW} cy={mouthCY} r="4" fill="#B05038" />
                  <Circle cx={cx + mouthW} cy={mouthCY} r="4" fill="#B05038" />
                </G>
              )}
            </G>
          </Svg>
        </Animated.View>
      </TouchableOpacity>
    </View>
  );
}

const AVATAR_SIZE = 310;

const styles = StyleSheet.create({
  container: {
    width: '100%',
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  glowAura: {
    position: 'absolute',
    width: 300,
    height: 300,
    borderRadius: 150,
    borderWidth: 2,
  },
  touch: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarRig: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: 36,
    overflow: 'hidden',
    backgroundColor: '#F8F4EE',
    ...Platform.select({
      ios:     { shadowColor: '#1F5C3E', shadowOpacity: 0.12, shadowRadius: 12 },
      android: { elevation: 5 },
      web:     { boxShadow: '0 8px 28px rgba(31,92,62,0.12)' },
    }),
  },
});
