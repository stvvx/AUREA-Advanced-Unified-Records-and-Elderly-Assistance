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
const MAX_RENDER_FPS = 30;

// Bust-shot camera
const CAMERA_FOV = 32;
const CAMERA_DISTANCE = 3.4;
const CAMERA_LOOK_AT_Y = 0.55;

// Lighting (three r155+ uses physical units; keep the sum around ~1-2 or it clips to white)
// Low ambient/hemi + a strong key = visible shading. Raise AMBIENT/HEMI if too dark.
const LIGHT_HEMI = 2.4; // soft sky/ground fill, like Blender's studio HDRI
const LIGHT_KEY = 2.2; // main light, upper right front
const LIGHT_FILL = 0.8; // cool light from the left so shadows aren't black

// Hide the outer mouth ring (Torus). Only the inner mouth (Sphere.001) is driven.
const HIDE_TORUS = true;

// DEBUG: swap every material for MeshNormalMaterial (colourful normals look).
// If it still looks flat, the mesh has no usable normals (re-export from Blender
// with Normals enabled / Shade Smooth). If it looks shaded, the problem is materials/lights.
const DEBUG_NORMAL_MATERIAL = false;

// DEBUG: show the raw texture with NO lighting (MeshBasicMaterial).
// If this looks like your Blender render, the textures are fine and only the
// light intensities need tuning. If it is already dark/washed out, the
// texture colour handling is the problem, not the lights.
const DEBUG_UNLIT = false;

// MOUTH SHAPE
// MOUTH_SIZE_MULT scales the sphere up beyond its modeled size (useful when the
// Blender sphere was authored small). MOUTH_REST_OPEN is how open the mouth is
// at silence (0 = fully squashed, 1 = always fully open).
const MOUTH_SIZE_MULT = 2.2;  // make the sphere bigger overall
const MOUTH_REST_OPEN = 0.0;  // fully squashed at silence so the open/close is obvious


const MOUTH_CLOSED_Y = 0.05;  // rest scale Y (flat line at silence)
const MOUTH_OPEN_Y   = 1.4;   // target scale Y at full open

// If no viseme event arrives for this long while speaking, drive the mouth procedurally.
const VISEME_STALE_MS = 150;

// DEBUG: sweeps the mouth open/closed continuously, ignoring speech, and logs
// what the clip drivers write. Set to false once the mouth works.
const DEBUG_MOUTH_SWEEP = false;

// Blink
const BLINK_DURATION = 0.1;
const MIN_BLINK_INTERVAL = 2.0;
const MAX_BLINK_INTERVAL = 7.0;

// ================================================================
// HELPERS
// ================================================================

const bytesToBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  const chunkSize = 0x8000;

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
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

const withTimeout = <T,>(p: Promise<T>, ms: number, label: string): Promise<T> =>
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

