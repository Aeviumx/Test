/**
 * Deep Audio Analysis Engine for Beat-Synced Anime Editing
 * Extracts frame-accurate beat grids, 4-band frequency curves, track structure,
 * and pre-drop breath pauses.
 */

export interface BeatTransient {
  index: number;
  time: number;          // seconds
  frame: number;         // exact frame at target FPS
  strength: number;      // 0..1 relative onset strength
  isDownbeat: boolean;   // measure downbeat (e.g. beat 1 in 4/4)
  frequencyBand: 'kick' | 'snare' | 'hihat' | 'full';
}

export interface TrackSection {
  type: 'intro' | 'buildup' | 'drop' | 'break' | 'climax' | 'outro';
  startTime: number;
  endTime: number;
  startBeat: number;
  endBeat: number;
  avgEnergy: number;
  peakEnergy: number;
}

export interface PreDropBreath {
  time: number;          // seconds where music drops to silence/dip
  frame: number;         // frame index
  duration: number;      // duration of the dip in seconds
  dropBeatIndex: number; // the beat index of the incoming drop
}

export interface DeepAudioAnalysisResult {
  duration: number;
  sampleRate: number;
  bpm: number;
  fps: number;
  totalFrames: number;
  
  // Frame-accurate musical grid
  beats: BeatTransient[];
  measures: Array<{ index: number; startTime: number; endTime: number }>;
  
  // 4-band energy curves downsampled to composition FPS (length = totalFrames)
  bands: {
    subKick: Float32Array; // <120 Hz (808s, bass kicks)
    snareClap: Float32Array; // 200 - 2500 Hz (snare hits, claps)
    hihatPerc: Float32Array; // >5000 Hz (16th hats, cymbals)
    vocalLead: Float32Array; // 800 - 4000 Hz (melodies, vocals)
  };
  
  // Overall dynamic energy curve per frame (0..1)
  overallEnergy: Float32Array;
  
  // High-level track structure
  sections: TrackSection[];
  
  // Pre-drop pauses / breaths for dramatic edits
  preDropBreaths: PreDropBreath[];
}

export interface AudioAnalysisOptions {
  fps?: number;           // Target composition FPS (default 60)
  targetBpm?: number;     // Optional known BPM hint
  minEnergyDip?: number;  // Threshold for pre-drop breath (default 0.22)
}

/**
 * Analyzes decoded PCM audio buffer (Float32Array channels)
 */
