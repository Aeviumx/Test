import os
import subprocess
import numpy as np
import scipy.signal

FFMPEG = r"D:\motionforge\node_modules\ffmpeg-static\ffmpeg.exe"

AUDIO_FILES = {
    'track_01': r"D:\motionforge\test-assets\real\track_01_montagem_shirt_blue.wav",
    'track_02': r"D:\motionforge\test-assets\real\track_02_midnight_phonk.mp3",
    'ref1': r"D:\motionforge\test-assets\real\ref1_audio.aac",
    'ref2': r"D:\motionforge\test-assets\real\ref2_audio.aac",
}

def load_audio(path, sr=44100):
    cmd = [FFMPEG, "-y", "-i", path, "-ac", "1", "-ar", str(sr), "-f", "f32le", "-"]
    pipe = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    raw, _ = pipe.communicate()
    return np.frombuffer(raw, dtype=np.float32), sr

def analyze_track(name, path):
    samples, sr = load_audio(path)
    dur = len(samples) / sr
    print(f"\n=======================================================")
    print(f"TRACK: {name} | File: {os.path.basename(path)} | Duration: {dur:.2f}s")
    print(f"=======================================================")

    # Low-pass filter for kick (< 130 Hz)
    sos_kick = scipy.signal.butter(4, 130, btype='lowpass', fs=sr, output='sos')
    kick_signal = scipy.signal.sosfilt(sos_kick, samples)
    kick_env = np.abs(kick_signal)
    
    # Smooth envelope
    hop = int(sr / 200) # 5ms
    env_down = np.array([np.max(kick_env[i:i+hop]) for i in range(0, len(kick_env)-hop, hop)])
    down_sr = sr / hop
    
    # Autocorrelation of kick envelope across full track
    # Test BPMs from 80 to 180
    bpms = np.linspace(80, 180, 1001)
    corrs = []
    for bpm in bpms:
        lag = int((60.0 / bpm) * down_sr)
        if lag < len(env_down):
            c = np.sum(env_down[:-lag] * env_down[lag:])
            corrs.append(c)
        else:
            corrs.append(0)
    corrs = np.array(corrs)
    best_idx = np.argmax(corrs)
    print(f"Global Kick Autocorrelation peak: {bpms[best_idx]:.2f} BPM")
    
    # Top 5 peaks in autocorrelation
    peaks, props = scipy.signal.find_peaks(corrs, distance=20, prominence=np.max(corrs)*0.05)
    sorted_peaks = sorted(peaks, key=lambda p: corrs[p], reverse=True)[:5]
    print("Top 5 Autocorrelation candidates:")
    for p in sorted_peaks:
        print(f"  {bpms[p]:.2f} BPM (score: {corrs[p]:.1f})")

    # Find individual kick peaks
    # adaptive threshold
    thresh = np.percentile(kick_env, 90)
    k_peaks, _ = scipy.signal.find_peaks(kick_env, height=thresh, distance=int(sr * 0.35))
    peak_times = k_peaks / sr
    diffs = np.diff(peak_times)
    # Filter reasonable intervals (0.3s to 0.7s)
    valid_diffs = diffs[(diffs >= 0.3) & (diffs <= 0.7)]
    if len(valid_diffs) > 0:
        med_diff = np.median(valid_diffs)
        mean_diff = np.mean(valid_diffs)
        bpm_from_med = 60.0 / med_diff
        print(f"Detected {len(valid_diffs)} valid kick intervals:")
        print(f"  Median Kick Interval: {med_diff:.4f} s -> {bpm_from_med:.2f} BPM")
        print(f"  Mean Kick Interval:   {mean_diff:.4f} s -> {60.0/mean_diff:.2f} BPM")
        print(f"  Min: {np.min(valid_diffs):.4f}s, Max: {np.max(valid_diffs):.4f}s, Std: {np.std(valid_diffs):.4f}s")

    return samples, sr, peak_times

for name, path in AUDIO_FILES.items():
    analyze_track(name, path)
