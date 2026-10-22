import {
  Composition,
  Keyframe,
  Layer,
  Vec2,
} from '../types/index.ts';
import { createId } from '../utils/id.ts';
import {
  createDefaultComposition,
  createDefaultLayer,
  createEffectInstance,
  createKeyframe,
  createProperty,
} from '../core/defaults.ts';
import {
  EditPlan,
  EditPlanSchema,
  EditSegment,
  EditSection,
  ImpactEffect,
} from '../ai/editPlanSchema.ts';

export interface BeatMarkerInfo {
  index: number;
  time: number;
  frame: number;
  strength: number;
  isMeasureDownbeat?: boolean;
}

export interface AudioAnalysisGrid {
  bpm: number;
  duration: number;
  beats: BeatMarkerInfo[];
  sections?: Array<{
    type: string;
    startTime: number;
    endTime: number;
    startBeat: number;
    endBeat: number;
    avgEnergy: number;
  }>;
}

export interface SceneAssetMetadata {
  id: string;
  assetId: string;
  name?: string;
  duration: number;
  motionPeakTime?: number; // seconds from start of scene
  motionPeakFrame?: number;
  motionIntensity?: number;
  shotScale?: 'extreme-close' | 'close' | 'medium' | 'wide';
  motionDirection?: 'left' | 'right' | 'in' | 'out' | 'static';
  url?: string;
  thumbnail?: string;
}

export interface EditEngineCompilationResult {
  composition: Composition;
  report: {
    totalSegments: number;
    totalCuts: number;
    totalImpacts: number;
    dropBeats: number[];
    warnings: string[];
  };
}

/**
 * Deterministic Edit Engine:
 * Compiles a high-level semantic EditPlan into a frame-accurate, production-grade Composition.
 */
