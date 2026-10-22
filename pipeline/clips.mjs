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

export function loadClipMeta(files) {
  const cache = new Map();
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
    return { id: path.basename(file, path.extname(file)), path: path.resolve(file), ...meta };
  });
}
