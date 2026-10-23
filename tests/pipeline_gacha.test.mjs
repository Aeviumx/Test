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

describe('план Velocity (твикстор)', async () => {
  const { buildPlan: buildVelocity, sourceAt } = await import('../pipeline/styles/velocity.mjs');
  const { loadClipMeta } = await import('../pipeline/clips.mjs');
  const clips = loadClipMeta([path.resolve('public/assets/makima_twixtor.mp4')]);
  const plan = buildVelocity({ audioFile: TRACK, clips });

  it('проходит линтер', () => {
    expect(lintPlan(plan).errors).toEqual([]);
  });

  it('склейки на сильных долях, время исходника внутри своей сцены и только вперёд', () => {
    for (const s of plan.shots) {
      const scene = clips[0].scenes[s.scene];
      let prev = -Infinity;
      for (let t = s.start; t < s.end; t += 1 / 60) {
        const { src, speed } = sourceAt(s, t);
        expect(src).toBeGreaterThanOrEqual(scene.start - 1e-6);
        expect(src).toBeLessThanOrEqual(scene.end + 1e-6);
        expect(src).toBeGreaterThanOrEqual(prev - 1e-9);
        expect(speed).toBeGreaterThan(0);
        prev = src;
      }
    }
  });

  it('окно 9:16 по чётным пикселям, внутри кадра, траектория персонажа не выводит его за окно', () => {
    for (const s of plan.shots) {
      const clip = plan.clips[s.clip];
      expect(s.crop.x % 2).toBe(0);
      expect(s.crop.w % 2).toBe(0);
      expect(s.crop.x + s.crop.w).toBeLessThanOrEqual(clip.width);
      expect(s.viewW).toBeLessThanOrEqual(s.crop.w);
      for (const [, x] of s.track || []) {
        expect(x).toBeGreaterThanOrEqual(s.crop.x);
        expect(x + s.viewW).toBeLessThanOrEqual(s.crop.x + s.crop.w);
      }
    }
  });

  it('общий план (метка wide) в эдит не попадает', () => {
    const tagged = clips.map((c) => ({ ...c, scenes: c.scenes.map((s, i) => (i === plan.shots[0].scene ? { ...s, scale: 'wide' } : s)) }));
    const p2 = buildVelocity({ audioFile: TRACK, clips: tagged });
    expect(p2.shots.some((s) => s.scene === plan.shots[0].scene)).toBe(false);
  });

  it('склейка по движению: направление в конце кадра совпадает с началом следующего', async () => {
    // две «сцены» с движением вправо и одна — влево: после правого рывка выбирается правый
    const flow = (dx) => Array.from({ length: 60 }, () => [dx, 0]);
    const curve = Array.from({ length: 60 }, (_, i) => (i % 10 === 5 ? 9 : 2));
    const mk = (id, dx) => ({
      id, path: `/x/${id}.mp4`, fps: 60, width: 1920, height: 1080, curve_rate: 20,
      scenes: [{ start: 0, end: 3, motion: 3, peak: 0.25, face: null, curve, flow: flow(dx), luma: 90, contrast: 40, dup: 0 }],
    });
    const p3 = buildVelocity({ audioFile: TRACK, clips: [mk('a_right', 0.8), mk('b_right', 0.8), mk('c_left', -0.8), mk('d_right', 0.8)] });
    expect(p3.matchCuts.length).toBeGreaterThan(0);
    for (const m of p3.matchCuts) expect(m.cos).toBeGreaterThan(0.6);
  });

  it('на ударе замедление, перед следующим ударом разгон', () => {
    const s = plan.shots[plan.shots.length - 1];
    const r = s.ramps[0];
    expect(sourceAt(s, r.a + 0.01).speed).toBeLessThan(sourceAt(s, r.b - 0.01).speed);
  });
});

describe('звуковые эффекты', async () => {
  const { planSfx } = await import('../pipeline/sfx.mjs');
  const lib = {
    impact: [
      { type: 'impact', file: 'thunder.wav', duration: 4.9, attack: 0.211, peak: 0.274, peakAbs: 1 },
      { type: 'impact', file: 'heartbeat.wav', duration: 2.9, attack: 0.004, peak: 1.284, peakAbs: 1 },
    ],
    subdrop: [{ type: 'subdrop', file: 'sub.wav', duration: 1.0, attack: 0.001, peak: 0.02, peakAbs: 1 }],
    whoosh: [{ type: 'whoosh', file: 'whoosh.wav', duration: 2.2, attack: 0.6, peak: 0.63, peakAbs: 1 }],
    riser: [{ type: 'riser', file: 'riser.wav', duration: 1.89, attack: 1.29, peak: 1.85, peakAbs: 0.5 }],
  };
  const accents = [
    { t: 1.95, audioT: 1.988, flash: true },
    { t: 2.7, audioT: 2.73, flash: false },
    { t: 3.93, audioT: 3.965, flash: true },
  ];
  const out = planSfx(lib, { duration: 15, dropAt: 1.97, accents, transitions: [{ t: 3.93, type: 'whip', duration: 0.1 }] });

  it('атака удара — на ударе дропа, пик нарастания — на дропе, пик «вжуха» — на склейке', () => {
    const imp = out.find((x) => x.type === 'impact');
    expect(imp.file).toBe('thunder.wav');
    expect(Math.abs(imp.at + 0.211 - 1.988)).toBeLessThan(0.002);
    const riser = out.find((x) => x.type === 'riser');
    expect(Math.abs(riser.at + 1.85 - 1.988)).toBeLessThan(0.002);
    expect(riser.at + riser.dur).toBeLessThanOrEqual(1.988 + 0.031);
    const wh = out.find((x) => x.type === 'whoosh');
    expect(Math.abs(wh.at + 0.63 - 3.965)).toBeLessThan(0.002);
  });

  it('«сердцебиение» с пиком через секунду в удары не попадает', () => {
    expect(out.some((x) => x.file === 'heartbeat.wav')).toBe(false);
  });
});
