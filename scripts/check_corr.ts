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

async function checkCorr() {
  const p = path.resolve('test-assets/real/track_01_montagem_shirt_blue.wav');
  const cacheDir = path.resolve('test-assets/cache');
  const pcm = await FfmpegService.extractAudioPcm(p, cacheDir);
  const { channels, sampleRate } = parseWav(fs.readFileSync(pcm.wavPath));
  
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

  // Look at lags from 80 BPM to 180 BPM
  const minLag = Math.floor((60 / 180) * fps); // 20
  const maxLag = Math.floor((60 / 80) * fps);  // 45

  const results: { bpm: number; lag: number; corr: number }[] = [];
  for (let lag = minLag; lag <= maxLag; lag++) {
    let corr = 0;
    for (let f = 0; f < totalFrames - lag; f++) {
      corr += energy[f] * energy[f + lag];
    }
    const bpm = (60 * fps) / lag;
    results.push({ bpm, lag, corr });
  }

  results.sort((a, b) => b.corr - a.corr);
  console.log('Top 5 autocorrelation peaks for track_01:');
  for (let i = 0; i < 5; i++) {
    console.log(`  BPM: ${results[i].bpm.toFixed(1)} (lag ${results[i].lag}): corr = ${results[i].corr.toFixed(2)}`);
  }
}

checkCorr().catch(console.error);
