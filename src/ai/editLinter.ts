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

export interface AccentTransientMatch {
  accentIndex: number;
  accentTime: number;
  nearestTransientTime: number;
  diffMs: number;
  diffFrames: number;
  isWithinTolerance: boolean;
}

export interface TransientSyncAuditReport {
  passed: boolean;
  maxToleranceFrames: number;
  maxDiffMs: number;
  meanDiffMs: number;
  totalAccents: number;
  violationsCount: number;
  matches: AccentTransientMatch[];
  formattedReport: string;
}

export function auditAccentTransientSync(
  accentTimes: number[],
  realTransients: number[],
  fps: number = 60,
  maxToleranceFrames: number = 1
): TransientSyncAuditReport {
  const frameDurationMs = 1000 / fps;
  const maxAllowedMs = maxToleranceFrames * frameDurationMs;
  let maxDiffMs = 0;
  let totalDiffMs = 0;
  const matches: AccentTransientMatch[] = [];

  for (let i = 0; i < accentTimes.length; i++) {
    const aTime = accentTimes[i];
    let bestDist = Infinity;
    let bestTrans = aTime;

    for (const t of realTransients) {
      const dist = Math.abs(aTime - t);
      if (dist < bestDist) {
        bestDist = dist;
        bestTrans = t;
      }
    }

    const diffMs = bestDist * 1000;
    const diffFrames = diffMs / frameDurationMs;
    const isWithinTolerance = diffFrames <= (maxToleranceFrames + 0.05);

    if (diffMs > maxDiffMs) maxDiffMs = diffMs;
    totalDiffMs += diffMs;

    matches.push({
      accentIndex: i,
      accentTime: aTime,
      nearestTransientTime: bestTrans,
      diffMs: Number(diffMs.toFixed(2)),
      diffFrames: Number(diffFrames.toFixed(2)),
      isWithinTolerance,
    });
  }

  const meanDiffMs = matches.length > 0 ? totalDiffMs / matches.length : 0;
  const violations = matches.filter((m) => !m.isWithinTolerance);
  const passed = violations.length === 0;

  const lines: string[] = [
    `=== Transient Sync Audit Report (${fps} FPS, Tolerance: ±${maxToleranceFrames} frame / ${maxAllowedMs.toFixed(1)} ms) ===`,
    `Total Accents: ${accentTimes.length} | Violations: ${violations.length} | Max Diff: ${maxDiffMs.toFixed(2)} ms | Mean Diff: ${meanDiffMs.toFixed(2)} ms | Status: ${passed ? 'PASSED' : 'FAILED'}`,
    `---------------------------------------------------------------------------------------------------------`,
    `Accent # | Accent Time (s) | Nearest Transient (s) | Diff (ms) | Diff (frames) | Status`,
    `---------------------------------------------------------------------------------------------------------`,
  ];

  for (const m of matches) {
    const status = m.isWithinTolerance ? 'OK' : 'MISALIGNED';
    lines.push(
      `#${String(m.accentIndex).padStart(2)}      | ${m.accentTime.toFixed(3).padStart(15)} | ${m.nearestTransientTime.toFixed(3).padStart(21)} | ${m.diffMs.toFixed(2).padStart(9)} | ${m.diffFrames.toFixed(2).padStart(13)} | ${status}`
    );
  }

  return {
    passed,
    maxToleranceFrames,
    maxDiffMs: Number(maxDiffMs.toFixed(2)),
    meanDiffMs: Number(meanDiffMs.toFixed(2)),
    totalAccents: accentTimes.length,
    violationsCount: violations.length,
    matches,
    formattedReport: lines.join('\n'),
  };
}

export interface OverscanBorderAuditReport {
  passed: boolean;
  totalFramesAudited: number;
  overscanPercent: number;
  violationsCount: number;
  violations: Array<{
    frameIndex: number;
    time: number;
    edge: 'left' | 'right' | 'top' | 'bottom';
    gapPx: number;
  }>;
  formattedReport: string;
}

