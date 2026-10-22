/**
 * Character Compositing, Light Wrap & Color Match Engine
 * Seamlessly integrates isolated 2D anime cutouts (from MODNet) onto video/photo background scenes
 * (such as dark rainy streets, bokeh lights, or fantasy landscapes) with:
 * - Edge Light Wrap (bleeding ambient background luminance into character silhouette)
 * - Color Harmonization & Palette Match (adjusting tone, blacks, and highlights)
 * - Atmospheric rim glow & depth drop-shadow
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
    'Character Foreground (MODNet Cutout)',
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
