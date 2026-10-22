import * as path from 'path';
import { FfmpegService } from '../electron/ffmpegService';

async function main() {
  const refs = [
    'test-assets/real/refs/ref_01_gacha_hype.mp4',
    'test-assets/real/refs/ref_02_aesthetic_lyric.mp4'
  ];

  for (const r of refs) {
    const full = path.resolve(r);
    const p = await FfmpegService.probeMedia(full);
    console.log(JSON.stringify({
      name: path.basename(r),
      duration: p.duration,
      fps: p.fps,
      width: p.width,
      height: p.height,
      hasAudio: p.hasAudio,
      codec: p.codec
    }, null, 2));
  }
}

main().catch(console.error);
