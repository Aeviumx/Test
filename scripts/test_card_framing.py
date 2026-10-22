import os
import cv2
import numpy as np
from PIL import Image, ImageDraw

ROOT = r"D:\motionforge"
ART_DIR = os.path.join(ROOT, "test-assets", "real", "art")
AUDIT_DIR = os.path.join(ROOT, "test-assets", "results", "audit")

# Face coordinates from audit:
# Vera: Face Center [1036, 716], Box [928, 604, 1145, 828], h_face = 224
# Lucia: Face Center [819, 473], Box [752, 397, 886, 549], h_face = 152
# Liv: Face Center [1002, 845], Box [896, 721, 1108, 969], h_face = 248

def make_framed_card(img_rgba, face_center, face_h, card_size=(760, 1420), radius=36):
    cw, ch = card_size
    cx, cy = face_center
    
    # Crop upper body: from head top to mid-torso
    # Character upper body height in crop = 3.2 * face_h
    crop_h = int(face_h * 3.4)
    crop_w = int(crop_h * (cw / ch))
    
    y1 = max(0, int(cy - face_h * 0.75))
    y2 = y1 + crop_h
    x1 = max(0, int(cx - crop_w // 2))
    x2 = x1 + crop_w
    
    # Adjust if out of bounds
    if x2 > img_rgba.shape[1]:
        x2 = img_rgba.shape[1]
        x1 = max(0, x2 - crop_w)
        
    crop_rgba = img_rgba[y1:y2, x1:x2]
    resized = cv2.resize(crop_rgba, (cw, ch), interpolation=cv2.INTER_LANCZOS4)
    
    # Check character height ratio inside card:
    # Alpha mask bounding box
    alpha = resized[:, :, 3]
    y_indices = np.where(alpha > 30)[0]
    char_h_in_card = len(y_indices) if len(y_indices) > 0 else ch
    fill_ratio = (y_indices[-1] - y_indices[0]) / ch if len(y_indices) > 0 else 1.0
    print(f"Card framing fill ratio: {fill_ratio*100:.1f}% (Required >= 80%)")
    
    # PIL rounded card with white rim stroke and subtle drop contour
    pil_card = Image.fromarray(resized)
    mask = Image.new("L", (cw, ch), 0)
    draw_m = ImageDraw.Draw(mask)
    draw_m.rounded_rectangle([(0, 0), (cw, ch)], radius=radius, fill=255)
    pil_card.putalpha(mask)
    
    border = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
    draw_b = ImageDraw.Draw(border)
    draw_b.rounded_rectangle([(0, 0), (cw, ch)], radius=radius, outline=(255, 255, 255, 240), width=6)
    
    return Image.alpha_composite(pil_card, border)

# Load
im_vera = cv2.imread(os.path.join(ART_DIR, "gacha_vera.png"), cv2.IMREAD_UNCHANGED)
im_lucia = cv2.imread(os.path.join(ART_DIR, "gacha_lucia.png"), cv2.IMREAD_UNCHANGED)
im_liv = cv2.imread(os.path.join(ART_DIR, "gacha_liv.png"), cv2.IMREAD_UNCHANGED)

card_vera = make_framed_card(im_vera, [1036, 716], 224)
card_lucia = make_framed_card(im_lucia, [819, 473], 152)
card_liv = make_framed_card(im_liv, [1002, 845], 248)

# Combine onto an audit image
preview = Image.new("RGB", (760 * 3 + 64, 1420 + 80), (14, 18, 28))
preview.paste(card_liv, (16, 40))
preview.paste(card_vera, (16 + 760 + 16, 40))
preview.paste(card_lucia, (16 + (760 + 16) * 2, 40))

out_path = os.path.join(AUDIT_DIR, "fix4_intro_card_framing.jpg")
preview.save(out_path, quality=92)
print(f"Saved {out_path}")
