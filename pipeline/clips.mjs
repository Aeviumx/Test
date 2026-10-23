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

/** Метки крупности сцен (kori_scene_tags.json рядом с клипами): «клип#сцена» → close | medium | wide | skip. */
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
    const scenes = meta.scenes.map((sc, i) => (tags[`${id}#${i}`] ? { ...sc, scale: tags[`${id}#${i}`] } : sc));
    return { id, path: path.resolve(file), ...meta, scenes };
  });
}
