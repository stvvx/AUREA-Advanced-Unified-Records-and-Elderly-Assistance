import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Image } from 'react-native';
import { GLView } from 'expo-gl';
import type { ExpoWebGLRenderingContext } from 'expo-gl';
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import 'expo-three/build/polyfillTextureLoader.fx';

import { speechEngine } from '../../lib/speechEngine';

type BlenderElder3DProps = {
  isSpeaking?: boolean;
  height?: number;
};

// ================================================================
// TUNABLES
// ================================================================

const TARGET_HEIGHT = 3;
const CAMERA_FOV = 35;
const CAMERA_PADDING = 1.15;

// Blender mouth values
const MOUTH_CLOSED_Y = 0.003;
const MOUTH_OPEN_Y = -0.013662;
const MOUTH_OPEN_MULTIPLIER = 4;

// Blink
const BLINK_DURATION = 0.10;
const MIN_BLINK_INTERVAL = 2.0;
const MAX_BLINK_INTERVAL = 7.0;

// ================================================================
// HELPERS
// ================================================================

const bytesToBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  const chunkSize = 0x8000;

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(
      ...bytes.subarray(offset, offset + chunkSize)
    );
  }

  return globalThis.btoa(binary);
};

const base64ToBytes = (b64: string): Uint8Array => {
  const bin = globalThis.atob(b64);
  const out = new Uint8Array(bin.length);

  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i);
  }

  return out;
};

