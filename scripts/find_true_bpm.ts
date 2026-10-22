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

async function findTrueBpm() {
  const p = path.resolve('test-assets/real/track_02_midnight_phonk.mp3');
  const cacheDir = path.resolve('test-assets/cache');
  const pcm = await FfmpegService.extractAudioPcm(p, cacheDir);
  const buf = fs.readFileSync(pcm.wavPath);
  const { channels, sampleRate } = parseWav(buf);
  
  // Downmix to mono
  const mono = new Float32Array(channels[0].length);
  for (let i = 0; i < mono.length; i++) {
    mono[i] = (channels[0][i] + channels[1][i]) * 0.5;
  }

  // Calculate onset envelope / RMS in 60 FPS frames
  const fps = 60;
  const samplesPerFrame = Math.floor(sampleRate / fps);
  const totalFrames = Math.floor(mono.length / samplesPerFrame);
  const energy = new Float32Array(totalFrames);
  
  for (let f = 0; f < totalFrames; f++) {
    let sum = 0;
    const start = f * samplesPerFrame;
    for (let i = 0; i < samplesPerFrame; i++) {
      const s = mono[start + i];
      sum += s * s;
    }
    energy[f] = Math.sqrt(sum / samplesPerFrame);
  }

  // Test autocorrelation in high energy window 15s to 45s (frame 900 to 2700)
  const startF = 15 * fps;
  const lenF = 25 * fps;
  
  for (let testBpm = 90; testBpm <= 165; testBpm += 0.5) {
    const lag = (60 / testBpm) * fps;
    const iLag = Math.round(lag);
    let corr = 0;
    for (let f = startF; f < startF + lenF - iLag; f++) {
      corr += energy[f] * energy[f + iLag];
    }
    if (testBpm % 5 === 0 || testBpm === 120 || testBpm === 128 || testBpm === 130 || testBpm === 140) {
      console.log(`BPM ${testBpm.toFixed(1)} (lag ${iLag}): corr = ${corr.toFixed(2)}`);
    }
  }

  // Find argmax
  let maxCorr = -1;
  let bestBpm = 0;
  for (let testBpm = 90; testBpm <= 170; testBpm += 0.2) {
    const lag = (60 / testBpm) * fps;
    const iLag = Math.round(lag);
    let corr = 0;
    for (let f = startF; f < startF + lenF - iLag; f++) {
      corr += energy[f] * energy[f + iLag];
    }
    if (corr > maxCorr) {
      maxCorr = corr;
      bestBpm = testBpm;
    }
  }
  console.log(`\nBEST BPM for Midnight Phonk in drop section: ${bestBpm.toFixed(2)} BPM!`);
}

findTrueBpm().catch(console.error);
