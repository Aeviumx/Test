import { ColorRGBA, LabelColor } from '../types';

export const LABEL_COLOR_MAP: Record<LabelColor, { hex: string; bg: string; border: string; name: string }> = {
  violet: { hex: '#6c5ce7', bg: 'rgba(108, 92, 231, 0.35)', border: '#6c5ce7', name: 'Violet' },
  teal: { hex: '#00d1b2', bg: 'rgba(0, 209, 178, 0.35)', border: '#00d1b2', name: 'Teal' },
  amber: { hex: '#f59e0b', bg: 'rgba(245, 158, 11, 0.35)', border: '#f59e0b', name: 'Amber' },
  rose: { hex: '#f43f5e', bg: 'rgba(244, 63, 94, 0.35)', border: '#f43f5e', name: 'Rose' },
  sky: { hex: '#0ea5e9', bg: 'rgba(14, 165, 233, 0.35)', border: '#0ea5e9', name: 'Sky' },
  emerald: { hex: '#10b981', bg: 'rgba(16, 185, 129, 0.35)', border: '#10b981', name: 'Emerald' },
  fuchsia: { hex: '#d946ef', bg: 'rgba(217, 70, 239, 0.35)', border: '#d946ef', name: 'Fuchsia' },
  slate: { hex: '#64748b', bg: 'rgba(100, 116, 139, 0.35)', border: '#64748b', name: 'Slate' },
};

export function hexToRgba(hex: string, alpha = 1): ColorRGBA {
  const clean = hex.replace('#', '').trim();
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16) / 255;
    const g = parseInt(clean[1] + clean[1], 16) / 255;
    const b = parseInt(clean[2] + clean[2], 16) / 255;
    return [
      Number.isNaN(r) ? 0 : r,
      Number.isNaN(g) ? 0 : g,
      Number.isNaN(b) ? 0 : b,
      alpha,
    ];
  }
  if (clean.length >= 6) {
    const r = parseInt(clean.slice(0, 2), 16) / 255;
    const g = parseInt(clean.slice(2, 4), 16) / 255;
    const b = parseInt(clean.slice(4, 6), 16) / 255;
    const a = clean.length === 8 ? parseInt(clean.slice(6, 8), 16) / 255 : alpha;
    return [
      Number.isNaN(r) ? 0 : r,
      Number.isNaN(g) ? 0 : g,
      Number.isNaN(b) ? 0 : b,
      Number.isNaN(a) ? alpha : a,
    ];
  }
  return [1, 1, 1, alpha];
}

export function rgbaToHex(rgba: ColorRGBA): string {
  const toByte = (v: number) =>
    Math.min(255, Math.max(0, Math.round(v * 255)))
      .toString(16)
      .padStart(2, '0');
  return `#${toByte(rgba[0])}${toByte(rgba[1])}${toByte(rgba[2])}`;
}

export function interpolateHexColor(colorA: string, colorB: string, t: number): string {
  const a = hexToRgba(colorA);
  const b = hexToRgba(colorB);
  return rgbaToHex([
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
    a[3] + (b[3] - a[3]) * t,
  ]);
}
