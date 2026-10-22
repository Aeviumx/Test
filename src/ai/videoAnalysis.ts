/**
 * Deep Video Scene Analysis Engine for Anime Editing
 * Fast block-matching motion vector estimation, motion peak detection,
 * shot framing classification, and junk detection (letterbox, hardsubs, watermarks, static scenes).
 */

export interface LetterboxCrop {
  top: number;     // pixels from top
  bottom: number;  // pixels from bottom
  left: number;    // pixels from left
  right: number;   // pixels from right
}

export interface VideoJunkFlags {
  hasLetterbox: boolean;
  letterboxCrop?: LetterboxCrop;
  hasHardsub: boolean;       // detected subtitles in lower third
  hasWatermark: boolean;     // detected logo/watermark in corners
  isStaticTalkingHead: boolean; // low motion / static monologue
  isDuplicate: boolean;      // duplicate of another scene
  duplicateSceneId?: string;
}

export interface VideoSceneAnalysis {
  id: string;
  assetId: string;
  name?: string;
  inPoint: number;           // start time in seconds within asset
  outPoint: number;          // end time in seconds within asset
  duration: number;          // seconds
  
  // Motion Vector & Peak Synchronization
  motionIntensity: number;   // 0.0 (still) to 1.0 (explosive action)
  motionDirection: 'left' | 'right' | 'up' | 'down' | 'in' | 'out' | 'static';
  motionPeakTime: number;    // timestamp relative to scene start where motion peaks
  motionPeakFrame: number;   // frame index of peak motion
  
  // Visual Composition & Framing
  shotScale: 'extreme-close' | 'close' | 'medium' | 'wide';
  averageBrightness: number; // 0.0 to 1.0
  dominantColor: string;     // Hex color string (e.g. #e11d48)
  
  // Quality & Junk Filters
  junkFlags: VideoJunkFlags;
  
  // Semantic tagging (Gemini Vision or Heuristic fallback)
  visionTags?: {
    character?: string;
    action?: string;
    emotion?: string;
    epicness: number;         // 0 to 10
    suitability: Array<'drop' | 'buildup' | 'intro' | 'outro' | 'chill'>;
  };
  
  thumbnail?: string;        // Base64 data URL
}

export interface FrameSampleData {
  time: number;
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
}

/**
 * Analyzes a sequence of sampled frames from a scene
 */
export function analyzeSceneFromFrames(
  sceneId: string,
  assetId: string,
  frames: FrameSampleData[],
  inPoint: number,
  outPoint: number
): VideoSceneAnalysis {
  const duration = outPoint - inPoint;
  if (frames.length === 0) {
    return createDefaultAnalysis(sceneId, assetId, inPoint, outPoint);
  }

  const w = frames[0].width;
  const h = frames[0].height;

  // 1. Junk Detection: Letterbox (Black Bars)
  const letterboxCrop = detectLetterboxBorders(frames[0].rgba, w, h);
  const hasLetterbox =
    letterboxCrop.top > 6 ||
    letterboxCrop.bottom > 6 ||
    letterboxCrop.left > 6 ||
    letterboxCrop.right > 6;

  // 2. Junk Detection: Hardsubs in bottom 15% & Watermarks in corners
  const hasHardsub = detectSubtitlesInFrames(frames, w, h);
  const hasWatermark = detectWatermarksInFrames(frames, w, h);

  // 3. Motion Estimation across sequential frames
  const { motionIntensity, motionDirection, motionPeakRelTime, motionPeakFrame } =
    computeMotionVectors(frames, inPoint);

  // 4. Shot Scale / Framing Classification
  const shotScale = classifyShotScale(frames, w, h, letterboxCrop);

  // 5. Brightness and Dominant Color
  const { averageBrightness, dominantColor } = computeColorMetrics(frames[0].rgba);

  // 6. Static Scene / Talking head check
  const isStaticTalkingHead = motionIntensity < 0.08 && duration > 1.2;

  // 7. Heuristic Epicness & Section Suitability
  const epicness = calculateHeuristicEpicness(motionIntensity, shotScale, averageBrightness);
  const suitability = determineSuitability(epicness, motionIntensity, shotScale);

  return {
    id: sceneId,
    assetId,
    inPoint,
    outPoint,
    duration,
    motionIntensity,
    motionDirection,
    motionPeakTime: motionPeakRelTime,
    motionPeakFrame,
    shotScale,
    averageBrightness,
    dominantColor,
    junkFlags: {
      hasLetterbox,
      letterboxCrop: hasLetterbox ? letterboxCrop : undefined,
      hasHardsub,
      hasWatermark,
      isStaticTalkingHead,
      isDuplicate: false,
    },
    visionTags: {
      epicness,
      suitability,
    },
  };
}

