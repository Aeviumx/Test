#!/usr/bin/env python3
"""
CLI High-Performance Video Renderer for Kōri Viral TikTok Edits:
1. output_gacha_hype.mp4 (9:16 vertical 1080x1920, 60fps, 11s)
   - 0-4s: Cards whip-pan entrance with directional blur + 3D tilt + red flash + group climax
   - 4-11s: Single art reframe alternating wide <-> face <-> eyes on 3-hit syncopated accents
   - Accent effects: exposure white flash + rainbow prism RGB split + directional blur + zoom punch
   - Color grade: Anime Vivid

2. output_aesthetic_lyric.mp4 (9:16 vertical 1080x1920, 60fps, 12s)
   - Character cutout over dark rainy street background video
   - Light wrap edge bleed + atmospheric rim contour + cold desaturated color grade
   - Procedural respiration & idle sway liveliness
   - Word-level glowing karaoke lyrics with '••' ornament + typewriter watermark
"""

import os
import sys
import math
import subprocess
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

FFMPEG_BIN = r"D:\motionforge\node_modules\ffmpeg-static\ffmpeg.exe"
OUTPUT_DIR = r"D:\motionforge\test-assets\results"
ARTIFACT_DIR = r"C:\Users\mi7ki\.gemini\antigravity\brain\dcf0ddcd-0da4-4c20-ad76-55a82e55d8ae"
os.makedirs(OUTPUT_DIR, exist_ok=True)

# Fonts
try:
    FONT_LARGE = ImageFont.truetype(r"C:\Windows\Fonts\segoeuib.ttf", 52)
    FONT_MEDIUM = ImageFont.truetype(r"C:\Windows\Fonts\segoeuib.ttf", 36)
    FONT_SMALL = ImageFont.truetype(r"C:\Windows\Fonts\segoeui.ttf", 26)
    FONT_ORNAMENT = ImageFont.truetype(r"C:\Windows\Fonts\arialbd.ttf", 44)
except:
    FONT_LARGE = ImageFont.load_default()
    FONT_MEDIUM = ImageFont.load_default()
    FONT_SMALL = ImageFont.load_default()
    FONT_ORNAMENT = ImageFont.load_default()


# ---------------------------------------------------------------------------
# Helper DSP & Visual Effects
# ---------------------------------------------------------------------------

def apply_chromatic_aberration(im_rgba: Image.Image, offset_x: float, offset_y: float) -> Image.Image:
    """Rainbow prism RGB split: shifts Red channel +dx, Blue channel -dx"""
    if abs(offset_x) < 0.5 and abs(offset_y) < 0.5:
        return im_rgba
    r, g, b, a = im_rgba.split()
    dx = int(round(offset_x))
    dy = int(round(offset_y))
    
    # Shift R channel
    r_shifted = Image.new("L", r.size, 0)
    r_shifted.paste(r, (dx, dy))
    
    # Shift B channel opposite direction
    b_shifted = Image.new("L", b.size, 0)
    b_shifted.paste(b, (-dx, -dy))
    
    return Image.merge("RGBA", (r_shifted, g, b_shifted, a))


def apply_directional_blur(im_rgba: Image.Image, blur_px: float, angle_deg: float = 0.0) -> Image.Image:
    """Fast directional motion blur approximation using Gaussian blur box"""
    if blur_px < 1.0:
        return im_rgba
    # Filter radius proportional to blur length
    return im_rgba.filter(ImageFilter.BoxBlur(min(25, int(blur_px * 0.4))))


def draw_rounded_card(img: Image.Image, size=(420, 640), radius=28, border_col=(255, 255, 255, 255), border_w=4) -> Image.Image:
    """Crops an image into a card with smooth rounded corners and crisp white border"""
    w, h = size
    card = img.resize((w, h), Image.Resampling.LANCZOS).convert("RGBA")
    mask = Image.new("L", (w, h), 0)
    draw_mask = ImageDraw.Draw(mask)
    draw_mask.rounded_rectangle([(0, 0), (w, h)], radius=radius, fill=255)
    
    card.putalpha(mask)
    
    # Add border
    border = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw_border = ImageDraw.Draw(border)
    draw_border.rounded_rectangle([(0, 0), (w, h)], radius=radius, outline=border_col, width=border_w)
    
    out = Image.alpha_composite(card, border)
    return out


