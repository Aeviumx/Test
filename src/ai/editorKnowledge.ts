/**
 * Editor Knowledge Base (База знаний эдитора)
 * Structured editing rules and principles used by BOTH the LLM (in prompt generation)
 * and the deterministic Edit Linter (in programmatic validation & auto-fix).
 */

export interface DynamicArcRule {
  section: 'intro' | 'buildup' | 'drop' | 'break' | 'climax' | 'outro';
  minClipDurationSec: number;
  maxClipDurationSec: number;
  idealClipBeats: number[];
  targetEnergyRange: [number, number];
  allowedCuts: string[];
  minEpicness: number;
  maxEpicness: number;
  impactDensityMax: number; // max impacts per beat
}

export const DYNAMIC_ARC_RULES: Record<string, DynamicArcRule> = {
  intro: {
    section: 'intro',
    minClipDurationSec: 1.2,
    maxClipDurationSec: 3.5,
    idealClipBeats: [4, 8],
    targetEnergyRange: [0.15, 0.45],
    allowedCuts: ['hard', 'dissolve', 'zoom-in'],
    minEpicness: 2,
    maxEpicness: 6, // Never waste epicness 8-10 in intro
    impactDensityMax: 0.1,
  },
  buildup: {
    section: 'buildup',
    minClipDurationSec: 0.4,
    maxClipDurationSec: 1.5,
    idealClipBeats: [1, 2],
    targetEnergyRange: [0.45, 0.75],
    allowedCuts: ['hard', 'whip-left', 'whip-right', 'zoom-in'],
    minEpicness: 4,
    maxEpicness: 7,
    impactDensityMax: 0.35,
  },
  drop: {
    section: 'drop',
    minClipDurationSec: 0.20,
    maxClipDurationSec: 1.0,
    idealClipBeats: [0.5, 1],
    targetEnergyRange: [0.75, 1.0],
    allowedCuts: ['hard', 'whip-left', 'whip-right', 'zoom-in', 'glitch', 'flash-white'],
    minEpicness: 7, // Reserve top scenes (8-10) for drop
    maxEpicness: 10,
    impactDensityMax: 1.0,
  },
  climax: {
    section: 'climax',
    minClipDurationSec: 0.15,
    maxClipDurationSec: 0.75,
    idealClipBeats: [0.25, 0.5, 1],
    targetEnergyRange: [0.85, 1.0],
    allowedCuts: ['hard', 'whip-left', 'whip-right', 'zoom-in', 'glitch', 'flash-white'],
    minEpicness: 8,
    maxEpicness: 10,
    impactDensityMax: 1.5,
  },
  break: {
    section: 'break',
    minClipDurationSec: 1.0,
    maxClipDurationSec: 2.5,
    idealClipBeats: [2, 4],
    targetEnergyRange: [0.2, 0.5],
    allowedCuts: ['hard', 'dissolve'],
    minEpicness: 3,
    maxEpicness: 6,
    impactDensityMax: 0.15,
  },
  outro: {
    section: 'outro',
    minClipDurationSec: 1.5,
    maxClipDurationSec: 4.0,
    idealClipBeats: [4, 8],
    targetEnergyRange: [0.1, 0.4],
    allowedCuts: ['hard', 'dissolve'],
    minEpicness: 2,
    maxEpicness: 7,
    impactDensityMax: 0.1,
  },
};

