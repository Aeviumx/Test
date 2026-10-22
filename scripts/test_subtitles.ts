import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { FfmpegService } from '../electron/ffmpegService';

const execFileAsync = promisify(execFile);

// Temporal hardsub detector:
// Real hardsub text glyphs stay in identical (x, y) coordinates for 1.0 to 5.0 seconds
// while the underlying or surrounding anime video pixels change.
async function detectTemporalHardsubs(videoPath: string, duration: number): Promise<{ hasHardsub: boolean; subTimeRanges: Array<{ start: number; end: number }> }> {
  const ffmpeg = FfmpegService.getFfmpegPath();
  const tempDir = path.resolve('test-assets/cache/sub_scan');
  fs.mkdirSync(tempDir, { recursive: true });

  const subTimeRanges: Array<{ start: number; end: number }> = [];

  // Sample at 1 second intervals
  const probe = await FfmpegService.probeMedia(videoPath);
  const w = probe.width || 640;
  const h = probe.height || 360;

  // We sample bottom 18% of frame
  const botY = Math.floor(h * 0.82);
  const botH = h - botY;

  // Check every 3 seconds
  for (let t = 1.0; t < duration - 2.0; t += 3.0) {
    const f1 = path.join(tempDir, `f_${t.toFixed(1)}_a.bmp`);
    const f2 = path.join(tempDir, `f_${(t + 1.2).toFixed(1)}_b.bmp`);

    try {
      await execFileAsync(ffmpeg, ['-ss', String(t), '-i', videoPath, '-vframes', '1', '-y', f1]);
      await execFileAsync(ffmpeg, ['-ss', String(t + 1.2), '-i', videoPath, '-vframes', '1', '-y', f2]);

      if (fs.existsSync(f1) && fs.existsSync(f2)) {
        const b1 = fs.readFileSync(f1);
        const b2 = fs.readFileSync(f2);

        const rowBytes = Math.floor((w * 3 + 3) / 4) * 4;
        const pixelOffset = b1.readUInt32LE(10);

        let staticHighContrastEdges = 0;
        let movingBackgroundPixels = 0;

        for (let y = 4; y < botH - 4; y += 2) {
          for (let x = 16; x < w - 16; x += 2) {
            const idx = pixelOffset + y * rowBytes + x * 3;
            const idxR = pixelOffset + y * rowBytes + (x + 2) * 3;

            // Luma frame 1
            const l1 = (b1[idx+2] * 299 + b1[idx+1] * 587 + b1[idx] * 114) / 1000;
            const l1R = (b1[idxR+2] * 299 + b1[idxR+1] * 587 + b1[idxR] * 114) / 1000;
            const edge1 = Math.abs(l1 - l1R);

            // Luma frame 2
            const l2 = (b2[idx+2] * 299 + b2[idx+1] * 587 + b2[idx] * 114) / 1000;
            const l2R = (b2[idxR+2] * 299 + b2[idxR+1] * 587 + b2[idxR] * 114) / 1000;
            const edge2 = Math.abs(l2 - l2R);

            const pixelDiff = Math.abs(l1 - l2);
            if (pixelDiff > 15) {
              movingBackgroundPixels++;
            }

            // Both frames have sharp text stroke edge in the EXACT same coordinate
            if (edge1 > 75 && edge2 > 75 && Math.abs(edge1 - edge2) < 25) {
              staticHighContrastEdges++;
            }
          }
        }

        // Clean up
        fs.unlinkSync(f1);
        fs.unlinkSync(f2);

        // If glyph edges are stationary while background is changing
        if (staticHighContrastEdges > 40 && movingBackgroundPixels > 100) {
          subTimeRanges.push({ start: t, end: t + 2.0 });
        }
      }
    } catch {
      // ignore
    }
  }

  return {
    hasHardsub: subTimeRanges.length > 0,
    subTimeRanges
  };
}

async function testSubtitles() {
  const clips = [
    'test-assets/real/anime_clip_01_eminence_action.mp4',
    'test-assets/real/anime_clip_02_telegram_ref.mp4',
    'test-assets/real/anime_clip_03_shadow_ep12.mp4',
    'test-assets/real/anime_clip_04_alpha_combat.mp4'
  ];

  for (const c of clips) {
    const full = path.resolve(c);
    const probe = await FfmpegService.probeMedia(full);
    const result = await detectTemporalHardsubs(full, probe.duration);
    console.log(`\nClip: ${path.basename(c)}`);
    console.log(`  Has Hardsub: ${result.hasHardsub}`);
    if (result.hasHardsub) {
      console.log(`  Sub ranges:`, result.subTimeRanges);
    }
  }
}

testSubtitles().catch(console.error);
