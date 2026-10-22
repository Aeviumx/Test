/**
 * Rhythm Pattern Detector & Syncopation Analysis Engine
 * Detects recurring rhythmic accent patterns across measures (e.g. 3-hit syncopations),
 * categorizes accents into strong/medium/weak, and provides tap-quantization for editors.
 */

import { BeatTransient, DeepAudioAnalysisResult } from './audioAnalysis';
import { createId } from '../utils/id';

export interface RhythmicAccent {
  id: string;
  time: number;          // seconds
  frame: number;         // target frame index
  strength: 'strong' | 'medium' | 'weak';
  score: number;         // 0..1 normalized prominence
  band?: string;         // 'kick' | 'snare' | 'vocal' | 'synth' | 'transient'
  measureIndex: number;  // 0-based bar index
  offsetInMeasure: number; // 0..1 normalized position inside measure
}

export interface RhythmPatternResult {
  bpm: number;
  measureDuration: number; // seconds per bar
  patternType: 'syncopated-3hit' | 'straight-4' | 'phonk-syncopated' | 'triplet-flow' | 'complex';
  patternConfidence: number; // 0..1
  normalizedOffsets: number[]; // e.g. [0.0, 0.254, 0.728] for 3-hit
  accents: RhythmicAccent[];
}

export interface AccentMapInput {
  bpm: number;
  beats: Array<{
    time: number;
    frame?: number;
    strength: number;
    isDownbeat?: boolean;
    frequencyBand?: string;
  }>;
  duration: number;
  fps?: number;
}

/**
 * Detects recurring measure syncopation motifs from audio analysis beats
 */
export function detectRhythmAccents(
  analysis: DeepAudioAnalysisResult | AccentMapInput
): RhythmPatternResult {
  const bpm = Math.max(40, analysis.bpm || 120);
  const fps = 'fps' in analysis && analysis.fps ? analysis.fps : 60;
  const measureDuration = (60 / bpm) * 4; // Standard 4/4 bar duration in seconds
  const beats = analysis.beats;

  if (!beats || beats.length === 0) {
    // Generate default syncopated pattern if no beats found
    const defaultAccents = generateSyncopatedAccentsFromBpm(bpm, analysis.duration, 'ref1-syncopated-3hit', fps);
    return {
      bpm,
      measureDuration,
      patternType: 'syncopated-3hit',
      patternConfidence: 0.85,
      normalizedOffsets: [0.0, 0.254, 0.728],
      accents: defaultAccents,
    };
  }

  // Find track measure boundaries
  const totalDuration = analysis.duration;
  const numMeasures = Math.max(1, Math.ceil(totalDuration / measureDuration));

  // Collect candidate hits with sufficient transient strength
  const accents: RhythmicAccent[] = [];
  const normalizedPositions: number[] = [];

  for (let m = 0; m < numMeasures; m++) {
    const mStart = m * measureDuration;
    const mEnd = mStart + measureDuration;

    // Find beats within this measure
    const measureBeats = beats.filter((b) => b.time >= mStart - 0.05 && b.time < mEnd - 0.05);
    if (measureBeats.length === 0) continue;

    // Sort by strength descending to pick top accent candidates
    const sorted = [...measureBeats].sort((a, b) => (b.strength || 0) - (a.strength || 0));
    // Keep up to 3-4 top hits per measure to prevent spammy cuts
    const topHits = sorted.slice(0, 3).sort((a, b) => a.time - b.time);

    topHits.forEach((hit, hIdx) => {
      const relTime = hit.time - mStart;
      const normPos = Math.max(0, Math.min(1, relTime / measureDuration));
      normalizedPositions.push(normPos);

      let strength: 'strong' | 'medium' | 'weak';
      const rawStrength = hit.strength ?? 0.5;

      if (hit.isDownbeat || hIdx === 0 || rawStrength > 0.78) {
        strength = 'strong';
      } else if (rawStrength > 0.45) {
        strength = 'medium';
      } else {
        strength = 'weak';
      }

      accents.push({
        id: createId('acc'),
        time: Math.round(hit.time * 1000) / 1000,
        frame: Math.round(hit.time * fps),
        strength,
        score: Math.min(1, rawStrength),
        band: hit.frequencyBand || 'transient',
        measureIndex: m,
        offsetInMeasure: Math.round(normPos * 1000) / 1000,
      });
    });
  }

  // Deduce pattern type by clustering normalized measure positions
  // Check if hits cluster around Reference 1 style: ~0.0, ~0.25, ~0.72
  let cluster3HitScore = 0;
  for (const pos of normalizedPositions) {
    if (Math.abs(pos - 0.0) < 0.12 || Math.abs(pos - 0.25) < 0.12 || Math.abs(pos - 0.72) < 0.12) {
      cluster3HitScore++;
    }
  }

  const confidence = normalizedPositions.length > 0 ? cluster3HitScore / normalizedPositions.length : 0.8;
  const patternType = confidence > 0.45 ? 'syncopated-3hit' : 'straight-4';

  return {
    bpm,
    measureDuration: Math.round(measureDuration * 1000) / 1000,
    patternType,
    patternConfidence: Math.round(confidence * 100) / 100,
    normalizedOffsets: patternType === 'syncopated-3hit' ? [0.0, 0.254, 0.728] : [0.0, 0.25, 0.5, 0.75],
    accents,
  };
}

