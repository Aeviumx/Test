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

/** Где персонаж в момент rel (секунды от начала сцены): ближайший замер траектории. */
function trackAt(scene, rel) {
  const tr = scene.track;
  if (!tr || !tr.length) return null;
  let best = tr[0];
  for (const p of tr) if (Math.abs(p[0] - rel) < Math.abs(best[0] - rel)) best = p;
  return { x: best[1], face: best[2], size: best[3] };
}

/** Направление движения в момент rel (секунды от начала сцены): [x, y] в ширинах кадра в секунду. */
function flowAt(scene, rel, rate) {
  const f = scene.flow;
  if (!f || !f.length) return null;
  return f[Math.max(0, Math.min(f.length - 1, Math.round(rel * rate)))];
}

/** Насколько продолжается движение через склейку: косинус направлений, 0 — если хоть одно слабое. */
const MIN_FLOW = 0.12; // ширины кадра в секунду: медленнее — направление не читается
function motionMatch(a, b) {
  if (!a || !b) return 0;
  const na = Math.hypot(a[0], a[1]);
  const nb = Math.hypot(b[0], b[1]);
  if (na < MIN_FLOW || nb < MIN_FLOW) return 0;
  return (a[0] * b[0] + a[1] * b[1]) / (na * nb);
}

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
      // общий план с маленькими фигурками в вертикальном кадре не читается (метка из kori_scene_tags.json)
      if (sc.scale === 'wide' || sc.scale === 'skip') return;
      const s0 = sc.start + EDGE_FRAMES / c.fps;
      const s1 = sc.end - EDGE_FRAMES / c.fps;
      if (s1 - s0 < 0.35) return;
      const curve = sc.curve && sc.curve.length ? sc.curve : [sc.motion];
      allCurve.push(...curve);
      const mx = Math.max(...curve);
      const med = [...curve].sort((a, b) => a - b)[Math.floor(curve.length / 2)] || 0;
      curve.forEach((v, i) => {
        const prev = curve[i - 1] ?? -1;
        const next = curve[i + 1] ?? -1;
        if (v >= prev && v >= next && v >= 0.35 * mx) {
          // «удар» — резкий всплеск над фоном сцены, а не ровное мельтешение
          const spike = v / (med + 0.5);
          moments.push({ clip: c, idx, scene: sc, s0, s1, rate, t: Math.max(s0, sc.start + i / rate - PRE_ROLL), value: v, spike });
        }
      });
      moments.push({ clip: c, idx, scene: sc, s0, s1, rate, t: s0, value: curve[0], spike: 1 }); // начало сцены — запасной вариант
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
      // момент хорош, когда это резкий удар и персонаж в кадре крупный (лицо — ещё лучше);
      // общий план с крошечными фигурками проигрывает, даже если там много движения
      const tr = trackAt(m.scene, m.t - m.scene.start);
      let subject = tr ? (tr.face ? 1.3 : 1) * (0.55 + 0.9 * Math.min(tr.size, 0.6)) : m.scene.face ? 1.15 : 1;
      if (m.scene.scale === 'close') subject *= 1.15;
      let sc = Math.min(1.5, m.value / ref) * (0.7 + 0.15 * Math.min(m.spike, 2)) * subject * (0.6 + 0.4 * k);
      // тёмные или бесконтрастные сцены зритель не разберёт, как бы они ни двигались
      if (m.scene.luma !== undefined && (m.scene.luma < 40 || m.scene.contrast < 20)) sc *= 0.2;
      if (near.includes(sourceOf(m.clip))) sc *= 0.15;
      sc *= 0.85 ** (clipUses.get(m.clip.id) || 0);
      sc *= 0.92 ** (groupUses.get(sourceOf(m.clip)) || 0);
      // склейка «по движению»: удар/рывок в конце прошлого отрезка продолжается в начале этого
      // (и этот — в следующем, если тот уже выбран); встречное движение через склейку режет глаз
      const prev = assign[i - 1];
      const next = assign[i + 1];
      const startDir = flowAt(m.scene, m.t + 0.05 - m.scene.start, m.rate);
      const endDir = flowAt(m.scene, m.t + seg.need * k - 0.05 - m.scene.start, m.rate);
      for (const c of [prev && motionMatch(prev.endDir, startDir), next && motionMatch(endDir, next.startDir)]) {
        if (!c) continue;
        sc *= c > 0 ? 1 + 0.5 * c : 1 + 0.2 * c;
      }
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
    const m = got.m;
    assign[i] = {
      clip: m.clip, idx: m.idx, scene: m.scene, srcA: m.t, srcB: m.t + len, k: got.k,
      startDir: flowAt(m.scene, m.t + 0.05 - m.scene.start, m.rate),
      endDir: flowAt(m.scene, m.t + len - 0.05 - m.scene.start, m.rate),
    };
  }

  const shots = segs.map((seg, i) => {
    const { clip, idx, scene, srcA, srcB, k } = assign[i];
    // вертикальный кадр из 16:9: окно 9:16 по высоте исходника ведётся за персонажем по траектории;
    // декодируется полоса, покрывающая все положения окна на этом отрезке
    const cropH = clip.height;
    const cropW = Math.min(clip.width, Math.round((cropH * width) / height / 2) * 2);
    // всё по чётным пикселям: ffmpeg при обрезке видео 4:2:0 молча округляет нечётные x/ширину вниз,
    // и строки кадра «съезжают»
    const even = (v) => Math.floor(v / 2) * 2;
    const toCropX = (x) => even(Math.min(clip.width - cropW, Math.max(0, x * clip.width - cropW / 2)));
    const pts = (scene.track || [])
      .map((p) => [scene.start + p[0], toCropX(p[1])])
      .filter(([t]) => t >= srcA - 0.3 && t <= srcB + 0.3);
    const fx = scene.face ? scene.face.x : scene.focus_x ?? 0.5;
    const track = pts.length ? pts : [[srcA, toCropX(fx)]];
    const minX = Math.min(...track.map((p) => p[1]));
    const maxX = Math.max(...track.map((p) => p[1]));
    const cropX = minX;
    return {
      type: 'video',
      start: seg.a,
      end: seg.b,
      clip: clip.id,
      scene: idx,
      crop: { x: cropX, w: even(Math.min(clip.width - cropX, maxX - minX + cropW)), h: even(cropH) },
      viewW: cropW,
      track: track.map(([t, x]) => [Number(t.toFixed(3)), x]),
      anchorY: scene.face ? scene.face.y : 0.45,
      slowFactor: Number(k.toFixed(3)),
      ramps: [{ a: seg.a, b: seg.b, srcA: Number(srcA.toFixed(4)), srcB: Number(srcB.toFixed(4)), ...seg.prof }],
    };
  });

  // склейки по движению: направление в конце отрезка совпадает с началом следующего
  const matchCuts = [];
  for (let i = 1; i < segs.length; i++) {
    const c = motionMatch(assign[i - 1].endDir, assign[i].startDir);
    if (c > 0.6) matchCuts.push({ t: Number(segs[i].a.toFixed(4)), cos: Number(c.toFixed(2)) });
  }

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
  // «наложение»: на каждой третьей склейке слабой доли следующий кадр проступает поверх текущего
  // (двойная экспозиция), как в эдитах с графикой; на склейках по движению не нужно — там и так плавно
  let g = 0;
  segs.forEach((seg, i) => {
    if (i === 0 || seg.kind !== 'drop' || seg.pos === 0) return;
    if (matchCuts.some((mc) => Math.abs(mc.t - seg.a) < 1e-3)) return;
    if (g++ % 3 === 1) transitions.push({ t: seg.a, type: 'ghost', duration: Math.min(0.6 * r.analysis.beatInterval, seg.a - segs[i - 1].a) });
  });
  transitions.sort((a, b) => a.t - b.t);
  // приёмы на ударах чередуются, чтобы эдит не был «тряской на каждом бите»:
  // сильные доли — вспышка, кадр-удар (инверсия), стоп-кадры, ч/б; слабые — тряска, наклон, шлейф, заикание
  const beatFrame = r.analysis.beatInterval;
  // графика: «карточка» (кадр в белой рамке на размытом фоне), цветная засветка, размытие с наводкой резкости
  const DOWNBEAT_FX = [
    (t) => [['flash', 0.9], ['punch', 1.0], ['shake', 0.6], ['rgb', 0.6]],
    (t) => [['card', 1, { dur: beatFrame * 0.9 }], ['flash', 0.5], ['punch', 0.8]],
    (t) => [['impactframe', 1], ['tilt', 1, { dir: 1 }], ['punch', 1.0]],
    (t) => [['tint', 1, { dur: beatFrame * 1.5 }], ['blur', 1.0], ['punch', 0.9]],
    (t) => [['flash', 0.8], ['stutter', 1, { dur: beatFrame * 0.75 }], ['punch', 0.7]],
    (t) => [['bw', 1, { dur: beatFrame * 0.5 }], ['punch', 1.0], ['rgb', 0.8]],
  ];
  const ACCENT_FX = [
    (t) => [['shake', 0.9], ['rgb', 0.5], ['punch', 0.6]],
    (t) => [['blur', 0.9], ['punch', 0.7]],
    (t, i) => [['tilt', 0.8, { dir: i % 2 ? -1 : 1 }], ['punch', 0.7]],
    (t) => [['echo', 1, { dur: beatFrame * 0.6 }], ['punch', 0.8]],
    (t) => [['stutter', 1, { dur: beatFrame * 0.5 }], ['shake', 0.6]],
  ];
  let di = 0;
  let ai = 0;
  for (const a of r.accents) {
    const fx = a.flash
      ? di === 0
        ? [['flash', 0.9], ['impactframe', 1], ['punch', 1.0], ['rgb', 0.7], ['shake', 0.6]] // сам дроп — всё сразу
        : DOWNBEAT_FX[(di - 1) % DOWNBEAT_FX.length](a.t)
      : ACCENT_FX[ai % ACCENT_FX.length](a.t, ai);
    if (a.flash) di++;
    else ai++;
    for (const [type, strength, extra] of fx) events.push({ t: a.t, type, strength, ...(extra || {}) });
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
    matchCuts,
    accents: r.accents,
    events,
    sfx: sfxLibrary ? planSfx(sfxLibrary, { duration: r.duration, dropAt: r.dropAt, accents: r.accents, transitions: transitions.filter((x) => x.type !== 'ghost') }) : [],
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
