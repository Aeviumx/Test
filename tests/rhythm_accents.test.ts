import { describe, it, expect, beforeEach } from 'vitest';
import {
  detectRhythmAccents,
  generateSyncopatedAccentsFromBpm,
  quantizeTapAccents,
} from '../src/ai/rhythmPattern';
import { useProjectStore } from '../src/store/useProjectStore';

describe('Block 2: Rhythm Pattern Detector & Accent Map', () => {
  beforeEach(() => {
    useProjectStore.getState().createNewEmptyProject();
  });

  it('should generate Reference 1 3-hit syncopated accents matching measure DNA', () => {
    // 130 BPM -> measure duration = 1.846s
    const accents = generateSyncopatedAccentsFromBpm(130, 8.0, 'ref1-syncopated-3hit', 60);

    expect(accents.length).toBeGreaterThan(10);
    // Measure 0 hits: 0.0s, ~0.47s, ~1.35s
    expect(accents[0].time).toBeCloseTo(0.0, 2);
    expect(accents[1].time).toBeCloseTo(0.468, 2);
    expect(accents[2].time).toBeCloseTo(1.348, 2);
    // Measure 1 hits: 1.846 + offsets
    expect(accents[3].time).toBeCloseTo(1.846, 2);
    expect(accents[4].time).toBeCloseTo(1.846 + 0.468, 2);
  });

  it('should detect recurring syncopated accents from beat transients', () => {
    const fakeBeats = [
      { time: 0.0, strength: 1.0, isDownbeat: true, frequencyBand: 'kick' },
      { time: 0.47, strength: 0.65, isDownbeat: false, frequencyBand: 'snare' },
      { time: 1.35, strength: 0.9, isDownbeat: false, frequencyBand: 'kick' },
      { time: 1.85, strength: 1.0, isDownbeat: true, frequencyBand: 'kick' },
      { time: 2.32, strength: 0.65, isDownbeat: false, frequencyBand: 'snare' },
      { time: 3.20, strength: 0.9, isDownbeat: false, frequencyBand: 'kick' },
    ];

    const result = detectRhythmAccents({
      bpm: 130,
      beats: fakeBeats,
      duration: 4.0,
      fps: 60,
    });

    expect(result.patternType).toBe('syncopated-3hit');
    expect(result.accents.length).toBe(6);
    expect(result.accents[0].strength).toBe('strong');
    expect(result.accents[1].strength).toBe('medium');
  });

  it('should quantize user live taps to nearest audio transients', () => {
    const audioBeats = [
      { time: 1.0, strength: 1.0, isDownbeat: true },
      { time: 1.48, strength: 0.8, isDownbeat: false },
      { time: 2.0, strength: 1.0, isDownbeat: true },
    ];

    // User tapped at 1.04s (+40ms late) and 1.45s (-30ms early)
    const userTaps = [1.04, 1.45];
    const quantized = quantizeTapAccents(userTaps, { beats: audioBeats }, 60, 0.12);

    expect(quantized.length).toBe(2);
    expect(quantized[0].time).toBeCloseTo(1.0, 3);
    expect(quantized[1].time).toBeCloseTo(1.48, 3);
  });

  it('should record tap accents and store in composition accentMap', () => {
    const store = useProjectStore.getState();
    const comp = store.getActiveComp();
    comp.audioTrackAnalysis = {
      bpm: 120,
      beats: [
        { time: 1.0, frame: 60, isDownbeat: true, strength: 1.0 },
        { time: 1.5, frame: 90, isDownbeat: false, strength: 0.8 },
      ],
      sections: [],
    };

    store.recordTapAccent(1.03); // taps near 1.0s
    const updatedComp = useProjectStore.getState().getActiveComp();
    expect(updatedComp.audioTrackAnalysis?.accentMap).toBeDefined();
    expect(updatedComp.audioTrackAnalysis?.accentMap?.accents.length).toBe(1);
    expect(updatedComp.audioTrackAnalysis?.accentMap?.accents[0].time).toBe(1.0); // quantized!
  });

  it('should auto-detect accents and populate accentMap in store', () => {
    const store = useProjectStore.getState();
    const comp = store.getActiveComp();
    comp.audioTrackAnalysis = {
      bpm: 130,
      beats: [
        { time: 0.0, frame: 0, isDownbeat: true, strength: 1.0 },
        { time: 0.47, frame: 28, isDownbeat: false, strength: 0.85 },
        { time: 1.35, frame: 81, isDownbeat: false, strength: 0.9 },
      ],
      sections: [],
    };

    store.autoDetectRhythmAccents();
    const updatedComp = useProjectStore.getState().getActiveComp();
    expect(updatedComp.audioTrackAnalysis?.accentMap?.accents.length).toBeGreaterThan(0);
    expect(updatedComp.audioTrackAnalysis?.accentMap?.patternType).toBe('syncopated-3hit');
  });
});
