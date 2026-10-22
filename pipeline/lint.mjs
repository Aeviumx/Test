// Линтер плана: проверяет то, что реально будет нарисовано (через те же функции кадрирования).
import { frameFor, faceInFrame, MAX_UPSCALE } from './framing.mjs';

export function lintPlan(plan) {
  const errors = [];
  const warnings = [];
  const W = plan.width;
  const H = plan.height;
  const fps = plan.fps;

  // 0. Найден ли настоящий дроп
  if (plan.audio && plan.audio.dropRise < 3) {
    warnings.push(`Явного дропа в треке не найдено (подъём громкости ${plan.audio.dropRise} дБ) — эдит начнётся с произвольного такта; лучше взять трек длиннее или с выраженным дропом`);
  }

  // 1. Плотность вспышек и интервалы
  const flashes = plan.events.filter((e) => e.type === 'flash').map((e) => e.t);
  const per10 = (flashes.length / plan.duration) * 10;
  if (per10 > 10) errors.push(`Вспышек ${per10.toFixed(1)} на 10 с (максимум 10) — получится стробоскоп`);
  for (let i = 1; i < flashes.length; i++) {
    if (flashes[i] - flashes[i - 1] < 0.4) errors.push(`Вспышки слишком близко: ${flashes[i - 1]} и ${flashes[i]} с`);
  }

  // 2. Акценты привязаны к реальным атакам
  const unsnapped = plan.accents.filter((a) => !a.snapped);
  if (plan.accents.length && unsnapped.length / plan.accents.length > 0.34) {
    warnings.push(`${unsnapped.length} из ${plan.accents.length} акцентов стоят по сетке, а не на реальной атаке`);
  }

  // 3. Длина кадров
  for (const s of plan.shots) {
    if ((s.end - s.start) * fps < 6) errors.push(`Кадр ${s.start.toFixed(2)}–${s.end.toFixed(2)} с короче 6 кадров`);
  }

  // 4. Лицо в кадре на всех крупных планах (с учётом наезда и панча)
  for (const s of plan.shots) {
    if (s.type === 'video') {
      // твикстор: время в исходнике идёт только вперёд и не выходит за сцену
      for (let i = 0; i < s.ramps.length; i++) {
        const r = s.ramps[i];
        if (r.srcB <= r.srcA) errors.push(`${s.clip} (${s.start.toFixed(2)} с): время исходника не идёт вперёд`);
        if (i && Math.abs(r.srcA - s.ramps[i - 1].srcB) > 1e-3) errors.push(`${s.clip} (${s.start.toFixed(2)} с): разрыв во времени исходника`);
      }
      if (s.slowFactor < 0.4) warnings.push(`${s.clip}, сцена ${s.scene}: сцена короткая — такт замедлен в ${(1 / s.slowFactor).toFixed(1)} раза`);
      continue;
    }
    const a = plan.assets[s.asset];
    if (!a) {
      errors.push(`Кадр ${s.start} ссылается на неизвестный арт ${s.asset}`);
      continue;
    }
    const fr = frameFor(a, s.framing, W, H);
    if (fr.s > MAX_UPSCALE + 1e-6) errors.push(`${s.asset}: увеличение ×${fr.s.toFixed(2)} больше допустимого`);
    if (s.framing === 'mid' || s.framing === 'close') {
      for (const zoom of [1, 1.05 * 1.12]) {
        const box = faceInFrame(a, fr, zoom);
        if (!box) {
          errors.push(`${s.asset}: крупный план без найденного лица`);
          break;
        }
        const [x, y, w, h] = box;
        if (x < 0 || y < 0 || x + w > W || y + h > H) {
          errors.push(`${s.asset} (${s.framing}, ${s.start.toFixed(2)} с): лицо выходит за кадр при зуме ×${zoom.toFixed(2)}`);
          break;
        }
      }
    }
    if (s.framing === 'full' && a.face) {
      const box = faceInFrame(a, fr, 1.12);
      if (box && box[1] < H * 0.03) warnings.push(`${s.asset}: в общем плане голова почти у края кадра`);
    }
  }

  // 5. Один и тот же персонаж два такта подряд
  const perBar = new Map();
  plan.accents.forEach((acc) => {
    const shot = plan.shots.find((s) => Math.abs(s.start - acc.t) < 1e-6);
    if (shot && !perBar.has(acc.bar)) perBar.set(acc.bar, shot.asset ?? `${shot.clip}#${shot.scene}`);
  });
  const bars = [...perBar.keys()].sort((a, b) => a - b);
  for (let i = 1; i < bars.length; i++) {
    if (perBar.get(bars[i]) === perBar.get(bars[i - 1]) && new Set(perBar.values()).size > 2) {
      warnings.push(`Такты ${bars[i - 1]} и ${bars[i]}: один и тот же арт подряд`);
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}
