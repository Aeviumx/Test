import os
import sys
import time
import math
import subprocess
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageEnhance

print("Starting Master Edit Renderer for Genshin Impact Phonk Velocity Edit...")
t_start = time.time()

# Target parameters
WIDTH = 1080
HEIGHT = 1080
FPS = 60
TOTAL_FRAMES = 811 # ~13.514 seconds @ 60 FPS

# Paths
AUDIO_PATH = "D:/motionforge/public/assets/trending_audio.aac"
OUTPUT_MP4 = "D:/motionforge/public/assets/trending_character_edit.mp4"
TEMP_RAW_MP4 = "D:/motionforge/public/assets/edit_segments/raw_video.mp4"

# Assets
STAGE_PATH = "D:/motionforge/public/assets/genshin_stage.png"
CARD1_PATH = "D:/motionforge/public/assets/genshin_chars/card1_hutao.png"
CARD2_PATH = "D:/motionforge/public/assets/genshin_chars/card2_navia.png"
CARD3_PATH = "D:/motionforge/public/assets/genshin_chars/card3_furina.png"
PIP_BLUE_PATH = "D:/motionforge/public/assets/pip_bg_blue.png"
PIP_RED_PATH = "D:/motionforge/public/assets/pip_bg_red.png"
PIP_MASK_PATH = "D:/motionforge/public/assets/pip_mask.png"
OUTRO_FLARE_PATH = "D:/motionforge/public/assets/outro_flare.png"

FURINA_FRAMES_DIR = "D:/motionforge/public/assets/raw_frames_furina"
HUTAO_FRAMES_DIR = "D:/motionforge/public/assets/raw_frames_hutao"

# Load static images
img_card1 = Image.open(CARD1_PATH).convert("RGB")
img_card2 = Image.open(CARD2_PATH).convert("RGB")
img_card3 = Image.open(CARD3_PATH).convert("RGB")
img_stage = Image.open(STAGE_PATH).convert("RGB") # 2560 x 1080
img_pip_blue = Image.open(PIP_BLUE_PATH).convert("RGB")
img_pip_red = Image.open(PIP_RED_PATH).convert("RGB")
img_pip_mask = Image.open(PIP_MASK_PATH).convert("L")
img_outro_flare = Image.open(OUTRO_FLARE_PATH).convert("RGB")

def get_furina_frame(idx):
    clamped = max(1, min(720, idx))
    p = f"{FURINA_FRAMES_DIR}/frame_{clamped:04d}.jpg"
    return Image.open(p).convert("RGB")

def get_hutao_frame(idx):
    clamped = max(1, min(720, idx))
    p = f"{HUTAO_FRAMES_DIR}/frame_{clamped:04d}.jpg"
    return Image.open(p).convert("RGB")

def apply_chromatic_aberration(arr, shift):
    if shift <= 0:
        return arr
    res = arr.copy()
    s = int(shift)
    # Red channel right shift
    res[:, s:, 0] = arr[:, :-s, 0]
    # Blue channel left shift
    res[:, :-s, 2] = arr[:, s:, 2]
    return res

def apply_flash(arr, alpha):
    if alpha <= 0:
        return arr
    alpha = min(1.0, max(0.0, alpha))
    return (arr.astype(np.float32) * (1.0 - alpha) + 255.0 * alpha).astype(np.uint8)

def zoom_crop(im, zoom, cx=540, cy=540):
    if zoom <= 1.001:
        return im
    w = 1080 / zoom
    h = 1080 / zoom
    left = max(0, min(1080 - w, cx - w / 2))
    top = max(0, min(1080 - h, cy - h / 2))
    cropped = im.crop((left, top, left + w, top + h))
    return cropped.resize((1080, 1080), Image.Resampling.LANCZOS)

def create_pip_frame(dance_im, bg_im, zoom=1.0):
    # dance_im scaled to 760x760 with subtle zoom
    w = 760 / zoom
    h = 760 / zoom
    cx, cy = 540, 540
    crop_box = (cx - w/2, cy - h/2, cx + w/2, cy + h/2)
    inner = dance_im.crop(crop_box).resize((760, 760), Image.Resampling.LANCZOS)
    
    # Composite into bg
    res = bg_im.copy()
    # Mask rounded corners
    res.paste(inner, (160, 160), img_pip_mask)
    return res

