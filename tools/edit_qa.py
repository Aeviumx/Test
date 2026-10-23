#!/usr/bin/env python3
"""
edit_qa.py: независимая проверка готового эдита (MP4) без доступа к исходникам проекта.

Измеряет только то, что видно и слышно в самом файле:
  - формат (разрешение, fps, длительность)
  - громкость (integrated LUFS) и true peak через ffmpeg ebur128, клиппинг
  - вспышки: количество, длина белых участков, интервалы между вспышками
  - синхрон: вспышки и склейки относительно ударов в звуке (независимый детектор)
  - пустые/чёрные полосы по краям кадра
  - застывшая картинка (долгие участки без движения)
  - хук: есть ли движение в первую секунду
Сохраняет отчёт JSON и раскадровку PNG с таймкодами.

Использование:
  python edit_qa.py путь/к/эдиту.mp4 [--ffmpeg путь/к/ffmpeg] [--out папка]
Код выхода 0 = PASS, 1 = FAIL.
Зависимости: Python 3.9+, numpy, ffmpeg и ffprobe.
"""
import argparse
import json
import os
import re
import shutil
import subprocess
import sys

import numpy as np

# Пороги приёмки. Менять их можно только по решению автора эдитов, не исполнителя.
THRESHOLDS = {
    "width": 1080,
    "height": 1920,
    "min_fps": 30,
    "duration_s": (7.0, 60.0),
    "lufs": (-16.0, -12.0),
    "true_peak_dbtp_max": -1.0,
    "clipped_samples_max": 0,
    "white_luma": 200,               # средняя яркость кадра (0..255), выше = «белый кадр»
    "blank_luma": 225,               # «пустой белый экран»: очень светлый и почти однотонный кадр
    "blank_std": 18,
    "flash_jump": 40,                # скачок яркости между кадрами, считающийся вспышкой
    "max_white_run_frames": 4,       # дольше пустой белый экран держать нельзя
    "max_flashes_per_10s": 10,       # больше = стробоскоп (у референса ~8)
    "min_flash_gap_s": 0.4,
    # Синхрон. Монтажёры ставят склейку/вспышку на 1–3 кадра РАНЬШЕ удара — так она воспринимается «в бит»
    # (у референса профи медиана −40 мс). Позже удара — заметно сразу. Главное — постоянство смещения.
    "sync_search_window_s": 0.15,
    "sync_offset_range_ms": (-60, 17),  # медиана смещения «событие минус удар»
    "max_jitter_ms": 25,                # разброс (медиана отклонений от медианы); у профи ~22
    "warn_jitter_ms": 12,
    "min_consistent_ratio": 0.5,        # доля событий в пределах ±2 кадров от медианного смещения
    "freeze_diff": 0.35,             # средняя разница соседних кадров (0..255) ниже = нет движения
    "max_freeze_s": 2.0,
    "edge_bar_frac": 0.012,          # толщина проверяемой полосы у края кадра
}


def run(cmd, capture=True):
    r = subprocess.run(cmd, stdout=subprocess.PIPE if capture else None,
                       stderr=subprocess.PIPE, check=False)
    return r


def probe(ffprobe, path):
    r = run([ffprobe, "-v", "error", "-show_entries",
             "stream=codec_type,width,height,r_frame_rate:format=duration",
             "-of", "json", path])
    info = json.loads(r.stdout or "{}")
    v = next((s for s in info.get("streams", []) if s.get("codec_type") == "video"), {})
    a = next((s for s in info.get("streams", []) if s.get("codec_type") == "audio"), None)
    num, den = (v.get("r_frame_rate", "0/1").split("/") + ["1"])[:2]
    fps = float(num) / float(den or 1) if float(den or 1) else 0.0
    return {
        "width": v.get("width"), "height": v.get("height"), "fps": round(fps, 3),
        "duration": float(info.get("format", {}).get("duration", 0)),
        "has_audio": a is not None,
    }