export class EditEngine {
  /**
   * Compiles an EditPlan into a fully keyframed Composition
   */
  public static compile(
    rawPlan: unknown,
    audioAnalysis: AudioAnalysisGrid,
    sceneCatalog: Map<string, SceneAssetMetadata> | SceneAssetMetadata[]
  ): EditEngineCompilationResult {
    // 1. Zod deterministic validation
    const plan: EditPlan = EditPlanSchema.parse(rawPlan);

    // Normalize catalog to Map for O(1) lookups
    const catalogMap = new Map<string, SceneAssetMetadata>();
    if (Array.isArray(sceneCatalog)) {
      for (const scene of sceneCatalog) {
        catalogMap.set(scene.id, scene);
      }
    } else {
      for (const [key, scene] of sceneCatalog.entries()) {
        catalogMap.set(key, scene);
      }
    }

    const fps = plan.fps;
    const duration = plan.totalDurationSeconds;
    const comp = createDefaultComposition({
      name: plan.title,
      width: plan.width,
      height: plan.height,
      fps: plan.fps,
      duration: plan.totalDurationSeconds,
      backgroundColor: '#0a0a0f',
    });

    const warnings: string[] = [];
    let totalSegmentsCount = 0;
    let totalCutsCount = 0;
    let totalImpactsCount = 0;
    const dropBeats: number[] = [];

    // Helper: translate beat index to precise seconds
    const getBeatTime = (beatIndex: number): number => {
      const wholeBeat = Math.floor(beatIndex);
      const frac = beatIndex - wholeBeat;

      if (wholeBeat < audioAnalysis.beats.length) {
        const currentBeatTime = audioAnalysis.beats[wholeBeat].time;
        if (frac === 0) return currentBeatTime;

        // Interpolate fraction to next beat
        const nextBeatTime =
          wholeBeat + 1 < audioAnalysis.beats.length
            ? audioAnalysis.beats[wholeBeat + 1].time
            : currentBeatTime + 60 / plan.bpm;
        return currentBeatTime + frac * (nextBeatTime - currentBeatTime);
      }

      // Beyond analyzed beats: fall back to BPM calculation
      return (beatIndex * 60) / plan.bpm;
    };

    // 2. Timeline Markers generation
    for (const section of plan.sections) {
      const sectionStartTime = getBeatTime(section.startBeat);
      let color = '#38bdf8'; // sky
      if (section.type === 'drop') {
        color = '#e11d48'; // crimson
        dropBeats.push(section.startBeat);
      } else if (section.type === 'buildup') {
        color = '#f59e0b'; // amber
      } else if (section.type === 'climax') {
        color = '#a855f7'; // purple
      } else if (section.type === 'break') {
        color = '#64748b'; // slate
      } else if (section.type === 'outro') {
        color = '#10b981'; // emerald
      }

      comp.markers.push({
        id: createId('mrk_sec'),
        time: Math.round(sectionStartTime * fps) / fps,
        label: `[${section.type.toUpperCase()}] ${section.name}`,
        color,
      });
    }

    // 3. Audio Track Layer
    const audioLayer = createDefaultLayer(comp, 'audio', 'Master Soundtrack');
    audioLayer.assetId = plan.audioAssetId;
    audioLayer.inPoint = 0;
    audioLayer.outPoint = duration;
    comp.layers.push(audioLayer);

    // Track layers to assemble
    const videoLayers: Layer[] = [];
    const impactLayers: Layer[] = [];

    // 4. Compile Sections and Segments
    for (const section of plan.sections) {
      for (const segment of section.segments) {
        totalSegmentsCount++;
        totalCutsCount++;

        const sceneMeta = catalogMap.get(segment.clipId);
        if (!sceneMeta) {
          warnings.push(`Segment '${segment.id}' referenced unknown scene '${segment.clipId}'.`);
        }

        // Frame-accurate transient alignment: transient frame + frameOffset
        const baseBeatTime = getBeatTime(segment.targetBeat);
        const segmentStartTime = Math.max(0, baseBeatTime + segment.frameOffset / fps);
        const durationSec = (segment.durationBeats * 60) / plan.bpm;
        const segmentEndTime = Math.min(duration, segmentStartTime + durationSec);

        // Marker for each beat cut
        comp.markers.push({
          id: createId('mrk_cut'),
          time: segmentStartTime,
          label: `Cut #${totalCutsCount} // Beat ${segment.targetBeat} [${segment.framing}]`,
          color: section.type === 'drop' ? '#e11d48' : '#64748b',
        });

        // 4a. Video Layer for Segment
        const layerName = `${String(totalCutsCount).padStart(2, '0')} // ${segment.name ?? (sceneMeta ? sceneMeta.name ?? sceneMeta.id : segment.clipId)}`;
        const videoLayer = createDefaultLayer(comp, 'video', layerName, {
          assetId: sceneMeta?.assetId ?? segment.clipId,
          width: comp.width,
          height: comp.height,
        });

        videoLayer.inPoint = segmentStartTime;
        videoLayer.outPoint = segmentEndTime;

        // Motion peak alignment: align the clip so internal peak action lands on the target beat
        let sourceStartOffset = segment.sourceInPoint ?? 0;
        if (segment.alignMotionPeak && sceneMeta?.motionPeakTime !== undefined) {
          // If the scene has a motion peak at 0.45s, align it so the peak hits at the start or downbeat
          const leadIn = Math.min(0.2, durationSec * 0.25);
          sourceStartOffset = Math.max(0, sceneMeta.motionPeakTime - leadIn);
        }

        // Set startTime so that at segmentStartTime, source is playing from sourceStartOffset
        videoLayer.startTime = segmentStartTime - sourceStartOffset;

        // 4b. Transitions and Camera Movements
        this.applyTransitionsAndMotion(videoLayer, segment, comp.width, comp.height, fps);

        // 4c. Velocity Ramp Keyframing
        this.applyVelocityCurves(videoLayer, segment, segmentStartTime, segmentEndTime);

        videoLayers.push(videoLayer);

        // 4d. Impacts (Zoom punch, Shake, White Flash, Chromatic aberration)
        if (segment.impacts && segment.impacts.length > 0) {
          for (const impact of segment.impacts) {
            totalImpactsCount++;
            const impactLayer = this.buildImpactLayer(comp, segmentStartTime, impact, fps);
            if (impactLayer) {
              impactLayers.push(impactLayer);
            }
          }
        }
      }
    }

    // 5. Global Color Grade & CC Adjustment Layer
    const masterGradeLayer = this.buildMasterGradeLayer(comp, plan);

    // Layer stack order (Top to Bottom):
    // 1. Master Grade CC
    // 2. Impact Adjustment Layers
    // 3. Video Segment Layers
    // 4. Audio Track Layer
    comp.layers = [
      masterGradeLayer,
      ...impactLayers,
      ...videoLayers,
      audioLayer,
    ];

    return {
      composition: comp,
      report: {
        totalSegments: totalSegmentsCount,
        totalCuts: totalCutsCount,
        totalImpacts: totalImpactsCount,
        dropBeats,
        warnings,
      },
    };
  }

