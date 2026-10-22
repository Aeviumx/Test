/**
 * Anime Art Camera Framing & Face/Body Reframe Engine
 * Analyzes high-resolution anime art, detects character bounding box, face and eye regions,
 * and generates dynamic camera punch-ins (wide <-> close-up <-> eyes) synchronized to musical accents.
 */

export interface BoundingBox {
  x: number;      // 0..1 normalized left
  y: number;      // 0..1 normalized top
  width: number;  // 0..1 normalized width
  height: number; // 0..1 normalized height
}

export type FramingScale = 'wide' | 'medium' | 'close' | 'extreme-close';

export interface CameraFraming {
  scale: FramingScale;
  zoom: number;         // 1.0 = fit, 2.5 = 2.5x punch-in
  centerX: number;      // 0..1 center point of interest
  centerY: number;      // 0..1 center point of interest
  description: string;
}

export interface ArtDetectionResult {
  fullBodyBox: BoundingBox;
  upperBodyBox: BoundingBox;
  faceBox: BoundingBox;
  eyesBox: BoundingBox;
  // Convenience aliases for testing & simple consumers
  bodyBox: { x: number; y: number; width: number; height: number };
  faceCenter: [number, number];
  framings: Record<FramingScale, CameraFraming>;
}

export interface ReframeTimelineResult {
  cuts: Array<{
    time: number;
    framingType: FramingScale;
    scale: number;
    whipBlur: boolean;
  }>;
  keyframes: ReframeKeyframe[];
}

/**
 * High-level art framing calculator from image dimensions and optional character bounding box
 */
export function calculateArtFraming(options: {
  imageWidth: number;
  imageHeight: number;
  compWidth?: number;
  compHeight?: number;
  bodyBox?: BoundingBox;
}): ArtDetectionResult {
  const { imageWidth, imageHeight } = options;
  const fullBodyBox: BoundingBox = options.bodyBox || {
    x: 0.15,
    y: 0.08,
    width: 0.70,
    height: 0.88,
  };

  const upperBodyBox: BoundingBox = {
    x: fullBodyBox.x + fullBodyBox.width * 0.1,
    y: fullBodyBox.y,
    width: fullBodyBox.width * 0.8,
    height: fullBodyBox.height * 0.55,
  };

  const faceBox: BoundingBox = {
    x: upperBodyBox.x + upperBodyBox.width * 0.22,
    y: upperBodyBox.y + upperBodyBox.height * 0.08,
    width: upperBodyBox.width * 0.56,
    height: upperBodyBox.height * 0.50,
  };

  const eyesBox: BoundingBox = {
    x: faceBox.x + faceBox.width * 0.15,
    y: faceBox.y + faceBox.height * 0.35,
    width: faceBox.width * 0.70,
    height: faceBox.height * 0.25,
  };

  const framings: Record<FramingScale, CameraFraming> = {
    'wide': {
      scale: 'wide',
      zoom: 1.0,
      centerX: 0.5,
      centerY: 0.5,
      description: 'Full Character Art View',
    },
    'medium': {
      scale: 'medium',
      zoom: 1.6,
      centerX: upperBodyBox.x + upperBodyBox.width / 2,
      centerY: upperBodyBox.y + upperBodyBox.height * 0.45,
      description: 'Upper Body & Torso',
    },
    'close': {
      scale: 'close',
      zoom: 2.8,
      centerX: faceBox.x + faceBox.width / 2,
      centerY: faceBox.y + faceBox.height * 0.5,
      description: 'Face / Expression Portrait',
    },
    'extreme-close': {
      scale: 'extreme-close',
      zoom: 4.5,
      centerX: eyesBox.x + eyesBox.width / 2,
      centerY: eyesBox.y + eyesBox.height * 0.5,
      description: 'Macro Eyes Punch-In',
    },
  };

  const bodyPxBox = {
    x: fullBodyBox.x * imageWidth,
    y: fullBodyBox.y * imageHeight,
    width: fullBodyBox.width * imageWidth,
    height: fullBodyBox.height * imageHeight,
  };

  const faceCenter: [number, number] = [
    (faceBox.x + faceBox.width / 2) * imageWidth,
    (faceBox.y + faceBox.height / 2) * imageHeight,
  ];

  return {
    fullBodyBox,
    upperBodyBox,
    faceBox,
    eyesBox,
    bodyBox: bodyPxBox,
    faceCenter,
    framings,
  };
}

export interface ReframeKeyframe {
  time: number;
  scale: FramingScale;
  zoom: number;
  panX: number;
  panY: number;
  directionalBlur: number; // 0..1 strength of whip/motion blur during cut
}

