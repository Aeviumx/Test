// Анализ музыки: огибающая атак, темп, биты (динамическое программирование по Эллису),
// сильные доли, поиск дропа и ритмического рисунка акцентов.
import { decodeAudio, probeDuration } from './ffmpeg.mjs';

const SR = 22050;
const N = 1024;
const HOP = 256;
export const FRAME_RATE = SR / HOP;

function fftMag(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ar = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const ai = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k + len / 2] = re[i + k] - ar;
        im[i + k + len / 2] = im[i + k] - ai;
        re[i + k] += ar;
        im[i + k] += ai;
        const t = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = t;
      }
    }
  }
  const out = new Float32Array(n / 2 + 1);
  for (let k = 0; k <= n / 2; k++) out[k] = Math.hypot(re[k], im[k]);
  return out;
}

function percentile(arr, p) {
  const s = Array.from(arr).sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] || 0;
}

function movingAverage(x, w) {
  const out = new Float32Array(x.length);
  let acc = 0;
  const h = Math.floor(w / 2);
  for (let i = 0; i < x.length + h; i++) {
    if (i < x.length) acc += x[i];
    if (i - w >= 0) acc -= x[i - w];
    const c = i - h;
    if (c >= 0 && c < x.length) out[c] = acc / Math.min(w, i + 1);
  }
  return out;
}

/** Огибающие: атаки (весь спектр + бочка), громкость. */
export function computeEnvelopes(samples) {
  const frames = Math.max(0, Math.floor((samples.length - N) / HOP));
  const win = new Float32Array(N).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
  const binHz = SR / N;
  const lowA = Math.max(1, Math.round(35 / binHz));
  const lowB = Math.round(160 / binHz);
  const full = new Float32Array(frames);
  const low = new Float32Array(frames);
  const rms = new Float32Array(frames);
  const lowEnergy = new Float32Array(frames);
  let prev = null;
  const re = new Float32Array(N);
  const im = new Float32Array(N);
  for (let f = 0; f < frames; f++) {
    let e = 0;
    for (let i = 0; i < N; i++) {
      const v = samples[f * HOP + i];
      re[i] = v * win[i];
      im[i] = 0;
      e += v * v;
    }
    rms[f] = Math.sqrt(e / N);
    const mag = fftMag(re, im);
    const logm = mag.map((m) => Math.log1p(10 * m));
    let le = 0;
    for (let k = lowA; k <= lowB; k++) le += mag[k] * mag[k];
    lowEnergy[f] = le;
    if (prev) {
      let a = 0;
      let b = 0;
      for (let k = 1; k < logm.length; k++) {
        const d = logm[k] - prev[k];
        if (d > 0) {
          a += d;
          if (k >= lowA && k <= lowB) b += d;
        }
      }
      full[f] = a;
      low[f] = b;
    }
    prev = logm;
  }
  const norm = (x) => {
    const avg = movingAverage(x, Math.round(FRAME_RATE));
    const y = x.map((v, i) => Math.max(0, v - avg[i]));
    const p = percentile(y, 99) || 1;
    return y.map((v) => v / p);
  };
  const fullN = norm(full);
  const lowN = norm(low);
  const onset = fullN.map((v, i) => v + lowN[i]);
  return { onset, kick: lowN, rms, lowEnergy, frameRate: FRAME_RATE };
}

/** Темп по автокорреляции огибающей с мягким предпочтением 90–140 BPM. */
export function estimateTempo(onset, minBpm = 60, maxBpm = 200) {
  const n = onset.length;
  const mean = onset.reduce((a, b) => a + b, 0) / n;
  const x = onset.map((v) => v - mean);
  const ac = (lag) => {
    let s = 0;
    for (let i = 0; i + lag < n; i++) s += x[i] * x[i + lag];
    return s / (n - lag);
  };
  const cands = [];
  for (let bpm = minBpm; bpm <= maxBpm; bpm += 0.25) {
    const lag = (60 / bpm) * FRAME_RATE;
    const l0 = Math.floor(lag);
    const frac = lag - l0;
    const v = ac(l0) * (1 - frac) + ac(l0 + 1) * frac;
    // гармоники усиливают настоящий темп
    const lag2 = Math.round(lag * 2);
    const v2 = lag2 < n ? ac(lag2) : 0;
    const prior = Math.exp(-0.5 * (Math.log2(bpm / 115) / 0.6) ** 2);
    cands.push({ bpm, score: (v + 0.5 * v2) * prior, raw: v });
  }
  cands.sort((a, b) => b.score - a.score);
  return { bpm: cands[0].bpm, candidates: cands.slice(0, 5) };
}