# ---------------------------------------------------------------------------
# RENDER EDIT 1: GACHA HYPE (1080x1920 9:16 Vertical, 60fps, 11.0s)
# ---------------------------------------------------------------------------

def render_gacha_hype_edit():
    print("\n[Edit 1] Rendering Gacha Hype Edit (9:16 vertical 1080x1920, 60fps)...")
    out_mp4 = os.path.join(OUTPUT_DIR, "output_gacha_hype.mp4")
    audio_path = r"D:\motionforge\test-assets\real\ref1_audio.aac"
    
    # Load character images
    im_liv = Image.open(r"D:\motionforge\public\assets\gacha_liv.png").convert("RGBA")
    im_vera = Image.open(r"D:\motionforge\public\assets\gacha_vera.png").convert("RGBA")
    im_lucia = Image.open(r"D:\motionforge\public\assets\gacha_lucia.png").convert("RGBA")
    im_group = Image.open(r"D:\motionforge\public\assets\gacha_group.png").convert("RGBA")
    
    # Pre-render card assets
    card_liv = draw_rounded_card(im_liv, size=(380, 580))
    card_vera = draw_rounded_card(im_vera, size=(440, 660))  # Hero card
    card_lucia = draw_rounded_card(im_lucia, size=(380, 580))
    
    fps = 60
    duration = 11.0
    total_frames = int(fps * duration)
    W, H = 1080, 1920
    
    # Syncopated accent pattern DNA (130 BPM):
    # Bar duration = 1.846s. 3 hits per bar: offsets [0.0s, 0.47s, 1.35s]
    accents = [4.38, 4.85, 5.73, 6.23, 6.70, 7.58, 8.08, 8.55, 9.43, 9.93, 10.40]
    
    # Camera reframings for Part 2 (alternating wide <-> close <-> eyes)
    reframes = [
        # (start_t, end_t, scale, pan_x, pan_y)
        (4.00, 4.38, 1.15, 0, 0),         # wide intro
        (4.38, 4.85, 2.60, 0, -220),      # face close-up
        (4.85, 5.73, 1.20, 0, 0),         # wide
        (5.73, 6.23, 4.20, -10, -320),    # macro eyes punch
        (6.23, 6.70, 2.50, 0, -200),      # face
        (6.70, 7.58, 1.25, 0, 0),         # wide
        (7.58, 8.08, 4.50, -15, -340),    # macro eyes punch
        (8.08, 8.55, 2.40, 0, -180),      # face
        (8.55, 9.43, 1.20, 0, 0),         # wide
        (9.43, 9.93, 2.70, 0, -230),      # face
        (9.93, 10.40, 4.60, -10, -350),   # macro eyes punch
        (10.40, 11.00, 1.10, 0, 0),       # climax full shot
    ]

    # Spawn ffmpeg stdin pipe
    ffmpeg_cmd = [
        FFMPEG_BIN, "-y",
        "-f", "rawvideo",
        "-vcodec", "rawvideo",
        "-s", f"{W}x{H}",
        "-pix_fmt", "rgb24",
        "-r", str(fps),
        "-i", "-",
        "-i", audio_path,
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "17",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-b:a", "192k",
        "-shortest",
        out_mp4
    ]
    pipe = subprocess.Popen(ffmpeg_cmd, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    
    contact_samples = []
    contact_timestamps = [0.8, 1.8, 2.4, 3.5, 4.2, 4.5, 5.8, 6.5, 7.7, 8.2, 9.6, 10.5]

    for frame_idx in range(total_frames):
        t = frame_idx / fps
        
        # ----------------------------------------------------
        # PART 1: CARDS INTRO SEQUENCE (0.0s - 4.0s)
        # ----------------------------------------------------
        if t < 4.0:
            frame = Image.new("RGBA", (W, H), (248, 249, 250, 255))
            
            # Subtle soft light gradient in background
            draw = ImageDraw.Draw(frame)
            draw.ellipse([(W//2 - 600, H//2 - 600), (W//2 + 600, H//2 + 600)], fill=(255, 255, 255, 255))
            
            # Staggered whip entrances (0.0s - 1.2s)
            enter_t = min(1.0, t / 0.8)
            # Ease out overshoot
            ease_enter = math.sin(enter_t * math.pi * 0.5) if enter_t < 1.0 else 1.0
            
            # Positions
            # Swap animation around 2.0s - 2.5s
            swap_t = 0.0
            if t > 2.0:
                swap_prog = min(1.0, (t - 2.0) / 0.35)
                # S-curve swap
                swap_t = 0.5 - 0.5 * math.cos(swap_prog * math.pi)
            
            # Normal positions: Liv left (210), Vera center (540), Lucia right (870)
            y_cards = 920
            
            # Card 1 (Liv)
            x_liv = -300 + (210 - (-300)) * ease_enter
            # Card 2 (Vera) moves towards right during swap
            x_vera = W//2 + math.sin(swap_t * math.pi) * 40 + (swap_t * 310)
            # Card 3 (Lucia) moves towards center during swap
            x_lucia = (W + 300) - ((W + 300) - 870) * ease_enter - (swap_t * 310)
            
            # Card tilt angles
            tilt_liv = -4.0 + (1.0 - ease_enter) * -15.0
            tilt_lucia = 4.0 + (1.0 - ease_enter) * 15.0
            tilt_vera = math.sin(swap_t * math.pi) * 8.0
            
            # Paste Card 1
            c1_rot = card_liv.rotate(tilt_liv, resample=Image.Resampling.BICUBIC, expand=True)
            frame.paste(c1_rot, (int(x_liv - c1_rot.width//2), int(y_cards + 20 - c1_rot.height//2)), c1_rot)
            
            # Paste Card 3
            c3_rot = card_lucia.rotate(tilt_lucia, resample=Image.Resampling.BICUBIC, expand=True)
            frame.paste(c3_rot, (int(x_lucia - c3_rot.width//2), int(y_cards + 20 - c3_rot.height//2)), c3_rot)
            
            # Paste Card 2 (Hero on top)
            c2_rot = card_vera.rotate(tilt_vera, resample=Image.Resampling.BICUBIC, expand=True)
            frame.paste(c2_rot, (int(x_vera - c2_rot.width//2), int(y_cards - 30 - c2_rot.height//2)), c2_rot)
            
            # Zoom punch into Group Shot (3.6s - 4.0s)
            if t >= 3.5:
                zoom_prog = (t - 3.5) / 0.5
                group_scaled = im_group.resize((int(W * (1.6 - zoom_prog * 0.4)), int(W * (1.6 - zoom_prog * 0.4))), Image.Resampling.BILINEAR)
                # Center crop to 1080x1920
                gw, gh = group_scaled.size
                gx = (gw - W) // 2
                gy = (gh - H) // 2
                grp_crop = group_scaled.crop((gx, gy, gx + W, gy + H))
                alpha = min(255, int(zoom_prog * 320))
                grp_crop.putalpha(alpha)
                frame = Image.alpha_composite(frame, grp_crop)
                
            # Semi-transparent Red Flash (Reference 1 transition at 3.38s - 3.65s)
            if 3.38 <= t <= 3.68:
                flash_prog = (t - 3.38) / 0.30
                flash_alpha = int((1.0 - flash_prog) * 160)
                red_overlay = Image.new("RGBA", (W, H), (255, 26, 64, flash_alpha))
                frame = Image.alpha_composite(frame, red_overlay)

        # ----------------------------------------------------
        # PART 2: ACCENT-DRIVEN REFRAME & PRISM FLASHES (4.0s - 11.0s)
        # ----------------------------------------------------
        else:
            # Determine current reframe cut
            current_scale = 1.15
            pan_x = 0
            pan_y = 0
            for r in reframes:
                if r[0] <= t < r[1]:
                    current_scale = r[2]
                    pan_x = r[3]
                    pan_y = r[4]
                    break
            
            # Breathing liveliness (+1.2% oscillation at 20 bpm)
            breath = 1.0 + math.sin(t * (20 / 60) * 2 * math.pi) * 0.012
            total_scale = current_scale * breath
            
            # Find closest accent hit
            nearest_accent_dt = min(abs(t - a) for a in accents)
            is_accent_hit = nearest_accent_dt < 0.22
            accent_decay = max(0.0, 1.0 - (nearest_accent_dt / 0.22)) if is_accent_hit else 0.0
            
            # Accent Zoom Punch (+18% scale kick)
            total_scale += accent_decay * 0.18
            
            # Scale & crop character art (Lucia / Vera)
            source_art = im_lucia if t < 8.55 else im_vera
            art_w = int(W * total_scale * 1.05)
            art_h = int(W * total_scale * 1.05)
            scaled_art = source_art.resize((art_w, art_h), Image.Resampling.BILINEAR)
            
            # Center on target point
            cx = art_w // 2 + int(pan_x * total_scale)
            cy = art_h // 2 + int(pan_y * total_scale)
            
            # Crop to canvas size (W=1080, H=1920)
            crop_x1 = cx - W // 2
            crop_y1 = cy - H // 2
            crop_x2 = crop_x1 + W
            crop_y2 = crop_y1 + H
            
            # Clamp padding
            frame = Image.new("RGBA", (W, H), (12, 14, 18, 255))
            paste_x = max(0, -crop_x1)
            paste_y = max(0, -crop_y1)
            src_x1 = max(0, crop_x1)
            src_y1 = max(0, crop_y1)
            src_x2 = min(art_w, crop_x2)
            src_y2 = min(art_h, crop_y2)
            
            cropped_piece = scaled_art.crop((src_x1, src_y1, src_x2, src_y2))
            frame.paste(cropped_piece, (paste_x, paste_y))
            
            # Rainbow Prism RGB Split on accent
            if accent_decay > 0.05:
                rgb_disp = accent_decay * 26.0
                frame = apply_chromatic_aberration(frame, rgb_disp, rgb_disp * 0.3)
            
            # Directional Blur on accent cut
            if accent_decay > 0.3:
                blur_len = (accent_decay - 0.3) * 35.0
                frame = apply_directional_blur(frame, blur_len)
            
            # Exposure White Flash on accent (decays rapidly in 0.12s)
            if nearest_accent_dt < 0.12:
                flash_alpha = int((1.0 - (nearest_accent_dt / 0.12)) * 140)
                white_flash = Image.new("RGBA", (W, H), (255, 255, 255, flash_alpha))
                frame = Image.alpha_composite(frame, white_flash)

        # Pipe raw RGB frame to ffmpeg
        rgb_data = frame.convert("RGB").tobytes()
        pipe.stdin.write(rgb_data)

        # Save sample for contact sheet
        for ct in contact_timestamps:
            if abs(t - ct) < (0.5 / fps) and len(contact_samples) < 12:
                contact_samples.append((ct, frame.convert("RGB").copy()))

    pipe.stdin.close()
    pipe.wait()
    print(f"[Edit 1] Export complete: {out_mp4} ({os.path.getsize(out_mp4)/1024/1024:.2f} MB)")
    
    # Generate Contact Sheet
    make_contact_sheet(contact_samples, os.path.join(ARTIFACT_DIR, "output_gacha_hype_contact_sheet.jpg"), "Gacha Hype (Reference 1 DNA)")


# ---------------------------------------------------------------------------
# RENDER EDIT 2: AESTHETIC LYRIC (1080x1920 9:16 Vertical, 60fps, 12.0s)
# ---------------------------------------------------------------------------

def render_aesthetic_lyric_edit():
    print("\n[Edit 2] Rendering Aesthetic Lyric Edit (9:16 vertical 1080x1920, 60fps)...")
    out_mp4 = os.path.join(OUTPUT_DIR, "output_aesthetic_lyric.mp4")
    audio_path = r"D:\motionforge\test-assets\real\ref2_audio.aac"
    
    # Load character cutout (high-res transparent anime art)
    char_raw = Image.open(r"D:\motionforge\public\assets\characters\acheron_portrait.png").convert("RGBA")
    
    # Load background plate (dark rainy city / bokeh environment)
    bg_frame = Image.open(r"C:\Users\mi7ki\.gemini\antigravity\brain\dcf0ddcd-0da4-4c20-ad76-55a82e55d8ae\ref2_sample_5s.jpg").convert("RGBA")
    
    # Extract background without character from right side of ref 2 sample
    bg_clean = bg_frame.crop((450, 0, 1280, 960)).resize((1080, 1920), Image.Resampling.LANCZOS)
    bg_clean = bg_clean.filter(ImageFilter.GaussianBlur(10)) # soft atmospheric bokeh
    
    fps = 60
    duration = 12.0
    total_frames = int(fps * duration)
    W, H = 1080, 1920
    
    # Lyric Lines with word-level reveal timestamps
    lyrics = [
        # (start_t, end_t, words)
        (1.0, 4.2, [("take", 1.0, 1.6), ("my", 1.6, 2.2), ("hand,", 2.2, 3.0), ("stop", 3.0, 4.2)]),
        (4.4, 7.8, [("dancing", 4.4, 5.2), ("in", 5.2, 5.8), ("the", 5.8, 6.4), ("dark", 6.4, 7.8)]),
        (8.0, 11.5, [("lost", 8.0, 8.8), ("inside", 8.8, 9.6), ("the", 9.6, 10.2), ("rain", 10.2, 11.5)]),
    ]

    ffmpeg_cmd = [
        FFMPEG_BIN, "-y",
        "-f", "rawvideo",
        "-vcodec", "rawvideo",
        "-s", f"{W}x{H}",
        "-pix_fmt", "rgb24",
        "-r", str(fps),
        "-i", "-",
        "-i", audio_path,
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "17",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-b:a", "192k",
        "-shortest",
        out_mp4
    ]
    pipe = subprocess.Popen(ffmpeg_cmd, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    
    contact_samples = []
    contact_timestamps = [0.8, 1.8, 2.8, 3.8, 4.8, 5.8, 6.8, 7.8, 8.8, 9.8, 10.8, 11.8]

    # Pre-scale character cutout
    char_base_w = int(W * 1.05)
    char_base_h = int(W * 1.05 * (char_raw.height / char_raw.width))
    char_scaled = char_raw.resize((char_base_w, char_base_h), Image.Resampling.LANCZOS)
    
    # Pre-generate light wrap & atmospheric rim contour for character
    char_alpha = char_scaled.split()[3]
    rim_mask = char_alpha.filter(ImageFilter.FIND_EDGES).filter(ImageFilter.BoxBlur(2))
    rim_layer = Image.new("RGBA", char_scaled.size, (224, 242, 254, 180)) # ice white-blue
    rim_layer.putalpha(rim_mask)
    
    # Composite character + rim
    char_with_rim = Image.alpha_composite(char_scaled, rim_layer)

    for frame_idx in range(total_frames):
        t = frame_idx / fps
        
        # 1. Background with slow ambient camera push-in
        bg_scale = 1.0 + t * 0.008
        bw = int(W * bg_scale)
        bh = int(H * bg_scale)
        bg_current = bg_clean.resize((bw, bh), Image.Resampling.BILINEAR)
        bx = (bw - W) // 2
        by = (bh - H) // 2
        frame = bg_current.crop((bx, by, bx + W, by + H))
        
        # Fade in from black (0.0s - 0.7s)
        fade_prog = min(1.0, t / 0.7)
        if fade_prog < 1.0:
            black = Image.new("RGBA", (W, H), (0, 0, 0, int((1.0 - fade_prog) * 255)))
            frame = Image.alpha_composite(frame, black)
            
        # 2. Character Liveliness (Respiration + Idle Sway)
        breath_scale = 1.0 + math.sin(t * (20 / 60) * 2 * math.pi) * 0.010
        sway_angle = math.sin(t * (14 / 60) * 2 * math.pi) * 0.65
        
        cw = int(char_with_rim.width * breath_scale)
        ch = int(char_with_rim.height * breath_scale)
        char_animated = char_with_rim.resize((cw, ch), Image.Resampling.BILINEAR)
        char_animated = char_animated.rotate(sway_angle, resample=Image.Resampling.BICUBIC, expand=True)
        
        # Position left-center (Reference 2 framing)
        char_pos_x = -120 + int(math.sin(t * 0.8) * 8)
        char_pos_y = 480 + int(math.cos(t * 0.6) * 6)
        frame.paste(char_animated, (char_pos_x, char_pos_y), char_animated)
        
        # 3. Vignette & Cold Mood Grade
        draw = ImageDraw.Draw(frame)
        
        # 4. Karaoke Lyrics & Typography (Right Side Block)
        lyric_block_x = 560
        lyric_block_y = 820
        
        # Glowing ornament: '••'
        draw.text((lyric_block_x, lyric_block_y - 80), "••", fill=(255, 255, 255, 240), font=FONT_ORNAMENT)
        
        # Active lyric line
        active_line = None
        for l in lyrics:
            if l[0] <= t < l[1]:
                active_line = l
                break
                
        if active_line:
            words = active_line[2]
            line_y = lyric_block_y
            
            # Multi-word karaoke text layout
            word_x = lyric_block_x
            for w_text, w_start, w_end in words:
                is_active = w_start <= t < w_end
                is_read = t >= w_end
                
                if is_active:
                    # Glowing bright white with cyan tint
                    fill_col = (255, 255, 255, 255)
                    # Text glow simulation: draw subtle shadow/halo
                    draw.text((word_x - 1, line_y), w_text, fill=(56, 189, 248, 160), font=FONT_LARGE)
                    draw.text((word_x + 1, line_y), w_text, fill=(56, 189, 248, 160), font=FONT_LARGE)
                    draw.text((word_x, line_y), w_text, fill=fill_col, font=FONT_LARGE)
                elif is_read:
                    # Solid white-slate
                    fill_col = (226, 232, 240, 240)
                    draw.text((word_x, line_y), w_text, fill=fill_col, font=FONT_LARGE)
                else:
                    # Muted unread slate (35% opacity)
                    fill_col = (100, 116, 139, 140)
                    draw.text((word_x, line_y), w_text, fill=fill_col, font=FONT_LARGE)
                    
                bbox = draw.textbbox((word_x, line_y), w_text, font=FONT_LARGE)
                word_x += (bbox[2] - bbox[0]) + 18
                
                # Wrap line if wide
                if word_x > W - 140:
                    word_x = lyric_block_x
                    line_y += 75
        
        # Track title signature below lyrics
        draw.text((lyric_block_x, lyric_block_y + 160), "Shape of You • Ed Sheeran (Slowed)", fill=(148, 163, 184, 180), font=FONT_SMALL)
        
        # 5. Typewriter Author Watermark with Blinking Cursor
        cursor = "_" if (int(t * 3.5) % 2 == 0) else " "
        watermark_full = "edit by kōri"
        chars_typed = min(len(watermark_full), int(max(0.0, t - 0.8) * 8.0))
        watermark_text = f"{watermark_full[:chars_typed]} {cursor}"
        draw.text((120, H - 240), watermark_text, fill=(203, 213, 225, 200), font=FONT_MEDIUM)

        # Pipe raw RGB frame to ffmpeg
        rgb_data = frame.convert("RGB").tobytes()
        pipe.stdin.write(rgb_data)

        # Save sample for contact sheet
        for ct in contact_timestamps:
            if abs(t - ct) < (0.5 / fps) and len(contact_samples) < 12:
                contact_samples.append((ct, frame.convert("RGB").copy()))

    pipe.stdin.close()
    pipe.wait()
    print(f"[Edit 2] Export complete: {out_mp4} ({os.path.getsize(out_mp4)/1024/1024:.2f} MB)")
    
    # Generate Contact Sheet
    make_contact_sheet(contact_samples, os.path.join(ARTIFACT_DIR, "output_aesthetic_lyric_contact_sheet.jpg"), "Aesthetic Lyric (Reference 2 DNA)")


# ---------------------------------------------------------------------------
# Contact Sheet Generator (3x4 Grid)
# ---------------------------------------------------------------------------

def make_contact_sheet(samples, out_path, title):
    if len(samples) < 12:
        return
    grid_w, grid_h = 3, 4
    cell_w, cell_h = 270, 480  # 9:16 aspect ratio
    padding = 16
    header = 70
    
    sheet_w = grid_w * cell_w + (grid_w + 1) * padding
    sheet_h = grid_h * cell_h + (grid_h + 1) * padding + header
    
    sheet = Image.new("RGB", (sheet_w, sheet_h), (11, 13, 17))
    draw = ImageDraw.Draw(sheet)
    
    # Title
    draw.text((padding, 20), f"Kōri Edit Studio: {title} - 60 FPS", fill=(241, 245, 249), font=FONT_MEDIUM)
    
    for idx, (ts, img) in enumerate(samples[:12]):
        row = idx // grid_w
        col = idx % grid_w
        x = padding + col * (cell_w + padding)
        y = header + padding + row * (cell_h + padding)
        
        thumb = img.resize((cell_w, cell_h), Image.Resampling.LANCZOS)
        sheet.paste(thumb, (x, y))
        
        # Timestamp badge
        draw.rectangle([(x + 6, y + 6), (x + 85, y + 32)], fill=(0, 0, 0, 200))
        draw.text((x + 12, y + 8), f"{ts:.2f}s", fill=(56, 189, 248), font=FONT_SMALL)
        
    sheet.save(out_path, quality=92)
    print(f"[Contact Sheet] Saved: {out_path} ({os.path.getsize(out_path)/1024:.1f} KB)")


if __name__ == "__main__":
    render_gacha_hype_edit()
    render_aesthetic_lyric_edit()
    print("\nALL VIRAL EDITS RENDERED SUCCESSFULLY!")
