import os
import sys
import time
import math
import subprocess
import numpy as np
from PIL import Image, ImageFilter, ImageEnhance

print("==================================================================")
print("  MASTER 3D MMD VELOCITY COMPOSITOR V2: HU TAO & HATSUNE MIKU")
print("  Ultra-Polished: Fullscreen Edge-to-Edge, Spectral Prism, Cinebloom")
print("==================================================================")
t_start = time.time()

WIDTH = 1080
HEIGHT = 1080
FPS = 60
TOTAL_FRAMES = 811 # 13.514s @ 60 FPS

# Paths
AUDIO_PATH = "D:/motionforge/public/assets/trending_audio.aac"
OUTPUT_MP4 = "D:/motionforge/public/assets/trending_character_edit.mp4"
TEMP_RAW_MP4 = "D:/motionforge/public/assets/edit_segments/raw_mmd_video_v2.mp4"
DOWNLOAD_MP4 = "D:/загрузки/trending_character_edit.mp4"

STAGE_PATH = "D:/motionforge/public/assets/miku_stage.png"
CARD1_PATH = "D:/motionforge/public/assets/genshin_chars/card1_hutao.png"
CARD2_PATH = "D:/motionforge/public/assets/genshin_chars/card2_miku.png"
CARD3_PATH = "D:/motionforge/public/assets/genshin_chars/card3_furina.png"
OUTRO_FLARE_PATH = "D:/motionforge/public/assets/outro_flare.png"

HUTAO_FRAMES_DIR = "D:/motionforge/public/assets/mmd_frames/hutao_dance"
MIKU_FRAMES_DIR = "D:/motionforge/public/assets/mmd_frames/miku_dance"

# Load static images
img_card1 = Image.open(CARD1_PATH).convert("RGB")
img_card2 = Image.open(CARD2_PATH).convert("RGB")
img_card3 = Image.open(CARD3_PATH).convert("RGB")
img_stage = Image.open(STAGE_PATH).convert("RGB") # 2560 x 1080
img_outro_flare = Image.open(OUTRO_FLARE_PATH).convert("RGB")

# Frame caching
frame_cache = {}

def get_raw_frame(folder, idx, total_count=1180):
    clamped = max(1, min(total_count, idx))
    cache_key = f"{folder}_{clamped}"
    if cache_key in frame_cache:
        return frame_cache[cache_key]
    p = f"{folder}/frame_{clamped:04d}.jpg"
    im = Image.open(p).convert("RGB")
    frame_cache[cache_key] = im
    return im

def get_fullscreen_hutao(idx, zoom=1.0, cx=540, cy=530):
    """Crops Hu Tao with active area (size 820) to completely eliminate all letterbox bars."""
    raw = get_raw_frame(HUTAO_FRAMES_DIR, idx)
    base_size = 820.0
    crop_size = base_size / max(0.5, zoom)
    left = max(0, min(1080 - crop_size, cx - crop_size / 2.0))
    top = max(0, min(1080 - crop_size, cy - crop_size / 2.0))
    return raw.crop((left, top, left + crop_size, top + crop_size)).resize((1080, 1080), Image.Resampling.LANCZOS)

def get_fullscreen_miku(idx, zoom=1.0, cx=540, cy=522):
    """Crops Miku with active area (size 820) to completely eliminate all letterbox bars."""
    raw = get_raw_frame(MIKU_FRAMES_DIR, idx)
    base_size = 820.0
    crop_size = base_size / max(0.5, zoom)
    left = max(0, min(1080 - crop_size, cx - crop_size / 2.0))
    top = max(0, min(1080 - crop_size, cy - crop_size / 2.0))
    return raw.crop((left, top, left + crop_size, top + crop_size)).resize((1080, 1080), Image.Resampling.LANCZOS)

# -------------------------------------------------------------------------
# HIGH-END VISUAL EFFECTS
# -------------------------------------------------------------------------
def apply_spectral_prism(arr, strength=0.0):
    """Simulates radial optical prism dispersion (rainbow fringing on high-contrast edges)."""
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

