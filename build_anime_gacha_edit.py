import os
import sys
import time
import math
import subprocess
import numpy as np
from PIL import Image, ImageFilter, ImageEnhance, ImageDraw

print("==================================================================")
print("  ANIME GACHA-GAME STYLE EDIT (8 SECONDS, 1:1, 60 FPS, BEAT-SYNCED)")
print("  Vera Garnet • Liv Empyrea • Lucia Plume")
print("==================================================================")
t_start = time.time()

WIDTH = 1080
HEIGHT = 1080
FPS = 60
TOTAL_FRAMES = 480 # Exactly 8.000s @ 60 FPS

# Paths
AUDIO_PATH = "D:/motionforge/public/assets/gacha_audio_8s.aac"
OUTPUT_MP4 = "D:/motionforge/public/assets/anime_gacha_edit.mp4"
TEMP_RAW_MP4 = "D:/motionforge/public/assets/edit_segments/raw_gacha_video.mp4"
DOWNLOAD_MP4 = "D:/загрузки/anime_gacha_edit.mp4"

# Source assets
VERA_SPLASH_PATH = "D:/motionforge/public/assets/gacha_vera.png"
LIV_SPLASH_PATH = "D:/motionforge/public/assets/gacha_liv.png"
LUCIA_SPLASH_PATH = "D:/motionforge/public/assets/gacha_lucia.png"
FINAL_SHOT1_PATH = "D:/motionforge/public/assets/gacha_final_shot1.png"
FINAL_SHOT2_PATH = "D:/motionforge/public/assets/gacha_final_shot2.png"

# Load and enhance master 1080x1080 images
def load_and_enhance(path, sharpness=1.35, contrast=1.08):
    im = Image.open(path).convert("RGB")
    if im.size != (1080, 1080):
        im = im.resize((1080, 1080), Image.Resampling.LANCZOS)
    im = ImageEnhance.Sharpness(im).enhance(sharpness)
    im = ImageEnhance.Contrast(im).enhance(contrast)
    return im

im_vera = load_and_enhance(VERA_SPLASH_PATH, 1.35, 1.08)
im_liv = load_and_enhance(LIV_SPLASH_PATH, 1.30, 1.06)
im_lucia = load_and_enhance(LUCIA_SPLASH_PATH, 1.35, 1.10)
im_final1 = load_and_enhance(FINAL_SHOT1_PATH, 1.35, 1.08)
im_final2 = load_and_enhance(FINAL_SHOT2_PATH, 1.35, 1.08)

# Pre-generate the 3 crisp cards (290 x 340) for Shot 4
card_w, card_h = 290, 340
vera_card_img = im_vera.crop((90, 30, 90 + 870, 30 + 1020)).resize((card_w, card_h), Image.Resampling.LANCZOS)
lucia_card_img = im_lucia.crop((120, 60, 120 + 840, 60 + 980)).resize((card_w, card_h), Image.Resampling.LANCZOS)
liv_card_img = im_liv.crop((105, 30, 105 + 870, 30 + 1020)).resize((card_w, card_h), Image.Resampling.LANCZOS)

# -------------------------------------------------------------------------
# VISUAL EFFECTS (Motion Blur, Zoom Blur, Spectral Prism, Flash, Shake)
# -------------------------------------------------------------------------
def apply_flash(arr, alpha):
    if alpha <= 0.005:
        return arr
    a = min(1.0, max(0.0, alpha))
    return (arr.astype(np.float32) * (1.0 - a) + 255.0 * a).astype(np.uint8)

def apply_camera_shake(arr, magnitude):
    if magnitude <= 0.5:
        return arr
    dx = int(np.random.uniform(-magnitude, magnitude))
    dy = int(np.random.uniform(-magnitude, magnitude))
    return np.roll(np.roll(arr, dx, axis=1), dy, axis=0)

