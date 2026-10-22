#!/usr/bin/env python3
"""
Point 3: Render Aesthetic Lyric Edit on a completely DIFFERENT song, with different art and background.
- Song: test-assets/real/track_01_montagem_shirt_blue.wav
- Character Art: Firefly Portrait (public/assets/characters/firefly_portrait.png)
- Background: Dark Scenic Fantasy Night Stage (public/assets/shadow_stage.png)
- Clean layout: Character strictly on left 40%, Lyrics on right 60%, ZERO overlap!
"""

import os
import math
import subprocess
from PIL import Image, ImageDraw, ImageFilter, ImageFont

FFMPEG = r"D:\motionforge\node_modules\ffmpeg-static\ffmpeg.exe"
AUDIO_PATH = r"D:\motionforge\test-assets\real\track_01_montagem_shirt_blue.wav"
OUT_MP4 = r"D:\motionforge\test-assets\results\output_aesthetic_lyric_new.mp4"
ARTIFACT_DIR = r"C:\Users\mi7ki\.gemini\antigravity\brain\dcf0ddcd-0da4-4c20-ad76-55a82e55d8ae"

# Fonts
FONT_LARGE = ImageFont.truetype(r"C:\Windows\Fonts\segoeuib.ttf", 48)
FONT_MEDIUM = ImageFont.truetype(r"C:\Windows\Fonts\segoeuib.ttf", 34)
FONT_SMALL = ImageFont.truetype(r"C:\Windows\Fonts\segoeui.ttf", 24)
FONT_ORNAMENT = ImageFont.truetype(r"C:\Windows\Fonts\arialbd.ttf", 40)

W, H = 1080, 1920
fps = 60
duration = 12.0
total_frames = int(fps * duration)

# 1. Load Firefly Character Cutout
char_raw = Image.open(r"D:\motionforge\public\assets\characters\firefly_portrait.png").convert("RGBA")

# 2. Load Background Stage (Shadow Stage / Night Bokeh)
bg_raw = Image.open(r"D:\motionforge\public\assets\shadow_stage.png").convert("RGBA")
# Scale and crop background to 1080x1920 vertical with soft atmospheric blur
bg_scaled = bg_raw.resize((int(H * (bg_raw.width / bg_raw.height)), H), Image.Resampling.LANCZOS)
bg_x = (bg_scaled.width - W) // 2
bg_base = bg_scaled.crop((bg_x, 0, bg_x + W, H)).filter(ImageFilter.GaussianBlur(14))
# Apply dark night grade overlay (midnight navy)
dim = Image.new("RGBA", (W, H), (10, 15, 26, 120))
bg_base = Image.alpha_composite(bg_base, dim)

# 3. Scale Character for left-side framing (medium waist-up portrait)
# Firefly character takes left 48% of screen, leaving right 52% completely open for lyrics
char_h = int(H * 0.95)
char_w = int(char_h * (char_raw.width / char_raw.height))
char_scaled = char_raw.resize((char_w, char_h), Image.Resampling.LANCZOS)

# Generate Light Wrap and Ice-Blue Rim Contour
char_alpha = char_scaled.split()[3]
rim_mask = char_alpha.filter(ImageFilter.FIND_EDGES).filter(ImageFilter.BoxBlur(2))
rim_layer = Image.new("RGBA", char_scaled.size, (186, 230, 253, 190)) # ice blue rim
rim_layer.putalpha(rim_mask)
char_with_rim = Image.alpha_composite(char_scaled, rim_layer)

# 4. Synchronized Lyric Lines for Montagem Shirt Blue
lyrics = [
    # (start_t, end_t, words: [(word, start, end)])
    (1.0, 4.2, [("BLUE", 1.0, 1.8), ("SHIRT", 1.8, 2.5), ("DRIFTING", 2.5, 3.4), ("ALONE", 3.4, 4.2)]),
    (4.5, 8.0, [("NIGHT", 4.5, 5.2), ("LIGHTS", 5.2, 6.0), ("FLASH", 6.0, 6.8), ("AWAY", 6.8, 8.0)]),
    (8.2, 11.8, [("LOST", 8.2, 9.0), ("INSIDE", 9.0, 9.8), ("THE", 9.8, 10.4), ("GLOW", 10.4, 11.8)]),
]

