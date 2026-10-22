/**
 * AE-Grade Effect & Transition Package Engine
 * Professional effects for anime AMVs, TikTok edits, hype edits, and lyric videos:
 * - Exposure white flashes, red accent flashes, strobes
 * - Impact shakes, zoom punches, rotation shakes, RGB split shakes
 * - Snappy whip-pan transitions with directional motion blur
 * - Rainbow prism chromatic aberration, deep glow/bloom, character outer stroke/rim light
 * - Vertical 9:16 padding blur for 16:9 horizontal anime clips
 * - AMV Color Grades: Cold Night, Desaturated Mood, Anime Vivid, Warm Sunset, Monochrome + Red
 */

import {
  BezierHandle,
  Composition,
  EffectInstance,
  Keyframe,
  Layer,
  TransformGroup,
  Vec2,
} from '../types';
import { createDefaultLayer, createEffectInstance, createKeyframe, createProperty } from '../core/defaults';

export type ColorGradePreset =
  | 'Cold Night'
  | 'Desaturated Mood'
  | 'Anime Vivid'
  | 'Warm Sunset'
  | 'Monochrome + 1 Color';

export interface WhipTransitionKeyframes {
  outgoingPosition: Keyframe<Vec2>[];
  incomingPosition: Keyframe<Vec2>[];
  blurLength: Keyframe<number>[];
  blurAngle: number;
}

/**
 * Snappy easing bezier handles (0.85 in, 0.15 out)
 */
export const SNAP_EASE_IN: BezierHandle = { x: 0.85, y: 0.0 };
export const SNAP_EASE_OUT: BezierHandle = { x: 0.15, y: 1.0 };
export const OVERSHOOT_EASE_OUT: BezierHandle = { x: 0.20, y: 1.28 };

/**
 * Creates high-frequency decaying camera impact displacement (screen shake on beat drops)
 */
export function createImpactShake(
  time: number,
  intensity = 28,
  decayDuration = 0.32,
  fps = 60,
  centerPos: Vec2 = [540, 960]
): Keyframe<Vec2>[] {
  const keyframes: Keyframe<Vec2>[] = [];
  const framesCount = Math.max(4, Math.round(decayDuration * fps));

  // Frame 0: rest
  keyframes.push(createKeyframe(time, centerPos));

  // Frame 1: max violent kick
  const initialKick: Vec2 = [
    centerPos[0] + (Math.random() > 0.5 ? 1 : -1) * intensity,
    centerPos[1] + (Math.random() > 0.5 ? 1 : -1) * (intensity * 0.75),
  ];
  keyframes.push(createKeyframe(time + 1 / fps, initialKick));

  // Decaying oscillation
  for (let i = 2; i < framesCount; i++) {
    const progress = i / framesCount;
    const decay = Math.pow(1 - progress, 2.2); // exponential falloff
    const sign = i % 2 === 0 ? 1 : -1;
    const currentIntensity = intensity * decay;

    const offset: Vec2 = [
      centerPos[0] + sign * (currentIntensity * (0.6 + Math.sin(i * 1.7) * 0.4)),
      centerPos[1] - sign * (currentIntensity * 0.5 * (0.6 + Math.cos(i * 2.1) * 0.4)),
    ];
    keyframes.push(createKeyframe(time + i / fps, offset));
  }

  // Final settle at rest
  keyframes.push(createKeyframe(time + decayDuration, centerPos));
  return keyframes;
}

/**
 * Creates an instant zoom punch keyframe sequence (e.g. 100% -> 125% -> 100%)
 */
export function createZoomPunch(
  time: number,
  punchScale = 125,
  returnDuration = 0.30,
  baseScale: Vec2 = [100, 100]
): Keyframe<Vec2>[] {
  const peakScale: Vec2 = [
    (baseScale[0] * punchScale) / 100,
    (baseScale[1] * punchScale) / 100,
  ];

  return [
    createKeyframe(time, peakScale, 'bezier', SNAP_EASE_IN, SNAP_EASE_OUT),
    createKeyframe(time + returnDuration, baseScale, 'linear'),
  ];
}

/**
 * Creates an instant rotation snap & decay on snare/kick hits
 */
export function createRotationShake(
  time: number,
  maxAngle = 4.5,
  decayDuration = 0.28,
  baseAngle = 0
): Keyframe<number>[] {
  return [
    createKeyframe(time, baseAngle + maxAngle, 'bezier', SNAP_EASE_IN, SNAP_EASE_OUT),
    createKeyframe(time + decayDuration * 0.4, baseAngle - maxAngle * 0.45, 'bezier', SNAP_EASE_IN, SNAP_EASE_OUT),
    createKeyframe(time + decayDuration, baseAngle, 'linear'),
  ];
}

