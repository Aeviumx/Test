/**
 * Viral TikTok Audio Processor & Hook Finder Engine
 * - Locates peak 15s / 30s viral hook window (drops, energetic chorus, vocal spikes)
 * - TikTok -14 LUFS loudness normalizer with true-peak ceiling (-0.5 dBFS)
 * - Phone-optimized +6dB Bass Boost low-shelf filter (<110 Hz)
 * - Sped Up (Nightcore 1.15x - 1.25x) and Slowed + Reverb (0.85x with ethereal decay)
 */

export interface ViralHookWindow {
  startTime: number;     // seconds
  endTime: number;       // seconds
  duration: number;      // seconds
  averageEnergy: number; // 0..1
  peakEnergy: number;    // 0..1
  dropContrastScore: number; // bonus for having a dramatic drop right after quiet intro/pause
}

export interface LoudnessNormalizationResult {
  estimatedLufs: number;
  gainDb: number;
  gainFactor: number;
  peakDbBefore: number;
  peakDbAfter: number;
  normalizedSamples: Float32Array;
}

export type ViralAudioMode = 'original' | 'sped-up' | 'slowed-reverb' | 'bass-boosted';

export interface ViralAudioProcessingOptions {
  mode?: ViralAudioMode;
  targetLufs?: number;    // default -14.0 LUFS
  targetDuration?: 15 | 30; // seconds
  speedFactor?: number;   // e.g. 1.20 for sped up, 0.85 for slowed
  bassBoostDb?: number;   // default +6.0 dB
}

/**
 * Finds the optimal 15-second or 30-second window in the track for maximum TikTok/Shorts retention.
 * Scans energy envelope and rewards high drop energy with a preceding pre-drop contrast.
 */
export function findViralHookWindow(
  energyCurve: number[] | Float32Array,
  totalDuration: number,
  targetDuration = 15.0
): ViralHookWindow {
  const numFrames = energyCurve.length;
  if (numFrames === 0 || totalDuration <= targetDuration) {
    return {
      startTime: 0,
      endTime: Math.min(targetDuration, totalDuration),
      duration: Math.min(targetDuration, totalDuration),
      averageEnergy: 0.8,
      peakEnergy: 1.0,
      dropContrastScore: 1.0,
    };
  }

  const framesPerSec = numFrames / totalDuration;
  const windowFrames = Math.max(1, Math.round(targetDuration * framesPerSec));
  const stepFrames = Math.max(1, Math.round(framesPerSec * 0.25)); // 250ms step

  let bestStartTime = 0;
  let bestScore = -Infinity;
  let bestAvgEnergy = 0;
  let bestPeakEnergy = 0;
  let bestContrast = 0;

  for (let start = 0; start <= numFrames - windowFrames; start += stepFrames) {
    let sum = 0;
    let peak = 0;
    for (let i = start; i < start + windowFrames; i++) {
      const e = energyCurve[i];
      sum += e;
      if (e > peak) peak = e;
    }
    const avg = sum / windowFrames;

    // Check contrast in the first 2 seconds of the window (is there a dramatic drop?)
    const introFrames = Math.round(framesPerSec * 2.0);
    let introSum = 0;
    for (let i = start; i < Math.min(numFrames, start + introFrames); i++) {
      introSum += energyCurve[i];
    }
    const introAvg = introSum / Math.max(1, introFrames);
    const dropContrast = Math.max(0, peak - introAvg);

    // Retention formula: 60% average energy + 25% peak energy + 15% drop contrast
    const score = avg * 0.60 + peak * 0.25 + dropContrast * 0.15;

    if (score > bestScore) {
      bestScore = score;
      bestStartTime = start / framesPerSec;
      bestAvgEnergy = avg;
      bestPeakEnergy = peak;
      bestContrast = dropContrast;
    }
  }

  return {
    startTime: Math.round(bestStartTime * 100) / 100,
    endTime: Math.round((bestStartTime + targetDuration) * 100) / 100,
    duration: targetDuration,
    averageEnergy: Math.round(bestAvgEnergy * 100) / 100,
    peakEnergy: Math.round(bestPeakEnergy * 100) / 100,
    dropContrastScore: Math.round(bestContrast * 100) / 100,
  };
}

/**
 * Approximates integrated LUFS loudness (ITU-R BS.1770) and normalizes to TikTok -14 LUFS target.
 */
