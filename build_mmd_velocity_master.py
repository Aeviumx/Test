import os
import sys
import time
import math
import subprocess
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageEnhance

print("==================================================================")
print("  MASTER 3D MMD VELOCITY COMPOSITOR: HU TAO & HATSUNE MIKU")
print("  1080x1080 @ 60 FPS — Viral Phonk Velocity Edit")
print("==================================================================")
t_start = time.time()

# Target parameters
WIDTH = 1080
HEIGHT = 1080
FPS = 60
TOTAL_FRAMES = 811 # ~13.514 seconds @ 60 FPS

# Paths
AUDIO_PATH = "D:/motionforge/public/assets/trending_audio.aac"
OUTPUT_MP4 = "D:/motionforge/public/assets/trending_character_edit.mp4"
TEMP_RAW_MP4 = "D:/motionforge/public/assets/edit_segments/raw_mmd_video.mp4"
DOWNLOAD_MP4 = "D:/загрузки/trending_character_edit.mp4"

# Assets
STAGE_PATH = "D:/motionforge/public/assets/miku_stage.png"
CARD1_PATH = "D:/motionforge/public/assets/genshin_chars/card1_hutao.png"
CARD2_PATH = "D:/motionforge/public/assets/genshin_chars/card2_miku.png"
CARD3_PATH = "D:/motionforge/public/assets/genshin_chars/card3_furina.png"
PIP_BLUE_PATH = "D:/motionforge/public/assets/pip_bg_blue.png"
PIP_RED_PATH = "D:/motionforge/public/assets/pip_bg_red.png"
PIP_MASK_PATH = "D:/motionforge/public/assets/pip_mask.png"
OUTRO_FLARE_PATH = "D:/motionforge/public/assets/outro_flare.png"

HUTAO_FRAMES_DIR = "D:/motionforge/public/assets/mmd_frames/hutao_dance"
MIKU_FRAMES_DIR = "D:/motionforge/public/assets/mmd_frames/miku_dance"

# Load static images
img_card1 = Image.open(CARD1_PATH).convert("RGB")
img_card2 = Image.open(CARD2_PATH).convert("RGB")
img_card3 = Image.open(CARD3_PATH).convert("RGB")
img_stage = Image.open(STAGE_PATH).convert("RGB") # 2560 x 1080
img_pip_blue = Image.open(PIP_BLUE_PATH).convert("RGB")
img_pip_red = Image.open(PIP_RED_PATH).convert("RGB")
img_pip_mask = Image.open(PIP_MASK_PATH).convert("L")
img_outro_flare = Image.open(OUTRO_FLARE_PATH).convert("RGB")

# Frame caching for speed
frame_cache = {}

def get_frame(folder, idx, total_count=1180):
    clamped = max(1, min(total_count, idx))
    cache_key = f"{folder}_{clamped}"
    if cache_key in frame_cache:
        return frame_cache[cache_key]
    p = f"{folder}/frame_{clamped:04d}.jpg"
    im = Image.open(p).convert("RGB")
    frame_cache[cache_key] = im
    return im

def get_hutao(idx):
    return get_frame(HUTAO_FRAMES_DIR, idx, 1180)

def get_miku(idx):
    return get_frame(MIKU_FRAMES_DIR, idx, 1180)

def apply_chromatic_aberration(arr, shift):
    if shift <= 0:
        return arr
    res = arr.copy()
    s = int(shift)
    # Red channel shift right
    res[:, s:, 0] = arr[:, :-s, 0]
    # Blue channel shift left
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