/**
 * Fast anime art saliency, character contour and face/eye region estimator
 */
export function analyzeArtFraming(
  rgba: Uint8ClampedArray,
  width: number,
  height: number
): ArtDetectionResult {
  let minX = width, maxX = 0, minY = height, maxY = 0;
  let nonBgPixelCount = 0;

  // 1. Detect character bounding box (filter out solid white / black / alpha background)
  const step = Math.max(1, Math.floor(width / 320));
  const sampleR = rgba[0];
  const sampleG = rgba[1];
  const sampleB = rgba[2];
  const isUniformBg = (r: number, g: number, b: number, a: number) => {
    if (a < 20) return true;
    const diff = Math.abs(r - sampleR) + Math.abs(g - sampleG) + Math.abs(b - sampleB);
    return diff < 15;
  };

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const idx = (y * width + x) * 4;
      const r = rgba[idx];
      const g = rgba[idx + 1];
      const b = rgba[idx + 2];
      const a = rgba[idx + 3];

      if (!isUniformBg(r, g, b, a)) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        nonBgPixelCount++;
      }
    }
  }

  // Fallback if background is complex
  if (nonBgPixelCount < 500) {
    minX = Math.floor(width * 0.15);
    maxX = Math.floor(width * 0.85);
    minY = Math.floor(height * 0.05);
    maxY = Math.floor(height * 0.95);
  }

  const charW = maxX - minX;
  const charH = maxY - minY;

  // Full body box
  const fullBodyBox: BoundingBox = {
    x: Math.max(0, minX / width),
    y: Math.max(0, minY / height),
    width: Math.min(1.0, charW / width),
    height: Math.min(1.0, charH / height),
  };

  // 2. Anime anatomy heuristics:
  // In anime character splash art, head/face is typically in the top 15% - 40% of the character silhouette
  const headTop = minY + Math.floor(charH * 0.05);
  const headBottom = minY + Math.floor(charH * 0.38);
  const headCenterY = (headTop + headBottom) / 2;
  const headCenterX = (minX + maxX) / 2;
  const headRadius = Math.min(charW * 0.45, (headBottom - headTop) * 0.7);

  const faceBox: BoundingBox = {
    x: Math.max(0, (headCenterX - headRadius / 2) / width),
    y: Math.max(0, headTop / height),
    width: Math.min(1.0, headRadius / width),
    height: Math.min(1.0, (headBottom - headTop) / height),
  };

  // Eyes zone: horizontal band across center of the face
  const eyeCenterY = headTop + (headBottom - headTop) * 0.48;
  const eyeHeight = (headBottom - headTop) * 0.28;
  const eyesBox: BoundingBox = {
    x: Math.max(0, (headCenterX - headRadius * 0.4) / width),
    y: Math.max(0, (eyeCenterY - eyeHeight / 2) / height),
    width: Math.min(1.0, (headRadius * 0.8) / width),
    height: Math.min(1.0, eyeHeight / height),
  };

  // Upper body (head to waist)
  const upperBodyBox: BoundingBox = {
    x: Math.max(0, (minX + charW * 0.1) / width),
    y: Math.max(0, minY / height),
    width: Math.min(1.0, (charW * 0.8) / width),
    height: Math.min(1.0, (charH * 0.6) / height),
  };

  // 3. Camera Framings (for 1080x1080 1:1 or 1080x1920 9:16)
  const framings: Record<FramingScale, CameraFraming> = {
    wide: {
      scale: 'wide',
      zoom: 1.05,
      centerX: fullBodyBox.x + fullBodyBox.width / 2,
      centerY: fullBodyBox.y + fullBodyBox.height / 2,
      description: 'Full Character Figure',
    },
    medium: {
      scale: 'medium',
      zoom: 1.6,
      centerX: upperBodyBox.x + upperBodyBox.width / 2,
      centerY: upperBodyBox.y + upperBodyBox.height * 0.42,
      description: 'Waist-Up / Torso',
    },
    close: {
      scale: 'close',
      zoom: 2.8,
      centerX: faceBox.x + faceBox.width / 2,
      centerY: faceBox.y + faceBox.height * 0.5,
      description: 'Face / Expression Portrait',
    },
    'extreme-close': {
      scale: 'extreme-close',
      zoom: 4.5,
      centerX: eyesBox.x + eyesBox.width / 2,
      centerY: eyesBox.y + eyesBox.height * 0.5,
      description: 'Macro Eyes Punch-In',
    },
  };

  return {
    fullBodyBox,
    upperBodyBox,
    faceBox,
    eyesBox,
    bodyBox: {
      x: fullBodyBox.x * width,
      y: fullBodyBox.y * height,
      width: fullBodyBox.width * width,
      height: fullBodyBox.height * height,
    },
    faceCenter: [
      (faceBox.x + faceBox.width / 2) * width,
      (faceBox.y + faceBox.height / 2) * height,
    ],
    framings,
  };
}

