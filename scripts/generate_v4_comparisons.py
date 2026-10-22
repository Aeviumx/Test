import os
import subprocess
import numpy as np
from PIL import Image, ImageDraw, ImageFont

rootDir = r"D:\motionforge"
resultsDir = os.path.join(rootDir, "test-assets", "results")

ref1 = os.path.join(rootDir, "test-assets", "real", "refs", "ref_01_gacha_hype.mp4")
v4_gacha = os.path.join(resultsDir, "output_gacha_hype_v4.mp4")

ref2 = os.path.join(rootDir, "test-assets", "real", "refs", "ref_02_aesthetic_lyric.mp4")
v4_lyric = os.path.join(resultsDir, "output_aesthetic_lyric_v4.mp4")

def extract_frame(video, sec):
    tmp = os.path.join(resultsDir, f"temp_{os.path.basename(video)}_{sec}.jpg")
    cmd = [
        "ffmpeg", "-y",
        "-ss", str(sec),
        "-i", video,
        "-vframes", "1",
        "-q:v", "2",
        tmp
    ]
    subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
    img = Image.open(tmp).convert("RGB")
    try: os.unlink(tmp)
    except: pass
    return img

font = ImageFont.load_default()

# 1. GACHA HYPE COMPARISON
# Moments:
# 1. Intro Cards (1.80s)
# 2. Drop Downbeat (4.00s)
# 3. Macro Eyes Punch (5.50s) - ACCURATE TIMESTAMP & LABEL!
# 4. Vera Red-Hair Close-Up (6.50s)
# 5. Climax Group Art (13.50s)
gacha_moments = [
    (1.80, "Intro Cards Fan (1.80s)"),
    (4.00, "Drop Downbeat Punch (4.00s)"),
    (5.50, "Macro Eyes Punch (5.50s)"),
    (6.50, "Vera Red-Hair Close-Up (6.50s)"),
    (10.50, "Climax Group Splash (10.50s)")
]

cell_w = 360
cell_h = 640
cols = len(gacha_moments)
header_h = 70
label_h = 50

sheet1 = Image.new("RGB", (cols * cell_w, 2 * cell_h + header_h + 2 * label_h), "#0a0a14")
draw1 = ImageDraw.Draw(sheet1)

draw1.text((20, 20), "GACHA HYPE EDIT COMPARISON // TOP: REFERENCE (REF 1) | BOTTOM: KŌRI CLI V4", fill="#ffffff", font=font)

for i, (sec, title) in enumerate(gacha_moments):
    ref_f = extract_frame(ref1, sec).resize((cell_w, cell_h), Image.Resampling.LANCZOS)
    v4_f = extract_frame(v4_gacha, sec).resize((cell_w, cell_h), Image.Resampling.LANCZOS)

    x = i * cell_w
    # Title
    draw1.text((x + 10, header_h - 25), title, fill="#38bdf8", font=font)

    # Ref row
    sheet1.paste(ref_f, (x, header_h))
    draw1.text((x + 10, header_h + cell_h + 5), f"REF 1 @ {sec:.2f}s", fill="#94a3b8", font=font)

    # V4 row
    y2 = header_h + cell_h + label_h
    sheet1.paste(v4_f, (x, y2))
    draw1.text((x + 10, y2 + cell_h + 5), f"KŌRI V4 @ {sec:.2f}s", fill="#10b981", font=font)

out1_path = os.path.join(resultsDir, "comparison_gacha_hype_ref_vs_v4.jpg")
sheet1.save(out1_path, quality=95)
print(f"Saved: {out1_path}")


# 2. AESTHETIC LYRIC COMPARISON
lyric_moments = [
    (1.00, "Moody Rainy City Intro (1.00s)"),
    (4.50, "Face-Locked Push-in & Intact Silhouette (4.50s)"),
    (8.50, "Side-Block Word Glow & Safe Zone (8.50s)"),
    (13.50, "Climax Lyrics & Dynamic Signature (13.50s)")
]

cols2 = len(lyric_moments)
sheet2 = Image.new("RGB", (cols2 * cell_w, 2 * cell_h + header_h + 2 * label_h), "#0a0a14")
draw2 = ImageDraw.Draw(sheet2)

draw2.text((20, 20), "AESTHETIC LYRIC EDIT COMPARISON // TOP: REFERENCE (REF 2) | BOTTOM: KŌRI CLI V4", fill="#ffffff", font=font)

for i, (sec, title) in enumerate(lyric_moments):
    ref_f = extract_frame(ref2, sec).resize((cell_w, cell_h), Image.Resampling.LANCZOS)
    v4_f = extract_frame(v4_lyric, sec).resize((cell_w, cell_h), Image.Resampling.LANCZOS)

    x = i * cell_w
    draw2.text((x + 10, header_h - 25), title, fill="#38bdf8", font=font)

    # Ref row
    sheet2.paste(ref_f, (x, header_h))
    draw2.text((x + 10, header_h + cell_h + 5), f"REF 2 @ {sec:.2f}s", fill="#94a3b8", font=font)

    # V4 row
    y2 = header_h + cell_h + label_h
    sheet2.paste(v4_f, (x, y2))
    draw2.text((x + 10, y2 + cell_h + 5), f"KŌRI V4 @ {sec:.2f}s", fill="#10b981", font=font)

out2_path = os.path.join(resultsDir, "comparison_aesthetic_lyric_ref_vs_v4.jpg")
sheet2.save(out2_path, quality=95)
print(f"Saved: {out2_path}")

# 3. CONTACT SHEETS FOR V4
def make_contact_sheet(video, out_name, num_frames=12):
    total_dur = 14.80
    times = [i * (total_dur / (num_frames - 1)) for i in range(num_frames)]
    grid_cols = 4
    grid_rows = 3
    cw = 270
    ch = 480
    c_sheet = Image.new("RGB", (grid_cols * cw, grid_rows * ch + 40), "#0a0a14")
    c_draw = ImageDraw.Draw(c_sheet)
    c_draw.text((20, 12), f"KŌRI V4 CONTACT SHEET // {os.path.basename(video)}", fill="#38bdf8", font=font)

    for idx, t in enumerate(times):
        r = idx // grid_cols
        c = idx % grid_cols
        f = extract_frame(video, t).resize((cw, ch), Image.Resampling.LANCZOS)
        x = c * cw
        y = 40 + r * ch
        c_sheet.paste(f, (x, y))
        c_draw.text((x + 8, y + 8), f"{t:.2f}s", fill="#ffffff", font=font)

    sheet_out = os.path.join(resultsDir, out_name)
    c_sheet.save(sheet_out, quality=95)
    print(f"Saved Contact Sheet: {sheet_out}")

make_contact_sheet(v4_gacha, "output_gacha_hype_v4_contact_sheet.jpg")
make_contact_sheet(v4_lyric, "output_aesthetic_lyric_v4_contact_sheet.jpg")

print("All comparisons and contact sheets generated successfully!")
