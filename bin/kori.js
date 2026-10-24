#!/usr/bin/env node
/**
 * Kōri (氷) CLI — сборка эдитов из трека и артов.
 *
 * Конвейер: faces (разметка артов) → plan (анализ трека + план) → lint → stills/export → qa.
 * Всё время в эдите вычисляется из анализа трека, ничего не вписано руками.
 */
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const command = args[0];

const HELP = `
Kōri (氷) CLI

Команды:
  faces    <папка с артами>                 Разметить арты: лица, контур, цвет (Python + OpenCV)
  clips    <папка с видео>                  Разметить клипы/твиксторы: сцены, движение, лица
  analyze  --audio <трек>                   Темп, биты, дроп, ритмический рисунок
  plan     --audio <трек> --art <папка|файлы...> --out plan.json             (стиль gacha-hype, по умолчанию)
  plan     --style velocity --audio <трек> --clips <папка|файлы...> --out plan.json   (твикстор-эдит)
           [--duration 15] [--signature "edit by ..."]
           [--lead-frames 2]  на сколько кадров раньше удара ставить склейки/вспышки (0 — точно в удар)
           [--sfx <папка>]    звуковые эффекты: подпапки impact/ subdrop/ whoosh/ riser/ (только velocity)
           [--seed N]         другой вариант эдита из тех же клипов (velocity)
           [--no-history]     не учитывать kori_usage.json (по умолчанию сцены из прошлых эдитов уступают новым)
  lint     --plan plan.json                 Проверить план (лица в кадре, вспышки, синхрон)
  stills   --plan plan.json --times 1,4.5,8 --out <папка>   Отдельные кадры в PNG
  export   --plan plan.json --out edit.mp4 [--force]        Рендер MP4 (+ проверка edit_qa.py)
  render   те же параметры, что у plan, + --out edit.mp4           plan + lint + export + qa
  qa       <edit.mp4>                       Независимая проверка готового эдита

Переменные: KORI_FFMPEG, KORI_FFPROBE, KORI_PYTHON — пути к программам, если их нет в PATH.
`;

function getArg(flag, def) {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] !== undefined ? args[i + 1] : def;
}

function getList(flag) {
  const i = args.indexOf(flag);
  if (i === -1) return [];
  const out = [];
  for (let j = i + 1; j < args.length && !args[j].startsWith('--'); j++) out.push(args[j]);
  return out;
}

function python() {
  if (process.env.KORI_PYTHON) return process.env.KORI_PYTHON;
  for (const p of process.platform === 'win32' ? ['python', 'py'] : ['python3', 'python']) {
    if (spawnSync(p, ['--version']).status === 0) return p;
  }
  return null;
}

async function runPython(script, scriptArgs) {
  const py = python();
  if (!py) {
    console.error('[kori] Не найден Python. Установи Python 3 с numpy и opencv-python или укажи KORI_PYTHON.');
    return 2;
  }
  const env = { ...process.env };
  if (!env.PYTHONIOENCODING) env.PYTHONIOENCODING = 'utf-8';
  // Python-инструменты используют тот же ffmpeg, что и Kōri (ffmpeg-static), даже если его нет в PATH
  const { ffmpegPath, ffprobePath } = await import('../pipeline/ffmpeg.mjs');
  env.KORI_FFMPEG = env.KORI_FFMPEG || ffmpegPath();
  env.KORI_FFPROBE = env.KORI_FFPROBE || ffprobePath();
  const r = spawnSync(py, [path.join(rootDir, 'tools', script), ...scriptArgs], { stdio: 'inherit', env });
  return r.status ?? 1;
}

async function loadStyle(style) {
  if (style === 'gacha-hype') return import('../pipeline/styles/gachaHype.mjs');
  if (style === 'velocity') return import('../pipeline/styles/velocity.mjs');
  throw new Error(`Стиль «${style}» пока не реализован в конвейере. Доступно: gacha-hype, velocity`);
}

async function makePlan() {
  const audio = getArg('--audio');
  const styleId = getArg('--style', 'gacha-hype');
  const style = await loadStyle(styleId);
  let sources;
  let usage = {};
  if (styleId === 'velocity') {
    const clipArgs = getList('--clips');
    if (!audio || !clipArgs.length) throw new Error('Нужны --audio <трек> и --clips <папка или файлы>');
    const { collectClips, loadClipMeta } = await import('../pipeline/clips.mjs');
    sources = { clips: loadClipMeta(collectClips(clipArgs)) };
    if (!args.includes('--no-history')) usage = (await import('../pipeline/clips.mjs')).loadUsage(sources.clips);
  } else {
    const art = getList('--art');
    if (!audio || !art.length) throw new Error('Нужны --audio <трек> и --art <папка или файлы>');
    const { collectArt, loadArtMeta } = await import('../pipeline/art.mjs');
    sources = { assets: loadArtMeta(collectArt(art)) };
  }
  return style.buildPlan({
    audioFile: path.resolve(audio),
    ...sources,
    targetDuration: parseFloat(getArg('--duration', '15')),
    fps: parseInt(getArg('--fps', '60'), 10),
    signature: getArg('--signature', ''),
    leadFrames: parseFloat(getArg('--lead-frames', '2')),
    usage,
    seed: parseInt(getArg('--seed', '0'), 10),
    sfxLibrary: getArg('--sfx') ? (await import('../pipeline/sfx.mjs')).loadSfxLibrary(getArg('--sfx')) : null,
  });
}

