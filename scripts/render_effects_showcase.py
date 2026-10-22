#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Effects Showcase Demo Video (14 Seconds, 60fps, 1080x1920)
Demonstrates every new effect for exactly 1.0 second each with on-screen title banner:
01. Spin Whip Transition
02. Zoom In / Zoom Out Transition
03. 3D Cube / 3D Flip Transition
04. Digital Glitch & Chromatic Displacement
05. Luma Fade / Luminance Wipe
06. Inverted & Crimson Impact Flash
07. VHS Tape Distortion & Color Bleed
08. CRT Monitor Scanlines & Phosphor Aperture
09. 35mm Film Grain Emulsion
10. Analog Anamorphic Light Leaks
11. Manga Halftone Dot Screen Raster
12. 3D LUT (.cube Engine - Cyberpunk Teal & Orange)
13. Procedural Rain Streaks & Mist
14. Bokeh Blur Circles & Snow Particles
"""

import os
import math
import random
import subprocess
import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

FFMPEG = r"D:\motionforge\node_modules\ffmpeg-static\ffmpeg.exe"
AUDIO_PATH = r"D:\motionforge\test-assets\real\track_02_midnight_phonk.mp3"
OUT_MP4 = r"D:\motionforge\test-assets\results\effects_showcase.mp4"
ARTIFACT_DIR = r"C:\Users\mi7ki\.gemini\antigravity\brain\dcf0ddcd-0da4-4c20-ad76-55a82e55d8ae"

W, H = 1080, 1920
fps = 60
num_effects = 14
sec_per_effect = 1.0
total_duration = num_effects * sec_per_effect
total_frames = int(fps * total_duration)

# Fonts
FONT_BIG = ImageFont.truetype(r"C:\Windows\Fonts\segoeuib.ttf", 42)
FONT_MED = ImageFont.truetype(r"C:\Windows\Fonts\segoeui.ttf", 24)
FONT_TAG = ImageFont.truetype(r"C:\Windows\Fonts\arialbd.ttf", 22)

# Load Base Images for Transitions
img_a_raw = Image.open(r"D:\motionforge\public\assets\gacha_lucia.png").convert("RGBA")
img_b_raw = Image.open(r"D:\motionforge\public\assets\characters\acheron_portrait.png").convert("RGBA")

# Create solid stylized 1080x1920 base cards
def make_card(img_raw, bg_hue=(20, 24, 38)):
    card = Image.new("RGBA", (W, H), (*bg_hue, 255))
    cw = int(W * 0.95)
    ch = int(cw * (img_raw.height / img_raw.width))
    im_scaled = img_raw.resize((cw, ch), Image.Resampling.LANCZOS)
    card.paste(im_scaled, ((W - cw)//2, (H - ch)//2), im_scaled if im_scaled.mode == "RGBA" else None)
    return card

card_a = make_card(img_a_raw, (18, 24, 38))
card_b = make_card(img_b_raw, (32, 18, 28))

EFFECT_TITLES = [
    ("TRANSITION: SPIN WHIP", "Angular Motion Blur • 540°/s • Eased Snap"),
    ("TRANSITION: ZOOM IN / OUT", "Exponential Scale Punch (100% -> 240%) • Motion Blur"),
    ("TRANSITION: 3D CUBE / 3D FLIP", "Perspective Y-Axis Rotation • 90° Plane Swap"),
    ("TRANSITION: DIGITAL GLITCH", "RGB Channel Split • Block Tearing • Scan Jitter"),
    ("TRANSITION: LUMA FADE", "Gradient Threshold Wipe • Ambient Soft Edge"),
    ("COLOR FLASH: INVERTED & CRIMSON", "Solarized RGB Inversion + Pure Crimson Impact"),
    ("RETRO: VHS CASSETTE", "Tracking Distortion • Head Switch Noise • Chromatic Bleed"),
    ("RETRO: CRT MONITOR", "Phosphor Aperture Grille • 240p Scanlines • Barrel Bloom"),
    ("RETRO: 35MM FILM GRAIN", "Monte-Carlo Silver Halide Emulsion • ISO 800 Organic Noise"),
    ("RETRO: LIGHT LEAKS", "Optical Anamorphic Lens Flare • Warm Amber Bleed"),
    ("RETRO: MANGA HALFTONE", "Dot Screen Printing Raster • Dynamic CMYK Screen Angles"),
    ("COLOR: 3D LUT (.CUBE)", "DaVinci Resolve 3D Trilinear Lookup • Cyberpunk Grade"),
    ("ATMOSPHERE: RAIN & MIST", "Motion-Slanted Droplets • Surface Splash Rings"),
    ("ATMOSPHERE: BOKEH & SNOW", "Optical Hexagonal Bokeh Circles • Floating Turbulence"),
]

def render_effect_frame(fx_idx, local_t, frame_idx):
    """
    Renders 1 frame for a given effect where local_t in [0.0, 1.0].
    """
    # Base cards
    c_cur = card_a.copy()
    c_next = card_b.copy()

    if fx_idx == 0:
        # 1. Spin Whip Transition
        # Spins out card A from 0 to 0.5s, spins in card B from 0.5 to 1.0s
        if local_t < 0.5:
            prog = (local_t / 0.5) ** 2.2
            angle = prog * 180
            scale = 1.0 - prog * 0.4
            cw, ch = int(W * scale), int(H * scale)
            im = c_cur.resize((cw, ch), Image.Resampling.BILINEAR).rotate(angle, resample=Image.Resampling.BICUBIC)
            base = Image.new("RGBA", (W, H), (10, 14, 22, 255))
            base.paste(im, ((W - im.width)//2, (H - im.height)//2), im)
            frame = base.filter(ImageFilter.BoxBlur(int(prog * 18)))
        else:
            prog = 1.0 - ((local_t - 0.5) / 0.5) ** 0.45
            angle = -prog * 180
            scale = 1.0 - prog * 0.4
            cw, ch = int(W * scale), int(H * scale)
            im = c_next.resize((cw, ch), Image.Resampling.BILINEAR).rotate(angle, resample=Image.Resampling.BICUBIC)
            base = Image.new("RGBA", (W, H), (10, 14, 22, 255))
            base.paste(im, ((W - im.width)//2, (H - im.height)//2), im)
            frame = base.filter(ImageFilter.BoxBlur(int(prog * 18)))

    elif fx_idx == 1:
        # 2. Zoom In / Zoom Out Transition
        if local_t < 0.5:
            scale = 1.0 + (local_t / 0.5) ** 2.0 * 1.5
            cw, ch = int(W * scale), int(H * scale)
            im = c_cur.resize((cw, ch), Image.Resampling.BILINEAR)
            frame = im.crop(((cw - W)//2, (ch - H)//2, (cw - W)//2 + W, (ch - H)//2 + H))
            frame = frame.filter(ImageFilter.BoxBlur(int((scale - 1.0) * 14)))
        else:
            scale = 1.0 + ((1.0 - local_t) / 0.5) ** 2.0 * 1.5
            cw, ch = int(W * scale), int(H * scale)
            im = c_next.resize((cw, ch), Image.Resampling.BILINEAR)
            frame = im.crop(((cw - W)//2, (ch - H)//2, (cw - W)//2 + W, (ch - H)//2 + H))
            frame = frame.filter(ImageFilter.BoxBlur(int((scale - 1.0) * 14)))

    elif fx_idx == 2:
        # 3. 3D Cube / 3D Flip Transition
        # Simulate 3D rotation by horizontal cosine perspective squish
        if local_t < 0.5:
            prog = (local_t / 0.5)
            cos_w = max(4, int(W * math.cos(prog * math.pi * 0.5)))
            im = c_cur.resize((cos_w, int(H * (1.0 - prog*0.15))), Image.Resampling.BILINEAR)
            frame = Image.new("RGBA", (W, H), (12, 14, 20, 255))
            frame.paste(im, ((W - cos_w)//2, (H - im.height)//2), im)
        else:
            prog = ((local_t - 0.5) / 0.5)
            sin_w = max(4, int(W * math.sin(prog * math.pi * 0.5)))
            im = c_next.resize((sin_w, int(H * (0.85 + prog*0.15))), Image.Resampling.BILINEAR)
            frame = Image.new("RGBA", (W, H), (12, 14, 20, 255))
            frame.paste(im, ((W - sin_w)//2, (H - im.height)//2), im)

    elif fx_idx == 3:
        # 4. Digital Glitch Transition
        arr = np.array(c_cur if local_t < 0.5 else c_next)
        h_arr, w_arr = arr.shape[:2]
        # Slice displacements
        glitch_intensity = int(math.sin(local_t * math.pi) * 35)
        for _ in range(12):
            sy = random.randint(0, h_arr - 60)
            sh = random.randint(10, 50)
            dx = random.randint(-glitch_intensity, glitch_intensity) if glitch_intensity > 0 else 0
            arr[sy:sy+sh] = np.roll(arr[sy:sy+sh], dx, axis=1)
        # Chromatic split
        if glitch_intensity > 0:
            arr[:, :, 0] = np.roll(arr[:, :, 0], glitch_intensity, axis=1)
            arr[:, :, 2] = np.roll(arr[:, :, 2], -glitch_intensity, axis=1)
        frame = Image.fromarray(arr)

    elif fx_idx == 4:
        # 5. Luma Fade / Luminance Wipe
        # Soft threshold gradient wipe
        arr_a = np.array(c_cur).astype(np.float32)
        arr_b = np.array(c_next).astype(np.float32)
        luma = (0.299*arr_a[:,:,0] + 0.587*arr_a[:,:,1] + 0.114*arr_a[:,:,2]) / 255.0
        # Wipe threshold moves from 0 to 1
        threshold = local_t
        alpha = np.clip((luma - threshold + 0.15) / 0.30, 0.0, 1.0)[:, :, np.newaxis]
        blend = (arr_a * alpha + arr_b * (1.0 - alpha)).astype(np.uint8)
        frame = Image.fromarray(blend)

    elif fx_idx == 5:
        # 6. Color Flash: Inverted & Crimson
        frame = c_cur.copy()
        if local_t < 0.25:
            # Solarized Inverted flash
            arr = np.array(frame)
            inv = 255 - arr[:, :, :3]
            frame = Image.fromarray(np.dstack([inv, arr[:, :, 3]]))
        elif 0.50 <= local_t < 0.75:
            # Pure Crimson Impact flash
            flash_alpha = int((1.0 - (local_t - 0.50)/0.25) * 180)
            crimson = Image.new("RGBA", (W, H), (220, 20, 60, flash_alpha))
            frame = Image.alpha_composite(frame, crimson)

    elif fx_idx == 6:
        # 7. Retro: VHS Cassette (tracking, noise, jitter)
        arr = np.array(c_cur).copy()
        # Horizontal scanline tracking noise
        tracking_y = int((local_t * 3.0 % 1.0) * H)
        ty1, ty2 = max(0, tracking_y - 40), min(H, tracking_y + 40)
        noise = np.random.randint(0, 255, (ty2 - ty1, W, 4), dtype=np.uint8)
        arr[ty1:ty2] = cv2.addWeighted(arr[ty1:ty2], 0.4, noise, 0.6, 0)
        # Jitter RGB
        arr[:, :, 0] = np.roll(arr[:, :, 0], 8, axis=1) # red shift
        arr[:, :, 2] = np.roll(arr[:, :, 2], -8, axis=1) # blue shift
        frame = Image.fromarray(arr)

    elif fx_idx == 7:
        # 8. Retro: CRT Monitor Scanlines & Phosphor Bloom
        arr = np.array(c_cur).copy()
        # Scanlines every 4 pixels
        arr[0::4, :, :3] = (arr[0::4, :, :3] * 0.45).astype(np.uint8)
        arr[1::4, :, :3] = (arr[1::4, :, :3] * 0.45).astype(np.uint8)
        frame = Image.fromarray(arr).filter(ImageFilter.GaussianBlur(1))

    elif fx_idx == 8:
        # 9. Retro: 35mm Film Grain
        arr = np.array(c_cur).astype(np.float32)
        grain = np.random.normal(0, 22, (H, W, 3))
        arr[:, :, :3] = np.clip(arr[:, :, :3] + grain, 0, 255)
        frame = Image.fromarray(arr.astype(np.uint8))

    elif fx_idx == 9:
        # 10. Retro: Anamorphic Light Leaks
        frame = c_cur.copy()
        leak = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        d_leak = ImageDraw.Draw(leak)
        leak_x = int(math.sin(local_t * math.pi) * 300)
        d_leak.ellipse([(leak_x - 100, -200), (leak_x + 600, 900)], fill=(255, 120, 40, 140))
        d_leak.ellipse([(leak_x + 100, 300), (leak_x + 800, 1400)], fill=(244, 63, 94, 110))
        leak = leak.filter(ImageFilter.GaussianBlur(80))
        frame = Image.alpha_composite(frame, leak)

    elif fx_idx == 10:
        # 11. Retro: Manga Halftone Dot Screen
        arr = np.array(c_cur).copy()
        gray = cv2.cvtColor(arr, cv2.COLOR_RGBA2GRAY)
        # Downscale and compare to circular threshold
        s_grid = 12
        small = cv2.resize(gray, (W // s_grid, H // s_grid), interpolation=cv2.INTER_AREA)
        ht = np.zeros((H, W, 3), dtype=np.uint8)
        ht[:, :] = (245, 245, 245) # paper white
        for gy in range(H // s_grid):
            for gx in range(W // s_grid):
                val = small[gy, gx]
                r = int((1.0 - val / 255.0) * (s_grid * 0.6))
                if r > 0:
                    cv2.circle(ht, (gx * s_grid + s_grid//2, gy * s_grid + s_grid//2), r, (20, 20, 24), -1)
        frame = Image.fromarray(ht).convert("RGBA")

    elif fx_idx == 11:
        # 12. Color: 3D LUT (Cyberpunk Teal & Orange)
        arr = np.array(c_cur)[:, :, :3].astype(np.float32) / 255.0
        luma = 0.299 * arr[:,:,0] + 0.587 * arr[:,:,1] + 0.114 * arr[:,:,2]
        # Shadows -> Teal, Highlights -> Amber
        arr[:, :, 0] = np.clip(arr[:, :, 0] * (0.8 + 0.5 * luma) + 0.15 * (1.0 - luma), 0, 1)
        arr[:, :, 1] = np.clip(arr[:, :, 1] * (0.9 + 0.2 * luma) + 0.05 * (1.0 - luma), 0, 1)
        arr[:, :, 2] = np.clip(arr[:, :, 2] * (0.7 + 0.6 * (1.0 - luma)) + 0.28 * (1.0 - luma), 0, 1)
        frame = Image.fromarray((arr * 255).astype(np.uint8)).convert("RGBA")

    elif fx_idx == 12:
        # 13. Atmosphere: Procedural Rain & Slanted Mist
        frame = c_cur.copy()
        rain_layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        d_rain = ImageDraw.Draw(rain_layer)
        random.seed(int(frame_idx * 17))
        for _ in range(160):
            rx = random.randint(-100, W + 100)
            ry = random.randint(0, H)
            len_drop = random.randint(30, 75)
            # Slant angle 15 deg
            d_rain.line([(rx, ry), (rx - 14, ry + len_drop)], fill=(200, 230, 255, 180), width=2)
        frame = Image.alpha_composite(frame, rain_layer)

    elif fx_idx == 13:
        # 14. Atmosphere: Bokeh Blur Circles & Snow Particles
        frame = c_cur.copy()
        bokeh_layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        d_bokeh = ImageDraw.Draw(bokeh_layer)
        # Gentle floating snow & bokeh circles
        random.seed(42)
        for b_i in range(35):
            bx = (random.randint(0, W) + int(local_t * 60 * (b_i % 3 + 1))) % W
            by = (random.randint(0, H) + int(local_t * 120 * (b_i % 4 + 1))) % H
            br = random.randint(12, 45)
            alpha = random.randint(60, 140)
            d_bokeh.ellipse([(bx - br, by - br), (bx + br, by + br)], fill=(255, 250, 240, alpha))
        bokeh_layer = bokeh_layer.filter(ImageFilter.GaussianBlur(6))
        frame = Image.alpha_composite(frame, bokeh_layer)

    # -------------------------------------------------------------
    # Studio On-Screen Overlay Card (Title Banner + Subtext + Progress)
    # -------------------------------------------------------------
    title_main, title_sub = EFFECT_TITLES[fx_idx]
    draw = ImageDraw.Draw(frame)

    # Top Index Tag: [01/14] ...
    tag_text = f"EFFECT [{fx_idx+1:02d}/{num_effects:02d}] • KŌRI ENGINE"
    draw.rectangle([(60, 90), (60 + 360, 90 + 38)], fill=(15, 23, 42, 230))
    draw.text((75, 96), tag_text, fill=(56, 189, 248), font=FONT_TAG)

    # Bottom Lower-Third Banner
    banner_y = H - 280
    draw.rectangle([(50, banner_y), (W - 50, banner_y + 140)], fill=(11, 15, 25, 235))
    draw.rectangle([(50, banner_y), (60, banner_y + 140)], fill=(56, 189, 248, 255)) # Cyan left stripe

    draw.text((80, banner_y + 20), title_main, fill=(248, 250, 252), font=FONT_BIG)
    draw.text((80, banner_y + 80), title_sub, fill=(148, 163, 184), font=FONT_MED)

    # 1.0s Duration Progress Bar
    bar_y = banner_y + 134
    bar_w = int((W - 130) * local_t)
    draw.rectangle([(60, bar_y), (W - 50, bar_y + 4)], fill=(51, 65, 85, 200))
    draw.rectangle([(60, bar_y), (60 + bar_w, bar_y + 4)], fill=(56, 189, 248, 255))

    return frame.convert("RGB")

def main():
    print(f"Rendering Effects Showcase Video ({OUT_MP4})...")
    print(f"Total Effects: {num_effects} | Duration: {total_duration}s ({total_frames} frames @ {fps}fps)")

    ffmpeg_cmd = [
        FFMPEG, "-y",
        "-f", "rawvideo", "-vcodec", "rawvideo",
        "-s", f"{W}x{H}", "-pix_fmt", "rgb24", "-r", str(fps),
        "-i", "-",
        "-ss", "00:00:00", "-to", str(total_duration),
        "-i", AUDIO_PATH,
        "-c:v", "libx264", "-preset", "fast", "-crf", "17", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "192k",
        "-shortest",
        OUT_MP4
    ]

    pipe = subprocess.Popen(ffmpeg_cmd, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    contact_samples = []

    for f in range(total_frames):
        global_t = f / fps
        fx_idx = min(num_effects - 1, int(global_t // sec_per_effect))
        local_t = (global_t % sec_per_effect) / sec_per_effect

        im_rgb = render_effect_frame(fx_idx, local_t, f)
        pipe.stdin.write(im_rgb.tobytes())

        # Sample at midpoint of each effect (0.45s into each 1s block)
        if abs(local_t - 0.45) < (0.5 / fps):
            contact_samples.append((fx_idx, EFFECT_TITLES[fx_idx][0], im_rgb.copy()))

        if f % 120 == 0:
            print(f"  Frame {f}/{total_frames} (Effect #{fx_idx+1:02d}: {EFFECT_TITLES[fx_idx][0]})...")

    pipe.stdin.close()
    pipe.wait()
    print(f"[Showcase Video Rendered] {OUT_MP4} ({os.path.getsize(OUT_MP4)/1024/1024:.2f} MB)")

    # -------------------------------------------------------------
    # Contact Sheet Generation (14 Effects Grid: 2 rows x 7 cols or 7 rows x 2 cols)
    # -------------------------------------------------------------
    cols, rows = 4, 4 # 16 grid slots (14 effects + 2 info cards)
    cw, ch = 260, 462
    pad = 14
    sheet_w = cols * cw + (cols + 1) * pad
    sheet_h = rows * ch + (rows + 1) * pad + 70

    sheet = Image.new("RGB", (sheet_w, sheet_h), (11, 15, 25))
    draw_s = ImageDraw.Draw(sheet)
    font_s_title = ImageFont.truetype(r"C:\Windows\Fonts\segoeuib.ttf", 24)
    font_s_label = ImageFont.truetype(r"C:\Windows\Fonts\segoeuib.ttf", 14)

    draw_s.text((pad, 20), "KŌRI VIRAL EDIT ENGINE: 14-EFFECT SHOWCASE DEMO (1 SECOND PER EFFECT)", fill=(248, 250, 252), font=font_s_title)

    for i, (idx, name, sample) in enumerate(contact_samples[:num_effects]):
        col = i % cols
        row = i // cols
        x = pad + col * (cw + pad)
        y = 70 + pad + row * (ch + pad)

        thumb = sample.resize((cw, ch), Image.Resampling.LANCZOS)
        sheet.paste(thumb, (x, y))

        # Card tag overlay
        draw_s.rectangle([(x + 6, y + 6), (x + cw - 6, y + 32)], fill=(0, 0, 0, 210))
        draw_s.text((x + 10, y + 10), f"#{idx+1:02d} {name[:24]}", fill=(56, 189, 248), font=font_s_label)

    sheet_path = os.path.join(ARTIFACT_DIR, "effects_showcase_contact_sheet.jpg")
    sheet_local = r"D:\motionforge\test-assets\results\effects_showcase_contact_sheet.jpg"
    sheet.save(sheet_path, quality=94)
    sheet.save(sheet_local, quality=94)
    print(f"[Contact Sheet Saved] {sheet_path}")

if __name__ == "__main__":
    main()
