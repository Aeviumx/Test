// Стиль Velocity (твикстор-эдит): каждый такт — своя сцена из твикстор-клипа, внутри такта скорость
// «дышит» под музыку: на ударе замедление, к следующему удару резкий разгон со смешиванием кадров.
// Склейки — на сильные доли, вспышки — только на сильные доли после дропа.
import { buildRhythm, audioBlock } from '../rhythm.mjs';

export const STYLE_ID = 'velocity';

// профиль скорости на отрезке между ударами: speed(τ) = smin + (smax - smin)·τ^p, τ ∈ [0, 1]
const RAMP_DOWNBEAT = { smin: 0.25, smax: 3.2, p: 2.4 }; // сильная доля: самое глубокое замедление
const RAMP_ACCENT = { smin: 0.45, smax: 2.6, p: 2.2 }; // остальные удары такта — мягче
const RAMP_INTRO = { smin: 0.55, smax: 1.7, p: 1.8 };
const ZOOM_THROUGH_EVERY = 2; // «зум-проход» в склейку на каждой второй смене сцены после дропа
const EDGE_FRAMES = 2; // не берём кадры у самой склейки исходника

export const rampNorm = (r) => r.smin + (r.smax - r.smin) / (r.p + 1);

export function buildPlan({ audioFile, clips, targetDuration = 15, width = 1080, height = 1920, fps = 60, signature = '', leadFrames = 2 }) {
  const r = buildRhythm({ audioFile, introBars: 1, targetDuration, fps, leadFrames });
  const totalBars = r.introBars + r.dropBars;

  const pool = [];
  for (const c of clips) {
    c.scenes.forEach((s, idx) => {
      const len = s.end - s.start - (2 * EDGE_FRAMES) / c.fps;
      if (len >= 0.6) pool.push({ clip: c, idx, scene: s, len });
    });
  }
  if (!pool.length) throw new Error('В клипах нет сцен длиннее 0.6 с — нечего монтировать.');

  // самые динамичные сцены — на дроп и на финальный такт, остальные — в порядке исходника
  const byMotion = [...pool].sort((a, b) => b.scene.motion - a.scene.motion);
  const order = new Array(totalBars).fill(null);
  const dropSlot = r.introBars;
  const used = new Set();
  const take = (slot, cand) => {
    order[slot] = cand;
    used.add(cand);
  };
  if (byMotion[0]) take(dropSlot, byMotion[0]);
  if (byMotion[1] && totalBars - 1 !== dropSlot) take(totalBars - 1, byMotion[1]);
  const rest = pool.filter((p) => !used.has(p));
  let k = 0;
  for (let i = 0; i < totalBars; i++) {
    if (order[i]) continue;
    order[i] = rest.length ? rest[k++ % rest.length] : pool[i % pool.length];
  }

  // точки ударов на каждом такте: интро — каждая доля, после дропа — акценты по рисунку
  const barPoints = [];
  for (let b = 0; b < totalBars; b++) {
    const rel = b - r.introBars;
    const src = rel < 0 ? r.introAccents.filter((a) => a.bar === rel) : r.accents.filter((a) => a.bar === rel);
    barPoints.push(src.map((a) => a.t));
  }

  const shots = [];
  for (let b = 0; b < totalBars; b++) {
    const pts = barPoints[b];
    const a0 = pts[0];
    const a1 = b + 1 < totalBars ? barPoints[b + 1][0] : r.duration;
    const profFor = (i) => (b < r.introBars ? RAMP_INTRO : i === 0 ? RAMP_DOWNBEAT : RAMP_ACCENT);
    const { clip, scene, idx } = order[b];
    const bounds = [...pts, a1];
    const need = bounds.slice(0, -1).reduce((acc, t, i) => acc + (bounds[i + 1] - t) * rampNorm(profFor(i)), 0);
    const s0 = scene.start + EDGE_FRAMES / clip.fps;
    const s1 = scene.end - EDGE_FRAMES / clip.fps;
    const avail = s1 - s0;
    const k = Math.min(1, avail / need); // если сцена короче — замедляем весь такт равномерно
    const used = need * k;
    // замедление на сильной доле приходится чуть раньше пика движения сцены
    let srcStart = Math.min(Math.max(s0, scene.peak - 0.15 * used), s1 - used);
    srcStart = Math.max(s0, srcStart);
    const ramps = [];
    let src = srcStart;
    for (let i = 0; i < bounds.length - 1; i++) {
      const prof = profFor(i);
      const dur = (bounds[i + 1] - bounds[i]) * rampNorm(prof) * k;
      ramps.push({ a: bounds[i], b: bounds[i + 1], srcA: Number(src.toFixed(4)), srcB: Number((src + dur).toFixed(4)), ...prof });
      src += dur;
    }
    // вертикальный кадр из 16:9: окно 9:16 по высоте исходника, по центру лица (или кадра)
    const cropH = clip.height;
    const cropW = Math.min(clip.width, Math.round((cropH * width) / height / 2) * 2);
    const fx = scene.face ? scene.face.x : 0.5;
    const cropX = Math.round(Math.min(clip.width - cropW, Math.max(0, fx * clip.width - cropW / 2)));
    shots.push({
      type: 'video',
      start: a0,
      end: a1,
      clip: clip.id,
      scene: idx,
      crop: { x: cropX, w: cropW, h: cropH },
      anchorY: scene.face ? scene.face.y : 0.45,
      slowFactor: Number(k.toFixed(3)),
      ramps,
    });
  }
  shots[0].start = 0;

  const events = [];
  // хук: эдит открывается ударом камеры и вспышкой, а не статичным кадром
  events.push({ t: 0, type: 'flash', strength: 0.7 });
  events.push({ t: 0, type: 'punch', strength: 1.3 });
  for (const a of r.introAccents) if (a.pos !== 0) events.push({ t: a.t, type: 'punch', strength: 0.35 });
  // зум-проход: камера разгоняется в склейку, новая сцена «вылетает» навстречу
  const transitions = [];
  shots.forEach((s, i) => {
    const barAfterDrop = i - r.introBars;
    if (i > r.introBars && barAfterDrop % ZOOM_THROUGH_EVERY === 1) {
      transitions.push({ t: s.start, type: 'zoomthrough', duration: 0.12 });
      events.push({ t: s.start, type: 'punch', strength: 0.8 });
    }
  });
  for (const a of r.accents) {
    if (a.flash) {
      events.push({ t: a.t, type: 'flash', strength: 0.9 });
      events.push({ t: a.t, type: 'punch', strength: 1.0 });
      events.push({ t: a.t, type: 'rgb', strength: 0.7 });
    } else {
      events.push({ t: a.t, type: 'punch', strength: 0.6 });
      events.push({ t: a.t, type: 'shake', strength: 0.5 });
      events.push({ t: a.t, type: 'rgb', strength: 0.4 });
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
