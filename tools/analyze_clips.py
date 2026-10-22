#!/usr/bin/env python3
"""
Разметка видеоклипов (твиксторы, нарезки) для Kōri.

Для каждого видео в папке пишет запись в <папка>/kori_clip_meta.json:
  fps, width, height, duration
  scenes — список сцен: start/end (с), motion (средняя сила движения), peak (момент максимального движения),
           face_x / face_y (центр лица в долях кадра или null) — по нему вертикальный кадр обрезается из 16:9

Склейки ищутся по резкому скачку разницы кадров (порог адаптивный), вспышки длиной 1–2 кадра
склейкой не считаются. Лица — каскад lbpcascade_animeface (как в detect_faces.py).

Использование: python tools/analyze_clips.py public/assets
"""
import argparse
import json
import os
import sys

import cv2
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
CASCADE = os.path.join(HERE, "lbpcascade_animeface.xml")
EXTS = (".mp4", ".mov", ".webm", ".mkv", ".m4v")


def read_small(path):
    cap = cv2.VideoCapture(path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    small = []
    while True:
        ok, fr = cap.read()
        if not ok:
            break
        small.append(cv2.cvtColor(cv2.resize(fr, (128, 72), interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2GRAY).astype(np.float32))
    cap.release()
    return fps, w, h, small


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


def detect_face(path, t, cas):
    cap = cv2.VideoCapture(path)
    cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000)
    ok, fr = cap.read()
    cap.release()
    if not ok:
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


def analyze(path):
    fps, w, h, small = read_small(path)
    n = len(small)
    cuts, diff = find_cuts(small, fps)
    bounds = [0] + cuts + [n]
    cas = cv2.CascadeClassifier(CASCADE)
    scenes = []
    for a, b in zip(bounds[:-1], bounds[1:]):
        if b - a < 3:
            continue
        seg = diff[a + 1 : b]
        motion = float(seg.mean()) if len(seg) else 0.0
        peak = (a + 1 + int(np.argmax(seg))) / fps if len(seg) else a / fps
        found = [detect_face(path, (a + (b - a) * q) / fps, cas) for q in (0.25, 0.5, 0.75)]
        found = [f for f in found if f]
        face = None
        if found:
            face = {
                "x": round(float(np.median([f[0] for f in found])), 4),
                "y": round(float(np.median([f[1] for f in found])), 4),
                "size": round(float(np.median([f[2] for f in found])), 4),
            }
        scenes.append({
            "start": round(a / fps, 4), "end": round(b / fps, 4), "frames": b - a,
            "motion": round(motion, 3), "peak": round(peak, 4), "face": face,
        })
    return {
        "file": os.path.basename(path), "fps": round(fps, 3), "width": w, "height": h,
        "duration": round(n / fps, 4), "size": os.path.getsize(path), "scenes": scenes,
    }


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
        if old and old.get("size") == os.path.getsize(path) and not old.get("stale"):
            continue
        info = analyze(path)
        meta[name] = info
        faces = sum(1 for s in info["scenes"] if s["face"])
        print(f'{name}: {info["width"]}x{info["height"]} {info["fps"]} fps, сцен {len(info["scenes"])}, с лицом {faces}')
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)
    print(f"Разметка клипов сохранена: {meta_path}")


if __name__ == "__main__":
    sys.exit(main())
