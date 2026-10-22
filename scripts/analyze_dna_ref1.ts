import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { FfmpegService } from '../electron/ffmpegService';

const execFileAsync = promisify(execFile);

async function analyzeDnaRef1() {
  const ffmpeg = FfmpegService.getFfmpegPath();
  const videoPath = path.resolve('test-assets/real/refs/ref_01_gacha_hype.mp4');
  const tempDir = path.resolve('test-assets/cache/dna_ref1');
  fs.mkdirSync(tempDir, { recursive: true });

  console.log(`\n=================== ANALYZING DNA: REF 1 (GACHA HYPE) ===================`);
  
  // Extract luminance per frame between 4.0s and 11.5s at 60 FPS
  const args = [
    '-ss', '4.0',
    '-i', videoPath,
    '-to', '11.5',
    '-vf', 'signalstats,metadata=print:key=lavfi.signalstats.YAVG',
    '-f', 'null',
    '-'
  ];

  const { stderr } = await execFileAsync(ffmpeg, args);
  
  const frameRegex = /pts_time:(\d+\.\d+).*?YAVG=(\d+\.?\d*)/gs;
  const samples: { time: number; yavg: number }[] = [];
  
  // Alternative parse: line by line
  const lines = stderr.split('\n');
  let curPts = 0;
  for (const line of lines) {
    const ptsMatch = line.match(/pts_time:(\d+\.\d+)/);
    if (ptsMatch) {
      curPts = parseFloat(ptsMatch[1]);
    }
    const yMatch = line.match(/lavfi\.signalstats\.YAVG=(\d+\.?\d*)/);
    if (yMatch) {
      const yavg = parseFloat(yMatch[1]);
      samples.push({ time: curPts + 4.0, yavg });
    }
  }

  console.log(`Collected ${samples.length} frame luminance samples.`);

  // Detect flash spikes (where YAVG spikes significantly above local baseline)
  const flashes: { time: number; delta: number; yavg: number }[] = [];
  for (let i = 2; i < samples.length - 2; i++) {
    const cur = samples[i].yavg;
    const prev = samples[i - 1].yavg;
    const prev2 = samples[i - 2].yavg;
    const next = samples[i + 1].yavg;
    const base = (prev2 + prev) / 2;
    const delta = cur - base;

    // Flash spike: sudden brightness jump > 25
    if (delta > 25 && cur >= next) {
      // Avoid grouping within 0.15s
      const last = flashes[flashes.length - 1];
      if (!last || samples[i].time - last.time > 0.15) {
        flashes.push({ time: samples[i].time, delta, yavg: cur });
      }
    }
  }

  const userTimestamps = [4.38, 4.85, 5.73, 6.23, 6.70, 7.58, 8.08, 8.55, 9.43, 9.93, 10.40];

  console.log(`\nDetected Flashes vs User Timestamps:`);
  console.log(`---------------------------------------------------------------`);
  console.log(`User Target (s) | Detected (s) | Diff (frames @ 60fps) | Match?`);
  console.log(`---------------------------------------------------------------`);

  for (const uTime of userTimestamps) {
    let closest = flashes[0];
    let minDiff = 999;
    for (const f of flashes) {
      const diff = Math.abs(f.time - uTime);
      if (diff < minDiff) {
        minDiff = diff;
        closest = f;
      }
    }
    const frameDiff = Math.round(minDiff * 60);
    const isMatch = frameDiff <= 2;
    console.log(`  ${uTime.toFixed(2)}s         |  ${closest ? closest.time.toFixed(3) : 'none'}s    |  ${frameDiff} frames             | ${isMatch ? '✓ EXACT MATCH' : 'MISMATCH'}`);
  }
}

analyzeDnaRef1().catch(console.error);
