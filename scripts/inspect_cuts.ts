import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { FfmpegService } from '../electron/ffmpegService';

const execFileAsync = promisify(execFile);

async function inspectCuts() {
  const ffmpeg = FfmpegService.getFfmpegPath();
  const video = path.resolve('test-assets/real/anime_clip_01_eminence_action.mp4');
  const temp = path.resolve('test-assets/cache/strobe_test');
  fs.mkdirSync(temp, { recursive: true });

  // Extract frames from t=0.4 to 0.6 (around cut 0.5s)
  await execFileAsync(ffmpeg, [
    '-ss', '0.4',
    '-i', video,
    '-vframes', '15',
    '-y',
    path.join(temp, 'f_%02d.bmp')
  ]);

  const files = fs.readdirSync(temp).filter(f => f.endsWith('.bmp')).sort();
  console.log('Frames around 0.5s:');
  for (const f of files) {
    const buf = fs.readFileSync(path.join(temp, f));
    // Sample average brightness
    const pixelOffset = buf.readUInt32LE(10);
    let lumaSum = 0;
    const len = buf.length - pixelOffset;
    const step = 300;
    let cnt = 0;
    for (let i = pixelOffset; i < buf.length - 3; i += step) {
      const b = buf[i];
      const g = buf[i+1];
      const r = buf[i+2];
      lumaSum += (r * 299 + g * 587 + b * 114) / 1000;
      cnt++;
    }
    const avgLuma = cnt > 0 ? lumaSum / cnt : 0;
    console.log(`  ${f}: avg luma = ${avgLuma.toFixed(1)}`);
  }
}

inspectCuts().catch(console.error);
