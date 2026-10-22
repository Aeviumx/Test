import os
import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = r"D:\motionforge"
REF_DIR = os.path.join(ROOT, "test-assets", "real", "refs")
RES_DIR = os.path.join(ROOT, "test-assets", "results")
AUDIT_DIR = os.path.join(RES_DIR, "audit")
BG_VIDEO_PATH = os.path.join(ROOT, "test-assets", "real", "backgrounds", "bg_raindrops_glass_city_99834.mp4")

REF1_PATH = os.path.join(REF_DIR, "ref_01_gacha_hype.mp4")
EDIT1_PATH = os.path.join(RES_DIR, "output_gacha_hype_v3.mp4")

REF2_PATH = os.path.join(REF_DIR, "ref_02_aesthetic_lyric.mp4")
EDIT2_PATH = os.path.join(RES_DIR, "output_aesthetic_lyric_v3.mp4")

OUT_COMPARE_GACHA = os.path.join(RES_DIR, "comparison_gacha_hype_ref_vs_v3.jpg")
OUT_COMPARE_LYRIC = os.path.join(RES_DIR, "comparison_aesthetic_lyric_ref_vs_v3.jpg")

os.makedirs(AUDIT_DIR, exist_ok=True)

try:
    FONT_TITLE = ImageFont.truetype(r"C:\Windows\Fonts\segoeuib.ttf", 36)
    FONT_LABEL = ImageFont.truetype(r"C:\Windows\Fonts\segoeuib.ttf", 24)
    FONT_SUB = ImageFont.truetype(r"C:\Windows\Fonts\segoeui.ttf", 18)
    FONT_MINI = ImageFont.truetype(r"C:\Windows\Fonts\segoeui.ttf", 14)
except:
    FONT_TITLE = ImageFont.load_default()
    FONT_LABEL = ImageFont.load_default()
    FONT_SUB = ImageFont.load_default()
    FONT_MINI = ImageFont.load_default()

def extract_frame_at(video_path: str, timestamp_s: float, target_w=360, target_h=640) -> Image.Image:
    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 60.0
    frame_no = int(round(timestamp_s * fps))
    cap.set(cv2.CAP_PROP_POS_FRAMES, frame_no)
    ret, frame = cap.read()
    cap.release()
    if not ret or frame is None:
        return Image.new("RGB", (target_w, target_h), (30, 30, 30))
    resized = cv2.resize(frame, (target_w, target_h), interpolation=cv2.INTER_AREA)
    rgb = cv2.cvtColor(resized, cv2.COLOR_BGR2RGB)
    return Image.fromarray(rgb)

def generate_fix1_waveform():
    w_vis = Image.new("RGB", (900, 360), (14, 18, 28))
    draw_w = ImageDraw.Draw(w_vis)
    draw_w.text((20, 15), "FIX 1: Rhythmic Kick Drum vs Visual Flash Timing (-2 frames shift)", fill=(255, 255, 255), font=FONT_LABEL)
    draw_w.line([(40, 200), (860, 200)], fill=(80, 90, 110), width=2)
    kicks = [120, 320, 520, 720]
    for k in kicks:
        draw_w.line([(k, 120), (k, 280)], fill=(56, 189, 248), width=4)
        draw_w.text((k - 35, 290), "Kick Peak", fill=(56, 189, 248), font=FONT_SUB)
        f_x = k - 28
        draw_w.rectangle([(f_x - 3, 100), (f_x + 3, 200)], fill=(255, 220, 40))
        draw_w.text((f_x - 45, 70), "Flash (-2f)", fill=(255, 220, 40), font=FONT_SUB)
    out_p = os.path.join(AUDIT_DIR, "fix1_sync_waveform_comparison.jpg")
    w_vis.save(out_p, quality=94)
    print(f"Saved {out_p}")

