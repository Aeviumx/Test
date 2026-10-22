import { describe, it, expect } from 'vitest';
import {
  createImpactShake,
  createZoomPunch,
  createRotationShake,
  createColoredFlashLayer,
  createExposureWhiteFlash,
  createWhipSlideTransition,
  createPrismRgbSplitEffect,
  createDeepGlowEffect,
  createCharacterOuterStroke,
  createPaddingBlurBackground,
  createColorGradePreset,
} from '../src/engine/effectPackages';

describe('Block 3: Effects & Transitions Package', () => {
  const dummyComp = { width: 1080, height: 1920, duration: 10 };

  it('should generate decaying impact shake keyframes', () => {
    const kfs = createImpactShake(2.0, 30, 0.35, 60, [540, 960]);

    expect(kfs.length).toBeGreaterThan(10);
    expect(kfs[0].time).toBe(2.0);
    expect(kfs[0].value).toEqual([540, 960]);
    // Frame 1 should have large kick displacement
    const kickDist = Math.hypot(kfs[1].value[0] - 540, kfs[1].value[1] - 960);
    expect(kickDist).toBeGreaterThan(20);
    // Last keyframe settles back to center
    const last = kfs[kfs.length - 1];
    expect(last.value).toEqual([540, 960]);
  });

  it('should create instant zoom punch keyframe sequence', () => {
    const kfs = createZoomPunch(1.5, 130, 0.25, [100, 100]);

    expect(kfs.length).toBe(2);
    expect(kfs[0].time).toBe(1.5);
    expect(kfs[0].value).toEqual([130, 130]);
    expect(kfs[1].time).toBeCloseTo(1.75, 2);
    expect(kfs[1].value).toEqual([100, 100]);
  });

  it('should create rotation snap and decay', () => {
    const kfs = createRotationShake(3.0, 5.0, 0.30);

    expect(kfs.length).toBe(3);
    expect(kfs[0].value).toBe(5.0);
    expect(kfs[1].value).toBeCloseTo(-2.25, 2);
    expect(kfs[2].value).toBe(0);
  });

  it('should create translucent red flash layer (Reference 1 style)', () => {
    const flash = createColoredFlashLayer(dummyComp, 4.38, 0.25, '#ff1a40', 80);

    expect(flash.type).toBe('solid');
    expect(flash.solidColor).toBe('#ff1a40');
    expect(flash.blendMode).toBe('screen');
    expect(flash.startTime).toBe(4.38);
    expect(flash.transform.opacity.animated).toBe(true);
    expect(flash.transform.opacity.keyframes[0].value).toBe(80);
    expect(flash.transform.opacity.keyframes[1].value).toBe(0);
  });

  it('should create white exposure flash via Brightness & Contrast', () => {
    const fx = createExposureWhiteFlash(5.0, 0.18, 95);

    expect(fx.type).toBe('brightness-contrast');
    expect(fx.params.brightness.animated).toBe(true);
    expect(fx.params.brightness.keyframes[0].value).toBe(95);
    expect(fx.params.brightness.keyframes[1].value).toBe(0);
  });

  it('should create whip-pan slide transition in 4 directions with directional blur', () => {
    const whip = createWhipSlideTransition('left', 2.0, 0.30, 1080, 1920);

    expect(whip.blurAngle).toBe(0);
    expect(whip.outgoingPosition.length).toBe(2);
    expect(whip.incomingPosition.length).toBe(2);
    expect(whip.blurLength.length).toBe(4);
    // Center to offscreen left
    expect(whip.outgoingPosition[0].value).toEqual([540, 960]);
    expect(whip.outgoingPosition[1].value[0]).toBeLessThan(0);
    // Offscreen right to center
    expect(whip.incomingPosition[0].value[0]).toBeGreaterThan(1080);
    expect(whip.incomingPosition[1].value).toEqual([540, 960]);
  });

  it('should generate rainbow prism chromatic aberration and deep glow', () => {
    const prism = createPrismRgbSplitEffect(30, true);
    expect(prism.type).toBe('chromatic-aberration');
    expect(prism.params.offsetX.value).toBe(30);

    const glow = createDeepGlowEffect(25, 30, 1.5, '#ffffff');
    expect(glow.type).toBe('glow');
    expect(glow.params.intensity.value).toBe(1.5);
  });

  it('should generate character outer stroke rim light bundle', () => {
    const strokeBundle = createCharacterOuterStroke('#e0f2fe', 8, 70);
    expect(strokeBundle.length).toBe(2);
    expect(strokeBundle[0].type).toBe('drop-shadow');
    expect(strokeBundle[1].type).toBe('glow');
  });

  it('should create 9:16 vertical padding blur background for 16:9 widescreen anime clips', () => {
    const padBg = createPaddingBlurBackground(dummyComp, 'clip-horizontal', 0, 8.0, 40);

    expect(padBg.type).toBe('video');
    expect(padBg.transform.scale.value).toEqual([185, 185]);
    expect(padBg.effects.some((e) => e.type === 'gaussian-blur')).toBe(true);
    expect(padBg.effects.some((e) => e.type === 'brightness-contrast')).toBe(true);
  });

  it('should provide all 5 color grade presets (Cold Night, Desaturated Mood, Anime Vivid, Warm Sunset, Monochrome + Red)', () => {
    const cold = createColorGradePreset('Cold Night');
    expect(cold.length).toBe(3);

    const desat = createColorGradePreset('Desaturated Mood');
    expect(desat.length).toBe(3);
    expect(desat.some((e) => e.type === 'vignette')).toBe(true);

    const vivid = createColorGradePreset('Anime Vivid');
    expect(vivid.some((e) => e.type === 'glow')).toBe(true);

    const sunset = createColorGradePreset('Warm Sunset');
    expect(sunset.length).toBe(2);

    const mono = createColorGradePreset('Monochrome + 1 Color');
    expect(mono.length).toBe(2);
  });
});
