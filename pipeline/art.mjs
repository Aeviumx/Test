// Загрузка разметки артов (kori_art_meta.json, её делает tools/detect_faces.py).
import fs from 'fs';
import path from 'path';

export function loadArtMeta(files) {
  const byDir = new Map();
  const assets = [];
  for (const file of files) {
    const dir = path.dirname(file);
    if (!byDir.has(dir)) {
      const metaPath = path.join(dir, 'kori_art_meta.json');
      if (!fs.existsSync(metaPath)) {
        throw new Error(
          `Нет разметки артов в ${dir}. Запусти: python tools/detect_faces.py "${dir}"`,
        );
      }
      byDir.set(dir, JSON.parse(fs.readFileSync(metaPath, 'utf-8')));
    }
    const meta = byDir.get(dir)[path.basename(file)];
    if (!meta) throw new Error(`Арт ${file} не размечен. Запусти: python tools/detect_faces.py "${dir}"`);
    if (meta.size !== fs.statSync(file).size && !meta.locked) {
      console.warn(`[kori] Внимание: ${path.basename(file)} изменён после разметки — перезапусти detect_faces.py`);
    }
    assets.push({ id: path.basename(file, path.extname(file)), path: path.resolve(file), ...meta });
  }
  return assets;
}

/** Все арты из папки или списка путей. */
export function collectArt(inputs) {
  const exts = new Set(['.png', '.jpg', '.jpeg', '.webp']);
  const out = [];
  for (const p of inputs) {
    if (fs.statSync(p).isDirectory()) {
      for (const f of fs.readdirSync(p).sort()) if (exts.has(path.extname(f).toLowerCase())) out.push(path.join(p, f));
    } else out.push(p);
  }
  return out;
}