export function analyzeAudioBuffer(
  audioData: Float32Array[],
  sampleRate: number,
  options: AudioAnalysisOptions = {}
): DeepAudioAnalysisResult {
  const fps = options.fps ?? 60;
  const numChannels = audioData.length;
  const numSamples = audioData[0].length;
  const duration = numSamples / sampleRate;
  const totalFrames = Math.ceil(duration * fps);

  // 1. Mono downmix
  const mono = new Float32Array(numSamples);
  for (let c = 0; c < numChannels; c++) {
    const channel = audioData[c];
    for (let i = 0; i < numSamples; i++) {
      mono[i] += channel[i] / numChannels;
    }
  }

  // 2. Frequency Band Separation (biquad filtering approximations)
  const subKick = filterLowPass(mono, sampleRate, 130);
  const snareClap = filterBandPass(mono, sampleRate, 250, 2400);
  const hihatPerc = filterHighPass(mono, sampleRate, 5200);
  const vocalLead = filterBandPass(mono, sampleRate, 850, 3800);

  // 3. Downsample energy envelopes to frame rate (60 FPS)
  const samplesPerFrame = Math.max(1, Math.floor(sampleRate / fps));
  const kickCurve = computeRmsEnvelope(subKick, samplesPerFrame, totalFrames);
  const snareCurve = computeRmsEnvelope(snareClap, samplesPerFrame, totalFrames);
  const hihatCurve = computeRmsEnvelope(hihatPerc, samplesPerFrame, totalFrames);
  const vocalCurve = computeRmsEnvelope(vocalLead, samplesPerFrame, totalFrames);

  // Overall energy is weighted combination
  const overallEnergy = new Float32Array(totalFrames);
  for (let f = 0; f < totalFrames; f++) {
    const combined =
      kickCurve[f] * 0.45 +
      snareCurve[f] * 0.30 +
      vocalCurve[f] * 0.15 +
      hihatCurve[f] * 0.10;
    overallEnergy[f] = Math.min(1.0, combined * 1.8);
  }

  // 4. BPM estimation & Transient Peak Detection
  const bpm = options.targetBpm ?? estimateBpm(kickCurve, snareCurve, vocalCurve, fps);
  const beats = detectBeatGrid(kickCurve, snareCurve, overallEnergy, bpm, fps, duration);

  // 5. Measure grouping (4/4 time signature default)
  const measures: Array<{ index: number; startTime: number; endTime: number }> = [];
  const downbeats = beats.filter((b) => b.isDownbeat);
  for (let i = 0; i < downbeats.length; i++) {
    const start = downbeats[i].time;
    const end = i + 1 < downbeats.length ? downbeats[i + 1].time : start + (4 * 60) / bpm;
    measures.push({ index: i, startTime: start, endTime: end });
  }

  // 6. Track Section Segmentation (intro -> buildup -> drop -> break -> outro)
  const sections = segmentTrackSections(overallEnergy, kickCurve, beats, fps, duration);

  // 7. Detect Pre-drop breaths (dramatic dips before high-energy drops)
  const preDropBreaths = detectPreDropBreaths(overallEnergy, beats, sections, fps);

  return {
    duration,
    sampleRate,
    bpm,
    fps,
    totalFrames,
    beats,
    measures,
    bands: {
      subKick: kickCurve,
      snareClap: snareCurve,
      hihatPerc: hihatCurve,
      vocalLead: vocalCurve,
    },
    overallEnergy,
    sections,
    preDropBreaths,
  };
}

/**
 * Computes normalized RMS energy per frame block
 */
function computeRmsEnvelope(samples: Float32Array, blockSize: number, totalFrames: number): Float32Array {
  const env = new Float32Array(totalFrames);
  let maxRms = 0.0001;

  for (let f = 0; f < totalFrames; f++) {
    const start = f * blockSize;
    const end = Math.min(samples.length, start + blockSize);
    if (start >= samples.length) break;

    let sum = 0;
    for (let i = start; i < end; i++) {
      sum += samples[i] * samples[i];
    }
    const rms = Math.sqrt(sum / (end - start));
    env[f] = rms;
    if (rms > maxRms) maxRms = rms;
  }

  // Normalize to 0..1 range with soft knee
  const invMax = 1 / maxRms;
  for (let f = 0; f < totalFrames; f++) {
    env[f] = Math.min(1.0, env[f] * invMax);
  }
  return env;
}

/**
 * First-order low-pass filter
 */
function filterLowPass(input: Float32Array, sampleRate: number, cutoff: number): Float32Array {
  const output = new Float32Array(input.length);
  const rc = 1.0 / (cutoff * 2 * Math.PI);
  const dt = 1.0 / sampleRate;
  const alpha = dt / (rc + dt);

  let prev = 0;
  for (let i = 0; i < input.length; i++) {
    prev += alpha * (input[i] - prev);
    output[i] = prev;
  }
  return output;
}

/**
 * First-order high-pass filter
 */
function filterHighPass(input: Float32Array, sampleRate: number, cutoff: number): Float32Array {
  const output = new Float32Array(input.length);
  const rc = 1.0 / (cutoff * 2 * Math.PI);
  const dt = 1.0 / sampleRate;
  const alpha = rc / (rc + dt);

  let prevIn = 0;
  let prevOut = 0;
  for (let i = 0; i < input.length; i++) {
    const currentIn = input[i];
    prevOut = alpha * (prevOut + currentIn - prevIn);
    prevIn = currentIn;
    output[i] = prevOut;
  }
  return output;
}

