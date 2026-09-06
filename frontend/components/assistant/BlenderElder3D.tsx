import React, { useEffect, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import { GLView } from 'expo-gl';
import { Renderer, THREE } from 'expo-three';
import { Asset } from 'expo-asset';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import { speechEngine } from '../../lib/speechEngine';

type BlenderElder3DProps = {
  isSpeaking?: boolean;
  height?: number;
};

export default function BlenderElder3D({
  isSpeaking = false,
  height = 300,
}: BlenderElder3DProps): React.ReactElement {

  // ==================================================
  // SPEAKING STATE
  // ==================================================

  const isSpeakingRef = useRef<boolean>(isSpeaking);

  // ==================================================
  // MOUTH
  // ==================================================

  const mouthMeshRef = useRef<THREE.Mesh | null>(null);
  const mouthIndexRef = useRef<number>(-1);

  const mouthCurrentRef = useRef<number>(0);
  const mouthTargetRef = useRef<number>(0);

  // Used to know whether speechEngine is actually
  // sending us amplitude/phoneme information.
  const lastSpeechEventRef = useRef<number>(0);

  // ==================================================
  // UPDATE SPEAKING STATE
  // ==================================================

  useEffect(() => {
    isSpeakingRef.current = isSpeaking;

    if (!isSpeaking) {
      mouthTargetRef.current = 0;
    }
  }, [isSpeaking]);

  // ==================================================
  // SPEECH ENGINE → MOUTH
  // ==================================================

  useEffect(() => {
    const listener = (
      amplitude: number,
      phoneme?: string
    ) => {

      lastSpeechEventRef.current = Date.now();

      // If we're not supposed to be speaking,
      // force the mouth closed.
      if (!isSpeakingRef.current) {
        mouthTargetRef.current = 0;
        return;
      }

      const sound =
        (phoneme || '').toUpperCase();

      // ----------------------------------------------
      // M / B / P
      // ----------------------------------------------

      if (
        sound === 'M' ||
        sound === 'B' ||
        sound === 'P'
      ) {
        mouthTargetRef.current = 0.05;
        return;
      }

      // ----------------------------------------------
      // NORMAL SPEECH
      // ----------------------------------------------

      const value = Math.max(
        0.12,
        Math.min(
          1.0,
          amplitude * 1.5
        )
      );

      mouthTargetRef.current = value;
    };

    speechEngine.registerVisemeListener(listener);

    return () => {
      mouthTargetRef.current = 0;
    };
  }, []);

  // ==================================================
  // THREE.JS
  // ==================================================

  const onContextCreate = async (
    gl: any
  ): Promise<void> => {

    // =================================================
    // RENDERER
    // =================================================

    const renderer = new Renderer({ gl });

    renderer.setSize(
      gl.drawingBufferWidth,
      gl.drawingBufferHeight
    );

    renderer.setPixelRatio(1);

    // =================================================
    // SCENE
    // =================================================

    const scene = new THREE.Scene();

    scene.background =
      new THREE.Color(0xf5f8f2);

    // =================================================
    // CAMERA
    // =================================================

    const camera =
      new THREE.PerspectiveCamera(
        35,
        gl.drawingBufferWidth /
          gl.drawingBufferHeight,
        0.01,
        1000
      );

    camera.position.set(
      0,
      0.8,
      7
    );

    camera.lookAt(
      0,
      0.8,
      0
    );

    // =================================================
    // LIGHTING
    // =================================================

    const ambientLight =
      new THREE.AmbientLight(
        0xffffff,
        2.2
      );

    scene.add(ambientLight);

    const keyLight =
      new THREE.DirectionalLight(
        0xffffff,
        2.5
      );

    keyLight.position.set(
      3,
      5,
      6
    );

    scene.add(keyLight);

    const fillLight =
      new THREE.DirectionalLight(
        0xffffff,
        1.2
      );

    fillLight.position.set(
      -4,
      2,
      4
    );

    scene.add(fillLight);

    // =================================================
    // LOAD GLB
    // =================================================

    console.log('[LOLO] Loading GLB...');

    const asset = Asset.fromModule(
      require('../../assets/lolo.glb')
    );

    await asset.downloadAsync();

    const loader = new GLTFLoader();

    const gltf = await new Promise<any>(
      (resolve, reject) => {

        loader.load(
          asset.localUri || asset.uri,
          resolve,
          undefined,
          reject
        );

      }
    );

    console.log('[LOLO] GLB loaded');

    // =================================================
    // MODEL
    // =================================================

    const model =
      gltf.scene;

    scene.add(model);

    // =================================================
    // DEBUG ANIMATIONS
    // =================================================

    console.log(
      '[LOLO] Number of animations:',
      gltf.animations.length
    );

    console.log(
      '[LOLO] Animations:',
      gltf.animations.map(
        (clip: THREE.AnimationClip) => ({
          name: clip.name,
          duration: clip.duration,
          tracks: clip.tracks.length,
        })
      )
    );

    // =================================================
    // ANIMATION MIXER
    // =================================================

    const mixer =
      new THREE.AnimationMixer(model);

    // =================================================
    // FIND BODY ANIMATION
    // =================================================

    let bodyAnimation:
      THREE.AnimationClip | undefined;

    // First choice: Mixamo animation
    bodyAnimation =
      gltf.animations.find(
        (clip: THREE.AnimationClip) =>
          clip.name === 'mixamo.com'
      );

    // Second choice: anything that isn't a T-pose
    if (!bodyAnimation) {
      bodyAnimation =
        gltf.animations.find(
          (clip: THREE.AnimationClip) =>
            !clip.name
              .toLowerCase()
              .includes('t-pose')
        );
    }

    // Last resort: first animation
    if (!bodyAnimation && gltf.animations.length > 0) {
      bodyAnimation =
        gltf.animations[0];
    }

    // =================================================
    // PLAY BODY ANIMATION
    // =================================================

    if (bodyAnimation) {

      console.log(
        '[LOLO] PLAYING ANIMATION:',
        bodyAnimation.name
      );

      const action =
        mixer.clipAction(
          bodyAnimation
        );

      action.reset();

      action.setLoop(
        THREE.LoopRepeat,
        Infinity
      );

      action.clampWhenFinished = false;

      action.enabled = true;

      action.setEffectiveWeight(1);

      action.setEffectiveTimeScale(1);

      action.play();

    } else {

      console.warn(
        '[LOLO] NO ANIMATION FOUND IN GLB'
      );

    }

    // =================================================
    // CENTER MODEL
    // =================================================

    const box =
      new THREE.Box3().setFromObject(
        model
      );

    const center =
      new THREE.Vector3();

    box.getCenter(center);

    model.position.x -= center.x;
    model.position.y -= center.y;
    model.position.z -= center.z;

    // =================================================
    // SCALE
    // =================================================

    model.scale.set(
      3.2,
      3.2,
      3.2
    );

    model.position.y = -0.8;

    // ==================================================
// FIND MOUTH MORPH TARGET
// ==================================================

model.traverse((object: any) => {
  if (!object.isMesh) {
    return;
  }

  const mesh = object as THREE.Mesh;

  if (
    !mesh.morphTargetDictionary ||
    !mesh.morphTargetInfluences
  ) {
    return;
  }

  const dictionary = mesh.morphTargetDictionary;
  const morphNames = Object.keys(dictionary);
  const normalize = (name: string) =>
    name.toLowerCase().replace(/[_\s-]+/g, '');

  const preferredNames = [
    'mouthopen',
    'mouth',
    'jawopen',
    'jaw',
    'lipopen',
    'lipsopen',
    'lips',
    'faceopen',
  ];

  let mouthMorph = morphNames.find((name) => {
    const key = normalize(name);
    return preferredNames.some((preferred) => key.includes(preferred));
  });

  if (!mouthMorph) {
    mouthMorph = morphNames.find((name) => {
      const key = normalize(name);
      return (
        key.includes('open') ||
        key.includes('smile') ||
        key.includes('talk') ||
        key.includes('jaw') ||
        key.includes('lip')
      );
    });
  }

  if (!mouthMorph && mesh.name && mesh.name.toLowerCase().includes('mouth')) {
    mouthMorph = morphNames[0];
  }

  if (!mouthMorph && morphNames.length > 0) {
    mouthMorph = morphNames[0];
  }

  if (mouthMorph) {
    mouthMeshRef.current = mesh;
    mouthIndexRef.current = dictionary[mouthMorph];

    console.log('[LOLO] ===========================');
    console.log('[LOLO] MOUTH FOUND!');
    console.log('[LOLO] Mesh:', mesh.name);
    console.log('[LOLO] Morph:', mouthMorph);
    console.log('[LOLO] Index:', mouthIndexRef.current);
    console.log('[LOLO] Available morphs:', morphNames);
    console.log('[LOLO] ===========================');
  }
});

    // =================================================
    // CLOCK
    // =================================================

    const clock =
      new THREE.Clock();

    // =================================================
    // ANIMATION FRAME
    // =================================================

    let animationFrameId:
      number | null = null;

    // =================================================
    // RENDER LOOP
    // =================================================

    const animate = (): void => {

      animationFrameId =
        requestAnimationFrame(
          animate
        );

      // ----------------------------------------------
      // REAL TIME
      // ----------------------------------------------

      const delta =
        clock.getDelta();

      // ----------------------------------------------
      // BODY / ARMATURE ANIMATION
      // ----------------------------------------------

      mixer.update(delta);

      // ----------------------------------------------
      // MOUTH FALLBACK
      // ----------------------------------------------
      //
      // If speechEngine has not sent an event recently,
      // make the mouth move gently while isSpeaking is
      // true. This prevents the mouth from looking frozen
      // if the audio listener temporarily stops sending
      // amplitude values.
      //

      if (
        isSpeakingRef.current
      ) {

        const timeSinceSpeechEvent =
          Date.now() -
          lastSpeechEventRef.current;

        if (
          timeSinceSpeechEvent > 150
        ) {

          const time =
            clock.elapsedTime;

          const fallback =
            0.18 +
            (
              (Math.sin(time * 9) + 1) /
              2
            ) * 0.42;

          mouthTargetRef.current =
            fallback;
        }

      } else {

        mouthTargetRef.current =
          0;
      }

      // ----------------------------------------------
      // SMOOTH MOUTH
      // ----------------------------------------------

      const current =
        mouthCurrentRef.current;

      const target =
        mouthTargetRef.current;

      const smoothing =
        1 - Math.pow(
          0.001,
          delta
        );

      const next =
        current +
        (target - current) *
        smoothing;

      mouthCurrentRef.current =
        next;

      // ----------------------------------------------
      // APPLY MOUTH SHAPE KEY
      // ----------------------------------------------
      //
      // IMPORTANT:
      // This happens AFTER mixer.update().
      //
      // Therefore the speech mouth value wins if an
      // animation also touches morph targets.
      //

      const mouthMesh =
        mouthMeshRef.current;

      const mouthIndex =
        mouthIndexRef.current;

      if (
        mouthMesh &&
        mouthMesh.morphTargetInfluences &&
        mouthIndex >= 0
      ) {

        mouthMesh.morphTargetInfluences[
          mouthIndex
        ] = next;
      }

      // ----------------------------------------------
      // RENDER
      // ----------------------------------------------

      renderer.render(
        scene,
        camera
      );

      gl.endFrameEXP();
    };

    // Start everything
    animate();

    // =================================================
    // CLEANUP
    // =================================================

    (gl as any).__loloCleanup =
      () => {

        if (
          animationFrameId !== null
        ) {

          cancelAnimationFrame(
            animationFrameId
          );

          animationFrameId = null;
        }

        mixer.stopAllAction();

        mixer.uncacheRoot(model);
      };
  };

  // ==================================================
  // UI
  // ==================================================

  return (
    <View
      style={[
        styles.container,
        { height },
      ]}
    >

      <GLView
        style={styles.glView}
        onContextCreate={
          onContextCreate
        }
      />

    </View>
  );
}

// ====================================================
// STYLES
// ====================================================

const styles =
  StyleSheet.create({

    container: {
      width: '100%',
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
    },

    glView: {
      width: '100%',
      height: '100%',
    },

  });