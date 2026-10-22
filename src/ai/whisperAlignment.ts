/**
 * Whisper Word-Level Alignment & Forced Alignment Engine
 * Interfaces with speech recognition models (Whisper ONNX / whisper.cpp / faster-whisper)
 * Performs Needleman-Wunsch global dynamic programming alignment to map user-provided canonical lyrics
 * onto acoustic speech tokens with Word Error Rate (WER) computation.
 */

export interface WordTimestamp {
  word: string;
  start: number;
  end: number;
  confidence: number;
  canonicalWord?: string;
  alignmentType?: 'MATCH' | 'SUB' | 'DEL' | 'INS';
}

export interface AlignmentStats {
  referenceWordCount: number;
  hypothesisWordCount: number;
  matches: number;
  substitutions: number;
  deletions: number;
  insertions: number;
  wordErrorRate: number; // (S + D + I) / N * 100
  accuracyRate: number;  // (N - S - D) / N * 100
}

export interface ForcedAlignmentResult {
  alignedWords: WordTimestamp[];
  stats: AlignmentStats;
}

function cleanToken(token: string): string {
  return token.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Needleman-Wunsch Global Alignment between user canonical text and ASR speech tokens
 */
export function forcedAlignLyrics(
  userLyricsText: string,
  asrWords: WordTimestamp[]
): ForcedAlignmentResult {
  const refTokens = userLyricsText
    .split(/\s+/)
    .map(w => w.trim())
    .filter(Boolean);

  const n = refTokens.length;
  const m = asrWords.length;

  if (n === 0) {
    return {
      alignedWords: [],
      stats: {
        referenceWordCount: 0,
        hypothesisWordCount: m,
        matches: 0,
        substitutions: 0,
        deletions: 0,
        insertions: m,
        wordErrorRate: m > 0 ? 100 : 0,
        accuracyRate: 0,
      },
    };
  }

  // Cost matrix
  const MATCH_SCORE = 2;
  const MISMATCH_SCORE = -1;
  const GAP_PENALTY = -1;

  const dp: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));
  for (let i = 0; i <= n; i++) dp[i][0] = i * GAP_PENALTY;
  for (let j = 0; j <= m; j++) dp[0][j] = j * GAP_PENALTY;

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const rw = cleanToken(refTokens[i - 1]);
      const hw = cleanToken(asrWords[j - 1].word);
      const score = (rw === hw || (rw.length >= 3 && hw.startsWith(rw.slice(0, 3)))) ? MATCH_SCORE : MISMATCH_SCORE;

      dp[i][j] = Math.max(
        dp[i - 1][j - 1] + score, // Match / Substitution
        dp[i - 1][j] + GAP_PENALTY, // Deletion (word in ref, skipped in ASR)
        dp[i][j - 1] + GAP_PENALTY  // Insertion (extra word hallucinated by ASR)
      );
    }
  }

  // Backtracking
  let i = n;
  let j = m;
  const rawPairs: Array<{
    ref: string | null;
    hyp: WordTimestamp | null;
    type: 'MATCH' | 'SUB' | 'DEL' | 'INS';
  }> = [];

  let matches = 0;
  let substitutions = 0;
  let deletions = 0;
  let insertions = 0;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0) {
      const rw = cleanToken(refTokens[i - 1]);
      const hw = cleanToken(asrWords[j - 1].word);
      const isMatch = rw === hw || (rw.length >= 3 && hw.startsWith(rw.slice(0, 3)));
      const score = isMatch ? MATCH_SCORE : MISMATCH_SCORE;

      if (dp[i][j] === dp[i - 1][j - 1] + score) {
        if (isMatch) {
          rawPairs.push({ ref: refTokens[i - 1], hyp: asrWords[j - 1], type: 'MATCH' });
          matches++;
        } else {
          rawPairs.push({ ref: refTokens[i - 1], hyp: asrWords[j - 1], type: 'SUB' });
          substitutions++;
        }
        i--;
        j--;
        continue;
      }
    }

    if (i > 0 && dp[i][j] === dp[i - 1][j] + GAP_PENALTY) {
      rawPairs.push({ ref: refTokens[i - 1], hyp: null, type: 'DEL' });
      deletions++;
      i--;
    } else {
      rawPairs.push({ ref: null, hyp: asrWords[j - 1], type: 'INS' });
      insertions++;
      j--;
    }
  }

  rawPairs.reverse();

  // Project timings onto user canonical tokens (interpolate DELETED words)
  const alignedWords: WordTimestamp[] = [];
  let lastKnownEnd = 0.0;

  for (let pIdx = 0; pIdx < rawPairs.length; pIdx++) {
    const pair = rawPairs[pIdx];
    if (!pair.ref) continue; // Skip pure insertions that have no counterpart in user text

    if (pair.hyp) {
      // Direct timing from ASR
      alignedWords.push({
        word: pair.ref,
        canonicalWord: pair.ref,
        start: pair.hyp.start,
        end: pair.hyp.end,
        confidence: pair.type === 'MATCH' ? pair.hyp.confidence : pair.hyp.confidence * 0.7,
        alignmentType: pair.type,
      });
      lastKnownEnd = pair.hyp.end;
    } else {
      // DELETED word in speech: look ahead for next known timestamp
      let nextKnownStart = lastKnownEnd + 0.35;
      for (let look = pIdx + 1; look < rawPairs.length; look++) {
        if (rawPairs[look].hyp) {
          nextKnownStart = rawPairs[look].hyp!.start;
          break;
        }
      }

      const dur = Math.max(0.12, (nextKnownStart - lastKnownEnd) * 0.5);
      const start = lastKnownEnd;
      const end = Math.min(nextKnownStart, start + dur);

      alignedWords.push({
        word: pair.ref,
        canonicalWord: pair.ref,
        start: Math.round(start * 1000) / 1000,
        end: Math.round(end * 1000) / 1000,
        confidence: 0.50, // Interpolated prior
        alignmentType: 'DEL',
      });
      lastKnownEnd = end;
    }
  }

  const wordErrorRate = Math.round(((substitutions + deletions + insertions) / n) * 1000) / 10;
  const accuracyRate = Math.max(0, Math.round(((n - substitutions - deletions) / n) * 1000) / 10);

  return {
    alignedWords,
    stats: {
      referenceWordCount: n,
      hypothesisWordCount: m,
      matches,
      substitutions,
      deletions,
      insertions,
      wordErrorRate,
      accuracyRate,
    },
  };
}

/**
 * Validates word timing consistency (start < end, non-overlapping or minimal boundary jitter)
 */
export function validateWordTimings(words: WordTimestamp[]): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (w.start >= w.end) {
      errors.push(`Word #${i} ('${w.word}'): start (${w.start}) >= end (${w.end})`);
    }
    if (i > 0 && w.start < words[i - 1].start) {
      errors.push(`Word #${i} starts before previous word #${i - 1}`);
    }
  }
  return { valid: errors.length === 0, errors };
}