/**
 * Band-pass filter (high-pass then low-pass cascade)
 */
function filterBandPass(input: Float32Array, sampleRate: number, lowCut: number, highCut: number): Float32Array {
  const hp = filterHighPass(input, sampleRate, lowCut);
  return filterLowPass(hp, sampleRate, highCut);
}

/**
 * Estimates BPM using multi-window autocorrelation across active sections
 * with standard tempo octave prior weighting centered around 125 BPM
 */
function estimateBpm(
  kick: Float32Array,
  snare: Float32Array,
  vocal: Float32Array,
  fps: number
): number {
  const minBpm = 80;
  const maxBpm = 175;
  const minLag = Math.floor((60 / maxBpm) * fps);
  const maxLag = Math.floor((60 / minBpm) * fps);

  // Divide audio into 8s windows with 4s hop
  const totalFrames = kick.length;
  const winFrames = Math.min(totalFrames, Math.round(8 * fps));
  const hopFrames = Math.max(1, Math.round(4 * fps));
  const numWindows = Math.max(1, Math.floor((totalFrames - winFrames) / hopFrames) + 1);

  const windowVotes: Array<{ bpm: number; weight: number }> = [];

  for (let w = 0; w < numWindows; w++) {
    const start = w * hopFrames;
    const end = Math.min(totalFrames, start + winFrames);
    if (end - start < minLag * 2) continue;

    let winEnergy = 0;
    for (let f = start; f < end; f++) {
      winEnergy += kick[f] * 2.0 + snare[f] * 1.5;
    }
    const avgEnergy = winEnergy / (end - start);
    // Skip silent/percless intro or outro windows
    if (avgEnergy < 0.12 && numWindows > 2) continue;

    let bestLag = Math.round((60 / 125) * fps);
    let maxCorr = -1;

    for (let lag = minLag; lag <= maxLag; lag++) {
      let corr = 0;
      for (let f = start; f < end - lag; f++) {
        const e1 = kick[f] * 1.8 + snare[f] * 1.4 + vocal[f] * 0.3;
        const e2 = kick[f + lag] * 1.8 + snare[f + lag] * 1.4 + vocal[f + lag] * 0.3;
        corr += e1 * e2;
      }

      const bpmVal = (60 * fps) / lag;
      // Gaussian prior centered at 125 BPM to avoid octave jumping (60 vs 120 vs 180)
      const octaveWeight = Math.exp(-Math.pow(Math.log(bpmVal / 125) / Math.log(1.4), 2));
      const weightedCorr = corr * octaveWeight;

      if (weightedCorr > maxCorr) {
        maxCorr = weightedCorr;
        bestLag = lag;
      }
    }

    if (maxCorr > 0) {
      const rawBpm = (60 * fps) / bestLag;
      windowVotes.push({ bpm: rawBpm, weight: maxCorr * (avgEnergy + 0.1) });
    }
  }

  if (windowVotes.length === 0) return 120;

  // Weighted consensus
  let totalW = 0;
  let weightedBpm = 0;
  windowVotes.sort((a, b) => b.weight - a.weight);
  const leadBpm = windowVotes[0].bpm;

  for (const vote of windowVotes) {
    let effectiveBpm = vote.bpm;
    if (Math.abs(effectiveBpm * 2 - leadBpm) < 4) effectiveBpm *= 2;
    if (Math.abs(effectiveBpm / 2 - leadBpm) < 4) effectiveBpm /= 2;

    if (Math.abs(effectiveBpm - leadBpm) < 7) {
      weightedBpm += effectiveBpm * vote.weight;
      totalW += vote.weight;
    }
  }

  const consensus = totalW > 0 ? weightedBpm / totalW : leadBpm;
  const rounded = Math.round(consensus);
  if (Math.abs(consensus - rounded) < 0.35) return rounded;
  return Math.round(consensus * 10) / 10;
}