export function auditOverscanBorders(
  transforms: Array<{
    frameIndex: number;
    time: number;
    scale: number;
    panX: number;
    panY: number;
    shakeX?: number;
    shakeY?: number;
  }>,
  compWidth: number = 1080,
  compHeight: number = 1920,
  overscanFactor: number = 1.08
): OverscanBorderAuditReport {
  const violations: Array<{
    frameIndex: number;
    time: number;
    edge: 'left' | 'right' | 'top' | 'bottom';
    gapPx: number;
  }> = [];

  for (const tr of transforms) {
    const totalScale = tr.scale * overscanFactor;
    const layerW = compWidth * totalScale;
    const layerH = compHeight * totalScale;

    const totalPanX = tr.panX + (tr.shakeX ?? 0);
    const totalPanY = tr.panY + (tr.shakeY ?? 0);

    const leftBoundary = (layerW - compWidth) / 2 + totalPanX;
    const rightBoundary = (layerW - compWidth) / 2 - totalPanX;
    const topBoundary = (layerH - compHeight) / 2 + totalPanY;
    const bottomBoundary = (layerH - compHeight) / 2 - totalPanY;

    if (leftBoundary < 0) {
      violations.push({ frameIndex: tr.frameIndex, time: tr.time, edge: 'left', gapPx: Math.abs(leftBoundary) });
    }
    if (rightBoundary < 0) {
      violations.push({ frameIndex: tr.frameIndex, time: tr.time, edge: 'right', gapPx: Math.abs(rightBoundary) });
    }
    if (topBoundary < 0) {
      violations.push({ frameIndex: tr.frameIndex, time: tr.time, edge: 'top', gapPx: Math.abs(topBoundary) });
    }
    if (bottomBoundary < 0) {
      violations.push({ frameIndex: tr.frameIndex, time: tr.time, edge: 'bottom', gapPx: Math.abs(bottomBoundary) });
    }
  }

  const passed = violations.length === 0;
  const lines: string[] = [
    `=== Overscan & Border Clamping Audit Report (Viewport: ${compWidth}x${compHeight}, Overscan: +${((overscanFactor - 1) * 100).toFixed(1)}%) ===`,
    `Total Frames: ${transforms.length} | Exposed Border Violations: ${violations.length} | Status: ${passed ? 'PASSED (Zero Empty Edges)' : 'FAILED'}`,
  ];

  if (!passed) {
    for (const v of violations.slice(0, 5)) {
      lines.push(`  Frame ${v.frameIndex} (t = ${v.time.toFixed(3)}s): ${v.edge} edge exposed by ${v.gapPx.toFixed(1)}px`);
    }
  }

  return {
    passed,
    totalFramesAudited: transforms.length,
    overscanPercent: Number(((overscanFactor - 1) * 100).toFixed(1)),
    violationsCount: violations.length,
    violations,
    formattedReport: lines.join('\n'),
  };
}

/**
 * Linter Rule: Face-in-Frame on Camera Push-In
 * Ensures that if a face is present at the start of a shot, it remains fully inside the frame
 * (faceTop >= 0 and faceBottom <= compHeight) across EVERY frame of the camera push-in.
 */
export function auditFaceInFrameOnPushIn(
  frames: Array<{ frameIndex: number; time: number; faceTop: number; faceBottom: number }>,
  compHeight: number = 1920
): {
  passed: boolean;
  violations: Array<{ frameIndex: number; time: number; faceTop: number; faceBottom: number }>;
  formattedReport: string;
} {
  const violations: Array<{ frameIndex: number; time: number; faceTop: number; faceBottom: number }> = [];

  for (const f of frames) {
    if (f.faceTop < 0 || f.faceBottom > compHeight) {
      violations.push(f);
    }
  }

  const passed = violations.length === 0;
  return {
    passed,
    violations,
    formattedReport: passed
      ? `PASSED: Face remained fully inside frame bounds across all ${frames.length} push-in frames.`
      : `FAILED: Face drifted outside frame bounds on ${violations.length} frames (first cutoff at frame ${violations[0]?.frameIndex}).`,
  };
}

