import { EditPlanSchema, EditPlan } from './src/ai/editPlanSchema.ts';
import { EditEngine, AudioAnalysisGrid, SceneAssetMetadata } from './src/engine/editEngine.ts';

console.log('--- RUNNING PHASE 1 TEST SUITE (HYBRID ARCHITECTURE) ---');

// 1. Test Valid EditPlan Schema Validation
const validPlanData = {
  id: 'plan_test_01',
  version: '1.0.0',
  title: 'Hype AMV Drop Test',
  style: 'hype-amv',
  width: 1080,
  height: 1080,
  fps: 60,
  audioAssetId: 'audio_phonk_track',
  bpm: 130,
  totalDurationSeconds: 8.0,
  sections: [
    {
      id: 'sec_intro',
      name: 'Chill Intro',
      type: 'intro',
      startBeat: 0,
      endBeat: 8,
      energy: 0.3,
      segments: [
        {
          id: 'seg_01',
          clipId: 'scene_vera_01',
          name: 'Vera Slow Push',
          targetBeat: 0,
          durationBeats: 4,
          frameOffset: 0,
          alignMotionPeak: false,
          framing: 'medium',
          cutIn: 'hard',
          cutOut: 'hard',
          velocity: {
            profile: 'constant',
            speedStart: 1.0,
            speedBeatDrop: 1.0,
            speedEnd: 1.0,
            cubicBezier: [0.25, 0.1, 0.25, 1.0],
            frameBlending: true,
            motionBlur: true,
          },
          impacts: [],
        },
      ],
    },
    {
      id: 'sec_drop',
      name: 'Bass Drop Velocity',
      type: 'drop',
      startBeat: 8,
      endBeat: 16,
      energy: 0.95,
      segments: [
        {
          id: 'seg_02',
          clipId: 'scene_lucia_action',
          name: 'Lucia Blade Slash',
          targetBeat: 8,
          durationBeats: 2,
          frameOffset: -1, // -1 frame for transient anticipation
          alignMotionPeak: true,
          framing: 'close',
          motionDirection: 'in',
          cutIn: 'whip-left',
          cutOut: 'hard',
          velocity: {
            profile: 'speed-up-slow-down',
            speedStart: 2.5,
            speedBeatDrop: 0.3,
            speedEnd: 1.2,
            cubicBezier: [0.25, 0.1, 0.25, 1.0],
            frameBlending: true,
            motionBlur: true,
          },
          impacts: [
            { type: 'zoom-punch', intensity: 0.9, durationFrames: 5, decayCurve: 'exponential' },
            { type: 'shake-decay', intensity: 0.8, durationFrames: 6, decayCurve: 'exponential' },
            { type: 'rgb-split', intensity: 0.85, durationFrames: 4, decayCurve: 'exponential' },
            { type: 'flash-white', intensity: 0.7, durationFrames: 2, decayCurve: 'linear' },
          ],
        },
      ],
    },
  ],
  globalColorGrade: {
    vignette: 50,
    deepGlow: 40,
    contrast: 20,
    saturation: 25,
    chromaticAberration: 8,
    filmGrain: 12,
    lutName: 'Anime_Punch_V2',
  },
};

const parsedPlan = EditPlanSchema.parse(validPlanData);
console.log('✓ Valid EditPlan parsed and validated by Zod');

// 2. Test Invalid EditPlan Rejection
let errorCaught = false;
try {
  EditPlanSchema.parse({
    ...validPlanData,
    fps: 15, // minimum is 24
  });
} catch (e) {
  errorCaught = true;
  console.log('✓ Zod successfully rejected invalid FPS (15 < 24)');
}
if (!errorCaught) throw new Error('Failed to reject invalid plan');

// 3. Mock Audio Analysis Grid
const mockAudioGrid: AudioAnalysisGrid = {
  bpm: 130,
  duration: 8.0,
  beats: Array.from({ length: 20 }, (_, i) => ({
    index: i,
    time: Number(((i * 60) / 130).toFixed(4)),
    frame: Math.round(((i * 60) / 130) * 60),
    strength: i % 4 === 0 ? 0.95 : 0.65,
    isMeasureDownbeat: i % 4 === 0,
  })),
};

// 4. Mock Scene Catalog with Motion Peak Data
const mockScenes: SceneAssetMetadata[] = [
  {
    id: 'scene_vera_01',
    assetId: 'asset_vera_raw',
    duration: 3.5,
    motionPeakTime: 1.2,
    shotScale: 'medium',
    motionDirection: 'static',
  },
  {
    id: 'scene_lucia_action',
    assetId: 'asset_lucia_raw',
    duration: 2.8,
    motionPeakTime: 0.65, // motion peak at 0.65s
    shotScale: 'close',
    motionDirection: 'in',
  },
];

// 5. Compile Plan into Composition
const { composition, report } = EditEngine.compile(parsedPlan, mockAudioGrid, mockScenes);

console.log('✓ Compilation executed cleanly');
console.log(`  - Layers generated: ${composition.layers.length}`);
console.log(`  - Markers generated: ${composition.markers.length}`);
console.log(`  - Total cuts compiled: ${report.totalCuts}`);
console.log(`  - Total impacts compiled: ${report.totalImpacts}`);
console.log(`  - Drop beats identified: ${report.dropBeats.join(', ')}`);

// Verify Segment 2 Timing and Alignment:
// Beat 8 time = (8 * 60) / 130 = 3.6923s
// frameOffset = -1 frame at 60fps = -0.01667s -> expected inPoint = 3.6756s
const seg2Layer = composition.layers.find((l) => l.name.includes('Lucia Blade Slash'));
if (!seg2Layer) throw new Error('Segment 2 layer missing!');

const expectedInPoint = Math.max(0, mockAudioGrid.beats[8].time + (-1 / 60));
if (Math.abs(seg2Layer.inPoint - expectedInPoint) > 0.001) {
  throw new Error(`InPoint mismatch: expected ${expectedInPoint}, got ${seg2Layer.inPoint}`);
}
console.log(`✓ Segment 2 transient inPoint verified: ${seg2Layer.inPoint.toFixed(4)}s (beat 8 + -1 frame)`);

// Verify Motion Peak offset calculation:
// scene motionPeakTime = 0.65s, leadIn = min(0.2, 0.923 * 0.25) = 0.2s
// sourceStartOffset = 0.65 - 0.2 = 0.45s
// layer.startTime = inPoint - sourceStartOffset
const expectedStartTime = seg2Layer.inPoint - (0.65 - 0.2);
if (Math.abs(seg2Layer.startTime - expectedStartTime) > 0.001) {
  throw new Error(`StartTime motion peak alignment mismatch: expected ${expectedStartTime}, got ${seg2Layer.startTime}`);
}
console.log(`✓ Motion peak alignment verified: startTime = ${seg2Layer.startTime.toFixed(4)}s (peak aligned to action hit)`);

// Verify Impact layers:
const impactLayers = composition.layers.filter((l) => l.name.includes('FX Impact'));
console.log(`✓ Impact adjustment layers created: ${impactLayers.length}`);
if (impactLayers.length !== 4) {
  throw new Error(`Expected 4 impact layers, got ${impactLayers.length}`);
}

// Verify Master CC Grade layer:
const ccLayer = composition.layers.find((l) => l.name.includes('CC // Anime_Punch_V2'));
if (!ccLayer || ccLayer.effects.length < 3) {
  throw new Error('Master CC Grade layer missing or incomplete');
}
console.log(`✓ Master CC grade layer verified with ${ccLayer.effects.length} effects`);

console.log('--- ALL PHASE 1 TESTS PASSED SUCCESSFULLY! ---');
