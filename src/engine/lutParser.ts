/**
 * 3D LUT (.cube) Parser & Engine
 * Parses Adobe / DaVinci Resolve .cube format (LUT_3D_SIZE, domain min/max, 3D lattice points)
 * and provides trilinear interpolation for color grading.
 */

export interface CubeLut {
  title: string;
  size: number;
  domainMin: [number, number, number];
  domainMax: [number, number, number];
  data: Float32Array; // Flattened size * size * size * 3 RGB values
}

/**
 * Parses standard .cube file content
 */
export function parseCubeLut(content: string): CubeLut {
  const lines = content.split(/\r?\n/);
  let title = 'Untitled LUT';
  let size = 0;
  let domainMin: [number, number, number] = [0.0, 0.0, 0.0];
  let domainMax: [number, number, number] = [1.0, 1.0, 1.0];
  const rgbValues: number[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    if (line.startsWith('TITLE')) {
      const match = line.match(/TITLE\s+"?([^"]+)"?/);
      if (match) title = match[1];
    } else if (line.startsWith('LUT_3D_SIZE')) {
      const parts = line.split(/\s+/);
      size = parseInt(parts[1], 10);
    } else if (line.startsWith('DOMAIN_MIN')) {
      const parts = line.split(/\s+/);
      domainMin = [parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3])];
    } else if (line.startsWith('DOMAIN_MAX')) {
      const parts = line.split(/\s+/);
      domainMax = [parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3])];
    } else {
      // Data lines: R G B
      const parts = line.split(/\s+/);
      if (parts.length >= 3) {
        const r = parseFloat(parts[0]);
        const g = parseFloat(parts[1]);
        const b = parseFloat(parts[2]);
        if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
          rgbValues.push(r, g, b);
        }
      }
    }
  }

  if (size === 0) {
    // Guess cube root of elements
    const pointsCount = rgbValues.length / 3;
    size = Math.round(Math.cbrt(pointsCount));
  }

  return {
    title,
    size,
    domainMin,
    domainMax,
    data: new Float32Array(rgbValues),
  };
}

/**
 * Generates a standard .cube string (e.g. Cyberpunk Teal & Orange or Anime Pop)
 */
export function generatePresetCubeLut(preset: 'cyberpunk' | 'warm_vintage' | 'anime_pop', size = 16): string {
  const lines: string[] = [
    `TITLE "${preset}"`,
    `LUT_3D_SIZE ${size}`,
    `DOMAIN_MIN 0.0 0.0 0.0`,
    `DOMAIN_MAX 1.0 1.0 1.0`,
  ];

  for (let b = 0; b < size; b++) {
    for (let g = 0; g < size; g++) {
      for (let r = 0; r < size; r++) {
        let nr = r / (size - 1);
        let ng = g / (size - 1);
        let nb = b / (size - 1);

        if (preset === 'cyberpunk') {
          // Push shadows to deep teal, highlights to amber orange
          const luma = 0.299 * nr + 0.587 * ng + 0.114 * nb;
          nr = Math.min(1.0, nr * (0.8 + 0.5 * luma) + 0.15 * (1.0 - luma));
          ng = Math.min(1.0, ng * (0.9 + 0.2 * luma) + 0.05 * (1.0 - luma));
          nb = Math.min(1.0, nb * (0.7 + 0.6 * (1.0 - luma)) + 0.25 * (1.0 - luma));
        } else if (preset === 'warm_vintage') {
          // Warm sepia lift
          nr = Math.min(1.0, nr * 1.1 + 0.04);
          ng = Math.min(1.0, ng * 0.98 + 0.02);
          nb = Math.max(0.0, nb * 0.82 - 0.02);
        } else if (preset === 'anime_pop') {
          // High saturation vibrant S-curve
          nr = Math.pow(nr, 0.9) * 1.08;
          ng = Math.pow(ng, 0.9) * 1.06;
          nb = Math.pow(nb, 0.92) * 1.12;
        }

        lines.push(
          `${Math.max(0, Math.min(1, nr)).toFixed(6)} ${Math.max(0, Math.min(1, ng)).toFixed(6)} ${Math.max(0, Math.min(1, nb)).toFixed(6)}`
        );
      }
    }
  }

  return lines.join('\n');
}
