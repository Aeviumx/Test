import os
import re
import urllib.request
import json
import subprocess

headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}

dest_dir = r"D:\motionforge\test-assets\real\backgrounds"
os.makedirs(dest_dir, exist_ok=True)

pages = [
    ("bg_vertical_bokeh_city_99844.mp4", "https://mixkit.co/free-stock-video/vertical-shot-of-colorful-bokeh-city-lights-in-the-dark-99844/"),
    ("bg_vertical_vibrant_bokeh_99860.mp4", "https://mixkit.co/free-stock-video/vertical-shot-of-vibrant-colorful-bokeh-lights-in-the-night-99860/"),
    ("bg_vertical_dark_bokeh_99854.mp4", "https://mixkit.co/free-stock-video/vertical-shot-with-colorful-bokeh-lights-in-darkness-99854/"),
    ("bg_raindrops_glass_city_99834.mp4", "https://mixkit.co/free-stock-video/raindrops-on-glass-with-blurred-city-lights-in-the-background-99834/"),
    ("bg_times_square_rainy_night_4332.mp4", "https://mixkit.co/free-stock-video/times-square-during-a-rainy-night-4332/")
]

def get_best_mp4_url(page_url):
    req = urllib.request.Request(page_url, headers=headers)
    with urllib.request.urlopen(req, timeout=15) as resp:
        html = resp.read().decode('utf-8', errors='ignore')

    # Look for active_storage or cdn mp4s
    video_item_matches = re.findall(r'https://assets\.mixkit\.co/active_storage/video_items/(\d+)/(\d+)/\1-video-([a-zA-Z0-9_-]+)\.mp4', html)
    if video_item_matches:
        v_id, ts, _ = video_item_matches[0]
        for res in ['1080', 'original', '720', '360']:
            candidate = f"https://assets.mixkit.co/active_storage/video_items/{v_id}/{ts}/{v_id}-video-{res}.mp4"
            try:
                head_req = urllib.request.Request(candidate, headers=headers, method='HEAD')
                with urllib.request.urlopen(head_req, timeout=8) as hresp:
                    if hresp.status == 200:
                        size = int(hresp.headers.get('Content-Length', 0))
                        print(f"Found {candidate} ({size / 1024 / 1024:.2f} MB)")
                        return candidate
            except Exception:
                continue

    # Fallback to direct regex
    direct_mp4s = re.findall(r'https://[^\s"\'<>]+\.mp4', html)
    for cand in direct_mp4s:
        if 'video' in cand:
            return cand
    return None

results = []

for filename, page_url in pages:
    out_path = os.path.join(dest_dir, filename)
    print(f"\nProcessing {filename} from {page_url}...")
    mp4_url = get_best_mp4_url(page_url)
    if not mp4_url:
        print(f"Could not find MP4 for {page_url}")
        continue
    
    print(f"Downloading {mp4_url} -> {out_path}")
    req = urllib.request.Request(mp4_url, headers=headers)
    with urllib.request.urlopen(req, timeout=60) as resp, open(out_path, 'wb') as f:
        f.write(resp.read())
    
    # ffprobe details
    cmd = ['ffprobe', '-v', 'error', '-show_entries', 'stream=width,height,r_frame_rate,duration', '-show_entries', 'format=duration', '-of', 'json', out_path]
    probe = subprocess.run(cmd, capture_output=True, text=True)
    meta = json.loads(probe.stdout)
    video_stream = next((s for s in meta.get('streams', []) if 'width' in s), {})
    w = video_stream.get('width', 0)
    h = video_stream.get('height', 0)
    fps_raw = video_stream.get('r_frame_rate', '0/1')
    num, den = map(int, fps_raw.split('/')) if '/' in fps_raw else (0, 1)
    fps = num / den if den > 0 else 0
    duration = float(meta.get('format', {}).get('duration', video_stream.get('duration', 0)))
    
    file_size_mb = os.path.getsize(out_path) / 1024 / 1024
    results.append({
        'filename': filename,
        'path': out_path,
        'resolution': f"{w}x{h}",
        'fps': f"{fps:.2f}",
        'duration': f"{duration:.2f}s",
        'size_mb': f"{file_size_mb:.2f} MB",
        'source': page_url
    })
    print(f"Downloaded {filename}: {w}x{h}, {fps:.2f} fps, {duration:.2f}s, {file_size_mb:.2f} MB")

with open(os.path.join(dest_dir, 'BACKGROUNDS.json'), 'w', encoding='utf-8') as f:
    json.dump(results, f, indent=2)

print("\nAll downloads complete!")
