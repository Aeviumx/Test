#!/usr/bin/env python3
"""
Разметка артов для Kōri: лицо, контур персонажа, основной цвет.

Для каждого PNG/JPG в папке пишет запись в <папка>/kori_art_meta.json:
  kind     — "character" (прозрачный фон, один персонаж) или "scene" (обычная картинка)
  bbox     — рамка непрозрачной части [x, y, w, h] в пикселях исходника
  face     — главное лицо [x, y, w, h] или null
  faces    — все найденные лица
  palette  — основной насыщенный цвет "#rrggbb" и тёмный вариант для фона

Детектор: если есть models/anime_face_detect.onnx (YOLOv8) и onnxruntime — он;
иначе каскад lbpcascade_animeface (MIT, nagadomi), лежит рядом в tools/.
Ручная правка: в kori_art_meta.json можно поправить "face" руками и поставить "locked": true —
тогда повторный запуск эту запись не перезапишет.

Использование: python tools/detect_faces.py test-assets/real/art [--preview папка]
"""
import argparse
import json
import os
import sys

import cv2
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
CASCADE = os.path.join(HERE, "lbpcascade_animeface.xml")
YOLO = os.path.join(HERE, "..", "models", "anime_face_detect.onnx")
EXTS = (".png", ".jpg", ".jpeg", ".webp")


def load_rgba(path):
    # imdecode вместо imread: на Windows imread не открывает пути с кириллицей
    im = cv2.imdecode(np.fromfile(path, dtype=np.uint8), cv2.IMREAD_UNCHANGED)
    if im is None:
        raise RuntimeError(f"не удалось прочитать {path}")
    if im.ndim == 2:
        im = cv2.cvtColor(im, cv2.COLOR_GRAY2BGRA)
    elif im.shape[2] == 3:
        im = cv2.cvtColor(im, cv2.COLOR_BGR2BGRA)
    return im  # BGRA, как читает OpenCV


def alpha_bbox(alpha):
    ys, xs = np.where(alpha > 24)
    if len(xs) == 0:
        return None
    return [int(xs.min()), int(ys.min()), int(xs.max() - xs.min() + 1), int(ys.max() - ys.min() + 1)]


