import { describe, it, expect } from 'vitest';
import {
  GACHA_HYPE_DNA,
  AESTHETIC_LYRIC_DNA,
  extractEditDNA,
} from '../src/ai/dnaAnalyzer';
import { EDIT_PRINCIPLES } from '../src/ai/editorKnowledge';

describe('Block 7: DNA Analyzer & Viral Edit Rules', () => {
  it('should define Gacha Hype DNA matching Reference 1', () => {
    expect(GACHA_HYPE_DNA.name).toBe('Gacha Hype');
    expect(GACHA_HYPE_DNA.introPattern.type).toBe('gacha-cards-whip');
    expect(GACHA_HYPE_DNA.rhythmPattern.cadence).toBe('syncopated-3hit');
    expect(GACHA_HYPE_DNA.rhythmPattern.reframeAlternation).toBe(true);
    expect(GACHA_HYPE_DNA.rhythmPattern.effectsOnAccent).toContain('prism-rgb-split');
    expect(GACHA_HYPE_DNA.rhythmPattern.effectsOnAccent).toContain('zoom-punch');
  });

  it('should define Aesthetic Lyric DNA matching Reference 2', () => {
    expect(AESTHETIC_LYRIC_DNA.name).toBe('Aesthetic Lyric');
    expect(AESTHETIC_LYRIC_DNA.compositing.useCharacterCutout).toBe(true);
    expect(AESTHETIC_LYRIC_DNA.compositing.lightWrap).toBe(true);
    expect(AESTHETIC_LYRIC_DNA.colorGrade).toBe('Desaturated Mood');
    expect(AESTHETIC_LYRIC_DNA.typography?.karaokeReveal).toBe(true);
    expect(AESTHETIC_LYRIC_DNA.typography?.ornament).toBe('••');
  });

  it('should extract edit DNA metrics from cut cadence and flashes', () => {
    // Reference 1 accent timestamps at 130 BPM
    const ref1Accents = [4.38, 4.85, 5.73, 6.23, 6.70, 7.58, 8.08, 8.55];
    const dna = extractEditDNA({
      duration: 10.0,
      cutTimestamps: ref1Accents,
      flashTimestamps: ref1Accents,
      bpm: 130,
    });

    expect(dna.cutCount).toBe(ref1Accents.length);
    expect(dna.detectedCadence).toBe('syncopated-3hit');
    expect(dna.syncopationConfidence).toBeGreaterThan(0.60);
    expect(dna.flashCount).toBe(8);
  });

  it('should include viral short rules and TikTok safe zones in editor knowledge', () => {
    expect(EDIT_PRINCIPLES.viral.hookWindowSeconds).toBe(1.0);
    expect(EDIT_PRINCIPLES.viral.seamlessLooping).toBe(true);
    expect(EDIT_PRINCIPLES.viral.tiktokSafeZones.bottomPx).toBe(340);
    expect(EDIT_PRINCIPLES.viral.tiktokSafeZones.topPx).toBe(180);
  });
});