def apply_cinebloom(arr, intensity=0.28):
    """Soft filmic highlight glow (Black Pro-Mist effect) for skin and specular accents."""
    if intensity <= 0.02:
        return arr
    lum = 0.299 * arr[:, :, 0] + 0.587 * arr[:, :, 1] + 0.114 * arr[:, :, 2]
    high = np.maximum(0.0, lum - 175.0) / 80.0
    high_mask = np.dstack([high, high, high])
    high_im = Image.fromarray((arr * high_mask).astype(np.uint8))
    
    bloom1 = np.array(high_im.filter(ImageFilter.GaussianBlur(radius=14)), dtype=np.float32)
    bloom2 = np.array(high_im.filter(ImageFilter.GaussianBlur(radius=32)), dtype=np.float32)
    
    res = np.clip(arr.astype(np.float32) + (bloom1 * 0.6 + bloom2 * 0.4) * intensity, 0, 255).astype(np.uint8)
    return res

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

def apply_motion_blur_y(im, dy):
    """Vertical whip slide motion blur."""
    if abs(dy) < 3:
        return im
    steps = 4
    blended = im.copy()
    for i in range(1, steps + 1):
        offset = int(dy * (i / steps))
        shifted = np.roll(np.array(im), offset, axis=0)
        blended = Image.blend(blended, Image.fromarray(shifted), 1.0 / (i + 1))
    return blended

def zoom_crop_card(im, zoom, cx=540, cy=540):
    if zoom <= 1.001:
        return im
    w = 1080 / zoom
    h = 1080 / zoom
    left = max(0, min(1080 - w, cx - w / 2))
    top = max(0, min(1080 - h, cy - h / 2))
    return im.crop((left, top, left + w, top + h)).resize((1080, 1080), Image.Resampling.LANCZOS)

