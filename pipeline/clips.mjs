// Загрузка разметки видеоклипов (kori_clip_meta.json, её делает tools/analyze_clips.py).
import fs from 'fs';
import path from 'path';

const EXTS = new Set(['.mp4', '.mov', '.webm', '.mkv', '.m4v']);

export function collectClips(inputs) {
  const out = [];
  for (const p of inputs) {
    if (fs.statSync(p).isDirectory()) {
      for (const f of fs.readdirSync(p).sort()) if (EXTS.has(path.extname(f).toLowerCase())) out.push(path.join(p, f));
    } else out.push(p);
  }
  return out;
}

/**
 * Метки сцен (kori_scene_tags.json рядом с клипами): «клип#сцена» → крупность строкой (close | medium | wide | skip)
 * или объект { scale, action, who, focus } — что происходит в кадре, кто это и где он по горизонтали.
 */
function loadSceneTags(dir) {
  const p = path.join(dir, 'kori_scene_tags.json');
  if (!fs.existsSync(p)) return {};
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

export function loadClipMeta(files) {
  const cache = new Map();
  const tagCache = new Map();
  return files.map((file) => {
    const dir = path.dirname(file);
    if (!cache.has(dir)) {
      const metaPath = path.join(dir, 'kori_clip_meta.json');
      if (!fs.existsSync(metaPath)) throw new Error(`Нет разметки клипов в ${dir}. Запусти: npm run kori -- clips "${dir}"`);
      cache.set(dir, JSON.parse(fs.readFileSync(metaPath, 'utf-8')));
    }
    const meta = cache.get(dir)[path.basename(file)];
    if (!meta) throw new Error(`Клип ${file} не размечен. Запусти: npm run kori -- clips "${dir}"`);
    if (meta.size !== fs.statSync(file).size) console.warn(`[kori] Внимание: ${path.basename(file)} изменён после разметки — перезапусти clips`);
    if (!tagCache.has(dir)) tagCache.set(dir, loadSceneTags(dir));
    const id = path.basename(file, path.extname(file));
    const tags = tagCache.get(dir);
    const scenes = meta.scenes.map((sc, i) => {
      const tag = tags[`${id}#${i}`];
      if (!tag) return sc;
      if (typeof tag === 'string') return { ...sc, scale: tag };
      const { scale, action, who, focus } = tag;
      return { ...sc, scale, action, who, focus: typeof focus === 'number' ? focus : undefined };
    });
    return { id, path: path.resolve(file), ...meta, scenes };
  });
}

/**
 * История эдитов (kori_usage.json рядом с клипами): сколько раз сцена уже попала в готовые эдиты.
 * План отдаёт предпочтение сценам, которых ещё не было, — эдиты из одной папки не повторяют друг друга.
 */
export function loadUsage(clips) {
  const usage = {};
  for (const dir of new Set(clips.map((c) => path.dirname(c.path)))) {
    const p = path.join(dir, 'kori_usage.json');
    if (!fs.existsSync(p)) continue;
    for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(p, 'utf-8')))) usage[k] = (usage[k] || 0) + v;
  }
  return usage;
}

/** Записать сцены готового эдита в историю. */
export function recordUsage(plan) {
  const byDir = new Map();
  for (const key of plan.usedScenes || []) {
    const clip = plan.clips[key.split('#')[0]];
    if (!clip) continue;
    const dir = path.dirname(clip.path);
    if (!byDir.has(dir)) byDir.set(dir, []);
    byDir.get(dir).push(key);
  }
  for (const [dir, keys] of byDir) {
    const p = path.join(dir, 'kori_usage.json');
    const usage = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf-8')) : {};
    for (const k of new Set(keys)) usage[k] = (usage[k] || 0) + 1;
    fs.writeFileSync(p, JSON.stringify(usage, null, 2));
  }
}
