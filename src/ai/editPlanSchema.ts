import { z } from 'zod';

/**
 * Supported transition cut types between clips
 */
export const CutTypeSchema = z.enum([
  'hard',
  'whip-left',
  'whip-right',
  'whip-up',
  'whip-down',
  'zoom-in',
  'zoom-out',
  'flash-white',
  'glitch',
  'dissolve',
]);
export type CutType = z.infer<typeof CutTypeSchema>;

/**
 * Shot scale / framing categorization
 */
export const ShotScaleSchema = z.enum([
  'extreme-close', // eyes, mouth, weapon tip (>60% of frame)
  'close',         // face, bust (30-60%)
  'medium',        // waist-up / action pose (40-70% height)
  'wide',          // full body, landscape, establishing (<30%)
]);
export type ShotScale = z.infer<typeof ShotScaleSchema>;

/**
 * Vector direction of predominant motion
 */
export const MotionDirectionSchema = z.enum([
  'left',
  'right',
  'up',
  'down',
  'in',   // zoom in / push-in
  'out',  // zoom out / pull-out
  'static',
]);
export type MotionDirection = z.infer<typeof MotionDirectionSchema>;

/**
 * Musical track section classifications
 */
export const SectionTypeSchema = z.enum([
  'intro',
  'buildup',
  'drop',
  'break',
  'climax',
  'outro',
]);
export type SectionType = z.infer<typeof SectionTypeSchema>;

/**
 * Supported velocity profiles for time remapping
 */
export const VelocityProfileSchema = z.enum([
  'constant',           // 1.0x normal speed
  'speed-up-slow-down', // 2x-4x ramp down to 0.3x on the beat, then accelerates
  'slow-down-drop',     // slow motion into a snap on drop
  'fast-forward',       // 2.5x - 4x burst
  'freeze-frame',       // momentary freeze on dramatic pause
  'custom-bezier',      // custom cubic bezier curve
]);
export type VelocityProfile = z.infer<typeof VelocityProfileSchema>;

/**
 * Velocity curve parameters for a segment
 */
export const VelocityConfigSchema = z.object({
  profile: VelocityProfileSchema.default('constant'),
  speedStart: z.number().min(0.1).max(8.0).default(1.0),
  speedBeatDrop: z.number().min(0.0).max(4.0).default(0.3), // speed exactly at beat hit
  speedEnd: z.number().min(0.1).max(8.0).default(1.0),
  cubicBezier: z.tuple([z.number(), z.number(), z.number(), z.number()]).default([0.25, 0.1, 0.25, 1.0]),
  frameBlending: z.boolean().default(true),
  motionBlur: z.boolean().default(true),
});
export type VelocityConfig = z.infer<typeof VelocityConfigSchema>;

/**
 * Individual impact effect definition
 */
export const ImpactEffectTypeSchema = z.enum([
  'zoom-punch',       // quick punch-in (105-120%) with elastic decay
  'shake-decay',      // directional or directional-random camera shake
  'flash-white',      // 1-3 frame exposure boost / white flash
  'rgb-split',        // chromatic aberration split on transient
  'deep-glow-pulse',  // high-pass bloom flare
  'strobe-fast',      // rapid 1-frame strobe in climax
]);
export type ImpactEffectType = z.infer<typeof ImpactEffectTypeSchema>;

export const ImpactEffectSchema = z.object({
  type: ImpactEffectTypeSchema,
  intensity: z.number().min(0.0).max(1.0).default(0.8), // 0 to 1 strength
  durationFrames: z.number().int().min(1).max(30).default(4), // frames at composition fps
  decayCurve: z.enum(['exponential', 'linear', 'elastic']).default('exponential'),
});
export type ImpactEffect = z.infer<typeof ImpactEffectSchema>;

/**
 * Single segment inside an EditSection
 */
