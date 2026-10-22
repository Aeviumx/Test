/**
 * Karaoke Text & OFL Typography Render Engine
 * Generates word-level glowing karaoke reveals, typewriter author watermarks,
 * aesthetic ornaments, and OFL typography layouts for TikTok/Shorts lyrics.
 */

import { Layer, Vec2 } from '../types';
import { createDefaultLayer, createEffectInstance, createKeyframe } from '../core/defaults';
import { LyricLine, LyricWord } from '../ai/lyricEngine';

export type LyricLayoutTemplate = 'side-block' | 'center-minimal' | 'bottom-subtitle';

export interface OFLFontDefinition {
  family: string;
  category: string;
  recommendedWeights: ('400' | '500' | '600' | '700' | '800')[];
}

export const OFL_FONTS: Record<string, OFLFontDefinition> = {
  montserrat: {
    family: 'Montserrat',
    category: 'Geometric Display / Viral TikTok',
    recommendedWeights: ['600', '700', '800'],
  },
  poppins: {
    family: 'Poppins',
    category: 'Modern Rounded Sans',
    recommendedWeights: ['500', '700'],
  },
  inter: {
    family: 'Inter',
    category: 'Ultra-Clean Grotesk',
    recommendedWeights: ['400', '600', '700'],
  },
  bebasNeue: {
    family: 'Bebas Neue',
    category: 'Condensed Punch Headline',
    recommendedWeights: ['400'],
  },
  anton: {
    family: 'Anton',
    category: 'Heavy Impact AMV',
    recommendedWeights: ['400'],
  },
  spaceGrotesk: {
    family: 'Space Grotesk',
    category: 'Tech / Cyber Aesthetic',
    recommendedWeights: ['500', '700'],
  },
  notoSansJp: {
    family: 'Noto Sans JP',
    category: 'Authentic Japanese Kanji / Hiragana',
    recommendedWeights: ['500', '700'],
  },
};

export interface KaraokeLayerOptions {
  compWidth: number;
  compHeight: number;
  layout?: LyricLayoutTemplate;
  fontFamily?: string;
  fontSize?: number;
  activeWordGlowColor?: string; // e.g. #38bdf8 (ice cyan) or #ffffff
  textColor?: string;
  dimmedOpacity?: number; // 0..100
  enableTypewriterCursor?: boolean;
}

/**
 * Creates an aesthetic typewriter watermark / author signature layer with blinking cursor
 * (e.g. "Song — Artist" or "@editor_handle _")
 */
export function createTypewriterWatermark(options: {
  compWidth: number;
  compHeight: number;
  text: string;
  authorHandle?: string;
  startTime?: number;
  duration?: number;
  position?: 'top-left' | 'bottom-right' | 'below-lyrics';
  fontFamily?: string;
}): Layer {
  const {
    compWidth,
    compHeight,
    text,
    authorHandle = 'edit by kōri',
    startTime = 0.5,
    duration = 10,
    position = 'top-left',
    fontFamily = 'Montserrat',
  } = options;

  const fullText = authorHandle ? `${text} • ${authorHandle}` : text;
  const compInfo = { width: compWidth, height: compHeight, duration };

  const layer = createDefaultLayer(compInfo, 'text', `Watermark (${authorHandle})`, {
    text: fullText,
    width: Math.min(800, compWidth - 100),
    height: 90,
  });

  layer.startTime = startTime;
  layer.inPoint = startTime;
  layer.outPoint = startTime + duration;

  let pos: Vec2 = [compWidth * 0.25, 120];
  if (position === 'bottom-right') {
    pos = [compWidth * 0.70, compHeight - 200];
  } else if (position === 'below-lyrics') {
    pos = [compWidth * 0.35, compHeight * 0.65];
  }

  layer.transform.position.value = pos;

  if (layer.textContents) {
    layer.textContents.fontFamily = fontFamily;
    layer.textContents.fontWeight = '500';
    layer.textContents.fontSize.value = Math.round(compWidth * 0.024); // ~26px in 1080
    layer.textContents.fillColor.value = '#94a3b8'; // subtle slate
    layer.textContents.tracking.value = 3;
    layer.textContents.textAlign = position === 'bottom-right' ? 'right' : 'left';

    // Typewriter Range Reveal
    const anim = layer.textContents.animator;
    anim.enabled = true;
    anim.shape = 'square';
    anim.opacity.value = 0; // unrevealed characters hidden
    anim.rangeStart.animated = true;
    const typeEnd = startTime + Math.min(2.5, fullText.length * 0.06);
    anim.rangeStart.keyframes = [
      createKeyframe(startTime, 0, 'linear'),
      createKeyframe(typeEnd, 100, 'linear'),
    ];
  }

  return layer;
}

