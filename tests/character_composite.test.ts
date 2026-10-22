import { describe, it, expect } from 'vitest';
import {
  calculateAmbientColorMatch,
  createLightWrapEffects,
  buildCharacterCompositeLayers,
} from '../src/engine/characterComposite';

describe('Block 5: Character Compositing, Light Wrap & Match Color', () => {
  it('should calculate ambient color match delta and tint hex from RGB averages', () => {
    // Dark blue night scene: [15, 25, 45], Character: [180, 160, 150]
    const match = calculateAmbientColorMatch([15, 25, 45], [180, 160, 150]);

    expect(match.targetTint).toBe('#0f192d');
    expect(match.brightnessDelta).toBeLessThan(0); // character is brighter, needs dimming
    expect(match.saturationFactor).toBeLessThan(1.0); // night desaturation
  });

  it('should create light wrap edge bleed effects', () => {
    const wrap = createLightWrapEffects({ radius: 20, intensity: 0.5, tintColor: '#38bdf8' });

    expect(wrap.length).toBe(1);
    expect(wrap[0].type).toBe('glow');
    expect(wrap[0].params.radius.value).toBe(20);
    expect(wrap[0].params.color.value).toBe('#38bdf8');
  });

  it('should build complete composite layers for Reference 2 aesthetic lyric edit', () => {
    const layers = buildCharacterCompositeLayers({
      compWidth: 1080,
      compHeight: 1920,
      duration: 10.0,
      backgroundAssetId: 'bg-rainy-park',
      characterAssetId: 'char-lucia-cutout',
      backgroundType: 'video',
      enableLiveliness: true,
      bpm: 124,
      rimStrokeColor: '#e0f2fe',
    });

    expect(layers.length).toBe(2);
    const bg = layers[0];
    const char = layers[1];

    expect(bg.type).toBe('video');
    expect(bg.transform.opacity.animated).toBe(true);
    expect(bg.effects.some((e) => e.type === 'gaussian-blur')).toBe(true);

    expect(char.type).toBe('image');
    expect(char.transform.scale.animated).toBe(true); // liveliness breathing
    expect(char.effects.some((e) => e.name?.includes('Palette Match'))).toBe(true);
    expect(char.effects.some((e) => e.name?.includes('Light Wrap'))).toBe(true);
    expect(char.effects.some((e) => e.name?.includes('Rim Contour'))).toBe(true);
  });
});