# Start FFmpeg process for video pipe
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
    "-crf", "16",
    "-pix_fmt", "yuv420p",
    TEMP_RAW_MP4
]

pipe = subprocess.Popen(ffmpeg_cmd, stdin=subprocess.PIPE, stderr=subprocess.DEVNULL)

print("Rendering frames to FFmpeg pipe...")

for f in range(TOTAL_FRAMES):
    # -------------------------------------------------------------------------
    # SCENE 1: TEASER INTRO CARDS (Frames 0 .. 89 | 0.00s .. 1.50s)
    # -------------------------------------------------------------------------
    if f < 30: # Hu Tao (0.00s - 0.50s)
        p = f / 30.0
        z = 1.0 + 0.10 * p
        im = zoom_crop(img_card1, z)
        arr = np.array(im)
        flash = max(0.0, 1.0 - (f / 4.0)) # 4-frame flash
        arr = apply_flash(arr, flash)
        
    elif f < 60: # Navia (0.50s - 1.00s)
        sub_f = f - 30
        p = sub_f / 30.0
        z = 1.0 + 0.10 * p
        im = zoom_crop(img_card2, z)
        arr = np.array(im)
        flash = max(0.0, 1.0 - (sub_f / 4.0))
        arr = apply_flash(arr, flash)
        
    elif f < 90: # Furina (1.00s - 1.50s)
        sub_f = f - 60
        p = sub_f / 30.0
        z = 1.0 + 0.12 * p
        im = zoom_crop(img_card3, z)
        arr = np.array(im)
        flash = max(0.0, 1.0 - (sub_f / 4.0))
        arr = apply_flash(arr, flash)

    # -------------------------------------------------------------------------
    # SCENE 2: MINIMALIST STUDIO GALLERY PAN (Frames 90 .. 149 | 1.50s .. 2.50s)
    # -------------------------------------------------------------------------
    elif f < 150:
        sub_f = f - 90
        p = sub_f / 60.0
        # Smoothstep easing: 3p^2 - 2p^3
        ease = p * p * (3.0 - 2.0 * p)
        # Pan camera across stage from x=200 to x=1480
        cam_x = int(200 + ease * (1480 - 200))
        im = img_stage.crop((cam_x, 0, cam_x + 1080, 1080))
        arr = np.array(im)

    # -------------------------------------------------------------------------
    # SCENE 3: SELECTION DOLLY ZOOM (Frames 150 .. 205 | 2.50s .. 3.433s)
    # -------------------------------------------------------------------------
    elif f < 206:
        sub_f = f - 150
        p = sub_f / 56.0
        # Dramatic acceleration zoom into Furina's picture (center at 580, 360 in crop)
        # Ease in power
        z = 1.0 + 1.4 * (p ** 1.6)
        base_crop = img_stage.crop((1480, 0, 1480 + 1080, 1080))
        im = zoom_crop(base_crop, z, cx=580, cy=360)
        arr = np.array(im)

    # -------------------------------------------------------------------------
    # SCENE 4: 360° WHIP ROTATION SPIN (Frames 206 .. 231 | 3.433s .. 3.860s)
    # -------------------------------------------------------------------------
    elif f < 232:
        sub_f = f - 206
        p = sub_f / 26.0
        # Spin accelerating: angle 0 to 360
        angle = 360.0 * (p ** 2.2)
        z = 2.4 + 1.2 * p
        # Zoom + rotate Furina portrait
        im = zoom_crop(img_card3, z)
        rotated = im.rotate(angle, resample=Image.Resampling.BICUBIC)
        # Add radial motion blur blend
        rot_blur = im.rotate(angle - 12.0 * p, resample=Image.Resampling.BICUBIC)
        im = Image.blend(rotated, rot_blur, 0.45)
        arr = np.array(im)

    # -------------------------------------------------------------------------
    # SCENE 5: THE BASS DROP (Frames 232 .. 751 | 3.860s .. 12.520s)
    # -------------------------------------------------------------------------
    # Cut 1: Furina Drop Impact (pointing finger to beat)
    elif f < 273: # 41 frames (3.86s - 4.54s)
        sub_f = f - 232
        src_idx = int(48 + sub_f * 1.1)
        im = get_furina_frame(src_idx)
        # Downbeat punch-in zoom
        z = 1.22 - 0.20 * (sub_f / 41.0)
        im = zoom_crop(im, z)
        arr = np.array(im)
        # Chromatic aberration decay
        chroma = max(0, int(18 - sub_f * 1.8))
        arr = apply_chromatic_aberration(arr, chroma)
        # Flash impact
        flash = max(0.0, 1.0 - (sub_f / 5.0))
        arr = apply_flash(arr, flash)

    # Cut 2: Hu Tao Counter-Cut (ghost paw hip shake)
    elif f < 317: # 44 frames (4.54s - 5.28s)
        sub_f = f - 273
        src_idx = int(130 + sub_f * 1.0)
        im = get_hutao_frame(src_idx)
        # Rhythmic snare pulses at f=287 (14) and f=301 (28)
        pulse = 0.0
        if 12 <= sub_f <= 18:
            pulse = 0.08 * (1.0 - abs(sub_f - 15) / 3.0)
        elif 26 <= sub_f <= 32:
            pulse = 0.08 * (1.0 - abs(sub_f - 29) / 3.0)
        im = zoom_crop(im, 1.05 + pulse)
        arr = np.array(im)
        flash = max(0.0, 1.0 - (sub_f / 3.0))
        arr = apply_flash(arr, flash)

    # Cut 3: Framed PIP Card - Furina Hydro Dance
    elif f < 372: # 55 frames (5.28s - 6.20s)
        sub_f = f - 317
        src_idx = int(180 + sub_f * 0.95)
        dance_im = get_furina_frame(src_idx)
        # Subtle gentle bounce
        pip_zoom = 1.02 + 0.04 * math.sin(sub_f * 0.3)
        im = create_pip_frame(dance_im, img_pip_blue, zoom=pip_zoom)
        arr = np.array(im)
        flash = max(0.0, 1.0 - (sub_f / 3.0))
        arr = apply_flash(arr, flash)

    # Cut 4: Hu Tao Velocity Snap Closeup (head tilt + smile)
    elif f < 424: # 52 frames (6.20s - 7.06s)
        sub_f = f - 372
        src_idx = int(225 + sub_f * 1.0)
        im = get_hutao_frame(src_idx)
        # Velocity ease
        z = 1.15 - 0.10 * (sub_f / 52.0)
        im = zoom_crop(im, z)
        arr = np.array(im)
        chroma = max(0, int(12 - sub_f * 1.5))
        arr = apply_chromatic_aberration(arr, chroma)
        flash = max(0.0, 1.0 - (sub_f / 4.0))
        arr = apply_flash(arr, flash)

    # Cut 5: Furina Forehead Salute Wink
    elif f < 472: # 48 frames (7.06s - 7.86s)
        sub_f = f - 424
        src_idx = int(270 + sub_f * 1.0)
        im = get_furina_frame(src_idx)
        z = 1.0 + 0.08 * (sub_f / 48.0)
        im = zoom_crop(im, z)
        arr = np.array(im)
        flash = max(0.0, 1.0 - (sub_f / 3.0))
        arr = apply_flash(arr, flash)

    # Cut 6: Hu Tao Peace Sign Wink
    elif f < 524: # 52 frames (7.86s - 8.72s)
        sub_f = f - 472
        src_idx = int(455 + sub_f * 1.0)
        im = get_hutao_frame(src_idx)
        # Snare pulse at sub_f = 14
        pulse = 0.06 * max(0.0, 1.0 - abs(sub_f - 14) / 4.0)
        im = zoom_crop(im, 1.06 + pulse)
        arr = np.array(im)
        flash = max(0.0, 1.0 - (sub_f / 3.0))
        arr = apply_flash(arr, flash)

    # Cut 7: Framed PIP Card - Hu Tao Crimson Dance
    elif f < 585: # 61 frames (8.72s - 9.74s)
        sub_f = f - 524
        src_idx = int(300 + sub_f * 1.0)
        dance_im = get_hutao_frame(src_idx)
        pip_zoom = 1.02 + 0.05 * math.sin(sub_f * 0.28)
        im = create_pip_frame(dance_im, img_pip_red, zoom=pip_zoom)
        arr = np.array(im)
        flash = max(0.0, 1.0 - (sub_f / 3.0))
        arr = apply_flash(arr, flash)

    # Cut 8: Furina Double Peace Smile
    elif f < 646: # 61 frames (9.74s - 10.76s)
        sub_f = f - 585
        src_idx = int(495 + sub_f * 0.9)
        im = get_furina_frame(src_idx)
        z = 1.12 - 0.08 * (sub_f / 61.0)
        im = zoom_crop(im, z)
        arr = np.array(im)
        chroma = max(0, int(10 - sub_f * 1.2))
        arr = apply_chromatic_aberration(arr, chroma)
        flash = max(0.0, 1.0 - (sub_f / 3.0))
        arr = apply_flash(arr, flash)

    # Cut 9: Rapid Syncopated Stutter Cuts (10.76s - 11.50s)
    elif f < 690: # 44 frames
        sub_f = f - 646
        if sub_f < 14: # Furina pointing
            im = get_furina_frame(60 + sub_f)
            im = zoom_crop(im, 1.10)
            arr = np.array(im)
            if sub_f < 2: arr = apply_flash(arr, 0.8)
        elif sub_f < 28: # Hu Tao pointing
            h_f = sub_f - 14
            im = get_hutao_frame(60 + h_f)
            im = zoom_crop(im, 1.10)
            arr = np.array(im)
            if h_f < 2: arr = apply_flash(arr, 0.8)
        else: # Furina double wink
            f_f = sub_f - 28
            im = get_furina_frame(520 + f_f)
            im = zoom_crop(im, 1.12)
            arr = np.array(im)
            if f_f < 2: arr = apply_flash(arr, 0.8)

    # Cut 10: The Grand Climax Pose (11.50s - 12.52s)
    elif f < 752: # 62 frames
        sub_f = f - 690
        src_idx = int(390 + sub_f * 1.0)
        im = get_furina_frame(src_idx)
        # Climax punch + rhythmic bass bounce
        bounce = 0.04 * math.sin(sub_f * 0.4)
        im = zoom_crop(im, 1.08 + bounce)
        arr = np.array(im)
        # Heavy RGB split spike on climax drop
        chroma = max(0, int(20 - sub_f * 1.4))
        arr = apply_chromatic_aberration(arr, chroma)
        flash = max(0.0, 1.0 - (sub_f / 5.0))
        arr = apply_flash(arr, flash)

    # -------------------------------------------------------------------------
    # SCENE 6: OUTRO ANAMORPHIC FLARE STAR (Frames 752 .. 810 | 12.52s .. 13.514s)
    # -------------------------------------------------------------------------
    else:
        sub_f = f - 752
        # Black background
        black = np.zeros((1080, 1080, 3), dtype=np.uint8)
        if sub_f < 3: # Final white flash impact
            arr = np.full((1080, 1080, 3), 255, dtype=np.uint8)
        else:
            flare_f = sub_f - 3
            # Flare opacity: fade in fast, hold/pulse, fade to black
            if flare_f < 8:
                opacity = flare_f / 8.0
            elif flare_f < 35:
                opacity = 1.0 - 0.15 * math.sin(flare_f * 0.2)
            else:
                opacity = max(0.0, 1.0 - (flare_f - 35) / 20.0)
            
            flare_arr = np.array(img_outro_flare).astype(np.float32)
            arr = (flare_arr * opacity).astype(np.uint8)

    # Write raw frame bytes to FFmpeg
    pipe.stdin.write(arr.tobytes())

    if (f + 1) % 100 == 0 or f == TOTAL_FRAMES - 1:
        print(f"  Frame {f+1}/{TOTAL_FRAMES} rendered ({((f+1)/TOTAL_FRAMES)*100:.1f}%)")

pipe.stdin.close()
pipe.wait()
t_render = time.time()
print(f"Video track rendered in {t_render - t_start:.2f}s!")

# Now mux with audio
print("Muxing video with original trending audio...")
mux_cmd = [
    "ffmpeg", "-y",
    "-i", TEMP_RAW_MP4,
    "-i", AUDIO_PATH,
    "-c:v", "copy",
    "-c:a", "aac",
    "-b:a", "320k",
    "-shortest",
    OUTPUT_MP4
]
res = subprocess.run(mux_cmd, capture_output=True, text=True)
if res.returncode != 0:
    print("Mux error:", res.stderr)
    sys.exit(1)

# Also copy to downloads folder
dl_path = "D:/загрузки/trending_character_edit.mp4"
import shutil
shutil.copyfile(OUTPUT_MP4, dl_path)
print(f"Master output saved to {OUTPUT_MP4} and copied to {dl_path}!")

t_end = time.time()
print(f"TOTAL BUILD TIME: {t_end - t_start:.2f}s!")