export const EDIT_PRINCIPLES = {
  sync: {
    maxFrameDeviation: 1, // Cuts must land on exact beat transient (tolerance ±1 frame)
    minFramesPerClip: 6,  // At 60 FPS, clips shorter than 6 frames (0.1s) look like glitches
  },
  flow: {
    minHardCutRatio: 0.80, // 80-90% of cuts must be hard cuts; transitions only on section changes
    prohibitSameFramingConsecutive: true, // Never place two identical shot scales back-to-back
    prohibitSameSceneConsecutive: true,   // No direct duplicate clips
    motionContinuityThreshold: 0.70,     // Motion direction should flow naturally or reverse on strong beat
  },
  velocity: {
    bezierHandles: [0.25, 0.1, 0.25, 1.0], // Eased velocity curve
    decelerationDropMin: 0.20,
    decelerationDropMax: 0.45,
    accelerationMin: 2.0,
    accelerationMax: 4.0,
    requireFrameBlending: true, // Slow-motion clips must use frame blending / optical flow
  },
  impacts: {
    punchScaleMin: 105,
    punchScaleMax: 118,
    flashMaxDurationFrames: 3,
    maxFlashPerTwoMeasures: 1, // Flashes no more than once per 2 measures to avoid epilepsy / mud
    shakeDampingRatio: 0.85,
    requireMotionBlur: true,
  },
  quality: {
    forbidLetterbox: true,
    forbidHardsubs: true,
    forbidWatermarks: true,
    forbidStaticTalkingHeads: true,
    requireUnifiedColorGrade: true,
  },
  viral: {
    hookWindowSeconds: 1.0, // First 1s must contain instant visual grab (punch, card entrance, flash)
    seamlessLooping: true,  // End clip matches start motion/frame for infinite replay loops
    tiktokSafeZones: {
      topPx: 180,           // Avoid search / live header
      bottomPx: 340,        // Avoid caption, author handle, and audio ticker
      rightPx: 120,         // Avoid like / comment / share sidebar buttons
      leftPx: 60,           // Margin
    },
  },
};

/**
 * Builds the complete Editor Knowledge System Prompt for Gemini LLM
 */
export function buildEditorKnowledgeSystemPrompt(): string {
  return `You are Kōri AI — a master anime editor (AMV, flow edits, velocity edits) with the standards of top After Effects editors.
You operate strictly on MUSICAL AND VISUAL CONCEPTS, NEVER on arbitrary millisecond numbers.

# CORE EDITING RULES & PHILOSOPHY:

1. THE DYNAMIC ARC:
   - Intro (calm, wide/medium takes 1.5-3.5s, epicness 3-6, soft cuts, low energy 0.2-0.4).
   - Buildup (faster cuts 0.5-1.5s, rising motion, directional whip cuts, energy 0.5-0.7).
   - Drop (THE PEAK: cuts 0.25-1s on EVERY beat, epicness 8-10, velocity ramps 3x -> 0.3x -> 1.5x, zoom punches 110-115%, shakes, RGB splits).
   - Break & Outro (breathe, slow down, clean finish).
   - NEVER waste epicness 8-10 clips in the intro! Reserve them for the Drop.

2. CUTTING & FLOW RULES:
   - 80-90% of cuts MUST be hard cuts ('hard'). Transitions ('whip-left', 'zoom-in', 'glitch') are only for section shifts or drop hits.
   - Cut on Action: set 'alignMotionPeak: true' so the internal motion climax (sword slice, eye open, jump) hits the beat transient.
   - Alternation of Framing: ALWAYS alternate shot scales (e.g. wide -> close -> medium -> extreme-close). NEVER place two identical shot scales in a row.
   - Motion Flow: Match the motion direction of consecutive shots ('left' -> 'left', 'in' -> 'in') or create a hard counter-cut on drop downbeats.

3. VELOCITY RAMPS:
   - Use 'speed-up-slow-down': accelerate (2-4x) -> sudden slow-down (0.2-0.4x) exactly on the beat -> accelerate away.
   - Use Bezier ease handles [0.25, 0.1, 0.25, 1.0].
   - ALWAYS enable frameBlending and motionBlur.

4. IMPACT ACCENTS:
   - Impacts (zoom punch, shake, white flash, RGB split) belong on Kicks and Snares, NOT on every beat.
   - White flashes must be brief (1-3 frames max).
   - Flashes should not exceed 1 per 2 musical measures (except rapid strobes in the climax).

5. VISUAL INTEGRITY:
   - Zero tolerance for letterboxing (black bars), hardcoded subtitles, watermarks, or static talking heads.
   - Maintain a unified master color grade across the entire edit.

When generating an EditPlan, output strictly valid JSON conforming to EditPlanSchema.`;
}
