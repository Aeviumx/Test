import { Composition, Project, Vec2 } from '../types';
import { createId } from '../utils/id';
import {
  createDefaultComposition,
  createDefaultLayer,
  createDefaultMask,
  createEffectInstance,
  createKeyframe,
} from './defaults';

export function createDemoProject(): Project {
  const mainComp: Composition = createDefaultComposition({
    name: '01_Kōri_Main_Intro',
    width: 1920,
    height: 1080,
    fps: 30,
    duration: 6,
    backgroundColor: '#0b0b10',
  });

  mainComp.markers = [
    { id: createId('mrk'), time: 0.4, label: 'Logo Assemble', color: '#8cc4ec' },
    { id: createId('mrk'), time: 1.5, label: 'Title Reveal', color: '#f0d4d8' },
    { id: createId('mrk'), time: 3.2, label: 'Pulse & Sweep', color: '#8796ab' },
  ];

  // 1. Adjustment Layer (Top of stack) — Vignette & Chromatic Aberration
  const adjLayer = createDefaultLayer(mainComp, 'adjustment', 'FX Grade & Lens Vignette');
  adjLayer.labelColor = 'sand';
  const vignetteFx = createEffectInstance('vignette');
  vignetteFx.params.amount.value = 58;
  vignetteFx.params.midpoint.value = 52;
  vignetteFx.params.feather.value = 50;

  const chromaFx = createEffectInstance('chromatic-aberration');
  chromaFx.params.offsetX.animated = true;
  chromaFx.params.offsetX.keyframes = [
    createKeyframe(0, 18, 'bezier'),
    createKeyframe(1.4, 3.5, 'bezier'),
    createKeyframe(3.2, 9, 'bezier'),
    createKeyframe(4.2, 2.5, 'bezier'),
  ];
  chromaFx.params.radial.value = 70;
  adjLayer.effects = [chromaFx, vignetteFx];

  // 2. Main Hero Title ("KŌRI 氷") with Text Animator + Glow + Drop Shadow
  const titleLayer = createDefaultLayer(mainComp, 'text', 'KŌRI (氷) Title', {
    text: 'KŌRI (氷)',
    width: 1400,
    height: 200,
  });
  titleLayer.labelColor = 'ice';
  titleLayer.inPoint = 0.6;
  titleLayer.transform.position.value = [960, 690];
  titleLayer.transform.position.animated = true;
  titleLayer.transform.position.keyframes = [
    createKeyframe<Vec2>(0.6, [960, 745], 'bezier'),
    createKeyframe<Vec2>(1.8, [960, 685], 'bezier'),
  ];

  if (titleLayer.textContents) {
    titleLayer.textContents.fontFamily = 'Orbitron';
    titleLayer.textContents.fontWeight = '800';
    titleLayer.textContents.fontSize.value = 92;
    titleLayer.textContents.fillColor.value = '#e9edf3';
    titleLayer.textContents.strokeEnabled = true;
    titleLayer.textContents.strokeColor.value = '#8cc4ec';
    titleLayer.textContents.strokeWidth.value = 1.5;
    titleLayer.textContents.tracking.value = 18;
    titleLayer.textContents.tracking.animated = true;
    titleLayer.textContents.tracking.keyframes = [
      createKeyframe(0.6, 52, 'bezier'),
      createKeyframe(2.2, 18, 'bezier'),
      createKeyframe(6.0, 24, 'bezier'),
    ];

    // Per-character Text Animator
    titleLayer.textContents.animator.enabled = true;
    titleLayer.textContents.animator.shape = 'ramp-up';
    titleLayer.textContents.animator.position.value = [0, 65];
    titleLayer.textContents.animator.opacity.value = 0;
    titleLayer.textContents.animator.scale.value = [50, 50];
    titleLayer.textContents.animator.rotation.value = -18;
    titleLayer.textContents.animator.rangeStart.animated = true;
    titleLayer.textContents.animator.rangeStart.keyframes = [
      createKeyframe(0.6, 0, 'bezier'),
      createKeyframe(1.9, 100, 'bezier'),
    ];
  }

  const titleGlow = createEffectInstance('glow');
  titleGlow.params.threshold.value = 40;
  titleGlow.params.radius.value = 28;
  titleGlow.params.intensity.value = 1.25;
  titleGlow.params.color.value = '#8cc4ec';
  const titleShadow = createEffectInstance('drop-shadow');
  titleShadow.params.distance.value = 12;
  titleShadow.params.softness.value = 18;
  titleShadow.params.opacity.value = 80;
  titleLayer.effects = [titleGlow, titleShadow];
  titleLayer.expandedGroups = ['transform', 'text'];

  // 3. Subtitle Layer with smooth ease & tracking
  const subLayer = createDefaultLayer(mainComp, 'text', 'Subtitle — PRO COMPOSITING STUDIO', {
    text: 'WEBGL2 SHADERS  •  KEYFRAME GRAPH  •  EXPRESSIONS',
    width: 1200,
    height: 100,
  });
  subLayer.labelColor = 'steel';
  subLayer.inPoint = 1.2;
  subLayer.transform.position.value = [960, 785];
  subLayer.transform.opacity.animated = true;
  subLayer.transform.opacity.keyframes = [
    createKeyframe(1.2, 0, 'bezier'),
    createKeyframe(2.1, 90, 'bezier'),
  ];
  if (subLayer.textContents) {
    subLayer.textContents.fontFamily = 'JetBrains Mono';
    subLayer.textContents.fontWeight = '600';
    subLayer.textContents.fontSize.value = 20;
    subLayer.textContents.fillColor.value = '#8cc4ec';
    subLayer.textContents.tracking.value = 6;
  }

  // 4. Masked Light Sweep Layer (Add Blend Mode + Feathered Mask)
  const sweepLayer = createDefaultLayer(mainComp, 'shape', 'Masked Light Sweep', {
    shapeType: 'rectangle',
    width: 1400,
    height: 260,
  });
  sweepLayer.labelColor = 'denim';
  sweepLayer.blendMode = 'add';
  sweepLayer.transform.position.value = [960, 685];
  sweepLayer.transform.rotation.value = -16;
  sweepLayer.transform.opacity.animated = true;
  sweepLayer.transform.opacity.keyframes = [
    createKeyframe(0, 0, 'hold'),
    createKeyframe(2.4, 0, 'bezier'),
    createKeyframe(3.2, 75, 'bezier'),
    createKeyframe(4.1, 0, 'bezier'),
  ];
  if (sweepLayer.shapeContents) {
    sweepLayer.shapeContents.fillColor.value = '#8cc4ec';
    sweepLayer.shapeContents.strokeEnabled = false;
  }
  const sweepMask = createDefaultMask(1400, 260, 'ellipse', 1);
  sweepMask.name = 'Sweep Spotlight Mask';
  sweepMask.feather.value = 55;
  sweepMask.expansion.animated = true;
  sweepMask.expansion.keyframes = [
    createKeyframe(2.4, -80, 'bezier'),
    createKeyframe(3.2, 35, 'bezier'),
    createKeyframe(4.1, -60, 'bezier'),
  ];
  sweepLayer.masks = [sweepMask];

  // 5. Logo Master Null Controller (Parent of Logo Layers, with Spatial Bezier Motion Path)
  const logoNull = createDefaultLayer(mainComp, 'null', 'Logo Master Rig [NULL]');
  logoNull.labelColor = 'coral';
  logoNull.transform.position.value = [960, 390];
  logoNull.transform.position.animated = true;
  const kf0 = createKeyframe<Vec2>(0, [480, 240], 'bezier');
  kf0.spatialOutTangent = [180, -140];
  const kf1 = createKeyframe<Vec2>(1.3, [960, 390], 'bezier');
  kf1.spatialInTangent = [-160, -110];
  kf1.spatialOutTangent = [60, 20];
  const kf2 = createKeyframe<Vec2>(6.0, [960, 378], 'bezier');
  kf2.spatialInTangent = [-40, 0];
  logoNull.transform.position.keyframes = [kf0, kf1, kf2];

  logoNull.transform.scale.animated = true;
  logoNull.transform.scale.keyframes = [
    createKeyframe<Vec2>(0, [25, 25], 'bezier'),
    createKeyframe<Vec2>(1.1, [108, 108], 'bezier'),
    createKeyframe<Vec2>(1.6, [100, 100], 'bezier'),
  ];

  // 6. Logo Core Hexagon Prism (Child of Logo Master Rig, with Glow & Gradient Ramp)
  const prismLayer = createDefaultLayer(mainComp, 'shape', 'Logo Core Hexagon', {
    shapeType: 'polygon',
    width: 250,
    height: 250,
  });
  prismLayer.labelColor = 'lavender';
  prismLayer.parentId = logoNull.id;
  prismLayer.transform.position.value = [50, 50]; // Relative to 100x100 Null anchor
  prismLayer.transform.rotation.animated = true;
  prismLayer.transform.rotation.keyframes = [
    createKeyframe(0, -120, 'bezier'),
    createKeyframe(1.6, 0, 'bezier'),
    createKeyframe(6.0, 60, 'bezier'),
  ];
  if (prismLayer.shapeContents) {
    prismLayer.shapeContents.points.value = 6;
    prismLayer.shapeContents.fillColor.value = '#4f86b5';
    prismLayer.shapeContents.strokeColor.value = '#8cc4ec';
    prismLayer.shapeContents.strokeWidth.value = 6;
  }
  const prismRamp = createEffectInstance('gradient-ramp');
  prismRamp.params.startPoint.value = [0, 0];
  prismRamp.params.startColor.value = '#8cc4ec';
  prismRamp.params.endPoint.value = [250, 250];
  prismRamp.params.endColor.value = '#4f86b5';
  prismRamp.params.blend.value = 20;

  const prismGlow = createEffectInstance('glow');
  prismGlow.params.radius.value = 42;
  prismGlow.params.intensity.value = 1.6;
  prismGlow.params.color.value = '#8cc4ec';
  prismLayer.effects = [prismRamp, prismGlow];
  prismLayer.expandedGroups = ['transform', 'contents', 'effects'];

  // 7. Logo Inner Starburst (Driven by JS Expression!)
  const starLayer = createDefaultLayer(mainComp, 'shape', 'Inner Energy Star [Expr]', {
    shapeType: 'star',
    width: 150,
    height: 150,
  });
  starLayer.labelColor = 'ice';
  starLayer.parentId = logoNull.id;
  starLayer.blendMode = 'screen';
  starLayer.transform.position.value = [50, 50];
  starLayer.transform.rotation.expression = 'time * -55';
  starLayer.transform.rotation.expressionEnabled = true;
  starLayer.transform.scale.expression = 'const s = 95 + Math.sin(time * 5) * 12; [s, s]';
  starLayer.transform.scale.expressionEnabled = true;
  if (starLayer.shapeContents) {
    starLayer.shapeContents.points.value = 4;
    starLayer.shapeContents.innerRadius.value = 34;
    starLayer.shapeContents.fillColor.value = '#e9edf3';
    starLayer.shapeContents.strokeColor.value = '#8cc4ec';
    starLayer.shapeContents.strokeWidth.value = 3;
  }

  // 8. Orbital Trim-Path Ring (Child of Logo Master Rig)
  const ringLayer = createDefaultLayer(mainComp, 'shape', 'Orbital Trim Ring', {
    shapeType: 'ellipse',
    width: 370,
    height: 370,
  });
  ringLayer.labelColor = 'ice';
  ringLayer.parentId = logoNull.id;
  ringLayer.transform.position.value = [50, 50];
  ringLayer.transform.rotation.expression = 'time * 38';
  ringLayer.transform.rotation.expressionEnabled = true;
  if (ringLayer.shapeContents) {
    ringLayer.shapeContents.fillEnabled = false;
    ringLayer.shapeContents.strokeColor.value = '#8796ab';
    ringLayer.shapeContents.strokeWidth.value = 5;
    ringLayer.shapeContents.trimStart.animated = true;
    ringLayer.shapeContents.trimStart.keyframes = [
      createKeyframe(0, 0, 'bezier'),
      createKeyframe(1.8, 12, 'bezier'),
      createKeyframe(4.5, 25, 'bezier'),
    ];
    ringLayer.shapeContents.trimEnd.animated = true;
    ringLayer.shapeContents.trimEnd.keyframes = [
      createKeyframe(0, 0, 'bezier'),
      createKeyframe(1.4, 82, 'bezier'),
      createKeyframe(6.0, 92, 'bezier'),
    ];
    ringLayer.shapeContents.trimOffset.animated = true;
    ringLayer.shapeContents.trimOffset.keyframes = [
      createKeyframe(0, 0, 'linear'),
      createKeyframe(6.0, 240, 'linear'),
    ];
  }
  ringLayer.expandedGroups = ['contents'];

  // 9. Wiggle Satellite Orb (Demonstrates wiggle(freq, amp) expression)
  const orbLayer = createDefaultLayer(mainComp, 'shape', 'Plasma Satellite [wiggle]', {
    shapeType: 'ellipse',
    width: 44,
    height: 44,
  });
  orbLayer.labelColor = 'mint';
  orbLayer.blendMode = 'add';
  orbLayer.transform.position.value = [1260, 320];
  orbLayer.transform.position.expression = 'wiggle(1.8, 55)';
  orbLayer.transform.position.expressionEnabled = true;
  if (orbLayer.shapeContents) {
    orbLayer.shapeContents.fillColor.value = '#8cc4ec';
    orbLayer.shapeContents.strokeEnabled = false;
  }
  const orbGlow = createEffectInstance('glow');
  orbGlow.params.radius.value = 35;
  orbGlow.params.intensity.value = 2.2;
  orbGlow.params.color.value = '#8cc4ec';
  orbLayer.effects = [orbGlow];

  // 10. Procedural Nebula Backdrop Solid (Fractal Noise + Tint)
  const bgLayer = createDefaultLayer(mainComp, 'solid', 'Deep Nebula Backdrop', {
    solidColor: '#0b0d11',
  });
  bgLayer.labelColor = 'denim';
  const fractalFx = createEffectInstance('fractal-noise');
  fractalFx.params.scale.value = 220;
  fractalFx.params.contrast.value = 135;
  fractalFx.params.brightness.value = -18;
  fractalFx.params.blend.value = 48;
  fractalFx.params.evolution.animated = true;
  fractalFx.params.evolution.keyframes = [
    createKeyframe(0, 0, 'linear'),
    createKeyframe(6, 220, 'linear'),
  ];

  const tintFx = createEffectInstance('tint');
  tintFx.params.blackColor.value = '#090910';
  tintFx.params.whiteColor.value = '#191d25';
  tintFx.params.amount.value = 85;
  bgLayer.effects = [fractalFx, tintFx];

  mainComp.layers = [
    adjLayer,
    titleLayer,
    subLayer,
    sweepLayer,
    starLayer,
    prismLayer,
    ringLayer,
    logoNull,
    orbLayer,
    bgLayer,
  ];

  // Secondary composition for demonstrating multi-comp switching & pre-composing
  const secondaryComp = createDefaultComposition({
    name: '02_Social_Reels_9x16',
    width: 1080,
    height: 1920,
    fps: 30,
    duration: 5,
    backgroundColor: '#0b0d11',
  });

  const reelsShape = createDefaultLayer(secondaryComp, 'shape', 'Neon Pulse Frame', {
    shapeType: 'rectangle',
    width: 860,
    height: 1560,
  });
  if (reelsShape.shapeContents) {
    reelsShape.shapeContents.fillEnabled = false;
    reelsShape.shapeContents.strokeColor.value = '#8cc4ec';
    reelsShape.shapeContents.strokeWidth.value = 8;
    reelsShape.shapeContents.cornerRadius.value = 48;
  }
  const reelsText = createDefaultLayer(secondaryComp, 'text', 'REELS 9:16 READY', {
    text: 'REELS 9:16',
    width: 840,
    height: 180,
  });
  if (reelsText.textContents) {
    reelsText.textContents.fontFamily = 'Montserrat';
    reelsText.textContents.fontSize.value = 84;
    reelsText.textContents.fillColor.value = '#8cc4ec';
  }
  secondaryComp.layers = [reelsText, reelsShape];

  return {
    id: createId('proj'),
    name: 'Kōri Showcase.mfproj',
    version: '1.0.0',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    activeCompId: mainComp.id,
    compositions: [mainComp, secondaryComp],
    assets: [],
  };
}
