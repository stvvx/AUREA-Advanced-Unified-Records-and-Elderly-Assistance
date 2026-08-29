# 3D Avatar Models Directory

This directory stores 3D character assets (`.glb` / `.gltf`) for the **Lolo Pat** AI Companion.

## Supported Model Specifications:
- **Format**: Binary glTF (`.glb`) or standard glTF (`.gltf` + `.bin` + textures)
- **Character**: Filipino Senior Citizen ("Lolo Pat") wearing Barong Tagalog with gold eyeglasses.
- **Recommended File Name**: `lolo_pat_barong.glb`
- **Armature Bones / Nodes**:
  - `Head` / `Neck` — for rotational idle breathing and nodding
  - `Jaw` / `Mouth` — for viseme lip-sync animation (Phonemes: A, E, I, O, U, M)
  - `LeftEye` / `RightEye` / `Eyelids` — for blinking and gaze tracking
  - `RightArm` / `RightHand` — for waving greeting animation
- **BlendShapes (Morph Targets)**:
  - `viseme_aa`, `viseme_E`, `viseme_I`, `viseme_O`, `viseme_U`, `viseme_PP`
  - `eyeBlinkLeft`, `eyeBlinkRight`
  - `browInnerUp`, `browDownLeft`, `browDownRight`
  - `mouthSmile`, `mouthFrown`

The 3D engine in `components/assistant/BarongElder3D.tsx` will automatically detect and load GLB models placed here, with automatic fallback to the high-performance procedural Three.js Barong Elder mesh.
