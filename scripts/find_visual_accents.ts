import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { FfmpegService } from '../electron/ffmpegService';

const execFileAsync = promisify(execFile);

async function findVisualAccents() {
  const ffmpeg = FfmpegService.getFfmpegPath();
  const videoPath = path.resolve('test-assets/real/refs/ref_01_gacha_hype.mp4');

  // Compute frame difference (scene metric) frame by frame
  const args = [
    '-ss', '4.0',
    '-to', '11.0',
    '-i', videoPath,
    '-vf', 'select=1,showinfo',
    '-f', 'null',
    '-'
  ];

  // We can also extract RGB split metric or frame-to-frame difference
  // Let's sample frames between 4.2 and 5.0
  const temp = path.resolve('test-assets/cache/accents_debug');
  fs.mkdirSync(temp, { recursive: true });

  await execFileAsync(ffmpeg, [
    '-ss', '4.2',
    '-i', videoPath,
    '-t', '1.0',
    '-r', '60',
    '-y',
    path.join(temp, 'f_%03d.bmp')
  ]);

  const files = fs.readdirSync(temp).filter(f => f.endsWith('.bmp')).sort();
  console.log(`Extracted ${files.length} frames between 4.2s and 5.2s`);

  let prevBuf: Buffer | null = null;
  for (let i = 0; i < files.length; i++) {
    const time = 4.2 + i * (1 / 60);
    const buf = fs.readFileSync(path.join(temp, files[i]));
    const pixelOffset = buf.readUInt32LE(10);
    
    // Average brightness
    let lumaSum = 0;
    let count = 0;
    let diffWithPrev = 0;
    let rgbSplitSum = 0;

    for (let p = pixelOffset; p < buf.length - 4; p += 40) {
      const b = buf[p];
      const g = buf[p+1];
      const r = buf[p+2];
      lumaSum += (r * 299 + g * 587 + b * 114) / 1000;
      rgbSplitSum += Math.abs(r - b);
      if (prevBuf) {
        const pb = prevBuf[p];
        const pg = prevBuf[p+1];
        const pr = prevBuf[p+2];
        diffWithPrev += Math.abs(r - pr) + Math.abs(g - pg) + Math.abs(b - pb);
      }
      count++;
    }

    const avgLuma = lumaSum / count;
    const avgDiff = prevBuf ? diffWithPrev / (count * 3) : 0;
    const avgRgbSplit = rgbSplitSum / count;

    // Check if close to user target 4.38s or 4.85s
    const isTarget = Math.abs(time - 4.38) < 0.03 || Math.abs(time - 4.85) < 0.03;
    if (avgDiff > 12 || isTarget || avgLuma > 140) {
      console.log(`Frame ${i} (t=${time.toFixed(3)}s): Luma=${avgLuma.toFixed(1)}, FrameDiff=${avgDiff.toFixed(1)}, RGBSplit=${avgRgbSplit.toFixed(1)} ${isTarget ? '<=== USER ACCENT TARGET' : ''}`);
    }
    prevBuf = buf;
  }
}

findVisualAccents().catch(console.error);
