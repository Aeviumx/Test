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

async function inspectPhonk() {
  const p = path.resolve('test-assets/real/track_02_midnight_phonk.mp3');
  const cacheDir = path.resolve('test-assets/cache');
  const pcm = await FfmpegService.extractAudioPcm(p, cacheDir);
  const buf = fs.readFileSync(pcm.wavPath);
  const { channels, sampleRate } = parseWav(buf);
  
  // Calculate RMS energy per 1-second window
  const totalSecs = Math.floor(channels[0].length / sampleRate);
  console.log(`Track 02 duration: ${totalSecs} seconds`);
  
  for (let s = 0; s < totalSecs; s += 5) {
    let sum = 0;
    const start = s * sampleRate;
    const end = Math.min(channels[0].length, (s + 5) * sampleRate);
    for (let i = start; i < end; i++) {
      const m = (channels[0][i] + channels[1][i]) * 0.5;
      sum += m * m;
    }
    const rms = Math.sqrt(sum / (end - start));
    console.log(`Time ${String(s).padStart(3, ' ')}s - ${String(s + 5).padStart(3, ' ')}s: RMS = ${rms.toFixed(4)}`);
  }
}

inspectPhonk().catch(console.error);