const withTimeout = <T,>(
  p: Promise<T>,
  ms: number,
  label: string
): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const t = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms}ms`)),
      ms
    );

    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });

const getImageSize = (
  uri: string
): Promise<{ width: number; height: number }> =>
  new Promise((resolve, reject) =>
    Image.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      reject
    )
  );

// Remove every "...Texture" reference.
const stripTextureRefs = (obj: any): void => {
  if (!obj || typeof obj !== 'object') {
    return;
  }

  for (const key of Object.keys(obj)) {
    if (key.endsWith('Texture')) {
      delete obj[key];
    } else if (typeof obj[key] === 'object') {
      stripTextureRefs(obj[key]);
    }
  }
};

type TextureFile = {
  uri: string;
  width: number;
  height: number;
};

type PreparedGlb = {
  glb: ArrayBuffer;
  textureFiles: Record<number, TextureFile>;
  baseColorImage: Record<number, number>;
};

// ================================================================
// PREPARE GLB
// ================================================================

/**
 * GLTFLoader in React Native has problems decoding embedded images.
 * Extract images, remove them from the GLB, then attach textures manually.
 */
const prepareGlb = async (
  arrayBuffer: ArrayBuffer,
  cacheDirectory: string
): Promise<PreparedGlb> => {
  const dv = new DataView(arrayBuffer);

  if (dv.getUint32(0, true) !== 0x46546c67) {
    throw new Error('[LOLO] File is not a binary GLB (bad magic).');
  }

  const jsonLength = dv.getUint32(12, true);
  const jsonStart = 20;

  const binHeader = jsonStart + jsonLength;
  const binLength = dv.getUint32(binHeader, true);
  const binStart = binHeader + 8;

  const binChunk = new Uint8Array(
    arrayBuffer,
    binStart,
    binLength
  );

  const json = JSON.parse(
    new TextDecoder().decode(
      new Uint8Array(
        arrayBuffer,
        jsonStart,
        jsonLength
      )
    )
  );

  // --------------------------------------------------------------
  // Extract images
  // --------------------------------------------------------------

  const textureFiles: Record<number, TextureFile> = {};
  const images: any[] = json.images || [];

  for (let i = 0; i < images.length; i++) {
    const img = images[i];

    if (img.bufferView === undefined) {
      continue;
    }

    const bv = json.bufferViews[img.bufferView];

    const offset = bv.byteOffset || 0;

    const bytes = binChunk.subarray(
      offset,
      offset + bv.byteLength
    );

    const ext =
      img.mimeType === 'image/jpeg'
        ? 'jpg'
        : img.mimeType === 'image/webp'
          ? 'webp'
          : 'png';

    const uri =
      `${cacheDirectory}lolo_texture_${i}.${ext}`;

    await FileSystem.writeAsStringAsync(
      uri,
      bytesToBase64(bytes),
      {
        encoding: FileSystem.EncodingType.Base64,
      }
    );

    const { width, height } =
      await getImageSize(uri);

    textureFiles[i] = {
      uri,
      width,
      height,
    };

    console.log(
      `[LOLO] Texture ${i}: ${width}x${height} ${ext}`
    );
  }

  // --------------------------------------------------------------
  // Remember base-color images
  // --------------------------------------------------------------

  const baseColorImage: Record<number, number> = {};

  (json.materials || []).forEach(
    (mat: any, mi: number) => {
      const texIndex =
        mat.pbrMetallicRoughness
          ?.baseColorTexture
          ?.index;

      if (texIndex !== undefined) {
        const tex =
          json.textures?.[texIndex];

        const source =
          tex?.source ??
          tex?.extensions
            ?.EXT_texture_webp
            ?.source;

        if (source !== undefined) {
          baseColorImage[mi] = source;
        }
      }

      mat.extras = {
        ...(mat.extras || {}),
        loloMat: mi,
      };

      stripTextureRefs(mat);
    }
  );

  // --------------------------------------------------------------
  // Strip image data
  // --------------------------------------------------------------

  delete json.images;
  delete json.textures;
  delete json.samplers;

  const dropExt = (list?: string[]) =>
    list
      ? list.filter(
          (e) =>
            e !== 'EXT_texture_webp' &&
            e !== 'KHR_texture_transform'
        )
      : list;

  if (json.extensionsUsed) {
    json.extensionsUsed =
      dropExt(json.extensionsUsed);
  }

  if (json.extensionsRequired) {
    json.extensionsRequired =
      dropExt(json.extensionsRequired);
  }

  // --------------------------------------------------------------
  // Rebuild GLB
  // --------------------------------------------------------------

  const jsonBytes =
    new TextEncoder().encode(
      JSON.stringify(json)
    );

  const jsonPadded =
    Math.ceil(jsonBytes.length / 4) * 4;

  const total =
    12 +
    8 +
    jsonPadded +
    8 +
    binLength;

  const out =
    new ArrayBuffer(total);

  const outDv =
    new DataView(out);

  const outBytes =
    new Uint8Array(out);

  outDv.setUint32(
    0,
    0x46546c67,
    true
  );

  outDv.setUint32(
    4,
    2,
    true
  );

  outDv.setUint32(
    8,
    total,
    true
  );

  outDv.setUint32(
    12,
    jsonPadded,
    true
  );

  outDv.setUint32(
    16,
    0x4e4f534a,
    true
  );

  outBytes.set(
    jsonBytes,
    20
  );

  outBytes.fill(
    0x20,
    20 + jsonBytes.length,
    20 + jsonPadded
  );

  const binOut =
    20 + jsonPadded;

  outDv.setUint32(
    binOut,
    binLength,
    true
  );

  outDv.setUint32(
    binOut + 4,
    0x004e4942,
    true
  );

  outBytes.set(
    binChunk,
    binOut + 8
  );

  return {
    glb: out,
    textureFiles,
    baseColorImage,
  };
};

// ================================================================
// TEXTURE HELPER
// ================================================================

const makeTexture = (
  file: TextureFile
): THREE.Texture => {
  const tex =
    new THREE.Texture();

  (tex as any).image = {
    data: {
      localUri: file.uri,
      uri: file.uri,
      width: file.width,
      height: file.height,
    },
    width: file.width,
    height: file.height,
  };

  (tex as any).isDataTexture = true;

  tex.flipY = false;
  tex.generateMipmaps = false;

  tex.minFilter =
    THREE.LinearFilter;

  tex.magFilter =
    THREE.LinearFilter;

  tex.wrapS =
    THREE.RepeatWrapping;

  tex.wrapT =
    THREE.RepeatWrapping;

  if ('colorSpace' in tex) {
    (tex as any).colorSpace =
      THREE.SRGBColorSpace;
  }

  tex.needsUpdate = true;

  return tex;
};

// ================================================================
// COMPONENT
// ================================================================

export default function BlenderElder3D({
  isSpeaking = false,
  height = 300,
}: BlenderElder3DProps): React.ReactElement {
  const isSpeakingRef =
    useRef<boolean>(isSpeaking);

  // --------------------------------------------------------------
  // MOUTH
  // --------------------------------------------------------------

  const mouthRef =
    useRef<THREE.Object3D | null>(null);

  const mouthCurrentRef =
    useRef<number>(0);

  const mouthTargetRef =
    useRef<number>(0);

  const mouthClosedScaleYRef =
    useRef<number | null>(null);

  const mouthOpenScaleYRef =
    useRef<number | null>(null);

  const lastSpeechEventRef =
    useRef<number>(0);

  // --------------------------------------------------------------
  // EYES
  // --------------------------------------------------------------

  const eye1Ref =
    useRef<THREE.Object3D | null>(null);

  const eye2Ref =
    useRef<THREE.Object3D | null>(null);

  const eye1OpenScaleRef =
    useRef<THREE.Vector3 | null>(null);

  const eye2OpenScaleRef =
    useRef<THREE.Vector3 | null>(null);

  // --------------------------------------------------------------
  // BLINK STATE
  // --------------------------------------------------------------

  const blinkTimerRef =
    useRef<number>(0);

  const blinkDurationRef =
    useRef<number>(0);

  const nextBlinkRef =
    useRef<number>(
      MIN_BLINK_INTERVAL +
      Math.random() *
        (
          MAX_BLINK_INTERVAL -
          MIN_BLINK_INTERVAL
        )
    );

  const blinkingRef =
    useRef<boolean>(false);

  // --------------------------------------------------------------
  // CLEANUP
  // --------------------------------------------------------------

  const cleanupRef =
    useRef<(() => void) | null>(null);

  const disposedRef =
    useRef<boolean>(false);

  // ==============================================================
  // SPEAKING STATE
  // ==============================================================

  useEffect(() => {
    isSpeakingRef.current =
      isSpeaking;

    if (!isSpeaking) {
      mouthTargetRef.current = 0;
    }
  }, [isSpeaking]);

  // ==============================================================
  // TTS VISEME LISTENER
  // ==============================================================

  useEffect(() => {
    const listener = (
      amplitude: number,
      phoneme?: string
    ) => {
      lastSpeechEventRef.current =
        Date.now();

      const sound =
        (phoneme || '').toUpperCase();

      // Closed mouth sounds
      if (
        sound === 'M' ||
        sound === 'B' ||
        sound === 'P'
      ) {
        mouthTargetRef.current =
          0.05;

        return;
      }

      // Normal speech
      mouthTargetRef.current =
        Math.max(
          0.12,
          Math.min(
            1.0,
            amplitude * 1.5
          )
        );
    };

    const unsubscribe =
      speechEngine.registerVisemeListener(
        listener
      );

    return () => {
      unsubscribe();
      mouthTargetRef.current = 0;
    };
  }, []);

  // ==============================================================
  // CLEANUP EFFECT
  // ==============================================================

  useEffect(() => {
    disposedRef.current = false;

    return () => {
      disposedRef.current = true;

      cleanupRef.current?.();

      cleanupRef.current = null;
    };
  }, []);

  // ==============================================================
  // SUPPRESS EXPO GL WARNING
  // ==============================================================

  useEffect(() => {
    const suppressedMessage =
      "EXGL: gl.pixelStorei() doesn't support this parameter yet!";

    const consoleMethods = [
      'log',
      'warn',
      'error',
    ] as const;

    const originalMethods =
      consoleMethods.map(
        (method) =>
          [
            method,
            (console as any)[method],
          ] as const
      );

    for (
      const [method, original]
      of originalMethods
    ) {
      (console as any)[method] =
        (...args: unknown[]) => {
          if (
            args.some(
              (arg) =>
                typeof arg === 'string' &&
                arg.includes(
                  suppressedMessage
                )
            )
          ) {
            return;
          }

          original(...args);
        };
    }

    return () => {
      for (
        const [method, original]
        of originalMethods
      ) {
        (console as any)[method] =
          original;
      }
    };
  }, []);

  // ==============================================================
  // SETUP
  // ==============================================================

  const setup = async (
    gl: ExpoWebGLRenderingContext
  ): Promise<void> => {
    // ------------------------------------------------------------
    // GL diagnostics
    // ------------------------------------------------------------

    console.log(
      '[LOLO GL] VERSION:',
      gl.getParameter(gl.VERSION)
    );

    console.log(
      '[LOLO GL] RENDERER:',
      gl.getParameter(gl.RENDERER)
    );

    const hasWebGL2Methods =
      typeof (gl as any)
        .createVertexArray !==
      'undefined';

    console.log(
      '[LOLO GL] WebGL2:',
      hasWebGL2Methods
    );

    if (!hasWebGL2Methods) {
      console.error(
        '[LOLO GL] WebGL2 is not available on this context.'
      );

      return;
    }

    // ------------------------------------------------------------
    // WebGL2 shim
    // ------------------------------------------------------------

    const globalAny =
      globalThis as any;

    const expoGLConstructor =
      Object.getPrototypeOf(gl)
        ?.constructor;

    if (expoGLConstructor) {
      let needsShim = true;

      try {
        if (
          typeof globalAny.WebGL2RenderingContext !==
          'undefined'
        ) {
          needsShim =
            !(
              gl instanceof
              globalAny.WebGL2RenderingContext
            );
        }
      } catch {
        needsShim = true;
      }

      if (needsShim) {
        console.log(
          '[LOLO GL] Applying Expo WebGL2 compatibility shim'
        );

        globalAny.WebGL2RenderingContext =
          expoGLConstructor;

        globalAny.WebGLRenderingContext =
          function WebGLRenderingContext() {};
      }
    }

    try {
      console.log(
        '[LOLO GL] global WebGLRenderingContext:',
        typeof globalAny.WebGLRenderingContext,
        '| gl instanceof it:',
        typeof globalAny.WebGLRenderingContext !==
          'undefined'
          ? gl instanceof
            globalAny.WebGLRenderingContext
          : 'n/a'
      );

      if (
        typeof globalAny.WebGLRenderingContext !==
        'undefined'
      ) {
        Object.defineProperty(
          globalAny,
          'WebGLRenderingContext',
          {
            value:
              function WebGLRenderingContext() {},
            configurable: true,
            writable: true,
          }
        );
      }
    } catch (e) {
      console.warn(
        '[LOLO GL] Could not replace WebGLRenderingContext:',
        e
      );
    }

    // ------------------------------------------------------------
    // pixelStorei fix
    // ------------------------------------------------------------

    try {
      const originalPixelStorei =
        (gl as any)
          .pixelStorei
          .bind(gl);

      const UNSUPPORTED_PIXEL_STORE =
        new Set<number>([
          0x9243,
        ]);

      (gl as any).pixelStorei =
        (
          pname: number,
          param: any
        ) => {
          if (
            UNSUPPORTED_PIXEL_STORE.has(
              pname
            )
          ) {
            return;
          }

          originalPixelStorei(
            pname,
            param
          );
        };
    } catch (e) {
      console.warn(
        '[LOLO GL] Could not wrap pixelStorei:',
        e
      );
    }

    // ------------------------------------------------------------
    // Fake canvas
    // ------------------------------------------------------------

    const fakeCanvas = {
      width:
        gl.drawingBufferWidth,

      height:
        gl.drawingBufferHeight,

      style: {},

      clientWidth:
        gl.drawingBufferWidth,

      clientHeight:
        gl.drawingBufferHeight,

      addEventListener: () => {},

      removeEventListener: () => {},

      getContext: () => gl,

      setAttribute: () => {},

      removeAttribute: () => {},
    };

    // ------------------------------------------------------------
    // Renderer
    // ------------------------------------------------------------

    console.log(
      '[LOLO GL] Creating THREE.WebGLRenderer...'
    );

    const renderer =
      new THREE.WebGLRenderer({
        canvas:
          fakeCanvas as unknown as HTMLCanvasElement,

        context:
          gl as unknown as WebGL2RenderingContext,

        antialias: true,

        alpha: false,
      });

    console.log(
      '[LOLO GL] THREE.WebGLRenderer created successfully'
    );

    renderer.setSize(
      gl.drawingBufferWidth,
      gl.drawingBufferHeight,
      false
    );

    renderer.setPixelRatio(1);

    // ------------------------------------------------------------
    // Scene
    // ------------------------------------------------------------

    const scene =
      new THREE.Scene();

    scene.background =
      new THREE.Color(0xf5f8f2);

    // ------------------------------------------------------------
    // Camera
    // ------------------------------------------------------------

    const camera =
      new THREE.PerspectiveCamera(
        CAMERA_FOV,
        gl.drawingBufferWidth /
          gl.drawingBufferHeight,
        0.01,
        1000
      );

    camera.position.set(
      0,
      0,
      6
    );

    // ------------------------------------------------------------
    // Lights
    // ------------------------------------------------------------

    scene.add(
      new THREE.AmbientLight(
        0xffffff,
        2.2
      )
    );

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

    scene.add(
      new THREE.HemisphereLight(
        0xffffff,
        0x99a3ad,
        1.2
      )
    );

    // ============================================================
    // LOAD GLB
    // ============================================================

    console.log(
      '[LOLO] Loading GLB...'
    );

    const asset =
      Asset.fromModule(
        require('../../assets/lolo.glb')
      );

    await asset.downloadAsync();

    const glbUri =
      asset.localUri ||
      asset.uri;

    if (!glbUri) {
      throw new Error(
        '[LOLO] GLB URI is missing.'
      );
    }

    const fileInfo =
      await FileSystem.getInfoAsync(
        glbUri
      );

    if (!fileInfo.exists) {
      throw new Error(
        `[LOLO] GLB file does not exist: ${glbUri}`
      );
    }

    const base64 =
      await FileSystem.readAsStringAsync(
        glbUri,
        {
          encoding:
            FileSystem.EncodingType.Base64,
        }
      );

    const glbBytes =
      base64ToBytes(base64);

    console.log(
      '[LOLO] GLB bytes:',
      glbBytes.byteLength
    );

    const cacheDirectory =
      FileSystem.cacheDirectory;

    if (!cacheDirectory) {
      throw new Error(
        '[LOLO] Cache directory is unavailable.'
      );
    }

    // ------------------------------------------------------------
    // navigator shim
    // ------------------------------------------------------------

    const navigatorAny =
      (globalThis as any)
        .navigator;

    if (
      navigatorAny &&
      typeof navigatorAny.userAgent !==
        'string'
    ) {
      Object.defineProperty(
        navigatorAny,
        'userAgent',
        {
          value:
            'React Native',
          configurable: true,
        }
      );
    }

    // ------------------------------------------------------------
    // Prepare GLB
    // ------------------------------------------------------------

    console.log(
      '[LOLO] Preparing GLB...'
    );

    const prepared =
      await withTimeout(
        prepareGlb(
          glbBytes.buffer as ArrayBuffer,
          cacheDirectory
        ),
        60000,
        'prepareGlb'
      );

    // ------------------------------------------------------------
    // Parse GLB
    // ------------------------------------------------------------

    console.log(
      '[LOLO] Parsing GLB...'
    );

    const loader =
      new GLTFLoader();

    const gltf: any =
      await withTimeout(
        new Promise<any>(
          (resolve, reject) =>
            loader.parse(
              prepared.glb,
              '',
              resolve,
              reject
            )
        ),
        30000,
        'GLTF parse'
      );

    console.log(
      '[LOLO] GLB parsed successfully'
    );

    if (disposedRef.current) {
      renderer.dispose();
      return;
    }

    const model: THREE.Object3D =
      gltf.scene;

    scene.add(model);

    // ============================================================
    // TEXTURES
    // ============================================================

    const textureCache:
      Record<number, THREE.Texture> = {};

    model.traverse(
      (object: any) => {
        if (!object.isMesh) {
          return;
        }

        object.frustumCulled =
          false;

        const mats =
          Array.isArray(object.material)
            ? object.material
            : [object.material];

        mats.forEach(
          (mat: any) => {
            if (!mat) {
              return;
            }

            console.log(
              '[LOLO] Material:',
              mat.name,
              {
                metalness:
                  mat.metalness,

                roughness:
                  mat.roughness,

                color:
                  mat.color
                    ?.getHexString?.(),

                hasEnvMap:
                  !!mat.envMap,
              }
            );

            if (
              typeof mat.metalness ===
              'number'
            ) {
              mat.metalness = 0;
              mat.roughness = 0.8;
              mat.needsUpdate = true;
            }

            const mi =
              mat?.userData?.loloMat;

            if (
              mi === undefined
            ) {
              return;
            }

            const imageIndex =
              prepared
                .baseColorImage[mi];

            const file =
              imageIndex !==
              undefined
                ? prepared
                    .textureFiles[
                      imageIndex
                    ]
                : undefined;

            if (!file) {
              return;
            }

            if (
              !textureCache[
                imageIndex
              ]
            ) {
              textureCache[
                imageIndex
              ] =
                makeTexture(file);
            }

            mat.map =
              textureCache[
                imageIndex
              ];

            mat.needsUpdate =
              true;
          }
        );
      }
    );

    // ============================================================
    // FIND HEAD / EYES / MOUTH
    // ============================================================

    let foundHeadBone:
      THREE.Object3D | null = null;

    let foundEye1:
      THREE.Object3D | null = null;

    let foundEye2:
      THREE.Object3D | null = null;

    let foundMouth:
      THREE.Object3D | null = null;

    model.traverse(
      (object: THREE.Object3D) => {
        console.log(
          '[LOLO OBJECT]',
          object.name,
          object.type
        );

        const lowerName =
          (object.name || '')
            .toLowerCase();

        const normalizedName =
          lowerName
            .replace(
              /[^a-z0-9]/g,
              ''
            );

        // --------------------------------------------------------
        // MIXAMO HEAD
        // --------------------------------------------------------

        const isHead =
          lowerName ===
            'mixamorig:head' ||
          lowerName ===
            'mixamorighead' ||
          normalizedName ===
            'mixamorighead' ||
          normalizedName.endsWith(
            'mixamorighead'
          );

        if (isHead) {
          foundHeadBone =
            object;

          console.log(
            '[LOLO] HEAD FOUND EXACT:',
            object.name,
            object.type
          );
        }

        // --------------------------------------------------------
        // EYES
        // --------------------------------------------------------

        if (
          object.name ===
          'eye1'
        ) {
          foundEye1 =
            object;
        }

        if (
          object.name ===
          'eye2'
        ) {
          foundEye2 =
            object;
        }

        // --------------------------------------------------------
        // MOUTH
        // --------------------------------------------------------

        if (
          object.name ===
          'mouth'
        ) {
          foundMouth =
            object;
        }
      }
    );

    // Explicit references avoid TypeScript
    // narrowing issues with traverse callbacks.

    const headBone =
      foundHeadBone as THREE.Object3D | null;

    const eye1 =
      foundEye1 as THREE.Object3D | null;

    const eye2 =
      foundEye2 as THREE.Object3D | null;

    const mouth =
      foundMouth as THREE.Object3D | null;

    console.log(
      '[LOLO] HEAD FOUND:',
      headBone
        ? headBone.name
        : 'NOT FOUND'
    );

    console.log(
      '[LOLO] EYE1 FOUND:',
      eye1
        ? eye1.name
        : 'NOT FOUND'
    );

    console.log(
      '[LOLO] EYE2 FOUND:',
      eye2
        ? eye2.name
        : 'NOT FOUND'
    );

    console.log(
      '[LOLO] MOUTH FOUND:',
      mouth
        ? mouth.name
        : 'NOT FOUND'
    );

    // NOTE: eye/mouth refs and eye "open scale" are captured further
    // below, AFTER the eyes/mouth are reparented onto the head bone.
    // Capturing them here (before attach) was the bug: attach()
    // rewrites local .scale to preserve world-space size under the
    // new parent, so a scale cached before attach() no longer matches
    // reality. Restoring that stale scale at the end of every blink
    // caused the eyes to shrink to ~invisible after the first blink.

    // ============================================================
    // ANIMATIONS
    // ============================================================

    console.log(
      '[LOLO] Animations:',
      gltf.animations.map(
        (c: THREE.AnimationClip) => ({
          name: c.name,
          duration: c.duration,
          tracks: c.tracks.length,
        })
      )
    );

    const mixer =
      new THREE.AnimationMixer(
        model
      );

    const bodyAnimation:
      THREE.AnimationClip | undefined =

      gltf.animations.find(
        (c: THREE.AnimationClip) =>
          c.name ===
          'mixamo.com'
      ) ||

      gltf.animations.find(
        (c: THREE.AnimationClip) =>
          !c.name
            .toLowerCase()
            .includes(
              't-pose'
            )
      ) ||

      gltf.animations[0];

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

      action.clampWhenFinished =
        false;

      action.enabled =
        true;

      action.setEffectiveWeight(
        1
      );

      action.setEffectiveTimeScale(
        1
      );

      action.play();
    } else {
      console.warn(
        '[LOLO] NO ANIMATION FOUND IN GLB'
      );
    }

    // ============================================================
    // FIRST POSE
    // ============================================================

    mixer.update(0);

    model.updateMatrixWorld(
      true
    );

    // ============================================================
    // AUTO FIT
    // ============================================================

    const box =
      new THREE.Box3()
        .setFromObject(model);

    const size =
      new THREE.Vector3();

    box.getSize(size);

    const scale =
      TARGET_HEIGHT /
      (size.y || 1);

    model.scale.multiplyScalar(
      scale
    );

    model.updateMatrixWorld(
      true
    );

    const fitted =
      new THREE.Box3()
        .setFromObject(model);

    const fittedCenter =
      new THREE.Vector3();

    fitted.getCenter(
      fittedCenter
    );

    model.position.sub(
      fittedCenter
    );

    model.updateMatrixWorld(
      true
    );

    // ============================================================
    // IMPORTANT FIX:
    // ATTACH EYES + MOUTH TO MIXAMO HEAD
    //
    // THIS MUST HAPPEN AFTER AUTO-FIT.
    //
    // THREE.Object3D.attach() keeps the current WORLD position
    // while changing the parent, exactly what we need here.
    // ============================================================

    console.log(
      '[LOLO] Preparing face attachment...'
    );

    model.updateMatrixWorld(
      true
    );

    if (headBone !== null) {
      headBone.updateMatrixWorld(
        true
      );

      if (eye1 !== null) {
        eye1.updateMatrixWorld(
          true
        );

        headBone.attach(
          eye1
        );

        console.log(
          '[LOLO] eye1 ATTACHED to:',
          headBone.name
        );
      }

      if (eye2 !== null) {
        eye2.updateMatrixWorld(
          true
        );

        headBone.attach(
          eye2
        );

        console.log(
          '[LOLO] eye2 ATTACHED to:',
          headBone.name
        );
      }

      if (mouth !== null) {
        mouth.updateMatrixWorld(
          true
        );

        headBone.attach(
          mouth
        );

        console.log(
          '[LOLO] mouth ATTACHED to:',
          headBone.name
        );
      }

      headBone.updateMatrixWorld(
        true
      );

      // ==========================================================
      // FIX: SAVE EYE OPEN SCALES *AFTER* ATTACH
      //
      // attach() rewrites each object's local .scale so its WORLD
      // size stays the same under the new parent (the head bone,
      // which itself carries the ~3x auto-fit scale). Any scale
      // captured before this point is stale and, once restored at
      // the end of a blink, collapses the eyes to the wrong
      // (effectively invisible) size.
      // ==========================================================

      if (eye1 !== null) {
        eye1Ref.current =
          eye1;

        eye1OpenScaleRef.current =
          eye1.scale.clone();
      }

      if (eye2 !== null) {
        eye2Ref.current =
          eye2;

        eye2OpenScaleRef.current =
          eye2.scale.clone();
      }

      if (mouth !== null) {
        mouthRef.current =
          mouth;
      }

      console.log(
        '[LOLO] FACE ATTACHMENT COMPLETE'
      );
    } else {
      console.error(
        '[LOLO] CANNOT ATTACH FACE: HEAD NOT FOUND'
      );

      // Fallback: head bone wasn't found, so nothing was
      // reparented. Still wire up the refs against whatever
      // parent/scale the eyes/mouth already have, so the face
      // isn't completely non-functional.

      if (eye1 !== null) {
        eye1Ref.current =
          eye1;

        eye1OpenScaleRef.current =
          eye1.scale.clone();
      }

      if (eye2 !== null) {
        eye2Ref.current =
          eye2;

        eye2OpenScaleRef.current =
          eye2.scale.clone();
      }

      if (mouth !== null) {
        mouthRef.current =
          mouth;
      }
    }

    if (mouthRef.current !== null) {
      mouthClosedScaleYRef.current =
        mouthRef.current.scale.y;

      mouthOpenScaleYRef.current =
        mouthRef.current.scale.y *
        (MOUTH_OPEN_Y / MOUTH_CLOSED_Y) *
        MOUTH_OPEN_MULTIPLIER;
    }

    // ============================================================
    // CAMERA
    // ============================================================

    const dist =
      (
        TARGET_HEIGHT / 2 /
        Math.tan(
          THREE.MathUtils.degToRad(
            CAMERA_FOV
          ) / 2
        )
      ) *
      CAMERA_PADDING;

    camera.position.set(
      0,
      0,
      dist
    );

    camera.near =
      0.05;

    camera.far =
      dist * 10;

    camera.lookAt(
      0,
      0,
      0
    );

    camera.updateProjectionMatrix();

    console.log(
      '[LOLO] Fit:',
      {
        originalSize:
          size.toArray(),

        scale,

        dist,
      }
    );

    // ============================================================
    // BLINK SETUP
    // ============================================================

    blinkTimerRef.current =
      0;

    blinkDurationRef.current =
      0;

    blinkingRef.current =
      false;

    nextBlinkRef.current =
      MIN_BLINK_INTERVAL +
      Math.random() *
        (
          MAX_BLINK_INTERVAL -
          MIN_BLINK_INTERVAL
        );

    // ============================================================
    // RENDER LOOP
    // ============================================================

    const clock =
      new THREE.Clock();

    let animationFrameId:
      number | null =
      null;

    const animate =
      (): void => {
        if (
          disposedRef.current
        ) {
          return;
        }

        animationFrameId =
          requestAnimationFrame(
            animate
          );

        const delta =
          clock.getDelta();

        // --------------------------------------------------------
        // MIXAMO ANIMATION
        // --------------------------------------------------------

        mixer.update(
          delta
        );


        // ========================================================
        // MOUTH — TEXT-TIMED VISEME ANIMATION
        // ========================================================

        const mouthObject = mouthRef.current;
        const mouthTarget = mouthTargetRef.current;

        mouthCurrentRef.current +=
          (mouthTarget - mouthCurrentRef.current) *
          Math.min(1, delta * 14);

        if (mouthObject) {
          const closedY =
            mouthClosedScaleYRef.current ??
            MOUTH_CLOSED_Y;

          const openY =
            mouthOpenScaleYRef.current ??
            MOUTH_OPEN_Y;

          mouthObject.scale.y =
            closedY +
            (openY - closedY) *
            mouthCurrentRef.current;
        }

        // ========================================================
        // RANDOM BLINK
        // ========================================================

        blinkTimerRef.current +=
          delta;

        // --------------------------------------------------------
        // Start blink
        // --------------------------------------------------------

        if (
          !blinkingRef.current &&
          blinkTimerRef.current >=
            nextBlinkRef.current
        ) {
          blinkingRef.current =
            true;

          blinkDurationRef.current =
            0;
        }

        // --------------------------------------------------------
        // Blink animation
        // --------------------------------------------------------

        if (
          blinkingRef.current
        ) {
          blinkDurationRef.current +=
            delta;

          const progress =
            Math.min(
              blinkDurationRef.current /
                BLINK_DURATION,
              1
            );

          // ------------------------------------------------------
          // Closing
          // ------------------------------------------------------

          if (
            progress < 0.5
          ) {
            const p =
              progress / 0.5;

            if (
              eye1Ref.current &&
              eye1OpenScaleRef.current
            ) {
              eye1Ref.current.scale.y =
                eye1OpenScaleRef.current.y *
                (
                  1 -
                  p * 0.95
                );
            }

            if (
              eye2Ref.current &&
              eye2OpenScaleRef.current
            ) {
              eye2Ref.current.scale.y =
                eye2OpenScaleRef.current.y *
                (
                  1 -
                  p * 0.95
                );
            }
          }

          // ------------------------------------------------------
          // Opening
          // ------------------------------------------------------

          else {
            const p =
              (
                progress -
                0.5
              ) /
              0.5;

            if (
              eye1Ref.current &&
              eye1OpenScaleRef.current
            ) {
              eye1Ref.current.scale.y =
                eye1OpenScaleRef.current.y *
                (
                  0.05 +
                  p * 0.95
                );
            }

            if (
              eye2Ref.current &&
              eye2OpenScaleRef.current
            ) {
              eye2Ref.current.scale.y =
                eye2OpenScaleRef.current.y *
                (
                  0.05 +
                  p * 0.95
                );
            }
          }

          // ------------------------------------------------------
          // Blink finished
          // ------------------------------------------------------

          if (
            blinkDurationRef.current >=
            BLINK_DURATION
          ) {
            blinkingRef.current =
              false;

            blinkTimerRef.current =
              0;

            nextBlinkRef.current =
              MIN_BLINK_INTERVAL +
              Math.random() *
                (
                  MAX_BLINK_INTERVAL -
                  MIN_BLINK_INTERVAL
                );

            if (
              eye1Ref.current &&
              eye1OpenScaleRef.current
            ) {
              eye1Ref.current.scale.copy(
                eye1OpenScaleRef.current
              );
            }

            if (
              eye2Ref.current &&
              eye2OpenScaleRef.current
            ) {
              eye2Ref.current.scale.copy(
                eye2OpenScaleRef.current
              );
            }
          }
        }

        // ========================================================
        // RENDER
        // ========================================================

        renderer.render(
          scene,
          camera
        );

        gl.endFrameEXP();
      };

    animate();

    // ============================================================
    // CLEANUP
    // ============================================================

    cleanupRef.current =
      () => {
        if (
          animationFrameId !== null
        ) {
          cancelAnimationFrame(
            animationFrameId
          );

          animationFrameId =
            null;
        }

        mixer.stopAllAction();

        mixer.uncacheRoot(
          model
        );

        Object.values(
          textureCache
        ).forEach(
          (t) =>
            t.dispose()
        );

        renderer.dispose();
      };
  };

  // ==============================================================
  // CONTEXT
  // ==============================================================

  const onContextCreate =
    async (
      gl: ExpoWebGLRenderingContext
    ): Promise<void> => {
      try {
        await setup(gl);
      } catch (error) {
        console.error(
          '[LOLO] Setup failed:',
          error
        );
      }
    };

  // ==============================================================
  // UI
  // ==============================================================

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

// ================================================================
// STYLES
// ================================================================

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