/**
 * Fast block-matching motion estimation on downsampled 16x16 macroblock grid
 */
function computeMotionVectors(
  frames: FrameSampleData[],
  inPoint: number
): {
  motionIntensity: number;
  motionDirection: 'left' | 'right' | 'up' | 'down' | 'in' | 'out' | 'static';
  motionPeakRelTime: number;
  motionPeakFrame: number;
} {
  if (frames.length < 2) {
    return {
      motionIntensity: 0.1,
      motionDirection: 'static',
      motionPeakRelTime: 0,
      motionPeakFrame: 0,
    };
  }

  const w = frames[0].width;
  const h = frames[0].height;
  const cx = w / 2;
  const cy = h / 2;

  let maxDiff = -1;
  let peakIndex = 0;
  let totalDx = 0;
  let totalDy = 0;
  let totalDivergence = 0; // outward vs inward vectors (zoom in vs zoom out)
  let totalMagnitude = 0;
  let sampleCount = 0;

  for (let i = 0; i < frames.length - 1; i++) {
    const f1 = frames[i].rgba;
    const f2 = frames[i + 1].rgba;

    let frameDiff = 0;
    let localDx = 0;
    let localDy = 0;
    let localDiv = 0;

    // Sample 12x12 grid of blocks across the frame
    const stepX = Math.floor(w / 12);
    const stepY = Math.floor(h / 12);

    for (let gy = stepY; gy < h - stepY; gy += stepY) {
      for (let gx = stepX; gx < w - stepX; gx += stepX) {
        const idx = (gy * w + gx) * 4;
        // Grayscale difference
        const luma1 = (f1[idx] * 299 + f1[idx + 1] * 587 + f1[idx + 2] * 114) / 1000;
        const luma2 = (f2[idx] * 299 + f2[idx + 1] * 587 + f2[idx + 2] * 114) / 1000;
        const d = Math.abs(luma1 - luma2);
        frameDiff += d;

        // Block-matching shift search ±4 pixels
        let bestShiftX = 0;
        let bestShiftY = 0;
        let minShiftDiff = d;

        for (let sy = -4; sy <= 4; sy += 2) {
          for (let sx = -4; sx <= 4; sx += 2) {
            const nIdx = ((gy + sy) * w + (gx + sx)) * 4;
            if (nIdx >= 0 && nIdx + 2 < f2.length) {
              const nLuma2 = (f2[nIdx] * 299 + f2[nIdx + 1] * 587 + f2[nIdx + 2] * 114) / 1000;
              const sDiff = Math.abs(luma1 - nLuma2);
              if (sDiff < minShiftDiff) {
                minShiftDiff = sDiff;
                bestShiftX = sx;
                bestShiftY = sy;
              }
            }
          }
        }

        localDx += bestShiftX;
        localDy += bestShiftY;

        // Divergence from center: (p - c) dot v
        const px = gx - cx;
        const py = gy - cy;
        const dot = px * bestShiftX + py * bestShiftY;
        localDiv += dot;
      }
    }

    if (frameDiff > maxDiff) {
      maxDiff = frameDiff;
      peakIndex = i;
    }

    totalDx += localDx;
    totalDy += localDy;
    totalDivergence += localDiv;
    totalMagnitude += Math.sqrt(localDx * localDx + localDy * localDy);
    sampleCount++;
  }

  // Normalize motion intensity
  const avgMag = sampleCount > 0 ? totalMagnitude / sampleCount : 0;
  const motionIntensity = Math.min(1.0, avgMag / 180);

  // Determine dominant vector direction
  let motionDirection: 'left' | 'right' | 'up' | 'down' | 'in' | 'out' | 'static' = 'static';
  if (motionIntensity > 0.08) {
    if (Math.abs(totalDivergence) > Math.abs(totalDx) * 350) {
      motionDirection = totalDivergence > 0 ? 'in' : 'out';
    } else if (Math.abs(totalDx) > Math.abs(totalDy) * 1.3) {
      motionDirection = totalDx > 0 ? 'right' : 'left';
    } else if (Math.abs(totalDy) > Math.abs(totalDx) * 1.3) {
      motionDirection = totalDy > 0 ? 'down' : 'up';
    }
  }

  const motionPeakRelTime = frames[peakIndex].time - inPoint;

  return {
    motionIntensity: Number(motionIntensity.toFixed(2)),
    motionDirection,
    motionPeakRelTime: Math.max(0, Number(motionPeakRelTime.toFixed(3))),
    motionPeakFrame: peakIndex,
  };
}

/**
 * Scans image borders for black letterbox borders (aspect ratio bars)
 */
