/**
 * Lyric Synchronization & Onset Alignment Engine
 * Parses raw lyrics or LRC files, aligns words to audio beats and vocal energy,
 * and generates synchronized word-level karaoke timelines.
 */

import { BeatTransient } from './audioAnalysis';
import { createId } from '../utils/id';

export interface LyricWord {
  id: string;
  text: string;
  startTime: number; // seconds
  endTime: number;   // seconds
  charStart: number; // character index inside line
  charEnd: number;
}

export interface LyricLine {
  id: string;
  text: string;
  startTime: number;
  endTime: number;
  words: LyricWord[];
  ornament?: string; // e.g. '••' or '✦'
  authorSignature?: string;
}

export interface LyricAlignmentOptions {
  bpm?: number;
  fps?: number;
  ornament?: string;
  authorSignature?: string;
  readingSpeedCharsPerSec?: number; // default ~14 chars/sec
}

/**
 * Parses LRC format (standard or word-enhanced LRC)
 */
export function parseLrcFormat(lrcContent: string): LyricLine[] {
  const lines = lrcContent.split(/\r?\n/);
  const result: LyricLine[] = [];

  // Match [mm:ss.xx] or [mm:ss.xxx]
  const timeRegex = /\[(\d{2}):(\d{2})(?:\.(\d{2,3}))?\]/g;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith('[ti:') || trimmed.startsWith('[ar:') || trimmed.startsWith('[al:')) {
      continue;
    }

    const matches = Array.from(trimmed.matchAll(timeRegex));
    if (matches.length === 0) continue;

    const text = trimmed.replace(timeRegex, '').trim();
    if (!text) continue;

    for (const match of matches) {
      const min = parseInt(match[1], 10);
      const sec = parseInt(match[2], 10);
      const msStr = match[3] || '0';
      const ms = parseFloat(`0.${msStr}`) * 1000;
      const startTime = min * 60 + sec + ms / 1000;

      // Extract words
      const rawWords = text.split(/\s+/).filter(Boolean);
      const lineDuration = Math.max(1.5, rawWords.length * 0.42);
      const endTime = startTime + lineDuration;

      const words: LyricWord[] = [];
      let charCursor = 0;
      const wordDur = lineDuration / Math.max(1, rawWords.length);

      rawWords.forEach((w, wIdx) => {
        const wStart = startTime + wIdx * wordDur;
        const wEnd = wStart + wordDur;
        const charStart = text.indexOf(w, charCursor);
        const charEnd = charStart + w.length;
        charCursor = charEnd;

        words.push({
          id: createId('word'),
          text: w,
          startTime: Math.round(wStart * 1000) / 1000,
          endTime: Math.round(wEnd * 1000) / 1000,
          charStart: charStart >= 0 ? charStart : 0,
          charEnd: charEnd >= 0 ? charEnd : w.length,
        });
      });

      result.push({
        id: createId('line'),
        text,
        startTime: Math.round(startTime * 1000) / 1000,
        endTime: Math.round(endTime * 1000) / 1000,
        words,
        ornament: '••',
      });
    }
  }

  return result.sort((a, b) => a.startTime - b.startTime);
}

/**
 * Automatically aligns raw lyrics (plain text lines) to audio transients and beats
 */
export function alignLyricsToAudio(
  plainLyrics: string,
  audioTransients: BeatTransient[] = [],
  startTime = 0.5,
  totalDuration = 15.0,
  options: LyricAlignmentOptions = {}
): LyricLine[] {
  const {
    ornament = '••',
    authorSignature,
    readingSpeedCharsPerSec = 14,
  } = options;

  const rawLines = plainLyrics
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (rawLines.length === 0) return [];

  const availableDuration = totalDuration - startTime;
  const timePerLine = availableDuration / rawLines.length;
  const result: LyricLine[] = [];

  for (let lIdx = 0; lIdx < rawLines.length; lIdx++) {
    const lineText = rawLines[lIdx];
    let lineStart = startTime + lIdx * timePerLine;

    // Snap line start to nearest audio transient (within +/- 250ms)
    if (audioTransients.length > 0) {
      let nearestT = lineStart;
      let minDiff = 0.25;
      for (const t of audioTransients) {
        const diff = Math.abs(t.time - lineStart);
        if (diff < minDiff) {
          minDiff = diff;
          nearestT = t.time;
        }
      }
      lineStart = nearestT;
    }

    const naturalDur = Math.max(1.2, lineText.length / readingSpeedCharsPerSec);
    const lineEnd = Math.min(totalDuration, lineStart + Math.min(timePerLine * 0.92, naturalDur));

    // Word segmentation
    const rawWords = lineText.split(/\s+/).filter(Boolean);
    const words: LyricWord[] = [];
    const lineDuration = lineEnd - lineStart;
    const wordDur = lineDuration / Math.max(1, rawWords.length);

    let charCursor = 0;
    rawWords.forEach((wordStr, wIdx) => {
      const wStart = lineStart + wIdx * wordDur;
      const wEnd = wStart + wordDur;
      const charStart = lineText.indexOf(wordStr, charCursor);
      const charEnd = charStart >= 0 ? charStart + wordStr.length : wordStr.length;
      charCursor = charEnd;

      words.push({
        id: createId('word'),
        text: wordStr,
        startTime: Math.round(wStart * 1000) / 1000,
        endTime: Math.round(wEnd * 1000) / 1000,
        charStart: charStart >= 0 ? charStart : 0,
        charEnd,
      });
    });

    result.push({
      id: createId('line'),
      text: lineText,
      startTime: Math.round(lineStart * 1000) / 1000,
      endTime: Math.round(lineEnd * 1000) / 1000,
      words,
      ornament,
      authorSignature,
    });
  }

  return result;
}