ffmpeg_cmd = [
    FFMPEG, "-y",
    "-f", "rawvideo", "-vcodec", "rawvideo",
    "-s", f"{W}x{H}", "-pix_fmt", "rgb24", "-r", str(fps),
    "-i", "-",
    "-ss", "00:00:00", "-to", str(duration),
    "-i", AUDIO_PATH,
    "-c:v", "libx264", "-preset", "fast", "-crf", "17", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "192k",
    "-shortest",
    OUT_MP4
]
pipe = subprocess.Popen(ffmpeg_cmd, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

contact_samples = []
contact_ts = [0.8, 1.8, 2.8, 3.8, 4.8, 5.8, 6.8, 7.8, 8.8, 9.8, 10.8, 11.8]

print(f"Rendering Aesthetic Lyric Edit on Shirt Blue ({OUT_MP4})...")

for frame_idx in range(total_frames):
    t = frame_idx / fps
    
    # Background camera push-in
    bg_scale = 1.0 + t * 0.006
    cur_bw = int(W * bg_scale)
    cur_bh = int(H * bg_scale)
    bg_curr = bg_base.resize((cur_bw, cur_bh), Image.Resampling.BILINEAR)
    frame = bg_curr.crop(((cur_bw - W)//2, (cur_bh - H)//2, (cur_bw - W)//2 + W, (cur_bh - H)//2 + H))
    
    # Fade in from black (0.0s - 0.7s)
    if t < 0.7:
        fade_alpha = int((1.0 - t / 0.7) * 255)
        frame = Image.alpha_composite(frame, Image.new("RGBA", (W, H), (0, 0, 0, fade_alpha)))
        
    # Character Breathing & Idle Sway
    breath = 1.0 + math.sin(t * (20 / 60) * 2 * math.pi) * 0.010
    sway = math.sin(t * (14 / 60) * 2 * math.pi) * 0.65
    
    cw = int(char_with_rim.width * breath)
    ch = int(char_with_rim.height * breath)
    char_anim = char_with_rim.resize((cw, ch), Image.Resampling.BILINEAR)
    char_anim = char_anim.rotate(sway, resample=Image.Resampling.BICUBIC, expand=True)
    
    # Position: strictly LEFT ALIGNED (takes left 40%, completely clear of right side)
    char_x = -180 + int(math.sin(t * 0.7) * 6)
    char_y = 240 + int(math.cos(t * 0.5) * 6)
    frame.paste(char_anim, (char_x, char_y), char_anim)
    
    # Right side dark backdrop gradient for maximum text readability
    backdrop = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw_bd = ImageDraw.Draw(backdrop)
    draw_bd.rectangle([(510, 0), (W, H)], fill=(8, 12, 18, 110))
    frame = Image.alpha_composite(frame, backdrop)
    
    draw = ImageDraw.Draw(frame)
    
    # Lyrics Typography (Right Side Block: x=550, y=780)
    lyric_x = 550
    lyric_y = 780
    
    # Ornament '••'
    draw.text((lyric_x, lyric_y - 75), "••", fill=(255, 255, 255, 240), font=FONT_ORNAMENT)
    
    active_line = None
    for l in lyrics:
        if l[0] <= t < l[1]:
            active_line = l
            break
            
    if active_line:
        words = active_line[2]
        line_cur_y = lyric_y
        word_cur_x = lyric_x
        
        for w_text, w_start, w_end in words:
            is_active = w_start <= t < w_end
            is_read = t >= w_end
            
            if is_active:
                # Glowing pure white + cyan bloom
                draw.text((word_cur_x - 1, line_cur_y), w_text, fill=(56, 189, 248, 180), font=FONT_LARGE)
                draw.text((word_cur_x + 1, line_cur_y), w_text, fill=(56, 189, 248, 180), font=FONT_LARGE)
                draw.text((word_cur_x, line_cur_y), w_text, fill=(255, 255, 255, 255), font=FONT_LARGE)
            elif is_read:
                # Solid white
                draw.text((word_cur_x, line_cur_y), w_text, fill=(226, 232, 240, 240), font=FONT_LARGE)
            else:
                # Muted unread slate (35% opacity)
                draw.text((word_cur_x, line_cur_y), w_text, fill=(100, 116, 139, 140), font=FONT_LARGE)
                
            bbox = draw.textbbox((word_cur_x, line_cur_y), w_text, font=FONT_LARGE)
            word_cur_x += (bbox[2] - bbox[0]) + 16
            if word_cur_x > W - 80:
                word_cur_x = lyric_x
                line_cur_y += 70
                
    # Track title signature below lyrics
    draw.text((lyric_x, lyric_y + 160), "Montagem Shirt Blue • Phonk Edit", fill=(148, 163, 184, 180), font=FONT_SMALL)
    
    # Typewriter author signature in bottom-left safe zone
    cursor = "_" if (int(t * 3.5) % 2 == 0) else " "
    sig_full = "edit by kōri"
    chars_n = min(len(sig_full), int(max(0.0, t - 0.6) * 8.0))
    draw.text((80, H - 200), f"{sig_full[:chars_n]} {cursor}", fill=(203, 213, 225, 210), font=FONT_MEDIUM)

    rgb_data = frame.convert("RGB").tobytes()
    pipe.stdin.write(rgb_data)

    for ct in contact_ts:
        if abs(t - ct) < (0.5 / fps) and len(contact_samples) < 12:
            contact_samples.append((ct, frame.convert("RGB").copy()))

pipe.stdin.close()
pipe.wait()
print(f"[Export Complete] {OUT_MP4} ({os.path.getsize(OUT_MP4)/1024/1024:.2f} MB)")

# Save Contact Sheet
grid_w, grid_h = 3, 4
cw, ch = 270, 480
sheet = Image.new("RGB", (3*cw + 4*16, 4*ch + 5*16 + 70), (11, 13, 17))
draw_s = ImageDraw.Draw(sheet)
draw_s.text((16, 20), "Aesthetic Lyric: Firefly on Montagem Shirt Blue - Kōri Studio", fill=(241, 245, 249))

for idx, (ts, im) in enumerate(contact_samples[:12]):
    rx = 16 + (idx % 3) * (cw + 16)
    ry = 70 + 16 + (idx // 3) * (ch + 16)
    thumb = im.resize((cw, ch), Image.Resampling.LANCZOS)
    sheet.paste(thumb, (rx, ry))
    draw_s.rectangle([(rx+6, ry+6), (rx+85, ry+32)], fill=(0, 0, 0, 200))
    draw_s.text((rx+12, ry+8), f"{ts:.2f}s", fill=(56, 189, 248))

sheet_path = os.path.join(ARTIFACT_DIR, "output_aesthetic_lyric_contact_sheet.jpg")
sheet.save(sheet_path, quality=92)
print(f"[Contact Sheet Updated] {sheet_path}")
