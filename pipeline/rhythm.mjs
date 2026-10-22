// Общая ритмическая разметка эдита: фрагмент трека вокруг дропа и акценты по рисунку,
// привязанные к атакам ударов. Её используют все стили, чтобы попадание в бит было одинаковым.
import { analyzeTrack, findDrop, accentPattern, snapToOnset, gridTime } from './audio.mjs';

export function buildRhythm({ audioFile, introBars = 2, targetDuration = 15, fps = 60, accentsPerBar = 3, leadFrames = 2 }) {
  const analysis = analyzeTrack(audioFile);
  const barDur = analysis.beatInterval * 4;
  const dropBars = Math.max(3, Math.round((targetDuration - introBars * barDur) / barDur));
  const drop = findDrop(analysis, introBars, dropBars + 1);
  if (!drop) throw new Error('Не удалось найти дроп в треке: трек слишком короткий или без выраженной структуры.');

  const db = analysis.downbeats;
  const start = db[drop.bar - introBars];
  const end = db[drop.bar + dropBars] ?? db[drop.bar] + dropBars * barDur;
  const duration = end - start;
  const rel = (t) => Number((t - start).toFixed(4));
  // визуальное событие ставится на leadFrames кадров раньше атаки удара (как делают монтажёры:
  // у референса профи ~2.5 кадра); +0.5 кадра — чтобы попасть в ближайший кадр, а не в следующий
  const lead = (leadFrames + 0.5) / fps;
  const pattern = accentPattern(analysis, drop.bar, drop.bar + dropBars, accentsPerBar);

  const accent = (bar, pos, t0) => {
    const sn = snapToOnset(analysis, pos === 0 ? t0 : gridTime(analysis, t0, pos));
    return { bar, pos, audioT: rel(sn.t), t: Math.max(0, rel(sn.t) - lead), snapped: sn.snapped, flash: pos === 0 };
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