def detect_cascade(bgr):
    cas = cv2.CascadeClassifier(CASCADE)
    scale = 1000.0 / max(bgr.shape[:2])
    small = cv2.resize(bgr, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
    gray = cv2.equalizeHist(cv2.cvtColor(small, cv2.COLOR_BGR2GRAY))
    found = cas.detectMultiScale(gray, scaleFactor=1.05, minNeighbors=3, minSize=(20, 20))
    return [[int(v / scale) for v in r] + [1.0] for r in found]


def detect_yolo(bgr):
    try:
        import onnxruntime as ort
    except ImportError:
        return None
    if not os.path.exists(YOLO):
        return None
    sess = ort.InferenceSession(YOLO, providers=["CPUExecutionProvider"])
    inp = sess.get_inputs()[0]
    size = inp.shape[2] if isinstance(inp.shape[2], int) else 640
    h, w = bgr.shape[:2]
    r = size / max(h, w)
    img = cv2.resize(bgr, (int(w * r), int(h * r)))
    pad = np.full((size, size, 3), 114, np.uint8)
    pad[: img.shape[0], : img.shape[1]] = img
    x = cv2.cvtColor(pad, cv2.COLOR_BGR2RGB).astype(np.float32).transpose(2, 0, 1)[None] / 255.0
    out = sess.run(None, {inp.name: x})[0][0]
    if out.shape[0] < out.shape[1]:
        out = out.T
    boxes = []
    for row in out:
        conf = float(row[4:].max())
        if conf < 0.35:
            continue
        cx, cy, bw, bh = row[:4]
        boxes.append([int((cx - bw / 2) / r), int((cy - bh / 2) / r), int(bw / r), int(bh / r), conf])
    # простое подавление пересечений
    boxes.sort(key=lambda b: -b[4])
    keep = []
    for b in boxes:
        if all(iou(b, k) < 0.4 for k in keep):
            keep.append(b)
    return keep


def iou(a, b):
    ax2, ay2, bx2, by2 = a[0] + a[2], a[1] + a[3], b[0] + b[2], b[1] + b[3]
    iw = max(0, min(ax2, bx2) - max(a[0], b[0]))
    ih = max(0, min(ay2, by2) - max(a[1], b[1]))
    inter = iw * ih
    return inter / max(1, a[2] * a[3] + b[2] * b[3] - inter)


def primary_face(faces, bbox, kind):
    """Главное лицо: для персонажа — крупное лицо в верхней части фигуры."""
    if not faces:
        return None
    if kind == "character" and bbox:
        top_zone = bbox[1] + bbox[3] * 0.45
        cands = [f for f in faces if f[1] + f[3] / 2 < top_zone]
        if not cands:
            return None
        return max(cands, key=lambda f: f[2] * f[3] * f[4])[:4]
    # сцена: лицо засчитываем, только если оно явно главное
    faces = sorted(faces, key=lambda f: -f[2] * f[3])
    if len(faces) == 1 or faces[0][2] * faces[0][3] > 2.5 * faces[1][2] * faces[1][3]:
        return faces[0][:4]
    return None


def palette(bgra):
    a = bgra[:, :, 3]
    small = cv2.resize(bgra, (200, int(200 * bgra.shape[0] / bgra.shape[1])), interpolation=cv2.INTER_AREA)
    m = small[:, :, 3] > 128 if a.min() < 250 else np.ones(small.shape[:2], bool)
    hsv = cv2.cvtColor(small[:, :, :3], cv2.COLOR_BGR2HSV)
    sat = (hsv[:, :, 1] > 90) & (hsv[:, :, 2] > 70) & m
    if sat.sum() < 50:
        sat = m
    hues = hsv[:, :, 0][sat].astype(np.float32)
    hist = np.bincount((hues / 6).astype(int), minlength=31)
    hb = int(hist.argmax())
    sel = sat & ((hsv[:, :, 0] // 6) == hb)
    bgr = small[:, :, :3][sel].reshape(-1, 3).mean(axis=0) if sel.sum() else np.array([180, 120, 120])
    hsv1 = cv2.cvtColor(np.uint8([[bgr]]), cv2.COLOR_BGR2HSV)[0, 0].astype(int)
    vivid = cv2.cvtColor(np.uint8([[[hsv1[0], max(hsv1[1], 170), max(hsv1[2], 200)]]]), cv2.COLOR_HSV2BGR)[0, 0]
    dark = cv2.cvtColor(np.uint8([[[hsv1[0], min(255, max(hsv1[1], 150)), 45]]]), cv2.COLOR_HSV2BGR)[0, 0]
    to_hex = lambda c: "#%02x%02x%02x" % (int(c[2]), int(c[1]), int(c[0]))  # BGR → #rrggbb
    return {"main": to_hex(vivid), "dark": to_hex(dark)}


def analyze(path):
    bgra = load_rgba(path)
    h, w = bgra.shape[:2]
    alpha = bgra[:, :, 3]
    transparent = float((alpha < 16).mean())
    kind = "character" if transparent > 0.2 else "scene"
    bbox = alpha_bbox(alpha) if kind == "character" else [0, 0, w, h]
    a = alpha[:, :, None].astype(np.float32) / 255.0
    bgr = (bgra[:, :, :3] * a + 255 * (1 - a)).astype(np.uint8)
    faces = detect_yolo(bgr)
    detector = "yolov8-anime-face"
    if faces is None:
        faces = detect_cascade(bgr)
        detector = "lbpcascade_animeface"
    face = primary_face(faces, bbox, kind)
    return {
        "file": os.path.basename(path), "width": w, "height": h, "kind": kind, "bbox": bbox,
        "face": face, "faces": [f[:4] for f in faces], "detector": detector,
        "palette": palette(bgra), "size": os.path.getsize(path), "locked": False,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("folder")
    ap.add_argument("--preview", default=None, help="сохранить картинки с рамками лиц")
    args = ap.parse_args()
    meta_path = os.path.join(args.folder, "kori_art_meta.json")
    meta = {}
    if os.path.exists(meta_path):
        with open(meta_path, encoding="utf-8") as f:
            meta = json.load(f)
    for name in sorted(os.listdir(args.folder)):
        if not name.lower().endswith(EXTS):
            continue
        path = os.path.join(args.folder, name)
        old = meta.get(name)
        if old and (old.get("locked") or old.get("size") == os.path.getsize(path)):
            continue
        info = analyze(path)
        meta[name] = info
        print(f'{name}: {info["kind"]}, лицо {info["face"]}, цвет {info["palette"]["main"]}')
        if args.preview:
            os.makedirs(args.preview, exist_ok=True)
            im = cv2.imdecode(np.fromfile(path, dtype=np.uint8), cv2.IMREAD_COLOR)
            for f in info["faces"]:
                cv2.rectangle(im, (f[0], f[1]), (f[0] + f[2], f[1] + f[3]), (0, 200, 255), 4)
            if info["face"]:
                f = info["face"]
                cv2.rectangle(im, (f[0], f[1]), (f[0] + f[2], f[1] + f[3]), (0, 255, 0), 8)
            s = 900 / max(im.shape[:2])
            ok, enc = cv2.imencode(".jpg", cv2.resize(im, None, fx=s, fy=s))
            if ok:
                enc.tofile(os.path.join(args.preview, name + ".jpg"))
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)
    print(f"Разметка сохранена: {meta_path}")


if __name__ == "__main__":
    sys.exit(main())