export type ReframeOptions = {
  imageWidth?: number;
  imageHeight?: number;
  compWidth?: number;
  compHeight?: number;
  accentTimestamps?: number[];
  duration?: number;
  pattern?: 'ref1-alternating' | 'standard';
};

/**
 * Generates rhythmic camera punch-in / reframe timeline:
 * Alternates between wide/medium and close/eyes on musical accents with motion blur kick
 */
export function generateReframeTimeline(
  arg1: ArtDetectionResult | ReframeOptions,
  arg2?: number[],
  arg3?: FramingScale
): any {
  let framingResult: ArtDetectionResult;
  let accents: number[];
  let initialScale: FramingScale = 'wide';
  const isOptionsObject = !('framings' in (arg1 as object));

  if (isOptionsObject) {
    const opts = arg1 as ReframeOptions;
    framingResult = calculateArtFraming({
      imageWidth: opts.imageWidth || 1080,
      imageHeight: opts.imageHeight || 1920,
      compWidth: opts.compWidth || 1080,
      compHeight: opts.compHeight || 1920,
    });
    accents = opts.accentTimestamps || [];
    initialScale = 'close';
  } else {
    framingResult = arg1 as ArtDetectionResult;
    accents = arg2 || [];
    initialScale = arg3 || 'wide';
  }

  const keyframes: ReframeKeyframe[] = [];
  const cuts: Array<{ time: number; framingType: FramingScale; scale: number; whipBlur: boolean }> = [];
  if (accents.length === 0) {
    return isOptionsObject ? { cuts, keyframes } : keyframes;
  }

  // Alternation pattern: close -> wide -> close -> extreme-close -> close -> wide...
  const scaleCycle: FramingScale[] = isOptionsObject
    ? ['close', 'wide', 'close', 'extreme-close', 'close', 'wide']
    : ['wide', 'close', 'medium', 'extreme-close', 'close', 'wide'];
  let cycleIdx = scaleCycle.indexOf(initialScale);
  if (cycleIdx < 0) cycleIdx = 0;

  for (let i = 0; i < accents.length; i++) {
    const t = accents[i];
    const targetScale = scaleCycle[cycleIdx % scaleCycle.length];
    const camera = framingResult.framings[targetScale];

    // Center offset from canvas center (0.5, 0.5)
    const panX = (0.5 - camera.centerX) * camera.zoom;
    const panY = (0.5 - camera.centerY) * camera.zoom;

    keyframes.push({
      time: Math.round(t * 1000) / 1000,
      scale: targetScale,
      zoom: camera.zoom,
      panX,
      panY,
      directionalBlur: 0.85, // strong whip blur on punch-in
    });

    cuts.push({
      time: Math.round(t * 1000) / 1000,
      framingType: targetScale,
      scale: camera.zoom,
      whipBlur: true,
    });

    cycleIdx++;
  }

  return isOptionsObject ? { cuts, keyframes } : keyframes;
}

export interface ArtResolutionAudit {
  imageWidth: number;
  imageHeight: number;
  compWidth: number;
  compHeight: number;
  maxSharpZoom: number;
  requestedZoom: number;
  needsUpscaling: boolean;
  warning?: string;
}

/**
 * Checks whether camera punch-in zoom exceeds source art resolution,
 * generating a warning and flagging Real-ESRGAN upscaling requirement.
 */
export function checkArtZoomResolution(
  imageWidth: number,
  imageHeight: number,
  requestedZoom: number,
  compWidth: number = 1080,
  compHeight: number = 1920
): ArtResolutionAudit {
  const scaleToFit = Math.max(compWidth / imageWidth, compHeight / imageHeight);
  const maxSharpZoom = Number((1.0 / scaleToFit).toFixed(2));
  const needsUpscaling = requestedZoom > maxSharpZoom;
  const warning = needsUpscaling
    ? `Warning: Camera zoom ${requestedZoom.toFixed(2)}x exceeds maximum sharp zoom ${maxSharpZoom.toFixed(2)}x for ${imageWidth}x${imageHeight} art in ${compWidth}x${compHeight} composition. Art requires Real-ESRGAN AI upscaling to prevent blur.`
    : undefined;

  return {
    imageWidth,
    imageHeight,
    compWidth,
    compHeight,
    maxSharpZoom,
    requestedZoom,
    needsUpscaling,
    warning,
  };
}