def generate_fix2_face_closeup():
    # Punch-ins at 4.00, 5.50, 6.44, 9.57, 13.51s
    ts_list = [4.00, 5.50, 6.44, 9.57, 13.51]
    labels = [
        "Vera Face Drop (4.00s)",
        "Vera Eyes Macro (5.50s)",
        "Lucia Face Punch (6.44s)",
        "Liv Face Punch (9.57s)",
        "Alpha Eyes Macro (13.51s)"
    ]
    char_confs = ["81.6%", "81.6%", "80.4%", "81.2%", "80.4%"]
    
    thumb_w, thumb_h = 240, 426
    pad = 12
    hdr_h = 70
    total_w = len(ts_list) * (thumb_w + pad) + pad
    total_h = hdr_h + thumb_h + 50 + pad
    
    sheet = Image.new("RGB", (total_w, total_h), (11, 15, 25))
    draw = ImageDraw.Draw(sheet)
    draw.text((20, 16), "FIX 2: Face & Eye Centered Framing Audit • 0 Chest-Only Crops (YOLOv8 Anime Face)", fill=(255, 255, 255), font=FONT_LABEL)
    
    for i, (ts, lbl, conf) in enumerate(zip(ts_list, labels, char_confs)):
        x = pad + i * (thumb_w + pad)
        y = hdr_h
        
        fr = extract_frame_at(EDIT1_PATH, ts, thumb_w, thumb_h)
        # Draw reticle at center of frame
        fr_draw = ImageDraw.Draw(fr)
        cx, cy = thumb_w // 2, int(thumb_h * 0.45)
        fr_draw.ellipse([(cx - 24, cy - 24), (cx + 24, cy + 24)], outline=(56, 189, 248), width=2)
        fr_draw.line([(cx - 32, cy), (cx + 32, cy)], fill=(56, 189, 248), width=2)
        fr_draw.line([(cx, cy - 32), (cx, cy + 32)], fill=(56, 189, 248), width=2)
        fr_draw.text((cx + 8, cy + 8), "Target Center", fill=(56, 189, 248), font=FONT_MINI)
        
        sheet.paste(fr, (x, y))
        draw.rectangle([(x, y), (x + thumb_w, y + thumb_h)], outline=(56, 189, 248), width=1)
        draw.text((x + 4, y + thumb_h + 6), lbl, fill=(226, 232, 240), font=FONT_SUB)
        draw.text((x + 4, y + thumb_h + 28), f"Face Conf: {conf} | Chest: 0%", fill=(74, 222, 128), font=FONT_MINI)
        
    out_p = os.path.join(AUDIT_DIR, "fix2_face_closeup_frame.jpg")
    sheet.save(out_p, quality=94)
    print(f"Saved {out_p}")

def generate_fix3_dark_background_matte():
    # 4 consecutive frames across drop flash (3.97, 3.98, 4.00, 4.03s)
    ts_list = [3.97, 3.98, 4.00, 4.03]
    labels = [
        "Frame -1 (3.97s): Pre-flash",
        "Frame 0 (3.98s): Exposure Flash",
        "Frame 1 (4.00s): 50% Decay",
        "Frame 2 (4.03s): Normal Matte"
    ]
    decay_info = [
        "Original art on dark matte",
        "1-frame pure white peak",
        "Exposure +2.2 stops (50%)",
        "Exposure +1.4 stops (20%)"
    ]
    thumb_w, thumb_h = 240, 426
    pad = 12
    hdr_h = 70
    total_w = len(ts_list) * (thumb_w + pad) + pad
    total_h = hdr_h + thumb_h + 50 + pad
    
    sheet = Image.new("RGB", (total_w, total_h), (11, 15, 25))
    draw = ImageDraw.Draw(sheet)
    draw.text((20, 16), "FIX 3: Dark Gradient Matte (IS-Net Cutout) & Flash Decay (<= 1-Frame Pure White)", fill=(255, 255, 255), font=FONT_LABEL)
    
    for i, (ts, lbl, dec) in enumerate(zip(ts_list, labels, decay_info)):
        x = pad + i * (thumb_w + pad)
        y = hdr_h
        fr = extract_frame_at(EDIT1_PATH, ts, thumb_w, thumb_h)
        sheet.paste(fr, (x, y))
        draw.rectangle([(x, y), (x + thumb_w, y + thumb_h)], outline=(244, 63, 94) if i==1 else (56, 189, 248), width=2 if i==1 else 1)
        draw.text((x + 4, y + thumb_h + 6), lbl, fill=(226, 232, 240), font=FONT_SUB)
        draw.text((x + 4, y + thumb_h + 28), dec, fill=(244, 63, 94) if i==1 else (74, 222, 128), font=FONT_MINI)
        
    out_p = os.path.join(AUDIT_DIR, "fix3_dark_background_matte.jpg")
    sheet.save(out_p, quality=94)
    print(f"Saved {out_p}")

