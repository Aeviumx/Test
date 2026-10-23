// Звуковые эффекты: разметка библиотеки (атака, пик, уровень каждого файла) и расстановка по эдиту.
// Удары выравниваются атакой по удару в музыке, «вжухи» — пиком по склейке, нарастание — пиком по дропу.
import fs from 'fs';
import path from 'path';
import { decodeAudio } from './ffmpeg.mjs';

const SR = 22050;
const TYPES = ['impact', 'subdrop', 'whoosh', 'riser', 'glitch'];
const EXTS = new Set(['.wav', '.mp3', '.ogg', '.flac', '.m4a']);

/** Разметка одного файла: длительность, атака 50%, пик, пиковый уровень. */
function analyzeSfx(file) {
  const x = decodeAudio(file, SR);
  const w = Math.round(0.01 * SR);
  let acc = 0;
  const env = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) {
    acc += x[i] * x[i];
    if (i >= w) acc -= x[i - w] * x[i - w];
    env[i] = Math.sqrt(Math.max(0, acc) / w);
  }
  let pk = 0;
  let peakAbs = 0;
  for (let i = 0; i < x.length; i++) {
    if (env[i] > env[pk]) pk = i;
    peakAbs = Math.max(peakAbs, Math.abs(x[i]));
  }
  let att = 0;
  while (att < pk && env[att] < 0.5 * env[pk]) att++;
  return {
    file: path.resolve(file),
    duration: x.length / SR,
    attack: Math.max(0, att - w / 2) / SR,
    peak: Math.max(0, pk - w / 2) / SR,
    peakAbs: peakAbs || 1,
  };
}

/** Библиотека: папка с подпапками impact/, subdrop/, whoosh/, riser/, glitch/. */
export function loadSfxLibrary(dir) {
  const lib = {};
  for (const type of TYPES) {
    const d = path.join(dir, type);
    if (!fs.existsSync(d)) continue;
    lib[type] = fs
      .readdirSync(d)
      .filter((f) => EXTS.has(path.extname(f).toLowerCase()))
      .sort()
      .map((f) => ({ type, ...analyzeSfx(path.join(d, f)) }));
  }
  return lib;
}

const db = (v) => 10 ** (v / 20);

/**
 * Расстановка эффектов. Время — в секундах эдита; hit — удар в музыке (audioT), cut — склейка.
 * Возвращает список { file, at, trim, dur, gain, fade }: файл звучит с момента at эдита,
 * начиная с trim секунд файла, длительностью dur, с усилением gain (линейно) и затуханием fade.
 */
export function planSfx(lib, { duration, dropAt, accents, transitions }) {
  const out = [];
  const add = (s, alignTime, alignOffset, { gainDb, maxLen, fade = 0.25 }) => {
    if (!s) return;
    let at = alignTime - alignOffset;
    let trim = 0;
    if (at < 0) {
      trim = -at;
      at = 0;
    }
    const dur = Math.min(s.duration - trim, maxLen, duration - at);
    if (dur <= 0.02) return;
    // уровень: пик файла приводим к −1 дБ, затем ставим нужное соотношение с музыкой
    out.push({ type: s.type, file: s.file, at: +at.toFixed(4), trim: +trim.toFixed(4), dur: +dur.toFixed(4), gain: +(db(-1) / s.peakAbs * db(gainDb)).toFixed(5), fade: Math.min(fade, dur / 2) });
  };
  // удары: атака не позже 0.4 с от начала файла (длинные «киношные» вступления не годятся)
  // самые «плотные» удары — те, где от атаки до пика меньше всего времени
  // удар — это когда пик звука наступает сразу после атаки (≤ 0.35 с), а не «сердцебиение» через секунду
  const impacts = (lib.impact || []).filter((s) => s.attack <= 0.4 && s.peak - s.attack <= 0.35).sort((a, b) => a.peak - a.attack - (b.peak - b.attack));
  const subs = (lib.subdrop || []).filter((s) => s.attack <= 0.12 && s.peak - s.attack <= 0.3).sort((a, b) => a.peak - b.peak);
  const whooshes = (lib.whoosh || []).filter((s) => s.peak <= 1.2);
  // нарастание: пик ближе к концу файла, иначе оно «отыграет» раньше дропа
  const risers = (lib.riser || []).filter((s) => s.peak / s.duration > 0.6 && s.peak >= 0.8).sort((a, b) => b.peak - a.peak);

  const downbeats = accents.filter((a) => a.flash);
  const dropHit = downbeats[0];
  if (dropHit) {
    const riser = risers.find((s) => s.peak <= dropAt + 0.5) || risers[risers.length - 1];
    add(riser, dropHit.audioT, riser ? riser.peak : 0, { gainDb: -10, maxLen: 60, fade: 0.04 });
    // нарастание обрывается ровно на дропе
    if (riser && out.length) {
      const r = out[out.length - 1];
      r.dur = Math.max(0.05, Math.min(r.dur, dropHit.audioT + 0.03 - r.at));
    }
    add(impacts[0], dropHit.audioT, impacts[0]?.attack ?? 0, { gainDb: -5, maxLen: 2.5, fade: 0.6 });
    add(subs[0], dropHit.audioT, subs[0]?.attack ?? 0, { gainDb: -7, maxLen: 1.6, fade: 0.4 });
  }
  // остальные сильные доли — удары тише, по кругу из библиотеки
  downbeats.slice(1).forEach((a, i) => {
    const s = impacts.length ? impacts[(i + 1) % impacts.length] : null;
    add(s, a.audioT, s ? s.attack : 0, { gainDb: -13, maxLen: 1.2, fade: 0.35 });
  });
  // «вжух» на переходах: пик звука — на склейке
  (transitions || []).forEach((tr, i) => {
    const s = whooshes.length ? whooshes[i % whooshes.length] : null;
    const hit = accents.find((a) => Math.abs(a.t - tr.t) < 1e-3);
    add(s, hit ? hit.audioT : tr.t, s ? s.peak : 0, { gainDb: -11, maxLen: (s ? s.peak : 0) + 0.35, fade: 0.2 });
  });
  return out.sort((a, b) => a.at - b.at);
}