/** Отслеживание битов (Ellis 2007): возвращает индексы кадров огибающей. */
export function trackBeats(onset, bpm, tightness = 100) {
  const period = (60 / bpm) * FRAME_RATE;
  const sigma = period / 32;
  const half = Math.ceil(sigma * 4);
  const kern = [];
  for (let i = -half; i <= half; i++) kern.push(Math.exp(-0.5 * (i / sigma) ** 2));
  const n = onset.length;
  const local = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = -half; k <= half; k++) {
      const j = i + k;
      if (j >= 0 && j < n) s += onset[j] * kern[k + half];
    }
    local[i] = s;
  }
  const cum = new Float32Array(n);
  const back = new Int32Array(n).fill(-1);
  const pMin = Math.round(period / 2);
  const pMax = Math.round(period * 2);
  for (let t = 0; t < n; t++) {
    let best = -Infinity;
    let bi = -1;
    for (let p = pMin; p <= pMax; p++) {
      const j = t - p;
      if (j < 0) break;
      const sc = cum[j] - tightness * Math.log(p / period) ** 2;
      if (sc > best) {
        best = sc;
        bi = j;
      }
    }
    cum[t] = local[t] + (bi >= 0 ? Math.max(0, best) : 0);
    back[t] = bi >= 0 && best > 0 ? bi : -1;
  }
  let t = n - 1;
  let best = -Infinity;
  for (let i = Math.max(0, n - Math.round(period * 2)); i < n; i++) {
    if (cum[i] > best) {
      best = cum[i];
      t = i;
    }
  }
  const beats = [];
  while (t >= 0) {
    beats.push(t);
    t = back[t];
  }
  beats.reverse();
  return beats;
}

function peakNear(env, frame, radius) {
  let bi = frame;
  let bv = -Infinity;
  for (let i = Math.max(0, frame - radius); i <= Math.min(env.length - 1, frame + radius); i++) {
    if (env[i] > bv) {
      bv = env[i];
      bi = i;
    }
  }
  return { frame: bi, value: bv };
}

/** Полный анализ трека. */
export function analyzeTrack(file) {
  const duration = probeDuration(file);
  const samples = decodeAudio(file, SR);
  const env = computeEnvelopes(samples);
  const tempo = estimateTempo(env.onset);
  const beatFrames = trackBeats(env.onset, tempo.bpm);
  const beats = beatFrames.map((f) => f / FRAME_RATE);
  // уточнённый темп по медиане интервалов
  const iv = beats.slice(1).map((b, i) => b - beats[i]).sort((a, b) => a - b);
  const medIv = iv[Math.floor(iv.length / 2)];
  const bpm = Math.round((60 / medIv) * 100) / 100;

  // сильная доля: фаза с наибольшей энергией бочки
  const phaseScore = [0, 0, 0, 0];
  beatFrames.forEach((f, i) => {
    phaseScore[i % 4] += peakNear(env.kick, f, 3).value;
  });
  const phase = phaseScore.indexOf(Math.max(...phaseScore));
  const downbeats = beats.filter((_, i) => i % 4 === phase);

  // громкость по тактам (дБ)
  const barEnergy = downbeats.map((t0, b) => {
    const t1 = downbeats[b + 1] ?? t0 + 4 * medIv;
    const a = Math.round(t0 * FRAME_RATE);
    const z = Math.min(env.rms.length, Math.round(t1 * FRAME_RATE));
    let s = 0;
    for (let i = a; i < z; i++) s += env.rms[i] * env.rms[i];
    return 10 * Math.log10(s / Math.max(1, z - a) + 1e-12);
  });

  return {
    file,
    duration,
    bpm,
    tempoCandidates: tempo.candidates.map((c) => ({ bpm: c.bpm, score: Number(c.score.toFixed(4)) })),
    beatInterval: medIv,
    beats,
    downbeats,
    barEnergyDb: barEnergy.map((v) => Number(v.toFixed(2))),
    env,
  };
}

