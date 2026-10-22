import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { FfmpegService } from '../electron/ffmpegService.ts';

const execFileAsync = promisify(execFile);

export async function generateTestAssets(baseDir: string): Promise<void> {
  const assetsDir = path.join(baseDir, 'test-assets');
  fs.mkdirSync(assetsDir, { recursive: true });

  const ffmpeg = FfmpegService.getFfmpegPath();

  // 1. Generate 8s 130 BPM Test Audio WAV with pre-drop silence breath & bass drop
  const audioWavPath = path.join(assetsDir, 'test_phonk_audio.wav');
  if (!fs.existsSync(audioWavPath)) {
    const sampleRate = 44100;
    const duration = 10.0;
    const numSamples = Math.floor(sampleRate * duration);
    const bpm = 130;

    const buffer = Buffer.alloc(44 + numSamples * 2); // 16-bit mono

    // RIFF header
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + numSamples * 2, 4);
    buffer.write('WAVE', 8);
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20); // PCM
    buffer.writeUInt16LE(1, 22); // Mono
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(sampleRate * 2, 28);
    buffer.writeUInt16LE(2, 32); // Block align
    buffer.writeUInt16LE(16, 34); // Bits per sample
    buffer.write('data', 36);
    buffer.writeUInt32LE(numSamples * 2, 40);

    for (let s = 0; s < numSamples; s++) {
      const t = s / sampleRate;
      const beat = (t * bpm) / 60;
      let amp = 0;

      if (beat < 4) {
        // Soft quiet synth intro
        amp = 0.05 * Math.sin(2 * Math.PI * 440 * t);
      } else if (beat >= 4 && beat < 7.5) {
        // Accelerating snare roll
        const isSnare = (beat * 2) % 1 < 0.25;
        amp = isSnare ? (Math.random() * 2 - 1) * 0.35 : 0.03;
      } else if (beat >= 7.5 && beat < 8.0) {
        // Dramatic silence (pre-drop breath)
        amp = 0.001;
      } else {
        // Massive bass drop kick on beat
        const beatFrac = beat % 1;
        const kick = beatFrac < 0.35 ? (1 - beatFrac / 0.35) * Math.sin(2 * Math.PI * 52 * t) * 0.95 : 0;
        amp = kick;
      }

      const sampleVal = Math.max(-32768, Math.min(32767, Math.round(amp * 32767)));
      buffer.writeInt16LE(sampleVal, 44 + s * 2);
    }

    fs.writeFileSync(audioWavPath, buffer);
    console.log('✓ Generated test audio:', audioWavPath);
  }

  // 2. Generate 3-Scene Video MP4 (Scene 1: Red at 0-2s, Scene 2: Cyan at 2-4s, Scene 3: Yellow at 4-7s)
  const videoCutsPath = path.join(assetsDir, 'test_scene_cuts.mp4');
  if (!fs.existsSync(videoCutsPath)) {
    // 3 distinct color scenes with high delta E for native scene detection
    const filter = [
      "color=c=0xe11d48:s=640x360:d=2.0[s1]",
      "color=c=0x38bdf8:s=640x360:d=2.0[s2]",
      "color=c=0xf59e0b:s=640x360:d=3.0[s3]",
      "[s1][s2][s3]concat=n=3:v=1:a=0[v]",
    ].join(';');

    await execFileAsync(ffmpeg, [
      '-y',
      '-filter_complex', filter,
      '-map', '[v]',
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-r', '60',
      videoCutsPath,
    ]);
    console.log('✓ Generated test scene video:', videoCutsPath);
  }

  // 3. Generate Anime Held Frames (Animation on 2s and 3s)
  const heldDir = path.join(assetsDir, 'held_frames');
  fs.mkdirSync(heldDir, { recursive: true });

  // 10 frames:
  // f0, f1 identical (hold on 2s)
  // f2, f3 identical (hold on 2s)
  // f4, f5, f6 identical (hold on 3s)
  // f7, f8, f9 unique
  for (let f = 0; f < 10; f++) {
    const frameFile = path.join(heldDir, `frame_${String(f).padStart(3, '0')}.png`);
    let color = '0x1e293b';
    if (f < 2) color = '0x0f172a';
    else if (f < 4) color = '0x334155';
    else if (f < 7) color = '0x475569';
    else if (f === 7) color = '0x64748b';
    else if (f === 8) color = '0x94a3b8';
    else color = '0xcbd5e1';

    if (!fs.existsSync(frameFile)) {
      await execFileAsync(ffmpeg, [
        '-y',
        '-f', 'lavfi',
        '-i', `color=c=${color}:s=320x320:d=0.033`,
        '-vframes', '1',
        frameFile,
      ]);
    }
  }
  console.log('✓ Generated anime held frames (2s and 3s cadence) in:', heldDir);

  // 4. Generate Hardsubbed Image (Subtitles in lower 15%)
  const subFile = path.join(assetsDir, 'hardsub_sample.png');
  if (!fs.existsSync(subFile)) {
    // Generate base dark frame with sharp white text in bottom 15% (y=300)
    await execFileAsync(ffmpeg, [
      '-y',
      '-f', 'lavfi',
      '-i', 'color=c=0x0b0f17:s=360x360:d=1',
      '-vf', "drawtext=text='Anime FanSub Episode 01':fontcolor=white:fontsize=18:x=(w-text_w)/2:y=h-40:borderw=2:bordercolor=black",
      '-vframes', '1',
      subFile,
    ]);
    console.log('✓ Generated hardsub test image:', subFile);
  }

  // 5. Generate Letterbox Image (Black bars top & bottom)
  const letterboxFile = path.join(assetsDir, 'letterbox_sample.png');
  if (!fs.existsSync(letterboxFile)) {
    await execFileAsync(ffmpeg, [
      '-y',
      '-f', 'lavfi',
      '-i', 'color=c=0x38bdf8:s=360x240:d=1',
      '-vf', 'pad=360:360:0:60:black', // 60px black bar top, 60px black bar bottom
      '-vframes', '1',
      letterboxFile,
    ]);
    console.log('✓ Generated letterbox test image:', letterboxFile);
  }
}
