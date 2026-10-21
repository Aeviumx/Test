import {
  BezierHandle,
  Composition,
  EffectInstance,
  EffectParamDefinition,
  EffectType,
  Keyframe,
  KeyframeInterpolation,
  LabelColor,
  Layer,
  LayerType,
  Mask,
  MaskShapeType,
  Property,
  ShapeContents,
  ShapeGeometryType,
  TextContents,
  TransformGroup,
  Vec2,
} from '../types';
import { createId } from '../utils/id';

export function createProperty<T = number | Vec2 | string>(
  name: string,
  defaultValue: T,
  options?: {
    min?: number;
    max?: number;
    step?: number;
    unit?: string;
    animated?: boolean;
    keyframes?: Keyframe<T>[];
    expression?: string;
    expressionEnabled?: boolean;
  }
): Property<T> {
  return {
    id: createId('prop'),
    name,
    value: defaultValue,
    animated: options?.animated ?? (options?.keyframes ? options.keyframes.length > 0 : false),
    keyframes: options?.keyframes ?? [],
    expression: options?.expression ?? '',
    expressionEnabled: options?.expressionEnabled ?? false,
    expressionError: null,
    min: options?.min,
    max: options?.max,
    step: options?.step,
    unit: options?.unit,
  };
}

export function createKeyframe<T = number | Vec2 | string>(
  time: number,
  value: T,
  interpolation: KeyframeInterpolation = 'bezier',
  inTangent?: BezierHandle,
  outTangent?: BezierHandle
): Keyframe<T> {
  return {
    id: createId('kf'),
    time,
    value,
    interpolation,
    inTangent: inTangent ?? { x: 0.33, y: 0 },
    outTangent: outTangent ?? { x: 0.33, y: 0 },
  };
}

export function createDefaultTransform(compWidth: number, compHeight: number, layerWidth: number, layerHeight: number): TransformGroup {
  return {
    anchorPoint: createProperty<Vec2>('Anchor Point', [layerWidth / 2, layerHeight / 2], { step: 1, unit: 'px' }),
    position: createProperty<Vec2>('Position', [compWidth / 2, compHeight / 2], { step: 1, unit: 'px' }),
    scale: createProperty<Vec2>('Scale', [100, 100], { min: -1000, max: 1000, step: 1, unit: '%' }),
    scaleConstrain: true,
    rotation: createProperty<number>('Rotation', 0, { step: 1, unit: '°' }),
    opacity: createProperty<number>('Opacity', 100, { min: 0, max: 100, step: 1, unit: '%' }),
    skew: createProperty<number>('Skew', 0, { min: -85, max: 85, step: 0.5, unit: '°' }),
    skewAxis: createProperty<number>('Skew Axis', 0, { step: 1, unit: '°' }),
  };
}

