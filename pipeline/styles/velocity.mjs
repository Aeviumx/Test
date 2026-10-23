// Стиль Velocity (твикстор-эдит): склейка на каждом акценте ритмического рисунка; каждый отрезок
// начинается на пике движения сцены (удар, взмах, рывок) с замедлением и разгоняется к следующему удару
// со смешиванием кадров. Вспышки — только на сильные доли после дропа, на склейках сильных долей —
// чередование «зум-прохода» и «вжуха».
import { buildRhythm, audioBlock } from '../rhythm.mjs';
import { planSfx } from '../sfx.mjs';

export const STYLE_ID = 'velocity';

// профиль скорости на отрезке между ударами: speed(τ) = smin + (smax - smin)·τ^p, τ ∈ [0, 1]
const RAMP_DOWNBEAT = { smin: 0.25, smax: 3.2, p: 2.4 }; // сильная доля: самое глубокое замедление
const RAMP_ACCENT = { smin: 0.45, smax: 2.6, p: 2.2 }; // остальные удары такта — мягче
const RAMP_INTRO = { smin: 0.55, smax: 1.7, p: 1.8 };
const PRE_ROLL = 0.04; // замедление начинается чуть раньше пика движения, чтобы удар был виден целиком
const EDGE_FRAMES = 2; // не берём кадры у самой склейки исходника

export const rampNorm = (r) => r.smin + (r.smax - r.smin) / (r.p + 1);

/** Источник клипа: нарезки одного видео (name_01.mp4, name_02.mp4…) — один источник. */
const sourceOf = (clip) => clip.source || clip.id.replace(/[_-]\d+$/, '');

