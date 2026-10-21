import os
import sys
import time
import math
import subprocess
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageEnhance

print("==================================================================")
print("  MASTER VELOCITY COMPOSITOR: THE EMINENCE IN SHADOW (1080x1080@60)")
print("  Featuring: Delta (Delta-chan!), Alpha & Aurora")
print("==================================================================")
t_start = time.time()

# Target parameters
WIDTH = 1080
HEIGHT = 1080
FPS = 60
TOTAL_FRAMES = 811 # 13.514 seconds @ 60 FPS

# Paths
AUDIO_PATH = "D:/motionforge/public/assets/trending_audio.aac"
OUTPUT_MP4 = "D:/motionforge/public/assets/trending_character_edit.mp4"
TEMP_RAW_MP4 = "D:/motionforge/public/assets/edit_segments/raw_shadow_video.mp4"
DOWNLOAD_MP4 = "D:/загрузки/trending_character_edit.mp4"

# Assets
STAGE_PATH = "D:/motionforge/public/assets/shadow_stage.png"
CARD_ALPHA_PATH = "D:/motionforge/public/assets/shadow_chars/card_alpha.png"
CARD_AURORA_PATH = "D:/motionforge/public/assets/shadow_chars/card_aurora.png"
CARD_DELTA_PATH = "D:/motionforge/public/assets/shadow_chars/card_delta.png"
PIP_DELTA_PATH = "D:/motionforge/public/assets/pip_bg_delta.png"
PIP_ALPHA_PATH = "D:/motionforge/public/assets/pip_bg_alpha.png"
PIP_MASK_PATH = "D:/motionforge/public/assets/pip_mask.png"
OUTRO_FLARE_PATH = "D:/motionforge/public/assets/shadow_outro_flare.png"

DELTA_ACTION_DIR = "D:/motionforge/public/assets/shadow_frames/delta_action"
DELTA_CUTE_DIR = "D:/motionforge/public/assets/shadow_frames/delta_cute"
ALPHA_DIR = "D:/motionforge/public/assets/shadow_frames/alpha_scenes"
ALPHA_GOLD_DIR = "D:/motionforge/public/assets/shadow_frames/alpha_gold"
AURORA_DIR = "D:/motionforge/public/assets/shadow_frames/aurora_scenes"

# Load static images
img_card_alpha = Image.open(CARD_ALPHA_PATH).convert("RGB")
img_card_aurora = Image.open(CARD_AURORA_PATH).convert("RGB")
img_card_delta = Image.open(CARD_DELTA_PATH).convert("RGB")
img_stage = Image.open(STAGE_PATH).convert("RGB") # 2560 x 1080
img_pip_delta = Image.open(PIP_DELTA_PATH).convert("RGB")
img_pip_alpha = Image.open(PIP_ALPHA_PATH).convert("RGB")
img_pip_mask = Image.open(PIP_MASK_PATH).convert("L")
img_outro_flare = Image.open(OUTRO_FLARE_PATH).convert("RGB")

# Frame caching dictionary for high throughput
frame_cache = {}

def get_frame(folder, idx, total_count=300):
    clamped = max(1, min(total_count, idx))
    cache_key = f"{folder}_{clamped}"
    if cache_key in frame_cache:
        return frame_cache[cache_key]
    p = f"{folder}/frame_{clamped:04d}.jpg"
    im = Image.open(p).convert("RGB")
    frame_cache[cache_key] = im
    return im

def get_delta_action(idx):
    return get_frame(DELTA_ACTION_DIR, idx, 360)

def get_delta_cute(idx):
    return get_frame(DELTA_CUTE_DIR, idx, 360)

def get_alpha(idx):
    return get_frame(ALPHA_DIR, idx, 300)

def get_alpha_gold(idx):
    return get_frame(ALPHA_GOLD_DIR, idx, 150)

def get_aurora(idx):
    return get_frame(AURORA_DIR, idx, 300)

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
    if alpha <= 0.001:
        return arr
    alpha = min(1.0, max(0.0, alpha))
    return (arr.astype(np.float32) * (1.0 - alpha) + 255.0 * alpha).astype(np.uint8)

def apply_camera_shake(arr, magnitude):
    if magnitude <= 0.5:
        return arr
    dx = int(np.random.uniform(-magnitude, magnitude))
    dy = int(np.random.uniform(-magnitude, magnitude))
    return np.roll(np.roll(arr, dx, axis=1), dy, axis=0)

