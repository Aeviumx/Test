from PIL import Image, ImageDraw
import os

assets_dir = 'test-assets'
os.makedirs(assets_dir, exist_ok=True)

# 1. Hardsub Sample (Subtitles in bottom 15%)
img = Image.new('RGB', (360, 360), (11, 15, 23))
draw = ImageDraw.Draw(img)
text = "Anime FanSub [Episode 01 - The Awakening]"
for dx, dy in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
    draw.text((30 + dx, 315 + dy), text, fill=(0, 0, 0))
draw.text((30, 315), text, fill=(255, 255, 255))
img.save(os.path.join(assets_dir, 'hardsub_sample.png'))
print('[OK] Saved hardsub_sample.png')

# 2. Letterbox Sample (60px black bar top, 60px black bar bottom)
img_lb = Image.new('RGB', (360, 360), (56, 189, 248))
draw_lb = ImageDraw.Draw(img_lb)
draw_lb.rectangle([(0, 0), (360, 60)], fill=(0, 0, 0))
draw_lb.rectangle([(0, 300), (360, 360)], fill=(0, 0, 0))
img_lb.save(os.path.join(assets_dir, 'letterbox_sample.png'))
print('[OK] Saved letterbox_sample.png')

# 3. Clean Sample
img_clean = Image.new('RGB', (360, 360), (30, 41, 59))
draw_clean = ImageDraw.Draw(img_clean)
draw_clean.ellipse([(100, 100), (260, 260)], fill=(225, 29, 72))
img_clean.save(os.path.join(assets_dir, 'clean_sample.png'))
print('[OK] Saved clean_sample.png')
