/**
 * Edit DNA Analyzer & Viral Style Recipes
 * Analyzes video edits or edit plans to extract rhythmic DNA (cut cadence, accent sync,
 * flash density, motion spikes) and defines reference recipes:
 * - Reference 1: Gacha Hype (Cards whip entrance + 3-hit syncopated reframe punches)
 * - Reference 2: Aesthetic Lyric (Character cutout over rain bokeh + karaoke lyrics)
 */

export interface EditStyleDNA {
  id: string;
  name: 'Gacha Hype' | 'Aesthetic Lyric' | 'Flow Phonk' | 'Custom';
  description: string;
  defaultAspectRatio: '9:16' | '1:1';
  bpmRange: [number, number];
  introPattern: {
    durationSec: number;
    type: 'gacha-cards-whip' | 'cutout-fade-in' | 'hard-impact';
    climaxShot?: string;
  };
  rhythmPattern: {
    cadence: 'syncopated-3hit' | 'straight-4' | 'lyric-flow';
    accentsPerMeasure: number;
    normalizedMeasureOffsets: number[]; // relative position 0.0..1.0 within measure (e.g. [0.0, 0.254, 0.728])
    reframeAlternation: boolean; // Alternates wide <-> close <-> eyes on accents
    effectsOnAccent: Array<'white-flash' | 'color-flash' | 'prism-rgb-split' | 'zoom-punch' | 'directional-blur' | 'impact-shake'>;
  };
  compositing: {
    useCharacterCutout: boolean;
    backgroundStyle: 'clean-graphic' | 'video-environment' | 'dark-bokeh';
    lightWrap: boolean;
    livelinessBreathing: boolean;
  };
  colorGrade: 'Anime Vivid' | 'Desaturated Mood' | 'Cold Night' | 'Warm Sunset' | 'Monochrome + 1 Color';
  typography?: {
    layout: 'side-block' | 'center-minimal' | 'bottom-subtitle';
    fontFamily: string;
    karaokeReveal: boolean;
    typewriterSignature: boolean;
    ornament?: string;
  };
}

/**
 * Standard Recipe 1: Gacha / Live2D Hype Edit (Reference 1 DNA)
 */
export const GACHA_HYPE_DNA: EditStyleDNA = {
  id: 'gacha-hype-ref1',
  name: 'Gacha Hype',
  description:
    'Gacha / Live2D hype edit: 0-4s cards whip entrance with red flash + group climax; 4-11s single art reframe alternating wide/close on repeating 3-hit syncopated accents with prism RGB flashes.',
  defaultAspectRatio: '9:16',
  bpmRange: [120, 145],
  introPattern: {
    durationSec: 4.0,
    type: 'gacha-cards-whip',
    climaxShot: 'Group Splash Climax',
  },
  rhythmPattern: {
    cadence: 'syncopated-3hit',
    accentsPerMeasure: 3,
    normalizedMeasureOffsets: [0.0, 0.254, 0.728], // Beat 1, Beat 2, Syncopation before Beat 4
    reframeAlternation: true,
    effectsOnAccent: [
      'white-flash',
      'prism-rgb-split',
      'zoom-punch',
      'directional-blur',
      'color-flash',
    ],
  },
  compositing: {
    useCharacterCutout: false,
    backgroundStyle: 'clean-graphic',
    lightWrap: false,
    livelinessBreathing: true,
  },
  colorGrade: 'Anime Vivid',
  typography: {
    layout: 'center-minimal',
    fontFamily: 'Montserrat',
    karaokeReveal: false,
    typewriterSignature: true,
  },
};

/**
 * Standard Recipe 2: Aesthetic Lyric Edit (Reference 2 DNA)
 */
export const AESTHETIC_LYRIC_DNA: EditStyleDNA = {
  id: 'aesthetic-lyric-ref2',
  name: 'Aesthetic Lyric',
  description:
    'Aesthetic lyric edit: character cutout over real-world video (rainy bokeh park); cold desaturated grade; subtle breathing/sway; word-level karaoke glow lyrics with "••" ornament; typewriter author signature with blinking cursor.',
  defaultAspectRatio: '9:16',
  bpmRange: [90, 130],
  introPattern: {
    durationSec: 1.5,
    type: 'cutout-fade-in',
  },
  rhythmPattern: {
    cadence: 'lyric-flow',
    accentsPerMeasure: 2,
    normalizedMeasureOffsets: [0.0, 0.5],
    reframeAlternation: false,
    effectsOnAccent: ['zoom-punch'],
  },
  compositing: {
    useCharacterCutout: true,
    backgroundStyle: 'video-environment',
    lightWrap: true,
    livelinessBreathing: true,
  },
  colorGrade: 'Desaturated Mood',
  typography: {
    layout: 'side-block',
    fontFamily: 'Montserrat',
    karaokeReveal: true,
    typewriterSignature: true,
    ornament: '••',
  },
};

