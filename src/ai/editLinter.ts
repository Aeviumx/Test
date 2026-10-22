import {
  EditPlan,
  EditSegment,
  EditSection,
} from './editPlanSchema';
import { VideoSceneAnalysis } from './videoAnalysis';
import { SceneCatalog } from './sceneCatalog';
import { EDIT_PRINCIPLES, DYNAMIC_ARC_RULES } from './editorKnowledge';

export interface LinterIssue {
  id: string;
  code: string;
  category: 'sync' | 'flow' | 'dynamics' | 'impacts' | 'quality';
  severity: 'error' | 'warning' | 'info';
  message: string;
  timestamp?: number;
  segmentId?: string;
  sectionId?: string;
  fixable: boolean;
}

export interface LinterCategoryScores {
  sync: number;     // 0..25
  flow: number;     // 0..20
  dynamics: number; // 0..20
  impacts: number;  // 0..15
  quality: number;  // 0..20
}

export interface LinterReport {
  overallScore: number; // 0..100
  passStatus: 'pass' | 'warn' | 'fail';
  categoryScores: LinterCategoryScores;
  issues: LinterIssue[];
  autoFixAvailable: boolean;
}

export interface BeatGridReference {
  bpm: number;
  fps: number;
  beats: Array<{ index: number; time: number; frame: number }>;
}