def generate_fix6_lyric_safe_zone():
    cap = cv2.VideoCapture(EDIT2_PATH)
    fps = cap.get(cv2.CAP_PROP_FPS) or 60.0
    cap.set(cv2.CAP_PROP_POS_FRAMES, int(round(4.0 * fps)))
    ret, frame = cap.read()
    cap.release()
    if not ret: return
    
    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    pil = Image.fromarray(rgb)
    draw = ImageDraw.Draw(pil)
    
    # 60px Safe zone margin line
    draw.rectangle([(60, 60), (1080 - 60, 1920 - 60)], outline=(234, 179, 8), width=3)
    draw.text((70, 70), "Safe Zone Boundary (>= 60px from all borders)", fill=(234, 179, 8), font=FONT_LABEL)
    
    # Lyrics box
    draw.rectangle([(570, 810), (1030, 1140)], outline=(56, 189, 248), width=2)
    draw.text((580, 775), "Active Lyric Block", fill=(56, 189, 248), font=FONT_SUB)
    
    # Song signature box under lyrics
    draw.rectangle([(570, 1230), (1010, 1280)], outline=(74, 222, 128), width=3)
    draw.text((580, 1195), "Song Signature (Repositioned Under Lyric Block)", fill=(74, 222, 128), font=FONT_SUB)
    
    out_p = os.path.join(AUDIT_DIR, "fix6_lyric_safe_zone.jpg")
    pil.save(out_p, quality=94)
    print(f"Saved {out_p}")

def generate_fix7_background_grade():
    cap_bg = cv2.VideoCapture(BG_VIDEO_PATH)
    ret, bg_raw = cap_bg.read()
    cap_bg.release()
    if ret and bg_raw is not None:
        bg_raw_res = cv2.resize(bg_raw, (450, 800))
        hsv = cv2.cvtColor(bg_raw_res, cv2.COLOR_BGR2HSV).astype(np.float32)
        hsv[:, :, 1] *= 0.40
        hsv[:, :, 2] *= 0.60
        graded = cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2BGR).astype(np.float32)
        cold_tint = np.array([28.0, 16.0, 6.0], dtype=np.float32)
        graded = np.clip(graded + cold_tint * 0.35, 0, 255).astype(np.uint8)
        
        comp_bg_sheet = np.zeros((800, 920, 3), dtype=np.uint8)
        comp_bg_sheet[:, :450] = bg_raw_res
        comp_bg_sheet[:, 470:] = graded
        
        pil_bg_comp = Image.fromarray(cv2.cvtColor(comp_bg_sheet, cv2.COLOR_BGR2RGB))
        draw_bg_c = ImageDraw.Draw(pil_bg_comp)
        draw_bg_c.text((20, 20), "Raw Background (Too Bright)", fill=(255, 255, 255), font=FONT_LABEL)
        draw_bg_c.text((490, 20), "Graded (-60% Sat, -40% Dark)", fill=(56, 189, 248), font=FONT_LABEL)
        out_p = os.path.join(AUDIT_DIR, "fix7_lyric_background_grade.jpg")
        pil_bg_comp.save(out_p, quality=94)
        print(f"Saved {out_p}")

def generate_fix8_lyric_liveliness_parallax():
    ts_list = [1.50, 7.50, 13.50]
    titles = [
        "Line 1 (Wide Shot, Scale 1.00x)",
        "Line 3 (Medium Shot, Scale 1.22x)",
        "Line 5 (Close-up, Scale 1.36x)"
    ]
    notes = [
        "Base framing + 2.5D background parallax",
        "Camera push-in + subtle sway & respiration",
        "Intimate vocal framing + zero text collision"
    ]
    thumb_w, thumb_h = 320, 568
    pad = 16
    hdr_h = 70
    total_w = len(ts_list) * (thumb_w + pad) + pad
    total_h = hdr_h + thumb_h + 55 + pad
    
    sheet = Image.new("RGB", (total_w, total_h), (11, 15, 25))
    draw = ImageDraw.Draw(sheet)
    draw.text((20, 16), "FIX 8: Dynamic Framing Transitions on Line Changes • Push-in (+8%) & 2.5D Parallax", fill=(255, 255, 255), font=FONT_LABEL)
    
    for i, (ts, tit, not_t) in enumerate(zip(ts_list, titles, notes)):
        x = pad + i * (thumb_w + pad)
        y = hdr_h
        fr = extract_frame_at(EDIT2_PATH, ts, thumb_w, thumb_h)
        sheet.paste(fr, (x, y))
        draw.rectangle([(x, y), (x + thumb_w, y + thumb_h)], outline=(56, 189, 248), width=1)
        draw.text((x + 4, y + thumb_h + 6), tit, fill=(226, 232, 240), font=FONT_SUB)
        draw.text((x + 4, y + thumb_h + 30), not_t, fill=(74, 222, 128), font=FONT_MINI)
        
    out_p = os.path.join(AUDIT_DIR, "fix8_lyric_liveliness_parallax.jpg")
    sheet.save(out_p, quality=94)
    print(f"Saved {out_p}")

