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
  // 1. Assets: Rendered Master Edit + Soundtrack + Characters
  const masterVideoAsset: MediaAsset = {
    id: 'asset_mmd_master_edit',
    name: 'HuTao_Miku_Viral_MMD_Velocity_Edit_1080p60.mp4',
    type: 'video',
    mimeType: 'video/mp4',
    url: '/assets/trending_character_edit.mp4',
    width: 1080,
    height: 1080,
    duration: 13.51,
    scenes: [
      { id: 'scn_0', assetId: 'asset_mmd_master_edit', sceneIndex: 0, name: '00 // [Hu Tao] Crimson Teaser Card', inPoint: 0.00, outPoint: 0.50, duration: 0.50 },
      { id: 'scn_1', assetId: 'asset_mmd_master_edit', sceneIndex: 1, name: '01 // [Hatsune Miku] Cyan Teaser Card', inPoint: 0.50, outPoint: 1.00, duration: 0.50 },
      { id: 'scn_2', assetId: 'asset_mmd_master_edit', sceneIndex: 2, name: '02 // [Furina] Hydro Teaser Card', inPoint: 1.00, outPoint: 1.50, duration: 0.50 },
      { id: 'scn_3', assetId: 'asset_mmd_master_edit', sceneIndex: 3, name: '03 // Modern Studio Gallery Stage Glide', inPoint: 1.50, outPoint: 2.50, duration: 1.00 },
      { id: 'scn_4', assetId: 'asset_mmd_master_edit', sceneIndex: 4, name: '04 // Lock on Hu Tao // Dolly Zoom', inPoint: 2.50, outPoint: 3.44, duration: 0.94 },
      { id: 'scn_5', assetId: 'asset_mmd_master_edit', sceneIndex: 5, name: '05 // 360° Whip Rotation Spin into Eye', inPoint: 3.44, outPoint: 3.86, duration: 0.42 },
      { id: 'scn_6', assetId: 'asset_mmd_master_edit', sceneIndex: 6, name: '06 // 🔥 BASS DROP // Hu Tao Finger Point', inPoint: 3.86, outPoint: 4.54, duration: 0.68 },
      { id: 'scn_7', assetId: 'asset_mmd_master_edit', sceneIndex: 7, name: '07 // Miku Forehead Salute Wink', inPoint: 4.54, outPoint: 5.28, duration: 0.74 },
      { id: 'scn_8', assetId: 'asset_mmd_master_edit', sceneIndex: 8, name: '08 // Framed PIP Card [Hu Tao Ghost Paw]', inPoint: 5.28, outPoint: 6.20, duration: 0.92 },
      { id: 'scn_9', assetId: 'asset_mmd_master_edit', sceneIndex: 9, name: '09 // Hu Tao Peace Sign Wink Closeup', inPoint: 6.20, outPoint: 7.06, duration: 0.86 },
      { id: 'scn_10', assetId: 'asset_mmd_master_edit', sceneIndex: 10, name: '10 // Miku Head Tilt Smile Closeup', inPoint: 7.06, outPoint: 7.86, duration: 0.80 },
      { id: 'scn_11', assetId: 'asset_mmd_master_edit', sceneIndex: 11, name: '11 // Hu Tao Forehead Salute Wink', inPoint: 7.86, outPoint: 8.72, duration: 0.86 },
      { id: 'scn_12', assetId: 'asset_mmd_master_edit', sceneIndex: 12, name: '12 // Framed PIP Card [Miku Cyan Digital]', inPoint: 8.72, outPoint: 9.74, duration: 1.02 },
      { id: 'scn_13', assetId: 'asset_mmd_master_edit', sceneIndex: 13, name: '13 // Miku Double Peace Charm Wink', inPoint: 9.74, outPoint: 10.76, duration: 1.02 },
      { id: 'scn_14', assetId: 'asset_mmd_master_edit', sceneIndex: 14, name: '14 // 16th Note Stutter Cuts [Hu Tao <-> Miku]', inPoint: 10.76, outPoint: 11.50, duration: 0.74 },
      { id: 'scn_15', assetId: 'asset_mmd_master_edit', sceneIndex: 15, name: '15 // 🔥 GRAND CLIMAX // Hu Tao Climax Pose', inPoint: 11.50, outPoint: 12.52, duration: 1.02 },
      { id: 'scn_16', assetId: 'asset_mmd_master_edit', sceneIndex: 16, name: '16 // Anamorphic Lens Flare Outro', inPoint: 12.52, outPoint: 13.51, duration: 0.99 },
    ],
  };

  const audioAsset: MediaAsset = {
    id: 'asset_trending_soundtrack',
    name: 'Montagem_Shirt_Blue_Phonk.aac',
    type: 'audio',
    mimeType: 'audio/aac',
    url: '/assets/trending_audio.aac',
    duration: 13.51,
  };

  const introStageAsset: MediaAsset = {
    id: 'asset_intro_stage',
    name: 'Miku_HuTao_Furina_Gallery_Stage.png',
    type: 'image',
    mimeType: 'image/png',
    url: '/assets/miku_stage.png',
    width: 2560,
    height: 1080,
  };

  // 2. Main 1:1 Square Edit Composition (1080x1080 @ 60 FPS, 13.51s)
  const mainComp: Composition = createDefaultComposition({
    name: 'Hu Tao & Hatsune Miku 氷 [Viral 3D MMD Velocity Edit 1:1]',
    width: 1080,
    height: 1080,
    fps: 60,
    duration: 13.51,
    backgroundColor: '#0a0a0f',
  });

  // Precise Beat Markers matching the viral reference track
  mainComp.markers = [
    { id: createId('mrk'), time: 0.00, label: 'Hu Tao Teaser Card // Crimson Flash', color: '#e2727f' },
    { id: createId('mrk'), time: 0.50, label: 'Miku Teaser Card // Cyan Flash', color: '#38bdf8' },
    { id: createId('mrk'), time: 1.00, label: 'Furina Teaser Card // Hydro Flash', color: '#60a5fa' },
    { id: createId('mrk'), time: 1.50, label: 'Studio Gallery Stage Pan', color: '#e9edf3' },
    { id: createId('mrk'), time: 2.50, label: 'Lock on Hu Tao // Dolly Zoom', color: '#e2727f' },
    { id: createId('mrk'), time: 3.44, label: '360° Whip Rotation Spin into Eye', color: '#f0d4d8' },
    { id: createId('mrk'), time: 3.86, label: '🔥 THE BASS DROP // Hu Tao Finger Point', color: '#e2727f' },
    { id: createId('mrk'), time: 4.54, label: 'Snare 2 // Miku Forehead Salute Wink', color: '#38bdf8' },
    { id: createId('mrk'), time: 5.28, label: 'Framed PIP Card [Hu Tao Ghost Paw]', color: '#e2727f' },
    { id: createId('mrk'), time: 6.20, label: 'Kick 3 // Hu Tao Peace Sign Wink Closeup', color: '#e2727f' },
    { id: createId('mrk'), time: 7.06, label: 'Kick 4 // Miku Head Tilt Smile Closeup', color: '#38bdf8' },
    { id: createId('mrk'), time: 7.86, label: 'Kick 5 // Hu Tao Forehead Salute Wink', color: '#e2727f' },
    { id: createId('mrk'), time: 8.72, label: 'Framed PIP Card [Miku Cyan Digital]', color: '#38bdf8' },
    { id: createId('mrk'), time: 9.74, label: 'Miku Double Peace Charm Wink', color: '#38bdf8' },
    { id: createId('mrk'), time: 10.76, label: '16th Note Stutter Cuts [Hu Tao <-> Miku]', color: '#f0d4d8' },
    { id: createId('mrk'), time: 11.50, label: '🔥 GRAND CLIMAX // Hu Tao Climax Pose', color: '#e2727f' },
    { id: createId('mrk'), time: 12.52, label: 'Outro Flare // Horizontal Anamorphic Star', color: '#e2727f' },
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

  // Layer 6: Master Rendered Video Track (1080x1080 @ 60 FPS)
  const masterVideoLayer = createDefaultLayer(mainComp, 'video', 'Video Track // Master 3D MMD Velocity Edit (60 FPS)', {
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
  const audioLayer = createDefaultLayer(mainComp, 'audio', 'Audio // Viral Phonk Soundtrack (AAC)');
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
    id: createId('proj_mmd_viral'),
    name: 'Hu Tao & Hatsune Miku 氷 // [Viral 1:1 3D MMD Velocity Edit].mfproj',
    version: '1.0.0',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    activeCompId: mainComp.id,
    compositions: [mainComp],
    assets: [masterVideoAsset, audioAsset, introStageAsset],
  };
}
