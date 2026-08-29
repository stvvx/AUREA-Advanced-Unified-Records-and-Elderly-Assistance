/**
 * frontend/lib/visemeMapper.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Reusable Phoneme-to-Viseme & Facial Morph Target Mapping System.
 *
 * Maps speech phonemes and audio amplitude to 3D facial morph targets
 * with smooth cross-interpolation and fallback mechanisms.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface VisemeWeights {
  viseme_aa: number;
  viseme_oh: number;
  viseme_ou: number;
  viseme_E: number;
  viseme_I: number;
  viseme_PP: number;
  viseme_FF: number;
  viseme_TH: number;
  viseme_kk: number;
  viseme_nn: number;
  viseme_SS: number;
  jawOpen: number;
  mouthOpen: number;
  mouthSmile: number;
}

export const DEFAULT_VISEME_WEIGHTS: VisemeWeights = {
  viseme_aa: 0,
  viseme_oh: 0,
  viseme_ou: 0,
  viseme_E: 0,
  viseme_I: 0,
  viseme_PP: 0,
  viseme_FF: 0,
  viseme_TH: 0,
  viseme_kk: 0,
  viseme_nn: 0,
  viseme_SS: 0,
  jawOpen: 0,
  mouthOpen: 0,
  mouthSmile: 0.15, // Natural, warm grandfatherly resting smile
};

/**
 * Maps an incoming phoneme token and audio amplitude to target morph weights.
 */
export function mapPhonemeToVisemes(
  phoneme: string = 'A',
  amplitude: number = 0
): VisemeWeights {
  const weights: VisemeWeights = { ...DEFAULT_VISEME_WEIGHTS };
  const p = (phoneme || 'A').toUpperCase().trim();
  const amp = Math.max(0, Math.min(1.0, amplitude));

  if (amp <= 0.02) {
    return weights;
  }

  switch (p) {
    case 'A':
    case 'AA':
    case 'AH':
      weights.viseme_aa = amp * 0.95;
      weights.jawOpen = amp * 0.85;
      weights.mouthOpen = amp * 0.9;
      break;

    case 'O':
    case 'OH':
    case 'AO':
      weights.viseme_oh = amp * 0.9;
      weights.jawOpen = amp * 0.65;
      weights.mouthOpen = amp * 0.7;
      break;

    case 'U':
    case 'OU':
    case 'OO':
    case 'W':
      weights.viseme_ou = amp * 0.95;
      weights.jawOpen = amp * 0.45;
      weights.mouthOpen = amp * 0.5;
      break;

    case 'E':
    case 'EH':
    case 'AE':
      weights.viseme_E = amp * 0.9;
      weights.viseme_I = amp * 0.4;
      weights.jawOpen = amp * 0.5;
      weights.mouthOpen = amp * 0.6;
      weights.mouthSmile = 0.35 + amp * 0.3;
      break;

    case 'I':
    case 'IH':
    case 'EE':
    case 'Y':
      weights.viseme_I = amp * 0.95;
      weights.viseme_E = amp * 0.4;
      weights.jawOpen = amp * 0.4;
      weights.mouthOpen = amp * 0.45;
      weights.mouthSmile = 0.4 + amp * 0.35;
      break;

    case 'M':
    case 'B':
    case 'P':
    case 'PP':
      weights.viseme_PP = amp * 0.9;
      weights.jawOpen = 0.05;
      weights.mouthOpen = 0.02;
      break;

    case 'F':
    case 'V':
    case 'FF':
      weights.viseme_FF = amp * 0.85;
      weights.jawOpen = amp * 0.25;
      weights.mouthOpen = amp * 0.3;
      break;

    case 'TH':
    case 'DH':
      weights.viseme_TH = amp * 0.8;
      weights.jawOpen = amp * 0.35;
      weights.mouthOpen = amp * 0.4;
      break;

    case 'S':
    case 'Z':
    case 'SH':
    case 'CH':
    case 'SS':
      weights.viseme_SS = amp * 0.85;
      weights.jawOpen = amp * 0.3;
      weights.mouthOpen = amp * 0.35;
      weights.mouthSmile = 0.3;
      break;

    case 'K':
    case 'G':
    case 'NG':
      weights.viseme_kk = amp * 0.75;
      weights.jawOpen = amp * 0.45;
      weights.mouthOpen = amp * 0.5;
      break;

    case 'N':
    case 'T':
    case 'D':
    case 'L':
    case 'R':
      weights.viseme_nn = amp * 0.8;
      weights.jawOpen = amp * 0.4;
      weights.mouthOpen = amp * 0.45;
      break;

    case 'SILENCE':
    case 'NEUTRAL':
    default:
      weights.jawOpen = 0;
      weights.mouthOpen = 0;
      weights.mouthSmile = 0.15;
      break;
  }

  return weights;
}

/**
 * Smoothly interpolates (lerps) current viseme weights toward target weights.
 */
export function lerpVisemeWeights(
  current: VisemeWeights,
  target: VisemeWeights,
  alpha: number
): VisemeWeights {
  const result: any = {};
  const keys = Object.keys(current) as (keyof VisemeWeights)[];
  for (const k of keys) {
    const curVal = current[k] || 0;
    const tgtVal = target[k] || 0;
    result[k] = curVal + (tgtVal - curVal) * alpha;
  }
  return result as VisemeWeights;
}