/**
 * Generates Reference 1 style syncopated accents for a given BPM and duration
 * (e.g. 130 BPM with hits at +0.0s, +0.47s, +1.35s in each 1.846s measure)
 */
export function generateSyncopatedAccentsFromBpm(
  bpm: number,
  duration: number,
  patternType: 'ref1-syncopated-3hit' | 'phonk-4hit' | 'straight-4' = 'ref1-syncopated-3hit',
  fps = 60
): RhythmicAccent[] {
  const measureDuration = (60 / bpm) * 4;
  const numMeasures = Math.ceil(duration / measureDuration);
  const accents: RhythmicAccent[] = [];

  let offsets: number[];
  if (patternType === 'ref1-syncopated-3hit') {
    // Exact Reference 1 DNA: 0.0s, +0.47s, +1.35s (rel delta = 0.47s, 0.88s, 0.50s)
    offsets = [0.0, 0.468, 1.348];
  } else if (patternType === 'phonk-4hit') {
    offsets = [0.0, measureDuration * 0.33, measureDuration * 0.66, measureDuration * 0.85];
  } else {
    offsets = [0.0, measureDuration * 0.25, measureDuration * 0.5, measureDuration * 0.75];
  }

  for (let m = 0; m < numMeasures; m++) {
    const mStart = m * measureDuration;
    offsets.forEach((off, idx) => {
      const t = mStart + off;
      if (t >= duration) return;

      const strength: 'strong' | 'medium' | 'weak' = idx === 0 ? 'strong' : idx === 1 ? 'medium' : 'strong';
      accents.push({
        id: createId('acc'),
        time: Math.round(t * 1000) / 1000,
        frame: Math.round(t * fps),
        strength,
        score: idx === 0 ? 1.0 : 0.85,
        measureIndex: m,
        offsetInMeasure: Math.round((off / measureDuration) * 1000) / 1000,
        band: idx === 0 ? 'kick' : idx === 1 ? 'snare' : 'kick',
      });
    });
  }

  return accents;
}

/**
 * Quantizes editor tap timestamps (from manual live tap mode) to the nearest audio transient.
 * Threshold window: +/- 140ms. If within window, snaps to transient frame; otherwise keeps tap time.
 */
export function quantizeTapAccents(
  tapTimestamps: number[],
  audioSource: { beats?: Array<{ time: number; strength?: number; isDownbeat?: boolean }> },
  fps = 60,
  windowSeconds = 0.14
): RhythmicAccent[] {
  const beats = audioSource.beats || [];
  const accents: RhythmicAccent[] = [];

  tapTimestamps.forEach((tapTime, idx) => {
    // Find closest audio transient beat
    let closestBeat: (typeof beats)[0] | null = null;
    let minDiff = windowSeconds;

    for (const b of beats) {
      const diff = Math.abs(b.time - tapTime);
      if (diff < minDiff) {
        minDiff = diff;
        closestBeat = b;
      }
    }

    const finalTime = closestBeat ? closestBeat.time : tapTime;
    const isDown = closestBeat?.isDownbeat ?? (idx % 3 === 0);
    const strength: 'strong' | 'medium' | 'weak' = isDown ? 'strong' : 'medium';

    accents.push({
      id: createId('acc_tap'),
      time: Math.round(finalTime * 1000) / 1000,
      frame: Math.round(finalTime * fps),
      strength,
      score: closestBeat?.strength ?? 0.8,
      measureIndex: Math.floor(finalTime / 2.0),
      offsetInMeasure: 0,
      band: isDown ? 'kick' : 'snare',
    });
  });

  return accents;
}