export function createDefaultShapeContents(shapeType: ShapeGeometryType = 'rectangle', width = 360, height = 360): ShapeContents {
  return {
    shapeType,
    size: createProperty<Vec2>('Size', [width, height], { min: 1, max: 4000, step: 1, unit: 'px' }),
    cornerRadius: createProperty<number>('Corner Radius', shapeType === 'rectangle' ? 20 : 0, { min: 0, max: 500, step: 1, unit: 'px' }),
    points: createProperty<number>('Points', shapeType === 'star' ? 5 : 6, { min: 3, max: 32, step: 1 }),
    innerRadius: createProperty<number>('Inner Radius', 48, { min: 5, max: 95, step: 1, unit: '%' }),
    fillEnabled: shapeType !== 'path',
    fillColor: createProperty<string>('Fill Color', '#6c5ce7'),
    fillOpacity: createProperty<number>('Fill Opacity', 100, { min: 0, max: 100, step: 1, unit: '%' }),
    strokeEnabled: true,
    strokeColor: createProperty<string>('Stroke Color', '#00d1b2'),
    strokeWidth: createProperty<number>('Stroke Width', 4, { min: 0, max: 200, step: 0.5, unit: 'px' }),
    strokeDash: createProperty<number>('Stroke Dash', 0, { min: 0, max: 500, step: 1, unit: 'px' }),
    strokeDashGap: createProperty<number>('Dash Gap', 12, { min: 1, max: 500, step: 1, unit: 'px' }),
    strokeDashOffset: createProperty<number>('Dash Offset', 0, { step: 1, unit: 'px' }),
    lineCap: 'round',
    lineJoin: 'round',
    trimStart: createProperty<number>('Trim Start', 0, { min: 0, max: 100, step: 0.5, unit: '%' }),
    trimEnd: createProperty<number>('Trim End', 100, { min: 0, max: 100, step: 0.5, unit: '%' }),
    trimOffset: createProperty<number>('Trim Offset', 0, { step: 1, unit: '°' }),
    vertices: [
      { x: width * 0.2, y: height * 0.7, inX: -30, inY: 20, outX: 40, outY: -80 },
      { x: width * 0.5, y: height * 0.25, inX: -50, inY: 0, outX: 50, outY: 0 },
      { x: width * 0.8, y: height * 0.7, inX: -40, inY: -80, outX: 30, outY: 20 },
    ],
    closed: shapeType !== 'path',
  };
}

export function createDefaultTextContents(text = 'MOTIONFORGE'): TextContents {
  return {
    text,
    fontFamily: 'Inter',
    fontWeight: '800',
    fontStyle: 'normal',
    fontSize: createProperty<number>('Font Size', 84, { min: 4, max: 600, step: 1, unit: 'px' }),
    fillColor: createProperty<string>('Fill Color', '#ffffff'),
    strokeEnabled: false,
    strokeColor: createProperty<string>('Stroke Color', '#6c5ce7'),
    strokeWidth: createProperty<number>('Stroke Width', 2, { min: 0, max: 50, step: 0.5, unit: 'px' }),
    tracking: createProperty<number>('Tracking', 8, { min: -100, max: 500, step: 1 }),
    lineHeight: createProperty<number>('Line Height', 1.15, { min: 0.5, max: 4, step: 0.05 }),
    textAlign: 'center',
    animator: {
      enabled: false,
      rangeStart: createProperty<number>('Range Start', 0, { min: 0, max: 100, step: 1, unit: '%' }),
      rangeEnd: createProperty<number>('Range End', 100, { min: 0, max: 100, step: 1, unit: '%' }),
      rangeOffset: createProperty<number>('Range Offset', 0, { min: -100, max: 100, step: 1, unit: '%' }),
      shape: 'ramp-up',
      position: createProperty<Vec2>('Animator Position', [0, 45], { step: 1, unit: 'px' }),
      scale: createProperty<Vec2>('Animator Scale', [100, 100], { step: 1, unit: '%' }),
      rotation: createProperty<number>('Animator Rotation', 0, { step: 1, unit: '°' }),
      opacity: createProperty<number>('Animator Opacity', 0, { min: 0, max: 100, step: 1, unit: '%' }),
      tracking: createProperty<number>('Animator Tracking', 0, { step: 1 }),
    },
  };
}

export function createDefaultMask(width: number, height: number, shapeType: MaskShapeType = 'rectangle', index = 1): Mask {
  const padX = Math.round(width * 0.12);
  const padY = Math.round(height * 0.12);
  const w = width - padX * 2;
  const h = height - padY * 2;
  return {
    id: createId('mask'),
    name: `Mask ${index}`,
    enabled: true,
    inverted: false,
    mode: 'add',
    shapeType,
    rect: { x: padX, y: padY, width: w, height: h },
    vertices: [
      { x: padX, y: padY, inX: 0, inY: 0, outX: 0, outY: 0 },
      { x: padX + w, y: padY, inX: 0, inY: 0, outX: 0, outY: 0 },
      { x: padX + w, y: padY + h, inX: 0, inY: 0, outX: 0, outY: 0 },
      { x: padX, y: padY + h, inX: 0, inY: 0, outX: 0, outY: 0 },
    ],
    closed: true,
    feather: createProperty<number>('Mask Feather', 0, { min: 0, max: 300, step: 1, unit: 'px' }),
    opacity: createProperty<number>('Mask Opacity', 100, { min: 0, max: 100, step: 1, unit: '%' }),
    expansion: createProperty<number>('Mask Expansion', 0, { min: -200, max: 200, step: 1, unit: 'px' }),
  };
}