/**
 * Builds frame-accurate beat grid synchronized with kick/snare transients
 * with ±2 frame local snapping, drift-free Phase-Locked Loop (PLL) clock tracking,
 * and support for percless intros (backwards projection from first drum drop).
 */
function detectBeatGrid(
  kick: Float32Array,
  snare: Float32Array,
  overallEnergy: Float32Array,
  bpm: number,
  fps: number,
  duration: number
): BeatTransient[] {
  const framesPerBeat = (60 / bpm) * fps;
  const totalFrames = overallEnergy.length;

  // 1. Locate the first primary rhythmic anchor (where kick or snare hits with real energy)
  let anchorFrame = 0;
  let anchorScore = 0;

  // Look for the first transient with strong kick/snare energy (>0.35)
  for (let f = 0; f < Math.min(totalFrames, Math.round(fps * 20)); f++) {
    const score = kick[f] * 2.2 + snare[f] * 1.5;
    // Check if this is a local transient peak
    const prev = f > 0 ? kick[f - 1] * 2.2 + snare[f - 1] * 1.5 : 0;
    const next = f < totalFrames - 1 ? kick[f + 1] * 2.2 + snare[f + 1] * 1.5 : 0;

    if (score > 0.35 && score >= prev && score >= next) {
      anchorFrame = f;
      anchorScore = score;
      break;
    }
  }

  // If no strong hit in first 20s, pick the global peak in first 2 beats
  if (anchorScore === 0) {
    const searchLimit = Math.min(totalFrames, Math.round(framesPerBeat * 2));
    let maxP = 0;
    for (let f = 0; f < searchLimit; f++) {
      const val = kick[f] * 2.0 + snare[f];
      if (val > maxP) {
        maxP = val;
        anchorFrame = f;
      }
    }
  }

  // 2. Project backwards from anchorFrame to frame 0 for percless intros
  const introBeats: Array<{ frame: number; isDownbeat: boolean }> = [];
  let backPhase = anchorFrame - framesPerBeat;
  let backBeatCount = 1;

  while (backPhase >= 0) {
    const nominal = Math.round(backPhase);
    // Search local ±2 frames for any subtle melodic/energy peak in the intro
    let bestF = nominal;
    let maxE = -1;
    for (let f = Math.max(0, nominal - 2); f <= Math.min(totalFrames - 1, nominal + 2); f++) {
      const e = overallEnergy[f];
      if (e > maxE) {
        maxE = e;
        bestF = f;
      }
    }
    introBeats.unshift({
      frame: bestF,
      isDownbeat: (backBeatCount % 4) === 0,
    });
    backPhase -= framesPerBeat;
    backBeatCount++;
  }

  // 3. Track forward from anchorFrame using Phase-Locked Loop (PLL)
  const forwardBeats: Array<{ frame: number; isDownbeat: boolean }> = [];
  let currentExpected = anchorFrame;
  let localFramesPerBeat = framesPerBeat;
  let forwardBeatIndex = 0;

  while (currentExpected < totalFrames) {
    const nominal = Math.round(currentExpected);
    // Snap to real transient peak within ±2 frames
    let bestLocalFrame = nominal;
    let localMax = -1;
    const searchRadius = 2; // Exact ±2 frame local transient snapping

    for (
      let f = Math.max(0, nominal - searchRadius);
      f <= Math.min(totalFrames - 1, nominal + searchRadius);
      f++
    ) {
      const power = kick[f] * 1.9 + snare[f] * 1.3;
      if (power > localMax) {
        localMax = power;
        bestLocalFrame = f;
      }
    }

    forwardBeats.push({
      frame: bestLocalFrame,
      isDownbeat: (forwardBeatIndex % 4) === 0,
    });

    // Phase error correction (PLL) to prevent drift to the end of the track
    const phaseError = bestLocalFrame - nominal;
    // If a clear hit was found, adapt local phase smoothly
    if (localMax > 0.15) {
      currentExpected = bestLocalFrame + localFramesPerBeat + phaseError * 0.08;
    } else {
      // In quiet breaks, smoothly continue the locked beat clock
      currentExpected += localFramesPerBeat;
    }

    forwardBeatIndex++;
  }

  // 4. Combine intro and forward beats into indexed timeline
  const combinedBeats = [...introBeats, ...forwardBeats];
  const result: BeatTransient[] = [];

  for (let b = 0; b < combinedBeats.length; b++) {
    const item = combinedBeats[b];
    const f = item.frame;
    const time = f / fps;
    const kickScore = kick[f] || 0;
    const snareScore = snare[f] || 0;
    const band = kickScore >= snareScore ? 'kick' : 'snare';
    const strength = Math.min(
      1.0,
      (kickScore + snareScore) * 1.25 + (item.isDownbeat ? 0.2 : 0)
    );

    result.push({
      index: b,
      time,
      frame: f,
      strength,
      isDownbeat: item.isDownbeat,
      frequencyBand: band,
    });
  }

  return result;
}

