import { describe, it, expect } from 'vitest';
import {
  findViralHookWindow,
  normalizeLoudnessToLufs,
  applyBassBoost,
  applySpedUp,
  applySlowedReverb,
} from '../src/ai/viralAudio';

describe('Block 6: Viral TikTok Audio Processor', () => {
  it('should find 15s viral hook window with peak energy and drop contrast', () => {
    // 60-second curve with quiet intro (0.2), buildup, drop at 20s (1.0), and decay
    const curve = new Float32Array(600); // 10 samples per second
    for (let i = 0; i < 600; i++) {
      const t = i / 10;
      if (t < 18) curve[i] = 0.25;
      else if (t < 20) curve[i] = 0.10; // pre-drop breath
      else if (t < 35) curve[i] = 0.95; // peak drop
      else curve[i] = 0.40;
    }

    const hook = findViralHookWindow(curve, 60.0, 15.0);
    expect(hook.duration).toBe(15.0);
    expect(hook.startTime).toBeGreaterThanOrEqual(16);
    expect(hook.startTime).toBeLessThanOrEqual(21);
    expect(hook.averageEnergy).toBeGreaterThan(0.70);
  });

  it('should normalize loudness to TikTok -14 LUFS standard', () => {
    // Generate 1 second of 440Hz sine wave at -24 dBFS
    const sampleRate = 44100;
    const samples = new Float32Array(sampleRate);
    for (let i = 0; i < sampleRate; i++) {
      samples[i] = Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 0.08; // quiet
    }

    const res = normalizeLoudnessToLufs(samples, -14.0, -0.5);
    expect(res.gainDb).toBeGreaterThan(0); // needs amplification
    expect(res.peakDbAfter).toBeLessThanOrEqual(-0.5); // respects true-peak ceiling
    expect(res.normalizedSamples.length).toBe(sampleRate);
  });

  it('should apply phone-optimized +6dB bass boost low shelf', () => {
    const sampleRate = 44100;
    const lowFreq = new Float32Array(sampleRate);
    // 60Hz sub-bass sine wave
    for (let i = 0; i < sampleRate; i++) {
      lowFreq[i] = Math.sin((2 * Math.PI * 60 * i) / sampleRate) * 0.2;
    }

    const boosted = applyBassBoost(lowFreq, sampleRate, 6.0, 110);
    expect(boosted.length).toBe(sampleRate);

    // Peak amplitude of boosted 60Hz should be ~2x (+6dB)
    let maxOrig = 0, maxBoost = 0;
    for (let i = 1000; i < 2000; i++) {
      if (Math.abs(lowFreq[i]) > maxOrig) maxOrig = Math.abs(lowFreq[i]);
      if (Math.abs(boosted[i]) > maxBoost) maxBoost = Math.abs(boosted[i]);
    }
    expect(maxBoost).toBeGreaterThan(maxOrig * 1.6);
  });

  it('should resample for Sped Up Nightcore (1.20x)', () => {
    const samples = new Float32Array(1000).fill(0.5);
    const sped = applySpedUp(samples, 1.20);
    expect(sped.length).toBe(Math.floor(1000 / 1.20));
  });

  it('should resample and diffuse for Slowed + Reverb (0.85x)', () => {
    const samples = new Float32Array(3000);
    samples[0] = 1.0; // impulse
    const slowed = applySlowedReverb(samples, 44100, 0.85, 0.45);
    expect(slowed.length).toBe(Math.floor(3000 / 0.85));
    // Impulse response should diffuse over later samples (e.g. around delay 1278 * (1/0.85) ~ 1500)
    let hasEcho = false;
    for (let i = 1000; i < 2500; i++) {
      if (slowed[i] !== 0) {
        hasEcho = true;
        break;
      }
    }
    expect(hasEcho).toBe(true);
  });
});