/**
 * Creates a colored flash layer (e.g. translucent red flash for Reference 1 or white exposure flash)
 */
export function createColoredFlashLayer(
  comp: Pick<Composition, 'width' | 'height' | 'duration'>,
  time: number,
  duration = 0.25,
  color = '#ff1a40',
  maxOpacity = 75
): Layer {
  const flash = createDefaultLayer(comp, 'solid', `Color Flash (${color})`, {
    solidColor: color,
    width: comp.width,
    height: comp.height,
  });

  flash.startTime = time;
  flash.inPoint = time;
  flash.outPoint = time + duration;
  flash.blendMode = color.toLowerCase() === '#ffffff' ? 'screen' : 'screen';

  flash.transform.opacity.animated = true;
  flash.transform.opacity.keyframes = [
    createKeyframe(time, maxOpacity, 'bezier', SNAP_EASE_IN, SNAP_EASE_OUT),
    createKeyframe(time + duration, 0, 'linear'),
  ];
  flash.transform.opacity.value = maxOpacity;

  return flash;
}

/**
 * Creates white exposure flash effect applied via Brightness & Contrast
 */
export function createExposureWhiteFlash(
  time: number,
  duration = 0.16,
  peakBrightness = 90
): EffectInstance {
  const fx = createEffectInstance('brightness-contrast');
  fx.name = 'Exposure White Flash';
  fx.params.brightness.animated = true;
  fx.params.brightness.keyframes = [
    createKeyframe(time, peakBrightness, 'bezier', SNAP_EASE_IN, SNAP_EASE_OUT),
    createKeyframe(time + duration, 0, 'linear'),
  ];
  return fx;
}

/**
 * Creates snappy whip-pan slide transition keyframes with directional motion blur
 */
export function createWhipSlideTransition(
  direction: 'left' | 'right' | 'up' | 'down',
  time: number,
  duration = 0.28,
  compWidth = 1080,
  compHeight = 1920
): WhipTransitionKeyframes {
  let outDelta: Vec2 = [0, 0];
  let inDelta: Vec2 = [0, 0];
  let blurAngle = 0;

  switch (direction) {
    case 'left':
      outDelta = [-compWidth, 0];
      inDelta = [compWidth, 0];
      blurAngle = 0;
      break;
    case 'right':
      outDelta = [compWidth, 0];
      inDelta = [-compWidth, 0];
      blurAngle = 180;
      break;
    case 'up':
      outDelta = [0, -compHeight];
      inDelta = [0, compHeight];
      blurAngle = 90;
      break;
    case 'down':
      outDelta = [0, compHeight];
      inDelta = [0, -compHeight];
      blurAngle = 270;
      break;
  }

  const center: Vec2 = [compWidth * 0.5, compHeight * 0.5];
  const halfDur = duration * 0.5;

  const outgoingPosition: Keyframe<Vec2>[] = [
    createKeyframe(time, center, 'bezier', SNAP_EASE_IN, SNAP_EASE_OUT),
    createKeyframe(time + halfDur, [center[0] + outDelta[0], center[1] + outDelta[1]], 'linear'),
  ];

  const incomingPosition: Keyframe<Vec2>[] = [
    createKeyframe(time + halfDur, [center[0] + inDelta[0], center[1] + inDelta[1]], 'bezier', SNAP_EASE_IN, SNAP_EASE_OUT),
    createKeyframe(time + duration, center, 'linear'),
  ];

  const blurLength: Keyframe<number>[] = [
    createKeyframe(time, 0, 'linear'),
    createKeyframe(time + halfDur * 0.8, 55, 'linear'),
    createKeyframe(time + halfDur * 1.2, 55, 'linear'),
    createKeyframe(time + duration, 0, 'linear'),
  ];

  return {
    outgoingPosition,
    incomingPosition,
    blurLength,
    blurAngle,
  };
}

/**
 * Creates a rainbow prism chromatic aberration effect instance
 */
export function createPrismRgbSplitEffect(
  intensity = 24,
  radial = true
): EffectInstance {
  const fx = createEffectInstance('chromatic-aberration');
  fx.name = 'Prism RGB Split';
  fx.params.offsetX.value = intensity;
  fx.params.offsetY.value = intensity * 0.35;
  fx.params.radial.value = radial ? 75 : 0;
  return fx;
}

/**
 * Creates deep glow / bloom effect instance
 */