function detectLetterboxBorders(rgba: Uint8ClampedArray, w: number, h: number): LetterboxCrop {
  const lumaThreshold = 14; // almost pitch black (<5% luma)

  let top = 0;
  let bottom = 0;
  let left = 0;
  let right = 0;

  // Scan Top rows
  for (let y = 0; y < Math.floor(h * 0.35); y++) {
    let isBlackRow = true;
    for (let x = 0; x < w; x += 8) {
      const idx = (y * w + x) * 4;
      const luma = (rgba[idx] * 299 + rgba[idx + 1] * 587 + rgba[idx + 2] * 114) / 1000;
      if (luma > lumaThreshold) {
        isBlackRow = false;
        break;
      }
    }
    if (isBlackRow) top = y;
    else break;
  }

  // Scan Bottom rows
  for (let y = h - 1; y > Math.floor(h * 0.65); y--) {
    let isBlackRow = true;
    for (let x = 0; x < w; x += 8) {
      const idx = (y * w + x) * 4;
      const luma = (rgba[idx] * 299 + rgba[idx + 1] * 587 + rgba[idx + 2] * 114) / 1000;
      if (luma > lumaThreshold) {
        isBlackRow = false;
        break;
      }
    }
    if (isBlackRow) bottom = h - y;
    else break;
  }

  return { top, bottom, left, right };
}

/**
 * Detects hardcoded subtitles by temporal stability:
 * Real subtitle glyphs stay in the exact same pixel positions in the bottom 18%
 * across a 1.0–5.0s window while underlying anime background pixels change.
 */
function detectSubtitlesInFrames(frames: FrameSampleData[], w: number, h: number): boolean {
  if (frames.length === 0) return false;
  const bottomZoneY = Math.floor(h * 0.82);

  // If only a single frame is sampled, fall back to high-contrast stroke detection
  if (frames.length === 1) {
    let singleFrameEdges = 0;
    const f = frames[0].rgba;
    for (let y = bottomZoneY; y < h - 4; y += 4) {
      for (let x = 8; x < w - 8; x += 4) {
        const idx = (y * w + x) * 4;
        const idxR = (y * w + (x + 2)) * 4;
        const l1 = (f[idx] * 299 + f[idx + 1] * 587 + f[idx + 2] * 114) / 1000;
        const l2 = (f[idxR] * 299 + f[idxR + 1] * 587 + f[idxR + 2] * 114) / 1000;
        if (Math.abs(l1 - l2) > 90) singleFrameEdges++;
      }
    }
    return singleFrameEdges > 40;
  }

  // Multi-frame temporal stability: text glyph edges stationary while background changes
  const f1 = frames[0].rgba;
  const f2 = frames[frames.length - 1].rgba;

  let staticHighContrastEdges = 0;
  let movingBackgroundPixels = 0;

  for (let y = bottomZoneY; y < h - 4; y += 3) {
    for (let x = 12; x < w - 12; x += 3) {
      const idx = (y * w + x) * 4;
      const idxR = (y * w + (x + 2)) * 4;

      const l1 = (f1[idx] * 299 + f1[idx + 1] * 587 + f1[idx + 2] * 114) / 1000;
      const l1R = (f1[idxR] * 299 + f1[idxR + 1] * 587 + f1[idxR + 2] * 114) / 1000;
      const edge1 = Math.abs(l1 - l1R);

      const l2 = (f2[idx] * 299 + f2[idx + 1] * 587 + f2[idx + 2] * 114) / 1000;
      const l2R = (f2[idxR] * 299 + f2[idxR + 1] * 587 + f2[idxR + 2] * 114) / 1000;
      const edge2 = Math.abs(l2 - l2R);

      const pixelDiff = Math.abs(l1 - l2);
      if (pixelDiff > 18) {
        movingBackgroundPixels++;
      }

      // Glyph stroke edges remain sharp and stationary at the exact same pixel coordinate
      if (edge1 > 85 && edge2 > 85 && Math.abs(edge1 - edge2) < 22) {
        staticHighContrastEdges++;
      }
    }
  }

  // Hardsub is positive ONLY if text is stationary while the video underneath changes
  return staticHighContrastEdges > 35 && movingBackgroundPixels > 70;
}

/**
 * Detects logos or watermarks in corner regions
 */
function detectWatermarksInFrames(frames: FrameSampleData[], w: number, h: number): boolean {
  if (frames.length < 2) return false;
  const cornerW = Math.floor(w * 0.18);
  const cornerH = Math.floor(h * 0.14);

  // Watermarks are static across multiple frames while the background video changes
  const f1 = frames[0].rgba;
  const f2 = frames[frames.length - 1].rgba;

  let staticEdgeCount = 0;
  // Check Top-Right corner
  for (let y = 6; y < cornerH; y += 3) {
    for (let x = w - cornerW; x < w - 6; x += 3) {
      const idx = (y * w + x) * 4;
      const diff = Math.abs(f1[idx] - f2[idx]);
      const luma = (f1[idx] * 299 + f1[idx + 1] * 587 + f1[idx + 2] * 114) / 1000;
      if (diff < 4 && luma > 160) {
        staticEdgeCount++;
      }
    }
  }

  return staticEdgeCount > 35;
}

