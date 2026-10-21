import { ColorRGBA, LabelColor } from '../types';

export const LABEL_COLOR_MAP: Record<LabelColor, { hex: string; bg: string; border: string; name: string }> = {
  // Midnight Ice Cool Muted Palette (Ice, Denim, Steel, Mint, Lavender, Blush, Sand, Coral)
  ice: { hex: '#8cc4ec', bg: 'rgba(140, 196, 236, 0.28)', border: '#8cc4ec', name: 'Ice' },
  denim: { hex: '#55647c', bg: 'rgba(59, 70, 88, 0.45)', border: '#55647c', name: 'Denim' },
  steel: { hex: '#8796ab', bg: 'rgba(90, 106, 128, 0.35)', border: '#8796ab', name: 'Steel' },
  mint: { hex: '#7fd1b9', bg: 'rgba(127, 209, 185, 0.28)', border: '#7fd1b9', name: 'Mint' },
  lavender: { hex: '#8288a4', bg: 'rgba(130, 136, 164, 0.28)', border: '#8288a4', name: 'Lavender' },
  blush: { hex: '#f0d4d8', bg: 'rgba(240, 212, 216, 0.28)', border: '#f0d4d8', name: 'Blush' },
  sand: { hex: '#c4b89e', bg: 'rgba(196, 184, 158, 0.28)', border: '#c4b89e', name: 'Sand' },
  coral: { hex: '#d98b8b', bg: 'rgba(217, 139, 139, 0.28)', border: '#d98b8b', name: 'Coral' },
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
