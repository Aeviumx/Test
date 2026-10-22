import os
import re
from faster_whisper import WhisperModel

ORIG_AUDIO = r"D:\motionforge\test-assets\real\ref2_audio.aac"
VOCAL_AUDIO = r"D:\motionforge\test-assets\cache\demucs_out\htdemucs\ref2_audio\vocals.wav"
LYRICS_FILE = r"D:\motionforge\test-assets\real\lyrics\shape_of_you.txt"

# Canonical excerpt for this audio segment (lines 3-6 of shape_of_you.txt)
TARGET_LYRICS = (
    "Come over and start up a conversation with just me "
    "And trust me I'll give it a chance now "
    "Take my hand stop put Van The Man on the jukebox "
    "And then we start to dance"
)

def clean(w):
    return re.sub(r"[^a-zA-Z0-9]", "", w).lower()

def compute_wer(ref_words, asr_words):
    n, m = len(ref_words), len(asr_words)
    dp = [[0]*(m+1) for _ in range(n+1)]
    for i in range(n+1): dp[i][0] = -i
    for j in range(m+1): dp[0][j] = -j

    for i in range(1, n+1):
        for j in range(1, m+1):
            rw = clean(ref_words[i-1])
            hw = clean(asr_words[j-1])
            match = 2 if (rw == hw or (len(rw) >= 3 and hw.startswith(rw[:3]))) else -1
            dp[i][j] = max(dp[i-1][j-1] + match, dp[i-1][j] - 1, dp[i][j-1] - 1)

    i, j = n, m
    subs, dels, inss, matches = 0, 0, 0, 0
    pairs = []
    while i > 0 or j > 0:
        if i > 0 and j > 0:
            rw = clean(ref_words[i-1])
            hw = clean(asr_words[j-1])
            is_match = (rw == hw or (len(rw) >= 3 and hw.startswith(rw[:3])))
            score = 2 if is_match else -1
            if dp[i][j] == dp[i-1][j-1] + score:
                if is_match: matches += 1
                else: subs += 1
                pairs.append((ref_words[i-1], asr_words[j-1], 'MATCH' if is_match else 'SUB'))
                i -= 1; j -= 1
                continue
        if i > 0 and dp[i][j] == dp[i-1][j] - 1:
            dels += 1
            pairs.append((ref_words[i-1], None, 'DEL'))
            i -= 1
        else:
            inss += 1
            pairs.append((None, asr_words[j-1], 'INS'))
            j -= 1

    pairs.reverse()
    wer = (subs + dels + inss) / n * 100.0
    return wer, matches, subs, dels, inss, pairs

def transcribe_and_eval(model_name, audio_path):
    model = WhisperModel(model_name, device="cuda", compute_type="float16")
    segments, info = model.transcribe(audio_path, word_timestamps=True)
    asr_words = []
    for s in segments:
        for w in s.words:
            t_clean = w.word.strip()
            if t_clean:
                asr_words.append(t_clean)
    
    ref_tokens = TARGET_LYRICS.split()
    wer, matches, subs, dels, inss, pairs = compute_wer(ref_tokens, asr_words)
    return {
        "model": model_name,
        "audio": "vocals_only" if "vocals" in audio_path else "mixed_raw",
        "wer": wer,
        "matches": matches,
        "subs": subs,
        "dels": dels,
        "inss": inss,
        "asr_text": " ".join(asr_words),
        "pairs": pairs
    }

def main():
    configs = [
        ("base", ORIG_AUDIO, "Base (Raw Audio - Baseline)"),
        ("base", VOCAL_AUDIO, "Base + Demucs Vocals"),
        ("small", ORIG_AUDIO, "Small (Raw Audio)"),
        ("small", VOCAL_AUDIO, "Small + Demucs Vocals"),
        ("medium", ORIG_AUDIO, "Medium (Raw Audio)"),
        ("medium", VOCAL_AUDIO, "Medium + Demucs Vocals"),
        ("large-v3-turbo", ORIG_AUDIO, "Large-v3-turbo (Raw Audio)"),
        ("large-v3-turbo", VOCAL_AUDIO, "Large-v3-turbo + Demucs Vocals (New Scheme)"),
    ]

    results = []
    for m, a, desc in configs:
        print(f"Evaluating {desc}...")
        res = transcribe_and_eval(m, a)
        res["desc"] = desc
        results.append(res)
        print(f"  -> WER: {res['wer']:.1f}% (Matches: {res['matches']}, Subs: {res['subs']}, Dels: {res['dels']}, Inss: {res['inss']})")
        print(f"  ASR: {res['asr_text'][:90]}...")

    print("\n" + "="*85)
    print("WER BENCHMARK COMPARISON TABLE")
    print("="*85)
    print(f"{'Configuration':<45} | {'WER (%)':<8} | {'Matches':<8} | {'Subs':<6} | {'Dels':<6} | {'Inss':<6}")
    print("-" * 85)
    for r in results:
        print(f"{r['desc']:<45} | {r['wer']:>6.1f}% | {r['matches']:>7} | {r['subs']:>5} | {r['dels']:>5} | {r['inss']:>5}")
    print("="*85)

if __name__ == "__main__":
    main()
