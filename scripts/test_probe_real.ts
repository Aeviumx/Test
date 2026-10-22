import * as path from 'path';
import { FfmpegService } from '../electron/ffmpegService';

async function main() {
  const assets = [
    'test-assets/real/track_01_montagem_shirt_blue.wav',
    'test-assets/real/track_02_midnight_phonk.mp3',
    'test-assets/real/anime_clip_01_eminence_action.mp4',
    'test-assets/real/anime_clip_02_telegram_ref.mp4',
    'test-assets/real/anime_clip_03_shadow_ep12.mp4',
    'test-assets/real/anime_clip_04_alpha_combat.mp4'
  ];

  for (const rel of assets) {
    const fullPath = path.resolve(rel);
    const probe = await FfmpegService.probeMedia(fullPath);
    console.log(JSON.stringify({
      file: rel,
      duration: probe.duration,
      fps: probe.fps,
      width: probe.width,
      height: probe.height,
      hasVideo: probe.hasVideo,
      hasAudio: probe.hasAudio,
      codec: probe.codec,
      audioSampleRate: probe.audioSampleRate
    }, null, 2));
  }
}

main().catch(console.error);
