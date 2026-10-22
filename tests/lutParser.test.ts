import { describe, it, expect } from 'vitest';
import { parseCubeLut, generatePresetCubeLut } from '../src/engine/lutParser';

describe('3D LUT (.cube) Parser & Preset Generator', () => {
  it('generates and parses a valid .cube file', () => {
    const cubeString = generatePresetCubeLut('cyberpunk', 8);
    expect(cubeString).toContain('TITLE "cyberpunk"');
    expect(cubeString).toContain('LUT_3D_SIZE 8');

    const lut = parseCubeLut(cubeString);
    expect(lut.title).toBe('cyberpunk');
    expect(lut.size).toBe(8);
    expect(lut.data.length).toBe(8 * 8 * 8 * 3); // 512 * 3 = 1536 floats
    expect(lut.data[0]).toBeGreaterThanOrEqual(0);
    expect(lut.data[0]).toBeLessThanOrEqual(1);
  });

  it('correctly parses domain min and max metadata', () => {
    const customCube = `
      # Custom test cube
      TITLE "Test Look"
      LUT_3D_SIZE 2
      DOMAIN_MIN 0.0 0.0 0.0
      DOMAIN_MAX 1.0 1.0 1.0
      0.0 0.0 0.0
      1.0 0.0 0.0
      0.0 1.0 0.0
      1.0 1.0 0.0
      0.0 0.0 1.0
      1.0 0.0 1.0
      0.0 1.0 1.0
      1.0 1.0 1.0
    `;

    const lut = parseCubeLut(customCube);
    expect(lut.title).toBe('Test Look');
    expect(lut.size).toBe(2);
    expect(lut.data.length).toBe(24);
    expect(lut.domainMax).toEqual([1.0, 1.0, 1.0]);
  });
});