export interface EffectCatalogEntry {
  type: EffectType;
  name: string;
  category: 'Blur & Sharpen' | 'Stylize' | 'Color Correction' | 'Generate' | 'Noise & Grain' | 'Distort';
  description: string;
  params: EffectParamDefinition[];
}

export const EFFECT_CATALOG: EffectCatalogEntry[] = [
  {
    type: 'gaussian-blur',
    name: 'Gaussian Blur',
    category: 'Blur & Sharpen',
    description: 'Smooth two-pass GPU Gaussian blur with edge repeat',
    params: [
      { key: 'radius', name: 'Blurriness', type: 'number', defaultValue: 18, min: 0, max: 200, step: 0.5, unit: 'px' },
      { key: 'horizontal', name: 'Horizontal Weight', type: 'number', defaultValue: 100, min: 0, max: 100, step: 1, unit: '%' },
      { key: 'vertical', name: 'Vertical Weight', type: 'number', defaultValue: 100, min: 0, max: 100, step: 1, unit: '%' },
    ],
  },
  {
    type: 'directional-blur',
    name: 'Directional Blur',
    category: 'Blur & Sharpen',
    description: 'Linear motion blur along a specified direction angle',
    params: [
      { key: 'angle', name: 'Direction', type: 'number', defaultValue: 45, min: -360, max: 360, step: 1, unit: '°' },
      { key: 'length', name: 'Blur Length', type: 'number', defaultValue: 24, min: 0, max: 180, step: 0.5, unit: 'px' },
    ],
  },
  {
    type: 'glow',
    name: 'Glow',
    category: 'Stylize',
    description: 'Luma-thresholded bloom and colored outer/inner glow',
    params: [
      { key: 'threshold', name: 'Glow Threshold', type: 'number', defaultValue: 35, min: 0, max: 100, step: 1, unit: '%' },
      { key: 'radius', name: 'Glow Radius', type: 'number', defaultValue: 32, min: 0, max: 160, step: 1, unit: 'px' },
      { key: 'intensity', name: 'Glow Intensity', type: 'number', defaultValue: 1.4, min: 0, max: 6, step: 0.05 },
      { key: 'color', name: 'Glow Color', type: 'color', defaultValue: '#6c5ce7' },
    ],
  },
  {
    type: 'drop-shadow',
    name: 'Drop Shadow',
    category: 'Stylize',
    description: 'Directional alpha shadow with softness and opacity',
    params: [
      { key: 'color', name: 'Shadow Color', type: 'color', defaultValue: '#000000' },
      { key: 'opacity', name: 'Opacity', type: 'number', defaultValue: 75, min: 0, max: 100, step: 1, unit: '%' },
      { key: 'angle', name: 'Direction', type: 'number', defaultValue: 135, min: -360, max: 360, step: 1, unit: '°' },
      { key: 'distance', name: 'Distance', type: 'number', defaultValue: 16, min: 0, max: 250, step: 1, unit: 'px' },
      { key: 'softness', name: 'Softness', type: 'number', defaultValue: 20, min: 0, max: 150, step: 1, unit: 'px' },
    ],
  },
  {
    type: 'brightness-contrast',
    name: 'Brightness & Contrast',
    category: 'Color Correction',
    description: 'Adjusts tonal brightness and contrast curve',
    params: [
      { key: 'brightness', name: 'Brightness', type: 'number', defaultValue: 0, min: -100, max: 100, step: 1 },
      { key: 'contrast', name: 'Contrast', type: 'number', defaultValue: 20, min: -100, max: 100, step: 1 },
    ],
  },
  {
    type: 'hue-saturation',
    name: 'Hue/Saturation',
    category: 'Color Correction',
    description: 'Rotates master hue and scales saturation & lightness',
    params: [
      { key: 'hue', name: 'Master Hue', type: 'number', defaultValue: 0, min: -360, max: 360, step: 1, unit: '°' },
      { key: 'saturation', name: 'Master Saturation', type: 'number', defaultValue: 0, min: -100, max: 100, step: 1 },
      { key: 'lightness', name: 'Master Lightness', type: 'number', defaultValue: 0, min: -100, max: 100, step: 1 },
    ],
  },
  {
    type: 'curves',
    name: 'Curves',
    category: 'Color Correction',
    description: 'Parametric S-curve and tonal lift/gamma/gain control',
    params: [
      { key: 'shadows', name: 'Shadows Lift', type: 'number', defaultValue: 0, min: -100, max: 100, step: 1 },
      { key: 'midtones', name: 'Midtones Gamma', type: 'number', defaultValue: 0, min: -100, max: 100, step: 1 },
      { key: 'highlights', name: 'Highlights Gain', type: 'number', defaultValue: 0, min: -100, max: 100, step: 1 },
      { key: 'sCurve', name: 'S-Curve Contrast', type: 'number', defaultValue: 25, min: -100, max: 100, step: 1 },
    ],
  },
  {
    type: 'fill',
    name: 'Fill',
    category: 'Generate',
    description: 'Fills non-transparent layer pixels with a solid color',
    params: [
      { key: 'color', name: 'Fill Color', type: 'color', defaultValue: '#6c5ce7' },
      { key: 'opacity', name: 'Opacity', type: 'number', defaultValue: 100, min: 0, max: 100, step: 1, unit: '%' },
    ],
  },
  {
    type: 'tint',
    name: 'Tint',
    category: 'Color Correction',
    description: 'Remaps luminance between Black and White target colors',
    params: [
      { key: 'blackColor', name: 'Map Black To', type: 'color', defaultValue: '#130f40' },
      { key: 'whiteColor', name: 'Map White To', type: 'color', defaultValue: '#00d1b2' },
      { key: 'amount', name: 'Amount to Tint', type: 'number', defaultValue: 100, min: 0, max: 100, step: 1, unit: '%' },
    ],
  },
  {
    type: 'gradient-ramp',
    name: 'Gradient Ramp',
    category: 'Generate',
    description: 'Generates a smooth two-color gradient ramp over layer alpha',
    params: [
      { key: 'startPoint', name: 'Start of Ramp', type: 'vec2', defaultValue: [0, 0] as Vec2, step: 5, unit: 'px' },
      { key: 'startColor', name: 'Start Color', type: 'color', defaultValue: '#6c5ce7' },
      { key: 'endPoint', name: 'End of Ramp', type: 'vec2', defaultValue: [1920, 1080] as Vec2, step: 5, unit: 'px' },
      { key: 'endColor', name: 'End Color', type: 'color', defaultValue: '#00d1b2' },
      { key: 'blend', name: 'Blend With Original', type: 'number', defaultValue: 0, min: 0, max: 100, step: 1, unit: '%' },
    ],
  },
  {
    type: 'noise',
    name: 'Noise',
    category: 'Noise & Grain',
    description: 'Adds filmic monochrome or RGB sensor grain',
    params: [
      { key: 'amount', name: 'Amount of Noise', type: 'number', defaultValue: 15, min: 0, max: 100, step: 0.5, unit: '%' },
      { key: 'colorNoise', name: 'Color Noise', type: 'number', defaultValue: 1, min: 0, max: 1, step: 1 },
      { key: 'seed', name: 'Random Seed', type: 'number', defaultValue: 1, min: 0, max: 1000, step: 1 },
    ],
  },
  {
    type: 'fractal-noise',
    name: 'Fractal Noise',
    category: 'Noise & Grain',
    description: 'Multi-octave procedural FBM Perlin noise generator',
    params: [
      { key: 'contrast', name: 'Contrast', type: 'number', defaultValue: 120, min: 0, max: 400, step: 1 },
      { key: 'brightness', name: 'Brightness', type: 'number', defaultValue: 0, min: -100, max: 100, step: 1 },
      { key: 'scale', name: 'Uniform Scale', type: 'number', defaultValue: 120, min: 10, max: 1000, step: 2 },
      { key: 'evolution', name: 'Evolution', type: 'number', defaultValue: 0, min: -3600, max: 3600, step: 2, unit: '°' },
      { key: 'blend', name: 'Opacity', type: 'number', defaultValue: 65, min: 0, max: 100, step: 1, unit: '%' },
    ],
  },
  {
    type: 'chromatic-aberration',
    name: 'Chromatic Aberration',
    category: 'Stylize',
    description: 'Splits Red/Green/Blue channels radially or directionally',
    params: [
      { key: 'offsetX', name: 'Red/Blue Shift X', type: 'number', defaultValue: 8, min: -100, max: 100, step: 0.5, unit: 'px' },
      { key: 'offsetY', name: 'Red/Blue Shift Y', type: 'number', defaultValue: 2, min: -100, max: 100, step: 0.5, unit: 'px' },
      { key: 'radial', name: 'Lens Radial Falloff', type: 'number', defaultValue: 60, min: 0, max: 100, step: 1, unit: '%' },
    ],
  },
  {
    type: 'wave-warp',
    name: 'Wave Warp',
    category: 'Distort',
    description: 'Sinusoidal wave distortion with phase animation',
    params: [
      { key: 'height', name: 'Wave Height', type: 'number', defaultValue: 14, min: -200, max: 200, step: 0.5, unit: 'px' },
      { key: 'width', name: 'Wave Width', type: 'number', defaultValue: 80, min: 5, max: 800, step: 1, unit: 'px' },
      { key: 'direction', name: 'Direction', type: 'number', defaultValue: 90, min: -360, max: 360, step: 1, unit: '°' },
      { key: 'phase', name: 'Phase', type: 'number', defaultValue: 0, min: -3600, max: 3600, step: 2, unit: '°' },
    ],
  },
  {
    type: 'turbulent-displace',
    name: 'Turbulent Displace',
    category: 'Distort',
    description: 'Organic fluid UV displacement driven by Simplex turbulence',
    params: [
      { key: 'amount', name: 'Amount', type: 'number', defaultValue: 28, min: -200, max: 200, step: 1 },
      { key: 'size', name: 'Size', type: 'number', defaultValue: 100, min: 10, max: 600, step: 1 },
      { key: 'evolution', name: 'Evolution', type: 'number', defaultValue: 0, min: -3600, max: 3600, step: 2, unit: '°' },
    ],
  },
  {
    type: 'vignette',
    name: 'Vignette',
    category: 'Stylize',
    description: 'Cinematic optical edge darkening or brightening',
    params: [
      { key: 'amount', name: 'Amount', type: 'number', defaultValue: 55, min: -100, max: 100, step: 1, unit: '%' },
      { key: 'midpoint', name: 'Midpoint', type: 'number', defaultValue: 50, min: 0, max: 100, step: 1, unit: '%' },
      { key: 'feather', name: 'Feather', type: 'number', defaultValue: 45, min: 1, max: 100, step: 1, unit: '%' },
    ],
  },
];