export class EditLinter {
  /**
   * Evaluates an EditPlan against pro anime editor standards
   */
  public static lint(
    plan: EditPlan,
    beatGrid: BeatGridReference,
    catalog: SceneCatalog | Map<string, VideoSceneAnalysis>
  ): LinterReport {
    const issues: LinterIssue[] = [];
    const catMap = catalog instanceof SceneCatalog
      ? new Map(catalog.getAllScenes().map((s) => [s.id, s]))
      : catalog;

    let syncScore = 25;
    let flowScore = 20;
    let dynamicsScore = 20;
    let impactsScore = 15;
    let qualityScore = 20;

    let totalCuts = 0;
    let hardCuts = 0;
    let prevSegment: EditSegment | null = null;
    let consecutiveSameFraming = 0;
    let consecutiveImpacts = 0;

    const fps = plan.fps;

    for (const section of plan.sections) {
      const sectionRule = DYNAMIC_ARC_RULES[section.type] || DYNAMIC_ARC_RULES.buildup;

      for (let sIdx = 0; sIdx < section.segments.length; sIdx++) {
        const segment = section.segments[sIdx];
        totalCuts++;
        if (segment.cutIn === 'hard') hardCuts++;

        const targetBeatTime = (segment.targetBeat * 60) / plan.bpm;
        const segmentTime = targetBeatTime + (segment.frameOffset / fps);

        // 1. SYNC CHECKS
        // Offset check: must not exceed tolerance
        if (Math.abs(segment.frameOffset) > EDIT_PRINCIPLES.sync.maxFrameDeviation + 1) {
          syncScore = Math.max(0, syncScore - 3);
          issues.push({
            id: `sync_off_${segment.id}`,
            code: 'SYNC_DEVIATION',
            category: 'sync',
            severity: 'warning',
            message: `Segment '${segment.id}' is offset by ${segment.frameOffset} frames from beat transient.`,
            timestamp: segmentTime,
            segmentId: segment.id,
            fixable: true,
          });
        }

        const durationFrames = Math.round((segment.durationBeats * 60 * fps) / plan.bpm);
        if (durationFrames < EDIT_PRINCIPLES.sync.minFramesPerClip) {
          syncScore = Math.max(0, syncScore - 5);
          issues.push({
            id: `sync_too_short_${segment.id}`,
            code: 'CLIP_TOO_SHORT',
            category: 'sync',
            severity: 'error',
            message: `Clip is only ${durationFrames} frames (< 6 frames). Will look like a broken frame glitch.`,
            timestamp: segmentTime,
            segmentId: segment.id,
            fixable: true,
          });
        }

        // 2. FLOW CHECKS
        if (prevSegment) {
          // Framing alternation check
          if (prevSegment.framing === segment.framing) {
            consecutiveSameFraming++;
            if (consecutiveSameFraming >= 1) {
              flowScore = Math.max(0, flowScore - 3);
              issues.push({
                id: `flow_framing_${segment.id}`,
                code: 'CONSECUTIVE_SAME_FRAMING',
                category: 'flow',
                severity: 'warning',
                message: `Two consecutive '${segment.framing}' shots back-to-back. Editor flow demands shot scale alternation.`,
                timestamp: segmentTime,
                segmentId: segment.id,
                fixable: true,
              });
            }
          } else {
            consecutiveSameFraming = 0;
          }

          // Duplicate clip check
          if (prevSegment.clipId === segment.clipId) {
            flowScore = Math.max(0, flowScore - 6);
            issues.push({
              id: `flow_dup_${segment.id}`,
              code: 'CONSECUTIVE_DUPLICATE_CLIP',
              category: 'flow',
              severity: 'error',
              message: `Identical clip '${segment.clipId}' repeated immediately without artistic cause.`,
              timestamp: segmentTime,
              segmentId: segment.id,
              fixable: true,
            });
          }

          // Opposing motion flow check
          if (
            prevSegment.motionDirection === 'left' &&
            segment.motionDirection === 'right' &&
            section.type !== 'drop'
          ) {
            flowScore = Math.max(0, flowScore - 2);
            issues.push({
              id: `flow_motion_reversal_${segment.id}`,
              code: 'MOTION_FLOW_DISRUPTION',
              category: 'flow',
              severity: 'info',
              message: `Motion abruptly reverses from 'left' to 'right' outside of a musical drop.`,
              timestamp: segmentTime,
              segmentId: segment.id,
              fixable: true,
            });
          }
        }

        // 3. DYNAMICS & ARC CHECKS
        const scene = catMap.get(segment.clipId);
        const epicness = scene?.visionTags?.epicness ?? segment.epicnessScore ?? 5;

        // Wasted high epicness in intro
        if (section.type === 'intro' && epicness > sectionRule.maxEpicness) {
          dynamicsScore = Math.max(0, dynamicsScore - 4);
          issues.push({
            id: `dyn_waste_intro_${segment.id}`,
            code: 'PREMATURE_CLIMAX_WASTE',
            category: 'dynamics',
            severity: 'warning',
            message: `Epic scene (epicness ${epicness}) wasted in Intro. Top scenes must be saved for the Drop.`,
            timestamp: segmentTime,
            segmentId: segment.id,
            fixable: true,
          });
        }

        // Drop missing high epicness
        if (section.type === 'drop' && epicness < sectionRule.minEpicness) {
          dynamicsScore = Math.max(0, dynamicsScore - 3);
          issues.push({
            id: `dyn_weak_drop_${segment.id}`,
            code: 'WEAK_DROP_SCENE',
            category: 'dynamics',
            severity: 'warning',
            message: `Drop scene has low epicness (${epicness} < 7). The Drop demands peak action.`,
            timestamp: segmentTime,
            segmentId: segment.id,
            fixable: true,
          });
        }

        // 4. IMPACTS & VELOCITY CHECKS
        const hasImpact = segment.impacts && segment.impacts.length > 0;
        if (hasImpact) {
          consecutiveImpacts++;
          if (consecutiveImpacts > 3) {
            impactsScore = Math.max(0, impactsScore - 3);
            issues.push({
              id: `imp_overcrowded_${segment.id}`,
              code: 'IMPACT_OVERCROWDING',
              category: 'impacts',
              severity: 'warning',
              message: `Too many impacts in a row (${consecutiveImpacts}). Overcrowded effects cause visual fatigue.`,
              timestamp: segmentTime,
              segmentId: segment.id,
              fixable: true,
            });
          }

          // Long white flash check
          for (const imp of segment.impacts) {
            if (imp.type === 'flash-white' && imp.durationFrames > 3) {
              impactsScore = Math.max(0, impactsScore - 2);
              issues.push({
                id: `imp_flash_long_${segment.id}`,
                code: 'FLASH_TOO_LONG',
                category: 'impacts',
                severity: 'warning',
                message: `White flash lasts ${imp.durationFrames} frames (> 3 frames). Flashes must be punchy (1-3 frames).`,
                timestamp: segmentTime,
                segmentId: segment.id,
                fixable: true,
              });
            }
          }
        } else {
          consecutiveImpacts = 0;
        }

        // Velocity frame blending check
        if (segment.velocity.profile !== 'constant' && !segment.velocity.frameBlending) {
          impactsScore = Math.max(0, impactsScore - 3);
          issues.push({
            id: `imp_no_blend_${segment.id}`,
            code: 'VELOCITY_NO_FRAME_BLENDING',
            category: 'impacts',
            severity: 'error',
            message: `Velocity slow-motion configured without frame blending. Results in stuttery playback.`,
            timestamp: segmentTime,
            segmentId: segment.id,
            fixable: true,
          });
        }

        // 5. QUALITY & JUNK CHECKS
        if (scene) {
          if (scene.junkFlags.hasHardsub) {
            qualityScore = Math.max(0, qualityScore - 8);
            issues.push({
              id: `qual_sub_${segment.id}`,
              code: 'HARDSUB_DETECTED',
              category: 'quality',
              severity: 'error',
              message: `Scene '${scene.id}' contains hardcoded subtitles. Hardsubs are unacceptable in pro AMVs.`,
              timestamp: segmentTime,
              segmentId: segment.id,
              fixable: true,
            });
          }
          if (scene.junkFlags.hasWatermark) {
            qualityScore = Math.max(0, qualityScore - 6);
            issues.push({
              id: `qual_wm_${segment.id}`,
              code: 'WATERMARK_DETECTED',
              category: 'quality',
              severity: 'error',
              message: `Scene '${scene.id}' contains a watermark or channel logo.`,
              timestamp: segmentTime,
              segmentId: segment.id,
              fixable: true,
            });
          }
          if (scene.junkFlags.isStaticTalkingHead) {
            qualityScore = Math.max(0, qualityScore - 5);
            issues.push({
              id: `qual_static_${segment.id}`,
              code: 'STATIC_TALKING_HEAD',
              category: 'quality',
              severity: 'warning',
              message: `Scene '${scene.id}' is a static talking head with no cinematic movement.`,
              timestamp: segmentTime,
              segmentId: segment.id,
              fixable: true,
            });
          }
        }

        prevSegment = segment;
      }
    }

    // Overall Hard Cut Ratio Check
    const hardCutRatio = totalCuts > 0 ? hardCuts / totalCuts : 1.0;
    if (hardCutRatio < EDIT_PRINCIPLES.flow.minHardCutRatio) {
      flowScore = Math.max(0, flowScore - 4);
      issues.push({
        id: 'flow_too_many_transitions',
        code: 'LOW_HARD_CUT_RATIO',
        category: 'flow',
        severity: 'warning',
        message: `Only ${(hardCutRatio * 100).toFixed(0)}% hard cuts. Pro edits rely on 80-90% hard cuts, saving transitions for section turns.`,
        fixable: true,
      });
    }

    const overallScore = Math.round(
      syncScore + flowScore + dynamicsScore + impactsScore + qualityScore
    );

    let passStatus: 'pass' | 'warn' | 'fail' = 'pass';
    if (overallScore < 70) passStatus = 'fail';
    else if (overallScore < 85) passStatus = 'warn';

    return {
      overallScore,
      passStatus,
      categoryScores: {
        sync: syncScore,
        flow: flowScore,
        dynamics: dynamicsScore,
        impacts: impactsScore,
        quality: qualityScore,
      },
      issues,
      autoFixAvailable: issues.some((i) => i.fixable),
    };
  }

