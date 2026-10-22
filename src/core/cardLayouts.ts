import {
  BezierHandle,
  EffectInstance,
  Keyframe,
  Layer,
  TransformGroup,
  Vec2,
} from '../types';
import { createDefaultLayer, createEffectInstance, createKeyframe, createProperty } from './defaults';
import { createId } from '../utils/id';

export interface CardSlot {
  index: number;
  center: Vec2; // [x, y] in comp coords
  width: number;
  height: number;
  rotation: number; // degrees
  scale: number;
  zIndex: number;
}

export interface CardSlotLayout {
  cardCount: number;
  compWidth: number;
  compHeight: number;
  aspectRatio: '9:16' | '1:1' | '16:9';
  slots: CardSlot[];
}

export interface CardAssetInput {
  assetId: string;
  name: string;
  imageUrl?: string;
  characterName?: string;
  colorTheme?: string;
}

export interface CardSequenceOptions {
  assets: CardAssetInput[];
  compWidth: number;
  compHeight: number;
  startTime: number; // e.g. 0.0s
  duration: number; // e.g. 4.0s
  fps?: number;
  aspectRatio?: '9:16' | '1:1' | '16:9';
  slideDirection?: 'left-to-right' | 'right-to-left' | 'bottom-up' | 'alternating';
  enableTilt3D?: boolean;
  enableDirectionalBlur?: boolean;
  groupAssetId?: string; // final shot asset to zoom into
  groupZoomTime?: number; // timestamp when cards converge/zoom into group shot
}

/**
 * Calculates deterministic card slot geometries for 2, 3, or 4 cards.
 * Respects safe margins (safe zones for TikTok 9:16: top 180px, bottom 320px, sides 60px).
 */
