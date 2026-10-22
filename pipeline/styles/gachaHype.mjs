// Стиль Gacha Hype (по референсу 1): интро с карточками → дроп → по 3 акцента на такт
// по ритмическому рисунку трека, белая вспышка только на сильную долю, панчи на лицо.
// Всё время и все решения берутся из анализа трека и разметки артов — ничего не вписано руками.
import { analyzeTrack, findDrop, accentPattern, snapToOnset } from '../audio.mjs';

export const STYLE_ID = 'gacha-hype';

const FRAMING_ORDER = [
  ['full', 'close', 'mid'],
  ['mid', 'full', 'close'],
];

export function buildPlan({ audioFile, assets, targetDuration = 15, width = 1080, height = 1920, fps = 60, signature = '' }) {
  const characters = assets.filter((a) => a.kind === 'character' && a.face);
  // широкие арты (16:9) в вертикальном кадре превращаются в узкую полоску — в финал берём только вертикальные/квадратные
  const scenes = assets.filter((a) => a.kind === 'scene' && a.width / a.height <= 1.05);
  if (characters.length < 1) {
    throw new Error('Для Gacha Hype нужен минимум один арт персонажа на прозрачном фоне с найденным лицом.');
  }

  const analysis = analyzeTrack(audioFile);
  const barDur = analysis.beatInterval * 4;
  const introBars = 2;
  const dropBars = Math.max(3, Math.round((targetDuration - introBars * barDur) / barDur));
  const drop = findDrop(analysis, introBars, dropBars + 1);
  if (!drop) throw new Error('Не удалось найти дроп в треке: трек слишком короткий или без выраженной структуры.');

  const db = analysis.downbeats;
  const start = db[drop.bar - introBars];
  const end = db[drop.bar + dropBars] ?? db[drop.bar] + dropBars * barDur;
  const duration = end - start;
  const rel = (t) => Number((t - start).toFixed(4));
  const lead = 1 / fps; // визуальное событие на 1 кадр раньше удара — так воспринимается «в бит»

  const pattern = accentPattern(analysis, drop.bar, drop.bar + dropBars, 3);
  const beatsEdit = analysis.beats.filter((t) => t >= start - 1e-3 && t < end).map(rel);
  const dropAt = rel(drop.time);

  // ---------- интро: карточки ----------
  const cardChars = [0, 1, 2].map((i) => characters[i % characters.length].id);
  const introBeats = beatsEdit.filter((t) => t < dropAt - 1e-3);
  const enterIdx = [0, 2, 4];
  const cards = {
    start: 0,
    end: dropAt,
    items: cardChars.map((id, i) => ({
      asset: id,
      slot: ['center', 'left', 'right'][i],
      enter: Math.max(0, (introBeats[enterIdx[i]] ?? i * analysis.beatInterval * 2) - lead),
      from: i === 1 ? 'left' : 'right',
    })),
    zoomStart: introBeats[6] ?? dropAt - 2 * analysis.beatInterval,
  };

  const events = [];
  for (const it of cards.items) events.push({ t: it.enter, type: 'punch', strength: 0.6 });
  const preDrop = snapToOnset(analysis, drop.time - analysis.beatInterval / 2);
  const preColor = characters.find((c) => c.id === cardChars[0]).palette.main;
  events.push({ t: Math.max(0, rel(preDrop.t) - lead), type: 'colorflash', strength: 0.7, color: preColor });

  // ---------- после дропа: акценты по рисунку ----------
  const accents = [];
  for (let b = 0; b < dropBars; b++) {
    const barIdx = drop.bar + b;
    const t0 = db[barIdx];
    const beatsInBar = analysis.beats.filter((t) => t >= t0 - 1e-3 && t < t0 + barDur - 1e-3);
    for (const pos of pattern.positions) {
      const beatNo = Math.floor(pos / 2);
      const base = beatsInBar[beatNo] ?? t0 + beatNo * analysis.beatInterval;
      const grid = pos % 2 === 0 ? base : base + analysis.beatInterval / 2;
      const sn = pos === 0 ? { t: t0, snapped: true } : snapToOnset(analysis, grid);
      accents.push({
        bar: b,
        pos,
        audioT: rel(sn.t),
        t: Math.max(0, rel(sn.t) - lead),
        snapped: sn.snapped,
        flash: pos === 0,
      });
    }
  }

  // ---------- кадры ----------
  const shots = [];
  const useScene = scenes.length > 0 && dropBars >= 4;
  const lastBar = dropBars - 1;
  let prevChar = null;
  let charCursor = 0;
  for (let b = 0; b < dropBars; b++) {
    const barAccents = accents.filter((a) => a.bar === b);
    if (useScene && b === lastBar) {
      const sc = scenes[0];
      barAccents.forEach((a, i) => {
        shots.push({ start: a.t, asset: sc.id, framing: 'wide', zoom: [1 + i * 0.12, 1.06 + i * 0.12] });
      });
      continue;
    }
    let ch = characters[charCursor % characters.length];
    if (characters.length > 1 && ch.id === prevChar) ch = characters[++charCursor % characters.length];
    charCursor++;
    prevChar = ch.id;
    const order = FRAMING_ORDER[b % 2];
    barAccents.forEach((a, i) => shots.push({ start: a.t, asset: ch.id, framing: order[i % order.length] }));
  }
  shots.forEach((s, i) => (s.end = i + 1 < shots.length ? shots[i + 1].start : Number(duration.toFixed(4))));

  for (const a of accents) {
    if (a.flash) {
      events.push({ t: a.t, type: 'flash', strength: 1.0 });
      events.push({ t: a.t, type: 'punch', strength: 1.0 });
      events.push({ t: a.t, type: 'rgb', strength: 0.8 });
    } else {
      events.push({ t: a.t, type: 'punch', strength: 0.75 });
      events.push({ t: a.t, type: 'shake', strength: 0.8 });
      events.push({ t: a.t, type: 'rgb', strength: 0.45 });
    }
  }
  events.sort((a, b) => a.t - b.t);

  const usedIds = new Set([...cardChars, ...shots.map((s) => s.asset)]);
  return {
    version: 1,
    style: STYLE_ID,
    width,
    height,
    fps,
    duration: Number(duration.toFixed(4)),
    signature,
    audio: {
      file: audioFile,
      start: Number(start.toFixed(4)),
      duration: Number(duration.toFixed(4)),
      bpm: analysis.bpm,
      dropAt,
      dropRise: drop.rise,
      pattern: pattern.positions,
      patternScores: pattern.scores,
      tempoCandidates: analysis.tempoCandidates,
    },
    beats: beatsEdit,
    downbeats: db.filter((t) => t >= start - 1e-3 && t < end).map(rel),
    assets: Object.fromEntries(assets.filter((a) => usedIds.has(a.id)).map((a) => [a.id, a])),
    cards,
    shots,
    accents,
    events,
  };
}
