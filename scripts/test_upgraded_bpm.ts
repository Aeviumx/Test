import * as fs from 'fs';
import * as path from 'path';
import { FfmpegService } from '../electron/ffmpegService';

function parseWav(buffer: Buffer): { channels: Float32Array[]; sampleRate: number } {
  const sampleRate = buffer.readUInt32LE(24);
  const numChannels = buffer.readUInt16LE(22);
  const bitsPerSample = buffer.readUInt16LE(34);
  let pos = 12;
  while (pos < buffer.length - 8) {
    const chunkId = buffer.toString('ascii', pos, pos + 4);
    const chunkSize = buffer.readUInt32LE(pos + 4);
    if (chunkId === 'data') {
      const dataStart = pos + 8;
      const dataEnd = Math.min(buffer.length, dataStart + chunkSize);
      const totalSamples = (dataEnd - dataStart) / (bitsPerSample / 8) / numChannels;
      const channels: Float32Array[] = [];
      for (let c = 0; c < numChannels; c++) channels.push(new Float32Array(totalSamples));
      let sampleIdx = 0;
      for (let offset = dataStart; offset < dataEnd && sampleIdx < totalSamples; offset += (bitsPerSample / 8) * numChannels) {
        for (let c = 0; c < numChannels; c++) {
          if (bitsPerSample === 16) {
            channels[c][sampleIdx] = buffer.readInt16LE(offset + c * 2) / 32768.0;
          }
        }
        sampleIdx++;
      }
      return { channels, sampleRate };
    }
    pos += 8 + chunkSize;
  }
  throw new Error('Data chunk not found in WAV');
}

// Biquad filters
function filterLowPass(input: Float32Array, sampleRate: number, cutoff: number): Float32Array {
  const output = new Float32Array(input.length);
  const rc = 1.0 / (cutoff * 2 * Math.PI);
  const dt = 1.0 / sampleRate;
  const alpha = dt / (rc + dt);
  let prev = 0;
  for (let i = 0; i < input.length; i++) {
    prev += alpha * (input[i] - prev);
    output[i] = prev;
  }
  return output;
}

function filterHighPass(input: Float32Array, sampleRate: number, cutoff: number): Float32Array {
  const output = new Float32Array(input.length);
  const rc = 1.0 / (cutoff * 2 * Math.PI);
  const dt = 1.0 / sampleRate;
  const alpha = rc / (rc + dt);
  let prevIn = 0, prevOut = 0;
  for (let i = 0; i < input.length; i++) {
    const curIn = input[i];
    prevOut = alpha * (prevOut + curIn - prevIn);
    prevIn = curIn;
    output[i] = prevOut;
  }
  return output;
}

function filterBandPass(input: Float32Array, sampleRate: number, lowCut: number, highCut: number): Float32Array {
  const hp = filterHighPass(input, sampleRate, lowCut);
  return filterLowPass(hp, sampleRate, highCut);
}

function computeRmsEnvelope(samples: Float32Array, blockSize: number, totalFrames: number): Float32Array {
  const env = new Float32Array(totalFrames);
  let maxRms = 0.0001;
  for (let f = 0; f < totalFrames; f++) {
    const start = f * blockSize;
    const end = Math.min(samples.length, start + blockSize);
    if (start >= samples.length) break;
    let sum = 0;
    for (let i = start; i < end; i++) sum += samples[i] * samples[i];
    const rms = Math.sqrt(sum / (end - start));
    env[f] = rms;
    if (rms > maxRms) maxRms = rms;
  }
  const invMax = 1 / maxRms;
  for (let f = 0; f < totalFrames; f++) {
    env[f] = Math.min(1.0, env[f] * invMax);
  }
  return env;
}

