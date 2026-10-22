export type Vec2 = [number, number];
export type Vec3 = [number, number, number];
export type ColorRGBA = [number, number, number, number]; // 0..1

export type KeyframeInterpolation = 'linear' | 'bezier' | 'hold';

export interface BezierHandle {
  /** Normalized time offset (0..1) */
  x: number;
  /** Normalized value influence (-2..2) */
  y: number;
}

export interface Keyframe<T = number | Vec2 | string> {
  id: string;
  time: number; // seconds in composition time
  value: T;
  interpolation: KeyframeInterpolation;
  inTangent: BezierHandle;
  outTangent: BezierHandle;
  /** Spatial tangents for Vec2 Position trajectories */
  spatialInTangent?: Vec2;
  spatialOutTangent?: Vec2;
}

export interface Property<T = number | Vec2 | string> {
  id: string;
  name: string;
  value: T;
  animated: boolean;
  keyframes: Keyframe<T>[];
  expression: string;
  expressionEnabled: boolean;
  expressionError?: string | null;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
}

export type LayerType =
  | 'solid'
  | 'shape'
  | 'text'
  | 'image'
  | 'video'
  | 'audio'
  | 'null'
  | 'adjustment'
  | 'camera'
  | 'precomp';

export type BlendMode =
  | 'normal'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'add'
  | 'darken'
  | 'lighten'
  | 'difference'
  | 'color-dodge';

export type TrackMatteType =
  | 'none'
  | 'alpha'
  | 'alpha-inverted'
  | 'luma'
  | 'luma-inverted';

export type LabelColor =
  | 'ice'
  | 'denim'
  | 'steel'
  | 'mint'
  | 'lavender'
  | 'blush'
  | 'sand'
  | 'coral';

export interface TransformGroup {
  anchorPoint: Property<Vec2>;
  position: Property<Vec2>;
  scale: Property<Vec2>;
  scaleConstrain: boolean;
  rotation: Property<number>;
  opacity: Property<number>;
  skew: Property<number>;
  skewAxis: Property<number>;
}

export type ShapeGeometryType = 'rectangle' | 'ellipse' | 'polygon' | 'star' | 'path';

export interface BezierVertex {
  x: number;
  y: number;
  inX: number; // relative to x
  inY: number; // relative to y
  outX: number; // relative to x
  outY: number; // relative to y
}

export interface ShapeContents {
  shapeType: ShapeGeometryType;
  size: Property<Vec2>;
  cornerRadius: Property<number>;
  points: Property<number>;
  innerRadius: Property<number>;
  fillEnabled: boolean;
  fillColor: Property<string>;
  fillOpacity: Property<number>;
  strokeEnabled: boolean;
  strokeColor: Property<string>;
  strokeWidth: Property<number>;
  strokeDash: Property<number>;
  strokeDashGap: Property<number>;
  strokeDashOffset: Property<number>;
  lineCap: 'butt' | 'round' | 'square';
  lineJoin: 'miter' | 'round' | 'bevel';
  trimStart: Property<number>;
  trimEnd: Property<number>;
  trimOffset: Property<number>;
  vertices: BezierVertex[];
  closed: boolean;
}

export interface TextAnimator {
  enabled: boolean;
  rangeStart: Property<number>; // 0..100%
  rangeEnd: Property<number>; // 0..100%
  rangeOffset: Property<number>; // -100..100%
  shape: 'square' | 'ramp-up' | 'ramp-down' | 'smooth';
  position: Property<Vec2>;
  scale: Property<Vec2>;
  rotation: Property<number>;
  opacity: Property<number>;
  tracking: Property<number>;
}

export interface TextContents {
  text: string;
  fontFamily: string;
  fontWeight: '400' | '500' | '600' | '700' | '800';
  fontStyle: 'normal' | 'italic';
  fontSize: Property<number>;
  fillColor: Property<string>;
  strokeEnabled: boolean;
  strokeColor: Property<string>;
  strokeWidth: Property<number>;
  tracking: Property<number>;
  lineHeight: Property<number>;
  textAlign: 'left' | 'center' | 'right';
  animator: TextAnimator;
}

export interface CameraOptions {
  zoom: Property<number>;
  pointOfInterest: Property<Vec2>;
  depthOfField: boolean;
  focusDistance: Property<number>;
  aperture: Property<number>;
}

export type MaskMode = 'add' | 'subtract' | 'intersect';
export type MaskShapeType = 'rectangle' | 'ellipse' | 'path';

export interface Mask {
  id: string;
  name: string;
  enabled: boolean;
  inverted: boolean;
  mode: MaskMode;
  shapeType: MaskShapeType;
  rect: { x: number; y: number; width: number; height: number };
  vertices: BezierVertex[];
  closed: boolean;
  feather: Property<number>;
  opacity: Property<number>;
  expansion: Property<number>;
}

