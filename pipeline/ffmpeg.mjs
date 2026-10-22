// Поиск ffmpeg/ffprobe и декодирование звука. Порядок: переменные окружения → ffmpeg-static → PATH.
import { spawn, spawnSync } from 'child_process';
import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';

const require = createRequire(import.meta.url);

function tryRequire(name) {
  try {
    return require(name);
  } catch {
    return null;
  }
}

export function ffmpegPath() {
  if (process.env.KORI_FFMPEG) return process.env.KORI_FFMPEG;
  const st = tryRequire('ffmpeg-static');
  if (typeof st === 'string' && fs.existsSync(st)) return st;
  return 'ffmpeg';
}

export function ffprobePath() {
  if (process.env.KORI_FFPROBE) return process.env.KORI_FFPROBE;
  const st = tryRequire('ffprobe-static');
  if (st && st.path && fs.existsSync(st.path)) return st.path;
  const ff = ffmpegPath();
  if (ff !== 'ffmpeg') {
    const guess = path.join(path.dirname(ff), process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe');
    if (fs.existsSync(guess)) return guess;
  }
  return 'ffprobe';
}

export function probeDuration(file) {
  const r = spawnSync(ffprobePath(), ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], {
    encoding: 'utf-8',
  });
  if (r.status !== 0) throw new Error(`ffprobe не смог прочитать ${file}: ${r.stderr}`);
  return parseFloat(r.stdout.trim());
}

/** Декодирует звук в моно Float32Array с частотой sr. */
export function decodeAudio(file, sr = 22050, start = 0, duration = 0) {
  const args = ['-v', 'error'];
  if (start > 0) args.push('-ss', String(start));
  args.push('-i', file);
  if (duration > 0) args.push('-t', String(duration));
  args.push('-ac', '1', '-ar', String(sr), '-f', 'f32le', '-');
  const r = spawnSync(ffmpegPath(), args, { maxBuffer: 1 << 30 });
  if (r.status !== 0) throw new Error(`ffmpeg не смог декодировать ${file}: ${r.stderr}`);
  const buf = r.stdout;
  return new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 4));
}

/** Двухпроходный loudnorm: замер громкости фрагмента. */
export function measureLoudness(file, start, duration, target = -14, tp = -1.5) {
  const r = spawnSync(
    ffmpegPath(),
    ['-hide_banner', '-nostats', '-ss', String(start), '-t', String(duration), '-i', file, '-af',
      `loudnorm=I=${target}:TP=${tp}:LRA=11:print_format=json`, '-f', 'null', '-'],
    { encoding: 'utf-8', maxBuffer: 1 << 26 },
  );
  const txt = r.stderr || '';
  const m = txt.match(/\{[\s\S]*?"input_i"[\s\S]*?\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}

export { spawn };
