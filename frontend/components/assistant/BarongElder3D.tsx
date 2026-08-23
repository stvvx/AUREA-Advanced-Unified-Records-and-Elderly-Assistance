import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Platform, Text } from 'react-native';
import * as THREE from 'three';
import { speechEngine } from '../../lib/speechEngine';

interface BarongElder3DProps {
  isSpeaking?: boolean;
  onTapAvatar?: () => void;
  style?: any;
  height?: number;
}

export default function BarongElder3D({
  isSpeaking = false,
  onTapAvatar,
  style,
  height = 340,
}: BarongElder3DProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const animFrameIdRef = useRef<number | null>(null);

  // References to animated 3D parts
  const headRef = useRef<THREE.Group | null>(null);
  const jawRef = useRef<THREE.Mesh | null>(null);
  const leftEyeRef = useRef<THREE.Mesh | null>(null);
  const rightEyeRef = useRef<THREE.Mesh | null>(null);
  const leftEyelidRef = useRef<THREE.Mesh | null>(null);
  const rightEyelidRef = useRef<THREE.Mesh | null>(null);
  const rightArmRef = useRef<THREE.Group | null>(null);
  const chestRef = useRef<THREE.Group | null>(null);
  const glassesRef = useRef<THREE.Group | null>(null);

  // Animation values
  const currentMouthOpenRef = useRef<number>(0);
  const targetMouthOpenRef = useRef<number>(0);
  const blinkTimerRef = useRef<number>(0);
  const isBlinkingRef = useRef<boolean>(false);
  const waveTimerRef = useRef<number>(120);

  useEffect(() => {
    // Subscribe to speech visemes for real-time lip-sync
    const unsubscribe = speechEngine.registerVisemeListener((amplitude) => {
      targetMouthOpenRef.current = amplitude;
    });
    return () => unsubscribe();
  }, []);

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

    // Clear previous children if any
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }
    container.appendChild(renderer.domElement);

    // 4. Philippine Studio Lighting
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

    // 5. Materials
    // Barong Tagalog Piña Fabric (Ivory/Cream translucency)
    const barongMaterial = new THREE.MeshStandardMaterial({
      color: 0xfdfaf2,
      roughness: 0.5,
      metalness: 0.08,
    });

    // Pechera Embroidery Material (Golden embroidered chest)
    const embroideryMaterial = new THREE.MeshStandardMaterial({
      color: 0xdfc499,
      roughness: 0.35,
      metalness: 0.35,
    });

    // Camisa de Chino (White Undershirt)
    const camisaMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.7,
    });

    // Dark Formal Trousers (Slacks)
    const pantsMaterial = new THREE.MeshStandardMaterial({
      color: 0x14231b,
      roughness: 0.8,
    });

    // Dignified Senior Skin (Warm Filipino Tan)
    const skinMaterial = new THREE.MeshStandardMaterial({
      color: 0xc89d76,
      roughness: 0.65,
      metalness: 0.02,
    });

    // Silver-White Hair
    const hairMaterial = new THREE.MeshStandardMaterial({
      color: 0xf2f2f2,
      roughness: 0.55,
      metalness: 0.12,
    });

    // Eyebrows
    const browMaterial = new THREE.MeshStandardMaterial({
      color: 0xc0c0c0,
      roughness: 0.7,
    });

    // Gold Glasses Frame
    const glassesMaterial = new THREE.MeshStandardMaterial({
      color: 0xdaa520,
      metalness: 0.85,
      roughness: 0.2,
    });

    // Glasses Lenses
    const lensMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      transmission: 0.9,
      opacity: 0.95,
      transparent: true,
      roughness: 0.05,
      ior: 1.5,
    });

    // Lips & Mouth
    const lipMaterial = new THREE.MeshStandardMaterial({ color: 0xb5786b, roughness: 0.5 });
    const innerMouthMaterial = new THREE.MeshBasicMaterial({ color: 0x3b1212 });
    const teethMaterial = new THREE.MeshStandardMaterial({ color: 0xfbfbfb, roughness: 0.2 });

    // 6. Build Character Hierarchy
    const characterRoot = new THREE.Group();
    scene.add(characterRoot);

    // --- Torso / Barong ---
    const chestGroup = new THREE.Group();
    chestGroup.position.set(0, 0.95, 0);
    characterRoot.add(chestGroup);
    chestRef.current = chestGroup;

    // Torso Mesh
    const torsoGeo = new THREE.CylinderGeometry(0.36, 0.32, 0.75, 24);
    const torsoMesh = new THREE.Mesh(torsoGeo, barongMaterial);
    chestGroup.add(torsoMesh);

    // Inner Camisa
    const camisaGeo = new THREE.CylinderGeometry(0.24, 0.28, 0.3, 16);
    const camisaMesh = new THREE.Mesh(camisaGeo, camisaMaterial);
    camisaMesh.position.set(0, 0.3, 0.05);
    chestGroup.add(camisaMesh);

    // Mandarin Standing Collar (Cuello)
    const collarGeo = new THREE.TorusGeometry(0.18, 0.025, 12, 24, Math.PI * 1.6);
    const collarMesh = new THREE.Mesh(collarGeo, barongMaterial);
    collarMesh.rotation.x = Math.PI / 2;
    collarMesh.position.set(0, 0.4, 0.02);
    chestGroup.add(collarMesh);

    // Pechera (Embroidered Center Panel)
    const pecheraGeo = new THREE.PlaneGeometry(0.22, 0.44);
    const pecheraMesh = new THREE.Mesh(pecheraGeo, embroideryMaterial);
    pecheraMesh.position.set(0, 0.12, 0.365);
    chestGroup.add(pecheraMesh);

    // Pechera Embroidery Borders
    const stripeGeo = new THREE.BoxGeometry(0.018, 0.44, 0.005);
    const leftStripe = new THREE.Mesh(stripeGeo, embroideryMaterial);
    leftStripe.position.set(-0.085, 0.12, 0.37);
    const rightStripe = new THREE.Mesh(stripeGeo, embroideryMaterial);
    rightStripe.position.set(0.085, 0.12, 0.37);
    chestGroup.add(leftStripe, rightStripe);

    // Pearl Buttons
    for (let i = 0; i < 4; i++) {
      const btnGeo = new THREE.SphereGeometry(0.013, 10, 10);
      const btnMesh = new THREE.Mesh(btnGeo, embroideryMaterial);
      btnMesh.position.set(0, 0.27 - i * 0.09, 0.376);
      chestGroup.add(btnMesh);
    }

    // Slacks (Dark Pants)
    const slacksGeo = new THREE.CylinderGeometry(0.33, 0.36, 0.6, 20);
    const slacksMesh = new THREE.Mesh(slacksGeo, pantsMaterial);
    slacksMesh.position.set(0, -0.65, 0);
    chestGroup.add(slacksMesh);

    // Arms
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
    const rightSleeveGeo = new THREE.CylinderGeometry(0.1, 0.09, 0.55, 16);
    const rightSleeveMesh = new THREE.Mesh(rightSleeveGeo, barongMaterial);
    rightSleeveMesh.position.set(0, -0.25, 0);
    rightArmGroup.add(rightSleeveMesh);

    const cuffGeo = new THREE.CylinderGeometry(0.095, 0.095, 0.05, 16);
    const cuffMesh = new THREE.Mesh(cuffGeo, embroideryMaterial);
    cuffMesh.position.set(0, -0.5, 0);
    rightArmGroup.add(cuffMesh);

    const rightHandGeo = new THREE.SphereGeometry(0.065, 12, 12);
    const rightHandMesh = new THREE.Mesh(rightHandGeo, skinMaterial);
    rightHandMesh.position.set(0, -0.55, 0);
    rightArmGroup.add(rightHandMesh);
    chestGroup.add(rightArmGroup);
    rightArmRef.current = rightArmGroup;

    // --- Head Group ---
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 1.48, 0);
    characterRoot.add(headGroup);
    headRef.current = headGroup;

    // Head Mesh
    const headGeo = new THREE.SphereGeometry(0.24, 32, 28);
    headGeo.scale(0.9, 1.1, 0.95);
    const headMesh = new THREE.Mesh(headGeo, skinMaterial);
    headGroup.add(headMesh);

    // Neck
    const neckGeo = new THREE.CylinderGeometry(0.12, 0.14, 0.22, 16);
    const neckMesh = new THREE.Mesh(neckGeo, skinMaterial);
    neckMesh.position.set(0, -0.16, 0);
    headGroup.add(neckMesh);

    // Silver Hair
    const hairGroup = new THREE.Group();
    const hairBaseGeo = new THREE.SphereGeometry(0.255, 24, 20);
    hairBaseGeo.scale(0.92, 1.08, 0.98);
    const hairBaseMesh = new THREE.Mesh(hairBaseGeo, hairMaterial);
    hairBaseMesh.position.set(0, 0.05, -0.03);
    hairGroup.add(hairBaseMesh);

    const leftSideHairGeo = new THREE.BoxGeometry(0.05, 0.16, 0.12);
    const leftSideHair = new THREE.Mesh(leftSideHairGeo, hairMaterial);
    leftSideHair.position.set(-0.21, -0.02, 0.02);
    const rightSideHair = new THREE.Mesh(leftSideHairGeo, hairMaterial);
    rightSideHair.position.set(0.21, -0.02, 0.02);
    hairGroup.add(leftSideHair, rightSideHair);

    const topHairGeo = new THREE.SphereGeometry(0.16, 16, 12);
    const topHairMesh = new THREE.Mesh(topHairGeo, hairMaterial);
    topHairMesh.position.set(-0.06, 0.2, 0.05);
    topHairMesh.scale.set(1.4, 0.5, 1.1);
    hairGroup.add(topHairMesh);
    headGroup.add(hairGroup);

    // Eyebrows
    const browGeo = new THREE.BoxGeometry(0.07, 0.018, 0.02);
    const leftBrow = new THREE.Mesh(browGeo, browMaterial);
    leftBrow.position.set(-0.09, 0.085, 0.22);
    leftBrow.rotation.z = 0.08;
    const rightBrow = new THREE.Mesh(browGeo, browMaterial);
    rightBrow.position.set(0.09, 0.085, 0.22);
    rightBrow.rotation.z = -0.08;
    headGroup.add(leftBrow, rightBrow);

    // Eyes
    const eyeGeo = new THREE.SphereGeometry(0.035, 16, 16);
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.1 });
    const irisMat = new THREE.MeshBasicMaterial({ color: 0x3d2714 });

    const leftEyeMesh = new THREE.Mesh(eyeGeo, eyeMat);
    leftEyeMesh.position.set(-0.085, 0.03, 0.195);
    const leftIris = new THREE.Mesh(new THREE.SphereGeometry(0.018, 12, 12), irisMat);
    leftIris.position.set(0, 0, 0.025);
    leftEyeMesh.add(leftIris);
    headGroup.add(leftEyeMesh);
    leftEyeRef.current = leftEyeMesh;

    const rightEyeMesh = new THREE.Mesh(eyeGeo, eyeMat);
    rightEyeMesh.position.set(0.085, 0.03, 0.195);
    const rightIris = new THREE.Mesh(new THREE.SphereGeometry(0.018, 12, 12), irisMat);
    rightIris.position.set(0, 0, 0.025);
    rightEyeMesh.add(rightIris);
    headGroup.add(rightEyeMesh);
    rightEyeRef.current = rightEyeMesh;

    // Eyelids (Blinking)
    const eyelidGeo = new THREE.SphereGeometry(0.038, 16, 16, 0, Math.PI * 2, 0, Math.PI * 0.5);
    const leftEyelid = new THREE.Mesh(eyelidGeo, skinMaterial);
    leftEyelid.position.set(-0.085, 0.035, 0.195);
    leftEyelid.rotation.x = -Math.PI / 2;
    leftEyelid.scale.set(1, 0.1, 1);
    headGroup.add(leftEyelid);
    leftEyelidRef.current = leftEyelid;

    const rightEyelid = new THREE.Mesh(eyelidGeo, skinMaterial);
    rightEyelid.position.set(0.085, 0.035, 0.195);
    rightEyelid.rotation.x = -Math.PI / 2;
    rightEyelid.scale.set(1, 0.1, 1);
    headGroup.add(rightEyelid);
    rightEyelidRef.current = rightEyelid;

    // Nose
    const noseGeo = new THREE.ConeGeometry(0.035, 0.09, 12);
    const noseMesh = new THREE.Mesh(noseGeo, skinMaterial);
    noseMesh.position.set(0, 0.01, 0.245);
    noseMesh.rotation.x = -0.3;
    headGroup.add(noseMesh);

    // Mustache
    const stacheGeo = new THREE.BoxGeometry(0.1, 0.022, 0.018);
    const stacheMesh = new THREE.Mesh(stacheGeo, hairMaterial);
    stacheMesh.position.set(0, -0.065, 0.225);
    headGroup.add(stacheMesh);

    // Mouth / Jaw (Lip-Sync Rig)
    const jawMesh = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.025, 0.03), lipMaterial);
    jawMesh.position.set(0, -0.11, 0.21);
    headGroup.add(jawMesh);
    jawRef.current = jawMesh;

    const mouthCavity = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.03, 0.02), innerMouthMaterial);
    mouthCavity.position.set(0, -0.1, 0.2);
    headGroup.add(mouthCavity);

    const topTeeth = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.01, 0.01), teethMaterial);
    topTeeth.position.set(0, -0.095, 0.205);
    headGroup.add(topTeeth);

    // Gold Glasses
    const glassesGroup = new THREE.Group();
    glassesGroup.position.set(0, 0.035, 0.21);

    const leftRingGeo = new THREE.TorusGeometry(0.046, 0.005, 8, 24);
    const leftRing = new THREE.Mesh(leftRingGeo, glassesMaterial);
    leftRing.position.set(-0.085, 0, 0);
    const leftLens = new THREE.Mesh(new THREE.CircleGeometry(0.044, 16), lensMaterial);
    leftLens.position.set(-0.085, 0, 0);
    glassesGroup.add(leftRing, leftLens);

    const rightRingGeo = new THREE.TorusGeometry(0.046, 0.005, 8, 24);
    const rightRing = new THREE.Mesh(rightRingGeo, glassesMaterial);
    rightRing.position.set(0.085, 0, 0);
    const rightLens = new THREE.Mesh(new THREE.CircleGeometry(0.044, 16), lensMaterial);
    rightLens.position.set(0.085, 0, 0);
    glassesGroup.add(rightRing, rightLens);

    const bridgeGeo = new THREE.CylinderGeometry(0.004, 0.004, 0.06, 8);
    const bridge = new THREE.Mesh(bridgeGeo, glassesMaterial);
    bridge.rotation.z = Math.PI / 2;
    bridge.position.set(0, 0.01, 0);
    glassesGroup.add(bridge);

    const templeGeo = new THREE.CylinderGeometry(0.003, 0.003, 0.2, 8);
    const leftTemple = new THREE.Mesh(templeGeo, glassesMaterial);
    leftTemple.rotation.x = Math.PI / 2;
    leftTemple.position.set(-0.13, 0.01, -0.1);
    const rightTemple = new THREE.Mesh(templeGeo, glassesMaterial);
    rightTemple.rotation.x = Math.PI / 2;
    rightTemple.position.set(0.13, 0.01, -0.1);
    glassesGroup.add(leftTemple, rightTemple);

    headGroup.add(glassesGroup);
    glassesRef.current = glassesGroup;

    // 7. Interactive Dragging / Orbit
    let isDragging = false;
    let previousMousePosition = { x: 0, y: 0 };
    let targetRotationY = 0;
    let targetRotationX = 0;

    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      isDragging = true;
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      previousMousePosition = { x: clientX, y: clientY };
    };

    const onPointerMove = (e: MouseEvent | TouchEvent) => {
      if (!isDragging) return;
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      const deltaX = clientX - previousMousePosition.x;
      const deltaY = clientY - previousMousePosition.y;

      targetRotationY += deltaX * 0.008;
      targetRotationX += deltaY * 0.005;
      targetRotationY = Math.max(-0.6, Math.min(0.6, targetRotationY));
      targetRotationX = Math.max(-0.25, Math.min(0.25, targetRotationX));

      previousMousePosition = { x: clientX, y: clientY };
    };

    const onPointerUp = () => {
      isDragging = false;
    };

    const domElement = renderer.domElement;
    domElement.addEventListener('mousedown', onPointerDown);
    window.addEventListener('mousemove', onPointerMove);
    window.addEventListener('mouseup', onPointerUp);
    domElement.addEventListener('touchstart', onPointerDown);
    window.addEventListener('touchmove', onPointerMove);
    window.addEventListener('touchend', onPointerUp);

    // 8. Animation Loop
    let clock = new THREE.Clock();

    const animate = () => {
      animFrameIdRef.current = requestAnimationFrame(animate);
      const elapsedTime = clock.getElapsedTime();

      if (!isDragging) {
        targetRotationY *= 0.96;
        targetRotationX *= 0.96;
      }

      // Breathing
      const breath = Math.sin(elapsedTime * 1.8) * 0.015;
      if (chestRef.current) {
        chestRef.current.position.y = 0.95 + breath;
        chestRef.current.scale.set(1 + breath * 0.5, 1 + breath, 1 + breath * 0.5);
      }

      // Head Sway
      if (headRef.current) {
        const idleHeadSway = Math.sin(elapsedTime * 1.2) * 0.03;
        headRef.current.rotation.y = targetRotationY + idleHeadSway;
        headRef.current.rotation.x = targetRotationX;
        headRef.current.rotation.z = -idleHeadSway * 0.5;
        headRef.current.position.y = 1.48 + breath * 0.8;
      }

      // Lip-Sync Morphing
      currentMouthOpenRef.current +=
        (targetMouthOpenRef.current - currentMouthOpenRef.current) * 0.35;

      if (jawRef.current) {
        const mouthOpen = currentMouthOpenRef.current;
        jawRef.current.position.y = -0.11 - mouthOpen * 0.045;
        jawRef.current.scale.set(1 + mouthOpen * 0.4, 1 + mouthOpen * 2.2, 1);
      }

      // Eye Blinking
      blinkTimerRef.current += 1;
      if (blinkTimerRef.current > 180 + Math.random() * 80) {
        isBlinkingRef.current = true;
        blinkTimerRef.current = 0;
      }

      if (leftEyelidRef.current && rightEyelidRef.current) {
        if (isBlinkingRef.current) {
          leftEyelidRef.current.scale.y = 1.0;
          rightEyelidRef.current.scale.y = 1.0;
          setTimeout(() => {
            isBlinkingRef.current = false;
          }, 120);
        } else {
          leftEyelidRef.current.scale.y = 0.1;
          rightEyelidRef.current.scale.y = 0.1;
        }
      }

      // Hand Wave
      if (waveTimerRef.current > 0 && rightArmRef.current) {
        waveTimerRef.current -= 1;
        const waveAngle = Math.sin(elapsedTime * 7.0) * 0.35;
        rightArmRef.current.rotation.z = -1.2 + waveAngle;
        rightArmRef.current.rotation.x = -0.4;
      } else if (rightArmRef.current) {
        rightArmRef.current.rotation.z = -0.1;
        rightArmRef.current.rotation.x = 0;
      }

      renderer.render(scene, camera);
    };

    animate();

    // 9. Resize Handling
    const handleResize = () => {
      if (!container) return;
      const newWidth = container.clientWidth || container.offsetWidth || 340;
      camera.aspect = newWidth / canvasHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(newWidth, canvasHeight);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
      }
      window.removeEventListener('resize', handleResize);
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
  }, [height]);

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
        <View style={styles.nativeFallback}>
          <Text style={styles.nativeBadge}>🇵🇭 Lolo Aurea (3D Barong Assistant)</Text>
        </View>
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
  nativeFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(31,92,62,0.1)',
    borderRadius: 16,
    padding: 16,
  },
  nativeBadge: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F5C3E',
  },
});