def read_gray_frames(ffmpeg, path, fps, w=96):
    """Кадры в оттенках серого, уменьшенные до ширины w, с исходной частотой кадров."""
    h_cmd = run([ffmpeg, "-v", "error", "-i", path, "-vf",
                 f"scale={w}:-2,format=gray", "-f", "rawvideo", "-"])
    raw = np.frombuffer(h_cmd.stdout, dtype=np.uint8)
    # высоту восстанавливаем по пропорциям первого кадра
    pr = run([ffmpeg, "-v", "error", "-i", path, "-frames:v", "1", "-vf",
              f"scale={w}:-2,format=gray", "-f", "rawvideo", "-"])
    h = len(pr.stdout) // w
    n = len(raw) // (w * h)
    return raw[: n * w * h].reshape(n, h, w).astype(np.float32)


def read_audio(ffmpeg, path, sr=22050, af=None):
    r = run([ffmpeg, "-v", "error", "-i", path] + (["-af", af] if af else []) + ["-ac", "1", "-ar", str(sr), "-f", "f32le", "-"])
    return np.frombuffer(r.stdout, dtype=np.float32), sr


def loudness(ffmpeg, path):
    r = run([ffmpeg, "-hide_banner", "-nostats", "-i", path, "-af", "ebur128=peak=true",
             "-f", "null", "-"])
    txt = r.stderr.decode("utf-8", "ignore")
    summary = txt[txt.rfind("Summary:"):] if "Summary:" in txt else txt
    m_i = re.search(r"I:\s*(-?[\d.]+)\s*LUFS", summary)
    m_p = re.search(r"Peak:\s*(-?[\d.inf]+)\s*dBFS", summary)
    lufs = float(m_i.group(1)) if m_i else None
    try:
        tp = float(m_p.group(1)) if m_p else None
    except ValueError:
        tp = None
    return lufs, tp


def rms_env(x, sr, win_s=0.02):
    w = max(1, int(win_s * sr))
    return np.sqrt(np.convolve(x.astype(np.float64) ** 2, np.ones(w) / w, "same"))


def refine_attack(env, sr, t, before=0.06, after=0.10):
    """Момент, когда удар набрал половину силы (воспринимаемая атака). None — удара нет."""
    lo = max(0, int((t - before) * sr))
    hi = min(len(env), int((t + after) * sr))
    if hi - lo < 4:
        return None
    w = env[lo:hi]
    p = int(np.argmax(w))
    floor = float(w[: p + 1].min())
    if w[p] < 1.5 * floor or w[p] < 1e-4:
        return None
    below = np.where(w[: p + 1] < floor + 0.5 * (w[p] - floor))[0]
    a = (below[-1] + 1) if len(below) else 0
    return (lo + a) / sr


def audio_onsets(x, sr, x_low=None):
    """Удары в звуке: пики спектрального потока (весь спектр + низ), время уточняется
    до момента 50% атаки по огибающей низа (бочка/808) или, если удара внизу нет, всего сигнала."""
    hop, n = 128, 1024
    if len(x) < n * 2:
        return []
    frames = np.lib.stride_tricks.sliding_window_view(x, n)[::hop] * np.hanning(n)
    spec = np.abs(np.fft.rfft(frames, axis=1))
    freqs = np.fft.rfftfreq(n, 1 / sr)
    fr = sr / hop

    def flux(band):
        s = np.log1p(10 * spec[:, band])
        f = np.maximum(0, np.diff(s, axis=0)).sum(1)
        f = f - np.convolve(f, np.ones(32) / 32, "same")
        return np.maximum(f, 0)

    full = flux(np.ones_like(freqs, dtype=bool))
    low = flux((freqs > 35) & (freqs < 160))
    env = full / (full.max() + 1e-9) + low / (low.max() + 1e-9)
    thr = np.percentile(env, 93)
    env_low = rms_env(x_low, sr) if x_low is not None else None
    env_all = rms_env(x, sr)
    out = []
    for i in range(1, len(env) - 1):
        if env[i] > thr and env[i] >= env[i - 1] and env[i] >= env[i + 1]:
            # кадр спектра i описывает окно [i·hop, i·hop + n): берём его середину
            t = ((i + 1) * hop + n / 2) / sr
            a = refine_attack(env_low, sr, t) if env_low is not None else None
            if a is None:
                a = refine_attack(env_all, sr, t)
            t = a if a is not None else t
            if not out or t - out[-1] > 0.08:
                out.append(t)
    return out


