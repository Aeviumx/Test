#!/usr/bin/env python3
"""
Verification Script for Dynamic Accent Detection:
1. Proves raw detector on Ref 1 vs user numbers.
2. Analyzes a completely DIFFERENT track: test-assets/real/track_02_midnight_phonk.mp3.
3. Renders Gacha Hype Edit dynamically synced to the new track's accents.
4. Generates contact sheet for visual inspection.
"""

import os
import math
import subprocess
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

FFMPEG = r"D:\motionforge\node_modules\ffmpeg-static\ffmpeg.exe"
REF1 = r"D:\motionforge\test-assets\real\refs\ref_01_gacha_hype.mp4"
NEW_TRACK = r"D:\motionforge\test-assets\real\track_02_midnight_phonk.mp3"
OUT_MP4 = r"D:\motionforge\test-assets\results\output_gacha_hype_phonk.mp4"
ARTIFACT_DIR = r"C:\Users\mi7ki\.gemini\antigravity\brain\dcf0ddcd-0da4-4c20-ad76-55a82e55d8ae"

# ---------------------------------------------------------------------------
# 1. RAW DETECTOR ON REF 1
# ---------------------------------------------------------------------------
print("=== PART 1: RAW DETECTOR OUTPUT ON REFERENCE 1 ===")

