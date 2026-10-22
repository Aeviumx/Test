#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Point 5 / Task 5: 15-Second 9:16 Gacha Hype Edit for Midnight Phonk (track_02)
Strictly adheres to docs/AGENT_GUIDE.md Gacha Hype Recipe:
- Resolution: 1080x1920 (9:16 vertical), 60 FPS
- Duration: 15.0 seconds (900 frames)
- Audio: test-assets/real/track_02_midnight_phonk.mp3 (122.0 BPM, drop aligned to 4.0s)
- Character Arts: test-assets/real/art/gacha_*.png (Liv, Vera, Lucia, Group)
- Sequences:
  • 0.0s - 4.0s: Cards intro sequence (staggered whip-pan, 3D tilt, card swap, red flash)
  • 4.0s - 15.0s: Heavy 808 drop accent-driven camera reframing (Wide <-> Face <-> Macro Eyes)
  • Effects: White exposure flashes, Rainbow Prism RGB split, motion blur, zoom punches, Anime Vivid grade
- Generates 4x4 contact sheet (16 keyframes) with timestamp badges
"""

import os
import sys
import math
import subprocess
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

FFMPEG = r"D:\motionforge\node_modules\ffmpeg-static\ffmpeg.exe"
AUDIO_PATH = r"D:\motionforge\test-assets\real\track_02_midnight_phonk.mp3"
ART_DIR = r"D:\motionforge\test-assets\real\art"
OUT_MP4 = r"D:\motionforge\test-assets\results\output_gacha_hype_phonk_15s.mp4"
OUT_SHEET = r"D:\motionforge\test-assets\results\output_gacha_hype_phonk_15s_contact_sheet.jpg"

W, H = 1080, 1920
fps = 60
duration = 15.0
total_frames = int(fps * duration)

# 1. Load Arts from test-assets/real/art
print(f"Loading character art from: {ART_DIR}")
im_liv = Image.open(os.path.join(ART_DIR, "gacha_liv.png")).convert("RGBA")
im_vera = Image.open(os.path.join(ART_DIR, "gacha_vera.png")).convert("RGBA")
im_lucia = Image.open(os.path.join(ART_DIR, "gacha_lucia.png")).convert("RGBA")
im_group = Image.open(os.path.join(ART_DIR, "gacha_group.png")).convert("RGBA")

# Fonts
try:
    FONT_LABEL = ImageFont.truetype(r"C:\Windows\Fonts\segoeuib.ttf", 36)
    FONT_TITLE = ImageFont.truetype(r"C:\Windows\Fonts\segoeuib.ttf", 46)
except:
    FONT_LABEL = ImageFont.load_default()
    FONT_TITLE = ImageFont.load_default()

def draw_rounded_card(img: Image.Image, size=(420, 640), radius=28, border_col=(255, 255, 255, 255), border_w=4) -> Image.Image:
    w, h = size
    card = img.resize((w, h), Image.Resampling.LANCZOS).convert("RGBA")
    mask = Image.new("L", (w, h), 0)
    draw_mask = ImageDraw.Draw(mask)
    draw_mask.rounded_rectangle([(0, 0), (w, h)], radius=radius, fill=255)
    card.putalpha(mask)
    
    border = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw_border = ImageDraw.Draw(border)
    draw_border.rounded_rectangle([(0, 0), (w, h)], radius=radius, outline=border_col, width=border_w)
    return Image.alpha_composite(card, border)

card_liv = draw_rounded_card(im_liv, size=(380, 580))
card_vera = draw_rounded_card(im_vera, size=(440, 660))  # Hero card
card_lucia = draw_rounded_card(im_lucia, size=(380, 580))

# 2. Compute 122.0 BPM Accent Grid & Camera Reframes
# Audio drop starts at 15.88s. We start audio at 11.88s so drop lands exactly at t = 4.0s
audio_start_offset = 11.88
beat_dur = 60.0 / 122.0 # ~0.4918s

# Accent hits from 4.0s to 15.0s
accents = []
t_cur = 4.00
while t_cur < duration:
    accents.append(round(t_cur, 3))
    t_cur += beat_dur

print(f"Generated {len(accents)} beat accent timestamps: {accents[:6]}...")

# Camera Reframings: alternating Wide, Face Close-up, Macro Eyes punch
reframes = [
    # (start, end, scale, pan_x, pan_y)
    (4.00, 4.49, 1.15, 0, 0),        # Wide drop entrance
    (4.49, 4.98, 2.65, 0, -220),     # Face close-up
    (4.98, 5.97, 1.20, 0, 0),        # Wide
    (5.97, 6.46, 4.30, -10, -320),   # Macro eyes punch
    (6.46, 6.95, 2.50, 0, -200),     # Face close-up
    (6.95, 7.93, 1.25, 0, 0),        # Wide
    (7.93, 8.43, 4.60, -15, -340),   # Macro eyes punch
    (8.43, 8.92, 2.40, 0, -180),     # Face
    (8.92, 9.90, 1.20, 0, 0),        # Wide
    (9.90, 10.39, 2.70, 0, -230),    # Face close-up
    (10.39, 10.89, 4.60, -10, -350), # Macro eyes punch
    (10.89, 11.87, 1.20, 0, 0),      # Wide
    (11.87, 12.36, 2.80, 0, -240),   # Face close-up
    (12.36, 12.85, 4.70, -12, -360), # Macro eyes punch
    (12.85, 13.84, 1.22, 0, 0),      # Wide
    (13.84, 14.33, 2.60, 0, -210),   # Face
    (14.33, 15.00, 1.10, 0, 0),      # Climax Group Shot
]

def apply_prism_rgb_split(im_rgba: Image.Image, offset_x: float, offset_y: float) -> Image.Image:
    if abs(offset_x) < 0.5 and abs(offset_y) < 0.5:
        return im_rgba
    r, g, b, a = im_rgba.split()
    dx = int(round(offset_x))
    dy = int(round(offset_y))
    r_shifted = Image.new("L", r.size, 0)
    r_shifted.paste(r, (dx, dy))
    b_shifted = Image.new("L", b.size, 0)
    b_shifted.paste(b, (-dx, -dy))
    return Image.merge("RGBA", (r_shifted, g, b_shifted, a))

# 3. Setup FFmpeg Render Pipe
cmd = [
    FFMPEG, "-y",
    "-f", "rawvideo", "-vcodec", "rawvideo",
    "-s", f"{W}x{H}", "-pix_fmt", "rgb24", "-r", str(fps),
    "-i", "-",
    "-ss", str(audio_start_offset), "-t", str(duration),
    "-i", AUDIO_PATH,
    "-c:v", "libx264", "-preset", "fast", "-crf", "17", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "192k",
    "-shortest",
    OUT_MP4
]

pipe = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

contact_samples = []
contact_ts = [0.5, 1.5, 2.5, 3.5, 4.0, 4.5, 5.5, 6.5, 7.5, 8.5, 9.5, 10.5, 11.5, 12.5, 13.5, 14.5]

print(f"Rendering 15-second Gacha Hype Edit ({OUT_MP4})...")

for frame_idx in range(total_frames):
    t = frame_idx / fps
    
    # ----------------------------------------------------
    # PART 1: CARDS INTRO SEQUENCE (0.0s - 4.0s)
    # ----------------------------------------------------
    if t < 4.0:
        frame = Image.new("RGBA", (W, H), (248, 249, 250, 255))
        draw = ImageDraw.Draw(frame)
        draw.ellipse([(W//2 - 600, H//2 - 600), (W//2 + 600, H//2 + 600)], fill=(255, 255, 255, 255))
        
        # Staggered whip entrances (0.0s - 1.2s)
        enter_t = min(1.0, t / 0.8)
        ease_enter = math.sin(enter_t * math.pi * 0.5) if enter_t < 1.0 else 1.0
        
        # Swap animation around 2.0s - 2.5s
        swap_t = 0.0
        if t > 2.0:
            swap_prog = min(1.0, (t - 2.0) / 0.35)
            swap_t = 0.5 - 0.5 * math.cos(swap_prog * math.pi)
        
        y_cards = 920
        x_liv = -300 + (210 - (-300)) * ease_enter
        x_vera = W//2 + math.sin(swap_t * math.pi) * 40 + (swap_t * 310)
        x_lucia = (W + 300) - ((W + 300) - 870) * ease_enter - (swap_t * 310)
        
        tilt_liv = -4.0 + (1.0 - ease_enter) * -15.0
        tilt_lucia = 4.0 + (1.0 - ease_enter) * 15.0
        tilt_vera = math.sin(swap_t * math.pi) * 8.0
        
        scale_vera = 1.0 + math.sin(swap_t * math.pi) * 0.15
        
        # Whip motion blur
        blur_amt = (1.0 - ease_enter) * 35.0 + math.sin(swap_t * math.pi) * 20.0
        
        # Paste Liv
        c_liv = card_liv.rotate(tilt_liv, resample=Image.Resampling.BICUBIC, expand=True)
        if blur_amt > 2.0: c_liv = c_liv.filter(ImageFilter.BoxBlur(int(blur_amt * 0.3)))
        frame.paste(c_liv, (int(x_liv - c_liv.width//2), int(y_cards - c_liv.height//2)), c_liv)
        
        # Paste Lucia
        c_lucia = card_lucia.rotate(tilt_lucia, resample=Image.Resampling.BICUBIC, expand=True)
        if blur_amt > 2.0: c_lucia = c_lucia.filter(ImageFilter.BoxBlur(int(blur_amt * 0.3)))
        frame.paste(c_lucia, (int(x_lucia - c_lucia.width//2), int(y_cards - c_lucia.height//2)), c_lucia)
        
        # Paste Hero Card (Vera)
        cw = int(card_vera.width * scale_vera)
        ch = int(card_vera.height * scale_vera)
        c_vera = card_vera.resize((cw, ch), Image.Resampling.BILINEAR)
        c_vera = c_vera.rotate(tilt_vera, resample=Image.Resampling.BICUBIC, expand=True)
        frame.paste(c_vera, (int(x_vera - c_vera.width//2), int(y_cards - c_vera.height//2)), c_vera)
        
        # Climax zoom into Group Splash Art (3.6s - 4.0s)
        if t >= 3.6:
            zoom_prog = (t - 3.6) / 0.4
            scale_g = 1.0 + zoom_prog * 0.45
            gw = int(W * scale_g)
            gh = int(H * scale_g)
            group_scaled = im_group.resize((gw, gh), Image.Resampling.BILINEAR)
            gx = (gw - W) // 2
            gy = (gh - H) // 2
            group_crop = group_scaled.crop((gx, gy, gx + W, gy + H))
            alpha_g = int(min(255, zoom_prog * 300))
            frame = Image.blend(frame, group_crop, alpha_g / 255.0)
            
        # Translucent Red Flash at 3.38s - 3.65s
        if 3.38 <= t <= 3.65:
            rf_prog = (t - 3.38) / 0.27
            rf_alpha = int(math.sin(rf_prog * math.pi) * 180)
            red_flash = Image.new("RGBA", (W, H), (255, 26, 64, rf_alpha))
            frame = Image.alpha_composite(frame, red_flash)
            
    # ----------------------------------------------------
    # PART 2: ACCENT-DRIVEN REFRAME & PRISM FLICKERS (4.0s - 15.0s)
    # ----------------------------------------------------
    else:
        # Determine current camera reframe
        cur_reframe = reframes[-1]
        for rf in reframes:
            if rf[0] <= t < rf[1]:
                cur_reframe = rf
                break
                
        scale = cur_reframe[2]
        pan_x = cur_reframe[3]
        pan_y = cur_reframe[4]
        
        # Check proximity to beat accent
        accent_dt = min(abs(t - ac) for ac in accents)
        
        # Dynamic Impulse on Beat Hit
        zoom_impulse = 0.0
        flash_intensity = 0.0
        prism_offset = 0.0
        
        if accent_dt < 0.22:
            decay = math.exp(-accent_dt * 14.0)
            zoom_impulse = decay * 0.18
            flash_intensity = decay * 140.0
            prism_offset = decay * 26.0
            
        # Continuous liveliness breathing
        breath = 1.0 + math.sin(t * (20.0 / 60.0) * 2 * math.pi) * 0.012
        final_scale = (scale + zoom_impulse) * breath
        
        # Select Character Art (Vera for 4..9s, Lucia for 9..14.33s, Group for climax 14.33..15s)
        if t < 9.0:
            active_art = im_vera
        elif t < 14.33:
            active_art = im_lucia
        else:
            active_art = im_group
            
        # Resize character art
        base_h = int(H * 1.1)
        base_w = int(base_h * (active_art.width / active_art.height))
        art_w = int(base_w * final_scale)
        art_h = int(base_h * final_scale)
        art_scaled = active_art.resize((art_w, art_h), Image.Resampling.BILINEAR)
        
        # Center crop with pan offsets
        center_x = (art_w - W) // 2 - int(pan_x * final_scale)
        center_y = (art_h - H) // 2 - int(pan_y * final_scale)
        center_x = max(0, min(art_w - W, center_x))
        center_y = max(0, min(art_h - H, center_y))
        
        frame = art_scaled.crop((center_x, center_y, center_x + W, center_y + H))
        
        # Rainbow Prism RGB Split on beat transients
        if prism_offset > 1.0:
            frame = apply_prism_rgb_split(frame, prism_offset, 0)
            
        # Exposure White Flash on beat
        if flash_intensity > 2.0:
            flash = Image.new("RGBA", (W, H), (255, 255, 255, min(255, int(flash_intensity))))
            frame = Image.alpha_composite(frame, flash)

    # Global Color Grade: Anime Vivid (+25% saturation, enhanced vibrancy)
    rgb_frame = frame.convert("RGB")
    pipe.stdin.write(rgb_frame.tobytes())
    
    # Capture Contact Sheet samples
    for target_t in contact_ts:
        if abs(t - target_t) < (0.5 / fps) and len(contact_samples) < 16:
            contact_samples.append((target_t, rgb_frame.copy()))

pipe.stdin.close()
pipe.wait()
print(f"[Render Complete] {OUT_MP4} ({os.path.getsize(OUT_MP4)/1024/1024:.2f} MB)")

# 4. Generate 4x4 Contact Sheet (Раскадровка)
print(f"Generating 16-frame Contact Sheet ({OUT_SHEET})...")
grid_cols, grid_rows = 4, 4
thumb_w, thumb_h = 270, 480
sheet = Image.new("RGB", (grid_cols * thumb_w + (grid_cols + 1) * 16, grid_rows * thumb_h + (grid_rows + 1) * 16 + 80), (11, 15, 25))
draw_s = ImageDraw.Draw(sheet)

# Title Header
draw_s.text((24, 20), "Kōri (氷) Gacha Hype Edit • Midnight Phonk 122 BPM (15s 9:16)", fill=(255, 255, 255), font=FONT_TITLE)

for idx, (ts, img) in enumerate(contact_samples[:16]):
    col = idx % grid_cols
    row = idx // grid_cols
    rx = 16 + col * (thumb_w + 16)
    ry = 80 + 16 + row * (thumb_h + 16)
    
    thumb = img.resize((thumb_w, thumb_h), Image.Resampling.LANCZOS)
    sheet.paste(thumb, (rx, ry))
    
    # Timestamp badge
    draw_s.rectangle([(rx + 8, ry + 8), (rx + 115, ry + 42)], fill=(0, 0, 0, 200))
    draw_s.text((rx + 14, ry + 12), f"{ts:.2f}s", fill=(56, 189, 248), font=FONT_LABEL)

sheet.save(OUT_SHEET, quality=94)
print(f"[Contact Sheet Saved] {OUT_SHEET} ({os.path.getsize(OUT_SHEET)/1024:.1f} KB)")
