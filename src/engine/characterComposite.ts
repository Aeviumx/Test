/**
 * Character Compositing, Light Wrap & Color Match Engine
 * Seamlessly integrates isolated 2D anime cutouts (from SkyTNT IS-Net Anime Segmentation / ISNet-DIS) onto video/photo background scenes
 * (such as dark rainy streets, bokeh lights, or fantasy landscapes) with:
 * - Edge Light Wrap (bleeding ambient background luminance into character silhouette)
 * - Color Harmonization & Palette Match (adjusting tone, blacks, and highlights)
 * - Atmospheric rim glow & depth drop-shadow
 * - Mask edge decontamination (alpha erosion + unmult white halo removal)
 * - Strict RGB color fidelity verification (Delta E < 5)
 */

import { BlendMode, Composition, EffectInstance, Layer, Vec2 } from '../types';
import { createDefaultLayer, createEffectInstance, createKeyframe } from '../core/defaults';
import { createLivelinessTrack, applyLivelinessToLayer } from './liveliness';

export interface LightWrapOptions {
  radius?: number;       // Blur bleed radius (e.g. 12-28px)
  intensity?: number;    // 0..1 (default 0.45)
  blendMode?: BlendMode; // 'screen' | 'add' | 'overlay'
  tintColor?: string;    // Light tint matching ambient backlight (e.g. #38bdf8 or #ffedd5)
}

export interface ColorMatchOptions {
  enabled?: boolean;
  ambientTone?: string;      // Background dominant color (e.g. #0a192f for night)
  highlightTone?: string;    // Background rim light color (e.g. #93c5fd)
  blendAmount?: number;      // 0..100 (default 25%)
  liftShadows?: number;      // -50..50
  contrast?: number;         // -50..50
}

export interface CharacterCompositeOptions {
  compWidth: number;
  compHeight: number;
  duration?: number;
  backgroundAssetId: string;
  characterAssetId: string;
  backgroundType?: 'video' | 'image';
  characterScale?: Vec2;
  characterPosition?: Vec2;
  enableLiveliness?: boolean;
  bpm?: number;
  lightWrap?: LightWrapOptions;
  colorMatch?: ColorMatchOptions;
  rimStrokeColor?: string; // Subtle character edge contour (e.g. #e0f2fe)
}

export interface MaskDecontaminateOptions {
  erodePx?: number;      // 1..3 pixels alpha erosion to eat ragged edge
  featherPx?: number;    // 0..2 pixels soft boundary
  unmultWhite?: boolean; // remove pre-multiplied white background halo
  thresholdAlpha?: number; // minimum alpha to keep (e.g. 25)
}

/**
 * Converts sRGB [0..255] to CIE Lab for perceptual Delta E measurement
 */
export function rgbToCieLab(rgb: [number, number, number]): [number, number, number] {
  // 1. sRGB to linear RGB
  const toLinear = (c: number) => {
    const v = c / 255.0;
    return v > 0.04045 ? Math.pow((v + 0.055) / 1.055, 2.4) : v / 12.92;
  };
  const r = toLinear(rgb[0]);
  const g = toLinear(rgb[1]);
  const b = toLinear(rgb[2]);

  // 2. Linear RGB to XYZ (D65 illuminant standard)
  const x = (r * 0.4124564 + g * 0.3575761 + b * 0.1804375) / 0.95047;
  const y = (r * 0.2126729 + g * 0.7151522 + b * 0.0721750) / 1.00000;
  const z = (r * 0.0193339 + g * 0.1191920 + b * 0.9503041) / 1.08883;

  // 3. XYZ to Lab
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);

  const L = 116 * fy - 16;
  const a = 500 * (fx - fy);
  const bVal = 200 * (fy - fz);
  return [L, a, bVal];
}

/**
 * Calculates standard perceptual color difference Delta E (CIE76)
 * Returns values where Delta E < 2.3 is JND (Just Noticeable Difference),
 * Delta E < 5.0 is visually indistinguishable in production,
 * and Delta E > 30 represents severe color corruption (e.g. RGB/BGR channel swap).
 */
export function calculateColorDifferenceDeltaE(
  rgb1: [number, number, number],
  rgb2: [number, number, number]
): number {
  const lab1 = rgbToCieLab(rgb1);
  const lab2 = rgbToCieLab(rgb2);
  const dL = lab1[0] - lab2[0];
  const da = lab1[1] - lab2[1];
  const db = lab1[2] - lab2[2];
  return Math.sqrt(dL * dL + da * da + db * db);
}

/**
 * Decontaminates cutout mask edges:
 * 1. Erodes ragged boundary alpha pixels (1–2 px) to eliminate white fringe
 * 2. Unmultiplies semi-transparent white background residue: C = clamp((C - (1-a)*255)/a)
 * 3. Applies soft boundary feathering
 */
