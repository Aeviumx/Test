import { analyzeAudioBuffer } from './src/ai/audioAnalysis.ts';
import {
  analyzeSceneFromFrames,
  FrameSampleData,
} from './src/ai/videoAnalysis.ts';
import { SceneCatalog } from './src/ai/sceneCatalog.ts';

console.log('--- RUNNING PHASE 2 TEST SUITE (DEEP MATERIAL ANALYSIS) ---');

// ==========================================
// 1. TEST AUDIO ANALYSIS
// ==========================================
const sampleRate = 44100;
const bpm = 130;
const durationSec = 8.0;
const totalSamples = Math.floor(sampleRate * durationSec);
const samplesPerBeat = Math.floor((60 / bpm) * sampleRate);

// Synthesize 8s Phonk/EDM test audio with:
// - Bars 0..1 (Beats 0..4): Soft intro
// - Bar 2 (Beats 4..7): Rising buildup with rapid snares
// - Beat 7.5: Dramatic pre-drop silence ("breath")
// - Bars 3..4 (Beats 8..16): Massive bass drop with 50Hz kicks & loud claps
const audioChannel = new Float32Array(totalSamples);

for (let s = 0; s < totalSamples; s++) {
  const t = s / sampleRate;
  const currentBeat = (t * bpm) / 60;

  if (currentBeat < 4) {
    // Intro: subtle synth melody
    audioChannel[s] = Math.sin(2 * Math.PI * 440 * t) * 0.15;
  } else if (currentBeat >= 4 && currentBeat < 7.5) {
    // Buildup: accelerating snare roll + rising tone
    const snareSubBeat = (currentBeat - 4) * 2;
    const isSnareHit = (snareSubBeat % 1) < 0.2;
    const noise = (Math.random() * 2 - 1) * 0.35;
    const tone = Math.sin(2 * Math.PI * (300 + currentBeat * 80) * t) * 0.2;
    audioChannel[s] = isSnareHit ? noise + tone : tone * 0.5;
  } else if (currentBeat >= 7.5 && currentBeat < 8.0) {
    // Dramatic silence / pre-drop breath! Almost 0 amplitude
    audioChannel[s] = (Math.random() * 2 - 1) * 0.005;
  } else {
    // 🔥 THE BASS DROP (beats 8..16)
    // 50 Hz sub-bass kick on every beat
    const beatFraction = (currentBeat - 8) % 1;
    let kick = 0;
    if (beatFraction < 0.35) {
      const kickEnv = 1.0 - beatFraction / 0.35;
      kick = Math.sin(2 * Math.PI * 55 * t) * kickEnv * 0.85;
    }
    // Snare clap on beats 9, 11, 13, 15
    let snare = 0;
    if (((currentBeat - 8) % 2) >= 1.0 && ((currentBeat - 8) % 2) < 1.3) {
      snare = (Math.random() * 2 - 1) * 0.6;
    }
    audioChannel[s] = kick + snare;
  }
}

const audioResult = analyzeAudioBuffer([audioChannel], sampleRate, { fps: 60, targetBpm: 130 });

console.log('✓ Audio analysis executed successfully');
console.log(`  - Total frames @ 60 FPS: ${audioResult.totalFrames}`);
console.log(`  - Total beats detected: ${audioResult.beats.length}`);
console.log(`  - Detected sections: ${audioResult.sections.map((s) => s.type).join(' -> ')}`);
console.log(`  - Pre-drop breaths found: ${audioResult.preDropBreaths.length}`);

if (audioResult.beats.length < 16) {
  throw new Error(`Expected at least 16 beats, got ${audioResult.beats.length}`);
}

// Verify sections identify intro, buildup, and drop
const hasDrop = audioResult.sections.some((s) => s.type === 'drop');
const hasIntro = audioResult.sections.some((s) => s.type === 'intro');
if (!hasDrop || !hasIntro) {
  throw new Error('Failed to segment intro or drop sections correctly');
}
console.log('✓ Musical track structure correctly identified Drop and Intro');

// Verify pre-drop breath around beat 7.5
if (audioResult.preDropBreaths.length === 0) {
  throw new Error('Failed to detect pre-drop silence breath!');
}
const breath = audioResult.preDropBreaths[0];
console.log(`✓ Pre-drop breath accurately detected at t=${breath.time.toFixed(3)}s (frame ${breath.frame})`);


// ==========================================
// 2. TEST VIDEO & JUNK ANALYSIS
// ==========================================
const testWidth = 320;
const testHeight = 320;

function createBlankFrame(w: number, h: number, time: number): FrameSampleData {
  return {
    time,
    width: w,
    height: h,
    rgba: new Uint8ClampedArray(w * h * 4).fill(128),
  };
}

// 2a. Action Scene with Motion Peak (expanding outward zoom)
const actionFrames: FrameSampleData[] = [];
for (let i = 0; i < 5; i++) {
  const f = createBlankFrame(testWidth, testHeight, i * 0.2);
  const cx = testWidth / 2;
  const cy = testHeight / 2;
  const radius = 20 + (i === 3 ? 90 : i * 20); // peak motion expansion at frame 3 (t=0.6s)

  // Draw circle
  for (let y = 0; y < testHeight; y++) {
    for (let x = 0; x < testWidth; x++) {
      const dist = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy));
      if (Math.abs(dist - radius) < 8) {
        const idx = (y * testWidth + x) * 4;
        f.rgba[idx] = 230; // red
        f.rgba[idx + 1] = 30;
        f.rgba[idx + 2] = 60;
      }
    }
  }
  actionFrames.push(f);
}

