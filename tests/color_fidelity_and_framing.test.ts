import { describe, it, expect } from 'vitest';
import {
  calculateColorDifferenceDeltaE,
  decontaminateMaskEdges,
  auditCutoutEdgeHalo,
} from '../src/engine/characterComposite';
import {
  calculateFaceLockedPushIn,
} from '../src/ai/artFraming';
import {
  calculateAestheticLyricLayout,
} from '../src/render/karaokeText';
import {
  auditFaceInFrameOnPushIn,
  auditTextBlocksIntersection,
  auditTextSafeZones,
  auditCharacterColorFidelity,
} from '../src/ai/editLinter';

describe('Block 6: Color Fidelity, Mask Decontamination, Face-Locked Push-In & Safe Zones', () => {
  it('should detect RGB/BGR channel corruption (Vera red hair turning blue)', () => {
    // Vera genuine hair: Red=152, Green=69, Blue=78
    const originalHairRgb: [number, number, number] = [152, 69, 78];
    const compositedCleanRgb: [number, number, number] = [150, 70, 77]; // slight lighting adjustment
    const corruptedBgrRgb: [number, number, number] = [78, 69, 152];    // BGR swap error

    // Clean match Delta E must be < 5.0
    const cleanDeltaE = calculateColorDifferenceDeltaE(originalHairRgb, compositedCleanRgb);
    expect(cleanDeltaE).toBeLessThan(5.0);

    const cleanAudit = auditCharacterColorFidelity(originalHairRgb, compositedCleanRgb);
    expect(cleanAudit.passed).toBe(true);

    // Corrupted BGR swap must be detected and fail
    const corruptedDeltaE = calculateColorDifferenceDeltaE(originalHairRgb, corruptedBgrRgb);
    expect(corruptedDeltaE).toBeGreaterThan(40.0);

    const corruptedAudit = auditCharacterColorFidelity(originalHairRgb, corruptedBgrRgb);
    expect(corruptedAudit.passed).toBe(false);
  });

  it('should decontaminate ragged white background halos on cutout edges', () => {
    const width = 16;
    const height = 16;
    const buffer = new Uint8ClampedArray(width * height * 4);

    // Fill center with dark character pixels (e.g. RGB [30, 40, 50], alpha 255)
    // Edge pixels with white background bleed (e.g. RGB [210, 210, 210], alpha 100)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        if (x >= 4 && x <= 11 && y >= 4 && y <= 11) {
          buffer[idx] = 40;
          buffer[idx + 1] = 40;
          buffer[idx + 2] = 50;
          buffer[idx + 3] = 255;
        } else if (x >= 2 && x <= 13 && y >= 2 && y <= 13) {
          // White halo edge
          buffer[idx] = 210;
          buffer[idx + 1] = 210;
          buffer[idx + 2] = 210;
          buffer[idx + 3] = 90;
        } else {
          buffer[idx + 3] = 0; // transparent
        }
      }
    }

    const preAudit = auditCutoutEdgeHalo(buffer, width, height);
    expect(preAudit.hasBrightHalo).toBe(true);

    const { cleanedPixels, haloRemovedCount } = decontaminateMaskEdges(buffer, width, height, {
      erodePx: 1.5,
      unmultWhite: true,
    });

    expect(haloRemovedCount).toBeGreaterThan(0);
    const postAudit = auditCutoutEdgeHalo(cleanedPixels, width, height);
    expect(postAudit.averageEdgeLuma).toBeLessThan(140);
  });

  it('should lock face in upper third during push-in and prevent top edge cutoff', () => {
    // Face at y=537px, height=220px in 1080x1920 comp
    const pushIn = calculateFaceLockedPushIn({
      compWidth: 1080,
      compHeight: 1920,
      faceCenter: [270, 537],
      faceBoxHeight: 220,
      startScale: 1.00,
      endScale: 1.36,
      duration: 3.0,
      basePosition: [270, 960],
      targetFaceYRatio: 0.28,
    });

    expect(pushIn.allFramesValid).toBe(true);
    expect(pushIn.frames.length).toBeGreaterThan(150);

    // Verify face never goes above y=0 across entire push-in
    for (const frame of pushIn.frames) {
      expect(frame.faceTop).toBeGreaterThanOrEqual(0);
      expect(frame.faceBottom).toBeLessThanOrEqual(1920);
    }

    // Verify with Linter
    const linterResult = auditFaceInFrameOnPushIn(
      pushIn.frames.map((f, i) => ({
        frameIndex: i,
        time: f.time,
        faceTop: f.faceTop,
        faceBottom: f.faceBottom,
      })),
      1920
    );
    expect(linterResult.passed).toBe(true);

    // Contrast with unlocked drift where face leaves the frame (top < 0)
    const badFrames = [
      { frameIndex: 0, time: 0.0, faceTop: 120, faceBottom: 340 },
      { frameIndex: 60, time: 1.0, faceTop: 20, faceBottom: 280 },
      { frameIndex: 120, time: 2.0, faceTop: -45, faceBottom: 240 }, // Cutoff!
    ];
    const badLinterResult = auditFaceInFrameOnPushIn(badFrames, 1920);
    expect(badLinterResult.passed).toBe(false);
    expect(badLinterResult.violations.length).toBe(1);
  });

  it('should layout lyrics, dynamic signature and character without collisions and within safe zones', () => {
    const layout = calculateAestheticLyricLayout({
      compWidth: 1080,
      compHeight: 1920,
      lineCount: 4,
      longestLineLength: 32,
      signatureText: 'Shape of You • Ed Sheeran (Slowed + Reverb)',
      characterRightEdge: 510,
    });

    expect(layout.hasCollision).toBe(false);
    expect(layout.isInsideSafeZone).toBe(true);
    expect(layout.signatureBox.y).toBeGreaterThan(layout.lyricBlockBox.y + layout.lyricBlockBox.height);

    // Verify with Linter
    const intersectionReport = auditTextBlocksIntersection([
      { id: 'Lyrics', ...layout.lyricBlockBox },
      { id: 'Signature', ...layout.signatureBox },
    ]);
    expect(intersectionReport.passed).toBe(true);

    const safeZoneReport = auditTextSafeZones(
      [
        { id: 'Lyrics', ...layout.lyricBlockBox },
        { id: 'Signature', ...layout.signatureBox },
      ],
      1080,
      1920
    );
    expect(safeZoneReport.passed).toBe(true);
  });
});