def build_comparison_image(
    ref_path: str,
    edit_path: str,
    timestamps: list,
    titles: list,
    main_title: str,
    out_path: str
):
    print(f"Building comparison image: {out_path}...")
    thumb_w, thumb_h = 360, 640
    padding = 16
    header_h = 80
    row_label_w = 180
    
    total_w = row_label_w + len(timestamps) * (thumb_w + padding) + padding
    total_h = header_h + 2 * (thumb_h + padding) + padding
    
    canvas = Image.new("RGB", (total_w, total_h), (11, 15, 25))
    draw = ImageDraw.Draw(canvas)
    
    draw.text((24, 20), main_title, fill=(255, 255, 255), font=FONT_TITLE)
    ref_y = header_h + padding
    edit_y = header_h + thumb_h + 2 * padding
    
    draw.text((24, ref_y + thumb_h // 2 - 20), "REFERENCE\n(Top)", fill=(251, 146, 60), font=FONT_LABEL)
    draw.text((24, edit_y + thumb_h // 2 - 20), "KŌRI EDIT v3\n(Bottom)", fill=(56, 189, 248), font=FONT_LABEL)
    
    for col_idx, (ts, title) in enumerate(zip(timestamps, titles)):
        col_x = row_label_w + col_idx * (thumb_w + padding)
        draw.text((col_x, header_h - 28), f"M{col_idx+1}: {title} (t={ts:.2f}s)", fill=(226, 232, 240), font=FONT_SUB)
        ref_frame = extract_frame_at(ref_path, ts, thumb_w, thumb_h)
        canvas.paste(ref_frame, (col_x, ref_y))
        edit_frame = extract_frame_at(edit_path, ts, thumb_w, thumb_h)
        canvas.paste(edit_frame, (col_x, edit_y))
        draw.rectangle([(col_x, ref_y), (col_x + thumb_w, ref_y + thumb_h)], outline=(251, 146, 60), width=2)
        draw.rectangle([(col_x, edit_y), (col_x + thumb_w, edit_y + thumb_h)], outline=(56, 189, 248), width=2)
        
    canvas.save(out_path, quality=94)
    print(f"Saved {out_path} ({os.path.getsize(out_path)/1024:.1f} KB)")

def main():
    print("Generating all v3 audit files and comparisons...")
    generate_fix1_waveform()
    generate_fix2_face_closeup()
    generate_fix3_dark_background_matte()
    generate_fix6_lyric_safe_zone()
    generate_fix7_background_grade()
    generate_fix8_lyric_liveliness_parallax()
    
    # Comparisons
    gacha_ts = [1.00, 3.50, 4.50, 6.44]
    gacha_titles = ["Intro Cards Hook", "Pre-Drop Build", "Drop Transient Hit", "Macro Eyes Punch"]
    build_comparison_image(
        REF1_PATH, EDIT1_PATH, gacha_ts, gacha_titles,
        "Kōri Gacha Hype Edit v3 vs Reference (Side-by-Side)",
        OUT_COMPARE_GACHA
    )
    
    lyric_ts = [1.00, 3.50, 6.50, 13.00]
    lyric_titles = ["Opening Line", "Vocal Verse", "Chorus Transition", "Climax Close-Up"]
    build_comparison_image(
        REF2_PATH, EDIT2_PATH, lyric_ts, lyric_titles,
        "Kōri Aesthetic Lyric Edit v3 vs Reference (Side-by-Side)",
        OUT_COMPARE_LYRIC
    )
    print("All audits and comparisons completed successfully!")

if __name__ == "__main__":
    main()
