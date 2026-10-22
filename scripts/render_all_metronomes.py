import os
import subprocess
import numpy as np
import scipy.signal

FFMPEG = r"D:\motionforge\node_modules\ffmpeg-static\ffmpeg.exe"
RESULTS_DIR = r"D:\motionforge\test-assets\results"
os.makedirs(RESULTS_DIR, exist_ok=True)

def load_audio(path, sr=44100):
    cmd = [FFMPEG, "-y", "-i", path, "-ac", "1", "-ar", str(sr), "-f", "f32le", "-"]
    pipe = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    raw, _ = pipe.communicate()
    return np.frombuffer(raw, dtype=np.float32), sr

def generate_click(freq, duration_s, sr, gain=1.0):
    t = np.linspace(0, duration_s, int(sr * duration_s), endpoint=False)
    envelope = np.exp(-t * 90.0)
    wave = np.sin(2 * np.pi * freq * t) * envelope * gain
    return wave.astype(np.float32)

def create_metronome_mix(audio_path, out_mp3, bpm, downbeat_offset, preview_dur=None, gain=0.9):
    samples, sr = load_audio(audio_path)
    total_dur = len(samples) / sr
    if preview_dur is None or preview_dur > total_dur:
        preview_dur = total_dur
    
    beat_dur = 60.0 / bpm
    measure_dur = beat_dur * 4
    
    click_high = generate_click(1800, 0.045, sr, gain=1.0) # Downbeat (beat 1)
    click_low = generate_click(950, 0.035, sr, gain=0.55)   # Beats 2, 3, 4
    
    mixed = samples.copy()
    
    # Align grid
    # Back-project downbeat
    t_start = downbeat_offset
    while t_start > 0:
        t_start -= measure_dur
        
    cur_t = t_start
    beat_idx = 0
    while cur_t < preview_dur:
        if cur_t >= 0:
            idx = int(cur_t * sr)
            is_downbeat = (beat_idx % 4 == 0)
            c = click_high if is_downbeat else click_low
            end_idx = min(len(mixed), idx + len(c))
            mixed[idx:end_idx] += c[:end_idx - idx]
        cur_t += beat_dur
        beat_idx += 1
        
    # Crop to preview duration
    sub_samples = mixed[:int(preview_dur * sr)]
    max_amp = np.max(np.abs(sub_samples))
    if max_amp > 0.95:
        sub_samples = (sub_samples / max_amp) * 0.92
        
    cmd_enc = [
        FFMPEG, "-y",
        "-f", "f32le", "-ar", str(sr), "-ac", "1",
        "-i", "-",
        "-c:a", "libmp3lame", "-b:a", "256k",
        out_mp3
    ]
    p = subprocess.Popen(cmd_enc, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    p.communicate(input=sub_samples.tobytes())
    print(f"Rendered: {out_mp3} ({os.path.getsize(out_mp3)/1024:.1f} KB)")
    return out_mp3

def main():
    # 1. track_02 (Midnight Phonk)
    # Anchor at 15.8806s
    # 122.0 BPM (True median kick interval 0.4918s)
    create_metronome_mix(
        r"D:\motionforge\test-assets\real\track_02_midnight_phonk.mp3",
        os.path.join(RESULTS_DIR, "track_02_midnight_phonk_metronome_122bpm.mp3"),
        bpm=122.0,
        downbeat_offset=15.8806 % (60.0 / 122.0 * 4),
        preview_dur=45.0
    )
    # 124.0 BPM (For ear comparison of drift)
    create_metronome_mix(
        r"D:\motionforge\test-assets\real\track_02_midnight_phonk.mp3",
        os.path.join(RESULTS_DIR, "track_02_midnight_phonk_metronome_124bpm.mp3"),
        bpm=124.0,
        downbeat_offset=15.8806 % (60.0 / 124.0 * 4),
        preview_dur=45.0
    )

    # 2. track_01 (Montagem Shirt Blue)
    # Downbeat at 4.760s
    create_metronome_mix(
        r"D:\motionforge\test-assets\real\track_01_montagem_shirt_blue.wav",
        os.path.join(RESULTS_DIR, "track_01_montagem_shirt_blue_metronome_116bpm.mp3"),
        bpm=115.8,
        downbeat_offset=4.760 % (60.0 / 115.8 * 4)
    )
    create_metronome_mix(
        r"D:\motionforge\test-assets\real\track_01_montagem_shirt_blue.wav",
        os.path.join(RESULTS_DIR, "track_01_montagem_shirt_blue_metronome_124bpm.mp3"),
        bpm=124.0,
        downbeat_offset=4.760 % (60.0 / 124.0 * 4)
    )

    # 3. ref1_audio (Gacha Hype Reference)
    # 130.0 BPM (Reference visual & syncopation metric 1.846s bar)
    create_metronome_mix(
        r"D:\motionforge\test-assets\real\ref1_audio.aac",
        os.path.join(RESULTS_DIR, "ref1_audio_metronome_130bpm.mp3"),
        bpm=130.0,
        downbeat_offset=4.380 % (60.0 / 130.0 * 4)
    )
    create_metronome_mix(
        r"D:\motionforge\test-assets\real\ref1_audio.aac",
        os.path.join(RESULTS_DIR, "ref1_audio_metronome_116bpm.mp3"),
        bpm=115.8,
        downbeat_offset=4.784 % (60.0 / 115.8 * 4)
    )

    # 4. ref2_audio (Shape of You Slowed)
    create_metronome_mix(
        r"D:\motionforge\test-assets\real\ref2_audio.aac",
        os.path.join(RESULTS_DIR, "ref2_audio_metronome_81.6bpm.mp3"),
        bpm=81.6,
        downbeat_offset=0.220 % (60.0 / 81.6 * 4)
    )
    create_metronome_mix(
        r"D:\motionforge\test-assets\real\ref2_audio.aac",
        os.path.join(RESULTS_DIR, "ref2_audio_metronome_96bpm.mp3"),
        bpm=96.0,
        downbeat_offset=0.220 % (60.0 / 96.0 * 4)
    )

if __name__ == "__main__":
    main()
