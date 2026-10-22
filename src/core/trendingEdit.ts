import {
  Composition,
  MediaAsset,
  Project,
  Vec2,
} from '../types';
import { createId } from '../utils/id';
import {
  createDefaultComposition,
  createDefaultLayer,
  createEffectInstance,
  createKeyframe,
  createProperty,
} from './defaults';

export function createTrendingAnimeEditProject(): Project {
  // 1. Assets: Rendered Master Edit + Soundtrack
  const masterVideoAsset: MediaAsset = {
    id: 'asset_gacha_master_edit',
    name: 'Anime_Gacha_Fast_Paced_Edit_1080p60.mp4',
    type: 'video',
    mimeType: 'video/mp4',
    url: '/assets/anime_gacha_edit.mp4',
    width: 1080,
    height: 1080,
    duration: 8.00,
    scenes: [
      { id: 'scn_0', assetId: 'asset_gacha_master_edit', sceneIndex: 0, name: '01 // Vera Garnet Splash Art (Push-in)', inPoint: 0.00, outPoint: 0.90, duration: 0.90 },
      { id: 'scn_1', assetId: 'asset_gacha_master_edit', sceneIndex: 1, name: '02 // Liv Empyrea Splash Art (Circular Light)', inPoint: 0.90, outPoint: 1.80, duration: 0.90 },
      { id: 'scn_2', assetId: 'asset_gacha_master_edit', sceneIndex: 2, name: '03 // Lucia Plume Splash Art (Red Panel)', inPoint: 1.80, outPoint: 2.70, duration: 0.90 },
      { id: 'scn_3', assetId: 'asset_gacha_master_edit', sceneIndex: 3, name: '04 // Three Cards Shrink & Build-up', inPoint: 2.70, outPoint: 3.86, duration: 1.16 },
      { id: 'scn_4', assetId: 'asset_gacha_master_edit', sceneIndex: 4, name: '05 // 🔥 BASS DROP: Whip-Pan & Zoom Blur Swaps', inPoint: 3.86, outPoint: 5.50, duration: 1.64 },
      { id: 'scn_5', assetId: 'asset_gacha_master_edit', sceneIndex: 5, name: '06 // Final Shot: Trio with Long Red Blade', inPoint: 5.50, outPoint: 8.00, duration: 2.50 },
    ],
  };

  const audioAsset: MediaAsset = {
    id: 'asset_trending_soundtrack',
    name: 'Montagem_Shirt_Blue_Phonk_8s.aac',
    type: 'audio',
    mimeType: 'audio/aac',
    url: '/assets/gacha_audio_8s.aac',
    duration: 8.00,
  };

  // 2. Main 1:1 Square Edit Composition (1080x1080 @ 60 FPS, 8.00s)
  const mainComp: Composition = createDefaultComposition({
    name: 'Anime Gacha-Game Style Edit [8s • 1:1 • 60 FPS]',
    width: 1080,
    height: 1080,
    fps: 60,
    duration: 8.00,
    backgroundColor: '#ffffff',
  });

  // Precise Beat Markers matching the phonk soundtrack
  mainComp.markers = [
    { id: createId('mrk'), time: 0.00, label: 'Kick 1 // Vera Garnet Splash Art', color: '#e11d48' },
    { id: createId('mrk'), time: 0.50, label: 'Kick 2 // Subtle Push-in Pulse', color: '#e11d48' },
    { id: createId('mrk'), time: 0.90, label: 'Snare 1 // Hard Cut to Liv Empyrea', color: '#38bdf8' },
    { id: createId('mrk'), time: 1.80, label: 'Kick 3 // Hard Cut to Lucia Plume', color: '#e11d48' },
    { id: createId('mrk'), time: 2.70, label: 'Snare Roll // Cards Shrink Side-by-Side', color: '#0f172a' },
    { id: createId('mrk'), time: 3.86, label: '🔥 THE BASS DROP // Whip-Pan Card Swaps', color: '#e11d48' },
    { id: createId('mrk'), time: 4.54, label: 'Snare 2 // Liv Pop & Counter-Swap', color: '#38bdf8' },
    { id: createId('mrk'), time: 5.10, label: '16th-Note Shuffle & Launch', color: '#e11d48' },
    { id: createId('mrk'), time: 5.50, label: '🔥 Downbeat // Action Blade Closeup', color: '#e11d48' },
    { id: createId('mrk'), time: 6.20, label: 'Kick 4 // Speed Ramp Impact', color: '#e11d48' },
    { id: createId('mrk'), time: 6.50, label: 'Full-Body Trio Reveal (Long Red Blade)', color: '#0f172a' },
    { id: createId('mrk'), time: 7.06, label: 'Kick 5 // Final Pulse', color: '#e11d48' },
    { id: createId('mrk'), time: 8.00, label: 'Clean Ending', color: '#0f172a' },
  ];

  // Layer 1: Adjustment Layer — Anime CC & Color Grade (Vignette + Deep Contrast)
  const adjCcLayer = createDefaultLayer(mainComp, 'adjustment', 'FX Grade // Anime Vivid CC');
  adjCcLayer.labelColor = 'sand';
  const vignetteFx = createEffectInstance('vignette');
  vignetteFx.params.amount.value = 60;
  vignetteFx.params.midpoint.value = 50;
  vignetteFx.params.feather.value = 65;

  const glowFx = createEffectInstance('glow');
  glowFx.params.intensity.value = 1.3;
  glowFx.params.radius.value = 30;
  glowFx.params.threshold.value = 50;

  const chromaFx = createEffectInstance('chromatic-aberration');
  chromaFx.params.offsetX.animated = true;
  chromaFx.params.offsetX.keyframes = [
    createKeyframe(0, 0, 'linear'),
    createKeyframe(3.80, 0, 'bezier'),
    createKeyframe(3.86, 22, 'bezier'), // explosive split on drop
    createKeyframe(4.25, 0, 'bezier'),
    createKeyframe(6.20, 14, 'bezier'),
    createKeyframe(6.40, 0, 'bezier'),
    createKeyframe(11.50, 24, 'bezier'), // massive spike on climax
    createKeyframe(11.90, 0, 'bezier'),
  ];
  adjCcLayer.effects = [glowFx, chromaFx, vignetteFx];

  // Layer 2: Adjustment Layer — Impact Camera Shake with Keyframed Translation
  const shakeLayer = createDefaultLayer(mainComp, 'adjustment', 'Camera Shake // Impact Decay');
  shakeLayer.labelColor = 'coral';
  shakeLayer.transform.position.animated = true;
  shakeLayer.transform.position.keyframes = [
    createKeyframe<Vec2>(0.00, [540, 540], 'hold'),
    createKeyframe<Vec2>(3.86, [562, 550], 'bezier'), // Drop impact jitter
    createKeyframe<Vec2>(3.92, [524, 532], 'bezier'),
    createKeyframe<Vec2>(3.98, [546, 544], 'bezier'),
    createKeyframe<Vec2>(4.10, [540, 540], 'bezier'),
    createKeyframe<Vec2>(11.50, [565, 554], 'bezier'), // Climax impact
    createKeyframe<Vec2>(11.58, [520, 528], 'bezier'),
    createKeyframe<Vec2>(11.66, [548, 545], 'bezier'),
    createKeyframe<Vec2>(11.85, [540, 540], 'bezier'),
  ];

  // Layer 3: Solid Layer — White Flash Impact Frames (Screen Blend)
  const flashLayer = createDefaultLayer(mainComp, 'solid', 'Flash Frames // White Beat Strobe', {
    solidColor: '#ffffff',
    width: 1080,
    height: 1080,
  });
  flashLayer.labelColor = 'blush';
  flashLayer.blendMode = 'screen';
  flashLayer.transform.opacity.animated = true;
  flashLayer.transform.opacity.keyframes = [
    createKeyframe<number>(0.00, 95, 'bezier'),
    createKeyframe<number>(0.07, 0, 'bezier'),
    createKeyframe<number>(0.50, 95, 'bezier'),
    createKeyframe<number>(0.57, 0, 'bezier'),
    createKeyframe<number>(1.00, 95, 'bezier'),
    createKeyframe<number>(1.07, 0, 'bezier'),
    createKeyframe<number>(3.86, 100, 'bezier'), // Drop whiteout flash
    createKeyframe<number>(3.94, 0, 'bezier'),
    createKeyframe<number>(4.54, 75, 'bezier'),
    createKeyframe<number>(4.60, 0, 'bezier'),
    createKeyframe<number>(6.20, 80, 'bezier'),
    createKeyframe<number>(6.26, 0, 'bezier'),
    createKeyframe<number>(11.50, 100, 'bezier'), // Climax shockwave flash
    createKeyframe<number>(11.58, 0, 'bezier'),
    createKeyframe<number>(12.52, 95, 'bezier'),
    createKeyframe<number>(12.60, 0, 'bezier'),
  ];

  // Layer 4: Kinetic Typography — "HU TAO • HATSUNE MIKU"
  const textIntroTag = createDefaultLayer(mainComp, 'text', 'Typography // HU TAO • HATSUNE MIKU', {
    text: 'HU TAO • HATSUNE MIKU',
    width: 900,
    height: 160,
  });
  textIntroTag.labelColor = 'lavender';
  textIntroTag.inPoint = 1.00;
  textIntroTag.outPoint = 2.50;
  textIntroTag.transform.position.value = [540, 160];
  textIntroTag.transform.scale.animated = true;
  textIntroTag.transform.scale.keyframes = [
    createKeyframe<Vec2>(1.00, [85, 85], 'bezier'),
    createKeyframe<Vec2>(1.80, [100, 100], 'bezier'),
    createKeyframe<Vec2>(2.50, [108, 108], 'bezier'),
  ];
  if (textIntroTag.textContents) {
    textIntroTag.textContents.fontFamily = 'Montserrat';
    textIntroTag.textContents.fontWeight = '800';
    textIntroTag.textContents.fontSize.value = 46;
    textIntroTag.textContents.fillColor.value = '#ffffff';
  }

  // Layer 5: Drop Kinetic Typography — "MONTAGEM SHIRT BLUE"
  const dropTextLayer = createDefaultLayer(mainComp, 'text', 'Impact Text // MONTAGEM SHIRT BLUE', {
    text: 'MONTAGEM SHIRT BLUE',
    width: 1000,
    height: 200,
  });
  dropTextLayer.labelColor = 'ice';
  dropTextLayer.inPoint = 3.86;
  dropTextLayer.outPoint = 4.54;
  dropTextLayer.transform.position.value = [540, 540];
  dropTextLayer.transform.scale.animated = true;
  dropTextLayer.transform.scale.keyframes = [
    createKeyframe<Vec2>(3.86, [145, 145], 'bezier'),
    createKeyframe<Vec2>(4.10, [100, 100], 'bezier'),
    createKeyframe<Vec2>(4.54, [92, 92], 'linear'),
  ];
  dropTextLayer.transform.opacity.animated = true;
  dropTextLayer.transform.opacity.keyframes = [
    createKeyframe<number>(3.86, 100, 'hold'),
    createKeyframe<number>(4.35, 100, 'bezier'),
    createKeyframe<number>(4.54, 0, 'bezier'),
  ];
  if (dropTextLayer.textContents) {
    dropTextLayer.textContents.fontFamily = 'Montserrat';
    dropTextLayer.textContents.fontWeight = '800';
    dropTextLayer.textContents.fontSize.value = 76;
    dropTextLayer.textContents.fillColor.value = '#e2727f';
    dropTextLayer.textContents.strokeEnabled = true;
    dropTextLayer.textContents.strokeColor.value = '#ffffff';
    dropTextLayer.textContents.strokeWidth = createProperty('Stroke Width', 3, { min: 0, max: 50, unit: 'px' });
  }

  // Master Rendered Video Track (1080x1080 @ 60 FPS, 8.00s)
  const masterVideoLayer = createDefaultLayer(mainComp, 'video', 'Video Track // Anime Gacha Edit (60 FPS)', {
    assetId: masterVideoAsset.id,
    width: 1080,
    height: 1080,
  });
  masterVideoLayer.labelColor = 'ice';
  masterVideoLayer.startTime = 0.0;
  masterVideoLayer.inPoint = 0.0;
  masterVideoLayer.outPoint = 8.00;
  masterVideoLayer.transform.position.value = [540, 540];
  masterVideoLayer.transform.scale.value = [100, 100];

  // Background Soundtrack (8.00s)
  const audioLayer = createDefaultLayer(mainComp, 'audio', 'Audio // Phonk Soundtrack (8s)');
  audioLayer.assetId = audioAsset.id;
  audioLayer.labelColor = 'denim';
  audioLayer.inPoint = 0.0;
  audioLayer.outPoint = 8.00;

  mainComp.layers = [
    adjCcLayer,
    shakeLayer,
    flashLayer,
    masterVideoLayer,
    audioLayer,
  ];

  return {
    id: createId('proj_gacha_viral'),
    name: 'Anime Gacha-Game Style Edit // [Vera, Liv & Lucia 1:1].mfproj',
    version: '1.0.0',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    activeCompId: mainComp.id,
    compositions: [mainComp],
    assets: [masterVideoAsset, audioAsset],
  };
}
