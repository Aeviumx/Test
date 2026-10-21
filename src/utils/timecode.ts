/**
 * Formats time in seconds to SMPTE timecode: HH:MM:SS:FF
 */
export function formatTimecode(seconds: number, fps: number): string {
  const safeSeconds = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const safeFps = Math.max(1, Math.round(fps || 30));
  const totalFrames = Math.round(safeSeconds * safeFps);

  const frames = totalFrames % safeFps;
  const totalWholeSeconds = Math.floor(totalFrames / safeFps);
  const secs = totalWholeSeconds % 60;
  const totalMinutes = Math.floor(totalWholeSeconds / 60);
  const mins = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);

  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(hours)}:${pad(mins)}:${pad(secs)}:${pad(frames)}`;
}

/**
 * Formats seconds to compact ruler timecode MM:SS:FF or SS:FF
 */
export function formatShortTimecode(seconds: number, fps: number): string {
  const safeSeconds = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const safeFps = Math.max(1, Math.round(fps || 30));
  const totalFrames = Math.round(safeSeconds * safeFps);
  const frames = totalFrames % safeFps;
  const totalWholeSeconds = Math.floor(totalFrames / safeFps);
  const secs = totalWholeSeconds % 60;
  const mins = Math.floor(totalWholeSeconds / 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  if (mins > 0) {
    return `${pad(mins)}:${pad(secs)}:${pad(frames)}`;
  }
  return `${pad(secs)}:${pad(frames)}`;
}

/**
 * Parses a timecode string (HH:MM:SS:FF, MM:SS:FF, SS:FF, or decimal seconds) into seconds
 */
export function parseTimecode(input: string, fps: number): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (trimmed.includes(':')) {
    const parts = trimmed.split(':').map((p) => Number(p));
    if (parts.some((n) => Number.isNaN(n) || n < 0)) return null;
    let hours = 0;
    let mins = 0;
    let secs = 0;
    let frames = 0;
    if (parts.length === 4) {
      [hours, mins, secs, frames] = parts;
    } else if (parts.length === 3) {
      [mins, secs, frames] = parts;
    } else if (parts.length === 2) {
      [secs, frames] = parts;
    } else {
      return null;
    }
    return hours * 3600 + mins * 60 + secs + frames / Math.max(1, fps);
  }

  const num = Number(trimmed);
  if (Number.isNaN(num)) return null;
  return Math.max(0, num);
}

/**
 * Snaps a time in seconds to the nearest exact frame boundary
 */
export function snapToFrame(time: number, fps: number): number {
  const safeFps = Math.max(1, fps);
  return Math.round(time * safeFps) / safeFps;
}

export function timeToFrame(time: number, fps: number): number {
  return Math.round(Math.max(0, time) * Math.max(1, fps));
}

export function frameToTime(frame: number, fps: number): number {
  return Math.max(0, frame) / Math.max(1, fps);
}

export function clamp(val: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, val));
}
