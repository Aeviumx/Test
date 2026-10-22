import { describe, it, expect } from 'vitest';
import { calculateArtFraming, generateReframeTimeline, checkArtZoomResolution } from '../src/ai/artFraming';
import { createMultiplaneParallax } from '../src/ai/depthParallax';
import { createLivelinessTrack, applyLivelinessToLayer } from '../src/engine/liveliness';
import { calculateCardLayout, generateCardSequenceLayers } from '../src/core/cardLayouts';
import { createDefaultLayer } from '../src/core/defaults';

describe('Block 1: Art Framing, 2.5D Parallax, Liveliness & Card Layouts', () => {
  it('should detect character bounding box, face and calculate framing presets', () => {
    const framing = calculateArtFraming({
      imageWidth: 1080,
      imageHeight: 1920,
      compWidth: 1080,
      compHeight: 1920,
    });

    expect(framing.bodyBox.height).toBeGreaterThan(500);
    expect(framing.faceCenter[0]).toBeCloseTo(540, -1);
    expect(framing.framings['wide']).toBeDefined();
    expect(framing.framings['medium']).toBeDefined();
    expect(framing.framings['close']).toBeDefined();
    expect(framing.framings['extreme-close']).toBeDefined();
    expect(framing.framings['extreme-close'].zoom).toBeGreaterThan(framing.framings['wide'].zoom);
  });

  it('should generate punch-in reframe timeline alternating wide and close on accents', () => {
    const accents = [4.38, 4.85, 5.73, 6.23, 6.70, 7.58, 8.08, 8.55];
    const timeline = generateReframeTimeline({
      imageWidth: 1080,
      imageHeight: 1080,
      compWidth: 1080,
      compHeight: 1080,
      accentTimestamps: accents,
      duration: 10.0,
      pattern: 'ref1-alternating',
    });

    expect(timeline.cuts.length).toBe(accents.length);
    expect(timeline.cuts[0].framingType).toBe('close');
    expect(timeline.cuts[1].framingType).toBe('wide');
    expect(timeline.cuts[0].whipBlur).toBe(true);
  });

  it('should create 3-layer multiplane parallax setup', () => {
    const parallax = createMultiplaneParallax({
      compWidth: 1080,
      compHeight: 1920,
      layers: {
        backgroundAssetId: 'bg-asset-01',
        shadowAssetId: 'shadow-asset-01',
        characterAssetId: 'char-asset-01',
      },
      cameraMotion: 'subtle-drift',
    });

    expect(parallax.length).toBe(3);
    const bg = parallax.find((l) => l.name.includes('Background'));
    const char = parallax.find((l) => l.name.includes('Character Cutout'));
    expect(bg).toBeDefined();
    expect(char).toBeDefined();
    expect(char!.is3D).toBe(true);
  });

  it('should generate liveliness breathing and sway keyframes', () => {
    const liveliness = createLivelinessTrack({
      duration: 5.0,
      bpm: 130,
      breathingIntensity: 1.2,
      swayIntensity: 0.9,
    });

    expect(liveliness.keyframes.length).toBeGreaterThan(20);
    const layer = createDefaultLayer({ width: 1080, height: 1920, duration: 5.0 }, 'image', 'Char');
    applyLivelinessToLayer(layer, liveliness);

    expect(layer.transform.scale.animated).toBe(true);
    expect(layer.transform.rotation.animated).toBe(true);
    expect(layer.transform.scale.keyframes.length).toBe(liveliness.keyframes.length);
  });

  it('should calculate card layouts for 2, 3, 4 cards in 1:1 and 9:16', () => {
    const layout1to1 = calculateCardLayout(3, 1080, 1080, '1:1');
    expect(layout1to1.slots.length).toBe(3);
    expect(layout1to1.slots[0].center[0]).toBeLessThan(layout1to1.slots[1].center[0]);
    expect(layout1to1.slots[1].center[0]).toBeLessThan(layout1to1.slots[2].center[0]);

    const layout9to16 = calculateCardLayout(3, 1080, 1920, '9:16');
    expect(layout9to16.slots.length).toBe(3);
    expect(layout9to16.slots[1].scale).toBeGreaterThan(1.0); // hero card enlarged
  });

  it('should generate card sequence layers with whip entrances and group climax shot', () => {
    const layers = generateCardSequenceLayers({
      assets: [
        { assetId: 'card-1', name: 'Liv' },
        { assetId: 'card-2', name: 'Lucia' },
        { assetId: 'card-3', name: 'Vera' },
      ],
      compWidth: 1080,
      compHeight: 1080,
      startTime: 0,
      duration: 4.0,
      aspectRatio: '1:1',
      groupAssetId: 'group-climax',
    });

    // 1 BG + 3 cards + 1 group splash = 5 layers
    expect(layers.length).toBe(5);
    const card1 = layers.find((l) => l.name.includes('Card 1'));
    expect(card1).toBeDefined();
    expect(card1!.transform.position.animated).toBe(true);
    expect(card1!.transform.scale.animated).toBe(true);
    expect(card1!.effects.some((e) => e.type === 'directional-blur')).toBe(true);
  });

  it('should audit art resolution headroom and warn when camera zoom causes pixel stretching', () => {
    // 720x720 small art in 1080x1920 viewport: fit requires 2.67x stretch, so max sharp zoom is only 0.38x
    const smallArtAudit = checkArtZoomResolution(720, 720, 3.5, 1080, 1920);
    expect(smallArtAudit.needsUpscaling).toBe(true);
    expect(smallArtAudit.warning).toBeDefined();
    expect(smallArtAudit.warning).toContain('Real-ESRGAN');

    // 2000x3200 high-res art in 1080x1920 viewport: high native density allows crisp zoom
    const highResAudit = checkArtZoomResolution(2000, 3200, 1.25, 1080, 1920);
    expect(highResAudit.needsUpscaling).toBe(false);
    expect(highResAudit.warning).toBeUndefined();
  });
});
