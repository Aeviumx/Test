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
} from './defaults';

export function createTrendingAnimeEditProject(): Project {
  // 1. Assets: Makima 4K Twixtor + Phonk Audio Drop
  const makimaAsset: MediaAsset = {
    id: 'asset_makima_twixtor',
    name: 'Makima_Twixtor_4K60.mp4',
    type: 'video',
    mimeType: 'video/mp4',
    url: '/assets/makima_twixtor.mp4',
    width: 1920,
    height: 1080,
    duration: 15.45,
    scenes: [
      { id: 'scn_m1', assetId: 'asset_makima_twixtor', sceneIndex: 1, name: 'Scene 01 (Golden Glance)', inPoint: 0.0, outPoint: 1.58, duration: 1.58, thumbnail: '/assets/thumbs/scene1.jpg' },
      { id: 'scn_m2', assetId: 'asset_makima_twixtor', sceneIndex: 2, name: 'Scene 02 (Eerie Build-up)', inPoint: 1.58, outPoint: 3.65, duration: 2.07, thumbnail: '/assets/thumbs/scene2.jpg' },
      { id: 'scn_m3', assetId: 'asset_makima_twixtor', sceneIndex: 3, name: 'Scene 03 (🔥 PHONK DROP)', inPoint: 3.65, outPoint: 4.98, duration: 1.33, thumbnail: '/assets/thumbs/scene3.jpg' },
      { id: 'scn_m4', assetId: 'asset_makima_twixtor', sceneIndex: 4, name: 'Scene 04 (Deadly Gaze)', inPoint: 4.98, outPoint: 7.32, duration: 2.34, thumbnail: '/assets/thumbs/scene4.jpg' },
      { id: 'scn_m5', assetId: 'asset_makima_twixtor', sceneIndex: 5, name: 'Scene 05 (Devil Aura)', inPoint: 7.32, outPoint: 9.12, duration: 1.80, thumbnail: '/assets/thumbs/scene5.jpg' },
      { id: 'scn_m6', assetId: 'asset_makima_twixtor', sceneIndex: 6, name: 'Scene 06 (Lethal Smile)', inPoint: 9.12, outPoint: 11.23, duration: 2.11, thumbnail: '/assets/thumbs/scene6.jpg' },
      { id: 'scn_m7', assetId: 'asset_makima_twixtor', sceneIndex: 7, name: 'Scene 07 (Dark Silhouette)', inPoint: 11.23, outPoint: 14.12, duration: 2.89, thumbnail: '/assets/thumbs/scene7.jpg' },
    ],
  };

  const audioAsset: MediaAsset = {
    id: 'asset_midnight_phonk',
    name: 'PLAYAMANE x Nateki - MIDNIGHT [Phonk Drop].mp3',
    type: 'audio',
    mimeType: 'audio/mpeg',
    url: '/assets/midnight_phonk_drop.mp3',
    duration: 15.0,
  };

  // 2. Main 9:16 Vertical AMV Composition (1080x1920 @ 60 FPS)
  const mainComp: Composition = createDefaultComposition({
    name: 'Makima 氷 [Midnight Phonk 9:16]',
    width: 1080,
    height: 1920,
    fps: 60,
    duration: 12.0,
    backgroundColor: '#0b0d11',
  });

  // Precise Beat Markers synced to MIDNIGHT Phonk
  mainComp.markers = [
    { id: createId('mrk'), time: 0.0, label: 'Intro // Eerie Synth', color: '#5a6a80' },
    { id: createId('mrk'), time: 1.82, label: 'Build-up Snare', color: '#8796ab' },
    { id: createId('mrk'), time: 3.65, label: '🔥 DROP // PHONK KICK 808', color: '#e2727f' },
    { id: createId('mrk'), time: 4.56, label: 'Kick 2', color: '#8cc4ec' },
    { id: createId('mrk'), time: 5.48, label: 'Snare 2', color: '#f0d4d8' },
    { id: createId('mrk'), time: 6.39, label: 'Kick 3', color: '#8cc4ec' },
    { id: createId('mrk'), time: 7.32, label: '🔥 DROP 2 // Cowbell Speedup', color: '#e2727f' },
    { id: createId('mrk'), time: 8.22, label: 'Kick 4', color: '#8cc4ec' },
    { id: createId('mrk'), time: 9.14, label: 'Snare 3', color: '#f0d4d8' },
    { id: createId('mrk'), time: 10.05, label: 'Kick 5', color: '#8cc4ec' },
    { id: createId('mrk'), time: 11.23, label: 'Outro Slowdown', color: '#5a6a80' },
  ];

  // Layer 1: Adjustment Layer — FX Grade (Vignette + Chromatic Aberration)
  const adjLayer = createDefaultLayer(mainComp, 'adjustment', 'FX Grade // Phonk Cold Vignette');
  adjLayer.labelColor = 'sand';
  const vignetteFx = createEffectInstance('vignette');
  vignetteFx.params.amount.value = 72;
  vignetteFx.params.midpoint.value = 46;
  vignetteFx.params.feather.value = 68;

  const chromaFx = createEffectInstance('chromatic-aberration');
  chromaFx.params.offsetX.animated = true;
  chromaFx.params.offsetX.keyframes = [
    createKeyframe(0, 2, 'bezier'),
    createKeyframe(3.6, 3, 'bezier'),
    createKeyframe(3.65, 22, 'bezier'), // explosive split on drop
    createKeyframe(4.1, 4, 'bezier'),
    createKeyframe(7.32, 26, 'bezier'), // second drop spike
    createKeyframe(7.8, 3, 'bezier'),
  ];
  chromaFx.params.radial.value = 85;
  adjLayer.effects = [chromaFx, vignetteFx];

  // Layer 2: Kinetic Typography — "BANG." on drop
  const dropTextLayer = createDefaultLayer(mainComp, 'text', 'BANG. // Impact Punch', {
    text: 'BANG.',
    width: 900,
    height: 300,
  });
  dropTextLayer.labelColor = 'blush';
  dropTextLayer.inPoint = 3.65;
  dropTextLayer.outPoint = 4.56;
  dropTextLayer.transform.position.value = [540, 960];
  dropTextLayer.transform.scale.animated = true;
  dropTextLayer.transform.scale.keyframes = [
    createKeyframe<Vec2>(3.65, [140, 140], 'bezier'),
    createKeyframe<Vec2>(3.9, [100, 100], 'bezier'),
    createKeyframe<Vec2>(4.56, [95, 95], 'bezier'),
  ];
  dropTextLayer.transform.opacity.animated = true;
  dropTextLayer.transform.opacity.keyframes = [
    createKeyframe<number>(3.65, 100, 'hold'),
    createKeyframe<number>(4.3, 100, 'bezier'),
    createKeyframe<number>(4.56, 0, 'bezier'),
  ];
  if (dropTextLayer.textContents) {
    dropTextLayer.textContents.fontFamily = 'Orbitron';
    dropTextLayer.textContents.fontWeight = '800';
    dropTextLayer.textContents.fontSize.value = 138;
    dropTextLayer.textContents.fillColor.value = '#f0d4d8';
    dropTextLayer.textContents.strokeEnabled = true;
    dropTextLayer.textContents.strokeColor.value = '#8cc4ec';
    dropTextLayer.textContents.strokeWidth.value = 4;
  }
  const glowBang = createEffectInstance('glow');
  glowBang.params.intensity.value = 2.4;
  glowBang.params.radius.value = 35;
  dropTextLayer.effects = [glowBang];

  // Layer 3: Main Title — "M A K I M A"
  const titleLayer = createDefaultLayer(mainComp, 'text', 'Title // M A K I M A', {
    text: 'M A K I M A',
    width: 900,
    height: 180,
  });
  titleLayer.labelColor = 'ice';
  titleLayer.inPoint = 0.0;
  titleLayer.outPoint = 3.65;
  titleLayer.transform.position.value = [540, 1420];
  titleLayer.transform.scale.animated = true;
  titleLayer.transform.scale.keyframes = [
    createKeyframe<Vec2>(0.0, [88, 88], 'bezier'),
    createKeyframe<Vec2>(1.82, [102, 102], 'bezier'),
    createKeyframe<Vec2>(3.65, [118, 118], 'bezier'),
  ];
  if (titleLayer.textContents) {
    titleLayer.textContents.fontFamily = 'Orbitron';
    titleLayer.textContents.fontWeight = '800';
    titleLayer.textContents.fontSize.value = 72;
    titleLayer.textContents.fillColor.value = '#e9edf3';
  }

  // Layer 4: Subtitle — "マキマ • CONTROL DEVIL"
  const subLayer = createDefaultLayer(mainComp, 'text', 'Subtitle // マキマ • CONTROL DEVIL', {
    text: 'マキマ • CONTROL DEVIL',
    width: 900,
    height: 90,
  });
  subLayer.labelColor = 'steel';
  subLayer.inPoint = 0.4;
  subLayer.outPoint = 3.65;
  subLayer.transform.position.value = [540, 1510];
  if (subLayer.textContents) {
    subLayer.textContents.fontFamily = 'JetBrains Mono';
    subLayer.textContents.fontWeight = '600';
    subLayer.textContents.fontSize.value = 24;
    subLayer.textContents.fillColor.value = '#8cc4ec';
  }

  // Helper to create full-bleed 9:16 video clip layers centered on Makima
  const createClipLayer = (
    name: string,
    inT: number,
    outT: number,
    sourceT: number,
    labelColor: 'ice' | 'denim' | 'coral' | 'mint' | 'lavender',
    scalePunch = false
  ) => {
    const layer = createDefaultLayer(mainComp, 'video', name, {
      assetId: makimaAsset.id,
      width: 1920,
      height: 1080,
    });
    layer.labelColor = labelColor;
    layer.startTime = inT - sourceT;
    layer.inPoint = inT;
    layer.outPoint = outT;
    layer.transform.position.value = [540, 960]; // center in 1080x1920

    if (scalePunch) {
      // Impact Zoom Punch on the drop!
      layer.transform.scale.animated = true;
      layer.transform.scale.keyframes = [
        createKeyframe<Vec2>(inT, [215, 215], 'bezier'),
        createKeyframe<Vec2>(inT + 0.35, [180, 180], 'bezier'),
        createKeyframe<Vec2>(outT, [178, 178], 'linear'),
      ];
    } else {
      layer.transform.scale.value = [178, 178]; // fill vertical frame 1920x1080 -> 1080x1920
    }
    return layer;
  };

  // Video Clips synced to the Phonk beats
  // Scene 1: Intro Eyes Glance (0.0s - 1.58s)
  const clip1 = createClipLayer('Clip 1 // Golden Eyes Glance', 0.0, 1.58, 0.0, 'ice');
  clip1.transform.scale.animated = true;
  clip1.transform.scale.keyframes = [
    createKeyframe<Vec2>(0.0, [178, 178], 'bezier'),
    createKeyframe<Vec2>(1.58, [192, 192], 'bezier'),
  ];

  // Scene 2: Eerie Build-up (1.58s - 3.65s)
  const clip2 = createClipLayer('Clip 2 // Eerie Build-up', 1.58, 3.65, 1.58, 'denim');
  clip2.transform.scale.animated = true;
  clip2.transform.scale.keyframes = [
    createKeyframe<Vec2>(1.58, [180, 180], 'bezier'),
    createKeyframe<Vec2>(3.65, [205, 205], 'bezier'),
  ];

  // Scene 3: 🔥 THE PHONK DROP (3.65s - 4.98s)
  const clip3 = createClipLayer('Clip 3 // 🔥 PHONK 808 DROP', 3.65, 4.98, 3.65, 'coral', true);

  // Scene 4: Deadly Gaze (4.98s - 7.32s)
  const clip4 = createClipLayer('Clip 4 // Deadly Gaze', 4.98, 7.32, 4.98, 'lavender', true);

  // Scene 5: Devil Aura (7.32s - 9.12s)
  const clip5 = createClipLayer('Clip 5 // Devil Aura Speedup', 7.32, 9.12, 7.32, 'coral', true);

  // Scene 6: Lethal Smile & Outro (9.12s - 12.0s)
  const clip6 = createClipLayer('Clip 6 // Lethal Smile', 9.12, 12.0, 9.12, 'mint');

  // Background Audio Track
  const audioLayer = createDefaultLayer(mainComp, 'audio', 'Audio // MIDNIGHT (Phonk Drop)');
  audioLayer.assetId = audioAsset.id;
  audioLayer.labelColor = 'blush';
  audioLayer.inPoint = 0.0;
  audioLayer.outPoint = 12.0;

  mainComp.layers = [
    adjLayer,
    dropTextLayer,
    titleLayer,
    subLayer,
    clip3,
    clip5,
    clip4,
    clip2,
    clip1,
    clip6,
    audioLayer,
  ];

  return {
    id: createId('proj_makima'),
    name: 'Makima // MIDNIGHT Phonk (9_16 Anime Edit).mfproj',
    version: '1.0.0',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    activeCompId: mainComp.id,
    compositions: [mainComp],
    assets: [makimaAsset, audioAsset],
  };
}