def create_pip_frame(dance_im, bg_im, mask_im, zoom=1.0):
    w = 760 / zoom
    h = 760 / zoom
    cx, cy = 540, 540
    crop_box = (cx - w/2, cy - h/2, cx + w/2, cy + h/2)
    inner = dance_im.crop(crop_box).resize((760, 760), Image.Resampling.LANCZOS)
    
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
    if f < 30: # Hu Tao Teaser (0.00s - 0.50s)
        p = f / 30.0
        z = 1.0 + 0.10 * p
        im = zoom_crop(img_card1, z)
        arr = np.array(im)
        flash = max(0.0, 1.0 - (f / 4.0)) # 4-frame flash
        arr = apply_flash(arr, flash)
        
    elif f < 60: # Hatsune Miku Teaser (0.50s - 1.00s)
        sub_f = f - 30
        p = sub_f / 30.0
        z = 1.0 + 0.10 * p
        im = zoom_crop(img_card2, z)
        arr = np.array(im)
        flash = max(0.0, 1.0 - (sub_f / 4.0))
        arr = apply_flash(arr, flash)
        
    elif f < 90: # Furina Teaser (1.00s - 1.50s)
        sub_f = f - 60
        p = sub_f / 30.0
        z = 1.0 + 0.12 * p
        im = zoom_crop(img_card3, z)
        arr = np.array(im)
        flash = max(0.0, 1.0 - (sub_f / 4.0))
        arr = apply_flash(arr, flash)

    # -------------------------------------------------------------------------
    # SCENE 2: STUDIO GALLERY PAN (Frames 90 .. 149 | 1.50s .. 2.50s)
    # -------------------------------------------------------------------------
    elif f < 150:
        sub_f = f - 90
        p = sub_f / 60.0
        # Smoothstep easing: 3p^2 - 2p^3
        ease = p * p * (3.0 - 2.0 * p)
        # Pan camera across stage showing Hu Tao, Miku, and Furina from x=100 to x=1380
        cam_x = int(100 + ease * (1380 - 100))
        im = img_stage.crop((cam_x, 0, cam_x + 1080, 1080))
        arr = np.array(im)

    # -------------------------------------------------------------------------
    # SCENE 3: SELECTION DOLLY ZOOM INTO HU TAO (Frames 150 .. 205 | 2.50s .. 3.44s)
    # -------------------------------------------------------------------------
    elif f < 206:
        sub_f = f - 150
        p = sub_f / 56.0
        # Accelerating power zoom into Hu Tao's picture
        z = 1.0 + 1.45 * (p ** 1.6)
        base_crop = img_stage.crop((100, 0, 100 + 1080, 1080))
        im = zoom_crop(base_crop, z, cx=275, cy=355)
        arr = np.array(im)

    # -------------------------------------------------------------------------
    # SCENE 4: 360° WHIP ROTATION SPIN INTO EYE (Frames 206 .. 231 | 3.44s .. 3.86s)
    # -------------------------------------------------------------------------
    elif f < 232:
        sub_f = f - 206
        p = sub_f / 26.0
        # Spin accelerating: angle 0 to 360
        angle = 360.0 * (p ** 2.2)
        z = 2.4 + 1.3 * p
        w = int(1080 / z * 1.44)
        h = int(1080 / z * 1.44)
        cx, cy = 540, 440
        crop_box = (max(0, cx - w//2), max(0, cy - h//2), min(1080, cx + w//2), min(1080, cy + h//2))
        large_crop = img_card1.crop(crop_box).resize((1556, 1556), Image.Resampling.LANCZOS)
        rotated = large_crop.rotate(angle, resample=Image.Resampling.BICUBIC)
        rot_blur = large_crop.rotate(angle - 12.0 * p, resample=Image.Resampling.BICUBIC)
        blended = Image.blend(rotated, rot_blur, 0.45)
        im = blended.crop((238, 238, 238 + 1080, 238 + 1080))
        arr = np.array(im)

    # -------------------------------------------------------------------------
    # SCENE 5: THE BASS DROP & 3D MMD VELOCITY DANCE (Frames 232 .. 751 | 3.86s .. 12.52s)
    # -------------------------------------------------------------------------
    # Cut 1: Hu Tao Drop Impact — Pointing Finger to Beat (Frames 232 .. 272 | 3.86s - 4.54s, 41 frames)
    elif f < 273:
        sub_f = f - 232
        src_idx = int(48 + sub_f * 0.95)
        im = get_hutao(src_idx)
        # Downbeat punch-in zoom
        z = 1.25 - 0.20 * (sub_f / 41.0)
        im = zoom_crop(im, z)
        arr = np.array(im)
        # Chromatic aberration decay
        chroma = max(0, int(22 - sub_f * 2.0))
        arr = apply_chromatic_aberration(arr, chroma)
        # White flash impact
        flash = max(0.0, 1.0 - (sub_f / 5.0))
        arr = apply_flash(arr, flash)

    # Cut 2: Miku Forehead Salute Wink (Frames 273 .. 316 | 4.54s - 5.28s, 44 frames)
    elif f < 317:
        sub_f = f - 273
        src_idx = int(300 + sub_f * 1.0)
        im = get_miku(src_idx)
        # Snare pulses at sub_f=14 and sub_f=28
        pulse = 0.0
        if 12 <= sub_f <= 18:
            pulse = 0.08 * (1.0 - abs(sub_f - 15) / 3.0)
        elif 26 <= sub_f <= 32:
            pulse = 0.08 * (1.0 - abs(sub_f - 29) / 3.0)
        im = zoom_crop(im, 1.08 + pulse)
        arr = np.array(im)
        flash = max(0.0, 1.0 - (sub_f / 3.0))
        arr = apply_flash(arr, flash)

    # Cut 3: Framed PIP Card - Hu Tao Ghost Paw Dance (Frames 317 .. 371 | 5.28s - 6.20s, 55 frames)
    elif f < 372:
        sub_f = f - 317
        src_idx = int(180 + sub_f * 0.9)
        dance_im = get_hutao(src_idx)
        # Gentle rhythmic bounce
        pip_zoom = 1.02 + 0.04 * math.sin(sub_f * 0.3)
        im = create_pip_frame(dance_im, img_pip_red, img_pip_mask, zoom=pip_zoom)
        arr = np.array(im)
        flash = max(0.0, 1.0 - (sub_f / 3.0))
        arr = apply_flash(arr, flash)

    # Cut 4: Hu Tao Peace Sign Wink Closeup (Frames 372 .. 423 | 6.20s - 7.06s, 52 frames)
    elif f < 424:
        sub_f = f - 372
        src_idx = int(480 + sub_f * 0.95)
        im = get_hutao(src_idx)
        z = 1.25 - 0.12 * (sub_f / 52.0)
        im = zoom_crop(im, z)
        arr = np.array(im)
        chroma = max(0, int(15 - sub_f * 1.6))
        arr = apply_chromatic_aberration(arr, chroma)
        flash = max(0.0, 1.0 - (sub_f / 4.0))
        arr = apply_flash(arr, flash)

    # Cut 5: Miku Head Tilt Smile Closeup (Frames 424 .. 471 | 7.06s - 7.86s, 48 frames)
    elif f < 472:
        sub_f = f - 424
        src_idx = int(240 + sub_f * 1.0)
        im = get_miku(src_idx)
        z = 1.05 + 0.08 * (sub_f / 48.0)
        im = zoom_crop(im, z)
        arr = np.array(im)
        flash = max(0.0, 1.0 - (sub_f / 3.0))
        arr = apply_flash(arr, flash)

    # Cut 6: Hu Tao Forehead Salute Wink (Frames 472 .. 523 | 7.86s - 8.72s, 52 frames)
    elif f < 524:
        sub_f = f - 472
        src_idx = int(300 + sub_f * 1.0)
        im = get_hutao(src_idx)
        # Snare pulse at sub_f = 14
        pulse = 0.06 * max(0.0, 1.0 - abs(sub_f - 14) / 4.0)
        im = zoom_crop(im, 1.10 + pulse)
        arr = np.array(im)
        chroma = max(0, int(14 - sub_f * 1.6))
        arr = apply_chromatic_aberration(arr, chroma)
        flash = max(0.0, 1.0 - (sub_f / 3.0))
        arr = apply_flash(arr, flash)

    # Cut 7: Framed PIP Card - Miku Cyan Digital Dance (Frames 524 .. 584 | 8.72s - 9.74s, 61 frames)
    elif f < 585:
        sub_f = f - 524
        src_idx = int(60 + sub_f * 0.95)
        dance_im = get_miku(src_idx)
        pip_zoom = 1.02 + 0.05 * math.sin(sub_f * 0.28)
        im = create_pip_frame(dance_im, img_pip_blue, img_pip_mask, zoom=pip_zoom)
        arr = np.array(im)
        flash = max(0.0, 1.0 - (sub_f / 3.0))
        arr = apply_flash(arr, flash)

    # Cut 8: Miku Double Peace Wink Charm (Frames 585 .. 645 | 9.74s - 10.76s, 61 frames)
    elif f < 646:
        sub_f = f - 585
        src_idx = int(660 + sub_f * 0.95)
        im = get_miku(src_idx)
        z = 1.18 - 0.10 * (sub_f / 61.0)
        im = zoom_crop(im, z)
        arr = np.array(im)
        chroma = max(0, int(12 - sub_f * 1.3))
        arr = apply_chromatic_aberration(arr, chroma)
        flash = max(0.0, 1.0 - (sub_f / 3.0))
        arr = apply_flash(arr, flash)

    # Cut 9: Rapid 16th-Note Stutter Beat Cuts (Hu Tao -> Miku -> Hu Tao -> Miku) (Frames 646 .. 689 | 10.76s - 11.50s, 44 frames)
    elif f < 690:
        sub_f = f - 646
        if sub_f < 11: # Hu Tao finger point
            im = get_hutao(55 + sub_f)
            im = zoom_crop(im, 1.12)
            arr = np.array(im)
            if sub_f < 2: arr = apply_flash(arr, 0.85)
        elif sub_f < 22: # Miku finger point
            m_f = sub_f - 11
            im = get_miku(55 + m_f)
            im = zoom_crop(im, 1.12)
            arr = np.array(im)
            if m_f < 2: arr = apply_flash(arr, 0.85)
        elif sub_f < 33: # Hu Tao peace wink
            h_f = sub_f - 22
            im = get_hutao(490 + h_f)
            im = zoom_crop(im, 1.16)
            arr = np.array(im)
            if h_f < 2: arr = apply_flash(arr, 0.85)
        else: # Miku double peace blush
            m_f2 = sub_f - 33
            im = get_miku(670 + m_f2)
            im = zoom_crop(im, 1.16)
            arr = np.array(im)
            chroma = max(0, int(10 - m_f2 * 1.2))
            arr = apply_chromatic_aberration(arr, chroma)
            if m_f2 < 2: arr = apply_flash(arr, 0.90)

    # Cut 10: The Grand Climax: Hu Tao Climax Double Peace Pose (Frames 690 .. 751 | 11.50s - 12.52s, 62 frames)
    elif f < 752:
        sub_f = f - 690
        src_idx = int(660 + sub_f * 0.98)
        im = get_hutao(src_idx)
        # Climax punch + rhythmic bass bounce
        bounce = 0.05 * math.sin(sub_f * 0.42)
        im = zoom_crop(im, 1.15 + bounce)
        arr = np.array(im)
        # Heavy RGB split spike on climax drop
        chroma = max(0, int(24 - sub_f * 1.5))
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

# Copy to downloads folder
import shutil
shutil.copyfile(OUTPUT_MP4, DOWNLOAD_MP4)
print(f"Master output saved to {OUTPUT_MP4} and copied to {DOWNLOAD_MP4}!")

t_end = time.time()
print(f"TOTAL BUILD TIME: {t_end - t_start:.2f}s!")
print("==================================================================")
