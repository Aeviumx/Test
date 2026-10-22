import * as fs from 'fs';
import * as path from 'path';
import { FfmpegService } from '../electron/ffmpegService';
import { analyzeAudioBuffer } from '../src/ai/audioAnalysis';

// Helper to decode 16-bit PCM WAV to Float32Array channels
function parseWav(buffer: Buffer): { channels: Float32Array[]; sampleRate: number } {
  // Simple RIFF WAV parser
  const sampleRate = buffer.readUInt32LE(24);
  const numChannels = buffer.readUInt16LE(22);
  const bitsPerSample = buffer.readUInt16LE(34);
  
  // Find 'data' chunk
  let pos = 12;
  while (pos < buffer.length - 8) {
    const chunkId = buffer.toString('ascii', pos, pos + 4);
    const chunkSize = buffer.readUInt32LE(pos + 4);
    if (chunkId === 'data') {
      const dataStart = pos + 8;
      const dataEnd = Math.min(buffer.length, dataStart + chunkSize);
      const totalSamples = (dataEnd - dataStart) / (bitsPerSample / 8) / numChannels;
      const channels: Float32Array[] = [];
      for (let c = 0; c < numChannels; c++) {
        channels.push(new Float32Array(totalSamples));
      }

      let sampleIdx = 0;
      for (let offset = dataStart; offset < dataEnd && sampleIdx < totalSamples; offset += (bitsPerSample / 8) * numChannels) {
        for (let c = 0; c < numChannels; c++) {
          if (bitsPerSample === 16) {
            const intVal = buffer.readInt16LE(offset + c * 2);
            channels[c][sampleIdx] = intVal / 32768.0;
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

async function testAudio() {
  const tracks = [
    'test-assets/real/track_01_montagem_shirt_blue.wav',
    'test-assets/real/track_02_midnight_phonk.mp3'
  ];

  const cacheDir = path.resolve('test-assets/cache');
  fs.mkdirSync(cacheDir, { recursive: true });

  for (const track of tracks) {
    const p = path.resolve(track);
    const pcm = await FfmpegService.extractAudioPcm(p, cacheDir);
    const buf = fs.readFileSync(pcm.wavPath);
    const { channels, sampleRate } = parseWav(buf);
    
    console.log(`\n=================== ANALYZING ${path.basename(track)} ===================`);
    const analysis = analyzeAudioBuffer(channels, sampleRate, { fps: 60 });
    console.log(`BPM: ${analysis.bpm}`);
    console.log(`Duration: ${analysis.duration.toFixed(3)}s, Total Beats: ${analysis.beats.length}`);
    console.log(`Sections:`, analysis.sections);
    console.log(`PreDropBreaths:`, analysis.preDropBreaths);
    console.log(`First 32 beats:`);
    for (let i = 0; i < Math.min(32, analysis.beats.length); i++) {
      const b = analysis.beats[i];
      console.log(`  Beat #${String(b.index).padStart(2, '0')}: time=${b.time.toFixed(3)}s (frame ${b.frame}), strength=${b.strength.toFixed(2)}, band=${b.frequencyBand}, downbeat=${b.isDownbeat}`);
    }
  }
}

testAudio().catch(console.error);