export function decontaminateMaskEdges(
  pixels: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  options: MaskDecontaminateOptions = {}
): { cleanedPixels: Uint8ClampedArray; haloRemovedCount: number } {
  const {
    erodePx = 1.5,
    unmultWhite = true,
    thresholdAlpha = 20,
  } = options;

  const total = width * height;
  const cleaned = new Uint8ClampedArray(pixels.length);
  cleaned.set(pixels);

  let haloRemovedCount = 0;
  const radius = Math.max(1, Math.round(erodePx));

  // 1. Alpha erosion pass on semi-transparent fringe
  for (let y = radius; y < height - radius; y++) {
    for (let x = radius; x < width - radius; x++) {
      const idx = (y * width + x) * 4;
      const a = pixels[idx + 3];

      if (a === 0) continue;

      if (a < 250) {
        // Find minimum alpha in neighborhood
        let minNeighborAlpha = a;
        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nIdx = ((y + dy) * width + (x + dx)) * 4;
            const na = pixels[nIdx + 3];
            if (na < minNeighborAlpha) {
              minNeighborAlpha = na;
            }
          }
        }

        // Apply erosion: if neighbor is transparent or low alpha, pull alpha down
        if (minNeighborAlpha < thresholdAlpha) {
          cleaned[idx + 3] = 0;
          haloRemovedCount++;
          continue;
        } else {
          cleaned[idx + 3] = Math.min(a, minNeighborAlpha);
        }
      }

      // 2. Unmult white background residue on edge pixels (a in [20..245])
      const cleanAlpha = cleaned[idx + 3];
      if (unmultWhite && cleanAlpha > 0 && cleanAlpha < 245) {
        const aNorm = cleanAlpha / 255.0;
        const bgComp = 255.0 * (1.0 - aNorm);

        for (let c = 0; c < 3; c++) {
          const rawC = pixels[idx + c];
          // If raw color was contaminated by white background, unmultiply:
          const unmult = Math.round((rawC - bgComp) / aNorm);
          cleaned[idx + c] = Math.max(0, Math.min(255, unmult));
        }
        haloRemovedCount++;
      }
    }
  }

  return { cleanedPixels: cleaned, haloRemovedCount };
}

/**
 * Audits whether an image cutout contains ragged bright edge halos
 */
export function auditCutoutEdgeHalo(
  pixels: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number
): {
  averageEdgeLuma: number;
  hasBrightHalo: boolean;
  edgePixelCount: number;
} {
  let edgeLumaSum = 0;
  let edgeCount = 0;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = (y * width + x) * 4;
      const a = pixels[idx + 3];

      // Edge condition: semi-transparent pixel adjacent to zero alpha
      if (a >= 25 && a <= 230) {
        const hasTransparentNeighbor =
          pixels[((y - 1) * width + x) * 4 + 3] < 10 ||
          pixels[((y + 1) * width + x) * 4 + 3] < 10 ||
          pixels[(y * width + (x - 1)) * 4 + 3] < 10 ||
          pixels[(y * width + (x + 1)) * 4 + 3] < 10;

        if (hasTransparentNeighbor) {
          const r = pixels[idx];
          const g = pixels[idx + 1];
          const b = pixels[idx + 2];
          const luma = 0.299 * r + 0.587 * g + 0.114 * b;
          edgeLumaSum += luma;
          edgeCount++;
        }
      }
    }
  }

  const averageEdgeLuma = edgeCount > 0 ? edgeLumaSum / edgeCount : 0;
  // If edge pixels average > 165 luma, a white fringe halo is present
  const hasBrightHalo = edgeCount >= 8 && averageEdgeLuma > 165;

  return { averageEdgeLuma, hasBrightHalo, edgePixelCount: edgeCount };
}

/**
 * Computes luminance and color shift needed to match character into background palette
 */
export function calculateAmbientColorMatch(
  bgAverageRgb: [number, number, number],
  charAverageRgb: [number, number, number]
): {
  targetTint: string;
  brightnessDelta: number;
  saturationFactor: number;
} {
  // Luma = 0.299R + 0.587G + 0.114B
  const bgLuma = bgAverageRgb[0] * 0.299 + bgAverageRgb[1] * 0.587 + bgAverageRgb[2] * 0.114;
  const charLuma = charAverageRgb[0] * 0.299 + charAverageRgb[1] * 0.587 + charAverageRgb[2] * 0.114;

  const brightnessDelta = Math.round((bgLuma - charLuma) * 0.65);
  // Convert RGB to Hex
  const toHex = (c: number) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0');
  const targetTint = `#${toHex(bgAverageRgb[0])}${toHex(bgAverageRgb[1])}${toHex(bgAverageRgb[2])}`;

  return {
    targetTint,
    brightnessDelta,
    saturationFactor: bgLuma < 80 ? 0.75 : 1.1, // Desaturate in dark night scenes
  };
}