/**
 * Classifies shot framing (extreme-close, close, medium, wide)
 */
function classifyShotScale(
  frames: FrameSampleData[],
  w: number,
  h: number,
  crop: LetterboxCrop
): 'extreme-close' | 'close' | 'medium' | 'wide' {
  const f = frames[0].rgba;
  const activeTop = crop.top + 10;
  const activeBottom = h - crop.bottom - 10;

  // High detail / contrast concentration area
  let centerDetail = 0;
  let outerDetail = 0;
  const cx = w / 2;
  const cy = h / 2;
  const centerRadius = Math.min(w, h) * 0.28;

  for (let y = activeTop; y < activeBottom; y += 8) {
    for (let x = 10; x < w - 10; x += 8) {
      const idx = (y * w + x) * 4;
      const idxNext = (y * w + (x + 2)) * 4;
      const diff = Math.abs(f[idx] - f[idxNext]);

      const dist = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy));
      if (dist < centerRadius) {
        centerDetail += diff;
      } else {
        outerDetail += diff;
      }
    }
  }

  const ratio = centerDetail / (outerDetail + 0.001);
  if (ratio > 1.8) return 'extreme-close';
  if (ratio > 1.1) return 'close';
  if (ratio > 0.65) return 'medium';
  return 'wide';
}

/**
 * Computes average brightness and dominant hex color
 */
function computeColorMetrics(rgba: Uint8ClampedArray): {
  averageBrightness: number;
  dominantColor: string;
} {
  let totalLuma = 0;
  let totalR = 0;
  let totalG = 0;
  let totalB = 0;
  const totalPixels = rgba.length / 4;
  const step = Math.max(1, Math.floor(totalPixels / 1000));

  let samples = 0;
  for (let i = 0; i < rgba.length; i += step * 4) {
    const r = rgba[i];
    const g = rgba[i + 1];
    const b = rgba[i + 2];
    totalR += r;
    totalG += g;
    totalB += b;
    totalLuma += (r * 299 + g * 587 + b * 114) / 1000;
    samples++;
  }

  const avgR = Math.round(totalR / samples);
  const avgG = Math.round(totalG / samples);
  const avgB = Math.round(totalB / samples);
  const averageBrightness = Number((totalLuma / (samples * 255)).toFixed(2));
  const dominantColor = `#${avgR.toString(16).padStart(2, '0')}${avgG.toString(16).padStart(2, '0')}${avgB.toString(16).padStart(2, '0')}`;

  return { averageBrightness, dominantColor };
}

function calculateHeuristicEpicness(
  motion: number,
  framing: 'extreme-close' | 'close' | 'medium' | 'wide',
  brightness: number
): number {
  let score = motion * 7;
  if (framing === 'close' || framing === 'extreme-close') score += 2;
  if (brightness > 0.3 && brightness < 0.85) score += 1;
  return Math.min(10, Math.max(1, Math.round(score)));
}

function determineSuitability(
  epicness: number,
  motion: number,
  framing: string
): Array<'drop' | 'buildup' | 'intro' | 'outro' | 'chill'> {
  const list: Array<'drop' | 'buildup' | 'intro' | 'outro' | 'chill'> = [];
  if (epicness >= 7 && motion >= 0.5) {
    list.push('drop');
  }
  if (motion >= 0.35 && motion < 0.75) {
    list.push('buildup');
  }
  if (framing === 'wide' || motion < 0.3) {
    list.push('intro');
    list.push('chill');
  }
  if (motion < 0.4) {
    list.push('outro');
  }
  return list;
}

function createDefaultAnalysis(
  sceneId: string,
  assetId: string,
  inPoint: number,
  outPoint: number
): VideoSceneAnalysis {
  return {
    id: sceneId,
    assetId,
    inPoint,
    outPoint,
    duration: outPoint - inPoint,
    motionIntensity: 0.3,
    motionDirection: 'static',
    motionPeakTime: (outPoint - inPoint) * 0.35,
    motionPeakFrame: 0,
    shotScale: 'medium',
    averageBrightness: 0.5,
    dominantColor: '#1e293b',
    junkFlags: {
      hasLetterbox: false,
      hasHardsub: false,
      hasWatermark: false,
      isStaticTalkingHead: false,
      isDuplicate: false,
    },
    visionTags: {
      epicness: 5,
      suitability: ['buildup', 'intro'],
    },
  };
}