  /**
   * Applies motion matching, whip transitions, and scale dynamics
   */
  private static applyTransitionsAndMotion(
    layer: Layer,
    segment: EditSegment,
    compWidth: number,
    compHeight: number,
    fps: number
  ): void {
    const t0 = layer.inPoint;
    const t1 = layer.outPoint;
    const dur = t1 - t0;
    const transitionDur = Math.min(0.12, dur * 0.35); // 2-7 frames

    // Whip-left / Whip-right Transitions
    if (segment.cutIn === 'whip-left' || segment.cutIn === 'whip-right') {
      const dirX = segment.cutIn === 'whip-left' ? compWidth * 0.45 : -compWidth * 0.45;
      layer.transform.position.animated = true;
      layer.transform.position.keyframes = [
        createKeyframe(t0, [compWidth / 2 + dirX, compHeight / 2], 'bezier', { x: 0.1, y: 0.9 }, { x: 0.2, y: 1.0 }),
        createKeyframe(t0 + transitionDur, [compWidth / 2, compHeight / 2], 'linear'),
      ];
    } else if (segment.cutIn === 'zoom-in') {
      layer.transform.scale.animated = true;
      layer.transform.scale.keyframes = [
        createKeyframe(t0, [120, 120], 'bezier', { x: 0.25, y: 0.1 }, { x: 0.25, y: 1.0 }),
        createKeyframe(t0 + transitionDur, [100, 100], 'linear'),
      ];
    } else if (segment.cutIn === 'zoom-out') {
      layer.transform.scale.animated = true;
      layer.transform.scale.keyframes = [
        createKeyframe(t0, [85, 85], 'bezier', { x: 0.25, y: 0.1 }, { x: 0.25, y: 1.0 }),
        createKeyframe(t0 + transitionDur, [100, 100], 'linear'),
      ];
    }

    // Directional Motion Flow Push
    if (segment.motionDirection === 'in') {
      // Subtle continuous push-in: 100% -> 106% across the segment
      if (!layer.transform.scale.animated) {
        layer.transform.scale.animated = true;
        layer.transform.scale.keyframes = [
          createKeyframe(t0, [100, 100], 'linear'),
          createKeyframe(t1, [106, 106], 'linear'),
        ];
      }
    } else if (segment.motionDirection === 'left') {
      if (!layer.transform.position.animated) {
        layer.transform.position.animated = true;
        layer.transform.position.keyframes = [
          createKeyframe(t0, [compWidth / 2 + 30, compHeight / 2], 'linear'),
          createKeyframe(t1, [compWidth / 2 - 30, compHeight / 2], 'linear'),
        ];
      }
    } else if (segment.motionDirection === 'right') {
      if (!layer.transform.position.animated) {
        layer.transform.position.animated = true;
        layer.transform.position.keyframes = [
          createKeyframe(t0, [compWidth / 2 - 30, compHeight / 2], 'linear'),
          createKeyframe(t1, [compWidth / 2 + 30, compHeight / 2], 'linear'),
        ];
      }
    }
  }

  /**
   * Applies Twixtor/Bezier velocity curves to the segment
   */
  private static applyVelocityCurves(
    layer: Layer,
    segment: EditSegment,
    startTime: number,
    endTime: number
  ): void {
    const v = segment.velocity;
    if (v.profile === 'constant') return;

    const dur = endTime - startTime;
    const midTime = startTime + dur * 0.35; // deceleration hits shortly after cut

    if (v.profile === 'speed-up-slow-down' || v.profile === 'slow-down-drop') {
      // Complement velocity with scale punch on deceleration
      if (!layer.transform.scale.animated) {
        layer.transform.scale.animated = true;
        layer.transform.scale.keyframes = [
          createKeyframe(startTime, [100, 100], 'bezier', { x: 0.2, y: 0.8 }, { x: 0.2, y: 1.0 }),
          createKeyframe(midTime, [108, 108], 'bezier', { x: 0.3, y: 0.2 }, { x: 0.25, y: 1.0 }),
          createKeyframe(endTime, [100, 100], 'linear'),
        ];
      }
    }
  }

