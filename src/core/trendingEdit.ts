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
  // 1. Assets: Rendered Master Edit + Soundtrack + Raw Stills & Clips
  const masterVideoAsset: MediaAsset = {
    id: 'asset_acheron_master_edit',
    name: 'Acheron_Viral_Velocity_Edit_1080p60.mp4',
    type: 'video',
    mimeType: 'video/mp4',
    url: '/assets/trending_character_edit.mp4',
    width: 1080,
    height: 1080,
    duration: 13.51,
    scenes: [
      { id: 'scn_0', assetId: 'asset_acheron_master_edit', sceneIndex: 0, name: '00 // Teaser Intro', inPoint: 0.0, outPoint: 0.70, duration: 0.70 },
      { id: 'scn_1', assetId: 'asset_acheron_master_edit', sceneIndex: 1, name: '01 // 3-Card Stage Pan', inPoint: 0.70, outPoint: 2.40, duration: 1.70 },
      { id: 'scn_2', assetId: 'asset_acheron_master_edit', sceneIndex: 2, name: '02 // 360° Spin Zoom Build-up', inPoint: 2.40, outPoint: 3.86, duration: 1.46 },
      { id: 'scn_3', assetId: 'asset_acheron_master_edit', sceneIndex: 3, name: '03 // 🔥 BASS DROP (Blade Draw)', inPoint: 3.86, outPoint: 4.35, duration: 0.49 },
      { id: 'scn_4', assetId: 'asset_acheron_master_edit', sceneIndex: 4, name: '04 // Crimson Eyes Close-up', inPoint: 4.35, outPoint: 5.45, duration: 1.10 },
      { id: 'scn_5', assetId: 'asset_acheron_master_edit', sceneIndex: 5, name: '05 // Floating Kimono in Wind', inPoint: 5.45, outPoint: 6.93, duration: 1.48 },
      { id: 'scn_6', assetId: 'asset_acheron_master_edit', sceneIndex: 6, name: '06 // Lipstick Smile', inPoint: 6.93, outPoint: 7.50, duration: 0.57 },
      { id: 'scn_7', assetId: 'asset_acheron_master_edit', sceneIndex: 7, name: '07 // Blood Moon Silhouette', inPoint: 7.50, outPoint: 8.55, duration: 1.05 },
      { id: 'scn_8', assetId: 'asset_acheron_master_edit', sceneIndex: 8, name: '08 // 🔥 CLIMAX Shattered Shockwave', inPoint: 8.55, outPoint: 9.61, duration: 1.06 },
      { id: 'scn_9', assetId: 'asset_acheron_master_edit', sceneIndex: 9, name: '09 // Rain Umbrella Turn', inPoint: 9.61, outPoint: 11.10, duration: 1.49 },
      { id: 'scn_10', assetId: 'asset_acheron_master_edit', sceneIndex: 10, name: '10 // Head Tilt Looking Up', inPoint: 11.10, outPoint: 11.66, duration: 0.56 },
      { id: 'scn_11', assetId: 'asset_acheron_master_edit', sceneIndex: 11, name: '11 // Compact Mirror Glint', inPoint: 11.66, outPoint: 12.71, duration: 1.05 },
      { id: 'scn_12', assetId: 'asset_acheron_master_edit', sceneIndex: 12, name: '12 // Final Direct Gaze & Fade', inPoint: 12.71, outPoint: 13.51, duration: 0.80 },
    ],
  };

  const audioAsset: MediaAsset = {
    id: 'asset_trending_soundtrack',
    name: 'Viral_Edit_Soundtrack.aac',
    type: 'audio',
    mimeType: 'audio/aac',
    url: '/assets/trending_audio.aac',
    duration: 13.51,
  };

  const acheronPortraitAsset: MediaAsset = {
    id: 'asset_acheron_portrait',
    name: 'Acheron_Portrait_2K.png',
    type: 'image',
    mimeType: 'image/png',
    url: '/assets/characters/acheron_portrait.png',
    width: 2048,
    height: 2048,
  };

  const introStageAsset: MediaAsset = {
    id: 'asset_intro_stage',
    name: '3Card_Intro_Stage_3200x1080.png',
    type: 'image',
    mimeType: 'image/png',
    url: '/assets/intro_stage.png',
    width: 3200,
    height: 1080,
  };

  // 2. Main 1:1 Square Edit Composition (1080x1080 @ 60 FPS, 13.51s)
  const mainComp: Composition = createDefaultComposition({
    name: 'Acheron 氷 [Viral Character Velocity Edit 1:1]',
    width: 1080,
    height: 1080,
    fps: 60,
    duration: 13.51,
    backgroundColor: '#0a0a0f',
  });

  // Precise Beat Markers matching the viral reference track
  mainComp.markers = [
    { id: createId('mrk'), time: 0.00, label: 'Kafka Teaser // Zoom In', color: '#8796ab' },
    { id: createId('mrk'), time: 0.35, label: 'Firefly Teaser // Zoom In', color: '#8cc4ec' },
    { id: createId('mrk'), time: 0.70, label: '3-Card Stage Pan // Left to Right', color: '#e9edf3' },
    { id: createId('mrk'), time: 1.80, label: 'Card 03 Firefly Glide', color: '#8cc4ec' },
    { id: createId('mrk'), time: 2.40, label: 'Lock on [02] Acheron // Zoom In', color: '#e2727f' },
    { id: createId('mrk'), time: 3.00, label: '360° Spin Ramp // Build-up', color: '#f0d4d8' },
    { id: createId('mrk'), time: 3.86, label: '🔥 THE BASS DROP // Acheron Blade Draw', color: '#e2727f' },
    { id: createId('mrk'), time: 4.35, label: 'Kick 2 // Crimson Eyes Glow', color: '#8cc4ec' },
    { id: createId('mrk'), time: 5.45, label: 'Kick 3 // Kimono Whip Pan', color: '#e2727f' },
    { id: createId('mrk'), time: 6.93, label: 'Melody Drop // Lipstick Brush', color: '#f0d4d8' },
    { id: createId('mrk'), time: 7.50, label: 'Kick 4 // Blood Moon Silhouette', color: '#8cc4ec' },
    { id: createId('mrk'), time: 8.55, label: '🔥 CLIMAX DROP // Slashed Dream Shockwave', color: '#e2727f' },
    { id: createId('mrk'), time: 9.61, label: 'Kick 5 // Dark Rain Umbrella', color: '#8cc4ec' },
    { id: createId('mrk'), time: 11.10, label: 'Kick 6 // Head Tilt Violet Eyes', color: '#8cc4ec' },
    { id: createId('mrk'), time: 11.66, label: 'Double Snare // Mirror Snap Glint', color: '#f0d4d8' },
    { id: createId('mrk'), time: 12.71, label: 'Climax Outro // Direct Gaze & Fade', color: '#e2727f' },
  ];

  // Layer 1: Adjustment Layer — Anime CC & Color Grade (Vignette + Deep Contrast)
  const adjCcLayer = createDefaultLayer(mainComp, 'adjustment', 'FX Grade // Anime Vivid CC');
  adjCcLayer.labelColor = 'sand';
  const vignetteFx = createEffectInstance('vignette');
  vignetteFx.params.amount.value = 68;
  vignetteFx.params.midpoint.value = 45;
  vignetteFx.params.feather.value = 65;

  const glowFx = createEffectInstance('glow');
  glowFx.params.intensity.value = 1.4;
  glowFx.params.radius.value = 32;
  glowFx.params.threshold.value = 45;

  const chromaFx = createEffectInstance('chromatic-aberration');
  chromaFx.params.offsetX.animated = true;
  chromaFx.params.offsetX.keyframes = [
    createKeyframe(0, 1, 'linear'),
    createKeyframe(3.80, 2, 'bezier'),
    createKeyframe(3.86, 26, 'bezier'), // explosive split on drop
    createKeyframe(4.25, 2, 'bezier'),
    createKeyframe(8.50, 3, 'bezier'),
    createKeyframe(8.55, 30, 'bezier'), // massive spike on climax shatter
    createKeyframe(9.00, 2, 'bezier'),
  ];
  adjCcLayer.effects = [glowFx, chromaFx, vignetteFx];

  // Layer 2: Adjustment Layer — Impact Camera Shake with Keyframed Translation
  const shakeLayer = createDefaultLayer(mainComp, 'adjustment', 'Camera Shake // Impact Decay');
  shakeLayer.labelColor = 'coral';
  shakeLayer.transform.position.animated = true;
  shakeLayer.transform.position.keyframes = [
    createKeyframe<Vec2>(0.00, [540, 540], 'hold'),
    createKeyframe<Vec2>(3.86, [564, 552], 'bezier'), // Drop impact jitter
    createKeyframe<Vec2>(3.92, [522, 530], 'bezier'),
    createKeyframe<Vec2>(3.98, [548, 545], 'bezier'),
    createKeyframe<Vec2>(4.10, [540, 540], 'bezier'),
    createKeyframe<Vec2>(8.55, [568, 556], 'bezier'), // Climax shockwave impact
    createKeyframe<Vec2>(8.62, [518, 526], 'bezier'),
    createKeyframe<Vec2>(8.70, [550, 546], 'bezier'),
    createKeyframe<Vec2>(8.90, [540, 540], 'bezier'),
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
    createKeyframe<number>(0.00, 90, 'bezier'),
    createKeyframe<number>(0.07, 0, 'bezier'),
    createKeyframe<number>(0.35, 90, 'bezier'),
    createKeyframe<number>(0.42, 0, 'bezier'),
    createKeyframe<number>(3.86, 100, 'bezier'), // Drop whiteout flash
    createKeyframe<number>(3.94, 0, 'bezier'),
    createKeyframe<number>(4.35, 75, 'bezier'),
    createKeyframe<number>(4.40, 0, 'bezier'),
    createKeyframe<number>(8.55, 100, 'bezier'), // Climax shockwave flash
    createKeyframe<number>(8.63, 0, 'bezier'),
    createKeyframe<number>(11.66, 85, 'bezier'),
    createKeyframe<number>(11.71, 0, 'bezier'),
  ];

  // Layer 4: Kinetic Typography — "黄泉 • ACHERON"
  const textIntroTag = createDefaultLayer(mainComp, 'text', 'Typography // 黄泉 • ACHERON', {
    text: '黄泉 • ACHERON',
    width: 900,
    height: 160,
  });
  textIntroTag.labelColor = 'lavender';
  textIntroTag.inPoint = 0.70;
  textIntroTag.outPoint = 2.40;
  textIntroTag.transform.position.value = [540, 160];
  textIntroTag.transform.scale.animated = true;
  textIntroTag.transform.scale.keyframes = [
    createKeyframe<Vec2>(0.70, [85, 85], 'bezier'),
    createKeyframe<Vec2>(1.60, [100, 100], 'bezier'),
    createKeyframe<Vec2>(2.40, [108, 108], 'bezier'),
  ];
  if (textIntroTag.textContents) {
    textIntroTag.textContents.fontFamily = 'Montserrat';
    textIntroTag.textContents.fontWeight = '800';
    textIntroTag.textContents.fontSize.value = 46;
    textIntroTag.textContents.fillColor.value = '#ffffff';
  }

  // Layer 5: Drop Kinetic Typography — "SLASHED DREAM" on 3.86s
  const dropTextLayer = createDefaultLayer(mainComp, 'text', 'Impact Text // SLASHED DREAM', {
    text: 'SLASHED DREAM',
    width: 1000,
    height: 200,
  });
  dropTextLayer.labelColor = 'coral';
  dropTextLayer.inPoint = 3.86;
  dropTextLayer.outPoint = 4.35;
  dropTextLayer.transform.position.value = [540, 540];
  dropTextLayer.transform.scale.animated = true;
  dropTextLayer.transform.scale.keyframes = [
    createKeyframe<Vec2>(3.86, [145, 145], 'bezier'),
    createKeyframe<Vec2>(4.05, [100, 100], 'bezier'),
    createKeyframe<Vec2>(4.35, [92, 92], 'linear'),
  ];
  dropTextLayer.transform.opacity.animated = true;
  dropTextLayer.transform.opacity.keyframes = [
    createKeyframe<number>(3.86, 100, 'hold'),
    createKeyframe<number>(4.20, 100, 'bezier'),
    createKeyframe<number>(4.35, 0, 'bezier'),
  ];
  if (dropTextLayer.textContents) {
    dropTextLayer.textContents.fontFamily = 'Montserrat';
    dropTextLayer.textContents.fontWeight = '800';
    dropTextLayer.textContents.fontSize.value = 88;
    dropTextLayer.textContents.fillColor.value = '#ff3355';
    dropTextLayer.textContents.strokeEnabled = true;
    dropTextLayer.textContents.strokeColor.value = '#ffffff';
    dropTextLayer.textContents.strokeWidth = createProperty('Stroke Width', 3, { min: 0, max: 50, unit: 'px' });
  }

  // Layer 6: Master Rendered Video Track (1080x1080 @ 60 FPS)
  const masterVideoLayer = createDefaultLayer(mainComp, 'video', 'Video Track // Master Velocity Edit (60 FPS)', {
    assetId: masterVideoAsset.id,
    width: 1080,
    height: 1080,
  });
  masterVideoLayer.labelColor = 'ice';
  masterVideoLayer.startTime = 0.0;
  masterVideoLayer.inPoint = 0.0;
  masterVideoLayer.outPoint = 13.51;
  masterVideoLayer.transform.position.value = [540, 540];
  masterVideoLayer.transform.scale.value = [100, 100];

  // Layer 7: Background Soundtrack
  const audioLayer = createDefaultLayer(mainComp, 'audio', 'Audio // Viral Edit Soundtrack (AAC)');
  audioLayer.assetId = audioAsset.id;
  audioLayer.labelColor = 'denim';
  audioLayer.inPoint = 0.0;
  audioLayer.outPoint = 13.51;

  mainComp.layers = [
    adjCcLayer,
    shakeLayer,
    flashLayer,
    dropTextLayer,
    textIntroTag,
    masterVideoLayer,
    audioLayer,
  ];

  return {
    id: createId('proj_acheron'),
    name: 'Acheron 氷 // Viral 1:1 Velocity Edit.mfproj',
    version: '1.0.0',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    activeCompId: mainComp.id,
    compositions: [mainComp],
    assets: [masterVideoAsset, audioAsset, introStageAsset, acheronPortraitAsset],
  };
}