export function buildPlan({ audioFile, clips, targetDuration = 15, width = 1080, height = 1920, fps = 60, signature = '', leadFrames = 2, sfxLibrary = null }) {
  const r = buildRhythm({ audioFile, introBars: 1, targetDuration, fps, leadFrames });

  // отрезки между ударами: в интро — склейка каждые 2 доли, после дропа — на каждом акценте рисунка
  const points = [
    ...r.introAccents.filter((a) => a.pos % 8 === 0).map((a) => ({ t: a.t, kind: 'intro', pos: a.pos, bar: a.bar })),
    ...r.accents.map((a) => ({ t: a.t, kind: 'drop', pos: a.pos, bar: a.bar })),
  ].sort((a, b) => a.t - b.t);
  points[0].t = 0;
  const segs = points.map((p, i) => {
    const b = i + 1 < points.length ? points[i + 1].t : r.duration;
    const prof = p.kind === 'intro' ? RAMP_INTRO : p.pos === 0 ? RAMP_DOWNBEAT : RAMP_ACCENT;
    return { ...p, a: p.t, b, prof, need: (b - p.t) * rampNorm(prof) };
  });

  // «моменты» — пики движения внутри сцен (удар, взмах, рывок): на них ставится замедление
  const moments = [];
  const allCurve = [];
  for (const c of clips) {
    const rate = c.curve_rate || 20;
    c.scenes.forEach((sc, idx) => {
      // совсем тёмные «каши» не берём вообще (если клип не размечен по яркости — берём)
      if (sc.luma !== undefined && (sc.luma < 30 || sc.contrast < 18)) return;
      // «растянутое» видео с кучей повторяющихся кадров дёргается при замедлении — не берём
      if (sc.dup !== undefined && sc.dup > 0.2) return;
      const s0 = sc.start + EDGE_FRAMES / c.fps;
      const s1 = sc.end - EDGE_FRAMES / c.fps;
      if (s1 - s0 < 0.35) return;
      const curve = sc.curve && sc.curve.length ? sc.curve : [sc.motion];
      allCurve.push(...curve);
      const mx = Math.max(...curve);
      curve.forEach((v, i) => {
        const prev = curve[i - 1] ?? -1;
        const next = curve[i + 1] ?? -1;
        if (v >= prev && v >= next && v >= 0.35 * mx) {
          moments.push({ clip: c, idx, scene: sc, s0, s1, t: Math.max(s0, sc.start + i / rate - PRE_ROLL), value: v });
        }
      });
      moments.push({ clip: c, idx, scene: sc, s0, s1, t: s0, value: curve[0] }); // начало сцены — запасной вариант
    });
  }
  if (!moments.length) throw new Error('В клипах нет сцен длиннее 0.35 с — нечего монтировать.');
  const sorted = [...allCurve].sort((a, b) => a - b);
  const ref = sorted[Math.floor(sorted.length * 0.9)] || 1;

  // распределение: сначала сильные доли после дропа (им — самые сильные моменты), потом остальные;
  // соседние отрезки — из разных клипов, куски сцен не повторяются
  const used = new Map(); // ключ сцены → занятые интервалы исходника
  const clipUses = new Map();
  const groupUses = new Map();
  const assign = new Array(segs.length).fill(null);
  const overlaps = (key, a, b) => (used.get(key) || []).some(([x, y]) => a < y - 0.02 && b > x + 0.02);
  const pick = (i, allowOverlap) => {
    const seg = segs[i];
    // соседние отрезки — из разных источников: нарезки одного боя (name_01, name_02…) считаются одним
    const near = [assign[i - 1], assign[i + 1], assign[i - 2]].filter(Boolean).map((x) => sourceOf(x.clip));
    let best = null;
    for (const m of moments) {
      const k = Math.min(1, (m.s1 - m.t) / seg.need);
      if (k < 0.55) continue;
      const key = `${m.clip.id}#${m.idx}`;
      if (!allowOverlap && overlaps(key, m.t, m.t + seg.need * k)) continue;
      let sc = Math.min(1.5, m.value / ref) * (m.scene.face ? 1.15 : 1) * (0.6 + 0.4 * k);
      // тёмные или бесконтрастные сцены зритель не разберёт, как бы они ни двигались
      if (m.scene.luma !== undefined && (m.scene.luma < 40 || m.scene.contrast < 20)) sc *= 0.2;
      if (near.includes(sourceOf(m.clip))) sc *= 0.15;
      sc *= 0.85 ** (clipUses.get(m.clip.id) || 0);
      sc *= 0.92 ** (groupUses.get(sourceOf(m.clip)) || 0);
      if (!best || sc > best.sc) best = { m, k, sc, key };
    }
    return best;
  };
  const order = [
    ...segs.map((s, i) => i).filter((i) => segs[i].kind === 'drop' && segs[i].pos === 0),
    ...segs.map((s, i) => i).filter((i) => !(segs[i].kind === 'drop' && segs[i].pos === 0)),
  ];
  for (const i of order) {
    const got = pick(i, false) || pick(i, true);
    if (!got) throw new Error('Не хватает материала: добавь клипов со сценами длиннее 0.5 с.');
    const seg = segs[i];
    const len = seg.need * got.k;
    used.set(got.key, [...(used.get(got.key) || []), [got.m.t, got.m.t + len]]);
    clipUses.set(got.m.clip.id, (clipUses.get(got.m.clip.id) || 0) + 1);
    groupUses.set(sourceOf(got.m.clip), (groupUses.get(sourceOf(got.m.clip)) || 0) + 1);
    assign[i] = { clip: got.m.clip, idx: got.m.idx, scene: got.m.scene, srcA: got.m.t, srcB: got.m.t + len, k: got.k };
  }

  const shots = segs.map((seg, i) => {
    const { clip, idx, scene, srcA, srcB, k } = assign[i];
    // вертикальный кадр из 16:9: окно 9:16 по высоте исходника, по центру лица (или кадра)
    const cropH = clip.height;
    const cropW = Math.min(clip.width, Math.round((cropH * width) / height / 2) * 2);
    const fx = scene.face ? scene.face.x : scene.focus_x ?? 0.5;
    const cropX = Math.round(Math.min(clip.width - cropW, Math.max(0, fx * clip.width - cropW / 2)));
    return {
      type: 'video',
      start: seg.a,
      end: seg.b,
      clip: clip.id,
      scene: idx,
      crop: { x: cropX, w: cropW, h: cropH },
      anchorY: scene.face ? scene.face.y : 0.45,
      slowFactor: Number(k.toFixed(3)),
      ramps: [{ a: seg.a, b: seg.b, srcA: Number(srcA.toFixed(4)), srcB: Number(srcB.toFixed(4)), ...seg.prof }],
    };
  });

  const events = [];
  // хук: эдит открывается ударом камеры и вспышкой, а не статичным кадром
  events.push({ t: 0, type: 'flash', strength: 0.7 });
  events.push({ t: 0, type: 'punch', strength: 1.3 });
  for (const a of r.introAccents) if (a.pos !== 0) events.push({ t: a.t, type: 'punch', strength: 0.35 });
  // переходы на склейках сильных долей: чередуются «зум-проход» и «вжух» (whip); первый — в дроп
  const transitions = [];
  let n = 0;
  segs.forEach((seg, i) => {
    if (i === 0 || seg.kind !== 'drop' || seg.pos !== 0) return;
    const type = n++ % 2 === 0 ? 'zoomthrough' : 'whip';
    transitions.push({ t: seg.a, type, duration: type === 'whip' ? 0.1 : 0.12 });
    events.push({ t: seg.a, type: 'punch', strength: 0.8 });
  });
  for (const a of r.accents) {
    if (a.flash) {
      events.push({ t: a.t, type: 'flash', strength: 0.9 });
      events.push({ t: a.t, type: 'punch', strength: 1.0 });
      events.push({ t: a.t, type: 'rgb', strength: 0.7 });
      events.push({ t: a.t, type: 'shake', strength: 0.6 });
    } else {
      events.push({ t: a.t, type: 'punch', strength: 0.7 });
      events.push({ t: a.t, type: 'shake', strength: 0.9 });
      events.push({ t: a.t, type: 'rgb', strength: 0.5 });
    }
  }
  events.sort((a, b) => a.t - b.t);

  return {
    version: 1,
    style: STYLE_ID,
    width,
    height,
    fps,
    duration: Number(r.duration.toFixed(4)),
    signature,
    audio: audioBlock(audioFile, r),
    beats: r.beatsEdit,
    downbeats: r.downbeatsEdit,
    clips: Object.fromEntries(clips.map((c) => [c.id, { path: c.path, fps: c.fps, width: c.width, height: c.height }])),
    assets: {},
    shots,
    transitions,
    accents: r.accents,
    events,
    sfx: sfxLibrary ? planSfx(sfxLibrary, { duration: r.duration, dropAt: r.dropAt, accents: r.accents, transitions }) : [],
  };
}

/** Время в исходнике и скорость в момент t эдита. */
export function sourceAt(shot, t) {
  const rp = shot.ramps.find((x) => t < x.b) || shot.ramps[shot.ramps.length - 1];
  const tau = Math.min(1, Math.max(0, (t - rp.a) / (rp.b - rp.a)));
  const norm = rampNorm(rp);
  const F = rp.smin * tau + ((rp.smax - rp.smin) * tau ** (rp.p + 1)) / (rp.p + 1);
  const span = rp.srcB - rp.srcA;
  const src = rp.srcA + (span * F) / norm;
  const speed = ((span / (rp.b - rp.a)) * (rp.smin + (rp.smax - rp.smin) * tau ** rp.p)) / norm;
  return { src, speed };
}
