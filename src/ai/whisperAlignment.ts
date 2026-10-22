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

export function countSyllables(word: string): number {
  let clean = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!clean || clean.length <= 2) return 1;
  // Handle common compound silent-e patterns like 'jukebox' -> 'juke' + 'box'
  clean = clean.replace(/([aeiouy][bcdfghjklmnpqrstvwxyz])e([bcdfghjklmnpqrstvwxyz][aeiouy])/g, '$1$2');
  const matches = clean.match(/[aeiouy]+/g);
  let count = matches ? matches.length : 1;
  // Trailing silent 'e' (e.g. dance, chance, make), unless ends with 'le' preceded by consonant
  if (clean.endsWith('e') && !clean.endsWith('le') && clean.length > 2) {
    count--;
  }
  return Math.max(1, count);
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

  // Project timings onto user canonical tokens (interpolate DELETED words based on syllable counts)
  const alignedWords: WordTimestamp[] = [];
  
  // Extract all reference word tokens and corresponding ASR alignments
  const refPairs: Array<{
    ref: string;
    hyp: WordTimestamp | null;
    type: 'MATCH' | 'SUB' | 'DEL';
  }> = [];

  for (let pIdx = 0; pIdx < rawPairs.length; pIdx++) {
    const pair = rawPairs[pIdx];
    if (!pair.ref) continue; // Skip pure ASR insertions
    refPairs.push({
      ref: pair.ref,
      hyp: pair.hyp,
      type: pair.type === 'INS' ? 'DEL' : pair.type,
    });
  }

  let lastKnownEnd = 0.0;
  let rIdx = 0;

  while (rIdx < refPairs.length) {
    const item = refPairs[rIdx];

    if (item.hyp && item.type !== 'DEL') {
      // Direct timing from ASR
      const start = item.hyp.start;
      const end = Math.max(start + 0.08, item.hyp.end);
      alignedWords.push({
        word: item.ref,
        canonicalWord: item.ref,
        start: Math.round(start * 1000) / 1000,
        end: Math.round(end * 1000) / 1000,
        confidence: item.type === 'MATCH' ? item.hyp.confidence : item.hyp.confidence * 0.7,
        alignmentType: item.type,
      });
      lastKnownEnd = end;
      rIdx++;
    } else {
      // Collect contiguous sequence of DELETED words
      const delBlock: Array<{ ref: string; index: number; syllables: number }> = [];
      let nextR = rIdx;
      while (nextR < refPairs.length && (!refPairs[nextR].hyp || refPairs[nextR].type === 'DEL')) {
        const w = refPairs[nextR].ref;
        delBlock.push({
          ref: w,
          index: nextR,
          syllables: countSyllables(w),
        });
        nextR++;
      }

      // Find the next known ASR timestamp boundary
      let nextKnownStart: number;
      if (nextR < refPairs.length && refPairs[nextR].hyp) {
        nextKnownStart = refPairs[nextR].hyp!.start;
      } else {
        const totalSyl = delBlock.reduce((acc, d) => acc + d.syllables, 0);
        nextKnownStart = lastKnownEnd + Math.max(delBlock.length * 0.08, totalSyl * 0.22);
      }

      const totalSyllables = delBlock.reduce((acc, d) => acc + d.syllables, 0);
      const rawAvailable = nextKnownStart - lastKnownEnd;
      // Guarantee at least 80 ms (0.08s) per word
      const minRequired = delBlock.length * 0.08;
      const effectiveDuration = Math.max(minRequired, rawAvailable);

      let currentT = lastKnownEnd;
      for (let k = 0; k < delBlock.length; k++) {
        const delWord = delBlock[k];
        const sylShare = totalSyllables > 0 ? delWord.syllables / totalSyllables : 1 / delBlock.length;
        const allocatedDur = Math.max(0.080, effectiveDuration * sylShare);
        const wStart = currentT;
        const wEnd = wStart + allocatedDur;

        alignedWords.push({
          word: delWord.ref,
          canonicalWord: delWord.ref,
          start: Math.round(wStart * 1000) / 1000,
          end: Math.round(wEnd * 1000) / 1000,
          confidence: 0.50,
          alignmentType: 'DEL',
        });

        currentT = wEnd;
      }

      lastKnownEnd = currentT;
      rIdx = nextR;
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
