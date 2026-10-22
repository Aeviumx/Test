import os
import sys
import time
import math
import subprocess
import numpy as np
from PIL import Image, ImageFilter, ImageEnhance, ImageDraw

print("==================================================================")
print("  ANIME LIVE2D / 2.5D BEAT-SYNCED MV EDIT (8s, 1:1, 60 FPS)")
print("  Lucia: School Sailor Uniform • Pastel Checkerboard • Phonk Drop")
print("==================================================================")
t_start = time.time()

WIDTH = 1080
HEIGHT = 1080
FPS = 60
TOTAL_FRAMES = 480 # Exactly 8.000s @ 60 FPS

# Paths
AUDIO_PATH = "D:/motionforge/public/assets/lucia_audio_8s.aac"
OUTPUT_MP4 = "D:/motionforge/public/assets/anime_live2d_edit.mp4"
TEMP_RAW_MP4 = "D:/motionforge/public/assets/edit_segments/raw_live2d_video.mp4"
DOWNLOAD_MP4 = "D:/загрузки/anime_live2d_edit.mp4"

RAW_FRAMES_DIR = "C:/Users/mi7ki/.gemini/antigravity/brain/dcf0ddcd-0da4-4c20-ad76-55a82e55d8ae/lucia_dance_raw"
raw_files = sorted([f for f in os.listdir(RAW_FRAMES_DIR) if f.endswith('.png')])

# Pre-cache raw frames for ultra-fast compositing
frame_cache = {}

def get_base_frame(idx):
    clamped = max(0, min(len(raw_files) - 1, idx))
    if clamped in frame_cache:
        return frame_cache[clamped]
    p = os.path.join(RAW_FRAMES_DIR, raw_files[clamped])
    im = Image.open(p).convert("RGB")
    # Upscale to 1080x1080 with high-precision Lanczos
    up = im.resize((1080, 1080), Image.Resampling.LANCZOS)
    # Enhance sharpness and contrast for vivid 2.5D cel shading & glossy eyes
    sharp = ImageEnhance.Sharpness(up).enhance(1.35)
    contrast = ImageEnhance.Contrast(sharp).enhance(1.08)
    frame_cache[clamped] = contrast
    return contrast

# -------------------------------------------------------------------------
# VISUAL EFFECTS (Bloom, Clean Spectral Prism, Light Leak, Motion Blur, Shake)
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

def apply_clean_spectral_prism(arr, strength=0.0):
    """Radial prism dispersion with seamless edge replication (zero yellow borders)."""
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
    
    # Blue: radial contraction by cropping outer s pixels and resizing to (w, h)
    im_b = Image.fromarray(arr[:, :, 2])
    im_b_cropped = im_b.crop((int(s), int(s), int(w - s), int(h - s)))
    res[:, :, 2] = np.array(im_b_cropped.resize((w, h), Image.Resampling.BILINEAR))
    
    return res

def apply_cinebloom(arr, intensity=0.25):
    """Soft filmic highlight glow for skin, glossy eyes and background hearts."""
    if intensity <= 0.02:
        return arr
    lum = 0.299 * arr[:, :, 0] + 0.587 * arr[:, :, 1] + 0.114 * arr[:, :, 2]
    high = np.maximum(0.0, lum - 175.0) / 80.0
    high_mask = np.dstack([high, high, high])
    high_im = Image.fromarray((arr * high_mask).astype(np.uint8))
    
    bloom1 = np.array(high_im.filter(ImageFilter.GaussianBlur(radius=15)), dtype=np.float32)
    bloom2 = np.array(high_im.filter(ImageFilter.GaussianBlur(radius=32)), dtype=np.float32)
    
    res = np.clip(arr.astype(np.float32) + (bloom1 * 0.55 + bloom2 * 0.45) * intensity, 0, 255).astype(np.uint8)
    return res

