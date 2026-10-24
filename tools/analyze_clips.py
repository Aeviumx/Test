#!/usr/bin/env python3
"""
Разметка видеоклипов (твиксторы, нарезки) для Kōri.

Для каждого видео в папке пишет запись в <папка>/kori_clip_meta.json:
  fps, width, height, duration
  scenes — список сцен: start/end (с), motion (средняя сила движения), peak (момент максимального движения),
           face_x / face_y (центр лица в долях кадра или null) — по нему вертикальный кадр обрезается из 16:9

Склейки ищутся по резкому скачку разницы кадров (порог адаптивный), вспышки длиной 1–2 кадра
склейкой не считаются. Лица — каскад lbpcascade_animeface (как в detect_faces.py).

Ещё пишет:
  kori_scenes.jpg (kori_scenes_2.jpg…) — лист сцен с подписями «клип#сцена», чтобы глазами оценить крупность плана
  kori_scene_tags.json — метки сцен: "close" | "medium" | "wide" | "skip" (null — не размечено).
      Заполняет тот, кто видит лист сцен (агент или человек); уже поставленные метки не перезаписываются.
      "wide" — общий план с маленькими фигурками: в вертикальном кадре не читается, эдит его не берёт.

Использование: python tools/analyze_clips.py public/assets
"""
import argparse
import json
import os
import shutil
import subprocess
import sys

import cv2
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
CASCADE = os.path.join(HERE, "lbpcascade_animeface.xml")
EXTS = (".mp4", ".mov", ".webm", ".mkv", ".m4v")
META_VERSION = 8  # 2: кривая движения; 3: яркость и контраст; 4: центр кадрирования без лица; 5: доля дублей; 6: траектория персонажа; 7: направление движения; 8: траектория держится за персонажа, а не за эффекты
CURVE_RATE = 20
TRACK_RATE = 4


FFMPEG = os.environ.get("KORI_FFMPEG") or shutil.which("ffmpeg") or "ffmpeg"
FFPROBE = os.environ.get("KORI_FFPROBE") or shutil.which("ffprobe") or "ffprobe"


def probe(path):
    r = subprocess.run([FFPROBE, "-v", "error", "-select_streams", "v:0", "-show_entries",
                        "stream=width,height,r_frame_rate", "-of", "json", path], capture_output=True)
    st = json.loads(r.stdout or b"{}").get("streams", [{}])[0]
    num, den = (st.get("r_frame_rate", "30/1").split("/") + ["1"])[:2]
    return float(num) / float(den or 1), int(st.get("width", 0)), int(st.get("height", 0))


def read_small(path):
    """Все кадры клипа в миниатюре 128×72 (серые) — через ffmpeg, он понимает любые пути и форматы."""
    fps, w, h = probe(path)
    r = subprocess.run([FFMPEG, "-v", "error", "-i", path, "-vf", "scale=128:72,format=gray",
                        "-f", "rawvideo", "-"], capture_output=True)
    raw = np.frombuffer(r.stdout, dtype=np.uint8)
    n = len(raw) // (128 * 72)
    small = list(raw[: n * 128 * 72].reshape(n, 72, 128).astype(np.float32))
    return fps, w, h, small


def grab_frame(path, t):
    r = subprocess.run([FFMPEG, "-v", "error", "-ss", f"{t:.3f}", "-i", path, "-frames:v", "1",
                        "-f", "image2pipe", "-vcodec", "png", "-"], capture_output=True)
    if not r.stdout:
        return None
    return cv2.imdecode(np.frombuffer(r.stdout, dtype=np.uint8), cv2.IMREAD_COLOR)


def find_cuts(small, fps):
    if len(small) < 3:
        return []
    diff = np.array([0.0] + [float(np.abs(small[i] - small[i - 1]).mean()) for i in range(1, len(small))])
    med = float(np.median(diff[1:])) or 1.0
    thr = max(18.0, 5.0 * med)
    cuts = []
    min_len = int(0.3 * fps)
    for i in range(1, len(small)):
        if diff[i] < thr:
            continue
        # вспышка: кадр через 2 после скачка похож на кадр до скачка — это не склейка
        if i + 2 < len(small) and np.abs(small[i + 2] - small[i - 1]).mean() < thr * 0.5:
            continue
        if cuts and i - cuts[-1] < min_len:
            continue
        cuts.append(i)
    return cuts, diff


