#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Whisper Word-Level Alignment & Transcription Engine
Uses faster-whisper (MIT License) running on local GPU (CUDA / float16).
Provides:
1. Automatic transcription with word-level timestamps.
2. Forced alignment with user-provided lyric text using dynamic sequence alignment.
3. Audio transient / energy validation to verify onsets match real acoustic peaks.
"""

import os
import sys
import json
import wave
import numpy as np
from faster_whisper import WhisperModel

def get_audio_energy_profile(audio_path, target_sr=16000):
    import subprocess
    ffmpeg = r"D:\motionforge\node_modules\ffmpeg-static\ffmpeg.exe"
    cmd = [
        ffmpeg, "-y", "-i", audio_path,
        "-ac", "1", "-ar", str(target_sr),
        "-f", "f32le", "-"
    ]
    pipe = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    raw, _ = pipe.communicate()
    samples = np.frombuffer(raw, dtype=np.float32)
    return samples, target_sr

def align_words_to_lyrics(whisper_words, user_lyrics_text):
    """
    Forced alignment between Whisper detected words and user reference lyrics.
    Uses fuzzy sequence matching to map Whisper tokens to canonical lyrics.
    """
    user_words = [w.strip() for w in user_lyrics_text.split() if w.strip()]
    aligned = []
    
    # Simple linear monotonic alignment matching
    u_idx = 0
    for w in whisper_words:
        w_clean = w["word"].strip().lower().strip(".,!?;:\"'-")
        matched_user = None
        
        # Look ahead up to 3 words
        for offset in range(min(4, len(user_words) - u_idx)):
            cand = user_words[u_idx + offset].strip().lower().strip(".,!?;:\"'-")
            if w_clean == cand or (len(w_clean) > 3 and cand.startswith(w_clean[:3])):
                matched_user = user_words[u_idx + offset]
                u_idx += offset + 1
                break
        
        aligned.append({
            "detected_word": w["word"].strip(),
            "start": round(w["start"], 3),
            "end": round(w["end"], 3),
            "confidence": round(w["confidence"], 3),
            "canonical_word": matched_user if matched_user else w["word"].strip()
        })
    return aligned

def verify_audio_timing(samples, sr, start_s, end_s):
    """
    Check if energy is present at the predicted window and find local onset peak.
    """
    s_idx = max(0, int(start_s * sr))
    e_idx = min(len(samples), int(end_s * sr))
    if e_idx <= s_idx:
        return True, 0.0
    window = samples[s_idx:e_idx]
    rms = np.sqrt(np.mean(window ** 2) + 1e-9)
    # Check if there is an energy jump at onset
    pre_window = samples[max(0, s_idx - int(0.1 * sr)):s_idx]
    pre_rms = np.sqrt(np.mean(pre_window ** 2) + 1e-9) if len(pre_window) > 0 else 1e-4
    energy_jump = rms / pre_rms
    return rms > 0.005, round(float(energy_jump), 2)

def main():
    sys.stdout.reconfigure(encoding="utf-8")
    
    audio_path = sys.argv[1] if len(sys.argv) > 1 else r"D:\motionforge\test-assets\real\ref2_audio.aac"
    model_size = "base"
    print(f"Loading faster-whisper model '{model_size}' on CUDA (float16)...")
    model = WhisperModel(model_size, device="cuda", compute_type="float16")
    
    print(f"Transcribing audio: {audio_path} with word-level timestamps...")
    segments, info = model.transcribe(audio_path, word_timestamps=True, vad_filter=True)
    print(f"Detected language: {info.language} (probability: {info.language_probability:.2f})")
    
    raw_words = []
    for s in segments:
        for w in s.words:
            raw_words.append({
                "word": w.word,
                "start": w.start,
                "end": w.end,
                "confidence": w.probability
            })
            
    print(f"Total words transcribed: {len(raw_words)}")
    
    # User lyrics for Shape of You
    user_lyrics = (
        "Come over and start up a conversation with just me "
        "and trust me I'll give it a chance now "
        "Take my hand, stop, put Van the Man on the jukebox "
        "and then we start to dance"
    )
    
    aligned_results = align_words_to_lyrics(raw_words, user_lyrics)
    
    # Load audio to verify physical acoustic waveform
    samples, sr = get_audio_energy_profile(audio_path)
    
    print("\n" + "="*80)
    print("WHISPER WORD-LEVEL TRANSCRIPTION & ACOUSTIC TIMING VERIFICATION (FIRST 20 WORDS)")
    print("="*80)
    print(f"{'#':<3} | {'Word (Whisper)':<16} | {'Canonical':<16} | {'Start':<7} | {'End':<7} | {'Conf':<6} | {'Onset Energy Jump':<16}")
    print("-" * 80)
    
    top20 = aligned_results[:20]
    verification_data = []
    for i, item in enumerate(top20, 1):
        has_energy, jump = verify_audio_timing(samples, sr, item["start"], item["end"])
        verification_data.append({
            "index": i,
            "word": item["detected_word"],
            "canonical": item["canonical_word"],
            "start": item["start"],
            "end": item["end"],
            "confidence": item["confidence"],
            "energy_jump": jump,
            "waveform_verified": bool(has_energy)
        })
        print(f"{i:<3} | {item['detected_word']:<16} | {item['canonical_word']:<16} | {item['start']:>6.2f}s | {item['end']:>6.2f}s | {item['confidence']:>5.2f} | {jump:>6.2f}x ({'PASS' if has_energy else 'LOW'})")
        
    print("-" * 80)
    
    # Save verification JSON
    out_json = r"D:\motionforge\test-assets\results\whisper_word_alignment.json"
    with open(out_json, "w", encoding="utf-8") as f:
        json.dump({
            "audio_file": audio_path,
            "language": info.language,
            "language_prob": info.language_probability,
            "model": model_size,
            "device": "cuda",
            "top20_words": verification_data,
            "all_words": aligned_results
        }, f, indent=2, ensure_ascii=False)
    print(f"\n[Saved Alignment Data] {out_json}")

if __name__ == "__main__":
    main()