def scene_cuts(ffmpeg, path, threshold=0.3):
    r = run([ffmpeg, "-hide_banner", "-i", path, "-an", "-vf",
             f"select='gt(scene,{threshold})',showinfo", "-f", "null", "-"])
    txt = r.stderr.decode("utf-8", "ignore")
    return [float(t) for t in re.findall(r"pts_time:([\d.]+)", txt)]


def contact_sheet(ffmpeg, path, out_png, duration):
    step = max(duration / 16.0, 0.1)
    fontfile = ""
    vf = (f"fps=1/{step:.4f},scale=270:-2,"
          f"drawtext=text='%{{pts\\:hms}}':x=6:y=6:fontsize=20:fontcolor=yellow:box=1:boxcolor=black@0.7,"
          f"tile=4x4")
    r = run([ffmpeg, "-v", "error", "-y", "-i", path, "-vf", vf, "-frames:v", "1", out_png])
    if r.returncode != 0:
        # без drawtext (на некоторых сборках нет шрифтов)
        vf = f"fps=1/{step:.4f},scale=270:-2,tile=4x4"
        run([ffmpeg, "-v", "error", "-y", "-i", path, "-vf", vf, "-frames:v", "1", out_png])
    return os.path.exists(out_png)


def main():
    ap = argparse.ArgumentParser(description="Независимая проверка эдита")
    ap.add_argument("video")
    ap.add_argument("--ffmpeg", default=os.environ.get("KORI_FFMPEG") or shutil.which("ffmpeg") or "ffmpeg")
    ap.add_argument("--ffprobe", default=os.environ.get("KORI_FFPROBE"))
    ap.add_argument("--out", default=None, help="папка для отчёта (по умолчанию рядом с видео)")
    args = ap.parse_args()

    ffprobe = args.ffprobe or os.path.join(os.path.dirname(args.ffmpeg), "ffprobe" + (".exe" if args.ffmpeg.endswith(".exe") else ""))
    if not os.path.exists(ffprobe):
        ffprobe = shutil.which("ffprobe") or "ffprobe"
    path = args.video
    base = os.path.splitext(os.path.basename(path))[0]
    out_dir = args.out or os.path.dirname(os.path.abspath(path))
    os.makedirs(out_dir, exist_ok=True)

    T = THRESHOLDS
    checks = []

    def add(name, ok, value, expected, severity="FAIL"):
        checks.append({"check": name, "status": "PASS" if ok else severity,
                       "value": value, "expected": expected})

    # 1. Формат
    info = probe(ffprobe, path)
    fps = info["fps"] or 30.0
    add("resolution", info["width"] == T["width"] and info["height"] == T["height"],
        f'{info["width"]}x{info["height"]}', f'{T["width"]}x{T["height"]}')
    add("fps", fps >= T["min_fps"], fps, f'>= {T["min_fps"]}')
    lo, hi = T["duration_s"]
    add("duration", lo <= info["duration"] <= hi, round(info["duration"], 2), f"{lo}..{hi} s")

    # 2. Звук
    if info["has_audio"]:
        x, sr = read_audio(args.ffmpeg, path)
        # клиппинг считаем по каждому каналу отдельно: при сведении стерео в моно ffmpeg складывает
        # каналы с коэффициентом −3 дБ, и на похожих каналах пики «вырастают» на ~3 дБ — ложный клиппинг
        r_ch = run([args.ffmpeg, "-v", "error", "-i", path, "-f", "f32le", "-"])
        x_ch = np.frombuffer(r_ch.stdout, dtype=np.float32)
        clipped = int((np.abs(x_ch) >= 0.999).sum())
        add("clipping", clipped <= T["clipped_samples_max"], clipped, "0 отсчётов")
        lufs, tp = loudness(args.ffmpeg, path)
        if lufs is not None:
            a, b = T["lufs"]
            add("loudness_lufs", a <= lufs <= b, lufs, f"{a}..{b} LUFS")
        if tp is not None:
            add("true_peak", tp <= T["true_peak_dbtp_max"], tp, f'<= {T["true_peak_dbtp_max"]} dBTP')
        x_low = read_audio(args.ffmpeg, path, af="lowpass=f=150,lowpass=f=150")[0]
        onsets = audio_onsets(x, sr, x_low)
    else:
        add("audio", False, "нет звука", "есть звуковая дорожка")
        onsets = []

    # 3. Кадры
    g = read_gray_frames(args.ffmpeg, path, fps)
    luma = g.mean(axis=(1, 2))
    n = len(luma)

    # вспышки
    stdv = g.std(axis=(1, 2))
    white = (luma > T["blank_luma"]) & (stdv < T["blank_std"])
    runs, i = [], 0
    while i < n:
        if white[i]:
            j = i
            while j < n and white[j]:
                j += 1
            runs.append((i, j - i))
            i = j
        else:
            i += 1
    flash_starts = [k / fps for k in range(1, n) if luma[k] - luma[k - 1] > T["flash_jump"]]
    max_run = max((r[1] for r in runs), default=0)
    add("white_run_max_frames", max_run <= T["max_white_run_frames"], max_run,
        f'<= {T["max_white_run_frames"]} кадров подряд пустого белого экрана')
    dur = max(info["duration"], 1e-6)
    per10 = round(len(flash_starts) / dur * 10, 1)
    add("flashes_per_10s", per10 <= T["max_flashes_per_10s"], per10,
        f'<= {T["max_flashes_per_10s"]} (больше = стробоскоп)')
    gaps = np.diff(flash_starts) if len(flash_starts) > 1 else np.array([])
    min_gap = round(float(gaps.min()), 3) if len(gaps) else None
    add("min_gap_between_flashes", min_gap is None or min_gap >= T["min_flash_gap_s"], min_gap,
        f'>= {T["min_flash_gap_s"]} s', severity="WARN")

    # синхрон: вспышки + жёсткие склейки против ударов в звуке
    cuts = scene_cuts(args.ffmpeg, path)
    # вспышка и склейка в соседних кадрах — одно событие
    events = []
    for t in sorted(flash_starts + cuts):
        if not events or t - events[-1] > 3.0 / fps:
            events.append(round(t, 3))
    sync_rows = []
    if onsets and events:
        on = np.array(onsets)
        for t in events:
            d = on - t
            k = int(np.argmin(np.abs(d)))
            off = float(t - on[k])
            near = abs(off) <= T["sync_search_window_s"]
            sync_rows.append({"event_s": t, "nearest_onset_s": round(float(on[k]), 3),
                              "offset_ms": round(off * 1000), "has_onset_near": near})
        offs = np.array([r["offset_ms"] for r in sync_rows if r["has_onset_near"]], dtype=float)
        if len(offs):
            med = float(np.median(offs))
            jitter = float(np.median(np.abs(offs - med)))
            consistent = float(np.sum(np.abs(offs - med) <= 2000.0 / fps) / len(sync_rows))
            lo_ms, hi_ms = T["sync_offset_range_ms"]
            add("median_offset_ms (минус = раньше удара)", lo_ms <= med <= hi_ms, round(med, 1),
                f"{lo_ms}..{hi_ms} мс (раньше удара допустимо, позже — нет)")
            add("jitter_ms (разброс смещения)", jitter <= T["max_jitter_ms"], round(jitter, 1),
                f'<= {T["max_jitter_ms"]} мс')
            if jitter <= T["max_jitter_ms"]:
                add("jitter_ms_soft", jitter <= T["warn_jitter_ms"], round(jitter, 1),
                    f'<= {T["warn_jitter_ms"]} мс — иначе удары «плавают»', severity="WARN")
            add("consistent_events_ratio", consistent >= T["min_consistent_ratio"], round(consistent, 3),
                f'>= {T["min_consistent_ratio"]} событий в пределах ±2 кадров от медианного смещения')
        else:
            add("sync", False, "нет событий рядом с ударами", "события стоят на ударах")

    # пустые/чёрные полосы у краёв: однотонная тёмная полоса, неподвижная во времени
    h, w = g.shape[1], g.shape[2]
    bw = max(1, int(round(min(h, w) * T["edge_bar_frac"])))
    edge_issues = {}
    for name, sl in {"top": (slice(0, bw), slice(None)), "bottom": (slice(h - bw, h), slice(None)),
                     "left": (slice(None), slice(0, bw)), "right": (slice(None), slice(w - bw, w))}.items():
        strip = g[:, sl[0], sl[1]]
        flat_dark = (strip.mean(axis=(1, 2)) < 12) & (strip.std(axis=(1, 2)) < 1.5)
        frac = float(flat_dark.mean())
        if frac > 0.2:
            edge_issues[name] = round(frac, 2)
    add("edge_bars", not edge_issues, edge_issues or "нет",
        "нет однотонных тёмных полос у краёв (доля кадров с полосой > 0.2 = ошибка)", severity="WARN")

    # застывшая картинка
    diff = np.abs(np.diff(g, axis=0)).mean(axis=(1, 2)) if n > 1 else np.array([])
    still = diff < T["freeze_diff"]
    longest, cur, start, worst_start = 0, 0, 0, 0
    for k, s in enumerate(still):
        if s:
            if cur == 0:
                start = k
            cur += 1
            if cur > longest:
                longest, worst_start = cur, start
        else:
            cur = 0
    freeze_s = round(longest / fps, 2)
    add("longest_freeze_s", freeze_s <= T["max_freeze_s"], freeze_s,
        f'<= {T["max_freeze_s"]} s без видимого движения (начало: {round(worst_start / fps, 2)} s)',
        severity="WARN")

    # хук: движение в первую секунду не слабее медианы всего ролика
    first = diff[: int(fps)] if len(diff) else np.array([0])
    hook = float(first.mean()) if len(first) else 0.0
    med_motion = float(np.median(diff)) if len(diff) else 0.0
    add("hook_first_second_motion", hook >= med_motion, round(hook, 2),
        f">= медианы ролика ({round(med_motion, 2)})", severity="WARN")

    # раскадровка
    sheet = os.path.join(out_dir, f"{base}_qa_sheet.png")
    contact_sheet(args.ffmpeg, path, sheet, info["duration"])

    fails = [c for c in checks if c["status"] == "FAIL"]
    warns = [c for c in checks if c["status"] == "WARN"]
    verdict = "PASS" if not fails else "FAIL"
    report = {
        "file": os.path.abspath(path), "verdict": verdict, "fails": len(fails), "warnings": len(warns),
        "info": info, "checks": checks,
        "flash_starts_s": [round(t, 3) for t in flash_starts],
        "white_runs": [{"start_s": round(s / fps, 3), "frames": l} for s, l in runs],
        "hard_cuts_s": [round(t, 3) for t in cuts],
        "sync": sync_rows, "contact_sheet": sheet,
        "note": "Автоматические проверки не заменяют просмотр: лицо в кадре, текст поверх персонажа, "
                "цвета и обрезка персонажа проверяются глазами по раскадровке.",
    }
    rep_path = os.path.join(out_dir, f"{base}_qa.json")
    with open(rep_path, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)

    print(f"\n=== EDIT QA: {os.path.basename(path)} ===")
    for c in checks:
        print(f'[{c["status"]:4}] {c["check"]}: {c["value"]}  (норма: {c["expected"]})')
    print(f"\nИТОГ: {verdict}  (ошибок: {len(fails)}, предупреждений: {len(warns)})")
    print(f"Отчёт: {rep_path}\nРаскадровка: {sheet}")
    return 0 if verdict == "PASS" else 1


if __name__ == "__main__":
    sys.exit(main())
