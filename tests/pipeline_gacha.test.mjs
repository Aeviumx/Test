// Конвейер Gacha Hype на реальном треке: анализ, план и линтер без захардкоженных таймингов.
import { describe, it, expect } from 'vitest';
import path from 'path';
import { analyzeTrack, findDrop, accentPattern } from '../pipeline/audio.mjs';
import { buildPlan } from '../pipeline/styles/gachaHype.mjs';
import { loadArtMeta } from '../pipeline/art.mjs';
import { lintPlan } from '../pipeline/lint.mjs';
import { frameFor, faceInFrame } from '../pipeline/framing.mjs';

const TRACK = path.resolve('test-assets/real/track_02_midnight_phonk.mp3');
const ART = ['gacha_liv.png', 'gacha_lucia.png', 'gacha_vera.png'].map((f) => path.resolve('test-assets/real/art', f));

describe('анализ трека', () => {
  const a = analyzeTrack(TRACK);

  it('темп около 123 BPM (метроном совпадает с бочкой)', () => {
    expect(a.bpm).toBeGreaterThan(120);
    expect(a.bpm).toBeLessThan(126);
  });

  it('дроп на сильной доле около 15.8 с, а не на раннем подъёме громкости', () => {
    const d = findDrop(a, 2, 7);
    expect(Math.abs(d.time - 15.8)).toBeLessThan(0.1);
    expect(d.rise).toBeGreaterThan(3);
  });

  it('ритмический рисунок всегда включает сильную долю', () => {
    const d = findDrop(a, 2, 7);
    const p = accentPattern(a, d.bar, d.bar + 6);
    expect(p.positions[0]).toBe(0);
    expect(p.positions.length).toBe(3);
  });
});

describe('план Gacha Hype', () => {
  const plan = buildPlan({ audioFile: TRACK, assets: loadArtMeta(ART) });

  it('проходит линтер', () => {
    const res = lintPlan(plan);
    expect(res.errors).toEqual([]);
  });

  it('вспышки только на сильных долях и без стробоскопа', () => {
    const flashes = plan.events.filter((e) => e.type === 'flash');
    expect((flashes.length / plan.duration) * 10).toBeLessThanOrEqual(10);
    for (const f of flashes) expect(plan.accents.some((a) => a.flash && Math.abs(a.t - f.t) < 1e-6)).toBe(true);
  });

  it('акценты стоят на реальных атаках трека', () => {
    const snapped = plan.accents.filter((a) => a.snapped).length;
    expect(snapped / plan.accents.length).toBeGreaterThan(0.66);
  });

  it('на всех крупных планах лицо целиком в кадре', () => {
    for (const s of plan.shots.filter((x) => x.framing === 'close' || x.framing === 'mid')) {
      const asset = plan.assets[s.asset];
      const [x, y, w, h] = faceInFrame(asset, frameFor(asset, s.framing, plan.width, plan.height), 1.18);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(x + w).toBeLessThanOrEqual(plan.width);
      expect(y + h).toBeLessThanOrEqual(plan.height);
    }
  });
});