  /**
   * Deterministic Auto-Fixer:
   * Programmatically resolves common linter violations:
   * - Snaps offset cuts to 0 frameOffset
   * - Enables frame blending and motion blur on all velocity ramps
   * - Shortens excessive white flashes to 2 frames
   * - Eliminates duplicate back-to-back clips by swapping with catalog candidates
   * - Replaces hardsubbed/watermarked clips with clean catalog scenes
   */
  public static autoFix(
    plan: EditPlan,
    catalog: SceneCatalog | Map<string, VideoSceneAnalysis>
  ): { fixedPlan: EditPlan; fixesApplied: string[] } {
    const fixedPlan = JSON.parse(JSON.stringify(plan)) as EditPlan;
    const fixesApplied: string[] = [];

    const cleanScenes = catalog instanceof SceneCatalog
      ? catalog.query({ excludeJunk: true })
      : Array.from(catalog.values()).filter(
          (s) => !s.junkFlags.hasHardsub && !s.junkFlags.hasWatermark && !s.junkFlags.isStaticTalkingHead
        );

    let prevSegment: EditSegment | null = null;
    let consecutiveImpactCount = 0;

    for (const section of fixedPlan.sections) {
      for (let i = 0; i < section.segments.length; i++) {
        const seg = section.segments[i];

        // 1. Fix excessive frameOffset
        if (Math.abs(seg.frameOffset) > 2) {
          seg.frameOffset = 0;
          fixesApplied.push(`Snapped frameOffset on '${seg.id}' to 0`);
        }

        // 2. Fix velocity frame blending & motion blur
        if (seg.velocity.profile !== 'constant') {
          if (!seg.velocity.frameBlending) {
            seg.velocity.frameBlending = true;
            fixesApplied.push(`Enabled frameBlending on velocity segment '${seg.id}'`);
          }
          if (!seg.velocity.motionBlur) {
            seg.velocity.motionBlur = true;
            fixesApplied.push(`Enabled motionBlur on velocity segment '${seg.id}'`);
          }
        }

        // 3. Fix long white flash
        if (seg.impacts) {
          for (const imp of seg.impacts) {
            if (imp.type === 'flash-white' && imp.durationFrames > 3) {
              imp.durationFrames = 2;
              fixesApplied.push(`Shortened white flash duration on '${seg.id}' to 2 frames`);
            }
          }
        }

        // 4. Fix consecutive duplicate clips
        if (prevSegment && prevSegment.clipId === seg.clipId && cleanScenes.length > 1) {
          const alternate = cleanScenes.find((s) => s.id !== seg.clipId);
          if (alternate) {
            seg.clipId = alternate.id;
            seg.framing = alternate.shotScale || (prevSegment.framing === 'close' ? 'wide' : 'close');
            fixesApplied.push(`Replaced duplicate clip on '${seg.id}' with clean scene '${alternate.id}'`);
          }
        }

        // 5. Fix impact overcrowding
        if (seg.impacts && seg.impacts.length > 0) {
          consecutiveImpactCount++;
          if (consecutiveImpactCount > 2) {
            // Keep only subtle zoom punch, remove loud shake/flash
            seg.impacts = seg.impacts.filter((imp) => imp.type === 'zoom-punch');
            fixesApplied.push(`Reduced overcrowded impacts on '${seg.id}'`);
          }
        } else {
          consecutiveImpactCount = 0;
        }

        prevSegment = seg;
      }
    }

    return { fixedPlan, fixesApplied };
  }
}
