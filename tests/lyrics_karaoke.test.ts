import { describe, it, expect } from 'vitest';
import { parseLrcFormat, alignLyricsToAudio } from '../src/ai/lyricEngine';
import {
  createTypewriterWatermark,
  generateKaraokeCompositionLayers,
  OFL_FONTS,
} from '../src/render/karaokeText';

describe('Block 4: Lyrics, Karaoke Engine & OFL Typography', () => {
  it('should parse standard LRC format and segment words', () => {
    const lrc = `
[00:01.50] I hear the raindrops falling
[00:04.20] In this silent midnight park
`;
    const lines = parseLrcFormat(lrc);

    expect(lines.length).toBe(2);
    expect(lines[0].startTime).toBe(1.5);
    expect(lines[0].text).toBe('I hear the raindrops falling');
    expect(lines[0].words.length).toBe(5);
    expect(lines[0].words[0].text).toBe('I');
    expect(lines[0].words[4].text).toBe('falling');
    expect(lines[1].startTime).toBe(4.2);
  });

  it('should align plain lyrics to audio transients', () => {
    const lyrics = `First line of song\nSecond line of song`;
    const transients = [
      { index: 0, time: 1.02, frame: 61, strength: 1.0, isDownbeat: true, frequencyBand: 'kick' as const },
      { index: 1, time: 4.98, frame: 299, strength: 0.9, isDownbeat: true, frequencyBand: 'snare' as const },
    ];

    const aligned = alignLyricsToAudio(lyrics, transients, 1.0, 10.0);

    expect(aligned.length).toBe(2);
    // Line 1 snapped to ~1.02
    expect(aligned[0].startTime).toBeCloseTo(1.02, 2);
    expect(aligned[0].words.length).toBe(4);
    expect(aligned[0].ornament).toBe('••');
  });

  it('should create typewriter watermark with animator keyframes', () => {
    const watermark = createTypewriterWatermark({
      compWidth: 1080,
      compHeight: 1920,
      text: 'Montagem Shirt Blue',
      authorHandle: '@kori_editor',
      startTime: 0.5,
      duration: 8.0,
      position: 'top-left',
    });

    expect(watermark.type).toBe('text');
    expect(watermark.textContents).toBeDefined();
    expect(watermark.textContents?.animator.enabled).toBe(true);
    expect(watermark.textContents?.animator.rangeStart.animated).toBe(true);
    const kfs = watermark.textContents?.animator.rangeStart.keyframes || [];
    expect(kfs.length).toBe(2);
    expect(kfs[0].value).toBe(0);
    expect(kfs[1].value).toBe(100);
  });

  it('should generate karaoke composition layers with glowing active words', () => {
    const lines = [
      {
        id: 'l1',
        text: 'Lost in the Tokyo rain',
        startTime: 2.0,
        endTime: 4.5,
        words: [],
        ornament: '••',
      },
    ];

    const layers = generateKaraokeCompositionLayers(lines, {
      compWidth: 1080,
      compHeight: 1920,
      layout: 'side-block',
      fontFamily: 'Montserrat',
      fontSize: 48,
    });

    expect(layers.length).toBe(1);
    const lyricLayer = layers[0];
    expect(lyricLayer.type).toBe('text');
    expect(lyricLayer.textContents?.fontFamily).toBe('Montserrat');
    expect(lyricLayer.textContents?.animator.enabled).toBe(true);
    // Glow effect present for active word glow
    expect(lyricLayer.effects.some((e) => e.type === 'glow')).toBe(true);
  });

  it('should provide full OFL fonts catalogue', () => {
    expect(OFL_FONTS['montserrat']).toBeDefined();
    expect(OFL_FONTS['poppins']).toBeDefined();
    expect(OFL_FONTS['inter']).toBeDefined();
    expect(OFL_FONTS['bebasNeue']).toBeDefined();
    expect(OFL_FONTS['anton']).toBeDefined();
    expect(OFL_FONTS['spaceGrotesk']).toBeDefined();
    expect(OFL_FONTS['notoSansJp']).toBeDefined();
  });
});