/**
 * Дроп: такт, после которого громкость двух следующих тактов сильнее всего выше двух предыдущих.
 * minStartBar — сколько тактов нужно до дропа (интро), needBars — сколько тактов должно быть после.
 */
export function findDrop(analysis, minStartBar = 2, needBars = 6) {
  const E = analysis.barEnergyDb;
  const maxE = Math.max(...E);
  const cands = [];
  let fallback = null;
  for (let b = Math.max(2, minStartBar); b + needBars <= E.length; b++) {
    if (analysis.downbeats[b] < 6) continue;
    const after = (E[b] + E[b + 1]) / 2;
    const before = (E[b - 1] + E[b - 2]) / 2;
    const rise = after - before;
    const cand = { bar: b, rise: Number(rise.toFixed(2)), level: Number(after.toFixed(2)), time: analysis.downbeats[b] };
    if (!fallback || rise > fallback.rise) fallback = cand;
    // дроп — это вход в самую громкую часть трека, а не ранний подъём громкости
    if (after >= maxE - 4 && rise >= 3) cands.push(cand);
  }
  if (!cands.length) return fallback;
  // из сопоставимых по силе дропов берём первый: он и есть «тот самый» момент трека
  const top = Math.max(...cands.map((c) => c.rise));
  return cands.find((c) => c.rise >= 0.75 * top);
}

/**
 * Ритмический рисунок: какие восьмые внутри такта сильнее всего звучат в секции после дропа.
 * Возвращает позиции (0..7) — всегда включает сильную долю (0).
 */
export function accentPattern(analysis, fromBar, toBar, count = 3) {
  const { env, downbeats, beatInterval } = analysis;
  const scores = new Array(8).fill(0);
  for (let b = fromBar; b < Math.min(toBar, downbeats.length); b++) {
    const t0 = downbeats[b];
    const vals = [];
    for (let j = 0; j < 8; j++) {
      const t = t0 + (j * beatInterval) / 2;
      vals.push(peakNear(env.onset, Math.round(t * FRAME_RATE), 3).value);
    }
    const mx = Math.max(...vals) || 1;
    vals.forEach((v, j) => (scores[j] += v / mx));
  }
  const chosen = [0];
  const order = scores.map((s, j) => ({ s, j })).filter((o) => o.j !== 0).sort((a, b) => b.s - a.s);
  for (const o of order) {
    if (chosen.length >= count) break;
    if (chosen.every((c) => Math.abs(c - o.j) >= 2 && 8 - Math.abs(c - o.j) >= 2)) chosen.push(o.j);
  }
  chosen.sort((a, b) => a - b);
  return { positions: chosen, scores: scores.map((s) => Number(s.toFixed(2))) };
}

/** Подтягивает время к ближайшей реальной атаке, если она достаточно сильная. */
export function snapToOnset(analysis, t, radiusSec = 0.045, minRel = 0.35) {
  const { env } = analysis;
  const f = Math.round(t * FRAME_RATE);
  const r = Math.round(radiusSec * FRAME_RATE);
  const pk = peakNear(env.onset, f, r);
  const local = peakNear(env.onset, f, Math.round(FRAME_RATE * 0.5)).value || 1;
  if (pk.value >= minRel * local) return { t: pk.frame / FRAME_RATE, snapped: true, strength: pk.value };
  return { t, snapped: false, strength: pk.value };
}
