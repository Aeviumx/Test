import * as path from 'path';
import { FfmpegService } from '../electron/ffmpegService';

async function testScenes() {
  const clips = [
    'test-assets/real/anime_clip_01_eminence_action.mp4',
    'test-assets/real/anime_clip_02_telegram_ref.mp4',
    'test-assets/real/anime_clip_03_shadow_ep12.mp4',
    'test-assets/real/anime_clip_04_alpha_combat.mp4'
  ];

  const cacheDir = path.resolve('test-assets/cache');

  for (const clip of clips) {
    const full = path.resolve(clip);
    console.log(`\n=================== DETECTING SCENES FOR ${path.basename(clip)} ===================`);
    const cuts = await FfmpegService.detectScenesNative(full, cacheDir, 0.35);
    console.log(`Total scenes detected: ${cuts.length}`);
    for (const c of cuts) {
      console.log(`  Scene ${String(c.sceneIndex).padStart(2, '0')}: ${c.startTime.toFixed(3)}s -> ${c.endTime.toFixed(3)}s (dur: ${c.duration.toFixed(3)}s)`);
    }
  }
}

testScenes().catch(console.error);
