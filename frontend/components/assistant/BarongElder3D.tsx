/**
 * frontend/components/assistant/BarongElder3D.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * 3D Animated Avatar Component for LOLO PAT.
 * Supports:
 *   - Three.js WebGL 3D character with Barong Tagalog, silver hair, and gold eyeglasses
 *   - GLB / GLTF model loader support with procedural fallback
 *   - Real-time viseme lip-sync subscription from speechEngine
 *   - Interactive OrbitControls / drag-to-rotate & tilt interaction
 *   - Native mobile (Android & iOS) visual animation with waving avatar and audio wave
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Platform, Text, Image, TouchableOpacity, Animated } from 'react-native';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { speechEngine } from '../../lib/speechEngine';

import { Emotion } from '../../types/lolo';

interface BarongElder3DProps {
  isSpeaking?: boolean;
  emotion?: Emotion;
  modelUrl?: string;
  onTapAvatar?: () => void;
  style?: any;
  height?: number;
}

export default function BarongElder3D({
  isSpeaking = false,
  emotion = 'neutral',
  modelUrl,
  onTapAvatar,
  style,
  height = 340,
}: BarongElder3DProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const animFrameIdRef = useRef<number | null>(null);

  // Native Mobile Animations
  const floatAnim = useRef(new Animated.Value(0)).current;
  const waveScaleAnim = useRef(new Animated.Value(1)).current;

  // References to animated 3D parts
  const headRef = useRef<THREE.Group | null>(null);
  const jawRef = useRef<THREE.Mesh | null>(null);
  const leftEyeRef = useRef<THREE.Mesh | null>(null);
  const rightEyeRef = useRef<THREE.Mesh | null>(null);
  const leftEyelidRef = useRef<THREE.Mesh | null>(null);
  const rightEyelidRef = useRef<THREE.Mesh | null>(null);
  const leftBrowRef = useRef<THREE.Mesh | null>(null);
  const rightBrowRef = useRef<THREE.Mesh | null>(null);
  const leftCheekRef = useRef<THREE.Mesh | null>(null);
  const rightCheekRef = useRef<THREE.Mesh | null>(null);
  const upperLipRef = useRef<THREE.Mesh | null>(null);
  const lowerLipRef = useRef<THREE.Mesh | null>(null);
  const mouthBackRef = useRef<THREE.Mesh | null>(null);
  const rightArmRef = useRef<THREE.Group | null>(null);
  const chestRef = useRef<THREE.Group | null>(null);

  // Emotion ref for smooth animation lerp
  const emotionRef = useRef<Emotion>(emotion);
  useEffect(() => {
    emotionRef.current = emotion;
  }, [emotion]);

  // Viseme Lip-Sync Animation values (Phase 12)
  const currentMouthOpenRef = useRef<number>(0);
  const targetMouthOpenRef = useRef<number>(0);
  const currentMouthWidthRef = useRef<number>(1.0);
  const targetMouthWidthRef = useRef<number>(1.0);
  const currentMouthPuckerRef = useRef<number>(1.0);
  const targetMouthPuckerRef = useRef<number>(1.0);
  const blinkTimerRef = useRef<number>(0);
  const isBlinkingRef = useRef<boolean>(false);
  const waveTimerRef = useRef<number>(120);

  // ── Viseme Subscription (Phoneme Shape Mapping) ───────────────────────────
  useEffect(() => {
    const unsubscribe = speechEngine.registerVisemeListener((amplitude, phoneme) => {
      const p = (phoneme || 'A').toUpperCase();
      switch (p) {
        case 'A':
          targetMouthOpenRef.current = amplitude * 1.0;
          targetMouthWidthRef.current = 1.0;
          targetMouthPuckerRef.current = 1.0;
          break;
        case 'E':
        case 'I':
          targetMouthOpenRef.current = amplitude * 0.55;
          targetMouthWidthRef.current = 1.35;
          targetMouthPuckerRef.current = 0.8;
          break;
        case 'O':
          targetMouthOpenRef.current = amplitude * 0.8;
          targetMouthWidthRef.current = 0.85;
          targetMouthPuckerRef.current = 1.3;
          break;
        case 'U':
          targetMouthOpenRef.current = amplitude * 0.45;
          targetMouthWidthRef.current = 0.65;
          targetMouthPuckerRef.current = 1.45;
          break;
        case 'M':
        case 'B':
        case 'P':
          targetMouthOpenRef.current = 0.04;
          targetMouthWidthRef.current = 0.95;
          targetMouthPuckerRef.current = 1.0;
          break;
        case 'SILENCE':
        case 'NEUTRAL':
        default:
          targetMouthOpenRef.current = 0.0;
          targetMouthWidthRef.current = 1.0;
          targetMouthPuckerRef.current = 1.0;
          break;
      }
    });
    return () => unsubscribe();
  }, []);

  // ── Three.js WebGL Character Setup (Web & Desktop) ────────────────────────
  useEffect(() => {
    if (Platform.OS !== 'web' || !mountRef.current) return;

    const container = mountRef.current;
    let width = container.clientWidth || container.offsetWidth || 340;
    if (width === 0 && typeof window !== 'undefined') {
      width = Math.min(window.innerWidth - 32, 600);
    }
    const canvasHeight = height;

    // 1. Scene Setup
    const scene = new THREE.Scene();
    scene.background = null;

    // 2. Camera Setup
    const camera = new THREE.PerspectiveCamera(36, width / canvasHeight, 0.1, 100);
    camera.position.set(0, 1.45, 3.2);
    camera.lookAt(0, 1.32, 0);

    // 3. WebGL Renderer
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, canvasHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.outline = 'none';

    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }
    container.appendChild(renderer.domElement);

    // 4. Lighting
    const ambientLight = new THREE.AmbientLight(0xfff5ea, 1.4);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xfffaed, 1.8);
    keyLight.position.set(2.5, 4.0, 3.0);
    keyLight.castShadow = true;
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xd5ede0, 1.0);
    fillLight.position.set(-3.0, 2.0, 2.0);
    scene.add(fillLight);

    const goldRimLight = new THREE.DirectionalLight(0xffcb6b, 1.6);
    goldRimLight.position.set(0, 3.0, -2.5);
    scene.add(goldRimLight);

    // 5. Load GLB Model or Build Procedural Character
    const characterRoot = new THREE.Group();
    scene.add(characterRoot);

    if (modelUrl) {
      const loader = new GLTFLoader();
      loader.load(
        modelUrl,
        (gltf) => {
          const model = gltf.scene;
          model.position.set(0, 0, 0);
          model.scale.set(1, 1, 1);
          characterRoot.add(model);
        },
        undefined,
        (error) => {
          console.warn('[BarongElder3D] Failed to load GLB model, using procedural mesh:', error);
          buildProceduralBarongElder(characterRoot);
        }
      );
    } else {
      buildProceduralBarongElder(characterRoot);
    }

    function buildProceduralBarongElder(root: THREE.Group) {
      const barongMaterial = new THREE.MeshStandardMaterial({
        color: 0xfdfaf2,
        roughness: 0.5,
        metalness: 0.08,
      });

      const embroideryMaterial = new THREE.MeshStandardMaterial({
        color: 0xdfc499,
        roughness: 0.35,
        metalness: 0.35,
      });

      const camisaMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.7,
      });

      const pantsMaterial = new THREE.MeshStandardMaterial({
        color: 0x14231b,
        roughness: 0.8,
      });

      const skinMaterial = new THREE.MeshStandardMaterial({
        color: 0xc89d76,
        roughness: 0.65,
        metalness: 0.02,
      });

      const hairMaterial = new THREE.MeshStandardMaterial({
        color: 0xf2f2f2,
        roughness: 0.55,
        metalness: 0.12,
      });

      const browMaterial = new THREE.MeshStandardMaterial({
        color: 0xc0c0c0,
        roughness: 0.7,
      });

      const glassesMaterial = new THREE.MeshStandardMaterial({
        color: 0xdaa520,
        metalness: 0.85,
        roughness: 0.2,
      });

      const lensMaterial = new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        transmission: 0.9,
        opacity: 0.95,
        transparent: true,
        roughness: 0.05,
        ior: 1.5,
      });

      const lipMaterial = new THREE.MeshStandardMaterial({ color: 0xb5786b, roughness: 0.5 });
      const innerMouthMaterial = new THREE.MeshBasicMaterial({ color: 0x3b1212 });
      const teethMaterial = new THREE.MeshStandardMaterial({ color: 0xfbfbfb, roughness: 0.2 });

      // Torso / Barong
      const chestGroup = new THREE.Group();
      chestGroup.position.set(0, 0.95, 0);
      root.add(chestGroup);
      chestRef.current = chestGroup;

      const torsoGeo = new THREE.CylinderGeometry(0.36, 0.32, 0.75, 24);
      const torsoMesh = new THREE.Mesh(torsoGeo, barongMaterial);
      chestGroup.add(torsoMesh);

      const camisaGeo = new THREE.CylinderGeometry(0.24, 0.28, 0.3, 16);
      const camisaMesh = new THREE.Mesh(camisaGeo, camisaMaterial);
      camisaMesh.position.set(0, 0.3, 0.05);
      chestGroup.add(camisaMesh);

      const collarGeo = new THREE.TorusGeometry(0.18, 0.025, 12, 24, Math.PI * 1.6);
      const collarMesh = new THREE.Mesh(collarGeo, barongMaterial);
      collarMesh.rotation.x = Math.PI / 2;
      collarMesh.position.set(0, 0.4, 0.02);
      chestGroup.add(collarMesh);

      const pecheraGeo = new THREE.PlaneGeometry(0.22, 0.44);
      const pecheraMesh = new THREE.Mesh(pecheraGeo, embroideryMaterial);
      pecheraMesh.position.set(0, 0.12, 0.365);
      chestGroup.add(pecheraMesh);

      const stripeGeo = new THREE.BoxGeometry(0.018, 0.44, 0.005);
      const leftStripe = new THREE.Mesh(stripeGeo, embroideryMaterial);
      leftStripe.position.set(-0.085, 0.12, 0.37);
      const rightStripe = new THREE.Mesh(stripeGeo, embroideryMaterial);
      rightStripe.position.set(0.085, 0.12, 0.37);
      chestGroup.add(leftStripe, rightStripe);

      for (let i = 0; i < 4; i++) {
        const btnGeo = new THREE.SphereGeometry(0.013, 10, 10);
        const btnMesh = new THREE.Mesh(btnGeo, embroideryMaterial);
        btnMesh.position.set(0, 0.27 - i * 0.09, 0.376);
        chestGroup.add(btnMesh);
      }

      const slacksGeo = new THREE.CylinderGeometry(0.33, 0.36, 0.6, 20);
      const slacksMesh = new THREE.Mesh(slacksGeo, pantsMaterial);
      slacksMesh.position.set(0, -0.65, 0);
      chestGroup.add(slacksMesh);

      // Left Arm
      const leftArmGroup = new THREE.Group();
      leftArmGroup.position.set(-0.4, 0.3, 0);
      const leftSleeveGeo = new THREE.CylinderGeometry(0.1, 0.09, 0.55, 16);
      const leftSleeveMesh = new THREE.Mesh(leftSleeveGeo, barongMaterial);
      leftSleeveMesh.position.set(0, -0.25, 0);
      leftArmGroup.add(leftSleeveMesh);

      const leftHandGeo = new THREE.SphereGeometry(0.065, 12, 12);
      const leftHandMesh = new THREE.Mesh(leftHandGeo, skinMaterial);
      leftHandMesh.position.set(0, -0.55, 0);
      leftArmGroup.add(leftHandMesh);
      chestGroup.add(leftArmGroup);

      // Right Arm (Waving gesture)
      const rightArmGroup = new THREE.Group();
      rightArmGroup.position.set(0.4, 0.3, 0);
      rightArmRef.current = rightArmGroup;

      const rightSleeveGeo = new THREE.CylinderGeometry(0.1, 0.09, 0.55, 16);
      const rightSleeveMesh = new THREE.Mesh(rightSleeveGeo, barongMaterial);
      rightSleeveMesh.position.set(0, -0.25, 0);
      rightArmGroup.add(rightSleeveMesh);

      const rightHandGeo = new THREE.SphereGeometry(0.065, 12, 12);
      const rightHandMesh = new THREE.Mesh(rightHandGeo, skinMaterial);
      rightHandMesh.position.set(0, -0.55, 0);
      rightArmGroup.add(rightHandMesh);
      chestGroup.add(rightArmGroup);

      // Head & Neck
      const headGroup = new THREE.Group();
      headGroup.position.set(0, 1.42, 0);
      root.add(headGroup);
      headRef.current = headGroup;

      const neckGeo = new THREE.CylinderGeometry(0.13, 0.15, 0.22, 16);
      const neckMesh = new THREE.Mesh(neckGeo, skinMaterial);
      neckMesh.position.set(0, -0.12, 0);
      headGroup.add(neckMesh);

      const craniumGeo = new THREE.SphereGeometry(0.24, 32, 28);
      const craniumMesh = new THREE.Mesh(craniumGeo, skinMaterial);
      headGroup.add(craniumMesh);

      // Jaw / Chin (Mouth animation target)
      const jawGroup = new THREE.Mesh();
      jawGroup.position.set(0, -0.06, 0.06);
      headGroup.add(jawGroup);
      jawRef.current = jawGroup;

      const chinGeo = new THREE.SphereGeometry(0.14, 20, 16);
      const chinMesh = new THREE.Mesh(chinGeo, skinMaterial);
      chinMesh.position.set(0, -0.08, 0.08);
      chinMesh.scale.set(0.9, 0.7, 0.9);
      jawGroup.add(chinMesh);

      const lowerLipGeo = new THREE.TorusGeometry(0.045, 0.012, 8, 16, Math.PI);
      const lowerLipMesh = new THREE.Mesh(lowerLipGeo, lipMaterial);
      lowerLipMesh.position.set(0, -0.05, 0.19);
      jawGroup.add(lowerLipMesh);
      lowerLipRef.current = lowerLipMesh;

      const upperLipGeo = new THREE.TorusGeometry(0.048, 0.012, 8, 16, Math.PI);
      const upperLipMesh = new THREE.Mesh(upperLipGeo, lipMaterial);
      upperLipMesh.rotation.x = Math.PI;
      upperLipMesh.position.set(0, -0.085, 0.215);
      headGroup.add(upperLipMesh);
      upperLipRef.current = upperLipMesh;

      const mouthBackGeo = new THREE.PlaneGeometry(0.08, 0.04);
      const mouthBackMesh = new THREE.Mesh(mouthBackGeo, innerMouthMaterial);
      mouthBackMesh.position.set(0, -0.09, 0.18);
      headGroup.add(mouthBackMesh);
      mouthBackRef.current = mouthBackMesh;

      const upperTeethGeo = new THREE.BoxGeometry(0.06, 0.015, 0.01);
      const upperTeethMesh = new THREE.Mesh(upperTeethGeo, teethMaterial);
      upperTeethMesh.position.set(0, -0.08, 0.19);
      headGroup.add(upperTeethMesh);

      // Nose
      const noseGeo = new THREE.ConeGeometry(0.045, 0.11, 12);
      const noseMesh = new THREE.Mesh(noseGeo, skinMaterial);
      noseMesh.position.set(0, -0.02, 0.255);
      noseMesh.rotation.x = -Math.PI / 10;
      headGroup.add(noseMesh);

      // Cheeks
      const leftCheek = new THREE.Mesh(new THREE.SphereGeometry(0.08, 16, 16), skinMaterial);
      leftCheek.position.set(-0.14, -0.04, 0.15);
      leftCheek.scale.set(1, 0.8, 0.8);
      const rightCheek = new THREE.Mesh(new THREE.SphereGeometry(0.08, 16, 16), skinMaterial);
      rightCheek.position.set(0.14, -0.04, 0.15);
      rightCheek.scale.set(1, 0.8, 0.8);
      headGroup.add(leftCheek, rightCheek);
      leftCheekRef.current = leftCheek;
      rightCheekRef.current = rightCheek;

      // Eyes
      const scleraMaterial = new THREE.MeshBasicMaterial({ color: 0xf5f5f5 });
      const irisMaterial = new THREE.MeshBasicMaterial({ color: 0x3d2714 });
      const pupilMaterial = new THREE.MeshBasicMaterial({ color: 0x050505 });

      const eyeGeo = new THREE.SphereGeometry(0.038, 16, 16);
      const irisGeo = new THREE.SphereGeometry(0.022, 12, 12);
      const pupilGeo = new THREE.SphereGeometry(0.012, 10, 10);

      const leftEyeGroup = new THREE.Group();
      leftEyeGroup.position.set(-0.08, 0.045, 0.2);
      const leftSclera = new THREE.Mesh(eyeGeo, scleraMaterial);
      const leftIris = new THREE.Mesh(irisGeo, irisMaterial);
      leftIris.position.set(0, 0, 0.025);
      const leftPupil = new THREE.Mesh(pupilGeo, pupilMaterial);
      leftPupil.position.set(0, 0, 0.034);
      leftEyeGroup.add(leftSclera, leftIris, leftPupil);
      headGroup.add(leftEyeGroup);
      leftEyeRef.current = leftSclera;

      const rightEyeGroup = new THREE.Group();
      rightEyeGroup.position.set(0.08, 0.045, 0.2);
      const rightSclera = new THREE.Mesh(eyeGeo, scleraMaterial);
      const rightIris = new THREE.Mesh(irisGeo, irisMaterial);
      rightIris.position.set(0, 0, 0.025);
      const rightPupil = new THREE.Mesh(pupilGeo, pupilMaterial);
      rightPupil.position.set(0, 0, 0.034);
      rightEyeGroup.add(rightSclera, rightIris, rightPupil);
      headGroup.add(rightEyeGroup);
      rightEyeRef.current = rightSclera;

      // Eyelids
      const eyelidGeo = new THREE.SphereGeometry(0.042, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2);
      const leftEyelid = new THREE.Mesh(eyelidGeo, skinMaterial);
      leftEyelid.position.set(-0.08, 0.048, 0.2);
      leftEyelid.rotation.x = -Math.PI / 2;
      headGroup.add(leftEyelid);
      leftEyelidRef.current = leftEyelid;

      const rightEyelid = new THREE.Mesh(eyelidGeo, skinMaterial);
      rightEyelid.position.set(0.08, 0.048, 0.2);
      rightEyelid.rotation.x = -Math.PI / 2;
      headGroup.add(rightEyelid);
      rightEyelidRef.current = rightEyelid;

      // Eyebrows
      const browGeo = new THREE.BoxGeometry(0.09, 0.016, 0.025);
      const leftBrow = new THREE.Mesh(browGeo, browMaterial);
      leftBrow.position.set(-0.085, 0.1, 0.215);
      leftBrow.rotation.z = -0.08;
      const rightBrow = new THREE.Mesh(browGeo, browMaterial);
      rightBrow.position.set(0.085, 0.1, 0.215);
      rightBrow.rotation.z = 0.08;
      headGroup.add(leftBrow, rightBrow);
      leftBrowRef.current = leftBrow;
      rightBrowRef.current = rightBrow;

      // Eyeglasses
      const glassesGroup = new THREE.Group();
      glassesGroup.position.set(0, 0.045, 0.235);
      headGroup.add(glassesGroup);

      const frameGeo = new THREE.TorusGeometry(0.052, 0.006, 10, 24);
      const leftFrame = new THREE.Mesh(frameGeo, glassesMaterial);
      leftFrame.position.set(-0.08, 0, 0);
      const rightFrame = new THREE.Mesh(frameGeo, glassesMaterial);
      rightFrame.position.set(0.08, 0, 0);

      const lensGeo = new THREE.CircleGeometry(0.048, 20);
      const leftLens = new THREE.Mesh(lensGeo, lensMaterial);
      leftLens.position.set(-0.08, 0, 0.002);
      const rightLens = new THREE.Mesh(lensGeo, lensMaterial);
      rightLens.position.set(0.08, 0, 0.002);

      const bridgeGeo = new THREE.CylinderGeometry(0.005, 0.005, 0.06, 8);
      const bridge = new THREE.Mesh(bridgeGeo, glassesMaterial);
      bridge.rotation.z = Math.PI / 2;
      bridge.position.set(0, 0.01, 0);

      glassesGroup.add(leftFrame, rightFrame, leftLens, rightLens, bridge);

      // Silver Hair
      const hairCapGeo = new THREE.SphereGeometry(0.248, 24, 20, 0, Math.PI * 2, 0, Math.PI / 1.6);
      const hairCapMesh = new THREE.Mesh(hairCapGeo, hairMaterial);
      hairCapMesh.position.set(0, 0.02, -0.01);
      headGroup.add(hairCapMesh);

      for (let j = 0; j < 14; j++) {
        const strandGeo = new THREE.SphereGeometry(0.045, 8, 8);
        const strandMesh = new THREE.Mesh(strandGeo, hairMaterial);
        const angle = (j / 14) * Math.PI - Math.PI / 2;
        strandMesh.position.set(Math.sin(angle) * 0.21, 0.18, Math.cos(angle) * 0.16);
        strandMesh.scale.set(1.4, 0.5, 0.8);
        headGroup.add(strandMesh);
      }
    }

    // 6. Interactive Drag / Orbit
    let isPointerDown = false;
    let prevPointerX = 0;
    let targetRotationY = 0;

    const onPointerDown = (e: any) => {
      isPointerDown = true;
      prevPointerX = e.clientX || (e.touches && e.touches[0]?.clientX) || 0;
    };

    const onPointerMove = (e: any) => {
      if (!isPointerDown) return;
      const currentX = e.clientX || (e.touches && e.touches[0]?.clientX) || 0;
      const deltaX = currentX - prevPointerX;
      prevPointerX = currentX;
      targetRotationY += deltaX * 0.008;
    };

    const onPointerUp = () => {
      isPointerDown = false;
    };

    const domElement = renderer.domElement;
    domElement.addEventListener('mousedown', onPointerDown);
    window.addEventListener('mousemove', onPointerMove);
    window.addEventListener('mouseup', onPointerUp);
    domElement.addEventListener('touchstart', onPointerDown, { passive: true });
    window.addEventListener('touchmove', onPointerMove, { passive: true });
    window.addEventListener('touchend', onPointerUp);

    // 7. Animation Loop (Phase 10: Idle & Talking Animation Blend)
    let clock = 0;
    let talkingWeight = 0; // 0 = fully idle, 1 = fully talking (smoothly lerped)

    const animate = () => {
      animFrameIdRef.current = requestAnimationFrame(animate);
      clock += 0.025;

      // Smoothly transition between Idle and Talking animation states
      const targetTalkingWeight = isSpeaking ? 1.0 : 0.0;
      talkingWeight += (targetTalkingWeight - talkingWeight) * 0.12;

      // Character Base Orientation & Drag-to-rotate
      characterRoot.rotation.y += (targetRotationY - characterRoot.rotation.y) * 0.08;

      // ── 1. BREATHING & TORSO IDLE / TALKING POSTURE ──────────────────────
      const idleBreathe = Math.sin(clock * 1.3) * 0.016;
      const talkingBreathe = Math.sin(clock * 3.0) * 0.012;
      const breathe = THREE.MathUtils.lerp(idleBreathe, talkingBreathe, talkingWeight);

      if (chestRef.current) {
        chestRef.current.position.y = 0.95 + breathe;
        // Lean slightly forward while talking for attentive engagement
        const targetTorsoTilt = THREE.MathUtils.lerp(breathe * 0.4, 0.035 + breathe * 0.3, talkingWeight);
        chestRef.current.rotation.x = targetTorsoTilt;
        // Subtle side sway
        chestRef.current.rotation.z = Math.sin(clock * 0.7) * 0.012;
      }

      // ── 2. EMOTION FACIAL & POSTURAL MORPH TARGETS (Phase 11) ───────────
      const currentEmotion = emotionRef.current || 'neutral';
      let targetBrowY = 0.1;
      let targetBrowRotZ = 0.08;
      let targetCheekScale = 1.0;
      let targetEmotionHeadTilt = 0;
      let targetEmotionHeadPitch = 0;
      let targetArmPoseZ = -0.1;
      let targetArmPoseX = 0;

      switch (currentEmotion) {
        case 'happy':
          targetBrowY = 0.112;
          targetBrowRotZ = 0.04;
          targetCheekScale = 1.25;
          targetEmotionHeadTilt = 0.04;
          targetEmotionHeadPitch = 0.02;
          break;
        case 'excited':
          targetBrowY = 0.13;
          targetBrowRotZ = 0.02;
          targetCheekScale = 1.35;
          targetEmotionHeadTilt = 0.08;
          targetEmotionHeadPitch = 0.04;
          targetArmPoseZ = -0.4;
          targetArmPoseX = -0.3;
          break;
        case 'sad':
          targetBrowY = 0.088;
          targetBrowRotZ = -0.06;
          targetCheekScale = 0.88;
          targetEmotionHeadTilt = -0.04;
          targetEmotionHeadPitch = -0.07;
          break;
        case 'thinking':
          targetBrowY = 0.118;
          targetBrowRotZ = 0.13;
          targetCheekScale = 1.0;
          targetEmotionHeadTilt = 0.15;
          targetEmotionHeadPitch = 0.05;
          // Hand to chin thoughtful pose
          targetArmPoseZ = -0.85;
          targetArmPoseX = -0.55;
          break;
        case 'surprised':
          targetBrowY = 0.142;
          targetBrowRotZ = 0.0;
          targetCheekScale = 1.1;
          targetEmotionHeadTilt = -0.02;
          targetEmotionHeadPitch = 0.06;
          break;
        case 'sleepy':
          targetBrowY = 0.08;
          targetBrowRotZ = 0.02;
          targetCheekScale = 0.95;
          targetEmotionHeadTilt = 0.05;
          targetEmotionHeadPitch = -0.09;
          break;
        case 'neutral':
        default:
          targetBrowY = 0.1;
          targetBrowRotZ = 0.08;
          targetCheekScale = 1.0;
          targetEmotionHeadTilt = 0.0;
          targetEmotionHeadPitch = 0.0;
          break;
      }

      // Smoothly apply Eyebrow emotional modulation
      if (leftBrowRef.current && rightBrowRef.current) {
        leftBrowRef.current.position.y += (targetBrowY - leftBrowRef.current.position.y) * 0.1;
        rightBrowRef.current.position.y += (targetBrowY - rightBrowRef.current.position.y) * 0.1;
        leftBrowRef.current.rotation.z += (-targetBrowRotZ - leftBrowRef.current.rotation.z) * 0.1;
        rightBrowRef.current.rotation.z += (targetBrowRotZ - rightBrowRef.current.rotation.z) * 0.1;
      }

      // Smoothly apply Cheek smile lift modulation
      if (leftCheekRef.current && rightCheekRef.current) {
        const currentScale = leftCheekRef.current.scale.x;
        const newScale = currentScale + (targetCheekScale - currentScale) * 0.1;
        leftCheekRef.current.scale.set(newScale, newScale * 0.8, newScale * 0.8);
        rightCheekRef.current.scale.set(newScale, newScale * 0.8, newScale * 0.8);
      }

      // ── 3. HEAD IDLE MICRO-SWAY & TALKING NODDING ────────────────────────
      if (headRef.current) {
        headRef.current.position.y = 1.42 + breathe * 1.4;

        // Idle head sway vs Talking conversational head cadence + Emotion offsets
        const idleHeadRotY = Math.sin(clock * 0.6) * 0.035;
        const talkingHeadRotY = Math.sin(clock * 2.2) * 0.06;
        headRef.current.rotation.y = THREE.MathUtils.lerp(idleHeadRotY, talkingHeadRotY, talkingWeight);

        // Conversational head nod while talking + Emotion pitch
        const idleHeadRotX = Math.sin(clock * 1.0) * 0.015;
        const talkingHeadNod = Math.sin(clock * 4.8) * 0.045 + 0.02;
        const baseRotX = THREE.MathUtils.lerp(idleHeadRotX, talkingHeadNod, talkingWeight);
        headRef.current.rotation.x = baseRotX + targetEmotionHeadPitch;

        // Head tilt with emotional lean
        const headTilt = Math.sin(clock * 1.4) * 0.02 + targetEmotionHeadTilt;
        headRef.current.rotation.z = headTilt;
      }

      // ── 4. MOUTH & JAW REAL-TIME VISEME LIP-SYNC (Phase 12) ───────────────
      currentMouthOpenRef.current += (targetMouthOpenRef.current - currentMouthOpenRef.current) * 0.42;
      currentMouthWidthRef.current += (targetMouthWidthRef.current - currentMouthWidthRef.current) * 0.35;
      currentMouthPuckerRef.current += (targetMouthPuckerRef.current - currentMouthPuckerRef.current) * 0.35;

      if (jawRef.current) {
        jawRef.current.position.y = -0.06 - currentMouthOpenRef.current * 0.052;
        jawRef.current.rotation.x = currentMouthOpenRef.current * 0.28;
        jawRef.current.scale.set(currentMouthWidthRef.current, 1, currentMouthPuckerRef.current);
      }
      if (lowerLipRef.current) {
        lowerLipRef.current.scale.set(
          currentMouthWidthRef.current,
          1 + currentMouthOpenRef.current * 0.3,
          currentMouthPuckerRef.current
        );
      }
      if (upperLipRef.current) {
        upperLipRef.current.scale.set(
          currentMouthWidthRef.current,
          1,
          currentMouthPuckerRef.current
        );
      }
      if (mouthBackRef.current) {
        mouthBackRef.current.scale.set(
          currentMouthWidthRef.current,
          1 + currentMouthOpenRef.current * 1.5,
          1
        );
      }

      // ── 5. EYE BLINKING & GAZE TRACKING ──────────────────────────────────
      blinkTimerRef.current++;
      // Sleepy blinks more frequently, surprised blinks less
      const blinkThreshold = currentEmotion === 'sleepy' ? 90 : currentEmotion === 'surprised' ? 300 : 160;
      if (blinkTimerRef.current > blinkThreshold && !isBlinkingRef.current) {
        isBlinkingRef.current = true;
        blinkTimerRef.current = 0;
      }
      if (isBlinkingRef.current) {
        if (leftEyelidRef.current && rightEyelidRef.current) {
          leftEyelidRef.current.rotation.x = 0;
          rightEyelidRef.current.rotation.x = 0;
        }
        if (blinkTimerRef.current > 7) {
          isBlinkingRef.current = false;
          if (leftEyelidRef.current && rightEyelidRef.current) {
            // If sleepy, eyelids remain half-closed at resting state
            const restingEyelid = currentEmotion === 'sleepy' ? -Math.PI / 3.2 : -Math.PI / 2;
            leftEyelidRef.current.rotation.x = restingEyelid;
            rightEyelidRef.current.rotation.x = restingEyelid;
          }
        }
      }

      // Gaze shift micro-movements
      const gazeX = Math.sin(clock * 0.4) * 0.005;
      const gazeY = Math.cos(clock * 0.5) * 0.004 + (currentEmotion === 'thinking' ? 0.012 : 0);
      if (leftEyeRef.current && rightEyeRef.current) {
        leftEyeRef.current.position.x = -0.08 + gazeX;
        leftEyeRef.current.position.y = 0.045 + gazeY;
        rightEyeRef.current.position.x = 0.08 + gazeX;
        rightEyeRef.current.position.y = 0.045 + gazeY;
      }

      // ── 6. ARM GESTURING (WAVING, THINKING & TALKING ACCENTS) ────────────
      if (waveTimerRef.current > 0 && rightArmRef.current) {
        waveTimerRef.current--;
        const waveAngle = Math.sin(clock * 8.0) * 0.25;
        rightArmRef.current.rotation.z = -1.2 + waveAngle;
        rightArmRef.current.rotation.x = -0.4;
      } else if (rightArmRef.current) {
        // Conversational subtle hand gesture when talking + emotion posture
        const talkingHandGesture = Math.sin(clock * 3.5) * 0.08;
        const targetArmZ = THREE.MathUtils.lerp(targetArmPoseZ, -0.22 + talkingHandGesture, talkingWeight);
        const targetArmX = THREE.MathUtils.lerp(targetArmPoseX, -0.15 + talkingHandGesture * 0.5, talkingWeight);
        rightArmRef.current.rotation.z += (targetArmZ - rightArmRef.current.rotation.z) * 0.1;
        rightArmRef.current.rotation.x += (targetArmX - rightArmRef.current.rotation.x) * 0.1;
      }

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);
      domElement.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('mousemove', onPointerMove);
      window.removeEventListener('mouseup', onPointerUp);
      domElement.removeEventListener('touchstart', onPointerDown);
      window.removeEventListener('touchmove', onPointerMove);
      window.removeEventListener('touchend', onPointerUp);
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [height, modelUrl]);

  return (
    <View style={[styles.container, { height }, style]}>
      {Platform.OS === 'web' ? (
        <div
          ref={mountRef}
          style={{
            width: '100%',
            height: '100%',
            position: 'relative',
            cursor: 'grab',
            minHeight: height,
          }}
          onClick={onTapAvatar}
        />
      ) : (
        <TouchableOpacity
          style={styles.nativeAvatarTouch}
          activeOpacity={0.9}
          onPress={onTapAvatar}
          accessibilityLabel="Lolo Pat 3D Avatar"
        >
          {/* Animated Glow Aura */}
          <Animated.View
            style={[
              styles.nativeGlowRing,
              { transform: [{ scale: waveScaleAnim }] },
            ]}
          />

          {/* Floating Avatar Mascot */}
          <Animated.View
            style={[
              styles.nativeMascotWrap,
              { transform: [{ translateY: floatAnim }] },
            ]}
          >
            <Image
              source={require('../../assets/images/lolo_aurea_mascot.jpg')}
              style={styles.nativeMascotImg}
              resizeMode="contain"
            />
          </Animated.View>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  nativeAvatarTouch: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nativeGlowRing: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(30, 96, 255, 0.08)',
    borderWidth: 2,
    borderColor: 'rgba(30, 96, 255, 0.15)',
  },
  nativeMascotWrap: {
    width: 190,
    height: 230,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nativeMascotImg: {
    width: '100%',
    height: '100%',
  },
});