const actionAnalysis = analyzeSceneFromFrames('scene_action_01', 'asset_anime_01', actionFrames, 0, 1.0);
console.log(`✓ Action scene analyzed: motionIntensity=${actionAnalysis.motionIntensity}, direction='${actionAnalysis.motionDirection}', motionPeakTime=${actionAnalysis.motionPeakTime}s`);
if (actionAnalysis.motionIntensity <= 0.05) {
  throw new Error('Failed to detect motion in action clip');
}

// 2b. Letterboxed Scene (black borders on top and bottom)
const letterboxFrames: FrameSampleData[] = [];
for (let i = 0; i < 3; i++) {
  const f = createBlankFrame(testWidth, testHeight, i * 0.2);
  // Fill top 40px and bottom 40px with pitch black (luma 0)
  for (let y = 0; y < 40; y++) {
    for (let x = 0; x < testWidth; x++) {
      const idx = (y * testWidth + x) * 4;
      f.rgba[idx] = 0;
      f.rgba[idx + 1] = 0;
      f.rgba[idx + 2] = 0;
    }
  }
  for (let y = testHeight - 40; y < testHeight; y++) {
    for (let x = 0; x < testWidth; x++) {
      const idx = (y * testWidth + x) * 4;
      f.rgba[idx] = 0;
      f.rgba[idx + 1] = 0;
      f.rgba[idx + 2] = 0;
    }
  }
  letterboxFrames.push(f);
}

const letterboxAnalysis = analyzeSceneFromFrames('scene_letterbox_02', 'asset_anime_02', letterboxFrames, 0, 1.0);
console.log(`✓ Letterbox analysis: hasLetterbox=${letterboxAnalysis.junkFlags.hasLetterbox}, crop=${JSON.stringify(letterboxAnalysis.junkFlags.letterboxCrop)}`);
if (!letterboxAnalysis.junkFlags.hasLetterbox || !letterboxAnalysis.junkFlags.letterboxCrop?.top) {
  throw new Error('Failed to detect letterbox black borders!');
}

// 2c. Subtitled Scene (high-frequency edges in bottom 15%)
const subFrames: FrameSampleData[] = [];
for (let i = 0; i < 3; i++) {
  const f = createBlankFrame(testWidth, testHeight, i * 0.2);
  // Add subtitle strokes in bottom 15% (y > 275)
  for (let y = 280; y < 310; y += 4) {
    for (let x = 40; x < testWidth - 40; x += 4) {
      const idx = (y * testWidth + x) * 4;
      // High contrast text edge
      f.rgba[idx] = (x % 8 === 0) ? 255 : 0;
      f.rgba[idx + 1] = (x % 8 === 0) ? 255 : 0;
      f.rgba[idx + 2] = (x % 8 === 0) ? 255 : 0;
    }
  }
  subFrames.push(f);
}

const subAnalysis = analyzeSceneFromFrames('scene_subs_03', 'asset_anime_03', subFrames, 0, 1.0);
console.log(`✓ Subtitle junk detection: hasHardsub=${subAnalysis.junkFlags.hasHardsub}`);
if (!subAnalysis.junkFlags.hasHardsub) {
  throw new Error('Failed to flag hardcoded subtitles in lower third!');
}

// 2d. Static Talking Head (zero motion over 2 seconds)
const staticFrames: FrameSampleData[] = [];
for (let i = 0; i < 4; i++) {
  staticFrames.push(createBlankFrame(testWidth, testHeight, i * 0.5));
}
const staticAnalysis = analyzeSceneFromFrames('scene_talking_head_04', 'asset_anime_04', staticFrames, 0, 2.0);
console.log(`✓ Talking head detection: isStaticTalkingHead=${staticAnalysis.junkFlags.isStaticTalkingHead}`);
if (!staticAnalysis.junkFlags.isStaticTalkingHead) {
  throw new Error('Failed to flag static scene!');
}


// ==========================================
// 3. TEST SCENE CATALOG & JUNK FILTERING
// ==========================================
const catalog = new SceneCatalog([
  actionAnalysis,
  letterboxAnalysis,
  subAnalysis,
  staticAnalysis,
]);

// Query clean scenes (excluding junk and letterbox)
const cleanScenes = catalog.query({ excludeJunk: true, excludeLetterbox: true });
console.log(`✓ Scene catalog query excluding junk & letterbox: ${cleanScenes.length} of 4 scenes kept`);
if (cleanScenes.length !== 1 || cleanScenes[0].id !== 'scene_action_01') {
  throw new Error('Catalog failed to properly filter out junk scenes');
}

// Query allowing letterbox with auto-crop
const autoCropScenes = catalog.query({ excludeJunk: true, excludeLetterbox: false });
console.log(`✓ Scene catalog query with auto-crop allowed: ${autoCropScenes.length} of 4 scenes kept (action + letterbox for auto-crop)`);
if (autoCropScenes.length !== 2) {
  throw new Error('Catalog failed to allow letterboxed scenes for auto-crop');
}

// Best climax scene selection
const bestClimax = catalog.getBestClimaxScene();
if (!bestClimax || bestClimax.id !== 'scene_action_01') {
  throw new Error('Catalog failed to select the action scene as best climax scene');
}
console.log(`✓ Best climax scene selected: ${bestClimax.id} (epicness=${bestClimax.visionTags?.epicness})`);

console.log('--- ALL PHASE 2 TESTS PASSED SUCCESSFULLY! ---');