def apply_spectral_prism(arr, strength=0.0):
    if strength <= 0.8:
        return arr
    s = float(strength)
    h, w, _ = arr.shape
    res = np.zeros_like(arr)
    
    # Red: radial expansion
    im_r = Image.fromarray(arr[:, :, 0])
    im_r_scaled = im_r.resize((int(w + s * 2), int(h + s * 2)), Image.Resampling.BILINEAR)
    res[:, :, 0] = np.array(im_r_scaled.crop((int(s), int(s), int(s) + w, int(s) + h)))
    
    # Green: baseline
    res[:, :, 1] = arr[:, :, 1]
    
    # Blue: radial contraction
    im_b = Image.fromarray(arr[:, :, 2])
    im_b_scaled = im_b.resize((int(w - s * 2), int(h - s * 2)), Image.Resampling.BILINEAR)
    padded_b = Image.new('L', (w, h), 0)
    padded_b.paste(im_b_scaled, (int(s), int(s)))
    res[:, :, 2] = np.array(padded_b)
    
    return res

def apply_motion_blur_x(im, dx):
    """Horizontal whip-pan motion blur."""
    if abs(dx) < 3:
        return im
    steps = 5
    blended = im.copy()
    for i in range(1, steps + 1):
        offset = int(dx * (i / steps))
        shifted = np.roll(np.array(im), offset, axis=1)
        blended = Image.blend(blended, Image.fromarray(shifted), 1.0 / (i + 1))
    return blended