def apply_light_leak(im, progress=0.5, intensity=0.6):
    """Warm anamorphic light leak streak."""
    if intensity <= 0.02:
        return im
    w, h = im.size
    leak = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(leak)
    cx = int(w * (0.2 + 0.6 * progress))
    cy = int(h * (0.1 + 0.8 * progress))
    rx = 520
    ry = 230
    a1 = int(170 * intensity)
    a2 = int(220 * intensity)
    draw.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=(255, 195, 130, a1))
    draw.ellipse([cx - rx//2, cy - ry//2, cx + rx//2, cy + ry//2], fill=(255, 240, 210, a2))
    blurred = leak.filter(ImageFilter.GaussianBlur(radius=60))
    
    im_rgba = im.convert("RGBA")
    im_rgba = Image.alpha_composite(im_rgba, blurred)
    return im_rgba.convert("RGB")

def zoom_push(im, zoom, cx=540, cy=540):
    if zoom <= 1.001:
        return im
    w = 1080 / zoom
    h = 1080 / zoom
    left = max(0, min(1080 - w, cx - w / 2))
    top = max(0, min(1080 - h, cy - h / 2))
    return im.crop((left, top, left + w, top + h)).resize((1080, 1080), Image.Resampling.LANCZOS)

def apply_motion_blur_y(im, dy):
    """Vertical whip motion blur on cuts."""
    if abs(dy) < 3:
        return im
    steps = 4
    blended = im.copy()
    for i in range(1, steps + 1):
        offset = int(dy * (i / steps))
        shifted = np.roll(np.array(im), offset, axis=0)
        blended = Image.blend(blended, Image.fromarray(shifted), 1.0 / (i + 1))
    return blended

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
    "-crf", "15",
    "-pix_fmt", "yuv420p",
    TEMP_RAW_MP4
]

pipe = subprocess.Popen(ffmpeg_cmd, stdin=subprocess.PIPE, stderr=subprocess.DEVNULL)
print("Rendering 480 frames to FFmpeg rawvideo pipe...")

# Frame offset in lucia_dance_raw (dance starts at raw frame 15)
OFFSET = 15

# -------------------------------------------------------------------------
# FRAME-BY-FRAME COMPOSITION (480 FRAMES = 8.000s)
# -------------------------------------------------------------------------
for f in range(TOTAL_FRAMES):
    raw_idx = OFFSET + f
    im = get_base_frame(raw_idx)
    
    # ---------------------------------------------------------------------
    # SHOT 1: BASS DROP 1 — MEDIUM SWAY (Frames 0 .. 44 | 0.00s .. 0.74s)
    # Sways playfully side to side, hair flowing, downbeat punch
    # ---------------------------------------------------------------------
    if f < 45:
        # Downbeat exponential scale punch
        punch = 0.16 * math.exp(-f * 0.14)
        z = 1.02 + punch
        im = zoom_push(im, z)
        
        # Outgoing whip-slide on last 3 frames
        if f >= 42:
            im = apply_motion_blur_y(im, int((f - 41) * 35))
            
        arr = np.array(im)
        flash = max(0.0, 1.0 - (f / 4.0))
        arr = apply_flash(arr, flash)
        
        shake = max(0, int(7 - f * 0.4))
        arr = apply_camera_shake(arr, shake)
        
        chroma = 24.0 * math.exp(-f * 0.15)
        arr = apply_clean_spectral_prism(arr, chroma)
        arr = apply_cinebloom(arr, 0.26)

    # ---------------------------------------------------------------------
    # SHOT 2: SNARE HIT — UPPER BODY CLOSEUP SWAY (Frames 45 .. 84 | 0.74s .. 1.40s)
    # Dynamic hair flowing, snare pulse
    # ---------------------------------------------------------------------
    elif f < 85:
        sub_f = f - 45
        pulse = 0.10 * math.exp(-sub_f * 0.16)
        z = 1.14 + pulse
        im = zoom_push(im, z, cx=540, cy=480)
        
        if sub_f < 3:
            im = apply_motion_blur_y(im, int(-(3 - sub_f) * 30))
        elif sub_f >= 37:
            im = apply_motion_blur_y(im, int((sub_f - 36) * 35))
            
        arr = np.array(im)
        flash = max(0.0, 1.0 - (sub_f / 3.5))
        arr = apply_flash(arr, flash)
        
        chroma = 16.0 * math.exp(-sub_f * 0.18)
        arr = apply_clean_spectral_prism(arr, chroma)
        arr = apply_cinebloom(arr, 0.28)

    # ---------------------------------------------------------------------
    # SHOT 3: EXTREME CLOSE-UP — FACE & GLOSSY EYES (Frames 85 .. 143 | 1.40s .. 2.38s)
    # Focus on eyes, soft cel shading, shallow DOF, light leak
    # ---------------------------------------------------------------------
    elif f < 144:
        sub_f = f - 85
        p = sub_f / 59.0
        # Push into eyes
        z = 1.32 + 0.08 * p
        if 28 <= sub_f <= 34: # Beat pulse at 1.92s
            z += 0.06 * (1.0 - abs(sub_f - 31) / 3.0)
            
        im = zoom_push(im, z, cx=540, cy=440)
        
        # Warm golden light leak sweep across cut
        if sub_f < 16:
            leak_prog = sub_f / 16.0
            leak_int = 0.70 * (1.0 - sub_f / 16.0)
            im = apply_light_leak(im, progress=leak_prog, intensity=leak_int)
            
        if sub_f < 3:
            im = apply_motion_blur_y(im, int(-(3 - sub_f) * 30))
        elif sub_f >= 56:
            im = apply_motion_blur_y(im, int((sub_f - 55) * 35))
            
        arr = np.array(im)
        flash = max(0.0, 1.0 - (sub_f / 3.5))
        arr = apply_flash(arr, flash)
        
        chroma = 15.0 * math.exp(-sub_f * 0.18)
        arr = apply_clean_spectral_prism(arr, chroma)
        arr = apply_cinebloom(arr, 0.32) # enhanced glow on glossy eyes

    # ---------------------------------------------------------------------
    # SHOT 4: MEDIUM FULL-BODY — RAISES INDEX FINGER "ONE" GESTURE (Frames 144 .. 215 | 2.38s .. 3.58s)
    # Hand on hip, cute "one" gesture, confident mood
    # ---------------------------------------------------------------------
    elif f < 216:
        sub_f = f - 144
        # Punch-in on the gesture hit at sub_f = 48 (3.20s beat)
        gesture_punch = 0.0
        if 44 <= sub_f <= 52:
            gesture_punch = 0.12 * (1.0 - abs(sub_f - 48) / 4.0)
            
        z = 1.04 + gesture_punch
        im = zoom_push(im, z, cx=540, cy=520)
        
        if sub_f < 3:
            im = apply_motion_blur_y(im, int(-(3 - sub_f) * 30))
        elif sub_f >= 69:
            im = apply_motion_blur_y(im, int((sub_f - 68) * 35))
            
        arr = np.array(im)
        flash = max(0.0, 1.0 - (sub_f / 3.5))
        if 48 <= sub_f <= 51:
            flash = max(flash, 0.75 * (1.0 - (sub_f - 48) / 3.0))
        arr = apply_flash(arr, flash)
        
        chroma = 16.0 * math.exp(-sub_f * 0.18)
        if 48 <= sub_f <= 53:
            chroma = max(chroma, 20.0)
        arr = apply_clean_spectral_prism(arr, chroma)
        arr = apply_cinebloom(arr, 0.26)

    # ---------------------------------------------------------------------
    # SHOT 5: EXTREME CLOSE-UP — SMILES WITH CLOSED EYES (Frames 216 .. 287 | 3.58s .. 4.78s)
    # Joyful closed-eyes smile, warm light leak, glossy highlight bloom
    # ---------------------------------------------------------------------
    elif f < 288:
        sub_f = f - 216
        p = sub_f / 72.0
        z = 1.30 + 0.06 * p
        im = zoom_push(im, z, cx=540, cy=440)
        
        # Warm golden light leak over closed-eyes smile
        if sub_f < 20:
            leak_prog = 0.3 + 0.4 * (sub_f / 20.0)
            leak_int = 0.75 * (1.0 - sub_f / 20.0)
            im = apply_light_leak(im, progress=leak_prog, intensity=leak_int)
            
        if sub_f < 3:
            im = apply_motion_blur_y(im, int(-(3 - sub_f) * 30))
        elif sub_f >= 69:
            im = apply_motion_blur_y(im, int((sub_f - 68) * 35))
            
        arr = np.array(im)
        flash = max(0.0, 1.0 - (sub_f / 3.5))
        arr = apply_flash(arr, flash)
        
        chroma = 14.0 * math.exp(-sub_f * 0.18)
        arr = apply_clean_spectral_prism(arr, chroma)
        arr = apply_cinebloom(arr, 0.30)

    # ---------------------------------------------------------------------
    # SHOT 6: MEDIUM SHOT — PLAYFUL SWAY & HAIR PHYSICS (Frames 288 .. 359 | 4.78s .. 5.98s)
    # Sways side to side, rainbow chromatic fringing on flow
    # ---------------------------------------------------------------------
    elif f < 360:
        sub_f = f - 288
        bounce = 0.05 * math.sin(sub_f * 0.36)
        z = 1.06 + bounce
        im = zoom_push(im, z, cx=540, cy=520)
        
        if sub_f < 3:
            im = apply_motion_blur_y(im, int(-(3 - sub_f) * 30))
        elif sub_f >= 69:
            im = apply_motion_blur_y(im, int((sub_f - 68) * 35))
            
        arr = np.array(im)
        flash = max(0.0, 1.0 - (sub_f / 3.5))
        arr = apply_flash(arr, flash)
        
        chroma = 18.0 * math.exp(-sub_f * 0.16)
        arr = apply_clean_spectral_prism(arr, chroma)
        arr = apply_cinebloom(arr, 0.26)

    # ---------------------------------------------------------------------
    # SHOT 7: RAPID 16TH-NOTE STUTTER PUNCH-INS (Frames 360 .. 419 | 5.98s .. 6.98s)
    # Alternating zoom levels: Medium -> Close-up -> Extreme Close-up
    # ---------------------------------------------------------------------
    elif f < 420:
        sub_f = f - 360
        if sub_f < 20: # Medium shot sway
            z = 1.05
            im = zoom_push(im, z, cx=540, cy=520)
            if sub_f < 2: im = apply_motion_blur_y(im, -25)
        elif sub_f < 40: # Close-up face
            z = 1.20
            im = zoom_push(im, z, cx=540, cy=460)
            if sub_f - 20 < 2: im = apply_motion_blur_y(im, -30)
        else: # Extreme close-up eyes
            z = 1.36
            im = zoom_push(im, z, cx=540, cy=430)
            if sub_f - 40 < 2: im = apply_motion_blur_y(im, -35)
            
        arr = np.array(im)
        # Strobe flashes on the 16th-note hits
        if sub_f % 20 < 3:
            arr = apply_flash(arr, 0.85)
            
        chroma = 18.0 * (1.0 - (sub_f % 20) / 20.0)
        arr = apply_clean_spectral_prism(arr, chroma)
        arr = apply_cinebloom(arr, 0.28)

    # ---------------------------------------------------------------------
    # SHOT 8: 🔥 GRAND CLIMAX DROP — FINGER GESTURE & WINK (Frames 420 .. 479 | 6.98s .. 8.00s)
    # Index finger "one", closed-eyes smile & wink, maximum punch, warm flare finish
    # ---------------------------------------------------------------------
    else:
        fn_f = f - 420 # 0 .. 59
        p = fn_f / 60.0
        # Climax bass punch
        climax_punch = 0.22 * math.exp(-fn_f * 0.12)
        z = 1.10 + climax_punch
        im = zoom_push(im, z, cx=540, cy=480)
        
        # Warm golden light leak closing out the MV
        if fn_f >= 25:
            leak_prog = (fn_f - 25) / 35.0
            leak_int = 0.85 * min(1.0, (fn_f - 25) / 15.0)
            im = apply_light_leak(im, progress=leak_prog, intensity=leak_int)
            
        arr = np.array(im)
        
        # Climax flash & shake
        flash = max(0.0, 1.0 - (fn_f / 5.0))
        arr = apply_flash(arr, flash)
        
        shake = max(0, int(8 - fn_f * 0.4))
        arr = apply_camera_shake(arr, shake)
        
        chroma = 28.0 * math.exp(-fn_f * 0.12)
        arr = apply_clean_spectral_prism(arr, chroma)
        arr = apply_cinebloom(arr, 0.32)
        
        # Clean soft fadeout on the last 12 frames (7.80s .. 8.00s)
        if fn_f >= 48:
            fade = max(0.0, 1.0 - (fn_f - 48) / 11.0)
            arr = (arr.astype(np.float32) * fade).astype(np.uint8)

    # Write raw frame bytes to FFmpeg
    pipe.stdin.write(arr.tobytes())

    if (f + 1) % 60 == 0 or f == TOTAL_FRAMES - 1:
        print(f"  Frame {f+1}/{TOTAL_FRAMES} rendered ({((f+1)/TOTAL_FRAMES)*100:.1f}%)")

pipe.stdin.close()
pipe.wait()
t_render = time.time()
print(f"Video track rendered in {t_render - t_start:.2f}s!")

# Mux with 8s audio
print("Muxing video with 8.0s phonk drop audio...")
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

print(f"Master Live2D MV edit saved to {OUTPUT_MP4} and copied to {DOWNLOAD_MP4}!")

t_end = time.time()
print(f"TOTAL BUILD TIME: {t_end - t_start:.2f}s!")
print("==================================================================")
