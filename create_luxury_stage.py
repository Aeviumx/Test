import math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

# Canvas: 2560 x 1080
W, H = 2560, 1080

# 1. Background: Sleek, high-fashion minimalist studio (warm light grey gradient)
bg = Image.new("RGB", (W, H), (245, 244, 242))
draw = ImageDraw.Draw(bg)

# Studio back-wall & polished floor gradient
for y in range(H):
    # Wall (y: 0 .. 700), Floor (y: 700 .. 1080)
    if y < 700:
        # Subtle top-down studio softbox lighting
        factor = 1.0 - 0.08 * (y / 700.0)
        r = int(248 * factor)
        g = int(246 * factor)
        b = int(244 * factor)
    else:
        # Polished floor gradient with slight reflection shading
        fy = (y - 700) / 380.0
        r = int(228 - fy * 18)
        g = int(226 - fy * 18)
        b = int(224 - fy * 16)
    draw.line([(0, y), (W, y)], fill=(r, g, b))

# Studio horizon line (soft subtle crease)
draw.line([(0, 700), (W, 700)], fill=(215, 212, 208), width=2)

# Load character cards
c1 = Image.open("D:/motionforge/public/assets/genshin_chars/card1_hutao.png").convert("RGBA")
c2 = Image.open("D:/motionforge/public/assets/genshin_chars/card2_miku.png").convert("RGBA")
c3 = Image.open("D:/motionforge/public/assets/genshin_chars/card3_furina.png").convert("RGBA")

# Card size: 700 x 700 (prominent, elegant, luxury framing)
CARD_SIZE = 700
c1_res = c1.resize((CARD_SIZE, CARD_SIZE), Image.Resampling.LANCZOS)
c2_res = c2.resize((CARD_SIZE, CARD_SIZE), Image.Resampling.LANCZOS)
c3_res = c3.resize((CARD_SIZE, CARD_SIZE), Image.Resampling.LANCZOS)

# Positions: Hu Tao (center x=480), Miku (x=1280), Furina (x=2080)
positions = [
    (130, 100, c1_res, (226, 114, 127), "01 // HU TAO", "CRIMSON PHONK"),
    (930, 100, c2_res, (56, 189, 248), "02 // HATSUNE MIKU", "CYAN DIGITAL"),
    (1730, 100, c3_res, (96, 165, 250), "03 // FURINA", "HYDRO SYMPHONY"),
]

for x, y, card, glow_color, title, subtitle in positions:
    # 1. Soft Floor Contact Shadow
    shadow = Image.new("RGBA", (CARD_SIZE + 100, 160), (0, 0, 0, 0))
    sh_draw = ImageDraw.Draw(shadow)
    sh_draw.ellipse([30, 20, CARD_SIZE + 70, 130], fill=(20, 18, 25, 95))
    shadow_blurred = shadow.filter(ImageFilter.GaussianBlur(radius=24))
    bg.paste(shadow_blurred, (x - 50, y + CARD_SIZE - 40), shadow_blurred)

    # 2. Ambient Wall Glow behind card
    wall_glow = Image.new("RGBA", (CARD_SIZE + 120, CARD_SIZE + 120), (0, 0, 0, 0))
    wg_draw = ImageDraw.Draw(wall_glow)
    wg_draw.rectangle([40, 40, CARD_SIZE + 80, CARD_SIZE + 80], fill=(*glow_color, 75))
    wall_glow_blurred = wall_glow.filter(ImageFilter.GaussianBlur(radius=32))
    bg.paste(wall_glow_blurred, (x - 60, y - 60), wall_glow_blurred)

    # 3. Card Shadow
    card_sh = Image.new("RGBA", (CARD_SIZE + 40, CARD_SIZE + 40), (0, 0, 0, 0))
    csh_draw = ImageDraw.Draw(card_sh)
    csh_draw.rectangle([15, 15, CARD_SIZE + 25, CARD_SIZE + 25], fill=(15, 15, 20, 120))
    csh_blurred = card_sh.filter(ImageFilter.GaussianBlur(radius=16))
    bg.paste(csh_blurred, (x - 20, y - 10), csh_blurred)

    # 4. Glass Frame Border
    frame = Image.new("RGBA", (CARD_SIZE + 16, CARD_SIZE + 16), (255, 255, 255, 240))
    f_draw = ImageDraw.Draw(frame)
    f_draw.rectangle([0, 0, CARD_SIZE + 15, CARD_SIZE + 15], outline=(*glow_color, 255), width=3)
    bg.paste(frame, (x - 8, y - 8), frame)

    # 5. Paste Card
    bg.paste(card, (x, y), card)

    # 6. Polished Floor Reflection
    refl = card.transpose(Image.Transpose.FLIP_TOP_BOTTOM).crop((0, 0, CARD_SIZE, 240))
    refl_mask = Image.new("L", (CARD_SIZE, 240), 0)
    rm_draw = ImageDraw.Draw(refl_mask)
    for ry in range(240):
        alpha = int(75 * (1.0 - ry / 240.0) ** 1.8)
        rm_draw.line([(0, ry), (CARD_SIZE, ry)], fill=alpha)
    refl_blurred = refl.filter(ImageFilter.GaussianBlur(radius=4))
    bg.paste(refl_blurred, (x, y + CARD_SIZE + 4), refl_mask)

    # 7. Sleek Showroom Typography
    draw.text((x + 10, y + CARD_SIZE + 28), title, fill=(35, 30, 42))
    draw.text((x + 10, y + CARD_SIZE + 50), subtitle, fill=(120, 115, 130))

# Studio Header Watermark
draw.text((80, 50), "// KŌRI STUDIO // VIRAL VELOCITY EDIT SERIES", fill=(140, 135, 150))
draw.text((2200, 50), "1080x1080 @ 60 FPS", fill=(140, 135, 150))

out_path = "D:/motionforge/public/assets/miku_stage.png"
bg.save(out_path, quality=95)
print(f"Luxury showroom stage saved to {out_path}!")

# Save preview
bg.resize((1280, 540)).save("C:/Users/mi7ki/.gemini/antigravity/brain/dcf0ddcd-0da4-4c20-ad76-55a82e55d8ae/luxury_stage_preview.jpg")
