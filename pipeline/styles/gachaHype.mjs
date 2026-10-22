// Стиль Gacha Hype (по референсу 1): интро с карточками → дроп → по 3 акцента на такт
// по ритмическому рисунку трека, белая вспышка только на сильную долю, панчи на лицо.
// Всё время и все решения берутся из анализа трека и разметки артов — ничего не вписано руками.
import { snapToOnset } from '../audio.mjs';
import { buildRhythm, audioBlock } from '../rhythm.mjs';

export const STYLE_ID = 'gacha-hype';

const FRAMING_ORDER = [
  ['full', 'close', 'mid'],
  ['mid', 'full', 'close'],
];

export function buildPlan({ audioFile, assets, targetDuration = 15, width = 1080, height = 1920, fps = 60, signature = '', leadFrames = 2 }) {
  const characters = assets.filter((a) => a.kind === 'character' && a.face);
  // широкие арты (16:9) в вертикальном кадре превращаются в узкую полоску — в финал берём только вертикальные/квадратные
  const scenes = assets.filter((a) => a.kind === 'scene' && a.width / a.height <= 1.05);
  if (characters.length < 1) {
    throw new Error('Для Gacha Hype нужен минимум один арт персонажа на прозрачном фоне с найденным лицом.');
  }

  const r = buildRhythm({ audioFile, introBars: 2, targetDuration, fps, leadFrames });
  const { analysis, drop, dropBars, rel, lead, beatsEdit, dropAt, accents } = r;
  const duration = r.duration;

  // ---------- интро: карточки ----------
  const cardChars = [0, 1, 2].map((i) => characters[i % characters.length].id);
  // карточки входят на уточнённые удары интро (каждая вторая доля), зум к дропу — с 7-й доли
  const introBeats = r.introAccents.map((a) => a.t);
  const enterIdx = [0, 2, 4];
  const cards = {
    start: 0,
    end: dropAt,
    items: cardChars.map((id, i) => ({
      asset: id,
      slot: ['center', 'left', 'right'][i],
      enter: introBeats[enterIdx[i]] ?? i * analysis.beatInterval * 2,
      from: i === 1 ? 'left' : 'right',
    })),
    zoomStart: introBeats[6] ?? dropAt - 2 * analysis.beatInterval,
  };

  const events = [];
  for (const it of cards.items) events.push({ t: it.enter, type: 'punch', strength: 0.6 });
  const preDrop = snapToOnset(analysis, drop.time - analysis.beatInterval / 2);  // восьмая перед дропом
  const preColor = characters.find((c) => c.id === cardChars[0]).palette.main;
  events.push({ t: Math.max(0, rel(preDrop.t) - lead), type: 'colorflash', strength: 0.7, color: preColor });

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
    audio: audioBlock(audioFile, r),
    beats: beatsEdit,
    downbeats: r.downbeatsEdit,
    assets: Object.fromEntries(assets.filter((a) => usedIds.has(a.id)).map((a) => [a.id, a])),
    cards,
    shots,
    accents,
    events,
  };
}