export function calculateCardLayout(
  cardCount: 2 | 3 | 4,
  compWidth: number,
  compHeight: number,
  aspectRatio: '9:16' | '1:1' | '16:9' = compHeight > compWidth ? '9:16' : '1:1'
): CardSlotLayout {
  const slots: CardSlot[] = [];

  if (aspectRatio === '1:1') {
    // 1:1 Square (e.g. 1080x1080) - reference 1 style: clean vertical rectangular cards side-by-side
    const centerY = compHeight * 0.5;
    const cardHeight = Math.round(compHeight * 0.72); // ~778px in 1080

    if (cardCount === 2) {
      const cardWidth = Math.round(compWidth * 0.38);
      const spacing = compWidth * 0.44;
      slots.push({ index: 0, center: [compWidth * 0.5 - spacing * 0.5, centerY], width: cardWidth, height: cardHeight, rotation: -3, scale: 1, zIndex: 1 });
      slots.push({ index: 1, center: [compWidth * 0.5 + spacing * 0.5, centerY], width: cardWidth, height: cardHeight, rotation: 3, scale: 1, zIndex: 2 });
    } else if (cardCount === 3) {
      // 3 cards side-by-side, slight fan tilt (-4°, 0°, +4°)
      const cardWidth = Math.round(compWidth * 0.28); // ~302px
      const spacing = compWidth * 0.30;
      slots.push({ index: 0, center: [compWidth * 0.5 - spacing, centerY], width: cardWidth, height: cardHeight, rotation: -4, scale: 0.96, zIndex: 1 });
      slots.push({ index: 1, center: [compWidth * 0.5, centerY], width: cardWidth, height: cardHeight, rotation: 0, scale: 1.04, zIndex: 3 }); // hero center
      slots.push({ index: 2, center: [compWidth * 0.5 + spacing, centerY], width: cardWidth, height: cardHeight, rotation: 4, scale: 0.96, zIndex: 2 });
    } else {
      // 4 cards in 2x2 or 4 slim columns
      const cardWidth = Math.round(compWidth * 0.21);
      const spacing = compWidth * 0.23;
      for (let i = 0; i < 4; i++) {
        const offset = (i - 1.5) * spacing;
        slots.push({
          index: i,
          center: [compWidth * 0.5 + offset, centerY],
          width: cardWidth,
          height: cardHeight,
          rotation: (i - 1.5) * 3,
          scale: 1,
          zIndex: i + 1,
        });
      }
    }
  } else {
    // 9:16 Vertical (1080x1920) - optimized for TikTok / Shorts safe zones
    const safeTop = 220;
    const safeBottom = compHeight - 340;
    const centerY = (safeTop + safeBottom) * 0.5;
    const cardHeight = Math.round((safeBottom - safeTop) * 0.70); // ~950px in 1920

    if (cardCount === 2) {
      const cardWidth = Math.round(compWidth * 0.44);
      slots.push({ index: 0, center: [compWidth * 0.29, centerY], width: cardWidth, height: cardHeight, rotation: -4, scale: 1, zIndex: 1 });
      slots.push({ index: 1, center: [compWidth * 0.71, centerY], width: cardWidth, height: cardHeight, rotation: 4, scale: 1, zIndex: 2 });
    } else if (cardCount === 3) {
      // 3 cards side-by-side in vertical format, hero card slightly elevated & centered
      const cardWidth = Math.round(compWidth * 0.32); // ~345px
      const spacing = compWidth * 0.31;
      slots.push({ index: 0, center: [compWidth * 0.5 - spacing, centerY + 20], width: cardWidth, height: cardHeight * 0.94, rotation: -5, scale: 0.95, zIndex: 1 });
      slots.push({ index: 1, center: [compWidth * 0.5, centerY - 25], width: cardWidth * 1.08, height: cardHeight * 1.02, rotation: 0, scale: 1.05, zIndex: 3 });
      slots.push({ index: 2, center: [compWidth * 0.5 + spacing, centerY + 20], width: cardWidth, height: cardHeight * 0.94, rotation: 5, scale: 0.95, zIndex: 2 });
    } else {
      // 4 cards staggered diagonal or 2x2 grid
      const halfW = compWidth * 0.40;
      const halfH = cardHeight * 0.46;
      slots.push({ index: 0, center: [compWidth * 0.28, centerY - halfH * 0.55], width: halfW, height: halfH, rotation: -3, scale: 1, zIndex: 1 });
      slots.push({ index: 1, center: [compWidth * 0.72, centerY - halfH * 0.55], width: halfW, height: halfH, rotation: 3, scale: 1, zIndex: 2 });
      slots.push({ index: 2, center: [compWidth * 0.28, centerY + halfH * 0.55], width: halfW, height: halfH, rotation: -2, scale: 1, zIndex: 3 });
      slots.push({ index: 3, center: [compWidth * 0.72, centerY + halfH * 0.55], width: halfW, height: halfH, rotation: 2, scale: 1, zIndex: 4 });
    }
  }

  return {
    cardCount,
    compWidth,
    compHeight,
    aspectRatio,
    slots,
  };
}

/**
 * Creates full composition layers for the gacha cards intro sequence with whip-pan entrance,
 * card swap, 3D tilt, and final zoom blur into a group splash art.
 */
