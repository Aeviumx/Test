import { describe, it, expect } from 'vitest';
import { buildEditorKnowledgeSystemPrompt } from '../src/ai/editorKnowledge';
import { EditLinter, auditAccentTransientSync, auditOverscanBorders } from '../src/ai/editLinter';
import { EditPlan } from '../src/ai/editPlanSchema';
import { SceneCatalog } from '../src/ai/sceneCatalog';
import { VideoSceneAnalysis } from '../src/ai/videoAnalysis';

describe('Editor Knowledge Base & Deterministic Linter Engine', () => {
  it('should generate structured system prompt containing core editing rules', () => {
    const prompt = buildEditorKnowledgeSystemPrompt();
    expect(prompt).toContain('DYNAMIC ARC');
    expect(prompt).toContain('Cut on Action');
    expect(prompt).toContain('80-90% of cuts MUST be hard cuts');
    expect(prompt).toContain('speed-up-slow-down');
    expect(prompt).toContain('frameBlending');
  });

  it('should detect violations, issue category scores, and auto-fix bad plans', () => {
    // 1. Setup mock scene catalog with 1 clean scene and 1 hardsubbed scene
    const cleanScene: VideoSceneAnalysis = {
      id: 'clean_action_01',
      assetId: 'asset_clean',
      inPoint: 0,
      outPoint: 4,
      duration: 4,
      motionIntensity: 0.85,
      motionDirection: 'in',
      motionPeakTime: 0.5,
      motionPeakFrame: 30,
      shotScale: 'close',
      averageBrightness: 0.5,
      dominantColor: '#e11d48',
      junkFlags: {
        hasLetterbox: false,
        hasHardsub: false,
        hasWatermark: false,
        isStaticTalkingHead: false,
        isDuplicate: false,
      },
      visionTags: {
        epicness: 9,
        suitability: ['drop'],
      },
    };

    const cleanScene2: VideoSceneAnalysis = {
      id: 'clean_wide_02',
      assetId: 'asset_wide',
      inPoint: 0,
      outPoint: 4,
      duration: 4,
      motionIntensity: 0.6,
      motionDirection: 'left',
      motionPeakTime: 1.0,
      motionPeakFrame: 60,
      shotScale: 'wide',
      averageBrightness: 0.4,
      dominantColor: '#38bdf8',
      junkFlags: {
        hasLetterbox: false,
        hasHardsub: false,
        hasWatermark: false,
        isStaticTalkingHead: false,
        isDuplicate: false,
      },
      visionTags: {
        epicness: 8,
        suitability: ['drop', 'buildup'],
      },
    };

    const hardsubScene: VideoSceneAnalysis = {
      id: 'junk_hardsub_03',
      assetId: 'asset_junk',
      inPoint: 0,
      outPoint: 3,
      duration: 3,
      motionIntensity: 0.4,
      motionDirection: 'static',
      motionPeakTime: 0.2,
      motionPeakFrame: 12,
      shotScale: 'medium',
      averageBrightness: 0.3,
      dominantColor: '#0f172a',
      junkFlags: {
        hasLetterbox: false,
        hasHardsub: true, // Violation!
        hasWatermark: false,
        isStaticTalkingHead: false,
        isDuplicate: false,
      },
      visionTags: {
        epicness: 4,
        suitability: ['intro'],
      },
    };

    const catalog = new SceneCatalog([cleanScene, cleanScene2, hardsubScene]);

    // 2. Intentional flawed EditPlan
    const flawedPlan: EditPlan = {
      id: 'plan_flawed_01',
      version: '1.0.0',
      title: 'Flawed Edit Test',
      style: 'hype-amv',
      width: 1080,
      height: 1920,
      fps: 60,
      audioAssetId: 'audio_track',
      bpm: 130,
      totalDurationSeconds: 8.0,
      sections: [
        {
          id: 'sec_drop',
          name: 'Drop',
          type: 'drop',
          startBeat: 0,
          endBeat: 8,
          energy: 0.9,
          segments: [
            {
              id: 'seg_01',
              clipId: 'clean_action_01',
              targetBeat: 0,
              durationBeats: 2,
              frameOffset: 4, // Violation: excessive frame offset
              framing: 'close',
              cutIn: 'hard',
              cutOut: 'hard',
              alignMotionPeak: true,
              velocity: {
                profile: 'speed-up-slow-down',
                speedStart: 2.0,
                speedBeatDrop: 0.3,
                speedEnd: 1.0,
                cubicBezier: [0.25, 0.1, 0.25, 1.0],
                frameBlending: false, // Violation: no frame blending!
                motionBlur: false,
              },
              impacts: [
                { type: 'flash-white', intensity: 1.0, durationFrames: 8, decayCurve: 'linear' }, // Violation: flash > 3 frames!
                { type: 'zoom-punch', intensity: 0.9, durationFrames: 5, decayCurve: 'exponential' },
                { type: 'shake-decay', intensity: 0.9, durationFrames: 6, decayCurve: 'exponential' },
              ],
            },
            {
              id: 'seg_02',
              clipId: 'clean_action_01', // Violation: consecutive duplicate clip!
              targetBeat: 2,
              durationBeats: 2,
              frameOffset: 0,
              framing: 'close', // Violation: consecutive same framing!
              cutIn: 'hard',
              cutOut: 'hard',
              alignMotionPeak: true,
              velocity: {
                profile: 'constant',
                speedStart: 1.0,
                speedBeatDrop: 1.0,
                speedEnd: 1.0,
                cubicBezier: [0.25, 0.1, 0.25, 1.0],
                frameBlending: true,
                motionBlur: true,
              },
              impacts: [
                { type: 'zoom-punch', intensity: 0.8, durationFrames: 4, decayCurve: 'exponential' },
                { type: 'shake-decay', intensity: 0.8, durationFrames: 5, decayCurve: 'exponential' },
              ],
            },
            {
              id: 'seg_03',
              clipId: 'junk_hardsub_03', // Violation: hardsub scene!
              targetBeat: 4,
              durationBeats: 2,
              frameOffset: 0,
              framing: 'medium',
              cutIn: 'hard',
              cutOut: 'hard',
              alignMotionPeak: true,
              velocity: {
                profile: 'constant',
                speedStart: 1.0,
                speedBeatDrop: 1.0,
                speedEnd: 1.0,
                cubicBezier: [0.25, 0.1, 0.25, 1.0],
                frameBlending: true,
                motionBlur: true,
              },
              impacts: [
                { type: 'zoom-punch', intensity: 0.8, durationFrames: 4, decayCurve: 'exponential' },
                { type: 'shake-decay', intensity: 0.8, durationFrames: 5, decayCurve: 'exponential' },
              ],
            },
          ],
        },
      ],
      globalColorGrade: {
        vignette: 45,
        deepGlow: 35,
        contrast: 15,
        saturation: 20,
        chromaticAberration: 6,
        filmGrain: 10,
        lutName: 'Anime_Punch',
      },
    };

    const mockGrid = {
      bpm: 130,
      fps: 60,
      beats: Array.from({ length: 16 }, (_, i) => ({
        index: i,
        time: (i * 60) / 130,
        frame: Math.round(((i * 60) / 130) * 60),
      })),
    };

    // 3. Run Linter
    const report = EditLinter.lint(flawedPlan, mockGrid, catalog);
    expect(report.passStatus).not.toBe('pass');
    expect(report.overallScore).toBeLessThan(85);
    expect(report.autoFixAvailable).toBe(true);

    const issueCodes = report.issues.map((i) => i.code);
    expect(issueCodes).toContain('SYNC_DEVIATION');
    expect(issueCodes).toContain('CONSECUTIVE_SAME_FRAMING');
    expect(issueCodes).toContain('CONSECUTIVE_DUPLICATE_CLIP');
    expect(issueCodes).toContain('FLASH_TOO_LONG');
    expect(issueCodes).toContain('VELOCITY_NO_FRAME_BLENDING');
    expect(issueCodes).toContain('HARDSUB_DETECTED');

    // 4. Auto-Fix
    const { fixedPlan, fixesApplied } = EditLinter.autoFix(flawedPlan, catalog);
    expect(fixesApplied.length).toBeGreaterThanOrEqual(4);

    // 5. Re-run Linter on Fixed Plan (replacing hardsub scene with cleanScene2)
    fixedPlan.sections[0].segments[2].clipId = 'clean_wide_02';
    const cleanReport = EditLinter.lint(fixedPlan, mockGrid, catalog);

    expect(cleanReport.overallScore).toBeGreaterThanOrEqual(85);
    expect(cleanReport.passStatus).toBe('pass');
  });

  it('should audit accent-to-transient sync strictly within ±1 frame tolerance', () => {
    // 60 fps -> 1 frame = 16.67 ms
    const realTransients = [4.000, 4.492, 4.984, 5.476, 5.968];

    // Perfect sync (all <= 1 frame)
    const syncedAccents = [4.005, 4.488, 4.980, 5.480, 5.970];
    const reportPass = auditAccentTransientSync(syncedAccents, realTransients, 60, 1);
    expect(reportPass.passed).toBe(true);
    expect(reportPass.violationsCount).toBe(0);
    expect(reportPass.maxDiffMs).toBeLessThanOrEqual(16.7);
    expect(reportPass.formattedReport).toContain('PASSED');

    // Desynced accents (e.g. 0.46s off as noticed by user)
    const desyncedAccents = [4.000, 4.460, 4.984]; // 4.46 is 0.032s = 32ms off 4.492 (> 1 frame)
    const reportFail = auditAccentTransientSync(desyncedAccents, realTransients, 60, 1);
    expect(reportFail.passed).toBe(false);
    expect(reportFail.violationsCount).toBeGreaterThanOrEqual(1);
    expect(reportFail.formattedReport).toContain('FAILED');
    expect(reportFail.formattedReport).toContain('MISALIGNED');
  });

  it('should audit overscan borders and catch empty edge exposure under motion', () => {
    // With insufficient overscan (e.g. 1.0x with 120px pan), edges are exposed
    const leakyTransforms = [
      { frameIndex: 0, time: 0.0, scale: 1.0, panX: 0, panY: 0 },
      { frameIndex: 10, time: 0.16, scale: 1.0, panX: 120, panY: 0, shakeX: 30 },
    ];
    const reportFail = auditOverscanBorders(leakyTransforms, 1080, 1920, 1.00);
    expect(reportFail.passed).toBe(false);
    expect(reportFail.violationsCount).toBeGreaterThanOrEqual(1);

    // With +15% overscan (1.15x), 150px shake is fully contained
    const safeTransforms = [
      { frameIndex: 0, time: 0.0, scale: 1.15, panX: 0, panY: 0 },
      { frameIndex: 10, time: 0.16, scale: 1.15, panX: 20, panY: 10, shakeX: 15, shakeY: 15 },
    ];
    const reportPass = auditOverscanBorders(safeTransforms, 1080, 1920, 1.08);
    expect(reportPass.passed).toBe(true);
    expect(reportPass.violationsCount).toBe(0);
    expect(reportPass.formattedReport).toContain('PASSED (Zero Empty Edges)');
  });
});
