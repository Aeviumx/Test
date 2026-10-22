import { describe, it, expect } from 'vitest';
import {
  alignWhisperWithLyrics,
  validateWordTimings,
  WordTimestamp,
} from '../src/ai/whisperAlignment';

describe('Whisper Word-Level Alignment & Forced Alignment', () => {
  it('correctly maps whisper detected words to canonical lyric text', () => {
    const rawWords: WordTimestamp[] = [
      { word: 'Come', start: 0.0, end: 0.56, confidence: 0.95 },
      { word: 'ovr', start: 0.56, end: 0.76, confidence: 0.75 },
      { word: 'and', start: 0.76, end: 0.96, confidence: 0.88 },
      { word: 'start', start: 0.96, end: 1.12, confidence: 0.92 },
    ];

    const userLyrics = 'Come over and start';
    const aligned = alignWhisperWithLyrics(rawWords, userLyrics);

    expect(aligned.length).toBe(4);
    expect(aligned[0].canonicalWord).toBe('Come');
    expect(aligned[1].canonicalWord).toBe('over'); // fuzzy match
    expect(aligned[2].canonicalWord).toBe('and');
    expect(aligned[3].canonicalWord).toBe('start');
  });

  it('validates word timing consistency and flags invalid sequences', () => {
    const validWords: WordTimestamp[] = [
      { word: 'start', start: 1.0, end: 1.5, confidence: 0.9 },
      { word: 'now', start: 1.5, end: 2.0, confidence: 0.9 },
    ];
    expect(validateWordTimings(validWords).valid).toBe(true);

    const invalidWords: WordTimestamp[] = [
      { word: 'bad', start: 2.0, end: 1.8, confidence: 0.9 },
    ];
    const res = validateWordTimings(invalidWords);
    expect(res.valid).toBe(false);
    expect(res.errors[0]).toContain('start (2) >= end (1.8)');
  });
});