export function generateCardSequenceLayers(options: CardSequenceOptions): Layer[] {
  const {
    assets,
    compWidth,
    compHeight,
    startTime = 0,
    duration = 4.0,
    aspectRatio = compHeight > compWidth ? '9:16' : '1:1',
    enableTilt3D = true,
    enableDirectionalBlur = true,
    groupAssetId,
    groupZoomTime = startTime + duration - 0.7,
  } = options;

  const cardCount = Math.min(Math.max(assets.length, 2), 4) as 2 | 3 | 4;
  const layout = calculateCardLayout(cardCount, compWidth, compHeight, aspectRatio);
  const layers: Layer[] = [];

  // 1. Solid background layer (e.g. Crisp clean white / light graphic background as in Ref 1)
  const compInfo = { width: compWidth, height: compHeight, duration };
  const bgLayer = createDefaultLayer(
    compInfo,
    'solid',
    'Gacha BG (Clean Graphic)',
    { solidColor: '#f8f9fa', width: compWidth, height: compHeight }
  );
  bgLayer.startTime = startTime;
  bgLayer.inPoint = startTime;
  bgLayer.outPoint = startTime + duration;
  layers.push(bgLayer);

  // Bezier eases for snappy whip-pan anime cuts
  const whipEaseIn: BezierHandle = { x: 0.85, y: 0.0 };
  const whipEaseOut: BezierHandle = { x: 0.15, y: 1.0 };
  const overshootEaseOut: BezierHandle = { x: 0.20, y: 1.25 };

  // 2. Individual character cards
  layout.slots.forEach((slot, idx) => {
    const asset = assets[idx];
    if (!asset) return;

    // Staggered entrance timing
    const enterDelay = idx * 0.18; // 0.18s between card entrances
    const enterStart = startTime + enterDelay;
    const enterEnd = enterStart + 0.38;

    // Swap timing (around mid-point, e.g. at 2.0s - 2.5s)
    const swapStart = startTime + duration * 0.52;
    const swapEnd = swapStart + 0.32;

    // Calculate swapped target slot (cyclical shift: 0->1, 1->2, 2->0)
    const nextSlotIdx = (idx + 1) % cardCount;
    const nextSlot = layout.slots[nextSlotIdx];

    const cardLayer = createDefaultLayer(
      compInfo,
      'image',
      `Card ${idx + 1} - ${asset.characterName || asset.name}`,
      {
        assetId: asset.assetId,
        width: slot.width,
        height: slot.height,
      }
    );
    cardLayer.startTime = startTime;
    cardLayer.inPoint = startTime;
    cardLayer.outPoint = groupZoomTime + 0.15;

    // Configure 3D tilt & blend
    cardLayer.is3D = enableTilt3D;

    // Build Position Keyframes: Offscreen entrance -> Rest -> Swap -> Zoom/Fan out
    const offscreenOffset = (idx % 2 === 0 ? -1 : 1) * (compWidth * 0.85);
    const enterStartPos: Vec2 = [slot.center[0] + offscreenOffset, slot.center[1] + 120];
    const restPos: Vec2 = [slot.center[0], slot.center[1]];
    const swappedPos: Vec2 = [nextSlot.center[0], nextSlot.center[1]];
    const exitPos: Vec2 = [compWidth * 0.5 + (idx - 1) * 350, compHeight * 0.5];

    cardLayer.transform.position.animated = true;
    cardLayer.transform.position.keyframes = [
      createKeyframe(enterStart, enterStartPos, 'bezier', whipEaseIn, overshootEaseOut),
      createKeyframe(enterEnd, restPos, 'bezier', whipEaseIn, whipEaseOut),
      createKeyframe(swapStart, restPos, 'bezier', whipEaseIn, overshootEaseOut),
      createKeyframe(swapEnd, swappedPos, 'bezier', whipEaseIn, whipEaseOut),
      createKeyframe(groupZoomTime, swappedPos, 'bezier', whipEaseIn, whipEaseOut),
      createKeyframe(groupZoomTime + 0.15, exitPos, 'linear'),
    ];
    cardLayer.transform.position.value = enterStartPos;

    // Build Scale Keyframes: Punch on entrance & punch on swap
    cardLayer.transform.scale.animated = true;
    cardLayer.transform.scale.keyframes = [
      createKeyframe(enterStart, [slot.scale * 60, slot.scale * 60] as Vec2, 'bezier', whipEaseIn, whipEaseOut),
      createKeyframe(enterEnd, [slot.scale * 104, slot.scale * 104] as Vec2, 'bezier', whipEaseIn, overshootEaseOut),
      createKeyframe(enterEnd + 0.08, [slot.scale * 100, slot.scale * 100] as Vec2, 'linear'),
      createKeyframe(swapStart, [slot.scale * 100, slot.scale * 100] as Vec2, 'bezier', whipEaseIn, whipEaseOut),
      createKeyframe(swapStart + 0.12, [slot.scale * 115, slot.scale * 115] as Vec2, 'bezier', whipEaseIn, whipEaseOut),
      createKeyframe(swapEnd, [nextSlot.scale * 100, nextSlot.scale * 100] as Vec2, 'linear'),
      createKeyframe(groupZoomTime, [nextSlot.scale * 100, nextSlot.scale * 100] as Vec2, 'linear'),
      createKeyframe(groupZoomTime + 0.15, [nextSlot.scale * 180, nextSlot.scale * 180] as Vec2, 'linear'),
    ];

    // Build Rotation Keyframes: Tilt during whip-pan
    cardLayer.transform.rotation.animated = true;
    const initialTilt = (idx % 2 === 0 ? -12 : 12);
    cardLayer.transform.rotation.keyframes = [
      createKeyframe(enterStart, initialTilt, 'bezier', whipEaseIn, overshootEaseOut),
      createKeyframe(enterEnd, slot.rotation, 'linear'),
      createKeyframe(swapStart, slot.rotation, 'bezier', whipEaseIn, overshootEaseOut),
      createKeyframe(swapEnd, nextSlot.rotation, 'linear'),
    ];
    cardLayer.transform.rotation.value = initialTilt;

    // Build Opacity Keyframes
    cardLayer.transform.opacity.animated = true;
    cardLayer.transform.opacity.keyframes = [
      createKeyframe(enterStart, 0, 'linear'),
      createKeyframe(enterStart + 0.06, 100, 'linear'),
      createKeyframe(groupZoomTime, 100, 'linear'),
      createKeyframe(groupZoomTime + 0.15, 0, 'linear'),
    ];

    // Directional Blur during whip motions
    if (enableDirectionalBlur) {
      const dirBlur = createEffectInstance('directional-blur');
      dirBlur.params.length.animated = true;
      dirBlur.params.angle.value = 0; // horizontal whip
      dirBlur.params.length.keyframes = [
        createKeyframe(enterStart, 45, 'linear'),
        createKeyframe(enterEnd, 0, 'linear'),
        createKeyframe(swapStart, 0, 'linear'),
        createKeyframe(swapStart + 0.10, 35, 'linear'),
        createKeyframe(swapEnd, 0, 'linear'),
        createKeyframe(groupZoomTime, 0, 'linear'),
        createKeyframe(groupZoomTime + 0.12, 60, 'linear'),
      ];
      cardLayer.effects.push(dirBlur);
    }

    // Drop shadow for card depth
    const dropShadow = createEffectInstance('drop-shadow');
    dropShadow.params.distance.value = 16;
    dropShadow.params.softness.value = 24;
    dropShadow.params.opacity.value = 45;
    cardLayer.effects.push(dropShadow);

    layers.push(cardLayer);
  });

  // 3. Group Splash Art Zoom-In (Final shot of the intro, e.g. all 3 characters holding weapons)
  if (groupAssetId) {
    const groupLayer = createDefaultLayer(
      compInfo,
      'image',
      'Group Splash Climax (Ref 1 Shot 4)',
      {
        assetId: groupAssetId,
        width: compWidth,
        height: compHeight,
      }
    );
    groupLayer.startTime = groupZoomTime;
    groupLayer.inPoint = groupZoomTime;
    groupLayer.outPoint = startTime + duration;

    groupLayer.transform.scale.animated = true;
    groupLayer.transform.scale.keyframes = [
      createKeyframe(groupZoomTime, [135, 135] as Vec2, 'bezier', whipEaseIn, whipEaseOut),
      createKeyframe(groupZoomTime + 0.25, [100, 100] as Vec2, 'bezier', whipEaseIn, whipEaseOut),
      createKeyframe(startTime + duration, [104, 104] as Vec2, 'linear'),
    ];

    groupLayer.transform.opacity.animated = true;
    groupLayer.transform.opacity.keyframes = [
      createKeyframe(groupZoomTime, 0, 'linear'),
      createKeyframe(groupZoomTime + 0.05, 100, 'linear'),
    ];

    // Climax zoom punch effect
    if (enableDirectionalBlur) {
      const zoomBlur = createEffectInstance('directional-blur');
      zoomBlur.params.length.animated = true;
      zoomBlur.params.length.keyframes = [
        createKeyframe(groupZoomTime, 50, 'linear'),
        createKeyframe(groupZoomTime + 0.22, 0, 'linear'),
      ];
      groupLayer.effects.push(zoomBlur);
    }

    layers.push(groupLayer);
  }

  return layers;
}