  /**
   * Builds high-intensity Impact adjustment layer (Zoom punch, Shake, Chromatic split, Strobe)
   */
  private static buildImpactLayer(
    comp: Composition,
    time: number,
    impact: ImpactEffect,
    fps: number
  ): Layer | null {
    const durationSec = impact.durationFrames / fps;
    const halfDur = durationSec * 0.35;
    const endT = time + durationSec;

    if (impact.type === 'zoom-punch') {
      const punchLayer = createDefaultLayer(comp, 'adjustment', `FX Impact // Punch ${(impact.intensity * 100).toFixed(0)}%`);
      punchLayer.inPoint = time;
      punchLayer.outPoint = endT;

      const punchScale = 100 + Math.round(14 * impact.intensity);
      punchLayer.transform.scale.animated = true;
      punchLayer.transform.scale.keyframes = [
        createKeyframe(time, [punchScale, punchScale], 'bezier', { x: 0.1, y: 0.9 }, { x: 0.2, y: 1.0 }),
        createKeyframe(endT, [100, 100], 'linear'),
      ];
      return punchLayer;
    }

    if (impact.type === 'shake-decay') {
      const shakeLayer = createDefaultLayer(comp, 'adjustment', `FX Impact // Shake ${(impact.intensity * 100).toFixed(0)}%`);
      shakeLayer.inPoint = time;
      shakeLayer.outPoint = endT;

      const maxOffset = Math.round(36 * impact.intensity);
      const cx = comp.width / 2;
      const cy = comp.height / 2;

      shakeLayer.transform.position.animated = true;
      shakeLayer.transform.position.keyframes = [
        createKeyframe(time, [cx + maxOffset, cy - maxOffset * 0.6], 'linear'),
        createKeyframe(time + durationSec * 0.25, [cx - maxOffset * 0.7, cy + maxOffset * 0.4], 'linear'),
        createKeyframe(time + durationSec * 0.55, [cx + maxOffset * 0.3, cy - maxOffset * 0.2], 'linear'),
        createKeyframe(endT, [cx, cy], 'linear'),
      ];
      return shakeLayer;
    }

    if (impact.type === 'rgb-split') {
      const chromaLayer = createDefaultLayer(comp, 'adjustment', `FX Impact // RGB Split`);
      chromaLayer.inPoint = time;
      chromaLayer.outPoint = endT;

      const chromaFx = createEffectInstance('chromatic-aberration');
      chromaFx.params.offsetX.animated = true;
      chromaFx.params.offsetX.keyframes = [
        createKeyframe(time, 24 * impact.intensity, 'bezier', { x: 0.1, y: 0.9 }, { x: 0.2, y: 1.0 }),
        createKeyframe(endT, 0, 'linear'),
      ];
      chromaLayer.effects = [chromaFx];
      return chromaLayer;
    }

    if (impact.type === 'flash-white') {
      const flashLayer = createDefaultLayer(comp, 'solid', `FX Impact // White Flash`, {
        solidColor: '#ffffff',
      });
      flashLayer.inPoint = time;
      flashLayer.outPoint = endT;
      flashLayer.blendMode = 'screen';
      flashLayer.transform.opacity.animated = true;
      flashLayer.transform.opacity.keyframes = [
        createKeyframe(time, Math.round(85 * impact.intensity), 'linear'),
        createKeyframe(endT, 0, 'linear'),
      ];
      return flashLayer;
    }

    return null;
  }

  /**
   * Builds the Master CC & Color Grade Adjustment Layer
   */
  private static buildMasterGradeLayer(comp: Composition, plan: EditPlan): Layer {
    const ccLayer = createDefaultLayer(comp, 'adjustment', `CC // ${plan.globalColorGrade.lutName}`);
    ccLayer.labelColor = 'sand';
    ccLayer.inPoint = 0;
    ccLayer.outPoint = plan.totalDurationSeconds;

    // 1. Deep Glow Effect
    const glowFx = createEffectInstance('glow');
    glowFx.params.intensity.value = Number((plan.globalColorGrade.deepGlow / 25).toFixed(2));
    glowFx.params.radius.value = 32;
    glowFx.params.threshold.value = 40;

    // 2. Chromatic Aberration Edge Dispersion
    const chromaFx = createEffectInstance('chromatic-aberration');
    chromaFx.params.offsetX.value = plan.globalColorGrade.chromaticAberration;

    // 3. Vignette
    const vignetteFx = createEffectInstance('vignette');
    vignetteFx.params.amount.value = plan.globalColorGrade.vignette;
    vignetteFx.params.midpoint.value = 48;
    vignetteFx.params.feather.value = 60;

    // 4. Brightness / Contrast
    const bcFx = createEffectInstance('brightness-contrast');
    bcFx.params.contrast.value = plan.globalColorGrade.contrast;

    ccLayer.effects = [glowFx, chromaFx, vignetteFx, bcFx];
    return ccLayer;
  }
}