const getImageSize = (uri: string): Promise<{ width: number; height: number }> =>
  new Promise((resolve, reject) =>
    Image.getSize(uri, (width, height) => resolve({ width, height }), reject)
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

// Lowercase + strip everything but a-z0-9 ("Sphere.001" -> "sphere001").
const normalizeName = (s: string | undefined): string =>
  (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

const isDescendantOf = (obj: THREE.Object3D, ancestor: THREE.Object3D): boolean => {
  let p = obj.parent;
  while (p) {
    if (p === ancestor) return true;
    p = p.parent;
  }
  return false;
};

/**
 * Resolve the node a clip actually animates, using the SAME lookup the
 * AnimationMixer uses (PropertyBinding.findNode). This guarantees the object
 * we rehome/scale is the object the clip writes to, even if the GLB has a
 * Group and a Mesh sharing a similar name.
 */
const nodeFromClip = (
  root: THREE.Object3D,
  clip?: THREE.AnimationClip
): THREE.Object3D | null => {
  if (!clip || clip.tracks.length === 0) {
    return null;
  }

  try {
    const { nodeName } = THREE.PropertyBinding.parseTrackName(clip.tracks[0].name);
    return (THREE.PropertyBinding.findNode(root, nodeName) as THREE.Object3D) ?? null;
  } catch (e) {
    console.warn('[LOLO] nodeFromClip failed:', e);
    return null;
  }
};

type ClipDriver = {
  duration: number;
  apply: (time: number) => void;
  notes: string[];
};

type Axis = 'x' | 'y' | 'z';

type MouthShape = {
  open: THREE.Vector3; // modeled (fully open) scale
  closedRatio: number; // vertical scale at closed, as a fraction of open
  vertAxis: Axis; // local axis that points up in the world
};

const AXES: Axis[] = ['x', 'y', 'z'];

/**
 * Read the clip's closed/open scales, then pick which LOCAL axis of the node
 * points most nearly straight up in world space. That axis becomes the
 * opening axis, regardless of which axis the clip keyed in Blender.
 */
const buildMouthShape = (node: THREE.Object3D, driver: ClipDriver): MouthShape => {
  driver.apply(0);
  const closed = node.scale.clone();

  driver.apply(driver.duration);
  const open = node.scale.clone();

  driver.apply(0);

  // Which axis did the clip change the most?
  let keyed: Axis = 'x';
  let keyedChange = 0;

  AXES.forEach((a) => {
    const denom = Math.max(Math.abs(open[a]), Math.abs(closed[a]), 1e-6);
    const change = Math.abs(open[a] - closed[a]) / denom;

    if (change > keyedChange) {
      keyedChange = change;
      keyed = a;
    }
  });

  let closedRatio = 0.1; // used if the clip does not change scale at all

  if (keyedChange > 0.01 && Math.abs(open[keyed]) > 1e-6) {
    // Clamp: closed must be at most 0.3× open so there's always visible motion.
    closedRatio = THREE.MathUtils.clamp(closed[keyed] / open[keyed], 0.02, 0.3);
  }

  // Local axis most aligned with world up.
  node.updateWorldMatrix(true, false);

  const e = node.matrixWorld.elements;

  const up: Record<Axis, number> = {
    x: Math.abs(e[1]) / (Math.hypot(e[0], e[1], e[2]) || 1),
    y: Math.abs(e[5]) / (Math.hypot(e[4], e[5], e[6]) || 1),
    z: Math.abs(e[9]) / (Math.hypot(e[8], e[9], e[10]) || 1),
  };

  const vertAxis = AXES.reduce((best, a) => (up[a] > up[best] ? a : best), 'x' as Axis);

  console.log('[LOLO] MOUTH SHAPE', {
    closed: closed.toArray(),
    open: open.toArray(),
    keyedAxis: keyed,
    closedRatio,
    upDots: up,
    vertAxis,
  });

  return { open, closedRatio, vertAxis };
};

/**
 * Drive a clip by hand instead of through AnimationMixer.
 *
 * Samples each track's interpolant at `time` and writes the value straight
 * onto the node the track names. This removes the mixer (bindings, blending,
 * paused/LoopOnce quirks, body-clip conflicts) as a failure point. Call it
 * AFTER mixer.update() each frame so nothing overwrites it.
 */
const createClipDriver = (
  root: THREE.Object3D,
  clip: THREE.AnimationClip
): ClipDriver => {
  const entries: { node: any; prop: string; interp: any }[] = [];
  const notes: string[] = [];

  clip.tracks.forEach((track) => {
    try {
      const { nodeName, propertyName, propertyIndex } =
        THREE.PropertyBinding.parseTrackName(track.name);

      const node: any = THREE.PropertyBinding.findNode(root, nodeName);

      if (!node) {
        notes.push(`${track.name}: node NOT FOUND`);
        return;
      }

      if (propertyIndex !== undefined) {
        notes.push(`${track.name}: indexed property not supported, skipped`);
        return;
      }

      entries.push({
        node,
        prop: propertyName,
        interp: (track as any).createInterpolant(),
      });

      notes.push(`${track.name} -> ${node.name} (${node.type})`);
    } catch (e) {
      notes.push(`${track.name}: driver error ${String(e)}`);
    }
  });

  const duration = clip.duration || 1;

  const apply = (time: number): void => {
    const t = Math.min(Math.max(time, 0), duration);

    for (const e of entries) {
      const out = e.interp.evaluate(t);

      switch (e.prop) {
        case 'position':
          e.node.position.fromArray(out);
          break;
        case 'scale':
          e.node.scale.fromArray(out);
          break;
        case 'quaternion':
          e.node.quaternion.fromArray(out);
          break;
        case 'rotation':
          e.node.rotation.set(out[0], out[1], out[2]);
          break;
        case 'morphTargetInfluences': {
          const infl = e.node.morphTargetInfluences;
          if (infl) {
            for (let i = 0; i < out.length && i < infl.length; i++) {
              infl[i] = out[i];
            }
          }
          break;
        }
        default:
          break;
      }
    }
  };

  return { duration, apply, notes };
};

/**
 * Make `obj` follow `head` WITHOUT touching its local transform.
 *
 * Object3D.attach() rewrites the local position/rotation/scale, but the
 * mouthopen / mouthopenin clips overwrite that local transform every frame
 * with values authored relative to the ORIGINAL parent. So instead we insert
 * a holder under the head whose matrix equals (head^-1 * originalParent), then
 * add() the object under it. World result = head * holder * local
 *                                         = originalParent * local
 * at bind time, and from then on it follows the head bone.
 */
const rehomeUnderHead = (obj: THREE.Object3D, head: THREE.Object3D): void => {
  const origParent = obj.parent;

  if (!origParent || origParent === head || isDescendantOf(obj, head)) {
    return;
  }

  origParent.updateMatrixWorld(true);
  head.updateMatrixWorld(true);

  const holder = new THREE.Object3D();
  holder.name = `${obj.name}_holder`;
  holder.matrixAutoUpdate = false;
  holder.matrix
    .copy(head.matrixWorld)
    .invert()
    .multiply(origParent.matrixWorld);
  holder.matrixWorldNeedsUpdate = true;

  head.add(holder);
  holder.add(obj); // add, NOT attach: local transform stays as authored
  holder.updateMatrixWorld(true);
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

  const binChunk = new Uint8Array(arrayBuffer, binStart, binLength);

  const json = JSON.parse(
    new TextDecoder().decode(new Uint8Array(arrayBuffer, jsonStart, jsonLength))
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
    const bytes = binChunk.subarray(offset, offset + bv.byteLength);

    const ext =
      img.mimeType === 'image/jpeg'
        ? 'jpg'
        : img.mimeType === 'image/webp'
          ? 'webp'
          : 'png';

    const uri = `${cacheDirectory}lolo_texture_${i}.${ext}`;

    await FileSystem.writeAsStringAsync(uri, bytesToBase64(bytes), {
      encoding: FileSystem.EncodingType.Base64,
    });

    const { width, height } = await getImageSize(uri);

    textureFiles[i] = { uri, width, height };

    console.log(`[LOLO] Texture ${i}: ${width}x${height} ${ext}`);
  }

  // --------------------------------------------------------------
  // Remember base-color images
  // --------------------------------------------------------------

  const baseColorImage: Record<number, number> = {};

  (json.materials || []).forEach((mat: any, mi: number) => {
    const texIndex = mat.pbrMetallicRoughness?.baseColorTexture?.index;

    if (texIndex !== undefined) {
      const tex = json.textures?.[texIndex];
      const source = tex?.source ?? tex?.extensions?.EXT_texture_webp?.source;

      if (source !== undefined) {
        baseColorImage[mi] = source;
      }
    }

    mat.extras = { ...(mat.extras || {}), loloMat: mi };

    stripTextureRefs(mat);
  });

  // --------------------------------------------------------------
  // Strip image data
  // --------------------------------------------------------------

  delete json.images;
  delete json.textures;
  delete json.samplers;

  const dropExt = (list?: string[]) =>
    list
      ? list.filter((e) => e !== 'EXT_texture_webp' && e !== 'KHR_texture_transform')
      : list;

  if (json.extensionsUsed) {
    json.extensionsUsed = dropExt(json.extensionsUsed);
  }

  if (json.extensionsRequired) {
    json.extensionsRequired = dropExt(json.extensionsRequired);
  }

  // --------------------------------------------------------------
  // Rebuild GLB
  // --------------------------------------------------------------

  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jsonPadded = Math.ceil(jsonBytes.length / 4) * 4;
  const total = 12 + 8 + jsonPadded + 8 + binLength;

  const out = new ArrayBuffer(total);
  const outDv = new DataView(out);
  const outBytes = new Uint8Array(out);

  outDv.setUint32(0, 0x46546c67, true);
  outDv.setUint32(4, 2, true);
  outDv.setUint32(8, total, true);

  outDv.setUint32(12, jsonPadded, true);
  outDv.setUint32(16, 0x4e4f534a, true);

  outBytes.set(jsonBytes, 20);
  outBytes.fill(0x20, 20 + jsonBytes.length, 20 + jsonPadded);

  const binOut = 20 + jsonPadded;

  outDv.setUint32(binOut, binLength, true);
  outDv.setUint32(binOut + 4, 0x004e4942, true);
  outBytes.set(binChunk, binOut + 8);

  return { glb: out, textureFiles, baseColorImage };
};

// ================================================================
// TEXTURE HELPER
// ================================================================

const makeTexture = (file: TextureFile): THREE.Texture => {
  const tex = new THREE.Texture();

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
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;

  if ('colorSpace' in tex) {
    (tex as any).colorSpace = THREE.SRGBColorSpace;
  }

  tex.needsUpdate = true;

  return tex;
};

const randomBlinkInterval = (): number =>
  MIN_BLINK_INTERVAL + Math.random() * (MAX_BLINK_INTERVAL - MIN_BLINK_INTERVAL);

// ================================================================
// COMPONENT
// ================================================================

export default function BlenderElder3D({
  isSpeaking = false,
  height = 300,
}: BlenderElder3DProps): React.ReactElement {
  const isSpeakingRef = useRef<boolean>(isSpeaking);

  // --------------------------------------------------------------
  // MOUTH (two parts)
  //   Sphere.001 = inner, driven by clip "mouthopenin"
  //   Torus      = outer, driven by clip "mouthopen"
  // --------------------------------------------------------------

  const mouthInnerRef = useRef<THREE.Object3D | null>(null);
  const mouthOuterRef = useRef<THREE.Object3D | null>(null);

  const mouthInnerDriverRef = useRef<ClipDriver | null>(null);
  const mouthOuterDriverRef = useRef<ClipDriver | null>(null);

  // Only used as a fallback when a clip is missing.
  const mouthInnerClosedScaleRef = useRef<THREE.Vector3 | null>(null);
  const mouthShapeRef = useRef<MouthShape | null>(null);
  const mouthOuterClosedScaleRef = useRef<THREE.Vector3 | null>(null);

  const mouthCurrentRef = useRef<number>(0);
  const mouthTargetRef = useRef<number>(0);
  const lastSpeechEventRef = useRef<number>(0);

  // --------------------------------------------------------------
  // EYES
  // --------------------------------------------------------------

  const eye1Ref = useRef<THREE.Object3D | null>(null);
  const eye2Ref = useRef<THREE.Object3D | null>(null);
  const eye1OpenScaleRef = useRef<THREE.Vector3 | null>(null);
  const eye2OpenScaleRef = useRef<THREE.Vector3 | null>(null);

  // --------------------------------------------------------------
  // BLINK STATE
  // --------------------------------------------------------------

  const blinkTimerRef = useRef<number>(0);
  const blinkDurationRef = useRef<number>(0);
  const nextBlinkRef = useRef<number>(randomBlinkInterval());
  const blinkingRef = useRef<boolean>(false);

  // --------------------------------------------------------------
  // CLEANUP
  // --------------------------------------------------------------

  const cleanupRef = useRef<(() => void) | null>(null);
  const disposedRef = useRef<boolean>(false);

  // ==============================================================
  // SPEAKING STATE
  // ==============================================================

  useEffect(() => {
    isSpeakingRef.current = isSpeaking;

    if (!isSpeaking) {
      mouthTargetRef.current = 0;
    }
  }, [isSpeaking]);

  // ==============================================================
  // TTS VISEME LISTENER
  // ==============================================================

  useEffect(() => {
    const listener = (amplitude: number, phoneme?: string) => {
      lastSpeechEventRef.current = Date.now();

      const sound = (phoneme || '').toUpperCase();

      // Closed mouth sounds
      if (sound === 'M' || sound === 'B' || sound === 'P') {
        mouthTargetRef.current = 0.05;
        return;
      }

      // Normal speech
      mouthTargetRef.current = Math.max(0.12, Math.min(1.0, amplitude * 1.5));
    };

    const unsubscribe = speechEngine.registerVisemeListener(listener);

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

    const consoleMethods = ['log', 'warn', 'error'] as const;

    const originalMethods = consoleMethods.map(
      (method) => [method, (console as any)[method]] as const
    );

    for (const [method, original] of originalMethods) {
      (console as any)[method] = (...args: unknown[]) => {
        if (
          args.some(
            (arg) => typeof arg === 'string' && arg.includes(suppressedMessage)
          )
        ) {
          return;
        }

        original(...args);
      };
    }

    return () => {
      for (const [method, original] of originalMethods) {
        (console as any)[method] = original;
      }
    };
  }, []);

  // ==============================================================
  // SETUP
  // ==============================================================

  const setup = async (gl: ExpoWebGLRenderingContext): Promise<void> => {
    // ------------------------------------------------------------
    // GL diagnostics
    // ------------------------------------------------------------

    console.log('[LOLO GL] VERSION:', gl.getParameter(gl.VERSION));
    console.log('[LOLO GL] RENDERER:', gl.getParameter(gl.RENDERER));

    const hasWebGL2Methods =
      typeof (gl as any).createVertexArray !== 'undefined';

    console.log('[LOLO GL] WebGL2:', hasWebGL2Methods);

    if (!hasWebGL2Methods) {
      console.error('[LOLO GL] WebGL2 is not available on this context.');
      return;
    }

    // ------------------------------------------------------------
    // WebGL2 shim
    // ------------------------------------------------------------

    const globalAny = globalThis as any;

    const expoGLConstructor = Object.getPrototypeOf(gl)?.constructor;

    if (expoGLConstructor) {
      let needsShim = true;

      try {
        if (typeof globalAny.WebGL2RenderingContext !== 'undefined') {
          needsShim = !(gl instanceof globalAny.WebGL2RenderingContext);
        }
      } catch {
        needsShim = true;
      }

      if (needsShim) {
        console.log('[LOLO GL] Applying Expo WebGL2 compatibility shim');

        globalAny.WebGL2RenderingContext = expoGLConstructor;
        globalAny.WebGLRenderingContext = function WebGLRenderingContext() {};
      }
    }

    try {
      console.log(
        '[LOLO GL] global WebGLRenderingContext:',
        typeof globalAny.WebGLRenderingContext,
        '| gl instanceof it:',
        typeof globalAny.WebGLRenderingContext !== 'undefined'
          ? gl instanceof globalAny.WebGLRenderingContext
          : 'n/a'
      );

      if (typeof globalAny.WebGLRenderingContext !== 'undefined') {
        Object.defineProperty(globalAny, 'WebGLRenderingContext', {
          value: function WebGLRenderingContext() {},
          configurable: true,
          writable: true,
        });
      }
    } catch (e) {
      console.warn('[LOLO GL] Could not replace WebGLRenderingContext:', e);
    }

    // ------------------------------------------------------------
    // pixelStorei fix
    // ------------------------------------------------------------

    try {
      const originalPixelStorei = (gl as any).pixelStorei.bind(gl);

      const UNSUPPORTED_PIXEL_STORE = new Set<number>([0x9243]);

      (gl as any).pixelStorei = (pname: number, param: any) => {
        if (UNSUPPORTED_PIXEL_STORE.has(pname)) {
          return;
        }

        originalPixelStorei(pname, param);
      };
    } catch (e) {
      console.warn('[LOLO GL] Could not wrap pixelStorei:', e);
    }

    // ------------------------------------------------------------
    // Fake canvas
    // ------------------------------------------------------------

    const fakeCanvas = {
      width: gl.drawingBufferWidth,
      height: gl.drawingBufferHeight,
      style: {},
      clientWidth: gl.drawingBufferWidth,
      clientHeight: gl.drawingBufferHeight,
      addEventListener: () => {},
      removeEventListener: () => {},
      getContext: () => gl,
      setAttribute: () => {},
      removeAttribute: () => {},
    };

    // ------------------------------------------------------------
    // Renderer
    // ------------------------------------------------------------

    console.log('[LOLO GL] Creating THREE.WebGLRenderer...');

    const renderer = new THREE.WebGLRenderer({
      canvas: fakeCanvas as unknown as HTMLCanvasElement,
      context: gl as unknown as WebGL2RenderingContext,
      antialias: false,
      alpha: false,
    });

    console.log('[LOLO GL] THREE.WebGLRenderer created successfully');

    renderer.setSize(gl.drawingBufferWidth, gl.drawingBufferHeight, false);
    renderer.setPixelRatio(1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;

    // ------------------------------------------------------------
    // Scene
    // ------------------------------------------------------------

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf5f8f2);

    // ------------------------------------------------------------
    // Camera
    // ------------------------------------------------------------

    const camera = new THREE.PerspectiveCamera(
      CAMERA_FOV,
      gl.drawingBufferWidth / gl.drawingBufferHeight,
      0.01,
      1000
    );

    camera.position.set(0, 0, 6);

    // ------------------------------------------------------------
    // Lights: Blender-style soft studio look.
    // NOTE: three r155+ divides diffuse light by PI, so intensities that
    // look small (1-2) are actually normal. The earlier 0.25-0.4 values
    // were too low, which is why the scene went dark.
    // ------------------------------------------------------------

    // Sky/ground gradient acts like the soft HDRI in Blender's viewport.
    scene.add(new THREE.HemisphereLight(0xffffff, 0xc9b8a8, LIGHT_HEMI));

    const keyLight = new THREE.DirectionalLight(0xfff3e6, LIGHT_KEY);
    keyLight.position.set(2.5, 3.5, 5);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xe3ecff, LIGHT_FILL);
    fillLight.position.set(-4, 1, 3);
    scene.add(fillLight);

    // ============================================================
    // LOAD GLB
    // ============================================================

    console.log('[LOLO] Loading GLB...');

    const asset = Asset.fromModule(require('../../assets/lolo.glb'));

    await asset.downloadAsync();

    const glbUri = asset.localUri || asset.uri;

    if (!glbUri) {
      throw new Error('[LOLO] GLB URI is missing.');
    }

    const fileInfo = await FileSystem.getInfoAsync(glbUri);

    if (!fileInfo.exists) {
      throw new Error(`[LOLO] GLB file does not exist: ${glbUri}`);
    }

    const base64 = await FileSystem.readAsStringAsync(glbUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const glbBytes = base64ToBytes(base64);

    console.log('[LOLO] GLB bytes:', glbBytes.byteLength);

    const cacheDirectory = FileSystem.cacheDirectory;

    if (!cacheDirectory) {
      throw new Error('[LOLO] Cache directory is unavailable.');
    }

    // ------------------------------------------------------------
    // navigator shim
    // ------------------------------------------------------------

    const navigatorAny = (globalThis as any).navigator;

    if (navigatorAny && typeof navigatorAny.userAgent !== 'string') {
      Object.defineProperty(navigatorAny, 'userAgent', {
        value: 'React Native',
        configurable: true,
      });
    }

    // ------------------------------------------------------------
    // Prepare GLB
    // ------------------------------------------------------------

    console.log('[LOLO] Preparing GLB...');

    const prepared = await withTimeout(
      prepareGlb(glbBytes.buffer as ArrayBuffer, cacheDirectory),
      60000,
      'prepareGlb'
    );

    // ------------------------------------------------------------
    // Parse GLB
    // ------------------------------------------------------------

    console.log('[LOLO] Parsing GLB...');

    const loader = new GLTFLoader();

    const gltf: any = await withTimeout(
      new Promise<any>((resolve, reject) =>
        loader.parse(prepared.glb, '', resolve, reject)
      ),
      30000,
      'GLTF parse'
    );

    console.log('[LOLO] GLB parsed successfully');

    if (disposedRef.current) {
      renderer.dispose();
      return;
    }

    const model: THREE.Object3D = gltf.scene;

    scene.add(model);

    // ============================================================
    // TEXTURES + MATERIAL FIXES
    // ============================================================

    const textureCache: Record<number, THREE.Texture> = {};

    model.traverse((object: any) => {
      if (!object.isMesh) {
        return;
      }

      object.frustumCulled = false;

      if (DEBUG_NORMAL_MATERIAL) {
        object.material = new THREE.MeshNormalMaterial();
        return;
      }

      const mats = Array.isArray(object.material)
        ? object.material
        : [object.material];

      mats.forEach((mat: any) => {
        if (!mat) {
          return;
        }

        console.log('[LOLO] Material:', mat.name, {
          type: mat.type,
          metalness: mat.metalness,
          roughness: mat.roughness,
          color: mat.color?.getHexString?.(),
          emissive: mat.emissive?.getHexString?.(),
          emissiveIntensity: mat.emissiveIntensity,
          hasEnvMap: !!mat.envMap,
        });

        if (mat.type === 'MeshBasicMaterial') {
          console.warn(
            '[LOLO] Material is MeshBasicMaterial (unlit) and will ignore lights:',
            mat.name
          );
        }

        if (typeof mat.metalness === 'number') {
          mat.metalness = 0;
          mat.roughness = 1; // matte clay, like the Blender render
        }

        // stripTextureRefs removed emissiveTexture but kept emissiveFactor.
        // Blender often exports that as [1,1,1], which makes the material
        // fully self-lit white and defeats all lighting.
        if (mat.emissive) {
          mat.emissive.set(0x000000);
          mat.emissiveIntensity = 0;
        }

        mat.needsUpdate = true;

        const mi = mat?.userData?.loloMat;

        if (mi === undefined) {
          return;
        }

        const imageIndex = prepared.baseColorImage[mi];

        const file =
          imageIndex !== undefined ? prepared.textureFiles[imageIndex] : undefined;

        if (!file) {
          return;
        }

        if (!textureCache[imageIndex]) {
          textureCache[imageIndex] = makeTexture(file);
        }

        mat.map = textureCache[imageIndex];
        mat.needsUpdate = true;
      });
    });

    if (DEBUG_UNLIT) {
      model.traverse((o: any) => {
        if (!o.isMesh) return;

        const swap = (m: any) =>
          new THREE.MeshBasicMaterial({
            map: m?.map ?? null,
            color: m?.color ?? 0xffffff,
            side: m?.side,
            transparent: m?.transparent,
            alphaTest: m?.alphaTest,
          });

        o.material = Array.isArray(o.material) ? o.material.map(swap) : swap(o.material);
      });
    }

    // ============================================================
    // ANIMATIONS
    // (moved BEFORE node lookup so the mouth nodes can be resolved
    //  from the clips' own tracks)
    // ============================================================

    console.log(
      '[LOLO] Animations:',
      gltf.animations.map((c: THREE.AnimationClip) => ({
        name: c.name,
        duration: c.duration,
        tracks: c.tracks.length,
      }))
    );

    const mixer = new THREE.AnimationMixer(model);

    const bodyAnimation: THREE.AnimationClip | undefined =
      gltf.animations.find((c: THREE.AnimationClip) => c.name === 'mixamo.com') ||
      gltf.animations.find(
        (c: THREE.AnimationClip) =>
          !c.name.toLowerCase().includes('t-pose') &&
          !c.name.toLowerCase().includes('mouthopen')
      );

    // If Blender keyed the mouth objects inside the body clip, two weight-1
    // actions would fight over the same property. Strip those tracks so only
    // the mouth clips drive the mouth.
    if (bodyAnimation) {
      const before = bodyAnimation.tracks.length;

      bodyAnimation.tracks = bodyAnimation.tracks.filter((t: THREE.KeyframeTrack) => {
        const n = normalizeName(t.name.split('.')[0]);
        return n !== 'torus' && n !== 'sphere001';
      });

      const removed = before - bodyAnimation.tracks.length;

      if (removed > 0) {
        console.log(`[LOLO] Stripped ${removed} mouth track(s) from body clip`);
      }
    }

    if (bodyAnimation) {
      console.log('[LOLO] PLAYING ANIMATION:', bodyAnimation.name);

      const action = mixer.clipAction(bodyAnimation);

      action.reset();
      action.setLoop(THREE.LoopRepeat, Infinity);
      action.clampWhenFinished = false;
      action.enabled = true;
      action.setEffectiveWeight(1);
      action.setEffectiveTimeScale(1);
      action.play();
    } else {
      console.warn('[LOLO] NO ANIMATION FOUND IN GLB');
    }

    // Find a mouth clip by name first; if the export renamed it
    // (e.g. "TorusAction"), fall back to the clip whose tracks all target
    // the given node (tracks are named "<node>.<property>").
    const findClip = (
      name: string,
      nodeName: string
    ): THREE.AnimationClip | undefined => {
      const byName = gltf.animations.find(
        (clip: THREE.AnimationClip) => normalizeName(clip.name) === name
      );

      if (byName) return byName;

      return gltf.animations.find(
        (clip: THREE.AnimationClip) =>
          clip !== bodyAnimation &&
          clip.tracks.length > 0 &&
          clip.tracks.every(
            (t: THREE.KeyframeTrack) =>
              normalizeName(t.name.split('.')[0]) === nodeName
          )
      );
    };

    // "mouthopenin" -> inner (Sphere.001); "mouthopen" -> outer (Torus).
    const mouthInnerClip = findClip('mouthopenin', 'sphere001');
    const mouthOuterClip = HIDE_TORUS ? undefined : findClip('mouthopen', 'torus');

    if (HIDE_TORUS) {
      model.traverse((o) => {
        if (normalizeName(o.name) === 'torus') {
          o.visible = false;
        }
      });
    }

    // Full dump so we can see exactly what the GLB contains.
    gltf.animations.forEach((c: THREE.AnimationClip) => {
      console.log(
        '[LOLO CLIP]',
        c.name,
        `${c.duration.toFixed(2)}s`,
        c.tracks.slice(0, 4).map((t) => t.name).join(' | ')
      );
    });

    // Mouth clips are NOT given to the mixer. They are sampled by hand each
    // frame (see createClipDriver) so nothing can bind to the wrong node or
    // blend against the body clip.
    if (mouthInnerClip) {
      mouthInnerDriverRef.current = createClipDriver(model, mouthInnerClip);
      console.log('[LOLO] inner driver:', mouthInnerDriverRef.current.notes);
    }

    if (mouthOuterClip) {
      mouthOuterDriverRef.current = createClipDriver(model, mouthOuterClip);
      console.log('[LOLO] outer driver:', mouthOuterDriverRef.current.notes);
    }

    if (!mouthInnerClip || !mouthOuterClip) {
      console.warn(
        '[LOLO] Mouth clips missing from GLB. Clips present:',
        gltf.animations.map((c: THREE.AnimationClip) => c.name).join(', '),
        '-> using scale fallback. Re-export from Blender with the mouth actions included.'
      );
    }

    console.log(
      '[LOLO] MOUTH CLIPS:',
      mouthInnerClip?.name ?? 'NOT FOUND',
      mouthOuterClip?.name ?? 'NOT FOUND'
    );

    // ============================================================
    // FIND HEAD / EYES / MOUTH PARTS
    // ============================================================

    let foundHeadBone: THREE.Object3D | null = null;
    let foundEye1: THREE.Object3D | null = null;
    let foundEye2: THREE.Object3D | null = null;
    let foundMouthInner: THREE.Object3D | null = null;
    let foundMouthOuter: THREE.Object3D | null = null;

    model.traverse((object: THREE.Object3D) => {

      const normalizedName = normalizeName(object.name);

      // Mixamo head bone
      if (normalizedName.endsWith('mixamorighead')) {
        foundHeadBone = object;
        console.log('[LOLO] HEAD FOUND EXACT:', object.name, object.type);
      }

      // Eyes
      if (object.name === 'eye1') foundEye1 = object;
      if (object.name === 'eye2') foundEye2 = object;

      // Name-based mouth lookup (fallback only; the clip's own node wins below).
      if ((object as any).isMesh) {
        if (normalizedName === 'sphere001') foundMouthInner = object;
        if (normalizedName === 'torus') foundMouthOuter = object;
      }
    });

    // Explicit references avoid TypeScript narrowing issues
    // with traverse callbacks.
    const headBone = foundHeadBone as THREE.Object3D | null;
    const eye1 = foundEye1 as THREE.Object3D | null;
    const eye2 = foundEye2 as THREE.Object3D | null;

    // Prefer the exact node the clip animates; fall back to the name match.
    const mouthInnerFromClip = nodeFromClip(model, mouthInnerClip);
    const mouthOuterFromClip = nodeFromClip(model, mouthOuterClip);

    const mouthInner =
      mouthInnerFromClip ?? (foundMouthInner as THREE.Object3D | null);
    const mouthOuter =
      mouthOuterFromClip ?? (foundMouthOuter as THREE.Object3D | null);

    console.log(
      '[LOLO] inner node from clip === name match?',
      mouthInnerFromClip === (foundMouthInner as THREE.Object3D | null),
      '| type:',
      mouthInnerFromClip?.type
    );
    console.log(
      '[LOLO] outer node from clip === name match?',
      mouthOuterFromClip === (foundMouthOuter as THREE.Object3D | null),
      '| type:',
      mouthOuterFromClip?.type
    );
    console.log(
      '[LOLO] inner tracks:',
      mouthInnerClip?.tracks.map((t) => t.name)
    );
    console.log(
      '[LOLO] outer tracks:',
      mouthOuterClip?.tracks.map((t) => t.name)
    );

    console.log('[LOLO] HEAD FOUND:', headBone ? headBone.name : 'NOT FOUND');
    console.log('[LOLO] EYE1 FOUND:', eye1 ? eye1.name : 'NOT FOUND');
    console.log('[LOLO] EYE2 FOUND:', eye2 ? eye2.name : 'NOT FOUND');
    console.log(
      '[LOLO] MOUTH INNER:',
      mouthInner ? `${mouthInner.name} (${mouthInner.type})` : 'NOT FOUND',
      '| parent:',
      mouthInner?.parent?.name
    );
    console.log(
      '[LOLO] MOUTH OUTER:',
      mouthOuter ? `${mouthOuter.name} (${mouthOuter.type})` : 'NOT FOUND',
      '| parent:',
      mouthOuter?.parent?.name
    );

    // ============================================================
    // FIRST POSE
    // ============================================================

    mixer.update(0);
    model.updateMatrixWorld(true);

    // ============================================================
    // AUTO FIT
    // ============================================================

    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();

    box.getSize(size);

    const scale = TARGET_HEIGHT / (size.y || 1);

    model.scale.multiplyScalar(scale);
    model.updateMatrixWorld(true);

    const fitted = new THREE.Box3().setFromObject(model);
    const fittedCenter = new THREE.Vector3();

    fitted.getCenter(fittedCenter);

    model.position.sub(fittedCenter);
    model.updateMatrixWorld(true);

    // ============================================================
    // FACE ATTACHMENT (must happen AFTER auto-fit)
    //
    //  - Eyes: attach() keeps WORLD transform; we drive them manually.
    //  - Mouth parts: rehomeUnderHead() keeps the LOCAL transform,
    //    because the mouthopen / mouthopenin clips write it each frame.
    // ============================================================

    console.log('[LOLO] Preparing face attachment...');

    if (headBone !== null) {
      headBone.updateMatrixWorld(true);

      if (eye1 !== null) {
        eye1.updateMatrixWorld(true);
        headBone.attach(eye1);
        console.log('[LOLO] eye1 ATTACHED to:', headBone.name);
      }

      if (eye2 !== null) {
        eye2.updateMatrixWorld(true);
        headBone.attach(eye2);
        console.log('[LOLO] eye2 ATTACHED to:', headBone.name);
      }

      if (mouthInner !== null) {
        rehomeUnderHead(mouthInner, headBone);
        console.log('[LOLO] mouth inner REHOMED under:', headBone.name);
      }

      if (mouthOuter !== null) {
        rehomeUnderHead(mouthOuter, headBone);
        console.log('[LOLO] mouth outer REHOMED under:', headBone.name);
      }

      headBone.updateMatrixWorld(true);

      console.log('[LOLO] FACE ATTACHMENT COMPLETE');
    } else {
      console.error('[LOLO] CANNOT ATTACH FACE: HEAD NOT FOUND');
    }

    // ------------------------------------------------------------
    // Capture refs + rest scales AFTER attach/rehome.
    // (attach() rewrites eye scale; a pre-attach scale is stale.)
    // ------------------------------------------------------------

    if (eye1 !== null) {
      eye1Ref.current = eye1;
      eye1OpenScaleRef.current = eye1.scale.clone();
    }

    if (eye2 !== null) {
      eye2Ref.current = eye2;
      eye2OpenScaleRef.current = eye2.scale.clone();
    }

    if (mouthInner !== null) {
      mouthInnerRef.current = mouthInner;
      mouthInnerClosedScaleRef.current = mouthInner.scale.clone();

      if (mouthInnerDriverRef.current) {
        mouthShapeRef.current = buildMouthShape(mouthInner, mouthInnerDriverRef.current);
      }
    }

    if (mouthOuter !== null) {
      mouthOuterRef.current = mouthOuter;
      mouthOuterClosedScaleRef.current = mouthOuter.scale.clone();
    }

    // ============================================================
    // CAMERA — BUST SHOT
    // ============================================================

    const dist = CAMERA_DISTANCE;

    camera.position.set(0, CAMERA_LOOK_AT_Y, dist);
    camera.near = 0.05;
    camera.far = 100;
    camera.lookAt(0, CAMERA_LOOK_AT_Y, 0);
    camera.updateProjectionMatrix();

    console.log('[LOLO] Bust Camera:', {
      fov: CAMERA_FOV,
      distance: dist,
      lookAtY: CAMERA_LOOK_AT_Y,
      originalSize: size.toArray(),
      scale,
    });

    // ============================================================
    // BLINK SETUP
    // ============================================================

    blinkTimerRef.current = 0;
    blinkDurationRef.current = 0;
    blinkingRef.current = false;
    nextBlinkRef.current = randomBlinkInterval();

    // ============================================================
    // RENDER LOOP
    // ============================================================

    const clock = new THREE.Clock();

    let animationFrameId: number | null = null;
    let lastRenderTime = 0;

    const setEyeScaleY = (factor: number): void => {
      if (eye1Ref.current && eye1OpenScaleRef.current) {
        eye1Ref.current.scale.y = eye1OpenScaleRef.current.y * factor;
      }

      if (eye2Ref.current && eye2OpenScaleRef.current) {
        eye2Ref.current.scale.y = eye2OpenScaleRef.current.y * factor;
      }
    };

    const animate = (timestamp: number): void => {
      if (disposedRef.current) {
        return;
      }

      animationFrameId = requestAnimationFrame(animate);

      if (timestamp - lastRenderTime < 1000 / MAX_RENDER_FPS) {
        return;
      }

      lastRenderTime = timestamp;

      const delta = clock.getDelta();

      // --------------------------------------------------------
      // BODY ANIMATION
      // --------------------------------------------------------

      mixer.update(delta);

      // ========================================================
      // MOUTH TARGET
      // ========================================================

      if (DEBUG_MOUTH_SWEEP) {
        mouthTargetRef.current = (Math.sin(clock.elapsedTime * 4) + 1) / 2;
      } else if (isSpeakingRef.current) {
        // expo-speech does not emit amplitude/phoneme events, so if the
        // viseme listener has gone quiet, fake a speech rhythm.
        if (Date.now() - lastSpeechEventRef.current > VISEME_STALE_MS) {
          const t = clock.elapsedTime;

          mouthTargetRef.current =
            0.3 +
            0.7 * Math.abs(Math.sin(t * 9)) * (0.6 + 0.4 * Math.sin(t * 2.3));
        }
      } else if (Date.now() - lastSpeechEventRef.current > VISEME_STALE_MS) {
        mouthTargetRef.current = 0;
      }

      // ========================================================
      // MOUTH — two parts, each scrubbed through its own clip
      // ========================================================

      mouthCurrentRef.current +=
        (mouthTargetRef.current - mouthCurrentRef.current) *
        Math.min(1, delta * 14);

      const open = THREE.MathUtils.clamp(mouthCurrentRef.current, 0, 1);

      const innerDriver = mouthInnerDriverRef.current;
      const outerDriver = mouthOuterDriverRef.current;

      // Written AFTER mixer.update() so the body clip cannot overwrite it.
      // Effective openness: never fully squashed unless MOUTH_REST_OPEN = 0.
      const openEff = MOUTH_REST_OPEN + (1 - MOUTH_REST_OPEN) * open;

      if (innerDriver) {
        innerDriver.apply(openEff * innerDriver.duration);

        // Rebuild scale: modeled size on every axis, squashed only along the
        // axis that points up in the world.
        const shape = mouthShapeRef.current;
        const inner = mouthInnerRef.current;

        if (shape && inner) {
          const r = THREE.MathUtils.lerp(shape.closedRatio, 1, openEff);

          inner.scale.copy(shape.open).multiplyScalar(MOUTH_SIZE_MULT);
          inner.scale[shape.vertAxis] *= r;
        }
      }

      if (outerDriver) {
        outerDriver.apply(open * outerDriver.duration);
      }

      // Fallback: no clip found, drive the sphere directly with absolute Y scale.
      if (!innerDriver) {
        const inner = mouthInnerRef.current;
        const closed = mouthInnerClosedScaleRef.current;

        if (inner && closed) {
          inner.scale.set(
            closed.x,
            THREE.MathUtils.lerp(MOUTH_CLOSED_Y, MOUTH_OPEN_Y, open),
            closed.z
          );
        }
      }

      // ========================================================
      // RANDOM BLINK
      // ========================================================

      blinkTimerRef.current += delta;

      if (!blinkingRef.current && blinkTimerRef.current >= nextBlinkRef.current) {
        blinkingRef.current = true;
        blinkDurationRef.current = 0;
      }

      if (blinkingRef.current) {
        blinkDurationRef.current += delta;

        const progress = Math.min(blinkDurationRef.current / BLINK_DURATION, 1);

        if (progress < 0.5) {
          // Closing
          const p = progress / 0.5;
          setEyeScaleY(1 - p * 0.95);
        } else {
          // Opening
          const p = (progress - 0.5) / 0.5;
          setEyeScaleY(0.05 + p * 0.95);
        }

        // Blink finished
        if (blinkDurationRef.current >= BLINK_DURATION) {
          blinkingRef.current = false;
          blinkTimerRef.current = 0;
          nextBlinkRef.current = randomBlinkInterval();

          setEyeScaleY(1);
        }
      }

      // ========================================================
      // RENDER
      // ========================================================

      renderer.render(scene, camera);

      gl.endFrameEXP();
    };

    animate(performance.now());

    // ============================================================
    // CLEANUP
    // ============================================================

    cleanupRef.current = () => {
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }

      mixer.stopAllAction();
      mixer.uncacheRoot(model);

      Object.values(textureCache).forEach((t) => t.dispose());

      renderer.dispose();
    };
  };

  // ==============================================================
  // CONTEXT
  // ==============================================================

  const onContextCreate = async (gl: ExpoWebGLRenderingContext): Promise<void> => {
    try {
      await setup(gl);
    } catch (error) {
      console.error('[LOLO] Setup failed:', error);
    }
  };

  // ==============================================================
  // UI
  // ==============================================================

  return (
    <View style={[styles.container, { height }]}>
      <GLView style={styles.glView} onContextCreate={onContextCreate} />
    </View>
  );
}

// ================================================================
// STYLES
// ================================================================

const styles = StyleSheet.create({
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