/**
 * Builds composition text layers for synchronized lyric lines with word glow reveal
 */
export function generateKaraokeCompositionLayers(
  lines: LyricLine[],
  options: KaraokeLayerOptions
): Layer[] {
  const {
    compWidth,
    compHeight,
    layout = 'side-block',
    fontFamily = 'Montserrat',
    fontSize = layout === 'side-block' ? 44 : 52,
    activeWordGlowColor = '#ffffff',
    textColor = '#e2e8f0',
  } = options;

  const compInfo = { width: compWidth, height: compHeight, duration: 15 };
  const layers: Layer[] = [];

  lines.forEach((line, idx) => {
    const lineDuration = line.endTime - line.startTime;
    const layer = createDefaultLayer(
      compInfo,
      'text',
      `Lyric ${idx + 1}: "${line.text.slice(0, 20)}..."`,
      {
        text: line.ornament ? `${line.ornament}\n${line.text}` : line.text,
        width: Math.round(compWidth * 0.85),
        height: 180,
      }
    );

    layer.startTime = line.startTime;
    layer.inPoint = line.startTime;
    layer.outPoint = line.endTime;

    // Layout positioning
    let centerPos: Vec2;
    if (layout === 'side-block') {
      // Left vertical block (Reference 2 aesthetic)
      centerPos = [compWidth * 0.42, compHeight * 0.48];
    } else if (layout === 'center-minimal') {
      centerPos = [compWidth * 0.5, compHeight * 0.5];
    } else {
      // Bottom subtitle safe zone (TikTok: safe bottom is above 340px)
      centerPos = [compWidth * 0.5, compHeight - 380];
    }

    layer.transform.position.value = centerPos;

    // Subtle fade-in / fade-out
    layer.transform.opacity.animated = true;
    layer.transform.opacity.keyframes = [
      createKeyframe(line.startTime, 0, 'linear'),
      createKeyframe(line.startTime + 0.15, 100, 'linear'),
      createKeyframe(line.endTime - 0.20, 100, 'linear'),
      createKeyframe(line.endTime, 0, 'linear'),
    ];

    if (layer.textContents) {
      layer.textContents.fontFamily = fontFamily;
      layer.textContents.fontWeight = '700';
      layer.textContents.fontSize.value = fontSize;
      layer.textContents.fillColor.value = textColor;
      layer.textContents.textAlign = layout === 'side-block' ? 'left' : 'center';
      layer.textContents.lineHeight.value = 1.35;
      layer.textContents.tracking.value = 2;

      // Character / Word Animator (revealing each word progressively)
      const anim = layer.textContents.animator;
      anim.enabled = true;
      anim.shape = 'ramp-up';
      anim.opacity.value = 35; // unrevealed text is dimmed to 35%
      anim.scale.value = [94, 94];

      anim.rangeStart.animated = true;
      anim.rangeStart.keyframes = [
        createKeyframe(line.startTime, 0, 'linear'),
        createKeyframe(line.endTime, 100, 'linear'),
      ];
    }

    // Glow effect for active word luminescence
    const glow = createEffectInstance('glow');
    glow.params.threshold.value = 25;
    glow.params.radius.value = 18;
    glow.params.intensity.value = 1.25;
    glow.params.color.value = activeWordGlowColor;
    layer.effects.push(glow);

    layers.push(layer);
  });

  return layers;
}