export interface ExtractedDNA {
  totalDuration: number;
  cutCount: number;
  averageCutDurationSec: number;
  syncopationConfidence: number;
  detectedCadence: 'syncopated-3hit' | 'straight-4' | 'lyric-flow';
  flashCount: number;
  dominantColorGrade: string;
}

/**
 * Programmatically extracts editing DNA metrics from cut timestamps and effect markers
 */
export function extractEditDNA(options: {
  duration: number;
  cutTimestamps: number[];
  flashTimestamps?: number[];
  bpm?: number;
}): ExtractedDNA {
  const { duration, cutTimestamps, flashTimestamps = [], bpm = 124 } = options;
  const cuts = [...cutTimestamps].sort((a, b) => a - b);
  const cutCount = cuts.length;
  const avgCutDuration = cutCount > 1 ? duration / cutCount : duration;

  // Measure syncopation analysis
  const measureDur = (60 / bpm) * 4;
  let syncopatedHits = 0;

  cuts.forEach((t) => {
    const rel = (t % measureDur) / measureDur;
    // Check if cuts land on 3-hit syncopated points (~0.0, ~0.25, ~0.73)
    if (Math.abs(rel - 0.0) < 0.12 || Math.abs(rel - 0.25) < 0.12 || Math.abs(rel - 0.73) < 0.12) {
      syncopatedHits++;
    }
  });

  const syncConfidence = cutCount > 0 ? syncopatedHits / cutCount : 0.5;
  const detectedCadence = syncConfidence > 0.45 ? 'syncopated-3hit' : 'straight-4';

  return {
    totalDuration: Math.round(duration * 100) / 100,
    cutCount,
    averageCutDurationSec: Math.round(avgCutDuration * 100) / 100,
    syncopationConfidence: Math.round(syncConfidence * 100) / 100,
    detectedCadence,
    flashCount: flashTimestamps.length,
    dominantColorGrade: 'Anime Vivid',
  };
}

import { RhythmicAccent } from './rhythmPattern';
import { createId } from '../utils/id';

/**
 * Computes concrete cut and accent timestamps dynamically for ANY audio track
 * based on the DNA pattern definition and the audio's detected BPM/transients.
 * ZERO hardcoded timestamps!
 */
export function generateTrackAccentsFromDna(
  dna: EditStyleDNA,
  audio: {
    bpm: number;
    duration: number;
    beats?: Array<{ time: number; strength?: number; isDownbeat?: boolean }>;
    startOffset?: number; // e.g. after intro (e.g. 4.0s)
    fps?: number;
  }
): RhythmicAccent[] {
  const bpm = Math.max(40, audio.bpm || 120);
  const measureDur = (60 / bpm) * 4;
  const startT = audio.startOffset ?? dna.introPattern.durationSec;
  const fps = audio.fps ?? 60;
  const offsets = dna.rhythmPattern.normalizedMeasureOffsets;
  const beats = audio.beats || [];

  const accents: RhythmicAccent[] = [];
  const numMeasures = Math.ceil((audio.duration - startT) / measureDur);

  for (let m = 0; m < numMeasures; m++) {
    const mStart = startT + m * measureDur;

    offsets.forEach((relOff, idx) => {
      let hitTime = mStart + relOff * measureDur;
      if (hitTime >= audio.duration) return;

      // Snap to closest transient within +/- 100ms if beats are available
      if (beats.length > 0) {
        let minDiff = 0.10;
        let matchedTime = hitTime;
        for (const b of beats) {
          const diff = Math.abs(b.time - hitTime);
          if (diff < minDiff) {
            minDiff = diff;
            matchedTime = b.time;
          }
        }
        hitTime = matchedTime;
      }

      const strength: 'strong' | 'medium' | 'weak' =
        idx === 0 ? 'strong' : idx === 1 ? 'medium' : 'strong';

      accents.push({
        id: createId('acc'),
        time: Math.round(hitTime * 1000) / 1000,
        frame: Math.round(hitTime * fps),
        strength,
        score: idx === 0 ? 1.0 : 0.85,
        measureIndex: m,
        offsetInMeasure: Math.round(relOff * 1000) / 1000,
        band: idx === 0 ? 'kick' : idx === 1 ? 'snare' : 'kick',
      });
    });
  }

  return accents;
}