function readPlan() {
  const p = getArg('--plan');
  if (!p) throw new Error('Нужен --plan plan.json');
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

async function lintOrExit(plan, force) {
  const { lintPlan } = await import('../pipeline/lint.mjs');
  const res = lintPlan(plan);
  for (const w of res.warnings) console.log(`  [WARN] ${w}`);
  for (const e of res.errors) console.log(`  [FAIL] ${e}`);
  console.log(res.ok ? '[kori] Линтер: ошибок нет' : `[kori] Линтер: ошибок ${res.errors.length}`);
  if (!res.ok && !force) {
    console.error('[kori] Рендер остановлен: исправь план или запусти с --force');
    process.exit(1);
  }
  return res;
}

async function exportPlan(plan, out) {
  const { renderPlan } = await import('../pipeline/render.mjs');
  console.log(`[kori] Рендер ${Math.round(plan.duration * plan.fps)} кадров → ${out}`);
  await renderPlan(plan, out, {
    onProgress: (i, n, sec) => {
      if (i % 120 === 0 || i === n) console.log(`  ${i}/${n} кадров, ${sec.toFixed(0)} с`);
    },
  });
  console.log(`[kori] Готово: ${out}`);
  // сцены готового эдита — в историю, чтобы следующий эдит из той же папки взял другие
  if (plan.usedScenes) (await import('../pipeline/clips.mjs')).recordUsage(plan);
  const code = await runPython('edit_qa.py', [out]);
  if (code !== 0) console.log('[kori] edit_qa.py: проверка НЕ пройдена (см. отчёт выше)');
  return code;
}

function summary(plan) {
  const a = plan.audio;
  console.log(`[kori] Темп ${a.bpm} BPM, фрагмент ${a.start.toFixed(2)}–${(a.start + a.duration).toFixed(2)} с трека`);
  console.log(`[kori] Дроп на ${a.dropAt.toFixed(2)} с эдита (+${a.dropRise} дБ), ритмический рисунок (шестнадцатые 0–15): ${a.pattern.join(', ')}`);
  console.log(`[kori] Кадров: ${plan.shots.length}, акцентов: ${plan.accents.length}, вспышек: ${plan.events.filter((e) => e.type === 'flash').length}`);
  if (plan.semanticCuts && plan.semanticCuts.length) console.log(`[kori] Смысловые склейки: ${plan.semanticCuts.map((m) => `${m.t.toFixed(2)} с ${m.from} → ${m.to}`).join('; ')}`);
  if (plan.matchCuts) console.log(`[kori] Склеек по движению: ${plan.matchCuts.length}${plan.matchCuts.length ? ` (${plan.matchCuts.map((m) => m.t.toFixed(2)).join(', ')} с)` : ''}`);
  if (plan.sfx && plan.sfx.length) {
    const byType = {};
    for (const x of plan.sfx) byType[x.type] = (byType[x.type] || 0) + 1;
    console.log(`[kori] Звуковые эффекты: ${Object.entries(byType).map(([k, v]) => `${k} ×${v}`).join(', ')}`);
  }
}

async function main() {
  if (!command || command === '--help' || command === '-h') {
    console.log(HELP);
    return 0;
  }
  switch (command) {
    case 'faces': {
      const dir = args[1];
      if (!dir) throw new Error('Укажи папку с артами: kori faces <папка>');
      return runPython('detect_faces.py', [dir, ...args.slice(2)]);
    }
    case 'clips': {
      const dir = args[1];
      if (!dir) throw new Error('Укажи папку с видео: kori clips <папка>');
      return runPython('analyze_clips.py', [dir, ...args.slice(2)]);
    }
    case 'analyze': {
      const { analyzeTrack, findDrop, accentPattern } = await import('../pipeline/audio.mjs');
      const a = analyzeTrack(getArg('--audio'));
      const drop = findDrop(a, 2, 6);
      const pat = drop ? accentPattern(a, drop.bar, drop.bar + 6) : null;
      const out = {
        bpm: a.bpm,
        tempoCandidates: a.tempoCandidates,
        duration: a.duration,
        firstBeats: a.beats.slice(0, 16).map((t) => Number(t.toFixed(3))),
        downbeats: a.downbeats.slice(0, 16).map((t) => Number(t.toFixed(3))),
        drop,
        accentPattern: pat,
      };
      console.log(JSON.stringify(out, null, 2));
      return 0;
    }
    case 'plan': {
      const plan = await makePlan();
      const out = getArg('--out', 'plan.json');
      fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
      fs.writeFileSync(out, JSON.stringify(plan, null, 2));
      summary(plan);
      await lintOrExit(plan, true);
      console.log(`[kori] План сохранён: ${out}`);
      return 0;
    }
    case 'lint': {
      const res = await lintOrExit(readPlan(), true);
      return res.ok ? 0 : 1;
    }
    case 'stills': {
      const { renderStills } = await import('../pipeline/render.mjs');
      const times = getArg('--times', '0').split(',').map(Number);
      const files = await renderStills(readPlan(), times, getArg('--out', 'stills'));
      files.forEach((f) => console.log(f));
      return 0;
    }
    case 'export': {
      const plan = readPlan();
      await lintOrExit(plan, args.includes('--force'));
      return exportPlan(plan, getArg('--out', 'edit.mp4'));
    }
    case 'render': {
      const plan = await makePlan();
      const out = getArg('--out', 'edit.mp4');
      const planOut = out.replace(/\.mp4$/i, '') + '.plan.json';
      fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
      fs.writeFileSync(planOut, JSON.stringify(plan, null, 2));
      summary(plan);
      console.log(`[kori] План: ${planOut}`);
      await lintOrExit(plan, args.includes('--force'));
      return exportPlan(plan, out);
    }
    case 'qa':
      return runPython('edit_qa.py', args.slice(1));
    default:
      console.log(HELP);
      return 1;
  }
}

main()
  .then((code) => process.exit(code ?? 0))
  .catch((err) => {
    console.error(`[kori] Ошибка: ${err.message}`);
    process.exit(1);
  });
