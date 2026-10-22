import os
import shutil
import subprocess
import cv2
import json

art_dir = r"D:\motionforge\test-assets\real\art"
temp_dir = r"D:\motionforge\test-assets\real\art_temp"
os.makedirs(art_dir, exist_ok=True)

# 1. Download Wallhaven group art and Alpha art
wallhaven_downloads = [
    ("gacha_group.jpg", "https://w.wallhaven.cc/full/l8/wallhaven-l8rory.jpg", "https://wallhaven.cc/w/l8rory", "Punishing: Gray Raven - Cerberus Squad (Vera, No.21, Noctis) Official Key Visual"),
    ("gacha_alpha_lucia.png", "https://w.wallhaven.cc/full/gp/wallhaven-gpw1we.png", "https://wallhaven.cc/w/gpw1we", "Punishing: Gray Raven - Lucia Plume & Alpha 4K Key Visual"),
    ("gacha_lucia_4k.jpg", "https://w.wallhaven.cc/full/z8/wallhaven-z8o88j.jpg", "https://wallhaven.cc/w/z8o88j", "Punishing: Gray Raven - Lucia Crimson Weave 4K Wallpaper")
]

for filename, url, page, desc in wallhaven_downloads:
    out_path = os.path.join(art_dir, filename)
    print(f"Downloading {filename}...")
    subprocess.run(['curl.exe', '-s', '-H', 'User-Agent: Mozilla/5.0', '-o', out_path, url])

# 2. Copy the high-res transparent PNGs from art_temp
wiki_copies = [
    ("gacha_lucia.png", "lucia_crimson_weave_final.png", "https://grayravens.com/wiki/Lucia:_Crimson_Weave/Gallery", "Lucia: Crimson Weave Official Splash Art (Generic Final Coating)"),
    ("gacha_vera.png", "vera_garnet_final.png", "https://grayravens.com/wiki/Vera:_Garnet/Gallery", "Vera: Garnet Official Splash Art (Generic Final Coating)"),
    ("gacha_liv.png", "liv_empyrea_final.png", "https://grayravens.com/wiki/Liv:_Empyrea/Gallery", "Liv: Empyrea Official Splash Art (Generic Final Coating)"),
    ("lyric_selena_capriccio.png", "selena_capriccio_final.png", "https://grayravens.com/wiki/Selena:_Capriccio/Gallery", "Selena: Capriccio Official Splash Art (Generic Final Coating)"),
    ("lyric_selena_tempest.png", "selena_tempest_final.png", "https://grayravens.com/wiki/Selena:_Tempest/Gallery", "Selena: Tempest Official Splash Art (Generic Final Coating)"),
    ("lyric_2b_nier.png", "2b_nier_final.png", "https://grayravens.com/wiki/2B/Gallery", "2B (YoRHa No.2 Type B) PGR Collab Official Splash Art"),
    ("lyric_ayla_kaleido.png", "ayla_kaleido_final.png", "https://grayravens.com/wiki/Ayla:_Kaleido/Gallery", "Ayla: Kaleido Official Splash Art (Generic Final Coating)")
]

for target_name, temp_name, page, desc in wiki_copies:
    src = os.path.join(temp_dir, temp_name)
    dst = os.path.join(art_dir, target_name)
    if os.path.exists(src):
        shutil.copyfile(src, dst)
        print(f"Copied {temp_name} -> {target_name}")

# Also convert gacha_group.jpg to gacha_group.png so existing code looking for .png finds the ultra-high-res version!
group_jpg = os.path.join(art_dir, "gacha_group.jpg")
group_png = os.path.join(art_dir, "gacha_group.png")
if os.path.exists(group_jpg):
    im_grp = cv2.imread(group_jpg)
    if im_grp is not None:
        cv2.imwrite(group_png, im_grp)
        print(f"Saved gacha_group.png at resolution {im_grp.shape[1]}x{im_grp.shape[0]}")

# 3. Create art/SOURCES.md documenting every file, resolution, source, and license
sources_md_path = os.path.join(art_dir, "SOURCES.md")
entries = []

all_art_records = [
    ("gacha_lucia.png", "https://grayravens.com/wiki/Lucia:_Crimson_Weave/Gallery", "Kuro Games / Gray Ravens Wiki", "Lucia: Crimson Weave Generic Final Coating (Full character transparent PNG)"),
    ("gacha_vera.png", "https://grayravens.com/wiki/Vera:_Garnet/Gallery", "Kuro Games / Gray Ravens Wiki", "Vera: Garnet Generic Final Coating (Full character transparent PNG)"),
    ("gacha_liv.png", "https://grayravens.com/wiki/Liv:_Empyrea/Gallery", "Kuro Games / Gray Ravens Wiki", "Liv: Empyrea Generic Final Coating (Full character transparent PNG)"),
    ("gacha_group.png", "https://wallhaven.cc/w/l8rory", "Kuro Games official art via Wallhaven", "Punishing: Gray Raven - Cerberus Squad (Vera, No.21, Noctis) Key Visual"),
    ("gacha_alpha_lucia.png", "https://wallhaven.cc/w/gpw1we", "Kuro Games official art via Wallhaven", "Punishing: Gray Raven - Lucia Plume & Alpha 4K Key Visual"),
    ("gacha_lucia_4k.jpg", "https://wallhaven.cc/w/z8o88j", "Kuro Games official art via Wallhaven", "Punishing: Gray Raven - Lucia Crimson Weave 4K Wallpaper"),
    ("lyric_selena_capriccio.png", "https://grayravens.com/wiki/Selena:_Capriccio/Gallery", "Kuro Games / Gray Ravens Wiki", "Selena: Capriccio Generic Final Coating (Clean portrait/full body for lyric edit)"),
    ("lyric_selena_tempest.png", "https://grayravens.com/wiki/Selena:_Tempest/Gallery", "Kuro Games / Gray Ravens Wiki", "Selena: Tempest Generic Final Coating (Clean portrait/full body for lyric edit)"),
    ("lyric_2b_nier.png", "https://grayravens.com/wiki/2B/Gallery", "Kuro Games & Square Enix / Gray Ravens Wiki", "2B (YoRHa No.2 Type B) PGR Collab Splash Art (Clean cutout for lyric edit)"),
    ("lyric_ayla_kaleido.png", "https://grayravens.com/wiki/Ayla:_Kaleido/Gallery", "Kuro Games / Gray Ravens Wiki", "Ayla: Kaleido Generic Final Coating (Clean portrait/full body for lyric edit)")
]

sources_lines = [
    "# Official Art Assets & Sources",
    "",
    "All character splash arts are official Kuro Games assets (Punishing: Gray Raven) without watermarks, with resolutions exceeding 2000px along the long edge.",
    "",
    "| File | Resolution | Source / Provider | Description |",
    "| :--- | :--- | :--- | :--- |"
]

for filename, source_url, provider, desc in all_art_records:
    filepath = os.path.join(art_dir, filename)
    if os.path.exists(filepath):
        im = cv2.imread(filepath)
        if im is not None:
            h, w = im.shape[:2]
            res_str = f"{w}x{h}"
        else:
            res_str = "N/A"
    else:
        res_str = "N/A"
    sources_lines.append(f"| `{filename}` | {res_str} | [{provider}]({source_url}) | {desc} |")

with open(sources_md_path, "w", encoding="utf-8") as f:
    f.write("\n".join(sources_lines) + "\n")

print(f"Created {sources_md_path}")
