// Общая ритмическая разметка эдита: фрагмент трека вокруг дропа и акценты по рисунку,
// привязанные к атакам ударов. Её используют все стили, чтобы попадание в бит было одинаковым.
import { analyzeTrack, findDrop, accentPattern, snapToOnset, gridTime } from './audio.mjs';

export function buildRhythm({ audioFile, introBars = 2, targetDuration = 15, fps = 60, accentsPerBar = 3, leadFrames = 2 }) {
  const analysis = analyzeTrack(audioFile);
  const barDur = analysis.beatInterval * 4;
  // короткий трек: эдит сокращается до доступного числа целых тактов, а не падает
  const availBars = analysis.downbeats.length - 1 - introBars;
  const dropBars = Math.min(Math.max(3, Math.round((targetDuration - introBars * barDur) / barDur)), availBars);
  if (dropBars < 2) throw new Error('Трек слишком короткий: нужно минимум 3–4 такта с выраженным ритмом.');
  const drop = findDrop(analysis, introBars, dropBars + 1) || findDrop(analysis, introBars, dropBars);
  if (!drop) throw new Error('Не удалось найти дроп в треке: трек слишком короткий или без выраженной структуры.');

  const db = analysis.downbeats;
  const start = db[drop.bar - introBars];
  const end = db[drop.bar + dropBars] ?? db[drop.bar] + dropBars * barDur;
  const duration = end - start;
  const rel = (t) => Number((t - start).toFixed(4));
  // визуальное событие ставится на leadFrames кадров раньше атаки удара (как делают монтажёры:
  // у референса профи ~2.5 кадра) и выравнивается ровно по кадру — иначе вспышка, попавшая между
  // кадрами, к первому показанному кадру уже теряет до половины силы
  const lead = leadFrames / fps;
  const onFrame = (t) => Math.max(0, Math.round(t * fps) / fps);
  const pattern = accentPattern(analysis, drop.bar, drop.bar + dropBars, accentsPerBar);

  const accent = (bar, pos, t0) => {
    const sn = snapToOnset(analysis, pos === 0 ? t0 : gridTime(analysis, t0, pos));
    return { bar, pos, audioT: rel(sn.t), t: onFrame(rel(sn.t) - lead), snapped: sn.snapped, flash: pos === 0 };
  };

  // акценты после дропа — по ритмическому рисунку трека
  const accents = [];
  for (let b = 0; b < dropBars; b++) {
    for (const pos of pattern.positions) accents.push(accent(b, pos, db[drop.bar + b]));
  }
  // в интро — каждая доля (bar отрицательный: -introBars..-1)
  const introAccents = [];
  for (let b = -introBars; b < 0; b++) {
    for (const pos of [0, 4, 8, 12]) introAccents.push({ ...accent(b, pos, db[drop.bar + b]), flash: false });
  }

  return {
    analysis,
    drop,
    introBars,
    dropBars,
    barDur,
    start,
    end,
    duration,
    rel,
    lead,
    onFrame,
    pattern,
    dropAt: rel(drop.time),
    beatsEdit: analysis.beats.filter((t) => t >= start - 1e-3 && t < end).map(rel),
    downbeatsEdit: db.filter((t) => t >= start - 1e-3 && t < end).map(rel),
    accents,
    introAccents,
  };
}

/** Блок audio для плана. */
export function audioBlock(audioFile, r) {
  return {
    file: audioFile,
    start: Number(r.start.toFixed(4)),
    duration: Number(r.duration.toFixed(4)),
    bpm: r.analysis.bpm,
    dropAt: r.dropAt,
    dropRise: r.drop.rise,
    pattern: r.pattern.positions,
    patternScores: r.pattern.scores,
    tempoCandidates: r.analysis.tempoCandidates,
  };
}