def frame_flow(small):
    """Направление движения на каждом кадре: средний оптический поток, взвешенный по его силе,
    в ширинах кадра за кадр (x вправо, y вниз). Нужен для склеек «по движению»."""
    out = [(0.0, 0.0)]
    for i in range(1, len(small)):
        a = small[i - 1].astype(np.uint8)
        b = small[i].astype(np.uint8)
        f = cv2.calcOpticalFlowFarneback(a, b, None, 0.5, 2, 9, 2, 5, 1.1, 0)
        mag = np.hypot(f[..., 0], f[..., 1])
        wsum = float(mag.sum()) + 1e-6
        out.append((float((f[..., 0] * mag).sum() / wsum) / 128, float((f[..., 1] * mag).sum() / wsum) / 128))
    return out


def detect_face(path, t, cas):
    fr = grab_frame(path, t)
    if fr is None:
        return None
    h, w = fr.shape[:2]
    s = 720.0 / h
    small = cv2.resize(fr, None, fx=s, fy=s)
    g = cv2.equalizeHist(cv2.cvtColor(small, cv2.COLOR_BGR2GRAY))
    faces = cas.detectMultiScale(g, scaleFactor=1.05, minNeighbors=4, minSize=(40, 40))
    if len(faces) == 0:
        return None
    x, y, fw, fh = max(faces, key=lambda f: f[2] * f[3])
    return ((x + fw / 2) / s / w, (y + fh / 2) / s / h, fh / s / h)


def subject_track(path, w, h):
    """Где персонаж в каждый момент: 4 замера в секунду по всему клипу.
    Лицо (если найдено) — главный ориентир; без лица — колонка кадра, где больше всего
    деталей и движения в верхних 3/4 кадра (там голова и корпус). Возвращает список
    (время, x центра 0..1, есть ли лицо, «размер» объекта 0..1)."""
    sw = 640
    sh = int(round(h * sw / w / 2) * 2)
    r = subprocess.run([FFMPEG, "-v", "error", "-i", path, "-vf", f"fps={TRACK_RATE},scale={sw}:{sh}",
                        "-pix_fmt", "bgr24", "-f", "rawvideo", "-"], capture_output=True)
    raw = np.frombuffer(r.stdout, dtype=np.uint8)
    n = len(raw) // (sw * sh * 3)
    if n == 0:
        return []
    frames = raw[: n * sw * sh * 3].reshape(n, sh, sw, 3)
    cas = cv2.CascadeClassifier(CASCADE)
    crop_frac = min(1.0, (9 / 16) * h / max(1, w))
    win = max(1, int(round(crop_frac * sw)))
    out = []
    prev = None
    for i in range(n):
        g = cv2.cvtColor(frames[i], cv2.COLOR_BGR2GRAY)
        top = g[: int(sh * 0.75)].astype(np.float32)
        grad = np.abs(np.diff(top, axis=1)).mean(axis=0)
        mot = np.abs(top - prev).mean(axis=0)[:-1] if prev is not None else np.zeros_like(grad)
        prev = top
        # движение весит мало: дым, огонь и вспышки двигаются сильнее персонажа и уводили окно с него
        energy = grad + 0.3 * mot
        dens = np.convolve(energy, np.ones(win), "valid")
        c = int(np.argmax(dens)) if len(dens) else 0
        x = (c + win / 2) / len(energy) if len(dens) else 0.5
        conc = float(dens[c] / (energy.sum() + 1e-6)) if len(dens) else 0.0
        faces = cas.detectMultiScale(cv2.equalizeHist(g), scaleFactor=1.08, minNeighbors=4, minSize=(28, 28))
        face = 0
        size = conc
        if len(faces):
            fx, fy, fw, fh = max(faces, key=lambda f: f[2] * f[3])
            x = (fx + fw / 2) / sw
            face = 1
            size = max(size, fh / sh * 2.5)
        out.append([round(i / TRACK_RATE, 3), round(float(x), 4), face, round(min(1.0, size), 3)])
    # окно не может уехать быстрее чем на 6% кадра за замер (0.25 с): резкий скачок — это чаще эффект, а не персонаж
    for k in range(1, len(out)):
        d = out[k][1] - out[k - 1][1]
        if abs(d) > 0.06 and not out[k][2]:
            out[k][1] = round(out[k - 1][1] + 0.06 * np.sign(d), 4)
    # сглаживание: медиана по 3 замерам, затем скользящее среднее — камера не должна дёргаться
    xs = np.array([o[1] for o in out])
    if len(xs) >= 3:
        med = np.array([np.median(xs[max(0, k - 1): k + 2]) for k in range(len(xs))])
        sm = np.convolve(np.pad(med, 1, mode="edge"), np.ones(3) / 3, "valid")
        for k, o in enumerate(out):
            o[1] = round(float(sm[k]), 4)
    return out