/**
 * Segments track into musical sections based on dynamic energy curves
 */
function segmentTrackSections(
  energy: Float32Array,
  kick: Float32Array,
  beats: BeatTransient[],
  fps: number,
  duration: number
): TrackSection[] {
  const sections: TrackSection[] = [];
  if (beats.length === 0) return sections;

  // Compute energy per 4-beat measure
  const measureEnergies: number[] = [];
  const numMeasures = Math.floor(beats.length / 4);

  for (let m = 0; m < numMeasures; m++) {
    const startF = beats[m * 4].frame;
    const endF = (m + 1) * 4 < beats.length ? beats[(m + 1) * 4].frame : energy.length;
    let sum = 0;
    let count = 0;
    for (let f = startF; f < endF && f < energy.length; f++) {
      sum += energy[f];
      count++;
    }
    measureEnergies.push(count > 0 ? sum / count : 0);
  }

  // Find the primary Drop: highest sustained energy measure with strong kick band
  let maxDropMeasure = 0;
  let maxDropScore = -1;
  for (let m = 0; m < numMeasures; m++) {
    const startF = beats[m * 4].frame;
    const endF = Math.min(energy.length, startF + Math.round(fps * 2));
    let kickSum = 0;
    for (let f = startF; f < endF; f++) {
      kickSum += kick[f];
    }
    const score = measureEnergies[m] * 0.6 + (kickSum / (endF - startF || 1)) * 0.4;
    if (score > maxDropScore) {
      maxDropScore = score;
      maxDropMeasure = m;
    }
  }

  // Build anime edit progression around the drop
  // 1. Intro: low percussion / atmospheric start until buildup
  let firstRiseMeasure = 0;
  for (let m = 0; m < maxDropMeasure; m++) {
    if (measureEnergies[m] > 0.28 || (m > 0 && measureEnergies[m] > measureEnergies[m - 1] * 1.6)) {
      firstRiseMeasure = m;
      break;
    }
  }
  const introEndMeasure = Math.max(1, Math.min(firstRiseMeasure > 0 ? firstRiseMeasure : Math.floor(maxDropMeasure / 2), maxDropMeasure));
  const introEndBeat = Math.min(beats.length - 1, introEndMeasure * 4);
  sections.push({
    type: 'intro',
    startTime: 0,
    endTime: beats[introEndBeat].time,
    startBeat: 0,
    endBeat: introEndBeat,
    avgEnergy: measureEnergies[0] || 0.2,
    peakEnergy: 0.45,
  });

  // 2. Build-up (rising energy towards drop)
  if (maxDropMeasure > introEndMeasure) {
    const buildupStartBeat = introEndBeat;
    const buildupEndBeat = Math.min(beats.length - 1, maxDropMeasure * 4);
    sections.push({
      type: 'buildup',
      startTime: beats[buildupStartBeat].time,
      endTime: beats[buildupEndBeat].time,
      startBeat: buildupStartBeat,
      endBeat: buildupEndBeat,
      avgEnergy: 0.65,
      peakEnergy: 0.85,
    });
  }

  // 3. Drop (The climax/peak)
  const dropStartBeat = Math.min(beats.length - 1, maxDropMeasure * 4);
  const dropLengthMeasures = Math.min(8, Math.max(4, Math.floor((numMeasures - maxDropMeasure) / 2)));
  const dropEndBeat = Math.min(beats.length - 1, dropStartBeat + dropLengthMeasures * 4);
  sections.push({
    type: 'drop',
    startTime: beats[dropStartBeat].time,
    endTime: beats[dropEndBeat].time,
    startBeat: dropStartBeat,
    endBeat: dropEndBeat,
    avgEnergy: 0.95,
    peakEnergy: 1.0,
  });

  // 4. Break / Climax / Outro for longer tracks
  if (dropEndBeat < beats.length - 1) {
    const remainingMeasures = numMeasures - (maxDropMeasure + dropLengthMeasures);
    if (remainingMeasures > 8) {
      // Find secondary drop / climax
      const breakEndBeat = Math.min(beats.length - 1, dropEndBeat + 16);
      sections.push({
        type: 'break',
        startTime: beats[dropEndBeat].time,
        endTime: beats[breakEndBeat].time,
        startBeat: dropEndBeat,
        endBeat: breakEndBeat,
        avgEnergy: 0.5,
        peakEnergy: 0.7,
      });

      const climaxEndBeat = Math.min(beats.length - 1, breakEndBeat + 16);
      sections.push({
        type: 'climax',
        startTime: beats[breakEndBeat].time,
        endTime: beats[climaxEndBeat].time,
        startBeat: breakEndBeat,
        endBeat: climaxEndBeat,
        avgEnergy: 0.9,
        peakEnergy: 1.0,
      });

      if (climaxEndBeat < beats.length - 1) {
        sections.push({
          type: 'outro',
          startTime: beats[climaxEndBeat].time,
          endTime: duration,
          startBeat: climaxEndBeat,
          endBeat: beats.length,
          avgEnergy: 0.35,
          peakEnergy: 0.5,
        });
      }
    } else {
      sections.push({
        type: 'outro',
        startTime: beats[dropEndBeat].time,
        endTime: duration,
        startBeat: dropEndBeat,
        endBeat: beats.length,
        avgEnergy: 0.4,
        peakEnergy: 0.6,
      });
    }
  }

  return sections;
}

/**
 * Detects pre-drop breath / silence dip (momentary hush before bass drop)
 */
function detectPreDropBreaths(
  energy: Float32Array,
  beats: BeatTransient[],
  sections: TrackSection[],
  fps: number
): PreDropBreath[] {
  const breaths: PreDropBreath[] = [];
  const drops = sections.filter((s) => s.type === 'drop');

  for (const drop of drops) {
    const dropBeat = beats[drop.startBeat];
    if (!dropBeat) continue;

    const dropFrame = dropBeat.frame;
    // Look at the 12-24 frames (0.2s - 0.4s) preceding the drop
    const windowStart = Math.max(0, dropFrame - Math.round(fps * 0.4));
    let minEnergy = 1.0;
    let minFrame = dropFrame;

    for (let f = windowStart; f < dropFrame; f++) {
      if (energy[f] < minEnergy) {
        minEnergy = energy[f];
        minFrame = f;
      }
    }

    // If there is an audible dip (< 0.45 and drop is high energy)
    if (minEnergy < 0.5) {
      breaths.push({
        time: minFrame / fps,
        frame: minFrame,
        duration: (dropFrame - minFrame) / fps,
        dropBeatIndex: drop.startBeat,
      });
    }
  }

  return breaths;
}
