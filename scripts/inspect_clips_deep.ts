import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { RifeService } from '../electron/rifeService';
import { FfmpegService } from '../electron/ffmpegService';

const execFileAsync = promisify(execFile);

async function inspectClipsDeep() {
  const clips = [
    'test-assets/real/anime_clip_01_eminence_action.mp4',
    'test-assets/real/anime_clip_02_telegram_ref.mp4',
    'test-assets/real/anime_clip_03_shadow_ep12.mp4',
    'test-assets/real/anime_clip_04_alpha_combat.mp4'
  ];

  const ffmpeg = FfmpegService.getFfmpegPath();
  const tempDir = path.resolve('test-assets/cache/frame_scan');
  fs.mkdirSync(tempDir, { recursive: true });

  for (const clip of clips) {
    const full = path.resolve(clip);
    const probe = await FfmpegService.probeMedia(full);
    console.log(`\n=================== DEEP ANALYSIS: ${path.basename(clip)} ===================`);
    console.log(`Duration: ${probe.duration.toFixed(2)}s, FPS: ${probe.fps}, Res: ${probe.width}x${probe.height}`);

    // Extract a sample of 120 consecutive frames (2-4 seconds) to test held frames
    const sampleDir = path.join(tempDir, path.basename(clip, '.mp4'));
    fs.mkdirSync(sampleDir, { recursive: true });

    // Clean previous
    const existing = fs.readdirSync(sampleDir);
    for (const f of existing) fs.unlinkSync(path.join(sampleDir, f));

    // Extract 100 frames starting at t=2.0s
    await execFileAsync(ffmpeg, [
      '-ss', '2.0',
      '-i', full,
      '-vframes', '100',
      '-f', 'image2',
      path.join(sampleDir, 'frame_%04d.bmp')
    ]);

    const frameFiles = fs.readdirSync(sampleDir).filter(f => f.endsWith('.bmp')).sort();
    const buffers = frameFiles.map(f => fs.readFileSync(path.join(sampleDir, f)));

    const heldScan = RifeService.scanAnimeHeldFrames(buffers, 2.0);
    const heldPercent = ((heldScan.heldFramesCount / heldScan.totalOriginalFrames) * 100).toFixed(1);
    console.log(`Held Frames: ${heldScan.heldFramesCount}/${heldScan.totalOriginalFrames} (${heldPercent}%), Cadence: ${heldScan.heldCadence}`);

    // Check letterbox (black bars) on first frame
    const bmp = buffers[0];
    // BMP header parsing: width at 18, height at 22
    const w = bmp.readInt32LE(18);
    const h = Math.abs(bmp.readInt32LE(22));
    
    // Check top and bottom rows
    let topBlackRows = 0;
    let btmBlackRows = 0;
    const rowBytes = Math.floor((w * 3 + 3) / 4) * 4;
    const pixelOffset = bmp.readUInt32LE(10);

    for (let y = 0; y < Math.floor(h * 0.2); y++) {
      let isBlack = true;
      for (let x = 0; x < w; x += 10) {
        const idx = pixelOffset + (h - 1 - y) * rowBytes + x * 3;
        const b = bmp[idx];
        const g = bmp[idx+1];
        const r = bmp[idx+2];
        if (r > 20 || g > 20 || b > 20) {
          isBlack = false;
          break;
        }
      }
      if (isBlack) topBlackRows++;
      else break;
    }

    for (let y = 0; y < Math.floor(h * 0.2); y++) {
      let isBlack = true;
      for (let x = 0; x < w; x += 10) {
        const idx = pixelOffset + y * rowBytes + x * 3;
        const b = bmp[idx];
        const g = bmp[idx+1];
        const r = bmp[idx+2];
        if (r > 20 || g > 20 || b > 20) {
          isBlack = false;
          break;
        }
      }
      if (isBlack) btmBlackRows++;
      else break;
    }

    console.log(`Letterbox: top=${topBlackRows}px, bottom=${btmBlackRows}px (Has letterbox: ${topBlackRows > 5 || btmBlackRows > 5})`);
  }
}

inspectClipsDeep().catch(console.error);