export interface BoundingRect {
  id?: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Linter Rule: Zero Text Blocks Intersection
 * Ensures that subtitle/lyric blocks, ornaments, and song signatures never collide or overlap each other.
 */
export function auditTextBlocksIntersection(blocks: BoundingRect[]): {
  passed: boolean;
  intersections: Array<{ blockA: string; blockB: string; overlapArea: number }>;
  formattedReport: string;
} {
  const intersections: Array<{ blockA: string; blockB: string; overlapArea: number }> = [];

  for (let i = 0; i < blocks.length; i++) {
    for (let j = i + 1; j < blocks.length; j++) {
      const a = blocks[i];
      const b = blocks[j];

      const overlapX = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
      const overlapY = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
      const overlapArea = overlapX * overlapY;

      if (overlapArea > 0) {
        intersections.push({
          blockA: a.id || `Block #${i}`,
          blockB: b.id || `Block #${j}`,
          overlapArea,
        });
      }
    }
  }

  const passed = intersections.length === 0;
  return {
    passed,
    intersections,
    formattedReport: passed
      ? `PASSED: All ${blocks.length} typography blocks have zero intersection.`
      : `FAILED: Found ${intersections.length} colliding text blocks (e.g. ${intersections[0]?.blockA} & ${intersections[0]?.blockB}).`,
  };
}

/**
 * Linter Rule: Safe-Zone Margin Compliance
 * Ensures that all critical typography and titles stay inside mobile TikTok 9:16 safe zones:
 * - Left margin >= 60px
 * - Right margin <= compWidth - 60px
 * - Top margin >= 180px
 * - Bottom margin <= compHeight - 340px
 */
export function auditTextSafeZones(
  blocks: BoundingRect[],
  compWidth: number = 1080,
  compHeight: number = 1920
): {
  passed: boolean;
  violations: Array<{ id: string; edge: string; diffPx: number }>;
  formattedReport: string;
} {
  const safeLeft = 60;
  const safeRight = compWidth - 60;
  const safeTop = 180;
  const safeBottom = compHeight - 340;

  const violations: Array<{ id: string; edge: string; diffPx: number }> = [];

  for (const b of blocks) {
    const id = b.id || 'Text Element';
    if (b.x < safeLeft) {
      violations.push({ id, edge: 'left', diffPx: safeLeft - b.x });
    }
    if (b.x + b.width > safeRight) {
      violations.push({ id, edge: 'right', diffPx: (b.x + b.width) - safeRight });
    }
    if (b.y < safeTop) {
      violations.push({ id, edge: 'top', diffPx: safeTop - b.y });
    }
    if (b.y + b.height > safeBottom) {
      violations.push({ id, edge: 'bottom', diffPx: (b.y + b.height) - safeBottom });
    }
  }

  const passed = violations.length === 0;
  return {
    passed,
    violations,
    formattedReport: passed
      ? `PASSED: All ${blocks.length} text elements are inside TikTok 9:16 safe margins.`
      : `FAILED: ${violations.length} text safe-zone boundary violations found.`,
  };
}

/**
 * Linter Rule: Character Color Fidelity (Delta E < 5.0)
 * Prevents RGB/BGR channel swap errors (such as red hair turning blue).
 */
export function auditCharacterColorFidelity(
  sourceRgb: [number, number, number],
  compositedRgb: [number, number, number],
  maxDeltaE: number = 5.0
): {
  passed: boolean;
  deltaE: number;
  formattedReport: string;
} {
  // Use Euclidean Delta E approximation in Lab or RGB
  const dr = sourceRgb[0] - compositedRgb[0];
  const dg = sourceRgb[1] - compositedRgb[1];
  const db = sourceRgb[2] - compositedRgb[2];
  // Simple perceptually weighted delta:
  const deltaE = Math.sqrt(2 * dr * dr + 4 * dg * dg + 3 * db * db) / 3.0;
  const passed = deltaE <= maxDeltaE;

  return {
    passed,
    deltaE: Number(deltaE.toFixed(2)),
    formattedReport: passed
      ? `PASSED: Character color fidelity Delta E = ${deltaE.toFixed(2)} <= ${maxDeltaE}. RGB channels preserved.`
      : `FAILED: Character color deviation Delta E = ${deltaE.toFixed(2)} > ${maxDeltaE}. Probable BGR/RGB channel corruption!`,
  };
}