def analyze(path):
    fps, w, h, small = read_small(path)
    n = len(small)
    cuts, diff = find_cuts(small, fps)
    bounds = [0] + cuts + [n]
    track = subject_track(path, w, h)
    flow = frame_flow(small)
    cas = cv2.CascadeClassifier(CASCADE)
    scenes = []
    for a, b in zip(bounds[:-1], bounds[1:]):
        if b - a < 3:
            continue
        seg = diff[a + 1 : b]
        # доля повторяющихся кадров: у «растянутого» видео вместо твикстора их много — движение дёргается
        dup = float((seg < 0.25).mean()) if len(seg) else 0.0
        # читаемость: средняя яркость и контраст — тёмные «каши» без деталей в эдит не годятся
        frames = np.stack(small[a:b:max(1, (b - a) // 8)])
        luma = float(frames.mean())
        contrast = float(frames.std(axis=(1, 2)).mean())
        motion = float(seg.mean()) if len(seg) else 0.0
        peak = (a + 1 + int(np.argmax(seg))) / fps if len(seg) else a / fps
        # кривая движения внутри сцены, 20 значений в секунду от начала сцены: по ней стиль ставит
        # замедление на момент удара/взмаха, а не на случайный кадр
        step = max(1, int(round(fps / CURVE_RATE)))
        sm = np.convolve(diff[a:b], np.ones(3) / 3, "same") if b - a >= 3 else diff[a:b]
        curve = [round(float(sm[i : i + step].mean()), 2) for i in range(0, b - a, step)]
        # направление движения с той же частотой, в ширинах кадра в секунду
        fl = flow[a:b]
        flow_c = [[round(float(np.mean([f[0] for f in fl[i : i + step]])) * fps, 3),
                   round(float(np.mean([f[1] for f in fl[i : i + step]])) * fps, 3)] for i in range(0, b - a, step)]
        found = [detect_face(path, (a + (b - a) * q) / fps, cas) for q in (0.25, 0.5, 0.75)]
        found = [f for f in found if f]
        face = None
        if found:
            face = {
                "x": round(float(np.median([f[0] for f in found])), 4),
                "y": round(float(np.median([f[1] for f in found])), 4),
                "size": round(float(np.median([f[2] for f in found])), 4),
            }
        # запасной центр кадрирования без лица: окно 9:16 туда, где в верхних 60% кадра больше всего деталей
        # (линии волос, глаз, лица); у широкого кадра это обычно персонаж, а не фон
        crop_frac = min(1.0, (9 / 16) * h / max(1, w))
        gx = np.abs(np.diff(frames[:, : int(72 * 0.6), :], axis=2)).mean(axis=(0, 1))
        win = max(1, int(round(crop_frac * len(gx))))
        dens = np.convolve(gx, np.ones(win), "valid")
        focus_x = (int(np.argmax(dens)) + win / 2) / len(gx) if len(dens) else 0.5
        scenes.append({
            "start": round(a / fps, 4), "end": round(b / fps, 4), "frames": b - a,
            "motion": round(motion, 3), "peak": round(peak, 4), "face": face, "curve": curve,
            "luma": round(luma, 1), "contrast": round(contrast, 1), "focus_x": round(float(focus_x), 4),
            "dup": round(dup, 3), "flow": flow_c,
            # траектория персонажа внутри сцены: [время от начала сцены, x 0..1, лицо 0/1, размер 0..1]
            "track": [[round(t - a / fps, 3), x, f, sz] for t, x, f, sz in track if a / fps - 1e-6 <= t < b / fps],
        })
    return {
        "file": os.path.basename(path), "fps": round(fps, 3), "width": w, "height": h,
        "duration": round(n / fps, 4), "size": os.path.getsize(path), "scenes": scenes,
        "version": META_VERSION, "curve_rate": CURVE_RATE,
    }


def write_sheet(folder, meta, cols=6, rows=8):
    """Лист сцен: кадр в момент пика движения каждой сцены, подпись «клип#сцена»."""
    for old in os.listdir(folder):
        if old.startswith("kori_scenes") and old.endswith(".jpg"):
            os.remove(os.path.join(folder, old))
    tiles = []
    for name in sorted(meta):
        for i, sc in enumerate(meta[name]["scenes"]):
            if sc["end"] - sc["start"] < 0.35:
                continue
            fr = grab_frame(os.path.join(folder, name), min(sc["peak"], sc["end"] - 0.05))
            tile = np.zeros((180, 320, 3), np.uint8) if fr is None else cv2.resize(fr, (320, 180))
            cv2.rectangle(tile, (0, 0), (320, 18), (0, 0, 0), -1)
            cv2.putText(tile, f"{name.rsplit('.', 1)[0]}#{i}", (4, 13), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (0, 255, 255), 1)
            tiles.append(tile)
    per = cols * rows
    files = []
    for p in range(0, len(tiles), per):
        page = tiles[p : p + per]
        while len(page) % cols:
            page.append(np.zeros_like(page[0]))
        img = np.vstack([np.hstack(page[r : r + cols]) for r in range(0, len(page), cols)])
        f = os.path.join(folder, "kori_scenes.jpg" if p == 0 else f"kori_scenes_{p // per + 1}.jpg")
        cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 85])[1].tofile(f)
        files.append(f)
    return files


def update_tags(folder, meta):
    """Шаблон меток: новые сцены добавляются с null, уже поставленные метки остаются."""
    path = os.path.join(folder, "kori_scene_tags.json")
    tags = {}
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            tags = json.load(f)
    tags["_help"] = ('Метка сцены по листу kori_scenes.jpg — строка с крупностью или объект. Крупность "scale": "close" (лицо/по пояс), '
                     '"medium" (фигура целиком), "wide" (общий план, маленькие фигурки — эдит не берёт), "skip" (не брать). '
                     'Объект: {"scale": "close", "action": "attack|hit|charge|move|react|pose", "who": "имя персонажа", '
                     '"focus": 0.2}. action — что происходит: attack — наносит удар/выпускает технику, hit — получает удар, '
                     'взрыв на цели; charge — замах, концентрация; move — рывок, полёт; react — эмоция, крик; pose — стоит, смотрит. '
                     'Эдит ставит после attack кадр hit другого персонажа, после charge — attack того же. '
                     'focus — где персонаж по горизонтали (0 — левый край, 1 — правый), если окно кадра уезжает с него. '
                     'null — не размечено.')
    for name in sorted(meta):
        for i, sc in enumerate(meta[name]["scenes"]):
            if sc["end"] - sc["start"] >= 0.35:
                tags.setdefault(f"{name.rsplit('.', 1)[0]}#{i}", None)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(tags, f, ensure_ascii=False, indent=2)
    return path, sum(1 for k, v in tags.items() if k != "_help" and v is None)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("folder")
    args = ap.parse_args()
    meta_path = os.path.join(args.folder, "kori_clip_meta.json")
    meta = {}
    if os.path.exists(meta_path):
        with open(meta_path, encoding="utf-8") as f:
            meta = json.load(f)
    for name in sorted(os.listdir(args.folder)):
        if not name.lower().endswith(EXTS):
            continue
        path = os.path.join(args.folder, name)
        old = meta.get(name)
        if old and old.get("size") == os.path.getsize(path) and old.get("version") == META_VERSION:
            continue
        info = analyze(path)
        meta[name] = info
        faces = sum(1 for s in info["scenes"] if s["face"])
        print(f'{name}: {info["width"]}x{info["height"]} {info["fps"]} fps, сцен {len(info["scenes"])}, с лицом {faces}')
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)
    print(f"Разметка клипов сохранена: {meta_path}")
    for f in write_sheet(args.folder, meta):
        print(f"Лист сцен: {f}")
    tags_path, empty = update_tags(args.folder, meta)
    if empty:
        print(f"Метки крупности: {tags_path} — не размечено сцен: {empty}. Посмотри лист сцен и поставь close/medium/wide/skip")


if __name__ == "__main__":
    sys.exit(main())
