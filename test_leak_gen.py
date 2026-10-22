import math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

def make_light_leak(w=1080, h=1080, progress=0.5):
    """Generates an organic warm anamorphic light leak streak."""
    leak = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(leak)
    # Angle diagonal streak
    cx = int(w * (0.2 + 0.6 * progress))
    cy = int(h * (0.1 + 0.8 * progress))
    rx = 500
    ry = 220
    draw.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=(255, 200, 140, 160))
    draw.ellipse([cx - rx//2, cy - ry//2, cx + rx//2, cy + ry//2], fill=(255, 240, 200, 220))
    blurred = leak.filter(ImageFilter.GaussianBlur(radius=65))
    return blurred

test_leak = make_light_leak(1080, 1080, 0.4)
test_leak.save("C:/Users/mi7ki/.gemini/antigravity/brain/dcf0ddcd-0da4-4c20-ad76-55a82e55d8ae/test_leak.png")
print("Saved test_leak.png")