def apply_zoom_blur(im, zoom_factor=1.15):
    """Radial zoom blur for explosive pop."""
    w, h = im.size
    steps = 4
    blended = im.copy()
    for i in range(1, steps + 1):
        zf = 1.0 + (zoom_factor - 1.0) * (i / steps)
        zw = int(w / zf)
        zh = int(h / zf)
        crop_box = ((w - zw)//2, (h - zh)//2, (w + zw)//2, (h + zh)//2)
        scaled = im.crop(crop_box).resize((w, h), Image.Resampling.BILINEAR)
        blended = Image.blend(blended, scaled, 1.0 / (i + 1))
    return blended

def zoom_push(im, zoom, cx=540, cy=540):
    if zoom <= 1.001:
        return im
    w = 1080 / zoom
    h = 1080 / zoom
    left = max(0, min(1080 - w, cx - w / 2))
    top = max(0, min(1080 - h, cy - h / 2))
    return im.crop((left, top, left + w, top + h)).resize((1080, 1080), Image.Resampling.LANCZOS)

# -------------------------------------------------------------------------
# FFMPEG PIPE
# -------------------------------------------------------------------------
ffmpeg_cmd = [
    "ffmpeg", "-y",
    "-f", "rawvideo",
    "-vcodec", "rawvideo",
    "-s", f"{WIDTH}x{HEIGHT}",
    "-pix_fmt", "rgb24",
    "-r", str(FPS),
    "-i", "-",
    "-c:v", "libx264",
    "-preset", "fast",
    "-crf", "15",
    "-pix_fmt", "yuv420p",
    TEMP_RAW_MP4
]

pipe = subprocess.Popen(ffmpeg_cmd, stdin=subprocess.PIPE, stderr=subprocess.DEVNULL)
print("Rendering 480 frames to FFmpeg rawvideo pipe...")

# Base card horizontal coordinates on white background
X_LEFT = 70
X_MID = 395
X_RIGHT = 720
Y_BASE = 370

def render_cards_canvas(cards_info, bg_color=(255, 255, 255), global_scale=1.0):
    """
    Renders 3 cards on clean white background with drop shadows and dark borders.
    cards_info: list of (img, x, y, scale)
    """
    canvas = Image.new("RGB", (1080, 1080), bg_color)
    
    # Sort by scale so popped cards are drawn on top
    sorted_cards = sorted(cards_info, key=lambda c: c[3])
    
    for c_img, cx, cy, sc in sorted_cards:
        w = int(card_w * sc * global_scale)
        h = int(card_h * sc * global_scale)
        res_card = c_img.resize((w, h), Image.Resampling.LANCZOS)
        
        # Soft drop shadow
        sh_w = w + 40
        sh_h = h + 40
        sh = Image.new("RGBA", (sh_w, sh_h), (0, 0, 0, 0))
        sh_draw = ImageDraw.Draw(sh)
        sh_draw.rectangle([15, 15, sh_w - 15, sh_h - 15], fill=(20, 20, 30, int(85 * min(1.0, sc))))
        sh_blur = sh.filter(ImageFilter.GaussianBlur(radius=int(12 * sc)))
        canvas.paste(sh_blur, (int(cx - 20), int(cy - 10)), sh_blur)
        
        # Crisp card frame
        frame = Image.new("RGB", (w + 4, h + 4), (18, 18, 22))
        canvas.paste(frame, (int(cx - 2), int(cy - 2)))
        canvas.paste(res_card, (int(cx), int(cy)))
        
    return canvas

# -------------------------------------------------------------------------
# FRAME-BY-FRAME COMPOSITION (480 FRAMES = 8.000s)
# -------------------------------------------------------------------------
for f in range(TOTAL_FRAMES):
    # ---------------------------------------------------------------------
    # SHOT 1: VERA GARNET SPLASH ART (Frames 0 .. 53 | 0.00s .. 0.90s, 54 frames)
    # Full-screen splash art, subtle camera push-in
    # ---------------------------------------------------------------------
    if f < 54:
        p = f / 54.0
        # Subtle push-in from 1.00 to 1.10
        z = 1.00 + 0.10 * (p ** 1.3)
        # Snappy beat kick pulse at f=30 (0.50s)
        if 28 <= f <= 34:
            z += 0.05 * (1.0 - abs(f - 30) / 4.0)
            
        im = zoom_push(im_vera, z, cx=540, cy=460)
        arr = np.array(im)
        
        # Beat 1 impact on frame 0
        flash = max(0.0, 1.0 - (f / 4.0))
        if 30 <= f <= 33:
            flash = max(flash, 0.65 * (1.0 - (f - 30) / 3.0))
        arr = apply_flash(arr, flash)
        
        chroma = 18.0 * math.exp(-f * 0.18)
        arr = apply_spectral_prism(arr, chroma)

    # ---------------------------------------------------------------------
    # SHOT 2: LIV EMPYREA SPLASH ART (Frames 54 .. 107 | 0.90s .. 1.80s, 54 frames)
    # Hard cut to Liv, soft circular light background, subtle camera push-in
    # ---------------------------------------------------------------------
    elif f < 108:
        sub_f = f - 54
        p = sub_f / 54.0
        z = 1.00 + 0.08 * (p ** 1.2)
        # Beat pulse at sub_f=27
        if 25 <= sub_f <= 31:
            z += 0.04 * (1.0 - abs(sub_f - 27) / 4.0)
            
        im = zoom_push(im_liv, z, cx=540, cy=480)
        arr = np.array(im)
        
        # Hard cut flash on frame 54
        flash = max(0.0, 1.0 - (sub_f / 3.5))
        arr = apply_flash(arr, flash)
        
        chroma = 15.0 * math.exp(-sub_f * 0.20)
        arr = apply_spectral_prism(arr, chroma)

    # ---------------------------------------------------------------------
    # SHOT 3: LUCIA PLUME SPLASH ART (Frames 108 .. 161 | 1.80s .. 2.70s, 54 frames)
    # Hard cut to Lucia, dramatic red panel background, camera push-in
    # ---------------------------------------------------------------------
    elif f < 162:
        sub_f = f - 108
        p = sub_f / 54.0
        # Dramatic push-in focused on Lucia's sharp red eyes
        z = 1.02 + 0.12 * (p ** 1.3)
        if 25 <= sub_f <= 31:
            z += 0.05 * (1.0 - abs(sub_f - 27) / 4.0)
            
        im = zoom_push(im_lucia, z, cx=540, cy=420)
        arr = np.array(im)
        
        # Hard cut flash on frame 108
        flash = max(0.0, 1.0 - (sub_f / 3.5))
        arr = apply_flash(arr, flash)
        
        chroma = 16.0 * math.exp(-sub_f * 0.20)
        arr = apply_spectral_prism(arr, chroma)

    # ---------------------------------------------------------------------
    # SHOT 4: THREE CARDS SHRINK, SLIDE & SWAP (Frames 162 .. 329 | 2.70s .. 5.50s)
    # Clean white background, whip-pan motion blur & zoom blur transitions
    # ---------------------------------------------------------------------
    elif f < 330:
        sub_f = f - 162
        
        # --- Phase 4A: Shrink into 3 Cards (Frames 162 .. 197 | 2.70s .. 3.30s, 36 frames) ---
        if sub_f < 36:
            p = sub_f / 36.0
            # Elastic overshoot spring: easeOutBack
            c1 = 1.70158
            c3 = c1 + 1.0
            ease = 1.0 + c3 * ((p - 1.0) ** 3) + c1 * ((p - 1.0) ** 2)
            
            # Start full screen (scale 3.2), shrink to scale 1.0
            g_scale = 3.2 - 2.2 * min(1.0, ease)
            # Cards move from center out to their slots
            x_v = int(X_MID + (X_LEFT - X_MID) * min(1.0, ease))
            x_luc = X_MID
            x_liv = int(X_MID + (X_RIGHT - X_MID) * min(1.0, ease))
            
            cards = [
                (vera_card_img, x_v, Y_BASE, 1.0),
                (lucia_card_img, x_luc, Y_BASE, 1.0),
                (liv_card_img, x_liv, Y_BASE, 1.0),
            ]
            im = render_cards_canvas(cards, global_scale=g_scale)
            arr = np.array(im)
            if sub_f < 3: arr = apply_flash(arr, 0.70)
            
        # --- Phase 4B: Tension Build-up (Frames 198 .. 231 | 3.30s .. 3.86s, 34 frames) ---
        elif sub_f < 70:
            b_f = sub_f - 36
            # Rhythmic micro-vibration before the bass drop
            jitter = int(math.sin(b_f * 1.4) * 3)
            cards = [
                (vera_card_img, X_LEFT + jitter, Y_BASE, 1.0),
                (lucia_card_img, X_MID - jitter, Y_BASE, 1.0),
                (liv_card_img, X_RIGHT + jitter, Y_BASE, 1.0),
            ]
            im = render_cards_canvas(cards)
            arr = np.array(im)
            
        # --- Phase 4C: 🔥 THE BASS DROP — SWAP 1: VERA POPS & SWAPS WITH LUCIA (Frames 232 .. 271, 40 frames) ---
        elif sub_f < 110:
            sw_f = sub_f - 70 # 0 .. 39
            p = sw_f / 40.0
            # Smoothstep velocity curve
            ease = p * p * (3.0 - 2.0 * p)
            
            # Vera pops forward (scale 1.35) with zoom blur and slides from X_LEFT to X_MID
            vera_x = int(X_LEFT + (X_MID - X_LEFT) * ease)
            vera_scale = 1.0 + 0.35 * math.sin(p * math.pi)
            
            # Lucia slides back and under to X_LEFT
            lucia_x = int(X_MID + (X_LEFT - X_MID) * ease)
            lucia_scale = 1.0 - 0.12 * math.sin(p * math.pi)
            
            cards = [
                (lucia_card_img, lucia_x, Y_BASE, lucia_scale),
                (liv_card_img, X_RIGHT, Y_BASE, 1.0),
                (vera_card_img, vera_x, Y_BASE, vera_scale),
            ]
            im = render_cards_canvas(cards)
            
            # Whip-pan motion blur during high velocity (sw_f = 6 .. 24)
            if 6 <= sw_f <= 24:
                vx = int(45 * math.sin(p * math.pi))
                im = apply_motion_blur_x(im, vx)
                
            # Zoom blur pop on the initial drop frames
            if sw_f < 5:
                im = apply_zoom_blur(im, 1.12)
                
            arr = np.array(im)
            # Bass drop flash & shake
            flash = max(0.0, 1.0 - (sw_f / 5.0))
            arr = apply_flash(arr, flash)
            shake = max(0, int(7 - sw_f * 0.4))
            arr = apply_camera_shake(arr, shake)
            chroma = 24.0 * math.exp(-sw_f * 0.15)
            arr = apply_spectral_prism(arr, chroma)

        # --- Phase 4D: SWAP 2: LIV POPS & COUNTER-SWAPS (Frames 272 .. 305, 34 frames) ---
        elif sub_f < 144:
            sw2_f = sub_f - 110 # 0 .. 33
            p = sw2_f / 34.0
            ease = p * p * (3.0 - 2.0 * p)
            
            # Liv pops forward and slides from X_RIGHT to X_LEFT
            liv_x = int(X_RIGHT + (X_LEFT - X_RIGHT) * ease)
            liv_scale = 1.0 + 0.32 * math.sin(p * math.pi)
            
            # Lucia slides from X_LEFT to X_MID
            lucia_x = int(X_LEFT + (X_MID - X_LEFT) * ease)
            
            # Vera slides from X_MID to X_RIGHT
            vera_x = int(X_MID + (X_RIGHT - X_MID) * ease)
            
            cards = [
                (lucia_card_img, lucia_x, Y_BASE, 0.95),
                (vera_card_img, vera_x, Y_BASE, 0.95),
                (liv_card_img, liv_x, Y_BASE, liv_scale),
            ]
            im = render_cards_canvas(cards)
            
            if 4 <= sw2_f <= 20:
                vx = int(-42 * math.sin(p * math.pi))
                im = apply_motion_blur_x(im, vx)
                
            if sw2_f < 4:
                im = apply_zoom_blur(im, 1.10)
                
            arr = np.array(im)
            flash = max(0.0, 1.0 - (sw2_f / 3.5))
            arr = apply_flash(arr, flash)
            chroma = 18.0 * math.exp(-sw2_f * 0.18)
            arr = apply_spectral_prism(arr, chroma)

        # --- Phase 4E: RAPID 16TH-NOTE STUTTER & WHIP-ZOOM LAUNCH (Frames 306 .. 329, 24 frames) ---
        else:
            st_f = sub_f - 144 # 0 .. 23
            # Explosive zoom into the cards launching towards camera
            z_launch = 1.0 + 1.8 * ((st_f / 24.0) ** 2.2)
            cards = [
                (liv_card_img, X_LEFT, Y_BASE, 1.0),
                (lucia_card_img, X_MID, Y_BASE, 1.0),
                (vera_card_img, X_RIGHT, Y_BASE, 1.0),
            ]
            im = render_cards_canvas(cards, global_scale=z_launch)
            # Heavy zoom blur on launch
            im = apply_zoom_blur(im, 1.0 + 0.25 * (st_f / 24.0))
            arr = np.array(im)
            if st_f % 6 < 2: arr = apply_flash(arr, 0.65)
            chroma = 22.0 * (st_f / 24.0)
            arr = apply_spectral_prism(arr, chroma)

    # ---------------------------------------------------------------------
    # SHOT 5: FINAL SHOT — ALL THREE CHARACTERS STANDING TOGETHER (Frames 330 .. 479 | 5.50s .. 8.00s, 150 frames = 2.50s)
    # Dynamic poses holding weapons (long red blade), red and white graphic background
    # ---------------------------------------------------------------------
    else:
        fn_f = f - 330 # 0 .. 149
        
        # --- Part 5A: Dynamic Action Blade Closeup (Frames 330 .. 389 | 5.50s .. 6.50s, 60 frames) ---
        if fn_f < 60:
            p = fn_f / 60.0
            # Speed ramp impact punch on downbeat (f=330)
            punch = 0.18 * math.exp(-fn_f * 0.12)
            # Kick punch at fn_f = 42 (6.20s kick)
            if 40 <= fn_f <= 48:
                punch += 0.08 * (1.0 - abs(fn_f - 44) / 4.0)
                
            z = 1.02 + 0.12 * p + punch
            im = zoom_push(im_final1, z, cx=540, cy=520)
            arr = np.array(im)
            
            # Massive downbeat flash
            flash = max(0.0, 1.0 - (fn_f / 5.0))
            if 42 <= fn_f <= 45:
                flash = max(flash, 0.70 * (1.0 - (fn_f - 42) / 3.0))
            arr = apply_flash(arr, flash)
            
            shake = max(0, int(8 - fn_f * 0.4))
            arr = apply_camera_shake(arr, shake)
            
            chroma = 26.0 * math.exp(-fn_f * 0.12)
            arr = apply_spectral_prism(arr, chroma)
            
        # --- Part 5B: Epic Full-Body Trio Reveal (Frames 390 .. 479 | 6.50s .. 8.00s, 90 frames = 1.50s) ---
        else:
            fb_f = fn_f - 60 # 0 .. 89
            p = fb_f / 90.0
            # Kick hit at fb_f = 34 (7.06s kick)
            pulse = 0.0
            if 32 <= fb_f <= 38:
                pulse = 0.06 * (1.0 - abs(fb_f - 35) / 3.0)
                
            # Smooth cinematic hold with slow majestic float
            z = 1.04 - 0.04 * p + pulse
            im = zoom_push(im_final2, z, cx=540, cy=540)
            arr = np.array(im)
            
            # Cut transition flash
            flash = max(0.0, 1.0 - (fb_f / 4.0))
            if 34 <= fb_f <= 37:
                flash = max(flash, 0.60 * (1.0 - (fb_f - 34) / 3.0))
            arr = apply_flash(arr, flash)
            
            chroma = 16.0 * math.exp(-fb_f * 0.16)
            arr = apply_spectral_prism(arr, chroma)
            
            # Clean fadeout on the last 15 frames (7.75s .. 8.00s)
            if fb_f >= 75:
                fade = max(0.0, 1.0 - (fb_f - 75) / 14.0)
                arr = (arr.astype(np.float32) * fade).astype(np.uint8)

    # Write raw frame bytes to FFmpeg
    pipe.stdin.write(arr.tobytes())

    if (f + 1) % 60 == 0 or f == TOTAL_FRAMES - 1:
        print(f"  Frame {f+1}/{TOTAL_FRAMES} rendered ({((f+1)/TOTAL_FRAMES)*100:.1f}%)")

pipe.stdin.close()
pipe.wait()
t_render = time.time()
print(f"Video track rendered in {t_render - t_start:.2f}s!")

# Mux with trimmed 8s audio
print("Muxing video with 8.0s beat-synced audio...")
mux_cmd = [
    "ffmpeg", "-y",
    "-i", TEMP_RAW_MP4,
    "-i", AUDIO_PATH,
    "-c:v", "copy",
    "-c:a", "aac",
    "-b:a", "256k",
    "-shortest",
    OUTPUT_MP4
]
res = subprocess.run(mux_cmd, capture_output=True, text=True)
if res.returncode != 0:
    print("Mux error:", res.stderr)
    sys.exit(1)

# Copy to downloads
import shutil
shutil.copyfile(OUTPUT_MP4, DOWNLOAD_MP4)
# Also copy to trending_character_edit.mp4 so Kōri previews it
shutil.copyfile(OUTPUT_MP4, "D:/motionforge/public/assets/trending_character_edit.mp4")
shutil.copyfile(OUTPUT_MP4, "D:/загрузки/trending_character_edit.mp4")

print(f"Master gacha edit saved to {OUTPUT_MP4} and copied to {DOWNLOAD_MP4}!")

t_end = time.time()
print(f"TOTAL BUILD TIME: {t_end - t_start:.2f}s!")
print("==================================================================")
