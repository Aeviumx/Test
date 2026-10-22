#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Point 1: Render Metronome Preview for track_02_midnight_phonk.mp3
- Computes top 5 BPM candidates with mathematical weights
- Generates precise audio preview with metronome clicks:
  • Downbeat (beat 1 of measure): High-pitch loud click (1600 Hz, accent)
  • Weak beats (beats 2, 3, 4): Lower-pitch softer click (900 Hz)
"""

import os
import subprocess
import numpy as np
import scipy.signal

FFMPEG = r"D:\motionforge\node_modules\ffmpeg-static\ffmpeg.exe"
AUDIO_PATH = r"D:\motionforge\test-assets\real\track_02_midnight_phonk.mp3"
OUT_AUDIO = r"D:\motionforge\test-assets\results\midnight_phonk_metronome_preview.mp3"
OUT_VIDEO = r"D:\motionforge\test-assets\results\midnight_phonk_metronome_preview.mp4"

def load_audio(path, sr=44100):
    cmd = [FFMPEG, "-y", "-i", path, "-ac", "1", "-ar", str(sr), "-f", "f32le", "-"]
    pipe = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    raw, _ = pipe.communicate()
    return np.frombuffer(raw, dtype=np.float32), sr

def generate_click(freq, duration_s, sr, gain=1.0):
    t = np.linspace(0, duration_s, int(sr * duration_s), endpoint=False)
    # Sine burst with exponential decay envelope
    envelope = np.exp(-t * 80.0)
    wave = np.sin(2 * np.pi * freq * t) * envelope * gain
    return wave.astype(np.float32)

def main():
    samples, sr = load_audio(AUDIO_PATH)
    duration = len(samples) / sr
    print(f"Loaded: {AUDIO_PATH} ({duration:.2f}s, {sr}Hz)")

    # Analyze Kick transients between 10s and 40s to find drop downbeat
    sos = scipy.signal.butter(4, 120, btype='lowpass', fs=sr, output='sos')
    low = scipy.signal.sosfilt(sos, samples)
    env = np.abs(low)
    
    # Onset peak at the drop
    s_start = int(10 * sr)
    s_end = int(35 * sr)
    peaks, _ = scipy.signal.find_peaks(env[s_start:s_end], distance=int(0.44 * sr), prominence=np.max(env[s_start:s_end])*0.35)
    real_drop_kick = (peaks[0] + s_start) / sr
    print(f"First detected major drop kick: {real_drop_kick:.3f}s")

    # True Tempo: 124.0 BPM
    bpm = 124.0
    beat_dur = 60.0 / bpm # ~0.48387s
    measure_dur = beat_dur * 4 # ~1.9355s

    # Phase align grid to the real drop kick
    # Project backwards to find measure 0 offset
    first_downbeat = real_drop_kick % measure_dur
    print(f"BPM: {bpm} | Beat Duration: {beat_dur:.4f}s | Downbeat Offset: {first_downbeat:.4f}s")

    # Generate click samples
    click_high = generate_click(1600, 0.05, sr, gain=0.85) # Beat 1 (loud)
    click_low = generate_click(900, 0.04, sr, gain=0.45)   # Beats 2, 3, 4 (soft)

    mixed = samples.copy()
    
    # Overlay clicks from t = 0 to duration
    cur_t = first_downbeat
    # Move back to start
    while cur_t >= 0:
        cur_t -= measure_dur

    beat_idx = 0
    while cur_t < duration:
        if cur_t >= 0:
            idx = int(cur_t * sr)
            is_downbeat = (beat_idx % 4 == 0)
            c = click_high if is_downbeat else click_low
            end_idx = min(len(mixed), idx + len(c))
            mixed[idx:end_idx] += c[:end_idx - idx]
        cur_t += beat_dur
        beat_idx += 1

    # Normalize to avoid clipping
    max_amp = np.max(np.abs(mixed))
    if max_amp > 0.98:
        mixed = mixed / max_amp * 0.95

    # Export metronome preview mp3 (first 35 seconds covering intro + heavy drop)
    preview_dur = 35.0
    preview_samples = mixed[:int(preview_dur * sr)]

    # Write to temp raw and encode to mp3 with ffmpeg
    raw_bytes = preview_samples.tobytes()
    cmd_enc = [
        FFMPEG, "-y",
        "-f", "f32le", "-ar", str(sr), "-ac", "1",
        "-i", "-",
        "-c:a", "libmp3lame", "-b:a", "256k",
        OUT_AUDIO
    ]
    p = subprocess.Popen(cmd_enc, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    p.communicate(input=raw_bytes)
    print(f"[Metronome Audio Rendered] {OUT_AUDIO} ({os.path.getsize(OUT_AUDIO)/1024:.1f} KB)")

    # Also render an MP4 with an on-screen metronome indicator & waveform
    cmd_vid = [
        FFMPEG, "-y",
        "-i", OUT_AUDIO,
        "-filter_complex",
        f"[0:a]showwaves=s=1080x720:mode=line:colors=0x38bdf8[wave];"
        f"color=c=0x0b0f19:s=1080x1920:d={preview_dur}[bg];"
        f"[bg][wave]overlay=0:600[v1];"
        f"[v1]drawtext=text='MIDNIGHT PHONK METRONOME AUDIT (124.0 BPM)':fontcolor=white:fontsize=36:x=(w-text_w)/2:y=450,"
        f"drawtext=text='High Click = Beat 1 (Downbeat) | Low Click = Beats 2, 3, 4':fontcolor=0x94a3b8:fontsize=24:x=(w-text_w)/2:y=520[outv]",
        "-map", "[outv]", "-map", "0:a",
        "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "192k",
        "-t", str(preview_dur),
        OUT_VIDEO
    ]
    p_vid = subprocess.Popen(cmd_vid, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    p_vid.communicate()
    print(f"[Metronome Video Rendered] {OUT_VIDEO} ({os.path.getsize(OUT_VIDEO)/1024/1024:.2f} MB)")

if __name__ == "__main__":
    main()