export function createDeepGlowEffect(
  threshold = 28,
  radius = 32,
  intensity = 1.35,
  color = '#ffffff'
): EffectInstance {
  const fx = createEffectInstance('glow');
  fx.name = 'Deep Bloom / Glow';
  fx.params.threshold.value = threshold;
  fx.params.radius.value = radius;
  fx.params.intensity.value = intensity;
  fx.params.color.value = color;
  return fx;
}

/**
 * Creates character outer stroke & rim light effect bundle
 */
export function createCharacterOuterStroke(
  strokeColor = '#e0f2fe',
  radius = 6,
  shadowOpacity = 60
): EffectInstance[] {
  // 1. Crisp rim drop shadow
  const shadow = createEffectInstance('drop-shadow');
  shadow.name = 'Character Outer Rim';
  shadow.params.opacity.value = shadowOpacity;
  shadow.params.distance.value = 0;
  shadow.params.softness.value = radius;
  shadow.params.color.value = strokeColor;

  // 2. Subtle outer glow
  const rimGlow = createEffectInstance('glow');
  rimGlow.name = 'Character Rim Glow';
  rimGlow.params.threshold.value = 40;
  rimGlow.params.radius.value = radius * 2;
  rimGlow.params.intensity.value = 0.9;
  rimGlow.params.color.value = strokeColor;

  return [shadow, rimGlow];
}

/**
 * Creates 9:16 vertical padding blur background for 16:9 widescreen anime clips
 * (Renders an enlarged, heavily blurred background copy of the asset behind the sharp center clip)
 */
export function createPaddingBlurBackground(
  comp: Pick<Composition, 'width' | 'height' | 'duration'>,
  sourceAssetId: string,
  startTime = 0,
  duration = 10,
  blurRadius = 38
): Layer {
  const bg = createDefaultLayer(comp, 'video', 'Padding Blur Background (9:16)', {
    assetId: sourceAssetId,
    width: comp.width,
    height: comp.height,
  });

  bg.startTime = startTime;
  bg.inPoint = startTime;
  bg.outPoint = startTime + duration;

  // Scale up to cover vertical 9:16 completely
  bg.transform.scale.value = [185, 185];

  // Heavy gaussian blur
  const blur = createEffectInstance('gaussian-blur');
  blur.params.radius.value = blurRadius;
  bg.effects.push(blur);

  // Slight brightness dimming so foreground clip pops
  const dim = createEffectInstance('brightness-contrast');
  dim.params.brightness.value = -18;
  dim.params.contrast.value = 10;
  bg.effects.push(dim);

  return bg;
}

/**
 * Creates iconic AMV color grade effect instance presets
 */
export function createColorGradePreset(preset: ColorGradePreset): EffectInstance[] {
  switch (preset) {
    case 'Cold Night': {
      // Blue/Cyan cold grade with lifted deep blue shadows and sharp highlights
      const tint = createEffectInstance('tint');
      tint.name = 'Cold Grade Tint';
      tint.params.blackColor.value = '#0a192f'; // deep midnight navy
      tint.params.whiteColor.value = '#e0f2fe'; // ice white
      tint.params.amount.value = 35;

      const curves = createEffectInstance('curves');
      curves.name = 'Cold S-Curve Contrast';
      curves.params.shadows.value = -8;
      curves.params.midtones.value = -5;
      curves.params.highlights.value = 12;
      curves.params.sCurve.value = 30;

      const sat = createEffectInstance('hue-saturation');
      sat.params.saturation.value = -18;

      return [tint, curves, sat];
    }

    case 'Desaturated Mood': {
      // Reference 2 aesthetic: muted desaturated palette, dark mood, film look
      const sat = createEffectInstance('hue-saturation');
      sat.name = 'Muted Saturation';
      sat.params.saturation.value = -45;

      const curves = createEffectInstance('curves');
      curves.name = 'Film Contrast';
      curves.params.shadows.value = 8; // lifted blacks
      curves.params.highlights.value = -6;
      curves.params.sCurve.value = 22;

      const vig = createEffectInstance('vignette');
      vig.params.amount.value = 35;
      vig.params.feather.value = 45;

      return [sat, curves, vig];
    }

    case 'Anime Vivid': {
      // Punchy colors, glowing highlights, hyper-clean lineart
      const sat = createEffectInstance('hue-saturation');
      sat.name = 'Vivid Vibrance';
      sat.params.saturation.value = 30;

      const bright = createEffectInstance('brightness-contrast');
      bright.params.brightness.value = 6;
      bright.params.contrast.value = 22;

      const bloom = createDeepGlowEffect(45, 20, 0.8, '#ffffff');

      return [sat, bright, bloom];
    }

    case 'Warm Sunset': {
      // Golden hour anime aesthetic
      const tint = createEffectInstance('tint');
      tint.params.blackColor.value = '#3d0c02'; // rich terracotta
      tint.params.whiteColor.value = '#fed7aa'; // warm sunset gold
      tint.params.amount.value = 40;

      const bright = createEffectInstance('brightness-contrast');
      bright.params.brightness.value = 5;
      bright.params.contrast.value = 18;

      return [tint, bright];
    }

    case 'Monochrome + 1 Color': {
      // High contrast B&W base with vivid isolated accents
      const sat = createEffectInstance('hue-saturation');
      sat.params.saturation.value = -100;

      const curves = createEffectInstance('curves');
      curves.params.shadows.value = -15;
      curves.params.highlights.value = 20;
      curves.params.sCurve.value = 50;

      return [sat, curves];
    }
  }
}