// Improved Multi-Window BPM Detection
function estimateRobustBpm(kick: Float32Array, snare: Float32Array, vocal: Float32Array, fps: number): number {
  const minBpm = 85;
  const maxBpm = 175;
  const minLag = Math.floor((60 / maxBpm) * fps);
  const maxLag = Math.floor((60 / minBpm) * fps);

  // Divide track into 8-second windows with 4-second hop
  const windowFrames = 8 * fps;
  const hopFrames = 4 * fps;
  const totalFrames = kick.length;
  const numWindows = Math.max(1, Math.floor((totalFrames - windowFrames) / hopFrames) + 1);

  const windowScores: { bpm: number; weight: number }[] = [];

  for (let w = 0; w < numWindows; w++) {
    const start = w * hopFrames;
    const end = Math.min(totalFrames, start + windowFrames);

    // Compute energy in this window
    let winEnergy = 0;
    for (let f = start; f < end; f++) {
      winEnergy += kick[f] * 2.0 + snare[f] * 1.5;
    }
    const avgEnergy = winEnergy / (end - start);
    if (avgEnergy < 0.15) continue; // Skip quiet / ambient intro windows

    // Autocorrelation within window
    let bestLag = Math.round((60 / 128) * fps);
    let maxCorr = -1;
    for (let lag = minLag; lag <= maxLag; lag++) {
      let corr = 0;
      for (let f = start; f < end - lag; f++) {
        const e1 = kick[f] * 2.0 + snare[f] * 1.2 + vocal[f] * 0.4;
        const e2 = kick[f + lag] * 2.0 + snare[f + lag] * 1.2 + vocal[f + lag] * 0.4;
        corr += e1 * e2;
      }
      if (corr > maxCorr) {
        maxCorr = corr;
        bestLag = lag;
      }
    }

    if (maxCorr > 0) {
      const rawBpm = (60 * fps) / bestLag;
      windowScores.push({ bpm: rawBpm, weight: maxCorr * avgEnergy });
    }
  }

  if (windowScores.length === 0) {
    return 120; // Fallback
  }

  // Find consensus BPM via weighted clustering
  windowScores.sort((a, b) => b.weight - a.weight);
  let totalW = 0;
  let weightedBpm = 0;
  const leadBpm = windowScores[0].bpm;

  for (const s of windowScores) {
    // Group candidates within ±4 BPM or harmonic double/half
    let effectiveBpm = s.bpm;
    if (Math.abs(effectiveBpm * 2 - leadBpm) < 4) effectiveBpm *= 2;
    if (Math.abs(effectiveBpm / 2 - leadBpm) < 4) effectiveBpm /= 2;

    if (Math.abs(effectiveBpm - leadBpm) < 6) {
      weightedBpm += effectiveBpm * s.weight;
      totalW += s.weight;
    }
  }

  const resultBpm = totalW > 0 ? weightedBpm / totalW : leadBpm;
  // Snap to integer if very close (<0.35)
  const roundBpm = Math.round(resultBpm);
  if (Math.abs(resultBpm - roundBpm) < 0.35) {
    return roundBpm;
  }
  return Math.round(resultBpm * 10) / 10;
}

async function testUpgradedBpm() {
  const tracks = [
    'test-assets/real/track_01_montagem_shirt_blue.wav',
    'test-assets/real/track_02_midnight_phonk.mp3'
  ];
  const cacheDir = path.resolve('test-assets/cache');

  for (const t of tracks) {
    const pcm = await FfmpegService.extractAudioPcm(path.resolve(t), cacheDir);
    const { channels, sampleRate } = parseWav(fs.readFileSync(pcm.wavPath));
    const numSamples = channels[0].length;
    const mono = new Float32Array(numSamples);
    for (let c = 0; c < channels.length; c++) {
      for (let i = 0; i < numSamples; i++) mono[i] += channels[c][i] / channels.length;
    }
    const subKick = filterLowPass(mono, sampleRate, 130);
    const snareClap = filterBandPass(mono, sampleRate, 250, 2400);
    const vocalLead = filterBandPass(mono, sampleRate, 850, 3800);

    const fps = 60;
    const samplesPerFrame = Math.max(1, Math.floor(sampleRate / fps));
    const totalFrames = Math.ceil((numSamples / sampleRate) * fps);

    const kickCurve = computeRmsEnvelope(subKick, samplesPerFrame, totalFrames);
    const snareCurve = computeRmsEnvelope(snareClap, samplesPerFrame, totalFrames);
    const vocalCurve = computeRmsEnvelope(vocalLead, samplesPerFrame, totalFrames);

    const bpm = estimateRobustBpm(kickCurve, snareCurve, vocalCurve, fps);
    console.log(`Track: ${path.basename(t)} -> Estimated BPM: ${bpm}`);
  }
}

testUpgradedBpm().catch(console.error);
