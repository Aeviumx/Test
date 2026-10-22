/**
 * Whisper Word-Level Alignment & Transcription Engine
 * Interfaces with local GPU Whisper (faster-whisper MIT / ONNX DirectML).
 * Extracts word-level timestamps and aligns with user song lyrics for karaoke effects.
 */

export interface WordTimestamp {
  word: string;
  start: number;
  end: number;
  confidence: number;
  canonicalWord?: string;
  waveformVerified?: boolean;
}

export interface WhisperAlignmentResult {
  audioPath: string;
  language: string;
  languageProbability: number;
  words: WordTimestamp[];
  duration: number;
}

function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }
  return dp[m][n];
}

/**
 * Fuzzy matching alignment to map detected acoustic words to user canonical lyrics
 */
export function alignWhisperWithLyrics(
  whisperWords: WordTimestamp[],
  userLyrics: string
): WordTimestamp[] {
  const canonicalTokens = userLyrics
    .split(/\s+/)
    .map(w => w.trim())
    .filter(Boolean);

  let uIdx = 0;
  return whisperWords.map(w => {
    const cleanWord = w.word.toLowerCase().replace(/[^a-z0-9]/g, '');
    let matchedCanonical: string | undefined = undefined;

    // Search ahead up to 4 words
    const maxLookahead = Math.min(4, canonicalTokens.length - uIdx);
    for (let offset = 0; offset < maxLookahead; offset++) {
      const cand = canonicalTokens[uIdx + offset].toLowerCase().replace(/[^a-z0-9]/g, '');
      const dist = levenshteinDistance(cleanWord, cand);
      const isMatch = cleanWord === cand || dist <= 1 || (cleanWord.length >= 2 && cand.startsWith(cleanWord.slice(0, 2)));
      
      if (isMatch) {
        matchedCanonical = canonicalTokens[uIdx + offset];
        uIdx += offset + 1;
        break;
      }
    }

    return {
      ...w,
      canonicalWord: matchedCanonical || w.word
    };
  });
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