export type EffectType =
  | 'gaussian-blur'
  | 'directional-blur'
  | 'glow'
  | 'drop-shadow'
  | 'brightness-contrast'
  | 'hue-saturation'
  | 'curves'
  | 'fill'
  | 'tint'
  | 'gradient-ramp'
  | 'noise'
  | 'fractal-noise'
  | 'chromatic-aberration'
  | 'wave-warp'
  | 'turbulent-displace'
  | 'vignette';

export interface EffectParamDefinition {
  key: string;
  name: string;
  type: 'number' | 'color' | 'vec2' | 'boolean';
  defaultValue: number | string | Vec2;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
}

export interface EffectInstance {
  id: string;
  type: EffectType;
  name: string;
  category: string;
  enabled: boolean;
  params: Record<string, Property<number | string | Vec2>>;
}

export interface Marker {
  id: string;
  time: number;
  label: string;
  color: string;
}

export interface Layer {
  id: string;
  name: string;
  type: LayerType;
  labelColor: LabelColor;
  visible: boolean;
  audioEnabled: boolean;
  solo: boolean;
  locked: boolean;
  shy: boolean;
  is3D: boolean;
  parentId: string | null;
  blendMode: BlendMode;
  trackMatteType: TrackMatteType;
  trackMatteLayerId: string | null;
  /** Time offset of layer's frame 0 in composition seconds */
  startTime: number;
  /** Visible start time in composition seconds */
  inPoint: number;
  /** Visible end time in composition seconds */
  outPoint: number;
  width: number;
  height: number;
  solidColor?: string;
  assetId?: string;
  compId?: string; // for 'precomp' layers
  transform: TransformGroup;
  shapeContents?: ShapeContents;
  textContents?: TextContents;
  cameraOptions?: CameraOptions;
  masks: Mask[];
  effects: EffectInstance[];
  markers: Marker[];
  /** UI state: expanded groups in timeline */
  expandedGroups?: string[];
}

export interface Composition {
  id: string;
  name: string;
  width: number;
  height: number;
  fps: number;
  duration: number; // seconds
  backgroundColor: string;
  workAreaStart: number;
  workAreaEnd: number;
  hideShyLayers: boolean;
  motionBlur: boolean;
  layers: Layer[];
  markers: Marker[];
  guides: { id: string; orientation: 'horizontal' | 'vertical'; position: number }[];
  audioTrackAnalysis?: {
    bpm: number;
    beats: Array<{ time: number; frame: number; isDownbeat: boolean; strength: number; frequencyBand?: string }>;
    sections: Array<{ type: 'intro' | 'buildup' | 'drop' | 'break' | 'climax' | 'outro'; startTime: number; endTime: number; avgEnergy: number }>;
    energyCurve?: number[]; // normalized 0..1 per frame or sample
    accentMap?: {
      bpm: number;
      patternType: string;
      accents: Array<{
        id: string;
        time: number;
        frame: number;
        strength: 'strong' | 'medium' | 'weak';
        score: number;
        band?: string;
      }>;
    };
  };
}

export type AssetType = 'image' | 'video' | 'audio';

export interface SceneClip {
  id: string;
  assetId: string;
  sceneIndex: number;
  name: string;
  inPoint: number; // seconds in source asset
  outPoint: number; // seconds in source asset
  duration: number; // seconds
  thumbnail?: string; // base64/dataURL preview image
  // Material analysis metadata & junk controls
  motionIntensity?: number;
  motionDirection?: 'left' | 'right' | 'up' | 'down' | 'in' | 'out' | 'static';
  shotScale?: 'extreme-close' | 'close' | 'medium' | 'wide';
  dominantColor?: string;
  isJunk?: boolean;
  junkReason?: string;
  manualOverrideJunk?: boolean; // User manual toggle: "мусор / не мусор"
  tags?: string[];
}

export interface MediaAsset {
  id: string;
  name: string;
  type: AssetType;
  mimeType: string;
  url: string; // Data URL or Object URL
  width?: number;
  height?: number;
  duration?: number;
  sizeBytes?: number;
  waveform?: number[]; // normalized 0..1 peak samples for timeline audio visualization
  scenes?: SceneClip[];
  sourceIn?: number;
  sourceOut?: number;
}

export interface Project {
  id: string;
  name: string;
  version: string;
  createdAt: string;
  updatedAt: string;
  activeCompId: string;
  compositions: Composition[];
  assets: MediaAsset[];
}

export type ToolType =
  | 'select'
  | 'hand'
  | 'zoom'
  | 'rotate'
  | 'anchor'
  | 'shape'
  | 'pen'
  | 'text'
  | 'razor'
  | 'slip';

export type PreviewResolution = 'full' | 'half' | 'quarter';

export interface SelectedKeyframeRef {
  layerId: string;
  propertyPath: string;
  keyframeId: string;
}

export interface ClipboardKeyframe {
  propertyPath: string;
  relativeTime: number;
  value: number | Vec2 | string;
  interpolation: KeyframeInterpolation;
  inTangent: BezierHandle;
  outTangent: BezierHandle;
}
