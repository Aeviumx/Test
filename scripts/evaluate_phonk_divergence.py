import subprocess
import numpy as np
import scipy.signal

FFMPEG = r"D:\motionforge\node_modules\ffmpeg-static\ffmpeg.exe"
AUDIO_PATH = r"D:\motionforge\test-assets\real\track_02_midnight_phonk.mp3"

def load_audio(path, sr=44100):
    cmd = [FFMPEG, "-y", "-i", path, "-ac", "1", "-ar", str(sr), "-f", "f32le", "-"]
    pipe = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    raw, _ = pipe.communicate()
    return np.frombuffer(raw, dtype=np.float32), sr

samples, sr = load_audio(AUDIO_PATH)
dur = len(samples) / sr

# Low pass to isolate kick drum
sos = scipy.signal.butter(4, 120, btype='lowpass', fs=sr, output='sos')
low = scipy.signal.sosfilt(sos, samples)
env = np.abs(low)

# Peak picking for all kicks
peaks, props = scipy.signal.find_peaks(env, distance=int(sr * 0.42), prominence=np.max(env)*0.30)
peak_times = peaks / sr

print(f"Total kicks detected: {len(peak_times)}")
print(f"First 10 kick times: {peak_times[:10]}")

# First drop kick around 15-20s
# Let's find the start of the drop
drop_kicks = [t for t in peak_times if t >= 15.0]
anchor = drop_kicks[0]
print(f"Drop Anchor Kick: {anchor:.4f} s")

# Now check around 30s, 60s, 120s
target_times = [30.0, 60.0, 120.0]

for bpm, label in [(122.0, "122.0 BPM (0.4918s)"), (124.0, "124.0 BPM (0.4839s)")]:
    beat_dur = 60.0 / bpm
    print(f"\n==========================================")
    print(f"GRID EVALUATION: {label}")
    print(f"==========================================")
    for tgt in target_times:
        # Number of beats from anchor
        n_beats = round((tgt - anchor) / beat_dur)
        grid_time = anchor + n_beats * beat_dur
        
        # Find nearest real kick
        dists = np.abs(peak_times - grid_time)
        nearest_idx = np.argmin(dists)
        real_kick_time = peak_times[nearest_idx]
        diff_ms = (grid_time - real_kick_time) * 1000.0
        
        print(f"Target ~{tgt:.0f}s:")
        print(f"  Beat index from anchor: {n_beats}")
        print(f"  Theoretical grid time:  {grid_time:.4f} s")
        print(f"  Nearest real kick time: {real_kick_time:.4f} s")
        print(f"  Discrepancy (Grid - Kick): {diff_ms:+.1f} ms ({diff_ms/1000.0:+.3f} s)")
