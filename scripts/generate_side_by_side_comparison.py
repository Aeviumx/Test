import os
import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = r"D:\motionforge"
REF_DIR = os.path.join(ROOT, "test-assets", "real", "refs")
RES_DIR = os.path.join(ROOT, "test-assets", "results")

REF1_PATH = os.path.join(REF_DIR, "ref_01_gacha_hype.mp4")
EDIT1_PATH = os.path.join(RES_DIR, "output_gacha_hype_v2.mp4")

REF2_PATH = os.path.join(REF_DIR, "ref_02_aesthetic_lyric.mp4")
EDIT2_PATH = os.path.join(RES_DIR, "output_aesthetic_lyric_v2.mp4")

OUT_COMPARE_GACHA = os.path.join(RES_DIR, "comparison_gacha_hype_ref_vs_v2.jpg")
OUT_COMPARE_LYRIC = os.path.join(RES_DIR, "comparison_aesthetic_lyric_ref_vs_v2.jpg")

try:
    FONT_TITLE = ImageFont.truetype(r"C:\Windows\Fonts\segoeuib.ttf", 36)
    FONT_LABEL = ImageFont.truetype(r"C:\Windows\Fonts\segoeuib.ttf", 26)
    FONT_SUB = ImageFont.truetype(r"C:\Windows\Fonts\segoeui.ttf", 20)
except:
    FONT_TITLE = ImageFont.load_default()
    FONT_LABEL = ImageFont.load_default()
    FONT_SUB = ImageFont.load_default()

def extract_frame_at(video_path: str, timestamp_s: float, target_w=360, target_h=640) -> Image.Image:
    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 60.0
    frame_no = int(round(timestamp_s * fps))
    cap.set(cv2.CAP_PROP_POS_FRAMES, frame_no)
    ret, frame = cap.read()
    cap.release()
    if not ret or frame is None:
        return Image.new("RGB", (target_w, target_h), (30, 30, 30))
    # Resize to target
    resized = cv2.resize(frame, (target_w, target_h), interpolation=cv2.INTER_AREA)
    rgb = cv2.cvtColor(resized, cv2.COLOR_BGR2RGB)
    return Image.fromarray(rgb)

def build_comparison_image(
    ref_path: str,
    edit_path: str,
    timestamps: list,
    titles: list,
    main_title: str,
    out_path: str
):
    print(f"\nBuilding comparison image: {out_path}...")
    thumb_w, thumb_h = 360, 640
    padding = 16
    header_h = 80
    row_label_w = 180
    
    total_w = row_label_w + len(timestamps) * (thumb_w + padding) + padding
    total_h = header_h + 2 * (thumb_h + padding) + padding
    
    canvas = Image.new("RGB", (total_w, total_h), (11, 15, 25))
    draw = ImageDraw.Draw(canvas)
    
    # Header Title
    draw.text((24, 20), main_title, fill=(255, 255, 255), font=FONT_TITLE)
    
    # Row Labels
    ref_y = header_h + padding
    edit_y = header_h + thumb_h + 2 * padding
    
    draw.text((24, ref_y + thumb_h // 2 - 20), "REFERENCE\n(Top)", fill=(251, 146, 60), font=FONT_LABEL)
    draw.text((24, edit_y + thumb_h // 2 - 20), "KŌRI EDIT v2\n(Bottom)", fill=(56, 189, 248), font=FONT_LABEL)
    
    for col_idx, (ts, title) in enumerate(zip(timestamps, titles)):
        col_x = row_label_w + col_idx * (thumb_w + padding)
        
        # Column title badge
        draw.text((col_x, header_h - 28), f"M{col_idx+1}: {title} (t={ts:.2f}s)", fill=(226, 232, 240), font=FONT_SUB)
        
        # Reference frame (Top)
        ref_frame = extract_frame_at(ref_path, ts, thumb_w, thumb_h)
        canvas.paste(ref_frame, (col_x, ref_y))
        
        # Edit frame (Bottom)
        edit_frame = extract_frame_at(edit_path, ts, thumb_w, thumb_h)
        canvas.paste(edit_frame, (col_x, edit_y))
        
        # Outlines
        draw.rectangle([(col_x, ref_y), (col_x + thumb_w, ref_y + thumb_h)], outline=(251, 146, 60), width=2)
        draw.rectangle([(col_x, edit_y), (col_x + thumb_w, edit_y + thumb_h)], outline=(56, 189, 248), width=2)
        
    canvas.save(out_path, quality=94)
    print(f"Saved comparison to {out_path} ({os.path.getsize(out_path)/1024:.1f} KB)")

def main():
    # 1. Gacha Comparison (4 key moments)
    # M1: 1.0s (Intro card sliding motion)
    # M2: 3.5s (Pre-drop card swap / bounce)
    # M3: 4.5s (Drop transient punch & white flash)
    # M4: 6.4s (Macro eyes punch & chromatic aberration)
    gacha_ts = [1.00, 3.50, 4.50, 6.44]
    gacha_titles = ["Intro Cards Hook", "Pre-Drop Build", "Drop Transient Hit", "Macro Eyes Punch"]
    build_comparison_image(
        REF1_PATH, EDIT1_PATH,
        gacha_ts, gacha_titles,
        "GACHA HYPE EDIT • Frame-by-Frame Comparison (Reference vs Kōri v2)",
        OUT_COMPARE_GACHA
    )
    
    # 2. Lyric Comparison (4 key moments)
    # M1: 1.5s (Scene entrance / rainy bokeh background)
    # M2: 4.5s (Bold typography & active word glow)
    # M3: 7.8s (Light wrap bleed & match color)
    # M4: 12.8s (Camera push-in & word reveal)
    lyric_ts = [1.50, 4.50, 7.80, 12.80]
    lyric_titles = ["Rainy Atmosphere", "Bold Montserrat Typography", "Light Wrap & Match Color", "Push-in & Word Reveal"]
    build_comparison_image(
        REF2_PATH, EDIT2_PATH,
        lyric_ts, lyric_titles,
        "AESTHETIC LYRIC EDIT • Frame-by-Frame Comparison (Reference vs Kōri v2)",
        OUT_COMPARE_LYRIC
    )

if __name__ == "__main__":
    main()
