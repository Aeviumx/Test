import { describe, it, expect } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import { FfmpegService } from '../electron/ffmpegService';
import { RifeService } from '../electron/rifeService';
import { analyzeSceneFromFrames, FrameSampleData } from '../src/ai/videoAnalysis';
import { analyzeAudioBuffer } from '../src/ai/audioAnalysis';
import { EditEngine } from '../src/engine/editEngine';

const assetsDir = path.join(__dirname, '../test-assets');
const cacheDir = path.join(__dirname, '../test-assets/test_cache');

describe('Kōri Desktop Studio Native & AI Pipeline', () => {
  // 1. Native FFmpeg Media Probe
  it('should probe native MP4 video container and streams using ffprobe', async () => {
    const videoPath = path.join(assetsDir, 'test_scene_cuts.mp4');
    expect(fs.existsSync(videoPath)).toBe(true);

    const probe = await FfmpegService.probeMedia(videoPath);
    expect(probe.hasVideo).toBe(true);
    expect(probe.width).toBe(640);
    expect(probe.height).toBe(360);
    expect(probe.duration).toBeGreaterThanOrEqual(6.8);
    expect(probe.fps).toBe(60);
    expect(probe.codec).toBe('h264');
  });

  // 2. Native C++ Scene Detection with Thumbnail Extraction
  it('should detect scene cuts natively and generate scene thumbnails', async () => {
    const videoPath = path.join(assetsDir, 'test_scene_cuts.mp4');
    const scenes = await FfmpegService.detectScenesNative(videoPath, cacheDir, 0.1);

    expect(scenes.length).toBeGreaterThanOrEqual(3);
    expect(scenes[0].startTime).toBe(0);
    // Scene 2 cut should be around 2.0s
    expect(Math.abs(scenes[1].startTime - 2.0)).toBeLessThan(0.4);
    // Scene 3 cut should be around 4.0s
    expect(Math.abs(scenes[2].startTime - 4.0)).toBeLessThan(0.4);

    // Verify thumbnail file was generated on disk
    if (scenes[0].thumbnailPath) {
      expect(fs.existsSync(scenes[0].thumbnailPath)).toBe(true);
    }
  });

  // 3. Anime Held Frame Deduplication (2s & 3s animation)
  it('should scan anime frames and prune held duplicate frames on 2s and 3s', () => {
    const heldDir = path.join(assetsDir, 'held_frames');
    const frameFiles = fs.readdirSync(heldDir).filter((f) => f.endsWith('.png')).sort();
    expect(frameFiles.length).toBe(10);

    const buffers = frameFiles.map((f) => fs.readFileSync(path.join(heldDir, f)));
    const result = RifeService.scanAnimeHeldFrames(buffers, 1.5);

    expect(result.totalOriginalFrames).toBe(10);
    // Frames 0-1, 2-3, 4-6 have holds, so unique keyframes should be fewer than 10
    expect(result.heldFramesCount).toBeGreaterThanOrEqual(3);
    expect(result.uniqueKeyframesCount).toBeLessThan(10);
    expect(result.uniqueFrameIndices[0]).toBe(0);
  });

  // 4. Hardsubbed Text & Letterbox Junk Detection
  it('should flag hardcoded subtitles and detect letterbox black borders', () => {
    // 4a. Hardsub test: simulate dense high-contrast font glyph edges in lower third
    const dummyRgba = new Uint8ClampedArray(360 * 360 * 4);
    for (let y = 306; y < 350; y++) {
      for (let x = 30; x < 330; x++) {
        const idx = (y * 360 + x) * 4;
        const isText = (x % 14 < 7);
        dummyRgba[idx] = isText ? 255 : 0;
        dummyRgba[idx + 1] = isText ? 255 : 0;
        dummyRgba[idx + 2] = isText ? 255 : 0;
        dummyRgba[idx + 3] = 255;
      }
    }
    const sampleFrame: FrameSampleData = {
      time: 0,
      width: 360,
      height: 360,
      rgba: dummyRgba,
    };
    const analysis = analyzeSceneFromFrames('test_sub_scene', 'asset_01', [sampleFrame], 0, 1.0);
    expect(analysis.junkFlags.hasHardsub).toBe(true);

    // 4b. Letterbox test: top 60px and bottom 60px black
    const lbRgba = new Uint8ClampedArray(360 * 360 * 4).fill(180);
    for (let y = 0; y < 60; y++) {
      for (let x = 0; x < 360; x++) {
        const idx = (y * 360 + x) * 4;
        lbRgba[idx] = 0;
        lbRgba[idx + 1] = 0;
        lbRgba[idx + 2] = 0;
      }
    }
    for (let y = 300; y < 360; y++) {
      for (let x = 0; x < 360; x++) {
        const idx = (y * 360 + x) * 4;
        lbRgba[idx] = 0;
        lbRgba[idx + 1] = 0;
        lbRgba[idx + 2] = 0;
      }
    }
    const lbFrame: FrameSampleData = {
      time: 0,
      width: 360,
      height: 360,
      rgba: lbRgba,
    };
    const lbAnalysis = analyzeSceneFromFrames('test_lb_scene', 'asset_02', [lbFrame], 0, 1.0);
    expect(lbAnalysis.junkFlags.hasLetterbox).toBe(true);
    expect(lbAnalysis.junkFlags.letterboxCrop?.top).toBeGreaterThanOrEqual(58);
    expect(lbAnalysis.junkFlags.letterboxCrop?.bottom).toBeGreaterThanOrEqual(58);
  });

  // 5. Audio Beat Grid, Frequency Bands & Pre-Drop Breath Detection
  it('should analyze audio WAV buffer, detect BPM, and locate pre-drop silence breath', () => {
    const wavPath = path.join(assetsDir, 'test_phonk_audio.wav');
    const wavBuffer = fs.readFileSync(wavPath);

    // Read 16-bit PCM samples from WAV header (skip 44 bytes)
    const numSamples = Math.floor((wavBuffer.length - 44) / 2);
    const channelData = new Float32Array(numSamples);
    for (let i = 0; i < numSamples; i++) {
      channelData[i] = wavBuffer.readInt16LE(44 + i * 2) / 32768;
    }

    const audioResult = analyzeAudioBuffer([channelData], 44100, { fps: 60, targetBpm: 130 });
    expect(audioResult.totalFrames).toBeGreaterThan(500);
    expect(audioResult.beats.length).toBeGreaterThanOrEqual(16);
    expect(audioResult.sections.length).toBeGreaterThanOrEqual(2);

    // Verify pre-drop breath detection
    expect(audioResult.preDropBreaths.length).toBeGreaterThanOrEqual(1);
    const breath = audioResult.preDropBreaths[0];
    expect(breath.time).toBeGreaterThan(0);
    expect(breath.duration).toBeGreaterThan(0);
  });

  // 6. Deterministic EditEngine Compilation
  it('should compile EditPlan into a frame-accurate Composition with impact adjustment layers', () => {
    const rawPlan = {
      id: 'plan_desktop_test',
      version: '1.0.0',
      title: 'Kōri Desktop Test Edit',
      style: 'hype-amv',
      width: 1080,
      height: 1920,
      fps: 60,
      audioAssetId: 'audio_01',
      bpm: 130,
      totalDurationSeconds: 8.0,
      sections: [
        {
          id: 'sec_drop',
          name: 'Climax Drop',
          type: 'drop',
          startBeat: 0,
          endBeat: 8,
          energy: 0.95,
          segments: [
            {
              id: 'seg_climax_01',
              clipId: 'scene_action_01',
              targetBeat: 0,
              durationBeats: 4,
              frameOffset: -1,
              alignMotionPeak: true,
              cutIn: 'whip-left',
              velocity: {
                profile: 'speed-up-slow-down',
                speedStart: 2.0,
                speedBeatDrop: 0.3,
                speedEnd: 1.0,
                cubicBezier: [0.25, 0.1, 0.25, 1.0],
                frameBlending: true,
                motionBlur: true,
              },
              impacts: [
                { type: 'zoom-punch', intensity: 0.9, durationFrames: 4, decayCurve: 'exponential' },
                { type: 'shake-decay', intensity: 0.8, durationFrames: 6, decayCurve: 'exponential' },
                { type: 'rgb-split', intensity: 0.7, durationFrames: 3, decayCurve: 'exponential' },
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
        lutName: 'Anime_Vivid_Punch',
      },
    };

    const mockAudioGrid = {
      bpm: 130,
      duration: 8.0,
      beats: Array.from({ length: 16 }, (_, i) => ({
        index: i,
        time: (i * 60) / 130,
        frame: Math.round(((i * 60) / 130) * 60),
        strength: 0.9,
      })),
    };

    const mockScenes = [
      {
        id: 'scene_action_01',
        assetId: 'asset_action',
        duration: 4.0,
        motionPeakTime: 0.5,
        motionIntensity: 0.8,
        shotScale: 'close' as const,
      },
    ];

    const { composition, report } = EditEngine.compile(rawPlan, mockAudioGrid, mockScenes);

    expect(composition.layers.length).toBeGreaterThanOrEqual(5);
    expect(report.totalCuts).toBe(1);
    expect(report.totalImpacts).toBe(3);
    expect(composition.markers.length).toBeGreaterThanOrEqual(2);

    // Verify master CC layer exists
    const ccLayer = composition.layers.find((l) => l.name.includes('CC //'));
    expect(ccLayer).toBeDefined();
    expect(ccLayer?.effects.length).toBeGreaterThanOrEqual(3);
  });
});