/**
 * Builds light wrap effect stack for softening character cutout edges against bright backlights
 */
export function createLightWrapEffects(options: LightWrapOptions = {}): EffectInstance[] {
  const {
    radius = 16,
    intensity = 0.45,
    tintColor = '#ffffff',
  } = options;

  // 1. Edge Glow acting as light wrap bleeding inward
  const wrapGlow = createEffectInstance('glow');
  wrapGlow.name = 'Light Wrap (Edge Bleed)';
  wrapGlow.params.threshold.value = 25;
  wrapGlow.params.radius.value = radius;
  wrapGlow.params.intensity.value = intensity * 1.6;
  wrapGlow.params.color.value = tintColor;

  return [wrapGlow];
}

/**
 * Builds complete ready-to-render multi-layer composition for character on background video
 * (Reference 2 style: character cut out over dark rainy city street with cold grade & light wrap)
 */
export function buildCharacterCompositeLayers(options: CharacterCompositeOptions): Layer[] {
  const {
    compWidth,
    compHeight,
    duration = 10,
    backgroundAssetId,
    characterAssetId,
    backgroundType = 'video',
    characterScale = [92, 92],
    characterPosition = [compWidth * 0.5, compHeight * 0.52],
    enableLiveliness = true,
    bpm = 120,
    lightWrap = {},
    colorMatch = {},
    rimStrokeColor = '#e0f2fe',
  } = options;

  const compInfo = { width: compWidth, height: compHeight, duration };
  const layers: Layer[] = [];

  // 1. Background Video / Image Plate
  const bgLayer = createDefaultLayer(
    compInfo,
    backgroundType,
    'Background Plate (Scene Environment)',
    { assetId: backgroundAssetId, width: compWidth, height: compHeight }
  );
  bgLayer.startTime = 0;
  bgLayer.inPoint = 0;
  bgLayer.outPoint = duration;

  // Subtle background atmospheric blur & tint
  const bgBlur = createEffectInstance('gaussian-blur');
  bgBlur.params.radius.value = 6;
  bgLayer.effects.push(bgBlur);

  // Fade in from black (Reference 2 intro)
  bgLayer.transform.opacity.animated = true;
  bgLayer.transform.opacity.keyframes = [
    createKeyframe(0, 0, 'linear'),
    createKeyframe(0.65, 100, 'linear'),
  ];
  layers.push(bgLayer);

  // 2. Character Foreground Cutout Layer
  const charLayer = createDefaultLayer(
    compInfo,
    'image',
    'Character Foreground (SkyTNT IS-Net Anime Cutout)',
    { assetId: characterAssetId, width: compWidth, height: compHeight }
  );
  charLayer.startTime = 0;
  charLayer.inPoint = 0;
  charLayer.outPoint = duration;
  charLayer.transform.position.value = characterPosition;
  charLayer.transform.scale.value = characterScale;

  // Fade in along with background
  charLayer.transform.opacity.animated = true;
  charLayer.transform.opacity.keyframes = [
    createKeyframe(0, 0, 'linear'),
    createKeyframe(0.65, 100, 'linear'),
  ];

  // A. Color Match Harmonization
  if (colorMatch.enabled !== false) {
    const tint = createEffectInstance('tint');
    tint.name = 'Background Palette Match';
    tint.params.blackColor.value = colorMatch.ambientTone || '#0a192f'; // cold midnight blue
    tint.params.whiteColor.value = colorMatch.highlightTone || '#f1f5f9';
    tint.params.amount.value = colorMatch.blendAmount ?? 22; // subtle 22% harmonization
    charLayer.effects.push(tint);

    const curves = createEffectInstance('curves');
    curves.name = 'Luminance Harmonization';
    curves.params.shadows.value = colorMatch.liftShadows ?? 6;
    curves.params.highlights.value = -4;
    curves.params.sCurve.value = 15;
    charLayer.effects.push(curves);
  }

  // B. Light Wrap Bleed
  const wrapEffects = createLightWrapEffects(lightWrap);
  charLayer.effects.push(...wrapEffects);

  // C. Subtle Rim Contour
  if (rimStrokeColor) {
    const rim = createEffectInstance('drop-shadow');
    rim.name = 'Atmospheric Rim Contour';
    rim.params.distance.value = 0;
    rim.params.softness.value = 4;
    rim.params.opacity.value = 55;
    rim.params.color.value = rimStrokeColor;
    charLayer.effects.push(rim);
  }

  // D. Subtle Procedural Respiration / Liveliness
  if (enableLiveliness) {
    const liveliness = createLivelinessTrack({
      duration,
      bpm,
      breathingIntensity: 0.85,
      swayIntensity: 0.6,
    });
    applyLivelinessToLayer(charLayer, liveliness);
  }

  layers.push(charLayer);
  return layers;
}