# Audio transient detector on Ref 1
cmd_audio = [
    FFMPEG, "-ss", "00:00:04", "-to", "00:00:11",
    "-i", REF1, "-f", "f32le", "-ac", "1", "-ar", "44100", "-"
]
p = subprocess.Popen(cmd_audio, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
raw_audio = p.stdout.read()
p.wait()

samples_ref1 = np.frombuffer(raw_audio, dtype=np.float32)
sr = 44100
hop = int(sr * 0.01) # 10ms
win = int(sr * 0.04) # 40ms
energies = [np.sqrt(np.mean(samples_ref1[i:i+win]**2)) for i in range(0, len(samples_ref1) - win, hop)]
diff_e = np.maximum(0, np.diff(energies))

ref1_detected_onsets = []
for i in range(1, len(diff_e) - 1):
    t = 4.0 + (i + 1) * 0.01
    if diff_e[i] > np.percentile(diff_e, 85) and diff_e[i] >= diff_e[i-1] and diff_e[i] >= diff_e[i+1]:
        if not ref1_detected_onsets or (t - ref1_detected_onsets[-1]) > 0.32:
            ref1_detected_onsets.append(round(t, 2))

user_accents = [4.38, 4.85, 5.73, 6.23, 6.70, 7.58, 8.08, 8.55, 9.43, 9.93, 10.40]

print(f"{'User Accent (Prompt)':<22} | {'Raw Audio Transient':<22} | {'Delta (ms)':<10}")
print("-" * 60)
for u in user_accents:
    closest = min(ref1_detected_onsets, key=lambda x: abs(x - u))
    delta = abs(closest - u) * 1000
    print(f"{u:<22.2f} | {closest:<22.2f} | {delta:<10.1f}")


# ---------------------------------------------------------------------------
# 2. DYNAMIC ANALYSIS ON NEW TRACK (MIDNIGHT PHONK)
# ---------------------------------------------------------------------------
print("\n=== PART 2: DYNAMIC ACCENT DETECTION ON NEW TRACK (MIDNIGHT PHONK) ===")

cmd_new = [
    FFMPEG, "-ss", "00:00:00", "-to", "00:00:15",
    "-i", NEW_TRACK, "-f", "f32le", "-ac", "1", "-ar", "44100", "-"
]
p = subprocess.Popen(cmd_new, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
raw_new = p.stdout.read()
p.wait()

samples_new = np.frombuffer(raw_new, dtype=np.float32)
energies_new = [np.sqrt(np.mean(samples_new[i:i+win]**2)) for i in range(0, len(samples_new) - win, hop)]
diff_new = np.maximum(0, np.diff(energies_new))

# Autocorrelation BPM
corr = np.correlate(diff_new, diff_new, mode='full')[len(diff_new)-1:]
lags = [(bpm, corr[int(round((60.0/bpm)/0.01))]) for bpm in np.arange(90, 160, 0.5) if int(round((60.0/bpm)/0.01)) < len(corr)]
detected_bpm = max(lags, key=lambda x: x[1])[0]
bar_duration = (60.0 / detected_bpm) * 4

print(f"Detected BPM for Midnight Phonk: {detected_bpm:.1f}")
print(f"Computed Bar Duration: {bar_duration:.3f}s")

# DNA Pattern: Gacha Hype 3-hit syncopation pattern offsets inside measure [0.0, 0.254, 0.728]
measure_offsets = [0.0, 0.254, 0.728]
start_offset = 3.5 # intro ends at 3.5s
duration = 11.0

dynamic_accents = []
num_bars = int(math.ceil((duration - start_offset) / bar_duration))

for b in range(num_bars):
    b_start = start_offset + b * bar_duration
    for rel in measure_offsets:
        hit = b_start + rel * bar_duration
        if hit <= duration:
            # Snap to real audio transient peak within +/- 120ms
            hit_sample_idx = int(hit * 100)
            search_window = diff_new[max(0, hit_sample_idx - 12): min(len(diff_new), hit_sample_idx + 12)]
            if len(search_window) > 0:
                best_offset = np.argmax(search_window) - 12
                snapped_hit = hit + best_offset * 0.01
            else:
                snapped_hit = hit
            dynamic_accents.append(round(snapped_hit, 2))

print(f"Dynamically Calculated Accent Timestamps on Midnight Phonk ({len(dynamic_accents)} hits):")
print(dynamic_accents)


# ---------------------------------------------------------------------------
# 3. RENDER GACHA HYPE EDIT ON NEW TRACK (NO BLACK BARS, PURE 9:16)
# ---------------------------------------------------------------------------
print(f"\n=== PART 3: RENDERING GACHA HYPE ON NEW TRACK ({OUT_MP4}) ===")

W, H = 1080, 1920
fps = 60
total_frames = int(fps * duration)

im_liv = Image.open(r"D:\motionforge\public\assets\gacha_liv.png").convert("RGBA")
im_vera = Image.open(r"D:\motionforge\public\assets\gacha_vera.png").convert("RGBA")
im_lucia = Image.open(r"D:\motionforge\public\assets\gacha_lucia.png").convert("RGBA")
im_group = Image.open(r"D:\motionforge\public\assets\gacha_group.png").convert("RGBA")

def draw_card(im, size=(380, 580)):
    c = im.resize(size, Image.Resampling.LANCZOS)
    m = Image.new("L", size, 0)
    ImageDraw.Draw(m).rounded_rectangle([(0, 0), size], radius=24, fill=255)
    c.putalpha(m)
    b = Image.new("RGBA", size, (0, 0, 0, 0))
    ImageDraw.Draw(b).rounded_rectangle([(0, 0), size], radius=24, outline=(255, 255, 255, 255), width=4)
    return Image.alpha_composite(c, b)

card_liv = draw_card(im_liv)
card_vera = draw_card(im_vera, size=(440, 660))
card_lucia = draw_card(im_lucia)

ffmpeg_cmd = [
    FFMPEG, "-y",
    "-f", "rawvideo", "-vcodec", "rawvideo",
    "-s", f"{W}x{H}", "-pix_fmt", "rgb24", "-r", str(fps),
    "-i", "-",
    "-ss", "00:00:00", "-to", str(duration),
    "-i", NEW_TRACK,
    "-c:v", "libx264", "-preset", "fast", "-crf", "17", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "192k",
    "-shortest",
    OUT_MP4
]
pipe = subprocess.Popen(ffmpeg_cmd, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

contact_samples = []
contact_ts = [0.8, 1.8, 2.8, 3.6, 4.2, 5.0, 6.2, 7.4, 8.5, 9.2, 10.0, 10.8]

# Dynamically construct reframes alternating on the new dynamic accents
reframes = []
for i in range(len(dynamic_accents)):
    t_start = dynamic_accents[i]
    t_end = dynamic_accents[i+1] if i + 1 < len(dynamic_accents) else duration
    # Alternate: Close -> Macro Eyes -> Wide
    pattern_idx = i % 3
    if pattern_idx == 0:
        reframes.append((t_start, t_end, 2.5, 0, -220)) # face
    elif pattern_idx == 1:
        reframes.append((t_start, t_end, 4.3, -10, -330)) # macro eyes
    else:
        reframes.append((t_start, t_end, 1.25, 0, 0)) # wide

for frame_idx in range(total_frames):
    t = frame_idx / fps
    
    # 0 - 3.5s: Intro Cards
    if t < start_offset:
        frame = Image.new("RGBA", (W, H), (248, 249, 250, 255))
        draw = ImageDraw.Draw(frame)
        draw.ellipse([(W//2 - 600, H//2 - 600), (W//2 + 600, H//2 + 600)], fill=(255, 255, 255, 255))
        
        enter_t = min(1.0, t / 0.8)
        ease_enter = math.sin(enter_t * math.pi * 0.5) if enter_t < 1.0 else 1.0
        
        swap_t = 0.0
        if t > 1.8:
            swap_prog = min(1.0, (t - 1.8) / 0.35)
            swap_t = 0.5 - 0.5 * math.cos(swap_prog * math.pi)
            
        y_cards = 920
        x_liv = -300 + (210 - (-300)) * ease_enter
        x_vera = W//2 + (swap_t * 310)
        x_lucia = (W + 300) - ((W + 300) - 870) * ease_enter - (swap_t * 310)
        
        c1_rot = card_liv.rotate(-4.0 + (1.0 - ease_enter) * -15.0, resample=Image.Resampling.BICUBIC, expand=True)
        frame.paste(c1_rot, (int(x_liv - c1_rot.width//2), int(y_cards + 20 - c1_rot.height//2)), c1_rot)
        
        c3_rot = card_lucia.rotate(4.0 + (1.0 - ease_enter) * 15.0, resample=Image.Resampling.BICUBIC, expand=True)
        frame.paste(c3_rot, (int(x_lucia - c3_rot.width//2), int(y_cards + 20 - c3_rot.height//2)), c3_rot)
        
        c2_rot = card_vera.rotate(math.sin(swap_t * math.pi) * 8.0, resample=Image.Resampling.BICUBIC, expand=True)
        frame.paste(c2_rot, (int(x_vera - c2_rot.width//2), int(y_cards - 30 - c2_rot.height//2)), c2_rot)
        
        # Red Flash transition at 3.2s - 3.5s
        if 3.2 <= t <= 3.5:
            alpha = int((1.0 - (t - 3.2)/0.3) * 170)
            frame = Image.alpha_composite(frame, Image.new("RGBA", (W, H), (255, 26, 64, alpha)))
            
    # 3.5s - 11.0s: Dynamic Reframe & Accents on Midnight Phonk
    else:
        current_scale = 1.25
        pan_x = 0
        pan_y = 0
        for r in reframes:
            if r[0] <= t < r[1]:
                current_scale = r[2]
                pan_x = r[3]
                pan_y = r[4]
                break
                
        # Breathing liveliness
        breath = 1.0 + math.sin(t * (detected_bpm / 60) * 2 * math.pi) * 0.012
        total_scale = current_scale * breath
        
        # Accent hit detection
        nearest_dt = min(abs(t - a) for a in dynamic_accents)
        accent_decay = max(0.0, 1.0 - (nearest_dt / 0.22)) if nearest_dt < 0.22 else 0.0
        total_scale += accent_decay * 0.18
        
        source_art = im_lucia if t < 7.5 else im_vera
        
        # Padding blur background (100% fills 9:16 vertical without black bars)
        bg_scale = max(W / source_art.width, H / source_art.height) * 1.05
        bg_w = int(source_art.width * bg_scale)
        bg_h = int(source_art.height * bg_scale)
        bg = source_art.resize((bg_w, bg_h), Image.Resampling.BILINEAR).filter(ImageFilter.GaussianBlur(35))
        frame = bg.crop(((bg_w - W)//2, (bg_h - H)//2, (bg_w - W)//2 + W, (bg_h - H)//2 + H))
        frame = Image.alpha_composite(frame, Image.new("RGBA", (W, H), (15, 18, 24, 110)))
        
        # Foreground character punch-in
        effective_scale = max(1.4, total_scale)
        art_w = int(W * effective_scale * 1.15)
        art_h = int(W * effective_scale * 1.15 * (source_art.height / source_art.width))
        scaled_art = source_art.resize((art_w, art_h), Image.Resampling.BILINEAR)
        
        cx = art_w // 2 + int(pan_x * effective_scale)
        cy = art_h // 2 + int(pan_y * effective_scale)
        crop_x1 = cx - W // 2
        crop_y1 = cy - H // 2
        
        src_x1 = max(0, crop_x1)
        src_y1 = max(0, crop_y1)
        src_x2 = min(art_w, crop_x1 + W)
        src_y2 = min(art_h, crop_y1 + H)
        
        piece = scaled_art.crop((src_x1, src_y1, src_x2, src_y2))
        frame.paste(piece, (max(0, -crop_x1), max(0, -crop_y1)), piece if piece.mode == "RGBA" else None)
        
        # Rainbow Prism RGB Split on accent
        if accent_decay > 0.05:
            r, g, b, a = frame.split()
            dx = int(round(accent_decay * 26.0))
            r_s = Image.new("L", r.size, 0)
            r_s.paste(r, (dx, int(dx*0.3)))
            b_s = Image.new("L", b.size, 0)
            b_s.paste(b, (-dx, int(-dx*0.3)))
            frame = Image.merge("RGBA", (r_s, g, b_s, a))
            
        # Directional blur on cut
        if accent_decay > 0.3:
            frame = frame.filter(ImageFilter.BoxBlur(min(20, int((accent_decay - 0.3) * 30.0))))
            
        # Exposure white flash
        if nearest_dt < 0.12:
            flash_alpha = int((1.0 - nearest_dt/0.12) * 140)
            frame = Image.alpha_composite(frame, Image.new("RGBA", (W, H), (255, 255, 255, flash_alpha)))
            
    rgb_data = frame.convert("RGB").tobytes()
    pipe.stdin.write(rgb_data)
    
    for ct in contact_ts:
        if abs(t - ct) < (0.5 / fps) and len(contact_samples) < 12:
            contact_samples.append((ct, frame.convert("RGB").copy()))

pipe.stdin.close()
pipe.wait()
print(f"[Export Complete] {OUT_MP4} ({os.path.getsize(OUT_MP4)/1024/1024:.2f} MB)")

# Contact Sheet
grid_w, grid_h = 3, 4
cw, ch = 270, 480
sheet = Image.new("RGB", (3*cw + 4*16, 4*ch + 5*16 + 70), (11, 13, 17))
draw_s = ImageDraw.Draw(sheet)
draw_s.text((16, 20), f"Gacha Hype on Midnight Phonk (BPM {detected_bpm:.1f}) - Dynamic Sync", fill=(241, 245, 249))

for idx, (ts, im) in enumerate(contact_samples[:12]):
    rx = 16 + (idx % 3) * (cw + 16)
    ry = 70 + 16 + (idx // 3) * (ch + 16)
    thumb = im.resize((cw, ch), Image.Resampling.LANCZOS)
    sheet.paste(thumb, (rx, ry))
    draw_s.rectangle([(rx+6, ry+6), (rx+85, ry+32)], fill=(0, 0, 0, 200))
    draw_s.text((rx+12, ry+8), f"{ts:.2f}s", fill=(56, 189, 248))

sheet_path = os.path.join(ARTIFACT_DIR, "output_gacha_phonk_contact_sheet.jpg")
sheet.save(sheet_path, quality=92)
print(f"[Contact Sheet Saved] {sheet_path}")