export function createEffectInstance(type: EffectType): EffectInstance {
  const def = EFFECT_CATALOG.find((e) => e.type === type);
  if (!def) {
    throw new Error(`Unknown effect type: ${type}`);
  }
  const params: Record<string, Property<number | string | Vec2>> = {};
  for (const p of def.params) {
    params[p.key] = createProperty(p.name, p.defaultValue, {
      min: p.min,
      max: p.max,
      step: p.step,
      unit: p.unit,
    });
  }
  return {
    id: createId('fx'),
    type: def.type,
    name: def.name,
    category: def.category,
    enabled: true,
    params,
  };
}

const LAYER_LABEL_DEFAULTS: Record<LayerType, LabelColor> = {
  solid: 'slate',
  shape: 'sky',
  text: 'violet',
  image: 'teal',
  video: 'emerald',
  audio: 'emerald',
  null: 'rose',
  adjustment: 'fuchsia',
  camera: 'amber',
  precomp: 'amber',
};

export function createDefaultLayer(
  comp: Pick<Composition, 'width' | 'height' | 'duration'>,
  type: LayerType,
  name?: string,
  options?: {
    solidColor?: string;
    shapeType?: ShapeGeometryType;
    text?: string;
    assetId?: string;
    compId?: string;
    width?: number;
    height?: number;
  }
): Layer {
  const w =
    options?.width ??
    (type === 'shape' ? 380 : type === 'null' ? 100 : type === 'text' ? 900 : comp.width);
  const h =
    options?.height ??
    (type === 'shape' ? 380 : type === 'null' ? 100 : type === 'text' ? 220 : comp.height);

  const defaultNames: Record<LayerType, string> = {
    solid: 'Solid Layer',
    shape: 'Shape Layer',
    text: options?.text || 'Text Layer',
    image: 'Image Layer',
    video: 'Video Layer',
    audio: 'Audio Track',
    null: 'Null Object',
    adjustment: 'Adjustment Layer',
    camera: 'Camera 1 (2.5D)',
    precomp: 'Pre-comp',
  };

  const layer: Layer = {
    id: createId('layer'),
    name: name ?? defaultNames[type],
    type,
    labelColor: LAYER_LABEL_DEFAULTS[type],
    visible: type !== 'audio',
    audioEnabled: type === 'audio' || type === 'video',
    solo: false,
    locked: false,
    shy: false,
    is3D: false,
    parentId: null,
    blendMode: 'normal',
    trackMatteType: 'none',
    trackMatteLayerId: null,
    startTime: 0,
    inPoint: 0,
    outPoint: comp.duration,
    width: w,
    height: h,
    solidColor: options?.solidColor ?? (type === 'solid' ? '#2c2c54' : undefined),
    assetId: options?.assetId,
    compId: options?.compId,
    transform: createDefaultTransform(comp.width, comp.height, w, h),
    masks: [],
    effects: [],
    markers: [],
    expandedGroups: ['transform'],
  };

  if (type === 'shape') {
    layer.shapeContents = createDefaultShapeContents(options?.shapeType ?? 'rectangle', w, h);
  } else if (type === 'text') {
    layer.textContents = createDefaultTextContents(options?.text ?? 'MOTIONFORGE');
  } else if (type === 'camera') {
    layer.cameraOptions = {
      zoom: createProperty<number>('Zoom', 1200, { min: 200, max: 5000, step: 10, unit: 'px' }),
      pointOfInterest: createProperty<Vec2>('Point of Interest', [comp.width / 2, comp.height / 2], {
        step: 1,
        unit: 'px',
      }),
      depthOfField: false,
      focusDistance: createProperty<number>('Focus Distance', 1200, { min: 100, max: 5000, step: 10, unit: 'px' }),
      aperture: createProperty<number>('Aperture', 25, { min: 0, max: 200, step: 1, unit: 'px' }),
    };
  }

  return layer;
}

export function createDefaultComposition(params?: {
  name?: string;
  width?: number;
  height?: number;
  fps?: number;
  duration?: number;
  backgroundColor?: string;
}): Composition {
  const duration = params?.duration ?? 6;
  return {
    id: createId('comp'),
    name: params?.name ?? 'Main Comp',
    width: params?.width ?? 1920,
    height: params?.height ?? 1080,
    fps: params?.fps ?? 30,
    duration,
    backgroundColor: params?.backgroundColor ?? '#0d0d12',
    workAreaStart: 0,
    workAreaEnd: duration,
    hideShyLayers: false,
    motionBlur: true,
    layers: [],
    markers: [],
    guides: [],
  };
}
