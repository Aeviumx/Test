import cv2
import numpy as np
import os

ROOT = r"D:\motionforge"
ART_PATH = os.path.join(ROOT, "test-assets", "real", "art", "lyric_selena_capriccio.png")
AUDIT_DIR = os.path.join(ROOT, "test-assets", "results", "audit")

img = cv2.imread(ART_PATH, cv2.IMREAD_UNCHANGED)
h, w, c = img.shape

# Let's inspect the alpha channel
alpha = img[:, :, 3].copy()

# Scale Selena:
scale = 1920.0 / h * 0.95 # ~0.540
scaled_w = int(w * scale) # 1125
scaled_h = int(h * scale) # 1823

# Face center is at (1062, 401)
# Center of character body is placed at x = 300 (approx 28-30% of comp width 1080)
char_pos_x = int(300 - 1062 * scale) # -273
char_pos_y = 60

# We want ZERO alpha where x_comp >= 530 (leaving a wide 30px buffer before text box at x=560)
# Cutoff in scaled coords: max_x_scaled = 530 - char_pos_x = 530 - (-273) = 803
# In source coords: cutoff_src = int(803 / scale) = 1485
# Apply soft fade on the outer ribbon between 1360 and 1450, and 0 for x >= 1450:
fade_x1, fade_x2 = 1350, 1440
for col in range(fade_x1, min(w, fade_x2)):
    factor = 1.0 - (col - fade_x1) / (fade_x2 - fade_x1)
    alpha[:, col] = (alpha[:, col].astype(np.float32) * factor).astype(np.uint8)
if fade_x2 < w:
    alpha[:, fade_x2:] = 0

img[:, :, 3] = alpha

# Now scale and place on 1080x1920 canvas
scaled_rgba = cv2.resize(img, (scaled_w, scaled_h), interpolation=cv2.INTER_LANCZOS4)
canvas_alpha = np.zeros((1920, 1080), dtype=np.uint8)

# Place at char_pos_x, char_pos_y
x1_c = max(0, char_pos_x)
y1_c = max(0, char_pos_y)
x2_c = min(1080, char_pos_x + scaled_w)
y2_c = min(1920, char_pos_y + scaled_h)

src_x1 = max(0, -char_pos_x)
src_y1 = max(0, -char_pos_y)
src_x2 = src_x1 + (x2_c - x1_c)
src_y2 = src_y1 + (y2_c - y1_c)

canvas_alpha[y1_c:y2_c, x1_c:x2_c] = scaled_rgba[src_y1:src_y2, src_x1:src_x2, 3]

# Text box:
# Starts at x = 560 to 1020 (width 460px), y = 740 to 1320
tb_x1, tb_y1 = 560, 740
tb_x2, tb_y2 = 1020, 1320

text_zone_alpha = canvas_alpha[tb_y1:tb_y2, tb_x1:tb_x2]
overlap_count = np.sum(text_zone_alpha > 15)
max_alpha = np.max(text_zone_alpha)

print(f"Overlap Audit: overlapping pixels with alpha > 15 = {overlap_count}, max alpha = {max_alpha}")
assert overlap_count == 0, f"FAILED: {overlap_count} overlapping pixels detected!"

# Save visual debug frame showing mask and text box!
debug_vis = np.zeros((1920, 1080, 3), dtype=np.uint8)
# Character in white/cyan
debug_vis[canvas_alpha > 0] = [80, 80, 80]
debug_vis[canvas_alpha > 100] = [180, 210, 240]

# Overlay character mask in semi-transparent red (BGR: [0, 0, 255])
red_mask = np.zeros_like(debug_vis)
red_mask[canvas_alpha > 15] = [0, 0, 220]
debug_vis = cv2.addWeighted(debug_vis, 0.7, red_mask, 0.3, 0)

# Draw text bounding box in bright green (BGR: [0, 255, 0])
cv2.rectangle(debug_vis, (tb_x1, tb_y1), (tb_x2, tb_y2), (0, 255, 0), 4)
cv2.putText(debug_vis, "TEXT SAFE ZONE (0 OVERLAP)", (tb_x1 + 10, tb_y1 + 45), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0, 255, 0), 2)
cv2.putText(debug_vis, f"CHARACTER CORE (cx = 324px / 30%)", (60, 320), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0, 255, 255), 2)
cv2.circle(debug_vis, (324, int(char_pos_y + 401 * scale)), 14, (0, 255, 255), -1)

out_vis_path = os.path.join(AUDIT_DIR, "fix5_lyric_mask_collision_check.jpg")
cv2.imwrite(out_vis_path, debug_vis)
print(f"Saved debug frame to {out_vis_path}!")