export const EditSegmentSchema = z.object({
  id: z.string(),
  clipId: z.string(), // ID referencing the analyzed scene/video asset
  name: z.string().optional(),
  
  // Semantic musical placement
  targetBeat: z.number().min(0), // Beat index in music analysis grid (e.g. beat #34)
  durationBeats: z.number().min(0.25).max(32), // Length in musical beats (e.g. 1 beat, 0.5 beat)
  
  // Frame-accurate transient offsets (-2 to +2 frames shift for natural human edit feel)
  frameOffset: z.number().int().min(-4).max(4).default(0),
  
  // Motion synchronization
  alignMotionPeak: z.boolean().default(true), // Automatically match peak motion frame to beat
  sourceInPoint: z.number().min(0).optional(), // Manual override in seconds
  
  // Visual semantics
  framing: ShotScaleSchema.default('medium'),
  motionDirection: MotionDirectionSchema.default('static'),
  epicnessScore: z.number().min(0).max(10).default(5),
  
  // Transitions
  cutIn: CutTypeSchema.default('hard'),
  cutOut: CutTypeSchema.default('hard'),
  
  // Speed and impacts
  velocity: VelocityConfigSchema.default({
    profile: 'constant',
    speedStart: 1.0,
    speedBeatDrop: 0.3,
    speedEnd: 1.0,
    cubicBezier: [0.25, 0.1, 0.25, 1.0],
    frameBlending: true,
    motionBlur: true,
  }),
  impacts: z.array(ImpactEffectSchema).default([]),
});
export type EditSegment = z.infer<typeof EditSegmentSchema>;

/**
 * Group of segments representing a musical movement (Intro, Build-up, Drop, etc.)
 */
export const EditSectionSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: SectionTypeSchema,
  startBeat: z.number().min(0),
  endBeat: z.number().min(0),
  energy: z.number().min(0).max(1).default(0.5), // Target intensity 0.0 to 1.0
  description: z.string().optional(),
  segments: z.array(EditSegmentSchema).min(1),
});
export type EditSection = z.infer<typeof EditSectionSchema>;

/**
 * Overall style presets
 */
export const EditStylePresetSchema = z.enum([
  'hype-amv',        // rapid cuts, velocity, punch-ins, high dynamic range
  'flow-edit',       // motion matching cuts, continuous camera whip/pan flow
  'tiktok-velocity', // heavy Twixtor speed ramps, deep glow, 60fps frame blending
  'sad-emotional',   // longer takes, dissolves, gentle grain, blue/cold grading
  'dark-cold',       // high contrast, desaturated, red/cyan split, snappy cuts
  'glitch-cyber',    // chromatic aberration, scanlines, digital noise, sync on snares
  'manga-panels',    // split screens, comic letterbox, whip transitions, ink accents
]);
export type EditStylePreset = z.infer<typeof EditStylePresetSchema>;

/**
 * Master Color Grade and Post-Processing configuration
 */
export const GlobalColorGradeSchema = z.object({
  vignette: z.number().min(0).max(100).default(45),
  deepGlow: z.number().min(0).max(100).default(35),
  contrast: z.number().min(-100).max(100).default(15),
  saturation: z.number().min(-100).max(100).default(20),
  chromaticAberration: z.number().min(0).max(50).default(6),
  filmGrain: z.number().min(0).max(100).default(10),
  lutName: z.string().default('Anime_Vivid_Punch'),
});
export type GlobalColorGrade = z.infer<typeof GlobalColorGradeSchema>;

/**
 * Complete EditPlan validated by Zod
 */
export const EditPlanSchema = z.object({
  id: z.string(),
  version: z.literal('1.0.0').default('1.0.0'),
  title: z.string(),
  style: EditStylePresetSchema.default('hype-amv'),
  
  // Composition specifications
  width: z.number().int().min(480).max(3840).default(1080),
  height: z.number().int().min(480).max(3840).default(1080), // 1080x1080 or 1080x1920
  fps: z.number().int().min(24).max(120).default(60),
  
  // Audio reference
  audioAssetId: z.string(),
  bpm: z.number().min(40).max(240),
  totalDurationSeconds: z.number().min(1),
  
  // Musical flow sections
  sections: z.array(EditSectionSchema).min(1),
  
  // Visual Master
  globalColorGrade: GlobalColorGradeSchema.default({
    vignette: 45,
    deepGlow: 35,
    contrast: 15,
    saturation: 20,
    chromaticAberration: 6,
    filmGrain: 10,
    lutName: 'Anime_Vivid_Punch',
  }),
});
export type EditPlan = z.infer<typeof EditPlanSchema>;