# -------------------------------------------------------------------------
# FFMPEG PIPE SETUP
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
        z = 1.0 + 0.12 * p
        im = zoom_crop_card(img_card1, z)
        arr = np.array(im)
        flash = max(0.0, 1.0 - (f / 4.0))
        arr = apply_flash(arr, flash)
        
    elif f < 60: # Hatsune Miku Teaser (0.50s - 1.00s)
        sub_f = f - 30
        p = sub_f / 30.0
        z = 1.0 + 0.12 * p
        im = zoom_crop_card(img_card2, z)
        arr = np.array(im)
        flash = max(0.0, 1.0 - (sub_f / 4.0))
        arr = apply_flash(arr, flash)
        
    elif f < 90: # Furina Teaser (1.00s - 1.50s)
        sub_f = f - 60
        p = sub_f / 30.0
        z = 1.0 + 0.14 * p
        im = zoom_crop_card(img_card3, z)
        arr = np.array(im)
        flash = max(0.0, 1.0 - (sub_f / 4.0))
        arr = apply_flash(arr, flash)

    # -------------------------------------------------------------------------
    # SCENE 2: LUXURY STUDIO GALLERY PAN (Frames 90 .. 149 | 1.50s .. 2.50s)
    # -------------------------------------------------------------------------
    elif f < 150:
        sub_f = f - 90
        p = sub_f / 60.0
        # Smooth ease-in-out glide across showroom
        ease = p * p * (3.0 - 2.0 * p)
        cam_x = int(0 + ease * 1480)
        im = img_stage.crop((cam_x, 0, cam_x + 1080, 1080))
        arr = np.array(im)

    # -------------------------------------------------------------------------
    # SCENE 3: SELECTION DOLLY ZOOM INTO HU TAO (Frames 150 .. 205 | 2.50s .. 3.44s)
    # -------------------------------------------------------------------------
    elif f < 206:
        sub_f = f - 150
        p = sub_f / 56.0
        # Accelerating power zoom directly into Hu Tao's frame on stage
        z = 1.0 + 1.55 * (p ** 1.7)
        base_crop = img_stage.crop((0, 0, 1080, 1080))
        im = zoom_crop_card(base_crop, z, cx=480, cy=450)
        arr = np.array(im)

    # -------------------------------------------------------------------------
    # SCENE 4: 360° WHIP ROTATION SPIN INTO EYE (Frames 206 .. 231 | 3.44s .. 3.86s)
    # -------------------------------------------------------------------------
    elif f < 232:
        sub_f = f - 206
        p = sub_f / 26.0
        angle = 360.0 * (p ** 2.2)
        z = 2.4 + 1.5 * p
        w = int(1080 / z * 1.44)
        h = int(1080 / z * 1.44)
        cx, cy = 540, 440
        crop_box = (max(0, cx - w//2), max(0, cy - h//2), min(1080, cx + w//2), min(1080, cy + h//2))
        large_crop = img_card1.crop(crop_box).resize((1556, 1556), Image.Resampling.LANCZOS)
        rotated = large_crop.rotate(angle, resample=Image.Resampling.BICUBIC)
        rot_blur = large_crop.rotate(angle - 14.0 * p, resample=Image.Resampling.BICUBIC)
        blended = Image.blend(rotated, rot_blur, 0.45)
        im = blended.crop((238, 238, 238 + 1080, 238 + 1080))
        arr = np.array(im)

    # -------------------------------------------------------------------------
    # SCENE 5: THE BASS DROP & 3D MMD VELOCITY DANCE (Frames 232 .. 751 | 3.86s .. 12.52s)
    # -------------------------------------------------------------------------
    # Cut 1: Hu Tao Drop Impact — Pointing Finger to Beat (Frames 232 .. 272 | 3.86s - 4.54s, 41 frames)
    elif f < 273:
        sub_f = f - 232
        src_idx = int(48 + sub_f * 0.96)
        # Bass kick punch-in zoom decaying with exponential curve
        punch_z = 1.04 + 0.18 * math.exp(-sub_f * 0.14)
        im = get_fullscreen_hutao(src_idx, zoom=punch_z)
        
        # Outgoing whip-slide for transition into Cut 2 on last 3 frames
        if sub_f >= 38:
            slide = int((sub_f - 37) * 45)
            im = apply_motion_blur_y(im, slide)
            
        arr = np.array(im)
        chroma = 26.0 * math.exp(-sub_f * 0.15)
        arr = apply_spectral_prism(arr, chroma)
        arr = apply_cinebloom(arr, 0.28)
        flash = max(0.0, 1.0 - (sub_f / 5.0))
        arr = apply_flash(arr, flash)

    # Cut 2: Miku Forehead Salute Wink (Frames 273 .. 316 | 4.54s - 5.28s, 44 frames)
    elif f < 317:
        sub_f = f - 273
        src_idx = int(300 + sub_f * 1.0)
        # Snare pulse bounce at sub_f = 15 and 29
        pulse = 0.0
        if 12 <= sub_f <= 18:
            pulse = 0.10 * (1.0 - abs(sub_f - 15) / 3.0)
        elif 26 <= sub_f <= 32:
            pulse = 0.10 * (1.0 - abs(sub_f - 29) / 3.0)
        z = 1.02 + pulse
        im = get_fullscreen_miku(src_idx, zoom=z)
        
        # Incoming whip-slide on first 3 frames
        if sub_f < 3:
            slide = int(-(3 - sub_f) * 35)
            im = apply_motion_blur_y(im, slide)
        # Outgoing whip-slide on last 3 frames
        elif sub_f >= 41:
            slide = int((sub_f - 40) * 45)
            im = apply_motion_blur_y(im, slide)
            
        arr = np.array(im)
        chroma = 16.0 * math.exp(-sub_f * 0.18)
        if 13 <= sub_f <= 17:
            chroma = max(chroma, 14.0)
        arr = apply_spectral_prism(arr, chroma)
        arr = apply_cinebloom(arr, 0.26)
        flash = max(0.0, 1.0 - (sub_f / 3.0))
        arr = apply_flash(arr, flash)

    # Cut 3: Fullscreen Hu Tao Ghost Paw & Hip Sway Dance (Frames 317 .. 371 | 5.28s - 6.20s, 55 frames)
    elif f < 372:
        sub_f = f - 317
        src_idx = int(180 + sub_f * 0.92)
        # Rhythmic cowbell groove bounce
        groove = 0.04 * math.sin(sub_f * 0.32)
        z = 1.05 + groove
        im = get_fullscreen_hutao(src_idx, zoom=z)
        
        if sub_f < 3:
            slide = int(-(3 - sub_f) * 35)
            im = apply_motion_blur_y(im, slide)
        elif sub_f >= 52:
            slide = int((sub_f - 51) * 45)
            im = apply_motion_blur_y(im, slide)
            
        arr = np.array(im)
        chroma = 12.0 * math.exp(-sub_f * 0.15)
        arr = apply_spectral_prism(arr, chroma)
        arr = apply_cinebloom(arr, 0.25)
        flash = max(0.0, 1.0 - (sub_f / 3.0))
        arr = apply_flash(arr, flash)

    # Cut 4: Hu Tao Peace Sign Wink Closeup (Frames 372 .. 423 | 6.20s - 7.06s, 52 frames)
    elif f < 424:
        sub_f = f - 372
        src_idx = int(480 + sub_f * 0.95)
        punch_z = 1.25 + 0.15 * math.exp(-sub_f * 0.16)
        im = get_fullscreen_hutao(src_idx, zoom=punch_z, cx=540, cy=460)
        
        if sub_f < 3:
            slide = int(-(3 - sub_f) * 35)
            im = apply_motion_blur_y(im, slide)
        elif sub_f >= 49:
            slide = int((sub_f - 48) * 45)
            im = apply_motion_blur_y(im, slide)
            
        arr = np.array(im)
        chroma = 20.0 * math.exp(-sub_f * 0.16)
        arr = apply_spectral_prism(arr, chroma)
        arr = apply_cinebloom(arr, 0.30)
        flash = max(0.0, 1.0 - (sub_f / 4.0))
        arr = apply_flash(arr, flash)

    # Cut 5: Miku Head Tilt Smile Closeup (Frames 424 .. 471 | 7.06s - 7.86s, 48 frames)
    elif f < 472:
        sub_f = f - 424
        src_idx = int(240 + sub_f * 1.0)
        z = 1.15 + 0.08 * (sub_f / 48.0)
        im = get_fullscreen_miku(src_idx, zoom=z, cx=540, cy=460)
        
        if sub_f < 3:
            slide = int(-(3 - sub_f) * 35)
            im = apply_motion_blur_y(im, slide)
        elif sub_f >= 45:
            slide = int((sub_f - 44) * 45)
            im = apply_motion_blur_y(im, slide)
            
        arr = np.array(im)
        chroma = 14.0 * math.exp(-sub_f * 0.18)
        arr = apply_spectral_prism(arr, chroma)
        arr = apply_cinebloom(arr, 0.26)
        flash = max(0.0, 1.0 - (sub_f / 3.0))
        arr = apply_flash(arr, flash)

    # Cut 6: Hu Tao Forehead Salute Wink (Frames 472 .. 523 | 7.86s - 8.72s, 52 frames)
    elif f < 524:
        sub_f = f - 472
        src_idx = int(300 + sub_f * 1.0)
        pulse = 0.08 * max(0.0, 1.0 - abs(sub_f - 14) / 4.0)
        z = 1.08 + pulse
        im = get_fullscreen_hutao(src_idx, zoom=z)
        
        if sub_f < 3:
            slide = int(-(3 - sub_f) * 35)
            im = apply_motion_blur_y(im, slide)
        elif sub_f >= 49:
            slide = int((sub_f - 48) * 45)
            im = apply_motion_blur_y(im, slide)
            
        arr = np.array(im)
        chroma = 18.0 * math.exp(-sub_f * 0.16)
        if 12 <= sub_f <= 16:
            chroma = max(chroma, 15.0)
        arr = apply_spectral_prism(arr, chroma)
        arr = apply_cinebloom(arr, 0.28)
        flash = max(0.0, 1.0 - (sub_f / 3.0))
        arr = apply_flash(arr, flash)

    # Cut 7: Fullscreen Miku Cyan Digital Dance (Frames 524 .. 584 | 8.72s - 9.74s, 61 frames)
    elif f < 585:
        sub_f = f - 524
        src_idx = int(60 + sub_f * 0.95)
        bounce = 0.05 * math.sin(sub_f * 0.35)
        z = 1.06 + bounce
        im = get_fullscreen_miku(src_idx, zoom=z)
        
        if sub_f < 3:
            slide = int(-(3 - sub_f) * 35)
            im = apply_motion_blur_y(im, slide)
        elif sub_f >= 58:
            slide = int((sub_f - 57) * 45)
            im = apply_motion_blur_y(im, slide)
            
        arr = np.array(im)
        chroma = 15.0 * math.exp(-sub_f * 0.18)
        arr = apply_spectral_prism(arr, chroma)
        arr = apply_cinebloom(arr, 0.26)
        flash = max(0.0, 1.0 - (sub_f / 3.0))
        arr = apply_flash(arr, flash)

    # Cut 8: Miku Double Peace Wink Charm Closeup (Frames 585 .. 645 | 9.74s - 10.76s, 61 frames)
    elif f < 646:
        sub_f = f - 585
        src_idx = int(660 + sub_f * 0.95)
        punch_z = 1.22 + 0.10 * math.exp(-sub_f * 0.14)
        im = get_fullscreen_miku(src_idx, zoom=punch_z, cx=540, cy=460)
        
        if sub_f < 3:
            slide = int(-(3 - sub_f) * 35)
            im = apply_motion_blur_y(im, slide)
        elif sub_f >= 58:
            slide = int((sub_f - 57) * 45)
            im = apply_motion_blur_y(im, slide)
            
        arr = np.array(im)
        chroma = 16.0 * math.exp(-sub_f * 0.16)
        arr = apply_spectral_prism(arr, chroma)
        arr = apply_cinebloom(arr, 0.28)
        flash = max(0.0, 1.0 - (sub_f / 3.0))
        arr = apply_flash(arr, flash)

    # Cut 9: Rapid 16th-Note Stutter Beat Cuts (Frames 646 .. 689 | 10.76s - 11.50s, 44 frames)
    elif f < 690:
        sub_f = f - 646
        if sub_f < 11: # Hu Tao finger point
            im = get_fullscreen_hutao(55 + sub_f, zoom=1.18)
            arr = np.array(im)
            chroma = 18.0 * (1.0 - sub_f / 11.0)
            arr = apply_spectral_prism(arr, chroma)
            if sub_f < 2: arr = apply_flash(arr, 0.90)
        elif sub_f < 22: # Miku finger point
            m_f = sub_f - 11
            im = get_fullscreen_miku(55 + m_f, zoom=1.18)
            arr = np.array(im)
            chroma = 18.0 * (1.0 - m_f / 11.0)
            arr = apply_spectral_prism(arr, chroma)
            if m_f < 2: arr = apply_flash(arr, 0.90)
        elif sub_f < 33: # Hu Tao peace wink
            h_f = sub_f - 22
            im = get_fullscreen_hutao(490 + h_f, zoom=1.25, cx=540, cy=460)
            arr = np.array(im)
            chroma = 22.0 * (1.0 - h_f / 11.0)
            arr = apply_spectral_prism(arr, chroma)
            if h_f < 2: arr = apply_flash(arr, 0.90)
        else: # Miku double peace blush
            m_f2 = sub_f - 33
            im = get_fullscreen_miku(670 + m_f2, zoom=1.25, cx=540, cy=460)
            arr = np.array(im)
            chroma = 24.0 * (1.0 - m_f2 / 11.0)
            arr = apply_spectral_prism(arr, chroma)
            if m_f2 < 2: arr = apply_flash(arr, 0.95)
        arr = apply_cinebloom(arr, 0.28)

    # Cut 10: The Grand Climax: Hu Tao Climax Double Peace Pose (Frames 690 .. 751 | 11.50s - 12.52s, 62 frames)
    elif f < 752:
        sub_f = f - 690
        src_idx = int(660 + sub_f * 0.98)
        # Climax bass punch + continuous 808 sub pulsation
        sub_pulse = 0.06 * math.sin(sub_f * 0.44)
        punch_z = 1.10 + 0.20 * math.exp(-sub_f * 0.12) + sub_pulse
        im = get_fullscreen_hutao(src_idx, zoom=punch_z)
        arr = np.array(im)
        
        # Massive spectral prism burst on drop
        chroma = 28.0 * math.exp(-sub_f * 0.12)
        arr = apply_spectral_prism(arr, chroma)
        
        # Camera shake impact on drop
        shake = max(0, int(7 - sub_f * 0.5))
        arr = apply_camera_shake(arr, shake)
        arr = apply_cinebloom(arr, 0.32)
        
        flash = max(0.0, 1.0 - (sub_f / 5.0))
        arr = apply_flash(arr, flash)

    # -------------------------------------------------------------------------
    # SCENE 6: OUTRO ANAMORPHIC FLARE STAR (Frames 752 .. 810 | 12.52s .. 13.514s)
    # -------------------------------------------------------------------------
    else:
        sub_f = f - 752
        if sub_f < 3:
            arr = np.full((1080, 1080, 3), 255, dtype=np.uint8)
        else:
            flare_f = sub_f - 3
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

# Mux with original audio
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

# Copy to downloads
import shutil
shutil.copyfile(OUTPUT_MP4, DOWNLOAD_MP4)
print(f"Master output saved to {OUTPUT_MP4} and copied to {DOWNLOAD_MP4}!")

t_end = time.time()
print(f"TOTAL BUILD TIME: {t_end - t_start:.2f}s!")
print("==================================================================")
