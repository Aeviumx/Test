import { describe, it, expect } from 'vitest';
import {
  forcedAlignLyrics,
  validateWordTimings,
  WordTimestamp,
} from '../src/ai/whisperAlignment';

describe('Whisper Needleman-Wunsch Forced Alignment & WER Engine', () => {
  it('correctly maps user ground-truth lyrics to ASR hypothesis tokens and computes WER', () => {
    const userLyrics = 'Come over and start a conversation with just me';
    const asrHypothesis: WordTimestamp[] = [
      { word: 'Come', start: 0.0, end: 0.56, confidence: 0.95 },
      { word: 'over', start: 0.56, end: 0.76, confidence: 0.85 },
      { word: 'and', start: 0.76, end: 0.96, confidence: 0.90 },
      { word: 'start', start: 0.96, end: 1.12, confidence: 0.92 },
      { word: 'the', start: 1.12, end: 1.26, confidence: 0.51 }, // SUB: 'the' instead of 'a'
      { word: 'conversation', start: 1.26, end: 1.66, confidence: 0.93 },
      { word: 'with', start: 1.66, end: 2.16, confidence: 0.80 },
      { word: 'just', start: 2.16, end: 2.26, confidence: 0.75 },
      { word: 'me', start: 2.26, end: 2.58, confidence: 0.98 },
    ];

    const result = forcedAlignLyrics(userLyrics, asrHypothesis);

    expect(result.alignedWords.length).toBe(9);
    expect(result.stats.referenceWordCount).toBe(9);
    expect(result.stats.matches).toBe(8);
    expect(result.stats.substitutions).toBe(1); // 'a' was substituted by 'the'
    expect(result.stats.deletions).toBe(0);
    expect(result.stats.insertions).toBe(0);
    expect(result.stats.wordErrorRate).toBeCloseTo(11.1, 1);
    expect(result.stats.accuracyRate).toBeCloseTo(88.9, 1);

    // The user's word 'a' preserves the position and receives the acoustic timestamp from 'the'
    const wordA = result.alignedWords[4];
    expect(wordA.word).toBe('a');
    expect(wordA.start).toBe(1.12);
    expect(wordA.end).toBe(1.26);
    expect(wordA.alignmentType).toBe('SUB');
  });

  it('interpolates timestamps for words dropped / deleted by ASR', () => {
    const userLyrics = 'Take my hand stop';
    // ASR only detected 'Take' and 'stop', missing 'my hand'
    const asrHypothesis: WordTimestamp[] = [
      { word: 'Take', start: 5.0, end: 5.3, confidence: 0.9 },
      { word: 'stop', start: 6.2, end: 6.5, confidence: 0.9 },
    ];

    const result = forcedAlignLyrics(userLyrics, asrHypothesis);
    expect(result.alignedWords.length).toBe(4);
    expect(result.alignedWords[1].word).toBe('my');
    expect(result.alignedWords[1].alignmentType).toBe('DEL');
    expect(result.alignedWords[1].start).toBeGreaterThanOrEqual(5.3);
    expect(result.alignedWords[1].end).toBeLessThanOrEqual(6.2);
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