/**
 * Creates spin whip transition (rotational acceleration with radial blur)
 */
export function createSpinTransition(
  time: number,
  duration = 0.35,
  direction: 'cw' | 'ccw' = 'cw'
): {
  rotation: Keyframe<number>[];
  scale: Keyframe<Vec2>[];
  radialBlur: Keyframe<number>[];
} {
  const sign = direction === 'cw' ? 1 : -1;
  const half = duration * 0.5;

  return {
    rotation: [
      createKeyframe(time, 0, 'bezier', SNAP_EASE_IN, SNAP_EASE_OUT),
      createKeyframe(time + half, sign * 90, 'bezier', SNAP_EASE_IN, SNAP_EASE_OUT),
      createKeyframe(time + duration, sign * 180, 'linear'),
    ],
    scale: [
      createKeyframe(time, [100, 100], 'bezier', SNAP_EASE_IN, SNAP_EASE_OUT),
      createKeyframe(time + half, [70, 70], 'bezier', SNAP_EASE_IN, SNAP_EASE_OUT),
      createKeyframe(time + duration, [100, 100], 'linear'),
    ],
    radialBlur: [
      createKeyframe(time, 0, 'linear'),
      createKeyframe(time + half, 45, 'linear'),
      createKeyframe(time + duration, 0, 'linear'),
    ],
  };
}

/**
 * Creates 3D perspective flip transition (rotating 90 degrees around Y-axis)
 */
export function create3DFlipTransition(
  time: number,
  duration = 0.32
): {
  rotationY: Keyframe<number>[];
  depthScale: Keyframe<Vec2>[];
} {
  const half = duration * 0.5;
  return {
    rotationY: [
      createKeyframe(time, 0, 'bezier', SNAP_EASE_IN, SNAP_EASE_OUT),
      createKeyframe(time + half, 90, 'bezier', SNAP_EASE_IN, SNAP_EASE_OUT),
      createKeyframe(time + duration, 0, 'linear'),
    ],
    depthScale: [
      createKeyframe(time, [100, 100], 'linear'),
      createKeyframe(time + half, [82, 82], 'linear'),
      createKeyframe(time + duration, [100, 100], 'linear'),
    ],
  };
}

/**
 * Creates digital glitch transition with block displacement and chromatic tear
 */
export function createGlitchTransition(
  time: number,
  duration = 0.28
): EffectInstance[] {
  const glitch = createEffectInstance('chromatic-aberration');
  glitch.name = 'Glitch Chromatic Displacement';
  glitch.params.offsetX.animated = true;
  glitch.params.offsetX.keyframes = [
    createKeyframe(time, 0, 'linear'),
    createKeyframe(time + duration * 0.3, 35, 'linear'),
    createKeyframe(time + duration * 0.6, -28, 'linear'),
    createKeyframe(time + duration, 0, 'linear'),
  ];
  return [glitch];
}

/**
 * Creates VHS cassette analog distortion package (tracking, tape scanlines, color bleed)
 */
export function createVhsEffectPackage(intensity = 60): EffectInstance[] {
  const vhs = createEffectInstance('chromatic-aberration');
  vhs.name = 'VHS Tape Color Bleed';
  vhs.params.offsetX.value = (intensity * 12) / 100;
  vhs.params.offsetY.value = 2;

  const curves = createEffectInstance('curves');
  curves.name = 'VHS Color Grading';
  curves.params.shadows.value = 10; // lifted blacks
  curves.params.highlights.value = -8; // crushed tape whites

  return [vhs, curves];
}

/**
 * Creates Manga Halftone dot matrix screen effect instance
 */
export function createMangaHalftonePackage(dotSize = 6, contrast = 80): EffectInstance {
  const fx = createEffectInstance('brightness-contrast');
  fx.name = 'Manga Halftone Raster Screen';
  fx.params.contrast.value = contrast;
  return fx;
}