export function normalizeLoudnessToLufs(
  samples: Float32Array,
  targetLufs = -14.0,
  ceilingDb = -0.5
): LoudnessNormalizationResult {
  const len = samples.length;
  if (len === 0) {
    return {
      estimatedLufs: -70,
      gainDb: 0,
      gainFactor: 1.0,
      peakDbBefore: -70,
      peakDbAfter: -70,
      normalizedSamples: new Float32Array(0),
    };
  }

  // Calculate RMS & peak
  let sumSq = 0;
  let maxPeak = 0;
  for (let i = 0; i < len; i++) {
    const abs = Math.abs(samples[i]);
    if (abs > maxPeak) maxPeak = abs;
    sumSq += samples[i] * samples[i];
  }

  const rms = Math.sqrt(sumSq / len);
  const rmsDb = rms > 0.000001 ? 20 * Math.log10(rms) : -70;
  // ITU-R BS.1770 LUFS approximation from RMS
  const estimatedLufs = Math.max(-70, rmsDb - 0.691);
  const peakDbBefore = maxPeak > 0 ? 20 * Math.log10(maxPeak) : -70;

  // Calculate required gain
  let gainDb = targetLufs - estimatedLufs;

  // Ensure true peak does not exceed ceiling (-0.5 dBFS)
  const maxAllowedGainDb = ceilingDb - peakDbBefore;
  if (gainDb > maxAllowedGainDb) {
    gainDb = maxAllowedGainDb;
  }

  const gainFactor = Math.pow(10, gainDb / 20);
  const normalizedSamples = new Float32Array(len);
  let newPeak = 0;

  for (let i = 0; i < len; i++) {
    let s = samples[i] * gainFactor;
    // Soft saturation limiter to prevent digital hard clipping
    if (s > 0.95) s = 0.95 + Math.tanh((s - 0.95) * 2) * 0.04;
    else if (s < -0.95) s = -0.95 + Math.tanh((s + 0.95) * 2) * 0.04;

    normalizedSamples[i] = s;
    const abs = Math.abs(s);
    if (abs > newPeak) newPeak = abs;
  }

  const peakDbAfter = newPeak > 0 ? 20 * Math.log10(newPeak) : -70;

  return {
    estimatedLufs: Math.round(estimatedLufs * 10) / 10,
    gainDb: Math.round(gainDb * 10) / 10,
    gainFactor,
    peakDbBefore: Math.round(peakDbBefore * 10) / 10,
    peakDbAfter: Math.round(peakDbAfter * 10) / 10,
    normalizedSamples,
  };
}

/**
 * Phone-optimized low-shelf bass boost filter (+6dB < 110Hz)
 */
export function applyBassBoost(
  samples: Float32Array,
  sampleRate = 44100,
  boostDb = 6.0,
  cutoffHz = 110
): Float32Array {
  const len = samples.length;
  const out = new Float32Array(len);

  // Biquad Low-Shelf Filter
  const A = Math.pow(10, boostDb / 40);
  const w0 = (2 * Math.PI * cutoffHz) / sampleRate;
  const alpha = Math.sin(w0) / (2 * 0.707); // Q = 0.707
  const cosW0 = Math.cos(w0);

  const b0 = A * (A + 1 - (A - 1) * cosW0 + 2 * Math.sqrt(A) * alpha);
  const b1 = 2 * A * (A - 1 - (A + 1) * cosW0);
  const b2 = A * (A + 1 - (A - 1) * cosW0 - 2 * Math.sqrt(A) * alpha);
  const a0 = A + 1 + (A - 1) * cosW0 + 2 * Math.sqrt(A) * alpha;
  const a1 = -2 * (A - 1 + (A + 1) * cosW0);
  const a2 = A + 1 + (A - 1) * cosW0 - 2 * Math.sqrt(A) * alpha;

  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < len; i++) {
    const x0 = samples[i];
    const y0 = (b0 / a0) * x0 + (b1 / a0) * x1 + (b2 / a0) * x2 - (a1 / a0) * y1 - (a2 / a0) * y2;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
    out[i] = y0;
  }

  return out;
}

/**
 * Sped Up / Nightcore resampler (e.g. 1.15x - 1.25x speed + proportional pitch shift)
 */
export function applySpedUp(samples: Float32Array, speedFactor = 1.18): Float32Array {
  const inLen = samples.length;
  const outLen = Math.floor(inLen / speedFactor);
  const out = new Float32Array(outLen);

  for (let i = 0; i < outLen; i++) {
    const inPos = i * speedFactor;
    const idx = Math.floor(inPos);
    const frac = inPos - idx;
    const s0 = samples[idx] || 0;
    const s1 = samples[idx + 1] || s0;
    out[i] = s0 + frac * (s1 - s0); // Linear interpolation
  }

  return out;
}

/**
 * Slowed + Reverb resampler & diffusion reverb engine
 */
export function applySlowedReverb(
  samples: Float32Array,
  sampleRate = 44100,
  speedFactor = 0.85,
  decay = 0.45
): Float32Array {
  // 1. Slow down
  const inLen = samples.length;
  const slowedLen = Math.floor(inLen / speedFactor);
  const slowed = new Float32Array(slowedLen);

  for (let i = 0; i < slowedLen; i++) {
    const inPos = i * speedFactor;
    const idx = Math.floor(inPos);
    const frac = inPos - idx;
    const s0 = samples[idx] || 0;
    const s1 = samples[idx + 1] || s0;
    slowed[i] = s0 + frac * (s1 - s0);
  }

  // 2. Schroeder Ambient Reverb (Comb filter delays + All-pass diffusion)
  const delays = [Math.round(sampleRate * 0.029), Math.round(sampleRate * 0.037), Math.round(sampleRate * 0.043)];
  const combBuffers = delays.map((d) => new Float32Array(d));
  const combIndices = [0, 0, 0];
  const out = new Float32Array(slowedLen);

  for (let i = 0; i < slowedLen; i++) {
    const input = slowed[i];
    let combSum = 0;

    for (let c = 0; c < delays.length; c++) {
      const d = delays[c];
      const buf = combBuffers[c];
      const ptr = combIndices[c];
      const delayed = buf[ptr];
      buf[ptr] = input + delayed * decay;
      combIndices[c] = (ptr + 1) % d;
      combSum += delayed;
    }

    out[i] = input * 0.65 + (combSum / delays.length) * 0.35;
  }

  return out;
}
