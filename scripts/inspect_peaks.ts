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

async function inspectPeaks() {
  const p = path.resolve('test-assets/real/track_01_montagem_shirt_blue.wav');
  const cacheDir = path.resolve('test-assets/cache');
  const pcm = await FfmpegService.extractAudioPcm(p, cacheDir);
  const buf = fs.readFileSync(pcm.wavPath);
  const { channels, sampleRate } = parseWav(buf);

  // Compute energy per 1/60s frame
  const fps = 60;
  const samplesPerFrame = Math.floor(sampleRate / fps);
  const totalFrames = Math.floor(channels[0].length / samplesPerFrame);
  const energy = new Float32Array(totalFrames);
  for (let f = 0; f < totalFrames; f++) {
    let sum = 0;
    const start = f * samplesPerFrame;
    for (let i = 0; i < samplesPerFrame; i++) {
      const s = (channels[0][start + i] + channels[1][start + i]) * 0.5;
      sum += s * s;
    }
    energy[f] = Math.sqrt(sum / samplesPerFrame);
  }

  // Find local peaks
  const peaks: { frame: number; time: number; val: number }[] = [];
  for (let f = 2; f < totalFrames - 2; f++) {
    if (energy[f] > 0.15 &&
        energy[f] >= energy[f-1] && energy[f] >= energy[f-2] &&
        energy[f] >= energy[f+1] && energy[f] >= energy[f+2]) {
      peaks.push({ frame: f, time: f / fps, val: energy[f] });
    }
  }

  console.log('Total peaks:', peaks.length);
  for (let i = 0; i < Math.min(25, peaks.length); i++) {
    const cur = peaks[i];
    const prev = i > 0 ? peaks[i-1] : null;
    const diffF = prev ? cur.frame - prev.frame : 0;
    const diffSec = diffF / fps;
    console.log(`Peak #${i}: frame=${cur.frame} (t=${cur.time.toFixed(3)}s), dF=${diffF} (${diffSec.toFixed(3)}s, ~${diffSec > 0 ? (60 / diffSec).toFixed(1) : ''} BPM)`);
  }
}

inspectPeaks().catch(console.error);