def zoom_crop(im, zoom, cx=540, cy=540):
    if zoom <= 1.001:
        return im
    w = 1080 / zoom
    h = 1080 / zoom
    left = max(0, min(1080 - w, cx - w / 2))
    top = max(0, min(1080 - h, cy - h / 2))
    cropped = im.crop((left, top, left + w, top + h))
    return cropped.resize((1080, 1080), Image.Resampling.LANCZOS)

def create_pip_frame(inner_im, bg_im, mask_im, zoom=1.0):
    w = 760 / zoom
    h = 760 / zoom
    cx, cy = 540, 540
    crop_box = (cx - w/2, cy - h/2, cx + w/2, cy + h/2)
    inner = inner_im.crop(crop_box).resize((760, 760), Image.Resampling.LANCZOS)
    
    res = bg_im.copy()
    res.paste(inner, (160, 160), mask_im)
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
print("Rendering frames to FFmpeg rawvideo pipe...")

for f in range(TOTAL_FRAMES):
    # -------------------------------------------------------------------------
    # SCENE 1: TEASER INTRO CARDS (Frames 0 .. 89 | 0.00s .. 1.50s)
    # -------------------------------------------------------------------------
    if f < 30: # Alpha Teaser (0.00s - 0.50s)
        p = f / 30.0
        z = 1.0 + 0.10 * p
        im = zoom_crop(img_card_alpha, z)
        arr = np.array(im)
        flash = max(0.0, 1.0 - (f / 4.0)) # 4-frame flash
        arr = apply_flash(arr, flash)
        
    elif f < 60: # Aurora Teaser (0.50s - 1.00s)
        sub_f = f - 30
        p = sub_f / 30.0
        z = 1.0 + 0.10 * p
        im = zoom_crop(img_card_aurora, z)
        arr = np.array(im)
        flash = max(0.0, 1.0 - (sub_f / 4.0))
        arr = apply_flash(arr, flash)
        
    elif f < 90: # Delta Teaser (1.00s - 1.50s)
        sub_f = f - 60
        p = sub_f / 30.0
        z = 1.0 + 0.12 * p
        im = zoom_crop(img_card_delta, z)
        arr = np.array(im)
        flash = max(0.0, 1.0 - (sub_f / 4.0))
        arr = apply_flash(arr, flash)

    # -------------------------------------------------------------------------
    # SCENE 2: SANCTUARY GALLERY PAN (Frames 90 .. 149 | 1.50s .. 2.50s)
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
    # SCENE 3: SELECTION DOLLY ZOOM INTO DELTA (Frames 150 .. 205 | 2.50s .. 3.44s)
    # -------------------------------------------------------------------------
    elif f < 206:
        sub_f = f - 150
        p = sub_f / 56.0
        # Accelerating power zoom into Delta's picture (center at 537, 314 in crop)
        z = 1.0 + 1.45 * (p ** 1.6)
        base_crop = img_stage.crop((1480, 0, 1480 + 1080, 1080))
        im = zoom_crop(base_crop, z, cx=537, cy=314)
        arr = np.array(im)

    # -------------------------------------------------------------------------
    # SCENE 4: 360° WHIP ROTATION SPIN INTO PUPIL (Frames 206 .. 231 | 3.44s .. 3.86s)
    # -------------------------------------------------------------------------
    elif f < 232:
        sub_f = f - 206
        p = sub_f / 26.0
        # Spin accelerating: angle 0 to 360
        angle = 360.0 * (p ** 2.2)
        z = 2.4 + 1.3 * p
        # Oversized crop to ensure zero empty corners during rotation
        w = int(1080 / z * 1.44)
        h = int(1080 / z * 1.44)
        cx, cy = 540, 440
        crop_box = (max(0, cx - w//2), max(0, cy - h//2), min(1080, cx + w//2), min(1080, cy + h//2))
        large_crop = img_card_delta.crop(crop_box).resize((1556, 1556), Image.Resampling.LANCZOS)
        rotated = large_crop.rotate(angle, resample=Image.Resampling.BICUBIC)
        rot_blur = large_crop.rotate(angle - 12.0 * p, resample=Image.Resampling.BICUBIC)
        blended = Image.blend(rotated, rot_blur, 0.45)
        # Center-crop back to 1080x1080
        im = blended.crop((238, 238, 238 + 1080, 238 + 1080))
        arr = np.array(im)

    # -------------------------------------------------------------------------
    # SCENE 5: THE BASS DROP (Frames 232 .. 751 | 3.86s .. 12.52s)
    # -------------------------------------------------------------------------
    # Cut 1: Delta Beast Drop Impact (Frames 232 .. 272 | 3.86s - 4.54s, 41 frames)
    elif f < 273:
        sub_f = f - 232
        src_idx = int(112 + sub_f * 0.95)
        im = get_delta_action(src_idx)
        # Downbeat punch-in zoom
        z = 1.25 - 0.22 * (sub_f / 41.0)
        im = zoom_crop(im, z)
        arr = np.array(im)
        # Heavy Chromatic aberration decay
        chroma = max(0, int(20 - sub_f * 2.0))
        arr = apply_chromatic_aberration(arr, chroma)
        # White flash impact
        flash = max(0.0, 1.0 - (sub_f / 5.0))
        arr = apply_flash(arr, flash)

    # Cut 2: Delta Excited Wolf Ears Pounce & Paw Dance (Frames 273 .. 316 | 4.54s - 5.28s, 44 frames)
    elif f < 317:
        sub_f = f - 273
        src_idx = int(295 + sub_f * 1.0)
        im = get_delta_cute(src_idx)
        # Rhythmic snare pulses at f=287 (sub_f=14) and f=301 (sub_f=28)
        pulse = 0.0
        if 12 <= sub_f <= 18:
            pulse = 0.08 * (1.0 - abs(sub_f - 15) / 3.0)
        elif 26 <= sub_f <= 32:
            pulse = 0.08 * (1.0 - abs(sub_f - 29) / 3.0)
        im = zoom_crop(im, 1.05 + pulse)
        arr = np.array(im)
        flash = max(0.0, 1.0 - (sub_f / 3.0))
        arr = apply_flash(arr, flash)

    # Cut 3: Framed PIP Card - Delta Cute Headpats / Huge Purple Eyes (Frames 317 .. 371 | 5.28s - 6.20s, 55 frames)
    elif f < 372:
        sub_f = f - 317
        src_idx = int(10 + sub_f * 0.9)
        dance_im = get_delta_cute(src_idx)
        # Gentle rhythmic bounce
        pip_zoom = 1.02 + 0.04 * math.sin(sub_f * 0.3)
        im = create_pip_frame(dance_im, img_pip_delta, img_pip_mask, zoom=pip_zoom)
        arr = np.array(im)
        flash = max(0.0, 1.0 - (sub_f / 3.0))
        arr = apply_flash(arr, flash)

    # Cut 4: Alpha Warm Golden Elegance Closeup (Frames 372 .. 423 | 6.20s - 7.06s, 52 frames)
    elif f < 424:
        sub_f = f - 372
        src_idx = int(20 + sub_f * 1.0)
        im = get_alpha(src_idx)
        z = 1.22 - 0.08 * (sub_f / 52.0)
        # Centered properly on Alpha's cute face
        im = zoom_crop(im, z, cx=740, cy=450)
        arr = np.array(im)
        chroma = max(0, int(12 - sub_f * 1.5))
        arr = apply_chromatic_aberration(arr, chroma)
        flash = max(0.0, 1.0 - (sub_f / 4.0))
        arr = apply_flash(arr, flash)

    # Cut 5: Aurora Charming Seductive Smile Closeup (Frames 424 .. 471 | 7.06s - 7.86s, 48 frames)
    elif f < 472:
        sub_f = f - 424
        src_idx = int(15 + sub_f * 1.0)
        im = get_aurora(src_idx)
        z = 1.02 + 0.08 * (sub_f / 48.0)
        im = zoom_crop(im, z)
        arr = np.array(im)
        flash = max(0.0, 1.0 - (sub_f / 3.0))
        arr = apply_flash(arr, flash)

    # Cut 6: Delta Predatory Fangs Grin & Glowing Beast Eyes (Frames 472 .. 523 | 7.86s - 8.72s, 52 frames)
    elif f < 524:
        sub_f = f - 472
        src_idx = int(245 + sub_f * 1.0)
        im = get_delta_action(src_idx)
        # Snare pulse at sub_f = 14
        pulse = 0.06 * max(0.0, 1.0 - abs(sub_f - 14) / 4.0)
        im = zoom_crop(im, 1.08 + pulse)
        arr = np.array(im)
        chroma = max(0, int(14 - sub_f * 1.6))
        arr = apply_chromatic_aberration(arr, chroma)
        flash = max(0.0, 1.0 - (sub_f / 3.0))
        arr = apply_flash(arr, flash)

    # Cut 7: Framed PIP Card - Alpha Grace & Charm in Amber (Frames 524 .. 584 | 8.72s - 9.74s, 61 frames)
    elif f < 585:
        sub_f = f - 524
        src_idx = int(20 + sub_f * 0.95)
        dance_im = get_alpha_gold(src_idx)
        pip_zoom = 1.02 + 0.05 * math.sin(sub_f * 0.28)
        im = create_pip_frame(dance_im, img_pip_alpha, img_pip_mask, zoom=pip_zoom)
        arr = np.array(im)
        flash = max(0.0, 1.0 - (sub_f / 3.0))
        arr = apply_flash(arr, flash)

    # Cut 8: Delta Pure Joy Scream / Flapping Wolf Ears (Frames 585 .. 645 | 9.74s - 10.76s, 61 frames)
    elif f < 646:
        sub_f = f - 585
        src_idx = int(105 + sub_f * 0.95)
        im = get_delta_cute(src_idx)
        z = 1.15 - 0.10 * (sub_f / 61.0)
        im = zoom_crop(im, z)
        arr = np.array(im)
        chroma = max(0, int(12 - sub_f * 1.3))
        arr = apply_chromatic_aberration(arr, chroma)
        flash = max(0.0, 1.0 - (sub_f / 3.0))
        arr = apply_flash(arr, flash)

    # Cut 9: Rapid 16th-Note Stutter Beat Cuts (Alpha -> Aurora -> Delta) (Frames 646 .. 689 | 10.76s - 11.50s, 44 frames)
    elif f < 690:
        sub_f = f - 646
        if sub_f < 14: # Alpha quick glance
            im = get_alpha(35 + sub_f)
            im = zoom_crop(im, 1.18, cx=740, cy=450)
            arr = np.array(im)
            if sub_f < 2: arr = apply_flash(arr, 0.85)
        elif sub_f < 28: # Aurora smirk
            a_f = sub_f - 14
            im = get_aurora(90 + a_f)
            im = zoom_crop(im, 1.10)
            arr = np.array(im)
            if a_f < 2: arr = apply_flash(arr, 0.85)
        else: # Delta glowing beast eyes lock
            d_f = sub_f - 28
            im = get_delta_cute(22 + d_f)
            im = zoom_crop(im, 1.14)
            arr = np.array(im)
            chroma = max(0, int(10 - d_f * 1.2))
            arr = apply_chromatic_aberration(arr, chroma)
            if d_f < 2: arr = apply_flash(arr, 0.90)

    # Cut 10: The Grand Climax: Delta Berserk Power Strike (Frames 690 .. 751 | 11.50s - 12.52s, 62 frames)
    elif f < 752:
        sub_f = f - 690
        src_idx = int(135 + sub_f * 0.98)
        im = get_delta_action(src_idx)
        # Climax punch + rhythmic bass bounce
        bounce = 0.05 * math.sin(sub_f * 0.42)
        im = zoom_crop(im, 1.10 + bounce)
        arr = np.array(im)
        # Heavy RGB split spike on climax drop
        chroma = max(0, int(22 - sub_f * 1.5))
        arr = apply_chromatic_aberration(arr, chroma)
        # Camera shake on initial hit
        shake = max(0, int(6 - sub_f * 0.4))
        arr = apply_camera_shake(arr, shake)
        flash = max(0.0, 1.0 - (sub_f / 5.0))
        arr = apply_flash(arr, flash)

    # -------------------------------------------------------------------------
    # SCENE 6: OUTRO ANAMORPHIC FLARE STAR (Frames 752 .. 810 | 12.52s .. 13.514s)
    # -------------------------------------------------------------------------
    else:
        sub_f = f - 752
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
import shutil
shutil.copyfile(OUTPUT_MP4, DOWNLOAD_MP4)
print(f"Master output saved to {OUTPUT_MP4} and copied to {DOWNLOAD_MP4}!")

t_end = time.time()
print(f"TOTAL BUILD TIME: {t_end - t_start:.2f}s!")
print("==================================================================")
